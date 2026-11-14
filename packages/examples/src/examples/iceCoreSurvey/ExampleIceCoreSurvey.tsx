/**
 * melonJS — Ice Core Survey.
 *
 * A fixed-seed polar survey run. Drive the tracked surveyor to three drill
 * sites, recover a core at each, then bring the mass home before the ice,
 * oxygen or hull gives out. Turning, speed, cargo and thin ice all raise the
 * stress on the shelf; fractures keep propagating behind the treads.
 *
 * Controls: W/S throttle · A/D steer · G jettison · Enter submit at camp ·
 * R restart · M mute.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	Application,
	audio,
	event,
	input,
	loader,
	ParticleEmitter,
	Renderable,
	type Renderer,
	Stage,
	state,
	video,
} from "melonjs";
import { createExampleComponent } from "../utils";
import {
	audioAssets,
	isMuted,
	playCrack,
	playFailure,
	playJettison,
	playSample,
	playSplash,
	playSuccess,
	startAudio,
	stopAudio,
	toggleMute,
	updateEngine,
} from "./audio";
import { HUD, type HudState } from "./HUD";
import {
	createWorld,
	formatSeed,
	inThinIce,
	inWater,
	MAP_HEIGHT,
	MAP_WIDTH,
	type WorldData,
} from "./terrain";
import { bakeIceField, makeSoftParticle, makeSplashChip } from "./textures";
import { Surveyor, TrackMarks } from "./vehicle";
import { CrackField, ObjectiveMarkers, WeatherOverlay } from "./visuals";

const VIEW_WIDTH = 1280;
const VIEW_HEIGHT = 800;
const START_LOAD = 480;
const CORE_LOAD = 65;

type Phase = "title" | "driving" | "ended";

interface Snapshot {
	phase: Phase;
	outcome: "none" | "success" | "partial" | "failed";
	reason: string;
	seed: string;
	routePass: boolean;
	cores: number;
	coresTarget: number;
	collected: boolean[];
	jettisoned: boolean[];
	load: number;
	oxygen: number;
	hull: number;
	stress: number;
	vehicle: {
		x: number;
		y: number;
		heading: number;
		speed: number;
	};
	camp: { x: number; y: number; radius: number };
	coreSites: { id: string; x: number; y: number; radius: number }[];
	routes: { id: string; points: { x: number; y: number }[] }[];
	water: { x: number; y: number; rx: number; ry: number }[];
	nextTarget: string;
	sampleProgress: number;
	titleVisible: boolean;
	muted: boolean;
	elapsed: number;
	lastEvent: string;
}

interface IceSurveyGlobal {
	__iceSurvey?: {
		snapshot: () => Snapshot;
	};
}

class IceField extends Renderable {
	constructor(private readonly image: HTMLCanvasElement) {
		super(0, 0, MAP_WIDTH, MAP_HEIGHT);
		this.anchorPoint.set(0, 0);
	}

	override update() {
		return false;
	}

	override draw(renderer: Renderer) {
		renderer.drawImage(
			this.image,
			0,
			0,
			MAP_WIDTH,
			MAP_HEIGHT,
			this.pos.x,
			this.pos.y,
			MAP_WIDTH,
			MAP_HEIGHT,
		);
	}
}

class SurveyController extends Renderable {
	private phase: Phase = "title";
	private outcome: Snapshot["outcome"] = "none";
	private reason = "";
	private titleVisible = true;
	private endedAt = 0;
	private elapsed = 0;
	private oxygen = 100;
	private hull = 100;
	private stress = 0;
	private load = START_LOAD;
	private collected = [false, false, false];
	private jettisoned = [false, false, false];
	private sampleProgress = 0;
	private samplingIndex = -1;
	private markDistance = 0;
	private crackTimer = 0;
	private toast = "";
	private toastTone: HudState["toastTone"] = "good";
	private toastUntil = 0;
	private warning = "";
	private lastEvent = "Ready at camp";
	private lastRestart = 0;
	private lastJettison = 0;

	constructor(
		private readonly app: Application,
		private readonly world: WorldData,
		private readonly vehicle: Surveyor,
		private readonly tracks: TrackMarks,
		private readonly cracks: CrackField,
		private readonly markers: ObjectiveMarkers,
		private readonly hud: HUD,
		private readonly iceBurst: ParticleEmitter,
		private readonly waterBurst: ParticleEmitter,
		private readonly onRestart: () => void,
	) {
		super(0, 0, 1, 1);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		event.on(event.KEYDOWN, this.onKeyDown);
		this.hud.showTitle();
		this.publishSnapshot();
	}

	private onKeyDown = (action: string | undefined, keyCode: number) => {
		if (keyCode === input.KEY.M) {
			const muted = toggleMute();
			this.toast = muted ? "AUDIO MUTED" : "AUDIO ON";
			this.toastTone = "warn";
			this.toastUntil = this.elapsed + 2.2;
			startAudio();
			return;
		}
		if (keyCode === input.KEY.R) {
			const now = globalThis.performance.now();
			if (now - this.lastRestart > 450) {
				this.lastRestart = now;
				this.onRestart();
			}
			return;
		}

		if (
			this.titleVisible &&
			(action === "iceForward" ||
				action === "iceReverse" ||
				action === "iceLeft" ||
				action === "iceRight")
		) {
			this.startRun();
		}

		if (keyCode === input.KEY.ENTER) {
			this.submitAtCamp();
			return;
		}
		if (action === "iceJettison" && this.phase !== "ended") {
			const now = globalThis.performance.now();
			if (now - this.lastJettison > 260) {
				this.lastJettison = now;
				this.jettisonCore();
			}
		}
	};

	private startRun() {
		if (!this.titleVisible) {
			return;
		}
		this.titleVisible = false;
		this.phase = "driving";
		this.hud.hideOverlay();
		startAudio();
		this.toast = "SURVEYOR DEPLOYED";
		this.toastTone = "good";
		this.toastUntil = this.elapsed + 2.4;
		this.lastEvent = "Run started";
		this.publishSnapshot();
	}

	private coreCount() {
		return this.collected.filter(Boolean).length;
	}

	private targetIndex() {
		const candidates = this.world.cores
			.map((core, index) => ({ core, index }))
			.filter(({ index }) => !this.collected[index] && !this.jettisoned[index]);
		if (candidates.length === 0) {
			return -1;
		}
		let best = candidates[0];
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const candidate of candidates) {
			const distance = Math.hypot(
				candidate.core.x - this.vehicle.pos.x,
				candidate.core.y - this.vehicle.pos.y,
			);
			if (distance < bestDistance) {
				best = candidate;
				bestDistance = distance;
			}
		}
		return best.index;
	}

	private atCamp() {
		return (
			Math.hypot(
				this.vehicle.pos.x - this.world.camp.x,
				this.vehicle.pos.y - this.world.camp.y,
			) <
			this.world.camp.radius - 16
		);
	}

	private distanceTo(x: number, y: number) {
		return Math.round(
			Math.hypot(x - this.vehicle.pos.x, y - this.vehicle.pos.y) / 3.2,
		);
	}

	private nextTargetLabel() {
		if (this.samplingIndex >= 0) {
			const core = this.world.cores[this.samplingIndex];
			return `DRILLING CORE ${core.id} · ${Math.round(this.sampleProgress * 100)}%`;
		}
		if (this.coreCount() === this.world.cores.length) {
			const distance = this.distanceTo(this.world.camp.x, this.world.camp.y);
			return this.atCamp()
				? "AT CAMP · ENTER TO SUBMIT"
				: `RETURN TO CAMP · ${distance} M`;
		}
		if (this.coreCount() === 0 && this.jettisoned.some(Boolean)) {
			return "ALL SAMPLES LOST · RETURN TO CAMP";
		}
		const index = this.targetIndex();
		if (index < 0) {
			return "RETURN TO CAMP";
		}
		const core = this.world.cores[index];
		return `NEXT: CORE ${core.id} · ${this.distanceTo(core.x, core.y)} M`;
	}

	private updateHud() {
		if (this.toast && this.elapsed > this.toastUntil) {
			this.toast = "";
		}
		this.warning =
			this.stress > 88
				? "PRESSURE CRITICAL — EASE OFF OR DUMP A CORE"
				: this.oxygen < 25
					? "OXYGEN LOW"
					: this.hull < 25
						? "HULL FAILING"
						: "";
		const state: HudState = {
			oxygen: this.oxygen,
			hull: this.hull,
			stress: this.stress,
			load: this.load,
			cores: this.coreCount(),
			coresTarget: this.world.cores.length,
			nextLabel: this.nextTargetLabel(),
			seed: formatSeed(),
			routePass: this.world.routePass,
			toast: this.toast,
			toastTone: this.toastTone,
			warning: !this.titleVisible && this.phase !== "ended" ? this.warning : "",
			muted: isMuted(),
		};
		this.hud.refresh(state);
	}

	private spawnIceBurst(x: number, y: number, tint: string) {
		this.iceBurst.tint = tint;
		const halfWidth = this.iceBurst.width / 2;
		const halfHeight = this.iceBurst.height / 2;
		this.iceBurst.pos.set(x - halfWidth, y - halfHeight);
		this.iceBurst.burstParticles(34);
	}

	private jettisonCore() {
		if (this.phase === "title") {
			this.startRun();
		}
		let dropped = -1;
		for (let i = this.collected.length - 1; i >= 0; i--) {
			if (this.collected[i]) {
				dropped = i;
				break;
			}
		}
		if (dropped < 0) {
			this.toast = "NO SAMPLE TO JETTISON";
			this.toastTone = "warn";
			this.toastUntil = this.elapsed + 1.8;
			this.lastEvent = "Jettison refused";
			return;
		}
		this.collected[dropped] = false;
		this.jettisoned[dropped] = true;
		this.load = START_LOAD + this.coreCount() * CORE_LOAD;
		this.vehicle.coresAboard = this.coreCount();
		this.stress = Math.max(8, this.stress - 14);
		this.spawnIceBurst(this.vehicle.pos.x, this.vehicle.pos.y, "#ffd17a");
		this.toast = `CORE ${this.world.cores[dropped].id} JETTISONED · −${CORE_LOAD} KG`;
		this.toastTone = "warn";
		this.toastUntil = this.elapsed + 2.8;
		this.lastEvent = `Jettisoned core ${this.world.cores[dropped].id}`;
		playJettison();
		this.markers.setState({
			collected: this.collected,
			jettisoned: this.jettisoned,
			returning: false,
		});
		this.publishSnapshot();
	}

	private submitAtCamp() {
		if (this.phase === "title") {
			this.startRun();
		}
		if (this.phase === "ended") {
			return;
		}
		if (!this.atCamp()) {
			this.toast = "RETURN TO THE CAMP TO SUBMIT";
			this.toastTone = "warn";
			this.toastUntil = this.elapsed + 2.2;
			return;
		}
		const cores = this.coreCount();
		if (cores === this.world.cores.length) {
			this.finish(
				"success",
				"SURVEY COMPLETE",
				"All three cores are on the rack. The shelf held.",
			);
		} else if (cores > 0) {
			this.finish(
				"partial",
				"PARTIAL RETURN",
				`${cores} of ${this.world.cores.length} cores recovered. The missing samples stayed on the ice.`,
			);
		} else {
			this.finish(
				"failed",
				"SURVEY ABANDONED",
				"No cores are aboard. There is nothing to log.",
			);
		}
	}

	private fail(reason: string, title = "LOST THROUGH THE ICE") {
		if (this.phase === "ended") {
			return;
		}
		this.phase = "ended";
		this.outcome = "failed";
		this.reason = reason;
		this.endedAt = this.elapsed;
		this.vehicle.speed = 0;
		this.vehicle.throttle = 0;
		this.lastEvent = reason;
		if (reason.toLowerCase().includes("lead")) {
			const halfWidth = this.waterBurst.width / 2;
			const halfHeight = this.waterBurst.height / 2;
			this.waterBurst.pos.set(
				this.vehicle.pos.x - halfWidth,
				this.vehicle.pos.y - halfHeight,
			);
			this.waterBurst.burstParticles(54);
			playSplash();
			this.app.viewport.shake(
				12,
				520,
				this.app.viewport.AXIS.BOTH,
				undefined,
				true,
			);
		}
		this.hud.showEnd(
			title,
			reason,
			`CORES ${this.coreCount()}/${this.world.cores.length}   ·   O₂ ${Math.round(this.oxygen)}%   ·   HULL ${Math.round(this.hull)}%`,
			false,
		);
		playFailure();
		this.publishSnapshot();
	}

	private finish(
		outcome: "success" | "partial" | "failed",
		title: string,
		reason: string,
	) {
		this.phase = "ended";
		this.outcome = outcome;
		this.reason = reason;
		this.endedAt = this.elapsed;
		this.vehicle.speed = 0;
		this.vehicle.throttle = 0;
		this.lastEvent = title;
		this.hud.showEnd(
			title,
			reason,
			`CORES ${this.coreCount()}/${this.world.cores.length}   ·   ${Math.round(this.load)} KG   ·   O₂ ${Math.round(this.oxygen)}%   ·   HULL ${Math.round(this.hull)}%`,
			outcome !== "failed",
		);
		playSuccess(this.coreCount() === this.world.cores.length);
		this.publishSnapshot();
	}

	override update(dt: number) {
		const ms = Math.min(dt, 50);
		const seconds = ms / 1000;
		this.elapsed += seconds;

		if (this.phase === "ended") {
			const fallTime = (this.elapsed - this.endedAt) / 1.2;
			if (this.outcome === "failed" && this.reason.includes("lead")) {
				this.vehicle.sinking = Math.min(1, fallTime);
				this.vehicle.setOpacity(Math.max(0, 1 - fallTime * 0.72));
			}
			updateEngine(0, 0);
			this.updateHud();
			this.publishSnapshot();
			return true;
		}

		if (this.titleVisible) {
			updateEngine(0, 0);
			this.updateHud();
			return true;
		}

		const throttle =
			(input.isKeyPressed("iceForward") ? 1 : 0) -
			(input.isKeyPressed("iceReverse") ? 1 : 0);
		const steer =
			(input.isKeyPressed("iceRight") ? 1 : 0) -
			(input.isKeyPressed("iceLeft") ? 1 : 0);
		const distance = this.vehicle.drive(ms, throttle, steer);

		this.vehicle.pos.x = Math.max(
			24,
			Math.min(MAP_WIDTH - 24, this.vehicle.pos.x),
		);
		this.vehicle.pos.y = Math.max(
			24,
			Math.min(MAP_HEIGHT - 24, this.vehicle.pos.y),
		);

		this.markDistance += distance;
		if (this.markDistance > 17) {
			this.tracks.add(
				this.vehicle.pos.x,
				this.vehicle.pos.y,
				this.vehicle.heading,
			);
			this.markDistance = 0;
		}

		if (inWater(this.world, this.vehicle.pos.x, this.vehicle.pos.y)) {
			this.fail(
				"The surveyor crossed a lead and went under. Cores and vehicle are lost.",
			);
			return true;
		}

		const speedRatio = Math.min(1, Math.abs(this.vehicle.speed) / 172);
		const onThinIce = inThinIce(
			this.world,
			this.vehicle.pos.x,
			this.vehicle.pos.y,
		);
		const targetStress =
			this.coreCount() * 8 +
			speedRatio * 20 +
			Math.abs(steer) * (6 + speedRatio * 23) +
			(onThinIce ? 29 : 0);
		this.stress +=
			(targetStress - this.stress) * (1 - Math.exp(-1.15 * seconds));
		this.stress = Math.max(0, Math.min(100, this.stress));

		this.oxygen = Math.max(
			0,
			this.oxygen - seconds * (0.085 + speedRatio * 0.16),
		);
		if (onThinIce && speedRatio > 0.55) {
			this.hull = Math.max(0, this.hull - seconds * (0.55 + speedRatio));
		}
		if (this.stress > 78) {
			this.hull = Math.max(
				0,
				this.hull - seconds * ((this.stress - 78) / 22) * 1.35,
			);
		}

		this.crackTimer -= seconds;
		if (
			this.crackTimer <= 0 &&
			Math.abs(this.vehicle.speed) > 18 &&
			this.stress > 18
		) {
			const severity = Math.max(
				0.28,
				Math.min(1, (this.stress - 14) / 66 + (onThinIce ? 0.26 : 0)),
			);
			this.cracks.spawn(
				this.vehicle.pos.x,
				this.vehicle.pos.y,
				this.vehicle.heading,
				severity,
			);
			playCrack(severity);
			if (severity > 0.5) {
				this.spawnIceBurst(this.vehicle.pos.x, this.vehicle.pos.y, "#d8f5f5");
			}
			if (severity > 0.86) {
				this.hull = Math.max(0, this.hull - 0.45);
			}
			this.crackTimer = 1.85 - severity * 1.05;
		}

		let nearCore = -1;
		for (const [index, core] of this.world.cores.entries()) {
			if (this.collected[index] || this.jettisoned[index]) {
				continue;
			}
			if (
				Math.hypot(this.vehicle.pos.x - core.x, this.vehicle.pos.y - core.y) <
				core.radius * 0.72
			) {
				nearCore = index;
				break;
			}
		}
		if (nearCore >= 0 && Math.abs(this.vehicle.speed) < 26) {
			if (this.samplingIndex !== nearCore) {
				this.samplingIndex = nearCore;
				this.sampleProgress = 0;
			}
			this.sampleProgress += seconds / 1.15;
			if (this.sampleProgress >= 1) {
				const core = this.world.cores[nearCore];
				this.collected[nearCore] = true;
				this.samplingIndex = -1;
				this.sampleProgress = 0;
				this.load = START_LOAD + this.coreCount() * CORE_LOAD;
				this.vehicle.coresAboard = this.coreCount();
				this.toast = `CORE ${core.id} SECURED · +${CORE_LOAD} KG`;
				this.toastTone = "good";
				this.toastUntil = this.elapsed + 3;
				this.lastEvent = `Recovered core ${core.id}`;
				this.spawnIceBurst(core.x, core.y, "#72e0d7");
				playSample();
				this.markers.setState({
					collected: this.collected,
					jettisoned: this.jettisoned,
					returning: this.coreCount() === this.world.cores.length,
				});
			}
		} else {
			this.samplingIndex = -1;
			this.sampleProgress = 0;
		}

		this.markers.setState({
			collected: this.collected,
			jettisoned: this.jettisoned,
			returning: this.coreCount() === this.world.cores.length,
		});
		updateEngine(this.vehicle.speed, throttle);
		this.updateHud();

		if (this.oxygen <= 0) {
			this.fail(
				"Oxygen exhausted before the surveyor reached camp.",
				"OXYGEN EXHAUSTED",
			);
		} else if (this.hull <= 0) {
			this.fail(
				"The hull failed under the pressure. The survey is over.",
				"HULL FAILURE",
			);
		}
		this.publishSnapshot();
		return true;
	}

	private publishSnapshot() {
		const api = globalThis as unknown as IceSurveyGlobal;
		if (api.__iceSurvey === undefined) {
			return;
		}
		api.__iceSurvey.snapshot = () => {
			return {
				phase: this.phase,
				outcome: this.outcome,
				reason: this.reason,
				seed: formatSeed(),
				routePass: this.world.routePass,
				cores: this.coreCount(),
				coresTarget: this.world.cores.length,
				collected: [...this.collected],
				jettisoned: [...this.jettisoned],
				load: this.load,
				oxygen: this.oxygen,
				hull: this.hull,
				stress: this.stress,
				vehicle: {
					x: this.vehicle.pos.x,
					y: this.vehicle.pos.y,
					heading: this.vehicle.heading,
					speed: this.vehicle.speed,
				},
				camp: {
					x: this.world.camp.x,
					y: this.world.camp.y,
					radius: this.world.camp.radius,
				},
				coreSites: this.world.cores.map((core) => ({
					id: core.id,
					x: core.x,
					y: core.y,
					radius: core.radius,
				})),
				routes: this.world.cores.map((core) => ({
					id: core.id,
					points: core.route.map((point) => ({ ...point })),
				})),
				water: this.world.water.slice(0, 24).map((patch) => ({
					x: patch.x,
					y: patch.y,
					rx: patch.rx,
					ry: patch.ry,
				})),
				nextTarget: this.nextTargetLabel(),
				sampleProgress: this.sampleProgress,
				titleVisible: this.titleVisible,
				muted: isMuted(),
				elapsed: this.elapsed,
				lastEvent: this.lastEvent,
			};
		};
	}

	dispose() {
		event.off(event.KEYDOWN, this.onKeyDown);
	}
}

class IceSurveyStage extends Stage {
	private controller?: SurveyController;

	constructor(private readonly onRestart: () => void) {
		super();
	}

	onResetEvent(app: Application) {
		const keys: [number, string][] = [
			[input.KEY.W, "iceForward"],
			[input.KEY.UP, "iceForward"],
			[input.KEY.S, "iceReverse"],
			[input.KEY.DOWN, "iceReverse"],
			[input.KEY.A, "iceLeft"],
			[input.KEY.LEFT, "iceLeft"],
			[input.KEY.D, "iceRight"],
			[input.KEY.RIGHT, "iceRight"],
			[input.KEY.G, "iceJettison"],
		];
		for (const [code, action] of keys) {
			input.bindKey(code, action);
		}

		app.viewport.reset();
		app.viewport.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

		const world = createWorld();
		const scene = app.world;
		const ice = new IceField(bakeIceField(world));
		scene.addChild(ice, 0);

		const tracks = new TrackMarks();
		scene.addChild(tracks, 2);
		const cracks = new CrackField();
		scene.addChild(cracks, 3);
		const markers = new ObjectiveMarkers(world);
		scene.addChild(markers, 4);

		const snowTexture = makeSoftParticle(20, "rgba(255,255,255,0.92)");
		const snow = new ParticleEmitter(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, {
			image: snowTexture,
			floating: true,
			width: VIEW_WIDTH,
			height: VIEW_HEIGHT,
			totalParticles: 190,
			maxParticles: 4,
			frequency: 24,
			minLife: 2300,
			maxLife: 4800,
			speed: 0.8,
			speedVariation: 0.5,
			angle: Math.PI / 2 - 0.18,
			angleVariation: 0.34,
			wind: -0.18,
			minStartScale: 0.25,
			maxStartScale: 0.9,
			minEndScale: 0.15,
			maxEndScale: 0.55,
			tint: "rgba(240,253,255,0.8)",
		});
		scene.addChild(snow, 30);
		snow.streamParticles();

		const weather = new WeatherOverlay(VIEW_WIDTH, VIEW_HEIGHT);
		scene.addChild(weather, 31);

		const iceBurst = new ParticleEmitter(0, 0, {
			image: makeSplashChip(),
			referenceSpace: "world",
			width: 108,
			height: 108,
			totalParticles: 46,
			maxParticles: 46,
			minLife: 380,
			maxLife: 920,
			speed: 1.9,
			speedVariation: 1.2,
			angle: 0,
			angleVariation: Math.PI * 2,
			minStartScale: 0.55,
			maxStartScale: 1.4,
			minEndScale: 0,
			maxEndScale: 0.2,
			tint: "#8fe7df",
		});
		scene.addChild(iceBurst, 6);

		const waterBurst = new ParticleEmitter(0, 0, {
			image: makeSoftParticle(18, "rgba(210,250,252,0.95)"),
			referenceSpace: "world",
			width: 120,
			height: 120,
			totalParticles: 64,
			maxParticles: 64,
			minLife: 500,
			maxLife: 1300,
			speed: 2.4,
			speedVariation: 1.5,
			angle: 0,
			angleVariation: Math.PI * 2,
			gravity: 0.32,
			minStartScale: 0.5,
			maxStartScale: 1.7,
			minEndScale: 0,
			maxEndScale: 0.3,
			tint: "#bdeff5",
		});
		scene.addChild(waterBurst, 7);

		const vehicle = new Surveyor(world.camp.x + 24, world.camp.y - 12);
		scene.addChild(vehicle, 10);

		const hud = new HUD(app);
		scene.addChild(hud, 1000);

		this.controller = new SurveyController(
			app,
			world,
			vehicle,
			tracks,
			cracks,
			markers,
			hud,
			iceBurst,
			waterBurst,
			this.onRestart,
		);
		scene.addChild(this.controller, 900);

		app.viewport.follow(vehicle, app.viewport.AXIS.BOTH, 0.16);
		app.viewport.offset.set(0, -18);
	}

	onDestroyEvent() {
		const keys = [
			input.KEY.W,
			input.KEY.UP,
			input.KEY.S,
			input.KEY.DOWN,
			input.KEY.A,
			input.KEY.LEFT,
			input.KEY.D,
			input.KEY.RIGHT,
			input.KEY.G,
		];
		for (const code of keys) {
			input.unbindKey(code);
		}
		this.controller?.dispose();
		this.controller = undefined;
	}
}

const createGame = async () => {
	const app = new Application(VIEW_WIDTH, VIEW_HEIGHT, {
		parent: "screen",
		renderer: video.AUTO,
		scale: "auto",
		backgroundColor: "#06181f",
	});
	await app.init();

	audio.init("wav");
	await loader.preload(audioAssets());

	const api = globalThis as unknown as IceSurveyGlobal;
	api.__iceSurvey = {
		snapshot: () => {
			throw new Error("Ice Core Survey is not ready");
		},
	};

	let nextState = state.USER + 1;
	const startStage = () => {
		const stage = new IceSurveyStage(() => {
			startStage();
		});
		const id = nextState++;
		state.set(id, stage);
		state.change(id, true);
	};
	startStage();

	return () => {
		stopAudio();
		(globalThis as unknown as IceSurveyGlobal).__iceSurvey = undefined;
	};
};

export const ExampleIceCoreSurvey = createExampleComponent(createGame);
