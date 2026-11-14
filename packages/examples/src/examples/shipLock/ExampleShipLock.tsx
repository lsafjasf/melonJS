/**
 * melonJS — Ship Lock Co-op example.
 *
 * Two operators share one lock chamber and one water-level gauge. P1 feeds
 * the inlet; P2 vents the drain and opens the upper gate. The Canvas scene is
 * drawn in immediate mode so the water, flow, pressure band and hull all
 * respond to the same deterministic simulation.
 */
import {
	Application,
	type CanvasRenderer,
	Container,
	input,
	type Renderer,
	Text,
	video,
} from "melonjs";
import { createExampleComponent } from "../utils";
import {
	createLockState,
	LOCK,
	type LockControls,
	type LockState,
	stepLock,
} from "./lockModel";

const COLORS = {
	bg: "#061018",
	panel: "#0a1b25",
	panelRaised: "#0e2632",
	border: "#234352",
	borderBright: "#38677a",
	text: "#e8f8ff",
	muted: "#7fa3b0",
	dim: "#45616c",
	cyan: "#57e4ff",
	cyanDark: "#0f6f89",
	amber: "#ffb65e",
	amberDark: "#8a5724",
	green: "#74f2a8",
	red: "#ff6268",
	concrete: "#263945",
	concreteDark: "#172630",
	waterDeep: "#083a52",
	waterTop: "#40c8df",
	ship: "#a8463d",
	shipDark: "#5d2524",
} as const;

const WATER_TOP = 600;
const WATER_TRAVEL = 340;
const CHAMBER = { left: 392, right: 888, top: 142, bottom: 660 };
const UPPER_GATE = { top: 226, bottom: 402 };
const LOWER_GATE = { top: 520, bottom: 650 };
const STEP = 1 / 120;

const waterY = (level: number) => WATER_TOP - level * WATER_TRAVEL;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const mixColor = (from: string, to: string, t: number) => {
	const parse = (hex: string) => [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	];
	const [r1, g1, b1] = parse(from);
	const [r2, g2, b2] = parse(to);
	const channel = (a: number, b: number) =>
		Math.round(mix(a, b, t))
			.toString(16)
			.padStart(2, "0");
	return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
};

const pressureColor = (pressure: number) => {
	const value = clamp01(pressure);
	if (value < 0.5) {
		return mixColor(COLORS.green, COLORS.amber, value / 0.5);
	}
	return mixColor(COLORS.amber, COLORS.red, (value - 0.5) / 0.5);
};

interface ShipLockDebug {
	getState: () => LockState;
	isStarted: () => boolean;
	reset: () => void;
}

declare global {
	var __shipLock: ShipLockDebug | undefined;
}

class ShipLockScene extends Container {
	state: LockState;
	private accumulator = 0;
	private clock = 0;
	private started = false;
	private labelCache: Record<string, string> = {};
	private labels: Record<string, Text>;

	constructor() {
		super(0, 0, LOCK.width, LOCK.height);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		this.state = createLockState();
		this.labels = this.createLabels();
	}

	override reset() {
		this.state = createLockState();
		this.accumulator = 0;
		this.clock = 0;
		this.started = false;
		this.resetLabels();
		return this;
	}

	hasStarted() {
		return this.started;
	}

	private createLabels() {
		const make = (
			x: number,
			y: number,
			size: number,
			color: string,
			settings: ConstructorParameters<typeof Text>[2] = {},
		) => {
			const label = new Text(x, y, {
				font: "monospace",
				size,
				fillStyle: color,
				textBaseline: "top",
				text: "",
				...settings,
			});
			this.addChild(label, 20);
			return label;
		};

		const labels: Record<string, Text> = {
			title: make(42, 16, 30, COLORS.text, { bold: true }),
			subtitle: make(44, 52, 12, COLORS.cyan),
			controls: make(44, 74, 11, COLORS.muted),
			rule: make(44, 96, 11, COLORS.amber),
			timerLabel: make(1124, 14, 11, COLORS.muted),
			timer: make(1124, 32, 32, COLORS.text, { bold: true }),
			levelLabel: make(404, 18, 11, COLORS.cyan),
			levelValue: make(872, 16, 17, COLORS.text, {
				textAlign: "right",
				bold: true,
			}),
			pressureLabel: make(404, 70, 11, COLORS.muted),
			pressureValue: make(872, 68, 15, COLORS.text, {
				textAlign: "right",
				bold: true,
			}),
			holdLabel: make(404, 108, 11, COLORS.muted),
			holdValue: make(872, 106, 12, COLORS.text, { textAlign: "right" }),
			lowPool: make(58, 548, 10, COLORS.muted),
			highPool: make(1222, 276, 10, COLORS.muted, { textAlign: "right" }),
			chamberLabel: make(640, 154, 9, COLORS.dim, {
				textAlign: "center",
			}),
			gateScene: make(918, 194, 9, COLORS.amber),
			drainScene: make(918, 626, 9, COLORS.amber),
			leftTitle: make(64, 686, 15, COLORS.cyan, { bold: true }),
			leftKeys: make(64, 710, 11, COLORS.muted),
			leftValue: make(364, 686, 13, COLORS.text, {
				textAlign: "right",
				bold: true,
			}),
			leftNote: make(64, 760, 10, COLORS.dim),
			rightTitle: make(916, 686, 15, COLORS.amber, { bold: true }),
			rightKeys: make(916, 710, 11, COLORS.muted),
			rightValue: make(1216, 686, 13, COLORS.text, {
				textAlign: "right",
				bold: true,
			}),
			gateValue: make(1196, 758, 11, COLORS.muted, { textAlign: "right" }),
			status: make(640, 690, 16, COLORS.text, {
				textAlign: "center",
				bold: true,
			}),
			hint: make(640, 720, 11, COLORS.muted, { textAlign: "center" }),
			resultTitle: make(640, 304, 38, COLORS.text, {
				textAlign: "center",
				bold: true,
			}),
			resultBody: make(640, 360, 14, COLORS.text, { textAlign: "center" }),
			resultReset: make(640, 418, 12, COLORS.cyan, {
				textAlign: "center",
			}),
		};

		labels.resultTitle.visible = false;
		labels.resultBody.visible = false;
		labels.resultReset.visible = false;
		return labels;
	}

