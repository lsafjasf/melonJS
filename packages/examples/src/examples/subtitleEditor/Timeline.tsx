/**
 * melonJS — subtitle editor: the bottom timeline.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { useCallback, useMemo, useRef } from "react";
import { type Cue, formatClock, TIME_STEP, TIMELINE_DURATION } from "./cues";
import type { WavePeak } from "./waveform";

type DragKind = "move" | "start" | "end" | "playhead";

interface DragState {
	kind: DragKind;
	cueId: string | null;
	baseStart: number;
	baseEnd: number;
}

interface TimelineProps {
	cues: Cue[];
	overlaps: Set<string>;
	time: number;
	peaks: WavePeak[];
	sourceDuration: number;
	loopRange: { start: number; end: number } | null;
	onSeek: (time: number) => void;
	onResize: (id: string, start: number, end: number) => void;
	onMove: (id: string, start: number) => void;
}

/** a tick every two seconds with a label every ten */
const TICKS = Array.from(
	{ length: TIMELINE_DURATION / 2 + 1 },
	(_, index) => index * 2,
);

export const Timeline = ({
	cues,
	overlaps,
	time,
	peaks,
	sourceDuration,
	loopRange,
	onSeek,
	onResize,
	onMove,
}: TimelineProps) => {
	const trackRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<DragState | null>(null);

	const timeFromEvent = useCallback((clientX: number): number => {
		const track = trackRef.current;
		if (!track) {
			return 0;
		}
		const rect = track.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.round((ratio * TIMELINE_DURATION) / TIME_STEP) * TIME_STEP;
	}, []);

	const beginDrag = useCallback(
		(event: React.PointerEvent, kind: DragKind, cue: Cue | null) => {
			event.stopPropagation();
			// the browser can reject capture when the pointer was already
			// released (e.g. a click synthesized from the keyboard)
			try {
				(event.target as Element).setPointerCapture?.(event.pointerId);
			} catch {
				// dragging without capture still works for the current gesture
			}
			dragRef.current = {
				kind,
				cueId: cue?.id ?? null,
				baseStart: cue?.start ?? 0,
				baseEnd: cue?.end ?? 0,
			};
			// a plain click (down then up, no move) must still seek
			if (kind === "playhead") {
				onSeek(timeFromEvent(event.clientX));
			}
		},
		[onSeek, timeFromEvent],
	);

	const handleMove = useCallback(
		(event: React.PointerEvent) => {
			const drag = dragRef.current;
			if (!drag) {
				return;
			}
			const next = timeFromEvent(event.clientX);
			if (drag.kind === "playhead") {
				onSeek(next);
				return;
			}
			if (!drag.cueId) {
				return;
			}
			if (drag.kind === "move") {
				const length = drag.baseEnd - drag.baseStart;
				onMove(drag.cueId, Math.min(next, TIMELINE_DURATION - length));
			} else if (drag.kind === "start") {
				onResize(
					drag.cueId,
					Math.min(next, drag.baseEnd - TIME_STEP),
					drag.baseEnd,
				);
			} else {
				onResize(
					drag.cueId,
					drag.baseStart,
					Math.max(next, drag.baseStart + TIME_STEP),
				);
			}
		},
		[onMove, onResize, onSeek, timeFromEvent],
	);

	const endDrag = useCallback((event: React.PointerEvent) => {
		try {
			(event.target as Element).releasePointerCapture?.(event.pointerId);
		} catch {
			// nothing was captured; the drag ends regardless
		}
		dragRef.current = null;
	}, []);

	const position = (value: number): string =>
		`${(value / TIMELINE_DURATION) * 100}%`;

	const waveColumns = useMemo(() => {
		if (peaks.length === 0 || sourceDuration <= 0) {
			return [];
		}
		// the source clip repeats across the timeline: tile its peak columns
		const columnCount = 240;
		return Array.from({ length: columnCount }, (_, index) => {
			const columnTime = (index / columnCount) * TIMELINE_DURATION;
			const wrapped = columnTime % sourceDuration;
			const peakIndex = Math.min(
				peaks.length - 1,
				Math.floor((wrapped / sourceDuration) * peaks.length),
			);
			return peaks[peakIndex]?.peak ?? 0;
		});
	}, [peaks, sourceDuration]);

	return (
		<div className="se-timeline">
			<div className="se-ruler">
				{TICKS.map((tick) => (
					<div
						className={`se-tick${tick % 10 === 0 ? " se-tick-major" : ""}`}
						key={tick}
						style={{ left: position(tick) }}
					>
						{tick % 10 === 0 ? formatClock(tick) : ""}
					</div>
				))}
			</div>
			<div
				className="se-track"
				ref={trackRef}
				onPointerDown={(event) => beginDrag(event, "playhead", null)}
				onPointerMove={handleMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				<div className="se-waveform">
					{waveColumns.map((peak, index) => (
						<span
							className="se-wave-bar"
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length columns, stable by position
							key={index}
							style={{ height: `${Math.max(6, peak * 100)}%` }}
						/>
					))}
				</div>
				{loopRange && (
					<div
						className="se-loop-range"
						style={{
							left: position(loopRange.start),
							width: position(loopRange.end - loopRange.start),
						}}
					/>
				)}
				{cues.map((cue) => (
					<div
						className={`se-cue-block${overlaps.has(cue.id) ? " se-cue-overlap" : ""}`}
						key={cue.id}
						style={{
							left: position(cue.start),
							width: position(cue.end - cue.start),
						}}
						onPointerDown={(event) => beginDrag(event, "move", cue)}
						onPointerMove={handleMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						title={cue.text}
					>
						<span
							className="se-cue-edge se-cue-edge-left"
							onPointerDown={(event) => beginDrag(event, "start", cue)}
							onPointerMove={handleMove}
							onPointerUp={endDrag}
							onPointerCancel={endDrag}
						/>
						<span className="se-cue-label">{cue.text}</span>
						<span
							className="se-cue-edge se-cue-edge-right"
							onPointerDown={(event) => beginDrag(event, "end", cue)}
							onPointerMove={handleMove}
							onPointerUp={endDrag}
							onPointerCancel={endDrag}
						/>
					</div>
				))}
				{/* dedicated scrub strip: clicks below the cue blocks always
				    move the playhead rather than being swallowed by a block */}
				<div
					className="se-scrub-strip"
					onPointerDown={(event) => beginDrag(event, "playhead", null)}
					onPointerMove={handleMove}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
				/>
				<div className="se-playhead" style={{ left: position(time) }} />
			</div>
		</div>
	);
};
