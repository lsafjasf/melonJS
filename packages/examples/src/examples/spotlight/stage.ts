/**
 * melonJS — The Last Spotlight example: cue logic and scene lifecycle.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * One beam, three performers, eight cues. The pointer moves the pool; the
 * number keys change its character. A cue is clean when the active performer
 * is held in the beam, without a second body in the light, without spill into
 * the house, and without cooking the window into a reflection.
 */
import {
	type Application,
	event,
	input,
	type Pointer,
	Stage,
	state,
} from "melonjs";
import {
	playBoo,
	playCleanCue,
	playCueBell,
	playCurtainCall,
	playFootstep,
	playHouseGasp,
	playMissedCue,
	playModeSwitch,
	playWindowGlare,
} from "./audio";
import {
	ACTOR_FEET_Y,
	ACTOR_FOCUS_Y,
	ACTOR_MARKS,
	ACTORS,
	AUDIENCE_Y,
	BEAMS,
	type BeamSpec,
	CUE_COUNT,
	CUE_PLAN,
	MAX_GLARES,
	MAX_MISSES,
	PERFORM_MS,
	REST_MS,
	VIEW_H,
	VIEW_W,
	WINDOW,
	WINDOW_COOLDOWN_MS,
	WINDOW_TRIGGER_MS,
} from "./constants";
import { SpotlightHUD } from "./hud";
import { SpotlightScene } from "./scene";

export type ShowPhase = "ready" | "playing" | "curtainCall" | "failed";

export interface SpotlightActor {
	readonly name: string;
	readonly role: string;
	readonly markX: number;
	x: number;
	y: number;
	active: boolean;
}

const ellipseIntersectsRect = (
	x: number,
	y: number,
	rx: number,
	ry: number,
	rect: { x: number; y: number; width: number; height: number },
): boolean => {
	const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
	const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
	const dx = (nearestX - x) / rx;
	const dy = (nearestY - y) / ry;
	return dx * dx + dy * dy <= 1;
};

export class SpotlightStage extends Stage {
	phase: ShowPhase = "ready";
	cueIndex = 0;
	cueActive = false;
	cueElapsed = 0;
	cueBannerMs = 0;
	time = 0;
	finaleTime = 0;
	curtainOpen = 0;

	misses = 0;
	reflections = 0;
	aimX = VIEW_W / 2;
	aimY = 520;
	beamIndex: 0 | 1 | 2 = 0;

	actors: SpotlightActor[] = [];
	activeActor = -1;
	litActors = [false, false, false];
	targetLit = false;
	doubleLit = false;
	houseSpill = false;
	windowHit = false;
	reflectionFlash = 0;
	modePulse = 0;

	statusText = "";
	statusColor = "#d8cbbb";
	feedbackMs = 0;

	overlayVisible = false;
	overlayEyebrow = "";
	overlayTitle = "";
	overlayBody = "";
	overlayHint = "";
	overlayColor = "#f3e7ce";

	cueBanner = "";
	userPaused = false;

	private app!: Application;
	private scene!: SpotlightScene;
	private hud!: SpotlightHUD;
	private cueGoodMs = 0;
	private cueDoubleMs = 0;
	private cueSpillMs = 0;
	private windowHeatMs = 0;
	private windowCooldownMs = 0;
	private curtainTarget = 1;
	private footstepTimer = 0;
	private footstepBeat = 0;
	private failureReason = "";
	private startRequested = false;
	private restartRequested = false;

	override onResetEvent(app: Application): void {
		this.app = app;
		app.reset();

		this.actors = ACTORS.map((actor, index) => ({
			...actor,
			markX: ACTOR_MARKS[index] as number,
			x: ACTOR_MARKS[index] as number,
			y: ACTOR_FEET_Y,
			active: false,
		}));
		this.scene = new SpotlightScene(this);
		this.hud = new SpotlightHUD();
		app.world.addChild(this.scene, 10);
		app.world.addChild(this.hud, 1000);

		this.bindControls(app);
		event.on(event.KEYDOWN, this.onKeyDown);
		this.resetShow();
		this.syncHud();
	}

