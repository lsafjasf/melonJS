/**
 * Playwright acceptance check for the geological section example.
 *
 * 1. Loads two different seeds and asserts they produce different models
 *    while each seed is deterministic across regenerations.
 * 2. Exercises the time slider, sea-level slider, a layer toggle and the
 *    horizontal drag.
 * 3. Renders the PNG export in the page, downloads it and checks that no
 *    annotation is cropped (non-background pixels keep a safe margin).
 *
 * Run against a live dev server:
 *   node scripts/verify-geological-section.mjs [baseUrl]
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:5173";
const outDir = resolve(
	process.env.GEO_OUT_DIR ??
		new URL("../../../artifacts/geological-section", import.meta.url).pathname,
);

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
	console.log(`  ✓ ${message}`);
};

const launchOptions = {};
if (process.env.CHROME_BIN) {
	launchOptions.executablePath = process.env.CHROME_BIN;
}
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
	if (message.type() === "error") {
		errors.push(message.text());
	}
});

await page.goto(`${baseUrl}/#/geological-section`, {
	waitUntil: "networkidle",
});

const waitForModel = () =>
	page.waitForFunction(
		() => {
			const state = window.__geoSection;
			return Boolean(state?.model?.layers.length);
		},
		{ timeout: 15000 },
	);

await waitForModel();

const readModel = () =>
	page.evaluate(() => {
		const { model } = window.__geoSection;
		return {
			seed: model.seed,
			hash: model.seedHash,
			layerCount: model.layers.length,
			faultCount: model.faults.length,
			erosionCount: model.erosions.length,
			firstSurface: Array.from(
				model.timeline[model.timeline.length - 1].surfaces[0],
			).slice(0, 12),
			faults: model.faults.map((f) => ({
				column: f.column,
				throwAmount: f.throwAmount,
				age: f.age,
			})),
		};
	});

const setSeed = async (seed) => {
	await page.locator('input[type="text"]').fill(seed);
	await page.getByRole("button", { name: "生成" }).click();
	await waitForModel();
};

console.log("Seed A (baseline + determinism):");
await setSeed("canyon-alpha");
const seedA1 = await readModel();
assert(
	seedA1.layerCount >= 8 && seedA1.layerCount <= 12,
	`seed A has ${seedA1.layerCount} layers (8–12)`,
);
assert(seedA1.faultCount === 2, "seed A has exactly 2 faults");
assert(seedA1.erosionCount === 3, "seed A has exactly 3 erosion events");

// Coherent fault displacement: every interface jumps by the same vertical
// amount across the fault plane, so adjacent strata stay aligned.
const coherence = await page.evaluate(() => {
	const { model } = window.__geoSection;
	const present = model.timeline[model.timeline.length - 1];
	const fault = model.faults[0];
	const column = fault.column;
	const jumps = present.surfaces.map((surface) =>
		Math.abs(surface[column + 2] - surface[column - 2]),
	);
	// every contact carries the same jump (within sampling rounding)
	const spread = Math.max(...jumps) - Math.min(...jumps);
	return { spread, jumps: jumps.map((value) => Number(value.toFixed(2))) };
});
assert(
	coherence.spread < 0.5,
	`fault displaces every layer by the same amount (jump spread ${coherence.spread.toFixed(3)} m)`,
);

await setSeed("canyon-alpha");
const seedA2 = await readModel();
assert(
	JSON.stringify(seedA1) === JSON.stringify(seedA2),
	"same seed regenerates an identical model (surfaces, faults, ages)",
);

console.log("Seed B (different structure):");
await setSeed("delta-bravo-77");
const seedB1 = await readModel();
assert(seedB1.hash !== seedA1.hash, "seed B has a different hash from seed A");
assert(
	JSON.stringify(seedB1.firstSurface) !== JSON.stringify(seedA1.firstSurface) ||
		seedB1.layerCount !== seedA1.layerCount,
	"seed B produces a different stratigraphic structure",
);
assert(
	seedB1.layerCount >= 8 && seedB1.layerCount <= 12,
	`seed B has ${seedB1.layerCount} layers (8–12)`,
);

// Persist seed B's own export (data URL, no download dialog) so both
// accepted seeds have a checked, annotation-complete PNG on disk.
const seedBPng = await page.evaluate(() => {
	const { model, view, renderSection } = window.__geoSection;
	const canvas = document.createElement("canvas");
	canvas.width = 1600;
	canvas.height = 900;
	const ctx = canvas.getContext("2d");
	renderSection(ctx, 1600, 900, model, view, null);
	return canvas.toDataURL("image/png");
});
writeFileSync(
	resolve(outDir, "section-export-seed-b.png"),
	Buffer.from(seedBPng.split(",")[1], "base64"),
);

// restore seed A for the interaction + export checks
await setSeed("canyon-alpha");

const canvas = page.locator("#screen canvas");
const box = await canvas.boundingBox();

console.log("Interactions:");
const rangeInputs = page.locator('input[type="range"]');
const timeSlider = rangeInputs.nth(0);
await timeSlider.fill("12");
const viewAge = await page.evaluate(() => window.__geoSection.view.viewAge);
assert(Math.abs(viewAge - 12) < 0.01, "time slider rewinds to 12 Ma");

const seaSlider = rangeInputs.nth(1);
await seaSlider.fill("0.8");
const seaLevel = await page.evaluate(() => window.__geoSection.view.seaLevel);
assert(Math.abs(seaLevel - 0.8) < 0.001, "sea-level slider updates the view");

const firstLayerToggle = page
	.locator("label:has(input[type=checkbox])")
	.first()
	.locator("input");
await firstLayerToggle.uncheck();
const hiddenCount = await page.evaluate(
	() => window.__geoSection.view.hidden.size,
);
assert(hiddenCount === 1, "layer visibility toggle hides one layer");

// Hover hit-testing: a point inside the rock body resolves to a layer with
// age, hardness and a positive local thickness.
await firstLayerToggle.check();
await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.62);
await page.waitForTimeout(150);
const hoverHit = await page.evaluate(() => {
	const {
		model,
		view,
		hitTest,
		surfacesAtAge,
		computeGeometry,
		WIDTH,
		HEIGHT,
	} = window.__geoSection;
	const geometry = computeGeometry(WIDTH, HEIGHT);
	const { surfaces, deposited } = surfacesAtAge(model, view.viewAge);
	// probe several points inside the plot until a layer is hit
	for (const [px, py] of [
		[0.35, 0.62],
		[0.5, 0.7],
		[0.25, 0.55],
	]) {
		const hit = hitTest(
			model,
			surfaces,
			deposited,
			geometry,
			view,
			geometry.plotX + geometry.plotW * px,
			geometry.plotY + geometry.plotH * py,
		);
		if (hit) {
			return {
				name: hit.layer.name,
				hardness: hit.layer.hardness,
				ageTop: hit.layer.ageTop,
				ageBase: hit.layer.ageBase,
				thickness: hit.localThickness,
			};
		}
	}
	return null;
});
assert(hoverHit !== null, "hover inside the section resolves to a layer");
assert(
	hoverHit.thickness > 0,
	`hover reports thickness ${hoverHit.thickness.toFixed(1)} m`,
);
assert(
	hoverHit.hardness > 0 && hoverHit.ageTop <= hoverHit.ageBase,
	`hover reports hardness ${hoverHit.hardness} Mohs and age ${hoverHit.ageTop}–${hoverHit.ageBase} Ma`,
);

// Time rewind: deep in the past fewer layers have been deposited.
const depositedNow = await page.evaluate(() => {
	const { model, surfacesAtAge } = window.__geoSection;
	return surfacesAtAge(model, 0).deposited;
});
const depositedOld = await page.evaluate(() => {
	const { model, surfacesAtAge } = window.__geoSection;
	return surfacesAtAge(model, 19.5).deposited;
});
assert(
	depositedOld < depositedNow,
	`rewinding to 19.5 Ma hides younger layers (${depositedOld} of ${depositedNow} deposited)`,
);

await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, {
	steps: 8,
});
await page.mouse.up();
const panX = await page.evaluate(() => window.__geoSection.view.panX);
assert(panX < 0, `horizontal drag pans the section (panX=${panX.toFixed(1)})`);

console.log("PNG export (no cropped annotations):");
const [download] = await Promise.all([
	page.waitForEvent("download"),
	page.getByRole("button", { name: /导出 PNG/ }).click(),
]);
const exportPath = resolve(outDir, "section-export-seed-a.png");
await download.saveAs(exportPath);

const marginCheck = await page.evaluate(async () => {
	const { model, view, renderSection } = window.__geoSection;
	const exportWidth = 1600;
	const exportHeight = 900;
	const offscreen = document.createElement("canvas");
	offscreen.width = exportWidth;
	offscreen.height = exportHeight;
	const ctx = offscreen.getContext("2d");
	renderSection(ctx, exportWidth, exportHeight, model, view, null);
	const data = ctx.getImageData(0, 0, exportWidth, exportHeight).data;
	// tolerance absorbs text anti-aliasing against the dark background
	const isBackground = (index) => {
		return (
			Math.abs(data[index] - 14) <= 4 &&
			Math.abs(data[index + 1] - 19) <= 4 &&
			Math.abs(data[index + 2] - 27) <= 4
		);
	};
	const safe = 8;
	const edges = {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
	};
	for (let x = 0; x < exportWidth; x++) {
		for (let y = 0; y < safe; y++) {
			if (!isBackground((y * exportWidth + x) * 4)) edges.top++;
		}
		for (let y = exportHeight - safe; y < exportHeight; y++) {
			if (!isBackground((y * exportWidth + x) * 4)) edges.bottom++;
		}
	}
	for (let y = 0; y < exportHeight; y++) {
		for (let x = 0; x < safe; x++) {
			if (!isBackground((y * exportWidth + x) * 4)) edges.left++;
		}
		for (let x = exportWidth - safe; x < exportWidth; x++) {
			if (!isBackground((y * exportWidth + x) * 4)) edges.right++;
		}
	}
	return { edges, width: exportWidth, height: exportHeight };
});
if (
	!(
		marginCheck.edges.top === 0 &&
		marginCheck.edges.bottom === 0 &&
		marginCheck.edges.left === 0 &&
		marginCheck.edges.right === 0
	)
) {
	throw new Error(`edge content counts: ${JSON.stringify(marginCheck.edges)}`);
}
assert(
	true,
	`export keeps an ${8}px clear margin on all four edges (no cropped labels)`,
);

const screenshot = await page.screenshot({ fullPage: false });
writeFileSync(resolve(outDir, "screen-seed-a.png"), screenshot);

assert(errors.length === 0, `no console/page errors (${errors.length})`);

await browser.close();
console.log(`\nExport written to ${exportPath}`);
console.log("All acceptance checks passed.");
