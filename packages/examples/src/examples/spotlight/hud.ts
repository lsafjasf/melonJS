/**
 * melonJS — The Last Spotlight example: floating HUD and overlays.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Container, Text } from "melonjs";
import { VIEW_H, VIEW_W } from "./constants";
import type { SpotlightStage } from "./stage";

const FONT = "Courier New";

const createLabel = (
	x: number,
	y: number,
	size: number,
	color: string,
	text: string,
	align: "left" | "center" | "right" = "left",
	bold = false,
): Text =>
	new Text(x, y, {
		font: FONT,
		size,
		fillStyle: color,
		textAlign: align,
		textBaseline: "top",
		bold,
		text,
	});

/**
 * All screen-space text lives here; the stage owns the values and calls
 * `sync()` after its simulation step.
 */
export class SpotlightHUD extends Container {
	private readonly title: Text;
	private readonly cue: Text;
	private readonly counters: Text;
	private readonly beam: Text;
	private readonly controls: Text;
	private readonly status: Text;
	private readonly banner: Text;
	private readonly overlayPanel: Text;
	private readonly overlayTitle: Text;
	private readonly overlayBody: Text;
	private readonly overlayHint: Text;

	constructor() {
		super(0, 0, VIEW_W, VIEW_H);
		this.anchorPoint.set(0, 0);
		this.floating = true;
		this.isKinematic = false;

		this.title = createLabel(
			32,
			18,
			15,
			"#c9a96a",
			"THE LAST SPOTLIGHT",
			"left",
			true,
		);
		this.cue = createLabel(VIEW_W / 2, 16, 19, "#efe6d5", "", "center", true);
		this.counters = createLabel(
			VIEW_W - 32,
			20,
			13,
			"#d8cbbb",
			"",
			"right",
			true,
		);
		this.beam = createLabel(32, 48, 13, "#9f9483", "", "left", true);
		this.controls = createLabel(
			VIEW_W - 32,
			48,
			12,
			"#766f65",
			"MOUSE AIM   ·   1 WARM   2 COOL   3 NARROW   ·   P/ESC PAUSE   ·   R RESTART",
			"right",
		);
		this.status = createLabel(
			VIEW_W / 2,
			VIEW_H - 30,
			14,
			"#d8cbbb",
			"",
			"center",
			true,
		);
		this.banner = createLabel(
			VIEW_W / 2,
			100,
			21,
			"#f7e4b9",
			"",
			"center",
			true,
		);

		this.overlayPanel = createLabel(
			VIEW_W / 2,
			224,
			18,
			"#a99a80",
			"",
			"center",
			true,
		);
		this.overlayTitle = createLabel(
			VIEW_W / 2,
			272,
			34,
			"#f3e7ce",
			"",
			"center",
			true,
		);
		this.overlayBody = createLabel(
			VIEW_W / 2,
			326,
			15,
			"#c4b7a3",
			"",
			"center",
		);
		this.overlayHint = createLabel(
			VIEW_W / 2,
			370,
			13,
			"#a99a80",
			"",
			"center",
			true,
		);

		this.addChild(this.title);
		this.addChild(this.cue);
		this.addChild(this.counters);
		this.addChild(this.beam);
		this.addChild(this.controls);
		this.addChild(this.status);
		this.addChild(this.banner);
		this.addChild(this.overlayPanel);
		this.addChild(this.overlayTitle);
		this.addChild(this.overlayBody);
		this.addChild(this.overlayHint);
	}

	sync(stage: SpotlightStage): void {
		const cueNumber = Math.min(stage.cueIndex + 1, 8);
		this.cue.setText(
			stage.phase === "playing"
				? `CUE ${cueNumber} / 8`
				: stage.phase === "curtainCall"
					? "CURTAIN CALL"
					: stage.phase === "failed"
						? "PERFORMANCE HALTED"
						: "CUE — / 8",
		);

		this.counters.setText(
			`MISS ${stage.misses} / 3     GLARE ${stage.reflections} / 2`,
		);
		this.counters.fillStyle.parseCSS(
			stage.misses > 0 || stage.reflections > 0 ? "#e3b98a" : "#d8cbbb",
		);

		this.beam.setText(`BEAM: ${stage.beam.label}`);
		this.beam.fillStyle.parseCSS(stage.beam.rim);

		const blink = 0.72 + 0.28 * Math.sin(stage.time / 330);
		this.status.setText(stage.statusText);
		this.status.fillStyle.parseCSS(stage.statusColor);
		this.status.alpha = stage.feedbackMs > 0 ? 1 : blink;

		const showBanner =
			stage.phase === "playing" && stage.cueBannerMs > 0 && !stage.userPaused;
		this.banner.setText(showBanner ? stage.cueBanner : "");

		const hasOverlay = stage.overlayVisible;
		if (hasOverlay) {
			this.overlayPanel.setText(stage.overlayEyebrow);
			this.overlayTitle.setText(stage.overlayTitle);
			this.overlayBody.setText(stage.overlayBody);
			this.overlayHint.setText(stage.overlayHint);
			this.overlayTitle.fillStyle.parseCSS(stage.overlayColor);
			this.overlayHint.alpha = 0.65 + 0.35 * Math.sin(stage.time / 280);
		} else {
			this.overlayPanel.setText("");
			this.overlayTitle.setText("");
			this.overlayBody.setText("");
			this.overlayHint.setText("");
		}
	}
}
