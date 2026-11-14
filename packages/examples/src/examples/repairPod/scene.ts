/**
 * melonJS — Repair Pod docking example: world and HUD visuals.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	type CollisionResponse,
	collision,
	Rect,
	Renderable,
	type Renderer,
} from "melonjs";
import {
	BERTH_ARM,
	BERTH_FRAME,
	BERTH_MOUTH,
	BERTHS,
	type BerthSpec,
	CAPTURE_RADIUS,
	COLORS,
	DOCK_TARGET_RADIUS,
	POD_HEIGHT,
	POD_WIDTH,
	VIEWPORT_H,
	VIEWPORT_W,
} from "./constants";
import type { MissionTelemetry, Point } from "./types";

const TAU = Math.PI * 2;

const wrapAngle = (angle: number) => {
	let a = angle % TAU;
	if (a > Math.PI) {
		a -= TAU;
	} else if (a < -Math.PI) {
		a += TAU;
	}
	return a;
};

/** Deterministic star catalogue; the map never rolls a new sky. */
const makeStars = (seed: number, count: number, scale: number) => {
	let state = seed >>> 0;
	const next = () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return Array.from({ length: count }, () => {
		return {
			x: next() * VIEWPORT_W,
			y: next() * VIEWPORT_H,
			size: (0.7 + next() * 1.3) * scale,
			alpha: 0.24 + next() * 0.68,
			tint: next(),
		};
	});
};

const STAR_LAYERS = [
	{ stars: makeStars(0x51a7, 112, 0.72), parallax: 0.035, alpha: 0.52 },
	{ stars: makeStars(0x9e31, 64, 1.0), parallax: 0.085, alpha: 0.78 },
	{ stars: makeStars(0xc0de, 28, 1.45), parallax: 0.17, alpha: 1 },
];

const positiveModulo = (value: number, modulus: number) => {
	return ((value % modulus) + modulus) % modulus;
};

/**
 * Screen-space star field. Three deterministic layers move at different
 * rates against the pod, which gives the parallax without a scrolling map.
 */
export class StarField extends Renderable {
	private readonly source: () => Point;

	constructor(source: () => Point) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;
		this.source = source;
	}

	override draw(renderer: Renderer): void {
		const pod = this.source();
		const dx = pod.x - VIEWPORT_W / 2;
		const dy = pod.y - VIEWPORT_H / 2;

		renderer.save();
		renderer.setGlobalAlpha(0.08);
		renderer.setColor("#0f3650");
		renderer.fillEllipse(
			VIEWPORT_W * 0.2 - dx * 0.015,
			250 - dy * 0.015,
			460,
			230,
		);
		renderer.setColor("#1c204d");
		renderer.fillEllipse(
			VIEWPORT_W * 0.78 - dx * 0.02,
			VIEWPORT_H * 0.62 - dy * 0.02,
			520,
			280,
		);
		renderer.restore();

		for (const layer of STAR_LAYERS) {
			renderer.save();
			renderer.setGlobalAlpha(layer.alpha);
			for (const star of layer.stars) {
				const x = positiveModulo(star.x - dx * layer.parallax, VIEWPORT_W);
				const y = positiveModulo(star.y - dy * layer.parallax, VIEWPORT_H);
				renderer.setColor(
					star.tint > 0.84
						? "#bdefff"
						: star.tint > 0.55
							? "#dbe8ff"
							: "#8eabc8",
				);
				renderer.setGlobalAlpha(layer.alpha * star.alpha);
				renderer.fillEllipse(x, y, star.size, star.size);
			}
			renderer.restore();
		}
	}
}

interface ArmRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const armRects = (): ArmRect[] => {
	const mouthHalf = BERTH_MOUTH / 2;
	const rightTop = BERTH_FRAME / 2 - mouthHalf;
	const rightBottom = BERTH_FRAME / 2 + mouthHalf;
	return [
		{ x: 0, y: 0, w: BERTH_ARM, h: BERTH_FRAME },
		{ x: 0, y: 0, w: BERTH_FRAME, h: BERTH_ARM },
		{
			x: 0,
			y: BERTH_FRAME - BERTH_ARM,
			w: BERTH_FRAME,
			h: BERTH_ARM,
		},
		{
			x: BERTH_FRAME - BERTH_ARM,
			y: 0,
			w: BERTH_ARM,
			h: rightTop,
		},
		{
			x: BERTH_FRAME - BERTH_ARM,
			y: rightBottom,
			w: BERTH_ARM,
			h: BERTH_FRAME - rightBottom,
		},
	];
};

