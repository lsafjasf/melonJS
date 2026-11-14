/**
 * melonJS — Lighthouse Relay rules and state.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * The two-keyboard collaboration lives here, independent of rendering:
 * P1 chooses a bearing and holds the lamp for a short or long pulse; the
 * ship repeats that pulse three times; P2 must read the echo and send the
 * same code back with the relay lamp. Three matched handshakes bring the
 * vessel into the cleared berth.
 */

import {
	playAim,
	playBeamStart,
	playBeamStop,
	playBeat,
	playEchoPulse,
	playError,
	playHandshake,
	playHeatCritical,
	playHeatWarning,
	playLensClear,
	playSelect,
	playSend,
	playWin,
} from "./audio";
import {
	type Aim,
	BEAT_MS,
	CLEARANCE_SEQUENCE,
	type Code,
	codeAim,
	codeBerth,
	ECHO_LONG_MS,
	ECHO_SHORT_MS,
	ECHO_STEP_MS,
	ECHO_TAIL_MS,
	HEAT_COOL_PER_SECOND,
	HEAT_CRITICAL,
	HEAT_GAIN_PER_SECOND,
	HEAT_LOCK_RELEASE,
	HEAT_WARN,
	LONG_MAX,
	LONG_MIN,
	SHORT_MAX,
	SHORT_MIN,
	TOTAL_HANDSHAKES,
	type Tone,
	WEAR_PER_TURN,
} from "./constants";

export type Phase =
	| "aim"
	| "beaming"
	| "echo"
	| "reply"
	| "success"
	| "won"
	| "jammed";

export interface RelayInput {
	aimLeft: boolean;
	aimRight: boolean;
	beamHeld: boolean;
	replyShort: boolean;
	replyLong: boolean;
	send: boolean;
	restart: boolean;
}

interface EchoBurst {
	start: number;
	duration: number;
	triggered: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export const classifyPulse = (seconds: number): Code | null => {
	if (seconds >= SHORT_MIN && seconds <= SHORT_MAX) {
		return "short";
	}
	if (seconds >= LONG_MIN && seconds <= LONG_MAX) {
		return "long";
	}
	return null;
};

export class RelayModel {
	phase: Phase = "aim";
	clearance: Code = CLEARANCE_SEQUENCE[0];
	aim: Aim = "left";
	beamOn = false;
	beamElapsed = 0;
	beamSuppressed = false;

	wear = 0;
	heat = 0;
	lensLocked = false;

	handshakes = 0;
	shipProgress = 0;
	shipTarget = 0;

	echoCode: Code | null = null;
	echoElapsed = 0;
	echoBursts: EchoBurst[] = [];

	replyCode: Code | null = null;
	replyMismatch = false;

	handshakeLog: string[] = [];

	messageP1 = "";
	messageP2 = "";
	toneP1: Tone = "info";
	toneP2: Tone = "info";

	beatTimer = 0;
	beatIndex = 0;
	beatPulse = 0;
	heatWarningTimer = 0;
	heatBand = 0;
	criticalCueArmed = true;

	successElapsed = 0;
	alertFlash = 0;
	relayFlash = 0;
	lensFlash = 0;

	constructor() {
		this.resetDrill();
	}

	resetDrill(): void {
		this.phase = "aim";
		this.clearance = CLEARANCE_SEQUENCE[0];
		this.aim = "left";
		this.beamOn = false;
		this.beamElapsed = 0;
		this.beamSuppressed = false;
		this.wear = 0;
		this.heat = 0;
		this.lensLocked = false;
		this.handshakes = 0;
		this.shipProgress = 0;
		this.shipTarget = 0;
		this.echoCode = null;
		this.echoElapsed = 0;
		this.echoBursts = [];
		this.replyCode = null;
		this.replyMismatch = false;
		this.handshakeLog = [];
		this.messageP1 =
			"SHIP REPORTS A BERTH CLEARANCE. SET THE ANGLE, THEN HOLD S FOR THE MATCHING PULSE.";
		this.messageP2 =
			"NO RETURN YET. WAIT FOR THE SHIP TO REPEAT P1'S PULSE THREE TIMES.";
		this.toneP1 = "info";
		this.toneP2 = "info";
		this.beatTimer = 0;
		this.beatIndex = 0;
		this.beatPulse = 0;
		this.heatWarningTimer = 0;
		this.heatBand = 0;
		this.criticalCueArmed = true;
		this.successElapsed = 0;
		this.alertFlash = 0;
		this.relayFlash = 0;
		this.lensFlash = 0;
	}