	private resetLabels() {
		this.labelCache = {};
		this.labels.resultTitle.visible = false;
		this.labels.resultBody.visible = false;
		this.labels.resultReset.visible = false;
	}

	private setLabel(key: string, value: string) {
		if (this.labelCache[key] !== value) {
			this.labelCache[key] = value;
			this.labels[key].setText(value);
		}
	}

	override update(dt: number) {
		this.clock += dt / 1000;
		const controls: LockControls = {
			inletOpen: input.isKeyPressed("lockInletOpen"),
			inletClose: input.isKeyPressed("lockInletClose"),
			drainOpen: input.isKeyPressed("lockDrainOpen"),
			drainClose: input.isKeyPressed("lockDrainClose"),
			gate: input.isKeyPressed("lockGate"),
		};

		if (input.isKeyPressed("lockRestart")) {
			this.reset();
		}

		if (
			controls.inletOpen ||
			controls.inletClose ||
			controls.drainOpen ||
			controls.drainClose
		) {
			this.started = true;
		}

		this.accumulator += Math.min(dt, 100) / 1000;
		while (
			this.started &&
			this.accumulator >= STEP &&
			this.state.phase !== "success" &&
			this.state.phase !== "failed"
		) {
			stepLock(this.state, controls, STEP);
			this.accumulator -= STEP;
		}

		this.syncLabels();
		super.update(dt);
		return true;
	}

	private syncLabels() {
		const { state } = this;
		const level = Math.round(state.level * 100);
		const target = Math.round(LOCK.targetLevel * 100);
		const pressure = state.pressure;
		const stable = state.stableTime;
		const time = Math.max(0, Math.ceil(state.timeLeft));

		this.setLabel("title", "SHIP LOCK // CO-OP");
		this.setLabel("subtitle", "TWO OPERATORS · ONE WATER COLUMN");
		this.setLabel("controls", "P1  W / S      P2  ↑ / ↓  +  SPACE");
		this.setLabel("rule", "VALVES PAST 78% SPIKE PRESSURE");
		this.setLabel("timerLabel", "SHIFT TIME");
		this.setLabel(
			"timer",
			`${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`,
		);
		this.setLabel("levelLabel", "SHARED WATER LEVEL");
		this.setLabel("levelValue", `${level}%  ·  TARGET ${target}%`);
		this.setLabel("pressureLabel", "PRESSURE / SAFE BAND");
		this.setLabel("pressureValue", `${Math.round(pressure * 100)}%`);
		this.setLabel("holdLabel", "FIVE-SECOND STABILITY HOLD");
		this.setLabel(
			"holdValue",
			stable >= LOCK.holdSeconds
				? "HOLD COMPLETE"
				: `${stable.toFixed(1)} / ${LOCK.holdSeconds.toFixed(1)} s`,
		);
		this.setLabel("lowPool", "LOW WATER · DOWNSTREAM");
		this.setLabel("highPool", "HIGH WATER · UPSTREAM");
		this.setLabel("chamberLabel", "SEALED LOCK CHAMBER");
		this.setLabel("gateScene", "UPPER GATE");
		this.setLabel("drainScene", "DRAIN");
		this.setLabel("leftTitle", "P1 · INLET VALVE");
		this.setLabel("leftKeys", "W  OPEN      S  CLOSE");
		this.setLabel("leftValue", `${Math.round(state.inlet * 100)}% OPEN`);
		this.setLabel("leftNote", "RAISE · FEATHER BELOW THE AMBER NOTCH");
		this.setLabel("rightTitle", "P2 · DRAIN + GATE");
		this.setLabel("rightKeys", "↑ OPEN   ↓ CLOSE   SPACE GATE");
		this.setLabel("rightValue", `${Math.round(state.drain * 100)}% OPEN`);
		this.setLabel(
			"gateValue",
			state.phase === "gate"
				? "UPPER GATE CYCLING"
				: stable >= LOCK.holdSeconds
					? "UPPER GATE READY"
					: "UPPER GATE LOCKED",
		);

		const status = !this.started
			? "PRESS A VALVE KEY TO BEGIN"
			: state.phase === "gate"
				? "UPPER GATE CYCLING"
				: state.phase === "success"
					? "LIFT COMPLETE"
					: state.phase === "failed"
						? "SHIFT FAILED"
						: pressure > 0.72
							? "PRESSURE CRITICAL"
							: state.throughFlow > 0.12
								? "CROSS-FLOW · FASTER TRIM / MORE PRESSURE"
								: stable > 0
									? "HOLD THE LINE · P2 HAS THE GATE"
									: "RAISE THE COLUMN · TRIM THE PRESSURE";
		this.setLabel("status", status);
		this.setLabel(
			"hint",
			!this.started
				? "P1: W / S raise. P2: ↑ / ↓ trim. Both may hold keys at the same time."
				: pressure > 0.72
					? "Ease both valves. P2 can vent with the drain; opening harder makes it worse."
					: "P1 raises. P2 vents. Cross-flow aids trim but adds pressure.",
		);

		const terminal = state.phase === "success" || state.phase === "failed";
		this.labels.resultTitle.visible = terminal;
		this.labels.resultBody.visible = terminal;
		this.labels.resultReset.visible = terminal;
		if (terminal) {
			const copy =
				state.phase === "success"
					? {
							title: "LIFT COMPLETE",
							body: "Cargo cleared the upper gate with the chamber still calm.",
						}
					: state.failure === "pressure"
						? {
								title: "PRESSURE BURST",
								body: "A valve was opened too far. The chamber hit its pressure limit.",
							}
						: state.failure === "pinch"
							? {
									title: "HULL PINCHED",
									body: "The chamber overfilled and drove the ship into the upper sill.",
								}
							: {
									title: "SHIFT TIMED OUT",
									body: "The five-second stable hold was never completed.",
								};
			this.setLabel("resultTitle", copy.title);
			this.setLabel("resultBody", copy.body);
			this.setLabel("resultReset", "PRESS R TO RUN ANOTHER LIFT");
		}
	}

