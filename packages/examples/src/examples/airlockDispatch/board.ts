/**
 * melonJS — Airlock Dispatch example: canvas board and interaction.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	type Application,
	Container,
	event,
	input,
	type Pointer,
	type Renderer,
	state,
	Text,
} from "melonjs";
import {
	playClick,
	playDoorOpen,
	playError,
	playFailure,
	playMotor,
	playPressureReady,
	playPriorityAlarm,
	playVictory,
} from "./audio";
import {
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	CARGO_STYLE,
	DECK_COUNT,
	DispatchModel,
	ELEVATOR_COUNT,
	OPENING_TIME,
	PRESSURE_SAFE,
	ROUTE_SLOTS,
} from "./model";

const HEADER_H = 86;
const BASE = { x: 20, y: 92, w: 900, h: 616 };
const BAY = { x: 52, w: 444 };
const DOOR = { x: 510, w: 92 };
const SHAFT_X = [620, 716, 812];
const SHAFT_W = 84;
const SIDEBAR = { x: 940, y: 92, w: 320, h: 698 };
const ROW_H = 116;

const COLORS = {
	bg: "#050a10",
	panel: "#0a1420",
	panelLight: "#0f1d2b",
	line: "#1b3346",
	text: "#d9eef8",
	muted: "#7892a5",
	cyan: "#58e2ff",
	green: "#65e3a4",
	amber: "#ffbf5b",
	red: "#ff5f71",
	elevator: ["#59d5ff", "#ffbd66", "#b990ff"],
};

const FONT = "Courier New";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Vertical position of a deck's row.
 * @param deck - deck number 1..5
 * @returns the top edge in board coordinates
 */
function deckTop(deck: number): number {
	return 108 + (DECK_COUNT - deck) * ROW_H;
}

/**
 * Center of a deck row, or of a fractional lift position.
 * @param deck - deck number, may be fractional while a lift moves
 * @returns the vertical center in board coordinates
 */
function deckCenter(deck: number): number {
	const lowest = deckTop(1) + ROW_H / 2;
	return lowest - (deck - 1) * ROW_H;
}

/**
 * Screen region occupied by one pending-cargo card.
 * @param index - cargo definition index 0..7
 * @returns the card rectangle
 */
function cardRect(index: number): Rect {
	const column = index % 2;
	const row = Math.floor(index / 2);
	return {
		x: 952 + column * 154,
		y: 144 + row * 72,
		w: 146,
		h: 62,
	};
}

/**
 * Screen region occupied by one lift route slot.
 * @param elevatorIndex - lift index 0..2
 * @param slotIndex - route position 0..2
 * @returns the slot rectangle
 */
function routeRect(elevatorIndex: number, slotIndex: number): Rect {
	return {
		x: 1002 + slotIndex * 80,
		y: 492 + elevatorIndex * 82,
		w: 74,
		h: 58,
	};
}

/**
 * Open-button region for a deck.
 * @param deck - deck number 1..5
 * @returns the button rectangle
 */
function doorButtonRect(deck: number): Rect {
	const top = deckTop(deck);
	return { x: DOOR.x + 4, y: top + 69, w: DOOR.w - 8, h: 28 };
}

const MODE_BUTTON: Rect = { x: 1088, y: 17, w: 168, h: 50 };
const RETRY_BUTTON: Rect = {
	x: CANVAS_WIDTH / 2 - 96,
	y: 476,
	w: 192,
	h: 50,
};

/**
 * A drawable, clickable dispatch board.
 */
export class DispatchBoard extends Container {
	readonly model = new DispatchModel();
	private readonly app: Application;
	private selectedTaskId: string | null = null;
	private hover = { x: -1, y: -1 };
	private uiClock = 0;
	private pulseClock = 0;
	private motorClock = 0;
	private alarmClock = 0;

	private readonly powerLabel: Text;
	private readonly timeLabel: Text;
	private readonly cargoLabel: Text;
	private readonly pendingCountLabel: Text;
	private readonly modeLabel: Text;
	private readonly priorityLabel: Text;
	private readonly editBadgeLabel: Text;
	private readonly messageLabel: Text;
	private readonly deckLabels: Text[] = [];
	private readonly deckStateLabels: Text[] = [];
	private readonly openLabels: Text[] = [];
	private readonly bayTaskLabels: Text[] = [];
	private readonly cardLabels: Text[] = [];
	private readonly slotLabels: Text[] = [];
	private readonly liftLabels: Text[] = [];
	private readonly routeStateLabels: Text[] = [];
	private readonly overlay: DispatchOverlay;

