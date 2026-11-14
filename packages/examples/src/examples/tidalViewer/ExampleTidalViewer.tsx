/**
 * Tidal observation viewer: CSV validation, two-station chart, window zoom,
 * cursor comparison and PNG / HTML report export.
 */
import {
	type ChangeEvent,
	type DragEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { createExampleComponent } from "../utils";
import { type ChartLayout, drawTideChart, STATION_COLORS } from "./chart";
import {
	createReportHtml,
	createTidePng,
	downloadBlob,
	type ExportCursor,
	type ExportStationStat,
} from "./exporters";
import {
	differenceAt,
	formatDuration,
	formatLevel,
	formatSigned,
	formatTimestamp,
	groupByStation,
	type LoadResult,
	loadTidalCsv,
	summariseWindow,
	type TidePoint,
} from "./tideData";
import "./tidalViewer.css";

const DEMO_FILE = "demo-tidal.csv";
const DEFAULT_NORMAL = { low: -2.5, high: 2.5 };
const HOUR = 3_600_000;

interface TimeWindow {
	from: number;
	to: number;
}

interface OverviewDrag {
	mode: "left" | "right" | "pan";
	startX: number;
	startWindow: TimeWindow;
	overviewWidth: number;
}

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const nearestTime = (times: number[], target: number) => {
	if (times.length === 0) return target;
	let low = 0;
	let high = times.length - 1;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (times[mid] < target) low = mid + 1;
		else high = mid;
	}
	const next = times[low];
	const previous = times[Math.max(0, low - 1)];
	return Math.abs(next - target) < Math.abs(previous - target)
		? next
		: previous;
};

const fullWindow = (records: LoadResult["records"]): TimeWindow => {
	if (records.length === 0) return { from: 0, to: 1 };
	return {
		from: records[0].t,
		to: records[records.length - 1].t,
	};
};

const aggregate = (stats: ExportStationStat[]) => {
	let count = 0;
	let sum = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let anomalies = 0;
	for (const item of stats) {
		count += item.summary.count;
		sum += (item.summary.mean ?? 0) * item.summary.count;
		anomalies += item.summary.anomalies;
		if (item.summary.min !== null) min = Math.min(min, item.summary.min);
		if (item.summary.max !== null) max = Math.max(max, item.summary.max);
	}
	return {
		count,
		anomalies,
		min: count === 0 ? null : min,
		max: count === 0 ? null : max,
		mean: count === 0 ? null : sum / count,
	};
};

const filenameStamp = (time: number) =>
	new Date(time).toISOString().slice(0, 16).replace(/[:T]/g, "-");

const stationColors = (stations: string[]) =>
	Object.fromEntries(
		stations.map((station, index) => [
			station,
			STATION_COLORS[index % STATION_COLORS.length],
		]),
	);

const drawOverview = (
	canvas: HTMLCanvasElement,
	series: Record<string, TidePoint[]>,
	stations: string[],
	colors: Record<string, string>,
	domain: TimeWindow,
) => {
	const rect = canvas.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return;
	const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
	canvas.width = Math.round(rect.width * dpr);
	canvas.height = Math.round(rect.height * dpr);
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, rect.width, rect.height);
	ctx.fillStyle = "#071820";
	ctx.fillRect(0, 0, rect.width, rect.height);

	const allValues = stations.flatMap((station) =>
		series[station]
			.map((point) => point.value)
			.filter((value): value is number => value !== null),
	);
	if (allValues.length === 0) return;
	const min = Math.min(...allValues);
	const max = Math.max(...allValues);
	const pad = Math.max(0.1, (max - min) * 0.16);
	const yFor = (value: number) =>
		8 + ((max + pad - value) / (max - min + pad * 2)) * (rect.height - 16);
	const span = Math.max(1, domain.to - domain.from);
	const xFor = (time: number) => ((time - domain.from) / span) * rect.width;

	ctx.strokeStyle = "rgba(160, 196, 210, 0.08)";
	ctx.lineWidth = 1;
	for (let index = 1; index < 4; index++) {
		const y = (rect.height * index) / 4;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(rect.width, y);
		ctx.stroke();
	}

	for (const station of stations) {
		const color = colors[station] ?? STATION_COLORS[0];
		ctx.strokeStyle = color;
		ctx.globalAlpha = 0.72;
		ctx.lineWidth = 1.25;
		ctx.beginPath();
		let started = false;
		for (const point of series[station]) {
			if (point.value === null) {
				started = false;
				continue;
			}
			const x = xFor(point.t);
			const y = yFor(point.value);
			if (started) ctx.lineTo(x, y);
			else {
				ctx.moveTo(x, y);
				started = true;
			}
		}
		ctx.stroke();
		ctx.globalAlpha = 1;
	}
};

