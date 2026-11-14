/**
 * melonJS — paper puppet show: two-player articulated stage.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	type Application,
	type CanvasRenderer,
	input,
	math,
	Renderable,
	Stage,
	state,
	Text,
	type WebGLRenderer,
} from "melonjs";
import {
	playCue,
	playCurtain,
	playPaperRustle,
	playPenalty,
	playSuccess,
} from "./audio";

const STAGE_W = 1280;
const STAGE_H = 760;

const PELVIS = { x: 640, y: 500 };
const TORSO_LENGTH = 176;
const SHOULDER_SPAN = 42;
const NECK_LENGTH = 58;
const UPPER_ARM = 78;
const FOREARM = 66;

const WINDOW_SECONDS = 9;
const HOLD_SECONDS = 0.32;

const SAFE = {
	torso: 0.82,
	head: 0.78,
	leftArm: 2.12,
	rightArm: 2.12,
};

const TOLERANCE = {
	torso: 0.1,
	head: 0.11,
	leftArm: 0.15,
	rightArm: 0.15,
};

const COLORS = {
	ink: "#30231c",
	paper: "#f0dfb9",
	paperLight: "#fff2d4",
	paperDark: "#d2b98b",
	left: "#d55343",
	leftDark: "#92352d",
	right: "#318a89",
	rightDark: "#1d5e60",
	gold: "#e8b84f",
	cream: "#f6e5c1",
	wine: "#6f2430",
	wineDark: "#43141d",
	backdrop: "#1b1311",
};

type Phase = "intro" | "playing" | "result" | "finale" | "failed";

interface Pose {
	torso: number;
	leftArm: number;
	head: number;
	rightArm: number;
}

interface ShowAction {
	id: string;
	name: string;
	subtitle: string;
	instruction: string;
	target: Pose;
}

interface Point {
	x: number;
	y: number;
}

interface Geometry {
	shoulder: Point;
	head: Point;
	leftShoulder: Point;
	rightShoulder: Point;
	leftElbow: Point;
	leftHand: Point;
	rightElbow: Point;
	rightHand: Point;
}

interface Fiber {
	x: number;
	y: number;
	length: number;
	angle: number;
	alpha: number;
	light: boolean;
}

interface Labels {
	action: Text;
	clock: Text;
	status: Text;
	score: Text;
	leftTitle: Text;
	leftKeys: Text;
	leftTarget: Text;
	rightTitle: Text;
	rightKeys: Text;
	rightTarget: Text;
	centerTitle: Text;
	centerStatus: Text;
	centerHint: Text;
	notice: Text;
}

export interface PuppetSnapshot {
	phase: Phase;
	actionIndex: number;
	actionId: string | null;
	actionName: string | null;
	clock: number;
	score: number;
	completed: boolean[];
	missed: boolean[];
	pose: Pose;
	controls: Pose;
	target: Pose | null;
	leftReady: boolean;
	rightReady: boolean;
	hold: number;
}

const ACTIONS: ShowAction[] = [
	{
		id: "wave",
		name: "挥手",
		subtitle: "WAVE TO THE HOUSE",
		instruction: "左席抬高左臂，右席让头部与右臂配合重心的移动",
		target: { torso: 0.18, leftArm: 2.02, head: -0.22, rightArm: 0.42 },
	},
	{
		id: "turn",
		name: "转身",
		subtitle: "TURN THE PAPER BODY",
		instruction: "左席把身体送向一侧，右席反向带住头部与右臂",
		target: { torso: -0.57, leftArm: 1.32, head: 0.61, rightArm: 1.95 },
	},
	{
		id: "bow",
		name: "鞠躬",
		subtitle: "A LOW PAPER BOW",
		instruction: "左席压低身体，右席把头部与右臂一起收向舞台前方",
		target: { torso: 0.74, leftArm: 0.18, head: 0.29, rightArm: 0.16 },
	},
	{
		id: "reveal",
		name: "侧身亮相",
		subtitle: "SIDE PROFILE",
		instruction: "左边打开身体，右边把头转回来，两只手臂拉成斜线",
		target: { torso: -0.7, leftArm: 0.72, head: -0.52, rightArm: 1.68 },
	},
	{
		id: "curtain-call",
		name: "谢幕礼",
		subtitle: "CURTAIN CALL",
		instruction: "两个人同时抬起外侧手臂，把最后的纸偶姿态定格",
		target: { torso: 0.48, leftArm: 1.78, head: 0.38, rightArm: 1.88 },
	},
];

const FINALE_POSE: Pose = {
	torso: 0.34,
	leftArm: 1.72,
	head: 0.3,
	rightArm: 1.7,
};

const clamp = (value: number, low: number, high: number) => {
	return math.clamp(value, low, high);
};

const segment = (start: Point, length: number, angle: number): Point => {
	return {
		x: start.x + Math.sin(angle) * length,
		y: start.y - Math.cos(angle) * length,
	};
};

const pseudoRandom = (seed: number) => {
	const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return value - Math.floor(value);
};

const createFibers = (count: number): Fiber[] => {
	return Array.from({ length: count }, (_, index) => {
		const x = pseudoRandom(index + 1) * STAGE_W;
		const y = 125 + pseudoRandom(index + 101) * 505;
		return {
			x,
			y,
			length: 6 + pseudoRandom(index + 201) * 28,
			angle: -0.22 + pseudoRandom(index + 301) * 0.44,
			alpha: 0.035 + pseudoRandom(index + 401) * 0.075,
			light: pseudoRandom(index + 501) > 0.48,
		};
	});
};

const createLabel = (
	x: number,
	y: number,
	size: number,
	color: string,
	value: string,
	centered = false,
	bold = false,
	rightAligned = false,
) => {
	const label = new Text(x, y, {
		font: "Noto Sans SC, sans-serif",
		size,
		fillStyle: color,
		text: value,
		textAlign: rightAligned ? "right" : centered ? "center" : "left",
		textBaseline: centered ? "middle" : "top",
		anchorPoint: rightAligned ? "top-right" : centered ? "center" : "top-left",
	});
	if (bold) {
		label.bold();
	}
	return label;
};

const samePose = (a: Pose, b: Pose) => {
	return (
		Math.abs(a.torso - b.torso) <= TOLERANCE.torso &&
		Math.abs(a.leftArm - b.leftArm) <= TOLERANCE.leftArm &&
		Math.abs(a.head - b.head) <= TOLERANCE.head &&
		Math.abs(a.rightArm - b.rightArm) <= TOLERANCE.rightArm
	);
};

class PuppetShow extends Renderable {
	private readonly fibers = createFibers(420);
	private readonly lastText = new WeakMap<Text, string>();
	private readonly debug: boolean;
	private phase: Phase = "intro";
	private phaseClock = 1.25;
	private actionClock = WINDOW_SECONDS;
	private actionIndex = -1;
	private score = 0;
	private holdClock = 0;
	private overClock = 0;
	private toppleClock = 0;
	private penaltyCooldown = 0;
	private noticeClock = 0;
	private notice = "";
	private noticeColor = COLORS.gold;
	private completed: boolean[] = Array(ACTIONS.length).fill(false);
	private missed: boolean[] = Array(ACTIONS.length).fill(false);
	private pose: Pose = { torso: 0, leftArm: 0.06, head: 0, rightArm: 0.06 };
	private controls: Pose = { torso: 0, leftArm: 0.06, head: 0, rightArm: 0.06 };
	private leftReady = false;
	private rightReady = false;

	constructor(
		private readonly labels: Labels,
		debug: boolean,
	) {
		super(0, 0, STAGE_W, STAGE_H);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		this.debug = debug;
		if (this.debug) {
			const target = globalThis as typeof globalThis & {
				__paperPuppet?: () => PuppetSnapshot;
			};
			target.__paperPuppet = () => this.snapshot();
		}
	}

	override update(dt: number) {
		if (state.isPaused()) {
			return true;
		}
		const delta = Math.min(dt, 50) / 1000;
		this.phaseClock -= delta;
		this.noticeClock = Math.max(0, this.noticeClock - delta);
		this.penaltyCooldown = Math.max(0, this.penaltyCooldown - delta);

		const oldPose = { ...this.pose };
		this.updatePose(delta);

		const motion =
			Math.abs(oldPose.torso - this.pose.torso) +
			Math.abs(oldPose.leftArm - this.pose.leftArm) +
			Math.abs(oldPose.head - this.pose.head) +
			Math.abs(oldPose.rightArm - this.pose.rightArm);
		if (motion > 0.006) {
			playPaperRustle(clamp(motion * 42, 0.16, 1));
		}

		if (this.phase === "intro") {
			if (this.phaseClock <= 0) {
				this.startAction(0);
			}
		} else if (this.phase === "playing") {
			this.updatePlaying(delta);
		} else if (this.phase === "result") {
			if (this.phaseClock <= 0) {
				if (this.actionIndex < ACTIONS.length - 1) {
					this.startAction(this.actionIndex + 1);
				} else {
					this.finishShow();
				}
			}
		} else if (this.phase === "finale") {
			this.controls.torso = math.damp(
				this.controls.torso,
				FINALE_POSE.torso,
				3,
				delta,
			);
			this.controls.leftArm = math.damp(
				this.controls.leftArm,
				FINALE_POSE.leftArm,
				3,
				delta,
			);
			this.controls.head = math.damp(
				this.controls.head,
				FINALE_POSE.head,
				3,
				delta,
			);
			this.controls.rightArm = math.damp(
				this.controls.rightArm,
				FINALE_POSE.rightArm,
				3,
				delta,
			);
			if (input.isKeyPressed("puppetRestart")) {
				this.restart();
			}
		} else if (input.isKeyPressed("puppetRestart")) {
			this.restart();
		}

		if (this.phase === "playing") {
			this.readControls(delta);
		} else if (this.phase === "intro") {
			this.controls = { torso: 0, leftArm: 0.06, head: 0, rightArm: 0.06 };
		}
		this.publishDebug();
		this.syncLabels();
		return true;
	}

	private snapshot(): PuppetSnapshot {
		const action = ACTIONS[this.actionIndex];
		return {
			phase: this.phase,
			actionIndex: this.actionIndex,
			actionId: action?.id ?? null,
			actionName: action?.name ?? null,
			clock: this.actionClock,
			score: this.score,
			completed: [...this.completed],
			missed: [...this.missed],
			pose: { ...this.pose },
			controls: { ...this.controls },
			target: action ? { ...action.target } : null,
			leftReady: this.leftReady,
			rightReady: this.rightReady,
			hold: this.holdClock / HOLD_SECONDS,
		};
	}

	private publishDebug() {
		if (!this.debug) {
			return;
		}
		const target = globalThis as typeof globalThis & {
			__paperPuppet?: () => PuppetSnapshot;
		};
		target.__paperPuppet = () => this.snapshot();
	}

	private readControls(delta: number) {
		const torsoDirection =
			(input.isKeyPressed("puppetTorsoRight") ? 1 : 0) -
			(input.isKeyPressed("puppetTorsoLeft") ? 1 : 0);
		const leftArmDirection =
			(input.isKeyPressed("puppetLeftArmUp") ? 1 : 0) -
			(input.isKeyPressed("puppetLeftArmDown") ? 1 : 0);
		const headDirection =
			(input.isKeyPressed("puppetHeadRight") ? 1 : 0) -
			(input.isKeyPressed("puppetHeadLeft") ? 1 : 0);
		const rightArmDirection =
			(input.isKeyPressed("puppetRightArmUp") ? 1 : 0) -
			(input.isKeyPressed("puppetRightArmDown") ? 1 : 0);

		this.controls.torso = clamp(
			this.controls.torso + torsoDirection * 0.9 * delta,
			-1.15,
			1.15,
		);
		this.controls.leftArm = clamp(
			this.controls.leftArm + leftArmDirection * 1.45 * delta,
			-0.08,
			2.55,
		);
		this.controls.head = clamp(
			this.controls.head + headDirection * 1.15 * delta,
			-1.05,
			1.05,
		);
		this.controls.rightArm = clamp(
			this.controls.rightArm + rightArmDirection * 1.45 * delta,
			-0.08,
			2.55,
		);
	}

	private updatePose(delta: number) {
		this.pose.torso = math.damp(
			this.pose.torso,
			this.controls.torso,
			12,
			delta,
		);
		this.pose.leftArm = math.damp(
			this.pose.leftArm,
			this.controls.leftArm,
			15,
			delta,
		);
		this.pose.head = math.damp(this.pose.head, this.controls.head, 14, delta);
		this.pose.rightArm = math.damp(
			this.pose.rightArm,
			this.controls.rightArm,
			15,
			delta,
		);
	}

	private updatePlaying(delta: number) {
		const action = ACTIONS[this.actionIndex];
		this.actionClock -= delta;
		this.leftReady =
			Math.abs(this.pose.torso - action.target.torso) <= TOLERANCE.torso &&
			Math.abs(this.pose.leftArm - action.target.leftArm) <= TOLERANCE.leftArm;
		this.rightReady =
			Math.abs(this.pose.head - action.target.head) <= TOLERANCE.head &&
			Math.abs(this.pose.rightArm - action.target.rightArm) <=
				TOLERANCE.rightArm;

		if (samePose(this.pose, action.target)) {
			this.holdClock += delta;
		} else {
			this.holdClock = Math.max(0, this.holdClock - delta * 1.8);
		}
		if (this.holdClock >= HOLD_SECONDS) {
			this.completeAction();
			return;
		}

		const overextended =
			Math.abs(this.controls.torso) > SAFE.torso ||
			Math.abs(this.controls.head) > SAFE.head ||
			this.controls.leftArm > SAFE.leftArm ||
			this.controls.rightArm > SAFE.rightArm;
		this.overClock = overextended
			? this.overClock + delta
			: Math.max(0, this.overClock - delta * 2);
		if (this.overClock > 0.4 && this.penaltyCooldown <= 0) {
			this.penalty("关节过伸 · -60", 60, 1.1);
			this.overClock = 0;
		}

		if (Math.abs(this.pose.torso) > SAFE.torso + 0.1) {
			this.toppleClock += delta;
		} else {
			this.toppleClock = Math.max(0, this.toppleClock - delta * 2);
		}
		if (this.toppleClock > 0.72) {
			this.penalty("纸偶倾倒 · -180", 180, 1.8);
			this.controls.torso = 0;
			this.controls.leftArm *= 0.45;
			this.controls.rightArm *= 0.45;
			this.toppleClock = 0;
		}

		if (this.actionClock <= 0) {
			this.failAction("动作超时 · -220", 220);
		}
	}

	private completeAction() {
		const action = ACTIONS[this.actionIndex];
		const timeBonus = Math.max(
			0,
			Math.round((this.actionClock / WINDOW_SECONDS) * 300),
		);
		const clean = Math.max(
			Math.abs(this.pose.torso - action.target.torso),
			Math.abs(this.pose.leftArm - action.target.leftArm),
			Math.abs(this.pose.head - action.target.head),
			Math.abs(this.pose.rightArm - action.target.rightArm),
		);
		const perfectBonus = clean < 0.045 ? 180 : 0;
		const gained = 1000 + timeBonus + perfectBonus;
		this.completed[this.actionIndex] = true;
		this.score += gained;
		this.showNotice(`${action.name} · 完成 +${gained}`, COLORS.gold, 1.5);
		this.phase = "result";
		this.phaseClock = 1.45;
		this.holdClock = 0;
		playSuccess();
	}

	private failAction(message: string, cost: number) {
		const action = ACTIONS[this.actionIndex];
		this.missed[this.actionIndex] = true;
		this.score = Math.max(0, this.score - cost);
		this.showNotice(`${action.name} · ${message}`, "#ffb09e", 1.5);
		this.phase = "result";
		this.phaseClock = 1.55;
		this.holdClock = 0;
		playPenalty();
	}

	private penalty(message: string, cost: number, cooldown: number) {
		this.score = Math.max(0, this.score - cost);
		this.penaltyCooldown = cooldown;
		this.showNotice(message, "#ffb09e", 1.1);
		playPenalty();
	}

	private startAction(index: number) {
		this.actionIndex = index;
		this.phase = "playing";
		this.actionClock = WINDOW_SECONDS;
		this.holdClock = 0;
		this.overClock = 0;
		this.toppleClock = 0;
		this.penaltyCooldown = 0.35;
		this.controls = { torso: 0, leftArm: 0.06, head: 0, rightArm: 0.06 };
		playCue();
	}

	private finishShow() {
		if (this.completed.every(Boolean)) {
			this.phase = "finale";
			this.phaseClock = 6.4;
			this.showNotice("五幕完成 · 谢幕成功", COLORS.gold, 6);
			this.actionClock = 0;
			playCurtain();
		} else {
			this.phase = "failed";
			this.phaseClock = 5;
			this.showNotice("演出未完成 · 按 R 重演", "#ffb09e", 5);
			this.actionClock = 0;
		}
	}

	private restart() {
		this.phase = "intro";
		this.phaseClock = 0.8;
		this.actionClock = WINDOW_SECONDS;
		this.actionIndex = -1;
		this.score = 0;
		this.holdClock = 0;
		this.overClock = 0;
		this.toppleClock = 0;
		this.penaltyCooldown = 0;
		this.completed = Array(ACTIONS.length).fill(false);
		this.missed = Array(ACTIONS.length).fill(false);
		this.controls = { torso: 0, leftArm: 0.06, head: 0, rightArm: 0.06 };
		this.showNotice("重新排演", COLORS.cream, 0.8);
	}

	private showNotice(value: string, color: string, duration: number) {
		this.notice = value;
		this.noticeColor = color;
		this.noticeClock = duration;
	}

	private setLabel(label: Text, value: string) {
		if (this.lastText.get(label) !== value) {
			label.setText(value);
			this.lastText.set(label, value);
		}
	}

	private syncLabels() {
		const action = ACTIONS[this.actionIndex];
		const active = this.phase === "playing";
		const actionHeading =
			action && this.phase !== "intro"
				? `第 ${this.actionIndex + 1} / ${ACTIONS.length} 幕 · ${action.name}`
				: "纸偶戏 · 双人排演";
		this.setLabel(this.labels.action, actionHeading);
		this.setLabel(
			this.labels.clock,
			active
				? `动作窗口  ${Math.max(0, this.actionClock).toFixed(1)} s`
				: this.phase === "finale"
					? "幕布落下"
					: this.phase === "failed"
						? "排演中止"
						: action
							? action.subtitle
							: "预备 · 两人就位",
		);
		this.setLabel(
			this.labels.status,
			active && action
				? action.instruction
				: this.phase === "intro"
					? "左席 A D / W S    右席 J L / I K"
					: "两双手通过同一条关节链共同操纵纸偶",
		);
		this.setLabel(this.labels.score, `得分 ${this.score}`);

		const target = action?.target;
		if (target) {
			this.setLabel(
				this.labels.leftTarget,
				`目标  躯干 ${this.degrees(target.torso)}  左臂 ${this.degrees(target.leftArm)}`,
			);
			this.setLabel(
				this.labels.rightTarget,
				`目标  头部 ${this.degrees(target.head)}  右臂 ${this.degrees(target.rightArm)}`,
			);
		} else {
			this.setLabel(this.labels.leftTarget, "目标  躯干 —  左臂 —");
			this.setLabel(this.labels.rightTarget, "目标  头部 —  右臂 —");
		}

		const leftState = this.leftReady ? "左席到位" : "左席调整中";
		const rightState = this.rightReady ? "右席到位" : "右席调整中";
		const holdPercent = Math.round(
			clamp(this.holdClock / HOLD_SECONDS, 0, 1) * 100,
		);
		this.setLabel(
			this.labels.centerStatus,
			active
				? `${leftState}   ${rightState}   ${holdPercent}%`
				: this.phase === "finale"
					? "谢幕成功"
					: this.phase === "failed"
						? "按 R 重演"
						: "同一关节链",
		);
		this.setLabel(
			this.labels.centerHint,
			active
				? "两边同时进入目标虚线，保持片刻"
				: this.phase === "finale"
					? "五幕动作全部完成"
					: this.phase === "failed"
						? "超时或未完成全部五幕"
						: "超时 / 过伸 / 倾倒 · 扣分",
		);
		this.labels.notice.setText(this.notice);
		this.labels.notice.setOpacity(
			this.noticeClock > 0 ? clamp(this.noticeClock * 2.2, 0, 1) : 0,
		);
		this.labels.notice.fillStyle.parseCSS(this.noticeColor);
	}

	private degrees(value: number) {
		return `${Math.round(math.radToDeg(value))}°`;
	}

	private geometry(pose: Pose): Geometry {
		const torso = pose.torso;
		const up = { x: Math.sin(torso), y: -Math.cos(torso) };
		const side = { x: Math.cos(torso), y: Math.sin(torso) };
		const shoulder = segment(PELVIS, TORSO_LENGTH, torso);
		const leftShoulder = {
			x: shoulder.x - side.x * SHOULDER_SPAN,
			y: shoulder.y - side.y * SHOULDER_SPAN,
		};
		const rightShoulder = {
			x: shoulder.x + side.x * SHOULDER_SPAN,
			y: shoulder.y + side.y * SHOULDER_SPAN,
		};
		const leftAngle = torso + Math.PI + pose.leftArm;
		const rightAngle = torso + Math.PI - pose.rightArm;
		const leftElbow = segment(leftShoulder, UPPER_ARM, leftAngle);
		const rightElbow = segment(rightShoulder, UPPER_ARM, rightAngle);
		const head = {
			x: shoulder.x + up.x * (NECK_LENGTH - 2) + side.x * 2,
			y: shoulder.y + up.y * (NECK_LENGTH - 2) + side.y * 2,
		};
		return {
			shoulder,
			head,
			leftShoulder,
			rightShoulder,
			leftElbow,
			leftHand: segment(leftElbow, FOREARM, leftAngle - 0.16),
			rightElbow,
			rightHand: segment(rightElbow, FOREARM, rightAngle + 0.16),
		};
	}

	override draw(renderer: CanvasRenderer | WebGLRenderer) {
		renderer.setGlobalAlpha(1);
		renderer.lineWidth = 1;
		renderer.setLineDash([]);
		this.drawTheatre(renderer);

		const geometry = this.geometry(this.pose);
		const target = this.phase === "playing" ? ACTIONS[this.actionIndex] : null;
		if (target) {
			this.drawTarget(renderer, target.target);
		}
		this.drawPuppetShadow(renderer);
		this.drawPuppet(renderer, geometry, this.pose);
		this.drawStageOverlay(renderer);
		this.drawTimeline(renderer);
		this.drawControls(renderer);

		if (this.phase === "finale") {
			this.drawFinaleCurtain(renderer);
		}
	}

	private drawTheatre(renderer: CanvasRenderer | WebGLRenderer) {
		renderer.setColor(COLORS.backdrop);
		renderer.fillRect(0, 0, STAGE_W, STAGE_H);

		renderer.setColor("#cdb68c");
		renderer.fillRect(138, 148, 1004, 466);
		renderer.setGlobalAlpha(0.28);
		renderer.setColor("#f5e6c3");
		renderer.fillRect(158, 164, 964, 434);
		renderer.setGlobalAlpha(1);

		for (const fiber of this.fibers) {
			renderer.setGlobalAlpha(fiber.alpha);
			renderer.setColor(fiber.light ? "#f6e8c7" : "#836b4f");
			const dx = Math.cos(fiber.angle) * fiber.length;
			const dy = Math.sin(fiber.angle) * fiber.length;
			renderer.strokeLine(fiber.x, fiber.y, fiber.x + dx, fiber.y + dy);
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor("#9e7e57");
		renderer.fillRect(138, 536, 1004, 78);
		renderer.setColor("#b99569");
		renderer.beginPath();
		renderer.moveTo(90, 608);
		renderer.lineTo(270, 536);
		renderer.lineTo(1010, 536);
		renderer.lineTo(1190, 608);
		renderer.closePath();
		renderer.fill();

		renderer.setGlobalAlpha(0.24);
		renderer.setColor("#5c402b");
		for (let x = 210; x < 1100; x += 88) {
			renderer.strokeLine(x, 540, x - 32, 606);
		}
		renderer.setGlobalAlpha(1);

		this.drawCurtainSide(renderer, 0, 1);
		this.drawCurtainSide(renderer, STAGE_W, -1);
		this.drawValance(renderer);

		renderer.setGlobalAlpha(0.12);
		renderer.setColor("#fff4d9");
		renderer.fillEllipse(640, 512, 238, 118);
		renderer.setGlobalAlpha(1);

		for (let x = 210; x <= 1070; x += 86) {
			renderer.setGlobalAlpha(0.45);
			renderer.setColor("#edc06a");
			renderer.fillEllipse(x, 624, 8, 5);
			renderer.setGlobalAlpha(0.22);
			renderer.setColor("#fff2c4");
			renderer.fillEllipse(x - 2, 621, 4, 2);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawCurtainSide(
		renderer: CanvasRenderer | WebGLRenderer,
		x: number,
		sign: number,
	) {
		renderer.setColor(COLORS.wineDark);
		renderer.beginPath();
		renderer.moveTo(x, 80);
		renderer.lineTo(x + sign * 142, 80);
		renderer.lineTo(x + sign * 120, 570);
		for (let i = 0; i < 6; i++) {
			renderer.lineTo(x + sign * (104 - i * 9 + (i % 2) * 8), 610 + i * 4);
		}
		renderer.lineTo(x, 610);
		renderer.closePath();
		renderer.fill();

		for (let strip = 0; strip < 5; strip++) {
			renderer.setGlobalAlpha(0.13 + strip * 0.025);
			renderer.setColor(strip % 2 === 0 ? "#a43c45" : "#2b0b12");
			const sx = x + sign * (20 + strip * 20);
			renderer.beginPath();
			renderer.moveTo(sx, 92);
			renderer.lineTo(sx + sign * 16, 92);
			renderer.lineTo(sx + sign * (3 - strip * 2), 598);
			renderer.lineTo(sx - sign * 8, 598);
			renderer.closePath();
			renderer.fill();
		}
		renderer.setGlobalAlpha(1);
	}

	private drawValance(renderer: CanvasRenderer | WebGLRenderer) {
		renderer.setColor("#571822");
		renderer.beginPath();
		renderer.moveTo(0, 78);
		renderer.lineTo(STAGE_W, 78);
		renderer.lineTo(STAGE_W, 128);
		for (let x = STAGE_W; x >= 0; x -= 64) {
			renderer.lineTo(x, 116 + ((x / 64) % 2) * 24);
		}
		renderer.lineTo(0, 116);
		renderer.closePath();
		renderer.fill();

		renderer.setGlobalAlpha(0.22);
		renderer.setColor("#b64c50");
		for (let x = 12; x < STAGE_W; x += 32) {
			renderer.strokeLine(x, 90, x + 6, 134);
		}
		renderer.setGlobalAlpha(1);
		renderer.setColor("#d6a857");
		renderer.fillRect(0, 76, STAGE_W, 7);
	}

	private drawStageOverlay(renderer: CanvasRenderer | WebGLRenderer) {
		renderer.setGlobalAlpha(0.14);
		renderer.setColor("#2b120e");
		renderer.fillRect(0, 620, STAGE_W, 20);
		renderer.setGlobalAlpha(1);
	}

	private drawPuppetShadow(renderer: CanvasRenderer | WebGLRenderer) {
		const shift = this.pose.torso * 76;
		renderer.setGlobalAlpha(0.26);
		renderer.setColor("#2a1711");
		renderer.fillEllipse(PELVIS.x + shift, 608, 116, 23);
		renderer.setGlobalAlpha(0.16);
		renderer.fillEllipse(PELVIS.x + shift + 10, 611, 152, 30);
		renderer.setGlobalAlpha(1);
	}

	private drawTarget(renderer: CanvasRenderer | WebGLRenderer, pose: Pose) {
		const geometry = this.geometry(pose);
		renderer.save();
		renderer.setGlobalAlpha(0.42);
		renderer.setColor("#235e5d");
		renderer.lineWidth = 2;
		renderer.setLineDash([7, 6]);
		this.strokeJoint(renderer, PELVIS, geometry.shoulder);
		this.strokeJoint(renderer, geometry.shoulder, geometry.leftShoulder);
		this.strokeJoint(renderer, geometry.shoulder, geometry.rightShoulder);
		this.strokeJoint(renderer, geometry.leftShoulder, geometry.leftElbow);
		this.strokeJoint(renderer, geometry.leftElbow, geometry.leftHand);
		this.strokeJoint(renderer, geometry.rightShoulder, geometry.rightElbow);
		this.strokeJoint(renderer, geometry.rightElbow, geometry.rightHand);
		this.strokeJoint(renderer, geometry.shoulder, geometry.head);
		renderer.setLineDash([]);
		renderer.strokeEllipse(geometry.head.x, geometry.head.y, 42, 46);
		renderer.fillEllipse(geometry.leftHand.x, geometry.leftHand.y, 6, 6);
		renderer.fillEllipse(geometry.rightHand.x, geometry.rightHand.y, 6, 6);
		renderer.restore();
	}

	private drawPuppet(
		renderer: CanvasRenderer | WebGLRenderer,
		geometry: Geometry,
		pose: Pose,
	) {
		this.drawLegs(renderer);
		this.drawTorso(renderer, pose);
		this.drawArms(renderer, geometry);
		this.drawHead(renderer, geometry, pose);
		this.drawJoints(renderer, geometry);
	}

	private drawLegs(renderer: CanvasRenderer | WebGLRenderer) {
		const leftKnee = { x: 603, y: 554 };
		const rightKnee = { x: 677, y: 554 };
		const leftFoot = { x: 594, y: 606 };
		const rightFoot = { x: 686, y: 606 };
		this.paperLimb(renderer, { x: 616, y: 524 }, leftKnee, 22, 17, "#80654b");
		this.paperLimb(renderer, leftKnee, leftFoot, 17, 13, "#80654b");
		this.paperLimb(renderer, { x: 664, y: 524 }, rightKnee, 22, 17, "#80654b");
		this.paperLimb(renderer, rightKnee, rightFoot, 17, 13, "#80654b");
		renderer.setColor("#3c2a21");
		renderer.fillEllipse(591, 608, 24, 9);
		renderer.fillEllipse(689, 608, 24, 9);
	}

	private drawTorso(renderer: CanvasRenderer | WebGLRenderer, pose: Pose) {
		renderer.save();
		renderer.translate(PELVIS.x, PELVIS.y);
		renderer.rotate(pose.torso);
		const body = [
			{ x: -29, y: 2 },
			{ x: 27, y: 2 },
			{ x: 39, y: -58 },
			{ x: 43, y: -139 },
			{ x: 34, y: -181 },
			{ x: -33, y: -181 },
			{ x: -41, y: -138 },
			{ x: -38, y: -61 },
		];
		this.paintPaper(renderer, body, COLORS.paper, COLORS.ink, 0.3);

		renderer.setGlobalAlpha(0.19);
		renderer.setColor(COLORS.left);
		renderer.beginPath();
		renderer.moveTo(-28, -18);
		renderer.lineTo(-9, -27);
		renderer.lineTo(-18, -168);
		renderer.lineTo(-32, -160);
		renderer.closePath();
		renderer.fill();
		renderer.setGlobalAlpha(1);

		const skirt = [
			{ x: -31, y: 0 },
			{ x: 30, y: 0 },
			{ x: 48, y: 43 },
			{ x: 35, y: 52 },
			{ x: 21, y: 43 },
			{ x: 7, y: 53 },
			{ x: -9, y: 42 },
			{ x: -26, y: 53 },
			{ x: -39, y: 43 },
			{ x: -48, y: 50 },
		];
		this.paintPaper(renderer, skirt, "#b8493d", COLORS.ink, 0.2);

		renderer.setGlobalAlpha(0.23);
		renderer.setColor("#72261f");
		for (let i = -3; i <= 3; i++) {
			renderer.strokeLine(i * 9, 8, i * 12, 44);
		}
		renderer.setGlobalAlpha(0.3);
		renderer.setColor("#f7d7a2");
		renderer.strokeLine(-27, -153, 27, -149);
		renderer.setGlobalAlpha(1);
		renderer.restore();
	}

	private drawArms(
		renderer: CanvasRenderer | WebGLRenderer,
		geometry: Geometry,
	) {
		this.paperLimb(
			renderer,
			geometry.leftShoulder,
			geometry.leftElbow,
			24,
			19,
			COLORS.left,
		);
		this.paperLimb(
			renderer,
			geometry.leftElbow,
			geometry.leftHand,
			19,
			14,
			"#e8a08f",
		);
		this.paperLimb(
			renderer,
			geometry.rightShoulder,
			geometry.rightElbow,
			24,
			19,
			COLORS.right,
		);
		this.paperLimb(
			renderer,
			geometry.rightElbow,
			geometry.rightHand,
			19,
			14,
			"#8fc6b8",
		);
		renderer.setColor("#3c2922");
		renderer.fillEllipse(geometry.leftHand.x, geometry.leftHand.y, 12, 10);
		renderer.fillEllipse(geometry.rightHand.x, geometry.rightHand.y, 12, 10);
	}

	private drawHead(
		renderer: CanvasRenderer | WebGLRenderer,
		geometry: Geometry,
		pose: Pose,
	) {
		this.strokeJoint(renderer, geometry.shoulder, geometry.head);
		renderer.save();
		renderer.translate(geometry.head.x, geometry.head.y);
		renderer.rotate(pose.torso + pose.head);
		const head = [
			{ x: -38, y: -40 },
			{ x: -19, y: -52 },
			{ x: 16, y: -51 },
			{ x: 38, y: -35 },
			{ x: 43, y: -5 },
			{ x: 33, y: 31 },
			{ x: 12, y: 45 },
			{ x: -20, y: 44 },
			{ x: -39, y: 24 },
			{ x: -44, y: -8 },
		];
		this.paintPaper(renderer, head, "#f1c9a4", COLORS.ink, 0.32);

		renderer.setGlobalAlpha(0.54);
		renderer.setColor("#5c3327");
		renderer.beginPath();
		renderer.moveTo(-38, -27);
		renderer.lineTo(-22, -49);
		renderer.lineTo(13, -46);
		renderer.lineTo(27, -30);
		renderer.lineTo(14, -22);
		renderer.lineTo(-7, -30);
		renderer.lineTo(-25, -21);
		renderer.closePath();
		renderer.fill();

		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.ink);
		renderer.fillEllipse(-14, -4, 3.4, 4.4);
		renderer.fillEllipse(13, -4, 3.4, 4.4);
		renderer.setGlobalAlpha(0.55);
		renderer.setColor("#ba5949");
		renderer.fillEllipse(-23, 12, 7, 3.5);
		renderer.fillEllipse(24, 12, 7, 3.5);
		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.ink);
		renderer.lineWidth = 2.2;
		renderer.beginPath();
		renderer.moveTo(-8, 21);
		renderer.quadraticCurveTo(1, 27, 10, 20);
		renderer.stroke();
		renderer.beginPath();
		renderer.moveTo(2, 2);
		renderer.lineTo(-2, 12);
		renderer.lineTo(4, 13);
		renderer.stroke();
		renderer.restore();
	}

	private drawJoints(
		renderer: CanvasRenderer | WebGLRenderer,
		geometry: Geometry,
	) {
		for (const joint of [
			geometry.leftShoulder,
			geometry.rightShoulder,
			geometry.leftElbow,
			geometry.rightElbow,
			geometry.shoulder,
			geometry.head,
		]) {
			renderer.setColor(COLORS.gold);
			renderer.fillEllipse(joint.x, joint.y, 7, 7);
			renderer.setColor(COLORS.ink);
			renderer.lineWidth = 1.5;
			renderer.strokeEllipse(joint.x, joint.y, 7, 7);
			renderer.fillEllipse(joint.x, joint.y, 2.1, 2.1);
		}
	}

	private paperLimb(
		renderer: CanvasRenderer | WebGLRenderer,
		start: Point,
		end: Point,
		widthStart: number,
		widthEnd: number,
		color: string,
	) {
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const length = Math.max(0.001, Math.hypot(dx, dy));
		const px = -dy / length;
		const py = dx / length;
		const points = [
			{
				x: start.x + px * (widthStart / 2),
				y: start.y + py * (widthStart / 2),
			},
			{
				x: end.x + px * (widthEnd / 2),
				y: end.y + py * (widthEnd / 2),
			},
			{
				x: end.x - px * (widthEnd / 2),
				y: end.y - py * (widthEnd / 2),
			},
			{
				x: start.x - px * (widthStart / 2),
				y: start.y - py * (widthStart / 2),
			},
		];
		this.paintPaper(renderer, points, color, COLORS.ink, 0.2);
		renderer.save();
		renderer.setGlobalAlpha(0.18);
		renderer.setColor("#fff0cf");
		renderer.lineWidth = 1.5;
		renderer.strokeLine(start.x, start.y, end.x, end.y);
		renderer.setGlobalAlpha(0.14);
		renderer.setColor(COLORS.ink);
		renderer.strokeLine(
			start.x + px * widthStart * 0.16,
			start.y + py * widthStart * 0.16,
			end.x + px * widthEnd * 0.16,
			end.y + py * widthEnd * 0.16,
		);
		renderer.restore();
	}

	private paintPaper(
		renderer: CanvasRenderer | WebGLRenderer,
		points: Point[],
		fill: string,
		stroke: string,
		shadowAlpha: number,
	) {
		renderer.save();
		renderer.setGlobalAlpha(shadowAlpha);
		renderer.setColor("#24150f");
		this.tracePolygon(renderer, points, 5, 7);
		renderer.fill();
		renderer.setGlobalAlpha(1);
		renderer.setColor(fill);
		this.tracePolygon(renderer, points, 0, 0);
		renderer.fill();
		renderer.setColor(stroke);
		renderer.lineWidth = 2;
		this.tracePolygon(renderer, points, 0, 0);
		renderer.stroke();
		renderer.restore();
	}

	private tracePolygon(
		renderer: CanvasRenderer | WebGLRenderer,
		points: Point[],
		offsetX: number,
		offsetY: number,
	) {
		renderer.beginPath();
		renderer.moveTo(points[0].x + offsetX, points[0].y + offsetY);
		for (let i = 1; i < points.length; i++) {
			renderer.lineTo(points[i].x + offsetX, points[i].y + offsetY);
		}
		renderer.closePath();
	}

	private strokeJoint(
		renderer: CanvasRenderer | WebGLRenderer,
		start: Point,
		end: Point,
	) {
		renderer.strokeLine(start.x, start.y, end.x, end.y);
	}

	private drawTimeline(renderer: CanvasRenderer | WebGLRenderer) {
		const width = 88;
		const total = width * ACTIONS.length + 9 * (ACTIONS.length - 1);
		const start = (STAGE_W - total) / 2;
		for (let i = 0; i < ACTIONS.length; i++) {
			const x = start + i * (width + 9);
			const stateColor = this.completed[i]
				? COLORS.right
				: this.missed[i]
					? COLORS.left
					: i === this.actionIndex && this.phase === "playing"
						? COLORS.gold
						: "#75634e";
			renderer.setGlobalAlpha(
				i === this.actionIndex && this.phase === "playing" ? 1 : 0.62,
			);
			renderer.setColor(stateColor);
			renderer.fillRoundRect(x, 124, width, 17, 4);
			renderer.setGlobalAlpha(0.38);
			renderer.setColor("#f4dfb9");
			renderer.fillRect(x + 7, 129, width - 14, 2);
			renderer.setColor(COLORS.ink);
			renderer.lineWidth = 1.2;
			renderer.strokeRoundRect(x, 124, width, 17, 4);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawControls(renderer: CanvasRenderer | WebGLRenderer) {
		this.drawCard(renderer, 22, 638, 398, 112, COLORS.left);
		this.drawCard(renderer, 432, 638, 416, 112, COLORS.gold);
		this.drawCard(renderer, 860, 638, 398, 112, COLORS.right);

		const action = ACTIONS[this.actionIndex];
		const target = action?.target;
		this.drawSlider(
			renderer,
			38,
			722,
			212,
			-1.05,
			1.05,
			this.pose.torso,
			target?.torso,
			COLORS.left,
		);
		this.drawSlider(
			renderer,
			264,
			722,
			140,
			-0.08,
			2.12,
			this.pose.leftArm,
			target?.leftArm,
			"#e8a08f",
		);
		this.drawSlider(
			renderer,
			38,
			742,
			366,
			-0.08,
			2.12,
			this.controls.leftArm,
			target?.leftArm,
			"#9d3d32",
		);
		this.drawSlider(
			renderer,
			876,
			722,
			212,
			-1.05,
			1.05,
			this.pose.head,
			target?.head,
			COLORS.right,
		);
		this.drawSlider(
			renderer,
			1102,
			722,
			140,
			-0.08,
			2.12,
			this.pose.rightArm,
			target?.rightArm,
			"#8fc6b8",
		);
		this.drawSlider(
			renderer,
			876,
			742,
			366,
			-0.08,
			2.12,
			this.controls.rightArm,
			target?.rightArm,
			"#236d6f",
		);

		const hold = clamp(this.holdClock / HOLD_SECONDS, 0, 1);
		renderer.setColor("#6c5842");
		renderer.fillRoundRect(454, 733, 372, 16, 8);
		renderer.setColor(hold >= 1 ? COLORS.gold : COLORS.right);
		renderer.fillRoundRect(458, 737, 364 * hold, 8, 4);
		renderer.setColor(COLORS.ink);
		renderer.lineWidth = 1.2;
		renderer.strokeRoundRect(454, 733, 372, 16, 8);
	}

	private drawCard(
		renderer: CanvasRenderer | WebGLRenderer,
		x: number,
		y: number,
		width: number,
		height: number,
		accent: string,
	) {
		renderer.setGlobalAlpha(0.22);
		renderer.setColor("#1d120e");
		renderer.fillRoundRect(x + 5, y + 6, width, height, 12);
		renderer.setGlobalAlpha(1);
		renderer.setColor("#ead9b6");
		renderer.fillRoundRect(x, y, width, height, 12);
		renderer.setColor(accent);
		renderer.fillRect(x, y, width, 5);
		renderer.setGlobalAlpha(0.32);
		renderer.setColor("#8b7151");
		renderer.lineWidth = 1.3;
		renderer.strokeRoundRect(x, y, width, height, 12);
		renderer.setGlobalAlpha(1);
	}

	private drawSlider(
		renderer: CanvasRenderer | WebGLRenderer,
		x: number,
		y: number,
		width: number,
		min: number,
		max: number,
		value: number,
		target: number | undefined,
		color: string,
	) {
		const toX = (v: number) => {
			return x + clamp((v - min) / (max - min), 0, 1) * width;
		};
		renderer.setColor("#7d684d");
		renderer.fillRoundRect(x, y - 2, width, 4, 2);
		if (target !== undefined) {
			renderer.setColor(COLORS.ink);
			renderer.fillRect(toX(target) - 1, y - 7, 2, 14);
		}
		renderer.setGlobalAlpha(0.38);
		renderer.setColor(color);
		renderer.fillRect(
			x,
			y - 2,
			(clamp(value - min, 0, max - min) / (max - min)) * width,
			4,
		);
		renderer.setGlobalAlpha(1);
		renderer.setColor(color);
		renderer.fillEllipse(toX(value), y, 6, 6);
		renderer.setColor(COLORS.ink);
		renderer.lineWidth = 1;
		renderer.strokeEllipse(toX(value), y, 6, 6);
	}

	private drawFinaleCurtain(renderer: CanvasRenderer | WebGLRenderer) {
		const progress = clamp((4.9 - this.phaseClock) / 2.7, 0, 1);
		if (progress <= 0) {
			return;
		}
		const covered = progress * 640;
		renderer.setColor(COLORS.wineDark);
		renderer.fillRect(0, 78, covered, 562);
		renderer.fillRect(STAGE_W - covered, 78, covered, 562);
		renderer.setColor(COLORS.wine);
		renderer.fillRect(covered - 18, 78, 18, 562);
		renderer.fillRect(STAGE_W - covered, 78, 18, 562);
		renderer.setGlobalAlpha(0.24);
		renderer.setColor("#2c0b12");
		for (let x = 0; x < covered; x += 30) {
			renderer.strokeLine(x, 86, x + 11, 626);
			renderer.strokeLine(STAGE_W - x, 86, STAGE_W - x - 11, 626);
		}
		renderer.setGlobalAlpha(1);
	}
}

export class PaperPuppetStage extends Stage {
	override onResetEvent(app: Application) {
		for (const [key, action] of [
			[input.KEY.A, "puppetTorsoLeft"],
			[input.KEY.D, "puppetTorsoRight"],
			[input.KEY.W, "puppetLeftArmUp"],
			[input.KEY.S, "puppetLeftArmDown"],
			[input.KEY.J, "puppetHeadLeft"],
			[input.KEY.L, "puppetHeadRight"],
			[input.KEY.I, "puppetRightArmUp"],
			[input.KEY.K, "puppetRightArmDown"],
			[input.KEY.R, "puppetRestart", true],
		] as const) {
			input.bindKey(key, action);
		}

		const labels: Labels = {
			action: createLabel(
				640,
				48,
				27,
				COLORS.cream,
				"纸偶戏 · 双人排演",
				true,
				true,
			),
			clock: createLabel(640, 79, 16, "#e4c790", "预备 · 两人就位", true),
			status: createLabel(
				640,
				101,
				13,
				"#c5aa7a",
				"左席 A D / W S    右席 J L / I K",
				true,
			),
			score: createLabel(
				1258,
				20,
				18,
				COLORS.gold,
				"得分 0",
				false,
				true,
				true,
			),
			leftTitle: createLabel(
				38,
				651,
				17,
				COLORS.leftDark,
				"左席 · 身体与左臂",
				false,
				true,
			),
			leftKeys: createLabel(
				38,
				675,
				14,
				COLORS.ink,
				"A / D 倾斜    W / S 左臂",
			),
			leftTarget: createLabel(38, 698, 14, "#5b4131", "目标  躯干 —  左臂 —"),
			rightTitle: createLabel(
				876,
				651,
				17,
				COLORS.rightDark,
				"右席 · 头部与右臂",
				false,
				true,
			),
			rightKeys: createLabel(
				876,
				675,
				14,
				COLORS.ink,
				"J / L 头部    I / K 右臂",
			),
			rightTarget: createLabel(876, 698, 14, "#5b4131", "目标  头部 —  右臂 —"),
			centerTitle: createLabel(
				640,
				651,
				16,
				COLORS.ink,
				"同一条关节链",
				true,
				true,
			),
			centerStatus: createLabel(640, 676, 15, "#5b4131", "同一关节链", true),
			centerHint: createLabel(
				640,
				698,
				12,
				"#746049",
				"身体倾斜会带动两只手臂",
				true,
			),
			notice: createLabel(640, 222, 26, COLORS.gold, "", true, true),
		};
		labels.notice.anchorPoint.set(0.5, 0.5);
		labels.notice.setOpacity(0);
		labels.notice.strokeStyle.parseCSS(COLORS.ink);
		labels.notice.lineWidth = 5;

		for (const label of Object.values(labels)) {
			app.world.addChild(label, 20);
		}
		const debug = new URLSearchParams(globalThis.location.search).has("debug");
		app.world.addChild(new PuppetShow(labels, debug), 10);
	}

	override onDestroyEvent() {
		for (const key of [
			input.KEY.A,
			input.KEY.D,
			input.KEY.W,
			input.KEY.S,
			input.KEY.J,
			input.KEY.L,
			input.KEY.I,
			input.KEY.K,
			input.KEY.R,
		]) {
			input.unbindKey(key);
		}
		const target = globalThis as typeof globalThis & {
			__paperPuppet?: () => PuppetSnapshot;
		};
		delete target.__paperPuppet;
	}
}
