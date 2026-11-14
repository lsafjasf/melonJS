/**
 * melonJS — Station Tapes: an audio-deduction example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Six platform recordings of one incident, synthesised on the spot (no
 * audio files) and dealt out shuffled. Drag the recordings to reorder
 * them, and mark the two key moments — the running footsteps and the door
 * slam — on the timeline. The playback view shows only waveform and sound
 * pressure, never the true order; submitting a fully correct reconstruction
 * closes the case and reveals the real event line.
 */
import {
	Application,
	type CanvasRenderer,
	Draggable,
	Renderable,
	Stage,
	state,
	Text,
	Tween,
	UITextButton,
	type WebGLRenderer,
} from "melonjs";
import { createExampleComponent } from "../utils";
import {
	BUCKETS,
	CLIP_COUNT,
	CLIP_DURATION,
	type CaseFile,
	type ClipInfo,
	generateCase,
	MARKER_TOLERANCE,
} from "./case";
import { ClipPlayer } from "./player";

const WIDTH = 1218;
const HEIGHT = 640;
const CARD_W = 386;
const CARD_H = 200;
const GAP = 14;
const MARGIN = 16;
const GRID_Y = 56;
// waveform area inside a card (relative coordinates)
const WX = 10;
const WY = 34;
const WW = CARD_W - 20;
const WH = 96;
// sound-pressure strip inside a card
const RY = WY + WH + 6;
const RH = 26;
const TIMELINE_Y = 496;
const TIMELINE_H = 64;

const CLICK_SLOP = 8; // px of movement that still counts as a click, not a drag

type MarkerKind = "footsteps" | "doorClose";

interface Marker {
	clip: ClipInfo;
	time: number; // seconds into the clip
}

const slotPos = (slot: number) => ({
	x: MARGIN + (slot % 3) * (CARD_W + GAP),
	y: GRID_Y + Math.floor(slot / 3) * (CARD_H + GAP),
});

/** what the cards and buttons ask the screen about, and tell it */
interface Controller {
	locked(): boolean;
	cardClicked(card: ClipCard, localX: number, localY: number): void;
	cardDropped(card: ClipCard): void;
	player: ClipPlayer;
	markers: Record<MarkerKind, Marker | null>;
}

const snapTo = (card: Draggable, x: number, y: number) => {
	new Tween(card.pos).to({ x, y }, 120).easing(Tween.Easing.Quadratic.Out).start();
};

/**
 * One recording: a draggable card drawing its waveform, sound-pressure
 * strip, playhead and any markers. Drag onto another card to swap places;
 * click the waveform to play from that point (or to drop a marker when a
 * marker tool is armed); click the header to play/stop.
 */
class ClipCard extends Draggable {
	clip: ClipInfo;
	slot: number;
	private ctrl: Controller;
	private downX = 0;
	private downY = 0;
	private labelText: Text;
	private hintText: Text;
	private posText: Text;

	constructor(slot: number, clip: ClipInfo, ctrl: Controller) {
		const p = slotPos(slot);
		super(p.x, p.y, CARD_W, CARD_H);
		this.slot = slot;
		this.clip = clip;
		this.ctrl = ctrl;
		this.labelText = new Text(0, 0, { font: "sans-serif", size: 15, fillStyle: "#e8eef7" });
		this.labelText.bold();
		this.hintText = new Text(0, 0, { font: "sans-serif", size: 11, fillStyle: "#7c8aa5" });
		this.posText = new Text(0, 0, {
			font: "monospace",
			size: 11,
			fillStyle: "#4fc3f7",
			textAlign: "right",
		});
	}

	dragStart(e: { gameX: number; gameY: number }) {
		if (this.ctrl.locked()) {
			return;
		}
		super.dragStart(e);
		this.downX = e.gameX;
		this.downY = e.gameY;
	}

	dragMove(e: Parameters<Draggable["dragMove"]>[0]) {
		if (this.dragging) {
			super.dragMove(e);
		}
	}

