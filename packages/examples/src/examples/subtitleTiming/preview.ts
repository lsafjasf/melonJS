import type { Renderer } from "melonjs";
import { Application, Renderable, Stage, state } from "melonjs";
import { TRACK_DURATION_MS } from "./webvtt";

export const previewState = {
	timeMs: 0,
	activeCueCount: 1,
	overlapCount: 0,
	cueCount: 6,
};

type Rgb = [number, number, number];

const SKY: { at: number; color: Rgb }[] = [
	{ at: 0, color: [18, 28, 58] },
	{ at: 0.2, color: [65, 110, 165] },
	{ at: 0.48, color: [232, 154, 82] },
	{ at: 0.72, color: [104, 54, 105] },
	{ at: 1, color: [9, 12, 29] },
];

const clamp = (value: number, min: number, max: number) => {
	return Math.min(max, Math.max(min, value));
};

const hash = (value: number) => {
	const noise = Math.sin(value * 127.1 + 311.7) * 43_758.5453;
	return noise - Math.floor(noise);
};

const rgb = (color: Rgb) => {
	return `rgb(${color[0] | 0}, ${color[1] | 0}, ${color[2] | 0})`;
};

const skyColor = (progress: number): Rgb => {
	const first = SKY[0] as { at: number; color: Rgb };
	let before = first;
	let after = first;
	for (const key of SKY) {
		if (key.at <= progress) {
			before = key;
		}
		if (key.at >= progress) {
			after = key;
			break;
		}
	}
	const span = Math.max(0.0001, after.at - before.at);
	const mix = clamp((progress - before.at) / span, 0, 1);
	return [
		before.color[0] + (after.color[0] - before.color[0]) * mix,
		before.color[1] + (after.color[1] - before.color[1]) * mix,
		before.color[2] + (after.color[2] - before.color[2]) * mix,
	];
};

const drawSky = (
	renderer: Renderer,
	width: number,
	height: number,
	progress: number,
) => {
	const bands = 16;
	for (let band = 0; band < bands; band++) {
		const mix = band / (bands - 1);
		const upper = skyColor(progress);
		const lower = skyColor(Math.min(1, progress + 0.12));
		renderer.setColor(
			rgb([
				upper[0] + (lower[0] - upper[0]) * mix * 0.45,
				upper[1] + (lower[1] - upper[1]) * mix * 0.45,
				upper[2] + (lower[2] - upper[2]) * mix * 0.45,
			]),
		);
		renderer.fillRect(
			0,
			Math.floor((band * height) / bands),
			width,
			Math.ceil(height / bands) + 1,
		);
	}
};

const drawStars = (
	renderer: Renderer,
	width: number,
	height: number,
	progress: number,
	timeSeconds: number,
) => {
	const opacity = clamp((progress - 0.58) / 0.28, 0, 1);
	if (opacity <= 0) {
		return;
	}
	renderer.setColor("#fff6d8");
	for (let index = 0; index < 84; index++) {
		const x = hash(index + 2.4) * width;
		const y = hash(index + 81.8) * height * 0.56;
		const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(timeSeconds * 1.4 + index));
		const size = 1 + hash(index + 40.1) * 2.2;
		renderer.setGlobalAlpha(opacity * twinkle * 0.9);
		renderer.fillRect(x, y, size, size);
	}
	renderer.setGlobalAlpha(1);
};

const drawSun = (
	renderer: Renderer,
	width: number,
	height: number,
	progress: number,
) => {
	const x = width * (0.12 + progress * 0.76);
	const y = height * 0.68 - Math.sin(progress * Math.PI) * height * 0.42;
	const dusk = clamp((progress - 0.45) / 0.35, 0, 1);
	const core: Rgb = [255 - dusk * 52, 224 - dusk * 106, 143 - dusk * 36];

	for (let ring = 5; ring >= 1; ring--) {
		renderer.setGlobalAlpha(0.025 + (5 - ring) * 0.015);
		renderer.setColor(rgb(core));
		renderer.fillEllipse(x, y, 30 + ring * 24, 30 + ring * 24);
	}
	renderer.setGlobalAlpha(1);
	renderer.setColor(rgb(core));
	renderer.fillEllipse(x, y, 34, 34);
	renderer.setGlobalAlpha(0.34);
	renderer.setColor("#fff8d6");
	renderer.fillEllipse(x - 8, y - 9, 12, 12);
	renderer.setGlobalAlpha(1);
};

const drawSkyline = (
	renderer: Renderer,
	width: number,
	height: number,
	timeSeconds: number,
) => {
	const horizon = height * 0.79;
	const offset = (timeSeconds * 5) % 90;
	renderer.setColor("#11182c");
	for (let index = -2; index < 24; index++) {
		const baseX = index * 72 - offset;
		const buildingWidth = 34 + hash(index + 5.2) * 34;
		const buildingHeight = 34 + hash(index + 18.7) * 116;
		renderer.fillRect(
			baseX,
			horizon - buildingHeight,
			buildingWidth,
			buildingHeight,
		);
		renderer.setGlobalAlpha(0.42);
		renderer.setColor("#ffd27a");
		for (let windowIndex = 0; windowIndex < 4; windowIndex++) {
			if (hash(index * 7 + windowIndex) > 0.46) {
				renderer.fillRect(
					baseX + 8 + (windowIndex % 2) * 14,
					horizon - buildingHeight + 12 + Math.floor(windowIndex / 2) * 16,
					4,
					6,
				);
			}
		}
		renderer.setGlobalAlpha(1);
		renderer.setColor("#11182c");
	}
	renderer.fillRect(0, horizon, width, height - horizon);
	renderer.setColor("#0b1120");
	renderer.fillRect(0, height * 0.88, width, height * 0.12);
};

