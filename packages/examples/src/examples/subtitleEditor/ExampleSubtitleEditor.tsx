/**
 * melonJS — subtitle editor example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A 40 s timeline built on a looping 10 s Big Buck Bunny clip. Add cues,
 * drag their in/out points, edit text and nudge by the frame around the
 * playhead; overlaps are flagged and block the WebVTT export. The video,
 * playhead, cue strip and waveform all read one Transport clock, and the
 * export round-trips through the importer without changing the six cues.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createExampleComponent } from "../utils";
import videoSrc from "../video/assets/mov_bbb.mp4";
import { CueList } from "./CueList";
import {
	activeCue,
	type Cue,
	canSave,
	createCue,
	defaultCues,
	moveCue,
	nudgeCueEdge,
	overlappingIds,
	quantize,
	resizeCue,
	TIMELINE_DURATION,
} from "./cues";
import { createPreview, type Preview } from "./preview";
import "./subtitleEditor.css";
import { Timeline } from "./Timeline";
import { Transport } from "./transport";
import { downloadVTT, readVTTFile } from "./vtt";
import { decodePeaks, type WavePeak } from "./waveform";

/**
 * State shared with the engine boot, which runs inside
 * `createExampleComponent` outside React's render cycle.
 */
const engine = {
	cues: defaultCues(),
	transport: null as Transport | null,
	preview: null as Preview | null,
	whenReady: [] as Array<() => void>,
};

const whenEngineReady = (): Promise<void> => {
	if (engine.transport) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		engine.whenReady.push(resolve);
	});
};

const PreviewHost = createExampleComponent(async () => {
	// StrictMode remounts the component in dev: the first boot's engine and
	// transport must survive, mirroring the particle editor. Re-running here
	// would destroy the clock the panels are already subscribed to.
	if (engine.transport && engine.preview) {
		return;
	}
	const videoElement = document.createElement("video");
	videoElement.src = videoSrc;
	videoElement.preload = "auto";
	videoElement.playsInline = true;
	videoElement.crossOrigin = "anonymous";

	await new Promise<void>((resolve, reject) => {
		videoElement.addEventListener("loadedmetadata", () => resolve(), {
			once: true,
		});
		videoElement.addEventListener(
			"error",
			() => reject(new Error("The video asset failed to load.")),
			{ once: true },
		);
	});

	const transport = new Transport(videoElement);
	const preview = await createPreview(videoElement, transport, engine.cues);
	engine.transport = transport;
	engine.preview = preview;
	engine.whenReady.splice(0).forEach((callback) => {
		callback();
	});
	// no teardown: the engine canvas outlives this component and is put back
	// into #screen by createExampleComponent on the next mount
});

