/**
 * melonJS — procedural intro composer: keyframe timeline.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type {
	CSSProperties,
	ReactElement,
	PointerEvent as ReactPointerEvent,
} from "react";
import {
	DURATION,
	type KeyLocation,
	keyCount,
	type LayerId,
	type Project,
	snapTime,
	type TrackId,
} from "./model";
import { formatClock, percentOf, TRACKS } from "./tracks";

interface TimelineProps {
	project: Project;
	time: number;
	selectedLayer: LayerId;
	expanded: Set<LayerId>;
	selectedKey: KeyLocation | null;
	onSeek: (time: number) => void;
	onSelectLayer: (id: LayerId) => void;
	onToggleLayer: (id: LayerId) => void;
	onSelectKey: (location: KeyLocation) => void;
	onMoveKey: (location: KeyLocation, time: number) => void;
	onAddKey: (layer: LayerId, track: TrackId, time: number) => void;
}

const timeFromPointer = (clientX: number, element: HTMLElement): number => {
	const rect = element.getBoundingClientRect();
	return snapTime(((clientX - rect.left) / rect.width) * DURATION);
};

const startScrub = (
	event: ReactPointerEvent<HTMLElement>,
	onSeek: (time: number) => void,
) => {
	const element = event.currentTarget;
	startScrubOn(event.clientX, element, onSeek);
};

const startScrubOn = (
	clientX: number,
	element: HTMLElement,
	onSeek: (time: number) => void,
) => {
	onSeek(timeFromPointer(clientX, element));
	const move = (moveEvent: PointerEvent) => {
		onSeek(timeFromPointer(moveEvent.clientX, element));
	};
	const up = () => {
		window.removeEventListener("pointermove", move);
		window.removeEventListener("pointerup", up);
	};
	window.addEventListener("pointermove", move);
	window.addEventListener("pointerup", up, { once: true });
};

const startKeyDrag = (
	event: ReactPointerEvent<HTMLButtonElement>,
	location: KeyLocation,
	onSelectKey: (location: KeyLocation) => void,
	onMoveKey: (location: KeyLocation, time: number) => void,
) => {
	event.stopPropagation();
	onSelectKey(location);
	const lane = event.currentTarget.closest<HTMLElement>(".ic-tl-lane");
	if (!lane) {
		return;
	}
	const move = (moveEvent: PointerEvent) => {
		onMoveKey(location, timeFromPointer(moveEvent.clientX, lane));
	};
	const up = () => {
		window.removeEventListener("pointermove", move);
		window.removeEventListener("pointerup", up);
	};
	window.addEventListener("pointermove", move);
	window.addEventListener("pointerup", up, { once: true });
};

const Ruler = ({
	time,
	onSeek,
}: {
	time: number;
	onSeek: (time: number) => void;
}) => (
	<div
		className="ic-ruler"
		role="slider"
		tabIndex={0}
		aria-label="Timeline playhead"
		aria-valuemin={0}
		aria-valuemax={DURATION}
		aria-valuenow={time}
		onPointerDown={(event) => {
			startScrub(event, onSeek);
		}}
	>
		{[...Array(13)].map((_, index) => {
			const second = index;
			return (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: the ruler is a fixed tick sequence
					key={index}
					className={`ic-ruler-tick${second % 2 === 0 ? " major" : ""}`}
					style={{ left: `${(second / DURATION) * 100}%` }}
				>
					<span>{second < 10 ? `0${second}` : second}s</span>
				</div>
			);
		})}
		<div
			className="ic-ruler-head"
			style={{ left: `${percentOf(time, DURATION)}%` }}
		/>
	</div>
);

export const Timeline = ({
	project,
	time,
	selectedLayer,
	expanded,
	selectedKey,
	onSeek,
	onSelectLayer,
	onToggleLayer,
	onSelectKey,
	onMoveKey,
	onAddKey,
}: TimelineProps) => {
	const rows: ReactElement[] = [];
	const labels: ReactElement[] = [];

	for (const [layerIndex, layer] of project.layers.entries()) {
		const open = expanded.has(layer.id);
		const selected = selectedLayer === layer.id;
		rows.push(
			<div
				key={`${layer.id}-summary`}
				className={`ic-tl-lane ic-tl-layer-lane${selected ? " selected" : ""}`}
				role="slider"
				tabIndex={0}
				aria-label={`${layer.name} timeline`}
				aria-valuemin={0}
				aria-valuemax={DURATION}
				aria-valuenow={time}
				onPointerDown={(event) => {
					onSelectLayer(layer.id);
					startScrub(event, onSeek);
				}}
			>
				{TRACKS.flatMap((track) =>
					layer.tracks[track.id].map((key) => (
						<span
							key={`${track.id}-${key.id}`}
							className="ic-tl-summary-key"
							style={{
								left: `${percentOf(key.time, DURATION)}%`,
								background: track.color,
							}}
						/>
					)),
				)}
			</div>,
		);
		labels.push(
			<div
				key={`${layer.id}-summary-label`}
				className={`ic-tl-layer-label${selected ? " selected" : ""}`}
			>
				<button
					type="button"
					className={`ic-disclosure${open ? " open" : ""}`}
					aria-expanded={open}
					aria-label={`${open ? "Collapse" : "Expand"} ${layer.name}`}
					onClick={(event) => {
						event.stopPropagation();
						onToggleLayer(layer.id);
					}}
				>
					▸
				</button>
				<button
					type="button"
					className="ic-layer-main"
					onClick={() => {
						onSelectLayer(layer.id);
					}}
					onDoubleClick={() => {
						onToggleLayer(layer.id);
					}}
				>
					<span className="ic-layer-index">
						{String(layerIndex + 1).padStart(2, "0")}
					</span>
					<span
						className="ic-layer-dot"
						style={{ background: layer.visible ? "#d5ff4b" : "#59616a" }}
					/>
					<span className="ic-layer-name">{layer.name}</span>
					<span className="ic-layer-keycount">{keyCount(layer)}K</span>
				</button>
			</div>,
		);

		if (!open) {
			continue;
		}
		for (const track of TRACKS) {
			rows.push(
				<div
					key={`${layer.id}-${track.id}`}
					className="ic-tl-lane ic-tl-property-lane"
					role="slider"
					tabIndex={0}
					aria-label={`${layer.name} ${track.label} keyframes`}
					aria-valuemin={0}
					aria-valuemax={DURATION}
					aria-valuenow={time}
					onPointerDown={(event) => {
						onSelectLayer(layer.id);
						startScrub(event, onSeek);
					}}
					onDoubleClick={(event) => {
						onAddKey(
							layer.id,
							track.id,
							timeFromPointer(event.clientX, event.currentTarget),
						);
					}}
				>
					<div className="ic-tl-guides" />
					{layer.tracks[track.id].map((key) => {
						const keySelected =
							selectedKey?.layerId === layer.id &&
							selectedKey.track === track.id &&
							selectedKey.keyId === key.id;
						return (
							<button
								type="button"
								key={key.id}
								className={`ic-tl-key${keySelected ? " selected" : ""}`}
								title={`${track.label} · ${formatClock(key.time)}`}
								style={
									{
										left: `${percentOf(key.time, DURATION)}%`,
										"--key-color": track.color,
									} as CSSProperties
								}
								onPointerDown={(event) => {
									startKeyDrag(
										event,
										{ layerId: layer.id, track: track.id, keyId: key.id },
										onSelectKey,
										onMoveKey,
									);
								}}
							/>
						);
					})}
				</div>,
			);
			labels.push(
				<div
					key={`${layer.id}-${track.id}-label`}
					className="ic-tl-property-label"
				>
					<span
						className="ic-track-diamond"
						style={{ background: track.color }}
					/>
					<span>{track.label}</span>
					<span className="ic-track-code">{track.code}</span>
					<button
						type="button"
						className="ic-add-key"
						title={`Add ${track.label} key at ${formatClock(time)}`}
						onClick={() => {
							onAddKey(layer.id, track.id, time);
						}}
					>
						+
					</button>
				</div>,
			);
		}
	}

	const playheadStyle = {
		left: `${percentOf(time, DURATION)}%`,
	} as CSSProperties;

	return (
		<section className="ic-timeline">
			<div className="ic-timeline-title">
				<span>TIMELINE / KEYFRAMES</span>
				<span className="ic-timeline-hint">
					Double-click a track to add · drag keys to retime
				</span>
				<span className="ic-timeline-time">{formatClock(time)}</span>
			</div>
			<div className="ic-timeline-grid">
				<div className="ic-timeline-head">
					<div className="ic-timeline-corner">
						<span>LAYERS / PROPERTIES</span>
					</div>
					<Ruler time={time} onSeek={onSeek} />
				</div>
				<div className="ic-timeline-body">
					<div className="ic-timeline-labels">{labels}</div>
					<div className="ic-timeline-lanes">
						<div className="ic-timeline-playhead" style={playheadStyle}>
							<button
								type="button"
								className="ic-playhead-grip"
								aria-label="Drag the playhead"
								onPointerDown={(event) => {
									event.stopPropagation();
									const lane =
										event.currentTarget.closest<HTMLElement>(
											".ic-timeline-lanes",
										);
									if (lane) {
										startScrubOn(event.clientX, lane, onSeek);
									}
								}}
							/>
						</div>
						{rows}
					</div>
				</div>
			</div>
		</section>
	);
};
