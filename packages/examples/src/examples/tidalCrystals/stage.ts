/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	type Application,
	event as melonEvent,
	Renderable,
	type Renderer,
	Stage,
	state,
	type WebGLRenderer,
} from "melonjs";
import { TideAudio } from "./audio";
import { composeCapture } from "./capture";
import { TIDE_MAX, TIDE_MIN, waterLevelForTide } from "./geometry";
import { cameraBasis, lookAt, multiply, perspective, type Vec3 } from "./math";
import {
	blendPalette,
	LIGHT_MODES,
	type LightMode,
	MODE_ACCENT,
	MODE_LABEL,
	PALETTES,
	type Palette,
} from "./palette";
import { type TidalFrame, TidalSceneRenderer } from "./scene";

const FOV_Y = (48 * Math.PI) / 180;
const ORBIT_DISTANCE = 15.2;
const TARGET_Y = 1.05;
const WORLD_UP: Vec3 = [0, 1, 0];

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(maximum, Math.max(minimum, value));

class TidalSurface extends Renderable {
	constructor(private readonly stage: TidalStage) {
		super(0, 0, 1280, 720);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;
	}

	override draw(renderer: Renderer): void {
		this.stage.renderScene(renderer as WebGLRenderer);
	}

	override update(): boolean {
		return true;
	}
}

export class TidalStage extends Stage {
	private glRenderer?: WebGLRenderer;
	private glWidth = 1280;
	private glHeight = 720;
	private scene: TidalSceneRenderer | undefined;
	private canvas?: HTMLCanvasElement;
	private overlay?: HTMLDivElement;
	private fpsNode?: HTMLElement;
	private tideNode?: HTMLElement;
	private modeNode?: HTMLElement;
	private tideMarker?: HTMLElement;
	private pauseLabel?: HTMLElement;
	private pauseButton?: HTMLButtonElement;
	private toastNode?: HTMLElement;
	private toastTimer?: number;
	private readonly audio = new TideAudio();
	private time = 0;
	private targetTide = 0.28;
	private tide = 0.28;
	private yaw = 0.4;
	private pitch = 0.25;
	private dragging = false;
	private lastPointerX = 0;
	private lastPointerY = 0;
	private paused = false;
	private mode: LightMode = "noon";
	private paletteFrom: Palette = PALETTES.noon;
	private paletteTo: Palette = PALETTES.noon;
	private displayPalette: Palette = PALETTES.noon;
	private paletteBlend = 1;
	private fps = 60;
	private sampleTime = 0;
	private sampleFrames = 0;
	private hudTime = 0;
	private audioTime = 0;

	override onResetEvent(app: Application) {
		if (app.renderer.type !== "WebGL2") {
			throw new Error("The Tidal Crystals example requires WebGL 2");
		}
		this.glRenderer = app.renderer as WebGLRenderer;
		this.canvas = this.glRenderer.getCanvas();
		this.glWidth = this.canvas.width;
		this.glHeight = this.canvas.height;
		this.scene = new TidalSceneRenderer(
			this.glRenderer.gl as WebGL2RenderingContext,
		);
		app.world.addChild(new TidalSurface(this), 0);
		this.createHud();
		this.bindInput();
		this.updateHud(true);
	}

	override update(dt: number): boolean {
		const seconds = dt / 1000;
		this.time += seconds;
		const tideEase = 1 - Math.exp(-dt / 170);
		this.tide += (this.targetTide - this.tide) * tideEase;

		if (this.paletteBlend < 1) {
			this.paletteBlend = Math.min(1, this.paletteBlend + dt / 820);
			const eased =
				this.paletteBlend * this.paletteBlend * (3 - 2 * this.paletteBlend);
			this.displayPalette = blendPalette(
				this.paletteFrom,
				this.paletteTo,
				eased,
			);
		}

		this.sampleTime += dt;
		this.sampleFrames++;
		if (this.sampleTime >= 420) {
			this.fps = (this.sampleFrames * 1000) / this.sampleTime;
			this.sampleTime = 0;
			this.sampleFrames = 0;
		}

		this.audioTime += dt;
		if (this.audioTime >= 220) {
			this.audioTime = 0;
			this.audio.setParameters(this.waterSpeed(), this.mode);
		}

		this.hudTime += dt;
		if (this.hudTime >= 100) {
			this.hudTime = 0;
			this.updateHud();
		}
		return super.update(dt) || true;
	}