	dragEnd(e: { gameX: number; gameY: number }) {
		if (!this.dragging) {
			return;
		}
		super.dragEnd(e);
		const moved = Math.hypot(e.gameX - this.downX, e.gameY - this.downY);
		if (moved < CLICK_SLOP) {
			this.ctrl.cardClicked(this, e.gameX - this.pos.x, e.gameY - this.pos.y);
		} else {
			this.ctrl.cardDropped(this);
		}
	}

	private drawWaveform(renderer: CanvasRenderer | WebGLRenderer) {
		const px = this.pos.x;
		const py = this.pos.y;
		const bw = WW / BUCKETS;
		// waveform, mirrored around its middle line
		const mid = py + WY + WH / 2;
		const playingThis = this.ctrl.player.clip === this.clip;
		const playPos = playingThis ? this.ctrl.player.position() : -1;
		for (let b = 0; b < BUCKETS; b++) {
			const h = Math.min(1, this.clip.peaks[b] / 0.55) * (WH / 2);
			const t = (b / BUCKETS) * CLIP_DURATION;
			renderer.setColor(playPos >= t ? "#7fd4ff" : "#3f6f96");
			renderer.fillRect(px + WX + b * bw, mid - h, Math.max(1, bw - 0.6), h * 2 || 1);
		}
		// sound pressure strip
		for (let b = 0; b < BUCKETS; b++) {
			const h = Math.min(1, this.clip.rms[b] / 0.18) * RH;
			renderer.setColor("#b27a2f");
			renderer.fillRect(px + WX + b * bw, py + RY + RH - h, Math.max(1, bw - 0.6), h);
		}
		renderer.setColor("#5a4a2a");
		renderer.fillRect(px + WX, py + RY + RH, WW, 1);
		// playhead
		if (playPos >= 0) {
			const x = px + WX + (playPos / CLIP_DURATION) * WW;
			renderer.setColor("#ff5252");
			renderer.fillRect(x, py + WY - 4, 2, WH + 8);
		}
		// markers sitting on this clip
		const drawMarker = (marker: Marker | null, color: string) => {
			if (marker === null || marker.clip !== this.clip) {
				return;
			}
			const x = px + WX + (marker.time / CLIP_DURATION) * WW;
			renderer.setColor(color);
			renderer.fillRect(x - 1, py + WY - 8, 2, WH + 16);
			renderer.fillRect(x - 4, py + WY - 8, 8, 4);
		};
		drawMarker(this.ctrl.markers.footsteps, "#69f0ae");
		drawMarker(this.ctrl.markers.doorClose, "#ff8a80");
	}

	draw(renderer: CanvasRenderer | WebGLRenderer) {
		const px = this.pos.x;
		const py = this.pos.y;
		const playingThis = this.ctrl.player.clip === this.clip && this.ctrl.player.playing;
		renderer.setColor(this.dragging ? "#2a3448" : "#1c2230");
		renderer.fillRect(px, py, CARD_W, CARD_H);
		renderer.setColor(playingThis ? "#4fc3f7" : "#3a4a63");
		renderer.strokeRect(px + 0.5, py + 0.5, CARD_W - 1, CARD_H - 1);

		this.labelText.pos.set(px + 12, py + 9);
		this.labelText.setText(`录音 ${this.clip.label}${playingThis ? "  ▶" : ""}`);
		this.labelText.draw(renderer);
		this.hintText.pos.set(px + 12, py + CARD_H - 22);
		this.hintText.setText("点标题播放 · 点波形试听/标记 · 拖动换位");
		this.hintText.draw(renderer);
		if (this.ctrl.player.clip === this.clip) {
			this.posText.pos.set(px + CARD_W - 12, py + 11);
			this.posText.setText(`${this.ctrl.player.position().toFixed(1)}s`);
			this.posText.draw(renderer);
		}
		this.drawWaveform(renderer);
	}
}

/**
 * The reconstructed timeline: one box per slot in the CURRENT arrangement,
 * with the player's markers projected onto it. The true order is never
 * shown here until the case is closed — only labels, waveforms and sound
 * pressure are evidence. After solving, the real event line is drawn.
 */