	override draw(renderer: Renderer) {
		const canvas = renderer as CanvasRenderer;
		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.bg);
		renderer.fillRect(0, 0, LOCK.width, LOCK.height);
		this.drawHeader(canvas);
		this.drawScene(canvas);
		this.drawConsoles(canvas);
		this.drawResult(canvas);
		super.draw(renderer);
	}

	private drawHeader(renderer: CanvasRenderer) {
		renderer.setColor(COLORS.panel);
		renderer.fillRect(0, 0, LOCK.width, 136);
		renderer.setColor(COLORS.border);
		renderer.fillRect(0, 135, LOCK.width, 1);

		renderer.setColor(COLORS.panelRaised);
		renderer.beginPath();
		renderer.roundRect(382, 1, 516, 130, 7);
		renderer.fill();
		renderer.setColor(COLORS.border);
		renderer.lineWidth = 1;
		renderer.strokeRect(383, 2, 514, 128);

		const barX = 404;
		const barY = 44;
		const barW = 466;
		const barH = 15;
		renderer.setColor("#041016");
		renderer.fillRect(barX, barY, barW, barH);

		const targetX = barX + LOCK.targetLevel * barW;
		const tolW = LOCK.levelTolerance * barW * 2;
		renderer.setColor(COLORS.green);
		renderer.setGlobalAlpha(0.26);
		renderer.fillRect(targetX - tolW / 2, barY, tolW, barH);
		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.green);
		renderer.fillRect(targetX - 1, barY, 2, barH);

		const levelX = barX + this.state.level * barW;
		renderer.setColor(COLORS.cyan);
		renderer.fillRect(barX, barY + barH - 3, levelX - barX, 3);
		renderer.fillRect(levelX - 2, barY - 4, 4, barH + 8);
		for (let i = 1; i < 10; i++) {
			const x = barX + (i / 10) * barW;
			renderer.setColor(COLORS.dim);
			renderer.fillRect(x, barY + barH, 1, 4);
		}
		renderer.setColor(COLORS.borderBright);
		renderer.strokeRect(barX, barY, barW, barH);

		const pressureX = barX;
		const pressureY = 94;
		const pressureW = barW;
		const pressureH = 9;
		const steps = 64;
		for (let i = 0; i < steps; i++) {
			renderer.setColor(pressureColor((i + 0.5) / steps));
			renderer.setGlobalAlpha(0.72);
			renderer.fillRect(
				pressureX + (i / steps) * pressureW,
				pressureY,
				pressureW / steps + 1,
				pressureH,
			);
		}
		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.text);
		renderer.fillRect(
			pressureX + LOCK.pressureSafe * pressureW - 1,
			pressureY - 3,
			2,
			pressureH + 6,
		);
		const pMarker = pressureX + clamp01(this.state.pressure) * pressureW;
		renderer.setColor("#ffffff");
		renderer.fillRect(pMarker - 2, pressureY - 5, 4, pressureH + 10);
		renderer.setColor(COLORS.borderBright);
		renderer.strokeRect(pressureX, pressureY, pressureW, pressureH);

		const pips = 5;
		for (let i = 0; i < pips; i++) {
			const filled =
				this.state.stableTime >= ((i + 1) / pips) * LOCK.holdSeconds;
			renderer.setColor(filled ? COLORS.green : COLORS.border);
			renderer.fillRect(584 + i * 28, 111, 22, 5);
		}
	}

	private drawScene(renderer: CanvasRenderer) {
		this.drawBackdrop(renderer);
		this.drawChamberShell(renderer);
		this.drawChamberWater(renderer);
		this.drawFlow(renderer);
		this.drawShip(renderer);
		this.drawPressureGlow(renderer);
	}

	private drawBackdrop(renderer: CanvasRenderer) {
		for (let i = 0; i < 14; i++) {
			renderer.setColor(mixColor("#0b1d28", "#03090d", i / 13));
			renderer.fillRect(0, 136 + i * 38, LOCK.width, 39);
		}

		renderer.setGlobalAlpha(0.08);
		renderer.setColor(COLORS.borderBright);
		for (let x = 36; x < LOCK.width; x += 48) {
			renderer.fillRect(x, 142, 1, 518);
		}
		for (let y = 160; y < 660; y += 48) {
			renderer.fillRect(36, y, 1208, 1);
		}
		renderer.setGlobalAlpha(1);

		this.drawPool(
			renderer,
			36,
			CHAMBER.left,
			waterY(LOCK.startLevel),
			648,
			0.2,
		);
		this.drawPool(
			renderer,
			CHAMBER.right,
			1244,
			waterY(LOCK.targetLevel),
			648,
			2.7,
		);

		renderer.setColor(COLORS.concreteDark);
		renderer.fillRect(36, 648, 1208, 24);
		renderer.setColor(COLORS.concrete);
		renderer.fillRect(36, 648, 1208, 5);
		renderer.setColor(COLORS.border);
		renderer.fillRect(36, 671, 1208, 1);
	}

	private drawPool(
		renderer: CanvasRenderer,
		left: number,
		right: number,
		surface: number,
		bottom: number,
		phase: number,
	) {
		renderer.save();
		renderer.clipRect(left, surface, right - left, bottom - surface);
		for (let i = 0; i < 12; i++) {
			renderer.setColor(mixColor(COLORS.waterTop, COLORS.waterDeep, i / 11));
			renderer.setGlobalAlpha(0.82);
			renderer.fillRect(
				left,
				surface + i * ((bottom - surface) / 11),
				right - left,
				(bottom - surface) / 11 + 1,
			);
		}
		renderer.setGlobalAlpha(1);
		for (let i = 1; i <= 3; i++) {
			this.strokeWave(
				renderer,
				left,
				right,
				surface + i * 34,
				phase + i * 0.7,
				0.22,
			);
		}
		renderer.restore();
		this.strokeWave(renderer, left, right, surface, phase, 0.8);
	}

	private strokeWave(
		renderer: CanvasRenderer,
		left: number,
		right: number,
		y: number,
		phase: number,
		alpha: number,
	) {
		renderer.setColor(COLORS.waterTop);
		renderer.setGlobalAlpha(alpha);
		renderer.lineWidth = 2;
		renderer.beginPath();
		for (let x = left; x <= right; x += 12) {
			const wave = Math.sin(x * 0.026 + phase) * 2.2;
			if (x === left) {
				renderer.moveTo(x, y + wave);
			} else {
				renderer.lineTo(x, y + wave);
			}
		}
		renderer.stroke();
		renderer.setGlobalAlpha(1);
		renderer.lineWidth = 1;
	}

	private drawChamberShell(renderer: CanvasRenderer) {
		renderer.setColor("#041016");
		renderer.fillRect(
			CHAMBER.left,
			CHAMBER.top,
			CHAMBER.right - CHAMBER.left,
			CHAMBER.bottom - CHAMBER.top,
		);

		renderer.setColor(COLORS.concrete);
		renderer.fillRect(368, 142, 24, LOWER_GATE.top - 142);
		renderer.fillRect(368, LOWER_GATE.bottom, 24, 660 - LOWER_GATE.bottom);
		renderer.fillRect(888, 142, 24, UPPER_GATE.top - 142);
		renderer.fillRect(888, UPPER_GATE.bottom, 24, 660 - UPPER_GATE.bottom);
		renderer.fillRect(352, 126, 584, 16);
		renderer.fillRect(352, 660, 584, 16);

		renderer.setColor(COLORS.concreteDark);
		renderer.fillRect(392, 142, 7, 518);
		renderer.fillRect(881, 142, 7, 518);
		renderer.setColor("#3b5260");
		renderer.fillRect(392, 142, 2, 518);
		renderer.fillRect(886, 142, 2, 518);

		renderer.setColor(COLORS.border);
		for (let y = 170; y < 650; y += 42) {
			renderer.fillRect(356, y, 14, 1);
			renderer.fillRect(910, y, 14, 1);
		}
		renderer.setColor("#49616e");
		for (let y = 166; y < 650; y += 42) {
			renderer.fillRect(362, y, 3, 3);
			renderer.fillRect(895, y, 3, 3);
		}

		renderer.setColor(COLORS.borderBright);
		renderer.fillRect(368, 142, 24, 3);
		renderer.fillRect(368, 657, 24, 3);
		renderer.fillRect(888, 142, 24, 3);
		renderer.fillRect(888, 657, 24, 3);

		const gateOpen =
			this.state.phase === "gate" || this.state.phase === "success"
				? this.state.gateProgress
				: 0;
		this.drawGatePanel(
			renderer,
			888,
			UPPER_GATE.top,
			24,
			(UPPER_GATE.bottom - UPPER_GATE.top) * (1 - gateOpen),
			COLORS.amber,
		);
		this.drawGatePanel(
			renderer,
			368,
			LOWER_GATE.top,
			24,
			LOWER_GATE.bottom - LOWER_GATE.top,
			COLORS.cyan,
		);
	}

	private drawGatePanel(
		renderer: CanvasRenderer,
		x: number,
		y: number,
		width: number,
		height: number,
		accent: string,
	) {
		if (height <= 0) {
			return;
		}
		renderer.setColor("#122934");
		renderer.fillRect(x, y, width, height);
		renderer.setColor(accent);
		for (let row = y + 8; row < y + height - 4; row += 18) {
			renderer.setGlobalAlpha(0.33);
			renderer.fillRect(x + 2, row, width - 4, 5);
		}
		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.borderBright);
		renderer.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
	}

	private drawChamberWater(renderer: CanvasRenderer) {
		const surface = waterY(this.state.level);
		const height = CHAMBER.bottom - surface;
		renderer.save();
		renderer.clipRect(
			CHAMBER.left,
			CHAMBER.top,
			CHAMBER.right - CHAMBER.left,
			CHAMBER.bottom - CHAMBER.top,
		);

		const bandHeight = height / 11;
		for (let i = 0; i < 12; i++) {
			renderer.setColor(mixColor(COLORS.waterTop, COLORS.waterDeep, i / 11));
			renderer.setGlobalAlpha(i === 0 ? 0.96 : 0.86);
			renderer.fillRect(
				CHAMBER.left,
				surface + i * bandHeight,
				CHAMBER.right - CHAMBER.left,
				bandHeight + 1,
			);
		}
		renderer.setGlobalAlpha(1);

		for (let i = 0; i < 10; i++) {
			const bubbleX =
				CHAMBER.left +
				28 +
				((i * 79 + this.clock * (8 + i)) % (CHAMBER.right - CHAMBER.left - 56));
			const bubbleY =
				CHAMBER.bottom -
				((this.clock * (12 + i * 0.7) + i * 41) % Math.max(30, height - 20));
			renderer.setColor("#a9f4ff");
			renderer.setGlobalAlpha(0.2);
			renderer.fillArc(bubbleX, bubbleY, 1.5 + (i % 3), 0, Math.PI * 2);
		}
		renderer.setGlobalAlpha(1);

		for (let i = 1; i <= 4; i++) {
			this.strokeWave(
				renderer,
				CHAMBER.left,
				CHAMBER.right,
				surface + i * 30,
				this.clock * 0.8 + i * 0.55,
				0.2,
			);
		}
		this.strokeWave(
			renderer,
			CHAMBER.left,
			CHAMBER.right,
			surface,
			this.clock * 1.1,
			0.9,
		);
		renderer.restore();

		renderer.setColor(COLORS.green);
		renderer.setGlobalAlpha(0.28);
		for (let x = CHAMBER.left + 12; x < CHAMBER.right - 12; x += 16) {
			renderer.fillRect(x, waterY(LOCK.targetLevel), 8, 1);
		}
		renderer.setColor(COLORS.red);
		renderer.setGlobalAlpha(0.22);
		for (let x = CHAMBER.left + 12; x < CHAMBER.right - 12; x += 16) {
			renderer.fillRect(x, waterY(LOCK.overfillLevel), 8, 1);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawFlow(renderer: CanvasRenderer) {
		const { inlet, drain, throughFlow } = this.state;
		const surface = waterY(this.state.level);

		renderer.setColor("#163845");
		renderer.fillRect(414, 142, 40, 84);
		renderer.setColor(COLORS.borderBright);
		renderer.strokeRect(414.5, 142.5, 39, 83);
		renderer.setColor(COLORS.cyanDark);
		renderer.fillRect(424, 170, 20, 54);
		renderer.setColor(COLORS.cyan);
		renderer.setGlobalAlpha(0.7);
		renderer.fillRect(428, 216, 12, 4);
		renderer.setGlobalAlpha(1);

		const inletDrops = Math.round(inlet * 17);
		const travel = Math.max(16, surface - 220);
		renderer.lineWidth = 2;
		for (let i = 0; i < inletDrops; i++) {
			const y = 220 + ((this.clock * 210 + i * 37) % travel);
			const x = 434 + Math.sin(this.clock * 9 + i * 1.7) * 7;
			renderer.setColor(i % 3 === 0 ? "#d6fbff" : COLORS.cyan);
			renderer.setGlobalAlpha(0.35 + inlet * 0.55);
			renderer.beginPath();
			renderer.moveTo(x, y);
			renderer.lineTo(x + 2, y + 9);
			renderer.stroke();
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor("#1a3039");
		renderer.fillRect(822, 604, 58, 56);
		renderer.setColor(COLORS.borderBright);
		renderer.strokeRect(822.5, 604.5, 57, 55);
		renderer.setColor("#051015");
		renderer.fillArc(852, 632, 20, 0, Math.PI * 2);

		renderer.lineWidth = 1.5;
		const drainDrops = Math.round(drain * 22);
		for (let i = 0; i < drainDrops; i++) {
			const angle = this.clock * 2.4 + i * 2.399;
			const radius = 7 + ((i * 5 + this.clock * 42) % 28);
			const x = 852 + Math.cos(angle) * radius;
			const y = 632 + Math.sin(angle) * radius * 0.58;
			renderer.setColor(i % 4 === 0 ? "#ffe0ad" : COLORS.amber);
			renderer.setGlobalAlpha(0.3 + drain * 0.55);
			renderer.fillRect(x, y, 2.5, 2.5);
		}
		renderer.setGlobalAlpha(1);

		if (throughFlow > 0.05) {
			const strength = Math.min(1, throughFlow * 1.6);
			renderer.setColor(COLORS.amber);
			renderer.setGlobalAlpha(0.12 + strength * 0.2);
			renderer.lineWidth = 3;
			for (let i = 0; i < 4; i++) {
				const radius = 25 + i * 11 + Math.sin(this.clock * 2 + i) * 3;
				renderer.strokeArc(
					640,
					surface + 34,
					radius,
					this.clock * 0.8 + i,
					this.clock * 0.8 + i + 2.2,
				);
			}
			renderer.setGlobalAlpha(1);
			renderer.lineWidth = 1;
		}

		if (this.state.phase === "gate" || this.state.phase === "success") {
			const open = this.state.gateProgress;
			for (let i = 0; i < 12; i++) {
				const offset = (i * 19 + this.clock * 120) % 90;
				renderer.setColor(i % 2 === 0 ? "#d8fbff" : COLORS.cyan);
				renderer.setGlobalAlpha(0.45 * open);
				renderer.fillRect(912 + offset, 290 + (i % 4) * 19, 8, 2);
			}
			renderer.setGlobalAlpha(1);
		}
	}

	private drawShip(renderer: CanvasRenderer) {
		const surface = waterY(this.state.level) + Math.sin(this.clock * 2.1) * 1.4;
		const open =
			this.state.phase === "success"
				? 1
				: this.state.phase === "gate"
					? this.state.gateProgress
					: 0;
		const cx = 640 + open * 306;
		const deckY = surface - 5;

		renderer.setColor("#b8f6ff");
		renderer.setGlobalAlpha(0.24);
		renderer.lineWidth = 2;
		for (let i = 0; i < 4; i++) {
			renderer.strokeArc(
				cx - 118,
				surface + 8,
				36 + i * 9,
				Math.PI * 0.52,
				Math.PI * 0.92,
			);
		}
		renderer.setGlobalAlpha(1);
		renderer.lineWidth = 1;

		renderer.path2D.beginPath();
		renderer.path2D.moveTo(cx - 118, deckY);
		renderer.path2D.lineTo(cx - 88, surface + 46);
		renderer.path2D.lineTo(cx + 92, surface + 46);
		renderer.path2D.lineTo(cx + 128, deckY + 1);
		renderer.path2D.lineTo(cx + 118, deckY - 7);
		renderer.path2D.lineTo(cx - 106, deckY - 7);
		renderer.path2D.closePath();
		renderer.setColor(COLORS.ship);
		renderer.fill();
		renderer.setColor("#f2a49f");
		renderer.lineWidth = 2;
		renderer.stroke();
		renderer.setColor(COLORS.shipDark);
		renderer.fillRect(cx - 96, surface + 24, 208, 8);
		renderer.setColor("#ffd8c4");
		renderer.setGlobalAlpha(0.65);
		for (let i = 0; i < 5; i++) {
			renderer.fillArc(cx - 72 + i * 35, surface + 19, 3, 0, Math.PI * 2);
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor("#24383f");
		renderer.fillRect(cx - 106, deckY - 9, 220, 8);
		renderer.setColor("#69828a");
		renderer.fillRect(cx - 106, deckY - 9, 220, 2);

		renderer.setColor("#d9823f");
		renderer.fillRect(cx - 102, deckY - 43, 56, 32);
		renderer.setColor("#f0b55e");
		renderer.fillRect(cx - 99, deckY - 40, 50, 4);
		renderer.setColor("#3e7791");
		renderer.fillRect(cx - 40, deckY - 41, 56, 30);
		renderer.setColor("#7bb2c7");
		renderer.fillRect(cx - 37, deckY - 38, 50, 4);

		renderer.setColor("#dce8e7");
		renderer.fillRect(cx + 23, deckY - 53, 56, 44);
		renderer.setColor("#8ea7ab");
		renderer.fillRect(cx + 23, deckY - 53, 56, 4);
		for (let i = 0; i < 4; i++) {
			renderer.setColor(i % 2 === 0 ? "#18333b" : "#2d5863");
			renderer.fillRect(cx + 31 + i * 12, deckY - 45, 7, 8);
		}

		renderer.setColor("#303a3e");
		renderer.fillRect(cx + 68, deckY - 74, 14, 27);
		renderer.setColor("#d66a4a");
		renderer.fillRect(cx + 67, deckY - 77, 16, 5);
		for (let i = 0; i < 3; i++) {
			const puff = (this.clock * 0.9 + i * 0.35) % 1;
			renderer.setColor("#8d9ea2");
			renderer.setGlobalAlpha((1 - puff) * 0.28);
			renderer.fillArc(
				cx + 78 + Math.sin(puff * 9 + i) * 8,
				deckY - 89 - puff * 31,
				5 + puff * 7,
				0,
				Math.PI * 2,
			);
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor("#d9fbff");
		renderer.setGlobalAlpha(0.55);
		for (let i = 0; i < 7; i++) {
			const x = cx - 86 + i * 33;
			const lift = Math.sin(this.clock * 1.8 + i) * 2;
			renderer.fillRect(x, surface - 2 + lift, 13, 2);
		}
		renderer.setGlobalAlpha(1);

		if (this.state.phase === "gate" || this.state.phase === "success") {
			renderer.setColor(COLORS.green);
			renderer.setGlobalAlpha(0.45);
			renderer.lineWidth = 2;
			renderer.strokeRect(cx - 120, deckY - 78, 250, 126);
			renderer.setGlobalAlpha(1);
			renderer.lineWidth = 1;
		}
	}

	private drawPressureGlow(renderer: CanvasRenderer) {
		const pressure = this.state.pressure;

		if (pressure > 0.5) {
			const strength = Math.min(1, (pressure - 0.5) / 0.5);
			renderer.save();
			renderer.clipRect(
				CHAMBER.left,
				CHAMBER.top,
				CHAMBER.right - CHAMBER.left,
				CHAMBER.bottom - CHAMBER.top,
			);
			renderer.setColor(COLORS.red);
			renderer.setGlobalAlpha(strength * 0.18);
			renderer.fillRect(
				CHAMBER.left,
				CHAMBER.top,
				CHAMBER.right - CHAMBER.left,
				CHAMBER.bottom - CHAMBER.top,
			);
			renderer.restore();
		}

		if (pressure > 0.75) {
			renderer.setColor(COLORS.red);
			renderer.setGlobalAlpha(0.45 + Math.sin(this.clock * 8) * 0.2);
			renderer.lineWidth = 3;
			renderer.strokeRect(
				CHAMBER.left - 3,
				CHAMBER.top - 3,
				CHAMBER.right - CHAMBER.left + 6,
				CHAMBER.bottom - CHAMBER.top + 6,
			);
			renderer.setGlobalAlpha(1);
			renderer.lineWidth = 1;
		}

		if (this.state.failure === "pinch") {
			renderer.setColor(COLORS.red);
			renderer.setGlobalAlpha(0.85);
			renderer.fillRect(CHAMBER.left, UPPER_GATE.top, 496, 5);
			renderer.setGlobalAlpha(1);
		}

		if (this.state.phase === "gate") {
			renderer.setColor(COLORS.green);
			renderer.setGlobalAlpha(0.5 + Math.sin(this.clock * 6) * 0.15);
			renderer.lineWidth = 2;
			renderer.strokeRect(
				884,
				UPPER_GATE.top - 4,
				32,
				UPPER_GATE.bottom - UPPER_GATE.top + 8,
			);
			renderer.setGlobalAlpha(1);
			renderer.lineWidth = 1;
		}
	}

	private drawConsoles(renderer: CanvasRenderer) {
		this.drawConsoleCard(
			renderer,
			44,
			676,
			340,
			108,
			COLORS.cyan,
			this.state.leftInput,
		);
		this.drawConsoleCard(
			renderer,
			896,
			676,
			340,
			108,
			COLORS.amber,
			this.state.rightInput,
		);

		renderer.setColor(COLORS.panel);
		renderer.beginPath();
		renderer.roundRect(400, 676, 480, 108, 7);
		renderer.fill();
		renderer.setColor(COLORS.border);
		renderer.strokeRect(401, 677, 478, 106);
		renderer.setColor(COLORS.borderBright);
		renderer.fillRect(424, 744, 432, 1);

		this.drawValveBar(renderer, 64, 734, 300, this.state.inlet, COLORS.cyan);
		this.drawValveBar(renderer, 916, 734, 300, this.state.drain, COLORS.amber);

		const stable = this.state.stableTime;
		for (let i = 0; i < 5; i++) {
			const x = 438 + i * 88;
			const filled = stable >= ((i + 1) / 5) * LOCK.holdSeconds;
			renderer.setColor(filled ? COLORS.green : "#17313c");
			renderer.beginPath();
			renderer.roundRect(x, 752, 70, 8, 4);
			renderer.fill();
			renderer.setColor(filled ? "#c7ffe0" : COLORS.border);
			renderer.strokeRect(x + 0.5, 752.5, 69, 7);
		}

		const gateReady =
			this.state.stableTime >= LOCK.holdSeconds ||
			this.state.phase === "gate" ||
			this.state.phase === "success";
		renderer.setColor(
			gateReady
				? COLORS.green
				: this.state.phase === "failed"
					? COLORS.red
					: COLORS.amberDark,
		);
		renderer.fillArc(1218, 762, 7, 0, Math.PI * 2);
		renderer.setColor("#e9fff4");
		renderer.setGlobalAlpha(gateReady ? 0.7 : 0.15);
		renderer.fillArc(1215, 759, 2.5, 0, Math.PI * 2);
		renderer.setGlobalAlpha(1);
	}

	private drawConsoleCard(
		renderer: CanvasRenderer,
		x: number,
		y: number,
		width: number,
		height: number,
		accent: string,
		active: boolean,
	) {
		renderer.setColor(COLORS.panel);
		renderer.beginPath();
		renderer.roundRect(x, y, width, height, 7);
		renderer.fill();
		renderer.setColor(COLORS.border);
		renderer.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
		renderer.setColor(accent);
		renderer.setGlobalAlpha(0.8);
		renderer.fillRect(x + 1, y + 1, width - 2, 3);
		renderer.setGlobalAlpha(1);

		renderer.setColor(active ? accent : COLORS.dim);
		renderer.fillArc(x + 10, y + 16, 4.5, 0, Math.PI * 2);
		if (active) {
			renderer.setGlobalAlpha(0.28);
			renderer.fillArc(x + 10, y + 16, 9, 0, Math.PI * 2);
			renderer.setGlobalAlpha(1);
		}
	}

	private drawValveBar(
		renderer: CanvasRenderer,
		x: number,
		y: number,
		width: number,
		value: number,
		accent: string,
	) {
		const safeWidth = width * LOCK.safeValve;
		renderer.setColor("#041016");
		renderer.fillRect(x, y, width, 12);
		renderer.setColor(accent);
		renderer.setGlobalAlpha(0.1);
		renderer.fillRect(x, y, safeWidth, 12);
		renderer.setColor(COLORS.red);
		renderer.setGlobalAlpha(0.12);
		renderer.fillRect(x + safeWidth, y, width - safeWidth, 12);
		renderer.setGlobalAlpha(1);

		renderer.setColor(value > LOCK.safeValve ? COLORS.red : accent);
		renderer.fillRect(x, y + 8, value * width, 4);
		renderer.setColor("#ffffff");
		renderer.fillRect(x + value * width - 2, y - 3, 4, 18);
		renderer.setColor(value > LOCK.safeValve ? COLORS.red : COLORS.amber);
		renderer.fillRect(x + safeWidth - 1, y - 2, 2, 16);
		renderer.setColor(COLORS.borderBright);
		renderer.strokeRect(x, y, width, 12);
		for (let i = 1; i < 10; i++) {
			renderer.setColor(COLORS.dim);
			renderer.fillRect(x + (i / 10) * width, y + 12, 1, 4);
		}
	}

	private drawResult(renderer: CanvasRenderer) {
		const terminal =
			this.state.phase === "success" || this.state.phase === "failed";
		if (!terminal) {
			return;
		}
		const success = this.state.phase === "success";
		const accent = success ? COLORS.green : COLORS.red;

		renderer.setColor("#02090d");
		renderer.setGlobalAlpha(0.88);
		renderer.beginPath();
		renderer.roundRect(350, 266, 580, 196, 10);
		renderer.fill();
		renderer.setGlobalAlpha(1);
		renderer.setColor(accent);
		renderer.fillRect(352, 268, 576, 4);
		renderer.setColor("#35505b");
		renderer.strokeRect(350.5, 266.5, 579, 195);

		renderer.setColor(accent);
		renderer.setGlobalAlpha(0.12);
		for (let x = 370; x < 910; x += 24) {
			renderer.fillRect(x, 280, 12, 1);
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor(accent);
		renderer.fillArc(640, 250, 13, 0, Math.PI * 2);
		renderer.setColor("#041016");
		renderer.lineWidth = 3;
		if (success) {
			renderer.beginPath();
			renderer.moveTo(633, 250);
			renderer.lineTo(638, 256);
			renderer.lineTo(648, 244);
			renderer.stroke();
		} else {
			renderer.beginPath();
			renderer.moveTo(634, 244);
			renderer.lineTo(646, 256);
			renderer.moveTo(646, 244);
			renderer.lineTo(634, 256);
			renderer.stroke();
		}
		renderer.lineWidth = 1;
	}
}

const createGame = async () => {
	const app = new Application(LOCK.width, LOCK.height, {
		parent: "screen",
		renderer: video.CANVAS,
		scale: "auto",
		backgroundColor: COLORS.bg,
	});
	await app.init();

	input.bindKey(input.KEY.W, "lockInletOpen");
	input.bindKey(input.KEY.S, "lockInletClose");
	input.bindKey(input.KEY.UP, "lockDrainOpen");
	input.bindKey(input.KEY.DOWN, "lockDrainClose");
	input.bindKey(input.KEY.SPACE, "lockGate", true);
	input.bindKey(input.KEY.R, "lockRestart", true);

	const scene = new ShipLockScene();
	app.world.addChild(scene);
	globalThis.__shipLock = {
		getState: () => ({ ...scene.state }),
		isStarted: () => scene.hasStarted(),
		reset: () => scene.reset(),
	};

	return () => {
		delete globalThis.__shipLock;
	};
};

export const ExampleShipLock = createExampleComponent(createGame);
