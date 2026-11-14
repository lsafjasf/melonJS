// Web Audio engine: wind, paddle strokes and a chime, all synthesised.
// Everything is anchored to the animation clock: start/seek/stop mirror
// the playhead so sound always follows it.

import { DURATION } from "./core.js";

// Paddle strokes while the boat crosses (3s..9s), plus the chime that
// rings when the little person appears.
export const PADDLE_TIMES = [];
for (let t = 3.2; t < 9; t += 0.8) PADDLE_TIMES.push(Number(t.toFixed(2)));
export const CHIME_TIME = 8.6;

export class SoundEngine {
	constructor() {
		this.ctx = null;
		this.master = null;
		this.wind = null; // { source, gain }
		this.anchor = null; // { audioTime, animTime }
		this.scheduled = new Set(); // event keys already queued
		this.timer = null;
		this.enabled = true;
	}

	// Must be called from a user gesture at least once.
	ensureContext() {
		if (this.ctx) {
			if (this.ctx.state === "suspended") this.ctx.resume();
			return;
		}
		const AC = window.AudioContext || window.webkitAudioContext;
		this.ctx = new AC();
		this.master = this.ctx.createGain();
		this.master.gain.value = 0.8;
		this.master.connect(this.ctx.destination);
	}

	get playing() {
		return this.anchor !== null;
	}

	// Current animation time according to the audio clock.
	animTimeNow() {
		if (!this.anchor) return 0;
		return this.anchor.animTime + (this.ctx.currentTime - this.anchor.audioTime);
	}

	// Start (or re-anchor) sound at animation time `fromTime`.
	start(fromTime) {
		if (!this.enabled) return;
		this.ensureContext();
		this.stop();
		this.anchor = { audioTime: this.ctx.currentTime + 0.05, animTime: fromTime };
		this.scheduled.clear();
		this._startWind();
		this.timer = setInterval(() => this._pump(), 100);
		this._pump();
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this._stopWind();
		this.anchor = null;
		this.scheduled.clear();
	}

	// Re-anchor after the user drags the playhead while playing.
	seek(time) {
		if (this.playing) this.start(time);
	}

	// Re-anchor after the playhead wraps around the loop.
	notifyLoop(time) {
		if (this.playing) this.start(time);
	}

	_makeNoiseBuffer(seconds) {
		const rate = this.ctx.sampleRate;
		const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		return buffer;
	}

	_startWind() {
		const source = this.ctx.createBufferSource();
		source.buffer = this._makeNoiseBuffer(4);
		source.loop = true;
		const filter = this.ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 420;
		filter.Q.value = 0.6;
		const gain = this.ctx.createGain();
		const t0 = this.anchor.audioTime;
		gain.gain.setValueAtTime(0, t0);
		gain.gain.linearRampToValueAtTime(0.16, t0 + 1.2);
		// gentle swell so the wind breathes
		const lfo = this.ctx.createOscillator();
		lfo.frequency.value = 0.25;
		const lfoGain = this.ctx.createGain();
		lfoGain.gain.value = 0.05;
		lfo.connect(lfoGain).connect(gain.gain);
		source.connect(filter).connect(gain).connect(this.master);
		source.start(t0);
		lfo.start(t0);
		this.wind = { source, gain, lfo };
	}

	_stopWind() {
		if (!this.wind) return;
		const { source, gain, lfo } = this.wind;
		const now = this.ctx.currentTime;
		gain.gain.cancelScheduledValues(now);
		gain.gain.setValueAtTime(gain.gain.value, now);
		gain.gain.linearRampToValueAtTime(0, now + 0.15);
		source.stop(now + 0.2);
		lfo.stop(now + 0.2);
		this.wind = null;
	}

	_pump() {
		if (!this.anchor) return;
		const now = this.animTimeNow();
		const horizon = now + 0.35; // schedule slightly ahead
		for (const t of PADDLE_TIMES) {
			if (t >= now - 0.05 && t <= horizon && !this.scheduled.has(`p${t}`)) {
				this.scheduled.add(`p${t}`);
				this._paddle(this._toAudioTime(t));
			}
		}
		if (CHIME_TIME >= now - 0.05 && CHIME_TIME <= horizon && !this.scheduled.has("chime")) {
			this.scheduled.add("chime");
			this._chime(this._toAudioTime(CHIME_TIME));
		}
	}

	_toAudioTime(animTime) {
		return this.anchor.audioTime + (animTime - this.anchor.animTime);
	}

	// Short watery "dip" of a paddle.
	_paddle(when) {
		const source = this.ctx.createBufferSource();
		source.buffer = this._makeNoiseBuffer(0.25);
		const band = this.ctx.createBiquadFilter();
		band.type = "bandpass";
		band.frequency.setValueAtTime(900, when);
		band.frequency.exponentialRampToValueAtTime(300, when + 0.18);
		band.Q.value = 1.2;
		const gain = this.ctx.createGain();
		gain.gain.setValueAtTime(0, when);
		gain.gain.linearRampToValueAtTime(0.5, when + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
		source.connect(band).connect(gain).connect(this.master);
		source.start(when);
		source.stop(when + 0.25);
	}

	// One bell strike with two partials.
	_chime(when) {
		for (const [freq, amp] of [[880, 0.35], [1318.5, 0.18], [1760, 0.08]]) {
			const osc = this.ctx.createOscillator();
			osc.type = "sine";
			osc.frequency.value = freq;
			const gain = this.ctx.createGain();
			gain.gain.setValueAtTime(0, when);
			gain.gain.linearRampToValueAtTime(amp, when + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0005, when + 2.2);
			osc.connect(gain).connect(this.master);
			osc.start(when);
			osc.stop(when + 2.3);
		}
	}
}

// Used by tests: animation-time window in which paddles are audible.
export function paddleWindow() {
	return { from: PADDLE_TIMES[0], to: PADDLE_TIMES[PADDLE_TIMES.length - 1], duration: DURATION };
}
