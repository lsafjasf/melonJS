/**
 * melonJS — timeline controller for the layered compositor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import type { Application, Renderer } from "melonjs";
import { TimelineAudio } from "./audio";
import {
	type CompositorProject,
	type CompositorTrack,
	countKeyframes,
	createDefaultProject,
	getKeyframeAtFrame,
	getTrack,
	type KeyframeValue,
	type PropertyId,
	parseProject,
	removeKeyframeAtFrame,
	sampleProperty,
	serializeProject,
	type TrackId,
	upsertKeyframe,
} from "./project";
import { SceneCompositor } from "./scene";

const CUE_TIMES = [0, 3, 6, 9];

export interface CompositorSelection {
	track: TrackId;
	property: PropertyId;
}

export interface CompositorSnapshot {
	ready: boolean;
	time: number;
	frame: number;
	totalFrames: number;
	project: CompositorProject;
	playing: boolean;
	loop: boolean;
	selected: CompositorSelection;
	status: string;
	audioReady: boolean;
	audioState: "ready" | "idle";
}

type Listener = () => void;

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(Math.max(value, min), max);
};

const download = (blob: Blob, name: string) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
	globalThis.setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 1000);
};

export class CompositorController {
	private project = createDefaultProject();
	private time = 0;
	private playing = false;
	private loop = true;
	private selected: CompositorSelection = {
		track: "dust",
		property: "offset",
	};
	private status = `Demo project loaded: ${countKeyframes(
		this.project,
	)} keyframes across 3 isolated tracks.`;
	private audio = new TimelineAudio();
	private listeners = new Set<Listener>();
	private app: Application | null = null;
	private scene: SceneCompositor | null = null;
	private ready = false;
	private ticker = 0;
	private lastNow = 0;
	private lastEmit = 0;
	private scrubbing = false;
	private api: Record<string, unknown> | null = null;
	private snapshot: CompositorSnapshot;

	constructor() {
		this.snapshot = this.buildSnapshot();
		this.startTicker();
		this.installApi();
	}

	subscribe = (listener: Listener): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	private buildSnapshot(): CompositorSnapshot {
		const totalFrames = Math.round(this.project.duration * this.project.fps);
		return {
			ready: this.ready,
			time: this.time,
			frame: Math.round(this.time * this.project.fps),
			totalFrames,
			project: this.project,
			playing: this.playing,
			loop: this.loop,
			selected: this.selected,
			status: this.status,
			audioReady: this.audio.ready,
			audioState: this.audio.state,
		};
	}

	getSnapshot = (): CompositorSnapshot => {
		return this.snapshot;
	};

	getTime = (): number => {
		return this.time;
	};

	getProject = (): CompositorProject => {
		return this.project;
	};

	attach(app: Application) {
		this.app = app;
		this.scene = new SceneCompositor(this);
		app.world.addChild(this.scene);
		this.ready = true;
		this.status =
			"Compositor ready. Drag the playhead, then add a keyframe to the selected lane.";
		this.notify();
	}

	private startTicker() {
		if (this.ticker !== 0) {
			return;
		}
		this.lastNow = globalThis.performance.now();
		this.lastEmit = this.lastNow;
		const frame = (now: number) => {
			const elapsed = Math.min(Math.max((now - this.lastNow) / 1000, 0), 0.1);
			this.lastNow = now;
			if (this.playing) {
				this.advance(elapsed);
				if (now - this.lastEmit >= 32) {
					this.lastEmit = now;
					this.notify();
				}
			}
			this.ticker = globalThis.requestAnimationFrame(frame);
		};
		this.ticker = globalThis.requestAnimationFrame(frame);
	}

	private advance(elapsed: number) {
		const previous = this.time;
		const duration = this.project.duration;
		this.time += elapsed;
		if (this.time >= duration) {
			if (this.loop) {
				this.time %= duration;
				this.audio.cue(0);
				for (const cue of CUE_TIMES) {
					if (cue > 0 && cue <= this.time) {
						this.audio.cue(cue);
					}
				}
			} else {
				this.time = duration;
				this.playing = false;
				this.audio.pause();
				this.status = "Playback reached the end. Press Play to restart.";
				this.notify();
				return;
			}
		}
		for (const cue of CUE_TIMES) {
			if (cue > previous && cue <= this.time) {
				this.audio.cue(cue);
			}
		}
	}

	play = () => {
		if (this.playing) {
			return;
		}
		if (!this.loop && this.time >= this.project.duration) {
			this.time = 0;
		}
		this.playing = true;
		this.status = "Playing. Audio is locked to the current playhead.";
		const startAtZero = this.time === 0;
		void this.audio.play(this.time, this.project.duration).then((enabled) => {
			if (!enabled) {
				this.status =
					"Playing. Web Audio is unavailable in this browser session.";
				this.notify();
			}
		});
		if (startAtZero) {
			this.audio.cue(0);
		}
		this.notify();
	};

	pause = () => {
		if (!this.playing) {
			return;
		}
		this.playing = false;
		this.audio.pause();
		this.status = "Paused. The playhead is ready to scrub.";
		this.notify();
	};

	togglePlayback = () => {
		if (this.playing) {
			this.pause();
		} else {
			this.play();
		}
	};

	seek = (seconds: number, fromScrub = false) => {
		this.time = clamp(seconds, 0, this.project.duration);
		this.scrubbing = fromScrub;
		if (fromScrub) {
			this.audio.preview(this.time, this.project.duration, this.playing);
		} else {
			this.audio.seek(this.time, this.project.duration, this.playing);
		}
		this.status = `Playhead moved to frame ${Math.round(
			this.time * this.project.fps,
		)}. Audio was re-seated at the new position.`;
		this.notify();
	};

	endScrub = () => {
		if (!this.scrubbing) {
			return;
		}
		this.scrubbing = false;
		this.audio.seek(this.time, this.project.duration, this.playing);
		this.notify();
	};

	stepFrame = (direction: number) => {
		this.pause();
		const frame = Math.round(this.time * this.project.fps) + direction;
		this.seek(frame / this.project.fps);
	};

	setLoop = (loop: boolean) => {
		this.loop = loop;
		this.status = loop ? "Loop enabled." : "Loop disabled.";
		this.notify();
	};

	selectLane = (track: TrackId, property: PropertyId) => {
		this.selected = { track, property };
		this.notify();
	};

	selectKeyframe = (track: TrackId, property: PropertyId, frame: number) => {
		this.pause();
		this.selected = { track, property };
		this.time = clamp(frame / this.project.fps, 0, this.project.duration);
		this.audio.seek(this.time, this.project.duration, false);
		this.status = `Selected ${property} keyframe at frame ${frame}.`;
		this.notify();
	};

	private currentTrack(): CompositorTrack {
		return getTrack(this.project, this.selected.track);
	}

	private frameAtPlayhead(): number {
		return Math.round(
			clamp(this.time, 0, this.project.duration) * this.project.fps,
		);
	}

	sampledValue(
		track: TrackId = this.selected.track,
		property: PropertyId = this.selected.property,
	): KeyframeValue {
		return sampleProperty(
			getTrack(this.project, track),
			property,
			this.time,
			this.project.fps,
			this.project.duration,
		);
	}

	addKeyframe = () => {
		this.pause();
		const frame = this.frameAtPlayhead();
		const value = this.sampledValue();
		this.project = upsertKeyframe(
			this.project,
			this.selected.track,
			this.selected.property,
			frame,
			value,
		);
		this.status = `Keyframe written at frame ${frame} on ${this.selected.track} / ${this.selected.property}.`;
		this.notify();
	};

	writeValue = (value: KeyframeValue) => {
		this.pause();
		const frame = this.frameAtPlayhead();
		this.project = upsertKeyframe(
			this.project,
			this.selected.track,
			this.selected.property,
			frame,
			value,
		);
		this.status = `Frame ${frame} updated on ${this.selected.track} / ${this.selected.property}.`;
		this.notify();
	};

	deleteKeyframe = () => {
		const frame = this.frameAtPlayhead();
		const current = this.currentTrack();
		if (!getKeyframeAtFrame(current, this.selected.property, frame)) {
			this.status = `There is no keyframe exactly at frame ${frame}.`;
			this.notify();
			return;
		}
		this.project = removeKeyframeAtFrame(
			this.project,
			this.selected.track,
			this.selected.property,
			frame,
		);
		this.status = `Removed the frame ${frame} keyframe from ${this.selected.property}.`;
		this.notify();
	};

	saveJSON = (): string => {
		const json = serializeProject(this.project);
		const name = `${
			this.project.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "") || "compositor"
		}.json`;
		download(new Blob([json], { type: "application/json" }), name);
		this.status = `Saved JSON with ${countKeyframes(this.project)} keyframes.`;
		this.notify();
		return json;
	};

	loadJSON = (text: string, sourceName = "project.json"): CompositorProject => {
		const project = parseProject(text);
		this.pause();
		this.audio.pause();
		this.project = project;
		this.time = 0;
		this.playing = false;
		if (
			!this.project.tracks.some((track) => {
				return track.id === this.selected.track;
			})
		) {
			this.selected = { track: "dust", property: "offset" };
		}
		this.status = `Loaded ${sourceName}: ${countKeyframes(
			this.project,
		)} keyframes, validated and isolated by track.`;
		this.notify();
		return project;
	};

	exportPNG = async (): Promise<Blob | null> => {
		if (!this.scene) {
			this.status = "The compositor canvas is still starting.";
			this.notify();
			return null;
		}
		this.status = `Rendering frame ${this.frameAtPlayhead()} for PNG export...`;
		this.notify();
		try {
			const blob = await this.scene.capture();
			const frame = this.frameAtPlayhead().toString().padStart(3, "0");
			download(blob, `compositor-frame-${frame}.png`);
			this.status = `Exported frame ${frame} as a PNG (${Math.round(
				blob.size / 1024,
			)} KB).`;
			this.notify();
			return blob;
		} catch (error) {
			this.status = `PNG export failed: ${
				error instanceof Error ? error.message : String(error)
			}`;
			this.notify();
			return null;
		}
	};

	getKeyframeCount = (): number => {
		return countKeyframes(this.project);
	};

	report = (message: string) => {
		this.status = message;
		this.notify();
	};

	getApiProject = (): CompositorProject => {
		return JSON.parse(serializeProject(this.project)) as CompositorProject;
	};

	private notify() {
		this.snapshot = this.buildSnapshot();
		for (const listener of this.listeners) {
			listener();
		}
	}

	private installApi() {
		const api = {
			play: this.play,
			pause: this.pause,
			togglePlayback: this.togglePlayback,
			seek: (seconds: number) => {
				this.seek(seconds);
			},
			stepFrame: this.stepFrame,
			setLoop: this.setLoop,
			saveJSON: this.saveJSON,
			loadJSON: this.loadJSON,
			exportPNG: this.exportPNG,
			getSnapshot: this.getSnapshot,
			getProject: this.getApiProject,
			getKeyframeCount: this.getKeyframeCount,
			addKeyframe: this.addKeyframe,
			writeValue: this.writeValue,
			selectLane: this.selectLane,
			sample: (track: TrackId, property: PropertyId, time: number) => {
				return sampleProperty(
					getTrack(this.project, track),
					property,
					time,
					this.project.fps,
					this.project.duration,
				);
			},
		};
		this.api = api;
		(
			globalThis as unknown as {
				__compositor?: Record<string, unknown>;
				__layerCompositor?: Record<string, unknown>;
			}
		).__compositor = api;
		(
			globalThis as unknown as {
				__layerCompositor?: Record<string, unknown>;
			}
		).__layerCompositor = api;
	}

	uninstallApi() {
		const host = globalThis as unknown as {
			__compositor?: Record<string, unknown>;
			__layerCompositor?: Record<string, unknown>;
		};
		if (host.__compositor === this.api) {
			delete host.__compositor;
		}
		if (host.__layerCompositor === this.api) {
			delete host.__layerCompositor;
		}
		this.api = null;
	}

	destroy(renderer?: Renderer) {
		if (this.ticker !== 0) {
			globalThis.cancelAnimationFrame(this.ticker);
			this.ticker = 0;
		}
		this.listeners.clear();
		this.audio.destroy();
		if (this.app && this.scene) {
			this.app.world.removeChild(this.scene);
		}
		this.scene?.destroy(renderer);
		this.scene = null;
		this.app = null;
		this.uninstallApi();
	}
}