	override onDestroyEvent(app: Application): void {
		event.off(event.KEYDOWN, this.onKeyDown);
		input.releasePointerEvent("pointermove", app.viewport);
		input.releasePointerEvent("pointerdown", app.viewport);
		input.unbindKey(input.KEY.P);
		input.unbindKey(input.KEY.ESC);
		input.unbindKey(input.KEY.R);
		input.unbindKey(input.KEY.SPACE);
		input.unbindKey(input.KEY.NUM1);
		input.unbindKey(input.KEY.NUM2);
		input.unbindKey(input.KEY.NUM3);
		input.unbindKey(input.KEY.NUMPAD1);
		input.unbindKey(input.KEY.NUMPAD2);
		input.unbindKey(input.KEY.NUMPAD3);
		if (this.userPaused) {
			state.resume();
			this.userPaused = false;
		}
	}

	override update(dt: number): boolean {
		if (state.isPaused()) {
			this.syncOverlay();
			this.syncHud();
			super.update(dt);
			return true;
		}

		if (this.startRequested) {
			this.startRequested = false;
			this.startShow();
		}
		if (this.restartRequested) {
			this.restartRequested = false;
			this.restartShow();
		}

		this.time += dt;
		this.feedbackMs = Math.max(0, this.feedbackMs - dt);
		this.modePulse = Math.max(0, this.modePulse - dt / 320);
		this.reflectionFlash = Math.max(0, this.reflectionFlash - dt / 760);
		this.windowCooldownMs = Math.max(0, this.windowCooldownMs - dt);

		const curtainSpeed = this.phase === "failed" ? 4.6 : 2.5;
		this.curtainOpen = Math.min(
			1,
			this.curtainOpen +
				(this.curtainTarget - this.curtainOpen) *
					(1 - Math.exp((-curtainSpeed * dt) / 1000)),
		);

		this.updateActors();
		this.measureSpotlight();

		if (this.phase === "ready") {
			this.statusText =
				"MOVE THE MOUSE · TEST THE BEAMS · CLICK OR SPACE TO BEGIN";
			this.statusColor = "#c9b89f";
		} else if (this.phase === "playing") {
			this.updatePlaying(dt);
		} else if (this.phase === "curtainCall") {
			this.finaleTime += dt;
		}

		this.syncOverlay();
		this.syncHud();
		super.update(dt);
		return true;
	}

	get beam(): BeamSpec {
		return BEAMS[this.beamIndex] as BeamSpec;
	}

	get activeName(): string {
		const actor = this.actors[this.activeActor];
		return actor ? actor.name : "";
	}

	get windowHeat(): number {
		return Math.min(1, this.windowHeatMs / WINDOW_TRIGGER_MS);
	}

	private bindControls(app: Application): void {
		input.bindKey(input.KEY.P, "spotPause", true);
		input.bindKey(input.KEY.ESC, "spotPause", true);
		input.bindKey(input.KEY.R, "spotRestart", true);
		input.bindKey(input.KEY.SPACE, "spotStart", true);
		input.bindKey(input.KEY.NUM1, "spotWarm", true);
		input.bindKey(input.KEY.NUM2, "spotCool", true);
		input.bindKey(input.KEY.NUM3, "spotNarrow", true);
		input.bindKey(input.KEY.NUMPAD1, "spotWarm", true);
		input.bindKey(input.KEY.NUMPAD2, "spotCool", true);
		input.bindKey(input.KEY.NUMPAD3, "spotNarrow", true);

		input.registerPointerEvent("pointermove", app.viewport, this.onPointerMove);
		input.registerPointerEvent("pointerdown", app.viewport, this.onPointerDown);
	}

	private readonly onKeyDown = (
		action: string | undefined,
		_keyCode: number,
		edge: boolean,
	): void => {
		if (action === undefined || !edge) {
			return;
		}
		if (state.isPaused() && action !== "spotPause") {
			return;
		}
		switch (action) {
			case "spotPause":
				this.togglePause();
				break;
			case "spotRestart":
				this.restartShow();
				break;
			case "spotStart":
				this.startShow();
				break;
			case "spotWarm":
				this.setBeam(0);
				break;
			case "spotCool":
				this.setBeam(1);
				break;
			case "spotNarrow":
				this.setBeam(2);
				break;
		}
	};

	private readonly onPointerMove = (event: Pointer): boolean => {
		this.aimX = Math.max(0, Math.min(VIEW_W, event.gameScreenX));
		this.aimY = Math.max(0, Math.min(VIEW_H, event.gameScreenY));
		return false;
	};