export const ExampleSubtitleEditor = () => {
	const [cues, setCues] = useState<Cue[]>(engine.cues);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [peaks, setPeaks] = useState<WavePeak[]>([]);
	const [loopRange, setLoopRange] = useState<{
		start: number;
		end: number;
	} | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [ready, setReady] = useState(false);
	const transportRef = useRef<Transport | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const overlaps = useMemo(() => overlappingIds(cues), [cues]);
	const saveable = useMemo(() => canSave(cues), [cues]);
	const active = useMemo(() => activeCue(cues, time), [cues, time]);

	// push every cue edit into the engine overlay and the boot-time snapshot
	useEffect(() => {
		engine.cues = cues;
		engine.preview?.overlay.setCues(cues);
	}, [cues]);

	// subscribe the React panels to the engine transport once it has booted
	useEffect(() => {
		let cancelled = false;
		void whenEngineReady().then(() => {
			if (cancelled || !engine.transport) {
				return;
			}
			const transport = engine.transport;
			transportRef.current = transport;
			transport.setEvents({
				seek: (next) => setTime(next),
				playState: (isPlaying) => setPlaying(isPlaying),
			});
			setReady(true);

			void decodePeaks(videoSrc, 240)
				.then((decoded) => {
					if (!cancelled) {
						setPeaks(decoded);
					}
				})
				.catch((error: unknown) => {
					console.warn("Waveform decoding was skipped:", error);
				});
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const seek = useCallback((next: number) => {
		const clamped = quantize(next);
		transportRef.current?.seekTo(clamped);
		setTime(clamped);
	}, []);

	const handleResize = useCallback((id: string, start: number, end: number) => {
		setCues((previous) =>
			previous.map((cue) => (cue.id === id ? resizeCue(cue, start, end) : cue)),
		);
	}, []);

	const handleMove = useCallback((id: string, start: number) => {
		setCues((previous) =>
			previous.map((cue) =>
				cue.id === id ? moveCue(cue, start - cue.start) : cue,
			),
		);
	}, []);

	const handleNudge = useCallback(
		(id: string, edge: "start" | "end", steps: number) => {
			setCues((previous) =>
				previous.map((cue) =>
					cue.id === id ? nudgeCueEdge(cue, edge, steps) : cue,
				),
			);
		},
		[],
	);

	const addCue = useCallback(() => {
		const start = Math.min(time, TIMELINE_DURATION - 2);
		const cue = createCue(start, start + 2, "New subtitle");
		setCues((previous) => [...previous, cue]);
		setSelectedId(cue.id);
	}, [time]);

	const deleteCue = useCallback((id: string) => {
		setCues((previous) => previous.filter((cue) => cue.id !== id));
		setSelectedId((current) => (current === id ? null : current));
	}, []);

	const editText = useCallback((id: string, text: string) => {
		setCues((previous) =>
			previous.map((cue) => (cue.id === id ? { ...cue, text } : cue)),
		);
	}, []);

	const togglePlay = useCallback(() => {
		transportRef.current?.toggle();
	}, []);

	const toggleLoop = useCallback(() => {
		const transport = transportRef.current;
		if (!transport) {
			return;
		}
		if (loopRange) {
			transport.setLoopRange(null);
			setLoopRange(null);
		} else {
			const range = { start: quantize(time), end: quantize(time + 4) };
			transport.setLoopRange(range);
			setLoopRange(range);
		}
	}, [loopRange, time]);

	const handleExport = useCallback(() => {
		if (saveable) {
			downloadVTT(cues);
		}
	}, [cues, saveable]);

	const handleImport = useCallback(async (file: File) => {
		try {
			setCues(await readVTTFile(file));
			setImportError(null);
		} catch (error) {
			setImportError(error instanceof Error ? error.message : "Import failed.");
		}
	}, []);

	const onFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			void handleImport(file);
		}
		event.target.value = "";
	};

	return (
		<div className="se-app">
			<PreviewHost />
			<aside className="se-sidebar">
				<div className="se-toolbar">
					<button type="button" onClick={togglePlay} disabled={!ready}>
						{playing ? "Pause" : "Play"}
					</button>
					<button type="button" onClick={() => seek(0)} disabled={!ready}>
						To start
					</button>
					<button
						type="button"
						onClick={toggleLoop}
						className={loopRange ? "se-on" : ""}
						disabled={!ready}
					>
						{loopRange ? "Clear loop" : "Loop 4 s"}
					</button>
					<button type="button" onClick={addCue}>
						+ Add cue
					</button>
				</div>
				<div className="se-toolbar se-toolbar-io">
					<button
						type="button"
						onClick={handleExport}
						disabled={!saveable}
						title={
							saveable ? "Export WebVTT" : "Resolve overlapping cues first"
						}
					>
						Export .vtt
					</button>
					<button type="button" onClick={() => fileInputRef.current?.click()}>
						Import .vtt
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".vtt,text/vtt"
						hidden
						onChange={onFileInput}
					/>
				</div>
				{importError && <p className="se-import-error">{importError}</p>}
				{!saveable && (
					<p className="se-overlap-banner">
						{overlaps.size} overlapping cue{overlaps.size === 1 ? "" : "s"} —
						export is blocked.
					</p>
				)}
				<CueList
					cues={cues}
					overlaps={overlaps}
					activeId={active?.id ?? selectedId}
					onSelect={(id) => {
						setSelectedId(id);
						const cue = cues.find((item) => item.id === id);
						if (cue) {
							seek(cue.start);
						}
					}}
					onText={editText}
					onNudge={handleNudge}
					onDelete={deleteCue}
				/>
			</aside>
			<section className="se-bottom">
				<div className="se-transport-line">
					<strong>Playhead</strong>
					<span>{time.toFixed(2)} s</span>
					<span className="se-active-caption">
						{active
							? active.text.replaceAll("\n", " ")
							: "— no cue at playhead —"}
					</span>
				</div>
				<Timeline
					cues={cues}
					overlaps={overlaps}
					time={time}
					peaks={peaks}
					sourceDuration={engine.transport?.sourceDuration ?? 10.0267}
					loopRange={loopRange}
					onSeek={seek}
					onResize={handleResize}
					onMove={handleMove}
				/>
			</section>
		</div>
	);
};

// re-exported for the round-trip spec, which tests pure logic without the engine
export { fromVTT, toVTT } from "./vtt";
