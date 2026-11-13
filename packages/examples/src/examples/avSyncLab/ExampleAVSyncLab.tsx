/**
 * melonJS — A/V sync lab example: UI shell.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { useEffect, useRef, useState } from "react";
import type { RecordedPreview } from "./recorder";
import { SyncLab, type SyncLabSnapshot } from "./syncLab";
import { DURATION_SEC, MAX_OFFSET_MS } from "./timeline";
import "./av-sync-lab.css";

const formatMs = (seconds: number): string =>
	`${(seconds * 1000).toFixed(0)} ms`;

const formatSec = (seconds: number): string => `${seconds.toFixed(2)} s`;

export const ExampleAVSyncLab = () => {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const labRef = useRef<SyncLab | null>(null);
	const [snapshot, setSnapshot] = useState<SyncLabSnapshot | null>(null);
	const [offset, setOffset] = useState(0);
	const [savedFlash, setSavedFlash] = useState<string | null>(null);
	const [biased, setBiased] = useState<RecordedPreview | null>(null);
	const [corrected, setCorrected] = useState<RecordedPreview | null>(null);
	const [busy, setBusy] = useState<null | "biased" | "corrected">(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const lab = new SyncLab(canvas, setSnapshot);
		labRef.current = lab;
		setOffset(lab.offsetMs);
		lab.startLoop();
		return () => {
			lab.dispose();
			labRef.current = null;
		};
	}, []);

	const lab = () => labRef.current;

	const onRecord = async (kind: "biased" | "corrected") => {
		const controller = lab();
		const canvas = canvasRef.current;
		if (!controller || !canvas || busy) {
			return;
		}
		setBusy(kind);
		try {
			const preview = await controller.recordPreview(canvas, kind);
			if (kind === "biased") {
				setBiased(preview);
			} else {
				setCorrected(preview);
			}
		} finally {
			setBusy(null);
		}
	};

	const offsetText =
		offset === 0
			? "0 ms (in sync)"
			: offset > 0
				? `+${offset} ms — video late`
				: `${offset} ms — video early`;

	return (
		<div className="avsl">
			<div className="avsl-stage">
				<canvas
					ref={canvasRef}
					width={960}
					height={420}
					className="avsl-canvas"
				/>
			</div>

			<div className="avsl-panel">
				<div className="avsl-readouts">
					<div className="avsl-readout">
						<span className="avsl-label">A/V deviation</span>
						<span className="avsl-value">{offsetText}</span>
					</div>
					<div className="avsl-readout">
						<span className="avsl-label">Last flash (video time)</span>
						<span className="avsl-value">
							{snapshot ? formatMs(snapshot.lastFlashTime) : "—"}
						</span>
					</div>
					<div className="avsl-readout">
						<span className="avsl-label">Paired beat (audio time)</span>
						<span className="avsl-value">
							{snapshot ? formatMs(snapshot.lastBeatTime) : "—"}
						</span>
					</div>
					<div className="avsl-readout">
						<span className="avsl-label">Playhead</span>
						<span className="avsl-value">
							{snapshot ? formatSec(snapshot.audioTime) : "0.00 s"} /{" "}
							{DURATION_SEC} s
						</span>
					</div>
				</div>

				<div className="avsl-controls">
					<button
						type="button"
						onClick={() => {
							const controller = lab();
							if (controller?.isPlaying) {
								void controller.pause();
							} else {
								void controller?.play();
							}
						}}
					>
						{snapshot?.playing ? "Pause" : "Play"}
					</button>
					<button type="button" onClick={() => void lab()?.stepFrame()}>
						Frame +
					</button>
					<input
						type="range"
						min={0}
						max={DURATION_SEC}
						step={1 / 60}
						value={snapshot?.audioTime ?? 0}
						aria-label="Playhead position"
						onChange={(event) => lab()?.seekTo(Number(event.target.value))}
					/>
				</div>

				<div className="avsl-controls">
					<label className="avsl-offset" htmlFor="avsl-offset">
						Artificial delay
						<input
							id="avsl-offset"
							type="range"
							min={-MAX_OFFSET_MS}
							max={MAX_OFFSET_MS}
							step={5}
							value={offset}
							onChange={(event) => {
								const value = Number(event.target.value);
								setOffset(value);
								lab()?.setOffsetMs(value);
							}}
						/>
						<span>{offset} ms</span>
					</label>
					<button
						type="button"
						onClick={() => {
							lab()?.saveOffset();
							setSavedFlash("Offset saved — restored on reload.");
						}}
					>
						Save offset
					</button>
					{savedFlash && <span className="avsl-saved">{savedFlash}</span>}
				</div>

				<div className="avsl-controls">
					<button type="button" onClick={() => lab()?.addMarker()}>
						Insert sync marker
					</button>
					<button type="button" onClick={() => lab()?.clearMarkers()}>
						Clear markers
					</button>
					<span className="avsl-hint">
						{snapshot?.markers.length ?? 0} marker(s) pinned to the visual track
					</span>
				</div>

				<div className="avsl-controls">
					<button
						type="button"
						disabled={busy !== null}
						onClick={() => void onRecord("biased")}
					>
						{busy === "biased" ? "Recording…" : "Record biased preview"}
					</button>
					<button
						type="button"
						disabled={busy !== null}
						onClick={() => void onRecord("corrected")}
					>
						{busy === "corrected" ? "Recording…" : "Record corrected preview"}
					</button>
				</div>

				<div className="avsl-previews">
					{[
						{ title: "Biased (with deviation)", preview: biased },
						{ title: "Corrected (offset zeroed)", preview: corrected },
					].map(({ title, preview }) => (
						<div className="avsl-preview" key={title}>
							<strong>{title}</strong>
							{preview ? (
								<>
									<video src={preview.url} controls muted />
									<p>
										Measured delay:{" "}
										{preview.measurement.measuredDelayMs.toFixed(1)} ms (flash{" "}
										{formatSec(preview.measurement.flashAtSec)}, onset{" "}
										{formatSec(preview.measurement.onsetAtSec)})
									</p>
									<a href={preview.url} download={`av-sync-${title}.webm`}>
										Download webm
									</a>
								</>
							) : (
								<p className="avsl-hint">Not recorded yet.</p>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
