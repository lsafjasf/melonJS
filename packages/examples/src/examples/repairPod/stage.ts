/**
 * melonJS — Repair Pod docking example: fixed mission loop.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * The pod is a planck dynamic body. Its thrusters add velocity directly to
 * the body once per frame (never position, and never a drag term), so an
 * empty fuel tank leaves it coasting exactly as Newton would. The berths are
 * compound static bodies turned with `adapter.setAngle()`, which is why their
 * rotated arms collide correctly.
 */

import { type Application, input, Stage, state, Vector2d } from "melonjs";
import {
	BERTHS,
	CAPTURE_RADIUS,
	COLORS,
	DOCK_MAX_ANGLE_ERROR,
	DOCK_MAX_REL_SPEED,
	DOCK_TARGET_RADIUS,
	FUEL_MAX,
	HULL_MAX,
	MAX_ANGULAR_SPEED,
	MISSION_TIME_MS,
	POD_HEIGHT,
	POD_START,
	POD_START_ANGLE,
	POD_WIDTH,
	ROTATION_ACCEL,
	ROTATION_BURN,
	SIGNAL_RADIUS,
	TRANSLATION_ACCEL,
	TRANSLATION_BURN,
	VIEWPORT_H,
	VIEWPORT_W,
	WORLD_MARGIN,
} from "./constants";
import { MissionHud, ResultOverlay } from "./hud";
import {
	Berth,
	Pod,
	StarField,
	TelemetryOverlay,
	wrapAngleDiff,
} from "./scene";
import type {
	FailureReason,
	MissionTelemetry,
	Point,
	RepairPodHarness,
} from "./types";

const distance = (a: Point, b: Point) => {
	return Math.hypot(a.x - b.x, a.y - b.y);
};

const clamp = (value: number, low: number, high: number) => {
	return Math.max(low, Math.min(high, value));
};

const copyPoint = (point: Point): Point => ({ x: point.x, y: point.y });

type HarnessGlobal = typeof globalThis & {
	__repairPodHarness?: RepairPodHarness;
};

export class RepairPodStage extends Stage {
	private app!: Application;
	private pod!: Pod;
	private berths: Berth[] = [];
	private result: ResultOverlay | undefined;

	private readonly velocityScratch = new Vector2d();
	private readonly positionScratch = new Vector2d();

	private activeIndex = 0;
	private completed = 0;
	private hull = HULL_MAX;
	private fuel = FUEL_MAX;
	private elapsedMs = 0;
	private impactCooldownMs = 0;
	private resultPending = false;
	private previousSpeed = 0;
	private previousAngleError = 0;

	private readonly telemetry: MissionTelemetry = {
		state: "flying",
		failureReason: null,
		failureDetail: "",
		activeIndex: 0,
		completed: 0,
		hull: HULL_MAX,
		fuel: FUEL_MAX,
		elapsedMs: 0,
		remainingMs: MISSION_TIME_MS,
		speed: 0,
		relativeSpeed: 0,
		range: 0,
		angleError: 0,
		exhausted: false,
		podCenter: copyPoint(POD_START),
		podAngle: POD_START_ANGLE,
		velocity: { x: 0, y: 0 },
		dockPoint: { x: 0, y: 0 },
		dockAngle: 0,
		lastContact: null,
		message: "Align with the rotating mouth; the clamp does not brake for you.",
	};

	override onResetEvent(app: Application): void {
		this.app = app;
		this.app.world.backgroundColor.parseCSS(COLORS.space);
		input.registerPointerEvent(
			"pointerdown",
			this.app.viewport,
			this.onPointerDown,
		);
		this.buildScene();
		this.installHarness();
	}

	override onDestroyEvent(): void {
		input.releasePointerEvent("pointerdown", this.app.viewport);
		const harnessGlobal = globalThis as HarnessGlobal;
		if (harnessGlobal.__repairPodHarness !== undefined) {
			delete harnessGlobal.__repairPodHarness;
		}
	}

	override update(dt: number): boolean {
		if (state.isPaused()) {
			return true;
		}

		if (input.isKeyPressed("restart")) {
			this.restartMission();
			return true;
		}

		if (this.telemetry.state === "flying") {
			this.elapsedMs += dt;
			this.impactCooldownMs = Math.max(0, this.impactCooldownMs - dt);
			this.applyControls(dt);
			this.readTelemetry();
			this.checkMissionLimits();

			if (this.telemetry.state === "flying") {
				this.checkCapture();
			}
		} else {
			this.readTelemetry();
		}

		this.updateBerthVisuals();
		this.readTelemetry();
		this.showResultIfReady();
		this.previousSpeed = this.telemetry.speed;
		this.previousAngleError = this.telemetry.angleError;
		return true;
	}

	private get adapter() {
		return this.app.world.adapter;
	}

