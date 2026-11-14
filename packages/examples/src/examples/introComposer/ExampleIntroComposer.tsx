/**
 * melonJS — procedural intro composer.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A 12-second, keyframe-driven title sequence. The canvas draws three
 * procedural layers; the audio score is generated with Web Audio, and both
 * are captured together by MediaRecorder.
 */

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import "./styles.css";
import { ProceduralScore } from "./audio";
import {
	createDefaultProject,
	DURATION,
	FPS,
	HEIGHT,
	type Keyframe,
	type KeyLocation,
	keyAt,
	type Layer,
	type LayerId,
	moveKey,
	type Project,
	parseProject,
	projectJSON,
	removeKey,
	sampleLayer,
	snapTime,
	type TrackId,
	WIDTH,
	writeKey,
} from "./model";
import { Inspector, LayersPanel } from "./Panels";
import { type RecordingResult, recordTake } from "./recorder";
import { drawFrame } from "./render";
import { Timeline } from "./Timeline";
import { formatClock } from "./tracks";

type Notice = { kind: "ok" | "error"; text: string } | null;

const selectLayer = (project: Project, id: LayerId): Layer =>
	project.layers.find((layer) => layer.id === id) ?? project.layers[0];

const download = (url: string, filename: string) => {
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
};

const downloadText = (text: string, filename: string, type: string) => {
	const url = URL.createObjectURL(new Blob([text], { type }));
	download(url, filename);
	window.setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 1000);
};

const Toolbar = ({
	playing,
	time,
	recording,
	onTogglePlay,
	onStep,
	onSave,
	onLoad,
	onExport,
}: {
	playing: boolean;
	time: number;
	recording: boolean;
	onTogglePlay: () => void;
	onStep: (direction: -1 | 1) => void;
	onSave: () => void;
	onLoad: () => void;
	onExport: () => void;
}) => (
	<header className="ic-toolbar">
		<div className="ic-brand">
			<span className="ic-brand-mark">M</span>
			<span>
				<strong>Motion / Intro Lab</strong>
				<small>PROCEDURAL TITLE SEQUENCE</small>
			</span>
		</div>

		<div className="ic-transport">
			<button
				type="button"
				title="Previous frame"
				onClick={() => {
					onStep(-1);
				}}
			>
				◂
			</button>
			<button
				type="button"
				className={`ic-play-button${playing ? " playing" : ""}`}
				title={playing ? "Pause" : "Play"}
				onClick={onTogglePlay}
			>
				{playing ? "Ⅱ" : "▶"}
			</button>
			<button
				type="button"
				title="Next frame"
				onClick={() => {
					onStep(1);
				}}
			>
				▸
			</button>
			<code className="ic-timecode">{formatClock(time, true)}</code>
			<span className="ic-duration">/ 00:12 · 30 FPS</span>
			<span className={`ic-state${playing ? " on" : ""}`}>
				{playing ? "PLAYING" : "PAUSED"}
			</span>
		</div>

		<div className="ic-toolbar-actions">
			<button type="button" className="ic-quiet" onClick={onSave}>
				Save JSON
			</button>
			<button type="button" className="ic-quiet" onClick={onLoad}>
				Load JSON
			</button>
			<button
				type="button"
				className="ic-export"
				disabled={recording}
				onClick={onExport}
			>
				<span className="ic-record-dot" />
				{recording ? "Recording…" : "Export 12s WebM"}
			</button>
		</div>
	</header>
);

const ExportDialog = ({
	result,
	onClose,
	onRecordAgain,
}: {
	result: RecordingResult;
	onClose: () => void;
	onRecordAgain: () => void;
}) => {
	const [duration, setDuration] = useState(result.duration);
	const [ready, setReady] = useState(false);
	return (
		<div className="ic-modal-backdrop">
			<section className="ic-export-dialog">
				<div className="ic-export-head">
					<div>
						<span className="ic-eyebrow">TAKE 01 / EXPORTED</span>
						<h2>WebM ready</h2>
					</div>
					<button type="button" className="ic-close" onClick={onClose}>
						×
					</button>
				</div>
				{/* biome-ignore lint/a11y/useMediaCaption: this is a music-only title sequence with no speech */}
				<video
					className="ic-export-video"
					src={result.url}
					controls
					playsInline
					onLoadedMetadata={(event) => {
						const video = event.currentTarget;
						if (Number.isFinite(video.duration)) {
							setDuration(video.duration);
						}
						setReady(true);
					}}
				/>
				<div className="ic-export-stats">
					<span>{duration.toFixed(2)}s</span>
					<span>
						{result.width} × {result.height}
					</span>
					<span>VIDEO + AUDIO</span>
					<span className={ready ? "ok" : ""}>
						{ready ? "REPLAY READY" : "LOADING"}
					</span>
				</div>
				<div className="ic-export-actions">
					<button type="button" className="ic-quiet" onClick={onRecordAgain}>
						Record again
					</button>
					<button
						type="button"
						className="ic-quiet"
						onClick={(event) => {
							const video = event.currentTarget
								.closest(".ic-export-dialog")
								?.querySelector("video");
							if (video) {
								video.currentTime = 6;
								void video.play();
							}
						}}
					>
						Replay from title
					</button>
					<button
						type="button"
						className="ic-export"
						onClick={() => {
							download(result.url, "melonjs-intro-take.webm");
						}}
					>
						Download WebM
					</button>
				</div>
				<p className="ic-export-note">
					The embedded Opus track is the same Web Audio graph you hear during
					playback. Drag the video playhead to inspect the full title at 6s.
				</p>
			</section>
		</div>
	);
};

