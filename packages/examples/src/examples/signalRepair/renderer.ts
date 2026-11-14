import {
	type CanvasRenderer,
	Renderable,
	Text,
	type WebGLRenderer,
	type WebGPURenderer,
} from "melonjs";
import { SignalAudio } from "./audioEngine";
import {
	type ConnectResult,
	formatModuleValue,
	type GamePhase,
	LANE_META,
	laneQuality,
	MODULE_META,
	MODULE_ORDER,
	type ModuleKind,
	type NodeId,
	PASS_QUALITY,
	PROTECTION_LIMIT,
	pathFromSource,
	RepairSession,
	STABLE_TARGET_MS,
	seedLabel,
	VIEW_HEIGHT,
	VIEW_WIDTH,
} from "./model";

type RendererLike = CanvasRenderer | WebGLRenderer | WebGPURenderer;

const PANEL = { x: 20, y: 78, w: 996, h: 620 };
const SIDEBAR = { x: 1028, y: 78, w: 232, h: 620 };
const ROWS = [112, 284, 456];
const ROW_H = 154;
const LANE_X = 32;
const LANE_W = 972;
const SRC_X = 48;
const SRC_W = 140;
const OUT_X = 872;
const OUT_W = 104;
const MODULE_X = [218, 382, 546, 710];
const MODULE_W = 144;
const MODULE_Y = 28;
const MODULE_H = 96;
const PORT_Y = 76;
const KNOB_R = 16;

const COLORS = {
	bg: "#061015",
	grid: "#0b2026",
	panel: "#08191e",
	panelHi: "#0d242a",
	border: "#1b3940",
	borderHi: "#2a5b63",
	text: "#d8fff4",
	muted: "#6e9ba1",
	dim: "#3e666c",
	green: "#78ffd1",
	amber: "#ffc55d",
	red: "#ff5b70",
	blue: "#53d9ff",
};

interface LabelStyle {
	size: number;
	color: string;
	align?: CanvasTextAlign;
	bold?: boolean;
}

class Label {
	private readonly text: Text;
	private value = "";
	private shown = true;

	constructor(x: number, y: number, style: LabelStyle) {
		this.text = new Text(x, y, {
			font: "Courier New",
			size: style.size,
			fillStyle: style.color,
			textAlign: style.align ?? "left",
			textBaseline: "top",
			bold: style.bold ?? false,
			text: "",
		});
	}

	set(value: string): void {
		if (value === this.value) return;
		this.value = value;
		this.text.setText(value);
	}

	visible(visible: boolean): void {
		this.shown = visible;
	}

	draw(renderer: RendererLike): void {
		if (this.shown) this.text.draw(renderer);
	}
}

interface KnobDrag {
	lane: number;
	kind: ModuleKind;
	startY: number;
	startValue: number;
}

interface CableDrag {
	lane: number;
	from: NodeId;
	x: number;
	y: number;
}

interface ModuleHit {
	lane: number;
	kind: ModuleKind;
}

interface Port {
	lane: number;
	node: NodeId;
	x: number;
	y: number;
}

function pointOnCubic(
	t: number,
	p0: { x: number; y: number },
	p1: { x: number; y: number },
	p2: { x: number; y: number },
	p3: { x: number; y: number },
): { x: number; y: number } {
	const u = 1 - t;
	const uu = u * u;
	const tt = t * t;
	return {
		x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
		y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
	};
}

export class SignalRepairView extends Renderable {
	session: RepairSession;
	audio: SignalAudio;
	private readonly labels = new Map<string, Label>();
	private clock = 0;
	private knobDrag: KnobDrag | null = null;
	private cableDrag: CableDrag | null = null;
	private hoverModule: ModuleHit | null = null;
	private protectionActive = false;
	private outcomeHandled = false;

