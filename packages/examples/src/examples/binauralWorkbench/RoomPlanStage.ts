/**
 * Room plan visualisation for the binaural workbench.
 *
 * This is an acoustic plan view, not a game map: it draws the room
 * outline, the source orbit, the moving source, the listener and the
 * recorded listening path. The stage is only mounted after the user
 * builds the sound (see ExampleBinauralWorkbench), so the plan never
 * appears before audio generation has finished.
 */
import { game, input, Renderable, Stage, Text } from "melonjs";
import {
	clampToRoom,
	sourceOrbitPosition,
	type TimedPoint,
} from "./trajectory";
import type { PlanPoint, RoomDimensions, WallMaterial } from "./types";

const MARGIN = 48;

/** pixels per metre, fitted to the design resolution with a margin */
export const planScale = (
	room: RoomDimensions,
	viewportWidth: number,
	viewportHeight: number,
): number =>
	Math.min(
		(viewportWidth - MARGIN * 2) / room.width,
		(viewportHeight - MARGIN * 2) / room.depth,
	);

export class RoomPlanRenderable extends Renderable {
	private room: RoomDimensions;
	private material: WallMaterial;
	private planPxPerMetre: number;
	private originX: number;
	private originY: number;
	private source: PlanPoint;
	private listener: PlanPoint;
	private trajectory: TimedPoint[] = [];
	private readonly label: Text;

	constructor(
		room: RoomDimensions,
		material: WallMaterial,
		viewportWidth: number,
		viewportHeight: number,
	) {
		super(0, 0, viewportWidth, viewportHeight);
		// plain Renderable defaults to kinematic, which would block the
		// viewport-level pointer drag used to move the listener
		this.isKinematic = false;
		this.anchorPoint.set(0, 0);
		this.room = room;
		this.material = material;
		this.planPxPerMetre = planScale(room, viewportWidth, viewportHeight);
		this.originX = (viewportWidth - room.width * this.planPxPerMetre) / 2;
		this.originY = (viewportHeight - room.depth * this.planPxPerMetre) / 2;
		this.source = sourceOrbitPosition(room, 0);
		this.listener = {
			x: room.width / 2,
			y: room.depth * 0.7,
		};
		this.label = new Text(MARGIN, 12, {
			font: "Arial",
			size: "14px",
			fillStyle: "#cfe3ff",
			textBaseline: "top",
		});
	}

	toPlan(worldX: number, worldY: number): PlanPoint {
		return clampToRoom(
			{
				x: (worldX - this.originX) / this.planPxPerMetre,
				y: (worldY - this.originY) / this.planPxPerMetre,
			},
			this.room,
		);
	}

	toWorld(point: PlanPoint): { x: number; y: number } {
		return {
			x: this.originX + point.x * this.planPxPerMetre,
			y: this.originY + point.y * this.planPxPerMetre,
		};
	}

	setListener(point: PlanPoint): void {
		this.listener = clampToRoom(point, this.room);
	}

	getListener(): PlanPoint {
		return this.listener;
	}

	setTrajectory(trajectory: TimedPoint[]): void {
		this.trajectory = trajectory;
	}

	setSource(source: PlanPoint): void {
		this.source = source;
	}

	override update(): boolean {
		return true;
	}

	override draw(renderer: Parameters<Renderable["draw"]>[0]): void {
		const width = this.room.width * this.planPxPerMetre;
		const height = this.room.depth * this.planPxPerMetre;

		// room outline — the four walls this material describes
		renderer.setColor("#16233b");
		renderer.fillRect(this.originX, this.originY, width, height);
		renderer.setColor("#7fa8e0");
		renderer.strokeRect(this.originX, this.originY, width, height);

		// metre grid so dimensions stay readable
		renderer.setColor("rgba(127, 168, 224, 0.18)");
		for (let x = 1; x < this.room.width; x += 1) {
			const gx = this.originX + x * this.planPxPerMetre;
			renderer.strokeLine(gx, this.originY, gx, this.originY + height);
		}
		for (let y = 1; y < this.room.depth; y += 1) {
			const gy = this.originY + y * this.planPxPerMetre;
			renderer.strokeLine(this.originX, gy, this.originX + width, gy);
		}

		// source orbit guide
		renderer.setColor("rgba(255, 196, 87, 0.5)");
		const center = this.toWorld({
			x: this.room.width / 2,
			y: this.room.depth / 2,
		});
		renderer.strokeEllipse(
			center.x,
			center.y,
			this.room.width * 0.32 * this.planPxPerMetre * 2,
			this.room.depth * 0.32 * this.planPxPerMetre * 2,
		);

		// recorded listening path
		if (this.trajectory.length > 1) {
			renderer.setColor("rgba(120, 220, 160, 0.85)");
			for (let i = 1; i < this.trajectory.length; i += 1) {
				const a = this.toWorld(this.trajectory[i - 1].point);
				const b = this.toWorld(this.trajectory[i].point);
				renderer.strokeLine(a.x, a.y, b.x, b.y);
			}
		}

		// moving source
		const sourceWorld = this.toWorld(this.source);
		renderer.setColor("#ffc457");
		renderer.fillEllipse(sourceWorld.x, sourceWorld.y, 12, 12);

		// listener, with a heading tick toward the front wall
		const listenerWorld = this.toWorld(this.listener);
		renderer.setColor("#66e0a0");
		renderer.fillEllipse(listenerWorld.x, listenerWorld.y, 16, 16);
		renderer.setColor("#d8ffe9");
		renderer.strokeLine(
			listenerWorld.x,
			listenerWorld.y,
			listenerWorld.x,
			listenerWorld.y - 22,
		);

		this.label.setText(
			`${this.room.width} × ${this.room.depth} × ${this.room.height} m — ${this.material.label}`,
		);
		this.label.draw(renderer);
	}
}

export class RoomPlanStage extends Stage {
	readonly plan: RoomPlanRenderable;
	private dragging = false;

	constructor(room: RoomDimensions, material: WallMaterial) {
		super();
		this.plan = new RoomPlanRenderable(
			room,
			material,
			game.viewport.width,
			game.viewport.height,
		);
	}

	override onResetEvent(): void {
		game.world.addChild(this.plan, 1);
		input.registerPointerEvent("pointerdown", game.viewport, (event) => {
			this.dragging = true;
			const point = this.plan.toPlan(event.gameWorldX, event.gameWorldY);
			this.plan.setListener(point);
			return false;
		});
		input.registerPointerEvent("pointermove", game.viewport, (event) => {
			if (!this.dragging) {
				return undefined;
			}
			const point = this.plan.toPlan(event.gameWorldX, event.gameWorldY);
			this.plan.setListener(point);
			return false;
		});
		const release = () => {
			this.dragging = false;
		};
		input.registerPointerEvent("pointerup", game.viewport, release);
		input.registerPointerEvent("pointercancel", game.viewport, release);
	}

	override onDestroyEvent(): void {
		input.releasePointerEvent("pointerdown", game.viewport);
		input.releasePointerEvent("pointermove", game.viewport);
		input.releasePointerEvent("pointerup", game.viewport);
		input.releasePointerEvent("pointercancel", game.viewport);
		game.world.removeChild(this.plan);
	}
}
