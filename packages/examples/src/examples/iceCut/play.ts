/**
 * melonJS — CRYO CUT two-operator ice mill example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	type Application,
	audio,
	event,
	input,
	ParticleEmitter,
	Stage,
	state,
	Text,
	Trail,
} from "melonjs";
import { CutterAudio, type SoundSnapshot } from "./audio";
import {
	CUT_MIN_TEMP,
	ICE,
	IDEAL_TEMP,
	MELT_TEMP,
	SHAPES,
	VIEW_H,
	VIEW_W,
} from "./constants";
import { Backdrop, CutterView, HudView, IceSurfaceView } from "./render";
import {
	type Controls,
	type DebugSnapshot,
	IceCutSimulation,
} from "./simulation";

type DebugApi = {
	getState: () => DebugSnapshot & { sound: SoundSnapshot };
	getInput: () => Controls;
};

const createParticleDot = (): HTMLCanvasElement => {
	const canvas = document.createElement("canvas");
	canvas.width = 32;
	canvas.height = 32;
	const context = canvas.getContext("2d") as CanvasRenderingContext2D;
	const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
	gradient.addColorStop(0, "rgba(255,255,255,1)");
	gradient.addColorStop(0.34, "rgba(255,255,255,0.84)");
	gradient.addColorStop(1, "rgba(255,255,255,0)");
	context.fillStyle = gradient;
	context.fillRect(0, 0, 32, 32);
	return canvas;
};

const keyCodes = [
	input.KEY.A,
	input.KEY.D,
	input.KEY.LEFT,
	input.KEY.RIGHT,
	input.KEY.UP,
	input.KEY.DOWN,
	input.KEY.R,
];

export class IceCutStage extends Stage {
	private app!: Application;
	private model!: IceCutSimulation;
	private cutterAudio!: CutterAudio;
	private surface!: IceSurfaceView;
	private cutter!: CutterView;
	private hud!: HudView;
	private meltEmitter!: ParticleEmitter;
	private completionEmitter!: ParticleEmitter;
	private trail!: Trail;
	private hudTimer = 0;
	private lastStatus = "";
	private meltStreaming = false;
	private debugApi: DebugApi | null = null;
	private readonly handleKeyDown = (action?: string) => {
		if (action === "restart") {
			this.resetRun();
		}
	};

	private timerText!: Text;
	private integrityText!: Text;
	private temperatureText!: Text;
	private tempStateText!: Text;
	private speedText!: Text;
	private edgeText!: Text;
	private cutterStateText!: Text;
	private shapeLabels: Text[] = [];
	private overlayTitle!: Text;
	private overlayBody!: Text;
	private overlayStats!: Text;
	private overlayHint!: Text;

	override onResetEvent(app: Application): void {
		super.onResetEvent(app);
		this.app = app;
		this.model = new IceCutSimulation();
		this.cutterAudio = new CutterAudio();
		this.model.onShapeComplete = (shape, index) => {
			const center = shape.spec.center;
			this.completionEmitter.pos.set(
				ICE.x + center.x - 10,
				ICE.y + center.y - 10,
			);
			this.completionEmitter.burstParticles(22);
			this.app.viewport.shake(
				3,
				150,
				this.app.viewport.AXIS.BOTH,
				undefined,
				true,
			);
			audio.tone({
				freq: [660 + index * 120, 990 + index * 120],
				duration: 0.22,
				gain: 0.1,
			});
		};
		this.model.onFailure = () => {
			this.app.viewport.shake(
				9,
				380,
				this.app.viewport.AXIS.BOTH,
				undefined,
				true,
			);
			audio.tone({
				freq: [220, 146],
				duration: 0.38,
				gain: 0.12,
			});
			this.lastStatus = "";
		};
		this.model.onWin = () => {
			this.app.viewport.shake(
				3,
				220,
				this.app.viewport.AXIS.BOTH,
				undefined,
				true,
			);
			audio.tone({
				freq: [523, 784, 1046],
				duration: 0.48,
				gain: 0.14,
			});
			this.lastStatus = "";
		};

		app.world.backgroundColor.parseCSS("#02060b");
		const backdrop = new Backdrop();
		app.world.addChild(backdrop, 0);
		this.surface = new IceSurfaceView(this.model);
		app.world.addChild(this.surface, 2);

		this.cutter = new CutterView(this.model);
		this.trail = new Trail({
			target: this.cutter,
			length: 24,
			width: 10,
			lifetime: 420,
			minDistance: 3,
			widthCurve: [1, 0],
			gradient: ["#d7fbff", "#46dfff", "#107bb000"],
		});
		this.trail.blendMode = "additive";
		app.world.addChild(this.trail, 5);

		const dot = createParticleDot();
		this.meltEmitter = new ParticleEmitter(0, 0, {
			image: dot,
			textureSize: 12,
			width: 10,
			height: 10,
			totalParticles: 120,
			angle: Math.PI / 2,
			angleVariation: 0.7,
			minLife: 220,
			maxLife: 720,
			speed: 1.1,
			speedVariation: 1.4,
			gravity: 0.11,
			minStartScale: 0.12,
			maxStartScale: 0.34,
			minEndScale: 0.01,
			maxEndScale: 0.08,
			tintOverLife: ["#e8feff", "#68d8ef", "#1a718e"],
			blendMode: "normal",
			referenceSpace: "world",
			maxParticles: 3,
			frequency: 38,
			onlyInViewport: true,
		});
		this.meltEmitter.pos.set(ICE.x, ICE.y);
		app.world.addChild(this.meltEmitter, 6);
		app.world.addChild(this.cutter, 7);

		this.completionEmitter = new ParticleEmitter(0, 0, {
			image: dot,
			textureSize: 15,
			width: 24,
			height: 24,
			totalParticles: 44,
			angle: 0,
			angleVariation: Math.PI * 2,
			minLife: 260,
			maxLife: 820,
			speed: 1.7,
			speedVariation: 1.8,
			gravity: 0.05,
			minStartScale: 0.3,
			maxStartScale: 0.72,
			minEndScale: 0.03,
			maxEndScale: 0.12,
			tintOverLife: ["#fff4c2", "#ffd56b", "#d67816"],
			blendMode: "additive",
			referenceSpace: "world",
		});
		app.world.addChild(this.completionEmitter, 8);

		this.addLabels(app);
		this.hud = new HudView(this.model);
		app.world.addChild(this.hud, 20);

		input.bindKey(input.KEY.A, "tempDown");
		input.bindKey(input.KEY.D, "tempUp");
		input.bindKey(input.KEY.LEFT, "cutLeft");
		input.bindKey(input.KEY.RIGHT, "cutRight");
		input.bindKey(input.KEY.UP, "cutUp");
		input.bindKey(input.KEY.DOWN, "cutDown");
		input.bindKey(input.KEY.R, "restart", true);
		event.on(event.KEYDOWN, this.handleKeyDown);

		this.refreshHud(true);
		this.debugApi = {
			getState: () => ({
				...this.model.getDebugSnapshot(),
				sound: this.cutterAudio.getSnapshot(),
			}),
			getInput: () => this.readControls(),
		};
		const holder = globalThis as typeof globalThis & {
			__iceCut?: DebugApi;
		};
		holder.__iceCut = this.debugApi;
	}

	override update(dt: number): boolean {
		if (state.isPaused()) {
			return true;
		}

		const controls = this.readControls();
		if (this.model.status === "ready" && this.hasControl(controls)) {
			this.model.start();
			this.cutterAudio.start();
			this.lastStatus = "";
		}
		this.model.update(dt, controls);

		const pan = (this.model.cutter.x / ICE.w) * 2 - 1;
		this.cutterAudio.update(
			this.model.temperature,
			this.model.speed,
			this.model.status === "running" && this.model.temperature >= CUT_MIN_TEMP,
			this.model.status,
			pan,
		);
		this.syncMeltwater();

		this.hudTimer += dt;
		if (this.hudTimer >= 110) {
			this.hudTimer = 0;
			this.refreshHud(false);
		}
		return true;
	}

	private resetRun(): void {
		this.model.reset();
		this.cutterAudio.update(this.model.temperature, 0, false, "ready", 0);
		this.meltStreaming = false;
		this.lastStatus = "";
		this.refreshHud(true);
	}

	private readControls(): Controls {
		return {
			tempUp: input.isKeyPressed("tempUp"),
			tempDown: input.isKeyPressed("tempDown"),
			cutLeft: input.isKeyPressed("cutLeft"),
			cutRight: input.isKeyPressed("cutRight"),
			cutUp: input.isKeyPressed("cutUp"),
			cutDown: input.isKeyPressed("cutDown"),
		};
	}

	private hasControl(controls: Controls): boolean {
		return (
			controls.tempUp ||
			controls.tempDown ||
			controls.cutLeft ||
			controls.cutRight ||
			controls.cutUp ||
			controls.cutDown
		);
	}

	private syncMeltwater(): void {
		const temp = this.model.temperature;
		const pressure = Math.max(0, (temp - CUT_MIN_TEMP) / (100 - CUT_MIN_TEMP));
		const cutting =
			this.model.status === "running" &&
			this.model.speed > 10 &&
			pressure > 0.03;
		this.meltEmitter.pos.set(
			ICE.x + this.model.cutter.x - 5,
			ICE.y + this.model.cutter.y - 5,
		);
		this.meltEmitter.settings.frequency = Math.max(18, 74 - pressure * 54);
		this.meltEmitter.settings.gravity = 0.08 + pressure * 0.13;
		if (cutting && !this.meltStreaming) {
			this.meltEmitter.streamParticles();
			this.meltStreaming = true;
		} else if (!cutting && this.meltStreaming) {
			this.meltEmitter.stopStream();
			this.meltStreaming = false;
		}
	}

	private refreshHud(force: boolean): void {
		const stats = this.model.getDebugSnapshot();
		this.timerText.setText(`${stats.timeLeft.toFixed(1)}s`);
		this.integrityText.setText(`${Math.round(stats.bodyIntegrity * 100)}%`);
		this.temperatureText.setText(`${Math.round(stats.temperature)}C`);
		this.speedText.setText(`${Math.round(stats.speed)} px/s`);
		this.edgeText.setText(`${Math.round(stats.edgeQuality * 100)}%`);

		const temp = stats.temperature;
		this.tempStateText.setText(
			temp < CUT_MIN_TEMP
				? "TOO COLD / TOO SHALLOW"
				: temp < IDEAL_TEMP - 6
					? "WARMING / LIGHT CUT"
					: temp <= MELT_TEMP
						? "OPTIMAL CUT WINDOW"
						: "OVERHEAT / MELT SPREAD",
		);
		this.cutterStateText.setText(
			stats.status === "running" && stats.speed > 10
				? `CUTTING ${Math.round(stats.edgeQuality * 100)}% EDGE`
				: "CUTTER IDLE / MOVE TO TRACE",
		);

		for (let i = 0; i < this.shapeLabels.length; i++) {
			const target = stats.targets[i];
			if (target === undefined) {
				continue;
			}
			const label = `${String(i + 1).padStart(2, "0")}  ${target.name}`;
			this.shapeLabels[i].setText(
				target.completed
					? `${label}\nCLEARED`
					: `${label}\nTRACE ${Math.round(target.coverage * 100)}%`,
			);
		}

		if (stats.status === this.lastStatus && !force) {
			return;
		}
		this.lastStatus = stats.status;
		this.refreshOverlay(stats);
	}

	private refreshOverlay(snapshot: DebugSnapshot): void {
		if (snapshot.status === "running") {
			this.overlayTitle.setText("");
			this.overlayBody.setText("");
			this.overlayStats.setText("");
			this.overlayHint.setText("");
			return;
		}
		if (snapshot.status === "ready") {
			this.overlayTitle.setText("TWO OPERATORS. ONE CUTTER.");
			this.overlayBody.setText(
				"P1: A / D TEMPERATURE   ·   P2: ARROWS MOVE THE CUTTER\nBoth operators must work together to trace all three outlines.",
			);
			this.overlayStats.setText(
				"LOW TEMP = SHALLOW TRACE · HIGH TEMP = RAPID MELT\nKEEP THE BODY ABOVE 32% · NEVER CUT THROUGH",
			);
			this.overlayHint.setText("PRESS ANY CONTROL TO START THE 90 SECOND RUN");
			return;
		}
		if (snapshot.status === "lost") {
			this.overlayTitle.setText(snapshot.failureReason ?? "RUN FAILED");
			this.overlayBody.setText(
				snapshot.failureReason === "TIME EXPIRED"
					? "The ice is still whole. The shift is over."
					: "The torch breached the block. The shift is over.",
			);
			this.overlayStats.setText(
				`SHAPES ${this.model.completedShapes}/3  ·  BODY ${Math.round(snapshot.bodyIntegrity * 100)}%  ·  MIN ${snapshot.minThickness.toFixed(1)}`,
			);
			this.overlayHint.setText("PRESS R TO RESET THE BLOCK");
			return;
		}
		this.overlayTitle.setText("ALL SHARDS CLEARED");
		this.overlayBody.setText("Three outlines cut. The body held together.");
		this.overlayStats.setText(
			`TIME ${snapshot.elapsed.toFixed(1)}s  ·  BODY ${Math.round(snapshot.bodyIntegrity * 100)}%  ·  SMOOTHNESS ${Math.round(snapshot.edgeQuality * 100)}%`,
		);
		this.overlayHint.setText("PRESS R TO RUN AGAIN");
	}

	private addLabels(app: Application): void {
		const make = (
			x: number,
			y: number,
			text: string,
			size: number,
			color: string,
			align: "left" | "center" | "right" = "left",
			bold = false,
		): Text => {
			const label = new Text(x, y, {
				font: "monospace",
				size,
				fillStyle: color,
				textAlign: align,
				textBaseline: "top",
				lineHeight: 1.32,
				bold,
				text,
			});
			app.world.addChild(label, 30);
			return label;
		};

		make(42, 22, "CRYO CUT", 25, "#eafdff", "left", true);
		make(42, 55, "TWO-OPERATOR ICE MILL // 90 SEC", 10, "#6ca3b4");
		make(640, 20, "T-MINUS", 10, "#70b4c9", "center");
		this.timerText = make(640, 34, "90.0s", 38, "#eafdff", "center", true);
		make(1238, 20, "BODY INTEGRITY", 10, "#73a9b7", "right");
		this.integrityText = make(1238, 35, "100%", 23, "#a8f5d0", "right", true);

		make(47, 164, "P1 / THERMAL", 12, "#83efff", "left", true);
		make(47, 187, "CORE TEMP / P1", 10, "#5e8c99");
		this.temperatureText = make(133, 205, "24C", 25, "#b9f6ff", "center", true);
		this.tempStateText = make(47, 596, "", 10, "#8edff0");
		make(133, 619, "A  -TEMP     D  +TEMP", 10, "#6695a2", "center");

		make(1062, 164, "P2 / CUTTER", 12, "#83efff", "left", true);
		make(1062, 190, "CUT SPEED / P2", 10, "#5e8c99");
		this.speedText = make(1238, 185, "0 px/s", 10, "#9deaff", "right");
		make(1062, 262, "EDGE QUALITY / SMOOTHNESS", 10, "#5e8c99");
		this.edgeText = make(1238, 257, "0%", 10, "#9deaff", "right");
		this.cutterStateText = make(1147, 566, "", 9, "#8edff0", "center");
		make(1147, 615, "ARROWS  MOVE THE CUTTER", 10, "#6695a2", "center");

		this.shapeLabels = SHAPES.map((shape, index) =>
			make(
				ICE.x + shape.center.x,
				ICE.y + 94,
				`${String(index + 1).padStart(2, "0")}  ${shape.name}\nTRACE 0%`,
				9.5,
				"#0d5366",
				"center",
				true,
			),
		);
		make(
			640,
			VIEW_H - 35,
			"R  RESTART   ·   CUT ALL 3 OUTLINES   ·   PRESERVE THE BODY",
			10,
			"#537b88",
			"center",
		);

		this.overlayTitle = make(
			VIEW_W / 2,
			334,
			"",
			34,
			"#f3fdff",
			"center",
			true,
		);
		this.overlayBody = make(VIEW_W / 2, 389, "", 13, "#a4d9e7", "center");
		this.overlayStats = make(VIEW_W / 2, 446, "", 10, "#6fa9b8", "center");
		this.overlayHint = make(VIEW_W / 2, 499, "", 10, "#ffd76b", "center", true);
	}

	override onDestroyEvent(app: Application): void {
		super.onDestroyEvent(app);
		for (const code of keyCodes) {
			input.unbindKey(code);
		}
		event.off(event.KEYDOWN, this.handleKeyDown);
		this.cutterAudio.dispose();
		const holder = globalThis as typeof globalThis & {
			__iceCut?: DebugApi;
		};
		if (holder.__iceCut === this.debugApi) {
			delete holder.__iceCut;
		}
		this.debugApi = null;
	}
}
