import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createExampleComponent } from "../utils";
import { initialCues } from "./initialCues";
import { createSubtitlePreview, previewState } from "./preview";
import { getSoundtrack } from "./soundtrack";
import { Timeline } from "./Timeline";
import type { ConflictMap, Cue, TimeRange } from "./webvtt";
import {
	exportWebVTT,
	formatClock,
	GRID_MS,
	parseWebVTT,
	TRACK_DURATION_MS,
} from "./webvtt";
import "./editor.css";

const PreviewHost = createExampleComponent(async () => {
	await createSubtitlePreview();
});

type StatusTone = "info" | "ok" | "error";

type Status = {
	message: string;
	tone: StatusTone;
};

type Edge = "start" | "end";

const UI_FONT_FAMILY = "Subtitle UI";
let uiFontRequest: Promise<void> | undefined;

const loadUiFont = () => {
	if (uiFontRequest) {
		return uiFontRequest;
	}
	uiFontRequest = (async () => {
		try {
			if (typeof FontFace === "undefined" || !document.fonts) {
				return;
			}
			const face = new FontFace(
				UI_FONT_FAMILY,
				`url("${import.meta.env.BASE_URL}assets/subtitle-timing/noto-sans-sc-subset.woff2")`,
				{ weight: "400" },
			);
			await face.load();
			document.fonts.add(face);
		} catch {
			return;
		}
	})();
	return uiFontRequest;
};

const clamp = (value: number, min: number, max: number) => {
	return Math.min(max, Math.max(min, value));
};

const snap = (value: number) => {
	return Math.round(value / GRID_MS) * GRID_MS;
};

const findConflicts = (cues: Cue[]) => {
	const map: ConflictMap = new Map();
	let count = 0;
	for (let leftIndex = 0; leftIndex < cues.length; leftIndex++) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < cues.length;
			rightIndex++
		) {
			const left = cues[leftIndex];
			const right = cues[rightIndex];
			if (!left || !right) {
				continue;
			}
			const start = Math.max(left.start, right.start);
			const end = Math.min(left.end, right.end);
			if (start >= end) {
				continue;
			}
			count++;
			const range: TimeRange = { start, end };
			const leftRanges = map.get(left.id) ?? [];
			leftRanges.push(range);
			map.set(left.id, leftRanges);
			const rightRanges = map.get(right.id) ?? [];
			rightRanges.push(range);
			map.set(right.id, rightRanges);
		}
	}
	return { map, count };
};

const activeAt = (cue: Cue, timeMs: number) => {
	return cue.start <= timeMs && timeMs < cue.end;
};

const fileToVtt = async (file: File) => {
	return await file.text();
};

