/**
 * melonJS — Lighthouse Relay example constants.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const VIEW_W = 1400;
export const VIEW_H = 860;

export type Code = "short" | "long";
export type Berth = "A" | "B";
export type Aim = "left" | "right";
export type Tone = "info" | "good" | "warn" | "bad";

export const TOTAL_HANDSHAKES = 3;
export const CLEARANCE_SEQUENCE: readonly Code[] = ["long", "short", "long"];

export const SHORT_MIN = 0.2;
export const SHORT_MAX = 0.52;
export const LONG_MIN = 0.72;
export const LONG_MAX = 1.24;
export const PULSE_MAX = 1.5;

export const BEAT_MS = 500;
export const WEAR_PER_TURN = 7;
export const HEAT_GAIN_PER_SECOND = 44;
export const HEAT_COOL_PER_SECOND = 4;
export const HEAT_LOCK_RELEASE = 55;
export const HEAT_WARN = 50;
export const HEAT_CRITICAL = 85;

export const ECHO_STEP_MS = 620;
export const ECHO_SHORT_MS = 180;
export const ECHO_LONG_MS = 420;
export const ECHO_TAIL_MS = 500;

export const COLORS = {
	bg: "#03131d",
	bgDeep: "#020d14",
	panel: "#061a27",
	panelDeep: "#04141f",
	panelRaised: "#082230",
	border: "#234356",
	borderSoft: "#153345",
	grid: "#123143",
	text: "#eef0e2",
	muted: "#668798",
	dim: "#3f6072",
	cyan: "#29cbe5",
	cyanBright: "#73efff",
	cyanDark: "#0d6874",
	amber: "#f5a623",
	amberBright: "#ffd06b",
	amberDark: "#684719",
	green: "#55df8d",
	greenDark: "#164d37",
	red: "#ff625d",
	redDark: "#67252c",
	blue: "#66a8c8",
} as const;

export const PANELS = {
	left: { x: 30, y: 160, w: 448, h: 690 },
	center: { x: 493, y: 160, w: 414, h: 690 },
	right: { x: 950, y: 160, w: 420, h: 690 },
} as const;

export const codeBerth = (code: Code): Berth => (code === "short" ? "A" : "B");

export const codeAim = (code: Code): Aim =>
	code === "short" ? "left" : "right";

export const codeColor = (code: Code | null): string =>
	code === "short" ? COLORS.cyan : code === "long" ? COLORS.amber : COLORS.dim;

export const toneColor = (tone: Tone): string => {
	switch (tone) {
		case "good":
			return COLORS.green;
		case "warn":
			return COLORS.amberBright;
		case "bad":
			return COLORS.red;
		default:
			return COLORS.text;
	}
};