const BERTH_ARMS = armRects();

export class Berth extends Renderable {
	readonly index: number;
	readonly spec: BerthSpec;
	angle: number;
	spin: number;
	visualState: "active" | "completed" | "idle" = "idle";
	flash = 0;

	constructor(index: number, spec: BerthSpec) {
		super(
			spec.x - BERTH_FRAME / 2,
			spec.y - BERTH_FRAME / 2,
			BERTH_FRAME,
			BERTH_FRAME,
		);
		this.index = index;
		this.spec = spec;
		this.angle = spec.angle;
		this.spin = spec.spin;
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		this.isKinematic = false;
		// Planck anchors a compound body on its first shape's centre. Keep an
		// inactive frame-sized shape first so the body, the drawn outline and
		// the mouth all rotate around the same point; it creates no fixture.
		const pivot = new Rect(0, 0, BERTH_FRAME, BERTH_FRAME);
		pivot.isActive = false;
		this.bodyDef = {
			type: "static",
			shapes: [
				pivot,
				...BERTH_ARMS.map((arm) => {
					const shape = new Rect(arm.x, arm.y, arm.w, arm.h);
					shape.collisionType = collision.types.WORLD_SHAPE;
					shape.collisionMask = collision.types.PLAYER_OBJECT;
					return shape;
				}),
			],
			collisionType: collision.types.WORLD_SHAPE,
			collisionMask: collision.types.PLAYER_OBJECT,
			friction: 0.2,
			restitution: 0.35,
			fixedRotation: true,
		};
	}

	get center(): Point {
		return { x: this.pos.x + BERTH_FRAME / 2, y: this.pos.y + BERTH_FRAME / 2 };
	}

	get dockPoint(): Point {
		const c = this.center;
		return {
			x: c.x + Math.cos(this.angle) * DOCK_TARGET_RADIUS,
			y: c.y + Math.sin(this.angle) * DOCK_TARGET_RADIUS,
		};
	}

	get dockAngle(): number {
		return this.angle + Math.PI;
	}

	/** The clamp itself moves on the rotating frame; a clean dock matches it. */
	get dockVelocity(): Point {
		const r = DOCK_TARGET_RADIUS;
		return {
			x: -Math.sin(this.angle) * r * this.spin,
			y: Math.cos(this.angle) * r * this.spin,
		};
	}

	override update(dt: number): boolean {
		if (this.spin !== 0) {
			this.angle = (this.angle + this.spin * (dt / 1000)) % TAU;
			this.parentApp?.world.adapter.setAngle?.(this, this.angle);
		}
		this.flash = Math.max(0, this.flash - dt / 1000);
		return true;
	}