export const ExampleSubtitleTiming = () => {
	const soundtrack = useMemo(() => getSoundtrack(), []);
	const [cues, setCues] = useState<Cue[]>(initialCues);
	const [selectedId, setSelectedId] = useState<string | null>("cue-1");
	const [currentMs, setCurrentMs] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [status, setStatus] = useState<Status>({
		message: "拖动字幕两端调整入点/出点；时间会吸附到 0.1 秒。",
		tone: "info",
	});
	const [vttOutput, setVttOutput] = useState("");
	const [vttOpen, setVttOpen] = useState(false);
	const audioRef = useRef<HTMLAudioElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cuesRef = useRef(cues);
	const currentMsRef = useRef(currentMs);
	const nextId = useRef(7);
	const resumeAfterScrub = useRef(false);
	const boundaryNotice = useRef("");
	const previousOverlap = useRef(0);
	const skipOverlapNotice = useRef(false);

	cuesRef.current = cues;
	currentMsRef.current = currentMs;
	const conflicts = useMemo(() => findConflicts(cues), [cues]);
	const activeCues = useMemo(() => {
		return cues.filter((cue) => {
			return activeAt(cue, currentMs);
		});
	}, [cues, currentMs]);
	const activeIds = useMemo(() => {
		return new Set(activeCues.map((cue) => cue.id));
	}, [activeCues]);
	const selected =
		cues.find((cue) => {
			return cue.id === selectedId;
		}) ?? null;
	const selectedIndex = cues.findIndex((cue) => {
		return cue.id === selectedId;
	});
	const sixReady = cues.length === 6 && conflicts.count === 0;

	const notify = useCallback((message: string, tone: StatusTone = "info") => {
		setStatus({ message, tone });
	}, []);

	const seekTo = useCallback((timeMs: number) => {
		const next = clamp(timeMs, 0, TRACK_DURATION_MS);
		const audio = audioRef.current;
		if (audio) {
			audio.currentTime = next / 1_000;
		}
		setCurrentMs(next);
	}, []);

	const togglePlay = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		if (!audio.paused) {
			audio.pause();
			return;
		}
		if (audio.ended || audio.currentTime >= TRACK_DURATION_MS / 1_000 - 0.01) {
			seekTo(0);
		}
		void audio.play().catch(() => {
			notify("浏览器阻止了播放，请再次点击播放。", "error");
		});
	}, [notify, seekTo]);

	const startScrub = useCallback(() => {
		const audio = audioRef.current;
		resumeAfterScrub.current = audio ? !audio.paused : false;
		if (audio && !audio.paused) {
			audio.pause();
		}
	}, []);

	const endScrub = useCallback(() => {
		const audio = audioRef.current;
		if (audio && resumeAfterScrub.current) {
			void audio.play().catch(() => {
				notify("无法从新的播放头位置继续播放。", "error");
			});
		}
		resumeAfterScrub.current = false;
	}, [notify]);

	const setCueEdge = useCallback(
		(id: string, edge: Edge, requestedMs: number) => {
			const cue = cuesRef.current.find((item) => {
				return item.id === id;
			});
			if (!cue) {
				return;
			}
			const snapped = snap(requestedMs);
			const min = edge === "start" ? 0 : cue.start + GRID_MS;
			const max = edge === "start" ? cue.end - GRID_MS : TRACK_DURATION_MS;
			const value = clamp(snapped, min, max);
			if (value !== snapped) {
				let message = "";
				if (edge === "start" && snapped < 0) {
					message = "入点不能早于 00:00.0，已自动阻止。";
				} else if (edge === "start") {
					message = "入点必须比出点至少早 0.1 秒，已自动阻止。";
				} else if (snapped > TRACK_DURATION_MS) {
					message = "出点不能晚于 00:30.0，已自动阻止。";
				} else {
					message = "出点必须比入点至少晚 0.1 秒，已自动阻止。";
				}
				if (boundaryNotice.current !== message) {
					boundaryNotice.current = message;
					notify(message, "error");
				}
			} else {
				boundaryNotice.current = "";
			}
			setCues((previous) => {
				return previous.map((item) => {
					if (item.id !== id) {
						return item;
					}
					return edge === "start"
						? { ...item, start: value }
						: { ...item, end: value };
				});
			});
		},
		[notify],
	);

	const nudge = useCallback(
		(id: string, edge: Edge, deltaMs: number) => {
			const cue = cuesRef.current.find((item) => {
				return item.id === id;
			});
			if (!cue) {
				return;
			}
			setCueEdge(id, edge, (edge === "start" ? cue.start : cue.end) + deltaMs);
		},
		[setCueEdge],
	);

	const updateText = useCallback((id: string, text: string) => {
		setCues((previous) => {
			return previous.map((cue) => {
				return cue.id === id ? { ...cue, text } : cue;
			});
		});
	}, []);

	const addCue = useCallback(() => {
		const id = `cue-${nextId.current++}`;
		const start = clamp(
			snap(
				audioRef.current
					? audioRef.current.currentTime * 1_000
					: currentMsRef.current,
			),
			0,
			TRACK_DURATION_MS - 2_000,
		);
		const cue: Cue = {
			id,
			start,
			end: start + 2_000,
			text: "新字幕",
		};
		setCues((previous) => [...previous, cue]);
		setSelectedId(id);
		notify(`已新增第 ${cuesRef.current.length + 1} 条字幕。`, "ok");
	}, [notify]);

	const deleteSelected = useCallback(() => {
		if (selectedId === null) {
			notify("请先选择一条字幕。", "error");
			return;
		}
		const index = cuesRef.current.findIndex((cue) => {
			return cue.id === selectedId;
		});
		if (index < 0) {
			return;
		}
		const nextCues = cuesRef.current.filter((cue) => {
			return cue.id !== selectedId;
		});
		const replacement = nextCues[index] ?? nextCues[index - 1] ?? null;
		setCues(nextCues);
		setSelectedId(replacement?.id ?? null);
		notify("已删除选中字幕，其他字幕的时间与文本保持不变。", "ok");
	}, [notify, selectedId]);

	const mergeSelected = useCallback(() => {
		if (selectedId === null) {
			notify("请先选择一条字幕。", "error");
			return;
		}
		const index = cuesRef.current.findIndex((cue) => {
			return cue.id === selectedId;
		});
		const current = cuesRef.current[index];
		const next = cuesRef.current[index + 1];
		if (!current || !next) {
			notify("没有可合并的下一条字幕。", "error");
			return;
		}
		const merged: Cue = {
			...current,
			start: Math.min(current.start, next.start),
			end: Math.max(current.end, next.end),
			text: [current.text, next.text].filter(Boolean).join("\n"),
		};
		setCues((previous) => {
			return previous
				.filter((cue) => {
					return cue.id !== next.id;
				})
				.map((cue) => {
					return cue.id === current.id ? merged : cue;
				});
		});
		setSelectedId(current.id);
		notify(
			`已合并第 ${index + 1} 与第 ${index + 2} 条字幕，两段文本按行保留。`,
			"ok",
		);
	}, [notify, selectedId]);

	const importFile = useCallback(
		async (file: File) => {
			try {
				const source = await fileToVtt(file);
				const parsed = parseWebVTT(source, TRACK_DURATION_MS);
				if (parsed.cues.length === 0) {
					notify(
						parsed.warnings[0] ?? "文件里没有可识别的 WebVTT 字幕。",
						"error",
					);
					return;
				}
				const audio = audioRef.current;
				if (audio && !audio.paused) {
					audio.pause();
				}
				skipOverlapNotice.current = true;
				seekTo(0);
				setCues(parsed.cues);
				setSelectedId(parsed.cues[0]?.id ?? null);
				nextId.current = parsed.cues.length + 1;
				setVttOutput(source);
				setVttOpen(true);
				if (parsed.warnings.length > 0) {
					notify(
						`已导入 ${parsed.cues.length} 条字幕；${parsed.warnings[0]}`,
						"info",
					);
				} else {
					notify(
						`已导入 ${parsed.cues.length} 条字幕，文本、时间和顺序已恢复。`,
						"ok",
					);
				}
			} catch {
				notify("读取 WebVTT 文件失败。", "error");
			}
		},
		[notify, seekTo],
	);

	const exportFile = useCallback(() => {
		const text = exportWebVTT(cuesRef.current);
		setVttOutput(text);
		setVttOpen(true);
		const blob = new Blob([text], { type: "text/vtt;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "subtitle-timing.vtt";
		anchor.style.display = "none";
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		globalThis.setTimeout(() => {
			URL.revokeObjectURL(url);
		}, 1_000);
		notify(`已导出 ${cuesRef.current.length} 条 WebVTT 字幕。`, "ok");
	}, [notify]);

	useEffect(() => {
		const audio = new Audio(soundtrack.url);
		audio.preload = "auto";
		audio.setAttribute("playsinline", "true");
		audioRef.current = audio;
		return () => {
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
			if (audioRef.current === audio) {
				audioRef.current = null;
			}
		};
	}, [soundtrack.url]);

	useEffect(() => {
		let frame = 0;
		const tick = () => {
			const audio = audioRef.current;
			if (audio && !audio.paused) {
				setCurrentMs(clamp(audio.currentTime * 1_000, 0, TRACK_DURATION_MS));
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
		};
	}, []);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		const onPlay = () => {
			setIsPlaying(true);
		};
		const onPause = () => {
			setIsPlaying(false);
		};
		const onEnded = () => {
			setIsPlaying(false);
			setCurrentMs(TRACK_DURATION_MS);
		};
		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("ended", onEnded);
		return () => {
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("ended", onEnded);
		};
	}, []);

	useEffect(() => {
		previewState.timeMs = currentMs;
		previewState.activeCueCount = activeCues.length;
		previewState.overlapCount = conflicts.count;
		previewState.cueCount = cues.length;
	}, [currentMs, activeCues.length, conflicts.count, cues.length]);

	useEffect(() => {
		const before = previousOverlap.current;
		previousOverlap.current = conflicts.count;
		if (skipOverlapNotice.current) {
			skipOverlapNotice.current = false;
			return;
		}
		if (conflicts.count > before) {
			notify(
				`检测到 ${conflicts.count} 处重叠：内容保留，时间轴已标红。`,
				"error",
			);
		} else if (conflicts.count === 0 && before > 0) {
			notify("重叠已消除，字幕文本与顺序没有被改写。", "ok");
		}
	}, [conflicts.count, notify]);

	useLayoutEffect(() => {
		const body = document.body;
		body.classList.add("st-open");
		const topbar = document.querySelector<HTMLElement>(".example-topbar");
		const measure = () => {
			if (topbar) {
				body.style.setProperty("--st-top", `${topbar.offsetHeight}px`);
			}
		};
		measure();
		const observer = new ResizeObserver(measure);
		if (topbar) {
			observer.observe(topbar);
		}
		return () => {
			observer.disconnect();
			body.classList.remove("st-open");
			body.style.removeProperty("--st-top");
		};
	}, []);

	useEffect(() => {
		void loadUiFont();
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT" ||
					target.isContentEditable)
			) {
				return;
			}
			if (event.code === "Space") {
				event.preventDefault();
				togglePlay();
			} else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				const audio = audioRef.current;
				seekTo(
					(audio ? audio.currentTime * 1_000 : currentMsRef.current) +
						(event.key === "ArrowLeft" ? -GRID_MS : GRID_MS),
				);
			}
		};
		globalThis.addEventListener("keydown", onKeyDown);
		return () => {
			globalThis.removeEventListener("keydown", onKeyDown);
		};
	}, [seekTo, togglePlay]);

	const selectedConflicts = selected
		? (conflicts.map.get(selected.id) ?? [])
		: [];

	return (
		<>
			<div className="st-toolbar">
				<div className="st-brand">
					<span className="st-brand-kicker">SUBTITLE TIMING</span>
					<span className="st-brand-title">字幕时间轴</span>
				</div>
				<div className="st-transport">
					<button
						type="button"
						className="st-play"
						onClick={togglePlay}
						data-testid="play-pause"
						aria-label={isPlaying ? "暂停" : "播放"}
						aria-pressed={isPlaying}
					>
						{isPlaying ? "❚❚ 暂停" : "▶ 播放"}
					</button>
					<button
						type="button"
						className="st-transport-step"
						onClick={() => {
							seekTo(currentMs - GRID_MS);
						}}
						aria-label="播放头后退 0.1 秒"
					>
						−0.1s
					</button>
					<button
						type="button"
						className="st-transport-step"
						onClick={() => {
							seekTo(currentMs + GRID_MS);
						}}
						aria-label="播放头前进 0.1 秒"
					>
						+0.1s
					</button>
					<span className="st-timecode" data-testid="timecode">
						{formatClock(currentMs)}
						<span className="st-timecode-total">
							{" "}
							/ {formatClock(TRACK_DURATION_MS)}
						</span>
					</span>
				</div>
				<div className="st-toolbar-actions">
					<span
						className={`st-count${sixReady ? " is-ready" : ""}`}
						data-testid="cue-count"
					>
						{cues.length} 条字幕
					</span>
					<button
						type="button"
						className="st-button"
						onClick={addCue}
						data-testid="add-cue"
					>
						＋ 新增字幕
					</button>
					<button
						type="button"
						className="st-button"
						onClick={() => {
							fileInputRef.current?.click();
						}}
						data-testid="import-vtt-button"
					>
						导入 WebVTT
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".vtt,text/vtt,text/plain"
						className="st-file-input"
						onChange={(event) => {
							const file = event.currentTarget.files?.[0];
							if (file) {
								void importFile(file);
							}
							event.currentTarget.value = "";
						}}
						data-testid="import-vtt"
					/>
					<button
						type="button"
						className="st-button is-primary"
						onClick={exportFile}
						data-testid="export-vtt"
					>
						导出 WebVTT
					</button>
				</div>
			</div>

			<div className="st-caption-frame">
				<div className="st-preview-meta">
					<span>30 SEC · PROCEDURAL SCENE</span>
					<span>{activeCues.length > 0 ? "SYNCED" : "RUNNING"}</span>
				</div>
				<div
					className={`st-caption${activeCues.length > 1 ? " is-overlap" : ""}`}
					data-testid="preview-caption"
					aria-live="polite"
				>
					{activeCues.length > 0 ? (
						activeCues.map((cue, index) => {
							return (
								<span key={cue.id} className="st-caption-line">
									{activeCues.length > 1 ? `${index + 1}. ` : ""}
									{cue.text || "（空字幕）"}
								</span>
							);
						})
					) : (
						<span className="st-caption-idle">
							当前无字幕 · 播放头停在 {formatClock(currentMs)}
						</span>
					)}
				</div>
				{conflicts.count > 0 && (
					<div className="st-preview-warning">
						字幕重叠 {conflicts.count} 处，内容未被删除
					</div>
				)}
			</div>

			<aside className="st-inspector">
				<div className="st-inspector-head">
					<div>
						<span className="st-panel-kicker">CUE INSPECTOR</span>
						<h2>字幕检查器</h2>
					</div>
					<span
						className={`st-health${sixReady ? " is-ready" : ""}`}
						data-testid="timeline-health"
					>
						{sixReady
							? "6 条 · 无重叠"
							: `${cues.length} 条 · ${conflicts.count} 处重叠`}
					</span>
				</div>
				{selected ? (
					<>
						<label className="st-text-field">
							<span>
								第 {selectedIndex + 1} 条字幕
								<span className="st-field-note">可多行</span>
							</span>
							<textarea
								value={selected.text}
								onChange={(event) => {
									updateText(selected.id, event.currentTarget.value);
								}}
								rows={3}
								spellCheck={false}
								data-testid="cue-text"
								aria-label={`第 ${selectedIndex + 1} 条字幕文本`}
							/>
						</label>
						<div className="st-time-grid">
							<div className="st-time-row">
								<span className="st-time-kind">入点</span>
								<span className="st-time-value" data-testid="selected-start">
									{formatClock(selected.start)}
								</span>
								<div className="st-nudge">
									<button
										type="button"
										onClick={() => {
											nudge(selected.id, "start", -GRID_MS);
										}}
										data-testid="nudge-start-minus"
										aria-label="入点提前 0.1 秒"
									>
										−0.1
									</button>
									<button
										type="button"
										onClick={() => {
											nudge(selected.id, "start", GRID_MS);
										}}
										data-testid="nudge-start-plus"
										aria-label="入点延后 0.1 秒"
									>
										+0.1
									</button>
								</div>
							</div>
							<div className="st-time-row">
								<span className="st-time-kind">出点</span>
								<span className="st-time-value" data-testid="selected-end">
									{formatClock(selected.end)}
								</span>
								<div className="st-nudge">
									<button
										type="button"
										onClick={() => {
											nudge(selected.id, "end", -GRID_MS);
										}}
										data-testid="nudge-end-minus"
										aria-label="出点提前 0.1 秒"
									>
										−0.1
									</button>
									<button
										type="button"
										onClick={() => {
											nudge(selected.id, "end", GRID_MS);
										}}
										data-testid="nudge-end-plus"
										aria-label="出点延后 0.1 秒"
									>
										+0.1
									</button>
								</div>
							</div>
						</div>
						<p className="st-inspector-note">
							微调步长为 0.1 秒。边界与相邻端点会自动阻止，不会越过 00:00.0 或
							00:30.0。
						</p>
						{selectedConflicts.length > 0 && (
							<div
								className="st-selected-conflict"
								data-testid="selected-conflict"
							>
								与其它字幕重叠：
								{selectedConflicts.map((range) => {
									return ` ${formatClock(range.start)}–${formatClock(
										range.end,
									)}`;
								})}
								<span>文本与时间不会被自动吞掉。</span>
							</div>
						)}
						<div className="st-cue-actions">
							<button
								type="button"
								className="st-button"
								onClick={mergeSelected}
								disabled={selectedIndex < 0 || selectedIndex >= cues.length - 1}
								data-testid="merge-cue"
							>
								合并下一条
							</button>
							<button
								type="button"
								className="st-button is-danger"
								onClick={deleteSelected}
								data-testid="delete-cue"
							>
								删除字幕
							</button>
						</div>
					</>
				) : (
					<div className="st-inspector-empty">
						<span>尚未选择字幕</span>
						<p>点击时间轴上的字幕条，或在工具栏新增一条。</p>
					</div>
				)}

				<details
					className="st-vtt"
					open={vttOpen}
					onToggle={(event) => {
						setVttOpen(event.currentTarget.open);
					}}
				>
					<summary>WebVTT 输出</summary>
					<textarea
						className="st-vtt-text"
						value={vttOutput}
						readOnly
						rows={8}
						placeholder="点击“导出 WebVTT”或导入文件后，这里会显示 VTT 文本。"
						data-testid="vtt-output"
					/>
					<div className="st-vtt-actions">
						<button
							type="button"
							className="st-button"
							onClick={() => {
								if (!vttOutput) {
									notify("还没有可复制的 WebVTT。", "error");
									return;
								}
								if (!navigator.clipboard) {
									notify("浏览器不支持剪贴板写入。", "error");
									return;
								}
								void navigator.clipboard
									.writeText(vttOutput)
									.then(() => {
										notify("WebVTT 已复制。", "ok");
									})
									.catch(() => {
										notify("复制失败，请从文本框手动选择。", "error");
									});
							}}
						>
							复制
						</button>
						<span>重新导入该文件会恢复文本、时间与顺序。</span>
					</div>
				</details>
			</aside>

			<section className="st-timeline-panel">
				<header className="st-timeline-head">
					<div>
						<span className="st-panel-kicker">30.0 SEC · 0.1 STEP</span>
						<h2>时间轴与波形</h2>
					</div>
					<span
						className={`st-overlap-count${
							conflicts.count > 0 ? " is-hot" : ""
						}`}
						data-testid="overlap-count"
					>
						{conflicts.count > 0
							? `重叠 ${conflicts.count} 处 · 已标红`
							: "无重叠"}
					</span>
					<span className="st-timeline-hint">
						拖动字幕两端 · 拖动播放头 · 空格播放/暂停
					</span>
				</header>
				<Timeline
					cues={cues}
					currentMs={currentMs}
					activeIds={activeIds}
					conflicts={conflicts.map}
					peaks={soundtrack.peaks}
					onSelect={setSelectedId}
					onSetEdge={setCueEdge}
					onScrubStart={startScrub}
					onScrub={seekTo}
					onScrubEnd={endScrub}
				/>
				<div
					className={`st-status is-${status.tone}`}
					role="status"
					aria-live="polite"
					data-testid="status"
				>
					{status.message}
				</div>
			</section>

			<PreviewHost />
		</>
	);
};
