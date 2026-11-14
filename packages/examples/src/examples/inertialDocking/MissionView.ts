/**
 * melonJS — Inertial Docking: Canvas scene, HUD and input loop.
 *
 * Everything is drawn with the engine's immediate-mode renderer, so the
 * scene has no image or font dependencies and behaves the same on Canvas,
 * WebGL and WebGPU. The flight model lives in `simulation.ts`; this file is
 * responsible for turning its state into a readable approach problem.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	type CanvasRenderer,
	input,
	Renderable,
	Text,
	type WebGLRenderer,
} from "melonjs";
import {
	playBoundary,
	playDock,
	playFailure,
	playImpact,
	playRecovery,
	playThruster,
	type ThrusterSound,
} from "./audio";
import {
	BERTH_APERTURE,
	BERTH_LAYOUT,
	BERTH_RADIUS,
	BERTH_WALL,
	DOCK_ANGLE,
	DOCK_ANGULAR_SPEED,
	DOCK_RADIUS,
	DOCK_SPEED,
	FIXED_SEED,
	HULL_MAX,
	INITIAL_FUEL,
	RECOVERY,
	RECOVERY_ANGLE,
	RECOVERY_ANGULAR_SPEED,
	RECOVERY_CAPTURE_RADIUS,
	RECOVERY_RADIUS,
	RECOVERY_SPEED,
	SHIP_RADIUS,
	START,
	VIEWPORT_H,
	VIEWPORT_W,
} from "./constants";
import {
	bleedsFuel,
	createGameState,
	currentBerth,
	dockingMetrics,
	type FlightInput,
	type GameEvent,
	type GameState,
	speedOf,
	stepGame,
	wrapAngle,
} from "./simulation";
import { createStarfield, type StarLayer } from "./starfield";

type AnyRenderer = CanvasRenderer | WebGLRenderer;

const INK = "#dce9f8";
const DIM = "#7488a9";
const FAINT = "#34445f";
const PANEL = "#09111f";
const CYAN = "#68e3ff";
const TEAL = "#52f0c4";
const AMBER = "#ffc857";
const RED = "#ff6178";
const VIOLET = "#a58cff";
const WALL = "#4f668e";

const TWO_PI = Math.PI * 2;
const clamp = (value: number, low = 0, high = 1) =>
	Math.max(low, Math.min(high, value));
const wrap = (value: number, max: number) => ((value % max) + max) % max;
const panFor = (x: number) => clamp((x / VIEWPORT_W) * 2 - 1, -1, 1) * 0.75;

/** Build a path without allocating a shape object for every frame. */
function tracePolygon(
	renderer: AnyRenderer,
	points: readonly { x: number; y: number }[],
): void {
	if (points.length === 0) {
		return;
	}
	renderer.beginPath();
	renderer.moveTo(points[0].x, points[0].y);
	for (let index = 1; index < points.length; index++) {
		renderer.lineTo(points[index].x, points[index].y);
	}
	renderer.closePath();
}

function fillPolygon(
	renderer: AnyRenderer,
	points: readonly { x: number; y: number }[],
): void {
	tracePolygon(renderer, points);
	renderer.fill();
}

function strokePolygon(
	renderer: AnyRenderer,
	points: readonly { x: number; y: number }[],
): void {
	tracePolygon(renderer, points);
	renderer.stroke();
}

function drawArrow(
	renderer: AnyRenderer,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	head: number,
): void {
	const angle = Math.atan2(toY - fromY, toX - fromX);
	renderer.strokeLine(fromX, fromY, toX, toY);
	renderer.beginPath();
	renderer.moveTo(toX, toY);
	renderer.lineTo(
		toX - Math.cos(angle - 0.52) * head,
		toY - Math.sin(angle - 0.52) * head,
	);
	renderer.moveTo(toX, toY);
	renderer.lineTo(
		toX - Math.cos(angle + 0.52) * head,
		toY - Math.sin(angle + 0.52) * head,
	);
	renderer.stroke();
}

function drawChevron(
	renderer: AnyRenderer,
	x: number,
	y: number,
	angle: number,
	size: number,
): void {
	const wing = angle + Math.PI;
	renderer.beginPath();
	renderer.moveTo(
		x + Math.cos(wing - 0.55) * size,
		y + Math.sin(wing - 0.55) * size,
	);
	renderer.lineTo(x, y);
	renderer.lineTo(
		x + Math.cos(wing + 0.55) * size,
		y + Math.sin(wing + 0.55) * size,
	);
	renderer.stroke();
}

/**
 * A cached engine `Text`. Values are re-baked only when the string, colour or
 * alignment changes, so the HUD can be redrawn every frame without rebuilding
 * a texture per label per frame.
 */
class Label {
	private readonly label: Text;
	private value = "";
	private colour = "";
	private alignment = "";

