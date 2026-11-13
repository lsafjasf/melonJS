// 端到端测试：node test/e2e.mjs
// 启动本地静态服务器，用 Playwright 驱动页面验证装箱流程。
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "test", "shots");
mkdirSync(shots, { recursive: true });

const PORT = 8734;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
	cwd: root,
	stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 1200));

let failures = 0;
function check(name, cond, extra = "") {
	if (cond) {
		console.log(`  ✓ ${name}`);
	} else {
		failures++;
		console.error(`  ✗ ${name} ${extra}`);
	}
}

try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.goto(`http://127.0.0.1:${PORT}/index.html`);
	await page.waitForSelector("#boxRows tr");

	check("内置 12 个箱子", (await page.locator("#boxRows tr").count()) === 12);

	// 1. 贪心策略装箱
	await page.click("#packBtn");
	await page.waitForSelector("#status.ok");
	let statusText = await page.textContent("#status");
	check("贪心装箱完成", statusText.includes("装箱完成"), statusText);
	let res = await page.evaluate(() => {
		const r = window.__app.getResult();
		return {
			complete: r.complete,
			placed: r.placements.length,
			collisions: r.collisions,
			violations: r.violations.length,
			utilization: r.utilization,
			cog: r.cog,
		};
	});
	check("12 箱全部装入", res.placed === 12);
	check("无穿模（碰撞检测通过）", res.collisions.length === 0, res.collisions.join(";"));
	check("不可倒置违规为 0", res.violations === 0);
	check("利用率显示", (await page.textContent("#metrics")).includes("容积利用率"));
	check("重心显示", (await page.textContent("#metrics")).includes("重心位置"));
	await page.screenshot({ path: path.join(shots, "1-greedy.png") });

	// 2. 旋转视角 + 剖开侧壁
	await page.click("#rotR");
	await page.click("#rotR");
	await page.screenshot({ path: path.join(shots, "2-rotated.png") });
	await page.check("#cutaway");
	await page.screenshot({ path: path.join(shots, "3-cutaway.png") });
	await page.uncheck("#cutaway");
	check("视角旋转与剖开侧壁截图已生成", true);

	// 3. 按体积降序策略
	await page.check('input[name="strategy"][value="volume"]');
	await page.click("#packBtn");
	await page.waitForSelector("#status.ok");
	res = await page.evaluate(() => {
		const r = window.__app.getResult();
		return { complete: r.complete, collisions: r.collisions, placed: r.placements.length };
	});
	check("体积降序装箱完成且无穿模", res.complete && res.placed === 12 && res.collisions.length === 0);
	await page.screenshot({ path: path.join(shots, "4-volume.png") });

	// 4. 清单按层排列
	const manifest = await page.evaluate(() => window.__app.manifest());
	check("清单包含分层", /第 1 层/.test(manifest) && /底面高度/.test(manifest));
	check("清单标注完成状态", manifest.includes("状态：装箱完成"));
	check("导出按钮可用", await page.isEnabled("#exportBtn"));

	// 5. 超高箱子 → 失败提示
	await page.fill("#fName", "超高测试箱");
	await page.fill("#fW", "100");
	await page.fill("#fD", "100");
	await page.fill("#fH", "300");
	await page.fill("#fWeight", "50");
	await page.check("#fKeepUp");
	await page.click('#addBox button[type="submit"]');
	await page.click("#packBtn");
	await page.waitForSelector("#status.bad");
	statusText = await page.textContent("#status");
	check("超高箱子判定装箱未完成", statusText.includes("装箱未完成"), statusText);
	check("失败提示说明超高", statusText.includes("超过集装箱内高"), statusText);
	check("失败时禁止导出", !(await page.isEnabled("#exportBtn")));
	await page.screenshot({ path: path.join(shots, "5-overheight-fail.png") });

	await browser.close();
} finally {
	server.kill();
}

if (failures > 0) {
	console.error(`\n${failures} 项失败`);
	process.exit(1);
}
console.log("\n端到端测试全部通过 ✓");