	override draw(renderer: Renderer): void {
		const x = this.pos.x;
		const y = this.pos.y;
		const active = this.visualState === "active";
		const complete = this.visualState === "completed";
		const accent = complete
			? COLORS.green
			: active
				? COLORS.cyan
				: COLORS.cyanSoft;
		const body = complete ? "#0b221c" : active ? "#0a1f2a" : "#08131c";

		renderer.save();
		renderer.setLineDash([]);
		renderer.lineWidth = active ? 2.5 : 1.5;
		renderer.setColor(body);
		for (const arm of BERTH_ARMS) {
			renderer.fillRect(x + arm.x, y + arm.y, arm.w, arm.h);
		}
		renderer.setColor(accent);
		for (const arm of BERTH_ARMS) {
			renderer.strokeRect(x + arm.x, y + arm.y, arm.w, arm.h);
		}

		const c = this.center;
		const mouth = this.dockPoint;
		renderer.lineWidth = 1;
		renderer.setColor(active ? COLORS.cyan : COLORS.cyanSoft);
		renderer.setLineDash([7, 7]);
		renderer.strokeLine(c.x, c.y, mouth.x, mouth.y);
		renderer.setLineDash([4, 5]);
		renderer.strokeEllipse(mouth.x, mouth.y, CAPTURE_RADIUS, CAPTURE_RADIUS);
		renderer.setLineDash([]);

		// Mouth clamp brackets, drawn in the berth's own rotating frame.
		const mouthY = BERTH_FRAME / 2;
		const bracket = 12;
		renderer.lineWidth = active ? 3 : 2;
		renderer.setColor(active ? COLORS.ink : accent);
		renderer.strokeLine(
			x + BERTH_FRAME - bracket,
			y + mouthY - BERTH_MOUTH / 2,
			x + BERTH_FRAME,
			y + mouthY - BERTH_MOUTH / 2,
		);
		renderer.strokeLine(
			x + BERTH_FRAME - bracket,
			y + mouthY + BERTH_MOUTH / 2,
			x + BERTH_FRAME,
			y + mouthY + BERTH_MOUTH / 2,
		);

		// Three bars identify the port without needing a rotating label.
		renderer.setColor(accent);
		for (let i = 0; i <= this.index; i++) {
			renderer.fillRect(x + 30 + i * 11, y + 28, 6, 3);
		}

		if (this.flash > 0) {
			renderer.setGlobalAlpha(Math.min(1, this.flash * 2));
			renderer.setColor(complete ? COLORS.green : COLORS.orange);
			renderer.lineWidth = 4;
			renderer.strokeEllipse(c.x, c.y, BERTH_FRAME * 0.62, BERTH_FRAME * 0.62);
		}
		renderer.restore();
	}
}

export class Pod extends Renderable {
	onImpact: (() => void) | undefined;
	thrust = { fore: false, aft: false, port: false, starboard: false };

	constructor(x: number, y: number) {
		super(x, y, POD_WIDTH, POD_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		this.isKinematic = false;
		this.bodyDef = {
			type: "dynamic",
			shapes: [new Rect(0, 0, POD_WIDTH, POD_HEIGHT)],
			collisionType: collision.types.PLAYER_OBJECT,
			collisionMask: collision.types.WORLD_SHAPE,
			density: 1,
			friction: 0.15,
			restitution: 0.28,
			fixedRotation: false,
		};
	}

	get center(): Point {
		return {
			x: this.pos.x + POD_WIDTH / 2,
			y: this.pos.y + POD_HEIGHT / 2,
		};
	}

	onCollisionStart(_response: CollisionResponse, _other: Renderable): void {
		this.onImpact?.();
	}

	override draw(renderer: Renderer): void {
		const x = this.pos.x;
		const y = this.pos.y;
		const cx = x + POD_WIDTH / 2;
		const cy = y + POD_HEIGHT / 2;

		renderer.save();
		renderer.setLineDash([]);

		const firing =
			this.thrust.fore ||
			this.thrust.aft ||
			this.thrust.port ||
			this.thrust.starboard;
		if (firing) {
			renderer.setGlobalAlpha(0.22);
			renderer.setColor(COLORS.cyan);
			if (this.thrust.fore) {
				renderer.fillEllipse(x + 2, cy, 12, 7);
			}
			if (this.thrust.aft) {
				renderer.fillEllipse(x + POD_WIDTH - 2, cy, 12, 7);
			}
			if (this.thrust.port) {
				renderer.fillEllipse(cx, y - 1, 8, 5);
			}
			if (this.thrust.starboard) {
				renderer.fillEllipse(cx, y + POD_HEIGHT + 1, 8, 5);
			}
			renderer.setGlobalAlpha(1);
		}

		renderer.setColor("#112735");
		renderer.fillRoundRect(x, y, POD_WIDTH, POD_HEIGHT, 8);
		renderer.setColor(COLORS.ink);
		renderer.lineWidth = 2;
		renderer.strokeRoundRect(x, y, POD_WIDTH, POD_HEIGHT, 8);
		renderer.setColor(COLORS.cyan);
		renderer.fillRoundRect(x + 7, y + 7, 12, POD_HEIGHT - 14, 4);
		renderer.setColor(COLORS.amber);
		renderer.fillRect(x + POD_WIDTH - 9, y + 5, 3, POD_HEIGHT - 10);

		// Docking cross on the nose.
		renderer.setColor(COLORS.cyan);
		renderer.lineWidth = 1;
		renderer.strokeLine(x + 2, cy, x + 10, cy);
		renderer.strokeLine(x + 6, cy - 4, x + 6, cy + 4);
		renderer.restore();
	}
}

const DOCK_MAX_SPEED_FOR_ARROW = 42;

/**
 * Immediate-mode telemetry: velocity vector, rotating capture ring, route
 * hints and the crosshair left at the most recent contact point.
 */
export class TelemetryOverlay extends Renderable {
	private readonly data: MissionTelemetry;

