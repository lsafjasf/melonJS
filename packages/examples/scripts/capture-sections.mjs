/**
 * Supplementary visual captures for the geological section acceptance:
 * seed B's structure and the present-day (0 Ma) default view.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const outDir = resolve(
	new URL("../../../artifacts/geological-section", import.meta.url).pathname,
);
const browser = await chromium.launch({
	executablePath: process.env.CHROME_BIN,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${process.argv[2]}/#/geological-section`, {
	waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__geoSection?.model);

const setSeed = async (seed) => {
	await page.locator('input[type="text"]').fill(seed);
	await page.getByRole("button", { name: "生成" }).click();
	await page.waitForFunction(
		(s) => window.__geoSection?.model?.seed === s,
		seed,
	);
};

await setSeed("delta-bravo-77");
await page.locator('input[type="range"]').nth(0).fill("0");
await page.locator('input[type="range"]').nth(1).fill("0.35");
await page.waitForTimeout(300);
writeFileSync(
	resolve(outDir, "screen-seed-b-present.png"),
	await page.screenshot(),
);

// present-day view of seed A, default sea level
await setSeed("canyon-alpha");
await page.locator('input[type="range"]').nth(0).fill("0");
await page.locator('input[type="range"]').nth(1).fill("0.35");
await page.waitForTimeout(300);
writeFileSync(
	resolve(outDir, "screen-seed-a-present.png"),
	await page.screenshot(),
);

// an 8 Ma rewind of seed A to confirm partial deposition
await page.locator('input[type="range"]').nth(0).fill("8");
await page.waitForTimeout(300);
writeFileSync(
	resolve(outDir, "screen-seed-a-8ma.png"),
	await page.screenshot(),
);

await browser.close();
console.log("captures written to", outDir);