	get berth(): "A" | "B" {
		return codeBerth(this.clearance);
	}

	get expectedAim(): Aim {
		return codeAim(this.clearance);
	}

	get echoDuration(): number {
		if (this.echoCode === null) {
			return 0;
		}
		const pulseDuration =
			this.echoCode === "short" ? ECHO_SHORT_MS : ECHO_LONG_MS;
		return ECHO_STEP_MS * 2 + pulseDuration + ECHO_TAIL_MS;
	}

	get receivedBursts(): number {
		return this.echoBursts.reduce(
			(count, burst) => count + (this.echoElapsed >= burst.start ? 1 : 0),
			0,
		);
	}

	get prompt(): string {
		switch (this.phase) {
			case "beaming":
				return "TRANSMITTING · RELEASE INSIDE A CODE WINDOW";
			case "echo":
				return "SHIP RETURNING THE PULSE";
			case "reply":
				return "P2: MATCH THE THREE ECHOES · [ENTER] SEND";
			case "success":
				return `HANDSHAKE ${this.handshakes} / ${TOTAL_HANDSHAKES} CLOSED · SHIP ADVANCING`;
			case "won":
				return "BERTH SECURED · THREE HANDSHAKES CLOSED";
			case "jammed":
				return "TURNTABLE JAMMED · PRESS R TO RE-RUN";
			default:
				if (this.lensLocked) {
					return "LENS OVERHEATED · WAIT FOR THE HEAT TO FALL";
				}
				return "P1: ALIGN THE BEAM · HOLD S";
		}
	}

	get p2Status(): string {
		if (this.phase === "won") {
			return "ALL 3 HANDSHAKES CLOSED";
		}
		if (this.phase === "jammed") {
			return "RELAY WAITING FOR REPAIR";
		}
		if (this.lensLocked) {
			return "LENS LOCKED · COOLING";
		}
		if (this.replyMismatch) {
			return "REPLY MISMATCH";
		}
		if (this.phase === "success") {
			return `HANDSHAKE ${this.handshakes} / 3 CLOSED`;
		}
		if (this.phase === "reply") {
			return this.echoCode
				? `RECEIVED · ${this.echoCode.toUpperCase()} ×3`
				: "WAITING FOR ECHO";
		}
		if (this.phase === "echo") {
			if (this.receivedBursts >= 3) {
				return this.echoCode
					? `RECEIVED · ${this.echoCode.toUpperCase()} ×3`
					: "WAITING FOR ECHO";
			}
			return this.receivedBursts > 0
				? "RETURN ECHO INBOUND"
				: "WAITING FOR ECHO";
		}
		if (this.phase === "beaming") {
			return "WAITING FOR ECHO";
		}
		return "WAITING FOR ECHO";
	}

	get p1PulseStatus(): string {
		if (this.phase === "jammed") {
			return "BEARING JAMMED";
		}
		if (this.phase === "won") {
			return "BERTH SECURED";
		}
		if (this.lensLocked) {
			return "LENS LOCKED · COOLING";
		}
		if (this.phase === "beaming") {
			const code = classifyPulse(this.beamElapsed);
			const shown = this.beamElapsed.toFixed(1);
			if (code) {
				return `${shown}s · ${code.toUpperCase()}`;
			}
			return this.beamElapsed < SHORT_MIN
				? `${shown}s · TOO SHORT`
				: `${shown}s · OUT OF WINDOW`;
		}
		if (this.echoCode && this.phase !== "aim") {
			return `${this.echoCode.toUpperCase()} ECHO · LINK ${this.handshakes + 1} / 3`;
		}
		return "HOLD S TO TRANSMIT";
	}

	get p2Message(): string {
		if (this.lensLocked) {
			return "SHARED LENS OVERHEATED. THE BEAM IS LOCKED UNTIL HEAT FALLS BELOW 55%. HOLD THE NEXT PULSE.";
		}
		return this.messageP2;
	}