class TimelineStrip extends Renderable {
	private ctrl: TimelineSource;
	private labelText: Text;
	private eventText: Text;

	constructor(ctrl: TimelineSource) {
		super(MARGIN, TIMELINE_Y, WIDTH - 2 * MARGIN, TIMELINE_H);
		this.ctrl = ctrl;
		this.labelText = new Text(0, 0, {
			font: "sans-serif",
			size: 13,
			fillStyle: "#e8eef7",
			textAlign: "center",
		});
		this.eventText = new Text(0, 0, {
			font: "sans-serif",
			size: 11,
			fillStyle: "#9fb4d0",
			textAlign: "center",
		});
	}

	draw(renderer: CanvasRenderer | WebGLRenderer) {
		const slotW = this.width / CLIP_COUNT;
		const px = this.pos.x;
		const py = this.pos.y;
		renderer.setColor("#141a26");
		renderer.fillRect(px, py, this.width, this.height);
		for (let s = 0; s < CLIP_COUNT; s++) {
			const x = px + s * slotW;
			renderer.setColor("#2c3a52");
			renderer.strokeRect(x + 0.5, py + 0.5, slotW - 1, this.height - 1);
			this.labelText.pos.set(x + slotW / 2, py + 6);
			this.labelText.setText(`录音 ${this.ctrl.slotLabel(s)}`);
			this.labelText.draw(renderer);
		}
		// player markers projected onto the current arrangement
		const project = (marker: Marker | null, color: string, tag: string) => {
			if (marker === null) {
				return;
			}
			const slot = this.ctrl.slotOf(marker.clip);
			const gx = px + (slot + marker.time / CLIP_DURATION) * slotW;
			renderer.setColor(color);
			renderer.fillRect(gx - 1, py + 22, 2, this.height - 26);
			this.eventText.pos.set(gx, py + this.height - 16);
			this.eventText.setText(tag);
			this.eventText.draw(renderer);
		};
		project(this.ctrl.markers.footsteps, "#69f0ae", "脚步");
		project(this.ctrl.markers.doorClose, "#ff8a80", "关门");
		// the real event line, revealed only once the case is closed
		if (this.ctrl.solved) {
			for (const ev of this.ctrl.trueEvents()) {
				const gx = px + (ev.clipIndex + ev.time / CLIP_DURATION) * slotW;
				renderer.setColor("#ffd54f");
				renderer.fillRect(gx - 1, py + 22, 2, this.height - 40);
				this.eventText.pos.set(gx, py + 24);
				this.eventText.setText(ev.label);
				this.eventText.draw(renderer);
			}
		}
	}
}

interface TrueEvent {
	clipIndex: number;
	time: number;
	label: string;
}

/** what the timeline strip reads from the screen */
interface TimelineSource {
	markers: Record<MarkerKind, Marker | null>;
	solved: boolean;
	slotLabel(slot: number): string;
	slotOf(clip: ClipInfo): number;
	trueEvents(): TrueEvent[];
}

/** scrolling feedback / verdict lines under the timeline */
class FeedbackPanel extends Renderable {
	lines: { text: string; color: string }[] = [];
	private text: Text;

	constructor() {
		super(MARGIN, TIMELINE_Y + TIMELINE_H + 8, WIDTH - 2 * MARGIN, HEIGHT - (TIMELINE_Y + TIMELINE_H + 16));
		this.text = new Text(0, 0, { font: "sans-serif", size: 13, fillStyle: "#c6d2e3" });
	}

	set(lines: { text: string; color?: string }[]): void {
		this.lines = lines.map((l) => ({ text: l.text, color: l.color ?? "#c6d2e3" }));
	}

	draw(renderer: CanvasRenderer | WebGLRenderer) {
		this.lines.forEach((line, i) => {
			this.text.pos.set(this.pos.x, this.pos.y + i * 18);
			this.text.fillStyle.parseCSS(line.color);
			this.text.setText(line.text);
			this.text.draw(renderer);
		});
	}
}

/** dim overlay with a hint, visible while the stage is paused */
class PauseOverlay extends Renderable {
	private text: Text;