	override onDestroyEvent() {
		this.unbindInput();
		if (this.toastTimer !== undefined) {
			globalThis.clearTimeout(this.toastTimer);
		}
		this.overlay?.remove();
		this.scene?.destroy();
		this.scene = undefined;
		voider(this.audio.dispose());
	}

	renderScene(renderer: Renderer) {
		const glRenderer = this.glRenderer;
		const scene = this.scene;
		if (!glRenderer || !scene || renderer !== glRenderer) {
			return;
		}
		const width = this.glWidth;
		const height = this.glHeight;
		const aspect = width / height;
		const eye: Vec3 = [
			Math.sin(this.yaw) * Math.cos(this.pitch) * ORBIT_DISTANCE,
			TARGET_Y + Math.sin(this.pitch) * ORBIT_DISTANCE,
			Math.cos(this.yaw) * Math.cos(this.pitch) * ORBIT_DISTANCE,
		];
		const target: Vec3 = [0, TARGET_Y, 0];
		const view = lookAt(eye, target, WORLD_UP);
		const projection = perspective(FOV_Y, aspect, 0.1, 80);
		const basis = cameraBasis(eye, target, WORLD_UP);
		const frame: TidalFrame = {
			viewProj: multiply(projection, view),
			camera: eye,
			right: basis.right,
			up: basis.up,
			forward: basis.forward,
			tanHalfFov: Math.tan(FOV_Y / 2),
			aspect,
			waterLevel: waterLevelForTide(this.tide),
			tide: this.tide,
			time: this.time,
			waveSpeed: this.waterSpeed(),
			palette: this.displayPalette,
		};
		scene.draw(glRenderer, frame);
	}

	private waterSpeed(): number {
		const changing = Math.abs(this.targetTide - this.tide) * 1.8;
		return clamp(0.34 + this.tide * 0.58 + changing, 0, 1);
	}

	private setMode(mode: LightMode) {
		if (mode === this.mode && this.paletteBlend >= 1) {
			return;
		}
		this.paletteFrom = this.displayPalette;
		this.paletteTo = PALETTES[mode];
		this.paletteBlend = 0;
		this.mode = mode;
		this.updateHud(true);
	}

	private createHud() {
		const parent =
			this.canvas?.parentElement ??
			document.getElementById("screen") ??
			document.body;
		const overlay = document.createElement("div");
		overlay.className = "tc-hud";
		overlay.dataset.paused = "false";
		overlay.style.setProperty("--tc-accent", MODE_ACCENT[this.mode]);
		overlay.innerHTML = `
			<div class="tc-vignette"></div>
			<header class="tc-brand">
				<div class="tc-kicker"><span class="tc-pip"></span>PROCEDURAL TIDE STUDY / 01</div>
				<h1>TIDAL <em>CRYSTALS</em></h1>
				<p>WebGL 2 · generated geometry · no textures</p>
			</header>
			<div class="tc-readouts">
				<div class="tc-card">
					<span class="tc-card-label">FRAME RATE</span>
					<strong data-fps>60</strong><small>FPS</small>
				</div>
				<div class="tc-card">
					<span class="tc-card-label">TIDE LEVEL</span>
					<strong data-tide>1.8</strong><small>M</small>
				</div>
				<div class="tc-card tc-card-mode">
					<span class="tc-card-label">LIGHT MODE</span>
					<strong data-mode>NOON</strong>
				</div>
			</div>
			<div class="tc-rail">
				<span>HIGH</span>
				<div class="tc-rail-track"><i data-tide-marker></i></div>
				<span>LOW</span>
			</div>
			<div class="tc-footer">
				<div class="tc-hint">
					<span>DRAG <b>ORBIT</b></span>
					<span>WHEEL <b>TIDE</b></span>
					<span>1 <b>NOON</b></span>
					<span>2 <b>DUSK</b></span>
					<span>3 <b>NIGHT</b></span>
					<span>P <b>PAUSE</b></span>
					<span>C <b>CAPTURE</b></span>
				</div>
				<div class="tc-actions">
					<button class="tc-button" type="button" data-pause aria-pressed="false">
						<span class="tc-button-dot"></span><span data-pause-label>Pause</span><kbd>P</kbd>
					</button>
					<button class="tc-button tc-button-primary" type="button" data-capture>
						<span>Capture</span><kbd>C</kbd>
					</button>
				</div>
			</div>
			<div class="tc-toast" role="status" aria-live="polite"></div>
			<div class="tc-paused">
				<span>TIDE HELD</span>
				<small>MOTION + AUDIO PAUSED</small>
			</div>
		`;
		parent.appendChild(overlay);
		this.overlay = overlay;
		this.fpsNode = this.requireNode(overlay, "[data-fps]");
		this.tideNode = this.requireNode(overlay, "[data-tide]");
		this.modeNode = this.requireNode(overlay, "[data-mode]");
		this.tideMarker = this.requireNode(overlay, "[data-tide-marker]");
		this.pauseLabel = this.requireNode(overlay, "[data-pause-label]");
		this.pauseButton = this.requireNode<HTMLButtonElement>(
			overlay,
			"[data-pause]",
		);
		this.toastNode = this.requireNode(overlay, ".tc-toast");
		this.pauseButton.addEventListener("click", this.onPauseClick);
		this.requireNode<HTMLButtonElement>(
			overlay,
			"[data-capture]",
		).addEventListener("click", this.onCaptureClick);
	}