	update(dt: number, keys: RelayInput): void {
		const seconds = Math.min(dt, 80) / 1000;

		this.alertFlash = Math.max(0, this.alertFlash - seconds * 1.3);
		this.relayFlash = Math.max(0, this.relayFlash - seconds * 2.4);
		this.lensFlash = Math.max(0, this.lensFlash - seconds * 1.8);

		if (this.phase !== "won" && this.phase !== "jammed") {
			this.beatTimer += dt;
			while (this.beatTimer >= BEAT_MS) {
				this.beatTimer -= BEAT_MS;
				this.beatIndex = (this.beatIndex + 1) % 4;
				playBeat(this.beatIndex);
			}
			this.beatPulse = 1 - this.beatTimer / BEAT_MS;
		}

		this.updateHeat(seconds);
		this.updateShip(seconds);

		if (keys.restart && (this.phase === "won" || this.phase === "jammed")) {
			this.resetDrill();
			return;
		}

		if (keys.replyShort && this.phase !== "won" && this.phase !== "jammed") {
			this.selectReply("short");
		}
		if (keys.replyLong && this.phase !== "won" && this.phase !== "jammed") {
			this.selectReply("long");
		}
		if (keys.send) {
			this.sendReply();
		}

		if (this.phase === "aim" && this.wear < 100) {
			if (keys.aimLeft) {
				this.changeAim("left");
			}
			if (keys.aimRight) {
				this.changeAim("right");
			}
		}

		if (!keys.beamHeld) {
			this.beamSuppressed = false;
		}

		if (
			this.phase === "aim" &&
			keys.beamHeld &&
			!this.beamSuppressed &&
			!this.lensLocked
		) {
			this.startBeam();
		}

		if (this.phase === "beaming") {
			if (!keys.beamHeld) {
				this.finishBeam();
			} else {
				this.beamElapsed += seconds;
				if (this.beamElapsed >= 1.5) {
					this.finishBeam();
				}
			}
		}

		if (this.phase === "echo") {
			this.updateEcho(dt);
		}

		if (this.phase === "success") {
			this.successElapsed += dt;
			if (this.successElapsed >= 1700) {
				if (this.handshakes >= TOTAL_HANDSHAKES) {
					this.phase = "won";
					this.messageP1 = "THE SHIP IS MOORED. BERTH CLEARANCE COMPLETE.";
					this.messageP2 = "ALL THREE RETURNS VERIFIED. SAFE ENTRY CONFIRMED.";
					this.toneP1 = "good";
					this.toneP2 = "good";
					playWin();
				} else {
					this.startNextRound();
				}
			}
		}
	}

	private updateHeat(seconds: number): void {
		if (this.beamOn) {
			this.heat = clamp(this.heat + HEAT_GAIN_PER_SECOND * seconds, 0, 100);
			if (this.heat >= 100) {
				this.overheat();
			}
		} else {
			this.heat = clamp(this.heat - HEAT_COOL_PER_SECOND * seconds, 0, 100);
		}

		if (this.lensLocked && this.heat <= HEAT_LOCK_RELEASE) {
			this.lensLocked = false;
			this.heatBand = 0;
			this.criticalCueArmed = true;
			this.messageP2 =
				"SHARED LENS BACK IN THE SAFE RANGE. THE BEAM IS AVAILABLE AGAIN.";
			this.toneP2 = "good";
			playLensClear();
		}

		const band =
			this.heat >= HEAT_CRITICAL ? 2 : this.heat >= HEAT_WARN ? 1 : 0;
		if (band !== this.heatBand) {
			if (band === 2 && this.criticalCueArmed) {
				playHeatCritical();
				this.alertFlash = 1;
				this.criticalCueArmed = false;
			} else if (band === 1) {
				playHeatWarning();
				this.heatWarningTimer = 0;
			}
			this.heatBand = band;
		}
		if (band >= 1) {
			this.heatWarningTimer += seconds * 1000;
			if (this.heatWarningTimer >= 1400) {
				this.heatWarningTimer = 0;
				if (band === 2) {
					playHeatCritical();
					this.alertFlash = 1;
				} else {
					playHeatWarning();
				}
			}
		} else {
			this.heatWarningTimer = 0;
			this.criticalCueArmed = true;
		}
	}

