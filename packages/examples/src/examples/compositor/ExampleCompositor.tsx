/**
 * melonJS — twelve-second, three-layer compositor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, Stage, state } from "melonjs";
import {
	type ChangeEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import { createExampleComponent } from "../utils";
import { CompositorController, type CompositorSnapshot } from "./controller";
import {
	countKeyframes,
	getKeyframeAtFrame,
	getTrack,
	type KeyframeValue,
	type OffsetValue,
	PROPERTY_IDS,
	PROPERTY_META,
	type PropertyId,
	type TrackId,
} from "./project";
import "./compositor.css";

let liveController: CompositorController | null = null;
const controllerListeners = new Set<() => void>();

const publishController = (controller: CompositorController | null) => {
	liveController = controller;
	for (const listener of controllerListeners) {
		listener();
	}
};

const subscribeController = (listener: () => void): (() => void) => {
	controllerListeners.add(listener);
	return () => {
		controllerListeners.delete(listener);
	};
};

const getLiveController = (): CompositorController | null => {
	return liveController;
};

const createCompositorGame = async () => {
	const controller = new CompositorController();
	publishController(controller);
	try {
		const app = new Application(960, 540, {
			parent: "comp-stage",
			scale: "auto",
			scaleMethod: "fit",
			backgroundColor: "#040710",
			antiAlias: true,
			textureFilter: "linear",
		});
		await app.init();
		class CompositorStage extends Stage {
			override onResetEvent() {
				controller.attach(app);
			}
		}
		state.set(state.PLAY, new CompositorStage());
		state.change(state.PLAY, true);
		return () => {
			controller.destroy(app.renderer);
			publishController(null);
		};
	} catch (error) {
		controller.report(
			`The compositor could not start: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return () => {
			controller.destroy();
			publishController(null);
		};
	}
};

const CompositorHost = createExampleComponent(createCompositorGame);

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(Math.max(value, min), max);
};

const numberValue = (value: KeyframeValue): number => {
	return typeof value === "number" ? value : 0;
};

const offsetValue = (value: KeyframeValue): OffsetValue => {
	if (
		typeof value === "object" &&
		value !== null &&
		"x" in value &&
		"y" in value
	) {
		return value as OffsetValue;
	}
	return { x: 0, y: 0 };
};

const colorValue = (value: KeyframeValue): string => {
	return typeof value === "string" ? value : "#ffffff";
};

const valueLabel = (property: PropertyId, value: KeyframeValue): string => {
	if (property === "color") {
		return colorValue(value);
	}
	if (property === "offset") {
		const offset = offsetValue(value);
		return `${offset.x.toFixed(1)}, ${offset.y.toFixed(1)} px`;
	}
	return numberValue(value).toFixed(2);
};

const trackKeyframeCount = (trackId: TrackId, snapshot: CompositorSnapshot) => {
	const track = getTrack(snapshot.project, trackId);
	return PROPERTY_IDS.reduce((total, property) => {
		return total + track.keyframes[property].length;
	}, 0);
};

function Inspector({ controller }: { controller: CompositorController }) {
	const snapshot = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot,
	);
	const track = getTrack(snapshot.project, snapshot.selected.track);
	const property = snapshot.selected.property;
	const sampled = controller.sampledValue();
	const exact = getKeyframeAtFrame(track, property, snapshot.frame);
	const keyframes = track.keyframes[property];
	const offset = offsetValue(sampled);

	const write = (value: KeyframeValue) => {
		controller.writeValue(value);
	};

	return (
		<section className="lcp-inspector" aria-label="Selected keyframe inspector">
			<div className="lcp-section-heading">
				<div>
					<p className="lcp-eyebrow">Selected property</p>
					<h2>
						{track.name}
						<span className="lcp-heading-separator">/</span>
						{PROPERTY_META[property].label}
					</h2>
				</div>
				<span
					className={`lcp-state ${exact ? "is-key" : ""}`}
					data-testid="keyframe-state"
				>
					{exact ? "On keyframe" : "Interpolated"}
				</span>
			</div>

			<div className="lcp-value-card">
				<div className="lcp-value-title">
					<span>Value at {snapshot.time.toFixed(2)}s</span>
					<strong>{valueLabel(property, sampled)}</strong>
				</div>

				{property === "offset" && (
					<div className="lcp-sliders">
						<label className="lcp-slider">
							<span>
								X <b>{offset.x.toFixed(1)} px</b>
							</span>
							<input
								type="range"
								min="-70"
								max="70"
								step="0.5"
								value={offset.x}
								onChange={(event) => {
									write({
										x: Number(event.target.value),
										y: offset.y,
									});
								}}
							/>
						</label>
						<label className="lcp-slider">
							<span>
								Y <b>{offset.y.toFixed(1)} px</b>
							</span>
							<input
								type="range"
								min="-45"
								max="45"
								step="0.5"
								value={offset.y}
								onChange={(event) => {
									write({
										x: offset.x,
										y: Number(event.target.value),
									});
								}}
							/>
						</label>
					</div>
				)}

				{property === "blur" && (
					<label className="lcp-slider">
						<span>
							Radius <b>{numberValue(sampled).toFixed(1)} px</b>
						</span>
						<input
							type="range"
							min="0"
							max="24"
							step="0.1"
							value={numberValue(sampled)}
							onChange={(event) => {
								write(Number(event.target.value));
							}}
						/>
					</label>
				)}

				{property === "opacity" && (
					<label className="lcp-slider">
						<span>
							Alpha <b>{Math.round(numberValue(sampled) * 100)}%</b>
						</span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={numberValue(sampled)}
							onChange={(event) => {
								write(Number(event.target.value));
							}}
						/>
					</label>
				)}

				{property === "color" && (
					<label className="lcp-color-row">
						<span>
							Tint color
							<small>Blended over the layer silhouette</small>
						</span>
						<span className="lcp-color-control">
							<input
								type="color"
								value={colorValue(sampled)}
								onInput={(event) => {
									write(event.currentTarget.value);
								}}
							/>
							<code>{colorValue(sampled)}</code>
						</span>
					</label>
				)}
			</div>

			<div className="lcp-inspector-actions">
				<button
					type="button"
					className="lcp-button lcp-button-accent"
					onClick={controller.addKeyframe}
				>
					Add keyframe
					<span>F{snapshot.frame}</span>
				</button>
				<button
					type="button"
					className="lcp-button"
					disabled={!exact}
					onClick={controller.deleteKeyframe}
				>
					Delete this frame
				</button>
			</div>

			<div className="lcp-key-list">
				<span>Lane keyframes</span>
				<div>
					{keyframes.map((keyframe) => {
						return (
							<button
								type="button"
								key={keyframe.frame}
								className={
									keyframe.frame === snapshot.frame ? "is-current" : ""
								}
								onClick={() => {
									controller.selectKeyframe(
										snapshot.selected.track,
										property,
										keyframe.frame,
									);
								}}
								title={valueLabel(property, keyframe.value)}
							>
								F{keyframe.frame}
							</button>
						);
					})}
					{keyframes.length === 0 && <em>empty lane</em>}
				</div>
			</div>

			<p className="lcp-note">
				Editing any value writes it to the keyframe at the playhead. Each
				property owns its own keyframe list, so tracks cannot bleed into one
				another.
			</p>
		</section>
	);
}

function Editor({ controller }: { controller: CompositorController }) {
	const snapshot = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot,
	);
	const dragging = useRef(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const duration = snapshot.project.duration;
	const progress = clamp(snapshot.time / duration, 0, 1);
	const seconds = useMemo(() => {
		const count = Math.ceil(duration);
		return Array.from({ length: count + 1 }, (_, index) => index);
	}, [duration]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target?.closest(
					"input, textarea, select, button, [contenteditable='true']",
				)
			) {
				return;
			}
			if (event.code === "Space") {
				event.preventDefault();
				controller.togglePlayback();
			} else if (event.code === "ArrowLeft") {
				event.preventDefault();
				controller.stepFrame(-1);
			} else if (event.code === "ArrowRight") {
				event.preventDefault();
				controller.stepFrame(1);
			} else if (event.code === "Home") {
				event.preventDefault();
				controller.pause();
				controller.seek(0);
			} else if (event.code === "End") {
				event.preventDefault();
				controller.pause();
				controller.seek(duration);
			}
		};
		globalThis.addEventListener("keydown", onKey);
		return () => {
			globalThis.removeEventListener("keydown", onKey);
		};
	}, [controller, duration]);

	const timeFromPointer = (element: HTMLElement, clientX: number): number => {
		const rect = element.getBoundingClientRect();
		const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
		return ratio * duration;
	};

	const beginSeek =
		(track?: TrackId, property?: PropertyId) =>
		(event: ReactPointerEvent<HTMLElement>) => {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			if (track && property) {
				controller.selectLane(track, property);
			}
			dragging.current = true;
			event.currentTarget.setPointerCapture(event.pointerId);
			controller.seek(
				timeFromPointer(event.currentTarget, event.clientX),
				true,
			);
		};

	const moveSeek = (event: ReactPointerEvent<HTMLElement>) => {
		if (!dragging.current) {
			return;
		}
		controller.seek(timeFromPointer(event.currentTarget, event.clientX), true);
	};

	const endSeek = (event: ReactPointerEvent<HTMLElement>) => {
		if (!dragging.current) {
			return;
		}
		dragging.current = false;
		controller.endScrub();
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}
		try {
			controller.loadJSON(await file.text(), file.name);
		} catch (error) {
			controller.report(
				`Could not load JSON: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	};

	return (
		<aside className="lcp-side" aria-label="Compositor timeline and controls">
			<header className="lcp-header">
				<div>
					<p className="lcp-eyebrow">Three-layer / twelve-second compositor</p>
					<h1>{snapshot.project.name}</h1>
					<p className="lcp-summary">
						{snapshot.project.tracks.length} layers · {snapshot.project.fps} fps
						· {countKeyframes(snapshot.project)} keyframes
					</p>
				</div>
				<div
					className={`lcp-audio ${snapshot.audioReady ? "is-ready" : ""}`}
					title="Generated with the Web Audio API"
				>
					<span className="lcp-audio-dot" />
					<span>
						{snapshot.audioReady ? "Web Audio ready" : "Play to unlock audio"}
					</span>
				</div>
			</header>

			<div className="lcp-transport">
				<button
					type="button"
					className="lcp-play"
					onClick={controller.togglePlayback}
					aria-label={snapshot.playing ? "Pause timeline" : "Play timeline"}
				>
					<span>{snapshot.playing ? "❚❚" : "▶"}</span>
					{snapshot.playing ? "Pause" : "Play"}
				</button>
				<button
					type="button"
					className="lcp-icon-button"
					onClick={() => {
						controller.stepFrame(-1);
					}}
					aria-label="Previous frame"
				>
					◀
				</button>
				<button
					type="button"
					className="lcp-icon-button"
					onClick={() => {
						controller.stepFrame(1);
					}}
					aria-label="Next frame"
				>
					▶
				</button>
				<button
					type="button"
					className={`lcp-loop ${snapshot.loop ? "is-on" : ""}`}
					aria-pressed={snapshot.loop}
					onClick={() => {
						controller.setLoop(!snapshot.loop);
					}}
				>
					Loop
				</button>
				<div className="lcp-clock">
					<strong>{snapshot.time.toFixed(2)}s</strong>
					<span>
						F{snapshot.frame} / {snapshot.totalFrames}
					</span>
				</div>
			</div>

			<div className="lcp-file-actions">
				<button
					type="button"
					className="lcp-button"
					onClick={controller.saveJSON}
				>
					Save JSON
				</button>
				<button
					type="button"
					className="lcp-button"
					onClick={() => {
						fileInput.current?.click();
					}}
				>
					Load JSON
				</button>
				<button
					type="button"
					className="lcp-button lcp-button-export"
					onClick={() => {
						void controller.exportPNG();
					}}
				>
					Export PNG
				</button>
				<input
					ref={fileInput}
					type="file"
					accept="application/json,.json"
					className="lcp-file-input"
					onChange={(event) => {
						void loadFile(event);
					}}
				/>
			</div>

			<div className="lcp-timeline" data-testid="timeline">
				<div className="lcp-ruler-row">
					<div className="lcp-ruler-spacer">
						<span>TRACK</span>
						<span>PROPERTY</span>
					</div>
					<div
						className="lcp-ruler"
						role="slider"
						tabIndex={0}
						aria-label="Timeline playhead"
						aria-valuemin={0}
						aria-valuemax={snapshot.totalFrames}
						aria-valuenow={snapshot.frame}
						onPointerDown={beginSeek()}
						onPointerMove={moveSeek}
						onPointerUp={endSeek}
						onPointerCancel={endSeek}
					>
						{seconds.map((second) => {
							const left = `${(second / duration) * 100}%`;
							return (
								<span className="lcp-ruler-tick" style={{ left }} key={second}>
									<i />
									<b>{second}s</b>
								</span>
							);
						})}
						<span
							className="lcp-playhead"
							style={{ left: `${progress * 100}%` }}
						>
							<span>{snapshot.frame}</span>
						</span>
					</div>
				</div>

				{snapshot.project.tracks.map((track) => {
					return (
						<section className="lcp-track" key={track.id}>
							<div className="lcp-track-meta">
								<span
									className="lcp-track-swatch"
									style={{ background: track.accent }}
								/>
								<strong>{track.name}</strong>
								<span>{trackKeyframeCount(track.id, snapshot)} KF</span>
							</div>
							<div className="lcp-lanes">
								{PROPERTY_IDS.map((property) => {
									const meta = PROPERTY_META[property];
									const keyframes = track.keyframes[property];
									const selected =
										snapshot.selected.track === track.id &&
										snapshot.selected.property === property;
									return (
										<div
											className={`lcp-lane ${selected ? "is-selected" : ""}`}
											key={property}
										>
											<button
												type="button"
												className="lcp-lane-label"
												onClick={() => {
													controller.selectLane(track.id, property);
												}}
											>
												<span
													style={{ background: meta.color }}
													className="lcp-property-dot"
												/>
												<span>{meta.short}</span>
												<em>{keyframes.length}</em>
											</button>
											<div
												className="lcp-lane-field"
												role="slider"
												tabIndex={0}
												aria-label={`${track.name} ${meta.label} keyframe lane`}
												aria-valuemin={0}
												aria-valuemax={snapshot.totalFrames}
												aria-valuenow={snapshot.frame}
												data-track={track.id}
												data-property={property}
												onPointerDown={beginSeek(track.id, property)}
												onPointerMove={moveSeek}
												onPointerUp={endSeek}
												onPointerCancel={endSeek}
												onDoubleClick={() => {
													controller.selectLane(track.id, property);
													controller.addKeyframe();
												}}
											>
												{keyframes.map((keyframe) => {
													const selectedKey =
														selected && keyframe.frame === snapshot.frame;
													return (
														<button
															type="button"
															key={keyframe.frame}
															className={`lcp-key ${selectedKey ? "is-selected" : ""}`}
															style={{
																left: `${
																	(keyframe.frame / snapshot.totalFrames) * 100
																}%`,
																background: meta.color,
															}}
															data-track={track.id}
															data-property={property}
															data-frame={keyframe.frame}
															title={`${meta.label} · frame ${keyframe.frame} · ${valueLabel(property, keyframe.value)}`}
															aria-label={`${track.name} ${meta.label} keyframe at frame ${keyframe.frame}`}
															onPointerDown={(event) => {
																event.stopPropagation();
															}}
															onClick={(event) => {
																event.stopPropagation();
																controller.selectKeyframe(
																	track.id,
																	property,
																	keyframe.frame,
																);
															}}
														/>
													);
												})}
												<span
													className="lcp-lane-playhead"
													style={{ left: `${progress * 100}%` }}
												/>
											</div>
										</div>
									);
								})}
							</div>
						</section>
					);
				})}
			</div>

			<Inspector controller={controller} />

			<div className="lcp-footer">
				<p role="status" aria-live="polite" data-testid="status">
					{snapshot.status}
				</p>
				<p>
					Space play/pause · ←/→ frame step · drag ruler or any lane to scrub.
				</p>
			</div>
		</aside>
	);
}

export const ExampleCompositor = () => {
	const controller = useSyncExternalStore(
		subscribeController,
		getLiveController,
		getLiveController,
	);
	useLayoutEffect(() => {
		const topbar = document.querySelector<HTMLElement>(".example-topbar");
		const syncTop = () => {
			document.documentElement.style.setProperty(
				"--lcp-top",
				`${topbar?.offsetHeight ?? 41}px`,
			);
		};
		syncTop();
		const observer = new ResizeObserver(syncTop);
		if (topbar) {
			observer.observe(topbar);
		}
		return () => {
			observer.disconnect();
			document.documentElement.style.removeProperty("--lcp-top");
		};
	}, []);

	return (
		<main className="lcp-app" data-testid="layer-compositor">
			<CompositorHost />
			<section className="lcp-stage" aria-label="Composited scene preview">
				<div id="comp-stage" />
				<div className="lcp-stage-label">
					<span>FOREGROUND · DUST</span>
					<span>MIDGROUND · SILHOUETTES</span>
					<span>BACKGROUND · FOG</span>
				</div>
			</section>
			{controller ? (
				<Editor controller={controller} />
			) : (
				<aside className="lcp-side lcp-loading">Preparing compositor…</aside>
			)}
		</main>
	);
};
