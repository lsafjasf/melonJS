/**
 * melonJS — 2.5D pop-up book editor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	applyKeyframe,
	createDefaultProject,
	parseProject,
	recordKeyframe,
	sampleProject,
} from "./project";
import {
	type BookProject,
	LAYER_IDS,
	type LayerId,
	LIGHT_PRESETS,
	type LightPresetId,
	type SampledPose,
} from "./types";

export type LayerField = "depth" | "offsetX" | "blur" | "shadow";

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export class BookEditor {
	project: BookProject = createDefaultProject();
	playing = false;
	playhead = 0;
	selectedFrame = 0;
	parallaxX = 0;
	parallaxY = 0;
	notice = "";

	private revision = 0;
	private listeners = new Set<() => void>();
	private noticeTimer: number | undefined;
	private lastUiNotify = 0;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	getRevision = () => this.revision;

	private emit = () => {
		this.revision++;
		for (const listener of this.listeners) {
			listener();
		}
	};

	getPose = (): SampledPose => {
		if (this.playing) {
			return sampleProject(this.project, this.playhead);
		}
		return {
			lightX: this.project.light.x,
			lightY: this.project.light.y,
			offsets: {
				mountains: this.project.layers.mountains.offsetX,
				clouds: this.project.layers.clouds.offsetX,
				trees: this.project.layers.trees.offsetX,
				character: this.project.layers.character.offsetX,
			},
		};
	};

	tick = (deltaMs: number) => {
		if (!this.playing) {
			return;
		}
		this.playhead += deltaMs / 1000;
		if (this.playhead >= this.project.duration) {
			this.playhead %= this.project.duration;
		}
		const now = performance.now();
		if (now - this.lastUiNotify >= 80) {
			this.lastUiNotify = now;
			this.emit();
		}
	};

	togglePlay = () => {
		this.playing = !this.playing;
		if (this.playing && this.playhead >= this.project.duration) {
			this.playhead = 0;
		}
		this.emit();
	};

	pauseAtCurrent = () => {
		if (!this.playing) {
			return false;
		}
		const pose = this.getPose();
		this.playing = false;
		this.project.light.x = pose.lightX;
		this.project.light.y = pose.lightY;
		for (const id of LAYER_IDS) {
			this.project.layers[id].offsetX = pose.offsets[id];
		}
		recordKeyframe(this.project, this.selectedFrame);
		this.emit();
		return true;
	};

	selectFrame = (index: number) => {
		this.playing = false;
		this.selectedFrame = clamp(
			Math.round(index),
			0,
			this.project.keyframes.length - 1,
		);
		const frame = this.project.keyframes[this.selectedFrame];
		this.playhead = frame.time;
		applyKeyframe(this.project, this.selectedFrame);
		this.emit();
	};

	recordFrame = (showNotice = true) => {
		recordKeyframe(this.project, this.selectedFrame);
		if (showNotice) {
			this.setNotice(`Keyframe ${this.selectedFrame + 1} recorded`);
		} else {
			this.emit();
		}
	};

	setLayerSetting = (id: LayerId, field: LayerField, value: number) => {
		const layer = this.project.layers[id];
		switch (field) {
			case "depth":
				layer.depth = clamp(value, 0.05, 1.8);
				break;
			case "offsetX":
				layer.offsetX = clamp(value, -120, 120);
				recordKeyframe(this.project, this.selectedFrame);
				break;
			case "blur":
				layer.blur = clamp(value, 0, 12);
				break;
			case "shadow":
				layer.shadow = clamp(value, 0, 1);
				break;
		}
		this.emit();
	};

	setLightPosition = (x: number, y: number) => {
		this.project.light.x = clamp(x, 140, 1060);
		this.project.light.y = clamp(y, 170, 520);
		recordKeyframe(this.project, this.selectedFrame);
		this.emit();
	};

	setLightIntensity = (value: number) => {
		this.project.light.intensity = clamp(value, 0.2, 1.5);
		this.emit();
	};

	setLightPreset = (preset: LightPresetId) => {
		const data = LIGHT_PRESETS[preset];
		this.project.light.preset = preset;
		this.project.light.color = data.color;
		this.project.light.glow = data.glow;
		this.emit();
	};

	setParallax = (x: number, y: number) => {
		this.parallaxX = clamp(x, -100, 100);
		this.parallaxY = clamp(y, -54, 54);
		this.emit();
	};

	resetParallax = () => {
		this.parallaxX = 0;
		this.parallaxY = 0;
		this.setNotice("Parallax preview reset");
	};

	loadProjectJson = (text: string) => {
		const parsed = parseProject(JSON.parse(text) as unknown);
		this.project = parsed;
		this.playing = false;
		this.playhead = parsed.keyframes[0].time;
		this.selectedFrame = 0;
		this.parallaxX = 0;
		this.parallaxY = 0;
		this.setNotice(`Loaded "${parsed.title}"`);
	};

	serialize = () => JSON.stringify(this.project, null, 2);

	setNotice = (message: string) => {
		this.notice = message;
		if (this.noticeTimer !== undefined) {
			window.clearTimeout(this.noticeTimer);
		}
		this.noticeTimer = window.setTimeout(() => {
			this.notice = "";
			this.noticeTimer = undefined;
			this.emit();
		}, 2600);
		this.emit();
	};

	dispose = () => {
		if (this.noticeTimer !== undefined) {
			window.clearTimeout(this.noticeTimer);
			this.noticeTimer = undefined;
		}
		this.listeners.clear();
	};
}