	private readonly onPointerDown = (): boolean => {
		if (this.userPaused) {
			this.togglePause();
			return false;
		}
		if (this.phase === "ready") {
			this.startRequested = true;
		} else if (this.phase === "failed" || this.phase === "curtainCall") {
			this.restartRequested = true;
		}
		return false;
	};

	private togglePause(): void {
		if (this.userPaused) {
			this.userPaused = false;
			state.resume();
			return;
		}
		if (
			!state.isPaused() &&
			(this.phase === "ready" || this.phase === "playing")
		) {
			this.userPaused = true;
			state.pause();
		}
	}

	private setBeam(index: 0 | 1 | 2): void {
		if (this.beamIndex === index) {
			return;
		}
		this.beamIndex = index;
		this.modePulse = 1;
		playModeSwitch(index);
		if (this.phase === "ready") {
			this.setFeedback(`${this.beam.label} BEAM READY`, this.beam.rim, 620);
		}
	}

	private resetShow(): void {
		this.phase = "ready";
		this.cueIndex = 0;
		this.cueActive = false;
		this.cueElapsed = 0;
		this.cueBannerMs = 0;
		this.finaleTime = 0;
		this.curtainTarget = 1;
		this.activeActor = -1;
		this.misses = 0;
		this.reflections = 0;
		this.cueGoodMs = 0;
		this.cueDoubleMs = 0;
		this.cueSpillMs = 0;
		this.windowHeatMs = 0;
		this.windowCooldownMs = 0;
		this.reflectionFlash = 0;
		this.failureReason = "";
		this.feedbackMs = 0;
		this.userPaused = false;
		this.aimX = VIEW_W / 2;
		this.aimY = ACTOR_FOCUS_Y;
		this.actors.forEach((actor) => {
			actor.x = actor.markX;
			actor.active = false;
		});
	}

	private startShow(): void {
		if (this.phase !== "ready") {
			return;
		}
		this.phase = "playing";
		this.cueIndex = 0;
		this.misses = 0;
		this.reflections = 0;
		this.windowHeatMs = 0;
		this.windowCooldownMs = 0;
		this.reflectionFlash = 0;
		this.curtainTarget = 1;
		this.startCue();
	}

	private restartShow(): void {
		if (this.phase !== "failed" && this.phase !== "curtainCall") {
			return;
		}
		this.resetShow();
		this.startShow();
	}

	private startCue(): void {
		const actorIndex = CUE_PLAN[this.cueIndex] as 0 | 1 | 2;
		this.activeActor = actorIndex;
		this.cueActive = true;
		this.cueElapsed = 0;
		this.cueGoodMs = 0;
		this.cueDoubleMs = 0;
		this.cueSpillMs = 0;
		this.cueBannerMs = 1450;
		this.footstepTimer = 220;
		this.footstepBeat = 0;
		const actor = this.actors[this.activeActor];
		this.cueBanner = actor
			? `CUE ${this.cueIndex + 1} — ${actor.name} · ${actor.role.toUpperCase()}`
			: `CUE ${this.cueIndex + 1}`;
		playCueBell();
	}

	private updateActors(): void {
		const activeNow = this.phase === "playing" && this.cueActive;
		for (let i = 0; i < this.actors.length; i++) {
			const actor = this.actors[i] as SpotlightActor;
			actor.active = activeNow && i === this.activeActor;
			if (actor.active) {
				actor.x = actor.markX + Math.sin(this.cueElapsed / 390 + i * 0.7) * 30;
			} else {
				actor.x = actor.markX + Math.sin(this.time / 1200 + i * 1.9) * 3;
			}
			actor.y = ACTOR_FEET_Y;
		}
	}