	private requireNode<T extends Element = HTMLElement>(
		root: ParentNode,
		selector: string,
	): T {
		const node = root.querySelector<T>(selector);
		if (!node) {
			throw new Error(`Missing Tidal Crystals HUD node: ${selector}`);
		}
		return node;
	}

	private updateHud(force = false) {
		if (
			!this.overlay ||
			!this.fpsNode ||
			!this.tideNode ||
			!this.modeNode ||
			!this.tideMarker
		) {
			return;
		}
		if (!force && this.hudTime > 0) {
			return;
		}
		this.fpsNode.textContent = `${Math.round(this.fps)}`;
		this.tideNode.textContent = `${(this.tide * 6.4).toFixed(1)}`;
		this.modeNode.textContent = MODE_LABEL[this.mode].toUpperCase();
		this.tideMarker.style.bottom = `${this.tide * 100}%`;
		this.overlay.style.setProperty("--tc-accent", MODE_ACCENT[this.mode]);
		this.overlay.dataset.paused = this.paused ? "true" : "false";
		if (this.pauseLabel) {
			this.pauseLabel.textContent = this.paused ? "Resume" : "Pause";
		}
		this.pauseButton?.setAttribute("aria-pressed", `${this.paused}`);
	}

	private bindInput() {
		const canvas = this.canvas;
		if (!canvas) {
			return;
		}
		canvas.addEventListener("pointerdown", this.onPointerDown);
		window.addEventListener("pointermove", this.onPointerMove);
		window.addEventListener("pointerup", this.onPointerUp);
		window.addEventListener("pointercancel", this.onPointerUp);
		canvas.addEventListener("wheel", this.onWheel, { passive: false });
		window.addEventListener("keydown", this.onKeyDown);
		melonEvent.on(melonEvent.STATE_PAUSE, this.onStatePause);
		melonEvent.on(melonEvent.STATE_RESUME, this.onStateResume);
		melonEvent.on(melonEvent.STATE_RESTART, this.onStateResume);
	}

	private unbindInput() {
		const canvas = this.canvas;
		canvas?.removeEventListener("pointerdown", this.onPointerDown);
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("pointerup", this.onPointerUp);
		window.removeEventListener("pointercancel", this.onPointerUp);
		canvas?.removeEventListener("wheel", this.onWheel);
		window.removeEventListener("keydown", this.onKeyDown);
		this.pauseButton?.removeEventListener("click", this.onPauseClick);
		melonEvent.off(melonEvent.STATE_PAUSE, this.onStatePause);
		melonEvent.off(melonEvent.STATE_RESUME, this.onStateResume);
		melonEvent.off(melonEvent.STATE_RESTART, this.onStateResume);
	}