export const ExampleIntroComposer = () => {
	const [project, setProject] = useState<Project>(() => createDefaultProject());
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [selectedLayer, setSelectedLayer] = useState<LayerId>("title");
	const [expanded, setExpanded] = useState<Set<LayerId>>(
		() => new Set<LayerId>(["title"]),
	);
	const [selectedKey, setSelectedKey] = useState<KeyLocation | null>(null);
	const [notice, setNotice] = useState<Notice>(null);
	const [recording, setRecording] = useState(false);
	const [progress, setProgress] = useState(0);
	const [result, setResult] = useState<RecordingResult | null>(null);
	const [exportOpen, setExportOpen] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const projectRef = useRef(project);
	const timeRef = useRef(time);
	const playingRef = useRef(playing);
	const recordingRef = useRef(recording);
	const scoreRef = useRef<ProceduralScore | null>(null);
	const playStartRef = useRef({ wall: 0, from: 0 });

	const getScore = useCallback((): ProceduralScore => {
		if (!scoreRef.current) {
			scoreRef.current = new ProceduralScore();
		}
		return scoreRef.current;
	}, []);

	useEffect(() => {
		projectRef.current = project;
	}, [project]);
	useEffect(() => {
		timeRef.current = time;
	}, [time]);
	useEffect(() => {
		playingRef.current = playing;
	}, [playing]);
	useEffect(() => {
		recordingRef.current = recording;
	}, [recording]);
	useEffect(() => {
		if (!notice) {
			return;
		}
		const timer = window.setTimeout(() => {
			setNotice(null);
		}, 3600);
		return () => {
			window.clearTimeout(timer);
		};
	}, [notice]);
	useEffect(() => {
		return () => {
			scoreRef.current?.destroy();
		};
	}, []);
	useEffect(() => {
		const current = result;
		return () => {
			if (current) {
				URL.revokeObjectURL(current.url);
			}
		};
	}, [result]);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (ctx) {
			drawFrame(ctx, project, time);
		}
	}, [project, time]);

	const pausePlayback = useCallback(() => {
		playingRef.current = false;
		setPlaying(false);
		getScore().stop();
	}, [getScore]);

	const seekTo = useCallback(
		(value: number) => {
			if (recordingRef.current) {
				return;
			}
			if (playingRef.current) {
				pausePlayback();
			}
			const next = snapTime(value);
			timeRef.current = next;
			setTime(next);
		},
		[pausePlayback],
	);

	const togglePlayback = useCallback(() => {
		if (recordingRef.current) {
			return;
		}
		if (playingRef.current) {
			pausePlayback();
			return;
		}
		let from = timeRef.current;
		if (from >= DURATION - 1 / FPS) {
			from = 0;
		}
		try {
			getScore().start(from);
		} catch (error) {
			setNotice({
				kind: "error",
				text:
					error instanceof Error
						? error.message
						: "The audio context could not start.",
			});
			return;
		}
		playStartRef.current = { wall: performance.now(), from };
		timeRef.current = from;
		setTime(from);
		playingRef.current = true;
		setPlaying(true);
	}, [getScore, pausePlayback]);

	useEffect(() => {
		if (!playing) {
			return;
		}
		let frame = 0;
		const tick = () => {
			const { wall, from } = playStartRef.current;
			const next = Math.min(DURATION, from + (performance.now() - wall) / 1000);
			timeRef.current = next;
			setTime(next);
			if (next >= DURATION) {
				getScore().stop();
				playingRef.current = false;
				setPlaying(false);
				return;
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
		};
	}, [playing, getScore]);

	const setLayerValue = useCallback(
		(track: TrackId, value: unknown) => {
			const current = projectRef.current;
			const at = timeRef.current;
			const next = writeKey(current, selectedLayer, track, at, value);
			projectRef.current = next;
			setProject(next);
			const layer = selectLayer(next, selectedLayer);
			const keys = layer.tracks[track] as Keyframe<unknown>[];
			const added = keyAt(keys, snapTime(at));
			if (added) {
				setSelectedKey({ layerId: selectedLayer, track, keyId: added.id });
			}
		},
		[selectedLayer],
	);

	const addKey = useCallback((layerId: LayerId, track: TrackId, at: number) => {
		const current = projectRef.current;
		const layer = selectLayer(current, layerId);
		const value = sampleLayer(layer, snapTime(at))[track];
		const next = writeKey(current, layerId, track, at, value);
		projectRef.current = next;
		setProject(next);
		setSelectedLayer(layerId);
		setExpanded((previous) => new Set(previous).add(layerId));
		const nextLayer = selectLayer(next, layerId);
		const keys = nextLayer.tracks[track] as Keyframe<unknown>[];
		const added = keyAt(keys, snapTime(at));
		if (added) {
			setSelectedKey({ layerId, track, keyId: added.id });
		}
	}, []);

	const moveSelectedKey = useCallback((location: KeyLocation, at: number) => {
		const next = moveKey(projectRef.current, location, at);
		projectRef.current = next;
		setProject(next);
	}, []);

	const deleteSelectedKey = useCallback(() => {
		if (!selectedKey) {
			return;
		}
		const next = removeKey(projectRef.current, selectedKey);
		projectRef.current = next;
		setProject(next);
		setSelectedKey(null);
	}, [selectedKey]);

	const selectLayerRow = useCallback((id: LayerId) => {
		setSelectedLayer(id);
		setExpanded((previous) => new Set(previous).add(id));
	}, []);

	const toggleLayerExpanded = useCallback((id: LayerId) => {
		setExpanded((previous) => {
			const next = new Set(previous);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const toggleVisibility = useCallback((id: LayerId) => {
		const next = {
			...projectRef.current,
			layers: projectRef.current.layers.map((layer) =>
				layer.id === id ? { ...layer, visible: !layer.visible } : layer,
			),
		};
		projectRef.current = next;
		setProject(next);
	}, []);

	const saveJSON = useCallback(() => {
		downloadText(
			projectJSON(projectRef.current),
			"melonjs-intro-project.json",
			"application/json",
		);
		setNotice({ kind: "ok", text: "Saved melonjs-intro-project.json" });
	}, []);

	const loadJSON = useCallback(
		async (file: File) => {
			try {
				const next = parseProject(await file.text());
				pausePlayback();
				projectRef.current = next;
				setProject(next);
				timeRef.current = 0;
				setTime(0);
				setSelectedLayer("title");
				setExpanded(new Set<LayerId>(["title"]));
				setSelectedKey(null);
				setExportOpen(false);
				setNotice({ kind: "ok", text: `Loaded ${file.name}` });
			} catch (error) {
				setNotice({
					kind: "error",
					text: error instanceof Error ? error.message : "Could not load file.",
				});
			}
		},
		[pausePlayback],
	);

	const exportTake = useCallback(async () => {
		if (recordingRef.current) {
			return;
		}
		pausePlayback();
		setExportOpen(false);
		seekTo(0);
		setProgress(0);
		setRecording(true);
		recordingRef.current = true;
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					resolve();
				});
			});
		});
		try {
			const canvas = canvasRef.current;
			if (!canvas) {
				throw new Error("The preview canvas is not ready.");
			}
			const take = await recordTake(canvas, getScore(), DURATION, (next) => {
				timeRef.current = next;
				setTime(next);
				setProgress(next / DURATION);
			});
			setProgress(1);
			setResult(take);
			setExportOpen(true);
			download(take.url, "melonjs-intro-take.webm");
			setNotice({
				kind: "ok",
				text: "Recorded 12 seconds of canvas + Web Audio.",
			});
		} catch (error) {
			setNotice({
				kind: "error",
				text:
					error instanceof Error
						? error.message
						: "The export could not finish.",
			});
		} finally {
			recordingRef.current = false;
			setRecording(false);
		}
	}, [getScore, pausePlayback, seekTo]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target?.closest(
					"input, textarea, select, button, video, [contenteditable='true']",
				)
			) {
				return;
			}
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				saveJSON();
				return;
			}
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
				event.preventDefault();
				fileRef.current?.click();
				return;
			}
			if (event.code === "Space") {
				event.preventDefault();
				togglePlayback();
			} else if (event.key === "ArrowLeft") {
				event.preventDefault();
				seekTo(timeRef.current - (event.shiftKey ? 0.5 : 1 / FPS));
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				seekTo(timeRef.current + (event.shiftKey ? 0.5 : 1 / FPS));
			} else if (event.key === "Delete" || event.key === "Backspace") {
				if (selectedKey) {
					event.preventDefault();
					deleteSelectedKey();
				}
			} else if (event.key === "Escape") {
				setExportOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [deleteSelectedKey, saveJSON, seekTo, selectedKey, togglePlayback]);

	const layer = selectLayer(project, selectedLayer);
	const sampled = sampleLayer(layer, time);

	return (
		<div className="ic-app">
			<Toolbar
				playing={playing}
				time={time}
				recording={recording}
				onTogglePlay={togglePlayback}
				onStep={(direction) => {
					seekTo(timeRef.current + direction / FPS);
				}}
				onSave={saveJSON}
				onLoad={() => {
					fileRef.current?.click();
				}}
				onExport={() => {
					void exportTake();
				}}
			/>
			<input
				ref={fileRef}
				type="file"
				accept=".json,application/json"
				hidden
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) {
						void loadJSON(file);
					}
					event.target.value = "";
				}}
			/>

			<LayersPanel
				project={project}
				time={time}
				selectedLayer={selectedLayer}
				onSelect={selectLayerRow}
				onToggleVisibility={toggleVisibility}
			/>

			<main className="ic-stage-panel">
				<div className="ic-stage-topline">
					<span>
						<i className="ic-status-dot" /> PROGRAM · 1280×720 / 30 FPS
					</span>
					<span>COMPOSITE PREVIEW</span>
				</div>
				<div className="ic-canvas-frame">
					<canvas
						ref={canvasRef}
						width={WIDTH}
						height={HEIGHT}
						aria-label="Procedural intro preview"
					/>
					<div className="ic-canvas-hud top">
						<span>MELONJS / INTRO LAB</span>
						<span>{formatClock(time, true)}</span>
					</div>
					<div className="ic-layer-chip">
						<span style={{ background: sampled.color }} />
						{layer.name}
					</div>
					<div className="ic-canvas-hud bottom">
						<span>03 LAYERS · 4 TRACKS</span>
						<span>AUDIO / WEB AUDIO</span>
					</div>
					{recording && (
						<div className="ic-recording-overlay">
							<span className="ic-recording-kicker">
								<i /> CAPTURING CANVAS + AUDIO
							</span>
							<strong>{Math.round(progress * 100)}%</strong>
							<div className="ic-progress">
								<span style={{ width: `${progress * 100}%` }} />
							</div>
							<small>{formatClock(progress * DURATION)} / 00:12 · WebM</small>
						</div>
					)}
				</div>
				<div className="ic-stage-footer">
					<span>
						<i className={`ic-state-light${playing ? " on" : ""}`} />
						{playing ? "PLAYHEAD LIVE" : "PLAYHEAD PAUSED"}
					</span>
					<span>
						T = {time.toFixed(2)}s · {Math.round(time * FPS)} / {DURATION * FPS}{" "}
						FR
					</span>
					<span>SPACE PLAY / PAUSE · ← → STEP</span>
				</div>
			</main>

			<Inspector
				project={project}
				time={time}
				selectedLayer={selectedLayer}
				sample={sampled}
				onTitleChange={(value) => {
					const next = { ...projectRef.current, title: value };
					projectRef.current = next;
					setProject(next);
				}}
				onSubtitleChange={(value) => {
					const next = { ...projectRef.current, subtitle: value };
					projectRef.current = next;
					setProject(next);
				}}
				onPosition={(x, y) => {
					setLayerValue("position", { x, y });
				}}
				onScale={(value) => {
					setLayerValue("scale", value);
				}}
				onOpacity={(value) => {
					setLayerValue("opacity", value);
				}}
				onColor={(value) => {
					setLayerValue("color", value);
				}}
				onAddKey={(track) => {
					addKey(selectedLayer, track, timeRef.current);
				}}
				onDeleteKey={deleteSelectedKey}
				hasDeletableKey={Boolean(selectedKey)}
			/>

			<Timeline
				project={project}
				time={time}
				selectedLayer={selectedLayer}
				expanded={expanded}
				selectedKey={selectedKey}
				onSeek={seekTo}
				onSelectLayer={selectLayerRow}
				onToggleLayer={toggleLayerExpanded}
				onSelectKey={(location) => {
					setSelectedKey(location);
					setSelectedLayer(location.layerId);
					setExpanded((previous) => new Set(previous).add(location.layerId));
				}}
				onMoveKey={moveSelectedKey}
				onAddKey={(layerId, track, at) => {
					seekTo(at);
					addKey(layerId, track, at);
				}}
			/>

			{notice && (
				<button
					type="button"
					className={`ic-toast ${notice.kind}`}
					onClick={() => {
						setNotice(null);
					}}
				>
					{notice.text}
				</button>
			)}
			{exportOpen && result && (
				<ExportDialog
					result={result}
					onClose={() => {
						setExportOpen(false);
					}}
					onRecordAgain={() => {
						setExportOpen(false);
						void exportTake();
					}}
				/>
			)}
		</div>
	);
};