	constructor(data: MissionTelemetry) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;
		this.data = data;
	}

	override draw(renderer: Renderer): void {
		const data = this.data;

		renderer.save();
		renderer.setLineDash([3, 7]);
		renderer.setGlobalAlpha(0.22);
		renderer.setColor(COLORS.cyanSoft);
		for (let i = 0; i < BERTHS.length - 1; i++) {
			renderer.strokeLine(
				BERTHS[i].x,
				BERTHS[i].y,
				BERTHS[i + 1].x,
				BERTHS[i + 1].y,
			);
		}
		renderer.setLineDash([]);

		if (data.state === "flying") {
			const pod = data.podCenter;
			const target = data.dockPoint;
			renderer.setGlobalAlpha(0.3);
			renderer.setColor(COLORS.cyan);
			renderer.setLineDash([4, 6]);
			renderer.strokeLine(pod.x, pod.y, target.x, target.y);
			renderer.setLineDash([]);
		}
		renderer.restore();

		if (data.speed > 1) {
			const norm = data.speed;
			const length = Math.min(150, 18 + data.speed * 0.55);
			const sx = data.podCenter.x + (data.velocity.x / norm) * 34;
			const sy = data.podCenter.y + (data.velocity.y / norm) * 34;
			const ex = data.podCenter.x + (data.velocity.x / norm) * (34 + length);
			const ey = data.podCenter.y + (data.velocity.y / norm) * (34 + length);
			const ux = data.velocity.x / norm;
			const uy = data.velocity.y / norm;
			const px = -uy;
			const py = ux;
			const head = 9;
			const color =
				data.speed > DOCK_MAX_SPEED_FOR_ARROW ? COLORS.orange : COLORS.cyan;

			renderer.save();
			renderer.setLineDash([]);
			renderer.setGlobalAlpha(0.18);
			renderer.setColor(color);
			renderer.lineWidth = 7;
			renderer.strokeLine(sx, sy, ex, ey);
			renderer.setGlobalAlpha(1);
			renderer.lineWidth = 2;
			renderer.strokeLine(sx, sy, ex, ey);
			renderer.strokeLine(
				ex,
				ey,
				ex - ux * head + px * head * 0.62,
				ey - uy * head + py * head * 0.62,
			);
			renderer.strokeLine(
				ex,
				ey,
				ex - ux * head - px * head * 0.62,
				ey - uy * head - py * head * 0.62,
			);
			renderer.restore();
		}

		if (data.lastContact !== null) {
			const contact = data.lastContact;
			const ageSeconds = Math.max(0, (data.elapsedMs - contact.at) / 1000);
			const pulse = 0.55 + 0.45 * Math.sin(ageSeconds * 5);
			renderer.save();
			renderer.setLineDash([]);
			renderer.setColor(COLORS.orange);
			renderer.lineWidth = 1.5;
			renderer.setGlobalAlpha(0.6 + 0.4 * pulse);
			renderer.strokeEllipse(
				contact.x,
				contact.y,
				11 + pulse * 5,
				11 + pulse * 5,
			);
			renderer.strokeLine(contact.x - 17, contact.y, contact.x + 17, contact.y);
			renderer.strokeLine(contact.x, contact.y - 17, contact.x, contact.y + 17);
			renderer.setGlobalAlpha(0.35);
			renderer.setColor(COLORS.ink);
			renderer.strokeLine(contact.x, contact.y, contact.x + 34, contact.y - 22);
			renderer.restore();
		}

		// A small level-of-detail cue at the pod: the short bar points along
		// the body's axis, while the arrow above shows where it is actually
		// travelling.
		renderer.save();
		renderer.setColor(COLORS.amber);
		renderer.setGlobalAlpha(0.9);
		renderer.strokeEllipse(data.podCenter.x, data.podCenter.y, 29, 29);
		renderer.restore();
	}
}

/** Wraps a heading difference into [-pi, pi]. */
export const wrapAngleDiff = wrapAngle;