	private onPointerDown = (pointerEvent: PointerEvent) => {
		if (pointerEvent.button !== 0) {
			return;
		}
		this.dragging = true;
		this.lastPointerX = pointerEvent.clientX;
		this.lastPointerY = pointerEvent.clientY;
		this.canvas?.setPointerCapture(pointerEvent.pointerId);
		void this.audio.unlock();
	};

	private onPointerMove = (pointerEvent: PointerEvent) => {
		if (!this.dragging) {
			return;
		}
		const dx = pointerEvent.clientX - this.lastPointerX;
		const dy = pointerEvent.clientY - this.lastPointerY;
		this.lastPointerX = pointerEvent.clientX;
		this.lastPointerY = pointerEvent.clientY;
		this.yaw -= dx * 0.006;
		this.pitch = clamp(this.pitch - dy * 0.004, 0.06, 0.92);
	};

	private onPointerUp = (pointerEvent: PointerEvent) => {
		this.dragging = false;
		if (this.canvas?.hasPointerCapture(pointerEvent.pointerId)) {
			this.canvas.releasePointerCapture(pointerEvent.pointerId);
		}
	};

	private onWheel = (wheelEvent: WheelEvent) => {
		wheelEvent.preventDefault();
		const unit =
			wheelEvent.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: wheelEvent.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? 120
					: 1;
		this.targetTide = clamp(
			this.targetTide + wheelEvent.deltaY * unit * 0.00115,
			TIDE_MIN,
			TIDE_MAX,
		);
		this.updateHud(true);
		void this.audio.unlock();
	};

	private onKeyDown = (keyEvent: KeyboardEvent) => {
		const target = keyEvent.target;
		if (
			target instanceof HTMLElement &&
			target.closest("input, textarea, select, [contenteditable='true']")
		) {
			return;
		}
		let handled = true;
		switch (keyEvent.code) {
			case "Digit1":
				this.setMode(LIGHT_MODES[0]);
				break;
			case "Digit2":
				this.setMode(LIGHT_MODES[1]);
				break;
			case "Digit3":
				this.setMode(LIGHT_MODES[2]);
				break;
			case "KeyP":
				this.togglePause();
				break;
			case "KeyC":
				void this.capture();
				break;
			default:
				handled = false;
		}
		if (handled) {
			keyEvent.preventDefault();
			void this.audio.unlock();
		}
	};

	private onPauseClick = () => {
		this.togglePause();
		void this.audio.unlock();
	};

	private onCaptureClick = () => {
		void this.audio.unlock();
		void this.capture();
	};

	private onStatePause = () => {
		this.paused = true;
		this.updateHud(true);
		voider(this.audio.setPaused(true));
	};

	private onStateResume = () => {
		this.paused = false;
		this.updateHud(true);
		voider(this.audio.setPaused(false));
	};

	private togglePause() {
		if (state.isPaused()) {
			state.resume();
		} else {
			state.pause();
		}
	}

	private async capture() {
		const glRenderer = this.glRenderer;
		if (!glRenderer) {
			return;
		}
		try {
			this.renderScene(glRenderer);
			(glRenderer.gl as WebGL2RenderingContext).finish();
			const blob = await composeCapture(glRenderer.getCanvas(), {
				fps: this.fps,
				tide: this.tide * 6.4,
				mode: this.mode,
				paused: this.paused,
			});
			const label = `${this.mode}${this.paused ? "-paused" : ""}`;
			const filename = `tidal-crystals-${label}.png`;
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = filename;
			link.click();
			globalThis.setTimeout(() => URL.revokeObjectURL(url), 1500);
			this.showToast(`CAPTURED · ${filename}`);
		} catch (error) {
			this.showToast(
				`CAPTURE FAILED · ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private showToast(message: string) {
		if (!this.toastNode) {
			return;
		}
		this.toastNode.textContent = message;
		this.toastNode.dataset.visible = "true";
		if (this.toastTimer !== undefined) {
			globalThis.clearTimeout(this.toastTimer);
		}
		this.toastTimer = globalThis.setTimeout(() => {
			if (this.toastNode) {
				this.toastNode.dataset.visible = "false";
			}
		}, 2400);
	}
}

const voider = (promise: Promise<unknown>) => {
	promise.catch(() => {
		// Audio can be refused by the browser until the next user gesture.
	});
};