	private get activeBerth(): Berth | undefined {
		return this.berths[this.activeIndex];
	}

	private buildScene(): void {
		this.berths = BERTHS.map((spec, index) => new Berth(index, spec));
		for (const berth of this.berths) {
			this.app.world.addChild(berth, 10);
			this.adapter.setAngle?.(berth, berth.angle);
		}

		this.pod = new Pod(POD_START.x, POD_START.y);
		this.pod.onImpact = this.onFrameImpact;
		this.app.world.addChild(this.pod, 20);
		this.adapter.setAngle?.(this.pod, POD_START_ANGLE);

		this.app.world.addChild(
			new StarField(() => {
				return this.pod.center;
			}),
			-100,
		);
		this.app.world.addChild(new TelemetryOverlay(this.telemetry), 30);

		this.app.world.addChild(new MissionHud(this.telemetry), 100);
		this.result = undefined;

		this.activeIndex = 0;
		this.completed = 0;
		this.hull = HULL_MAX;
		this.fuel = FUEL_MAX;
		this.elapsedMs = 0;
		this.impactCooldownMs = 0;
		this.resultPending = false;
		this.previousSpeed = 0;
		this.previousAngleError = 0;
		this.telemetry.state = "flying";
		this.telemetry.failureReason = null;
		this.telemetry.failureDetail = "";
		this.telemetry.lastContact = null;
		this.telemetry.message =
			"Align with the rotating mouth; the clamp does not brake for you.";
		this.readTelemetry();
		this.updateBerthVisuals();
	}

	private restartMission(): void {
		this.app.world.reset();
		this.buildScene();
		this.installHarness();
	}

	private readonly onPointerDown = () => {
		if (this.telemetry.state !== "flying") {
			this.restartMission();
			return false;
		}
		return undefined;
	};

	private applyControls(dt: number): void {
		const seconds = dt / 1000;
		const fore = input.isKeyPressed("fore");
		const aft = input.isKeyPressed("aft");
		const port = input.isKeyPressed("port");
		const starboard = input.isKeyPressed("starboard");
		const ccw = input.isKeyPressed("rotate-left");
		const cw = input.isKeyPressed("rotate-right");

		const forward = (fore ? 1 : 0) - (aft ? 1 : 0);
		const lateral = (starboard ? 1 : 0) - (port ? 1 : 0);
		const turn = (ccw ? 1 : 0) - (cw ? 1 : 0);
		this.pod.thrust.fore = fore;
		this.pod.thrust.aft = aft;
		this.pod.thrust.port = port;
		this.pod.thrust.starboard = starboard;

		if (this.fuel <= 0) {
			this.pod.thrust = {
				fore: false,
				aft: false,
				port: false,
				starboard: false,
			};
			return;
		}

		if (forward !== 0 || lateral !== 0) {
			const heading = this.adapter.getAngle?.(this.pod) ?? 0;
			const fx = Math.cos(heading);
			const fy = Math.sin(heading);
			const sx = -Math.sin(heading);
			const sy = Math.cos(heading);
			let ax = fx * forward + sx * lateral;
			let ay = fy * forward + sy * lateral;
			const length = Math.hypot(ax, ay);
			if (length > 0) {
				ax /= length;
				ay /= length;
			}
			const velocity = this.adapter.getVelocity(this.pod, this.velocityScratch);
			velocity.x += ax * TRANSLATION_ACCEL * seconds;
			velocity.y += ay * TRANSLATION_ACCEL * seconds;
			this.adapter.setVelocity(this.pod, velocity);
			const activeAxes = (fore !== aft ? 1 : 0) + (starboard !== port ? 1 : 0);
			this.fuel = Math.max(
				0,
				this.fuel - TRANSLATION_BURN * activeAxes * seconds,
			);
		}

		if (turn !== 0) {
			const omega = this.adapter.getAngularVelocity?.(this.pod) ?? 0;
			this.adapter.setAngularVelocity?.(
				this.pod,
				clamp(
					omega + turn * ROTATION_ACCEL * seconds,
					-MAX_ANGULAR_SPEED,
					MAX_ANGULAR_SPEED,
				),
			);
			this.fuel = Math.max(0, this.fuel - ROTATION_BURN * seconds);
		}
	}

