import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import type { ConflictMap, Cue } from "./webvtt";
import { formatClock, TRACK_DURATION_MS } from "./webvtt";

type Edge = "start" | "end";

type TimelineProps = {
	cues: Cue[];
	currentMs: number;
	activeIds: ReadonlySet<string>;
	conflicts: ConflictMap;
	peaks: number[];
	onSelect: (id: string) => void;
	onSetEdge: (id: string, edge: Edge, ms: number) => void;
	onScrubStart: () => void;
	onScrub: (ms: number) => void;
	onScrubEnd: () => void;
};

const clamp = (value: number, min: number, max: number) => {
	return Math.min(max, Math.max(min, value));
};

const Waveform = ({ peaks }: { peaks: number[] }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const draw = () => {
			const rect = canvas.getBoundingClientRect();
			const width = Math.max(1, rect.width);
			const height = Math.max(1, rect.height);
			const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
			const context = canvas.getContext("2d");
			if (!context) {
				return;
			}
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			context.clearRect(0, 0, width, height);
			context.fillStyle = "#0b1019";
			context.fillRect(0, 0, width, height);

			context.strokeStyle = "rgba(255, 255, 255, 0.08)";
			context.lineWidth = 1;
			for (let second = 0; second <= 30; second += 5) {
				const x = (second / 30) * width;
				context.beginPath();
				context.moveTo(x, 0);
				context.lineTo(x, height);
				context.stroke();
			}
			context.strokeStyle = "rgba(255, 255, 255, 0.13)";
			context.beginPath();
			context.moveTo(0, height / 2);
			context.lineTo(width, height / 2);
			context.stroke();

			const center = height / 2;
			const step = width / Math.max(1, peaks.length);
			context.fillStyle = "rgba(100, 232, 180, 0.74)";
			for (let index = 0; index < peaks.length; index++) {
				const peak = peaks[index] ?? 0;
				const amplitude = Math.max(1, peak * height * 0.42);
				context.fillRect(
					index * step,
					center - amplitude,
					Math.max(1, step * 0.72),
					amplitude * 2,
				);
			}
		};
		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		return () => {
			observer.disconnect();
		};
	}, [peaks]);

	return (
		<canvas
			ref={canvasRef}
			className="st-wave-canvas"
			role="img"
			aria-label="30 秒音频波形"
		/>
	);
};

