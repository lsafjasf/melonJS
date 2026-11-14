/**
 * melonJS — Repair Pod docking example: shared mission types.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export type MissionState =
	| "flying"
	| "complete"
	| "collision"
	| "lost"
	| "timeout";

export type FailureReason = Exclude<MissionState, "flying" | "complete">;

export interface Point {
	x: number;
	y: number;
}

export interface ContactMark extends Point {
	at: number;
	label: string;
}

export interface MissionTelemetry {
	state: MissionState;
	failureReason: FailureReason | null;
	failureDetail: string;
	activeIndex: number;
	completed: number;
	hull: number;
	fuel: number;
	elapsedMs: number;
	remainingMs: number;
	speed: number;
	relativeSpeed: number;
	range: number;
	angleError: number;
	exhausted: boolean;
	podCenter: Point;
	podAngle: number;
	velocity: Point;
	dockPoint: Point;
	dockAngle: number;
	lastContact: ContactMark | null;
	message: string;
}

export interface RepairPodHarness {
	/** A serialisable view of the mission, including the failure reason. */
	snapshot(): MissionTelemetry;
	/** Restore the fixed scene and the pod's starting state. */
	restart(): void;
	/**
	 * Put the pod on the first port's radial approach line. The direction is
	 * always correct, so the only variable is speed. Used by the browser
	 * verification script for both the clean clamp and the overspeed impact.
	 */
	stageApproach(speed: number): MissionTelemetry;
	/** Stop the current port's rotation, for visual inspection. */
	freezeActiveBerth(): MissionTelemetry;
	/** Exercise a failure screen without waiting for the real condition. */
	forceFailure(reason: FailureReason, detail?: string): MissionTelemetry;
}
