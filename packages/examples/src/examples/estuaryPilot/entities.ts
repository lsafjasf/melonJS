/**
 * melonJS — night estuary renderables.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	audio,
	type BodyShape,
	type CanvasRenderer,
	type CollisionResponse,
	collision,
	Ellipse,
	input,
	Light2d,
	type PhysicsBody,
	Rect,
	Renderable,
	type Renderer,
} from "melonjs";
import {
	bottomShoreAt,
	currentAt,
	type DropZone,
	type EstuaryMap,
	topShoreAt,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from "./world";

const WATER_TOP = "#06141d";
const WATER_BOTTOM = "#102a33";
const LAND_TOP = "#121b17";
const LAND_BOTTOM = "#172019";
const FOAM = "rgba(174, 224, 218, 0.55)";
const RIPPLE = "rgba(105, 171, 177, 0.28)";

function contextOf(renderer: Renderer): CanvasRenderingContext2D {
	return (renderer as CanvasRenderer).getContext();
}

function traceShore(
	context: CanvasRenderingContext2D,
	shore: number[],
	side: "top" | "bottom",
	offset = 0,
): void {
	context.beginPath();
	if (side === "top") {
		context.moveTo(0, 0);
		for (let index = 0; index < shore.length; index++) {
			context.lineTo(index * 120, shore[index] + offset);
		}
		context.lineTo(WORLD_WIDTH, 0);
	} else {
		context.moveTo(0, WORLD_HEIGHT);
		for (let index = 0; index < shore.length; index++) {
			context.lineTo(index * 120, shore[index] - offset);
		}
		context.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
	}
	context.closePath();
}

export class EstuaryWater extends Renderable {
	private readonly map: EstuaryMap;
	private elapsed = 0;
	private tide = 0;
	private activeZone = 0;
	private deployed = new Set<number>();
	boatX = 0;
	boatY = 0;

	constructor(map: EstuaryMap) {
		super(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
		this.map = map;
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.alwaysUpdate = true;
	}

	setProgress(tide: number, activeZone: number, deployed: Set<number>): void {
		this.tide = tide;
		this.activeZone = activeZone;
		this.deployed = deployed;
	}

	override update(dt: number): boolean {
		this.elapsed += dt / 1000;
		return true;
	}

	private drawWater(context: CanvasRenderingContext2D): void {
		const gradient = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
		gradient.addColorStop(0, WATER_TOP);
		gradient.addColorStop(0.48, "#0b2029");
		gradient.addColorStop(1, WATER_BOTTOM);
		context.fillStyle = gradient;
		context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
		context.globalAlpha = 0.22;
		for (let index = 0; index < 18; index++) {
			const y = 40 + index * 84;
			context.fillStyle = index % 2 === 0 ? "#1c4b52" : "#0b2d3a";
			context.fillRect(0, y, WORLD_WIDTH, 1.5);
		}
		context.globalAlpha = 1;
	}

	private drawCurrent(context: CanvasRenderingContext2D): void {
		context.lineCap = "round";
		for (let index = 0; index < 74; index++) {
			const drift = this.elapsed * (9 + (index % 7));
			const x = ((index * 197 + drift * 13) % (WORLD_WIDTH + 180)) - 90;
			const y =
				topShoreAt(this.map, x) +
				80 +
				((index * 131) % Math.max(1, Math.floor(WORLD_HEIGHT - 260)));
			if (y > bottomShoreAt(this.map, x) - 40) continue;
			const current = currentAt(x, y, this.elapsed);
			context.strokeStyle = RIPPLE;
			context.lineWidth = index % 5 === 0 ? 1.6 : 0.8;
			context.beginPath();
			context.moveTo(x, y);
			context.quadraticCurveTo(
				x + 24,
				y + current.y * 14,
				x + 44 + current.x * 28,
				y + current.y * 8,
			);
			context.stroke();
		}
	}

	private drawShores(context: CanvasRenderingContext2D): void {
		context.fillStyle = LAND_TOP;
		traceShore(context, this.map.topShore, "top");
		context.fill();
		context.fillStyle = LAND_BOTTOM;
		traceShore(context, this.map.bottomShore, "bottom");
		context.fill();

		const tideInset = 18 + this.tide * 84;
		context.lineWidth = 4;
		context.strokeStyle = "rgba(74, 107, 91, 0.8)";
		context.beginPath();
		this.map.topShore.forEach((y, index) => {
			if (index === 0) context.moveTo(0, y + 8);
			else context.lineTo(index * 120, y + 8);
		});
		context.stroke();
		context.beginPath();
		this.map.bottomShore.forEach((y, index) => {
			if (index === 0) context.moveTo(0, y - 8);
			else context.lineTo(index * 120, y - 8);
		});
		context.stroke();

		context.fillStyle = "rgba(42, 105, 108, 0.24)";
		context.beginPath();
		this.map.topShore.forEach((y, index) => {
			const x = index * 120;
			const tideY = y - tideInset;
			if (index === 0) context.moveTo(x, tideY);
			else context.lineTo(x, tideY);
		});
		for (let index = this.map.topShore.length - 1; index >= 0; index--) {
			context.lineTo(index * 120, this.map.topShore[index] + 2);
		}
		context.closePath();
		context.fill();
		context.beginPath();
		this.map.bottomShore.forEach((y, index) => {
			const x = index * 120;
			const tideY = y + tideInset;
			if (index === 0) context.moveTo(x, tideY);
			else context.lineTo(x, tideY);
		});
		for (let index = this.map.bottomShore.length - 1; index >= 0; index--) {
			context.lineTo(index * 120, this.map.bottomShore[index] - 2);
		}
		context.closePath();
		context.fill();

		context.strokeStyle = FOAM;
		context.lineWidth = 1.5;
		context.globalAlpha = 0.3 + this.tide * 0.55;
		context.beginPath();
		this.map.topShore.forEach((y, index) => {
			const x = index * 120;
			if (index === 0) context.moveTo(x, y - tideInset);
			else context.lineTo(x, y - tideInset);
		});
		context.stroke();
		context.beginPath();
		this.map.bottomShore.forEach((y, index) => {
			const x = index * 120;
			if (index === 0) context.moveTo(x, y + tideInset);
			else context.lineTo(x, y + tideInset);
		});
		context.stroke();
		context.globalAlpha = 1;
	}

	private drawSandbars(context: CanvasRenderingContext2D): void {
		for (const sandbar of this.map.sandbars) {
			const shimmer = 0.9 + Math.sin(this.elapsed * 1.2 + sandbar.phase) * 0.08;
			context.fillStyle = `rgba(142, 121, 88, ${0.44 * shimmer})`;
			context.beginPath();
			context.ellipse(
				sandbar.x,
				sandbar.y,
				sandbar.rx,
				sandbar.ry,
				Math.sin(sandbar.phase) * 0.18,
				0,
				Math.PI * 2,
			);
			context.fill();
			context.strokeStyle = "rgba(219, 197, 142, 0.35)";
			context.lineWidth = 2;
			context.stroke();
		}
	}

	private drawDriftwood(context: CanvasRenderingContext2D): void {
		for (const log of this.map.driftwood) {
			context.save();
			context.translate(log.x, log.y);
			context.rotate(log.angle);
			context.fillStyle = "#3c2b20";
			context.fillRect(-log.length / 2, -10, log.length, 20);
			context.fillStyle = "#6b4a30";
			context.fillRect(-log.length / 2 + 4, -7, log.length - 8, 5);
			context.strokeStyle = "rgba(203, 167, 112, 0.38)";
			context.lineWidth = 1.5;
			context.beginPath();
			context.moveTo(-log.length / 2, -10);
			context.lineTo(log.length / 2, -10);
			context.stroke();
			context.restore();
		}
	}

	private drawDock(context: CanvasRenderingContext2D): void {
		const shoreY = bottomShoreAt(this.map, this.map.dock.x);
		context.fillStyle = "#4b3425";
		context.fillRect(this.map.dock.x - 34, this.map.dock.y - 18, 68, 46);
		context.fillStyle = "#6d4b2e";
		for (let y = this.map.dock.y - 10; y < shoreY; y += 22) {
			context.fillRect(this.map.dock.x - 46, y, 92, 10);
		}
		context.fillStyle = "#251a13";
		context.fillRect(this.map.dock.x - 54, this.map.dock.y - 22, 12, 70);
		context.fillRect(this.map.dock.x + 42, this.map.dock.y - 22, 12, 70);
		context.strokeStyle = "rgba(239, 193, 105, 0.62)";
		context.lineWidth = 2;
		context.beginPath();
		context.arc(
			this.map.dock.x,
			this.map.dock.y,
			this.map.dockRadius,
			0,
			Math.PI * 2,
		);
		context.stroke();
		context.fillStyle = "#efc169";
		context.fillRect(this.map.dock.x - 3, this.map.dock.y - 62, 6, 40);
		context.beginPath();
		context.arc(this.map.dock.x, this.map.dock.y - 66, 7, 0, Math.PI * 2);
		context.fill();
	}

	private drawBuoy(context: CanvasRenderingContext2D, zone: DropZone): void {
		context.save();
		context.translate(zone.x, zone.y);
		const bob = Math.sin(this.elapsed * 2.1 + zone.index) * 3;
		context.fillStyle = "#e17a42";
		context.beginPath();
		context.ellipse(0, bob + 8, 17, 9, 0, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = "#d8e7da";
		context.fillRect(-2, bob - 28, 4, 34);
		context.fillStyle = "#8ef0c8";
		context.beginPath();
		context.arc(0, bob - 32, 5, 0, Math.PI * 2);
		context.fill();
		context.strokeStyle = "rgba(142, 240, 200, 0.36)";
		context.lineWidth = 1;
		context.beginPath();
		context.arc(
			0,
			bob - 32,
			15 + Math.sin(this.elapsed * 3) * 3,
			0,
			Math.PI * 2,
		);
		context.stroke();
		context.restore();
	}

	private drawZones(context: CanvasRenderingContext2D): void {
		for (const zone of this.map.zones) {
			const deployed = this.deployed.has(zone.index);
			const active = zone.index === this.activeZone && !deployed;
			const pulse = 1 + Math.sin(this.elapsed * 2.5 + zone.index) * 0.08;
			context.save();
			context.setLineDash(active ? [12, 9] : [4, 10]);
			context.lineDashOffset = -this.elapsed * (active ? 24 : 8);
			context.strokeStyle = deployed
				? "rgba(109, 205, 158, 0.46)"
				: active
					? "rgba(255, 168, 84, 0.92)"
					: "rgba(107, 151, 161, 0.32)";
			context.lineWidth = active ? 3 : 1.5;
			context.beginPath();
			context.arc(zone.x, zone.y, zone.radius * pulse, 0, Math.PI * 2);
			context.stroke();
			context.setLineDash([]);
			context.strokeStyle = deployed
				? "rgba(109, 205, 158, 0.32)"
				: "rgba(155, 196, 196, 0.24)";
			context.lineWidth = 1;
			context.beginPath();
			context.moveTo(zone.x - 18, zone.y);
			context.lineTo(zone.x + 18, zone.y);
			context.moveTo(zone.x, zone.y - 18);
			context.lineTo(zone.x, zone.y + 18);
			context.stroke();
			context.restore();
			if (deployed) this.drawBuoy(context, zone);
		}
	}

	override draw(renderer: Renderer): void {
		const context = contextOf(renderer);
		context.save();
		this.drawWater(context);
		this.drawCurrent(context);
		this.drawShores(context);
		this.drawSandbars(context);
		this.drawDriftwood(context);
		this.drawDock(context);
		this.drawZones(context);
		this.drawBoatWake(context);
		context.restore();
	}

	private drawBoatWake(context: CanvasRenderingContext2D): void {
		if (this.boatX === 0 && this.boatY === 0) return;
		for (let index = 0; index < 3; index++) {
			const radius = 28 + index * 18 + ((this.elapsed * 16) % 18);
			context.strokeStyle = `rgba(158, 205, 202, ${0.22 - index * 0.055})`;
			context.lineWidth = 1.2;
			context.beginPath();
			context.ellipse(
				this.boatX,
				this.boatY,
				radius,
				radius * 0.55,
				0.15,
				0,
				Math.PI * 2,
			);
			context.stroke();
		}
	}
}

export type HazardKind = "shore" | "sandbar" | "driftwood";

abstract class StaticCollider extends Renderable {
	readonly hazardKind: HazardKind;

	constructor(kind: HazardKind, shapes: BodyShape[]) {
		super(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
		this.hazardKind = kind;
		this.anchorPoint.set(0, 0);
		this.isKinematic = false;
		this.bodyDef = {
			type: "static",
			shapes,
			collisionType: collision.types.WORLD_SHAPE,
			collisionMask: collision.types.PLAYER_OBJECT,
		};
	}

	override draw(): void {}
}

export class ShoreCollider extends StaticCollider {
	constructor(map: EstuaryMap) {
		const shapes: BodyShape[] = [
			new Rect(0, 0, 28, WORLD_HEIGHT),
			new Rect(WORLD_WIDTH - 28, 0, 28, WORLD_HEIGHT),
		];
		for (let index = 0; index < map.topShore.length; index++) {
			shapes.push(new Rect(index * 120 - 2, 0, 124, map.topShore[index] + 8));
			const bottom = map.bottomShore[index] - 8;
			shapes.push(
				new Rect(index * 120 - 2, bottom, 124, WORLD_HEIGHT - bottom),
			);
		}
		super("shore", shapes);
	}
}

export class SandbarCollider extends StaticCollider {
	constructor(map: EstuaryMap) {
		super(
			"sandbar",
			map.sandbars.map(
				(sandbar) =>
					new Ellipse(sandbar.x, sandbar.y, sandbar.rx * 2, sandbar.ry * 2),
			),
		);
	}
}

export class DriftwoodCollider extends StaticCollider {
	constructor(map: EstuaryMap) {
		super(
			"driftwood",
			map.driftwood.map(
				(log) => new Rect(log.x - log.length / 2, log.y - 11, log.length, 22),
			),
		);
	}
}

interface BoatCallbacks {
	onDamage: (kind: HazardKind) => void;
}

export class Boat extends Renderable {
	readonly map: EstuaryMap;
	readonly lamp: Light2d;
	heading = -0.24;
	durability = 100;
	deployed = 0;
	controlsEnabled = true;
	running = false;
	tide = 0;
	impactFlash = 0;
	private readonly callbacks: BoatCallbacks;
	private speed = 0;
	private elapsed = 0;
	private hitCooldown = 0;
	private boatBody?: PhysicsBody;

	constructor(map: EstuaryMap, callbacks: BoatCallbacks) {
		super(map.start.x, map.start.y, 76, 38);
		this.map = map;
		this.callbacks = callbacks;
		this.anchorPoint.set(0.5, 0.5);
		this.alwaysUpdate = true;
		this.bodyDef = {
			type: "dynamic",
			shapes: [new Ellipse(38, 19, 62, 28)],
			collisionType: collision.types.PLAYER_OBJECT,
			collisionMask: collision.types.WORLD_SHAPE,
			gravityScale: 0,
			frictionAir: 0,
			restitution: 0.05,
		};
		this.lamp = new Light2d(0, 0, 275, 195, "#ffd49a", 1.05);
		this.lamp.softness = 0.82;
		this.lamp.pos.set(map.start.x, map.start.y);
	}

	get loadFactor(): number {
		return 1 + this.deployed * 0.12;
	}

	get speedValue(): number {
		return this.speed;
	}

	setTide(tide: number): void {
		this.tide = tide;
	}

	override onActivateEvent(): void {
		this.boatBody = this.body as PhysicsBody;
	}

	override update(dt: number): boolean {
		const seconds = Math.min(0.05, dt / 1000);
		this.elapsed += seconds;
		this.hitCooldown = Math.max(0, this.hitCooldown - seconds);
		this.impactFlash = Math.max(0, this.impactFlash - seconds * 2.8);
		if (!this.running) {
			this.speed = 0;
			this.boatBody?.setVelocity(0, 0);
			return true;
		}
		const controls = this.controlsEnabled;
		const dtScale = Math.max(0.2, Math.min(2.8, dt / 16.667));
		const maxSpeed = 3.25 / Math.sqrt(this.loadFactor);
		const acceleration = 0.085 / this.loadFactor;
		const reverseAcceleration = 0.045 / this.loadFactor;
		let throttle = 0;
		if (controls && input.isKeyPressed("forward")) throttle += 1;
		if (controls && input.isKeyPressed("reverse")) throttle -= 1;
		if (throttle > 0) {
			this.speed += acceleration * dtScale;
		} else if (throttle < 0) {
			this.speed -= reverseAcceleration * dtScale;
		}
		this.speed -= this.speed * 0.008 * dtScale;
		this.speed = Math.max(-maxSpeed * 0.55, Math.min(maxSpeed, this.speed));
		if (Math.abs(this.speed) < 0.035) this.speed = 0;

		const steering = controls
			? Number(input.isKeyPressed("right")) - Number(input.isKeyPressed("left"))
			: 0;
		const turnRate =
			(0.044 / this.loadFactor) * (0.5 + Math.min(1, Math.abs(this.speed) / 2));
		this.heading += steering * turnRate * dtScale;

		const currentScale = 0.82 + this.tide * 0.5;
		const current = currentAt(this.pos.x, this.pos.y, this.elapsed);
		const velocityX =
			Math.cos(this.heading) * this.speed + current.x * currentScale;
		const velocityY =
			Math.sin(this.heading) * this.speed + current.y * currentScale;
		this.boatBody?.setVelocity(velocityX, velocityY);
		return true;
	}

	override onCollisionStart(
		response: CollisionResponse,
		other: Renderable,
	): void {
		this.applyImpact(response, other);
	}

	override onCollisionActive(
		response: CollisionResponse,
		other: Renderable,
	): void {
		if (this.hitCooldown <= 0) this.applyImpact(response, other);
	}

	private applyImpact(response: CollisionResponse, other: Renderable): void {
		if (!(other instanceof StaticCollider) || this.hitCooldown > 0) return;
		const kind = other.hazardKind;
		const impact = Math.abs(this.speed) + Math.abs(response.depth) * 0.12;
		const damage = kind === "shore" ? 10 + impact * 6 : 5 + impact * 4.4;
		this.durability = Math.max(0, this.durability - Math.round(damage));
		this.hitCooldown = 0.8;
		this.impactFlash = 1;
		this.speed *= -0.22;
		this.heading +=
			Math.sign(response.normal.x || 1) *
			(0.05 + Math.min(0.14, impact * 0.03));
		this.callbacks.onDamage(kind);
	}

	override draw(renderer: Renderer): void {
		const context = contextOf(renderer);
		context.save();
		context.translate(this.pos.x, this.pos.y);
		context.rotate(this.heading);
		context.fillStyle = "rgba(0, 0, 0, 0.34)";
		context.beginPath();
		context.ellipse(-2, 9, 35, 10, 0, 0, Math.PI * 2);
		context.fill();
		context.beginPath();
		context.moveTo(32, 0);
		context.quadraticCurveTo(20, -16, -13, -14);
		context.lineTo(-29, -9);
		context.lineTo(-29, 9);
		context.lineTo(-13, 14);
		context.quadraticCurveTo(20, 16, 32, 0);
		context.closePath();
		context.fillStyle = "#d9d1b4";
		context.fill();
		context.strokeStyle = "#4b4438";
		context.lineWidth = 2;
		context.stroke();
		context.fillStyle = "#6d5137";
		context.fillRect(-16, -9, 24, 18);
		context.fillStyle = "#342a21";
		context.fillRect(-8, -6, 10, 12);
		context.fillStyle = "#d18a49";
		context.fillRect(6, -3, 13, 6);
		context.strokeStyle = "#99b3ad";
		context.lineWidth = 1.4;
		context.beginPath();
		context.moveTo(14, 0);
		context.lineTo(20, -17);
		context.stroke();
		context.fillStyle = "#ffe2a1";
		context.beginPath();
		context.arc(20, -18, 4, 0, Math.PI * 2);
		context.fill();
		if (this.impactFlash > 0) {
			context.fillStyle = `rgba(255, 85, 60, ${this.impactFlash * 0.55})`;
			context.beginPath();
			context.ellipse(0, 0, 38, 20, 0, 0, Math.PI * 2);
			context.fill();
		}
		context.restore();
	}
}

export class EstuaryAudio {
	private context: AudioContext | null = null;
	private engineGain: GainNode | null = null;
	private engineFilter: BiquadFilterNode | null = null;
	private oscillators: OscillatorNode[] = [];
	private waterGain: GainNode | null = null;
	private waterSource: AudioBufferSourceNode | null = null;
	private nextWave = 2.5;

	start(): void {
		const context = audio.getAudioContext();
		const master = audio.getMasterGain();
		if (!context || !master || this.context !== null) return;
		this.context = context;
		this.engineGain = context.createGain();
		this.engineGain.gain.value = 0;
		this.engineFilter = context.createBiquadFilter();
		this.engineFilter.type = "lowpass";
		this.engineFilter.frequency.value = 320;
		this.engineFilter.Q.value = 0.8;
		this.engineGain.connect(this.engineFilter).connect(master);
		for (const [type, frequency, detune] of [
			["sawtooth", 46, -7],
			["triangle", 92, 9],
		] as const) {
			const oscillator = context.createOscillator();
			oscillator.type = type;
			oscillator.frequency.value = frequency;
			oscillator.detune.value = detune;
			oscillator.connect(this.engineGain);
			oscillator.start();
			this.oscillators.push(oscillator);
		}

		this.waterGain = context.createGain();
		this.waterGain.gain.value = 0.018;
		const buffer = context.createBuffer(
			1,
			context.sampleRate * 2,
			context.sampleRate,
		);
		const samples = buffer.getChannelData(0);
		let last = 0;
		for (let index = 0; index < samples.length; index++) {
			last = (last + (Math.random() * 2 - 1) * 0.018) / 1.018;
			samples[index] = last * 2.4;
		}
		this.waterSource = context.createBufferSource();
		this.waterSource.buffer = buffer;
		this.waterSource.loop = true;
		this.waterSource.connect(this.waterGain).connect(master);
		this.waterSource.start();
	}

	update(dt: number, speed: number, throttle: number, elapsed: number): void {
		if (!this.context || !this.engineGain || !this.engineFilter) return;
		const now = this.context.currentTime;
		const targetGain = 0.016 + Math.min(0.04, Math.abs(speed) * 0.012);
		this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
		this.engineFilter.frequency.setTargetAtTime(
			250 + Math.abs(speed) * 125 + throttle * 60,
			now,
			0.1,
		);
		for (const oscillator of this.oscillators) {
			oscillator.detune.setTargetAtTime(
				speed * 14 + Math.sin(elapsed * 3.2) * 4,
				now,
				0.12,
			);
		}
		this.nextWave -= dt / 1000;
		if (this.nextWave <= 0) {
			this.nextWave = 3.5 + Math.random() * 3.2;
			audio.noise({
				duration: 1.35,
				type: "pink",
				gain: 0.045,
				filter: { type: "bandpass", frequency: 520, Q: 0.7 },
			});
		}
	}

	splash(): void {
		audio.noise({
			duration: 0.34,
			type: "white",
			gain: 0.12,
			filter: { type: "bandpass", frequency: 850, Q: 1.1 },
			filterSweep: 1.8,
		});
	}

	drop(): void {
		this.splash();
		audio.tone({
			freq: 240,
			duration: 0.28,
			wave: "sine",
			gain: 0.16,
			pitchSlide: 0.5,
		});
		audio.tone({
			freq: [520, 780],
			duration: 0.55,
			gain: 0.08,
			delay: 0.16,
		});
	}

	impact(kind: "shore" | "sandbar" | "driftwood"): void {
		const heavy = kind === "shore";
		audio.noise({
			duration: heavy ? 0.62 : 0.4,
			type: "brown",
			gain: heavy ? 0.26 : 0.19,
			filter: { type: "lowpass", frequency: heavy ? 240 : 420 },
			filterSweep: 0.4,
		});
		audio.tone({
			freq: heavy ? 92 : 150,
			duration: 0.22,
			wave: "square",
			gain: 0.1,
			pitchSlide: 0.55,
		});
	}

	success(): void {
		audio.tone({ freq: 392, duration: 0.2, gain: 0.12 });
		audio.tone({ freq: 523, duration: 0.22, gain: 0.12, delay: 0.15 });
		audio.tone({ freq: [659, 784], duration: 0.8, gain: 0.1, delay: 0.31 });
	}

	failure(): void {
		audio.tone({
			freq: 180,
			duration: 0.8,
			wave: "sawtooth",
			gain: 0.09,
			pitchSlide: 0.3,
		});
	}

	stop(): void {
		for (const oscillator of this.oscillators) {
			oscillator.stop();
			oscillator.disconnect();
		}
		this.oscillators = [];
		this.waterSource?.stop();
		this.waterSource?.disconnect();
		this.waterSource = null;
		this.waterGain?.disconnect();
		this.waterGain = null;
		this.engineGain?.disconnect();
		this.engineFilter?.disconnect();
		this.engineGain = null;
		this.engineFilter = null;
		this.context = null;
	}
}
