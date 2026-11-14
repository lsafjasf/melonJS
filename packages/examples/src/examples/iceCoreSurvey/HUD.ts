/**
 * melonJS — Ice Core Survey: screen-space instrument panel and run overlays.
 *
 * The panels and bars are immediate-mode drawing; the labels are engine
 * `Text` renderables in a floating `Container`. Keeping both in one container
 * means the title and end screens fade as a single object without touching
 * the world camera.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	type Application,
	Container,
	Renderable,
	type Renderer,
	Text,
} from "melonjs";

export interface HudState {
	oxygen: number;
	hull: number;
	stress: number;
	load: number;
	cores: number;
	coresTarget: number;
	nextLabel: string;
	seed: string;
	routePass: boolean;
	toast: string;
	toastTone: "good" | "warn" | "bad";
	warning: string;
	muted: boolean;
}

const PANEL = "rgba(8, 31, 39, 0.86)";
const PANEL_EDGE = "rgba(161, 219, 223, 0.22)";
const INK = "#effafb";
const MUTED = "#9fc0c5";
const GOLD = "#f1c56f";
const CYAN = "#6dd8e1";
const ORANGE = "#f0ad55";
const RED = "#ff7465";
const GREEN = "#70dea6";

function barColor(value: number) {
	if (value <= 25) {
		return RED;
	}
	if (value <= 50) {
		return ORANGE;
	}
	return CYAN;
}

function stressColor(value: number) {
	if (value >= 82) {
		return RED;
	}
	if (value >= 58) {
		return ORANGE;
	}
	return GOLD;
}

class HudChrome extends Renderable {
	state: HudState = {
		oxygen: 100,
		hull: 100,
		stress: 0,
		load: 480,
		cores: 0,
		coresTarget: 3,
		nextLabel: "NEXT: CORE A",
		seed: "54C0DE",
		routePass: true,
		toast: "",
		toastTone: "good",
		warning: "",
		muted: false,
	};
	clock = 0;

	constructor(
		private readonly width: number,
		private readonly height: number,
	) {
		super(0, 0, width, height);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override update(dt: number) {
		this.clock += Math.min(dt, 50) / 1000;
		return true;
	}

	private panel(
		renderer: Renderer,
		x: number,
		y: number,
		w: number,
		h: number,
		accent = PANEL_EDGE,
	) {
		renderer.setColor(PANEL);
		renderer.fillRect(x, y, w, h);
		renderer.setColor(accent);
		renderer.lineWidth = 1;
		renderer.strokeLine(x, y, x + w, y);
		renderer.strokeLine(x, y + h, x + w, y + h);
		renderer.strokeLine(x, y, x, y + h);
		renderer.strokeLine(x + w, y, x + w, y + h);
		renderer.setColor("rgba(255, 255, 255, 0.035)");
		renderer.fillRect(x + 1, y + 1, w - 2, 3);
	}

	private bar(
		renderer: Renderer,
		x: number,
		y: number,
		width: number,
		value: number,
		color: string,
	) {
		renderer.setColor("rgba(2, 16, 21, 0.8)");
		renderer.fillRect(x, y, width, 9);
		renderer.setColor(color);
		renderer.fillRect(x + 1, y + 1, (width - 2) * (value / 100), 7);
		renderer.setColor("rgba(255, 255, 255, 0.15)");
		renderer.fillRect(x + 1, y + 1, (width - 2) * (value / 100), 2);
	}

	override draw(renderer: Renderer) {
		const state = this.state;
		this.panel(renderer, 26, 22, 270, 164);
		this.panel(renderer, 26, 198, 270, 58);
		this.panel(
			renderer,
			this.width - 292,
			22,
			266,
			82,
			"rgba(234, 194, 111, 0.24)",
		);

		this.bar(
			renderer,
			40,
			59,
			230,
			Math.max(0, state.oxygen),
			barColor(state.oxygen),
		);
		this.bar(
			renderer,
			40,
			108,
			230,
			Math.max(0, state.hull),
			barColor(state.hull),
		);
		this.bar(
			renderer,
			40,
			157,
			230,
			Math.max(0, state.stress),
			stressColor(state.stress),
		);

		if (state.stress > 73) {
			const blink = 0.55 + 0.45 * Math.sin(this.clock * 7);
			renderer.setColor(`rgba(255, 105, 91, ${0.08 + blink * 0.12})`);
			renderer.fillRect(26, 22, 270, 164);
		}

		renderer.setColor("rgba(5, 22, 29, 0.54)");
		renderer.fillRect(0, this.height - 92, this.width, 92);
		renderer.setColor("rgba(166, 222, 225, 0.12)");
		renderer.lineWidth = 1;
		renderer.strokeLine(0, this.height - 92, this.width, this.height - 92);

		if (state.toast.length > 0) {
			const tint =
				state.toastTone === "good"
					? GREEN
					: state.toastTone === "warn"
						? ORANGE
						: RED;
			const width = 390;
			renderer.setColor("rgba(5, 20, 26, 0.88)");
			renderer.fillRect((this.width - width) / 2, 124, width, 36);
			renderer.setColor(tint);
			renderer.fillRect((this.width - width) / 2, 124, 4, 36);
			renderer.strokeLine(
				(this.width - width) / 2,
				160,
				(this.width + width) / 2,
				160,
			);
		}
	}
}

export type OverlayMode = "title" | "end";

class OverlayChrome extends Renderable {
	mode: OverlayMode = "title";
	success = true;

	constructor(
		private readonly width: number,
		private readonly height: number,
	) {
		super(0, 0, width, height);
		this.anchorPoint.set(0, 0);
	}

	override update() {
		return true;
	}

	override draw(renderer: Renderer) {
		const edge = this.success ? GOLD : RED;
		renderer.setColor(
			this.mode === "title" ? "rgba(4, 18, 24, 0.38)" : "rgba(3, 13, 18, 0.7)",
		);
		renderer.fillRect(0, 0, this.width, this.height);

		const boxWidth = Math.min(860, this.width - 120);
		const boxHeight = this.mode === "title" ? 500 : 390;
		const x = (this.width - boxWidth) / 2;
		const y = (this.height - boxHeight) / 2 + 14;
		renderer.setColor("rgba(6, 27, 34, 0.72)");
		renderer.fillRect(x, y, boxWidth, boxHeight);
		renderer.setColor("rgba(172, 224, 226, 0.34)");
		renderer.lineWidth = 1;
		renderer.strokeLine(x, y, x + boxWidth, y);
		renderer.strokeLine(x, y + boxHeight, x + boxWidth, y + boxHeight);
		renderer.setColor(edge);
		renderer.fillRect(x + 34, y, boxWidth - 68, 2);
		renderer.fillRect(x + 34, y + boxHeight - 2, boxWidth - 68, 2);

		renderer.setColor(edge);
		renderer.lineWidth = 2;
		renderer.strokeLine(x + 24, y + 18, x + 24, y + 56);
		renderer.strokeLine(x + 24, y + 18, x + 62, y + 18);
		renderer.strokeLine(
			x + boxWidth - 24,
			y + boxHeight - 18,
			x + boxWidth - 24,
			y + boxHeight - 56,
		);
		renderer.strokeLine(
			x + boxWidth - 24,
			y + boxHeight - 18,
			x + boxWidth - 62,
			y + boxHeight - 18,
		);
	}
}

export class HUD extends Container {
	private readonly width: number;
	private readonly height: number;
	private readonly chrome: HudChrome;
	private readonly overlay: Container;
	private readonly overlayChrome: OverlayChrome;

	private readonly oxygenText: Text;
	private readonly hullText: Text;
	private readonly stressText: Text;
	private readonly loadText: Text;
	private readonly coresText: Text;
	private readonly missionText: Text;
	private readonly seedText: Text;
	private readonly nextText: Text;
	private readonly controlsText: Text;
	private readonly toastText: Text;
	private readonly warningText: Text;
	private readonly titleText: Text;
	private readonly subtitleText: Text;
	private readonly briefText: Text;
	private readonly promptText: Text;
	private readonly endTitle: Text;
	private readonly endReason: Text;
	private readonly endStats: Text;
	private readonly endPrompt: Text;

	constructor(app: Application) {
		super(0, 0, app.viewport.width, app.viewport.height);
		this.anchorPoint.set(0, 0);
		this.floating = true;
		this.width = app.viewport.width;
		this.height = app.viewport.height;

		this.chrome = new HudChrome(this.width, this.height);
		this.addChild(this.chrome, 0);

		this.oxygenText = this.label(40, 34, 18, "OXYGEN 100%", INK, true);
		this.hullText = this.label(40, 83, 18, "HULL 100%", INK, true);
		this.stressText = this.label(40, 132, 18, "ICE STRESS 0%", INK, true);
		this.loadText = this.label(42, 214, 18, "LOAD 480 KG", GOLD, true);
		this.coresText = this.label(204, 218, 14, "CORES 0/3", GOLD, true);
		this.missionText = this.label(
			this.width - 276,
			36,
			18,
			"MISSION 0 / 3 CORES",
			INK,
			true,
		);
		this.seedText = this.label(
			this.width - 276,
			64,
			13,
			"SEED 54C0DE  ROUTE PASS",
			CYAN,
			false,
		);
		this.nextText = this.centerLabel(this.height - 62, 18, "", GOLD, true);
		this.addChild(this.nextText, 5);
		this.controlsText = this.centerLabel(
			this.height - 27,
			12,
			"W/S THROTTLE   A/D STEER   G DUMP SAMPLE   R RESTART   M MUTE",
			MUTED,
			false,
		);
		this.addChild(this.controlsText, 5);
		this.toastText = this.centerLabel(132, 16, "", GREEN, true);
		this.addChild(this.toastText, 5);
		this.warningText = this.centerLabel(224, 16, "", RED, true);
		this.addChild(this.warningText, 5);

		this.overlay = new Container(0, 0, this.width, this.height);
		this.overlay.floating = true;
		this.addChild(this.overlay, 50);
		this.overlayChrome = new OverlayChrome(this.width, this.height);
		this.overlay.addChild(this.overlayChrome, 0);

		this.titleText = this.centerLabel(
			this.height * 0.3,
			57,
			"ICE CORE SURVEY",
			INK,
			true,
			{ strokeStyle: "#12343f", lineWidth: 6 },
		);
		this.overlay.addChild(this.titleText, 10);
		this.subtitleText = this.centerLabel(
			this.height * 0.385,
			17,
			"Three cores sit beyond the whiteout. Reach them, then bring the mass home.",
			INK,
			true,
		);
		this.overlay.addChild(this.subtitleText, 10);
		this.briefText = this.centerLabel(
			this.height * 0.53,
			16,
			"Speed, hard turns and every recovered core raise the load on the ice.\n\nCracks keep spreading after the tread has passed. Thin ice gives way first.\n\nCross a lead and the surveyor is lost.",
			"#c7e3e5",
			false,
		);
		this.overlay.addChild(this.briefText, 10);
		this.promptText = this.centerLabel(
			this.height * 0.69,
			20,
			"MOVE TO DEPLOY   •   G JETTISONS A CORE",
			GOLD,
			true,
		);
		this.overlay.addChild(this.promptText, 10);
		this.endTitle = this.centerLabel(
			this.height * 0.39,
			52,
			"SURVEY COMPLETE",
			INK,
			true,
			{ strokeStyle: "#12343f", lineWidth: 5 },
		);
		this.overlay.addChild(this.endTitle, 10);
		this.endReason = this.centerLabel(
			this.height * 0.48,
			18,
			"",
			"#d4e9ea",
			false,
		);
		this.overlay.addChild(this.endReason, 10);
		this.endStats = this.centerLabel(this.height * 0.58, 16, "", GOLD, true);
		this.overlay.addChild(this.endStats, 10);
		this.endPrompt = this.centerLabel(
			this.height * 0.66,
			17,
			"R  RESTART SURVEY",
			"#e9f7f8",
			true,
		);
		this.overlay.addChild(this.endPrompt, 10);

		this.endTitle.setOpacity(0);
		this.endReason.setOpacity(0);
		this.endStats.setOpacity(0);
		this.endPrompt.setOpacity(0);
	}

	private label(
		x: number,
		y: number,
		size: number,
		text: string,
		color: string,
		bold: boolean,
		extra: Record<string, unknown> = {},
	) {
		const label = new Text(x, y, {
			font: "Arial, sans-serif",
			size,
			bold,
			fillStyle: color,
			textBaseline: "top",
			text,
			...extra,
		});
		this.addChild(label, 5);
		return label;
	}

	private centerLabel(
		y: number,
		size: number,
		text: string,
		color: string,
		bold: boolean,
		extra: Record<string, unknown> = {},
	) {
		const label = new Text(this.width / 2, y, {
			font: "Arial, sans-serif",
			size,
			bold,
			fillStyle: color,
			textAlign: "center",
			textBaseline: "middle",
			text,
			...extra,
		});
		label.floating = true;
		return label;
	}

	showTitle() {
		this.overlayChrome.mode = "title";
		this.overlay.setOpacity(1);
		this.titleText.setOpacity(1);
		this.subtitleText.setOpacity(1);
		this.briefText.setOpacity(1);
		this.promptText.setOpacity(1);
		this.endTitle.setOpacity(0);
		this.endReason.setOpacity(0);
		this.endStats.setOpacity(0);
		this.endPrompt.setOpacity(0);
	}

	hideOverlay() {
		this.overlay.setOpacity(0);
	}

	showEnd(title: string, reason: string, stats: string, success: boolean) {
		this.overlayChrome.mode = "end";
		this.overlayChrome.success = success;
		this.endTitle.setText(title);
		this.endTitle.fillStyle.parseCSS(success ? INK : "#ffd3cd");
		this.endReason.setText(reason);
		this.endStats.setText(stats);
		this.overlay.setOpacity(1);
		this.titleText.setOpacity(0);
		this.subtitleText.setOpacity(0);
		this.briefText.setOpacity(0);
		this.promptText.setOpacity(0);
		this.endTitle.setOpacity(1);
		this.endReason.setOpacity(1);
		this.endStats.setOpacity(1);
		this.endPrompt.setOpacity(1);
	}

	refresh(state: HudState) {
		this.chrome.state = state;
		this.setText(
			this.oxygenText,
			`OXYGEN ${Math.max(0, Math.round(state.oxygen))}%`,
		);
		this.setText(this.hullText, `HULL ${Math.max(0, Math.round(state.hull))}%`);
		this.setText(
			this.stressText,
			`ICE STRESS ${Math.max(0, Math.round(state.stress))}%`,
		);
		this.setText(this.loadText, `LOAD ${Math.round(state.load)} KG`);
		this.setText(this.coresText, `CORES ${state.cores}/${state.coresTarget}`);
		this.setText(
			this.missionText,
			`MISSION ${state.cores} / ${state.coresTarget} CORES`,
		);
		this.setText(
			this.seedText,
			`SEED ${state.seed}  ${state.routePass ? "ROUTE PASS" : "ROUTE FAIL"}`,
		);
		this.setText(this.nextText, state.nextLabel);
		this.setText(
			this.controlsText,
			state.muted
				? "W/S THROTTLE   A/D STEER   G DUMP SAMPLE   R RESTART   M UNMUTE"
				: "W/S THROTTLE   A/D STEER   G DUMP SAMPLE   R RESTART   M MUTE",
		);
		this.setText(this.toastText, state.toast);
		this.toastText.fillStyle.parseCSS(
			state.toastTone === "good"
				? GREEN
				: state.toastTone === "warn"
					? ORANGE
					: RED,
		);
		this.setText(this.warningText, state.warning);
	}

	private setText(label: Text, text: string) {
		label.setText(text);
	}
}
