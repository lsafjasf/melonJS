/**
 * melonJS — Ice Core Survey: the tracked surveyor.
 *
 * The vehicle is intentionally a small kinematic model rather than a rigid
 * body: the interesting instability is in the ice, not in a suspension solver.
 * Two treads leave independent marks, and the cargo rack is drawn from the
 * number of cores currently aboard so a jettison is visible immediately.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { math, Renderable, type Renderer } from "melonjs";
import { MAP_HEIGHT, MAP_WIDTH } from "./terrain";

const CORE_COLORS = ["#58d5d4", "#e9ba58", "#86d5a5"];

export class Surveyor extends Renderable {
	heading = -0.08;
	speed = 0;
	throttle = 0;
	steer = 0;
	coresAboard = 0;
	treadDistance = 0;
	sinking = 0;

	constructor(x: number, y: number) {
		super(x, y, 126, 86);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	/** One simulation step. Returns the distance travelled this frame. */
	drive(dtMs: number, throttle: number, steer: number) {
		const dt = Math.min(dtMs, 50) / 1000;
		this.throttle = math.clamp(throttle, -1, 1);
		this.steer = math.clamp(steer, -1, 1);

		const previousX = this.pos.x;
		const previousY = this.pos.y;
		const maxForward = 172;
		const maxReverse = 72;

		if (this.throttle > 0) {
			this.speed += 142 * this.throttle * dt;
		} else if (this.throttle < 0) {
			this.speed += 168 * this.throttle * dt;
		} else {
			this.speed = math.damp(this.speed, 0, 1.55, dt);
		}

		// Heavy cargo does not make the motor weaker, but it makes every
		// correction take longer to settle.
		this.speed -= this.speed * (0.13 + this.coresAboard * 0.018) * dt;
		this.speed = math.clamp(this.speed, -maxReverse, maxForward);

		const moving = Math.abs(this.speed) > 2;
		const speedFactor = Math.min(1, Math.abs(this.speed) / 92);
		const direction = moving ? Math.sign(this.speed) : 1;
		const turnRate = moving ? (0.5 + speedFactor * 1.42) * direction : 0.82;
		this.heading += this.steer * turnRate * dt;

		if (moving) {
			this.pos.x += Math.cos(this.heading) * this.speed * dt;
			this.pos.y += Math.sin(this.heading) * this.speed * dt;
			this.treadDistance += Math.abs(this.speed) * dt;
		}

		return Math.hypot(this.pos.x - previousX, this.pos.y - previousY);
	}

	override update() {
		return true;
	}

	override draw(renderer: Renderer) {
		renderer.translate(this.pos.x, this.pos.y);
		renderer.rotate(this.heading + this.sinking * 0.48);

		// A long soft shadow anchors the vehicle on the bright shelf.
		renderer.setColor("rgba(18, 52, 62, 0.2)");
		renderer.fillRect(-50, -25, 112, 63);
		renderer.setColor("rgba(18, 52, 62, 0.16)");
		renderer.fillEllipse(10, 24, 64, 18);

		// Treads. The cleats travel with `treadDistance`, so the two belts
		// visibly keep turning while the vehicle is stopped but pivoting.
		for (const side of [-1, 1]) {
			const y = side * 29;
			renderer.setColor("#17272c");
			renderer.fillRect(-49, y - 11, 104, 22);
			renderer.setColor("#375158");
			renderer.fillRect(-46, y - 8, 98, 16);
			renderer.setColor("rgba(9, 20, 23, 0.92)");
			const phase = ((this.treadDistance / 6) % 12) - 12;
			for (let x = -48 + phase; x < 55; x += 12) {
				renderer.fillRect(x, y - 9, 4, 18);
			}
			renderer.setColor("rgba(211, 239, 239, 0.4)");
			renderer.lineWidth = 1;
			renderer.strokeLine(-47, y - 10, 52, y - 10);
			renderer.strokeLine(-47, y + 10, 52, y + 10);
		}

		// Chassis and the insulated cab.
		renderer.setColor("#20383f");
		renderer.fillRect(-36, -25, 78, 50);
		renderer.setColor("#3c5c60");
		renderer.fillRect(-31, -21, 66, 42);
		renderer.setColor("#d8a74b");
		renderer.fillRect(32, -19, 26, 38);
		renderer.setColor("#f3cf80");
		renderer.fillRect(36, -15, 5, 30);
		renderer.setColor("#17343d");
		renderer.fillRect(2, -16, 27, 32);
		renderer.setColor("#77d8df");
		renderer.fillRect(6, -12, 19, 24);
		renderer.setColor("rgba(210, 255, 255, 0.7)");
		renderer.fillRect(8, -10, 5, 20);
		renderer.setColor("#f7dd91");
		renderer.fillRect(52, -25, 6, 6);
		renderer.fillRect(52, 19, 6, 6);
		renderer.setColor("rgba(255, 239, 176, 0.24)");
		renderer.fillEllipse(58, -22, 13, 9);
		renderer.fillEllipse(58, 22, 13, 9);

		// Drill mast and a small red beacon.
		renderer.setColor("#9ab8b8");
		renderer.lineWidth = 2;
		renderer.strokeLine(-10, -14, -10, -43);
		renderer.strokeLine(-19, -35, -1, -35);
		renderer.setColor("#ff7559");
		renderer.fillEllipse(-10, -46, 3.5, 3.5);

		// Core rack: one canister per core currently aboard.
		for (let i = 0; i < this.coresAboard; i++) {
			const y = -14 + i * 14;
			renderer.setColor("#1a2d33");
			renderer.fillEllipse(-40, y, 8, 5);
			renderer.setColor(CORE_COLORS[i % CORE_COLORS.length]);
			renderer.fillEllipse(-40, y, 5.5, 3.4);
			renderer.setColor("rgba(255,255,255,0.72)");
			renderer.fillRect(-43, y - 1, 2, 2);
		}
	}
}

