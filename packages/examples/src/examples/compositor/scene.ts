/**
 * melonJS — deterministic three-layer compositor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { CanvasRenderTarget, Renderable, type Renderer } from "melonjs";
import {
	type CompositorProject,
	type CompositorTrack,
	getTrack,
	type OffsetValue,
	parseHex,
	sampleProperty,
} from "./project";

const WIDTH = 960;
const HEIGHT = 540;

type DrawLayer = "fog" | "buildings" | "dust";

interface CompositionSource {
	getTime: () => number;
	getProject: () => CompositorProject;
}

interface DustParticle {
	x: number;
	y: number;
	size: number;
	phase: number;
	drift: number;
	speed: number;
	alpha: number;
	twinkle: number;
}

const layerTarget = (width: number, height: number) => {
	return new CanvasRenderTarget(width, height, {
		transparent: true,
		antiAlias: true,
	});
};

const contextOf = (target: CanvasRenderTarget) => {
	const context = target.context;
	if (!context) {
		throw new Error("the compositor canvas context is unavailable");
	}
	return context;
};

const makeRandom = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};

const bakeDustSprite = (): CanvasRenderTarget => {
	const target = layerTarget(64, 64);
	const ctx = contextOf(target);
	const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	glow.addColorStop(0, "rgba(255,255,255,0.98)");
	glow.addColorStop(0.12, "rgba(255,250,238,0.92)");
	glow.addColorStop(0.38, "rgba(255,244,225,0.2)");
	glow.addColorStop(1, "rgba(255,244,225,0)");
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, 64, 64);
	return target;
};

const makeDust = (): DustParticle[] => {
	const random = makeRandom(0xd057);
	return Array.from({ length: 190 }, (_, index) => {
		const near = index < 42;
		return {
			x: random() * WIDTH,
			y: random() * HEIGHT,
			size: near ? 8 + random() * 20 : 2 + random() * 9,
			phase: random() * Math.PI * 2,
			drift: near ? 20 + random() * 40 : 4 + random() * 20,
			speed: 0.15 + random() * 0.55,
			alpha: near ? 0.12 + random() * 0.22 : 0.28 + random() * 0.7,
			twinkle: 0.4 + random() * 2.2,
		};
	});
};

const bakeSkyline = (): CanvasRenderTarget => {
	const target = layerTarget(WIDTH, HEIGHT);
	const ctx = contextOf(target);
	const random = makeRandom(0xb1d5);
	const baseline = HEIGHT * 0.9;

	const far = ctx.createLinearGradient(0, HEIGHT * 0.46, 0, baseline);
	far.addColorStop(0, "rgba(91,118,147,0)");
	far.addColorStop(0.7, "rgba(52,72,94,0.42)");
	far.addColorStop(1, "rgba(24,36,50,0.88)");
	ctx.fillStyle = far;
	ctx.fillRect(0, HEIGHT * 0.46, WIDTH, baseline - HEIGHT * 0.46);

	for (let index = 0; index < 58; index++) {
		const width = 14 + random() * 42;
		const x = (index / 58) * (WIDTH + 80) - 40 + random() * 8;
		const height = 36 + random() ** 1.4 * 168;
		const y = baseline - height - random() * 18;
		ctx.fillStyle = `rgba(33,47,65,${0.24 + random() * 0.26})`;
		ctx.fillRect(x, y, width, height + 24);

		if (random() > 0.45) {
			ctx.fillStyle = `rgba(88,114,139,${0.14 + random() * 0.13})`;
			ctx.fillRect(x + width * 0.16, y + 8, width * 0.68, height * 0.8);
		}
	}

	const ground = ctx.createLinearGradient(0, baseline - 34, 0, HEIGHT);
	ground.addColorStop(0, "rgba(11,18,27,0)");
	ground.addColorStop(0.5, "rgba(8,14,22,0.8)");
	ground.addColorStop(1, "rgba(5,9,15,0.98)");
	ctx.fillStyle = ground;
	ctx.fillRect(0, baseline - 34, WIDTH, HEIGHT - baseline + 34);

	for (let index = 0; index < 34; index++) {
		const width = 22 + random() * 58;
		const x = random() * (WIDTH + 60) - 30;
		const height = 72 + random() ** 1.7 * 235;
		const y = baseline - height;
		const shade = Math.round(13 + random() * 12);
		ctx.fillStyle = `rgb(${shade},${shade + 8},${shade + 15})`;
		ctx.fillRect(x, y, width, height + 30);
		ctx.fillStyle = "rgba(113,136,160,0.07)";
		ctx.fillRect(x + 2, y + 2, Math.max(2, width - 4), height * 0.68);

		if (width > 36 || random() > 0.55) {
			ctx.fillStyle = "rgba(8,12,20,0.86)";
			ctx.fillRect(x + width * 0.68, y - 10, width * 0.18, 10);
		}

		if (random() > 0.75) {
			const antennaX = x + width * (0.2 + random() * 0.6);
			ctx.strokeStyle = "rgba(5,9,15,0.95)";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(antennaX, y);
			ctx.lineTo(antennaX, y - 18 - random() * 42);
			ctx.stroke();
		}

		const columns = Math.max(2, Math.floor(width / 11));
		const rows = Math.max(2, Math.floor(height / 18));
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				if (random() > 0.68) {
					continue;
				}
				const warm = random() > 0.74;
				ctx.fillStyle = warm
					? `rgba(255,199,124,${0.22 + random() * 0.5})`
					: `rgba(122,175,201,${0.12 + random() * 0.28})`;
				ctx.fillRect(x + 4 + column * 10, y + 8 + row * 16, 2.4, 4.5);
			}
		}
	}

	ctx.fillStyle = "rgba(3,6,11,0.96)";
	ctx.beginPath();
	ctx.moveTo(0, baseline + 16);
	for (let x = 0; x <= WIDTH; x += 80) {
		ctx.lineTo(x, baseline + 10 + random() * 10);
	}
	ctx.lineTo(WIDTH, HEIGHT);
	ctx.lineTo(0, HEIGHT);
	ctx.closePath();
	ctx.fill();

	return target;
};

const drawFog = (
	ctx: CanvasRenderingContext2D,
	time: number,
	duration: number,
) => {
	const phase = (time / Math.max(duration, 1)) * Math.PI * 2;
	const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
	sky.addColorStop(0, "#060a14");
	sky.addColorStop(0.38, "#111b2a");
	sky.addColorStop(0.72, "#33404e");
	sky.addColorStop(1, "#78645f");
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	const moonX = WIDTH * 0.73 + Math.sin(phase * 0.5) * 5;
	const moonY = HEIGHT * 0.24;
	const moon = ctx.createRadialGradient(moonX, moonY, 1, moonX, moonY, 108);
	moon.addColorStop(0, "rgba(255,239,211,0.9)");
	moon.addColorStop(0.08, "rgba(255,227,191,0.45)");
	moon.addColorStop(0.3, "rgba(255,210,170,0.13)");
	moon.addColorStop(1, "rgba(255,200,160,0)");
	ctx.fillStyle = moon;
	ctx.fillRect(moonX - 110, moonY - 110, 220, 220);

	ctx.fillStyle = "rgba(255,244,219,0.92)";
	ctx.beginPath();
	ctx.arc(moonX, moonY, 19, 0, Math.PI * 2);
	ctx.fill();

	const haze = [
		{ x: -0.15, y: 0.48, radius: 290, color: "rgba(113,139,160,0.3)" },
		{ x: 0.32, y: 0.62, radius: 260, color: "rgba(149,140,151,0.24)" },
		{ x: 0.82, y: 0.54, radius: 330, color: "rgba(124,145,164,0.24)" },
		{ x: 0.18, y: 0.82, radius: 380, color: "rgba(212,154,127,0.14)" },
		{ x: 0.74, y: 0.78, radius: 300, color: "rgba(186,150,140,0.13)" },
	];
	for (let index = 0; index < haze.length; index++) {
		const blob = haze[index];
		const x =
			WIDTH * blob.x + Math.sin(phase * (0.55 + index * 0.12) + index) * 34;
		const y = HEIGHT * blob.y + Math.cos(phase * 0.7 + index) * 18;
		const fog = ctx.createRadialGradient(x, y, 8, x, y, blob.radius);
		fog.addColorStop(0, blob.color);
		fog.addColorStop(0.55, blob.color.replace(/[\d.]+\)$/, "0.08)"));
		fog.addColorStop(1, "rgba(100,120,140,0)");
		ctx.fillStyle = fog;
		ctx.fillRect(
			x - blob.radius,
			y - blob.radius,
			blob.radius * 2,
			blob.radius * 2,
		);
	}

	const horizon = ctx.createLinearGradient(0, HEIGHT * 0.54, 0, HEIGHT);
	horizon.addColorStop(0, "rgba(245,178,139,0)");
	horizon.addColorStop(0.62, "rgba(218,153,128,0.12)");
	horizon.addColorStop(1, "rgba(52,58,67,0)");
	ctx.fillStyle = horizon;
	ctx.fillRect(0, HEIGHT * 0.54, WIDTH, HEIGHT * 0.46);
};

const drawDust = (
	ctx: CanvasRenderingContext2D,
	sprite: CanvasRenderTarget,
	dust: DustParticle[],
	time: number,
) => {
	const spriteCanvas = sprite.canvas;
	const width = spriteCanvas.width;
	const height = spriteCanvas.height;
	for (const particle of dust) {
		const x =
			(((particle.x +
				time * particle.drift +
				Math.sin(time * particle.speed + particle.phase) * 18) %
				WIDTH) +
				WIDTH) %
			WIDTH;
		const y =
			(((particle.y -
				time * particle.speed * 11 +
				Math.cos(time * particle.speed * 0.7 + particle.phase) * 12) %
				HEIGHT) +
				HEIGHT) %
			HEIGHT;
		const alpha =
			particle.alpha *
			(0.55 + Math.sin(time * particle.twinkle + particle.phase) * 0.45);
		if (alpha <= 0.015) {
			continue;
		}
		ctx.globalAlpha = alpha;
		const size = particle.size;
		ctx.drawImage(
			spriteCanvas,
			0,
			0,
			width,
			height,
			x - size / 2,
			y - size / 2,
			size,
			size,
		);
	}
	ctx.globalAlpha = 1;
};

const drawLayerSource = (
	ctx: CanvasRenderingContext2D,
	layer: DrawLayer,
	time: number,
	project: CompositorProject,
	skyline: CanvasRenderTarget,
	dustSprite: CanvasRenderTarget,
	dust: DustParticle[],
) => {
	if (layer === "fog") {
		drawFog(ctx, time, project.duration);
	} else if (layer === "buildings") {
		ctx.drawImage(skyline.canvas, 0, 0, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
	} else {
		drawDust(ctx, dustSprite, dust, time);
	}
};

export class SceneCompositor extends Renderable {
	private readonly source: CompositionSource;
	private readonly composite = layerTarget(WIDTH, HEIGHT);
	private readonly scratch = layerTarget(WIDTH, HEIGHT);
	private readonly skyline = bakeSkyline();
	private readonly dustSprite = bakeDustSprite();
	private readonly dust = makeDust();

	constructor(source: CompositionSource) {
		super(0, 0, WIDTH, HEIGHT);
		this.source = source;
		this.anchorPoint.set(0, 0);
		this.floating = true;
		this.alwaysUpdate = true;
	}

	private sampleTrackValue(
		track: CompositorTrack,
		property: "offset" | "blur" | "color" | "opacity",
		time: number,
		project: CompositorProject,
	): number | string | OffsetValue {
		return sampleProperty(track, property, time, project.fps, project.duration);
	}

	renderAt(time: number, project: CompositorProject) {
		const composite = contextOf(this.composite);
		const scratch = contextOf(this.scratch);
		composite.setTransform(1, 0, 0, 1, 0, 0);
		composite.globalAlpha = 1;
		composite.globalCompositeOperation = "source-over";
		composite.fillStyle = "#040710";
		composite.fillRect(0, 0, WIDTH, HEIGHT);

		const order: DrawLayer[] = ["fog", "buildings", "dust"];
		for (const layer of order) {
			const track = getTrack(project, layer);
			const offset = this.sampleTrackValue(
				track,
				"offset",
				time,
				project,
			) as OffsetValue;
			const blur = this.sampleTrackValue(
				track,
				"blur",
				time,
				project,
			) as number;
			const color = this.sampleTrackValue(
				track,
				"color",
				time,
				project,
			) as string;
			const opacity = this.sampleTrackValue(
				track,
				"opacity",
				time,
				project,
			) as number;

			scratch.setTransform(1, 0, 0, 1, 0, 0);
			scratch.globalAlpha = 1;
			scratch.globalCompositeOperation = "source-over";
			scratch.clearRect(0, 0, WIDTH, HEIGHT);
			scratch.save();
			scratch.filter = `blur(${Math.max(0, blur).toFixed(2)}px)`;
			scratch.translate(offset.x, offset.y);
			drawLayerSource(
				scratch,
				layer,
				time,
				project,
				this.skyline,
				this.dustSprite,
				this.dust,
			);
			scratch.restore();

			const rgb = parseHex(color);
			scratch.save();
			scratch.globalCompositeOperation = "source-atop";
			scratch.globalAlpha =
				rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255 ? 0 : 0.34;
			scratch.fillStyle = color;
			scratch.fillRect(0, 0, WIDTH, HEIGHT);
			scratch.restore();

			composite.save();
			composite.globalAlpha = Math.min(Math.max(opacity, 0), 1);
			composite.drawImage(
				this.scratch.canvas,
				0,
				0,
				WIDTH,
				HEIGHT,
				0,
				0,
				WIDTH,
				HEIGHT,
			);
			composite.restore();
		}

		const vignette = composite.createRadialGradient(
			WIDTH / 2,
			HEIGHT / 2,
			HEIGHT * 0.24,
			WIDTH / 2,
			HEIGHT / 2,
			HEIGHT * 0.83,
		);
		vignette.addColorStop(0, "rgba(0,0,0,0)");
		vignette.addColorStop(0.72, "rgba(0,0,0,0.08)");
		vignette.addColorStop(1, "rgba(0,0,0,0.58)");
		composite.fillStyle = vignette;
		composite.fillRect(0, 0, WIDTH, HEIGHT);

		const grain = composite.createLinearGradient(0, 0, 0, HEIGHT);
		grain.addColorStop(0, "rgba(77,108,144,0.05)");
		grain.addColorStop(0.5, "rgba(0,0,0,0)");
		grain.addColorStop(1, "rgba(196,127,100,0.04)");
		composite.fillStyle = grain;
		composite.fillRect(0, 0, WIDTH, HEIGHT);
	}

	capture(): Promise<Blob> {
		const project = this.source.getProject();
		this.renderAt(this.source.getTime(), project);
		return this.composite.toBlob("image/png");
	}

	getPreviewCanvas(): HTMLCanvasElement {
		return this.composite.canvas as HTMLCanvasElement;
	}

	override update(): boolean {
		return true;
	}

	override draw(renderer: Renderer) {
		const project = this.source.getProject();
		this.renderAt(this.source.getTime(), project);
		this.composite.invalidate(renderer);
		renderer.drawImage(
			this.getPreviewCanvas(),
			0,
			0,
			WIDTH,
			HEIGHT,
			0,
			0,
			WIDTH,
			HEIGHT,
		);
	}

	destroy(renderer?: Renderer) {
		this.composite.destroy(renderer);
		this.scratch.destroy(renderer);
		this.skyline.destroy(renderer);
		this.dustSprite.destroy(renderer);
		super.destroy();
	}
}
