/**
 * melonJS — two-player gantry crane example: screen-space HUD.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Container, Text } from "melonjs";
import { COLORS, VIEWPORT_H, VIEWPORT_W } from "./constants";
import type { CraneSimulation } from "./simulation";

function formatTime(seconds: number): string {
	const whole = Math.max(0, Math.ceil(seconds));
	const minutes = Math.floor(whole / 60);
	const rest = whole % 60;
	return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function makeText(
	x: number,
	y: number,
	size: number,
	color: string,
	align: "left" | "center" | "right" = "left",
	bold = false,
): Text {
	return new Text(x, y, {
		font: "Courier New",
		size,
		fillStyle: color,
		textAlign: align,
		textBaseline: "top",
		bold,
		text: "",
	});
}

export class GantryHUD extends Container {
	private readonly p1Title: Text;
	private readonly p1Status: Text;
	private readonly p2Title: Text;
	private readonly p2Status: Text;
	private readonly title: Text;
	private readonly timerText: Text;
	private readonly durabilityText: Text;
	private readonly taskText: Text;
	private readonly warningText: Text;
	private readonly footerText: Text;
	private readonly overlayTitle: Text;
	private readonly overlayDetail: Text;
	private readonly labelCache = new Map<
		Text,
		{ text: string; color: string | undefined }
	>();

	constructor(private readonly sim: CraneSimulation) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.floating = true;

		this.p1Title = makeText(24, 14, 17, COLORS.leftPlayer, "left", true);
		this.p1Status = makeText(24, 46, 12, COLORS.leftPlayer);
		this.p2Title = makeText(
			VIEWPORT_W - 24,
			14,
			17,
			COLORS.rightPlayer,
			"right",
			true,
		);
		this.p2Status = makeText(
			VIEWPORT_W - 24,
			46,
			12,
			COLORS.rightPlayer,
			"right",
		);

		this.title = makeText(VIEWPORT_W / 2, 10, 24, COLORS.text, "center", true);
		this.timerText = makeText(
			VIEWPORT_W / 2,
			40,
			21,
			COLORS.text,
			"center",
			true,
		);
		this.durabilityText = makeText(
			VIEWPORT_W / 2,
			68,
			13,
			COLORS.muted,
			"center",
		);
		this.taskText = makeText(
			VIEWPORT_W / 2,
			98,
			15,
			COLORS.safe,
			"center",
			true,
		);
		this.warningText = makeText(
			VIEWPORT_W / 2,
			124,
			13,
			COLORS.danger,
			"center",
			true,
		);
		this.footerText = makeText(
			VIEWPORT_W / 2,
			VIEWPORT_H - 27,
			12,
			COLORS.muted,
			"center",
		);

		this.overlayTitle = makeText(
			VIEWPORT_W / 2,
			274,
			68,
			COLORS.text,
			"center",
			true,
		);
		this.overlayDetail = makeText(
			VIEWPORT_W / 2,
			358,
			18,
			COLORS.text,
			"center",
		);

		this.p1Title.setText("P1  BRIDGE DRIVE");
		this.p2Title.setText("P2  TROLLEY + HOIST");
		this.footerText.setText(
			"TWO KEYBOARDS CAN PLAY AT ONCE   ·   R RESTARTS THE SHIFT   ·   BOTH INPUT HALVES ARE LIVE",
		);

		this.addChild(this.p1Title);
		this.addChild(this.p1Status);
		this.addChild(this.p2Title);
		this.addChild(this.p2Status);
		this.addChild(this.title);
		this.addChild(this.timerText);
		this.addChild(this.durabilityText);
		this.addChild(this.taskText);
		this.addChild(this.warningText);
		this.addChild(this.footerText);
		this.addChild(this.overlayTitle);
		this.addChild(this.overlayDetail);
	}

	override update(dt: number): boolean {
		const sim = this.sim;
		const carried = sim.carriedCrate;
		const activeCrate =
			carried ??
			sim.crates.find((crate) => {
				return !crate.placed;
			}) ??
			null;

		this.setLabel(
			this.p1Status,
			`A / D   ${sim.beamSpeed >= 0 ? ">" : "<"} ${Math.abs(
				sim.beamSpeed,
			).toFixed(0)} px/s`,
		);
		this.setLabel(
			this.p2Status,
			`UP / DOWN  trolley   LEFT / RIGHT  hoist   ${Math.round(
				sim.hoistZ * 100,
			)}%`,
		);

		this.setLabel(
			this.title,
			`GANTRY SHIFT  ${sim.placedCount.toString().padStart(2, "0")} / 05`,
		);
		this.setLabel(
			this.timerText,
			`CLOCK  ${formatTime(sim.timeLeft)}`,
			sim.timeLeft <= 30 ? COLORS.danger : COLORS.timer,
		);
		this.setLabel(
			this.durabilityText,
			`RIG INTEGRITY  ${Math.ceil(sim.durability).toString().padStart(3, " ")}%`,
			sim.durability <= 30 ? COLORS.danger : COLORS.muted,
		);

		if (carried) {
			this.setLabel(
				this.taskText,
				`LOAD ${carried.label}  ->  SLOT ${carried.targetSlot + 1}   /   ${(
					carried.weight * 10
				).toFixed(1)} t`,
				COLORS.safe,
			);
		} else if (activeCrate) {
			this.setLabel(
				this.taskText,
				`NEXT LOAD ${activeCrate.label}  ->  SLOT ${activeCrate.targetSlot + 1}`,
				COLORS.text,
			);
		} else {
			this.setLabel(this.taskText, "ALL FIVE LOADS SECURED", COLORS.safe);
		}

		let warning = "";
		if (sim.phase === "playing" && sim.clearanceBlocked) {
			warning = "CONDUIT CLEARANCE LOW  —  P2 HOLD RIGHT TO RAISE";
		} else if (sim.phase === "playing" && sim.pipeWarning && carried) {
			warning = "CLEARANCE OK  —  CROSS THE SUSPENDED CONDUIT";
		} else if (sim.phase === "playing" && carried && sim.hookSpeed > 48) {
			warning = "LOAD SWINGING  —  LET BOTH AXES SETTLE";
		} else if (
			sim.phase === "playing" &&
			carried === null &&
			sim.hoistZ > 0.2
		) {
			warning = "P2 HOLD LEFT TO LOWER THE MAGNET";
		}
		this.setLabel(
			this.warningText,
			warning,
			sim.clearanceBlocked ? COLORS.danger : COLORS.safe,
		);

		if (sim.phase === "won") {
			this.setLabel(this.overlayTitle, "SHIFT COMPLETE", COLORS.safe);
			this.setLabel(
				this.overlayDetail,
				`FIVE LOADS SECURED   ·   ${formatTime(
					sim.timeLeft,
				)} LEFT   ·   RIG ${Math.ceil(sim.durability)}%   ·   R RUN AGAIN`,
				COLORS.text,
			);
		} else if (sim.phase === "failed") {
			this.setLabel(
				this.overlayTitle,
				sim.failReason === "time" ? "CLOCK OUT" : "RIG DOWN",
				COLORS.danger,
			);
			this.setLabel(
				this.overlayDetail,
				sim.failReason === "time"
					? `THE SHIFT ENDED WITH ${sim.placedCount} / 5 LOADS SECURED   ·   R RUN AGAIN`
					: "A SUSPENDED CONDUIT TORE THE RIG APART   ·   R RUN AGAIN",
				COLORS.text,
			);
		} else {
			this.setLabel(this.overlayTitle, "");
			this.setLabel(this.overlayDetail, "");
		}

		super.update(dt);
		return true;
	}

	private setLabel(label: Text, text: string, color?: string): void {
		const previous = this.labelCache.get(label);
		if (previous?.text === text && previous.color === color) {
			return;
		}
		if (color !== undefined) {
			label.fillStyle.parseCSS(color);
		}
		label.setText(text);
		this.labelCache.set(label, { text, color });
	}
}
