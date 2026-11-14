import { Renderable } from "melonjs";

type Renderer = Parameters<Renderable["draw"]>[0];

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

export const HEADER_Y = 104;
export const SCENE_BOTTOM = 600;
export const BED_Y = 574;
export const HIGH_WATER_Y = 250;
export const LOW_WATER_Y = 478;

export const UPSTREAM_LEFT = 40;
export const UPSTREAM_RIGHT = 464;
export const GATE_1_X = 482;
export const GATE_2_X = 902;
export const CHAMBER_LEFT = 492;
export const CHAMBER_RIGHT = 892;
export const DOWNSTREAM_LEFT = 912;
export const DOWNSTREAM_RIGHT = 1240;

const GATE_TRAVEL = 460;
const GATE_SPEED = 0.82;
const GATE_CLEARANCE = 0.88;
const BOAT_SPEED = 128;
const BOAT_LENGTH = 98;
const BOAT_GAP = 14;
const SAFE_HEAD_M = 0.35;
const KPA_PER_METER = 9.81;
const METERS_PER_PIXEL = 0.04;

const CHAMBER_SLOTS = [832, 700, 568];
const UPSTREAM_SLOTS = [408, 294, 180];
const DOWNSTREAM_SLOTS = [1190, 1076, 962];
const BOAT_COLORS = ["#e58d3d", "#53b4a0", "#d56262"];

export const BUTTONS = {
	gate1: { x: 34, y: 638, width: 270, height: 66 },
	pump: { x: 316, y: 638, width: 270, height: 66 },
	gate2: { x: 598, y: 638, width: 270, height: 66 },
	fault: { x: 880, y: 638, width: 152, height: 66 },
	speed: { x: 1044, y: 638, width: 90, height: 66 },
	reset: { x: 1146, y: 638, width: 94, height: 66 },
} as const;

export type ButtonId = keyof typeof BUTTONS;
export type GateId = 1 | 2;
export type PumpSetting = 0 | 1 | 2;
export type MissionPhase = "passage" | "success" | "fault" | "failed";
export type PassageStep =
	| "open-up"
	| "boarding"
	| "close-up"
	| "draining"
	| "exiting";

export type SimCue =
	| { type: "gate-start"; power: number }
	| { type: "gate-stop"; power: number }
	| { type: "creak"; power: number }
	| { type: "pump"; setting: PumpSetting }
	| { type: "warning" }
	| { type: "success" }
	| { type: "failure" }
	| { type: "reset" }
	| { type: "fault-armed" };

interface GateState {
	open: number;
	target: 0 | 1;
	health: number;
	motion: -1 | 0 | 1;
}

interface Boat {
	x: number;
	y: number;
	targetX: number;
	region: "upstream" | "chamber" | "downstream";
	roll: number;
	moving: boolean;
	color: string;
}

export interface LockSnapshot {
	phase: MissionPhase;
	step: PassageStep;
	gate1Open: number;
	gate2Open: number;
	gate1Health: number;
	gate2Health: number;
	lockY: number;
	surge: number;
	upstreamHeadM: number;
	downstreamHeadM: number;
	upstreamKpa: number;
	downstreamKpa: number;
	pump: PumpSetting;
	vortex: number;
	boats: ReadonlyArray<Boat>;
	timeScale: number;
	faultAvailable: boolean;
	failureTitle: string;
	failureDetail: string;
	completedBoats: number;
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const damp = (current: number, target: number, lambda: number, dt: number) =>
	current + (target - current) * (1 - Math.exp(-lambda * dt));

const headMeters = (pixels: number) => pixels * METERS_PER_PIXEL;

const makeBoats = (): Boat[] =>
	UPSTREAM_SLOTS.map((x, index) => ({
		x,
		y: HIGH_WATER_Y,
		targetX: x,
		region: "upstream",
		roll: 0,
		moving: false,
		color: BOAT_COLORS[index],
	}));

export class LockSimulation extends Renderable {
	private headerGradient!: ReturnType<Renderer["createLinearGradient"]>;
	private sceneGradient!: ReturnType<Renderer["createLinearGradient"]>;
	private waterGradient!: ReturnType<Renderer["createLinearGradient"]>;
	private deckGradient!: ReturnType<Renderer["createLinearGradient"]>;
	private warningGradient!: ReturnType<Renderer["createLinearGradient"]>;

	private phase: MissionPhase = "passage";
	private mission: 1 | 2 = 1;
	private step: PassageStep = "open-up";
	private gate1: GateState = { open: 0, target: 0, health: 100, motion: 0 };
	private gate2: GateState = { open: 0, target: 0, health: 100, motion: 0 };
	private lockY = HIGH_WATER_Y;
	private surge = 0;
	private pump: PumpSetting = 0;
	private vortex = 0;
	private boats: Boat[] = makeBoats();
	private time = 0;
	private timeScale = 1;
	private damageFlash = 0;
	private message = "";
	private messageTtl = 0;
	private failureTitle = "";
	private failureDetail = "";
	private completedBoats = 0;
	private nextCreakAt = 0;
	private warningIssued = false;
	private cues: SimCue[] = [];