interface Mark {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	age: number;
}

/**
 * Persistent paired tread prints. Kept as line segments rather than a moving
 * ribbon because they remain on the ice after the vehicle has gone; `Trail`
 * is the right tool for a fading motion trail, not for a track that has not
 * moved for two minutes.
 */
export class TrackMarks extends Renderable {
	private marks: Mark[] = [];
	private lastLeft: { x: number; y: number } | undefined;
	private lastRight: { x: number; y: number } | undefined;

	constructor() {
		super(0, 0, MAP_WIDTH, MAP_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	add(x: number, y: number, heading: number) {
		const sideX = -Math.sin(heading) * 29;
		const sideY = Math.cos(heading) * 29;
		const left = { x: x + sideX, y: y + sideY };
		const right = { x: x - sideX, y: y - sideY };
		if (this.lastLeft && this.lastRight) {
			this.marks.push({
				x1: this.lastLeft.x,
				y1: this.lastLeft.y,
				x2: left.x,
				y2: left.y,
				age: 0,
			});
			this.marks.push({
				x1: this.lastRight.x,
				y1: this.lastRight.y,
				x2: right.x,
				y2: right.y,
				age: 0,
			});
		}
		this.lastLeft = left;
		this.lastRight = right;
		if (this.marks.length > 2200) {
			this.marks.splice(0, this.marks.length - 2200);
		}
	}

	resetTrail() {
		this.lastLeft = undefined;
		this.lastRight = undefined;
	}

	clear() {
		this.marks.length = 0;
		this.resetTrail();
	}

	override update(dt: number) {
		const seconds = Math.min(dt, 50) / 1000;
		for (const mark of this.marks) {
			mark.age += seconds;
		}
		return true;
	}

	override draw(renderer: Renderer) {
		renderer.lineWidth = 8;
		for (const mark of this.marks) {
			const alpha = Math.max(0.08, 0.46 - mark.age * 0.0022);
			renderer.setColor(`rgba(37, 69, 76, ${alpha})`);
			renderer.strokeLine(mark.x1, mark.y1, mark.x2, mark.y2);
			renderer.setColor(`rgba(222, 242, 242, ${alpha * 0.34})`);
			renderer.lineWidth = 1.5;
			renderer.strokeLine(mark.x1 + 2, mark.y1 + 1, mark.x2 + 2, mark.y2 + 1);
			renderer.lineWidth = 8;
		}
	}
}