	constructor() {
		super(0, 0, WIDTH, HEIGHT);
		this.text = new Text(0, 0, {
			font: "sans-serif",
			size: 34,
			fillStyle: "#e8eef7",
			textAlign: "center",
			textBaseline: "middle",
		});
		this.text.bold();
	}

	draw(renderer: CanvasRenderer | WebGLRenderer) {
		if (!state.isPaused()) {
			return;
		}
		renderer.setColor("rgba(8, 10, 16, 0.72)");
		renderer.fillRect(this.pos.x, this.pos.y, this.width, this.height);
		this.text.pos.set(this.pos.x + this.width / 2, this.pos.y + this.height / 2);
		this.text.setText("已暂停 — 点击「继续」恢复");
		this.text.draw(renderer);
	}
}

const TOOL_NAME: Record<MarkerKind, string> = { footsteps: "脚步", doorClose: "关门" };

class PlayScreen extends Stage implements Controller, TimelineSource {
	player = new ClipPlayer();
	markers: Record<MarkerKind, Marker | null> = { footsteps: null, doorClose: null };
	solved = false;

	private caseFile: CaseFile;
	private slots: ClipCard[] = [];
	private feedback = new FeedbackPanel();
	private activeTool: MarkerKind | null = null;
	private pauseButton: UITextButton | null = null;
	private submitButton: UITextButton | null = null;
	private toolButtons: Record<MarkerKind, UITextButton | null> = { footsteps: null, doorClose: null };

	constructor(caseFile: CaseFile) {
		super();
		this.caseFile = caseFile;
	}

	locked(): boolean {
		return this.solved || state.isPaused();
	}

	slotLabel(slot: number): string {
		return this.slots[slot].clip.label;
	}

	slotOf(clip: ClipInfo): number {
		return this.slots.findIndex((card) => card.clip === clip);
	}

	trueEvents(): TrueEvent[] {
		return this.caseFile.events;
	}

	cardClicked(card: ClipCard, localX: number, localY: number): void {
		if (this.locked()) {
			return;
		}
		if (localX >= WX && localX <= WX + WW && localY >= WY && localY <= WY + WH) {
			const t = ((localX - WX) / WW) * CLIP_DURATION;
			if (this.activeTool !== null) {
				this.markers[this.activeTool] = { clip: card.clip, time: t };
				this.say(`已在录音 ${card.clip.label} 的 ${t.toFixed(2)}s 放置「${TOOL_NAME[this.activeTool]}」标记`);
			} else {
				this.player.play(card.clip, t);
			}
		} else if (localY < 28) {
			if (this.player.clip === card.clip && this.player.playing) {
				this.player.pause();
			} else if (this.player.clip === card.clip) {
				this.player.resume();
			} else {
				this.player.play(card.clip, 0);
			}
		}
	}

	cardDropped(card: ClipCard): void {
		const cx = card.pos.x + CARD_W / 2;
		const cy = card.pos.y + CARD_H / 2;
		let best = card.slot;
		let bestDist = Number.POSITIVE_INFINITY;
		for (let s = 0; s < CLIP_COUNT; s++) {
			const p = slotPos(s);
			const d = Math.hypot(cx - (p.x + CARD_W / 2), cy - (p.y + CARD_H / 2));
			if (d < bestDist) {
				bestDist = d;
				best = s;
			}
		}
		const from = card.slot;
		const other = this.slots[best];
		this.slots[from] = other;
		this.slots[best] = card;
		other.slot = from;
		card.slot = best;
		snapTo(card, slotPos(best).x, slotPos(best).y);
		if (other !== card) {
			snapTo(other, slotPos(from).x, slotPos(from).y);
		}
	}

	private say(text: string, color?: string): void {
		this.feedback.set([{ text, color }]);
	}

	private togglePause(): void {
		if (state.isPaused()) {
			state.resume();
			this.player.resume();
			this.pauseButton?.label.setText("暂停");
		} else {
			state.pause();
			this.player.pause();
			this.pauseButton?.label.setText("继续");
		}
	}

