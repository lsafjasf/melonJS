export const TRACK_DURATION_MS = 30_000;
export const GRID_MS = 100;

export type Cue = {
	id: string;
	start: number;
	end: number;
	text: string;
};

export type ParsedWebVTT = {
	cues: Cue[];
	warnings: string[];
};

export type TimeRange = {
	start: number;
	end: number;
};

export type ConflictMap = Map<string, TimeRange[]>;

const pad = (value: number, width = 2) => {
	return Math.floor(value).toString().padStart(width, "0");
};

export const formatTimestamp = (ms: number) => {
	const total = Math.max(0, Math.round(ms));
	const hours = Math.floor(total / 3_600_000);
	const minutes = Math.floor((total % 3_600_000) / 60_000);
	const seconds = Math.floor((total % 60_000) / 1_000);
	const millis = total % 1_000;
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
};

export const formatClock = (ms: number) => {
	const total = Math.max(0, Math.round(ms / GRID_MS) * GRID_MS);
	const minutes = Math.floor(total / 60_000);
	const seconds = Math.floor((total % 60_000) / 1_000);
	const tenths = Math.floor((total % 1_000) / 100);
	return `${pad(minutes)}:${pad(seconds)}.${tenths}`;
};

export const parseTimestamp = (source: string): number | null => {
	const value = source.trim().replace(",", ".");
	const parts = value.split(":");
	if (parts.length < 2 || parts.length > 3) {
		return null;
	}
	const secondsPart = parts.pop() ?? "";
	const secondsMatch = secondsPart.match(/^(\d{1,2})(?:\.(\d{1,3}))?$/);
	if (!secondsMatch) {
		return null;
	}
	const wholeSeconds = Number(secondsMatch[1]);
	const fraction = Number((secondsMatch[2] ?? "").padEnd(3, "0") || "0");
	if (wholeSeconds > 59) {
		return null;
	}
	const minutes = Number(parts.pop() ?? "0");
	const hours = parts.length === 1 ? Number(parts[0]) : 0;
	if (!Number.isFinite(minutes) || !Number.isFinite(hours) || minutes > 59) {
		return null;
	}
	return Math.round(
		(hours * 3_600 + minutes * 60 + wholeSeconds) * 1_000 + fraction,
	);
};

export const exportWebVTT = (cues: Cue[]) => {
	if (cues.length === 0) {
		return "WEBVTT\n";
	}
	const body = cues
		.map((cue, index) => {
			return [
				String(index + 1),
				`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`,
				cue.text,
			].join("\n");
		})
		.join("\n\n");
	return `WEBVTT\n\n${body}\n`;
};

export const parseWebVTT = (
	source: string,
	durationMs = TRACK_DURATION_MS,
): ParsedWebVTT => {
	const warnings: string[] = [];
	const cues: Cue[] = [];
	const normalized = source
		.replace(/^\uFEFF/, "")
		.replace(/\r\n?/g, "\n")
		.replace(/\n{3,}/g, "\n\n");
	const blocks = normalized.split(/\n{2,}/);

	for (const block of blocks) {
		const lines = block.split("\n");
		const arrowIndex = lines.findIndex((line) => {
			return line.includes("-->");
		});
		if (arrowIndex < 0) {
			continue;
		}
		if (/^NOTE(?:\s|$)/i.test(lines[0] ?? "")) {
			continue;
		}

		const timing = lines[arrowIndex] ?? "";
		const [startSource, endSourceRaw] = timing.split("-->");
		if (startSource === undefined || endSourceRaw === undefined) {
			warnings.push(`第 ${cues.length + 1} 段缺少有效时间行，已跳过。`);
			continue;
		}
		const start = parseTimestamp(startSource);
		const end = parseTimestamp(endSourceRaw.trim().split(/\s+/)[0] ?? "");
		if (start === null || end === null) {
			warnings.push(`第 ${cues.length + 1} 段时间格式无效，已跳过。`);
			continue;
		}

		let safeStart = Math.min(Math.max(start, 0), durationMs);
		let safeEnd = Math.min(Math.max(end, 0), durationMs);
		if (safeStart >= durationMs) {
			safeStart = Math.max(0, durationMs - GRID_MS);
			warnings.push(
				`第 ${cues.length + 1} 段起点超出时长，已移到 ${formatClock(safeStart)}。`,
			);
		}
		if (safeEnd <= safeStart) {
			safeEnd = Math.min(durationMs, safeStart + GRID_MS);
			warnings.push(
				`第 ${cues.length + 1} 段时间被边界修正为 ${formatClock(safeStart)} → ${formatClock(safeEnd)}。`,
			);
		}

		const text = lines
			.slice(arrowIndex + 1)
			.join("\n")
			.replace(/^\n+|\n+$/g, "");
		if (text.length === 0) {
			warnings.push(`第 ${cues.length + 1} 段没有文本，已保留为空字幕。`);
		}
		cues.push({
			id: `cue-${cues.length + 1}`,
			start: safeStart,
			end: safeEnd,
			text,
		});
	}

	return { cues, warnings };
};