	constructor(
		size: number,
		bold = false,
		baseline: "top" | "middle" | "bottom" = "middle",
	) {
		this.label = new Text(0, 0, {
			font: "monospace",
			size,
			bold,
			fillStyle: INK,
			textAlign: "left",
			textBaseline: baseline,
			text: "",
		});
	}

	draw(
		renderer: AnyRenderer,
		value: string,
		x: number,
		y: number,
		colour = INK,
		alignment: "left" | "center" | "right" = "left",
	): void {
		if (
			value !== this.value ||
			colour !== this.colour ||
			alignment !== this.alignment
		) {
			this.label.fillStyle.parseCSS(colour);
			this.label.textAlign = alignment;
			this.label.setText(value);
			this.value = value;
			this.colour = colour;
			this.alignment = alignment;
		}
		this.label.setPosition(x, y);
		this.label.preDraw(renderer);
		this.label.draw(renderer);
		this.label.postDraw(renderer);
	}
}

export class MissionView extends Renderable {
	state: GameState;
	readonly stars: StarLayer[];
	private thrustSoundClock = 0;
	private rcsSoundClock = 0;
	private rotationSoundClock = 0;
	private lastPhase: GameState["phase"] = "running";

	constructor() {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;

		this.state = createGameState();
		this.stars = createStarfield(FIXED_SEED);
	}

	reset(): void {
		this.state = createGameState();
		this.thrustSoundClock = 0;
		this.rcsSoundClock = 0;
		this.rotationSoundClock = 0;
		this.lastPhase = "running";
	}

	private readInput(): FlightInput {
		return {
			forward:
				input.isKeyPressed("forward") || input.isKeyPressed("forward-alt"),
			reverse:
				input.isKeyPressed("reverse") || input.isKeyPressed("reverse-alt"),
			strafeLeft: input.isKeyPressed("strafe-left"),
			strafeRight: input.isKeyPressed("strafe-right"),
			rotateLeft: input.isKeyPressed("rotate-left"),
			rotateRight: input.isKeyPressed("rotate-right"),
			boost: input.isKeyPressed("boost"),
		};
	}

	private processEvents(events: readonly GameEvent[]): void {
		for (const event of events) {
			switch (event.type) {
				case "impact": {
					const force = event.force ?? 0;
					playImpact(force, panFor(event.x ?? this.state.ship.x));
					this.parentApp?.viewport.shake(
						2 + clamp(force / 160) * 7,
						180 + clamp(force / 220) * 240,
					);
					break;
				}
				case "dock":
					playDock(event.berth ?? 0);
					break;
				case "recovery":
					playRecovery();
					break;
				case "failed":
					playFailure();
					this.parentApp?.viewport.shake(10, 420);
					break;
				case "boundary":
					playBoundary();
					break;
				case "fuel-empty":
					break;
			}
		}
	}

	private updateAudio(dt: number): void {
		const thrusters = this.state.thrusters;
		const active =
			this.state.phase === "running" &&
			this.state.ship.fuel > 0 &&
			!(this.state.ship.hull <= 0);
		this.thrustSoundClock -= dt;
		this.rcsSoundClock -= dt;
		this.rotationSoundClock -= dt;

		if (!active) {
			this.thrustSoundClock = 0;
			this.rcsSoundClock = 0;
			this.rotationSoundClock = 0;
			return;
		}

		if (
			(thrusters.main > 0 || thrusters.reverse > 0) &&
			this.thrustSoundClock <= 0
		) {
			const kind: ThrusterSound = thrusters.main > 0 ? "main" : "reverse";
			const level = thrusters.boost ? 1 : 0.56;
			playThruster(kind, level, 0);
			this.thrustSoundClock = thrusters.boost ? 0.075 : 0.11;
		}
		if (
			(thrusters.left > 0 || thrusters.right > 0) &&
			this.rcsSoundClock <= 0
		) {
			playThruster("lateral", 0.62, thrusters.left > 0 ? -0.55 : 0.55);
			this.rcsSoundClock = 0.095;
		}
		if (
			(thrusters.rotateLeft > 0 || thrusters.rotateRight > 0) &&
			this.rotationSoundClock <= 0
		) {
			playThruster("rotation", 0.48, thrusters.rotateLeft > 0 ? -0.28 : 0.28);
			this.rotationSoundClock = 0.13;
		}
	}

	override update(dt: number): boolean {
		if (input.isKeyPressed("restart")) {
			this.reset();
		}

		const simulationDt = Math.min(dt, 50) / 1000;
		const events = stepGame(this.state, this.readInput(), simulationDt);
		this.processEvents(events);
		this.updateAudio(dt / 1000);

		if (this.state.phase !== this.lastPhase) {
			this.lastPhase = this.state.phase;
			this.thrustSoundClock = 0;
			this.rcsSoundClock = 0;
			this.rotationSoundClock = 0;
		}
		return true;
	}

