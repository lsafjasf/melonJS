/**
 * melonJS — atlas packer example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A small texture-atlas packing tool for indie games: batch-load PNGs or
 * use the 40 built-in icons, pack them into a configurable page with
 * rotation, padding, inside margin, trimming and a max width, watch the
 * result and utilization live, sort the file list, and export the atlas
 * PNG plus TexturePacker-compatible JSON metadata.
 */
import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import "./atlas-packer.css";
import type { SourceImage } from "./images";
import {
	DEFAULT_SETTINGS,
	type ToolSettings,
	useAtlasTool,
} from "./useAtlasTool";

type SortKey = "name" | "width" | "height" | "trim";
type SortDirection = "asc" | "desc";

/**
 * The atlas packer tool. Pure React + 2D canvas: it does not start the
 * melonJS engine because it produces assets rather than running a scene.
 * @returns the tool component
 */
export const ExampleAtlasPacker = () => {
	const tool = useAtlasTool();
	const fileInput = useRef<HTMLInputElement>(null);
	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
	const [dragging, setDragging] = useState(false);

	const sortedSources = useMemo(() => {
		const direction = sortDirection === "asc" ? 1 : -1;
		return [...tool.sources].sort((a, b) => {
			const ra = a.record;
			const rb = b.record;
			let comparison = 0;
			switch (sortKey) {
				case "name":
					comparison = ra.name.localeCompare(rb.name);
					break;
				case "width":
					comparison = ra.sourceWidth - rb.sourceWidth;
					break;
				case "height":
					comparison = ra.sourceHeight - rb.sourceHeight;
					break;
				case "trim":
					comparison =
						ra.trim.width * ra.trim.height - rb.trim.width * rb.trim.height;
					break;
			}
			return comparison * direction;
		});
	}, [tool.sources, sortKey, sortDirection]);

	const toggleSort = useCallback(
		(key: SortKey) => {
			if (key === sortKey) {
				setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
			} else {
				setSortKey(key);
				setSortDirection("asc");
			}
		},
		[sortKey],
	);

	const onFiles = useCallback(
		async (files: FileList | File[]) => {
			await tool.addFiles(files);
		},
		[tool],
	);

	const onDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			setDragging(false);
			if (event.dataTransfer.files.length > 0) {
				void onFiles(event.dataTransfer.files);
			}
		},
		[onFiles],
	);

	const utilizationPct = (tool.utilization * 100).toFixed(2);

	return (
		<div className="ap-root">
			<header className="ap-toolbar">
				<strong>Atlas Packer</strong>
				<button type="button" onClick={tool.loadSamples}>
					Load 40 sample icons
				</button>
				<button type="button" onClick={() => fileInput.current?.click()}>
					Add PNGs…
				</button>
				<button type="button" onClick={tool.clearImages}>
					Clear
				</button>
				<input
					ref={fileInput}
					type="file"
					accept="image/png,image/*"
					multiple
					hidden
					onChange={(event: ChangeEvent<HTMLInputElement>) => {
						if (event.target.files) {
							void onFiles(event.target.files);
						}
						event.target.value = "";
					}}
				/>
				<span className="ap-spacer" />
				<button
					type="button"
					className="ap-primary"
					disabled={!tool.atlas}
					onClick={tool.exportPng}
				>
					Export PNG
				</button>
				<button
					type="button"
					className="ap-primary"
					disabled={!tool.metadata}
					onClick={tool.exportJson}
				>
					Export JSON
				</button>
			</header>

			<aside className="ap-panel ap-settings">
				<h2>Page</h2>
				<NumberField
					label="Max width"
					value={tool.settings.maxWidth}
					min={16}
					max={4096}
					onChange={(value) => tool.setSetting("maxWidth", value)}
				/>
				<NumberField
					label="Max height"
					value={tool.settings.maxHeight}
					min={16}
					max={4096}
					onChange={(value) => tool.setSetting("maxHeight", value)}
				/>
				<h2>Frames</h2>
				<NumberField
					label="Padding (gap)"
					value={tool.settings.padding}
					min={0}
					max={64}
					onChange={(value) => tool.setSetting("padding", value)}
				/>
				<NumberField
					label="Inside margin"
					value={tool.settings.margin}
					min={0}
					max={64}
					onChange={(value) => tool.setSetting("margin", value)}
				/>
				<label className="ap-check">
					<input
						type="checkbox"
						checked={tool.settings.rotate}
						onChange={(event) =>
							tool.setSetting("rotate", event.target.checked)
						}
					/>
					Allow 90° rotation
				</label>
				<label className="ap-check">
					<input
						type="checkbox"
						checked={tool.settings.trim}
						onChange={(event) => tool.setSetting("trim", event.target.checked)}
					/>
					Trim transparent edges
				</label>
				<button
					type="button"
					className="ap-reset"
					onClick={() => {
						for (const key of Object.keys(
							DEFAULT_SETTINGS,
						) as (keyof ToolSettings)[]) {
							tool.setSetting(key, DEFAULT_SETTINGS[key]);
						}
					}}
				>
					Reset settings
				</button>
			</aside>

			<main
				className={`ap-preview${dragging ? " ap-dragging" : ""}`}
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
			>
				<div className="ap-stats">
					<span>
						Frames: <b>{tool.sources.length - tool.overflow.length}</b>/
						{tool.sources.length}
					</span>
					<span>
						Used area:{" "}
						<b>
							{tool.bounds.width}×{tool.bounds.height}
						</b>
					</span>
					<span>
						Utilization: <b>{utilizationPct}%</b>
					</span>
					{tool.overflow.length > 0 && (
						<span className="ap-warning">
							{tool.overflow.length} image(s) do not fit
						</span>
					)}
				</div>
				<div className="ap-canvas-wrap">
					{tool.atlas ? (
						<AtlasPreview atlas={tool.atlas} />
					) : (
						<p className="ap-empty">
							Load PNGs or the sample icons to start. Drag &amp; drop images
							anywhere here.
						</p>
					)}
				</div>
			</main>

			<aside className="ap-panel ap-files">
				<h2>Files ({sortedSources.length})</h2>
				<table className="ap-table">
					<thead>
						<tr>
							<th onClick={() => toggleSort("name")}>
								Name {sortArrow(sortKey, "name", sortDirection)}
							</th>
							<th onClick={() => toggleSort("width")}>
								W {sortArrow(sortKey, "width", sortDirection)}
							</th>
							<th onClick={() => toggleSort("height")}>
								H {sortArrow(sortKey, "height", sortDirection)}
							</th>
							<th onClick={() => toggleSort("trim")}>
								Trim {sortArrow(sortKey, "trim", sortDirection)}
							</th>
							<th aria-label="actions" />
						</tr>
					</thead>
					<tbody>
						{sortedSources.map((source) => (
							<FileRow
								key={source.record.name}
								source={source}
								overflow={tool.overflow.includes(source.record.name)}
								onRemove={tool.removeImage}
							/>
						))}
					</tbody>
				</table>
			</aside>
		</div>
	);
};

