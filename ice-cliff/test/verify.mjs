// 浏览器端验证：seed 确定性、剖切深度稳定性、正午→黄昏录制。
// 用法：node verify.mjs [输出目录]（需已安装 playwright）
import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const outDir = resolve(process.argv[2] || "../../artifacts");
mkdirSync(outDir, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript" };
const server = http.createServer(async (req, res) => {
	try {
		const pathname = decodeURIComponent(req.url.split("?")[0]);
		const p = join(root, pathname === "/" ? "index.html" : pathname);
		const data = await readFile(p);
		res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
		res.end(data);
	} catch {
		res.writeHead(404);
		res.end("nf");
	}
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
	args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const results = [];
function report(name, ok, detail = "") {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function newPage() {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	page.errors = [];
	page.on("pageerror", (e) => page.errors.push(String(e)));
	page.on("console", (m) => m.type() === "error" && page.errors.push(m.text()));
	return page;
}

async function shot(page, name) {
	const buf = await page.locator("#view").screenshot();
	writeFileSync(join(outDir, name), buf);
	return buf;
}

async function settle(page, ms = 700) {
	await page.waitForTimeout(ms);
}

async function hideHud(page) {
	await page.addStyleTag({ content: ".panel{display:none!important}" });
}

// ---------- 1. seed 确定性 ----------
{
	const p1 = await newPage();
	await p1.goto(`${base}/?seed=ice-42`);
	await p1.waitForFunction(() => window.__ice?.ready);
	await p1.evaluate(() => { __ice.freezeTime(true); __ice.setCamera(35, 16, 15); });
	await hideHud(p1);
	await settle(p1);
	const a = await shot(p1, "ice-seed-42-a.png");

	const p2 = await newPage();
	await p2.goto(`${base}/?seed=ice-42`);
	await p2.waitForFunction(() => window.__ice?.ready);
	await p2.evaluate(() => { __ice.freezeTime(true); __ice.setCamera(35, 16, 15); });
	await hideHud(p2);
	await settle(p2);
	const b = await shot(p2, "ice-seed-42-b.png");
	report("同一 seed 两次加载画面逐字节一致", a.equals(b));

	await p2.evaluate(() => __ice.setSeed("ice-99"));
	await settle(p2);
	const c = await shot(p2, "ice-seed-99.png");
	report("不同 seed 画面不同", !a.equals(c));
	report("无页面错误", p1.errors.length === 0 && p2.errors.length === 0,
		p1.errors.concat(p2.errors).join("; ").slice(0, 200));
	await p1.close();
	await p2.close();
}

// ---------- 2. 剖切扫描 + 深度稳定性 ----------
{
	const page = await newPage();
	await page.goto(`${base}/?seed=ice-7`);
	await page.waitForFunction(() => window.__ice?.ready);
	await page.evaluate(() => { __ice.freezeTime(true); __ice.setCamera(30, 14, 13); __ice.setSun(40); });
	await hideHud(page);
	await settle(page);
	const cuts = [0, 0.2, 0.4, 0.6, 0.72, 0.85, 1.0];
	const frames = [];
	for (const c of cuts) {
		await page.evaluate((v) => __ice.setCut(v), c);
		await settle(page, 400);
		frames.push(await shot(page, `ice-cut-${String(Math.round(c * 100)).padStart(3, "0")}.png`));
	}
	// 相邻剖切量画面应不同（确实在切），且每帧非黑非白
	let allDistinct = true;
	for (let i = 1; i < frames.length; i++) {
		if (frames[i].equals(frames[i - 1])) allDistinct = false;
	}
	report("剖切推进时画面持续变化", allDistinct);

	// 深度错误/闪烁检查：同一剖切位置连续两帧，画面像素必须完全一致
	await page.evaluate(() => __ice.setCut(0.6));
	await settle(page, 400);
	const f1 = await page.locator("#view").screenshot();
	await page.waitForTimeout(250);
	const f2 = await page.locator("#view").screenshot();
	report("剖切静止时无深度闪烁（两帧一致）", f1.equals(f2));

	// 剖切后内部可见：非黑非白、有结构（标准差）、有气泡亮点
	const stats = await page.evaluate(() => {
		const px = window.__ice.sample(64);
		let glint = 0;
		let sum = 0;
		let sq = 0;
		const n = px.length / 4;
		for (let i = 0; i < px.length; i += 4) {
			const l = px[i] + px[i + 1] + px[i + 2];
			sum += l;
			sq += l * l;
			if (l > 420) glint++;
		}
		const mean = sum / n / 3;
		const std = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) / 3;
		return { glint, mean, std };
	});
	report("剖切后内部结构可见（亮度正常、有纹理、有气泡）",
		stats.mean > 15 && stats.mean < 200 && stats.std > 4 && stats.glint > 5,
		`mean=${stats.mean.toFixed(1)} std=${stats.std.toFixed(1)} glint=${stats.glint}`);
	report("无页面错误", page.errors.length === 0, page.errors.join("; ").slice(0, 200));
	await page.close();
}

// ---------- 3. 正午 -> 黄昏 录制 ----------
{
	const page = await newPage();
	await page.goto(`${base}/?seed=ice-7`);
	await page.waitForFunction(() => window.__ice?.ready);
	await page.evaluate(() => __ice.setCamera(35, 16, 15));
	const dl = page.waitForEvent("download", { timeout: 30000 });
	await page.evaluate(() => { __ice.setSun(55); __ice.startTimelapse(); });
	await page.waitForTimeout(1200);
	await shot(page, "ice-cliff-noon.png");
	await page.waitForTimeout(4500);
	await shot(page, "ice-cliff-video-mid.png");
	const download = await dl;
	await shot(page, "ice-cliff-dusk.png");
	const path = join(outDir, "ice-cliff-noon-to-dusk.webm");
	await download.saveAs(path);
	report("正午→黄昏 webm 已录制", statSync(path).size > 50000,
		`${(statSync(path).size / 1024).toFixed(0)} KiB`);
	report("无页面错误", page.errors.length === 0, page.errors.join("; ").slice(0, 200));
	await page.close();
}

// ---------- 4. 场景展示截图 ----------
{
	const page = await newPage();
	await page.goto(`${base}/?seed=ice-7`);
	await page.waitForFunction(() => window.__ice?.ready);
	await settle(page, 900);
	await shot(page, "ice-cliff-initial.png");
	await page.evaluate(() => __ice.setNight(true));
	await settle(page, 1500);
	await shot(page, "ice-cliff-night.png");
	await page.evaluate(() => { __ice.setNight(false); __ice.setCut(0.45); __ice.setFog(0.05); });
	await settle(page, 2500);
	await shot(page, "ice-cliff-cut-045.png");
	report("展示截图无页面错误", page.errors.length === 0, page.errors.join("; ").slice(0, 200));
	await page.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length ? 1 : 0);