	constructor(seed: number) {
		super(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.name = "signal-repair";
		this.alwaysUpdate = true;
		this.isPersistent = true;
		this.session = new RepairSession(seed);
		this.audio = new SignalAudio(this.session.model);
		this.createLabels();
		this.syncLabels();
	}

	private makeLabel(
		id: string,
		x: number,
		y: number,
		style: LabelStyle,
	): Label {
		const label = new Label(x, y, style);
		this.labels.set(id, label);
		return label;
	}

	private label(id: string): Label {
		const label = this.labels.get(id);
		if (!label) throw new Error(`missing signal repair label ${id}`);
		return label;
	}

	private createLabels(): void {
		this.makeLabel("title", 28, 12, {
			size: 22,
			color: COLORS.text,
			bold: true,
		}).set("SIGNAL RECOVERY");
		this.makeLabel("subtitle", 30, 42, {
			size: 10,
			color: COLORS.muted,
		}).set("PATCH BAY 07 · LIVE WEB AUDIO · SIGNAL RECOVERY CONSOLE");
		this.makeLabel("seed", 540, 14, {
			size: 11,
			color: COLORS.green,
		});
		this.makeLabel("audioStatus", 540, 32, {
			size: 9,
			color: COLORS.dim,
		});
		this.makeLabel("trips", 1038, 13, {
			size: 11,
			color: COLORS.amber,
			align: "right",
		});
		this.makeLabel("stable", 1038, 31, {
			size: 11,
			color: COLORS.green,
			align: "right",
		});
		this.makeLabel("replayButton", 812, 23, {
			size: 10,
			color: COLORS.text,
			align: "center",
		}).set("REPLAY");
		this.makeLabel("reseedButton", 918, 23, {
			size: 10,
			color: COLORS.text,
			align: "center",
		}).set("RESEED");

		this.makeLabel("patchTitle", 36, 86, {
			size: 10,
			color: COLORS.muted,
		}).set("PATCHBAY / THREE ISOLATED CHANNELS");
		this.makeLabel("patchHint", 1004, 86, {
			size: 9,
			color: COLORS.dim,
			align: "right",
		}).set("DRAG JACK → JACK · DRAG KNOB VERTICALLY");
		this.makeLabel("protectionAlert", 640, 660, {
			size: 11,
			color: COLORS.red,
			align: "center",
			bold: true,
		});
		this.label("protectionAlert").visible(false);

		for (let lane = 0; lane < LANE_META.length; lane++) {
			const row = ROWS[lane];
			const meta = LANE_META[lane];
			this.makeLabel(`laneCode${lane}`, SRC_X + 10, row + 10, {
				size: 9,
				color: meta.color,
			}).set(meta.code);
			this.makeLabel(`laneName${lane}`, SRC_X + 10, row + 25, {
				size: 12,
				color: COLORS.text,
				bold: true,
			}).set(meta.name);
			this.makeLabel(`laneDetail${lane}`, SRC_X + 10, row + 43, {
				size: 9,
				color: COLORS.muted,
			}).set(meta.detail);
			for (let i = 0; i < MODULE_ORDER.length; i++) {
				const kind = MODULE_ORDER[i];
				this.makeLabel(`module${lane}${kind}`, MODULE_X[i] + 10, row + 36, {
					size: 9,
					color: meta.color,
					bold: true,
				}).set(MODULE_META[kind].short);
				this.makeLabel(`value${lane}${kind}`, MODULE_X[i] + 9, row + 91, {
					size: 9,
					color: COLORS.text,
				});
			}
			this.makeLabel(`bus${lane}`, OUT_X + OUT_W / 2, row + 12, {
				size: 8,
				color: meta.color,
				align: "center",
			}).set(`BUS ${String(lane + 1).padStart(2, "0")}`);
			this.makeLabel(`laneQuality${lane}`, OUT_X + OUT_W / 2, row + 42, {
				size: 18,
				color: COLORS.text,
				align: "center",
				bold: true,
			});
			this.makeLabel(`laneQualityCaption${lane}`, OUT_X + OUT_W / 2, row + 65, {
				size: 8,
				color: COLORS.muted,
				align: "center",
			}).set("INTEGRITY");
		}

		this.makeLabel("masterTitle", SIDEBAR.x + 14, SIDEBAR.y + 12, {
			size: 11,
			color: COLORS.text,
			bold: true,
		}).set("MASTER ANALYSER");
		this.makeLabel("waveTitle", SIDEBAR.x + 14, SIDEBAR.y + 36, {
			size: 8,
			color: COLORS.muted,
		}).set("WAVEFORM / LIVE");
		this.makeLabel("spectrumTitle", SIDEBAR.x + 14, SIDEBAR.y + 164, {
			size: 8,
			color: COLORS.muted,
		}).set("SPECTRUM / 40 Hz — 16 kHz");
		this.makeLabel("qualityTitle", SIDEBAR.x + 14, SIDEBAR.y + 332, {
			size: 9,
			color: COLORS.muted,
		}).set("OUTPUT QUALITY");
		this.makeLabel("qualityValue", SIDEBAR.x + 14, SIDEBAR.y + 350, {
			size: 34,
			color: COLORS.green,
			bold: true,
		});
		this.makeLabel("levelValue", SIDEBAR.x + SIDEBAR.w - 14, SIDEBAR.y + 362, {
			size: 10,
			color: COLORS.muted,
			align: "right",
		});
		this.makeLabel("stableTitle", SIDEBAR.x + 14, SIDEBAR.y + 438, {
			size: 9,
			color: COLORS.muted,
		}).set("STABILITY WINDOW");
		this.makeLabel("stableValue", SIDEBAR.x + SIDEBAR.w - 14, SIDEBAR.y + 438, {
			size: 9,
			color: COLORS.green,
			align: "right",
		});
		this.makeLabel("protectionTitle", SIDEBAR.x + 14, SIDEBAR.y + 498, {
			size: 9,
			color: COLORS.muted,
		}).set("PROTECTION TRIPS");
		this.makeLabel(
			"protectionValue",
			SIDEBAR.x + SIDEBAR.w - 14,
			SIDEBAR.y + 498,
			{
				size: 10,
				color: COLORS.amber,
				align: "right",
			},
		);
		this.makeLabel("help1", SIDEBAR.x + 14, SIDEBAR.y + 548, {
			size: 8,
			color: COLORS.muted,
		}).set("Every channel needs HPF + LPF + DELAY");
		this.makeLabel("help2", SIDEBAR.x + 14, SIDEBAR.y + 564, {
			size: 8,
			color: COLORS.muted,
		}).set("+ GAIN in the path. Tune by ear.");
		this.makeLabel("help3", SIDEBAR.x + 14, SIDEBAR.y + 588, {
			size: 8,
			color: COLORS.red,
		}).set("A closed loop trips the safety relay.");

		this.makeLabel("overlayTitle", 640, 258, {
			size: 30,
			color: COLORS.text,
			align: "center",
			bold: true,
		});
		this.makeLabel("overlayBody", 640, 314, {
			size: 13,
			color: COLORS.text,
			align: "center",
		});
		this.makeLabel("overlayHint", 640, 372, {
			size: 10,
			color: COLORS.muted,
			align: "center",
		});
	}

	start(): void {
		this.session.start();
		void this.audio.resume();
		this.syncLabels();
	}

	restart(seed = this.session.model.seed, autoStart = true): void {
		this.audio.destroy();
		this.session = new RepairSession(seed);
		this.audio = new SignalAudio(this.session.model);
		this.protectionActive = false;
		this.outcomeHandled = false;
		this.knobDrag = null;
		this.cableDrag = null;
		if (autoStart) this.start();
		this.syncLabels();
	}

	reseed(): void {
		const next = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
		this.restart(next, true);
	}

	applySolution(): void {
		this.session.applySolution();
		for (let lane = 0; lane < this.session.model.lanes.length; lane++) {
			const state = this.session.model.lanes[lane];
			for (const kind of MODULE_ORDER) {
				this.audio.setKnob(lane, kind, state.values[kind]);
			}
			this.audio.updateRoute(lane, pathFromSource(state.edges));
		}
		this.syncLabels();
	}

	miswire(lane = 0): ConnectResult {
		const result = this.session.miswire(lane);
		if (result.feedback) this.handleFeedback();
		return result;
	}

	snapshot() {
		return {
			...this.session.snapshot(),
			audioAvailable: this.audio.available,
			protectionActive: this.protectionActive,
		};
	}

	onPointerDown(x: number, y: number): void {
		if (this.session.phase === "standby") {
			this.start();
			return;
		}
		if (this.hitReplay(x, y)) {
			this.restart(this.session.model.seed, true);
			return;
		}
		if (this.hitReseed(x, y)) {
			this.reseed();
			return;
		}
		if (this.session.phase !== "running") return;

		const knob = this.findKnob(x, y);
		if (knob) {
			this.knobDrag = {
				lane: knob.lane,
				kind: knob.kind,
				startY: y,
				startValue: this.session.model.lanes[knob.lane].values[knob.kind],
			};
			return;
		}

		const output = this.findOutputPort(x, y);
		if (output) {
			this.cableDrag = {
				lane: output.lane,
				from: output.node,
				x,
				y,
			};
		}
	}

	onPointerMove(x: number, y: number): void {
		this.hoverModule = this.findKnob(x, y);
		if (this.knobDrag) {
			const range = MODULE_META[this.knobDrag.kind].range;
			const delta = (this.knobDrag.startY - y) * (range.max - range.min);
			const value = this.knobDrag.startValue + delta / 240;
			this.session.setKnob(this.knobDrag.lane, this.knobDrag.kind, value);
			this.audio.setKnob(
				this.knobDrag.lane,
				this.knobDrag.kind,
				this.session.model.lanes[this.knobDrag.lane].values[this.knobDrag.kind],
			);
			this.syncLabels();
		}
		if (this.cableDrag) {
			this.cableDrag.x = x;
			this.cableDrag.y = y;
		}
	}

	onPointerUp(x: number, y: number): void {
		if (this.knobDrag) {
			this.knobDrag = null;
			return;
		}
		const cable = this.cableDrag;
		this.cableDrag = null;
		if (!cable || this.session.phase !== "running") return;
		const input = this.findInputPort(x, y, cable.lane);
		if (!input) return;
		const result = this.session.connect(cable.lane, cable.from, input.node);
		if (result.accepted) {
			this.audio.updateRoute(
				cable.lane,
				pathFromSource(this.session.model.lanes[cable.lane].edges),
			);
		} else if (result.feedback) {
			this.handleFeedback();
		}
		this.syncLabels();
	}

	private handleFeedback(): void {
		this.protectionActive = this.session.protectionMs > 0;
		if (this.protectionActive) {
			this.audio.triggerFeedback();
			this.audio.setProtection(true);
		} else if (this.session.phase === "failure") {
			this.audio.shutdown();
			this.outcomeHandled = true;
		}
		this.syncLabels();
	}

	override update(dt: number): boolean {
		this.clock += dt;
		const level = this.audio.getMasterLevel();
		const wasProtection = this.session.protectionMs;
		this.session.tick(dt, level);
		if (wasProtection > 0 && this.session.protectionMs === 0) {
			this.protectionActive = false;
			this.audio.setProtection(false);
		}
		if (
			(this.session.phase === "success" || this.session.phase === "failure") &&
			!this.outcomeHandled
		) {
			this.outcomeHandled = true;
			this.audio.shutdown();
		}
		this.syncLabels();
		return true;
	}

	private syncLabels(): void {
		const snapshot = this.session.snapshot();
		const quality = snapshot.quality;
		this.label("seed").set(`SEED ${seedLabel(snapshot.seed)}`);
		this.label("audioStatus").set(
			this.audio.available
				? this.protectionActive
					? "PROTECTION RELAY OPEN · FEEDBACK ISOLATED"
					: this.session.phase === "standby"
						? "AUDIO LINK ARMED · CLICK TO OPEN"
						: "WEB AUDIO GRAPH ONLINE"
				: "WEB AUDIO UNAVAILABLE",
		);
		this.label("protectionAlert").set(
			this.protectionActive ? "FEEDBACK LOOP DETECTED · SAFETY RELAY OPEN" : "",
		);
		this.label("protectionAlert").visible(this.protectionActive);
		this.label("trips").set(`TRIPS ${snapshot.trips}/${PROTECTION_LIMIT}`);
		this.label("stable").set(
			`STABLE ${(snapshot.stableMs / 1000).toFixed(1)}/${(STABLE_TARGET_MS / 1000).toFixed(1)}s`,
		);

		for (let lane = 0; lane < this.session.model.lanes.length; lane++) {
			const state = this.session.model.lanes[lane];
			for (const kind of MODULE_ORDER) {
				this.label(`value${lane}${kind}`).set(
					formatModuleValue(kind, state.values[kind]),
				);
			}
			const laneScore = laneQuality(state);
			this.label(`laneQuality${lane}`).set(`${Math.round(laneScore * 100)}%`);
		}

		this.label("qualityValue").set(`${Math.round(quality * 100)}%`);
		this.label("levelValue").set(
			`LEVEL ${Math.round(snapshot.masterLevel * 100)}%`,
		);
		this.label("stableValue").set(
			`${(snapshot.stableMs / 1000).toFixed(1)} / 10.0s`,
		);
		this.label("protectionValue").set(
			`${snapshot.trips} / ${PROTECTION_LIMIT}`,
		);
		this.syncOverlay(snapshot.phase, snapshot.reason);
	}

	private syncOverlay(phase: GamePhase, reason: string): void {
		const running = phase === "running";
		this.label("overlayTitle").visible(!running);
		this.label("overlayBody").visible(!running);
		this.label("overlayHint").visible(!running);
		if (running) return;

		if (phase === "standby") {
			this.label("overlayTitle").set("AUDIO LINK OFFLINE");
			this.label("overlayBody").set("CLICK ANYWHERE TO OPEN THE MONITOR");
			this.label("overlayHint").set(
				"HEADPHONES RECOMMENDED · EACH SEED REPLAYS THE SAME FAULT SPECTRUM",
			);
		} else if (phase === "success") {
			this.label("overlayTitle").set("LINK STABLE");
			this.label("overlayBody").set("OUTPUT QUALITY HELD FOR 10.0 SECONDS");
			this.label("overlayHint").set(
				`SEED ${seedLabel(this.session.model.seed)} · SAME-SEED RUN VERIFIED`,
			);
		} else {
			this.label("overlayTitle").set("EMERGENCY SHUTDOWN");
			this.label("overlayBody").set(
				reason === "MAIN SIGNAL LOST"
					? "MAIN SIGNAL BELOW THRESHOLD FOR 3.0s"
					: "PROTECTION LIMIT REACHED · 5 FEEDBACK TRIPS",
			);
			this.label("overlayHint").set(
				`SEED ${seedLabel(this.session.model.seed)} · REPLAY TO RETRY THE SAME FAULT`,
			);
		}
	}

	private hitReplay(x: number, y: number): boolean {
		return x >= 764 && x <= 860 && y >= 14 && y <= 46;
	}

	private hitReseed(x: number, y: number): boolean {
		return x >= 870 && x <= 966 && y >= 14 && y <= 46;
	}

	private knobCenter(lane: number, index: number): { x: number; y: number } {
		return {
			x: MODULE_X[index] + MODULE_W - 34,
			y: ROWS[lane] + 61,
		};
	}

	private findKnob(x: number, y: number): ModuleHit | null {
		for (let lane = 0; lane < ROWS.length; lane++) {
			for (let i = 0; i < MODULE_ORDER.length; i++) {
				const center = this.knobCenter(lane, i);
				if (Math.hypot(x - center.x, y - center.y) <= KNOB_R + 8) {
					return { lane, kind: MODULE_ORDER[i] };
				}
			}
		}
		return null;
	}

	private outputPort(lane: number, node: NodeId): { x: number; y: number } {
		if (node === "src") {
			return { x: SRC_X + SRC_W, y: ROWS[lane] + PORT_Y };
		}
		const index = MODULE_ORDER.indexOf(node as ModuleKind);
		return {
			x: MODULE_X[index] + MODULE_W,
			y: ROWS[lane] + PORT_Y,
		};
	}

	private inputPort(lane: number, node: NodeId): { x: number; y: number } {
		if (node === "out") {
			return { x: OUT_X, y: ROWS[lane] + PORT_Y };
		}
		const index = MODULE_ORDER.indexOf(node as ModuleKind);
		return { x: MODULE_X[index], y: ROWS[lane] + PORT_Y };
	}

	private findOutputPort(x: number, y: number): Port | null {
		for (let lane = 0; lane < ROWS.length; lane++) {
			for (const node of ["src", ...MODULE_ORDER] as NodeId[]) {
				const port = this.outputPort(lane, node);
				if (Math.hypot(x - port.x, y - port.y) <= 15) {
					return { lane, node, ...port };
				}
			}
		}
		return null;
	}

	private findInputPort(x: number, y: number, lane: number): Port | null {
		for (const node of [...MODULE_ORDER, "out"] as NodeId[]) {
			const port = this.inputPort(lane, node);
			if (Math.hypot(x - port.x, y - port.y) <= 24) {
				return { lane, node, ...port };
			}
		}
		return null;
	}

	override draw(renderer: RendererLike): void {
		this.drawBackdrop(renderer);
		this.drawHeader(renderer);
		this.drawPatchbay(renderer);
		this.drawSidebar(renderer);
		for (const label of this.labels.values()) label.draw(renderer);
		this.drawOverlayBackdrop(renderer);
		if (this.session.phase !== "running") {
			for (const id of ["overlayTitle", "overlayBody", "overlayHint"]) {
				this.label(id).draw(renderer);
			}
		}
	}

	private drawBackdrop(renderer: RendererLike): void {
		renderer.setColor(COLORS.bg);
		renderer.fillRect(0, 0, 1280, 720);
		renderer.setGlobalAlpha(0.45);
		renderer.setColor(COLORS.grid);
		renderer.lineWidth = 1;
		for (let x = 0; x <= 1280; x += 32) {
			renderer.strokeLine(x, 0, x, 720);
		}
		for (let y = 0; y <= 720; y += 32) {
			renderer.strokeLine(0, y, 1280, y);
		}
		renderer.setGlobalAlpha(1);
		const scanY = (this.clock * 0.035) % 720;
		renderer.setGlobalAlpha(0.08);
		renderer.setColor(COLORS.green);
		renderer.fillRect(0, scanY, 1280, 2);
		renderer.setGlobalAlpha(1);
	}

	private drawHeader(renderer: RendererLike): void {
		renderer.setColor(COLORS.border);
		renderer.fillRect(20, 8, 3, 48);
		this.drawButton(renderer, 764, 14, 96, 32, "REPLAY");
		this.drawButton(renderer, 870, 14, 96, 32, "RESEED");
		renderer.setGlobalAlpha(0.7);
		renderer.setColor(COLORS.dim);
		renderer.lineWidth = 1;
		renderer.strokeLine(20, 66, 1260, 66);
		renderer.setGlobalAlpha(1);
	}

	private drawButton(
		renderer: RendererLike,
		x: number,
		y: number,
		w: number,
		h: number,
		_label: string,
	): void {
		renderer.setColor(COLORS.panelHi);
		renderer.fillRect(x, y, w, h);
		renderer.setColor(COLORS.borderHi);
		renderer.lineWidth = 1;
		renderer.strokeRect(x, y, w, h);
	}

	private drawPatchbay(renderer: RendererLike): void {
		renderer.setColor(COLORS.panel);
		renderer.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
		renderer.setColor(COLORS.border);
		renderer.lineWidth = 1;
		renderer.strokeRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
		if (this.protectionActive) {
			renderer.setColor(COLORS.red);
			renderer.setGlobalAlpha(0.55 + 0.35 * Math.sin(this.clock * 0.025));
			renderer.lineWidth = 3;
			renderer.strokeRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
			renderer.setGlobalAlpha(1);
		}

		for (let lane = 0; lane < ROWS.length; lane++) {
			this.drawLane(renderer, lane);
		}
	}

	private drawLane(renderer: RendererLike, lane: number): void {
		const y = ROWS[lane];
		const meta = LANE_META[lane];
		renderer.setColor(COLORS.panelHi);
		renderer.fillRect(LANE_X, y, LANE_W, ROW_H);
		renderer.setColor(COLORS.border);
		renderer.lineWidth = 1;
		renderer.strokeRect(LANE_X, y, LANE_W, ROW_H);
		renderer.setColor(meta.dim);
		renderer.fillRect(LANE_X, y, 3, ROW_H);

		this.drawCables(renderer, lane);
		this.drawSource(renderer, lane);
		for (let i = 0; i < MODULE_ORDER.length; i++) {
			this.drawModule(renderer, lane, i);
		}
		this.drawBus(renderer, lane);
		if (this.cableDrag?.lane === lane) {
			this.drawCable(
				renderer,
				this.outputPort(lane, this.cableDrag.from),
				{ x: this.cableDrag.x, y: this.cableDrag.y },
				meta.color,
				0.65,
				true,
			);
		}
	}

	private drawCables(renderer: RendererLike, lane: number): void {
		const state = this.session.model.lanes[lane];
		const meta = LANE_META[lane];
		const path = pathFromSource(state.edges);
		const pathSet = new Set(path);
		for (const edge of state.edges) {
			const lit =
				pathSet.has(edge.from) &&
				pathSet.has(edge.to) &&
				path.indexOf(edge.to) > path.indexOf(edge.from);
			this.drawCable(
				renderer,
				this.outputPort(lane, edge.from),
				this.inputPort(lane, edge.to),
				meta.color,
				lit ? 0.95 : 0.38,
				false,
			);
		}
		if (
			this.session.badEdge &&
			this.session.badEdgeLane === lane &&
			this.session.badEdgeMs > 0
		) {
			const alpha = 0.5 + 0.5 * Math.sin(this.clock * 0.035);
			this.drawCable(
				renderer,
				this.outputPort(lane, this.session.badEdge.from),
				this.inputPort(lane, this.session.badEdge.to),
				COLORS.red,
				alpha,
				false,
			);
		}
	}

	private drawCable(
		renderer: RendererLike,
		from: { x: number; y: number },
		to: { x: number; y: number },
		color: string,
		alpha: number,
		draft: boolean,
	): void {
		const span = Math.abs(to.x - from.x);
		const bend = Math.max(26, Math.min(95, span * 0.34));
		const lift = 20 + Math.min(48, span * 0.1);
		const c1 = { x: from.x + bend, y: from.y + lift };
		const c2 = { x: to.x - bend, y: to.y + lift };
		const points: { x: number; y: number }[] = [];
		for (let i = 0; i <= 24; i++) {
			points.push(pointOnCubic(i / 24, from, c1, c2, to));
		}

		renderer.setGlobalAlpha(alpha * 0.18);
		renderer.setColor(color);
		renderer.lineWidth = draft ? 7 : 6;
		for (let i = 0; i < points.length - 1; i++) {
			renderer.strokeLine(
				points[i].x,
				points[i].y,
				points[i + 1].x,
				points[i + 1].y,
			);
		}
		renderer.setGlobalAlpha(draft ? 0.45 : alpha);
		renderer.lineWidth = draft ? 1.5 : 2.2;
		for (let i = 0; i < points.length - 1; i++) {
			renderer.strokeLine(
				points[i].x,
				points[i].y,
				points[i + 1].x,
				points[i + 1].y,
			);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawSource(renderer: RendererLike, lane: number): void {
		const y = ROWS[lane];
		const meta = LANE_META[lane];
		renderer.setColor("#08171c");
		renderer.fillRect(SRC_X, y + 8, SRC_W, 112);
		renderer.setColor(meta.dim);
		renderer.lineWidth = 1;
		renderer.strokeRect(SRC_X, y + 8, SRC_W, 112);
		this.drawPort(renderer, SRC_X + SRC_W, y + PORT_Y, meta.color, true);

		const wave = this.audio.getSourceWaveform(lane);
		renderer.setColor(meta.color);
		renderer.setGlobalAlpha(0.7);
		renderer.lineWidth = 1.2;
		const left = SRC_X + 11;
		const width = SRC_W - 22;
		const center = y + 88;
		const height = 24;
		if (wave) {
			for (let i = 0; i < wave.length - 1; i++) {
				const x1 = left + (i / (wave.length - 1)) * width;
				const x2 = left + ((i + 1) / (wave.length - 1)) * width;
				const y1 =
					center +
					Math.max(-1, Math.min(1, ((wave[i] - 128) / 128) * 2.2)) * height;
				const y2 =
					center +
					Math.max(-1, Math.min(1, ((wave[i + 1] - 128) / 128) * 2.2)) * height;
				renderer.strokeLine(x1, y1, x2, y2);
			}
		} else {
			renderer.strokeLine(left, center, left + width, center);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawModule(
		renderer: RendererLike,
		lane: number,
		index: number,
	): void {
		const y = ROWS[lane] + MODULE_Y;
		const x = MODULE_X[index];
		const kind = MODULE_ORDER[index];
		const meta = LANE_META[lane];
		const path = pathFromSource(this.session.model.lanes[lane].edges);
		const included = path.includes(kind);
		const hovered =
			this.hoverModule?.lane === lane && this.hoverModule.kind === kind;
		renderer.setColor(hovered ? "#102d34" : "#0a1b20");
		renderer.fillRect(x, y, MODULE_W, MODULE_H);
		renderer.setColor(included ? meta.color : COLORS.border);
		renderer.setGlobalAlpha(included ? 0.8 : 1);
		renderer.lineWidth = included ? 1.5 : 1;
		renderer.strokeRect(x, y, MODULE_W, MODULE_H);
		renderer.setGlobalAlpha(1);

		if (included) {
			renderer.setColor(meta.color);
			renderer.fillRect(x + MODULE_W - 13, y + 8, 5, 5);
		}

		const center = this.knobCenter(lane, index);
		const range = MODULE_META[kind].range;
		const norm =
			(this.session.model.lanes[lane].values[kind] - range.min) /
			(range.max - range.min);
		const angle = (-135 + norm * 270) * (Math.PI / 180);
		renderer.setColor("#041014");
		renderer.fillEllipse(center.x, center.y, KNOB_R * 2, KNOB_R * 2);
		renderer.setColor(meta.color);
		renderer.setGlobalAlpha(0.75);
		renderer.lineWidth = 1.5;
		renderer.strokeEllipse(center.x, center.y, KNOB_R * 1.75, KNOB_R * 1.75);
		renderer.setGlobalAlpha(1);
		renderer.lineWidth = 2;
		renderer.strokeLine(
			center.x,
			center.y,
			center.x + Math.cos(angle) * 10,
			center.y + Math.sin(angle) * 10,
		);

		this.drawPort(renderer, x, ROWS[lane] + PORT_Y, meta.color, false);
		this.drawPort(
			renderer,
			x + MODULE_W,
			ROWS[lane] + PORT_Y,
			meta.color,
			true,
		);
	}

	private drawBus(renderer: RendererLike, lane: number): void {
		const y = ROWS[lane];
		const meta = LANE_META[lane];
		renderer.setColor("#08171c");
		renderer.fillRect(OUT_X, y + 8, OUT_W, 112);
		renderer.setColor(meta.dim);
		renderer.lineWidth = 1;
		renderer.strokeRect(OUT_X, y + 8, OUT_W, 112);
		this.drawPort(renderer, OUT_X, y + PORT_Y, meta.color, false);

		const quality = laneQuality(this.session.model.lanes[lane]);
		renderer.setColor(COLORS.border);
		renderer.fillRect(OUT_X + 13, y + 78, OUT_W - 26, 5);
		renderer.setColor(quality >= PASS_QUALITY ? COLORS.green : meta.color);
		renderer.fillRect(OUT_X + 13, y + 78, (OUT_W - 26) * quality, 5);
	}

	private drawPort(
		renderer: RendererLike,
		x: number,
		y: number,
		color: string,
		output: boolean,
	): void {
		renderer.setColor("#030b0d");
		renderer.fillEllipse(x, y, 16, 16);
		renderer.setColor(color);
		renderer.lineWidth = 1.5;
		renderer.strokeEllipse(x, y, 14, 14);
		renderer.setGlobalAlpha(0.7);
		renderer.fillEllipse(x, y, output ? 5 : 4, output ? 5 : 4);
		renderer.setGlobalAlpha(1);
	}

	private drawSidebar(renderer: RendererLike): void {
		renderer.setColor(COLORS.panel);
		renderer.fillRect(SIDEBAR.x, SIDEBAR.y, SIDEBAR.w, SIDEBAR.h);
		renderer.setColor(COLORS.border);
		renderer.lineWidth = 1;
		renderer.strokeRect(SIDEBAR.x, SIDEBAR.y, SIDEBAR.w, SIDEBAR.h);

		const waveX = SIDEBAR.x + 14;
		const waveY = SIDEBAR.y + 50;
		const waveW = SIDEBAR.w - 28;
		const waveH = 104;
		renderer.setColor("#040d10");
		renderer.fillRect(waveX, waveY, waveW, waveH);
		renderer.setColor(COLORS.border);
		renderer.strokeRect(waveX, waveY, waveW, waveH);
		this.drawWaveform(renderer, waveX, waveY, waveW, waveH);

		const specX = waveX;
		const specY = SIDEBAR.y + 178;
		const specW = waveW;
		const specH = 138;
		renderer.setColor("#040d10");
		renderer.fillRect(specX, specY, specW, specH);
		renderer.setColor(COLORS.border);
		renderer.strokeRect(specX, specY, specW, specH);
		this.drawSpectrum(renderer, specX, specY, specW, specH);

		const quality = this.session.lastQuality;
		renderer.setColor(COLORS.border);
		renderer.fillRect(SIDEBAR.x + 14, SIDEBAR.y + 390, SIDEBAR.w - 28, 6);
		renderer.setColor(quality >= PASS_QUALITY ? COLORS.green : COLORS.amber);
		renderer.fillRect(
			SIDEBAR.x + 14,
			SIDEBAR.y + 390,
			(SIDEBAR.w - 28) * quality,
			6,
		);

		for (let lane = 0; lane < LANE_META.length; lane++) {
			const meta = LANE_META[lane];
			const meterY = SIDEBAR.y + 414 + lane * 18;
			const laneScore = laneQuality(this.session.model.lanes[lane]);
			renderer.setColor(COLORS.border);
			renderer.fillRect(SIDEBAR.x + 84, meterY + 5, SIDEBAR.w - 126, 3);
			renderer.setColor(meta.color);
			renderer.fillRect(
				SIDEBAR.x + 84,
				meterY + 5,
				(SIDEBAR.w - 126) * laneScore,
				3,
			);
		}

		const stableNorm = this.session.stableMs / STABLE_TARGET_MS;
		renderer.setColor(COLORS.border);
		renderer.fillRect(SIDEBAR.x + 14, SIDEBAR.y + 455, SIDEBAR.w - 28, 5);
		renderer.setColor(COLORS.green);
		renderer.fillRect(
			SIDEBAR.x + 14,
			SIDEBAR.y + 455,
			(SIDEBAR.w - 28) * stableNorm,
			5,
		);

		for (let i = 0; i < PROTECTION_LIMIT; i++) {
			const lit = i < this.session.trips;
			const x = SIDEBAR.x + 16 + i * 23;
			const y = SIDEBAR.y + 520;
			renderer.setColor(lit ? COLORS.red : COLORS.border);
			renderer.fillEllipse(x, y, 10, 10);
			if (lit) {
				renderer.setGlobalAlpha(0.22 + 0.16 * Math.sin(this.clock * 0.018));
				renderer.fillEllipse(x, y, 20, 20);
				renderer.setGlobalAlpha(1);
			}
		}

		const meter = this.session.masterLevel;
		renderer.setColor(COLORS.border);
		renderer.fillRect(SIDEBAR.x + 14, SIDEBAR.y + 538, SIDEBAR.w - 28, 3);
		renderer.setColor(meter < 0.018 ? COLORS.red : COLORS.blue);
		renderer.fillRect(
			SIDEBAR.x + 14,
			SIDEBAR.y + 538,
			(SIDEBAR.w - 28) * Math.min(1, meter),
			3,
		);

		for (let lane = 0; lane < LANE_META.length; lane++) {
			const meta = LANE_META[lane];
			renderer.setColor(meta.color);
			renderer.fillRect(SIDEBAR.x + 14, SIDEBAR.y + 416 + lane * 18, 4, 10);
		}
	}

	private drawWaveform(
		renderer: RendererLike,
		x: number,
		y: number,
		w: number,
		h: number,
	): void {
		renderer.setGlobalAlpha(0.2);
		renderer.setColor(COLORS.green);
		renderer.lineWidth = 1;
		renderer.strokeLine(x + 6, y + h / 2, x + w - 6, y + h / 2);
		const wave = this.audio.getMasterWaveform();
		if (!wave) {
			renderer.setGlobalAlpha(1);
			return;
		}
		renderer.setGlobalAlpha(0.9);
		renderer.lineWidth = 1.4;
		for (let i = 0; i < wave.length - 1; i++) {
			const x1 = x + 6 + (i / (wave.length - 1)) * (w - 12);
			const x2 = x + 6 + ((i + 1) / (wave.length - 1)) * (w - 12);
			const y1 =
				y +
				h / 2 +
				Math.max(-1, Math.min(1, ((wave[i] - 128) / 128) * 1.8)) * (h * 0.42);
			const y2 =
				y +
				h / 2 +
				Math.max(-1, Math.min(1, ((wave[i + 1] - 128) / 128) * 1.8)) *
					(h * 0.42);
			renderer.strokeLine(x1, y1, x2, y2);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawSpectrum(
		renderer: RendererLike,
		x: number,
		y: number,
		w: number,
		h: number,
	): void {
		const spectrum = this.audio.getMasterSpectrum();
		const bars = 48;
		const gap = 1;
		const barW = (w - 12 - gap * (bars - 1)) / bars;
		for (let i = 0; i < bars; i++) {
			const index = Math.floor(
				(i / bars) ** 1.8 * ((spectrum?.length ?? 1) - 1),
			);
			const value = spectrum ? spectrum[index] / 255 : 0;
			const barH = Math.max(1, value * (h - 12));
			renderer.setColor(i > bars * 0.72 ? COLORS.amber : COLORS.blue);
			renderer.setGlobalAlpha(0.42 + value * 0.55);
			renderer.fillRect(x + 6 + i * (barW + gap), y + h - 6 - barH, barW, barH);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawOverlayBackdrop(renderer: RendererLike): void {
		if (this.session.phase === "running") return;
		renderer.setColor("#02080a");
		renderer.setGlobalAlpha(0.72);
		renderer.fillRect(0, 0, 1280, 720);
		renderer.setGlobalAlpha(1);
		const color =
			this.session.phase === "success"
				? COLORS.green
				: this.session.phase === "failure"
					? COLORS.red
					: COLORS.blue;
		renderer.setColor("#071419");
		renderer.fillRect(330, 224, 620, 220);
		renderer.setColor(color);
		renderer.lineWidth = 2;
		renderer.strokeRect(330, 224, 620, 220);
		renderer.setGlobalAlpha(0.28);
		renderer.fillRect(330, 224, 620, 3);
		renderer.setGlobalAlpha(1);
		renderer.setColor(color);
		renderer.fillRect(330, 438, 620, 3);
	}
}