const TideViewer = () => {
	const [loaded, setLoaded] = useState<LoadResult | null>(null);
	const [sourceName, setSourceName] = useState(DEMO_FILE);
	const [windowRange, setWindowRange] = useState<TimeWindow>({
		from: 0,
		to: 1,
	});
	const [cursors, setCursors] = useState<[number, number]>([0, 1]);
	const [normal, setNormal] = useState(DEFAULT_NORMAL);
	const [activeStations, setActiveStations] = useState<string[]>([]);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [fontReady, setFontReady] = useState(false);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [draggingCursor, setDraggingCursor] = useState<0 | 1 | null>(null);

	const chartHostRef = useRef<HTMLDivElement>(null);
	const chartCanvasRef = useRef<HTMLCanvasElement>(null);
	const overviewCanvasRef = useRef<HTMLCanvasElement>(null);
	const overviewRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const chartLayoutRef = useRef<ChartLayout | null>(null);
	const overviewDragRef = useRef<OverviewDrag | null>(null);

	useEffect(() => {
		if (!status) return;
		const timer = setTimeout(() => setStatus(null), 3200);
		return () => clearTimeout(timer);
	}, [status]);

	useEffect(() => {
		let active = true;
		void Promise.all([
			document.fonts.load('400 13px "Tidal Sans"'),
			document.fonts.load('600 13px "Tidal Sans"'),
		])
			.catch(() => undefined)
			.then(() => {
				if (active) setFontReady(true);
			});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		const host = chartHostRef.current;
		if (!host || !loaded) return;
		const measure = () => {
			const rect = host.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				setSize({ width: rect.width, height: rect.height });
			}
		};
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect && rect.width > 0 && rect.height > 0) {
				setSize({ width: rect.width, height: rect.height });
			}
		});
		observer.observe(host);
		const frame = requestAnimationFrame(measure);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, [loaded]);

	const applyResult = useCallback((result: LoadResult, name: string) => {
		if (!result.ok) {
			setStatus(result.error ?? "CSV 无法载入。");
			setIsLoading(false);
			return;
		}
		const full = fullWindow(result.records);
		const span = Math.max(HOUR, full.to - full.from);
		const times = [...new Set(result.records.map((record) => record.t))].sort(
			(a, b) => a - b,
		);
		setLoaded(result);
		setSourceName(name);
		setActiveStations(result.stations.slice(0, 2));
		setWindowRange(full);
		setCursors([
			nearestTime(times, full.from + span * 0.565),
			nearestTime(times, full.from + span * 0.605),
		]);
		setNormal(DEFAULT_NORMAL);
		setDetailsOpen(false);
		setIsLoading(false);
		setStatus(
			`已清洗 ${result.stats.totalRows} 行，保留 ${result.stats.accepted} 条唯一观测。`,
		);
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		const url = `${import.meta.env.BASE_URL}assets/tidalViewer/${DEMO_FILE}`;
		fetch(url, { signal: controller.signal })
			.then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.text();
			})
			.then((text) => applyResult(loadTidalCsv(text), DEMO_FILE))
			.catch((error: unknown) => {
				if (error instanceof DOMException && error.name === "AbortError")
					return;
				setIsLoading(false);
				setStatus("演示 CSV 载入失败，可通过「载入 CSV」选择文件。");
			});
		return () => controller.abort();
	}, [applyResult]);

	const stations = loaded?.stations ?? [];
	const primaryStations = useMemo(() => stations.slice(0, 2), [stations]);
	const colors = useMemo(() => stationColors(stations), [stations]);
	const series = useMemo(
		() => (loaded ? groupByStation(loaded.records, stations) : {}),
		[loaded, stations],
	);
	const visibleStations = primaryStations.filter((station) =>
		activeStations.includes(station),
	);
	const chartStations =
		visibleStations.length > 0 ? visibleStations : primaryStations;
	const dataWindow = useMemo(
		() => (loaded ? fullWindow(loaded.records) : { from: 0, to: 1 }),
		[loaded],
	);
	const observationTimes = useMemo(
		() =>
			loaded
				? [...new Set(loaded.records.map((record) => record.t))].sort(
						(a, b) => a - b,
					)
				: [],
		[loaded],
	);

	const stationStats: ExportStationStat[] = useMemo(
		() =>
			visibleStations.map((station) => ({
				station,
				color: colors[station],
				summary: summariseWindow(
					series[station] ?? [],
					windowRange.from,
					windowRange.to,
					normal.low,
					normal.high,
				),
			})),
		[visibleStations, colors, series, windowRange, normal],
	);
	const totalStats = aggregate(stationStats);
	const cursorReadings = useMemo(() => {
		const stationA = series[primaryStations[0]] ?? [];
		const stationB = series[primaryStations[1]] ?? [];
		return [
			differenceAt(stationA, stationB, cursors[0]),
			differenceAt(stationA, stationB, cursors[1]),
		];
	}, [series, primaryStations, cursors]);

	const fullChartInput = useMemo(
		() => ({
			series,
			stations: chartStations,
			from: windowRange.from,
			to: windowRange.to,
			cursors,
			normalLow: normal.low,
			normalHigh: normal.high,
			stationColors: colors,
		}),
		[series, chartStations, windowRange, cursors, normal, colors],
	);

	useEffect(() => {
		const canvas = chartCanvasRef.current;
		if (
			!canvas ||
			size.width === 0 ||
			size.height === 0 ||
			!loaded ||
			!fontReady
		)
			return;
		const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
		canvas.width = Math.round(size.width * dpr);
		canvas.height = Math.round(size.height * dpr);
		canvas.style.width = `${size.width}px`;
		canvas.style.height = `${size.height}px`;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		chartLayoutRef.current = drawTideChart(
			ctx,
			size.width,
			size.height,
			fullChartInput,
		);
	}, [fullChartInput, fontReady, loaded, size]);

	useEffect(() => {
		const canvas = overviewCanvasRef.current;
		if (!canvas || !loaded || size.width === 0) return;
		drawOverview(canvas, series, chartStations, colors, dataWindow);
	}, [loaded, series, chartStations, colors, dataWindow, size.width]);

	const changeWindow = useCallback(
		(next: TimeWindow) => {
			const from = Math.max(dataWindow.from, Math.min(next.from, next.to));
			const to = Math.min(dataWindow.to, Math.max(next.from, next.to));
			setWindowRange({ from, to });
			setCursors(([a, b]) => [
				clamp(nearestTime(observationTimes, clamp(a, from, to)), from, to),
				clamp(nearestTime(observationTimes, clamp(b, from, to)), from, to),
			]);
		},
		[dataWindow, observationTimes],
	);

	const applyPreset = (preset: "all" | "48h" | "24h" | "event") => {
		const span = dataWindow.to - dataWindow.from;
		if (preset === "all") changeWindow(dataWindow);
		else if (preset === "48h") {
			changeWindow({
				from: Math.max(dataWindow.from, dataWindow.to - 48 * HOUR),
				to: dataWindow.to,
			});
		} else if (preset === "24h") {
			changeWindow({
				from: Math.max(dataWindow.from, dataWindow.to - 24 * HOUR),
				to: dataWindow.to,
			});
		} else {
			changeWindow({
				from: dataWindow.from + span * 0.43,
				to: dataWindow.from + span * 0.7,
			});
		}
	};

	const handleFile = async (file: File) => {
		if (!file.name.toLowerCase().endsWith(".csv")) {
			setStatus("请选择 .csv 文件。");
			return;
		}
		setIsLoading(true);
		try {
			const text = await file.text();
			applyResult(loadTidalCsv(text), file.name);
		} catch {
			setIsLoading(false);
			setStatus("文件读取失败，请重试。");
		}
	};

	const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) void handleFile(file);
		event.target.value = "";
	};

	const onDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		const file = event.dataTransfer.files?.[0];
		if (file) void handleFile(file);
	};

	const toggleStation = (station: string) => {
		setActiveStations((current) => {
			if (!current.includes(station)) return [...current, station];
			if (current.length === 1) {
				setStatus("至少保留一条站点曲线。");
				return current;
			}
			return current.filter((item) => item !== station);
		});
	};

	const timeAtPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const layout = chartLayoutRef.current;
		const canvas = chartCanvasRef.current;
		if (!layout || !canvas) return null;
		const rect = canvas.getBoundingClientRect();
		return layout.timeForX(event.clientX - rect.left);
	};

	const onChartPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const time = timeAtPointer(event);
		if (time === null) return;
		const layout = chartLayoutRef.current;
		const canvas = chartCanvasRef.current;
		if (!layout || !canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const distanceA = Math.abs(x - layout.xForTime(cursors[0]));
		const distanceB = Math.abs(x - layout.xForTime(cursors[1]));
		const index: 0 | 1 = distanceA <= distanceB ? 0 : 1;
		setDraggingCursor(index);
		setCursors((current) => {
			const next: [number, number] = [...current];
			next[index] = clamp(
				nearestTime(
					observationTimes,
					clamp(time, windowRange.from, windowRange.to),
				),
				windowRange.from,
				windowRange.to,
			);
			return next;
		});
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onChartPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		if (draggingCursor === null) return;
		const time = timeAtPointer(event);
		if (time === null) return;
		setCursors((current) => {
			const next: [number, number] = [...current];
			next[draggingCursor] = clamp(
				nearestTime(
					observationTimes,
					clamp(time, windowRange.from, windowRange.to),
				),
				windowRange.from,
				windowRange.to,
			);
			return next;
		});
	};

	const onChartPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		setDraggingCursor(null);
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const beginOverviewDrag = (
		event: ReactPointerEvent<HTMLDivElement>,
		mode: OverviewDrag["mode"],
	) => {
		event.preventDefault();
		event.stopPropagation();
		const rect = overviewRef.current?.getBoundingClientRect();
		if (!rect) return;
		overviewDragRef.current = {
			mode,
			startX: event.clientX,
			startWindow: windowRange,
			overviewWidth: rect.width,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const moveOverviewDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = overviewDragRef.current;
		if (!drag) return;
		const total = dataWindow.to - dataWindow.from;
		const delta = ((event.clientX - drag.startX) / drag.overviewWidth) * total;
		const minSpan = Math.min(6 * HOUR, total);
		if (drag.mode === "pan") {
			const duration = drag.startWindow.to - drag.startWindow.from;
			const from = clamp(
				drag.startWindow.from + delta,
				dataWindow.from,
				dataWindow.to - duration,
			);
			changeWindow({ from, to: from + duration });
		} else if (drag.mode === "left") {
			changeWindow({
				from: clamp(
					drag.startWindow.from + delta,
					dataWindow.from,
					drag.startWindow.to - minSpan,
				),
				to: drag.startWindow.to,
			});
		} else {
			changeWindow({
				from: drag.startWindow.from,
				to: clamp(
					drag.startWindow.to + delta,
					drag.startWindow.from + minSpan,
					dataWindow.to,
				),
			});
		}
	};

	const endOverviewDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		overviewDragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const setNormalBound = (key: "low" | "high", raw: string) => {
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		setNormal((current) =>
			key === "low"
				? { ...current, low: Math.min(value, current.high - 0.1) }
				: { ...current, high: Math.max(value, current.low + 0.1) },
		);
	};

	const exportCursorRows: ExportCursor[] = cursorReadings.map(
		(reading, index) => ({
			label: index === 0 ? "A" : "B",
			time: cursors[index],
			reading,
		}),
	);

	const buildExportData = () => ({
		chart: { ...fullChartInput, stations: chartStations },
		stationStats,
		cursors: exportCursorRows,
		cleaning: loaded?.stats ?? {
			totalRows: 0,
			accepted: 0,
			duplicateRows: 0,
			conflictingDuplicates: 0,
			missingRows: 0,
			invalidRows: 0,
			badTimestampRows: 0,
			unknownStationRows: 0,
			outOfOrder: false,
		},
		normalLow: normal.low,
		normalHigh: normal.high,
		generatedAt: new Date(),
	});

	const exportPng = async () => {
		if (!loaded) return;
		try {
			const blob = await createTidePng(buildExportData());
			downloadBlob(blob, `tide-window-${filenameStamp(windowRange.from)}.png`);
			setStatus("当前窗口 PNG 已导出。");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "PNG 导出失败。");
		}
	};

	const exportReport = () => {
		if (!loaded) return;
		const html = createReportHtml(buildExportData());
		downloadBlob(
			new Blob([html], { type: "text/html;charset=utf-8" }),
			`tide-report-${filenameStamp(windowRange.from)}.html`,
		);
		setStatus("单页统计报告已导出。");
	};

	const overviewSpan = Math.max(1, dataWindow.to - dataWindow.from);
	const overviewLeft =
		((windowRange.from - dataWindow.from) / overviewSpan) * 100;
	const overviewWidth =
		((windowRange.to - windowRange.from) / overviewSpan) * 100;
	const invalidTotal = loaded
		? loaded.stats.invalidRows +
			loaded.stats.badTimestampRows +
			loaded.stats.unknownStationRows
		: 0;
	const fontBase = `${import.meta.env.BASE_URL}assets/tidalViewer/fonts`;

	return (
		<div
			className="tidal-app"
			role="application"
			aria-label="潮汐观测数据看板"
			data-chart-size={`${Math.round(size.width)}x${Math.round(size.height)}`}
			data-font-ready={fontReady ? "true" : "false"}
			onDragOver={(event) => event.preventDefault()}
			onDrop={onDrop}
		>
			<style>{`
				@font-face {
					font-family: "Tidal Sans";
					src: url("${fontBase}/NotoSansSC-Regular.woff2") format("woff2");
					font-weight: 400;
					font-style: normal;
					font-display: swap;
				}
				@font-face {
					font-family: "Tidal Sans";
					src: url("${fontBase}/NotoSansSC-SemiBold.woff2") format("woff2");
					font-weight: 500 700;
					font-style: normal;
					font-display: swap;
				}
			`}</style>
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv,text/csv"
				className="tidal-file-input"
				onChange={onFileChange}
			/>

			<header className="tidal-header">
				<div className="tidal-brand">
					<div className="tidal-mark" aria-hidden="true">
						<svg viewBox="0 0 48 48">
							<title>潮汐观测台</title>
							<path
								d="M6 27c5.5 0 5.5-5 11-5s5.5 5 11 5 5.5-5 11-5 5.5 5 5.5 5"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.2"
								strokeLinecap="round"
							/>
							<path
								d="M6 34c5.5 0 5.5-5 11-5s5.5 5 11 5 5.5-5 11-5 5.5 5 5.5 5"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.4"
								strokeLinecap="round"
								opacity=".55"
							/>
							<circle
								cx="24"
								cy="14"
								r="3.2"
								fill="currentColor"
								opacity=".9"
							/>
						</svg>
					</div>
					<div>
						<div className="tidal-kicker">
							COASTAL OBSERVATION LAB <span>/</span> NO. 106
						</div>
						<h1>潮汐观测台</h1>
						<p>
							双站水位对照 · 缺失值与异常区间分析
							<span className="source-chip">{sourceName}</span>
						</p>
					</div>
				</div>
				<div className="header-actions">
					<div className="live-pill">
						<span />
						本地解析 · 无刷新
					</div>
					<button
						type="button"
						className="tool-button"
						onClick={() => fileInputRef.current?.click()}
						disabled={isLoading}
					>
						<svg viewBox="0 0 18 18" aria-hidden="true">
							<path d="M9 2v9m0-9L5.5 5.5M9 2l3.5 3.5M3 11v3.5h12V11" />
						</svg>
						载入 CSV
					</button>
					<button
						type="button"
						className="tool-button"
						onClick={() => void exportPng()}
						disabled={!loaded}
					>
						<svg viewBox="0 0 18 18" aria-hidden="true">
							<rect x="2.5" y="3" width="13" height="12" rx="1.5" />
							<circle cx="6.2" cy="6.6" r="1.1" />
							<path d="m3.5 13 4-4 2.4 2.3 2-1.8 2.6 3.5" />
						</svg>
						导出 PNG
					</button>
					<button
						type="button"
						className="tool-button accent"
						onClick={exportReport}
						disabled={!loaded}
					>
						<svg viewBox="0 0 18 18" aria-hidden="true">
							<path d="M5 2.5h5.5L14 6v9.5H5z" />
							<path d="M10.5 2.5V6H14M7.5 9h4M7.5 11.5h4" />
						</svg>
						统计报告
					</button>
				</div>
			</header>

			{loaded && (
				<div className="quality-strip">
					<div className="quality-icon">
						<svg viewBox="0 0 22 22" aria-hidden="true">
							<path d="m5 11 4 4 8-8" />
						</svg>
					</div>
					<div className="quality-copy">
						<div className="quality-title">
							<span className="eyebrow">VALIDATION PASSED</span>
							<strong>清洗完成</strong>
							<span className="quality-fraction">
								{loaded.stats.accepted} / {loaded.stats.totalRows} 条有效观测
							</span>
						</div>
						<div className="quality-chips">
							<span className={loaded.stats.outOfOrder ? "changed" : ""}>
								时间排序 {loaded.stats.outOfOrder ? "已修正" : "正常"}
							</span>
							<span className={loaded.stats.duplicateRows ? "changed" : ""}>
								去重 {loaded.stats.duplicateRows}
							</span>
							<span className={loaded.stats.missingRows ? "changed" : ""}>
								缺失 {loaded.stats.missingRows}
							</span>
							<span className={invalidTotal ? "changed" : ""}>
								丢弃 {invalidTotal}
							</span>
							<span>{primaryStations.length} 个站点</span>
						</div>
					</div>
					<div className="quality-actions">
						<button
							type="button"
							className="text-button"
							onClick={() => setDetailsOpen((open) => !open)}
						>
							{detailsOpen ? "隐藏明细" : "查看清洗明细"}
							<span className={`chevron ${detailsOpen ? "open" : ""}`}>⌄</span>
						</button>
					</div>
				</div>
			)}

			{status && (
				<div className="tidal-toast" role="status">
					<span className="tidal-toast-dot" />
					{status}
				</div>
			)}

			{isLoading && !loaded ? (
				<div className="tidal-loading">
					<div className="tidal-spinner" />
					<span>正在解析演示观测数据…</span>
				</div>
			) : loaded ? (
				<>
					{/* QUALITY */}
					{detailsOpen && (
						<div className="quality-details">
							<div className="quality-details-head">
								<div>
									<span className="eyebrow">DATA QUALITY LOG</span>
									<strong>清洗明细 · {loaded.issues.length} 条提示</strong>
								</div>
								<button
									type="button"
									className="ghost-button"
									onClick={() => setDetailsOpen(false)}
								>
									收起
								</button>
							</div>
							<div className="issue-list">
								{loaded.issues.map((issue) => (
									<div
										className={`issue-row ${issue.severity}`}
										key={`${issue.line}-${issue.type}-${issue.message}`}
									>
										<span className="issue-line">
											{issue.line > 0 ? `L${issue.line}` : "全局"}
										</span>
										<span className="issue-type">{issue.type}</span>
										<span className="issue-message">{issue.message}</span>
									</div>
								))}
							</div>
						</div>
					)}

					<div className="tidal-layout">
						<main className="tidal-main">
							<section className="chart-card">
								<div className="chart-card-head">
									<div className="chart-heading">
										<span className="eyebrow">WATER LEVEL / METRES</span>
										<h2>双站水位过程线</h2>
										<p>
											{formatTimestamp(windowRange.from)} —{" "}
											{formatTimestamp(windowRange.to)}
										</p>
									</div>
									<div className="station-legend">
										{primaryStations.map((station) => {
											const active = activeStations.includes(station);
											return (
												<button
													type="button"
													key={station}
													className={`station-toggle ${active ? "active" : ""}`}
													onClick={() => toggleStation(station)}
													aria-pressed={active}
												>
													<span
														className="legend-line"
														style={{ background: colors[station] }}
													/>
													{station}
													<small>{active ? "显示中" : "已隐藏"}</small>
												</button>
											);
										})}
									</div>
								</div>

								<div className="chart-toolbar">
									<fieldset className="range-presets" aria-label="时间范围预设">
										<button
											type="button"
											className={
												windowRange.from === dataWindow.from &&
												windowRange.to === dataWindow.to
													? "active"
													: ""
											}
											onClick={() => applyPreset("all")}
										>
											全部
										</button>
										<button type="button" onClick={() => applyPreset("48h")}>
											48h
										</button>
										<button type="button" onClick={() => applyPreset("24h")}>
											24h
										</button>
										<button type="button" onClick={() => applyPreset("event")}>
											异常段
										</button>
									</fieldset>
									<div className="normal-control">
										<span>正常范围</span>
										<label>
											<input
												type="number"
												step="0.1"
												value={normal.low}
												onChange={(event) =>
													setNormalBound("low", event.target.value)
												}
												aria-label="正常水位下限"
											/>
										</label>
										<span className="range-arrow">→</span>
										<label>
											<input
												type="number"
												step="0.1"
												value={normal.high}
												onChange={(event) =>
													setNormalBound("high", event.target.value)
												}
												aria-label="正常水位上限"
											/>
										</label>
										<small>m</small>
									</div>
								</div>

								<div className="chart-host" ref={chartHostRef}>
									<canvas
										ref={chartCanvasRef}
										className={`tide-chart ${draggingCursor !== null ? "dragging" : ""}`}
										onPointerDown={onChartPointerDown}
										onPointerMove={onChartPointerMove}
										onPointerUp={onChartPointerUp}
										onPointerCancel={onChartPointerUp}
									/>
									<div className="chart-frame-tag">
										<span className="pulse-dot" />
										拖动 A / B 游标对比同刻水位
									</div>
								</div>

								<div className="chart-footer">
									<span>
										<i className="swatch normal" />
										正常范围
									</span>
									<span>
										<i className="swatch anomaly" />
										超限区间
									</span>
									<span>
										<i className="swatch missing" />
										缺失断点
									</span>
									<span className="chart-footer-note">
										窗口 {formatDuration(windowRange.from, windowRange.to)} ·{" "}
										{totalStats.count} 个有效读数
									</span>
								</div>

								<div className="overview-block">
									<div className="overview-head">
										<div>
											<span className="eyebrow">RANGE NAVIGATOR</span>
											<strong>全时段导航</strong>
										</div>
										<span className="overview-hint">
											拖动窗口边缘缩放 · 拖动中部平移
										</span>
									</div>
									<fieldset
										className="overview"
										ref={overviewRef}
										aria-label="时间窗口缩放导航"
										onPointerMove={moveOverviewDrag}
										onPointerUp={endOverviewDrag}
										onPointerCancel={endOverviewDrag}
										onDoubleClick={() => applyPreset("all")}
									>
										<canvas ref={overviewCanvasRef} />
										<div
											className="overview-mask"
											style={{ left: 0, width: `${overviewLeft}%` }}
										/>
										<div
											className="overview-mask"
											style={{
												left: `${overviewLeft + overviewWidth}%`,
												right: 0,
											}}
										/>
										<div
											className="overview-selection"
											style={{
												left: `${overviewLeft}%`,
												width: `${overviewWidth}%`,
											}}
											onPointerDown={(event) => beginOverviewDrag(event, "pan")}
										>
											<button
												type="button"
												className="brush-handle left"
												aria-label="调整窗口开始时间"
												onPointerDown={(event) =>
													beginOverviewDrag(event, "left")
												}
											/>
											<span className="brush-caption">
												{formatDuration(windowRange.from, windowRange.to)}
											</span>
											<button
												type="button"
												className="brush-handle right"
												aria-label="调整窗口结束时间"
												onPointerDown={(event) =>
													beginOverviewDrag(event, "right")
												}
											/>
										</div>
									</fieldset>
								</div>
							</section>
						</main>

						<aside className="tidal-sidebar">
							<section className="stats-card">
								<div className="side-card-head">
									<div>
										<span className="eyebrow">CURRENT WINDOW</span>
										<h2>窗口统计</h2>
									</div>
									<span className="window-duration">
										{formatDuration(windowRange.from, windowRange.to)}
									</span>
								</div>
								<p className="window-caption">
									{formatTimestamp(windowRange.from)} —{" "}
									{formatTimestamp(windowRange.to)}
								</p>

								<div className="metric-grid">
									<div className="metric-card bright">
										<span>最高水位</span>
										<strong>{formatLevel(totalStats.max)}</strong>
										<small>MAXIMUM</small>
									</div>
									<div className="metric-card">
										<span>最低水位</span>
										<strong>{formatLevel(totalStats.min)}</strong>
										<small>MINIMUM</small>
									</div>
									<div className="metric-card">
										<span>平均水位</span>
										<strong>{formatLevel(totalStats.mean)}</strong>
										<small>MEAN</small>
									</div>
									<div className="metric-card anomaly">
										<span>异常点</span>
										<strong>{totalStats.anomalies}</strong>
										<small>OUT OF RANGE</small>
									</div>
								</div>

								<div className="station-breakdown">
									<div className="breakdown-head">
										<span>站点明细</span>
										<span>{totalStats.count} 个有效读数</span>
									</div>
									{stationStats.map((item) => (
										<div className="breakdown-row" key={item.station}>
											<span
												className="station-dot"
												style={{ background: item.color }}
											/>
											<div className="breakdown-name">
												<strong>{item.station}</strong>
												<small>
													{item.summary.missing} 缺失 · {item.summary.count}{" "}
													有效
												</small>
											</div>
											<div className="breakdown-value">
												<strong>{formatLevel(item.summary.mean)}</strong>
												<small>均值</small>
											</div>
											<span
												className={`anomaly-badge ${item.summary.anomalies ? "warn" : ""}`}
											>
												{item.summary.anomalies}
											</span>
										</div>
									))}
								</div>
							</section>

							<section className="cursor-card">
								<div className="side-card-head">
									<div>
										<span className="eyebrow">CURSOR COMPARISON</span>
										<h2>游标对照</h2>
									</div>
									<div className="cursor-key">
										<span className="a">A</span>
										<span className="b">B</span>
									</div>
								</div>
								<p className="cursor-instruction">
									在曲线上按下并拖动任一游标，比较同一时刻两站水位。
								</p>

								{([0, 1] as const).map((index) => (
									<div
										className={`cursor-row ${index === 0 ? "cursor-a" : "cursor-b"}`}
										key={index}
									>
										<div className="cursor-row-head">
											<span className="cursor-badge">
												{index === 0 ? "A" : "B"}
											</span>
											<div>
												<strong>{formatTimestamp(cursors[index])}</strong>
												<small>最近观测</small>
											</div>
											<span className="cursor-diff">
												A−B{" "}
												<strong>
													{formatSigned(cursorReadings[index].diff)}
												</strong>
											</span>
										</div>
										<div className="cursor-values">
											{primaryStations.map((station, stationIndex) => {
												const value =
													stationIndex === 0
														? cursorReadings[index].a
														: cursorReadings[index].b;
												return (
													<div className="cursor-value" key={station}>
														<span
															className="station-dot"
															style={{ background: colors[station] }}
														/>
														<span>{station}</span>
														<strong>{formatLevel(value)}</strong>
													</div>
												);
											})}
										</div>
									</div>
								))}
							</section>

							<div className="data-note">
								<div className="note-mark">i</div>
								<div>
									<strong>异常判定</strong>
									<p>
										水位超出 [{normal.low.toFixed(1)}, {normal.high.toFixed(1)}]
										m 即视为异常；缺失值不计入均值。
									</p>
									<a
										href={`${import.meta.env.BASE_URL}assets/tidalViewer/${DEMO_FILE}`}
										download
									>
										下载含缺陷的演示 CSV
									</a>
								</div>
							</div>
						</aside>
					</div>
				</>
			) : (
				<div className="tidal-empty">
					<span className="empty-mark">≈</span>
					<strong>尚未载入观测数据</strong>
					<p>选择一份包含 timestamp、station、level 三列的 CSV 文件。</p>
					<button
						type="button"
						className="primary-button"
						onClick={() => fileInputRef.current?.click()}
					>
						载入 CSV
					</button>
				</div>
			)}
		</div>
	);
};

let tidalHost: HTMLDivElement | null = null;
let tidalRoot: Root | null = null;
let tidalCleanupTimer: number | null = null;

const tidalTeardown = () => {
	if (tidalCleanupTimer !== null) clearTimeout(tidalCleanupTimer);
	tidalCleanupTimer = window.setTimeout(() => {
		tidalCleanupTimer = null;
		tidalRoot?.unmount();
		tidalHost?.remove();
		tidalRoot = null;
		tidalHost = null;
	}, 0);
};

const mountTidalViewer = () => {
	if (tidalCleanupTimer !== null) {
		// React StrictMode's development remount calls the effect cleanup and
		// then immediately runs the effect again. Reuse the live host rather
		// than unmounting and recreating a second root.
		clearTimeout(tidalCleanupTimer);
		tidalCleanupTimer = null;
		return tidalTeardown;
	}
	const screen = document.getElementById("screen");
	if (!screen) throw new Error("Example screen not found");
	const host = document.createElement("div");
	host.className = "tidal-host";
	screen.appendChild(host);
	const root = createRoot(host);
	tidalHost = host;
	tidalRoot = root;
	root.render(<TideViewer />);
	return tidalTeardown;
};

export const ExampleTidalViewer = createExampleComponent(mountTidalViewer);
