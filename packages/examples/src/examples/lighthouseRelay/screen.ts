/**
 * melonJS — Lighthouse Relay HUD, labels and keyboard wiring.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	type Application,
	Container,
	input,
	Stage,
	state,
	Text,
} from "melonjs";
import {
	COLORS,
	codeBerth,
	codeColor,
	HEAT_CRITICAL,
	HEAT_WARN,
	TOTAL_HANDSHAKES,
	toneColor,
	VIEW_H,
	VIEW_W,
} from "./constants";
import { classifyPulse, RelayModel } from "./model";
import { RelayView } from "./view";

interface LabelOptions {
	bold?: boolean;
	align?: "left" | "center" | "right";
	wrap?: number;
	lineHeight?: number;
}

class HudLabel extends Text {
	private value = "";
	private color = "";

	constructor(
		x: number,
		y: number,
		text: string,
		size: number,
		color: string,
		options: LabelOptions = {},
	) {
		super(x, y, {
			font: "ui-monospace, Menlo, Consolas, monospace",
			size,
			fillStyle: color,
			bold: options.bold,
			textAlign: options.align ?? "left",
			textBaseline: "top",
			lineHeight: options.lineHeight ?? 1,
			wordWrapWidth: options.wrap ?? -1,
			text,
		});
		this.value = text;
		this.color = color;
	}

	setValue(text: string): void {
		if (text !== this.value) {
			this.value = text;
			this.setText(text);
		}
	}

	setColor(color: string): void {
		if (color !== this.color) {
			this.color = color;
			this.fillStyle.parseCSS(color);
		}
	}
}

const KEY_ACTIONS = {
	aimLeft: "lighthouseAimLeft",
	aimRight: "lighthouseAimRight",
	beam: "lighthouseBeam",
	replyShort: "lighthouseReplyShort",
	replyLong: "lighthouseReplyLong",
	send: "lighthouseSend",
	restart: "lighthouseRestart",
} as const;

const KEYCODES = [
	input.KEY.A,
	input.KEY.D,
	input.KEY.S,
	input.KEY.LEFT,
	input.KEY.RIGHT,
	input.KEY.ENTER,
	input.KEY.R,
];

const bindKeys = (): void => {
	input.bindKey(input.KEY.A, KEY_ACTIONS.aimLeft, true);
	input.bindKey(input.KEY.D, KEY_ACTIONS.aimRight, true);
	input.bindKey(input.KEY.S, KEY_ACTIONS.beam);
	input.bindKey(input.KEY.LEFT, KEY_ACTIONS.replyShort, true);
	input.bindKey(input.KEY.RIGHT, KEY_ACTIONS.replyLong, true);
	input.bindKey(input.KEY.ENTER, KEY_ACTIONS.send, true);
	input.bindKey(input.KEY.R, KEY_ACTIONS.restart, true);
};

const unbindKeys = (): void => {
	for (const keycode of KEYCODES) {
		input.unbindKey(keycode);
	}
};

export class RelayScreen extends Container {
	private readonly model = new RelayModel();

	private clearanceValue!: HudLabel;
	private vesselInfo!: HudLabel;
	private angleValue!: HudLabel;
	private pulseStatus!: HudLabel;
	private wearPct!: HudLabel;
	private p1Message!: HudLabel;

	private prompt!: HudLabel;
	private handshakeCounter!: HudLabel;

	private p2Status!: HudLabel;
	private heatPct!: HudLabel;
	private heatStatus!: HudLabel;
	private replyValue!: HudLabel;
	private logValue!: HudLabel;
	private p2Message!: HudLabel;

	private wonTitle!: HudLabel;
	private wonBody!: HudLabel;
	private wonHint!: HudLabel;

	constructor() {
		super(0, 0, VIEW_W, VIEW_H);
		this.anchorPoint.set(0, 0);
		this.floating = true;
		this.alwaysUpdate = true;

		this.addChild(new RelayView(this.model), 0);
		this.buildHeader();
		this.buildLeftPanel();
		this.buildStationPanel();
		this.buildRightPanel();
		this.buildWinOverlay();
		this.syncLabels();
	}

	override update(dt: number): boolean {
		this.model.update(dt, {
			aimLeft: input.isKeyPressed(KEY_ACTIONS.aimLeft),
			aimRight: input.isKeyPressed(KEY_ACTIONS.aimRight),
			beamHeld: input.isKeyPressed(KEY_ACTIONS.beam),
			replyShort: input.isKeyPressed(KEY_ACTIONS.replyShort),
			replyLong: input.isKeyPressed(KEY_ACTIONS.replyLong),
			send: input.isKeyPressed(KEY_ACTIONS.send),
			restart: input.isKeyPressed(KEY_ACTIONS.restart),
		});
		this.syncLabels();
		super.update(dt);
		return true;
	}

	private label(
		x: number,
		y: number,
		text: string,
		size: number,
		color: string,
		options: LabelOptions = {},
	): HudLabel {
		const label = new HudLabel(x, y, text, size, color, options);
		this.addChild(label, 10);
		return label;
	}

	private buildHeader(): void {
		this.label(30, 12, "LANTERN // BERTH 7", 34, COLORS.text, {
			bold: true,
		});
		this.label(31, 57, "TWO-KEEPER LIGHTHOUSE RELAY", 12, COLORS.muted);

		this.label(455, 26, "● SHORT", 14, COLORS.cyan, { bold: true });
		this.label(536, 28, "≤0.52s = BERTH A", 12, COLORS.text);
		this.label(716, 26, "— LONG", 14, COLORS.amber, { bold: true });
		this.label(786, 28, "≥0.72s = BERTH B", 12, COLORS.text);
		this.label(
			700,
			55,
			"THE SHIP RETURNS EVERY PULSE AS THREE FLASHES",
			9.5,
			COLORS.muted,
			{ align: "center" },
		);
		this.label(1370, 27, "3 HANDSHAKES · 1 SAFE BERTH", 12.5, COLORS.amber, {
			align: "right",
			bold: true,
		});
	}

	private buildLeftPanel(): void {
		this.label(52, 172, "P1 // SHIP WATCH", 27, COLORS.cyan, {
			bold: true,
		});
		this.label(
			52,
			204,
			"PRIVATE CHANNEL · SHIP + CLEARANCE ONLY",
			9.5,
			COLORS.muted,
		);
		this.label(60, 231, "DOCKING CLEARANCE", 9.5, COLORS.muted);
		this.clearanceValue = this.label(60, 246, "BERTH B", 33, COLORS.amber, {
			bold: true,
		});

		this.vesselInfo = this.label(
			60,
			414,
			"VESSEL TRACK 01 · CLEARANCE LONG · 0%",
			9.5,
			COLORS.muted,
		);

		this.label(60, 483, "TURNTABLE ANGLE", 9.5, COLORS.muted);
		this.angleValue = this.label(84, 499, "◀  AIM LEFT", 29, COLORS.cyan, {
			bold: true,
		});

		this.label(60, 556, "BEAM PULSE", 9.5, COLORS.muted);
		this.pulseStatus = this.label(
			60,
			614,
			"HOLD S TO TRANSMIT",
			10.5,
			COLORS.muted,
		);

		this.label(60, 638, "BEARING WEAR", 9.5, COLORS.muted);
		this.wearPct = this.label(449, 638, "0%", 10.5, COLORS.cyan, {
			align: "right",
		});

		this.p1Message = this.label(70, 697, "", 12.5, COLORS.text, {
			wrap: 365,
			lineHeight: 1.27,
		});

		this.label(
			60,
			813,
			"P1  [A] AIM ◀   [D] AIM ▶   [S] HOLD BEAM",
			9.5,
			COLORS.muted,
		);
		this.label(
			60,
			831,
			"BEAT 120 BPM · RELEASE IN A LIT WINDOW",
			8.5,
			COLORS.dim,
		);
	}

	private buildStationPanel(): void {
		this.label(520, 172, "TWIN LAMP STATION", 27, COLORS.amber, {
			bold: true,
		});
		this.label(
			700,
			204,
			"TWO PERMITTED ANGLES · ONE SHARED LENS",
			9.5,
			COLORS.muted,
			{ align: "center" },
		);

		this.handshakeCounter = this.label(
			700,
			707,
			"HANDSHAKE 1 / 3",
			9.5,
			COLORS.muted,
			{ align: "center" },
		);
		this.label(620, 691, "R1", 8, COLORS.dim, { align: "center" });
		this.label(700, 691, "R2", 8, COLORS.dim, { align: "center" });
		this.label(780, 691, "R3", 8, COLORS.dim, { align: "center" });

		this.prompt = this.label(700, 741, "", 11.5, COLORS.cyan, {
			align: "center",
			wrap: 334,
			lineHeight: 1.18,
		});
		this.label(636, 785, "BEAT", 7.5, COLORS.dim, { align: "right" });
		this.label(
			700,
			817,
			"P1 SENDS ➜ SHIP ECHOES ➜ P2 CONFIRMS",
			9,
			COLORS.muted,
			{ align: "center" },
		);
	}

	private buildRightPanel(): void {
		this.label(974, 172, "P2 // RELAY WATCH", 27, COLORS.amber, {
			bold: true,
		});
		this.label(
			974,
			204,
			"PRIVATE CHANNEL · RETURN ECHO + HEAT ONLY",
			9.5,
			COLORS.muted,
		);
		this.label(970, 239, "RETURN ECHO / 3 PULSES", 8.5, COLORS.muted);
		this.label(1350, 239, "RELAY LAMP", 8.5, COLORS.muted, {
			align: "right",
		});

		this.p2Status = this.label(974, 380, "WAITING FOR ECHO", 27, COLORS.muted, {
			bold: true,
		});
		this.label(974, 414, "● SHORT     — LONG", 11, COLORS.muted);

		this.label(974, 451, "SHARED LENS HEAT", 9.5, COLORS.muted);
		this.heatPct = this.label(1358, 451, "0%", 10.5, COLORS.green, {
			align: "right",
		});
		this.heatStatus = this.label(974, 503, "NOMINAL", 10.5, COLORS.green);

		this.label(974, 531, "REPLY CODE", 9.5, COLORS.muted);
		this.replyValue = this.label(974, 546, "— SELECT —", 33, COLORS.dim, {
			bold: true,
		});

		this.label(974, 602, "RECEIVED LOG", 9.5, COLORS.muted);
		this.logValue = this.label(
			974,
			619,
			"R1 ---   ·   R2 ---   ·   R3 ---",
			12,
			COLORS.dim,
		);
		this.p2Message = this.label(978, 665, "", 12.5, COLORS.text, {
			wrap: 365,
			lineHeight: 1.28,
		});

		this.label(
			974,
			812,
			"P2  [←] SHORT   [→] LONG   [ENTER] SEND",
			9.5,
			COLORS.muted,
		);
		this.label(
			974,
			830,
			"MATCH THE ECHO · HEAT IS SHARED · PACE THE LENS",
			8.5,
			COLORS.dim,
		);
	}

	private buildWinOverlay(): void {
		this.wonTitle = this.label(700, 309, "SHIP SECURED", 44, COLORS.green, {
			align: "center",
			bold: true,
		});
		this.wonBody = this.label(
			700,
			380,
			"THREE HANDSHAKES CLOSED · BERTH CLEARANCE CONFIRMED",
			14,
			COLORS.text,
			{ align: "center", wrap: 310, lineHeight: 1.3 },
		);
		this.wonHint = this.label(
			700,
			445,
			"PRESS R TO RE-RUN THE DRILL",
			11.5,
			COLORS.amber,
			{ align: "center", bold: true },
		);
	}

	private syncLabels(): void {
		const m = this.model;
		const clearanceColor = codeColor(m.clearance);
		const berth = codeBerth(m.clearance);
		const pulseCode =
			m.phase === "beaming" ? classifyPulse(m.beamElapsed) : null;

		this.clearanceValue.setValue(`BERTH ${berth}`);
		this.clearanceValue.setColor(clearanceColor);
		this.vesselInfo.setValue(
			`VESSEL TRACK 01 · CLEARANCE ${m.clearance.toUpperCase()} · ${Math.round(m.shipProgress)}%`,
		);
		this.angleValue.setValue(m.aim === "left" ? "◀  AIM LEFT" : "AIM RIGHT  ▶");
		this.angleValue.setColor(
			m.aim === m.expectedAim ? COLORS.cyan : COLORS.amber,
		);
		this.pulseStatus.setValue(m.p1PulseStatus);
		this.pulseStatus.setColor(
			m.lensLocked || m.phase === "jammed"
				? COLORS.red
				: m.phase === "beaming"
					? pulseCode
						? codeColor(pulseCode)
						: COLORS.red
					: m.phase === "won" || m.phase === "success"
						? COLORS.green
						: m.echoCode
							? codeColor(m.echoCode)
							: COLORS.muted,
		);
		this.wearPct.setValue(`${Math.round(m.wear)}%`);
		this.wearPct.setColor(
			m.wear >= 90 ? COLORS.red : m.wear >= 55 ? COLORS.amber : COLORS.cyan,
		);
		this.p1Message.setValue(m.messageP1);
		this.p1Message.setColor(toneColor(m.toneP1));

		const promptColor =
			m.phase === "won" || m.phase === "success"
				? COLORS.green
				: m.phase === "jammed" || m.lensLocked
					? COLORS.red
					: m.phase === "reply"
						? COLORS.amber
						: COLORS.cyan;
		this.prompt.setValue(m.prompt);
		this.prompt.setColor(promptColor);
		this.handshakeCounter.setValue(
			m.phase === "won"
				? "3 / 3 HANDSHAKES CLOSED"
				: `HANDSHAKE ${Math.min(m.handshakes + 1, TOTAL_HANDSHAKES)} / ${TOTAL_HANDSHAKES}`,
		);
		this.handshakeCounter.setColor(
			m.phase === "won"
				? COLORS.green
				: m.phase === "success"
					? COLORS.amberBright
					: COLORS.muted,
		);

		const statusColor =
			m.phase === "won" || m.phase === "success"
				? COLORS.green
				: m.phase === "jammed" || m.replyMismatch || m.lensLocked
					? COLORS.red
					: m.phase === "reply" || m.phase === "echo"
						? COLORS.amberBright
						: COLORS.muted;
		this.p2Status.setValue(m.p2Status);
		this.p2Status.setColor(statusColor);
		this.heatPct.setValue(`${Math.round(m.heat)}%`);
		this.heatPct.setColor(
			m.heat >= HEAT_CRITICAL
				? COLORS.red
				: m.heat >= HEAT_WARN
					? COLORS.amber
					: COLORS.green,
		);
		this.heatStatus.setValue(
			m.lensLocked
				? "LOCKED · VENTING"
				: m.heat >= HEAT_CRITICAL
					? "CRITICAL"
					: m.heat >= HEAT_WARN
						? "WARNING · PACE THE LENS"
						: m.heat >= 40
							? "WARM"
							: "NOMINAL",
		);
		this.heatStatus.setColor(
			m.heat >= HEAT_CRITICAL
				? COLORS.red
				: m.heat >= HEAT_WARN
					? COLORS.amber
					: m.heat >= 40
						? COLORS.amberBright
						: COLORS.green,
		);
		this.replyValue.setValue(
			m.replyMismatch
				? "MISMATCH"
				: m.replyCode
					? m.replyCode.toUpperCase()
					: "— SELECT —",
		);
		this.replyValue.setColor(
			m.replyMismatch ? COLORS.red : codeColor(m.replyCode),
		);
		this.logValue.setValue(
			m.handshakeLog.length > 0
				? m.handshakeLog.join("   ·   ")
				: "R1 ---   ·   R2 ---   ·   R3 ---",
		);
		this.logValue.setColor(
			m.handshakeLog.length > 0 ? COLORS.amberBright : COLORS.dim,
		);
		this.p2Message.setValue(m.p2Message);
		this.p2Message.setColor(toneColor(m.toneP2));

		const wonAlpha = m.phase === "won" ? 1 : 0;
		this.wonTitle.alpha = wonAlpha;
		this.wonBody.alpha = wonAlpha;
		this.wonHint.alpha = wonAlpha;
	}
}

export class RelayStage extends Stage {
	private screen?: RelayScreen;

	override onResetEvent(app: Application): void {
		app.world.backgroundColor.parseCSS(COLORS.bg);
		bindKeys();
		this.screen = new RelayScreen();
		app.world.addChild(this.screen, 1);
	}

	override onDestroyEvent(): void {
		unbindKeys();
		this.screen = undefined;
	}
}

const RELAY_STATE = state.USER + 1;

export const startRelayStage = (): void => {
	state.set(RELAY_STATE, new RelayStage());
	state.change(RELAY_STATE, true);
};
