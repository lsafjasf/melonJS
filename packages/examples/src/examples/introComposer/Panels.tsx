/**
 * melonJS — procedural intro composer: layer list and inspector.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { CSSProperties, ReactNode } from "react";
import type { Layer, LayerId, LayerSample, Project, TrackId } from "./model";
import { keyAt, keyCount, sampleLayer } from "./model";
import { formatClock, TRACKS, trackMeta } from "./tracks";

interface LayerPanelProps {
	project: Project;
	time: number;
	selectedLayer: LayerId;
	onSelect: (id: LayerId) => void;
	onToggleVisibility: (id: LayerId) => void;
}

export const LayersPanel = ({
	project,
	time,
	selectedLayer,
	onSelect,
	onToggleVisibility,
}: LayerPanelProps) => (
	<aside className="ic-panel ic-left-panel">
		<div className="ic-panel-heading">
			<span>COMPOSITION</span>
			<span className="ic-panel-badge">PROGRAM</span>
		</div>
		<div className="ic-composition-meta">
			<span>1280 × 720</span>
			<span>30 FPS</span>
			<span>12.00s</span>
		</div>
		<div className="ic-layer-list">
			{project.layers.map((layer, index) => {
				const sample = sampleLayer(layer, time);
				const active = selectedLayer === layer.id;
				return (
					<article
						key={layer.id}
						className={`ic-layer-card${active ? " active" : ""}${layer.visible ? "" : " hidden"}`}
					>
						<button
							type="button"
							className="ic-layer-select"
							onClick={() => {
								onSelect(layer.id);
							}}
						>
							<span className="ic-layer-order">
								{String(index + 1).padStart(2, "0")}
							</span>
							<span
								className="ic-layer-swatch"
								style={{ background: sample.color }}
							/>
							<span className="ic-layer-card-copy">
								<strong>{layer.name}</strong>
								<span>{layer.kind}</span>
							</span>
							<span className="ic-layer-stats">{keyCount(layer)}K</span>
						</button>
						<div className="ic-layer-mini-track">
							{TRACKS.map((track) => (
								<span
									key={track.id}
									className="ic-layer-mini-key"
									style={{ background: track.color }}
								/>
							))}
						</div>
						<div className="ic-layer-card-foot">
							<span>X {sample.position.x.toFixed(1)}</span>
							<span>Y {sample.position.y.toFixed(1)}</span>
							<span>×{sample.scale.toFixed(2)}</span>
							<span>{Math.round(sample.opacity * 100)}%</span>
							<button
								type="button"
								className="ic-visibility"
								title={layer.visible ? "Hide layer" : "Show layer"}
								onClick={() => {
									onToggleVisibility(layer.id);
								}}
							>
								{layer.visible ? "◉" : "○"}
							</button>
						</div>
					</article>
				);
			})}
		</div>
		<div className="ic-order-note">
			<div className="ic-panel-heading">
				<span>STACK ORDER</span>
			</div>
			<p>01 Ripple field / background</p>
			<p>02 Title / composite</p>
			<p>03 Light sweeps / foreground</p>
		</div>
		<p className="ic-help">
			Edits at the playhead become keys automatically. Use the diamond beside
			each property to key the current value.
		</p>
	</aside>
);

interface InspectorProps {
	project: Project;
	time: number;
	selectedLayer: LayerId;
	sample: LayerSample;
	onTitleChange: (value: string) => void;
	onSubtitleChange: (value: string) => void;
	onPosition: (x: number, y: number) => void;
	onScale: (value: number) => void;
	onOpacity: (value: number) => void;
	onColor: (value: string) => void;
	onAddKey: (track: TrackId) => void;
	onDeleteKey: () => void;
	hasDeletableKey: boolean;
}

const KeyButton = ({
	track,
	active,
	onClick,
}: {
	track: TrackId;
	active: boolean;
	onClick: () => void;
}) => {
	const meta = trackMeta(track);
	return (
		<button
			type="button"
			className={`ic-property-key${active ? " keyed" : ""}`}
			title={active ? `${meta.label} keyed here` : `Add ${meta.label} key`}
			style={{ "--track-color": meta.color } as CSSProperties}
			onClick={onClick}
		>
			◆
		</button>
	);
};

const ValueRow = ({
	label,
	track,
	time,
	hasKey,
	onAddKey,
	children,
}: {
	label: string;
	track: TrackId;
	time: number;
	hasKey: boolean;
	onAddKey: () => void;
	children: ReactNode;
}) => (
	<div className="ic-value-row">
		<div className="ic-value-label">
			<span>{label}</span>
			<span className="ic-value-time">{formatClock(time)}</span>
		</div>
		<div className="ic-value-control">
			{children}
			<KeyButton track={track} active={hasKey} onClick={onAddKey} />
		</div>
	</div>
);

const layerBy = (project: Project, id: LayerId): Layer =>
	project.layers.find((layer) => layer.id === id) ?? project.layers[0];

export const Inspector = ({
	project,
	time,
	selectedLayer,
	sample,
	onTitleChange,
	onSubtitleChange,
	onPosition,
	onScale,
	onOpacity,
	onColor,
	onAddKey,
	onDeleteKey,
	hasDeletableKey,
}: InspectorProps) => {
	const layer = layerBy(project, selectedLayer);
	const index = project.layers.findIndex((item) => item.id === layer.id);
	const positionKey = Boolean(keyAt(layer.tracks.position, time));
	const scaleKey = Boolean(keyAt(layer.tracks.scale, time));
	const opacityKey = Boolean(keyAt(layer.tracks.opacity, time));
	const colorKey = Boolean(keyAt(layer.tracks.color, time));
	const palette = ["#74e4d0", "#e8fff4", "#ffc96e", "#ff82b8", "#8ca8ff"];

	return (
		<aside className="ic-panel ic-right-panel">
			<div className="ic-panel-heading">
				<span>INSPECTOR</span>
				<span className="ic-inspector-index">
					{String(index + 1).padStart(2, "0")}
				</span>
			</div>
			<div className="ic-inspector-title">
				<span
					className="ic-inspector-swatch"
					style={{ background: sample.color }}
				/>
				<div>
					<strong>{layer.name}</strong>
					<span>{layer.kind}</span>
				</div>
				<span className="ic-live-badge">LIVE</span>
			</div>

			{layer.id === "title" && (
				<section className="ic-inspector-section">
					<h3>TEXT</h3>
					<label className="ic-text-field">
						<span>Title</span>
						<input
							type="text"
							value={project.title}
							maxLength={48}
							onChange={(event) => {
								onTitleChange(event.target.value);
							}}
						/>
					</label>
					<label className="ic-text-field">
						<span>Subtitle</span>
						<input
							type="text"
							value={project.subtitle}
							maxLength={96}
							onChange={(event) => {
								onSubtitleChange(event.target.value);
							}}
						/>
					</label>
				</section>
			)}

			<section className="ic-inspector-section">
				<h3>TRANSFORM</h3>
				<ValueRow
					label="Position X"
					track="position"
					time={time}
					hasKey={positionKey}
					onAddKey={() => {
						onAddKey("position");
					}}
				>
					<input
						type="number"
						value={Math.round(sample.position.x)}
						step={1}
						onChange={(event) => {
							onPosition(Number(event.target.value), sample.position.y);
						}}
					/>
				</ValueRow>
				<ValueRow
					label="Position Y"
					track="position"
					time={time}
					hasKey={positionKey}
					onAddKey={() => {
						onAddKey("position");
					}}
				>
					<input
						type="number"
						value={Math.round(sample.position.y)}
						step={1}
						onChange={(event) => {
							onPosition(sample.position.x, Number(event.target.value));
						}}
					/>
				</ValueRow>
				<ValueRow
					label="Scale"
					track="scale"
					time={time}
					hasKey={scaleKey}
					onAddKey={() => {
						onAddKey("scale");
					}}
				>
					<input
						type="range"
						min={0.2}
						max={2}
						step={0.01}
						value={sample.scale}
						onChange={(event) => {
							onScale(Number(event.target.value));
						}}
					/>
					<span className="ic-number-readout">×{sample.scale.toFixed(2)}</span>
				</ValueRow>
				<ValueRow
					label="Opacity"
					track="opacity"
					time={time}
					hasKey={opacityKey}
					onAddKey={() => {
						onAddKey("opacity");
					}}
				>
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={sample.opacity}
						onChange={(event) => {
							onOpacity(Number(event.target.value));
						}}
					/>
					<span className="ic-number-readout">
						{Math.round(sample.opacity * 100)}%
					</span>
				</ValueRow>
				<ValueRow
					label="Color"
					track="color"
					time={time}
					hasKey={colorKey}
					onAddKey={() => {
						onAddKey("color");
					}}
				>
					<input
						type="color"
						value={sample.color}
						onChange={(event) => {
							onColor(event.target.value);
						}}
					/>
					<code>{sample.color.toUpperCase()}</code>
				</ValueRow>
				<div className="ic-swatches">
					{palette.map((swatch) => (
						<button
							type="button"
							key={swatch}
							style={{ background: swatch }}
							aria-label={`Use ${swatch}`}
							onClick={() => {
								onColor(swatch);
							}}
						/>
					))}
				</div>
			</section>

			<button
				type="button"
				className="ic-delete-key"
				disabled={!hasDeletableKey}
				onClick={onDeleteKey}
			>
				Delete selected key
			</button>
			<p className="ic-inspector-note">
				Values are sampled at {formatClock(time)}. Changing one writes a
				keyframe here with smooth interpolation on both sides.
			</p>
		</aside>
	);
};