	private armTool(kind: MarkerKind): void {
		this.activeTool = this.activeTool === kind ? null : kind;
		for (const k of ["footsteps", "doorClose"] as const) {
			this.toolButtons[k]?.label.setText(`${this.activeTool === k ? "● " : ""}标记${TOOL_NAME[k]}`);
		}
		this.say(
			this.activeTool === null
				? "已收起标记工具，点波形试听"
				: `标记工具：${TOOL_NAME[this.activeTool]} — 点击某段录音的波形放置时间点`,
		);
	}

	private submit(): void {
		if (this.solved) {
			return;
		}
		const problems: string[] = [];
		if (!this.slots.every((card, s) => card.clip.trueIndex === s)) {
			problems.push("录音顺序还不对");
		}
		for (const kind of ["footsteps", "doorClose"] as const) {
			const marker = this.markers[kind];
			const answer = this.caseFile.answer[kind];
			if (marker === null) {
				problems.push(`还缺少「${TOOL_NAME[kind]}」时间点标记`);
			} else {
				const global = this.slotOf(marker.clip) * CLIP_DURATION + marker.time;
				const want = answer.clipIndex * CLIP_DURATION + answer.time;
				if (Math.abs(global - want) > MARKER_TOLERANCE) {
					problems.push(`「${TOOL_NAME[kind]}」时间点位置不对`);
				}
			}
		}
		if (problems.length > 0) {
			this.feedback.set([
				{ text: "还不能结案：", color: "#ff8a80" },
				...problems.map((p) => ({ text: `· ${p}`, color: "#ff8a80" })),
			]);
			return;
		}
		this.closeCase();
	}

	private closeCase(): void {
		this.solved = true;
		this.activeTool = null;
		// lay the recordings out in their true order
		for (let s = 0; s < CLIP_COUNT; s++) {
			const card = this.slots.find((c) => c.clip.trueIndex === s);
			if (card === undefined) {
				continue;
			}
			this.slots[s] = card;
			card.slot = s;
			snapTo(card, slotPos(s).x, slotPos(s).y);
		}
		if (this.submitButton) {
			this.submitButton.enabled = false;
		}
		const runClip = this.caseFile.clips[this.caseFile.answer.footsteps.clipIndex].label;
		const doorClip = this.caseFile.clips[this.caseFile.answer.doorClose.clipIndex].label;
		this.feedback.set([
			{ text: "结案！六段录音已按真实顺序排列，完整事件线见下方时间轴。", color: "#69f0ae" },
			{
				text: `声音证据：广播钟声 1→6 声递增 · 列车轰鸣先升后降 · 录音 ${runClip} 的脚步是奔跑节奏 · 录音 ${doorClip} 的关门前有三声警示音`,
				color: "#9fb4d0",
			},
		]);
	}

