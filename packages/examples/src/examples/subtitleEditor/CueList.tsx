/**
 * melonJS — subtitle editor: the cue table.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { type ChangeEvent, type KeyboardEvent, useMemo } from "react";
import { type Cue, formatClock, sortedCues, TIME_STEP } from "./cues";

interface CueListProps {
	cues: Cue[];
	overlaps: Set<string>;
	activeId: string | null;
	onSelect: (id: string) => void;
	onText: (id: string, text: string) => void;
	onNudge: (id: string, edge: "start" | "end", steps: number) => void;
	onDelete: (id: string) => void;
}

/** number input bound to seconds, with millisecond precision on blur */
const TimeField = ({
	label,
	value,
	onCommit,
}: {
	label: string;
	value: number;
	onCommit: (seconds: number) => void;
}) => {
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		const next = Number(event.target.value);
		if (Number.isFinite(next) && next >= 0) {
			onCommit(next);
		}
	};
	return (
		<label className="se-time-field">
			<span>{label}</span>
			<input
				type="number"
				step={TIME_STEP}
				min={0}
				value={value.toFixed(2)}
				onChange={handleChange}
			/>
		</label>
	);
};

export const CueList = ({
	cues,
	overlaps,
	activeId,
	onSelect,
	onText,
	onNudge,
	onDelete,
}: CueListProps) => {
	const ordered = useMemo(() => sortedCues(cues), [cues]);

	const handleKeyDown = (
		event: KeyboardEvent<HTMLTextAreaElement>,
		cue: Cue,
	) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			onText(cue.id, `${cue.text}\n`);
		}
	};

	return (
		<div className="se-cue-list">
			{ordered.length === 0 && (
				<p className="se-empty">No cues yet — add one to get started.</p>
			)}
			{ordered.map((cue, index) => (
				<div
					className={`se-cue-row${cue.id === activeId ? " se-cue-active" : ""}${
						overlaps.has(cue.id) ? " se-cue-row-overlap" : ""
					}`}
					key={cue.id}
				>
					<header>
						<button
							type="button"
							className="se-cue-index"
							onClick={() => onSelect(cue.id)}
						>
							#{index + 1}
						</button>
						<span className="se-cue-clock">
							{formatClock(cue.start)} → {formatClock(cue.end)}
						</span>
						<button
							type="button"
							className="se-delete"
							onClick={() => onDelete(cue.id)}
						>
							Delete
						</button>
					</header>
					<textarea
						rows={2}
						value={cue.text}
						onChange={(event) => onText(cue.id, event.target.value)}
						onKeyDown={(event) => handleKeyDown(event, cue)}
					/>
					<div className="se-cue-times">
						<TimeField
							label="In"
							value={cue.start}
							onCommit={(seconds) =>
								onNudge(
									cue.id,
									"start",
									Math.round((seconds - cue.start) / TIME_STEP),
								)
							}
						/>
						<TimeField
							label="Out"
							value={cue.end}
							onCommit={(seconds) =>
								onNudge(
									cue.id,
									"end",
									Math.round((seconds - cue.end) / TIME_STEP),
								)
							}
						/>
					</div>
					<div className="se-nudge-row">
						{(["start", "end"] as const).map((edge) => (
							<div className="se-nudge-group" key={edge}>
								<span>{edge === "start" ? "In point" : "Out point"}</span>
								<button type="button" onClick={() => onNudge(cue.id, edge, -1)}>
									−1f
								</button>
								<button type="button" onClick={() => onNudge(cue.id, edge, 1)}>
									+1f
								</button>
							</div>
						))}
					</div>
					{overlaps.has(cue.id) && (
						<p className="se-overlap-warning">
							Overlaps another cue — fix before saving.
						</p>
					)}
				</div>
			))}
		</div>
	);
};
