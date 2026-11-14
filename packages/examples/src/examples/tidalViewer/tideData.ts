/**
 * Tidal CSV parsing, validation, cleaning and window statistics.
 *
 * The parser is deliberately strict about timestamps: JavaScript's
 * Date.parse() accepts impossible dates such as 2026-02-30, which would
 * silently put a bad observation on a different day.
 */

export type IssueSeverity = "info" | "warning";

export type IssueType =
	| "bad-timestamp"
	| "bad-station"
	| "bad-level"
	| "missing-level"
	| "duplicate"
	| "reordered";

export interface TideIssue {
	line: number;
	type: IssueType;
	severity: IssueSeverity;
	message: string;
}

export interface CleaningStats {
	totalRows: number;
	accepted: number;
	duplicateRows: number;
	conflictingDuplicates: number;
	missingRows: number;
	invalidRows: number;
	badTimestampRows: number;
	unknownStationRows: number;
	outOfOrder: boolean;
}

export interface TideRecord {
	t: number;
	station: string;
	value: number | null;
	line: number;
}

export interface LoadResult {
	ok: boolean;
	error?: string;
	stations: string[];
	records: TideRecord[];
	issues: TideIssue[];
	stats: CleaningStats;
}

export interface TidePoint {
	t: number;
	value: number | null;
}

export interface WindowSummary {
	count: number;
	missing: number;
	min: number | null;
	max: number | null;
	mean: number | null;
	anomalies: number;
	anomalyPoints: TidePoint[];
}

export interface CursorReading {
	a: number | null;
	b: number | null;
	diff: number | null;
	timeA: number | null;
	timeB: number | null;
}

export interface AnomalySpan {
	from: number;
	to: number;
}

const MISSING_TOKENS = new Set([
	"",
	"na",
	"n/a",
	"null",
	"nil",
	"nan",
	"-",
	"--",
	"—",
	"none",
	"missing",
]);

const COLUMN_ALIASES: Record<"timestamp" | "station" | "level", Set<string>> = {
	timestamp: new Set([
		"timestamp",
		"time",
		"date",
		"datetime",
		"observation_time",
		"观测时间",
		"时间",
	]),
	station: new Set([
		"station",
		"station_id",
		"site",
		"site_id",
		"station_name",
		"站点",
		"站点名",
	]),
	level: new Set([
		"level",
		"water_level",
		"height",
		"waterlevel",
		"water_level_m",
		"水位",
		"水位(m)",
	]),
};

const emptyStats = (): CleaningStats => ({
	totalRows: 0,
	accepted: 0,
	duplicateRows: 0,
	conflictingDuplicates: 0,
	missingRows: 0,
	invalidRows: 0,
	badTimestampRows: 0,
	unknownStationRows: 0,
	outOfOrder: false,
});

const emptyResult = (error: string): LoadResult => ({
	ok: false,
	error,
	stations: [],
	records: [],
	issues: [],
	stats: emptyStats(),
});

const normaliseHeader = (value: string) =>
	value
		.replace(/^\uFEFF/, "")
		.trim()
		.replace(/^["']|["']$/g, "")
		.toLowerCase();

/**
 * A small RFC-4180-style parser that keeps the source line of every row.
 * Quoted fields may contain commas, escaped quotes and line endings.
 */
export function parseCsvRows(
	text: string,
): Array<{ cells: string[]; line: number }> {
	const rows: Array<{ cells: string[]; line: number }> = [];
	let field = "";
	let cells: string[] = [];
	let inQuotes = false;
	let line = 1;
	let rowLine = 1;

	const pushField = () => {
		cells.push(field);
		field = "";
	};
	const pushRow = () => {
		pushField();
		if (cells.some((cell) => cell.trim() !== "")) {
			rows.push({ cells, line: rowLine });
		}
		cells = [];
		rowLine = line;
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
				if (char === "\n") line++;
			}
		} else if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			pushField();
		} else if (char === "\n") {
			pushRow();
			line++;
			rowLine = line;
		} else if (char === "\r") {
			pushRow();
			if (text[i + 1] === "\n") i++;
			line++;
			rowLine = line;
		} else {
			field += char;
		}
	}
	if (field.length > 0 || cells.length > 0) pushRow();
	return rows;
}

export function resolveColumns(
	header: string[],
): { timestamp: number; station: number; level: number } | null {
	const indices = { timestamp: -1, station: -1, level: -1 };
	header.forEach((cell, index) => {
		const name = normaliseHeader(cell);
		for (const key of Object.keys(COLUMN_ALIASES) as Array<
			keyof typeof indices
		>) {
			if (COLUMN_ALIASES[key].has(name)) indices[key] = index;
		}
	});
	return indices.timestamp < 0 || indices.station < 0 || indices.level < 0
		? null
		: indices;
}

const validDateParts = (year: number, month: number, day: number) => {
	if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) {
		return false;
	}
	return day <= new Date(year, month, 0).getDate();
};