	private drawBackground(renderer: AnyRenderer): void {
		renderer.clearColor("#040711");

		renderer.setGlobalAlpha(0.34);
		renderer.setColor("#0a1733");
		renderer.fillEllipse(138, 106, 410, 260);
		renderer.setColor("#171039");
		renderer.fillEllipse(1108, 604, 350, 210);
		renderer.setColor("#092a35");
		renderer.fillEllipse(710, 302, 470, 190);

		renderer.setGlobalAlpha(0.22);
		renderer.setColor("#172a4d");
		renderer.fillEllipse(1142, 116, 156, 156);
		renderer.setGlobalAlpha(0.12);
		renderer.setColor("#7f9dff");
		renderer.strokeEllipse(1142, 116, 172, 172);

		const ship = this.state.ship;
		const time = this.state.elapsed;
		for (const layer of this.stars) {
			const offsetX = ship.x * layer.depth + time * layer.drift;
			const offsetY = ship.y * layer.depth;
			for (const star of layer.stars) {
				const x = wrap(star.x * VIEWPORT_W - offsetX, VIEWPORT_W);
				const y = wrap(star.y * VIEWPORT_H - offsetY, VIEWPORT_H);
				const twinkle =
					0.46 + 0.38 * Math.sin(time * star.twinkle + star.phase);
				const alpha = clamp(twinkle, 0.12, 0.92);
				renderer.setGlobalAlpha(alpha);
				renderer.setColor(
					layer.depth < 0.03
						? "#dbe7ff"
						: layer.depth < 0.07
							? "#9eb8e8"
							: "#586f9f",
				);
				if (star.cross) {
					renderer.lineWidth = 1;
					renderer.strokeLine(x - star.radius * 3, y, x + star.radius * 3, y);
					renderer.strokeLine(x, y - star.radius * 3, x, y + star.radius * 3);
				}
				renderer.fillRect(
					x - star.radius * 0.5,
					y - star.radius * 0.5,
					star.radius,
					star.radius,
				);
			}
		}
		renderer.setGlobalAlpha(1);
	}

	private drawRoute(renderer: AnyRenderer): void {
		const points = [
			START,
			...BERTH_LAYOUT.map((berth) => ({ x: berth.x, y: berth.y })),
			RECOVERY,
		];
		renderer.lineWidth = 1;
		renderer.setLineDash([5, 10]);
		for (let index = 0; index < points.length - 1; index++) {
			const from = points[index];
			const to = points[index + 1];
			const complete = index < this.state.nextBerth;
			const current = index === this.state.nextBerth;
			renderer.setGlobalAlpha(complete ? 0.34 : current ? 0.28 : 0.1);
			renderer.setColor(complete ? TEAL : current ? AMBER : WALL);
			renderer.strokeLine(from.x, from.y, to.x, to.y);
		}
		renderer.setLineDash([]);
		renderer.setGlobalAlpha(1);
	}

	private drawMothership(renderer: AnyRenderer): void {
		renderer.save();
		renderer.translate(18, 442);
		renderer.setGlobalAlpha(0.9);
		renderer.setColor("#07101e");
		fillPolygon(renderer, [
			{ x: 0, y: 44 },
			{ x: 54, y: 9 },
			{ x: 151, y: 5 },
			{ x: 196, y: 36 },
			{ x: 179, y: 104 },
			{ x: 112, y: 141 },
			{ x: 35, y: 125 },
			{ x: 0, y: 83 },
		]);
		renderer.setGlobalAlpha(1);
		renderer.lineWidth = 2;
		renderer.setColor("#3f587e");
		strokePolygon(renderer, [
			{ x: 0, y: 44 },
			{ x: 54, y: 9 },
			{ x: 151, y: 5 },
			{ x: 196, y: 36 },
			{ x: 179, y: 104 },
			{ x: 112, y: 141 },
			{ x: 35, y: 125 },
			{ x: 0, y: 83 },
		]);

		renderer.setColor("#172945");
		renderer.fillRect(38, 37, 102, 50);
		renderer.setColor("#62d9ff");
		renderer.setGlobalAlpha(0.38);
		renderer.fillRect(51, 45, 19, 8);
		renderer.fillRect(78, 45, 44, 4);
		renderer.fillRect(78, 54, 27, 4);
		renderer.setGlobalAlpha(1);
		renderer.setColor("#243b5e");
		renderer.fillRect(158, 52, 20, 40);
		renderer.fillRect(132, 31, 14, 63);

		renderer.setColor("#091522");
		renderer.fillRect(172, 92, 56, 10);
		renderer.setColor("#31577e");
		renderer.strokeRect(172, 92, 56, 10);
		renderer.setLineDash([3, 5]);
		renderer.setColor("#68e3ff");
		renderer.setGlobalAlpha(0.35);
		renderer.strokeLine(224, 97, 244, 97);
		renderer.setLineDash([]);
		renderer.setGlobalAlpha(1);
		renderer.restore();
	}

	private berthColour(berthIndex: number, secured: boolean): string {
		if (secured) {
			return TEAL;
		}
		return berthIndex === this.state.nextBerth ? AMBER : WALL;
	}

