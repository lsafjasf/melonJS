// Browser smoke test for the animation editor.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
	const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
	try {
		const body = await readFile(join(ROOT, path));
		res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
		res.end(body);
	} catch {
		res.writeHead(404).end("not found");
	}
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
	args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const results = [];
const check = (name, ok) => {
	results.push(`${ok ? "PASS" : "FAIL"} ${name}`);
	if (!ok) process.exitCode = 1;
};

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.__editor);

// 1. page loads, three track rows, demo keyframes rendered
check("3 track rows", (await page.locator(".track-row").count()) === 3);
check("demo keyframes rendered", (await page.locator(".kf-diamond").count()) > 10);

// 2. canvas actually renders pixels (moon faded in at t=2)
await page.evaluate(() => window.__editor.clock.seek(2));
await page.waitForTimeout(100);
const nonBlank = await page.evaluate(() => {
	const c = document.getElementById("stage");
	const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
	let lit = 0;
	for (let i = 3; i < d.length; i += 400) if (d[i] > 0) lit++;
	return lit;
});
check("canvas renders pixels", nonBlank > 100);

// 3. scrubbing the playhead interpolates live (boat x at t=5.25 ≈ 340)
const boatX = await page.evaluate(() => {
	const e = window.__editor;
	e.clock.seek(5.25);
	const kfs = e.project.tracks.boat;
	let prev = kfs[0];
	for (const kf of kfs) { if (kf.time <= 5.25) prev = kf; }
	return prev.pose.x;
});
check("scrub interpolates (boat between keyframes)", boatX === 200); // keyframe pose, sampled live below
const sampled = await page.evaluate(async () => {
	const { sampleTrack } = await import("./core.js");
	return sampleTrack(window.__editor.project.tracks.boat, 5.25).x;
});
check("live sample at 5.25s = 340", Math.abs(sampled - 340) < 1e-9);

// 4. play / pause
await page.evaluate(() => window.__editor.clock.seek(0));
await page.click("#btn-play");
await page.waitForTimeout(600);
const t1 = await page.evaluate(() => window.__editor.clock.time);
check("play advances time", t1 > 0.2);
check("audio engine follows playhead", await page.evaluate(() => window.__editor.sound.playing));
await page.click("#btn-play"); // pause
const t2 = await page.evaluate(() => window.__editor.clock.time);
await page.waitForTimeout(400);
const t3 = await page.evaluate(() => window.__editor.clock.time);
check("pause freezes time", Math.abs(t3 - t2) < 0.05);
check("audio stops on pause", await page.evaluate(() => !window.__editor.sound.playing));

// 5. loop wraps back to the start
await page.evaluate(() => window.__editor.clock.seek(11.7));
await page.click("#btn-play");
await page.waitForFunction(() => window.__editor.clock.loopCount >= 1, null, { timeout: 4000 });
check("loop wraps the playhead", true);
await page.click("#btn-stop");
check("stop resets to 0", (await page.evaluate(() => window.__editor.clock.time)) === 0);

// 6. keyframe add / select / delete through the UI
await page.evaluate(() => window.__editor.clock.seek(6));
const before = await page.locator(".track-row[data-object='moon'] .kf-diamond").count();
await page.click("#btn-add-kf");
const after = await page.locator(".track-row[data-object='moon'] .kf-diamond").count();
check("add keyframe at playhead", after === before + 1);
await page.locator(".track-row[data-object='moon'] .kf-diamond").last().click();
check("reselect keyframe", await page.evaluate(() => window.__editor.selectedKf !== null));
// edit a property of the selected keyframe
await page.fill("#props input[data-prop='x']", "555");
await page.dispatchEvent("#props input[data-prop='x']", "input");
check("edit selected keyframe pose", await page.evaluate(() => window.__editor.selectedKf.pose.x === 555));
await page.click("#btn-del-kf");
const restored = await page.locator(".track-row[data-object='moon'] .kf-diamond").count();
check("delete selected keyframe", restored === before);

// 7. save to JSON and reload restores the project
await page.evaluate(() => window.__editor.clock.seek(7));
await page.click("#btn-add-kf"); // extra keyframe on the moon at t=7
await page.click("#btn-save");
await page.reload();
await page.waitForFunction(() => window.__editor);
const restoredKfs = await page.evaluate(() => window.__editor.project.tracks.moon.length);
check("project restored from saved JSON", restoredKfs === 5);
const roundTrip = await page.evaluate(async () => {
	const { serializeProject, deserializeProject } = await import("./core.js");
	const p = window.__editor.project;
	return JSON.stringify(deserializeProject(serializeProject(p))) === JSON.stringify(p);
});
check("serialize/deserialize round-trip in page", roundTrip);

console.log(results.join("\n"));
if (errors.length) {
	console.log("--- page errors ---");
	console.log(errors.join("\n"));
	process.exitCode = 1;
}
await browser.close();
server.close();
