/**
 * PNG chart export and the one-page HTML statistics report.
 */
import { type ChartInput, drawTideChart } from "./chart";
import {
	type CleaningStats,
	type CursorReading,
	formatDuration,
	formatLevel,
	formatSigned,
	formatTimestamp,
	type WindowSummary,
} from "./tideData";

export interface ExportStationStat {
	station: string;
	color: string;
	summary: WindowSummary;
}

export interface ExportCursor {
	label: "A" | "B";
	time: number;
	reading: CursorReading;
}

export interface TideExportData {
	chart: ChartInput;
	stationStats: ExportStationStat[];
	cursors: ExportCursor[];
	cleaning: CleaningStats;
	normalLow: number;
	normalHigh: number;
	generatedAt: Date;
}

const PANEL = "#0d2230";
const BORDER = "rgba(126, 176, 196, 0.22)";
const MUTED = "#7f9eac";
const TEXT = "#e1eef3";
const ACCENT = "#57d8ff";
const WARN = "#ff7c5f";

const rounded = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) => {
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, radius);
};

const aggregate = (stats: ExportStationStat[]) => {
	let count = 0;
	let sum = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let anomalies = 0;
	let missing = 0;
	for (const item of stats) {
		count += item.summary.count;
		sum += (item.summary.mean ?? 0) * item.summary.count;
		missing += item.summary.missing;
		anomalies += item.summary.anomalies;
		if (item.summary.min !== null) min = Math.min(min, item.summary.min);
		if (item.summary.max !== null) max = Math.max(max, item.summary.max);
	}
	return {
		count,
		missing,
		anomalies,
		min: count === 0 ? null : min,
		max: count === 0 ? null : max,
		mean: count === 0 ? null : sum / count,
	};
};

const drawStat = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	label: string,
	value: string,
	width: number,
) => {
	ctx.fillStyle = MUTED;
	ctx.font = '11px "IBM Plex Mono", "Tidal Sans", monospace';
	ctx.fillText(label, x, y);
	ctx.fillStyle = TEXT;
	ctx.font = '600 24px "IBM Plex Mono", "Tidal Sans", monospace';
	ctx.fillText(value, x, y + 31);
	ctx.fillStyle = BORDER;
	ctx.fillRect(x, y + 48, width, 1);
};

/**
 * Compose a 1800×1080 PNG of the current view, chart and window statistics.
 */
