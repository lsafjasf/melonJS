/**
 * melonJS — subtitle editor: the engine preview.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A melonJS Application owns the canvas. The video is drawn by a Sprite whose
 * image is the same HTMLVideoElement the Transport drives, and a custom
 * Renderable paints the active caption beneath it each frame. Everything is
 * positioned from the Transport's time, so canvas and panels share one clock.
 */
import {
	Application,
	Color,
	game,
	Renderable,
	Sprite,
	state,
	Text,
	Vector2d,
	video,
} from "melonjs";
import { activeCue, type Cue } from "./cues";
import type { Transport } from "./transport";

const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 540;

/** caption strip painted at the bottom of the engine canvas */
class CaptionOverlay extends Renderable {
	private readonly label: Text;

	private cues: Cue[] = [];

	private readonly transport: Transport;

	constructor(transport: Transport) {
		super(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
		// a plain full-screen renderable: never a physics body, always pointer-safe
		this.isKinematic = false;
		this.transport = transport;
		this.label = new Text(DESIGN_WIDTH / 2, DESIGN_HEIGHT - 56, {
			font: "Arial",
			size: 26,
			fillStyle: "#ffffff",
			textAlign: "center",
			textBaseline: "middle",
			lineHeight: 1.35,
		});
		this.label.floating = true;
	}

	setCues(cues: Cue[]): void {
		this.cues = cues;
		this.refresh();
	}

	/** re-evaluate which cue the current transport time falls inside */
	refresh(): void {
		const cue = activeCue(this.cues, this.transport.time);
		this.label.setText(cue ? cue.text : "");
	}

	override update(): boolean {
		this.refresh();
		return true;
	}

	override draw(renderer: Parameters<Renderable["draw"]>[0]): void {
		const cue = activeCue(this.cues, this.transport.time);
		if (!cue) {
			return;
		}
		const metrics = this.label.metrics;
		const paddingX = 24;
		const paddingY = 12;
		const boxWidth = metrics.width + paddingX * 2;
		const boxHeight = metrics.height + paddingY * 2;
		const boxX = (DESIGN_WIDTH - boxWidth) / 2;
		const boxY = DESIGN_HEIGHT - 56 - boxHeight / 2;
		// renderer-level colour + fillRect works identically on the Canvas,
		// WebGL and WebGPU backends; a raw 2D context only exists on Canvas
		renderer.save();
		renderer.setColor(new Color(0, 0, 0, 0.62));
		renderer.fillRect(boxX, boxY, boxWidth, boxHeight);
		renderer.restore();
		this.label.draw(renderer);
	}
}

export interface Preview {
	overlay: CaptionOverlay;
	destroy: () => void;
}

/**
 * Boot the engine preview against an already-configured video element and
 * transport. The element is handed straight to a Sprite, rather than going
 * through the loader, so the editor keeps full control of its clock.
 */
export const createPreview = async (
	videoElement: HTMLVideoElement,
	transport: Transport,
	initialCues: Cue[],
): Promise<Preview> => {
	const app = new Application(DESIGN_WIDTH, DESIGN_HEIGHT, {
		parent: "screen",
		scaleMethod: "flex",
		renderer: video.AUTO,
		backgroundColor: "#101015",
	});
	await app.init();

	state.change(state.DEFAULT, true);

	const videoSprite = new Sprite(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, {
		image: videoElement,
		anchorPoint: new Vector2d(0.5, 0.5),
	});
	// letterbox the 16:9 clip inside the design surface without cropping
	const mediaAspect =
		videoElement.videoWidth / videoElement.videoHeight || 16 / 9;
	const surfaceAspect = DESIGN_WIDTH / DESIGN_HEIGHT;
	if (mediaAspect > surfaceAspect) {
		const scale = DESIGN_WIDTH / videoSprite.width;
		videoSprite.scale(scale);
	} else {
		const scale = DESIGN_HEIGHT / videoSprite.height;
		videoSprite.scale(scale);
	}
	game.world.addChild(videoSprite);

	const overlay = new CaptionOverlay(transport);
	overlay.setCues(initialCues);
	game.world.addChild(overlay);

	return {
		overlay,
		destroy: () => {
			game.world.removeChildNow(overlay);
			game.world.removeChildNow(videoSprite);
		},
	};
};
