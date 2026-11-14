/**
 * melonJS — Comet Survey example: canvas rendering.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Draws the live view (nebula, stars, comet, lock ring), the
 * developing plate while exposing, and the review / end-of-session
 * overlays. Everything is procedural — no image assets.
 */
import {
	type CometSurveyGame,
	LOCK_RADIUS,
	PLATES_NEEDED,
	VIEW_H,
	VIEW_W,
} from "./game";

const nebula = document.createElement("canvas");
nebula.width = VIEW_W;
nebula.height = VIEW_H;

/** Pre-render the deep-space backdrop once (gradient + nebula blobs). */
const buildNebula = () => {
	const ctx = nebula.getContext("2d");
	if (!ctx) {
		return;
	}
	const base = ctx.createLinearGradient(0, 0, 0, VIEW_H);
	base.addColorStop(0, "#050914");
	base.addColorStop(0.6, "#070d1d");
	base.addColorStop(1, "#04060f");
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	const blobs: [number, number, number, string][] = [
		[300, 180, 340, "rgba(60,90,180,0.10)"],
		[950, 480, 420, "rgba(90,60,160,0.09)"],
		[700, 120, 260, "rgba(40,120,160,0.08)"],
		[180, 600, 300, "rgba(120,70,140,0.07)"],
		[1150, 160, 240, "rgba(50,90,170,0.08)"],
	];
	for (const [x, y, r, color] of blobs) {
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, color);
		g.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = g;
		ctx.fillRect(x - r, y - r, r * 2, r * 2);
	}
};
buildNebula();

const drawStars = (
	ctx: CanvasRenderingContext2D,
	game: CometSurveyGame,
	mx: number,
	my: number,
	clock: number,
) => {
	const cx = VIEW_W / 2;
	const cy = VIEW_H / 2;
	for (const [i, star] of game.stars.entries()) {
		const sx = star.x - mx + cx;
		const sy = star.y - my + cy;
		if (sx < -2 || sx >= VIEW_W + 2 || sy < -2 || sy >= VIEW_H + 2) {
			continue;
		}
		const twinkle = 0.72 + 0.28 * Math.sin(clock * 2.6 + i * 1.7);
		const a = Math.min(1, 0.25 + star.mag * 0.4) * twinkle;
		const warm = star.tint > 0.82;
		ctx.fillStyle = warm
			? `rgba(255,224,180,${a.toFixed(3)})`
			: `rgba(200,220,255,${a.toFixed(3)})`;
		const size = star.mag > 1.5 ? 2.2 : star.mag > 0.9 ? 1.6 : 1;
		ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
		if (star.mag > 1.7) {
			ctx.fillStyle = `rgba(220,235,255,${(a * 0.35).toFixed(3)})`;
			ctx.fillRect(sx - 3, sy - 0.5, 6, 1);
			ctx.fillRect(sx - 0.5, sy - 3, 1, 6);
		}
	}
};