	private measureSpotlight(): void {
		const beam = this.beam;
		let litCount = 0;
		for (let i = 0; i < this.actors.length; i++) {
			const actor = this.actors[i] as SpotlightActor;
			const dx = (actor.x - this.aimX) / beam.radiusX;
			const dy = (ACTOR_FOCUS_Y - this.aimY) / beam.radiusY;
			const lit = dx * dx + dy * dy <= 1;
			this.litActors[i] = lit;
			if (lit) {
				litCount++;
			}
		}
		this.targetLit =
			this.cueActive &&
			this.activeActor >= 0 &&
			this.litActors[this.activeActor] === true;
		this.doubleLit = this.cueActive && litCount > 1;
		this.houseSpill =
			this.aimY + beam.radiusY * 0.48 >= AUDIENCE_Y &&
			this.aimX > 14 &&
			this.aimX < VIEW_W - 14;
		this.windowHit = ellipseIntersectsRect(
			this.aimX,
			this.aimY,
			beam.radiusX,
			beam.radiusY,
			WINDOW,
		);
	}

	private updatePlaying(dt: number): void {
		if (this.cueActive) {
			this.cueElapsed += dt;
			this.cueBannerMs = Math.max(0, this.cueBannerMs - dt);
			this.cueGoodMs +=
				this.targetLit && !this.doubleLit && !this.houseSpill ? dt : 0;
			this.cueDoubleMs += this.doubleLit ? dt : 0;
			this.cueSpillMs += this.houseSpill ? dt : 0;

			this.footstepTimer -= dt;
			if (this.footstepTimer <= 0) {
				playFootstep(
					this.actors[this.activeActor]?.x ?? this.aimX,
					this.footstepBeat,
				);
				this.footstepBeat++;
				this.footstepTimer = 460;
			}

			if (this.cueElapsed >= PERFORM_MS) {
				this.finishCue();
			}
		} else {
			this.updateBetweenCues(dt);
		}

		if (this.phase !== "playing") {
			return;
		}
		this.updateWindow(dt);
		this.updateLiveStatus();
	}

	private updateBetweenCues(dt: number): void {
		this.cueElapsed = 0;
		this.cueBannerMs = 0;
		if (this.cueIndex >= CUE_COUNT) {
			this.curtainCall();
			return;
		}
		const restElapsed = Math.max(0, this.restClock + dt);
		if (restElapsed >= REST_MS) {
			this.cueIndex++;
			if (this.cueIndex >= CUE_COUNT) {
				this.curtainCall();
			} else {
				this.startCue();
			}
		} else {
			this.restClock = restElapsed;
		}
	}

	private restClock = 0;

	private finishCue(): void {
		const ratio = this.cueGoodMs / Math.max(1, this.cueElapsed);
		let missReason = "";
		if (this.cueDoubleMs >= 300) {
			missReason = "DOUBLE LIT";
		} else if (this.cueSpillMs >= 280) {
			missReason = "HOUSE SPILL";
		} else if (ratio < 0.62) {
			missReason = "LIGHT LOST";
		}

		if (missReason.length > 0) {
			this.misses++;
			this.setFeedback(
				`CUE ${this.cueIndex + 1} MISSED — ${missReason}`,
				"#ff7a78",
				1300,
			);
			playMissedCue();
			playHouseGasp();
			this.app.viewport.shake(4, 240);
			if (this.misses >= MAX_MISSES) {
				this.fail("THREE CUES MISSED");
				return;
			}
		} else {
			this.setFeedback(
				`CUE ${this.cueIndex + 1} CLEAN — ${Math.round(ratio * 100)}% FOCUS`,
				"#9adf93",
				1100,
			);
			playCleanCue();
		}

		this.cueActive = false;
		this.cueBannerMs = 0;
		this.restClock = 0;
		this.activeActor = -1;
	}

	private updateWindow(dt: number): void {
		const beam = this.beam;
		if (this.windowHit) {
			this.windowHeatMs = Math.min(
				WINDOW_TRIGGER_MS,
				this.windowHeatMs + dt * beam.reflectionRate,
			);
			if (
				this.windowHeatMs >= WINDOW_TRIGGER_MS &&
				this.windowCooldownMs <= 0
			) {
				this.triggerGlare();
			}
		} else {
			this.windowHeatMs = Math.max(0, this.windowHeatMs - dt * 0.55);
		}
	}

	private triggerGlare(): void {
		this.reflections++;
		this.windowHeatMs = 0;
		this.windowCooldownMs = WINDOW_COOLDOWN_MS;
		this.reflectionFlash = 1;
		this.setFeedback(
			`WINDOW GLARE — ${this.reflections} / ${MAX_GLARES}`,
			"#fff2b8",
			1500,
		);
		playWindowGlare();
		playHouseGasp();
		this.app.viewport.shake(9, 420);
		if (this.reflections >= MAX_GLARES) {
			this.fail("TWO SEVERE WINDOW GLARES");
		}
	}

