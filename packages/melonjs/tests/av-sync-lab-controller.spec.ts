import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SyncLabSnapshot } from "@av-sync-lab/syncLab";
import { SyncLab } from "@av-sync-lab/syncLab";
import {
	DURATION_SEC,
	FRAME_STEP_SEC,
} from "@av-sync-lab/timeline";

/**
 * Controller-level contract for the sync lab, driven through the public
 * API the React UI uses. Runs in real Chromium: the AudioContext starts
 * suspended (no trusted gesture in a test page), which is exactly the
 * paused state the transport tests need.
 */
const STORAGE_KEY = "melonjs-av-sync-lab:v1";

const makeCanvas = (): HTMLCanvasElement => {
	const canvas = document.createElement("canvas");
	canvas.width = 320;
	canvas.height = 240;
	// the controller never records in these specs, but keep the stub realistic
	canvas.captureStream = () => new MediaStream();
	return canvas;
};

describe("SyncLab controller", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("emits snapshots carrying flash and paired-beat times", () => {
		const snapshots: SyncLabSnapshot[] = [];
		const lab = new SyncLab(makeCanvas(), (s) => snapshots.push(s));
		lab.seekTo(1.0);
		const latest = snapshots.at(-1);
		expect(latest).toBeDefined();
		expect(latest?.lastFlashTime).toBe(1.0);
		expect(latest?.lastBeatTime).toBe(1.0);
		expect(latest?.playing).toBe(false);
		lab.dispose();
	});

	it("keeps audio time stable across pause, frame step and seek", async () => {
		const lab = new SyncLab(makeCanvas(), () => {});
		lab.seekTo(5);
		await lab.pause();
		expect(lab.isPlaying).toBe(false);

		await lab.stepFrame();
		// rAF-driven paint is async, so compare against the clock math directly
		expect(lab.audioTime).toBeCloseTo(5 + FRAME_STEP_SEC, 5);

		lab.seekTo(12.34);
		expect(lab.audioTime).toBeCloseTo(12.34, 5);
		lab.dispose();
	});

	it("applies the offset with the documented sign and clamps it", () => {
		const lab = new SyncLab(makeCanvas(), () => {});
		lab.setOffsetMs(200);
		expect(lab.offsetMs).toBe(200);
		lab.setOffsetMs(9000);
		expect(lab.offsetMs).toBe(250);
		lab.setOffsetMs(-9000);
		expect(lab.offsetMs).toBe(-250);
		lab.dispose();
	});

	it("persists the offset and restores it on a fresh instance", () => {
		const first = new SyncLab(makeCanvas(), () => {});
		first.setOffsetMs(-125);
		first.saveOffset();
		expect(localStorage.getItem(STORAGE_KEY)).toContain("-125");
		first.dispose();

		const second = new SyncLab(makeCanvas(), () => {});
		expect(second.offsetMs).toBe(-125);
		second.dispose();
	});

	it("stores markers against visual time and restores them after reload", () => {
		const first = new SyncLab(makeCanvas(), () => {});
		first.setOffsetMs(100);
		first.seekTo(3);
		first.addMarker();
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as {
			markers: { visualTime: number }[];
		};
		// marker is pinned to the visual (delayed) time, not the audio time
		expect(stored.markers[0].visualTime).toBeCloseTo(2.9, 5);
		first.dispose();

		const snapshots: SyncLabSnapshot[] = [];
		const second = new SyncLab(makeCanvas(), (snapshot) => {
			snapshots.push(snapshot);
		});
		second.seekTo(0);
		// the restored marker rides along in every emitted snapshot
		const restored = snapshots.at(-1);
		expect(restored?.markers.length).toBe(1);
		expect(restored?.markers[0]?.label).toBe("M1");
		second.dispose();
	});

	it("clamps restored offsets from tampered storage into the 250 ms range", () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ offsetMs: 4000, markers: [] }),
		);
		const lab = new SyncLab(makeCanvas(), () => {});
		expect(lab.offsetMs).toBe(250);
		lab.dispose();
	});

	it("ignores corrupt storage instead of throwing", () => {
		localStorage.setItem(STORAGE_KEY, "{not json");
		expect(() => new SyncLab(makeCanvas(), () => {})).not.toThrow();
	});

	it("wraps seeks past the program end back into the timeline", () => {
		const lab = new SyncLab(makeCanvas(), () => {});
		lab.seekTo(DURATION_SEC + 2);
		expect(lab.audioTime).toBeCloseTo(2, 5);
		lab.dispose();
	});
});