	constructor(app: Application) {
		super(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		this.app = app;
		this.name = "dispatch-board";
		this.anchorPoint.set(0, 0);
		this.floating = false;
		this.isKinematic = false;
		this.alwaysUpdate = true;

		this.powerLabel = this.addLabel(500, 20, "", 12, COLORS.cyan, "left", true);
		this.timeLabel = this.addLabel(500, 44, "", 12, COLORS.muted);
		this.cargoLabel = this.addLabel(700, 20, "", 12, COLORS.text, "left", true);
		this.priorityLabel = this.addLabel(700, 44, "", 11, COLORS.amber);
		this.modeLabel = this.addLabel(
			MODE_BUTTON.x + MODE_BUTTON.w / 2,
			MODE_BUTTON.y + 14,
			"",
			13,
			COLORS.text,
			"center",
			true,
		);
		this.editBadgeLabel = this.addLabel(
			SIDEBAR.x + SIDEBAR.w / 2,
			426,
			"",
			11,
			COLORS.amber,
			"center",
			true,
		);
		this.messageLabel = this.addLabel(
			954,
			754,
			"",
			11,
			COLORS.muted,
			"left",
			false,
		);
		this.messageLabel.wordWrapWidth = 290;
		this.messageLabel.lineHeight = 1.2;

		this.addLabel(24, 12, "AIRLOCK DISPATCH", 26, COLORS.text, "left", true);
		this.addLabel(
			24,
			49,
			"DECK 7 · 3 LIFTS · 5 BAYS · 8 PRIORITY PODS",
			10,
			COLORS.cyan,
		);
		this.addLabel(952, 108, "PENDING CARGO", 13, COLORS.text, "left", true);
		this.pendingCountLabel = this.addLabel(
			1244,
			110,
			"8 / 8",
			11,
			COLORS.muted,
			"right",
		);
		this.addLabel(952, 452, "LIFT ROUTES", 13, COLORS.text, "left", true);
		this.addLabel(1244, 455, "SLOT 1 → 2 → 3", 9, COLORS.muted, "right");
		this.addLabel(36, 724, "PLAN", 10, COLORS.cyan, "left", true);
		this.addLabel(
			76,
			724,
			"select a pod, then a lift slot to set its stop and order.",
			10,
			COLORS.muted,
		);
		this.addLabel(36, 746, "RUN", 10, COLORS.amber, "left", true);
		this.addLabel(
			76,
			746,
			"open at 100% pressure · SPACE pause/reassign · R retry when down.",
			10,
			COLORS.muted,
		);

		for (let deck = DECK_COUNT; deck >= 1; deck--) {
			const top = deckTop(deck);
			this.deckLabels[deck - 1] = this.addLabel(
				64,
				top + 7,
				`DECK ${String(deck).padStart(2, "0")}`,
				12,
				COLORS.text,
				"left",
				true,
			);
			this.deckStateLabels[deck - 1] = this.addLabel(
				386,
				top + 23,
				"",
				9,
				COLORS.muted,
			);
			this.openLabels[deck - 1] = this.addLabel(
				DOOR.x + DOOR.w / 2,
				top + 77,
				"OPEN",
				10,
				COLORS.text,
				"center",
				true,
			);
		}

		for (let index = 0; index < this.model.cargo.length; index++) {
			const rect = cardRect(index);
			this.cardLabels.push(
				this.addLabel(
					rect.x + 10,
					rect.y + 8,
					"",
					11,
					COLORS.text,
					"left",
					false,
				),
			);
			this.cardLabels[index].lineHeight = 1.25;
		}

		for (
			let elevatorIndex = 0;
			elevatorIndex < ELEVATOR_COUNT;
			elevatorIndex++
		) {
			this.liftLabels.push(
				this.addLabel(0, 0, "", 18, COLORS.text, "center", true),
			);
			this.routeStateLabels.push(
				this.addLabel(
					952,
					502 + elevatorIndex * 82,
					"",
					9,
					COLORS.muted,
					"left",
					true,
				),
			);
			for (let slotIndex = 0; slotIndex < ROUTE_SLOTS; slotIndex++) {
				this.slotLabels.push(
					this.addLabel(0, 0, "", 11, COLORS.text, "center", true),
				);
			}
		}

		for (const task of this.model.cargo) {
			this.bayTaskLabels.push(
				this.addLabel(
					0,
					0,
					task.code,
					9,
					CARGO_STYLE[task.kind].color,
					"left",
					true,
				),
			);
		}

		this.overlay = new DispatchOverlay();
		this.overlay.visible = false;
		this.addChild(this.overlay);

		this.setMessage("Pick a cargo pod, then its lift and order slot.", "info");
		this.syncLabels();
	}

	/**
	 * Create and add a text label.
	 * @param x - board-relative x
	 * @param y - board-relative y
	 * @param text - initial text
	 * @param size - font size
	 * @param color - fill colour
	 * @param align - horizontal alignment
	 * @param bold - whether to use the bold face
	 * @returns the label
	 */
	private addLabel(
		x: number,
		y: number,
		text: string,
		size: number,
		color: string,
		align: "left" | "center" | "right" = "left",
		bold = false,
	): Text {
		const label = new Text(x, y, {
			font: FONT,
			size,
			fillStyle: color,
			textAlign: align,
			textBaseline: "top",
			bold,
			text,
		});
		this.addChild(label);
		return label;
	}

	override onActivateEvent(): void {
		input.registerPointerEvent(
			"pointerdown",
			this,
			this.onPointerDown.bind(this),
		);
		input.registerPointerEvent(
			"pointermove",
			this,
			this.onPointerMove.bind(this),
		);
		event.on(event.KEYDOWN, this.onKeyDown);
	}

	override onDeactivateEvent(): void {
		input.releasePointerEvent("pointerdown", this);
		input.releasePointerEvent("pointermove", this);
		event.off(event.KEYDOWN, this.onKeyDown);
	}

	/**
	 * Route keyboard shortcuts through the same actions as the on-screen
	 * buttons.
	 * @param action - the bound action name
	 * @param _keyCode - the browser key code
	 * @param isPressed - false for a held-key repeat
	 */
	private onKeyDown = (
		action: string | undefined,
		_keyCode: number,
		isPressed = true,
	): void => {
		if (!isPressed) return;
		if (action === "dispatchPause") this.togglePause();
		if (action === "dispatchLaunch") {
			if (this.model.phase === "planning") this.tryLaunch();
			else this.togglePause();
		}
		if (action === "dispatchRestart" && !this.model.editable) {
			if (this.model.phase === "failed" || this.model.phase === "won") {
				this.restart();
			}
		}
	};

	/**
	 * Set the contextual footer / sidebar message.
	 * @param text - what to show
	 * @param tone - colour family
	 */
	private setMessage(text: string, tone: "info" | "good" | "bad"): void {
		this.messageLabel.setText(text);
		const color =
			tone === "bad"
				? COLORS.red
				: tone === "good"
					? COLORS.green
					: COLORS.muted;
		this.messageLabel.fillStyle.parseCSS(color);
	}

	/**
	 * Format mission seconds as a compact clock.
	 * @param seconds - elapsed seconds
	 * @returns `MM:SS`
	 */
	private formatClock(seconds: number): string {
		const whole = Math.max(0, Math.floor(seconds));
		const minutes = Math.floor(whole / 60);
		const rest = whole % 60;
		return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
	}

	override update(dt: number): boolean {
		this.uiClock += dt;
		this.pulseClock += dt / 1000;
		if (this.model.phase === "running" && !state.isPaused()) {
			this.model.tick(dt / 1000);
			this.handleEvents();
			this.updateSound(dt / 1000);
		}
		if (this.uiClock >= 100) {
			this.uiClock = 0;
			this.syncLabels();
		}
		super.update(dt);
		return true;
	}

	/**
	 * React to model events produced by a simulation step.
	 */
	private handleEvents(): void {
		for (const item of this.model.drainEvents()) {
			if (item.type === "open") playDoorOpen();
			if (item.type === "safe") playPressureReady(item.deck);
			if (item.type === "fail") {
				playFailure();
				this.app.viewport.shake(8, 460, undefined, undefined, true);
				this.setMessage(
					this.model.failure?.message ?? "DISPATCH FAILED",
					"bad",
				);
			}
			if (item.type === "win") {
				playVictory();
				this.setMessage("ALL EIGHT PODS DELIVERED.", "good");
			}
		}
	}

	/**
	 * Loop the motor bed and priority alarm while dispatch is live.
	 * @param seconds - elapsed seconds
	 */
	private updateSound(seconds: number): void {
		const moving = this.model.elevators.filter((elevator) => {
			return elevator.mode === "moving";
		});
		this.motorClock -= seconds;
		if (moving.length > 0 && this.motorClock <= 0) {
			for (const elevator of moving) playMotor(elevator.id);
			this.motorClock = 0.3;
		}

		const urgent = this.model.getUrgentCargo();
		this.alarmClock -= seconds;
		if (urgent && urgent.remaining <= 10 && this.alarmClock <= 0) {
			playPriorityAlarm();
			this.alarmClock = 0.9;
		}
	}

	/**
	 * Handle a click from the single board-level pointer region.
	 * @param pointer - the pointer carrying canvas-relative coordinates
	 * @returns false to consume the event
	 */
	private onPointerDown(pointer: Pointer): false {
		const x = pointer.gameScreenX;
		const y = pointer.gameScreenY;
		this.hover.x = x;
		this.hover.y = y;

		if (this.model.phase === "failed" || this.model.phase === "won") {
			if (this.hit(RETRY_BUTTON, x, y)) {
				this.restart();
				return false;
			}
			if (this.hit(MODE_BUTTON, x, y)) this.restart();
			return false;
		}

		if (this.hit(MODE_BUTTON, x, y)) {
			if (this.model.phase === "planning") this.tryLaunch();
			else this.togglePause();
			return false;
		}

		for (let index = 0; index < this.model.cargo.length; index++) {
			const task = this.model.cargo[index];
			const rect = cardRect(index);
			if (task.status !== "pending" || !this.hit(rect, x, y)) continue;
			if (!this.model.editable) {
				playError();
				this.setMessage("PAUSE THE DISPATCH TO REASSIGN CARGO.", "bad");
				return false;
			}
			this.selectedTaskId = this.selectedTaskId === task.id ? null : task.id;
			playClick();
			this.setMessage(
				this.selectedTaskId
					? `${task.code} SELECTED · CHOOSE A ROUTE SLOT.`
					: "SELECTION CLEARED.",
				"info",
			);
			this.syncLabels();
			return false;
		}

		for (
			let elevatorIndex = 0;
			elevatorIndex < ELEVATOR_COUNT;
			elevatorIndex++
		) {
			for (let slotIndex = 0; slotIndex < ROUTE_SLOTS; slotIndex++) {
				const rect = routeRect(elevatorIndex, slotIndex);
				if (!this.hit(rect, x, y)) continue;
				if (!this.model.editable) {
					playError();
					this.setMessage("PAUSE THE DISPATCH TO REASSIGN ROUTES.", "bad");
					return false;
				}
				this.activateRouteSlot(elevatorIndex, slotIndex);
				return false;
			}
		}

		for (let deck = 1; deck <= DECK_COUNT; deck++) {
			const rect = doorButtonRect(deck);
			if (!this.hit(rect, x, y)) continue;
			const result = this.model.tryOpenDoor(deck);
			if (result.ok) {
				this.setMessage(`DECK ${deck} DOOR OPEN · PRESSURE CYCLING.`, "good");
			} else if (result.failed) {
				this.setMessage(result.reason ?? "DECOMPRESSION.", "bad");
			} else {
				playError();
				this.setMessage(result.reason ?? "DOOR NOT READY.", "bad");
			}
			this.handleEvents();
			this.syncLabels();
			return false;
		}
		return false;
	}

	/**
	 * Track hover for outlines and affordances.
	 * @param pointer - the moving pointer
	 * @returns false to consume the move
	 */
	private onPointerMove(pointer: Pointer): false {
		this.hover.x = pointer.gameScreenX;
		this.hover.y = pointer.gameScreenY;
		return false;
	}

	/**
	 * Apply a click on an editable route slot: take a pod out, or put the
	 * selected pod in.
	 * @param elevatorIndex - lift index
	 * @param slotIndex - route order
	 */
	private activateRouteSlot(elevatorIndex: number, slotIndex: number): void {
		const existing = this.model.getRouteTask(elevatorIndex, slotIndex);
		if (existing) {
			if (existing.status === "complete") {
				playError();
				this.setMessage("DELIVERED CARGO IS LOCKED TO THIS SLOT.", "bad");
				return;
			}
			const returned = this.model.unassign(elevatorIndex, slotIndex);
			if (returned) {
				this.selectedTaskId = returned.id;
				playClick();
				this.setMessage(
					`${returned.code} RETURNED TO PENDING · CHOOSE A NEW SLOT.`,
					"info",
				);
			}
			this.syncLabels();
			return;
		}

		if (!this.selectedTaskId) {
			playError();
			this.setMessage("SELECT A PENDING POD FIRST.", "bad");
			return;
		}
		const task = this.model.getCargo(this.selectedTaskId);
		const assigned = this.model.assign(
			this.selectedTaskId,
			elevatorIndex,
			slotIndex,
		);
		if (!assigned || !task) {
			playError();
			this.setMessage("THAT ROUTE SLOT IS NO LONGER AVAILABLE.", "bad");
			return;
		}
		this.selectedTaskId = null;
		playClick();
		this.setMessage(
			`${task.code} → LIFT ${this.model.elevators[elevatorIndex].label} · ORDER ${slotIndex + 1}.`,
			"good",
		);
		this.syncLabels();
	}

	/**
	 * Validate and start a dispatch.
	 */
	private tryLaunch(): void {
		if (!this.model.launch()) {
			playError();
			this.setMessage("ASSIGN ALL EIGHT PODS BEFORE LAUNCHING.", "bad");
			return;
		}
		this.selectedTaskId = null;
		playClick();
		this.setMessage("DISPATCH LIVE · OPEN EACH DOOR AT 100% PRESSURE.", "good");
		this.syncLabels();
	}

	/**
	 * Toggle between live dispatch and route-editing pause.
	 */
	private togglePause(): void {
		if (this.model.phase !== "running") return;
		if (this.model.paused || state.isPaused()) {
			state.resume();
			this.model.setPaused(false);
			this.setMessage("DISPATCH RESUMED.", "good");
		} else {
			state.pause();
			this.model.setPaused(true);
			this.setMessage("PAUSED · REASSIGN ROUTES, THEN RESUME.", "info");
		}
		playClick();
		this.syncLabels();
	}

	/**
	 * Reset a failed or completed run.
	 */
	private restart(): void {
		this.model.reset();
		this.selectedTaskId = null;
		this.alarmClock = 0;
		this.motorClock = 0;
		if (state.isPaused()) state.resume();
		playClick();
		this.setMessage("NEW DISPATCH · PICK A POD, THEN ITS ROUTE SLOT.", "info");
		this.syncLabels();
	}

	/**
	 * Rectangle hit test.
	 * @param rect - target rectangle
	 * @param x - point x
	 * @param y - point y
	 * @returns whether the point is inside
	 */
	private hit(rect: Rect, x: number, y: number): boolean {
		return (
			x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
		);
	}

	/**
	 * Refresh every string whose value depends on simulation state.
	 */
	private syncLabels(): void {
		const urgent = this.model.getUrgentCargo();
		const powerRatio = this.model.power / 75;
		this.powerLabel.setText(`POWER ${Math.ceil(this.model.power)}`);
		this.powerLabel.fillStyle.parseCSS(
			powerRatio < 0.25
				? COLORS.red
				: powerRatio < 0.45
					? COLORS.amber
					: COLORS.cyan,
		);
		this.timeLabel.setText(`T+ ${this.formatClock(this.model.elapsed)}`);
		this.cargoLabel.setText(`CARGO ${this.model.completedCount}/8`);
		this.pendingCountLabel.setText(
			`${this.model.cargo.filter((task) => task.status === "pending").length} / 8`,
		);
		this.priorityLabel.setText(
			urgent
				? `${urgent.code} · ${Math.ceil(urgent.remaining)}s WINDOW`
				: "PRIORITY WINDOWS NOMINAL",
		);
		this.priorityLabel.fillStyle.parseCSS(
			urgent && urgent.remaining <= 10
				? COLORS.red
				: urgent
					? COLORS.amber
					: COLORS.muted,
		);

		const paused = this.model.paused || state.isPaused();
		if (this.model.phase === "planning") {
			this.modeLabel.setText("LAUNCH ▸");
		} else if (this.model.phase === "failed") {
			this.modeLabel.setText("RETRY ↻");
		} else if (this.model.phase === "won") {
			this.modeLabel.setText("RUN AGAIN ↻");
		} else if (paused) {
			this.modeLabel.setText("RESUME ▸");
		} else {
			this.modeLabel.setText("PAUSE ❚❚");
		}

		if (this.model.phase === "failed") {
			this.editBadgeLabel.setText("RUN TERMINATED");
			this.editBadgeLabel.fillStyle.parseCSS(COLORS.red);
		} else if (this.model.phase === "won") {
			this.editBadgeLabel.setText("ALL PODS DELIVERED");
			this.editBadgeLabel.fillStyle.parseCSS(COLORS.green);
		} else if (paused) {
			this.editBadgeLabel.setText("PAUSED · ROUTES UNLOCKED");
			this.editBadgeLabel.fillStyle.parseCSS(COLORS.amber);
		} else if (this.model.phase === "planning") {
			this.editBadgeLabel.setText("PLANNING · ROUTES UNLOCKED");
			this.editBadgeLabel.fillStyle.parseCSS(COLORS.cyan);
		} else {
			this.editBadgeLabel.setText("LIVE · ROUTES LOCKED");
			this.editBadgeLabel.fillStyle.parseCSS(COLORS.red);
		}

		for (let index = 0; index < this.model.cargo.length; index++) {
			const task = this.model.cargo[index];
			const card = this.cardLabels[index];
			const pending = task.status === "pending";
			card.setOpacity(pending ? 1 : 0);
			if (!pending) continue;
			card.setText(
				`${task.code}\n${CARGO_STYLE[task.kind].label} · D${task.deck} · ${Math.ceil(task.remaining)}s`,
			);
			const color =
				this.selectedTaskId === task.id
					? "#ffffff"
					: CARGO_STYLE[task.kind].color;
			card.fillStyle.parseCSS(color);
		}

		for (
			let elevatorIndex = 0;
			elevatorIndex < ELEVATOR_COUNT;
			elevatorIndex++
		) {
			const elevator = this.model.elevators[elevatorIndex];
			const routeState = this.routeStateLabels[elevatorIndex];
			routeState.setText(`${elevator.label}\nD${elevator.deck.toFixed(1)}`);
			routeState.fillStyle.parseCSS(COLORS.elevator[elevatorIndex]);
			const liftLabel = this.liftLabels[elevatorIndex];
			liftLabel.setText(elevator.label);
			liftLabel.pos.set(
				SHAFT_X[elevatorIndex] + SHAFT_W / 2,
				deckCenter(elevator.deck) - 10,
			);

			for (let slotIndex = 0; slotIndex < ROUTE_SLOTS; slotIndex++) {
				const slot = this.slotLabels[elevatorIndex * ROUTE_SLOTS + slotIndex];
				const rect = routeRect(elevatorIndex, slotIndex);
				const task = this.model.getRouteTask(elevatorIndex, slotIndex);
				slot.pos.set(rect.x + rect.w / 2, rect.y + 8);
				if (!task) {
					slot.setText("—");
					slot.fillStyle.parseCSS("#385066");
				} else if (task.status === "complete") {
					slot.setText(`D${task.deck}\n✓ DONE`);
					slot.fillStyle.parseCSS(COLORS.green);
				} else {
					slot.setText(`D${task.deck}\n${task.code}`);
					slot.fillStyle.parseCSS(
						elevator.activeTaskId === task.id
							? "#ffffff"
							: CARGO_STYLE[task.kind].color,
					);
				}
			}
		}

		for (let deck = 1; deck <= DECK_COUNT; deck++) {
			const door = this.model.doors[deck - 1];
			const docked = this.model.getDockedElevator(deck);
			const safe = door.pressure >= PRESSURE_SAFE - 0.001;
			const stateLabel = this.deckStateLabels[deck - 1];
			stateLabel.setText(
				safe
					? "PRESSURE 100% · SEALED"
					: `RECOVERING ${Math.floor(door.pressure)}%`,
			);
			stateLabel.fillStyle.parseCSS(safe ? COLORS.green : COLORS.amber);
			const open = this.openLabels[deck - 1];
			if (this.model.phase === "running") {
				open.setText(docked ? (safe ? "OPEN" : "WAIT") : "NO CAR");
				open.fillStyle.parseCSS(
					docked && safe ? COLORS.green : docked ? COLORS.amber : COLORS.muted,
				);
			} else {
				open.setText("OPEN");
				open.fillStyle.parseCSS(COLORS.muted);
			}
		}

		for (let index = 0; index < this.model.cargo.length; index++) {
			const task = this.model.cargo[index];
			const label = this.bayTaskLabels[index];
			const deckTasks = this.model.cargo.filter((candidate) => {
				return candidate.deck === task.deck;
			});
			const offset = deckTasks.indexOf(task);
			const top = deckTop(task.deck);
			label.pos.set(80 + offset * 158, top + 36);
			label.setOpacity(task.status === "complete" ? 0 : 1);
			label.setText(
				`${task.code}\n${CARGO_STYLE[task.kind].label} ${Math.ceil(task.remaining)}s`,
			);
			label.fillStyle.parseCSS(CARGO_STYLE[task.kind].color);
		}

		this.overlay.visible =
			this.model.phase === "failed" || this.model.phase === "won";
		if (this.overlay.visible) this.overlay.sync(this.model);
	}

	override draw(renderer: Renderer, viewport?: unknown): void {
		this.drawHeader(renderer);
		this.drawBase(renderer);
		this.drawSidebar(renderer);
		this.drawFooter(renderer);
		super.draw(renderer, viewport as never);
	}

	/**
	 * Draw the top command strip.
	 * @param renderer - active renderer
	 */
	private drawHeader(renderer: Renderer): void {
		renderer.setColor(COLORS.panel);
		renderer.fillRect(0, 0, CANVAS_WIDTH, HEADER_H);
		renderer.setColor(COLORS.line);
		renderer.fillRect(0, HEADER_H - 1, CANVAS_WIDTH, 1);

		const powerRatio = Math.max(0, Math.min(1, this.model.power / 75));
		renderer.setColor("#07111a");
		renderer.fillRoundRect(570, 23, 110, 10, 5);
		renderer.setColor(
			powerRatio < 0.25
				? COLORS.red
				: powerRatio < 0.45
					? COLORS.amber
					: COLORS.cyan,
		);
		renderer.fillRoundRect(571, 24, Math.max(2, 108 * powerRatio), 8, 4);

		const urgent = this.model.getUrgentCargo();
		if (urgent && urgent.remaining <= 10) {
			const pulse = 0.5 + 0.5 * Math.sin(this.pulseClock * 8);
			renderer.setColor(`rgba(255, 95, 113, ${0.08 + pulse * 0.1})`);
			renderer.fillRoundRect(694, 38, 152, 18, 9);
			renderer.setColor(COLORS.red);
			renderer.fillRoundRect(699, 42, 5, 10, 2);
		}

		const phase = this.model.phase;
		const paused = this.model.paused || state.isPaused();
		const modeColor =
			phase === "failed"
				? COLORS.red
				: phase === "won"
					? COLORS.green
					: paused
						? COLORS.amber
						: phase === "planning"
							? COLORS.cyan
							: "#152635";
		renderer.setColor("#07111a");
		renderer.fillRoundRect(
			MODE_BUTTON.x,
			MODE_BUTTON.y,
			MODE_BUTTON.w,
			MODE_BUTTON.h,
			9,
		);
		renderer.setColor(modeColor);
		renderer.lineWidth = this.hit(MODE_BUTTON, this.hover.x, this.hover.y)
			? 2
			: 1;
		renderer.strokeRoundRect(
			MODE_BUTTON.x,
			MODE_BUTTON.y,
			MODE_BUTTON.w,
			MODE_BUTTON.h,
			9,
		);
		renderer.lineWidth = 1;
	}

	/**
	 * Draw the base cross-section, pressure doors and lift shafts.
	 * @param renderer - active renderer
	 */
	private drawBase(renderer: Renderer): void {
		renderer.setColor("#07111a");
		renderer.fillRoundRect(BASE.x, BASE.y, BASE.w, BASE.h, 10);
		renderer.setColor(COLORS.line);
		renderer.strokeRoundRect(BASE.x, BASE.y, BASE.w, BASE.h, 10);
		renderer.setColor("#0b1824");
		renderer.fillRect(BASE.x + 1, BASE.y + 1, 9, BASE.h - 2);
		renderer.fillRect(BASE.x + BASE.w - 10, BASE.y + 1, 9, BASE.h - 2);

		for (let deck = DECK_COUNT; deck >= 1; deck--) {
			this.drawDeck(renderer, deck);
		}
		this.drawShafts(renderer);
		renderer.setColor("#102437");
		renderer.fillRect(610, BASE.y + 8, 1, BASE.h - 16);
	}

	/**
	 * Draw one cargo deck.
	 * @param renderer - active renderer
	 * @param deck - deck number 1..5
	 */
	private drawDeck(renderer: Renderer, deck: number): void {
		const top = deckTop(deck);
		const door = this.model.doors[deck - 1];
		const safe = door.pressure >= PRESSURE_SAFE - 0.001;
		const bayColor = deck % 2 === 0 ? "#0a1722" : "#0c1a28";

		renderer.setColor(bayColor);
		renderer.fillRect(BASE.x + 18, top, BASE.w - 36, ROW_H);
		renderer.setColor(COLORS.line);
		renderer.fillRect(BASE.x + 18, top + ROW_H - 2, BASE.w - 36, 1);

		if (!safe) {
			renderer.setColor("rgba(255, 191, 91, 0.07)");
			renderer.fillRect(BASE.x + 18, top, BASE.w - 36, ROW_H - 2);
		}

		renderer.setColor("#08131d");
		renderer.fillRoundRect(BAY.x, top + 24, BAY.w, 70, 7);
		renderer.setColor("#20394c");
		renderer.strokeRoundRect(BAY.x, top + 24, BAY.w, 70, 7);

		const deckCargo = this.model.cargo.filter((task) => {
			return task.deck === deck;
		});
		for (let index = 0; index < deckCargo.length; index++) {
			const task = deckCargo[index];
			const x = 68 + index * 158;
			const y = top + 30;
			const style = CARGO_STYLE[task.kind];
			const complete = task.status === "complete";
			renderer.setColor(complete ? "#10202a" : `${style.color}20`);
			renderer.fillRoundRect(x, y, 150, 52, 6);
			renderer.setColor(complete ? "#315263" : style.color);
			renderer.fillRoundRect(x, y, 4, 52, 2);
			renderer.lineWidth = 1;
			renderer.strokeRoundRect(x, y, 150, 52, 6);
			if (complete) {
				renderer.setColor(COLORS.green);
				renderer.strokeLine(x + 122, y + 26, x + 130, y + 34);
				renderer.strokeLine(x + 130, y + 34, x + 143, y + 16);
			}
		}

		this.drawPressureGauge(renderer, deck, top, safe);
		this.drawPressureDoor(renderer, deck, top, safe);
	}

	/**
	 * Draw the per-deck pressure meter.
	 * @param renderer - active renderer
	 * @param deck - deck number
	 * @param top - deck row top
	 * @param safe - whether the door is sealed
	 */
	private drawPressureGauge(
		renderer: Renderer,
		_deck: number,
		top: number,
		safe: boolean,
	): void {
		const door = this.model.doors[_deck - 1];
		const ratio = door.pressure / PRESSURE_SAFE;
		renderer.setColor("#07131d");
		renderer.fillRoundRect(384, top + 38, 108, 9, 4);
		renderer.setColor(safe ? COLORS.green : COLORS.amber);
		renderer.fillRoundRect(385, top + 39, Math.max(2, 106 * ratio), 7, 3);
		renderer.setColor("#254357");
		for (let tick = 1; tick < 5; tick++) {
			renderer.fillRect(384 + tick * 21, top + 49, 1, 5);
		}
	}

	/**
	 * Draw one airlock door and its OPEN control.
	 * @param renderer - active renderer
	 * @param deck - deck number
	 * @param top - deck row top
	 * @param safe - whether the door is sealed
	 */
	private drawPressureDoor(
		renderer: Renderer,
		deck: number,
		top: number,
		safe: boolean,
	): void {
		const door = this.model.doors[deck - 1];
		const docked = this.model.getDockedElevator(deck);
		const button = doorButtonRect(deck);
		const hovered = this.hit(button, this.hover.x, this.hover.y);
		const canOpen = this.model.phase === "running" && docked && safe;
		const opening = door.openTimer > 0;
		const slide = opening
			? 11 * (1 - Math.max(0, door.openTimer) / OPENING_TIME)
			: 0;

		renderer.setColor("#07131c");
		renderer.fillRoundRect(DOOR.x, top + 10, DOOR.w, 58, 7);
		renderer.setColor(safe ? "#275843" : "#64451f");
		renderer.lineWidth = safe ? 2 : 1;
		renderer.strokeRoundRect(DOOR.x, top + 10, DOOR.w, 58, 7);
		renderer.lineWidth = 1;

		renderer.setColor(safe ? "#153b35" : "#3e2b16");
		renderer.fillRoundRect(DOOR.x + 9, top + 20, 37, 34, 4);
		renderer.fillRoundRect(DOOR.x + 46, top + 20, 37, 34, 4);
		renderer.setColor(safe ? COLORS.green : COLORS.amber);
		renderer.fillRect(DOOR.x + 16 - slide, top + 25, 25, 2);
		renderer.fillRect(DOOR.x + 51 + slide, top + 25, 25, 2);
		renderer.fillRect(DOOR.x + 16 - slide, top + 49, 25, 2);
		renderer.fillRect(DOOR.x + 51 + slide, top + 49, 25, 2);

		renderer.setColor(canOpen ? "#174333" : "#0b1822");
		renderer.fillRoundRect(button.x, button.y, button.w, button.h, 5);
		renderer.setColor(
			canOpen ? COLORS.green : hovered ? COLORS.amber : "#315066",
		);
		renderer.lineWidth = hovered && canOpen ? 2 : 1;
		renderer.strokeRoundRect(button.x, button.y, button.w, button.h, 5);
		renderer.lineWidth = 1;

		if (opening) {
			renderer.setColor("rgba(255,255,255,0.55)");
			renderer.fillRect(DOOR.x + DOOR.w - 4, top + 18, 2, 32);
		}
	}

	/**
	 * Draw the three lift shafts and their cars.
	 * @param renderer - active renderer
	 */
	private drawShafts(renderer: Renderer): void {
		for (
			let elevatorIndex = 0;
			elevatorIndex < ELEVATOR_COUNT;
			elevatorIndex++
		) {
			const x = SHAFT_X[elevatorIndex];
			const elevator = this.model.elevators[elevatorIndex];
			const accent = COLORS.elevator[elevatorIndex];

			renderer.setColor("#07131d");
			renderer.fillRect(x, 108, SHAFT_W, 584);
			renderer.setColor("#183247");
			renderer.fillRect(x, 108, 1, 584);
			renderer.fillRect(x + SHAFT_W - 1, 108, 1, 584);
			for (let deck = 1; deck <= DECK_COUNT; deck++) {
				const center = deckCenter(deck);
				renderer.setColor("#12283a");
				renderer.fillRect(x + 10, center, SHAFT_W - 20, 1);
				renderer.setColor("#2f5368");
				renderer.fillRect(x + 8, center, 2, 5);
				renderer.fillRect(x + SHAFT_W - 10, center, 2, 5);
			}

			const carY = deckCenter(elevator.deck) - 28;
			renderer.setColor("#1a2a38");
			renderer.fillRect(x + SHAFT_W / 2 - 1, 108, 2, Math.max(0, carY - 108));
			renderer.setColor(`${accent}2a`);
			renderer.fillRoundRect(x + 8, carY, SHAFT_W - 16, 56, 7);
			renderer.setColor(accent);
			renderer.lineWidth = elevator.mode === "moving" ? 2 : 1;
			renderer.strokeRoundRect(x + 8, carY, SHAFT_W - 16, 56, 7);
			renderer.lineWidth = 1;

			renderer.setColor("#07111a");
			renderer.fillRoundRect(x + 18, carY + 10, SHAFT_W - 36, 23, 3);
			renderer.setColor(`${accent}55`);
			renderer.fillRoundRect(x + 22, carY + 14, SHAFT_W - 44, 15, 2);
			renderer.setColor(accent);
			renderer.fillRect(x + 11, carY + 48, SHAFT_W - 22, 3);
			renderer.setColor(`${accent}88`);
			for (let slot = 0; slot < ROUTE_SLOTS; slot++) {
				const task = this.model.getRouteTask(elevatorIndex, slot);
				renderer.setColor(
					task?.status === "complete"
						? COLORS.green
						: task
							? accent
							: "#20394b",
				);
				renderer.fillEllipse(x + 25 + slot * 17, carY + 40, 3, 3);
			}
		}
	}

	/**
	 * Draw the pending cargo queue and route editor.
	 * @param renderer - active renderer
	 */
	private drawSidebar(renderer: Renderer): void {
		renderer.setColor("#08121c");
		renderer.fillRoundRect(SIDEBAR.x, SIDEBAR.y, SIDEBAR.w, SIDEBAR.h, 10);
		renderer.setColor(COLORS.line);
		renderer.strokeRoundRect(SIDEBAR.x, SIDEBAR.y, SIDEBAR.w, SIDEBAR.h, 10);
		renderer.setColor("#122739");
		renderer.fillRect(952, 436, 292, 1);
		renderer.fillRect(952, 480, 292, 1);
		renderer.fillRect(952, 742, 292, 1);

		for (let index = 0; index < this.model.cargo.length; index++) {
			const task = this.model.cargo[index];
			const rect = cardRect(index);
			const style = CARGO_STYLE[task.kind];
			const pending = task.status === "pending";
			const hovered = pending && this.hit(rect, this.hover.x, this.hover.y);
			const selected = pending && this.selectedTaskId === task.id;

			if (!pending) {
				renderer.setColor("#0b1822");
				renderer.strokeRect(rect.x, rect.y, rect.w, rect.h);
				continue;
			}

			renderer.setColor(selected ? `${style.color}38` : `${style.color}18`);
			renderer.fillRoundRect(rect.x, rect.y, rect.w, rect.h, 6);
			renderer.setColor(style.color);
			renderer.fillRoundRect(rect.x, rect.y, 4, rect.h, 2);
			renderer.lineWidth = selected ? 2 : hovered ? 1.5 : 1;
			renderer.strokeRoundRect(rect.x, rect.y, rect.w, rect.h, 6);
			renderer.lineWidth = 1;
			renderer.setColor(selected ? "#ffffff" : `${style.color}55`);
			renderer.fillRect(rect.x + 12, rect.y + rect.h - 8, rect.w - 24, 2);
		}

		for (
			let elevatorIndex = 0;
			elevatorIndex < ELEVATOR_COUNT;
			elevatorIndex++
		) {
			const elevator = this.model.elevators[elevatorIndex];
			const accent = COLORS.elevator[elevatorIndex];
			const rowY = 490 + elevatorIndex * 82;
			renderer.setColor(`${accent}10`);
			renderer.fillRoundRect(946, rowY, 304, 62, 6);
			renderer.setColor(`${accent}55`);
			renderer.fillRect(946, rowY + 8, 2, 46);

			for (let slotIndex = 0; slotIndex < ROUTE_SLOTS; slotIndex++) {
				const rect = routeRect(elevatorIndex, slotIndex);
				const task = this.model.getRouteTask(elevatorIndex, slotIndex);
				const hovered = this.hit(rect, this.hover.x, this.hover.y);
				const active = task && elevator.activeTaskId === task.id;
				const border =
					task?.status === "complete"
						? COLORS.green
						: task
							? CARGO_STYLE[task.kind].color
							: hovered
								? accent
								: "#29445a";
				renderer.setColor(active ? "#173441" : "#08141e");
				renderer.fillRoundRect(rect.x, rect.y, rect.w, rect.h, 6);
				renderer.setColor(border);
				renderer.lineWidth = active || hovered ? 2 : 1;
				renderer.strokeRoundRect(rect.x, rect.y, rect.w, rect.h, 6);
				renderer.lineWidth = 1;
				renderer.setColor(active ? "#ffffff" : "#244054");
				renderer.fillRect(rect.x + 10, rect.y + 10, 12, 2);
				renderer.setColor("#183246");
				renderer.fillRect(rect.x + rect.w - 20, rect.y + rect.h - 9, 10, 1);
			}
		}
	}

	/**
	 * Draw the instruction strip under the base.
	 * @param renderer - active renderer
	 */
	private drawFooter(renderer: Renderer): void {
		renderer.setColor("#08121b");
		renderer.fillRoundRect(BASE.x, 716, BASE.w, 66, 8);
		renderer.setColor("#132a3b");
		renderer.strokeRoundRect(BASE.x, 716, BASE.w, 66, 8);
	}
}

/**
 * Full-screen failure / completion dialog drawn above the board.
 */
class DispatchOverlay extends Container {
	private readonly title: Text;
	private readonly body: Text;
	private readonly button: Text;
	private success = false;

