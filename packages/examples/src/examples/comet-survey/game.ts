/**
 * melonJS — Comet Survey example: simulation core.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A night-sky photography session: the sky drifts, the comet moves
 * against the stars, and the equatorial mount chases the player's aim
 * with a limited slew rate plus a small periodic tracking error.
 * During an exposure the comet's smear across the frame is tracked —
 * too much smear and the plate shows star trails, too short an
 * exposure and the comet never registers on the film.
 */
import type { SurveyAudio } from "./audio";

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const FILM_TOTAL = 5;
export const PLATES_NEEDED = 3;
export const SESSION_SECONDS = 75;
export const SIGNAL_THRESHOLD = 3;
export const EXPOSURE_MIN = 1;
export const EXPOSURE_MAX = 8;
export const LOCK_RADIUS = 28;
/** Frame spread (px) at which a plate is considered fully trailed. */
const SPREAD_BUDGET = 60;
const SLEW_RATE = 320;
const REVIEW_SECONDS = 2.8;

export type Phase = "aim" | "exposing" | "review" | "success" | "failed";

export interface Star {
	x: number;
	y: number;
	mag: number;
	tint: number;
}

export interface PlateResult {
	index: number;
	status: "accepted" | "rejected";
	/** 0..1, 1 = perfectly sharp */
	sharp: number;
	/** effective exposure seconds */
	signal: number;
	reason: "STAR TRAIL" | "UNDEREXPOSED" | "STAR TRAIL + UNDEREXPOSED" | null;
}

export interface HudState {
	phase: Phase;
	timeLeft: number;
	filmLeft: number;
	exposurePlan: number;
	error: number;
	locked: boolean;
	trailPct: number;
	exposingElapsed: number;
	plates: (PlateResult | null)[];
	accepted: number;
	review: PlateResult | null;
}