	private drawBerth(
		renderer: AnyRenderer,
		index: number,
		targeted: boolean,
	): void {
		const berth = this.state.berths[index];
		const colour = this.berthColour(index, berth.secured);
		const pulse = 0.5 + 0.5 * Math.sin(this.state.elapsed * 3.2 + index);

		renderer.setGlobalAlpha(berth.secured ? 0.09 : targeted ? 0.09 : 0.035);
		renderer.setColor(colour);
		renderer.fillEllipse(
			berth.x,
			berth.y,
			berth.radius + 12,
			berth.radius + 12,
		);
		renderer.setGlobalAlpha(1);

		if (targeted) {
			renderer.setGlobalAlpha(0.2 + pulse * 0.45);
			renderer.setColor(AMBER);
			renderer.lineWidth = 1;
			renderer.strokeEllipse(
				berth.x,
				berth.y,
				berth.radius + 25 + pulse * 4,
				berth.radius + 25 + pulse * 4,
			);
			renderer.setGlobalAlpha(1);
		}

		renderer.save();
		renderer.translate(berth.x, berth.y);
		renderer.rotate(berth.angle);

		renderer.lineWidth = BERTH_WALL;
		renderer.setColor(colour);
		renderer.strokeArc(
			0,
			0,
			berth.radius,
			BERTH_APERTURE,
			TWO_PI - BERTH_APERTURE,
		);

		renderer.lineWidth = 1;
		renderer.setGlobalAlpha(0.42);
		renderer.strokeArc(
			0,
			0,
			berth.radius - 10,
			BERTH_APERTURE + 0.08,
			TWO_PI - BERTH_APERTURE - 0.08,
		);
		renderer.setGlobalAlpha(1);

		for (let tick = 0; tick < 12; tick++) {
			const angle = (tick / 12) * TWO_PI;
			const fromAperture = Math.abs(wrapAngle(angle));
			if (fromAperture < BERTH_APERTURE + 0.05) {
				continue;
			}
			const inner = berth.radius + 9;
			const outer = inner + (tick % 3 === 0 ? 11 : 6);
			renderer.setColor(tick % 3 === 0 ? colour : "#354a6d");
			renderer.strokeLine(
				Math.cos(angle) * inner,
				Math.sin(angle) * inner,
				Math.cos(angle) * outer,
				Math.sin(angle) * outer,
			);
		}

		renderer.setColor(colour);
		renderer.lineWidth = 3;
		for (const sign of [-1, 1]) {
			const angle = sign * BERTH_APERTURE;
			renderer.strokeLine(
				Math.cos(angle) * (berth.radius - 11),
				Math.sin(angle) * (berth.radius - 11),
				Math.cos(angle) * (berth.radius + 13),
				Math.sin(angle) * (berth.radius + 13),
			);
		}

		renderer.setColor(berth.secured ? TEAL : AMBER);
		renderer.setGlobalAlpha(0.65);
		renderer.lineWidth = 2;
		drawChevron(renderer, berth.radius + 21, 0, Math.PI, 10);
		renderer.setGlobalAlpha(1);

		renderer.setLineDash([3, 6]);
		renderer.setGlobalAlpha(0.4);
		renderer.setColor("#8fa6ca");
		renderer.strokeArc(0, 0, berth.radius - 20, 0, TWO_PI);
		renderer.setLineDash([]);
		renderer.setGlobalAlpha(1);

		renderer.setColor(colour);
		renderer.lineWidth = 1;
		renderer.strokeLine(-7, 0, 7, 0);
		renderer.strokeLine(0, -7, 0, 7);

		if (berth.secured) {
			renderer.lineWidth = 2;
			renderer.beginPath();
			renderer.moveTo(-6, 0);
			renderer.lineTo(-1, 6);
			renderer.lineTo(9, -6);
			renderer.stroke();
		}
		renderer.restore();
	}

	private drawRecovery(renderer: AnyRenderer): void {
		const targeted = this.state.nextBerth >= this.state.berths.length;
		const pulse = 0.5 + 0.5 * Math.sin(this.state.elapsed * 2.4);
		const colour =
			this.state.phase === "success" ? TEAL : targeted ? TEAL : WALL;

		renderer.setGlobalAlpha(targeted ? 0.1 + pulse * 0.05 : 0.03);
		renderer.setColor(colour);
		renderer.fillEllipse(
			RECOVERY.x,
			RECOVERY.y,
			RECOVERY_RADIUS,
			RECOVERY_RADIUS,
		);
		renderer.setGlobalAlpha(1);

		renderer.save();
		renderer.translate(RECOVERY.x, RECOVERY.y);
		renderer.setColor(colour);
		renderer.lineWidth = targeted ? 3 : 1;
		renderer.setLineDash([9, 8]);
		renderer.strokeArc(0, 0, RECOVERY_RADIUS, 0, TWO_PI);
		renderer.setLineDash([]);
		renderer.lineWidth = 1;
		renderer.setGlobalAlpha(targeted ? 0.8 : 0.3);
		renderer.strokeArc(0, 0, RECOVERY_CAPTURE_RADIUS, 0, TWO_PI);
		renderer.setGlobalAlpha(1);

		for (let index = 0; index < 4; index++) {
			const angle = (index / 4) * TWO_PI + Math.PI / 4;
			const x = Math.cos(angle) * (RECOVERY_RADIUS - 13);
			const y = Math.sin(angle) * (RECOVERY_RADIUS - 13);
			drawChevron(renderer, x, y, angle + Math.PI, 9);
		}
		renderer.restore();
	}