const sortArrow = (
	active: SortKey,
	key: SortKey,
	direction: SortDirection,
): string => {
	if (active !== key) {
		return "";
	}
	return direction === "asc" ? "▲" : "▼";
};

interface AtlasPreviewProps {
	atlas: HTMLCanvasElement;
}

/**
 * Draws the packed atlas onto a canvas element directly, avoiding the
 * cost of re-encoding a data URL on every settings change.
 * @param props - the source atlas canvas
 * @returns the preview component
 */
const AtlasPreview = ({ atlas }: AtlasPreviewProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		canvas.width = atlas.width;
		canvas.height = atlas.height;
		const ctx = canvas.getContext("2d");
		ctx?.drawImage(atlas, 0, 0);
	}, [atlas]);

	return (
		<canvas
			ref={canvasRef}
			className="ap-atlas"
			aria-label="packed atlas preview"
		/>
	);
};

interface NumberFieldProps {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}

const NumberField = ({
	label,
	value,
	min,
	max,
	onChange,
}: NumberFieldProps) => (
	<label className="ap-field">
		<span>{label}</span>
		<input
			type="number"
			value={value}
			min={min}
			max={max}
			onChange={(event) => onChange(Number(event.target.value))}
		/>
	</label>
);

interface FileRowProps {
	source: SourceImage;
	overflow: boolean;
	onRemove: (name: string) => void;
}

const FileRow = ({ source, overflow, onRemove }: FileRowProps) => {
	const { record } = source;
	return (
		<tr className={overflow ? "ap-overflow" : ""}>
			<td title={record.name}>{record.name}</td>
			<td>{record.sourceWidth}</td>
			<td>{record.sourceHeight}</td>
			<td>
				{record.trim.width}×{record.trim.height}
			</td>
			<td>
				<button
					type="button"
					className="ap-remove"
					onClick={() => onRemove(record.name)}
				>
					✕
				</button>
			</td>
		</tr>
	);
};