/** Deterministic PRNG so every session (and every test run) sees the same sky. */
const mulberry32 = (seed: number) => {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

export class CometSurveyGame {
	readonly stars: Star[] = [];
	readonly comet = { x: 0, y: 0, vx: 26, vy: -9 };
	/** Frame center in world coordinates (the mount's pointing). */
	readonly mount = { x: -150, y: 60 };
	/** Where the player wants the frame center, in world coordinates. */
	readonly target = { x: -150, y: 60 };
	/** Aim cursor in view (canvas) coordinates. */
	readonly aim = { x: VIEW_W / 2, y: VIEW_H / 2 };
	phase: Phase = "aim";
	timeLeft = SESSION_SECONDS;
	exposurePlan = 4.5;
	exposingElapsed = 0;
	/** Smear of the comet across the plate: spread of its frame position. */
	spread = 0;
	plates: (PlateResult | null)[] = Array.from(
		{ length: FILM_TOTAL },
		() => null,
	);
	review: PlateResult | null = null;
	/** Offscreen plate the current exposure accumulates onto. */
	readonly plate: HTMLCanvasElement;
	private readonly plateCtx: CanvasRenderingContext2D;
	private clock = 0;
	private reviewTimer = 0;
	private relMinX = 0;
	private relMaxX = 0;
	private relMinY = 0;
	private relMaxY = 0;
	private endAfterReview: Phase | null = null;

	constructor(private readonly audio: SurveyAudio) {
		const rand = mulberry32(20261114);
		for (let i = 0; i < 460; i++) {
			this.stars.push({
				x: (rand() - 0.5) * 5200,
				y: (rand() - 0.5) * 3600,
				mag: 0.35 + rand() * rand() * 1.9,
				tint: rand(),
			});
		}
		this.plate = document.createElement("canvas");
		this.plate.width = VIEW_W;
		this.plate.height = VIEW_H;
		const ctx = this.plate.getContext("2d");
		if (!ctx) {
			throw new Error("2d context unavailable");
		}
		this.plateCtx = ctx;
	}

	/** Effective mount position including the periodic tracking error. */
	get effMount() {
		const t = this.clock;
		return {
			x: this.mount.x + 0.7 * Math.sin(t * 1.9) + 0.4 * Math.sin(t * 4.3 + 1.7),
			y: this.mount.y + 0.6 * Math.cos(t * 1.6) + 0.4 * Math.sin(t * 3.7),
		};
	}

	get trackingError() {
		const m = this.effMount;
		return Math.hypot(this.comet.x - m.x, this.comet.y - m.y);
	}

	get acceptedCount() {
		return this.plates.filter((p) => p?.status === "accepted").length;
	}

	get filmLeft() {
		return this.plates.filter((p) => p === null).length;
	}

	/** Move the aim cursor; canvas coordinates. */
	setAim(x: number, y: number) {
		this.aim.x = x;
		this.aim.y = y;
		const m = this.effMount;
		this.target.x = m.x + (x - VIEW_W / 2);
		this.target.y = m.y + (y - VIEW_H / 2);
	}

	adjustExposure(direction: number) {
		if (this.phase === "exposing") {
			return;
		}
		const next = this.exposurePlan + (direction < 0 ? 0.5 : -0.5);
		this.exposurePlan = Math.min(
			EXPOSURE_MAX,
			Math.max(EXPOSURE_MIN, Math.round(next * 2) / 2),
		);
	}

	/** Space bar: start the exposure, stop it early, or skip the review. */
	pressShutter() {
		if (this.phase === "aim" && this.filmLeft > 0 && this.timeLeft > 0) {
			this.phase = "exposing";
			this.exposingElapsed = 0;
			this.spread = 0;
			const rel = this.relToComet();
			this.relMinX = rel.x;
			this.relMaxX = rel.x;
			this.relMinY = rel.y;
			this.relMaxY = rel.y;
			this.plateCtx.globalCompositeOperation = "source-over";
			this.plateCtx.fillStyle = "#02040a";
			this.plateCtx.fillRect(0, 0, VIEW_W, VIEW_H);
			this.audio.shutter();
		} else if (this.phase === "exposing" && this.exposingElapsed >= 0.4) {
			this.finishExposure();
		} else if (this.phase === "review") {
			this.leaveReview();
		}
	}

	private relToComet() {
		const m = this.effMount;
		return { x: this.comet.x - m.x, y: this.comet.y - m.y };
	}

	update(dtMs: number) {
		const dt = Math.min(dtMs, 100) / 1000;
		this.clock += dt;
		if (
			this.phase === "aim" ||
			this.phase === "exposing" ||
			this.phase === "review"
		) {
			this.timeLeft = Math.max(0, this.timeLeft - dt);
			if (this.timeLeft === 0 && this.phase !== "exposing") {
				this.phase = this.acceptedCount >= PLATES_NEEDED ? "success" : "failed";
				return;
			}
		}
		this.comet.x += this.comet.vx * dt;
		this.comet.y += this.comet.vy * dt;
		// slew the mount toward the player's target at a limited rate
		const dx = this.target.x - this.mount.x;
		const dy = this.target.y - this.mount.y;
		const dist = Math.hypot(dx, dy);
		const step = SLEW_RATE * dt;
		if (dist > 0.01) {
			const k = Math.min(1, step / dist);
			this.mount.x += dx * k;
			this.mount.y += dy * k;
		}
		this.audio.setMotor(Math.min(1, dist / 120));

		if (this.phase === "exposing") {
			this.exposingElapsed += dt;
			const rel = this.relToComet();
			this.relMinX = Math.min(this.relMinX, rel.x);
			this.relMaxX = Math.max(this.relMaxX, rel.x);
			this.relMinY = Math.min(this.relMinY, rel.y);
			this.relMaxY = Math.max(this.relMaxY, rel.y);
			this.spread = Math.hypot(
				this.relMaxX - this.relMinX,
				this.relMaxY - this.relMinY,
			);
			this.accumulate();
			if (this.exposingElapsed >= this.exposurePlan) {
				this.finishExposure();
			}
		} else if (this.phase === "review") {
			this.reviewTimer -= dt;
			if (this.reviewTimer <= 0) {
				this.leaveReview();
			}
		}
	}

	/** Integrate one frame of light onto the plate (additive). */
	private accumulate() {
		const ctx = this.plateCtx;
		const m = this.effMount;
		const cx = VIEW_W / 2;
		const cy = VIEW_H / 2;
		ctx.globalCompositeOperation = "lighter";
		for (const star of this.stars) {
			const sx = star.x - m.x + cx;
			const sy = star.y - m.y + cy;
			if (sx < 0 || sx >= VIEW_W || sy < 0 || sy >= VIEW_H) {
				continue;
			}
			const a = 0.05 * star.mag;
			ctx.fillStyle = `rgba(190,210,255,${a.toFixed(3)})`;
			ctx.fillRect(sx, sy, star.mag > 1.4 ? 2 : 1, star.mag > 1.4 ? 2 : 1);
		}
		// the comet is the brightest object and the whole point of the shot
		const kx = this.comet.x - m.x + cx;
		const ky = this.comet.y - m.y + cy;
		const glow = ctx.createRadialGradient(kx, ky, 0, kx, ky, 14);
		glow.addColorStop(0, "rgba(190,255,240,0.20)");
		glow.addColorStop(1, "rgba(190,255,240,0)");
		ctx.fillStyle = glow;
		ctx.fillRect(kx - 14, ky - 14, 28, 28);
		// film grain
		for (let i = 0; i < 26; i++) {
			const a = Math.random() * 0.05;
			ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
			ctx.fillRect(Math.random() * VIEW_W, Math.random() * VIEW_H, 1, 1);
		}
	}

	private finishExposure() {
		this.audio.shutter();
		const sharp = Math.max(0, 1 - this.spread / SPREAD_BUDGET);
		const signal = this.exposingElapsed;
		const trailed = sharp < 0.8;
		const faint = signal < SIGNAL_THRESHOLD;
		const index = this.plates.indexOf(null);
		const result: PlateResult = {
			index,
			status: trailed || faint ? "rejected" : "accepted",
			sharp,
			signal,
			reason:
				trailed && faint
					? "STAR TRAIL + UNDEREXPOSED"
					: trailed
						? "STAR TRAIL"
						: faint
							? "UNDEREXPOSED"
							: null,
		};
		this.plates[index] = result;
		this.review = result;
		this.phase = "review";
		this.reviewTimer = REVIEW_SECONDS;
		if (result.status === "accepted") {
			this.audio.accept();
		} else {
			this.audio.reject();
		}
		if (this.acceptedCount >= PLATES_NEEDED) {
			this.endAfterReview = "success";
		} else if (this.filmLeft === 0 || this.timeLeft <= 0) {
			this.endAfterReview = "failed";
		}
	}

	private leaveReview() {
		this.review = null;
		if (this.endAfterReview) {
			this.phase = this.endAfterReview;
			this.endAfterReview = null;
			if (this.phase === "success") {
				this.audio.complete();
			}
		} else {
			this.phase = this.timeLeft > 0 ? "aim" : "failed";
		}
	}

	getHud(): HudState {
		return {
			phase: this.phase,
			timeLeft: this.timeLeft,
			filmLeft: this.filmLeft,
			exposurePlan: this.exposurePlan,
			error: this.trackingError,
			locked: this.trackingError <= LOCK_RADIUS,
			trailPct: Math.min(100, (this.spread / SPREAD_BUDGET) * 100),
			exposingElapsed: this.exposingElapsed,
			plates: [...this.plates],
			accepted: this.acceptedCount,
			review: this.review,
		};
	}

	/** Hook for automated playtests: the live state in canvas coordinates. */
	getDebugSnapshot() {
		const m = this.effMount;
		return {
			phase: this.phase,
			comet: {
				x: this.comet.x - m.x + VIEW_W / 2,
				y: this.comet.y - m.y + VIEW_H / 2,
			},
			error: this.trackingError,
			exposurePlan: this.exposurePlan,
			exposingElapsed: this.exposingElapsed,
			spread: this.spread,
			accepted: this.acceptedCount,
			filmLeft: this.filmLeft,
			timeLeft: this.timeLeft,
			plates: this.plates.map((p) =>
				p
					? {
							status: p.status,
							sharp: Number(p.sharp.toFixed(3)),
							signal: Number(p.signal.toFixed(2)),
							reason: p.reason,
						}
					: null,
			),
		};
	}
}
