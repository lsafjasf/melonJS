/**
 * melonJS — Ice Core Survey: the live ice effects.
 *
 * Cracks are scheduled branches, not one-shot decals: a branch can appear a
 * second or two after the tread has passed, so the shelf visibly keeps
 * failing behind the vehicle. The screen-space weather sits above the world
 * and below the HUD.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Renderable, type Renderer } from "melonjs";
import { MAP_HEIGHT, MAP_WIDTH, type WorldData } from "./terrain";

interface Point {
	x: number;
	y: number;
}

interface Branch {
	points: Point[];
	width: number;
	start: number;
	duration: number;
}

function mulberry32(seed: number) {
	let value = seed >>> 0;
	return () => {
		value += 0x6d2b79f5;
		let t = value;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A growing fracture network. Each polyline has its own start time, so the
 * edge of the damage keeps advancing after the tracks stop.
 */
export class CrackField extends Renderable {
	private branches: Branch[] = [];
	private clock = 0;
	private rng = mulberry32(0xc0ffee);

	constructor() {
		super(0, 0, MAP_WIDTH, MAP_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	get branchCount() {
		return this.branches.length;
	}

	spawn(x: number, y: number, heading: number, severity: number) {
		const strength = Math.max(0.25, Math.min(1, severity));
		const tread = 29;
		const sideX = -Math.sin(heading) * tread;
		const sideY = Math.cos(heading) * tread;

		for (let i = 0; i < 2 + Math.round(strength * 2); i++) {
			const side = i % 2 === 0 ? 1 : -1;
			const rootX = x + sideX * side + (this.rng() - 0.5) * 18;
			const rootY = y + sideY * side + (this.rng() - 0.5) * 18;
			this.makeBranch(
				rootX,
				rootY,
				heading + side * (Math.PI / 2 + (this.rng() - 0.5) * 0.8),
				36 + this.rng() * 48 * strength,
				1.2 + strength * 2.05,
				2,
				this.clock + this.rng() * 0.45,
				strength,
			);
		}

		if (strength > 0.62) {
			this.makeBranch(
				x,
				y,
				heading + (this.rng() - 0.5) * 0.55,
				28 + this.rng() * 42,
				1.1,
				1,
				this.clock + 0.15,
				strength,
			);
		}

		if (this.branches.length > 1300) {
			this.branches.splice(0, this.branches.length - 1300);
		}
	}

	private makeBranch(
		x: number,
		y: number,
		angle: number,
		length: number,
		width: number,
		depth: number,
		start: number,
		strength: number,
	) {
		const points: Point[] = [{ x, y }];
		let px = x;
		let py = y;
		let direction = angle;
		const steps = 4 + Math.floor(this.rng() * 4);
		for (let i = 0; i < steps; i++) {
			direction += (this.rng() - 0.5) * 0.48;
			const step = (length / steps) * (0.62 + this.rng() * 0.7);
			px += Math.cos(direction) * step;
			py += Math.sin(direction) * step;
			points.push({ x: px, y: py });
		}
		this.branches.push({
			points,
			width: Math.max(0.65, width),
			start,
			duration: 0.8 + this.rng() * 1.4,
		});

		if (depth > 0) {
			const forks = this.rng() < 0.45 ? 1 : 2;
			for (let f = 0; f < forks; f++) {
				const at = points[1 + Math.floor(this.rng() * (points.length - 2))];
				this.makeBranch(
					at.x,
					at.y,
					direction + (this.rng() < 0.5 ? -1 : 1) * (0.48 + this.rng() * 0.7),
					length * (0.3 + this.rng() * 0.24),
					Math.max(0.55, width * 0.62),
					depth - 1,
					start + 0.55 + this.rng() * 1.7 * strength,
					strength,
				);
			}
		}
	}

	clear() {
		this.branches.length = 0;
		this.clock = 0;
	}

	override update(dt: number) {
		this.clock += Math.min(dt, 50) / 1000;
		return true;
	}

	override draw(renderer: Renderer) {
		for (const branch of this.branches) {
			if (this.clock < branch.start) {
				continue;
			}
			const t = Math.min(1, (this.clock - branch.start) / branch.duration);
			const segments = branch.points.length - 1;
			const exact = t * segments;
			const complete = Math.floor(exact);

			renderer.lineWidth = branch.width + 1.8;
			renderer.setColor("rgba(27, 64, 74, 0.48)");
			this.strokeProgress(renderer, branch, complete, exact - complete);
			renderer.lineWidth = Math.max(0.75, branch.width * 0.58);
			renderer.setColor("rgba(230, 251, 252, 0.95)");
			this.strokeProgress(renderer, branch, complete, exact - complete);
		}
	}

	private strokeProgress(
		renderer: Renderer,
		branch: Branch,
		complete: number,
		fraction: number,
	) {
		for (let i = 0; i < complete; i++) {
			const a = branch.points[i];
			const b = branch.points[i + 1];
			renderer.strokeLine(a.x, a.y, b.x, b.y);
		}
		if (complete < branch.points.length - 1 && fraction > 0) {
			const a = branch.points[complete];
			const b = branch.points[complete + 1];
			renderer.strokeLine(
				a.x,
				a.y,
				a.x + (b.x - a.x) * fraction,
				a.y + (b.y - a.y) * fraction,
			);
		}
	}
}

interface ObjectiveState {
	collected: boolean[];
	jettisoned: boolean[];
	returning: boolean;
}

/** Pulsing world-space rings around the current objective. */
export class ObjectiveMarkers extends Renderable {
	private clock = 0;
	private state: ObjectiveState = {
		collected: [false, false, false],
		jettisoned: [false, false, false],
		returning: false,
	};

	constructor(private readonly world: WorldData) {
		super(0, 0, MAP_WIDTH, MAP_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	setState(state: ObjectiveState) {
		this.state = state;
	}

	override update(dt: number) {
		this.clock += Math.min(dt, 50) / 1000;
		return true;
	}

	override draw(renderer: Renderer) {
		for (const [index, core] of this.world.cores.entries()) {
			const collected = this.state.collected[index];
			const jettisoned = this.state.jettisoned[index];
			const active = !collected && !jettisoned;
			if (!active) {
				renderer.lineWidth = 1.5;
				renderer.setColor(
					collected ? "rgba(116, 221, 167, 0.42)" : "rgba(145, 159, 161, 0.28)",
				);
				renderer.strokeEllipse(core.x, core.y, core.radius, core.radius, false);
				continue;
			}
			const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.5 + index);
			const radius = core.radius + 5 + pulse * 7;
			renderer.lineWidth = 2.2;
			renderer.setColor(`rgba(255, 207, 113, ${0.35 + pulse * 0.4})`);
			renderer.strokeEllipse(core.x, core.y, radius, radius, false);
			renderer.lineWidth = 1;
			renderer.setColor("rgba(255, 229, 171, 0.34)");
			renderer.strokeEllipse(
				core.x,
				core.y,
				core.radius * 0.72,
				core.radius * 0.72,
				false,
			);
			this.drawTicks(renderer, core.x, core.y, radius, this.clock * 0.35);
		}

		if (this.state.returning) {
			const pulse = 0.5 + 0.5 * Math.sin(this.clock * 3);
			const radius = this.world.camp.radius + 6 + pulse * 14;
			renderer.lineWidth = 3;
			renderer.setColor(`rgba(255, 204, 104, ${0.5 + pulse * 0.4})`);
			renderer.strokeEllipse(
				this.world.camp.x,
				this.world.camp.y,
				radius,
				radius,
				false,
			);
		}
	}

	private drawTicks(
		renderer: Renderer,
		x: number,
		y: number,
		radius: number,
		rotation: number,
	) {
		for (let i = 0; i < 4; i++) {
			const a = rotation + (i / 4) * Math.PI * 2;
			const r1 = radius + 3;
			const r2 = radius + 11;
			renderer.strokeLine(
				x + Math.cos(a) * r1,
				y + Math.sin(a) * r1,
				x + Math.cos(a) * r2,
				y + Math.sin(a) * r2,
			);
		}
	}
}

interface Flake {
	x: number;
	y: number;
	size: number;
	speed: number;
	drift: number;
	alpha: number;
}

/**
 * Screen-space wind streaks and the final cold vignette. The flakes proper
 * are a `ParticleEmitter`; these long, sparse streaks are what makes the
 * wind direction readable at a glance.
 */
export class WeatherOverlay extends Renderable {
	private flakes: Flake[] = [];
	private clock = 0;

	constructor(
		private readonly width: number,
		private readonly height: number,
	) {
		super(0, 0, width, height);
		this.anchorPoint.set(0, 0);
		this.floating = true;
		this.alwaysUpdate = true;
		const rng = mulberry32(0xb11a2a);
		for (let i = 0; i < 64; i++) {
			this.flakes.push({
				x: rng() * width,
				y: rng() * height,
				size: 18 + rng() * 95,
				speed: 150 + rng() * 310,
				drift: -34 + rng() * 28,
				alpha: 0.04 + rng() * 0.13,
			});
		}
	}

	override update(dt: number) {
		const seconds = Math.min(dt, 50) / 1000;
		this.clock += seconds;
		const gust = 1 + 0.28 * Math.sin(this.clock * 0.7);
		for (const flake of this.flakes) {
			flake.x -= flake.speed * seconds * gust;
			flake.y += flake.drift * seconds;
			if (flake.x < -120) {
				flake.x = this.width + 120;
				flake.y = ((flake.y % this.height) + this.height) % this.height;
			}
			if (flake.y < -40) {
				flake.y = this.height + 40;
			} else if (flake.y > this.height + 40) {
				flake.y = -40;
			}
		}
		return true;
	}

	override draw(renderer: Renderer) {
		renderer.setColor("rgba(239, 253, 255, 0.055)");
		renderer.lineWidth = 1.1;
		for (const flake of this.flakes) {
			renderer.setColor(`rgba(239, 253, 255, ${flake.alpha})`);
			renderer.strokeLine(
				flake.x,
				flake.y,
				flake.x + flake.size,
				flake.y - flake.size * 0.16,
			);
		}

		const vignette = renderer.createRadialGradient(
			this.width / 2,
			this.height / 2,
			Math.min(this.width, this.height) * 0.18,
			this.width / 2,
			this.height / 2,
			Math.max(this.width, this.height) * 0.72,
		);
		vignette.addColorStop(0, "rgba(8, 31, 39, 0)");
		vignette.addColorStop(0.67, "rgba(8, 31, 39, 0.05)");
		vignette.addColorStop(1, "rgba(5, 20, 28, 0.44)");
		renderer.setColor(vignette);
		renderer.fillRect(0, 0, this.width, this.height);
	}
}