/**
 * Parse the two timestamp forms used by the demo:
 * ISO-8601 with an optional timezone, and "YYYY-MM-DD HH:mm[:ss]".
 */
export function parseTimestamp(raw: string): number | null {
	const value = raw.trim();
	const match = value.match(
		/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/,
	);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6] ?? 0);
	const millisecond = Number((match[7] ?? "").padEnd(3, "0") || 0);
	if (
		!validDateParts(year, month, day) ||
		hour > 23 ||
		minute > 59 ||
		second > 59
	) {
		return null;
	}

	const zone = match[8];
	if (zone) {
		let offsetMinutes = 0;
		if (zone !== "Z") {
			const sign = zone[0] === "-" ? -1 : 1;
			const digits = zone.slice(1).replace(":", "");
			const zoneHours = Number(digits.slice(0, 2));
			const zoneMinutes = Number(digits.slice(2, 4));
			if (zoneHours > 23 || zoneMinutes > 59) return null;
			offsetMinutes = sign * (zoneHours * 60 + zoneMinutes);
		}
		const ms =
			Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
			offsetMinutes * 60_000;
		const check = new Date(ms);
		return check.getUTCFullYear() === year &&
			check.getUTCMonth() === month - 1 &&
			check.getUTCDate() === day
			? ms
			: null;
	}

	const local = new Date(
		year,
		month - 1,
		day,
		hour,
		minute,
		second,
		millisecond,
	);
	return local.getFullYear() === year &&
		local.getMonth() === month - 1 &&
		local.getDate() === day
		? local.getTime()
		: null;
}

export function parseLevel(raw: string): {
	value: number | null;
	missing: boolean;
	invalid: boolean;
} {
	const value = raw.trim();
	if (MISSING_TOKENS.has(value.toLowerCase())) {
		return { value: null, missing: true, invalid: false };
	}
	const number = Number(value);
	return Number.isFinite(number)
		? { value: number, missing: false, invalid: false }
		: { value: null, missing: false, invalid: true };
}

/**
 * Validate and clean a CSV document. Invalid timestamps, empty station names
 * and non-numeric levels are rejected. Missing-level rows are kept as gaps.
 * Repeated station/timestamp pairs are removed, keeping the first reading.
 */
export function loadTidalCsv(text: string): LoadResult {
	const rows = parseCsvRows(text);
	if (rows.length < 2) {
		return emptyResult("CSV 为空或缺少数据行（需要表头 + 至少一行观测记录）。");
	}

	const columns = resolveColumns(rows[0].cells);
	if (!columns) {
		return emptyResult(
			"表头缺少必需列：需要 timestamp、station、level（或其常见别名）。",
		);
	}

	const stats = emptyStats();
	stats.totalRows = rows.length - 1;
	const issues: TideIssue[] = [];
	const knownStations = new Set<string>();
	const deduped = new Map<string, TideRecord>();
	let previousTime: number | null = null;

	for (const row of rows.slice(1)) {
		const cells = row.cells;
		const timeRaw = cells[columns.timestamp] ?? "";
		const stationRaw = (cells[columns.station] ?? "").trim();
		const levelRaw = cells[columns.level] ?? "";

		const time = parseTimestamp(timeRaw);
		if (time === null) {
			stats.badTimestampRows++;
			issues.push({
				line: row.line,
				type: "bad-timestamp",
				severity: "warning",
				message: `第 ${row.line} 行时间戳无效「${timeRaw || "(空)"}」，已丢弃。`,
			});
			continue;
		}

		const station = stationRaw.replace(/\s+/g, " ");
		if (!station) {
			stats.unknownStationRows++;
			issues.push({
				line: row.line,
				type: "bad-station",
				severity: "warning",
				message: `第 ${row.line} 行站点名为空，已丢弃。`,
			});
			continue;
		}

		const level = parseLevel(levelRaw);
		if (level.invalid) {
			stats.invalidRows++;
			issues.push({
				line: row.line,
				type: "bad-level",
				severity: "warning",
				message: `第 ${row.line} 行水位「${levelRaw.trim()}」不是有效数字，已丢弃。`,
			});
			continue;
		}

		knownStations.add(station);
		if (previousTime !== null && time < previousTime) stats.outOfOrder = true;
		previousTime = time;

		const key = `${station}\u0000${time}`;
		const previous = deduped.get(key);
		if (previous) {
			stats.duplicateRows++;
			if (
				previous.value !== null &&
				level.value !== null &&
				Math.abs(previous.value - level.value) > Number.EPSILON
			) {
				stats.conflictingDuplicates++;
			}
			issues.push({
				line: row.line,
				type: "duplicate",
				severity: "info",
				message: `第 ${row.line} 行与第 ${previous.line} 行重复（${station} · ${formatTimestamp(time)}），已保留首条记录。`,
			});
			if (previous.value === null && level.value !== null) {
				deduped.set(key, {
					t: time,
					station,
					value: level.value,
					line: previous.line,
				});
			}
			continue;
		}

		const record: TideRecord = {
			t: time,
			station,
			value: level.value,
			line: row.line,
		};
		deduped.set(key, record);
		if (level.missing) {
			stats.missingRows++;
			issues.push({
				line: row.line,
				type: "missing-level",
				severity: "info",
				message: `第 ${row.line} 行 ${station} 水位缺失，保留时间点并在曲线上留空。`,
			});
		}
	}

	const records = [...deduped.values()].sort(
		(a, b) => a.t - b.t || a.station.localeCompare(b.station, "zh-CN"),
	);
	stats.accepted = records.length;
	if (stats.outOfOrder) {
		issues.unshift({
			line: 0,
			type: "reordered",
			severity: "info",
			message: "检测到乱序时间戳，已按时间升序重新排列全部记录。",
		});
	}

	return {
		ok: records.length > 0,
		error: records.length === 0 ? "清洗后没有可用的观测记录。" : undefined,
		stations: [...knownStations],
		records,
		issues,
		stats,
	};
}