export async function createTidePng(data: TideExportData): Promise<Blob> {
	await document.fonts.ready;
	const width = 1800;
	const height = 1080;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("无法创建 PNG 画布。");

	const background = ctx.createLinearGradient(0, 0, width, height);
	background.addColorStop(0, "#071720");
	background.addColorStop(0.55, "#081d28");
	background.addColorStop(1, "#06131b");
	ctx.fillStyle = background;
	ctx.fillRect(0, 0, width, height);

	ctx.fillStyle = ACCENT;
	ctx.fillRect(64, 56, 42, 4);
	ctx.fillStyle = MUTED;
	ctx.font = '11px "IBM Plex Mono", "Tidal Sans", monospace';
	ctx.fillText("TIDAL OBSERVATION LAB  /  WINDOW EXPORT", 64, 83);
	ctx.fillStyle = TEXT;
	ctx.font = '600 34px "Tidal Sans", "IBM Plex Sans", sans-serif';
	ctx.fillText("潮汐双站对照", 64, 129);
	ctx.fillStyle = MUTED;
	ctx.font = '13px "Tidal Sans", "IBM Plex Sans", sans-serif';
	ctx.fillText(
		`${formatTimestamp(data.chart.from)} — ${formatTimestamp(data.chart.to)} · ${formatDuration(data.chart.from, data.chart.to)} · 正常范围 ${data.normalLow.toFixed(2)} 至 ${data.normalHigh.toFixed(2)} m`,
		64,
		154,
	);

	rounded(ctx, 64, 184, 1180, 720, 16);
	ctx.fillStyle = PANEL;
	ctx.fill();
	ctx.strokeStyle = BORDER;
	ctx.lineWidth = 1;
	ctx.stroke();

	const chartCanvas = document.createElement("canvas");
	const scale = 2;
	chartCanvas.width = 1150 * scale;
	chartCanvas.height = 680 * scale;
	const chartCtx = chartCanvas.getContext("2d");
	if (!chartCtx) throw new Error("无法创建曲线画布。");
	chartCtx.scale(scale, scale);
	drawTideChart(chartCtx, 1150, 680, {
		...data.chart,
		showCursorLabels: true,
	});
	ctx.drawImage(chartCanvas, 79, 204, 1150, 680);

	const panelX = 1280;
	const panelWidth = 456;
	rounded(ctx, panelX, 184, panelWidth, 720, 16);
	ctx.fillStyle = "rgba(13, 34, 48, 0.9)";
	ctx.fill();
	ctx.strokeStyle = BORDER;
	ctx.stroke();
	ctx.fillStyle = MUTED;
	ctx.font = '11px "IBM Plex Mono", "Tidal Sans", monospace';
	ctx.fillText("CURRENT WINDOW", panelX + 28, 222);
	ctx.fillStyle = TEXT;
	ctx.font = '600 20px "Tidal Sans", "IBM Plex Sans", sans-serif';
	ctx.fillText("窗口统计", panelX + 28, 252);
	ctx.fillStyle = MUTED;
	ctx.font = '11px "Tidal Sans", sans-serif';
	ctx.fillText(
		`${formatTimestamp(data.chart.from)} — ${formatTimestamp(data.chart.to)}`,
		panelX + 28,
		275,
	);

	const total = aggregate(data.stationStats);
	const metricWidth = (panelWidth - 72) / 2;
	drawStat(
		ctx,
		panelX + 28,
		322,
		"最高水位",
		formatLevel(total.max),
		metricWidth,
	);
	drawStat(
		ctx,
		panelX + 44 + metricWidth,
		322,
		"最低水位",
		formatLevel(total.min),
		metricWidth,
	);
	drawStat(
		ctx,
		panelX + 28,
		408,
		"平均水位",
		formatLevel(total.mean),
		metricWidth,
	);
	drawStat(
		ctx,
		panelX + 44 + metricWidth,
		408,
		"异常观测",
		`${total.anomalies} 点`,
		metricWidth,
	);

	ctx.fillStyle = MUTED;
	ctx.font = '11px "IBM Plex Mono", "Tidal Sans", monospace';
	ctx.fillText("STATION BREAKDOWN", panelX + 28, 510);
	let rowY = 546;
	for (const item of data.stationStats) {
		ctx.fillStyle = item.color;
		ctx.beginPath();
		ctx.arc(panelX + 34, rowY - 4, 4, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = TEXT;
		ctx.font = '600 14px "Tidal Sans", sans-serif';
		ctx.fillText(item.station, panelX + 48, rowY);
		ctx.fillStyle = MUTED;
		ctx.font = '11px "IBM Plex Mono", "Tidal Sans", monospace';
		ctx.fillText(
			`${formatLevel(item.summary.min)}  /  ${formatLevel(item.summary.mean)}  /  ${formatLevel(item.summary.max)}`,
			panelX + 48,
			rowY + 19,
		);
		ctx.fillStyle = item.summary.anomalies > 0 ? WARN : MUTED;
		ctx.fillText(
			`${item.summary.anomalies} 异常 · ${item.summary.missing} 缺失`,
			panelX + 48,
			rowY + 36,
		);
		rowY += 64;
	}

	ctx.fillStyle = MUTED;
	ctx.font = '11px "IBM Plex Mono", "Tidal Sans", monospace';
	ctx.fillText("CURSOR COMPARISON", panelX + 28, rowY + 26);
	rowY += 52;
	for (const cursor of data.cursors) {
		ctx.fillStyle = cursor.label === "A" ? "#f0f6f8" : "#c9a7ff";
		ctx.font = '600 12px "IBM Plex Mono", sans-serif';
		ctx.fillText(cursor.label, panelX + 28, rowY);
		ctx.fillStyle = TEXT;
		ctx.font = '12px "Tidal Sans", sans-serif';
		ctx.fillText(formatTimestamp(cursor.time), panelX + 46, rowY);
		ctx.fillStyle = MUTED;
		ctx.font = '11px "IBM Plex Mono", "Tidal Sans", monospace';
		ctx.fillText(
			`差 ${formatSigned(cursor.reading.diff)}`,
			panelX + panelWidth - 28,
			rowY,
		);
		rowY += 25;
	}

	ctx.fillStyle = MUTED;
	ctx.font = '11px "Tidal Sans", sans-serif';
	ctx.fillText(
		`清洗：${data.cleaning.accepted} 条有效 / ${data.cleaning.totalRows} 行 · 去重 ${data.cleaning.duplicateRows} · 缺失 ${data.cleaning.missingRows} · 无效 ${data.cleaning.invalidRows + data.cleaning.badTimestampRows + data.cleaning.unknownStationRows}`,
		64,
		946,
	);
	ctx.fillStyle = "rgba(127, 158, 172, 0.62)";
	ctx.fillText(
		`导出时间 ${formatTimestamp(data.generatedAt.getTime())} · melonJS examples · 数据仅用于演示`,
		64,
		974,
	);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error("PNG 编码失败。"));
		}, "image/png");
	});
}

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[char] ?? char,
	);