	constructor() {
		super(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;

		this.title = this.addLabel(640, 250, "", 28, COLORS.red, "center", true);
		this.body = this.addLabel(640, 310, "", 12, COLORS.text, "center");
		this.body.wordWrapWidth = 430;
		this.body.lineHeight = 1.35;
		this.button = this.addLabel(
			RETRY_BUTTON.x + RETRY_BUTTON.w / 2,
			RETRY_BUTTON.y + 14,
			"",
			13,
			COLORS.text,
			"center",
			true,
		);
		this.addLabel(
			640,
			544,
			"SPACE / R TO TRY AGAIN",
			10,
			COLORS.muted,
			"center",
		);
	}

	/**
	 * Add an overlay label.
	 * @param x - x position
	 * @param y - y position
	 * @param text - label text
	 * @param size - font size
	 * @param color - fill colour
	 * @param align - alignment
	 * @param bold - bold face
	 * @returns the label
	 */
	private addLabel(
		x: number,
		y: number,
		text: string,
		size: number,
		color: string,
		align: "left" | "center" | "right",
		bold = false,
	): Text {
		const label = new Text(x, y, {
			font: FONT,
			size,
			fillStyle: color,
			textAlign: align,
			textBaseline: "top",
			bold,
			text,
		});
		this.addChild(label);
		return label;
	}

	/**
	 * Update the dialog for the current end state.
	 * @param model - the finished dispatch
	 */
	sync(model: DispatchModel): void {
		this.success = model.phase === "won";
		const delivered = model.completedCount;
		const time = `${Math.floor(model.elapsed / 60)
			.toString()
			.padStart(2, "0")}:${Math.floor(model.elapsed % 60)
			.toString()
			.padStart(2, "0")}`;
		this.title.setText(this.success ? "SHIFT COMPLETE" : "DISPATCH FAILED");
		this.title.fillStyle.parseCSS(this.success ? COLORS.green : COLORS.red);
		this.body.setText(
			this.success
				? `All eight priority pods delivered.\nTIME ${time} · POWER ${Math.ceil(model.power)} REMAINING`
				: `${model.failure?.message ?? "DISPATCH TERMINATED"}.\n${delivered}/8 PODS DELIVERED · T+ ${time}`,
		);
		this.button.setText(this.success ? "RUN AGAIN ↻" : "RETRY DISPATCH ↻");
	}

	override draw(renderer: Renderer, viewport?: unknown): void {
		if (!this.visible) return;
		renderer.setColor("rgba(2, 7, 12, 0.82)");
		renderer.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		renderer.setColor("#091722");
		renderer.fillRoundRect(390, 218, 500, 356, 14);
		renderer.setColor(this.success ? COLORS.green : COLORS.red);
		renderer.lineWidth = 2;
		renderer.strokeRoundRect(390, 218, 500, 356, 14);
		renderer.lineWidth = 1;
		renderer.setColor(this.success ? "#14382b" : "#3a1720");
		renderer.fillRoundRect(
			RETRY_BUTTON.x,
			RETRY_BUTTON.y,
			RETRY_BUTTON.w,
			RETRY_BUTTON.h,
			8,
		);
		renderer.setColor(this.success ? COLORS.green : COLORS.red);
		renderer.strokeRoundRect(
			RETRY_BUTTON.x,
			RETRY_BUTTON.y,
			RETRY_BUTTON.w,
			RETRY_BUTTON.h,
			8,
		);
		super.draw(renderer, viewport as never);
	}
}
