/**
 * Source orbit and listener trajectory bookkeeping. The source travels
 * a slow ellipse around the room centre; the listener path is whatever
 * the user drags through, sampled at a fixed interval so the offline
 * render replays exactly what was heard.
 */
import type { PlanPoint, RoomDimensions } from "./types";

export const ORBIT_PERIOD_SEC = 24;
/** how often the dragged listener position is recorded, seconds */
export const TRAJECTORY_SAMPLE_INTERVAL = 0.1;
/** cap memory and render length: last N seconds of the drag path */
export const TRAJECTORY_WINDOW_SEC = 30;

/** source position on its orbit at a given audio-clock time */
export const sourceOrbitPosition = (
	room: RoomDimensions,
	timeSec: number,
): PlanPoint => {
	const angle = (2 * Math.PI * timeSec) / ORBIT_PERIOD_SEC;
	const radiusX = room.width * 0.32;
	const radiusY = room.depth * 0.32;
	return {
		x: room.width / 2 + Math.cos(angle) * radiusX,
		y: room.depth / 2 + Math.sin(angle) * radiusY,
	};
};

export interface TimedPoint {
	time: number;
	point: PlanPoint;
}

/**
 * Append a listener position, dropping samples that are too close in
 * time and trimming anything older than the rolling window.
 */
export const recordTrajectoryPoint = (
	trajectory: TimedPoint[],
	time: number,
	point: PlanPoint,
): TimedPoint[] => {
	const last = trajectory[trajectory.length - 1];
	if (last && time - last.time < TRAJECTORY_SAMPLE_INTERVAL) {
		return trajectory;
	}
	const next = [...trajectory, { time, point }];
	const cutoff = time - TRAJECTORY_WINDOW_SEC;
	return next.filter((sample) => sample.time >= cutoff);
};

/** clamp a dragged point so the listener stays inside the room */
export const clampToRoom = (
	point: PlanPoint,
	room: RoomDimensions,
	margin = 0.2,
): PlanPoint => ({
	x: Math.min(Math.max(margin, point.x), Math.max(margin, room.width - margin)),
	y: Math.min(Math.max(margin, point.y), Math.max(margin, room.depth - margin)),
});