/** Build a standalone, print-ready one-page HTML report. */
export function createReportHtml(data: TideExportData): string {
	const total = aggregate(data.stationStats);
	const stationRows = data.stationStats
		.map(
			(item) => `<tr>
				<td><span class="dot" style="background:${item.color}"></span>${escapeHtml(item.station)}</td>
				<td>${formatLevel(item.summary.min)}</td>
				<td>${formatLevel(item.summary.mean)}</td>
				<td>${formatLevel(item.summary.max)}</td>
				<td class="${item.summary.anomalies > 0 ? "warn" : ""}">${item.summary.anomalies}</td>
				<td>${item.summary.missing}</td>
			</tr>`,
		)
		.join("");
	const cursorRows = data.cursors
		.map(
			(cursor) => `<tr>
				<td>${cursor.label}</td>
				<td>${formatTimestamp(cursor.time)}</td>
				<td>${formatLevel(cursor.reading.a)}</td>
				<td>${formatLevel(cursor.reading.b)}</td>
				<td>${formatSigned(cursor.reading.diff)}</td>
			</tr>`,
		)
		.join("");

	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>潮汐观测统计报告 · ${formatTimestamp(data.chart.from)}</title>
<style>
	@page { size: A4; margin: 16mm; }
	* { box-sizing: border-box; }
	body { margin: 0; color: #13252e; font: 13px/1.6 "Noto Sans SC", "Microsoft YaHei", sans-serif; background: #eef3f4; }
	main { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm; background: #fff; }
	header { border-bottom: 3px solid #0c8db8; padding-bottom: 14px; margin-bottom: 20px; }
	.kicker { color: #0c8db8; font: 700 10px/1.2 ui-monospace, monospace; letter-spacing: .12em; }
	h1 { margin: 7px 0 4px; font-size: 28px; letter-spacing: .02em; }
	.sub { color: #60747d; }
	.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin: 18px 0; }
	.metric { border: 1px solid #d8e2e5; background: #f7fafb; padding: 11px 12px; }
	.metric span { color: #71848c; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
	.metric strong { display: block; margin-top: 2px; font: 700 20px/1.35 ui-monospace, monospace; }
	section { margin-top: 20px; }
	h2 { margin: 0 0 8px; font-size: 14px; color: #244650; }
	table { width: 100%; border-collapse: collapse; font-size: 12px; }
	th { color: #71848c; font-weight: 500; text-align: left; border-bottom: 1px solid #cfdadd; padding: 6px 7px; }
	td { padding: 7px; border-bottom: 1px solid #e6edef; }
	.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; }
	.warn { color: #c44f34; font-weight: 700; }
	.note { margin-top: 20px; padding: 11px 13px; background: #f4f8f9; border-left: 3px solid #0c8db8; color: #526a73; }
	footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #d8e2e5; color: #82949b; font-size: 10px; display: flex; justify-content: space-between; }
	@media print { body { background: #fff; } main { width: auto; min-height: 0; padding: 0; } }
</style>
</head>
<body>
<main>
	<header>
		<div class="kicker">TIDAL OBSERVATION LAB / WINDOW REPORT</div>
		<h1>潮汐双站观测统计报告</h1>
		<div class="sub">${formatTimestamp(data.chart.from)} — ${formatTimestamp(data.chart.to)} · ${formatDuration(data.chart.from, data.chart.to)} · 正常范围 ${data.normalLow.toFixed(2)} 至 ${data.normalHigh.toFixed(2)} m</div>
	</header>
	<div class="grid">
		<div class="metric"><span>最高水位</span><strong>${formatLevel(total.max)}</strong></div>
		<div class="metric"><span>最低水位</span><strong>${formatLevel(total.min)}</strong></div>
		<div class="metric"><span>平均水位</span><strong>${formatLevel(total.mean)}</strong></div>
		<div class="metric"><span>异常观测</span><strong class="warn">${total.anomalies} 点</strong></div>
	</div>
	<section>
		<h2>站点统计</h2>
		<table><thead><tr><th>站点</th><th>最低</th><th>平均</th><th>最高</th><th>异常点</th><th>缺失</th></tr></thead><tbody>${stationRows}</tbody></table>
	</section>
	<section>
		<h2>游标对照</h2>
		<table><thead><tr><th>游标</th><th>时间</th><th>${escapeHtml(data.chart.stations[0] ?? "站点 A")}</th><th>${escapeHtml(data.chart.stations[1] ?? "站点 B")}</th><th>水位差</th></tr></thead><tbody>${cursorRows}</tbody></table>
	</section>
	<div class="note">数据清洗：共 ${data.cleaning.totalRows} 行，保留 ${data.cleaning.accepted} 条唯一观测；去重 ${data.cleaning.duplicateRows} 行，缺失水位 ${data.cleaning.missingRows} 行，无效水位 ${data.cleaning.invalidRows} 行，无效时间戳 ${data.cleaning.badTimestampRows} 行，空站点 ${data.cleaning.unknownStationRows} 行${data.cleaning.outOfOrder ? "，并已按时间升序重排" : ""}。缺测值不计入均值与异常统计。</div>
	<footer><span>导出时间 ${formatTimestamp(data.generatedAt.getTime())}</span><span>melonJS examples · 演示数据</span></footer>
</main>
</body>
</html>`;
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