	private drawShip(renderer: AnyRenderer): void {
		const ship = this.state.ship;
		const thrusters = this.state.thrusters;
		const flicker = 0.74 + 0.26 * Math.sin(this.state.elapsed * 47);
		const hullColour =
			this.state.impactFlash > 0.45
				? RED
				: this.state.phase === "failed"
					? "#ff8a98"
					: "#d9efff";

		renderer.save();
		renderer.translate(ship.x, ship.y);
		renderer.rotate(ship.angle);

		if (thrusters.main > 0 && ship.fuel > 0) {
			const length = (13 + flicker * 13) * (thrusters.boost ? 1.55 : 1);
			renderer.setGlobalAlpha(0.9);
			renderer.setColor(thrusters.boost ? "#fff2b0" : "#68e3ff");
			renderer.lineWidth = 2;
			renderer.strokeLine(-8, -4, -8 - length, -4);
			renderer.strokeLine(-8, 4, -8 - length, 4);
			renderer.setGlobalAlpha(0.55);
			renderer.setColor("#ff8a3d");
			renderer.strokeLine(-8, 0, -8 - length * 0.72, 0);
		}
		if (thrusters.reverse > 0 && ship.fuel > 0) {
			renderer.setGlobalAlpha(0.75);
			renderer.setColor("#ffc857");
			renderer.lineWidth = 2;
			renderer.strokeLine(15, -3, 15 + 10 * flicker, -3);
			renderer.strokeLine(15, 3, 15 + 10 * flicker, 3);
		}
		if (thrusters.left > 0 && ship.fuel > 0) {
			renderer.setGlobalAlpha(0.75);
			renderer.setColor("#68e3ff");
			renderer.lineWidth = 2;
			renderer.strokeLine(0, -7, 0, -7 - 11 * flicker);
		}
		if (thrusters.right > 0 && ship.fuel > 0) {
			renderer.setGlobalAlpha(0.75);
			renderer.setColor("#68e3ff");
			renderer.lineWidth = 2;
			renderer.strokeLine(0, 7, 0, 7 + 11 * flicker);
		}
		if (thrusters.rotateLeft > 0 && ship.fuel > 0) {
			renderer.setGlobalAlpha(0.7);
			renderer.setColor(VIOLET);
			renderer.lineWidth = 1;
			renderer.strokeLine(8, -8, 13, -13);
			renderer.strokeLine(-13, 7, -8, 12);
		}
		if (thrusters.rotateRight > 0 && ship.fuel > 0) {
			renderer.setGlobalAlpha(0.7);
			renderer.setColor(VIOLET);
			renderer.lineWidth = 1;
			renderer.strokeLine(8, 7, 13, 12);
			renderer.strokeLine(-13, -8, -8, -13);
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor("#07101c");
		fillPolygon(renderer, [
			{ x: 17, y: 0 },
			{ x: -8, y: -8 },
			{ x: -4, y: 0 },
			{ x: -8, y: 8 },
		]);
		renderer.setColor(hullColour);
		fillPolygon(renderer, [
			{ x: 13, y: 0 },
			{ x: -6, y: -5.5 },
			{ x: -3, y: 0 },
			{ x: -6, y: 5.5 },
		]);
		renderer.setColor("#4d7198");
		strokePolygon(renderer, [
			{ x: 17, y: 0 },
			{ x: -8, y: -8 },
			{ x: -4, y: 0 },
			{ x: -8, y: 8 },
		]);
		renderer.setColor("#68e3ff");
		renderer.fillRect(1, -1.5, 6, 3);
		renderer.restore();

		const speed = speedOf(ship);
		if (speed > 1.5) {
			const scale = 0.78;
			const endX = ship.x + ship.vx * scale;
			const endY = ship.y + ship.vy * scale;
			const vectorColour = speed > 95 ? RED : speed > 54 ? AMBER : CYAN;

			renderer.setGlobalAlpha(0.16);
			renderer.setColor(vectorColour);
			renderer.lineWidth = 1;
			renderer.setLineDash([3, 8]);
			renderer.strokeLine(
				ship.x,
				ship.y,
				ship.x + ship.vx * 1.55,
				ship.y + ship.vy * 1.55,
			);
			renderer.setLineDash([]);

			renderer.setGlobalAlpha(0.94);
			renderer.setColor(vectorColour);
			renderer.lineWidth = 2;
			drawArrow(renderer, ship.x, ship.y, endX, endY, 8);
			renderer.setGlobalAlpha(1);
		}
	}

	private drawDockingWindow(renderer: AnyRenderer): void {
		const target = currentBerth(this.state);
		if (target === undefined) {
			return;
		}
		const metrics = dockingMetrics(this.state);
		const rangeOk = metrics.range <= DOCK_RADIUS;
		const speedOk = metrics.speed <= DOCK_SPEED;
		const angleOk = metrics.headingError <= DOCK_ANGLE;
		const spinOk = metrics.angularSpeed <= DOCK_ANGULAR_SPEED;
		const open = rangeOk && speedOk && angleOk && spinOk;

		renderer.save();
		renderer.translate(target.x, target.y);
		renderer.rotate(target.angle);
		renderer.setLineDash(open ? [] : [4, 6]);
		renderer.setGlobalAlpha(open ? 0.58 : 0.25);
		renderer.setColor(open ? TEAL : AMBER);
		renderer.lineWidth = open ? 2 : 1;
		renderer.strokeLine(0, 0, BERTH_RADIUS + 32, 0);
		renderer.strokeLine(0, -9, 0, 9);
		renderer.setLineDash([]);
		renderer.setGlobalAlpha(1);
		renderer.restore();
	}

	private drawEffects(renderer: AnyRenderer): void {
		if (this.state.impactFlash > 0.01) {
			const ship = this.state.ship;
			renderer.setGlobalAlpha(this.state.impactFlash * 0.55);
			renderer.setColor(RED);
			renderer.lineWidth = 2;
			renderer.strokeEllipse(
				ship.x,
				ship.y,
				SHIP_RADIUS + 13,
				SHIP_RADIUS + 13,
			);
			renderer.setGlobalAlpha(1);
		}
		if (this.state.dockFlash > 0.01) {
			const target = this.state.berths[Math.max(0, this.state.nextBerth - 1)];
			if (target !== undefined) {
				renderer.setGlobalAlpha(this.state.dockFlash * 0.7);
				renderer.setColor(TEAL);
				renderer.lineWidth = 2;
				renderer.strokeEllipse(
					target.x,
					target.y,
					target.radius + 15,
					target.radius + 15,
				);
				renderer.setGlobalAlpha(1);
			}
		}
	}

	override draw(renderer: AnyRenderer): void {
		this.drawBackground(renderer);
		this.drawRoute(renderer);
		this.drawMothership(renderer);
		this.drawRecovery(renderer);

		for (let index = 0; index < this.state.berths.length; index++) {
			this.drawBerth(renderer, index, index === this.state.nextBerth);
		}
		this.drawDockingWindow(renderer);
		this.drawShip(renderer);
		this.drawEffects(renderer);

		renderer.setGlobalAlpha(1);
		renderer.setLineDash([]);
	}
}

export class MissionHud extends Renderable {
	private readonly view: MissionView;
	private readonly title = new Label(20, true);
	private readonly subtitle = new Label(11);
	private readonly objective = new Label(14, true);
	private readonly objectiveSub = new Label(10);
	private readonly smallValue = new Label(11);
	private readonly telemetry = new Label(12, true);
	private readonly rowLabel = new Label(11);
	private readonly rowValue = new Label(12, true);
	private readonly controls = new Label(11);
	private readonly berthLabel = new Label(11, true);
	private readonly berthSub = new Label(9);
	private readonly banner = new Label(12, true);
	private readonly overlayTitle = new Label(42, true);
	private readonly overlaySub = new Label(14);
	private readonly overlayHint = new Label(11);

