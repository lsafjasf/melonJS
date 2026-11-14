/**
 * melonJS — atlas packer: reactive state and packing orchestration.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { useCallback, useMemo, useState } from "react";
import {
	composeAtlas,
	downloadCanvas,
	downloadText,
	generateSampleIcons,
	loadImageFile,
	type SourceImage,
} from "./images";
import { buildMetadata, type ImageRecord } from "./metadata";
import { type PackerOptions, packAtlas } from "./packer";

/** the editable packing settings, clamped to sane integer ranges */
export interface ToolSettings {
	maxWidth: number;
	maxHeight: number;
	padding: number;
	margin: number;
	rotate: boolean;
	trim: boolean;
}

export const DEFAULT_SETTINGS: ToolSettings = {
	maxWidth: 512,
	maxHeight: 512,
	padding: 2,
	margin: 1,
	rotate: true,
	trim: true,
};

/** the derived packing state the UI renders and exports */
export interface ToolState {
	settings: ToolSettings;
	sources: SourceImage[];
	setSetting: <K extends keyof ToolSettings>(
		key: K,
		value: ToolSettings[K],
	) => void;
	loadSamples: () => void;
	addFiles: (files: FileList | File[]) => Promise<void>;
	removeImage: (name: string) => void;
	clearImages: () => void;
	atlas: HTMLCanvasElement | null;
	metadata: ReturnType<typeof buildMetadata> | null;
	options: PackerOptions;
	overflow: string[];
	utilization: number;
	bounds: { width: number; height: number };
	exportPng: () => void;
	exportJson: () => void;
}

const clamp = (value: number, min: number, max: number): number => {
	if (Number.isNaN(value)) {
		return min;
	}
	return Math.min(max, Math.max(min, Math.round(value)));
};

/**
 * Owns the source list, settings and the memoised packing run.
 * @returns the state and actions for the atlas tool UI
 */
export const useAtlasTool = (): ToolState => {
	const [settings, setSettings] = useState<ToolSettings>(DEFAULT_SETTINGS);
	const [sources, setSources] = useState<SourceImage[]>(() =>
		generateSampleIcons(),
	);

	const setSetting = useCallback(
		<K extends keyof ToolSettings>(key: K, value: ToolSettings[K]) => {
			setSettings((previous) => ({ ...previous, [key]: value }));
		},
		[],
	);

	const loadSamples = useCallback(() => {
		setSources(generateSampleIcons());
	}, []);

	const addFiles = useCallback(async (files: FileList | File[]) => {
		const list = Array.from(files).filter((file) =>
			file.type.startsWith("image/"),
		);
		const loaded = await Promise.all(list.map((file) => loadImageFile(file)));
		setSources((previous) => {
			const names = new Set(previous.map((source) => source.record.name));
			const unique = loaded.filter((source) => {
				if (names.has(source.record.name)) {
					return false;
				}
				names.add(source.record.name);
				return true;
			});
			return [...previous, ...unique];
		});
	}, []);

	const removeImage = useCallback((name: string) => {
		setSources((previous) =>
			previous.filter((source) => source.record.name !== name),
		);
	}, []);

	const clearImages = useCallback(() => {
		setSources([]);
	}, []);

	const options: PackerOptions = useMemo(
		() => ({
			maxWidth: clamp(settings.maxWidth, 16, 4096),
			maxHeight: clamp(settings.maxHeight, 16, 4096),
			padding: clamp(settings.padding, 0, 64),
			margin: clamp(settings.margin, 0, 64),
			rotate: settings.rotate,
		}),
		[settings],
	);

	const packed = useMemo(() => {
		if (sources.length === 0) {
			return null;
		}
		const items = sources.map(({ record }) => {
			const trim = settings.trim ? record.trim : fullFrame(record);
			return {
				name: record.name,
				width: trim.width,
				height: trim.height,
			};
		});
		return packAtlas(items, options);
	}, [sources, options, settings.trim]);

	const records = useMemo(() => {
		const map = new Map<string, ImageRecord>();
		for (const source of sources) {
			const { record } = source;
			map.set(record.name, {
				...record,
				trim: settings.trim ? record.trim : fullFrame(record),
			});
		}
		return map;
	}, [sources, settings.trim]);

	const byName = useMemo(
		() => new Map(sources.map((source) => [source.record.name, source])),
		[sources],
	);

	const { atlas, metadata } = useMemo(() => {
		if (!packed) {
			return { atlas: null, metadata: null };
		}
		const canvas = composeAtlas(
			packed.frames.map((frame) => ({
				source: byName.get(frame.name) as SourceImage,
				frame,
			})),
			options.maxWidth,
			options.maxHeight,
			options.margin,
		);
		const json = buildMetadata(records, packed.frames, options, "atlas.png");
		return { atlas: canvas, metadata: json };
	}, [packed, byName, records, options]);

	const exportPng = useCallback(() => {
		if (atlas) {
			downloadCanvas(atlas, "atlas.png");
		}
	}, [atlas]);

	const exportJson = useCallback(() => {
		if (metadata) {
			downloadText(JSON.stringify(metadata, null, "\t"), "atlas.json");
		}
	}, [metadata]);

	return {
		settings,
		sources,
		setSetting,
		loadSamples,
		addFiles,
		removeImage,
		clearImages,
		atlas,
		metadata,
		options,
		overflow: packed?.overflow.map((item) => item.name) ?? [],
		utilization: packed?.utilization ?? 0,
		bounds: packed?.bounds ?? { width: 0, height: 0 },
		exportPng,
		exportJson,
	};
};

/** the trim rect used when trimming is disabled: the whole source frame */
const fullFrame = (record: ImageRecord): ImageRecord["trim"] => ({
	x: 0,
	y: 0,
	width: record.sourceWidth,
	height: record.sourceHeight,
});
