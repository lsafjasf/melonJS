import { Application, loader, Stage, state, Text, video } from "melonjs";
import { createExampleComponent } from "../utils";
import { LockAudio } from "./audio";
import {
	BUTTONS,
	type ButtonId,
	DESIGN_HEIGHT,
	DESIGN_WIDTH,
	DOWNSTREAM_RIGHT,
	GATE_1_X,
	GATE_2_X,
	LockSimulation,
	type LockSnapshot,
	UPSTREAM_LEFT,
} from "./simulation";

const FONT_NAME = "canalSans";
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/canalLock/`;

const COLORS = {
	title: "#e5f7f5",
	muted: "#6f9aa6",
	value: "#c7f4f4",
	accent: "#f2a640",
	cyan: "#6bd7e8",
	good: "#6ee7b7",
	warn: "#ffc274",
	bad: "#ff8177",
	objective: "#cbe8eb",
};

const createLabel = (
	app: Application,
	x: number,
	y: number,
	settings: ConstructorParameters<typeof Text>[2],
	z = 20,
) => {
	const label = new Text(x, y, { ...settings, font: FONT_NAME });
	app.world.addChild(label, z);
	return label;
};

const labelText = new WeakMap<Text, string>();
const labelColor = new WeakMap<Text, string>();

const setText = (label: Text, value: string) => {
	if (labelText.get(label) === value) {
		return;
	}
	labelText.set(label, value);
	label.setText(value);
};

const setColor = (label: Text, color: string) => {
	if (labelColor.get(label) === color) {
		return;
	}
	labelColor.set(label, color);
	label.fillStyle.parseCSS(color);
	const current = labelText.get(label);
	if (current !== undefined) {
		label.setText(current);
	}
};

class CanalLockScene extends Stage {
	private simulation!: LockSimulation;
	private lockAudio!: LockAudio;
	private canvas: HTMLCanvasElement | null = null;
	private labels!: {
		mission: Text;
		progress: Text;
		status: Text;
		objective: Text;
		gate1: Text;
		gate2: Text;
		lockLevel: Text;
		gate1Button: Text;
		pumpButton: Text;
		gate2Button: Text;
		faultButton: Text;
		speedButton: Text;
		vortex: Text;
		boat: Text[];
		overlayTitle: Text;
		overlayDetail: Text;
		overlayHint: Text;
	};
	private keyHandler = (event: KeyboardEvent) => {
		if (event.metaKey || event.ctrlKey || event.altKey) {
			return;
		}
		if (event.repeat && !["t", "r", "f"].includes(event.key.toLowerCase())) {
			return;
		}
		const key = event.key.toLowerCase();
		if (key === "1") {
			event.preventDefault();
			this.simulation.toggleGate(1);
		} else if (key === "2") {
			event.preventDefault();
			this.simulation.cyclePump();
		} else if (key === "3") {
			event.preventDefault();
			this.simulation.toggleGate(2);
		} else if (key === "t") {
			event.preventDefault();
			this.simulation.toggleSpeed();
		} else if (key === "r") {
			event.preventDefault();
			this.simulation.reset();
		} else if (key === "f") {
			event.preventDefault();
			this.simulation.enterFaultDemo();
		}
	};
	private pointerDown = (event: PointerEvent) => {
		if (!this.canvas) {
			return;
		}
		const point = this.toDesign(event);
		const button = this.simulation.hitTest(point.x, point.y);
		if (button) {
			event.preventDefault();
			this.activateButton(button);
			return;
		}
		if (
			this.simulation.getSnapshot().phase === "success" &&
			point.y > 207 &&
			point.y < 507
		) {
			event.preventDefault();
			this.simulation.enterFaultDemo();
		}
	};
	private pointerMove = (event: PointerEvent) => {
		if (!this.canvas) {
			return;
		}
		const point = this.toDesign(event);
		const overButton = this.simulation.hitTest(point.x, point.y);
		const overSuccess =
			this.simulation.getSnapshot().phase === "success" &&
			point.y > 207 &&
			point.y < 507;
		this.canvas.style.cursor =
			overButton || overSuccess ? "pointer" : "default";
	};

	override onResetEvent(app: Application) {
		this.simulation = new LockSimulation();
		app.world.addChild(this.simulation, 2);
		this.lockAudio = new LockAudio();

		this.addStaticLabels(app);
		this.labels = this.addDynamicLabels(app);

		this.canvas = app.renderer.getCanvas();
		this.canvas.addEventListener("pointerdown", this.pointerDown);
		this.canvas.addEventListener("pointermove", this.pointerMove);
		globalThis.addEventListener("keydown", this.keyHandler);
	}

	override update(dt: number): boolean {
		if (state.isPaused()) {
			return false;
		}
		const snapshot = this.simulation.getSnapshot();
		for (const cue of this.simulation.drainCues()) {
			this.lockAudio.play(cue);
		}
		this.lockAudio.update(snapshot);
		this.syncLabels(snapshot);
		return super.update(dt) || true;
	}

	override onDestroyEvent() {
		this.canvas?.removeEventListener("pointerdown", this.pointerDown);
		this.canvas?.removeEventListener("pointermove", this.pointerMove);
		if (this.canvas) {
			this.canvas.style.cursor = "default";
		}
		globalThis.removeEventListener("keydown", this.keyHandler);
		this.lockAudio?.dispose();
	}

	private addStaticLabels(app: Application) {
		createLabel(app, 36, 18, {
			font: "sans-serif",
			size: 29,
			bold: true,
			fillStyle: COLORS.title,
			text: "双闸船闸",
		});
		createLabel(app, 38, 55, {
			font: "monospace",
			size: 11,
			fillStyle: COLORS.muted,
			text: "LOCK 07 / CROSS-SECTION CONTROL",
		});
		createLabel(app, 38, 71, {
			font: "monospace",
			size: 9,
			fillStyle: "#3f737e",
			text: "UPSTREAM  ·  CHAMBER  ·  DOWNSTREAM",
		});

		createLabel(app, UPSTREAM_LEFT + 22, 112, {
			font: "sans-serif",
			size: 11,
			fillStyle: COLORS.muted,
			text: "UPSTREAM / 上游",
		});
		createLabel(app, UPSTREAM_LEFT + 22, 128, {
			font: "monospace",
			size: 14,
			fillStyle: COLORS.value,
			text: "13.0 m",
		});
		createLabel(app, (492 + 892) / 2, 112, {
			font: "sans-serif",
			size: 11,
			fillStyle: COLORS.muted,
			text: "CHAMBER / 闸室",
			textAlign: "center",
			anchorPoint: "top",
		});

		createLabel(app, DOWNSTREAM_RIGHT - 22, 112, {
			font: "sans-serif",
			size: 11,
			fillStyle: COLORS.muted,
			text: "DOWNSTREAM / 下游",
			textAlign: "right",
			anchorPoint: "top-right",
		});
		createLabel(app, DOWNSTREAM_RIGHT - 22, 128, {
			font: "monospace",
			size: 14,
			fillStyle: COLORS.value,
			text: "3.8 m",
			textAlign: "right",
			anchorPoint: "top-right",
		});

		createLabel(app, 38, 610, {
			font: "monospace",
			size: 10,
			fillStyle: COLORS.accent,
			text: "CURRENT TASK",
		});
		createLabel(app, 1244, 608, {
			font: "monospace",
			size: 9,
			fillStyle: "#4e7882",
			text: "1 / 2 / 3 控制   ·   T 倍速   ·   F 演练   ·   R 重置",
			textAlign: "right",
			anchorPoint: "top-right",
		});
		createLabel(app, BUTTONS.reset.x + BUTTONS.reset.width / 2, 671, {
			font: "sans-serif",
			size: 12,
			fillStyle: "#8aadb5",
			text: "重置 [R]",
			textAlign: "center",
			textBaseline: "middle",
			anchorPoint: "center",
		});

		createLabel(app, 80, 372, {
			font: "monospace",
			size: 9,
			fillStyle: "#2b4f59",
			text: "UPSTREAM BASIN",
		});
		createLabel(app, 1010, 372, {
			font: "monospace",
			size: 9,
			fillStyle: "#2b4f59",
			text: "DOWNSTREAM BASIN",
		});
	}

	private addDynamicLabels(app: Application) {
		const mission = createLabel(app, 1222, 22, {
			font: "sans-serif",
			size: 14,
			bold: true,
			fillStyle: COLORS.title,
			textAlign: "right",
			anchorPoint: "top-right",
			text: "MISSION 01 · 三船过闸",
		});
		const progress = createLabel(app, 1222, 43, {
			font: "monospace",
			size: 10,
			fillStyle: COLORS.cyan,
			textAlign: "right",
			anchorPoint: "top-right",
			text: "0 / 3 已通过",
		});
		const status = createLabel(app, 1222, 62, {
			font: "sans-serif",
			size: 9,
			fillStyle: COLORS.muted,
			textAlign: "right",
			anchorPoint: "top-right",
			text: "LIVE",
		});
		const objective = createLabel(app, 38, 626, {
			font: "sans-serif",
			size: 13,
			fillStyle: COLORS.objective,
			text: "1/4 打开上游闸门，让三艘货船依次进入闸室。",
		});

		const gate1 = createLabel(app, GATE_1_X, 111, {
			font: "monospace",
			size: 9,
			fillStyle: COLORS.good,
			textAlign: "center",
			anchorPoint: "top",
			lineHeight: 1.25,
			text: "Δ 0.0m · 0kPa\n轴损 100%",
		});
		const gate2 = createLabel(app, GATE_2_X, 111, {
			font: "monospace",
			size: 9,
			fillStyle: COLORS.bad,
			textAlign: "center",
			anchorPoint: "top",
			lineHeight: 1.25,
			text: "Δ 9.1m · 89kPa\n轴损 100%",
		});
		const lockLevel = createLabel(app, (492 + 892) / 2, 128, {
			font: "monospace",
			size: 14,
			fillStyle: COLORS.value,
			textAlign: "center",
			anchorPoint: "top",
			text: "12.4 m",
		});

		const gate1Button = createLabel(
			app,
			BUTTONS.gate1.x + BUTTONS.gate1.width / 2,
			BUTTONS.gate1.y + BUTTONS.gate1.height / 2,
			{
				font: "sans-serif",
				size: 13,
				fillStyle: "#9fe6de",
				textAlign: "center",
				textBaseline: "middle",
				anchorPoint: "center",
				text: "开启上游闸门 · [1]",
			},
		);
		const pumpButton = createLabel(
			app,
			BUTTONS.pump.x + BUTTONS.pump.width / 2,
			BUTTONS.pump.y + BUTTONS.pump.height / 2,
			{
				font: "sans-serif",
				size: 13,
				fillStyle: "#9fe6de",
				textAlign: "center",
				textBaseline: "middle",
				anchorPoint: "center",
				text: "泵：关 · [2]",
			},
		);
		const gate2Button = createLabel(
			app,
			BUTTONS.gate2.x + BUTTONS.gate2.width / 2,
			BUTTONS.gate2.y + BUTTONS.gate2.height / 2,
			{
				font: "sans-serif",
				size: 13,
				fillStyle: "#9fe6de",
				textAlign: "center",
				textBaseline: "middle",
				anchorPoint: "center",
				text: "开启下游闸门 · [3]",
			},
		);
		const faultButton = createLabel(
			app,
			BUTTONS.fault.x + BUTTONS.fault.width / 2,
			BUTTONS.fault.y + BUTTONS.fault.height / 2,
			{
				font: "sans-serif",
				size: 12,
				fillStyle: "#527882",
				textAlign: "center",
				textBaseline: "middle",
				anchorPoint: "center",
				wordWrapWidth: 132,
				text: "故障演练锁定",
			},
		);
		const speedButton = createLabel(
			app,
			BUTTONS.speed.x + BUTTONS.speed.width / 2,
			BUTTONS.speed.y + BUTTONS.speed.height / 2,
			{
				font: "monospace",
				size: 12,
				fillStyle: "#87aeb6",
				textAlign: "center",
				textBaseline: "middle",
				anchorPoint: "center",
				text: "×1 · [T]",
			},
		);
		const vortex = createLabel(app, (492 + 892) / 2, 544, {
			font: "monospace",
			size: 9,
			fillStyle: "#bff5f5",
			textAlign: "center",
			anchorPoint: "top",
			text: "VORTEX 0%",
		});
		vortex.setOpacity(0);

		const boat = [0, 1, 2].map((index) =>
			createLabel(app, 0, 0, {
				font: "monospace",
				size: 9,
				bold: true,
				fillStyle: "#fdf1ce",
				text: `0${index + 1}`,
			}),
		);

		const overlayTitle = createLabel(
			app,
			DESIGN_WIDTH / 2,
			273,
			{
				font: "sans-serif",
				size: 32,
				bold: true,
				fillStyle: COLORS.good,
				textAlign: "center",
				anchorPoint: "top",
				text: "三船通过",
			},
			30,
		);
		const overlayDetail = createLabel(
			app,
			DESIGN_WIDTH / 2,
			329,
			{
				font: "sans-serif",
				size: 14,
				fillStyle: "#c7f4f4",
				textAlign: "center",
				anchorPoint: "top",
				lineHeight: 1.45,
				wordWrapWidth: 540,
				text: "",
			},
			30,
		);
		const overlayHint = createLabel(
			app,
			DESIGN_WIDTH / 2,
			454,
			{
				font: "monospace",
				size: 11,
				fillStyle: COLORS.accent,
				textAlign: "center",
				anchorPoint: "top",
				text: "",
			},
			30,
		);
		overlayTitle.isVisible = false;
		overlayDetail.isVisible = false;
		overlayHint.isVisible = false;
		overlayTitle.setOpacity(0);
		overlayDetail.setOpacity(0);
		overlayHint.setOpacity(0);

		return {
			mission,
			progress,
			status,
			objective,
			gate1,
			gate2,
			lockLevel,
			gate1Button,
			pumpButton,
			gate2Button,
			faultButton,
			speedButton,
			vortex,
			boat,
			overlayTitle,
			overlayDetail,
			overlayHint,
		};
	}

	private syncLabels(snapshot: LockSnapshot) {
		const warning =
			snapshot.upstreamHeadM > 0.35 ||
			snapshot.downstreamHeadM > 0.35 ||
			snapshot.vortex > 0.62;
		setColor(
			this.labels.status,
			snapshot.phase === "failed"
				? COLORS.bad
				: warning
					? COLORS.warn
					: snapshot.phase === "success"
						? COLORS.good
						: COLORS.muted,
		);
		setColor(
			this.labels.objective,
			snapshot.phase === "failed"
				? COLORS.bad
				: snapshot.phase === "success"
					? COLORS.good
					: snapshot.phase === "fault"
						? COLORS.warn
						: COLORS.objective,
		);
		setColor(
			this.labels.gate1,
			snapshot.upstreamHeadM > 0.35 ? COLORS.bad : COLORS.good,
		);
		setColor(
			this.labels.gate2,
			snapshot.downstreamHeadM > 0.35 ? COLORS.bad : COLORS.good,
		);
		setColor(
			this.labels.faultButton,
			snapshot.faultAvailable
				? COLORS.warn
				: snapshot.phase === "fault"
					? COLORS.cyan
					: "#527882",
		);

		setText(this.labels.mission, this.simulation.getMissionLine());
		setText(this.labels.progress, this.simulation.getProgressLine());
		setText(this.labels.status, this.simulation.getStatusLine());
		setText(this.labels.objective, this.simulation.getObjective());
		setText(this.labels.gate1, this.simulation.getGateLabel(1));
		setText(this.labels.gate2, this.simulation.getGateLabel(2));
		setText(this.labels.lockLevel, this.simulation.getLockLevel());
		setText(this.labels.gate1Button, this.simulation.getGateButtonLabel(1));
		setText(this.labels.pumpButton, this.simulation.getPumpButtonLabel());
		setText(this.labels.gate2Button, this.simulation.getGateButtonLabel(2));
		setText(this.labels.faultButton, this.simulation.getFaultButtonLabel());
		setText(this.labels.speedButton, this.simulation.getSpeedLabel());
		const showVortex = snapshot.vortex > 0.12;
		this.labels.vortex.pos.set(
			(492 + 892) / 2,
			Math.min(snapshot.lockY + 56, 544),
		);
		this.labels.vortex.setOpacity(showVortex ? 1 : 0);
		if (showVortex) {
			setText(
				this.labels.vortex,
				`VORTEX ${Math.round(snapshot.vortex * 100)}%`,
			);
			setColor(
				this.labels.vortex,
				snapshot.vortex > 0.62 ? COLORS.warn : COLORS.cyan,
			);
		}

		snapshot.boats.forEach((boat, index) => {
			const label = this.labels.boat[index];
			label.pos.set(boat.x - 6, boat.y - 61);
			label.setOpacity(snapshot.phase === "failed" ? 0 : 1);
		});

		const overlay = this.simulation.getOverlay();
		const visible = overlay !== null;
		this.labels.overlayTitle.setOpacity(visible ? 1 : 0);
		this.labels.overlayDetail.setOpacity(visible ? 1 : 0);
		this.labels.overlayHint.setOpacity(visible ? 1 : 0);
		if (overlay) {
			setColor(
				this.labels.overlayTitle,
				overlay.tone === "failure" ? COLORS.bad : COLORS.good,
			);
			setColor(
				this.labels.overlayHint,
				overlay.tone === "failure" ? COLORS.warn : COLORS.accent,
			);
			setText(this.labels.overlayTitle, overlay.title);
			setText(this.labels.overlayDetail, overlay.detail);
			setText(this.labels.overlayHint, overlay.hint);
		}
	}

	private activateButton(button: ButtonId) {
		if (button === "gate1") {
			this.simulation.toggleGate(1);
		} else if (button === "pump") {
			this.simulation.cyclePump();
		} else if (button === "gate2") {
			this.simulation.toggleGate(2);
		} else if (button === "fault") {
			this.simulation.enterFaultDemo();
		} else if (button === "speed") {
			this.simulation.toggleSpeed();
		} else if (button === "reset") {
			this.simulation.reset();
		}
	}

	private toDesign(event: PointerEvent) {
		const canvas = this.canvas as HTMLCanvasElement;
		const rect = canvas.getBoundingClientRect();
		return {
			x: ((event.clientX - rect.left) / rect.width) * DESIGN_WIDTH,
			y: ((event.clientY - rect.top) / rect.height) * DESIGN_HEIGHT,
		};
	}
}

const createGame = async () => {
	const app = new Application(DESIGN_WIDTH, DESIGN_HEIGHT, {
		parent: "screen",
		scale: "auto",
		renderer: video.AUTO,
		backgroundColor: "#061016",
	});
	await app.init();
	app.world.backgroundColor.parseCSS("#061016");
	await loader.preload([
		{
			name: FONT_NAME,
			type: "fontface",
			src: `${ASSET_BASE}NotoSansSC-Subset.woff2`,
		},
	]);

	state.set(state.PLAY, new CanalLockScene());
	state.change(state.PLAY);
};

export const ExampleCanalLock = createExampleComponent(createGame);