	private readTelemetry(): void {
		const berth = this.activeBerth;
		const podCenter = this.pod.center;
		const velocity = this.adapter.getVelocity(this.pod, this.velocityScratch);
		this.telemetry.activeIndex = this.activeIndex;
		this.telemetry.completed = this.completed;
		this.telemetry.hull = this.hull;
		this.telemetry.fuel = this.fuel;
		this.telemetry.elapsedMs = this.elapsedMs;
		this.telemetry.remainingMs = Math.max(0, MISSION_TIME_MS - this.elapsedMs);
		this.telemetry.exhausted = this.fuel <= 0;
		this.telemetry.podCenter = copyPoint(podCenter);
		this.telemetry.podAngle = this.adapter.getAngle?.(this.pod) ?? 0;
		this.telemetry.velocity = { x: velocity.x, y: velocity.y };
		this.telemetry.speed = Math.hypot(velocity.x, velocity.y);

		if (berth === undefined) {
			return;
		}

		const dockPoint = berth.dockPoint;
		const dockVelocity = berth.dockVelocity;
		const relativeX = velocity.x - dockVelocity.x;
		const relativeY = velocity.y - dockVelocity.y;
		this.telemetry.dockPoint = copyPoint(dockPoint);
		this.telemetry.dockAngle = berth.dockAngle;
		this.telemetry.range = distance(podCenter, dockPoint);
		this.telemetry.relativeSpeed = Math.hypot(relativeX, relativeY);
		this.telemetry.angleError = wrapAngleDiff(
			this.telemetry.podAngle - berth.dockAngle,
		);
	}

	private checkMissionLimits(): void {
		const berth = this.activeBerth;
		if (berth === undefined) {
			return;
		}
		const podCenter = this.pod.center;
		const centerRange = distance(podCenter, berth.center);
		const outside =
			podCenter.x < -WORLD_MARGIN ||
			podCenter.x > VIEWPORT_W + WORLD_MARGIN ||
			podCenter.y < -WORLD_MARGIN ||
			podCenter.y > VIEWPORT_H + WORLD_MARGIN;
		if (centerRange > SIGNAL_RADIUS || outside) {
			this.fail(
				"lost",
				`Telemetry clamped at ${Math.round(centerRange)} px; the active port is beyond the ${SIGNAL_RADIUS} px link radius.`,
			);
			return;
		}
		if (this.elapsedMs >= MISSION_TIME_MS) {
			this.fail(
				"timeout",
				"Mission clock exhausted before all three rotating berths were secured.",
			);
		}
	}

	private checkCapture(): void {
		const berth = this.activeBerth;
		if (berth === undefined || this.impactCooldownMs > 0) {
			return;
		}
		if (this.telemetry.range > CAPTURE_RADIUS) {
			return;
		}
		if (
			this.telemetry.relativeSpeed <= DOCK_MAX_REL_SPEED &&
			Math.abs(this.telemetry.angleError) <= DOCK_MAX_ANGLE_ERROR
		) {
			this.secureBerth(berth);
		} else {
			this.registerImpact(
				this.telemetry.relativeSpeed,
				this.telemetry.angleError,
				berth.dockPoint,
			);
		}
	}

	private secureBerth(berth: Berth): void {
		berth.spin = 0;
		berth.flash = 1;
		this.completed++;
		this.telemetry.lastContact = {
			...berth.dockPoint,
			at: this.elapsedMs,
			label: berth.spec.label,
		};

		const dockAngle = berth.dockAngle;
		const center = berth.dockPoint;
		this.positionScratch.set(
			center.x - POD_WIDTH / 2,
			center.y - POD_HEIGHT / 2,
		);
		this.adapter.setPosition(this.pod, this.positionScratch);
		this.adapter.setAngle?.(this.pod, dockAngle);
		this.adapter.setVelocity(this.pod, this.velocityScratch.set(0, 0));
		this.adapter.setAngularVelocity?.(this.pod, 0);
		this.app.viewport.shake(2, 160);

		if (this.completed >= BERTHS.length) {
			this.telemetry.state = "complete";
			this.telemetry.message = "All three ports secured.";
			this.resultPending = true;
		} else {
			this.activeIndex++;
			this.telemetry.message = `${berth.spec.label} secured. Vector to the next rotating mouth.`;
		}
		this.readTelemetry();
	}

	private readonly onFrameImpact = () => {
		if (
			this.telemetry.state !== "flying" ||
			this.impactCooldownMs > 0 ||
			this.pod === undefined
		) {
			return;
		}
		this.registerImpact(
			this.previousSpeed,
			this.previousAngleError,
			this.pod.center,
			true,
		);
	};