	constructor(view: MissionView) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.isKinematic = true;
		this.alwaysUpdate = true;
		this.view = view;
	}

	private panel(
		renderer: AnyRenderer,
		x: number,
		y: number,
		width: number,
		height: number,
		stroke = "#233653",
	): void {
		renderer.setGlobalAlpha(0.78);
		renderer.setColor(PANEL);
		renderer.fillRect(x, y, width, height);
		renderer.setGlobalAlpha(1);
		renderer.setColor(stroke);
		renderer.lineWidth = 1;
		renderer.strokeRect(x, y, width, height);
	}

	private bar(
		renderer: AnyRenderer,
		x: number,
		y: number,
		width: number,
		ratio: number,
		colour: string,
	): void {
		renderer.setColor("#16263c");
		renderer.fillRect(x, y, width, 6);
		renderer.setColor(colour);
		renderer.fillRect(x, y, width * clamp(ratio), 6);
		renderer.setColor("#334b6c");
		renderer.strokeRect(x, y, width, 6);
	}

	private drawLabels(renderer: AnyRenderer): void {
		const state = this.view.state;
		const ship = state.ship;
		const speed = speedOf(ship);
		const target = currentBerth(state);
		const metrics = dockingMetrics(state);
		const phaseLabel =
			state.phase === "success"
				? "MISSION COMPLETE"
				: state.phase === "failed"
					? "MISSION FAILED"
					: target === undefined
						? "RECOVERY ZONE"
						: `BERTH ${target.id} OF 03`;

		this.title.draw(renderer, "SUPPLY RUN", 40, 34, INK);
		this.subtitle.draw(
			renderer,
			`INERTIAL DOCKING  ·  SEED 0x${FIXED_SEED.toString(16).toUpperCase()}`,
			40,
			58,
			DIM,
		);
		this.objective.draw(
			renderer,
			phaseLabel,
			VIEWPORT_W / 2,
			34,
			state.phase === "failed"
				? RED
				: state.phase === "success"
					? TEAL
					: target?.secured
						? TEAL
						: AMBER,
			"center",
		);
		this.objectiveSub.draw(
			renderer,
			target === undefined
				? "MATCH POSITION  ·  SPEED  ·  ORIENTATION"
				: `SPIN ${target.spin >= 0 ? "+" : ""}${target.spin.toFixed(2)} RAD/S  ·  APERTURE LIVE`,
			VIEWPORT_W / 2,
			55,
			DIM,
			"center",
		);

		this.telemetry.draw(renderer, "HULL", 930, 32, INK);
		this.bar(
			renderer,
			980,
			27,
			175,
			ship.hull / HULL_MAX,
			ship.hull < 35 ? RED : TEAL,
		);
		this.smallValue.draw(
			renderer,
			`${Math.ceil(ship.hull).toString().padStart(3, "0")}%`,
			1240,
			32,
			ship.hull < 35 ? RED : INK,
			"right",
		);
		this.telemetry.draw(renderer, "FUEL", 930, 52, INK);
		this.bar(
			renderer,
			980,
			47,
			175,
			ship.fuel / INITIAL_FUEL,
			ship.fuel <= 0 ? RED : AMBER,
		);
		this.smallValue.draw(
			renderer,
			`${Math.max(0, ship.fuel).toFixed(1)}`,
			1240,
			52,
			ship.fuel <= 0 ? RED : INK,
			"right",
		);
		this.telemetry.draw(
			renderer,
			ship.fuel <= 0 ? "DRIFT" : "BURN",
			930,
			74,
			ship.fuel <= 0 ? RED : DIM,
		);
		this.telemetry.draw(
			renderer,
			ship.fuel <= 0
				? "NO THRUST · MOMENTUM REMAINS"
				: bleedsFuel(state)
					? "MAIN ENGINE ACTIVE"
					: "COASTING · NO AUTO-BRAKE",
			980,
			74,
			ship.fuel <= 0 ? RED : DIM,
		);

		const speedLimit = target === undefined ? RECOVERY_SPEED : DOCK_SPEED;
		const angleLimit = target === undefined ? RECOVERY_ANGLE : DOCK_ANGLE;
		const spinLimit =
			target === undefined ? RECOVERY_ANGULAR_SPEED : DOCK_ANGULAR_SPEED;
		const captureLimit =
			target === undefined ? RECOVERY_CAPTURE_RADIUS : DOCK_RADIUS;
		const headingColour = metrics.headingError <= angleLimit ? TEAL : AMBER;
		const speedColour = speed <= speedLimit ? TEAL : RED;
		const spinColour = metrics.angularSpeed <= spinLimit ? TEAL : AMBER;
		const rangeColour = metrics.range <= captureLimit ? TEAL : INK;

		this.rowLabel.draw(renderer, "APPROACH VECTOR", 36, 104, DIM);
		this.rowLabel.draw(renderer, "RANGE", 36, 128, DIM);
		this.rowValue.draw(
			renderer,
			target === undefined
				? `${metrics.range.toFixed(0)} PX  ·  CAPTURE ${captureLimit}`
				: `${metrics.range.toFixed(0)} PX  ·  CENTER ${captureLimit}`,
			304,
			128,
			rangeColour,
			"right",
		);
		this.rowLabel.draw(renderer, "CLOSURE", 36, 150, DIM);
		this.rowValue.draw(
			renderer,
			`${metrics.closingSpeed >= 0 ? "+" : ""}${metrics.closingSpeed.toFixed(1)} PX/S`,
			304,
			150,
			metrics.closingSpeed > speedLimit ? AMBER : INK,
			"right",
		);
		this.rowLabel.draw(renderer, "SPEED", 36, 172, DIM);
		this.rowValue.draw(
			renderer,
			`${speed.toFixed(1)} / ${speedLimit}`,
			304,
			172,
			speedColour,
			"right",
		);
		this.rowLabel.draw(renderer, "ALIGN", 36, 194, DIM);
		this.rowValue.draw(
			renderer,
			`${((metrics.headingError * 180) / Math.PI).toFixed(0)}° / ${((angleLimit * 180) / Math.PI).toFixed(0)}°`,
			304,
			194,
			headingColour,
			"right",
		);
		this.rowLabel.draw(renderer, "SPIN", 36, 216, DIM);
		this.rowValue.draw(
			renderer,
			`${metrics.angularSpeed.toFixed(2)} / ${spinLimit}`,
			304,
			216,
			spinColour,
			"right",
		);

		const allGood =
			metrics.range <= captureLimit &&
			speed <= speedLimit &&
			metrics.headingError <= angleLimit &&
			metrics.angularSpeed <= spinLimit;
		this.banner.draw(
			renderer,
			state.phase === "success"
				? "RECOVERY LOCKED"
				: state.phase === "failed"
					? "PRESSURE HULL LOST"
					: state.ship.fuel <= 0
						? "FUEL EMPTY · COASTING"
						: allGood
							? "DOCKING WINDOW OPEN · HOLD THE LINE"
							: metrics.range < 150 && speed > speedLimit
								? "CLOSING FAST · COUNTER-BURN"
								: "CORRECT POSITION · VELOCITY · ORIENTATION",
			VIEWPORT_W / 2,
			647,
			state.phase === "failed"
				? RED
				: state.phase === "success"
					? TEAL
					: allGood
						? TEAL
						: metrics.range < 150 && speed > speedLimit
							? RED
							: AMBER,
			"center",
		);

		for (let index = 0; index < state.berths.length; index++) {
			const berth = state.berths[index];
			const active = index === state.nextBerth;
			const colour = berth.secured ? TEAL : active ? AMBER : DIM;
			this.berthLabel.draw(
				renderer,
				`BERTH ${berth.id}`,
				berth.x,
				berth.y - BERTH_RADIUS - 31,
				colour,
				"center",
			);
			this.berthSub.draw(
				renderer,
				berth.secured
					? "SECURED"
					: `${berth.spin >= 0 ? "+" : ""}${berth.spin.toFixed(2)} RAD/S`,
				berth.x,
				berth.y + BERTH_RADIUS + 24,
				berth.secured ? TEAL : active ? "#b7a778" : FAINT,
				"center",
			);
		}
		this.berthLabel.draw(
			renderer,
			"RECOVERY",
			RECOVERY.x,
			RECOVERY.y - RECOVERY_RADIUS - 24,
			state.nextBerth >= 3 ? TEAL : DIM,
			"center",
		);
		this.berthSub.draw(
			renderer,
			"FINAL CAPTURE",
			RECOVERY.x,
			RECOVERY.y + RECOVERY_RADIUS + 20,
			state.nextBerth >= 3 ? TEAL : FAINT,
			"center",
		);
		this.berthLabel.draw(
			renderer,
			"MOTHERSHIP // CV-09",
			112,
			414,
			DIM,
			"center",
		);
		this.berthSub.draw(renderer, "DEPARTURE FRAME", 112, 430, FAINT, "center");
	}

