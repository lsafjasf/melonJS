import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:5199";
const url = (seed) => `${BASE}/#/station-tapes?seed=${seed}`;

const browser = await chromium.launch({
	args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
page.on("pageerror", (err) => console.log(`PAGE ERROR: ${err.message}`));
page.on("console", (msg) => {
	if (msg.type() === "error" || msg.type() === "warning") {
		console.log(`CONSOLE ${msg.type()}: ${msg.text()}`);
	}
});
const waitForGame = () =>
	page.waitForFunction(() => globalThis.__STATION_TAPES__ !== undefined, null, { timeout: 60000 });

await page.goto(url(20261114));
await waitForGame();
const c1 = await page.evaluate(() => globalThis.__STATION_TAPES__.checksums);
await page.reload();
await waitForGame();
const c2 = await page.evaluate(() => globalThis.__STATION_TAPES__.checksums);
for (let i = 0; i < 6; i++) {
	console.log(`clip${i} ${c1[i] === c2[i] ? "SAME" : "DIFF"}  ${c1[i]}  vs  ${c2[i]}`);
}

// drag probe: report order before/after one drag from slot 5 to slot 2
const order0 = await page.evaluate(() => globalThis.__STATION_TAPES__.getOrder());
console.log("order before:", order0.join());
const layout = await page.evaluate(() => globalThis.__STATION_TAPES__.layout());
const from = layout.cards.find((c) => c.slot === 5);
const to = layout.cards.find((c) => c.slot === 2);
const box = await page.locator("#screen canvas").boundingBox();
const px = (gx) => box.x + (gx / 1218) * box.width;
const py = (gy) => box.y + (gy / 640) * box.height;
await page.mouse.move(px(from.x + from.w / 2), py(from.y + from.h / 2));
await page.mouse.down();
await page.mouse.move(px(to.x + to.w / 2), py(to.y + to.h / 2), { steps: 14 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));
const order1 = await page.evaluate(() => globalThis.__STATION_TAPES__.getOrder());
console.log("order after drag slot5->slot2:", order1.join());
const fb = await page.evaluate(() => globalThis.__STATION_TAPES__.getFeedback());
console.log("feedback:", fb.join(" | "));

await browser.close();