	private updateShip(seconds: number): void {
		const delta = this.shipTarget - this.shipProgress;
		const step = Math.abs(delta) * (1 - Math.exp(-2.5 * seconds));
		if (Math.abs(delta) < 0.05) {
			this.shipProgress = this.shipTarget;
		} else {
			this.shipProgress += Math.sign(delta) * step;
		}
	}

	private changeAim(nextAim: Aim): void {
		if (this.aim === nextAim || this.phase !== "aim") {
			return;
		}
		this.aim = nextAim;
		this.wear = clamp(this.wear + WEAR_PER_TURN, 0, 100);
		playAim();
		if (this.wear >= 100) {
			this.phase = "jammed";
			this.beamOn = false;
			this.messageP1 =
				"TURNTABLE BEARING JAMMED. THE DRILL CANNOT CONTINUE. PRESS R TO RE-RUN.";
			this.messageP2 =
				"THE TURNTABLE IS JAMMED. WAIT FOR P1 TO RE-RUN THE DRILL.";
			this.toneP1 = "bad";
			this.toneP2 = "bad";
			return;
		}
		this.messageP1 =
			this.aim === this.expectedAim
				? "BEARING ALIGNED WITH THE CLEARANCE. HOLD S FOR THE MATCHING PULSE."
				: "BEARING MOVED. CHECK WHICH BERTH THE SHIP IS CLEARED FOR.";
		this.toneP1 = this.aim === this.expectedAim ? "good" : "warn";
	}

	private startBeam(): void {
		this.phase = "beaming";
		this.beamOn = true;
		this.beamElapsed = 0;
		this.lensFlash = 1;
		this.messageP1 =
			"BEAM OPEN. RELEASE BETWEEN 0.20-0.52s FOR SHORT, OR 0.72-1.24s FOR LONG.";
		this.messageP2 = "RETURN CHANNEL OPEN. WAIT FOR THREE RETURN FLASHES.";
		this.toneP1 = "info";
		this.toneP2 = "info";
		playBeamStart();
	}

	private finishBeam(): void {
		const duration = this.beamElapsed;
		const code = classifyPulse(duration);
		this.beamOn = false;
		this.phase = "aim";
		playBeamStop();

		if (code === null) {
			this.messageP1 =
				"PULSE REJECTED. RELEASE BETWEEN 0.20-0.52s (SHORT) OR 0.72-1.24s (LONG).";
			this.messageP2 = "NO VALID RETURN. P1 MUST REPEAT THE PULSE.";
			this.toneP1 = "bad";
			this.toneP2 = "warn";
			playError();
			return;
		}

		if (this.aim !== this.expectedAim) {
			this.messageP1 =
				"SHIP DID NOT RECEIVE THE PULSE. CHECK THE CLEARANCE BERTH AND THE BEAM ANGLE.";
			this.messageP2 = "NO RETURN ECHO. THE BEAM IS OFF THE SHIP'S BEARING.";
			this.toneP1 = "bad";
			this.toneP2 = "warn";
			playError();
			return;
		}

		this.startEcho(code);
	}

	private startEcho(code: Code): void {
		this.phase = "echo";
		this.echoCode = code;
		this.echoElapsed = 0;
		this.replyCode = null;
		this.replyMismatch = false;
		const duration = code === "short" ? ECHO_SHORT_MS : ECHO_LONG_MS;
		this.echoBursts = [0, 1, 2].map((index) => ({
			start: index * ECHO_STEP_MS,
			duration,
			triggered: false,
		}));
		this.messageP1 =
			"PULSE CLEARED. THE SHIP IS RETURNING THE SAME CODE THREE TIMES.";
		this.messageP2 =
			"RETURN ECHO INBOUND. COUNT THE THREE PULSES AND NOTE THEIR LENGTH.";
		this.toneP1 = "good";
		this.toneP2 = "info";
	}

	private updateEcho(dt: number): void {
		this.echoElapsed += dt;
		for (let index = 0; index < this.echoBursts.length; index++) {
			const burst = this.echoBursts[index];
			if (!burst.triggered && this.echoElapsed >= burst.start) {
				burst.triggered = true;
				this.lensFlash = 1;
				if (this.echoCode) {
					playEchoPulse(this.echoCode, index);
				}
			}
		}
		if (this.echoElapsed >= this.echoDuration) {
			this.phase = "reply";
			this.messageP1 = "ECHO SENT. WAIT FOR P2 TO CONFIRM ON THE RELAY LAMP.";
			this.messageP2 =
				"SELECT THE MATCHING CODE, THEN SEND CONFIRMATION [ENTER].";
			this.toneP1 = "info";
			this.toneP2 = "warn";
		}
	}

