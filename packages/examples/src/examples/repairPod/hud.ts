/**
 * melonJS — Repair Pod docking example: mission HUD and result card.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { Container, Renderable, type Renderer, Text } from "melonjs";
import {
	CAPTURE_RADIUS,
	COLORS,
	DOCK_MAX_ANGLE_ERROR,
	DOCK_MAX_REL_SPEED,
	FUEL_MAX,
	HULL_MAX,
	SIGNAL_RADIUS,
	VIEWPORT_H,
	VIEWPORT_W,
} from "./constants";
import type { MissionState, MissionTelemetry } from "./types";

const formatClock = (ms: number) => {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const minutes = Math.floor(total / 60)
		.toString()
		.padStart(2, "0");
	const seconds = (total % 60).toString().padStart(2, "0");
	return `${minutes}:${seconds}`;
};

const percent = (value: number, max: number) => {
	return Math.max(0, Math.min(1, value / max));
};

const barColor = (ratio: number, normal: string, warning: string) => {
	return ratio < 0.24 ? warning : normal;
};

class HudChrome extends Renderable {
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
		const hullRatio = percent(data.hull, HULL_MAX);
		const fuelRatio = percent(data.fuel, FUEL_MAX);
		const signalRatio =
			data.state === "lost"
				? 0
				: percent(SIGNAL_RADIUS - data.range, SIGNAL_RADIUS);

		renderer.save();
		renderer.setLineDash([]);
		renderer.setGlobalAlpha(0.82);
		renderer.setColor(COLORS.panel);
		renderer.fillRoundRect(22, 18, 360, 102, 8);
		renderer.fillRoundRect(VIEWPORT_W - 446, 18, 424, 102, 8);
		renderer.fillRoundRect(22, VIEWPORT_H - 178, 322, 112, 8);
		renderer.fillRoundRect(VIEWPORT_W - 388, VIEWPORT_H - 178, 366, 112, 8);
		renderer.fillRoundRect(VIEWPORT_W / 2 - 300, VIEWPORT_H - 44, 600, 28, 6);

		renderer.setGlobalAlpha(0.75);
		renderer.setColor(COLORS.panelEdge);
		renderer.lineWidth = 1;
		renderer.strokeRoundRect(22, 18, 360, 102, 8);
		renderer.strokeRoundRect(VIEWPORT_W - 446, 18, 424, 102, 8);
		renderer.strokeRoundRect(22, VIEWPORT_H - 178, 322, 112, 8);
		renderer.strokeRoundRect(VIEWPORT_W - 388, VIEWPORT_H - 178, 366, 112, 8);
		renderer.strokeRoundRect(VIEWPORT_W / 2 - 300, VIEWPORT_H - 44, 600, 28, 6);

		const bar = (
			x: number,
			y: number,
			width: number,
			ratio: number,
			color: string,
		) => {
			renderer.setGlobalAlpha(0.22);
			renderer.setColor(color);
			renderer.fillRect(x, y, width, 6);
			renderer.setGlobalAlpha(1);
			renderer.fillRect(x, y, width * ratio, 6);
			renderer.setGlobalAlpha(0.3);
			renderer.setColor(COLORS.ink);
			for (let i = 1; i < 4; i++) {
				renderer.fillRect(x + (width * i) / 4, y - 2, 1, 10);
			}
		};

		renderer.setGlobalAlpha(1);
		bar(42, 76, 312, hullRatio, barColor(hullRatio, COLORS.hull, COLORS.red));
		bar(
			42,
			104,
			312,
			fuelRatio,
			barColor(fuelRatio, COLORS.fuel, COLORS.orange),
		);
		bar(
			VIEWPORT_W - 418,
			76,
			366,
			signalRatio,
			barColor(signalRatio, COLORS.cyan, COLORS.orange),
		);

		// A compact docking envelope diagram in the lower-right card. The
		// marker is the pod's relative speed vs. the clean-capture limit.
		const gaugeX = VIEWPORT_W - 352;
		const gaugeY = VIEWPORT_H - 91;
		const gaugeW = 296;
		const relRatio = Math.min(1.45, data.relativeSpeed / DOCK_MAX_REL_SPEED);
		renderer.setGlobalAlpha(0.25);
		renderer.setColor(COLORS.cyanSoft);
		renderer.fillRect(gaugeX, gaugeY, gaugeW, 5);
		renderer.setGlobalAlpha(1);
		renderer.setColor(
			data.relativeSpeed <= DOCK_MAX_REL_SPEED ? COLORS.green : COLORS.orange,
		);
		renderer.fillRect(gaugeX, gaugeY, Math.min(gaugeW, gaugeW * relRatio), 5);
		renderer.setColor(COLORS.ink);
		renderer.fillRect(gaugeX + gaugeW * 0.69, gaugeY - 3, 1, 11);

		// The reticle that must be inside the capture ring.
		renderer.setGlobalAlpha(0.38);
		renderer.setColor(COLORS.cyan);
		renderer.setLineDash([3, 4]);
		renderer.strokeEllipse(
			VIEWPORT_W - 68,
			VIEWPORT_H - 137,
			CAPTURE_RADIUS * 0.5,
			CAPTURE_RADIUS * 0.5,
		);
		renderer.setLineDash([]);
		const markerAngle =
			data.angleError / Math.max(DOCK_MAX_ANGLE_ERROR, 0.0001);
		const markerX =
			VIEWPORT_W - 68 + Math.max(-1, Math.min(1, markerAngle)) * 18;
		const markerY =
			VIEWPORT_H - 137 + Math.max(-1, Math.min(1, markerAngle)) * 18;
		renderer.setColor(
			Math.abs(data.angleError) <= DOCK_MAX_ANGLE_ERROR
				? COLORS.green
				: COLORS.orange,
		);
		renderer.fillEllipse(markerX, markerY, 3.5, 3.5);
		renderer.restore();
	}
}

export class MissionHud extends Container {
	private readonly data: MissionTelemetry;
	private readonly clock: Text;
	private readonly target: Text;
	private readonly hull: Text;
	private readonly fuel: Text;
	private readonly signal: Text;
	private readonly velocity: Text;
	private readonly relative: Text;
	private readonly range: Text;
	private readonly align: Text;
	private readonly status: Text;
	private readonly elapsed: Text;

	constructor(data: MissionTelemetry) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;
		this.data = data;

		this.addChild(new HudChrome(data), 0);

		const text = (
			x: number,
			y: number,
			size: number,
			color: string,
			value: string,
			bold = false,
			align: "left" | "center" | "right" = "left",
		) => {
			const label = new Text(x, y, {
				font: "Courier New",
				size,
				fillStyle: color,
				textAlign: align,
				textBaseline: "top",
				bold,
				text: value,
			});
			this.addChild(label, 2);
			return label;
		};

		text(42, 30, 19, COLORS.ink, "MRC-7  //  ORBITAL MAINTENANCE", true);
		text(42, 53, 10, COLORS.dim, "THREE-LOCK DOCKING QUALIFICATION");
		this.hull = text(42, 65, 10, COLORS.ink, "HULL PRESSURE 100%");
		this.fuel = text(42, 93, 10, COLORS.ink, "RCS FUEL 100%");

		this.clock = text(
			VIEWPORT_W - 42,
			30,
			26,
			COLORS.ink,
			"MISSION 03:00",
			true,
			"right",
		);
		this.target = text(
			VIEWPORT_W - 42,
			61,
			12,
			COLORS.cyan,
			"ACTIVE // PORT 01",
			true,
			"right",
		);
		this.signal = text(
			VIEWPORT_W - 42,
			89,
			10,
			COLORS.ink,
			"DOCK LINK 100%",
			false,
			"right",
		);

		text(42, VIEWPORT_H - 168, 10, COLORS.dim, "FLIGHT TELEMETRY");
		this.velocity = text(
			42,
			VIEWPORT_H - 147,
			14,
			COLORS.ink,
			"VELOCITY 000.0",
		);
		this.relative = text(42, VIEWPORT_H - 124, 12, COLORS.ink, "REL VEL 000.0");
		this.range = text(42, VIEWPORT_H - 103, 12, COLORS.ink, "RANGE 0000 px");
		this.elapsed = text(42, VIEWPORT_H - 82, 10, COLORS.dim, "MISSION T+00:00");

		this.align = text(
			VIEWPORT_W - 408,
			VIEWPORT_H - 168,
			10,
			COLORS.dim,
			"DOCKING ENVELOPE",
		);
		this.status = text(
			VIEWPORT_W - 408,
			VIEWPORT_H - 147,
			14,
			COLORS.cyan,
			"CAPTURE // CLEAR",
			true,
		);
		text(
			VIEWPORT_W - 408,
			VIEWPORT_H - 125,
			10,
			COLORS.dim,
			`REL < ${DOCK_MAX_REL_SPEED.toFixed(0)} px/s`,
		);
		text(
			VIEWPORT_W - 408,
			VIEWPORT_H - 110,
			10,
			COLORS.dim,
			"ALIGN < 16.0 deg",
		);

		text(
			VIEWPORT_W / 2,
			VIEWPORT_H - 37,
			10,
			COLORS.dim,
			"W/S FORE-AFT   A/D PORT-STBD   Q/E ATTITUDE   R RESTART   //   NO AUTO-BRAKE",
			false,
			"center",
		);
	}

	override update(dt: number): boolean {
		const data = this.data;
		this.clock.setText(`MISSION ${formatClock(data.remainingMs)}`);
		this.target.setText(
			data.state === "complete"
				? "ALL THREE PORTS SECURED"
				: `ACTIVE // PORT ${String(data.activeIndex + 1).padStart(2, "0")}`,
		);
		this.hull.setText(
			`HULL PRESSURE ${Math.round(data.hull).toString().padStart(3, "0")}%`,
		);
		this.fuel.setText(
			`RCS FUEL ${Math.round(data.fuel).toString().padStart(3, "0")}%`,
		);
		const link = Math.round(
			Math.max(
				0,
				Math.min(100, ((SIGNAL_RADIUS - data.range) / SIGNAL_RADIUS) * 100),
			),
		);
		this.signal.setText(`DOCK LINK ${String(link).padStart(3, "0")}%`);
		this.velocity.setText(
			`VELOCITY ${data.speed.toFixed(1).padStart(5, "0")} px/s`,
		);
		this.relative.setText(
			`REL VEL ${data.relativeSpeed.toFixed(1).padStart(5, "0")} px/s`,
		);
		this.range.setText(
			`RANGE ${Math.round(data.range).toString().padStart(4, "0")} px`,
		);
		this.elapsed.setText(`MISSION T+${formatClock(data.elapsedMs)}`);

		const angleDegrees = (data.angleError * 180) / Math.PI;
		this.align.setText(
			`ALIGN ${angleDegrees >= 0 ? "+" : ""}${angleDegrees.toFixed(1)} deg`,
		);

		const inSpeedEnvelope = data.relativeSpeed <= DOCK_MAX_REL_SPEED;
		const inAngleEnvelope = Math.abs(data.angleError) <= DOCK_MAX_ANGLE_ERROR;
		this.status.setText(
			data.state !== "flying"
				? data.state === "complete"
					? "CAPTURE // COMPLETE"
					: "CAPTURE // ABORTED"
				: inSpeedEnvelope && inAngleEnvelope
					? "CAPTURE // CLEAR"
					: inSpeedEnvelope
						? "CAPTURE // ALIGN"
						: "CAPTURE // TOO FAST",
		);
		this.status.fillStyle.parseCSS(
			data.state !== "flying"
				? data.state === "complete"
					? COLORS.green
					: COLORS.red
				: inSpeedEnvelope && inAngleEnvelope
					? COLORS.green
					: COLORS.orange,
		);
		this.signal.fillStyle.parseCSS(link < 25 ? COLORS.orange : COLORS.ink);
		this.fuel.fillStyle.parseCSS(data.exhausted ? COLORS.orange : COLORS.ink);
		this.hull.fillStyle.parseCSS(data.hull < 35 ? COLORS.red : COLORS.ink);
		super.update(dt);
		return true;
	}
}

class ResultBackdrop extends Renderable {
	private readonly state: MissionState;

	constructor(state: MissionState) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;
		this.state = state;
	}

	override draw(renderer: Renderer): void {
		const success = this.state === "complete";
		const accent = success ? COLORS.green : COLORS.failure;
		renderer.save();
		renderer.setLineDash([]);
		renderer.setGlobalAlpha(0.84);
		renderer.setColor(COLORS.space);
		renderer.fillRect(0, 0, VIEWPORT_W, VIEWPORT_H);
		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.panel);
		renderer.fillRoundRect(VIEWPORT_W / 2 - 326, 174, 652, 404, 12);
		renderer.setColor(accent);
		renderer.lineWidth = 2;
		renderer.strokeRoundRect(VIEWPORT_W / 2 - 326, 174, 652, 404, 12);
		renderer.setGlobalAlpha(0.2);
		renderer.fillRect(VIEWPORT_W / 2 - 326, 174, 652, 5);
		renderer.restore();
	}
}

const failureTitle = (state: MissionState) => {
	switch (state) {
		case "collision":
			return "FAILURE  //  HULL BREACH";
		case "lost":
			return "FAILURE  //  SIGNAL LOST";
		case "timeout":
			return "FAILURE  //  TIME LIMIT";
		default:
			return "";
	}
};

const failureCause = (state: MissionState) => {
	switch (state) {
		case "collision":
			return "COLLISION";
		case "lost":
			return "LOST CONTACT";
		case "timeout":
			return "TIMEOUT";
		default:
			return "";
	}
};

export class ResultOverlay extends Container {
	constructor(data: MissionTelemetry) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;
		this.addChild(new ResultBackdrop(data.state), 0);

		const success = data.state === "complete";
		const accent = success ? COLORS.green : COLORS.failure;
		const addText = (
			y: number,
			size: number,
			color: string,
			value: string,
			bold = false,
		) => {
			const label = new Text(VIEWPORT_W / 2, y, {
				font: "Courier New",
				size,
				fillStyle: color,
				textAlign: "center",
				textBaseline: "top",
				bold,
				text: value,
			});
			this.addChild(label, 2);
			return label;
		};

		addText(
			205,
			12,
			accent,
			success
				? "MRC-7  //  DOCKING QUALIFICATION"
				: "MRC-7  //  MISSION TERMINATED",
			true,
		);
		addText(
			232,
			34,
			accent,
			success ? "MISSION COMPLETE" : failureTitle(data.state),
			true,
		);
		addText(
			286,
			18,
			COLORS.ink,
			success ? "ALL THREE ROTATING BERTHS SECURED" : failureCause(data.state),
			true,
		);
		addText(
			316,
			13,
			COLORS.dim,
			success
				? `Fuel remaining ${Math.round(data.fuel)}%  ·  hull ${Math.round(data.hull)}%`
				: data.failureDetail,
		);

		const statsY = 380;
		addText(
			statsY,
			11,
			COLORS.dim,
			"ELAPSED TIME                         HULL PRESSURE                         FUEL REMAINING",
		);
		addText(
			statsY + 24,
			26,
			COLORS.ink,
			`${formatClock(data.elapsedMs).padStart(5, "0")}                                   ${Math.round(
				data.hull,
			)
				.toString()
				.padStart(3, "0")}%                                      ${Math.round(
				data.fuel,
			)
				.toString()
				.padStart(3, "0")}%`,
			true,
		);
		addText(
			478,
			12,
			COLORS.dim,
			`PORTS SECURED ${data.completed} / 3  ·  LAST CONTACT ${data.lastContact === null ? "NONE" : `X${Math.round(data.lastContact.x)} Y${Math.round(data.lastContact.y)}`}`,
		);
		addText(
			522,
			13,
			COLORS.ink,
			"PRESS R OR CLICK TO REPLAY THE FIXED SCENARIO",
			true,
		);
	}
}

export { formatClock };
