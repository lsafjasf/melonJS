/**
 * melonJS — procedural binaural listening workbench.
 *
 * No external audio: a synthetic oscillator source orbits a room whose
 * impulse response is generated procedurally (Sabine T60, image-source
 * early reflections, decorrelated noise tail) and run through a
 * ConvolverNode. The listener is dragged around the room plan; pan,
 * front/back filtering and distance gain all track the drag. Dry, wet
 * and binaural output modes are available, and the recorded listener
 * trajectory can be rendered offline into a short stereo WAV.
 *
 * The room plan only mounts once sound generation has completed — it is
 * an acoustic visualisation, not a game map.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, audio, state } from "melonjs";
import { createExampleComponent } from "../utils";
import { BinauralAudioEngine } from "./audioEngine";
import { createControlPanel } from "./controlPanel";
import { RoomPlanStage } from "./RoomPlanStage";
import {
	recordTrajectoryPoint,
	sourceOrbitPosition,
	type TimedPoint,
} from "./trajectory";
import type { OutputMode, PlanPoint } from "./types";
import { channelHasSignal, encodeWav } from "./wav";

const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 600;
const RENDER_DURATION_SEC = 6;

export const ExampleBinauralWorkbench = createExampleComponent(async () => {
	audio.init("wav");
	const app = new Application(DESIGN_WIDTH, DESIGN_HEIGHT, {
		parent: "screen",
		scale: "auto",
		backgroundColor: "#0c1320",
	});
	await app.init();

	const panel = createControlPanel();
	panel.element.id = "binaural-control-panel";
	document.getElementById("screen")?.appendChild(panel.element);

	let engine: BinauralAudioEngine | null = null;
	let stage: RoomPlanStage | null = null;
	let trajectory: TimedPoint[] = [];
	let rafHandle = 0;
	let audioStartTime = 0;
	const heading = 0;

	const tick = () => {
		if (!engine || !stage) {
			return;
		}
		const ctx = audio.getAudioContext();
		if (!ctx) {
			return;
		}
		const time = ctx.currentTime - audioStartTime;
		const source = sourceOrbitPosition(panel.getSettings().room, time);
		const listener = stage.plan.getListener();
		stage.plan.setSource(source);
		engine.updateSpatial({
			source,
			listener,
			listenerHeading: heading,
		});
		trajectory = recordTrajectoryPoint(trajectory, time, listener);
		stage.plan.setTrajectory(trajectory);
		rafHandle = requestAnimationFrame(tick);
	};

	panel.onBuild(() => {
		const settings = panel.getSettings();
		const ctx = audio.getAudioContext();
		if (!ctx) {
			panel.setStatus("Web Audio is unavailable in this browser.");
			return;
		}

		// Tear down any previous room before building the new one.
		cancelAnimationFrame(rafHandle);
		if (stage) {
			state.change(state.DEFAULT);
			stage = null;
		}
		engine?.stop();

		engine = new BinauralAudioEngine(ctx, settings.room, settings.material);
		engine.setMode(settings.mode);
		const initialListener: PlanPoint = {
			x: settings.room.width / 2,
			y: settings.room.depth * 0.7,
		};
		engine.regenerateImpulseResponse(
			sourceOrbitPosition(settings.room, 0),
			initialListener,
			heading,
		);
		engine.connect(audio.getMasterGain() ?? ctx.destination);
		engine.start();
		audioStartTime = ctx.currentTime;
		trajectory = [];

		// The plan view appears only now: sound generation has
		// finished, so it can never be mistaken for a game map.
		stage = new RoomPlanStage(settings.room, settings.material);
		stage.plan.setListener(initialListener);
		state.set(state.PLAY, stage);
		state.change(state.PLAY);

		panel.setSoundReady(true);
		panel.setStatus("Sound live — drag the green listener inside the room.");
		rafHandle = requestAnimationFrame(tick);
	});

	panel.onModeChange((mode: OutputMode) => {
		engine?.setMode(mode);
		panel.setStatus(`Output mode: ${mode}`);
	});

	panel.onExport(async () => {
		const settings = panel.getSettings();
		if (!engine || trajectory.length === 0) {
			panel.setStatus("Drag the listener first to record a trajectory.");
			return;
		}
		panel.setStatus("Offline rendering WAV…");
		try {
			const liveCtx = audio.getAudioContext();
			const sampleRate = liveCtx?.sampleRate ?? 48000;
			// Replay the most recent window, padded to a short clip.
			const start = Math.max(
				0,
				trajectory[trajectory.length - 1].time - RENDER_DURATION_SEC,
			);
			const clipped = trajectory
				.filter((sample) => sample.time >= start)
				.map((sample) => ({
					time: sample.time - start,
					point: sample.point,
				}));
			// Match the render length to the recorded path so the clip
			// never trails off into an unparameterised tail.
			const durationSec = Math.min(
				RENDER_DURATION_SEC,
				Math.max(1, clipped[clipped.length - 1].time - clipped[0].time + 0.25),
			);
			const rendered = await BinauralAudioEngine.renderOffline({
				room: settings.room,
				material: settings.material,
				mode: settings.mode,
				durationSec,
				sampleRate,
				trajectory: clipped,
				sourceAt: (time) => sourceOrbitPosition(settings.room, start + time),
				heading,
			});
			const left = rendered.getChannelData(0);
			const right = rendered.getChannelData(1);
			if (!channelHasSignal(left) || !channelHasSignal(right)) {
				throw new Error("rendered WAV is missing a channel");
			}
			const blob = encodeWav(sampleRate, [left, right]);
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "binaural-trajectory.wav";
			link.click();
			URL.revokeObjectURL(url);
			panel.setStatus(
				`Exported stereo WAV (${durationSec.toFixed(1)} s, both channels verified).`,
			);
		} catch (error) {
			panel.setStatus(
				`WAV export failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	});

	return () => {
		cancelAnimationFrame(rafHandle);
		if (stage) {
			state.change(state.DEFAULT);
			stage = null;
		}
		engine?.stop();
		panel.element.remove();
	};
});