	private selectReply(code: Code): void {
		if (this.replyCode !== code) {
			this.replyCode = code;
			this.replyMismatch = false;
			playSelect();
			this.relayFlash = 1;
			if (this.phase === "reply") {
				this.messageP2 = "CODE SELECTED. PRESS ENTER TO SEND CONFIRMATION.";
				this.toneP2 = "info";
			}
		}
	}

	private sendReply(): void {
		if (this.phase === "won" || this.phase === "jammed") {
			return;
		}
		if (this.phase !== "reply") {
			this.messageP2 = "WAIT FOR ALL THREE RETURN FLASHES BEFORE SENDING.";
			this.toneP2 = "warn";
			playError();
			return;
		}
		if (this.replyCode === null) {
			this.messageP2 = "SELECT SHORT OR LONG FIRST, THEN PRESS ENTER.";
			this.toneP2 = "warn";
			playError();
			return;
		}

		this.relayFlash = 1;
		if (this.replyCode !== this.echoCode) {
			this.replyMismatch = true;
			this.heat = clamp(this.heat + 4, 0, 100);
			this.messageP2 = "REPLY MISMATCH. WATCH THE ECHO AND TRY AGAIN.";
			this.toneP2 = "bad";
			this.messageP1 = "RELAY NOT CONFIRMED. STAND BY FOR ANOTHER RETURN.";
			this.toneP1 = "warn";
			playError();
			return;
		}

		playSend();
		this.closeHandshake();
	}

	private closeHandshake(): void {
		this.handshakes++;
		if (this.echoCode) {
			this.handshakeLog.push(
				`R${this.handshakes} ${this.echoCode.toUpperCase()}`,
			);
		}
		this.shipTarget = (this.handshakes / TOTAL_HANDSHAKES) * 100;
		this.phase = "success";
		this.successElapsed = 0;
		this.replyMismatch = false;
		this.messageP1 =
			this.handshakes >= TOTAL_HANDSHAKES
				? "FINAL PULSE CLEARED. THE SHIP IS ENTERING THE BERTH."
				: `PULSE CLEARED. HANDSHAKE ${this.handshakes} OF ${TOTAL_HANDSHAKES} CLOSED.`;
		this.messageP2 =
			this.handshakes >= TOTAL_HANDSHAKES
				? "ALL THREE RETURNS VERIFIED. SAFE ENTRY CONFIRMED."
				: `HANDSHAKE ${this.handshakes} CLOSED. WAITING FOR THE NEXT RETURN ECHO.`;
		this.toneP1 = "good";
		this.toneP2 = "good";
		playHandshake();
	}

	private startNextRound(): void {
		this.phase = "aim";
		this.clearance =
			CLEARANCE_SEQUENCE[this.handshakes] ??
			CLEARANCE_SEQUENCE[CLEARANCE_SEQUENCE.length - 1];
		this.echoCode = null;
		this.echoElapsed = 0;
		this.echoBursts = [];
		this.replyCode = null;
		this.replyMismatch = false;
		this.beamElapsed = 0;
		this.messageP1 = `LINK ${this.handshakes + 1} OF ${TOTAL_HANDSHAKES}. SEND THE NEXT CLEARANCE PULSE.`;
		this.messageP2 = "WAITING FOR THE NEXT RETURN ECHO.";
		this.toneP1 = "warn";
		this.toneP2 = "info";
	}

	private overheat(): void {
		this.heat = 100;
		this.beamOn = false;
		this.phase = "aim";
		this.beamSuppressed = true;
		this.lensLocked = true;
		this.heatBand = 2;
		this.criticalCueArmed = false;
		this.alertFlash = 1;
		this.messageP1 =
			"LENS OVERHEATED. THE BEAM IS LOCKED UNTIL HEAT FALLS BELOW 55%.";
		this.messageP2 =
			"SHARED LENS CRITICAL. HOLD THE NEXT PULSE UNTIL IT COOLS.";
		this.toneP1 = "bad";
		this.toneP2 = "bad";
		playHeatCritical();
	}
}