	override update(): boolean {
		return true;
	}

	override draw(renderer: AnyRenderer): void {
		const state = this.view.state;
		this.panel(renderer, 20, 16, 374, 58);
		this.panel(renderer, 464, 16, 352, 58);
		this.panel(renderer, 896, 16, 364, 76);
		this.panel(renderer, 20, 86, 304, 150);
		this.panel(renderer, 20, 620, 580, 76);

		this.drawLabels(renderer);

		this.controls.draw(
			renderer,
			"W / S  FORE-AFT    A / D  LATERAL    Q / E  ROTATE",
			36,
			642,
			INK,
		);
		this.controls.draw(renderer, "SHIFT  BOOST     R  RESET", 36, 662, DIM);
		this.controls.draw(
			renderer,
			"THRUST CHANGES VELOCITY — RELEASING THE KEY CHANGES NOTHING",
			36,
			681,
			FAINT,
		);

		if (state.phase === "success" || state.phase === "failed") {
			renderer.setGlobalAlpha(0.72);
			renderer.setColor("#02050b");
			renderer.fillRect(0, 0, VIEWPORT_W, VIEWPORT_H);
			renderer.setGlobalAlpha(1);

			const success = state.phase === "success";
			this.overlayTitle.draw(
				renderer,
				success ? "DOCKING COMPLETE" : "HULL BREACH",
				VIEWPORT_W / 2,
				306,
				success ? TEAL : RED,
				"center",
			);
			this.overlaySub.draw(
				renderer,
				success
					? "All three berths secured. Pressure hull intact."
					: `Impact ${state.lastImpact.toFixed(0)} px/s exceeded the pressure hull's limit.`,
				VIEWPORT_W / 2,
				354,
				success ? INK : "#ffb2bc",
				"center",
			);
			this.overlayHint.draw(
				renderer,
				`SEED 0x${FIXED_SEED.toString(16).toUpperCase()}  ·  PRESS R TO RUN AGAIN`,
				VIEWPORT_W / 2,
				392,
				DIM,
				"center",
			);
		}
	}
}
