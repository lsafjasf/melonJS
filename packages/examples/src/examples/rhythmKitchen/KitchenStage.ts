/**
 * melonJS — Rhythm Kitchen example: playable stage.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	type Application,
	event,
	input,
	type Pointer,
	Stage,
	state,
	Text,
} from "melonjs";
import { KitchenView } from "./KitchenView";
import {
	BEAT_MS,
	CARD_X,
	CARD_Y,
	createStations,
	formatSeconds,
	type GamePhase,
	HOT_BURN_MS,
	HOT_THRESHOLD,
	LIFT_MIN_MS,
	RUN_TIME_MS,
	recipeFor,
	type StationKind,
	type StationState,
	timingQuality,
} from "./recipes";
import { KitchenSynth } from "./synth";

interface KitchenDebug {
	snapshot: () => ReturnType<KitchenStage["snapshot"]>;
}

interface Labels {
	title: Text;
	subtitle: Text;
	beat: Text;
	time: Text;
	stats: Text;
	stationName: Text[];
	stationRecipe: Text[];
	stationCue: Text[];
	stationStatus: Text[];
	footer: Text;
	overlayTitle: Text;
	overlayBody: Text;
	overlayHint: Text;
}

interface TimingResult {
	quality: number;
	note: string;
}

const DEBUG_KEY = "__rhythmKitchen";

export class KitchenStage extends Stage {
	readonly synth = new KitchenSynth();
	elapsedMs = 0;
	phase: GamePhase = "ready";
	stations: StationState[] = createStations();
	servedCount = 0;
	burntCount = 0;
	totalQuality = 0;
	resultReason = "Three dishes · twenty seconds";

	private app: Application | null = null;
	private view: KitchenView | null = null;
	private labels: Labels | null = null;
	private labelCache = new Map<Text, string>();
	private nextBeatToSchedule = 0;
	private pointerRegistered = false;
	private pauseHandler: (() => void) | null = null;
	private resumeHandler: (() => void) | null = null;
	private disposed = false;

	override onResetEvent(app: Application): void {
		this.app = app;
		this.disposed = false;
		input.bindKey(input.KEY.A, "soup", true);
		input.bindKey(input.KEY.S, "pan", true);
		input.bindKey(input.KEY.D, "kettle", true);
		input.bindKey(input.KEY.P, "pause", true);
		input.bindKey(input.KEY.ESC, "pause", true);
		input.bindKey(input.KEY.SPACE, "start", true);
		input.bindKey(input.KEY.ENTER, "start", true);
		input.bindKey(input.KEY.R, "restart", true);
		app.world.backgroundColor.parseCSS("#0b1019");
		this.resetRun();

		this.view = new KitchenView(this);
		app.world.addChild(this.view, 0);
		this.labels = this.createLabels(app);
		this.syncLabels(true);

		this.pointerRegistered = true;
		input.registerPointerEvent("pointerdown", app.viewport, this.onPointerDown);

		this.pauseHandler = () => {
			this.synth.pause();
			this.syncLabels(true);
		};
		this.resumeHandler = () => {
			if (this.phase === "playing") {
				this.synth.resume();
			}
			this.syncLabels(true);
		};
		event.on(event.STATE_PAUSE, this.pauseHandler);
		event.on(event.STATE_RESUME, this.resumeHandler);
		this.installDebugHook();
	}

	override onDestroyEvent(): void {
		this.dispose();
	}

	override update(dt: number): boolean {
		super.update(dt);

		if (this.disposed) {
			return false;
		}

		if (input.isKeyPressed("pause") && this.phase === "playing") {
			this.togglePause();
		}

		if (this.phase === "ready") {
			if (input.isKeyPressed("start") || input.isKeyPressed("restart")) {
				this.startRun();
			}
			this.syncLabels();
			return true;
		}

		if (this.phase === "won" || this.phase === "lost") {
			if (input.isKeyPressed("start") || input.isKeyPressed("restart")) {
				this.startRun();
			}
			this.syncLabels();
			return true;
		}

		// Stage.update() is called even while the state manager is paused. Keep
		// that early return: the beat clock, heat and ingredient cook time all
		// advance below this line, and nothing here may run while paused.
		if (state.isPaused()) {
			this.syncLabels();
			return true;
		}

		this.elapsedMs += dt;
		this.handleStationKeys();
		this.updateStations(dt);
		this.scheduleBeat();

		if (this.elapsedMs >= RUN_TIME_MS) {
			this.finish(false, "TIME UP · dishes missing");
		} else if (this.burntCount >= 2) {
			this.finish(false, "TWO DISHES RUINED");
		} else if (
			this.servedCount === 3 ||
			this.servedCount + this.burntCount === 3
		) {
			const cleanWin = this.servedCount === 3 && this.burntCount === 0;
			this.finish(
				cleanWin,
				cleanWin
					? `ALL THREE SERVED · AVG ${Math.round(this.totalQuality / 3)}`
					: "A DISH BURNED · KITCHEN FAILED",
			);
		}

		this.syncLabels();
		return true;
	}

	startRun(): void {
		if (this.disposed) {
			return;
		}
		this.resetRun();
		this.synth.resume();
		this.phase = "playing";
		this.syncLabels(true);
	}

	togglePause(): void {
		if (this.phase !== "playing") {
			return;
		}
		if (state.isPaused()) {
			state.resume();
		} else {
			state.pause();
		}
		this.syncLabels(true);
	}

	snapshot() {
		return {
			phase: this.phase,
			elapsedMs: this.elapsedMs,
			beat: Math.floor(this.elapsedMs / BEAT_MS),
			paused: state.isPaused(),
			audioState: this.synth.contextState(),
			audioMuted: this.synth.muted(),
			servedCount: this.servedCount,
			burntCount: this.burntCount,
			stations: this.stations.map((station) => ({
				kind: station.kind,
				phase: station.phase,
				heat: station.heat,
				cookMs:
					station.addedAt === null
						? 0
						: Math.max(0, this.elapsedMs - station.addedAt),
				quality: station.quality,
			})),
		};
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		if (this.pointerRegistered && this.app !== null) {
			input.releasePointerEvent("pointerdown", this.app.viewport);
			this.pointerRegistered = false;
		}
		if (this.pauseHandler !== null) {
			event.off(event.STATE_PAUSE, this.pauseHandler);
			this.pauseHandler = null;
		}
		if (this.resumeHandler !== null) {
			event.off(event.STATE_RESUME, this.resumeHandler);
			this.resumeHandler = null;
		}
		this.synth.pause();
		const host = globalThis as unknown as Record<string, unknown>;
		if (host[DEBUG_KEY] !== undefined) {
			delete host[DEBUG_KEY];
		}
	}

	private resetRun(): void {
		this.elapsedMs = 0;
		this.phase = "ready";
		this.stations = createStations();
		this.servedCount = 0;
		this.burntCount = 0;
		this.totalQuality = 0;
		this.resultReason = "Three dishes · twenty seconds";
		this.nextBeatToSchedule = 0;
		this.labelCache.clear();
	}

	private handleStationKeys(): void {
		if (input.isKeyPressed("soup")) {
			this.actOnStation("soup");
		}
		if (input.isKeyPressed("pan")) {
			this.actOnStation("pan");
		}
		if (input.isKeyPressed("kettle")) {
			this.actOnStation("kettle");
		}
	}

	actOnStation(kind: StationKind): void {
		if (this.phase !== "playing" || state.isPaused()) {
			return;
		}
		const station = this.stations.find((entry) => entry.kind === kind);
		if (station === undefined) {
			return;
		}
		const recipe = recipeFor(kind);

		if (station.phase === "idle") {
			const target = recipe.addBeat * BEAT_MS;
			if (this.elapsedMs > (recipe.takeBeat + 1) * BEAT_MS) {
				station.note = "Missed the add cue";
				this.synth.playTooSoon();
				return;
			}
			const timing = this.judge(
				this.elapsedMs - target,
				"ADD",
				"undercooked",
				"taste penalty",
			);
			station.addQuality = timing.quality;
			station.phase = "cooking";
			station.addedAt = this.elapsedMs;
			station.heat = 0.16;
			station.hotSince = null;
			station.note = timing.note;
			this.synth.playAdd(kind);
			return;
		}

		if (station.phase === "lifted") {
			const liftedFor =
				station.liftedAt === null ? 0 : this.elapsedMs - station.liftedAt;
			if (liftedFor < LIFT_MIN_MS) {
				station.note = "Hold off before returning it";
				this.synth.playTooSoon();
				return;
			}
			station.phase = "cooking";
			station.heat = 0.34;
			station.hotSince = null;
			station.liftedAt = null;
			station.note = "Back on heat · watch the serve beat";
			this.synth.playLift(kind);
			return;
		}

		if (station.phase === "cooking") {
			if (station.heat >= HOT_THRESHOLD || station.hotSince !== null) {
				station.phase = "lifted";
				station.liftedAt = this.elapsedMs;
				station.hotSince = null;
				station.note = "Lifted to cool · press the same key to return";
				this.synth.playLift(kind);
				return;
			}
			this.serveStation(station);
		}
	}

	private serveStation(station: StationState): void {
		const recipe = recipeFor(station.kind);
		const timing = this.judge(
			this.elapsedMs - recipe.takeBeat * BEAT_MS,
			"SERVE",
			"undercooked",
			"overcooked · taste penalty",
		);
		const quality = Math.round(
			station.addQuality * 0.35 + timing.quality * 0.65,
		);
		station.phase = "served";
		station.quality = Math.max(0, Math.min(100, quality));
		station.hotSince = null;
		station.note = timing.note;
		this.servedCount++;
		this.totalQuality += station.quality;
		this.synth.playServe(station.kind, station.quality);
	}

	private judge(
		deltaMs: number,
		action: string,
		earlyNote: string,
		lateNote: string,
	): TimingResult {
		const quality = timingQuality(deltaMs);
		if (quality === 100) {
			return { quality, note: `${action} PERFECT · dead on the beat` };
		}
		if (deltaMs < 0) {
			return { quality, note: `${action} EARLY · ${earlyNote}` };
		}
		return { quality, note: `${action} LATE · ${lateNote}` };
	}

	private updateStations(dt: number): void {
		for (const station of this.stations) {
			if (station.phase === "cooking") {
				const recipe = recipeFor(station.kind);
				station.heat = Math.min(1, station.heat + (dt / 1000) * 0.36);
				if (station.heat >= HOT_THRESHOLD && station.hotSince === null) {
					station.hotSince = this.elapsedMs;
					station.note = "OVERHEATING!";
				}
				if (
					station.hotSince !== null &&
					this.elapsedMs - station.hotSince >= HOT_BURN_MS
				) {
					this.burnStation(station);
					continue;
				}
				if (this.elapsedMs >= (recipe.takeBeat + 2.2) * BEAT_MS) {
					this.burnStation(station);
				}
			} else if (station.phase === "lifted") {
				station.heat = Math.max(0.18, station.heat - (dt / 1000) * 0.6);
				const liftedFor =
					station.liftedAt === null ? 0 : this.elapsedMs - station.liftedAt;
				station.note =
					liftedFor < LIFT_MIN_MS
						? "Cooling · wait, then return it"
						: "Ready · press the same key";
			}
		}
	}

	private burnStation(station: StationState): void {
		if (station.phase === "burnt" || station.phase === "served") {
			return;
		}
		station.phase = "burnt";
		station.quality = 0;
		station.note = "BURNT · dish completely failed";
		station.hotSince = null;
		this.burntCount++;
		this.synth.playBurn();
		if (this.burntCount >= 2) {
			this.finish(false, "TWO DISHES RUINED");
		}
	}

	private finish(won: boolean, reason: string): void {
		if (this.phase !== "playing") {
			return;
		}
		this.phase = won ? "won" : "lost";
		this.resultReason = reason;
		this.synth.playFinish(won);
	}

	private scheduleBeat(): void {
		const horizonMs = this.elapsedMs + 160;
		while (this.nextBeatToSchedule * BEAT_MS <= horizonMs) {
			const delay = Math.max(
				0,
				(this.nextBeatToSchedule * BEAT_MS - this.elapsedMs) / 1000,
			);
			this.synth.scheduleBeat(
				this.nextBeatToSchedule,
				delay,
				this.stations.map((station) => ({
					kind: station.kind,
					phase: station.phase,
					heat: station.heat,
				})),
			);
			this.nextBeatToSchedule++;
		}
	}

	private onPointerDown = (pointer: Pointer): boolean => {
		if (this.phase === "ready") {
			this.startRun();
			return false;
		}
		if (this.phase === "won" || this.phase === "lost") {
			this.startRun();
			return false;
		}
		if (state.isPaused()) {
			state.resume();
			return false;
		}
		if (pointer.gameScreenY < 92) {
			this.togglePause();
			return false;
		}
		for (let index = 0; index < CARD_X.length; index++) {
			const left = CARD_X[index];
			if (
				pointer.gameScreenX >= left &&
				pointer.gameScreenX <= left + 360 &&
				pointer.gameScreenY >= CARD_Y &&
				pointer.gameScreenY <= CARD_Y + 376
			) {
				this.actOnStation(this.stations[index].kind);
				return false;
			}
		}
		return false;
	};

	private installDebugHook(): void {
		// A read-only snapshot used by the example's browser play-test. It
		// exposes no action path, only the same numbers the HUD shows.
		const debug: KitchenDebug = {
			snapshot: () => this.snapshot(),
		};
		(globalThis as unknown as Record<string, unknown>)[DEBUG_KEY] = debug;
	}

	private createLabels(app: Application): Labels {
		const stationName: Text[] = [];
		const stationRecipe: Text[] = [];
		const stationCue: Text[] = [];
		const stationStatus: Text[] = [];

		for (let index = 0; index < CARD_X.length; index++) {
			const recipe = recipeFor(this.stations[index].kind);
			const x = CARD_X[index];
			stationName.push(
				this.makeLabel(
					app,
					x + 18,
					CARD_Y + 14,
					25,
					recipe.accent,
					recipe.tool,
				),
			);
			stationRecipe.push(
				this.makeLabel(
					app,
					x + 18,
					CARD_Y + 50,
					15,
					"#a9b8c8",
					`${recipe.dish} · ${recipe.ingredient}`,
				),
			);
			stationCue.push(
				this.makeLabel(app, x + 18, CARD_Y + 286, 21, recipe.accent, ""),
			);
			stationStatus.push(
				this.makeLabel(app, x + 18, CARD_Y + 318, 15, "#8494a6", ""),
			);
		}

		const time = this.makeLabel(app, 0, 22, 32, "#ffe9b0", "");
		time.pos.x = 1170;
		time.anchorPoint.set(1, 0);
		time.textAlign = "right";

		const stats = this.makeLabel(app, 0, 62, 16, "#91a3b6", "");
		stats.pos.x = 1170;
		stats.anchorPoint.set(1, 0);
		stats.textAlign = "right";

		const overlayTitle = this.makeLabel(app, 600, 330, 44, "#ffe9b0", "");
		overlayTitle.anchorPoint.set(0.5, 0.5);
		overlayTitle.textAlign = "center";
		overlayTitle.textBaseline = "middle";
		const overlayBody = this.makeLabel(app, 600, 394, 19, "#c3d1df", "");
		overlayBody.anchorPoint.set(0.5, 0.5);
		overlayBody.textAlign = "center";
		overlayBody.textBaseline = "middle";
		const overlayHint = this.makeLabel(app, 600, 454, 15, "#7f93a8", "");
		overlayHint.anchorPoint.set(0.5, 0.5);
		overlayHint.textAlign = "center";
		overlayHint.textBaseline = "middle";

		return {
			title: this.makeLabel(app, 32, 18, 38, "#ffe9b0", "RHYTHM KITCHEN"),
			subtitle: this.makeLabel(
				app,
				34,
				66,
				15,
				"#8297ad",
				"A SOUP POT · S PAN · D KETTLE     P / ESC PAUSE",
			),
			beat: this.makeLabel(app, 32, 108, 18, "#c8d6e4", ""),
			time,
			stats,
			stationName,
			stationRecipe,
			stationCue,
			stationStatus,
			footer: this.makeLabel(
				app,
				32,
				612,
				15,
				"#7e91a6",
				"When the pot overheats, press its key to lift it; return it, then press again to serve.",
			),
			overlayTitle,
			overlayBody,
			overlayHint,
		};
	}

	private makeLabel(
		app: Application,
		x: number,
		y: number,
		size: number,
		color: string,
		text: string,
	): Text {
		const label = new Text(x, y, {
			font: "Arial",
			size,
			fillStyle: color,
			textBaseline: "top",
			textAlign: "left",
			text,
		});
		label.anchorPoint.set(0, 0);
		app.world.addChild(label, 20);
		return label;
	}

	private syncLabels(force = false): void {
		const labels = this.labels;
		if (labels === null) {
			return;
		}
		const currentBeat = Math.floor(this.elapsedMs / BEAT_MS) + 1;
		const paused = state.isPaused() && this.phase === "playing";
		const remaining = Math.max(0, RUN_TIME_MS - this.elapsedMs);
		const avgQuality =
			this.servedCount === 0
				? 0
				: Math.round(this.totalQuality / this.servedCount);

		this.setText(
			labels.beat,
			`BEAT ${currentBeat.toString().padStart(2, "0")}  ·  PERFECT ±90ms  ·  CLOCK ${this.phase === "ready" ? "READY" : paused ? "FROZEN" : "RUNNING"}`,
			force,
		);
		this.setText(labels.time, formatSeconds(remaining), force);
		this.setText(
			labels.stats,
			`SERVED ${this.servedCount}/3   BURNT ${this.burntCount}/2   AVG ${avgQuality}`,
			force,
		);

		for (let index = 0; index < this.stations.length; index++) {
			const station = this.stations[index];
			const recipe = recipeFor(station.kind);
			this.setText(
				labels.stationName[index],
				`${recipe.tool}   [${recipe.key}]`,
				force,
			);
			this.setText(
				labels.stationCue[index],
				this.cueFor(station, currentBeat),
				force,
			);
			const status =
				station.phase === "served"
					? `${station.note} · Q${station.quality}`
					: station.phase === "burnt"
						? station.note
						: `${station.note} · HEAT ${Math.round(station.heat * 100)}%`;
			this.setText(labels.stationStatus[index], status, force);
		}

		const showOverlay = paused || this.phase !== "playing";
		labels.overlayTitle.alpha = showOverlay ? 1 : 0;
		labels.overlayBody.alpha = showOverlay ? 1 : 0;
		labels.overlayHint.alpha = showOverlay ? 1 : 0;

		if (paused) {
			this.setText(labels.overlayTitle, "PAUSED", force);
			this.setText(
				labels.overlayBody,
				`BEAT ${currentBeat} · COOK CLOCK ${(this.elapsedMs / 1000).toFixed(1)}s\nBeat, flame and ingredient timers are frozen together`,
				force,
			);
			this.setText(
				labels.overlayHint,
				`Audio muted: ${this.synth.muted() ? "YES" : "NO"}  ·  P / ESC or click to resume`,
				force,
			);
		} else if (this.phase === "ready") {
			this.setText(labels.overlayTitle, "RHYTHM KITCHEN", force);
			this.setText(
				labels.overlayBody,
				"THREE DISHES · TWENTY SECONDS\nAdd and serve on the recipe beats",
				force,
			);
			this.setText(
				labels.overlayHint,
				"SPACE or click to start · the gesture unlocks audio",
				force,
			);
		} else if (this.phase === "won") {
			this.setText(labels.overlayTitle, "SERVICE COMPLETE!", force);
			this.setText(
				labels.overlayBody,
				`${this.resultReason}\nNothing burned`,
				force,
			);
			this.setText(
				labels.overlayHint,
				"R / SPACE or click to cook again",
				force,
			);
		} else if (this.phase === "lost") {
			this.setText(labels.overlayTitle, "KITCHEN FAILED", force);
			this.setText(labels.overlayBody, this.resultReason, force);
			this.setText(labels.overlayHint, "R / SPACE or click to retry", force);
		}
	}

	private cueFor(station: StationState, currentBeat: number): string {
		const recipe = recipeFor(station.kind);
		if (station.phase === "idle") {
			const beatsLeft = recipe.addBeat + 1 - currentBeat;
			return beatsLeft <= 1
				? `ADD NOW!  [${recipe.key}]`
				: `ADD ON BEAT ${recipe.addBeat + 1} · ${beatsLeft} TO GO`;
		}
		if (station.phase === "cooking") {
			if (station.heat >= HOT_THRESHOLD || station.hotSince !== null) {
				return `OVERHEAT!  PRESS ${recipe.key} TO LIFT`;
			}
			const beatsLeft = recipe.takeBeat + 1 - currentBeat;
			return beatsLeft <= 1
				? `SERVE NOW!  [${recipe.key}]`
				: `SERVE ON BEAT ${recipe.takeBeat + 1} · ${beatsLeft} TO GO`;
		}
		if (station.phase === "lifted") {
			return station.note.includes("Ready")
				? `PRESS ${recipe.key} TO RETURN`
				: `COOLING · ${recipe.key}`;
		}
		if (station.phase === "served") {
			return `SERVED · ${station.quality} PTS`;
		}
		return "BURNT · RUINED";
	}

	private setText(label: Text, text: string, force: boolean): void {
		if (!force && this.labelCache.get(label) === text) {
			return;
		}
		this.labelCache.set(label, text);
		label.setText(text);
	}
}