	override onResetEvent(app: Application) {
		app.world.backgroundColor.parseCSS("#0e1320");

		const title = new Text(16, 20, { font: "sans-serif", size: 18, fillStyle: "#e8eef7" });
		title.bold();
		title.setText("站台录音 · 声音推理");
		app.world.addChild(title, 20);
		const seedText = new Text(250, 23, { font: "monospace", size: 12, fillStyle: "#7c8aa5" });
		seedText.setText(`seed: ${this.caseFile.seed}`);
		app.world.addChild(seedText, 20);

		const makeButton = (x: number, text: string, onClick: () => void) =>
			new UITextButton(x, 13, {
				font: "sans-serif",
				fontSize: 13,
				text,
				width: 112,
				height: 30,
				hoverOffColor: "#22304a",
				hoverOnColor: "#31456a",
				pressedColor: "#1a2438",
				borderColor: "#46586f",
				labelFillStyle: "#dbe6f5",
				onClick,
			});

		this.toolButtons.footsteps = makeButton(470, "标记脚步", () => this.armTool("footsteps"));
		this.toolButtons.doorClose = makeButton(592, "标记关门", () => this.armTool("doorClose"));
		const clearButton = makeButton(714, "清除标记", () => {
			this.markers.footsteps = null;
			this.markers.doorClose = null;
			this.say("已清除全部标记");
		});
		this.pauseButton = makeButton(836, "暂停", () => this.togglePause());
		const reseedButton = makeButton(958, "换一组", () => {
			const seed = (Math.random() * 0x7fffffff) | 0;
			globalThis.location.hash = `#/station-tapes?seed=${seed}`;
			globalThis.location.reload();
		});
		this.submitButton = makeButton(1080, "提交结案", () => this.submit());
		for (const b of [
			this.toolButtons.footsteps,
			this.toolButtons.doorClose,
			clearButton,
			this.pauseButton,
			reseedButton,
			this.submitButton,
		]) {
			app.world.addChild(b, 20);
		}

		for (let s = 0; s < CLIP_COUNT; s++) {
			const clip = this.caseFile.clips[this.caseFile.presentation[s]];
			const card = new ClipCard(s, clip, this);
			this.slots[s] = card;
			app.world.addChild(card, 10);
		}

		app.world.addChild(new TimelineStrip(this), 5);
		app.world.addChild(this.feedback, 5);
		app.world.addChild(new PauseOverlay(), 100);

		this.feedback.set([
			{ text: "六段站台录音已被打乱。听广播、脚步、关门声与环境音，还原事故发生的先后顺序。" },
			{ text: "拖动录音换位；用「标记」工具把脚步与关门两个关键时间点标到时间轴上，然后「提交结案」。" },
		]);

		// handle for the automated checks (and the curious console)
		const rectOf = (b: UITextButton | null) =>
			b === null ? null : { x: b.pos.x, y: b.pos.y, w: b.width, h: b.height };
		(globalThis as Record<string, unknown>).__STATION_TAPES__ = {
			seed: this.caseFile.seed,
			answer: this.caseFile.answer,
			presentation: [...this.caseFile.presentation],
			checksums: this.caseFile.clips.map((c) => c.checksum),
			events: this.caseFile.events,
			getOrder: () => this.slots.map((c) => c.clip.trueIndex),
			getMarkers: () => ({
				footsteps:
					this.markers.footsteps === null
						? null
						: { trueIndex: this.markers.footsteps.clip.trueIndex, time: this.markers.footsteps.time },
				doorClose:
					this.markers.doorClose === null
						? null
						: { trueIndex: this.markers.doorClose.clip.trueIndex, time: this.markers.doorClose.time },
			}),
			isSolved: () => this.solved,
			getFeedback: () => this.feedback.lines.map((l) => l.text),
			playerPosition: () => this.player.position(),
			playerPlaying: () => this.player.playing,
			isPaused: () => state.isPaused(),
			layout: () => ({
				cards: this.slots.map((c) => ({
					slot: c.slot,
					trueIndex: c.clip.trueIndex,
					label: c.clip.label,
					x: c.pos.x,
					y: c.pos.y,
					w: CARD_W,
					h: CARD_H,
				})),
				waveform: { x: WX, y: WY, w: WW, h: WH },
				buttons: {
					footsteps: rectOf(this.toolButtons.footsteps),
					doorClose: rectOf(this.toolButtons.doorClose),
					clear: rectOf(clearButton),
					pause: rectOf(this.pauseButton),
					submit: rectOf(this.submitButton),
				},
			}),
		};
	}

	override onDestroyEvent() {
		this.player.stop();
		delete (globalThis as Record<string, unknown>).__STATION_TAPES__;
	}
}

const parseSeed = (): number => {
	const match = /[?&]seed=(\d+)/.exec(globalThis.location.hash);
	if (match !== null) {
		return Number(match[1]);
	}
	return (Math.random() * 0x7fffffff) | 0;
};

export const ExampleStationTapes = createExampleComponent(async () => {
	const caseFile = await generateCase(parseSeed());
	const app = new Application(WIDTH, HEIGHT, {
		parent: "screen",
		scale: "auto",
		backgroundColor: "#0e1320",
	});
	await app.init();
	state.set(state.PLAY, new PlayScreen(caseFile));
	state.change(state.PLAY);
});
