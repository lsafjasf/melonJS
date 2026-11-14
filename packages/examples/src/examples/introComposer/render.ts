/**
 * melonJS — procedural intro composer: canvas rendering.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	HEIGHT,
	hexToRgba,
	type Layer,
	type LayerSample,
	type Project,
	sampleLayer,
	WIDTH,
} from "./model";

const TAU = Math.PI * 2;

const rgba = (hex: string, alpha: number): string => {
	const [r, g, b] = hexToRgba(hex);
	return `rgba(${r},${g},${b},${alpha})`;
};

const hash = (n: number): number => {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};

const withLayer = (
	ctx: CanvasRenderingContext2D,
	layer: Layer,
	sample: LayerSample,
	draw: () => void,
) => {
	if (!layer.visible || sample.opacity <= 0) {
		return;
	}
	ctx.save();
	ctx.globalAlpha = sample.opacity;
	ctx.translate(WIDTH / 2 + sample.position.x, HEIGHT / 2 + sample.position.y);
	ctx.scale(sample.scale, sample.scale);
	ctx.translate(-WIDTH / 2, -HEIGHT / 2);
	draw();
	ctx.restore();
};

const drawBackdrop = (ctx: CanvasRenderingContext2D) => {
	const wash = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
	wash.addColorStop(0, "#03080a");
	wash.addColorStop(0.5, "#071317");
	wash.addColorStop(1, "#020708");
	ctx.fillStyle = wash;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	ctx.fillStyle = "rgba(12, 33, 35, 0.45)";
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
};

const drawRippleLayer = (
	ctx: CanvasRenderingContext2D,
	sample: LayerSample,
	time: number,
) => {
	const tint = sample.color;
	const cx = WIDTH * 0.5;
	const cy = HEIGHT * 0.56;
	const pulse = Math.sin(time * 1.3) * 5;

	const bloom = ctx.createRadialGradient(cx, cy, 8, cx, cy, 470);
	bloom.addColorStop(0, rgba(tint, 0.34));
	bloom.addColorStop(0.28, rgba(tint, 0.16));
	bloom.addColorStop(0.65, rgba(tint, 0.035));
	bloom.addColorStop(1, rgba(tint, 0));
	ctx.fillStyle = bloom;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	for (let i = 0; i < 86; i++) {
		const drift = (time * (3 + hash(i + 4) * 8) + hash(i) * WIDTH) % WIDTH;
		const x = drift;
		const y = 36 + hash(i + 17) * (HEIGHT - 84);
		const radius = 0.35 + hash(i + 29) * 1.35;
		ctx.fillStyle = rgba(tint, 0.12 + hash(i + 41) * 0.28);
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, TAU);
		ctx.fill();
	}

	ctx.save();
	ctx.translate(cx, cy);
	ctx.globalCompositeOperation = "screen";
	for (let ring = 0; ring < 31; ring++) {
		const period = 2.1 + (ring % 7) * 0.14;
		const phase = (time / period + ring * 0.047) % 1;
		const base = 34 + ring * 16 + pulse;
		const grow = phase * 10;
		const alpha = (1 - phase) * (0.06 + (ring % 5) * 0.012);
		ctx.beginPath();
		for (let step = 0; step <= 120; step++) {
			const angle = (step / 120) * TAU;
			const wobble =
				1 +
				Math.sin(angle * 3 + time * 0.9 + ring * 0.36) * 0.018 +
				Math.sin(angle * 7 - time * 0.55 + ring * 0.11) * 0.008;
			const radius = (base + grow) * wobble;
			const x = Math.cos(angle) * radius * 1.7;
			const y = Math.sin(angle) * radius * 0.67;
			if (step === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.closePath();
		ctx.strokeStyle = rgba(tint, alpha);
		ctx.lineWidth = ring === 0 ? 1.2 : 0.75;
		ctx.stroke();
	}
	ctx.restore();

	const horizon = ctx.createLinearGradient(0, cy - 4, 0, cy + 20);
	horizon.addColorStop(0, rgba(tint, 0));
	horizon.addColorStop(0.5, rgba(tint, 0.16));
	horizon.addColorStop(1, rgba(tint, 0));
	ctx.fillStyle = horizon;
	ctx.fillRect(0, cy - 4, WIDTH, 24);
};

const spacedText = (
	ctx: CanvasRenderingContext2D,
	text: string,
	centerX: number,
	y: number,
	spacing: number,
) => {
	const chars = [...text];
	const widths = chars.map((char) => ctx.measureText(char).width);
	const total =
		widths.reduce((sum, width) => sum + width, 0) +
		Math.max(0, chars.length - 1) * spacing;
	let x = centerX - total / 2;
	ctx.textAlign = "left";
	for (let i = 0; i < chars.length; i++) {
		ctx.fillText(chars[i], x, y);
		x += widths[i] + spacing;
	}
};

const drawTitleLayer = (
	ctx: CanvasRenderingContext2D,
	sample: LayerSample,
	project: Project,
	time: number,
) => {
	const cx = WIDTH / 2;
	const title = project.title.trim() || "UNTITLED";
	const intro = Math.min(1, Math.max(0, (time - 0.6) / 2.8));
	const lettering = 0.985 + intro * 0.015;
	const glow = sample.color;

	ctx.save();
	ctx.translate(cx, HEIGHT * 0.47);
	ctx.scale(lettering, lettering);
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = '900 168px "Arial Black", "Helvetica Neue", sans-serif';
	const measured = ctx.measureText(title).width;
	if (measured > 930) {
		ctx.scale(930 / measured, 930 / measured);
	}

	ctx.globalCompositeOperation = "screen";
	ctx.shadowColor = rgba(glow, 0.78);
	ctx.shadowBlur = 34 + Math.sin(time * 1.7) * 5;
	ctx.fillStyle = rgba(glow, 0.35);
	ctx.fillText(title, 0, 0);
	ctx.shadowBlur = 74;
	ctx.fillStyle = rgba(glow, 0.16);
	ctx.fillText(title, 0, 0);

	ctx.globalCompositeOperation = "source-over";
	const face = ctx.createLinearGradient(0, -90, 0, 94);
	face.addColorStop(0, "#ffffff");
	face.addColorStop(0.42, "#effff9");
	face.addColorStop(0.56, rgba(glow, 1));
	face.addColorStop(1, "#cdfff0");
	ctx.shadowColor = rgba(glow, 0.55);
	ctx.shadowBlur = 16;
	ctx.fillStyle = face;
	ctx.fillText(title, 0, 0);
	ctx.lineWidth = 1;
	ctx.strokeStyle = rgba(glow, 0.75);
	ctx.strokeText(title, 0, 0);

	ctx.shadowBlur = 0;
	ctx.font = '500 16px "Courier New", monospace';
	ctx.fillStyle = "rgba(232, 255, 248, 0.9)";
	spacedText(ctx, project.subtitle.toUpperCase(), 0, 132, 3.6);

	ctx.fillStyle = rgba(glow, 0.86);
	ctx.fillRect(-230, 106, 84, 1);
	ctx.fillRect(146, 106, 84, 1);
	ctx.beginPath();
	ctx.arc(-243, 106.5, 2.6, 0, TAU);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(243, 106.5, 2.6, 0, TAU);
	ctx.fill();

	ctx.font = '600 10px "Courier New", monospace';
	ctx.fillStyle = rgba(glow, 0.72);
	spacedText(ctx, "A MELONJS MOTION STUDY", 0, -142, 4.5);
	ctx.restore();
};

const drawLightLayer = (
	ctx: CanvasRenderingContext2D,
	sample: LayerSample,
	time: number,
) => {
	const tint = sample.color;
	const sweep = Math.sin(time * 0.8) * 20;
	ctx.save();
	ctx.translate(WIDTH / 2, HEIGHT / 2);
	ctx.rotate(-0.29);
	ctx.globalCompositeOperation = "screen";

	for (let band = 0; band < 3; band++) {
		const y = -190 + band * 168 + sweep;
		const h = band === 1 ? 20 : 8;
		const shift = Math.sin(time * 1.1 + band * 1.7) * 28;
		const grad = ctx.createLinearGradient(-680, 0, 680, 0);
		grad.addColorStop(0, rgba(tint, 0));
		grad.addColorStop(0.19, rgba(tint, 0.02));
		grad.addColorStop(0.43, rgba(tint, 0.24));
		grad.addColorStop(0.5, "rgba(255,255,255,0.72)");
		grad.addColorStop(0.57, rgba(tint, 0.22));
		grad.addColorStop(0.82, rgba(tint, 0.03));
		grad.addColorStop(1, rgba(tint, 0));
		ctx.fillStyle = grad;
		ctx.shadowColor = rgba(tint, 0.6);
		ctx.shadowBlur = 28 + band * 8;
		ctx.beginPath();
		ctx.roundRect(-690 + shift, y, 1380, h, h / 2);
		ctx.fill();
	}

	for (let i = 0; i < 15; i++) {
		const x = -560 + hash(i + 8) * 1120;
		const y = -240 + hash(i + 31) * 480;
		const flicker = 0.22 + Math.max(0, Math.sin(time * 2.2 + i)) * 0.58;
		ctx.fillStyle = rgba(tint, flicker * 0.35);
		ctx.beginPath();
		ctx.arc(x, y, 1 + hash(i + 51) * 2.5, 0, TAU);
		ctx.fill();
	}
	ctx.restore();
};

const drawGrade = (ctx: CanvasRenderingContext2D, time: number) => {
	ctx.save();
	ctx.globalCompositeOperation = "multiply";
	const vignette = ctx.createRadialGradient(
		WIDTH / 2,
		HEIGHT / 2,
		230,
		WIDTH / 2,
		HEIGHT / 2,
		760,
	);
	vignette.addColorStop(0, "rgba(255,255,255,1)");
	vignette.addColorStop(0.72, "rgba(190,205,203,0.92)");
	vignette.addColorStop(1, "rgba(0,0,0,0.6)");
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	ctx.restore();

	ctx.save();
	ctx.globalAlpha = 0.03;
	ctx.fillStyle = "#b7ffe9";
	for (let y = 0; y < HEIGHT; y += 4) {
		ctx.fillRect(0, y, WIDTH, 1);
	}
	ctx.globalAlpha = 0.018;
	const scanY = (time * 42) % HEIGHT;
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, scanY, WIDTH, 66);
	ctx.restore();
};

export const drawFrame = (
	ctx: CanvasRenderingContext2D,
	project: Project,
	time: number,
) => {
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = "source-over";
	ctx.clearRect(0, 0, WIDTH, HEIGHT);
	drawBackdrop(ctx);

	const byId = new Map(project.layers.map((layer) => [layer.id, layer]));
	const ripple = byId.get("ripple");
	const title = byId.get("title");
	const light = byId.get("light");
	if (ripple) {
		const sample = sampleLayer(ripple, time);
		withLayer(ctx, ripple, sample, () => {
			drawRippleLayer(ctx, sample, time);
		});
	}
	if (title) {
		const sample = sampleLayer(title, time);
		withLayer(ctx, title, sample, () => {
			drawTitleLayer(ctx, sample, project, time);
		});
	}
	if (light) {
		const sample = sampleLayer(light, time);
		withLayer(ctx, light, sample, () => {
			drawLightLayer(ctx, sample, time);
		});
	}
	drawGrade(ctx, time);
	ctx.restore();
};