	constructor() {
		super(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override onActivateEvent() {
		const renderer = this.parentApp.renderer;
		this.headerGradient = renderer.createLinearGradient(0, 0, 0, HEADER_Y);
		this.headerGradient.addColorStop(0, "#071219");
		this.headerGradient.addColorStop(0.72, "#0d202b");
		this.headerGradient.addColorStop(1, "#102a36");

		this.sceneGradient = renderer.createLinearGradient(
			0,
			HEADER_Y,
			0,
			SCENE_BOTTOM,
		);
		this.sceneGradient.addColorStop(0, "#0b1a22");
		this.sceneGradient.addColorStop(1, "#061016");

		this.waterGradient = renderer.createLinearGradient(
			0,
			HIGH_WATER_Y,
			0,
			BED_Y,
		);
		this.waterGradient.addColorStop(0, "#2783a1");
		this.waterGradient.addColorStop(0.24, "#13637d");
		this.waterGradient.addColorStop(0.7, "#0a3a51");
		this.waterGradient.addColorStop(1, "#061c2b");

		this.deckGradient = renderer.createLinearGradient(
			0,
			SCENE_BOTTOM,
			0,
			DESIGN_HEIGHT,
		);
		this.deckGradient.addColorStop(0, "#0d2029");
		this.deckGradient.addColorStop(1, "#07131a");

		this.warningGradient = renderer.createLinearGradient(0, 210, 0, 486);
		this.warningGradient.addColorStop(0, "#ffcc66");
		this.warningGradient.addColorStop(0.55, "#ee7b38");
		this.warningGradient.addColorStop(1, "#ce3232");
	}

	override update(dtMs: number): boolean {
		const dt = Math.min(dtMs, 50) / 1000;
		this.time += dt;
		this.messageTtl = Math.max(0, this.messageTtl - dt);
		this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);

		if (this.phase === "failed") {
			return true;
		}

		const scaled = dt * this.timeScale;
		this.updateGates(scaled);
		this.updateWater(scaled);
		this.updateVortex(scaled);
		this.updateBoats(scaled);
		this.updateStep();
		this.checkFailure();
		return true;
	}

	drainCues(): SimCue[] {
		const out = this.cues;
		this.cues = [];
		return out;
	}

	toggleGate(gate: GateId) {
		if (this.phase === "failed" || this.phase === "success") {
			return;
		}
		const state = gate === 1 ? this.gate1 : this.gate2;
		state.target = state.target === 1 ? 0 : 1;
		const head =
			gate === 1
				? headMeters(Math.abs(HIGH_WATER_Y - this.lockY))
				: headMeters(Math.abs(this.lockY - LOW_WATER_Y));
		if (state.target === 1 && head > SAFE_HEAD_M) {
			this.notify(
				`超压开门：${head.toFixed(2)} m 压差正在冲击${gate === 1 ? "上游" : "下游"}门轴`,
				6,
			);
			this.cues.push({ type: "warning" });
		} else {
			this.notify(
				state.target === 1
					? `${gate === 1 ? "上游" : "下游"}闸门开始开启`
					: `${gate === 1 ? "上游" : "下游"}闸门开始关闭`,
				3,
			);
			this.cues.push({ type: "gate-start", power: 0.3 });
		}
	}

	cyclePump() {
		if (this.phase === "failed" || this.phase === "success") {
			return;
		}
		if (this.gate1.open > 0.02 || this.gate2.open > 0.02) {
			this.notify("排水联锁：先关闭两道闸门", 4);
			this.cues.push({ type: "warning" });
			return;
		}
		this.pump = ((this.pump + 1) % 3) as PumpSetting;
		const labels = ["关闭", "低功率", "高功率"];
		this.notify(`排水泵：${labels[this.pump]}`, 3);
		this.cues.push({ type: "pump", setting: this.pump });
	}

	toggleSpeed() {
		this.timeScale = this.timeScale === 1 ? 2 : this.timeScale === 2 ? 3 : 1;
	}

	enterFaultDemo() {
		if (this.phase !== "success") {
			if (this.phase === "fault") {
				this.notify("故障演练已启动：打开上游闸门即可复现", 4);
			} else {
				this.notify("先完成三船过闸，再进入故障演练", 4);
			}
			this.cues.push({ type: "warning" });
			return;
		}
		this.phase = "fault";
		this.mission = 2;
		this.step = "open-up";
		this.gate1 = { open: 0, target: 0, health: 100, motion: 0 };
		this.gate2 = { open: 0, target: 0, health: 100, motion: 0 };
		this.lockY = LOW_WATER_Y;
		this.surge = 0;
		this.pump = 0;
		this.vortex = 0;
		this.failureTitle = "";
		this.failureDetail = "";
		this.completedBoats = 3;
		this.boats = DOWNSTREAM_SLOTS.map((x, index) => ({
			x,
			y: LOW_WATER_Y,
			targetX: x,
			region: "downstream",
			roll: 0,
			moving: false,
			color: BOAT_COLORS[index],
		}));
		this.notify("故障演练：上游高水位，闸室已排空至下游水位", 8);
		this.cues.push({ type: "fault-armed" });
	}

	reset() {
		this.phase = "passage";
		this.mission = 1;
		this.step = "open-up";
		this.gate1 = { open: 0, target: 0, health: 100, motion: 0 };
		this.gate2 = { open: 0, target: 0, health: 100, motion: 0 };
		this.lockY = HIGH_WATER_Y;
		this.surge = 0;
		this.pump = 0;
		this.vortex = 0;
		this.boats = makeBoats();
		this.failureTitle = "";
		this.failureDetail = "";
		this.completedBoats = 0;
		this.warningIssued = false;
		this.damageFlash = 0;
		this.message = "";
		this.messageTtl = 0;
		this.cues.push({ type: "reset" });
	}

	hitTest(x: number, y: number): ButtonId | null {
		for (const [id, rect] of Object.entries(BUTTONS)) {
			if (
				x >= rect.x &&
				x <= rect.x + rect.width &&
				y >= rect.y &&
				y <= rect.y + rect.height
			) {
				return id as ButtonId;
			}
		}
		return null;
	}

	getSnapshot(): LockSnapshot {
		return {
			phase: this.phase,
			step: this.step,
			gate1Open: this.gate1.open,
			gate2Open: this.gate2.open,
			gate1Health: this.gate1.health,
			gate2Health: this.gate2.health,
			lockY: this.lockY,
			surge: this.surge,
			upstreamHeadM: headMeters(Math.abs(HIGH_WATER_Y - this.lockY)),
			downstreamHeadM: headMeters(Math.abs(this.lockY - LOW_WATER_Y)),
			upstreamKpa:
				headMeters(Math.abs(HIGH_WATER_Y - this.lockY)) * KPA_PER_METER,
			downstreamKpa:
				headMeters(Math.abs(this.lockY - LOW_WATER_Y)) * KPA_PER_METER,
			pump: this.pump,
			vortex: this.vortex,
			boats: this.boats,
			timeScale: this.timeScale,
			faultAvailable: this.phase === "success",
			failureTitle: this.failureTitle,
			failureDetail: this.failureDetail,
			completedBoats: this.completedBoats,
		};
	}

	getObjective(): string {
		if (this.phase === "failed") {
			return "事故已记录。按 R 重试，并按正确顺序重新操作。";
		}
		if (this.phase === "success") {
			return "三船通过完成。按 F 进入故障演练，再打开上游闸门复现门轴超限。";
		}
		if (this.phase === "fault") {
			return "故障演练：闸室位于下游水位，上游仍有约 9.1 m 压差。按 [1] 打开上游闸门。";
		}
		switch (this.step) {
			case "open-up":
				return "1/4 打开上游闸门，让三艘货船依次进入闸室。";
			case "boarding":
				return "1/4 保持上游闸门开启，等待三艘货船全部进入闸室。";
			case "close-up":
				return "2/4 三船已进入闸室，关闭上游闸门并锁闭闸室。";
			case "draining":
				return this.lockY >= LOW_WATER_Y - 1
					? "4/4 闸室与下游水位平齐，打开下游闸门放行。"
					: "3/4 启动排水泵；低功率可避免涡流，高功率更快但更危险。";
			case "exiting":
				return "4/4 下游闸门已开启，三艘货船正在驶出闸室。";
		}
	}

	getStatusLine(): string {
		if (this.messageTtl > 0 && this.message) {
			return this.message;
		}
		if (this.phase === "failed") {
			return `SYSTEM FAULT · ${this.failureTitle}`;
		}
		if (this.phase === "success") {
			return "MISSION COMPLETE · 3/3 SHIPS THROUGH";
		}
		if (this.phase === "fault") {
			const head = headMeters(Math.abs(HIGH_WATER_Y - this.lockY));
			return head > SAFE_HEAD_M
				? `MANUAL OVERRIDE · 上游压差 ${head.toFixed(2)} m`
				: "MANUAL OVERRIDE · 压差已释放";
		}
		const pumpLabel = ["待机", "低功率", "高功率"][this.pump];
		const vortexLabel =
			this.vortex > 0.62
				? "涡流警告"
				: this.vortex > 0.2
					? "轻微涡流"
					: "水流平稳";
		return `LIVE · 泵 ${pumpLabel} · ${vortexLabel}`;
	}

	getMissionLine(): string {
		if (this.phase === "failed") {
			return `MISSION 0${this.mission} · 事故停机`;
		}
		if (this.phase === "fault") {
			return "MISSION 02 · 超压开门";
		}
		if (this.phase === "success") {
			return "MISSION 01 · 完成";
		}
		return "MISSION 01 · 三船过闸";
	}

	getProgressLine(): string {
		const passed = this.boats.filter(
			(boat) => boat.region === "downstream",
		).length;
		if (this.phase === "success") {
			return "3 / 3 已通过 · 故障链已解锁";
		}
		if (this.phase === "fault") {
			return "演练模式 · 上游闸门轴损监测";
		}
		if (this.phase === "failed") {
			return "事故停机 · 压差与轴损已记录";
		}
		return `${passed} / 3 已通过 · 闸室 ${((BED_Y - this.lockY) * METERS_PER_PIXEL).toFixed(1)} m`;
	}

	getGateLabel(gate: GateId): string {
		const state = gate === 1 ? this.gate1 : this.gate2;
		const head =
			gate === 1
				? headMeters(Math.abs(HIGH_WATER_Y - this.lockY))
				: headMeters(Math.abs(this.lockY - LOW_WATER_Y));
		const kpa = head * KPA_PER_METER;
		return `Δ ${head.toFixed(1)}m · ${kpa.toFixed(0)}kPa\n轴损 ${state.health.toFixed(0)}%`;
	}

	getLockLevel(): string {
		return `闸室 ${((BED_Y - this.lockY) * METERS_PER_PIXEL).toFixed(1)} m`;
	}

	getGateButtonLabel(gate: GateId): string {
		const state = gate === 1 ? this.gate1 : this.gate2;
		const name = gate === 1 ? "上游闸门" : "下游闸门";
		const action = state.target === 1 ? "关闭" : "开启";
		return `${action}${name} · [${gate === 1 ? 1 : 3}]`;
	}

	getPumpButtonLabel(): string {
		const labels = ["泵：关", "泵：低功率", "泵：高功率"];
		return `${labels[this.pump]} · [2]`;
	}

	getFaultButtonLabel(): string {
		if (this.phase === "success") {
			return "故障演练 · [F]";
		}
		if (this.phase === "fault") {
			return "演练已启动";
		}
		return "故障演练锁定";
	}

	getSpeedLabel(): string {
		return `×${this.timeScale} · [T]`;
	}

	getOverlay(): {
		title: string;
		detail: string;
		hint: string;
		tone: "success" | "failure";
	} | null {
		if (this.phase === "success") {
			return {
				title: "三船通过",
				detail:
					"上游闸门 → 闸室排水 → 下游闸门\n3 / 3 货船安全驶出，门轴损伤 0%",
				hint: "按 F 或点击「故障演练」继续",
				tone: "success",
			};
		}
		if (this.phase === "failed") {
			return {
				title: this.failureTitle,
				detail: this.failureDetail,
				hint: "按 R 重试整个场景",
				tone: "failure",
			};
		}
		return null;
	}

	private updateGates(dt: number) {
		this.updateGate(1, this.gate1, dt);
		this.updateGate(2, this.gate2, dt);
	}

	private updateGate(gate: GateId, state: GateState, dt: number) {
		const previous = state.open;
		state.motion = 0;
		if (state.target > state.open) {
			state.open = Math.min(state.target, state.open + GATE_SPEED * dt);
			state.motion = 1;
		} else if (state.target < state.open) {
			state.open = Math.max(state.target, state.open - GATE_SPEED * dt);
			state.motion = -1;
		}

		if (previous < 1 && state.open >= 1) {
			this.cues.push({ type: "gate-stop", power: 0.8 });
		}
		if (previous > 0 && state.open <= 0) {
			this.cues.push({ type: "gate-stop", power: 0.45 });
		}

		const headPx =
			gate === 1
				? Math.abs(HIGH_WATER_Y - this.lockY)
				: Math.abs(this.lockY - LOW_WATER_Y);
		const head = headMeters(headPx);
		if (head > SAFE_HEAD_M && (state.open > 0.001 || state.motion !== 0)) {
			const movementRate =
				state.motion === 0 ? 2.1 : state.motion > 0 ? 11.5 : 7;
			state.health = clamp(
				state.health - (head - SAFE_HEAD_M) * movementRate * dt,
				0,
				100,
			);
			this.damageFlash = Math.max(this.damageFlash, 0.7);
			if (this.time >= this.nextCreakAt && state.motion !== 0) {
				this.nextCreakAt = this.time + 0.46;
				this.cues.push({
					type: "creak",
					power: clamp(head / 9.2, 0.15, 1),
				});
			}
			if (!this.warningIssued && state.health < 45) {
				this.warningIssued = true;
				this.notify("警告：门轴损伤快速上升，立即停止开门", 6);
				this.cues.push({ type: "warning" });
			}
		}
	}

	private updateWater(dt: number) {
		if (this.gate1.open > 0.01) {
			this.lockY = damp(this.lockY, HIGH_WATER_Y, 1.15 * this.gate1.open, dt);
		}
		if (this.gate2.open > 0.01) {
			this.lockY = damp(this.lockY, LOW_WATER_Y, 1.15 * this.gate2.open, dt);
		}

		const pumping =
			this.pump > 0 && this.gate1.open < 0.02 && this.gate2.open < 0.02;
		if (pumping && this.lockY < LOW_WATER_Y) {
			this.lockY = Math.min(
				LOW_WATER_Y,
				this.lockY + (this.pump === 2 ? 82 : 31) * dt,
			);
		}

		const upstreamHead =
			headMeters(Math.abs(HIGH_WATER_Y - this.lockY)) - SAFE_HEAD_M;
		if (this.gate1.open > 0.04 && upstreamHead > 0) {
			this.surge += upstreamHead * this.gate1.open * 0.11 * dt;
		} else {
			this.surge = damp(this.surge, 0, 2.4, dt);
		}
		this.surge = clamp(this.surge, 0, 30);
	}

	private updateVortex(dt: number) {
		const pumping =
			this.pump > 0 && this.gate1.open < 0.02 && this.gate2.open < 0.02;
		const remaining = clamp(
			(this.lockY - LOW_WATER_Y) / (HIGH_WATER_Y - LOW_WATER_Y),
			0,
			1,
		);
		const target =
			pumping && this.lockY < LOW_WATER_Y - 4
				? this.pump === 2
					? 0.92 * remaining
					: 0.18 * remaining
				: 0;
		this.vortex = damp(this.vortex, target, 2.8, dt);
		if (this.vortex > 0.72 && this.pump === 2) {
			this.notify("涡流增强：高功率排水正在搅动闸室", 2);
		}
	}

	private updateBoats(dt: number) {
		for (let index = 0; index < this.boats.length; index++) {
			const boat = this.boats[index];
			const previousX = boat.x;

			if (boat.targetX > boat.x) {
				const leaderX =
					index > 0
						? this.boats[index - 1].x - BOAT_LENGTH - BOAT_GAP
						: Number.POSITIVE_INFINITY;
				boat.x = Math.min(boat.x + BOAT_SPEED * dt, boat.targetX, leaderX);
			}

			boat.moving = Math.abs(boat.x - previousX) > 0.02;

			if (
				boat.region === "upstream" &&
				boat.x > GATE_1_X + BOAT_LENGTH * 0.58
			) {
				boat.region = "chamber";
			}
			if (
				boat.region === "chamber" &&
				this.step === "exiting" &&
				boat.x > GATE_2_X + BOAT_LENGTH * 0.58
			) {
				boat.region = "downstream";
				this.completedBoats = Math.max(
					this.completedBoats,
					this.boats.filter((entry) => entry.region === "downstream").length,
				);
			}

			const targetY =
				boat.region === "upstream"
					? HIGH_WATER_Y
					: boat.region === "chamber"
						? this.lockY
						: LOW_WATER_Y;
			boat.y = damp(boat.y, targetY, 7, dt);
			boat.roll =
				this.vortex > 0.25 && boat.region === "chamber"
					? Math.sin(this.time * 5.4 + index * 1.7) * this.vortex * 0.075
					: damp(boat.roll, 0, 5, dt);
		}
	}

	private updateStep() {
		if (this.phase !== "passage") {
			return;
		}
		const allInChamber = this.boats.every(
			(boat, index) =>
				boat.region === "chamber" &&
				Math.abs(boat.x - CHAMBER_SLOTS[index]) < 2.5,
		);
		const allDownstream = this.boats.every(
			(boat, index) =>
				boat.region === "downstream" &&
				Math.abs(boat.x - DOWNSTREAM_SLOTS[index]) < 2.5,
		);

		if (this.step === "open-up" && this.gate1.open >= GATE_CLEARANCE) {
			this.step = "boarding";
			this.notify("上游闸门已开启，船队开始进闸", 3);
		}
		if (this.step === "boarding") {
			this.boats.forEach((boat, index) => {
				boat.targetX = CHAMBER_SLOTS[index];
			});
			if (allInChamber) {
				this.step = "close-up";
				this.notify("三船已入闸，关闭上游闸门", 4);
			}
		}
		if (this.step === "close-up" && this.gate1.open <= 0.01) {
			this.step = "draining";
			this.notify("闸室已锁闭，排水泵可以启动", 3);
		}
		if (this.step === "draining") {
			const downstreamHead = headMeters(Math.abs(this.lockY - LOW_WATER_Y));
			if (downstreamHead <= SAFE_HEAD_M && this.gate2.open >= GATE_CLEARANCE) {
				this.step = "exiting";
				this.boats.forEach((boat, index) => {
					boat.targetX = DOWNSTREAM_SLOTS[index];
				});
				this.notify("水位平齐，三船开始驶出", 3);
			}
		}
		if (this.step === "exiting" && allDownstream) {
			this.completedBoats = 3;
			this.phase = "success";
			this.notify("三船全部安全通过", 8);
			this.cues.push({ type: "success" });
			this.parentApp.viewport.shake(4, 220);
		}
	}

	private checkFailure() {
		if (this.phase === "failed") {
			return;
		}
		if (this.gate1.health <= 0) {
			this.fail(
				"上游闸门门轴损伤超限",
				"在上游水位与闸室存在约 9.1 m 压差时开门，门轴受力超过结构极限。\n正确顺序：先把闸室水位与上游平齐，再开启上游闸门。",
			);
			return;
		}
		if (this.gate2.health <= 0) {
			this.fail(
				"下游闸门门轴损伤超限",
				"闸室尚未排至下游水位时开启下游闸门，门轴被压差撕裂。\n先排水平压，再开门。",
			);
			return;
		}

		for (const boat of this.boats) {
			const nearGate1 = Math.abs(boat.x - GATE_1_X) < BOAT_LENGTH * 0.62;
			if (nearGate1 && this.boatIntersectsGate(boat, this.gate1)) {
				this.fail(
					"货船被上游闸门夹住",
					"闸门在船体尚未完全通过时下落，船体与门板发生夹压。\n确认船队全部入闸后再关闭闸门。",
				);
				return;
			}
			const nearGate2 = Math.abs(boat.x - GATE_2_X) < BOAT_LENGTH * 0.62;
			if (nearGate2 && this.boatIntersectsGate(boat, this.gate2)) {
				this.fail(
					"货船被下游闸门夹住",
					"闸门在船体尚未完全通过时下落，船体与门板发生夹压。\n确认船队完全驶出后再关闭闸门。",
				);
				return;
			}
		}

		if (this.lockY - this.surge < HIGH_WATER_Y - 8) {
			this.fail(
				"闸室溢出",
				"两道闸门同时承受高水位来流，闸室水面越过胸墙。\n不要在上游超压时同时开启两道闸门。",
			);
		}
	}

	private boatIntersectsGate(boat: Boat, gate: GateState): boolean {
		if (gate.motion >= 0) {
			return false;
		}
		const bottom = BED_Y - (1 - gate.open) * GATE_TRAVEL;
		const boatTop = boat.y - 70;
		return bottom > boatTop + 3;
	}

	private fail(title: string, detail: string) {
		this.phase = "failed";
		this.failureTitle = title;
		this.failureDetail = detail;
		this.message = title;
		this.messageTtl = 0;
		this.cues.push({ type: "failure" });
		this.parentApp.viewport.shake(10, 420, undefined, undefined, true);
	}

	private notify(text: string, seconds: number) {
		this.message = text;
		this.messageTtl = seconds;
	}

	override draw(renderer: Renderer) {
		renderer.setGlobalAlpha(1);
		this.drawHeader(renderer);
		this.drawScene(renderer);
		this.drawWater(renderer);
		this.drawGateFlow(renderer);
		this.drawVortex(renderer);
		this.drawBoats(renderer);
		this.drawGates(renderer);
		this.drawReadouts(renderer);
		this.drawDeck(renderer);
		this.drawOverlay(renderer);
		renderer.setGlobalAlpha(1);
	}

	private drawHeader(renderer: Renderer) {
		renderer.setColor(this.headerGradient);
		renderer.fillRect(0, 0, DESIGN_WIDTH, HEADER_Y);

		renderer.setColor("#f2a640");
		renderer.fillRect(0, 0, DESIGN_WIDTH, 3);
		renderer.setColor("#173b48");
		renderer.fillRect(0, HEADER_Y - 1, DESIGN_WIDTH, 1);

		renderer.setColor("#4bd0d0");
		renderer.fillRect(36, 20, 5, 34);
		renderer.setColor("#d4f5f4");
		renderer.fillRect(52, 25, 96, 2);
		renderer.setColor("#6d9ead");
		renderer.fillRect(52, 32, 54, 1);

		const pips = 3;
		for (let index = 0; index < pips; index++) {
			const x = 968 + index * 22;
			renderer.setColor(index < this.completedBoats ? "#6ee7b7" : "#234652");
			renderer.fillEllipse(x, 76, 7, 7);
			renderer.setColor("#0b1a22");
			renderer.fillEllipse(x, 76, 3, 3);
		}

		renderer.setColor("#173846");
		renderer.fillRoundRect(930, 14, 314, 76, 8);
		renderer.setColor("#255364");
		renderer.lineWidth = 1;
		renderer.strokeRoundRect(930, 14, 314, 76, 8);
	}

	private drawScene(renderer: Renderer) {
		renderer.setColor(this.sceneGradient);
		renderer.fillRect(0, HEADER_Y, DESIGN_WIDTH, SCENE_BOTTOM - HEADER_Y);

		renderer.setColor("#12313c");
		renderer.setGlobalAlpha(0.13);
		renderer.lineWidth = 1;
		for (let x = 32; x < DESIGN_WIDTH; x += 48) {
			renderer.strokeLine(x, HEADER_Y + 8, x, SCENE_BOTTOM - 8);
		}
		for (let y = HEADER_Y + 12; y < SCENE_BOTTOM; y += 36) {
			renderer.strokeLine(24, y, DESIGN_WIDTH - 24, y);
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor("#1b3540");
		renderer.fillRect(24, 142, 1232, 18);
		renderer.setColor("#294e5a");
		renderer.fillRect(24, 142, 1232, 3);
		renderer.setColor("#0d2028");
		renderer.fillRect(24, 160, 1232, 6);

		this.drawStoneWall(renderer, 24, 160, 16, BED_Y - 160);
		this.drawStoneWall(renderer, UPSTREAM_RIGHT - 8, 160, 16, BED_Y - 160);
		this.drawStoneWall(renderer, CHAMBER_LEFT - 8, 160, 16, BED_Y - 160);
		this.drawStoneWall(renderer, CHAMBER_RIGHT - 8, 160, 16, BED_Y - 160);
		this.drawStoneWall(renderer, DOWNSTREAM_LEFT - 8, 160, 16, BED_Y - 160);
		this.drawStoneWall(renderer, DOWNSTREAM_RIGHT - 8, 160, 16, BED_Y - 160);

		renderer.setColor("#122a34");
		renderer.fillRect(24, BED_Y, 1232, SCENE_BOTTOM - BED_Y);
		renderer.setColor("#25434e");
		renderer.fillRect(24, BED_Y, 1232, 3);
		renderer.setColor("#18343e");
		renderer.fillRect(24, BED_Y + 22, 1232, 2);

		renderer.setColor("#071219");
		renderer.fillRect(32, HEADER_Y, 12, SCENE_BOTTOM - HEADER_Y);
		renderer.fillRect(DESIGN_WIDTH - 44, HEADER_Y, 12, SCENE_BOTTOM - HEADER_Y);
	}

	private drawStoneWall(
		renderer: Renderer,
		x: number,
		y: number,
		w: number,
		h: number,
	) {
		renderer.setColor("#263b42");
		renderer.fillRect(x, y, w, h);
		renderer.setColor("#3e5960");
		renderer.fillRect(x, y, 2, h);
		renderer.setColor("#12242b");
		renderer.lineWidth = 1;
		for (let yy = y + 20; yy < y + h; yy += 28) {
			renderer.strokeLine(x, yy, x + w, yy);
		}
	}

	private drawWater(renderer: Renderer) {
		const chamberSurface = clamp(
			this.lockY - this.surge,
			HIGH_WATER_Y - 24,
			LOW_WATER_Y,
		);
		this.drawWaterBody(renderer, UPSTREAM_LEFT, UPSTREAM_RIGHT, HIGH_WATER_Y);
		this.drawWaterBody(renderer, CHAMBER_LEFT, CHAMBER_RIGHT, chamberSurface);
		this.drawWaterBody(
			renderer,
			DOWNSTREAM_LEFT,
			DOWNSTREAM_RIGHT,
			LOW_WATER_Y,
		);

		if (this.surge > 0.5) {
			this.drawSpill(renderer, chamberSurface);
		}
	}

	private drawWaterBody(
		renderer: Renderer,
		left: number,
		right: number,
		surface: number,
	) {
		const width = right - left;
		renderer.setColor(this.waterGradient);
		renderer.fillRect(left, surface, width, BED_Y - surface);
		renderer.setColor("#6bd7e8");
		renderer.setGlobalAlpha(0.22);
		renderer.fillRect(left, surface, width, 3);
		renderer.setGlobalAlpha(1);

		renderer.lineWidth = 1.4;
		renderer.setColor("#9ae9f2");
		renderer.setGlobalAlpha(0.5);
		renderer.beginPath();
		renderer.moveTo(left, surface);
		for (let x = left; x <= right; x += 8) {
			const wave =
				Math.sin(x * 0.045 + this.time * 1.7) * 1.7 +
				Math.sin(x * 0.019 - this.time * 1.1) * 1.1;
			renderer.lineTo(x, surface + wave);
		}
		renderer.stroke();

		renderer.setColor("#9be9ef");
		renderer.setGlobalAlpha(0.18);
		for (let x = left + 22; x < right - 12; x += 58) {
			const bubbleY =
				surface + 32 + ((x * 17) % Math.max(40, BED_Y - surface - 48));
			renderer.fillEllipse(x + Math.sin(this.time + x) * 2, bubbleY, 2, 2);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawSpill(renderer: Renderer, surface: number) {
		renderer.setColor("#9cecf2");
		renderer.setGlobalAlpha(clamp((this.surge - 0.5) / 10, 0.08, 0.55));
		for (let index = 0; index < 5; index++) {
			const x = CHAMBER_LEFT + 52 + index * 70;
			const y =
				surface -
				8 -
				((this.time * 22 + index * 17) % Math.max(12, this.surge * 3));
			renderer.fillEllipse(x, y, 3, 5);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawGateFlow(renderer: Renderer) {
		this.drawFlowAtGate(
			renderer,
			GATE_1_X,
			this.gate1.open,
			headMeters(Math.abs(HIGH_WATER_Y - this.lockY)),
			HIGH_WATER_Y,
		);
		this.drawFlowAtGate(
			renderer,
			GATE_2_X,
			this.gate2.open,
			headMeters(Math.abs(this.lockY - LOW_WATER_Y)),
			this.lockY,
		);
	}

	private drawFlowAtGate(
		renderer: Renderer,
		gateX: number,
		open: number,
		head: number,
		surface: number,
	) {
		if (open < 0.02 || head < SAFE_HEAD_M) {
			return;
		}
		const strength = clamp(head / 7.5, 0.08, 1) * open;
		renderer.setColor(head > 2.4 ? "#f8d278" : "#8ce9ef");
		renderer.setGlobalAlpha(0.18 + strength * 0.45);
		renderer.lineWidth = 1 + strength * 2;
		for (let index = 0; index < 5; index++) {
			const y = surface + 22 + index * 28;
			if (y > BED_Y - 8) {
				break;
			}
			renderer.beginPath();
			renderer.moveTo(gateX - 5, y);
			for (let step = 0; step < 5; step++) {
				const x = gateX + step * 16;
				renderer.lineTo(
					x,
					y + Math.sin(this.time * 9 + index + step) * (2 + strength * 2),
				);
			}
			renderer.stroke();
		}
		this.drawArrow(renderer, gateX + 46, surface + 66, 18 + strength * 12, 0);
		renderer.setGlobalAlpha(1);
	}

	private drawArrow(
		renderer: Renderer,
		x: number,
		y: number,
		length: number,
		tilt: number,
	) {
		renderer.beginPath();
		renderer.moveTo(x, y);
		renderer.lineTo(x + length, y + tilt);
		renderer.lineTo(x + length - 8, y + tilt - 5);
		renderer.moveTo(x + length, y + tilt);
		renderer.lineTo(x + length - 8, y + tilt + 5);
		renderer.stroke();
	}

	private drawVortex(renderer: Renderer) {
		if (this.vortex < 0.025) {
			return;
		}
		const centerX = (CHAMBER_LEFT + CHAMBER_RIGHT) / 2;
		const centerY = Math.min(this.lockY + 82, BED_Y - 44);
		const maxRadius = 24 + this.vortex * 94;
		renderer.setColor("#bfeef1");
		renderer.lineWidth = 1.8 + this.vortex * 2.8;
		renderer.setGlobalAlpha(0.2 + this.vortex * 0.56);
		for (let ring = 0; ring < 5; ring++) {
			const radius = maxRadius * (0.26 + ring * 0.18);
			const start = this.time * (1.9 + ring * 0.45) + ring * 1.2;
			renderer.strokeArc(
				centerX,
				centerY,
				radius,
				start,
				start + Math.PI * (1.35 + ring * 0.1),
			);
		}
		renderer.setColor("#e6ffff");
		for (let index = 0; index < 12; index++) {
			const angle = this.time * 2.8 + (index * Math.PI) / 4;
			const radius = maxRadius * (0.35 + (index % 3) * 0.2);
			renderer.fillEllipse(
				centerX + Math.cos(angle) * radius,
				centerY + Math.sin(angle) * radius * 0.48,
				1.5,
				1.5,
			);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawBoats(renderer: Renderer) {
		for (const boat of this.boats) {
			this.drawBoat(renderer, boat);
		}
	}

	private drawBoat(renderer: Renderer, boat: Boat) {
		renderer.save();
		renderer.translate(boat.x, boat.y);
		renderer.rotate(boat.roll);

		if (boat.moving) {
			renderer.setColor("#98edf2");
			renderer.setGlobalAlpha(0.32);
			renderer.lineWidth = 1.2;
			renderer.beginPath();
			for (let index = 0; index < 3; index++) {
				const wakeY = 15 + index * 6;
				renderer.moveTo(-46, wakeY);
				renderer.lineTo(-70 - index * 12, wakeY - 2);
			}
			renderer.stroke();
			renderer.setGlobalAlpha(1);
		}

		renderer.setColor("#2b4a50");
		renderer.fillRect(-15, -56, 5, 34);
		renderer.setColor("#e5e1d1");
		renderer.fillRect(-22, -67, 3, 20);
		renderer.setColor(boat.color);
		renderer.fillRect(-21, -65, 12, 8);

		renderer.setColor("#c67e35");
		renderer.fillRoundRect(-43, -25, 67, 20, 2);
		renderer.setColor("#e6a552");
		renderer.fillRect(-39, -22, 59, 3);

		renderer.setColor("#2b5962");
		renderer.fillRoundRect(-7, -43, 32, 23, 3);
		renderer.setColor("#78d0d3");
		renderer.fillRect(-1, -38, 8, 7);
		renderer.fillRect(10, -38, 8, 7);
		renderer.setColor("#c4d9d8");
		renderer.fillRect(-3, -47, 24, 2);

		renderer.setColor(boat.color);
		renderer.beginPath();
		renderer.moveTo(-45, -5);
		renderer.lineTo(-45, 22);
		renderer.lineTo(37, 22);
		renderer.lineTo(51, 9);
		renderer.lineTo(43, -5);
		renderer.lineTo(-45, -5);
		renderer.fill();
		renderer.setColor("#f3d2a2");
		renderer.fillRect(-40, -2, 78, 3);
		renderer.setColor("#6d3b22");
		renderer.fillRect(-38, 11, 76, 4);
		renderer.setColor("#1a3035");
		renderer.fillRect(41, -8, 5, 13);

		renderer.setColor("#e9fbfb");
		renderer.setGlobalAlpha(0.7);
		renderer.fillEllipse(-36, 21, 12, 2);
		renderer.fillEllipse(33, 21, 10, 2);
		renderer.setGlobalAlpha(1);
		renderer.restore();
	}

	private drawGates(renderer: Renderer) {
		this.drawGate(renderer, GATE_1_X, this.gate1);
		this.drawGate(renderer, GATE_2_X, this.gate2);
	}

	private drawGate(renderer: Renderer, gateX: number, gate: GateState) {
		const gateBottom = BED_Y - (1 - gate.open) * GATE_TRAVEL;
		const plateTop = gateBottom - 456;
		const visibleTop = Math.max(plateTop, 141);

		renderer.setColor("#142c35");
		renderer.fillRect(gateX - 36, 112, 72, 42);
		renderer.setColor("#2d5260");
		renderer.fillRect(gateX - 36, 112, 72, 3);
		renderer.setColor("#0a171d");
		renderer.fillRect(gateX - 25, 124, 50, 24);

		if (gateBottom > visibleTop) {
			renderer.setColor("#243d45");
			renderer.fillRect(gateX - 11, visibleTop, 22, gateBottom - visibleTop);
			renderer.setColor("#55727a");
			renderer.fillRect(gateX - 11, visibleTop, 3, gateBottom - visibleTop);
			renderer.setColor("#0f232a");
			renderer.lineWidth = 1;
			for (let y = visibleTop + 22; y < gateBottom; y += 30) {
				renderer.strokeLine(gateX - 11, y, gateX + 11, y);
				renderer.strokeLine(gateX - 11, y, gateX + 11, y - 18);
			}
			renderer.setColor("#ae772c");
			renderer.fillRect(gateX - 8, gateBottom - 7, 16, 4);
		}

		renderer.setColor("#7e99a0");
		renderer.lineWidth = 1;
		renderer.strokeLine(gateX - 14, 139, gateX - 14, Math.max(145, gateBottom));
		renderer.strokeLine(gateX + 14, 139, gateX + 14, Math.max(145, gateBottom));

		const health = gate.health / 100;
		renderer.setColor("#14252b");
		renderer.fillRoundRect(gateX - 30, 136, 60, 5, 2);
		renderer.setColor(
			health > 0.55 ? "#62d6b0" : health > 0.25 ? "#f2ba5d" : "#f05d5d",
		);
		renderer.fillRoundRect(gateX - 30, 136, 60 * health, 5, 2);

		if (this.damageFlash > 0 && gate.health < 100) {
			renderer.setColor("#ff7b5f");
			renderer.setGlobalAlpha(this.damageFlash * 0.75);
			renderer.lineWidth = 2;
			renderer.beginPath();
			renderer.moveTo(gateX - 7, 172);
			renderer.lineTo(gateX + 2, 204);
			renderer.lineTo(gateX - 5, 233);
			renderer.lineTo(gateX + 7, 266);
			renderer.stroke();
			renderer.setGlobalAlpha(1);
		}
	}

	private drawReadouts(renderer: Renderer) {
		const head1 = headMeters(Math.abs(HIGH_WATER_Y - this.lockY));
		const head2 = headMeters(Math.abs(this.lockY - LOW_WATER_Y));
		this.drawPressureBar(renderer, GATE_1_X, head1);
		this.drawPressureBar(renderer, GATE_2_X, head2);
	}

	private drawPressureBar(renderer: Renderer, gateX: number, head: number) {
		const width = 62;
		const ratio = clamp(head / 9.2, 0, 1);
		renderer.setColor("#0b1c23");
		renderer.fillRoundRect(gateX - width / 2, 151, width, 5, 2);
		renderer.setColor(head > SAFE_HEAD_M ? this.warningGradient : "#66d9c2");
		renderer.fillRoundRect(gateX - width / 2, 151, width * ratio, 5, 2);
	}

	private drawDeck(renderer: Renderer) {
		renderer.setColor(this.deckGradient);
		renderer.fillRect(
			0,
			SCENE_BOTTOM,
			DESIGN_WIDTH,
			DESIGN_HEIGHT - SCENE_BOTTOM,
		);
		renderer.setColor("#23424d");
		renderer.fillRect(0, SCENE_BOTTOM, DESIGN_WIDTH, 1);
		renderer.setColor("#f2a640");
		renderer.fillRect(34, 605, 4, 3);

		const snap = this.getSnapshot();
		this.drawButton(
			renderer,
			BUTTONS.gate1,
			this.gate1.target === 1,
			false,
			snap.upstreamHeadM > SAFE_HEAD_M,
		);
		this.drawButton(
			renderer,
			BUTTONS.pump,
			this.pump > 0,
			false,
			this.vortex > 0.62,
		);
		this.drawButton(
			renderer,
			BUTTONS.gate2,
			this.gate2.target === 1,
			false,
			snap.downstreamHeadM > SAFE_HEAD_M,
		);
		this.drawButton(
			renderer,
			BUTTONS.fault,
			this.phase === "fault",
			this.phase !== "success" && this.phase !== "fault",
			this.phase === "success",
		);
		this.drawButton(renderer, BUTTONS.speed, this.timeScale > 1, false, false);
		this.drawButton(renderer, BUTTONS.reset, false, false, false);

		renderer.setColor(
			this.vortex > 0.62
				? "#f3b85c"
				: this.vortex > 0.2
					? "#86cfbc"
					: "#31515b",
		);
		renderer.fillEllipse(1110, 671, 4, 4);
		renderer.setColor("#0b1a21");
		renderer.fillEllipse(1110, 671, 2, 2);
	}

	private drawButton(
		renderer: Renderer,
		rect: { x: number; y: number; width: number; height: number },
		active: boolean,
		disabled: boolean,
		warning: boolean,
	) {
		renderer.setColor(disabled ? "#15272e" : active ? "#1d4e58" : "#1a333d");
		renderer.fillRoundRect(rect.x, rect.y, rect.width, rect.height, 7);
		renderer.setColor(
			warning
				? "#f0a95b"
				: disabled
					? "#29414a"
					: active
						? "#6dd4c5"
						: "#365b66",
		);
		renderer.lineWidth = warning ? 2 : 1;
		renderer.strokeRoundRect(rect.x, rect.y, rect.width, rect.height, 7);
		renderer.setColor(
			disabled
				? "#243942"
				: active
					? "#5ed7c6"
					: warning
						? "#ffc274"
						: "#7da4ae",
		);
		renderer.fillRect(rect.x + 12, rect.y + 17, 3, 32);
	}

	private drawOverlay(renderer: Renderer) {
		const overlay = this.getOverlay();
		if (!overlay) {
			return;
		}
		const failure = overlay.tone === "failure";
		renderer.setColor(failure ? "#050b0e" : "#061116");
		renderer.setGlobalAlpha(failure ? 0.82 : 0.7);
		renderer.fillRect(0, HEADER_Y, DESIGN_WIDTH, SCENE_BOTTOM - HEADER_Y);
		renderer.setGlobalAlpha(1);

		renderer.setColor(failure ? "#2a1113" : "#0a2b29");
		renderer.fillRoundRect(314, 207, 652, 300, 16);
		renderer.setColor(failure ? "#ed665f" : "#5bd7be");
		renderer.lineWidth = 2;
		renderer.strokeRoundRect(314, 207, 652, 300, 16);

		renderer.setColor(failure ? "#ed665f" : "#5bd7be");
		renderer.fillRoundRect(314, 207, 652, 4, 1);
		renderer.setColor(failure ? "#4a1c1e" : "#154a43");
		renderer.fillRoundRect(350, 275, 580, 1, 1);
		renderer.fillRoundRect(350, 408, 580, 1, 1);

		if (!failure) {
			for (let index = 0; index < 3; index++) {
				renderer.setColor(BOAT_COLORS[index]);
				const x = 538 + index * 78;
				renderer.fillRoundRect(x, 238, 44, 16, 3);
				renderer.setColor("#253a3c");
				renderer.fillRect(x + 15, 229, 14, 11);
				renderer.setColor("#e5a351");
				renderer.fillRect(x + 2, 242, 40, 2);
			}
		} else {
			renderer.setColor("#ed665f");
			renderer.lineWidth = 4;
			renderer.strokeArc(358, 256, 24, 0, Math.PI * 2);
			renderer.strokeLine(348, 246, 368, 266);
			renderer.strokeLine(368, 246, 348, 266);
		}

		renderer.setColor(failure ? "#3b1b1d" : "#123e39");
		renderer.fillRoundRect(744, 197, 206, 20, 10);
		renderer.setColor(failure ? "#ff9d8c" : "#a9f3df");
		renderer.fillEllipse(762, 207, 4, 4);
	}
}