export const Timeline = ({
	cues,
	currentMs,
	activeIds,
	conflicts,
	peaks,
	onSelect,
	onSetEdge,
	onScrubStart,
	onScrub,
	onScrubEnd,
}: TimelineProps) => {
	const playhead = clamp(currentMs / TRACK_DURATION_MS, 0, 1);

	const scrubFrom = (event: ReactPointerEvent<HTMLElement>, rect: DOMRect) => {
		event.preventDefault();
		onScrubStart();
		const update = (clientX: number) => {
			onScrub(
				clamp(
					((clientX - rect.left) / Math.max(1, rect.width)) * TRACK_DURATION_MS,
					0,
					TRACK_DURATION_MS,
				),
			);
		};
		update(event.clientX);
		document.body.classList.add("st-scrubbing");
		const move = (moveEvent: PointerEvent) => {
			update(moveEvent.clientX);
		};
		const stop = () => {
			globalThis.removeEventListener("pointermove", move);
			globalThis.removeEventListener("pointerup", stop);
			globalThis.removeEventListener("pointercancel", stop);
			document.body.classList.remove("st-scrubbing");
			onScrubEnd();
		};
		globalThis.addEventListener("pointermove", move);
		globalThis.addEventListener("pointerup", stop);
		globalThis.addEventListener("pointercancel", stop);
	};

	const beginScrub = (event: ReactPointerEvent<HTMLElement>) => {
		scrubFrom(event, event.currentTarget.getBoundingClientRect());
	};

	const beginPlayheadScrub = (event: ReactPointerEvent<HTMLElement>) => {
		const shell = event.currentTarget.closest(".st-timeline-shell");
		if (!(shell instanceof HTMLElement)) {
			return;
		}
		scrubFrom(event, shell.getBoundingClientRect());
	};

	const beginHandleDrag = (
		event: ReactPointerEvent<HTMLButtonElement>,
		cue: Cue,
		edge: Edge,
	) => {
		event.preventDefault();
		event.stopPropagation();
		onSelect(cue.id);
		const row = event.currentTarget.closest(".st-cue-row");
		if (!(row instanceof HTMLElement)) {
			return;
		}
		const rect = row.getBoundingClientRect();
		document.body.classList.add("st-dragging");
		const move = (moveEvent: PointerEvent) => {
			const time =
				((moveEvent.clientX - rect.left) / Math.max(1, rect.width)) *
				TRACK_DURATION_MS;
			onSetEdge(cue.id, edge, time);
		};
		const stop = () => {
			globalThis.removeEventListener("pointermove", move);
			globalThis.removeEventListener("pointerup", stop);
			globalThis.removeEventListener("pointercancel", stop);
			document.body.classList.remove("st-dragging");
		};
		globalThis.addEventListener("pointermove", move);
		globalThis.addEventListener("pointerup", stop);
		globalThis.addEventListener("pointercancel", stop);
	};

	return (
		<div className="st-timeline-shell">
			<div className="st-ruler" onPointerDown={beginScrub}>
				{Array.from({ length: 7 }, (_, index) => {
					const seconds = index * 5;
					return (
						<span
							key={seconds}
							className={`st-ruler-label${
								index === 0 ? " is-first" : index === 6 ? " is-last" : ""
							}`}
							style={{ left: `${(seconds / 30) * 100}%` }}
						>
							{formatClock(seconds * 1_000)}
						</span>
					);
				})}
			</div>
			<div className="st-wave" onPointerDown={beginScrub}>
				<Waveform peaks={peaks} />
				<div
					className="st-wave-progress"
					style={{ width: `${playhead * 100}%` }}
				/>
			</div>
			<div className="st-cue-rows">
				{cues.map((cue, index) => {
					const cueConflicts = conflicts.get(cue.id) ?? [];
					const active = activeIds.has(cue.id);
					const overlap = cueConflicts.length > 0;
					const left = (cue.start / TRACK_DURATION_MS) * 100;
					const width = ((cue.end - cue.start) / TRACK_DURATION_MS) * 100;
					return (
						<div
							key={cue.id}
							className={`st-cue-row${active ? " is-active" : ""}${
								overlap ? " is-overlap" : ""
							}`}
							data-cue-id={cue.id}
						>
							<button
								type="button"
								className={`st-cue-hit${overlap ? " is-overlap" : ""}${
									active ? " is-active" : ""
								}`}
								style={{ left: `${left}%`, width: `${width}%` }}
								onClick={() => {
									onSelect(cue.id);
								}}
								data-testid="cue-bar"
								data-cue-id={cue.id}
								data-start={cue.start}
								data-end={cue.end}
								aria-label={`第 ${index + 1} 条字幕，${formatClock(
									cue.start,
								)} 到 ${formatClock(cue.end)}${overlap ? "，时间重叠" : ""}`}
							>
								<span className="st-cue-index">{index + 1}</span>
								<span className="st-cue-label">{cue.text}</span>
							</button>
							{cueConflicts.map((range) => {
								return (
									<span
										key={`${cue.id}-${range.start}-${range.end}`}
										className="st-conflict-band"
										style={{
											left: `${(range.start / TRACK_DURATION_MS) * 100}%`,
											width: `${
												((range.end - range.start) / TRACK_DURATION_MS) * 100
											}%`,
										}}
										data-testid="overlap-band"
									/>
								);
							})}
							<button
								type="button"
								className="st-cue-handle is-in"
								style={{ left: `${left}%` }}
								onPointerDown={(event) => {
									beginHandleDrag(event, cue, "start");
								}}
								data-testid="cue-start-handle"
								data-cue-id={cue.id}
								aria-label={`调整第 ${index + 1} 条字幕入点`}
								title="拖动入点"
							/>
							<button
								type="button"
								className="st-cue-handle is-out"
								style={{ left: `${(cue.end / TRACK_DURATION_MS) * 100}%` }}
								onPointerDown={(event) => {
									beginHandleDrag(event, cue, "end");
								}}
								data-testid="cue-end-handle"
								data-cue-id={cue.id}
								aria-label={`调整第 ${index + 1} 条字幕出点`}
								title="拖动出点"
							/>
						</div>
					);
				})}
			</div>
			<div
				className="st-playhead"
				style={{ left: `${playhead * 100}%` }}
				data-testid="playhead"
				onPointerDown={beginPlayheadScrub}
			>
				<button
					type="button"
					className="st-playhead-grab"
					onPointerDown={beginPlayheadScrub}
					aria-label="拖动播放头"
					title="拖动播放头"
				/>
			</div>
		</div>
	);
};