	private curtainCall(): void {
		this.phase = "curtainCall";
		this.cueActive = false;
		this.activeActor = -1;
		this.curtainTarget = 1;
		this.finaleTime = 0;
		this.setFeedback("EIGHT CUES COMPLETE — BRAVO", "#f6dc96", 2200);
		playCurtainCall();
	}

	private fail(reason: string): void {
		this.phase = "failed";
		this.failureReason = reason;
		this.cueActive = false;
		this.activeActor = -1;
		this.curtainTarget = 0.24;
		this.finaleTime = 0;
		this.setFeedback(`PERFORMANCE HALTED — ${reason}`, "#ff7a78", 2200);
		playBoo();
		this.app.viewport.shake(10, 520);
	}

	private updateLiveStatus(): void {
		if (this.feedbackMs > 0) {
			return;
		}
		if (!this.cueActive) {
			this.statusText = `RESET THE LIGHT · NEXT CUE ${Math.min(this.cueIndex + 2, CUE_COUNT)}`;
			this.statusColor = "#c9b89f";
		} else if (this.doubleLit) {
			this.statusText = "DOUBLE LIT — PULL THE BEAM APART";
			this.statusColor = "#ff7a78";
		} else if (this.houseSpill) {
			this.statusText = "HOUSE SPILL — KEEP THE LIGHT ON STAGE";
			this.statusColor = "#ff7a78";
		} else if (this.windowHit) {
			this.statusText = "WINDOW GLARE BUILDING — MOVE OFF THE GLASS";
			this.statusColor = "#ffe49c";
		} else if (!this.targetLit) {
			this.statusText = `HOLD ${this.activeName} IN THE LIGHT`;
			this.statusColor = "#e3b98a";
		} else {
			this.statusText = `CLEAN FOCUS — HOLD ${this.activeName}`;
			this.statusColor = "#9adf93";
		}
	}

	private setFeedback(text: string, color: string, duration: number): void {
		this.feedbackMs = duration;
		this.statusText = text;
		this.statusColor = color;
	}

	private syncOverlay(): void {
		this.overlayVisible = false;
		if (this.userPaused) {
			this.overlayVisible = true;
			this.overlayEyebrow = "STAGE MANAGER";
			this.overlayTitle = "INTERMISSION";
			this.overlayBody = "The cue clock is stopped. The curtain will wait.";
			this.overlayHint = "P / ESC OR CLICK TO RESUME";
			this.overlayColor = "#f3e7ce";
			return;
		}
		if (this.phase === "ready") {
			this.overlayVisible = true;
			this.overlayEyebrow = "A ONE-LIGHT PERFORMANCE";
			this.overlayTitle = "THE LAST SPOTLIGHT";
			this.overlayBody =
				"Three actors are on stage. Keep one in the beam through eight cues.\nNever catch two. Never spill into the house. Never wake the window.";
			this.overlayHint = "CLICK OR PRESS SPACE TO BEGIN";
			this.overlayColor = "#f3e7ce";
			return;
		}
		if (this.phase === "failed") {
			this.overlayVisible = true;
			this.overlayEyebrow = "THE HOUSE IS WATCHING";
			this.overlayTitle = "PERFORMANCE HALTED";
			this.overlayBody = `${this.failureReason}.\nMISSES ${this.misses} / ${MAX_MISSES}     GLARES ${this.reflections} / ${MAX_GLARES}`;
			this.overlayHint = "R OR CLICK TO RESTART THE SHOW";
			this.overlayColor = "#ff8d82";
			return;
		}
		if (this.phase === "curtainCall") {
			this.overlayVisible = true;
			this.overlayEyebrow = "EIGHT CUES · ONE BEAM";
			this.overlayTitle = "CURTAIN CALL";
			this.overlayBody = `Every cue played. The house is on its feet.\nMISSES ${this.misses} / ${MAX_MISSES}     GLARES ${this.reflections} / ${MAX_GLARES}`;
			this.overlayHint = "R OR CLICK FOR AN ENCORE";
			this.overlayColor = "#ffe198";
		}
	}

	private syncHud(): void {
		this.hud.sync(this);
	}
}