const drawComet = (
	ctx: CanvasRenderingContext2D,
	game: CometSurveyGame,
	mx: number,
	my: number,
) => {
	const kx = game.comet.x - mx + VIEW_W / 2;
	const ky = game.comet.y - my + VIEW_H / 2;
	// tail: a soft cone trailing opposite the comet's motion
	const speed = Math.hypot(game.comet.vx, game.comet.vy);
	const tx = -game.comet.vx / speed;
	const ty = -game.comet.vy / speed;
	ctx.save();
	ctx.globalCompositeOperation = "lighter";
	const tailLen = 130;
	const grad = ctx.createLinearGradient(
		kx,
		ky,
		kx + tx * tailLen,
		ky + ty * tailLen,
	);
	grad.addColorStop(0, "rgba(170,240,255,0.5)");
	grad.addColorStop(1, "rgba(170,240,255,0)");
	ctx.strokeStyle = grad;
	ctx.lineCap = "round";
	for (const [width, alpha] of [
		[16, 0.25],
		[8, 0.5],
		[3, 0.9],
	] as const) {
		ctx.globalAlpha = alpha;
		ctx.lineWidth = width;
		ctx.beginPath();
		ctx.moveTo(kx, ky);
		ctx.lineTo(kx + tx * tailLen, ky + ty * tailLen);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
	const glow = ctx.createRadialGradient(kx, ky, 0, kx, ky, 26);
	glow.addColorStop(0, "rgba(230,255,250,0.95)");
	glow.addColorStop(0.25, "rgba(160,240,230,0.55)");
	glow.addColorStop(1, "rgba(160,240,230,0)");
	ctx.fillStyle = glow;
	ctx.fillRect(kx - 26, ky - 26, 52, 52);
	ctx.restore();
};

const drawAimOverlay = (
	ctx: CanvasRenderingContext2D,
	game: CometSurveyGame,
) => {
	// frame center cross
	ctx.strokeStyle = "rgba(140,180,220,0.35)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(VIEW_W / 2 - 14, VIEW_H / 2);
	ctx.lineTo(VIEW_W / 2 + 14, VIEW_H / 2);
	ctx.moveTo(VIEW_W / 2, VIEW_H / 2 - 14);
	ctx.lineTo(VIEW_W / 2, VIEW_H / 2 + 14);
	ctx.stroke();
	// lock ring at the aim cursor
	const locked = game.trackingError <= LOCK_RADIUS;
	const color = locked ? "rgba(120,255,190,0.9)" : "rgba(120,200,255,0.8)";
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.6;
	ctx.beginPath();
	ctx.arc(game.aim.x, game.aim.y, LOCK_RADIUS, 0, Math.PI * 2);
	ctx.stroke();
	for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
		const x1 = game.aim.x + Math.cos(angle) * (LOCK_RADIUS - 7);
		const y1 = game.aim.y + Math.sin(angle) * (LOCK_RADIUS - 7);
		const x2 = game.aim.x + Math.cos(angle) * (LOCK_RADIUS + 7);
		const y2 = game.aim.y + Math.sin(angle) * (LOCK_RADIUS + 7);
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	}
	ctx.fillStyle = locked ? "#7fffbe" : "#8cd2ff";
	ctx.font = "11px 'Courier New', monospace";
	ctx.textAlign = "center";
	ctx.fillText("TARGET", game.aim.x, game.aim.y + LOCK_RADIUS + 22);
};

const drawStamp = (
	ctx: CanvasRenderingContext2D,
	text: string,
	sub: string,
	color: string,
) => {
	ctx.save();
	ctx.translate(VIEW_W / 2, VIEW_H / 2);
	ctx.rotate(-0.06);
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = 3;
	ctx.globalAlpha = 0.92;
	ctx.strokeRect(-190, -54, 380, 108);
	ctx.font = "bold 34px 'Courier New', monospace";
	ctx.textAlign = "center";
	ctx.fillText(text, 0, -6);
	ctx.font = "16px 'Courier New', monospace";
	ctx.fillText(sub, 0, 28);
	ctx.restore();
};

/** Render the current frame to the live-view canvas. */
export const drawFrame = (
	ctx: CanvasRenderingContext2D,
	game: CometSurveyGame,
	clock: number,
) => {
	const m = game.effMount;
	ctx.globalCompositeOperation = "source-over";
	ctx.drawImage(nebula, 0, 0);
	if (game.phase === "review" && game.review) {
		ctx.drawImage(game.plate, 0, 0);
		const r = game.review;
		const stats = `SHARP ${Math.round(r.sharp * 100)}%  ·  SIGNAL ${r.signal.toFixed(1)}s`;
		if (r.status === "accepted") {
			drawStamp(ctx, "PLATE ACCEPTED", stats, "rgba(110,255,180,0.95)");
		} else {
			drawStamp(ctx, "PLATE REJECTED", `${r.reason}  ·  ${stats}`, "#ff7a7a");
		}
		return;
	}
	drawStars(ctx, game, m.x, m.y, clock);
	drawComet(ctx, game, m.x, m.y);
	if (game.phase === "exposing") {
		// the developing plate bleeds through the live view
		ctx.save();
		ctx.globalAlpha = 0.65;
		ctx.globalCompositeOperation = "lighter";
		ctx.drawImage(game.plate, 0, 0);
		ctx.restore();
		ctx.fillStyle = "#ff5a5a";
		ctx.beginPath();
		ctx.arc(26, 26, 6, 0, Math.PI * 2);
		ctx.fill();
		ctx.font = "bold 14px 'Courier New', monospace";
		ctx.textAlign = "left";
		ctx.fillText(
			`REC ${game.exposingElapsed.toFixed(1)} / ${game.exposurePlan.toFixed(1)}s`,
			42,
			31,
		);
	}
	if (game.phase === "aim" || game.phase === "exposing") {
		drawAimOverlay(ctx, game);
	}
	if (game.phase === "success") {
		drawStamp(
			ctx,
			"SURVEY COMPLETE",
			`${PLATES_NEEDED} PLATES ACCEPTED`,
			"rgba(110,255,180,0.95)",
		);
	} else if (game.phase === "failed") {
		drawStamp(ctx, "SESSION FAILED", "OUT OF FILM OR TIME", "#ff7a7a");
	}
};
