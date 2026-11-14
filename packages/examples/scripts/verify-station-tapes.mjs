/**
 * Station Tapes example — end-to-end checks (Playwright + the dev server).
 *
 * Usage: pnpm -F examples dev --port 5199   (in another shell)
 *        node packages/examples/scripts/verify-station-tapes.mjs
 *
 * Verifies, in a real browser: same-seed restart reproduces the six
 * recordings, a wrong order cannot close the case, pause freezes playback,
 * and a fully correct reconstruction closes the case.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:5199";
const GAME_W = 1218;
const GAME_H = 640;
const SEED = 20261114;

const url = (seed) => `${BASE}/#/station-tapes?seed=${seed}`;

let failures = 0;
const check = (name, ok, detail = "") => {
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  — ${detail}`}`);
	if (!ok) {
		failures++;
	}
};

const browser = await chromium.launch({
	args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
page.on("pageerror", (err) => {
	console.log(`PAGE ERROR: ${err.message}`);
	failures++;
});

const waitForGame = () =>
	page.waitForFunction(() => globalThis.__STATION_TAPES__ !== undefined, null, {
		timeout: 60000,
	});
const dbg = (fn) => page.evaluate(fn);

/** game coordinates -> page coordinates, through the scaled canvas */
const toPage = async (gx, gy) => {
	const box = await page.locator("#screen canvas").boundingBox();
	return {
		x: box.x + (gx / GAME_W) * box.width,
		y: box.y + (gy / GAME_H) * box.height,
	};
};
const clickGame = async (gx, gy) => {
	const p = await toPage(gx, gy);
	await page.mouse.click(p.x, p.y);
};
const dragGame = async (from, to) => {
	const a = await toPage(from.x, from.y);
	const b = await toPage(to.x, to.y);
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	await page.mouse.move(b.x, b.y, { steps: 14 });
	await page.mouse.up();
};
const clickButton = async (name) => {
	const layout = await dbg(() => globalThis.__STATION_TAPES__.layout());
	const b = layout.buttons[name];
	await clickGame(b.x + b.w / 2, b.y + b.h / 2);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- scenario 1: same-seed restart reproduces the case -------------------
await page.goto(url(SEED));
await waitForGame();
const snap1 = await dbg(() => {
	const g = globalThis.__STATION_TAPES__;
	return { checksums: g.checksums, answer: g.answer, presentation: g.presentation, events: g.events };
});
check("case generated", snap1.checksums.length === 6);

await page.reload();
await waitForGame();
const snap2 = await dbg(() => {
	const g = globalThis.__STATION_TAPES__;
	return { checksums: g.checksums, answer: g.answer, presentation: g.presentation, events: g.events };
});
check(
	"same seed, same six recordings after reload",
	JSON.stringify(snap1) === JSON.stringify(snap2),
	"checksums/answer/presentation differ across reload",
);

await page.goto(url(777));
await page.reload();
await waitForGame();
const snap3 = await dbg(() => {
	const g = globalThis.__STATION_TAPES__;
	return { checksums: g.checksums, presentation: g.presentation };
});
check(
	"different seed, different recordings",
	JSON.stringify(snap3.checksums) !== JSON.stringify(snap1.checksums),
);

// --- scenario 2: a wrong order cannot close the case ---------------------
await page.goto(url(SEED));
await page.reload();
await waitForGame();
await clickButton("submit");
await sleep(200);
check("wrong order: not solved", (await dbg(() => globalThis.__STATION_TAPES__.isSolved())) === false);
const feedback = (await dbg(() => globalThis.__STATION_TAPES__.getFeedback())).join("\n");
check("wrong order: verdict explains itself", feedback.includes("还不能结案"), feedback);

// --- scenario 3: pause freezes playback ----------------------------------
const layout1 = await dbg(() => globalThis.__STATION_TAPES__.layout());
const card0 = layout1.cards.find((c) => c.slot === 0);
await clickGame(card0.x + 40, card0.y + 14); // header: play from the top
await sleep(900);
const pos1 = await dbg(() => globalThis.__STATION_TAPES__.playerPosition());
check("playback started", pos1 > 0.2, `position ${pos1}`);
await clickButton("pause");
await sleep(150);
check("stage paused", (await dbg(() => globalThis.__STATION_TAPES__.isPaused())) === true);
const frozen1 = await dbg(() => globalThis.__STATION_TAPES__.playerPosition());
await sleep(500);
const frozen2 = await dbg(() => globalThis.__STATION_TAPES__.playerPosition());
check("playback frozen while paused", frozen1 === frozen2, `${frozen1} -> ${frozen2}`);
await clickButton("pause"); // 继续
await sleep(500);
const pos2 = await dbg(() => globalThis.__STATION_TAPES__.playerPosition());
check(
	"playback resumes where it froze",
	(await dbg(() => globalThis.__STATION_TAPES__.isPaused())) === false && pos2 > frozen2,
	`paused=${await dbg(() => globalThis.__STATION_TAPES__.isPaused())} ${frozen2} -> ${pos2}`,
);

// --- scenario 4: correct order + both key moments close the case ---------
const sortByDrag = async () => {
	for (let s = 0; s < 6; s++) {
		const layout = await dbg(() => globalThis.__STATION_TAPES__.layout());
		const wanted = layout.cards.find((c) => c.trueIndex === s);
		if (wanted.slot === s) {
			continue;
		}
		const occupant = layout.cards.find((c) => c.slot === s);
		await dragGame(
			{ x: wanted.x + wanted.w / 2, y: wanted.y + wanted.h / 2 },
			{ x: occupant.x + occupant.w / 2, y: occupant.y + occupant.h / 2 },
		);
		await sleep(350);
	}
};
await sortByDrag();
const order = await dbg(() => globalThis.__STATION_TAPES__.getOrder());
check("dragged into true order", JSON.stringify(order) === JSON.stringify([0, 1, 2, 3, 4, 5]), order.join());

const answer = await dbg(() => globalThis.__STATION_TAPES__.answer);
const placeMarker = async (kind, clipIndex, time) => {
	await clickButton(kind);
	await sleep(120);
	const layout = await dbg(() => globalThis.__STATION_TAPES__.layout());
	const card = layout.cards.find((c) => c.trueIndex === clipIndex);
	const wf = layout.waveform;
	await clickGame(card.x + wf.x + (time / 5) * wf.w, card.y + wf.y + wf.h / 2);
	await sleep(120);
};
await placeMarker("footsteps", answer.footsteps.clipIndex, answer.footsteps.time);
await placeMarker("doorClose", answer.doorClose.clipIndex, answer.doorClose.time);
const markers = await dbg(() => globalThis.__STATION_TAPES__.getMarkers());
check("both markers placed", markers.footsteps !== null && markers.doorClose !== null);

await clickButton("submit");
await sleep(300);
check("correct reconstruction closes the case", (await dbg(() => globalThis.__STATION_TAPES__.isSolved())) === true);
const verdict = (await dbg(() => globalThis.__STATION_TAPES__.getFeedback())).join("\n");
check("event line revealed with the evidence", verdict.includes("结案") && verdict.includes("声音证据"), verdict);

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
