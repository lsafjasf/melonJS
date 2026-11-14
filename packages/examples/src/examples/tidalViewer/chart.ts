/**
 * Canvas drawing for the tidal chart. The on-screen chart and the PNG
 * export share this renderer so the exported image is the same view.
 */
import {
	anomalySpans,
	formatDay,
	formatTime,
	type TidePoint,
} from "./tideData";

export const STATION_COLORS = ["#57d8ff", "#ffb75e", "#8be28b", "#f08cff"];

export interface PlotArea {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ChartInput {
	series: Record<string, TidePoint[]>;
	stations: string[];
	from: number;
	to: number;
	cursors: [number, number];
	normalLow: number;
	normalHigh: number;
	stationColors?: Record<string, string>;
	showMissing?: boolean;
	showCursorLabels?: boolean;
}

export interface ChartLayout {
	plot: PlotArea;
	xForTime: (time: number) => number;
	timeForX: (x: number) => number;
}

interface Range {
	min: number;
	max: number;
}

const BLACK = "#06151e";
const GRID = "rgba(161, 196, 211, 0.14)";
const MUTED = "#7f9eac";
const TEXT = "#d9e9ef";

const niceStep = (span: number, targetTicks: number) => {
	const rough = span / Math.max(1, targetTicks);
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	const normalised = rough / magnitude;
	const nice =
		normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
	return nice * magnitude;
};

export const extent = (values: number[]): Range => {
	if (values.length === 0) return { min: -1, max: 1 };
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const value of values) {
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	if (min === max) {
		min -= 1;
		max += 1;
	}
	return { min, max };
};

const paddedDomain = (
	values: number[],
	normalLow: number,
	normalHigh: number,
) => {
	const raw = extent([
		...values,
		Math.min(normalLow, normalHigh),
		Math.max(normalLow, normalHigh),
	]);
	const padding = Math.max(0.25, (raw.max - raw.min) * 0.13);
	const min = raw.min - padding;
	const max = raw.max + padding;
	const step = niceStep(max - min, 5);
	return {
		min: Math.floor(min / step) * step,
		max: Math.ceil(max / step) * step,
		step,
	};
};

const visiblePoints = (series: TidePoint[], from: number, to: number) => {
	const points: TidePoint[] = [];
	for (let index = 0; index < series.length; index++) {
		const point = series[index];
		if (point.t >= from && point.t <= to) points.push(point);
		else if (point.t < from) {
			const next = series[index + 1];
			if (next && next.t > from) points.push(point);
		} else if (point.t > to) {
			const previous = series[index - 1];
			if (previous && previous.t < to) points.push(point);
			break;
		}
	}
	return points;
};

const linePath = (
	ctx: CanvasRenderingContext2D,
	points: TidePoint[],
	xForTime: (time: number) => number,
	yForValue: (value: number) => number,
) => {
	let started = false;
	for (const point of points) {
		if (point.value === null) {
			started = false;
			continue;
		}
		const x = xForTime(point.t);
		const y = yForValue(point.value);
		if (started) ctx.lineTo(x, y);
		else {
			ctx.moveTo(x, y);
			started = true;
		}
	}
};

const drawEmpty = (
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	message: string,
) => {
	ctx.fillStyle = BLACK;
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = MUTED;
	ctx.font = '13px "Tidal Sans", "Noto Sans SC", sans-serif';
	ctx.textAlign = "center";
	ctx.fillText(message, width / 2, height / 2);
	ctx.textAlign = "left";
};

/** Draw the chart into a canvas context and return its coordinate mapping. */
export function drawTideChart(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	input: ChartInput,
): ChartLayout {
	const stations = input.stations.filter((station) => input.series[station]);
	if (stations.length === 0) {
		drawEmpty(ctx, width, height, "没有启用的站点曲线");
		return {
			plot: { x: 0, y: 0, width, height },
			xForTime: () => 0,
			timeForX: () => input.from,
		};
	}

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = BLACK;
	ctx.fillRect(0, 0, width, height);

	const compact = width < 620;
	const plot: PlotArea = {
		x: compact ? 46 : 58,
		y: 28,
		width: Math.max(40, width - (compact ? 58 : 76)),
		height: Math.max(40, height - 70),
	};
	const from = Math.min(input.from, input.to);
	const to = Math.max(input.from, input.to);
	const span = Math.max(1, to - from);
	const xForTime = (time: number) =>
		plot.x + ((time - from) / span) * plot.width;
	const timeForX = (x: number) =>
		from + Math.max(0, Math.min(1, (x - plot.x) / plot.width)) * span;

	const values: number[] = [];
	for (const station of stations) {
		for (const point of input.series[station]) {
			if (point.t >= from && point.t <= to && point.value !== null) {
				values.push(point.value);
			}
		}
	}
	const domain = paddedDomain(values, input.normalLow, input.normalHigh);
	const yForValue = (value: number) =>
		plot.y + ((domain.max - value) / (domain.max - domain.min)) * plot.height;

	ctx.save();
	ctx.beginPath();
	ctx.rect(plot.x, plot.y, plot.width, plot.height);
	ctx.clip();

	const bandTop = yForValue(Math.min(input.normalHigh, input.normalLow));
	const bandBottom = yForValue(Math.max(input.normalHigh, input.normalLow));
	const band = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
	band.addColorStop(0, "rgba(98, 226, 177, 0.10)");
	band.addColorStop(1, "rgba(98, 226, 177, 0.025)");
	ctx.fillStyle = band;
	ctx.fillRect(plot.x, bandTop, plot.width, Math.max(1, bandBottom - bandTop));

	const sampleGaps = stations.flatMap((station) => {
		const points = input.series[station];
		return points.slice(1).map((point, index) => point.t - points[index].t);
	});
	const averageInterval =
		sampleGaps.length > 0
			? sampleGaps.reduce((sum, gap) => sum + gap, 0) / sampleGaps.length
			: 3_600_000;
	const halfInterval = Math.min(span / 4, averageInterval / 2);
	const spans = stations
		.flatMap((station) =>
			anomalySpans(input.series[station], input.normalLow, input.normalHigh),
		)
		.map((item) => ({
			from: Math.max(from, item.from - halfInterval),
			to: Math.min(to, item.to + halfInterval),
		}))
		.sort((a, b) => a.from - b.from);

	ctx.fillStyle = "rgba(255, 124, 95, 0.105)";
	for (const item of spans) {
		const left = xForTime(item.from);
		const right = xForTime(item.to);
		ctx.fillRect(left, plot.y, Math.max(2, right - left), plot.height);
		ctx.fillStyle = "rgba(255, 124, 95, 0.60)";
		ctx.fillRect(left, plot.y, Math.max(1, right - left), 2);
		ctx.fillStyle = "rgba(255, 124, 95, 0.105)";
	}

	const colors =
		input.stationColors ??
		Object.fromEntries(
			input.stations.map((station, index) => [
				station,
				STATION_COLORS[index % STATION_COLORS.length],
			]),
		);

	stations.forEach((station, stationIndex) => {
		const points = visiblePoints(input.series[station], from, to);
		const color = colors[station] ?? STATION_COLORS[stationIndex];

		ctx.save();
		ctx.beginPath();
		linePath(ctx, points, xForTime, yForValue);
		ctx.strokeStyle = color;
		ctx.lineWidth = width > 900 ? 2.4 : 2;
		ctx.globalAlpha = 0.22;
		ctx.lineWidth = 9;
		ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.lineWidth = 2.2;
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		ctx.stroke();
		ctx.restore();

		for (const point of points) {
			if (point.value === null) {
				if (input.showMissing !== false) {
					ctx.strokeStyle = "rgba(196, 220, 229, 0.38)";
					ctx.lineWidth = 1;
					const x = xForTime(point.t);
					ctx.beginPath();
					ctx.moveTo(x - 3, plot.y + plot.height - 5);
					ctx.lineTo(x + 3, plot.y + plot.height - 11);
					ctx.moveTo(x + 3, plot.y + plot.height - 5);
					ctx.lineTo(x - 3, plot.y + plot.height - 11);
					ctx.stroke();
				}
				continue;
			}
			if (point.value < input.normalLow || point.value > input.normalHigh) {
				ctx.beginPath();
				ctx.arc(xForTime(point.t), yForValue(point.value), 3.4, 0, Math.PI * 2);
				ctx.fillStyle = BLACK;
				ctx.fill();
				ctx.lineWidth = 1.8;
				ctx.strokeStyle = color;
				ctx.stroke();
			}
		}
	});

	ctx.restore();

	ctx.save();
	ctx.strokeStyle = GRID;
	ctx.lineWidth = 1;
	ctx.fillStyle = MUTED;
	ctx.font = '10px "IBM Plex Mono", "Tidal Sans", monospace';
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	const tickCount = Math.round((domain.max - domain.min) / domain.step);
	for (let index = 0; index <= tickCount; index++) {
		const value = domain.min + index * domain.step;
		const y = yForValue(value);
		ctx.beginPath();
		ctx.moveTo(plot.x, y);
		ctx.lineTo(plot.x + plot.width, y);
		ctx.stroke();
		ctx.fillText(`${value.toFixed(domain.step < 1 ? 1 : 0)}`, plot.x - 9, y);
	}
	ctx.textAlign = "left";
	ctx.fillText("m", 8, plot.y + 5);

	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	const xTicks = compact ? 3 : 5;
	for (let index = 0; index <= xTicks; index++) {
		const time = from + (span * index) / xTicks;
		const x = xForTime(time);
		ctx.beginPath();
		ctx.moveTo(x, plot.y);
		ctx.lineTo(x, plot.y + plot.height);
		ctx.strokeStyle = "rgba(161, 196, 211, 0.075)";
		ctx.stroke();
		const measured = ctx.measureText(formatDay(time)).width;
		ctx.fillStyle = MUTED;
		ctx.fillText(
			formatDay(time),
			Math.max(
				plot.x + measured / 2,
				Math.min(plot.x + plot.width - measured / 2, x),
			),
			plot.y + plot.height + 9,
		);
		if (!compact || index === 0 || index === xTicks) {
			ctx.fillStyle = "rgba(127, 158, 172, 0.72)";
			ctx.fillText(
				formatTime(time),
				Math.max(
					plot.x + measured / 2,
					Math.min(plot.x + plot.width - measured / 2, x),
				),
				plot.y + plot.height + 22,
			);
		}
	}
	ctx.restore();

	drawCursors(
		ctx,
		plot,
		input,
		xForTime,
		colors,
		stations,
		input.showCursorLabels !== false,
	);
	return { plot, xForTime, timeForX };
}

const drawCursors = (
	ctx: CanvasRenderingContext2D,
	plot: PlotArea,
	input: ChartInput,
	xForTime: (time: number) => number,
	colors: Record<string, string>,
	stations: string[],
	showLabels: boolean,
) => {
	const cursors: Array<{ time: number; color: string; label: string }> = [
		{ time: input.cursors[0], color: "#f0f6f8", label: "A" },
		{ time: input.cursors[1], color: "#c9a7ff", label: "B" },
	];
	for (const cursor of cursors) {
		if (cursor.time < input.from || cursor.time > input.to) continue;
		const x = xForTime(cursor.time);
		ctx.save();
		ctx.beginPath();
		ctx.setLineDash([5, 5]);
		ctx.strokeStyle = cursor.color;
		ctx.globalAlpha = 0.84;
		ctx.lineWidth = 1.2;
		ctx.moveTo(x, plot.y);
		ctx.lineTo(x, plot.y + plot.height);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.globalAlpha = 1;

		ctx.beginPath();
		ctx.arc(x, plot.y, 4, 0, Math.PI * 2);
		ctx.fillStyle = cursor.color;
		ctx.fill();

		if (showLabels) {
			const caption = `${cursor.label}  ${formatTime(cursor.time)}`;
			ctx.font = '600 10px "IBM Plex Mono", "Tidal Sans", monospace';
			const width = ctx.measureText(caption).width + 12;
			const left = Math.max(
				plot.x + 1,
				Math.min(plot.x + plot.width - width - 1, x - width / 2),
			);
			ctx.fillStyle = "rgba(8, 25, 34, 0.92)";
			ctx.strokeStyle = cursor.color;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.roundRect(left, plot.y + 6, width, 19, 4);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = cursor.color;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(caption, left + width / 2, plot.y + 15.5);
		}
		ctx.restore();
	}

	if (stations.length > 1) {
		ctx.save();
		ctx.font = '9px "IBM Plex Mono", "Tidal Sans", monospace';
		ctx.textAlign = "right";
		ctx.textBaseline = "bottom";
		let y = plot.y + plot.height - 6;
		for (let index = stations.length - 1; index >= 0; index--) {
			const station = stations[index];
			ctx.fillStyle = colors[station] ?? STATION_COLORS[index];
			ctx.beginPath();
			ctx.arc(plot.x + plot.width - 8, y - 3, 2.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "rgba(217, 233, 239, 0.74)";
			ctx.fillText(station, plot.x + plot.width - 14, y);
			y -= 14;
		}
		ctx.restore();
	}

	ctx.fillStyle = TEXT;
};