/** Split cleaned records into per-station series, each sorted by time. */
export function groupByStation(
	records: TideRecord[],
	stations: string[],
): Record<string, TidePoint[]> {
	const grouped: Record<string, TidePoint[]> = {};
	for (const station of stations) grouped[station] = [];
	for (const record of records) {
		grouped[record.station] ??= [];
		grouped[record.station].push({ t: record.t, value: record.value });
	}
	for (const station of Object.keys(grouped)) {
		grouped[station].sort((a, b) => a.t - b.t);
	}
	return grouped;
}

/**
 * Statistics for one station in the inclusive time window. Missing readings
 * count toward `missing`, never toward anomalies or the mean.
 */
export function summariseWindow(
	series: TidePoint[],
	from: number,
	to: number,
	normalLow: number,
	normalHigh: number,
): WindowSummary {
	let count = 0;
	let missing = 0;
	let sum = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let anomalies = 0;
	const anomalyPoints: TidePoint[] = [];

	for (const point of series) {
		if (point.t < from || point.t > to) continue;
		if (point.value === null) {
			missing++;
			continue;
		}
		count++;
		sum += point.value;
		min = Math.min(min, point.value);
		max = Math.max(max, point.value);
		if (point.value < normalLow || point.value > normalHigh) {
			anomalies++;
			anomalyPoints.push(point);
		}
	}

	return {
		count,
		missing,
		min: count === 0 ? null : min,
		max: count === 0 ? null : max,
		mean: count === 0 ? null : sum / count,
		anomalies,
		anomalyPoints,
	};
}

/** Find the reading at or immediately before a time. */
export function readingAt(
	series: TidePoint[],
	time: number,
): { t: number; value: number | null } | null {
	let lo = 0;
	let hi = series.length - 1;
	let found: TidePoint | null = null;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (series[mid].t <= time) {
			found = series[mid];
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

/** Both stations' values and their difference at one cursor time. */
export function differenceAt(
	seriesA: TidePoint[],
	seriesB: TidePoint[],
	time: number,
): CursorReading {
	const pointA = readingAt(seriesA, time);
	const pointB = readingAt(seriesB, time);
	const a = pointA?.value ?? null;
	const b = pointB?.value ?? null;
	return {
		a,
		b,
		diff: a !== null && b !== null ? a - b : null,
		timeA: pointA?.t ?? null,
		timeB: pointB?.t ?? null,
	};
}

/** Consecutive out-of-normal readings, used to shade the chart. */
export function anomalySpans(
	series: TidePoint[],
	normalLow: number,
	normalHigh: number,
): AnomalySpan[] {
	const spans: AnomalySpan[] = [];
	let current: AnomalySpan | null = null;
	for (const point of series) {
		const outside =
			point.value !== null &&
			(point.value < normalLow || point.value > normalHigh);
		if (outside) {
			if (current === null) current = { from: point.t, to: point.t };
			else current.to = point.t;
		} else if (current !== null) {
			spans.push(current);
			current = null;
		}
	}
	if (current !== null) spans.push(current);
	return spans;
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

const shortFormatter = new Intl.DateTimeFormat("zh-CN", {
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
	month: "2-digit",
	day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

export const formatTimestamp = (time: number) => dateFormatter.format(time);
export const formatShortTimestamp = (time: number) =>
	shortFormatter.format(time);
export const formatDay = (time: number) => dayFormatter.format(time);
export const formatTime = (time: number) => timeFormatter.format(time);

export const formatLevel = (value: number | null, digits = 2) =>
	value === null || !Number.isFinite(value)
		? "缺失"
		: `${value.toFixed(digits)} m`;

export const formatSigned = (value: number | null, digits = 2) =>
	value === null || !Number.isFinite(value)
		? "缺失"
		: `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)} m`;

export const formatDuration = (from: number, to: number) => {
	const hours = Math.max(0, Math.round((to - from) / 3_600_000));
	if (hours < 24) return `${hours} 小时`;
	const days = Math.floor(hours / 24);
	const rest = hours % 24;
	return rest === 0 ? `${days} 天` : `${days} 天 ${rest} 小时`;
};
