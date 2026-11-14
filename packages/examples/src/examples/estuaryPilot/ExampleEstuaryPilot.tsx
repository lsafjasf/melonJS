/**
 * melonJS — night estuary buoy-laying example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	Application,
	type Camera2d,
	event,
	game,
	input,
	type Renderer,
	Stage,
	state,
	video,
} from "melonjs";
import { createExampleComponent } from "../utils";
import {
	Boat,
	DriftwoodCollider,
	EstuaryAudio,
	EstuaryWater,
	type HazardKind,
	SandbarCollider,
	ShoreCollider,
} from "./entities";
import { EstuaryHud, type HudState } from "./hud";
import {
	currentAt,
	type EstuaryMap,
	generateEstuary,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from "./world";

const TIME_LIMIT = 160;
const TEST_MODE = new URLSearchParams(globalThis.location.search).has("test");

interface TestSnapshot {
	seed: number;
	started: boolean;
	finished: boolean;
	failed: boolean;
	deployed: number;
	loadFactor: number;
	durability: number;
	boat: { x: number; y: number; heading: number; speed: number };
	activeZone: number;
	nearZone: boolean;
	nearDock: boolean;
	zones: { x: number; y: number; radius: number; name: string }[];
	dock: { x: number; y: number; radius: number };
	routes: { ok: boolean; from: string; to: string }[];
	corridors: { x: number; y: number }[][];
	sandbars: { x: number; y: number; rx: number; ry: number }[];
	driftwood: { x: number; y: number; length: number }[];
}

interface TestHook {
	snapshot: () => TestSnapshot;
}

declare global {
	interface Window {
		__estuaryPilot?: TestHook;
	}
}

class PlayScreen extends Stage {
	private seed: number;
	private map: EstuaryMap;
	private water: EstuaryWater;
	private boat: Boat;
	private hud = new EstuaryHud();
	private sound = new EstuaryAudio();
	private deployed = new Set<number>();
	private elapsed = 0;
	private started = false;
	private finished = false;
	private failed = false;
	private bindingsDone = false;
	private restartRequested = false;
	private message = "";
	private messageTimer = 0;

	constructor(seed: number) {
		super();
		this.seed = seed;
		this.map = generateEstuary(seed);
		this.water = new EstuaryWater(this.map);
		this.boat = new Boat(this.map, {
			onDamage: (kind) => this.handleDamage(kind),
		});
	}

	override onResetEvent(): void {
		this.bindKeys();
		this.buildWorld();
		this.publishTestHook();
	}

	private bindKeys(): void {
		if (this.bindingsDone) return;
		this.bindingsDone = true;
		input.bindKey(input.KEY.LEFT, "left");
		input.bindKey(input.KEY.A, "left");
		input.bindKey(input.KEY.RIGHT, "right");
		input.bindKey(input.KEY.D, "right");
		input.bindKey(input.KEY.UP, "forward");
		input.bindKey(input.KEY.W, "forward");
		input.bindKey(input.KEY.DOWN, "reverse");
		input.bindKey(input.KEY.S, "reverse");
		input.bindKey(input.KEY.SPACE, "drop", true);
		input.bindKey(input.KEY.R, "restart", true);
		event.on(event.KEYDOWN, this.onKeyDown);
	}

	private readonly onKeyDown = (action?: string): void => {
		if (action === "restart") this.restartRequested = true;
	};

	private buildWorld(): void {
		this.map = generateEstuary(this.seed);
		this.deployed = new Set();
		this.elapsed = 0;
		this.started = false;
		this.finished = false;
		this.failed = false;
		this.message = "";
		this.messageTimer = 0;
		this.water = new EstuaryWater(this.map);
		this.boat = new Boat(this.map, {
			onDamage: (kind) => this.handleDamage(kind),
		});
		this.boat.deployed = 0;
		game.world.addChild(this.water);
		game.world.addChild(new ShoreCollider(this.map));
		game.world.addChild(new SandbarCollider(this.map));
		game.world.addChild(new DriftwoodCollider(this.map));
		game.world.addChild(this.boat);
		game.world.addChild(this.boat.lamp);
		game.viewport.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
		game.viewport.follow(this.boat, game.viewport.AXIS.BOTH, 0.14);
		game.viewport.zoom = 1;
		this.ambientLight.parseCSS("#01050df2");
		this.ambientLightingColor.setColor(0, 0, 0, 1);
		this.sound.start();
	}

	override update(dt: number): boolean {
		if (this.restartRequested) {
			this.restartRequested = false;
			this.restart();
			return super.update(dt);
		}
		const anyControl =
			input.keyStatus("forward") ||
			input.keyStatus("reverse") ||
			input.keyStatus("left") ||
			input.keyStatus("right");
		if (anyControl && !this.started) {
			this.started = true;
			this.showMessage("The tide is rising. Head for the amber marker zone.");
		}
		this.boat.running =
			this.started &&
			!this.finished &&
			!this.failed &&
			this.boat.controlsEnabled;
		if (this.started && !this.finished && !this.failed) {
			this.elapsed = Math.min(TIME_LIMIT, this.elapsed + dt / 1000);
			if (this.elapsed >= TIME_LIMIT) {
				this.failRun("The tide flooded the bank");
			}
		}
		const tide = Math.min(1, this.elapsed / TIME_LIMIT);
		this.boat.setTide(tide);
		this.boat.lamp.pos.set(
			this.boat.pos.x + Math.cos(this.boat.heading) * 16,
			this.boat.pos.y + Math.sin(this.boat.heading) * 16,
		);
		this.water.boatX = this.boat.pos.x;
		this.water.boatY = this.boat.pos.y;
		this.water.setProgress(tide, this.activeZone, this.deployed);
		this.messageTimer = Math.max(0, this.messageTimer - dt / 1000);
		if (this.messageTimer === 0) this.message = "";
		if (!this.finished && !this.failed) {
			this.handleInteraction();
		}
		this.sound.update(
			dt,
			this.boat.speedValue,
			Math.abs(this.boat.speedValue) > 0.1 ? 1 : 0,
			this.elapsed,
		);
		this.checkDockReturn();
		return super.update(dt);
	}

	private get activeZone(): number {
		for (const zone of this.map.zones) {
			if (!this.deployed.has(zone.index)) return zone.index;
		}
		return this.map.zones.length;
	}

	private handleInteraction(): void {
		if (!this.started || !input.isKeyPressed("drop")) return;
		const zone = this.map.zones[this.activeZone];
		if (!zone) {
			this.showMessage("Four buoys laid. Return to the dock.");
			return;
		}
		const distance = Math.hypot(
			this.boat.pos.x - zone.x,
			this.boat.pos.y - zone.y,
		);
		if (distance > zone.radius) {
			this.showMessage(
				"Too far. Enter the amber marker zone, then press SPACE.",
			);
			return;
		}
		this.deployed.add(zone.index);
		this.boat.deployed = this.deployed.size;
		this.water.setProgress(
			Math.min(1, this.elapsed / TIME_LIMIT),
			this.activeZone,
			this.deployed,
		);
		this.sound.drop();
		game.viewport.shake(3, 160, game.viewport.AXIS.BOTH, undefined, true);
		this.showMessage(
			`${zone.name} buoy away · LOAD ${this.boat.loadFactor.toFixed(2)}x · rudder response reduced`,
			3.2,
		);
	}

	private checkDockReturn(): void {
		if (this.finished || this.failed || this.deployed.size < 4) return;
		const distance = Math.hypot(
			this.boat.pos.x - this.map.dock.x,
			this.boat.pos.y - this.map.dock.y,
		);
		if (distance <= this.map.dockRadius) {
			this.finished = true;
			this.boat.controlsEnabled = false;
			this.sound.success();
			this.showMessage("Dock secured", 10);
		}
	}

	private handleDamage(kind: HazardKind): void {
		this.sound.impact(kind);
		game.viewport.shake(
			kind === "shore" ? 12 : 7,
			280,
			game.viewport.AXIS.BOTH,
			undefined,
			true,
		);
		const label =
			kind === "driftwood"
				? "Driftwood strike"
				: kind === "sandbar"
					? "Shoal scrape"
					: "Bank strike";
		this.showMessage(
			`${label} · HULL ${Math.ceil(this.boat.durability)}%`,
			2.4,
		);
		if (this.boat.durability <= 0) this.failRun("Hull integrity lost");
	}

	private failRun(reason: string): void {
		if (this.failed || this.finished) return;
		this.failed = true;
		this.boat.controlsEnabled = false;
		this.sound.failure();
		this.showMessage(reason, 10);
	}

	private restart(): void {
		this.sound.stop();
		game.world.reset();
		this.seed = (this.seed + 7919) % 1000000;
		this.buildWorld();
	}

	private showMessage(text: string, seconds = 2.8): void {
		this.message = text;
		this.messageTimer = seconds;
	}

	private hudState(): HudState {
		const zone = this.map.zones[this.activeZone];
		const target = zone ?? this.map.dock;
		const nearZone = zone
			? Math.hypot(this.boat.pos.x - zone.x, this.boat.pos.y - zone.y) <=
				zone.radius
			: false;
		const nearDock =
			Math.hypot(
				this.boat.pos.x - this.map.dock.x,
				this.boat.pos.y - this.map.dock.y,
			) <= this.map.dockRadius;
		return {
			seed: this.seed,
			tide: Math.min(1, this.elapsed / TIME_LIMIT),
			secondsLeft: TIME_LIMIT - this.elapsed,
			durability: this.boat.durability,
			deployed: this.deployed.size,
			activeZone: this.activeZone,
			zoneNames: this.map.zones.map((item) => item.name),
			zoneDistance:
				Math.hypot(this.boat.pos.x - target.x, this.boat.pos.y - target.y) / 10,
			nearZone,
			nearDock,
			allDeployed: this.deployed.size === 4,
			loadFactor: this.boat.loadFactor,
			speed: this.boat.speedValue,
			current: currentAt(this.boat.pos.x, this.boat.pos.y, this.elapsed / 10),
			routesOk: this.map.routes.filter((route) => route.ok).length,
			routesTotal: this.map.routes.length,
			started: this.started,
			finished: this.finished,
			failed: this.failed,
			message: this.message,
		};
	}

	override drawLighting(
		renderer: Renderer,
		camera: Camera2d,
		translateX: number,
		translateY: number,
	): void {
		super.drawLighting(renderer, camera, translateX, translateY);
		if (camera === game.viewport) {
			renderer.setProjection(camera.screenProjection);
			this.hud.draw(
				renderer,
				game.viewport.width,
				game.viewport.height,
				this.hudState(),
			);
		}
	}

	private publishTestHook(): void {
		if (!TEST_MODE) return;
		globalThis.__estuaryPilot = {
			snapshot: () => {
				const zone = this.map.zones[this.activeZone];
				return {
					seed: this.seed,
					started: this.started,
					finished: this.finished,
					failed: this.failed,
					deployed: this.deployed.size,
					loadFactor: this.boat.loadFactor,
					durability: this.boat.durability,
					boat: {
						x: this.boat.pos.x,
						y: this.boat.pos.y,
						heading: this.boat.heading,
						speed: this.boat.speedValue,
					},
					activeZone: this.activeZone,
					nearZone: zone
						? Math.hypot(this.boat.pos.x - zone.x, this.boat.pos.y - zone.y) <=
							zone.radius
						: false,
					nearDock:
						Math.hypot(
							this.boat.pos.x - this.map.dock.x,
							this.boat.pos.y - this.map.dock.y,
						) <= this.map.dockRadius,
					zones: this.map.zones.map((item) => ({
						x: item.x,
						y: item.y,
						radius: item.radius,
						name: item.name,
					})),
					dock: {
						x: this.map.dock.x,
						y: this.map.dock.y,
						radius: this.map.dockRadius,
					},
					routes: this.map.routes.map((route) => ({
						ok: route.ok,
						from: route.from,
						to: route.to,
					})),
					corridors: this.map.corridors.map((corridor) =>
						corridor.map((point) => ({ x: point.x, y: point.y })),
					),
					sandbars: this.map.sandbars.map((sandbar) => ({
						x: sandbar.x,
						y: sandbar.y,
						rx: sandbar.rx,
						ry: sandbar.ry,
					})),
					driftwood: this.map.driftwood.map((log) => ({
						x: log.x,
						y: log.y,
						length: log.length,
					})),
				};
			},
		};
	}

	dispose(): void {
		this.sound.stop();
		if (TEST_MODE) delete globalThis.__estuaryPilot;
	}

	override onDestroyEvent(): void {
		this.dispose();
		input.unbindKey(input.KEY.LEFT);
		input.unbindKey(input.KEY.A);
		input.unbindKey(input.KEY.RIGHT);
		input.unbindKey(input.KEY.D);
		input.unbindKey(input.KEY.UP);
		input.unbindKey(input.KEY.W);
		input.unbindKey(input.KEY.DOWN);
		input.unbindKey(input.KEY.S);
		input.unbindKey(input.KEY.SPACE);
		input.unbindKey(input.KEY.R);
		event.off(event.KEYDOWN, this.onKeyDown);
		this.bindingsDone = false;
	}
}

const createGame = async () => {
	const search = new URLSearchParams(globalThis.location.search);
	const parsedSeed = Number(search.get("seed"));
	const seed =
		Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : 1337;
	const app = new Application(1100, 700, {
		parent: "screen",
		scaleMethod: "flex",
		renderer: video.CANVAS,
	});
	await app.init();
	app.world.backgroundColor.parseCSS("#01050d");
	const screen = new PlayScreen(seed);
	state.set(state.PLAY, screen);
	state.change(state.PLAY);
	return () => screen.dispose();
};

export const ExampleEstuaryPilot = createExampleComponent(createGame);