const drawPlane = (
	renderer: Renderer,
	width: number,
	height: number,
	timeSeconds: number,
) => {
	const cycle = (timeSeconds % 10) / 10;
	const x = width * (0.08 + cycle * 0.84);
	const y =
		height * (0.3 + Math.sin(cycle * Math.PI) * 0.15) +
		Math.sin(timeSeconds * 1.3) * 7;
	renderer.setColor("#f7f2e8");
	renderer.lineWidth = 2;
	renderer.strokeLine(x - 14, y, x + 11, y - 7);
	renderer.strokeLine(x + 11, y - 7, x + 2, y + 7);
	renderer.strokeLine(x + 2, y + 7, x - 5, y + 2);
	renderer.strokeLine(x - 5, y + 2, x - 14, y);
	renderer.strokeLine(x + 11, y - 7, x + 2, y + 7);
	renderer.setGlobalAlpha(0.28);
	renderer.setColor("#fff7df");
	renderer.strokeLine(x - 13, y + 11, x + 4, y + 18);
	renderer.setGlobalAlpha(1);
};

const drawProjector = (
	renderer: Renderer,
	width: number,
	height: number,
	timeSeconds: number,
) => {
	const centerX = width * 0.5;
	const centerY = height * 0.5;
	const radius = Math.min(width, height) * 0.12;
	const active = previewState.activeCueCount > 0;
	const pulse = active
		? 0.55 + 0.45 * Math.sin(previewState.timeMs / 115)
		: 0.18;

	if (active) {
		for (let ring = 3; ring >= 1; ring--) {
			renderer.setGlobalAlpha(0.04 + pulse * 0.035 * ring);
			renderer.setColor("#ffd166");
			renderer.fillEllipse(
				centerX,
				centerY,
				radius + ring * 24 + pulse * 9,
				radius + ring * 24 + pulse * 9,
			);
		}
	}

	renderer.setGlobalAlpha(0.9);
	renderer.setColor("#111421");
	renderer.fillEllipse(centerX, centerY, radius + 22, radius + 22);
	renderer.setColor(active ? "#d8a844" : "#66708d");
	renderer.lineWidth = 3;
	renderer.strokeEllipse(centerX, centerY, radius + 19, radius + 19);
	renderer.lineWidth = 2;
	renderer.strokeEllipse(centerX, centerY, radius - 5, radius - 5);
	const angle = timeSeconds * 0.85;
	for (let spoke = 0; spoke < 8; spoke++) {
		const direction = angle + (spoke * Math.PI) / 4;
		renderer.strokeLine(
			centerX + Math.cos(direction) * 12,
			centerY + Math.sin(direction) * 12,
			centerX + Math.cos(direction) * (radius - 8),
			centerY + Math.sin(direction) * (radius - 8),
		);
	}
	renderer.setColor(active ? "#ffe29a" : "#a8b0c6");
	renderer.fillEllipse(centerX, centerY, 10, 10);
	renderer.setGlobalAlpha(1);
};

class SceneView extends Renderable {
	constructor() {
		super(0, 0, 960, 540);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override update() {
		return true;
	}

	override draw(renderer: Renderer) {
		const width = renderer.width;
		const height = renderer.height;
		const timeMs = clamp(previewState.timeMs, 0, TRACK_DURATION_MS);
		const progress = timeMs / TRACK_DURATION_MS;
		const timeSeconds = timeMs / 1_000;

		drawSky(renderer, width, height, progress);
		drawStars(renderer, width, height, progress, timeSeconds);
		drawSun(renderer, width, height, progress);
		drawSkyline(renderer, width, height, timeSeconds);
		drawProjector(renderer, width, height, timeSeconds);
		drawPlane(renderer, width, height, timeSeconds);

		renderer.setGlobalAlpha(0.22);
		renderer.setColor("#02050d");
		renderer.fillRect(0, height - 18, width, 18);
		renderer.setGlobalAlpha(1);
		renderer.setColor("#ffd166");
		renderer.fillRect(0, height - 4, width * progress, 4);
		renderer.setColor("#fff4cf");
		renderer.fillEllipse(width * progress, height - 2, 5, 5);

		if (previewState.overlapCount > 0) {
			renderer.setGlobalAlpha(0.72);
			renderer.setColor("#ff3b5f");
			renderer.fillRect(0, 0, width, 5);
			renderer.setGlobalAlpha(1);
		}
	}
}

const PREVIEW_STATE = state.USER + 93;

class SubtitlePreviewStage extends Stage {
	override onResetEvent(app: Application) {
		app.world.addChild(new SceneView(), 0);
	}
}

export const createSubtitlePreview = async () => {
	const app = new Application(960, 540, {
		parent: "screen",
		scale: "auto",
		scaleMethod: "flex",
		antiAlias: true,
		backgroundColor: "#090d18",
	});
	await app.init();
	state.set(PREVIEW_STATE, new SubtitlePreviewStage());
	state.change(PREVIEW_STATE);
};