	private registerImpact(
		impactSpeed: number,
		angleError: number,
		point: Point,
		frameContact = false,
	): void {
		const anglePenalty = Math.max(
			0,
			Math.abs(angleError) - DOCK_MAX_ANGLE_ERROR,
		);
		const damage = Math.max(
			4,
			Math.round(
				5 +
					Math.max(0, impactSpeed - 24) * 1.35 +
					(anglePenalty * 180) / Math.PI,
			),
		);
		this.hull = Math.max(0, this.hull - damage);
		this.impactCooldownMs = 720;
		this.telemetry.lastContact = {
			...point,
			at: this.elapsedMs,
			label: frameContact ? "FRAME CONTACT" : "CLAMP CONTACT",
		};
		this.app.viewport.shake(8, 260);

		if (this.hull <= 0) {
			this.fail(
				"collision",
				`Hull pressure reached zero after a ${Math.round(impactSpeed)} px/s impact (${Math.round(damage)} damage).`,
			);
			return;
		}

		if (!frameContact) {
			const awayX = this.pod.center.x - point.x;
			const awayY = this.pod.center.y - point.y;
			const awayLength = Math.hypot(awayX, awayY) || 1;
			const bounce = Math.max(18, impactSpeed * 0.42);
			this.adapter.setVelocity(
				this.pod,
				this.velocityScratch.set(
					(awayX / awayLength) * bounce,
					(awayY / awayLength) * bounce,
				),
			);
		}
		this.telemetry.message =
			this.telemetry.relativeSpeed > DOCK_MAX_REL_SPEED
				? `Too fast for the clamp: ${Math.round(impactSpeed)} px/s. Hull -${damage}.`
				: `Attitude outside the clamp: hull -${damage}.`;
	}

	private fail(reason: FailureReason, detail: string): void {
		if (this.telemetry.state !== "flying") {
			return;
		}
		this.telemetry.state = reason;
		this.telemetry.failureReason = reason;
		this.telemetry.failureDetail = detail;
		this.telemetry.message = detail;
		this.adapter.setVelocity(this.pod, this.velocityScratch.set(0, 0));
		this.adapter.setAngularVelocity?.(this.pod, 0);
		this.resultPending = true;
	}

	private showResultIfReady(): void {
		if (!this.resultPending || this.result !== undefined) {
			return;
		}
		this.resultPending = false;
		this.result = new ResultOverlay(this.telemetry);
		this.app.world.addChild(this.result, 300);
	}

	private updateBerthVisuals(): void {
		for (const berth of this.berths) {
			berth.visualState =
				berth.index < this.completed
					? "completed"
					: this.telemetry.state === "complete"
						? "completed"
						: berth.index === this.activeIndex
							? "active"
							: "idle";
		}
	}

	private snapshot(): MissionTelemetry {
		return {
			...this.telemetry,
			podCenter: copyPoint(this.telemetry.podCenter),
			velocity: copyPoint(this.telemetry.velocity),
			dockPoint: copyPoint(this.telemetry.dockPoint),
			lastContact:
				this.telemetry.lastContact === null
					? null
					: { ...this.telemetry.lastContact },
		};
	}

	private installHarness(): void {
		(globalThis as HarnessGlobal).__repairPodHarness = {
			snapshot: () => this.snapshot(),
			restart: () => this.restartMission(),
			stageApproach: (speed: number) => this.stageApproach(speed),
			freezeActiveBerth: () => {
				const berth = this.activeBerth;
				if (berth !== undefined) {
					berth.spin = 0;
				}
				return this.snapshot();
			},
			forceFailure: (
				reason,
				detail = "Failure injected by the test harness.",
			) => {
				this.fail(reason, detail);
				this.readTelemetry();
				return this.snapshot();
			},
		};
	}

	private stageApproach(speed: number): MissionTelemetry {
		this.restartMission();
		const berth = this.berths[0];
		if (berth === undefined) {
			return this.snapshot();
		}
		const outwardX = Math.cos(berth.angle);
		const outwardY = Math.sin(berth.angle);
		const center = berth.center;
		const distanceFromCenter = DOCK_TARGET_RADIUS + 80;
		const podCenter = {
			x: center.x + outwardX * distanceFromCenter,
			y: center.y + outwardY * distanceFromCenter,
		};
		this.positionScratch.set(
			podCenter.x - POD_WIDTH / 2,
			podCenter.y - POD_HEIGHT / 2,
		);
		this.adapter.setPosition(this.pod, this.positionScratch);
		this.adapter.setAngle?.(this.pod, berth.dockAngle);
		this.adapter.setAngularVelocity?.(this.pod, berth.spin);
		this.adapter.setVelocity(
			this.pod,
			this.velocityScratch.set(-outwardX * speed, -outwardY * speed),
		);
		this.readTelemetry();
		this.previousSpeed = speed;
		this.previousAngleError = 0;
		return this.snapshot();
	}
}

export const bindRepairPodControls = () => {
	input.bindKey(input.KEY.W, "fore");
	input.bindKey(input.KEY.UP, "fore");
	input.bindKey(input.KEY.S, "aft");
	input.bindKey(input.KEY.DOWN, "aft");
	input.bindKey(input.KEY.A, "port");
	input.bindKey(input.KEY.LEFT, "port");
	input.bindKey(input.KEY.D, "starboard");
	input.bindKey(input.KEY.RIGHT, "starboard");
	input.bindKey(input.KEY.Q, "rotate-left");
	input.bindKey(input.KEY.E, "rotate-right");
	input.bindKey(input.KEY.R, "restart", true);
};
