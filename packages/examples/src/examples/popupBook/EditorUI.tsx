/**
 * melonJS — 2.5D pop-up book editor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { useRef, useState, useSyncExternalStore } from "react";
import type { BookEditor, LayerField } from "./editor-store";
import { formatSeconds } from "./project";
import {
	LAYER_IDS,
	type LayerId,
	LIGHT_PRESET_IDS,
	LIGHT_PRESETS,
	type LightPresetId,
} from "./types";

interface EditorUIProps {
	editor: BookEditor;
	onSave: () => void;
	onLoadFile: (file: File) => Promise<void>;
	onExport: () => Promise<void>;
}

const LAYER_META: Record<
	LayerId,
	{ label: string; english: string; color: string }
> = {
	mountains: { label: "Mountains", english: "Far", color: "#6f9085" },
	clouds: { label: "Clouds", english: "Sky", color: "#d9ccb5" },
	trees: { label: "Trees", english: "Near", color: "#315b49" },
	character: { label: "Paper Figure", english: "Hero", color: "#c95448" },
};

const RANGE_META: Record<
	LayerField,
	{
		label: string;
		english: string;
		min: number;
		max: number;
		step: number;
		suffix: string;
	}
> = {
	depth: {
		label: "Depth",
		english: "Depth",
		min: 0.05,
		max: 1.8,
		step: 0.01,
		suffix: "×",
	},
	offsetX: {
		label: "Shift",
		english: "Shift",
		min: -120,
		max: 120,
		step: 1,
		suffix: "px",
	},
	blur: {
		label: "Blur",
		english: "Blur",
		min: 0,
		max: 12,
		step: 0.1,
		suffix: "px",
	},
	shadow: {
		label: "Shadow",
		english: "Shadow",
		min: 0,
		max: 1,
		step: 0.01,
		suffix: "",
	},
};

const RANGE_ORDER: LayerField[] = ["offsetX", "depth", "blur", "shadow"];

const RangeControl = ({
	label,
	english,
	value,
	min,
	max,
	step,
	suffix,
	testId,
	onChange,
}: {
	label: string;
	english: string;
	value: number;
	min: number;
	max: number;
	step: number;
	suffix: string;
	testId: string;
	onChange: (value: number) => void;
}) => (
	<label className="pb-control">
		<span className="pb-control-head">
			<span>{label}</span>
			<output>
				{Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}
				{suffix}
			</output>
		</span>
		<input
			aria-label={`${english} / ${label}`}
			data-testid={testId}
			type="range"
			min={min}
			max={max}
			step={step}
			value={value}
			onChange={(event) => onChange(Number(event.target.value))}
		/>
	</label>
);

export const EditorUI = ({
	editor,
	onSave,
	onLoadFile,
	onExport,
}: EditorUIProps) => {
	useSyncExternalStore(
		editor.subscribe,
		editor.getRevision,
		editor.getRevision,
	);
	const fileInput = useRef<HTMLInputElement>(null);
	const [exporting, setExporting] = useState(false);
	const [loading, setLoading] = useState(false);
	const project = editor.project;
	const selectedKeyframe =
		project.keyframes[editor.selectedFrame] ?? project.keyframes[0];
	const displayTime = editor.playing ? editor.playhead : selectedKeyframe.time;
	const progress = Math.min(
		100,
		Math.max(0, (displayTime / project.duration) * 100),
	);

	const chooseFile = () => {
		fileInput.current?.click();
	};

	const loadFile = async (file: File) => {
		setLoading(true);
		try {
			await onLoadFile(file);
		} finally {
			setLoading(false);
			if (fileInput.current) {
				fileInput.current.value = "";
			}
		}
	};

	const exportPng = async () => {
		setExporting(true);
		try {
			await onExport();
		} finally {
			setExporting(false);
		}
	};

	return (
		<>
			<div className="pb-stage-hint" aria-hidden="true">
				<span>
					<i className="pb-hint-icon pb-hint-drag" />
					Drag the scene for parallax
				</span>
				<span>
					<i className="pb-hint-icon pb-hint-light" />
					Drag the lamp to relight it
				</span>
			</div>

			<aside className="pb-panel" aria-label="Pop-up book inspector">
				<header className="pb-brand">
					<div className="pb-brand-topline">
						<span className="pb-brand-mark" aria-hidden="true">
							<i />
							<i />
							<i />
						</span>
						<span className="pb-kicker">2.5D PAPER THEATER</span>
					</div>
					<h1>Pop-Up Book Editor</h1>
					<p>Four paper layers · live light · ten second loop</p>
				</header>

				<div className="pb-actions">
					<button
						type="button"
						className="pb-action"
						data-testid="save-project"
						aria-label="Save project as JSON"
						title="Save project as JSON"
						onClick={onSave}
					>
						<span className="pb-action-icon">↓</span>
						Save Project
					</button>
					<button
						type="button"
						className="pb-action"
						data-testid="load-project"
						aria-label="Load project JSON"
						title="Load project JSON"
						onClick={chooseFile}
						disabled={loading}
					>
						<span className="pb-action-icon">↟</span>
						{loading ? "Loading..." : "Load Project"}
					</button>
					<button
						type="button"
						className="pb-action pb-action-accent"
						data-testid="export-screenshot"
						aria-label="Export PNG screenshot"
						title="Export screenshot as PNG"
						onClick={() => {
							void exportPng();
						}}
						disabled={exporting}
					>
						<span className="pb-action-icon">◫</span>
						{exporting ? "Exporting..." : "Export PNG"}
					</button>
				</div>

				<input
					ref={fileInput}
					className="pb-file-input"
					data-testid="load-project-input"
					aria-label="Project JSON file"
					type="file"
					accept=".json,application/json"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) {
							void loadFile(file);
						}
					}}
				/>

				<section className="pb-section">
					<div className="pb-section-title">
						<h2>Light</h2>
						<span>LIGHT SOURCE</span>
						<button
							type="button"
							className="pb-text-button"
							aria-label="Reset parallax preview"
							onClick={editor.resetParallax}
						>
							Reset View
						</button>
					</div>

					<fieldset className="pb-presets" aria-label="Light presets">
						{LIGHT_PRESET_IDS.map((preset: LightPresetId) => {
							const data = LIGHT_PRESETS[preset];
							return (
								<button
									type="button"
									key={preset}
									className={`pb-preset ${
										project.light.preset === preset ? "active" : ""
									}`}
									data-testid={`light-preset-${preset}`}
									aria-label={`${data.english} light / ${data.label}`}
									title={data.english}
									onClick={() => editor.setLightPreset(preset)}
								>
									<i style={{ background: data.glow }} />
									{data.label}
								</button>
							);
						})}
					</fieldset>

					<div className="pb-control-grid">
						<RangeControl
							label="Lamp X"
							english="Light X"
							value={project.light.x}
							min={140}
							max={1060}
							step={1}
							suffix=""
							testId="light-x"
							onChange={(value) =>
								editor.setLightPosition(value, project.light.y)
							}
						/>
						<RangeControl
							label="Lamp Y"
							english="Light Y"
							value={project.light.y}
							min={170}
							max={520}
							step={1}
							suffix=""
							testId="light-y"
							onChange={(value) =>
								editor.setLightPosition(project.light.x, value)
							}
						/>
					</div>
					<RangeControl
						label="Intensity"
						english="Intensity"
						value={project.light.intensity}
						min={0.2}
						max={1.5}
						step={0.01}
						suffix=""
						testId="light-intensity"
						onChange={editor.setLightIntensity}
					/>
				</section>

				<section className="pb-section pb-layers-section">
					<div className="pb-section-title">
						<h2>Layers</h2>
						<span>4 PAPER LAYERS</span>
					</div>

					<div className="pb-layer-list">
						{LAYER_IDS.map((id) => {
							const meta = LAYER_META[id];
							const layer = project.layers[id];
							return (
								<article className="pb-layer" key={id}>
									<header>
										<span className="pb-layer-name">
											<i style={{ background: meta.color }} />
											<span>
												{meta.label}
												<small>{meta.english}</small>
											</span>
										</span>
										<span className="pb-depth-badge">
											{layer.depth.toFixed(2)}×
										</span>
									</header>
									<div className="pb-layer-controls">
										{RANGE_ORDER.map((field) => {
											const range = RANGE_META[field];
											return (
												<RangeControl
													key={field}
													label={range.label}
													english={`${meta.english} ${range.english}`}
													value={layer[field]}
													min={range.min}
													max={range.max}
													step={range.step}
													suffix={range.suffix}
													testId={`layer-${id}-${field}`}
													onChange={(value) =>
														editor.setLayerSetting(id, field, value)
													}
												/>
											);
										})}
									</div>
								</article>
							);
						})}
					</div>
				</section>

				<footer className="pb-panel-footer">
					<span>Canvas Paths Only</span>
					<span>JSON · v{project.version}</span>
				</footer>
			</aside>

			<section
				className="pb-timeline"
				aria-label="Ten second keyframe timeline"
			>
				<div className="pb-timeline-main">
					<button
						type="button"
						className={`pb-play ${editor.playing ? "playing" : ""}`}
						data-testid="play-toggle"
						aria-label={editor.playing ? "Pause animation" : "Play animation"}
						title={editor.playing ? "Pause" : "Play 10 second loop"}
						onClick={editor.togglePlay}
					>
						<i />
					</button>
					<div className="pb-transport">
						<div className="pb-transport-head">
							<span className="pb-transport-title">
								{editor.playing ? "Playing" : "10 second loop"}
								<small>{editor.playing ? "PLAYING" : "LOOP"}</small>
							</span>
							<output data-testid="playhead-time">
								{formatSeconds(displayTime)} / {formatSeconds(project.duration)}
							</output>
						</div>
						<div
							className="pb-progress"
							role="progressbar"
							aria-label="Playhead"
							aria-valuemin={0}
							aria-valuemax={project.duration}
							aria-valuenow={Number(displayTime.toFixed(2))}
						>
							<span
								className="pb-progress-fill"
								style={{ width: `${progress}%` }}
							/>
							{project.keyframes.map((frame, index) => (
								<i
									key={`tick-${frame.time}`}
									className={index === editor.selectedFrame ? "active" : ""}
									style={{ left: `${(frame.time / project.duration) * 100}%` }}
								/>
							))}
						</div>
					</div>
					<button
						type="button"
						className="pb-record"
						data-testid="record-keyframe"
						aria-label="Record selected keyframe"
						onClick={() => editor.recordFrame()}
					>
						<i />
						Record Frame
					</button>
				</div>

				<div className="pb-keyframes">
					{project.keyframes.map((frame, index) => (
						<button
							type="button"
							key={frame.time}
							className={`pb-keyframe ${
								index === editor.selectedFrame ? "active" : ""
							}`}
							data-testid={`keyframe-${index}`}
							aria-label={`Keyframe ${index + 1} at ${frame.time.toFixed(2)} seconds`}
							onClick={() => editor.selectFrame(index)}
						>
							<i />
							<span>
								<strong>{String(index + 1).padStart(2, "0")}</strong>
								<small>{frame.time.toFixed(2)}s</small>
							</span>
						</button>
					))}
				</div>
			</section>

			<div
				className={`pb-toast ${editor.notice ? "visible" : ""}`}
				role="status"
				aria-live="polite"
				data-testid="editor-toast"
			>
				{editor.notice}
			</div>
		</>
	);
};
