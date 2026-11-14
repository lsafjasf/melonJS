import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	anomalySpans,
	differenceAt,
	groupByStation,
	loadTidalCsv,
	parseTimestamp,
	summariseWindow,
} from "../src/examples/tidalViewer/tideData.ts";

const demoCsv = readFileSync(
	new URL("../public/assets/tidalViewer/demo-tidal.csv", import.meta.url),
	"utf8",
);

test("demo CSV is validated, deduplicated and time-sorted", () => {
	const result = loadTidalCsv(demoCsv);
	assert.equal(result.ok, true);
	assert.deepEqual(result.stations, ["吴淞口", "芦潮港"]);
	assert.equal(result.stats.totalRows, 148);
	assert.equal(result.stats.accepted, 142);
	assert.equal(result.stats.duplicateRows, 2);
	assert.equal(result.stats.conflictingDuplicates, 1);
	assert.equal(result.stats.missingRows, 4);
	assert.equal(result.stats.invalidRows, 2);
	assert.equal(result.stats.badTimestampRows, 1);
	assert.equal(result.stats.unknownStationRows, 1);
	assert.equal(result.stats.outOfOrder, true);

	for (let index = 1; index < result.records.length; index++) {
		assert.ok(result.records[index - 1].t <= result.records[index].t);
	}
	assert.equal(
		result.records.filter((row) => row.station === "吴淞口").length,
		71,
	);
	assert.equal(
		result.records.filter((row) => row.station === "芦潮港").length,
		71,
	);
	assert.equal(result.records.filter((row) => row.value === null).length, 4);

	const conflicting = result.records.find(
		(row) =>
			row.station === "吴淞口" && row.t === parseTimestamp("2026-11-02 09:00"),
	);
	assert.ok(conflicting);
	assert.notEqual(conflicting.value, 8.88);

	const issueTypes = new Set(result.issues.map((issue) => issue.type));
	assert.ok(issueTypes.has("reordered"));
	assert.ok(issueTypes.has("duplicate"));
	assert.ok(issueTypes.has("missing-level"));
	assert.ok(issueTypes.has("bad-timestamp"));
	assert.ok(issueTypes.has("bad-station"));
	assert.ok(issueTypes.has("bad-level"));
});

test("timestamps are strict and timezone offsets are honoured", () => {
	assert.equal(parseTimestamp("2026-02-30 10:00"), null);
	assert.equal(parseTimestamp("2026-13-01 10:00"), null);
	assert.equal(parseTimestamp("2026-11-01 24:00"), null);
	assert.equal(parseTimestamp("not a date"), null);
	assert.equal(
		parseTimestamp("2026-11-01T08:00:00+08:00"),
		Date.UTC(2026, 10, 1, 0, 0, 0),
	);
});

test("duplicate readings keep the first valid value", () => {
	const result = loadTidalCsv(`timestamp,station,level
2026-11-01 00:00,甲站,NA
2026-11-01 00:00,甲站,1.25
2026-11-01 00:00,甲站,9.99
2026-11-01 01:00,甲站,1.5
`);
	assert.equal(result.stats.accepted, 2);
	assert.equal(result.stats.duplicateRows, 2);
	assert.equal(result.stats.conflictingDuplicates, 1);
	assert.equal(result.records[0].value, 1.25);
});

test("window statistics exclude missing values and count anomalies", () => {
	const result = loadTidalCsv(demoCsv);
	const series = groupByStation(result.records, result.stations);
	const from = parseTimestamp("2026-11-02 16:00");
	const to = parseTimestamp("2026-11-02 19:00");
	assert.ok(from !== null && to !== null);
	const summary = summariseWindow(series["吴淞口"], from, to, -2.5, 2.5);
	assert.equal(summary.count, 4);
	assert.equal(summary.missing, 0);
	assert.equal(summary.anomalies, 4);
	assert.ok(Math.abs((summary.min ?? 0) - 2.95) < 1e-9);
	assert.ok(Math.abs((summary.max ?? 0) - 3.19) < 1e-9);

	const combined = [
		summariseWindow(series["吴淞口"], from, to, -2.5, 2.5),
		summariseWindow(series["芦潮港"], from, to, -2.5, 2.5),
	];
	assert.equal(
		combined.reduce((total, item) => total + item.anomalies, 0),
		7,
	);
	assert.equal(Math.max(...combined.map((item) => item.max ?? 0)), 3.25);

	const first = differenceAt(series["吴淞口"], series["芦潮港"], from);
	assert.equal(
		first.diff,
		first.a !== null && first.b !== null ? first.a - first.b : null,
	);
	assert.equal(anomalySpans(series["吴淞口"], -2.5, 2.5).length, 2);
});
