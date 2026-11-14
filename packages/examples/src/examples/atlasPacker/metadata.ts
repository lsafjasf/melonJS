/**
 * melonJS — atlas packer: JSON metadata and round-trip helpers.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * The export uses the TexturePacker JSON layout (`frames` + `meta`,
 * `frame` / `spriteSourceSize` / `sourceSize`, `rotated`) so the file
 * loads directly through melonJS `TextureAtlas`. It additionally records
 * the untrimmed source size and the trim rectangle explicitly, which is
 * exactly what an external tool needs to restore every slice pixel-for-pixel.
 */
import type { PackedFrame, PackerOptions } from "./packer";

/** the rectangle of non-transparent pixels inside the original image */
export interface TrimRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** everything recorded about one source image */
export interface ImageRecord {
	name: string;
	/** full size of the source PNG before trimming */
	sourceWidth: number;
	sourceHeight: number;
	/** non-transparent crop rect inside the source; full rect when untrimmed */
	trim: TrimRect;
}

/** one entry of the exported `frames` array */
export interface AtlasFrameEntry {
	filename: string;
	/** placement rectangle in the atlas, in the page (possibly rotated) orientation */
	frame: { x: number; y: number; w: number; h: number };
	rotated: boolean;
	trimmed: boolean;
	/** where the crop lands back inside the original image */
	spriteSourceSize: { x: number; y: number; w: number; h: number };
	/** original image size */
	sourceSize: { w: number; h: number };
	/** explicit trimmed crop rect in source pixels, for lossless recovery */
	trim: TrimRect;
}

/** the exported document, TexturePacker-compatible */
export interface AtlasMetadata {
	meta: {
		app: string;
		version: string;
		image: string;
		size: { w: number; h: number };
		/** padding between frames and inside margin, in pixels */
		padding: number;
		margin: number;
	};
	frames: AtlasFrameEntry[];
}

/**
 * Build the metadata document for a packing run.
 * @param records - per-image source and trim information, keyed by name
 * @param frames - the placed frames from `packAtlas`
 * @param options - the packing options used
 * @param imageName - the exported atlas PNG file name
 * @returns the JSON-serializable metadata
 */
export const buildMetadata = (
	records: Map<string, ImageRecord>,
	frames: PackedFrame[],
	options: PackerOptions,
	imageName: string,
): AtlasMetadata => {
	return {
		meta: {
			app: "melonJS atlas packer (texturepacker compatible)",
			version: "1.0",
			image: imageName,
			size: { w: options.maxWidth, h: options.maxHeight },
			padding: options.padding,
			margin: options.margin,
		},
		frames: frames.map((frame) => {
			const record = records.get(frame.name);
			if (!record) {
				throw new Error(`no source record for frame ${frame.name}`);
			}
			const { trim } = record;
			const trimmed =
				trim.x !== 0 ||
				trim.y !== 0 ||
				trim.width !== record.sourceWidth ||
				trim.height !== record.sourceHeight;
			return {
				filename: frame.name,
				// the page rectangle is footprint-oriented, so a rotated
				// frame's w/h are the swapped trim dimensions; the source
				// orientation is recoverable from `trim` and `rotated`.
				frame: {
					x: frame.x,
					y: frame.y,
					w: frame.width,
					h: frame.height,
				},
				rotated: frame.rotated,
				trimmed,
				spriteSourceSize: {
					x: trim.x,
					y: trim.y,
					w: trim.width,
					h: trim.height,
				},
				sourceSize: {
					w: record.sourceWidth,
					h: record.sourceHeight,
				},
				trim: {
					x: trim.x,
					y: trim.y,
					width: trim.width,
					height: trim.height,
				},
			};
		}),
	};
};

/** where one slice sits in the atlas, already un-rotated to source orientation */
export interface SliceRect {
	name: string;
	/** atlas position of the crop, in source (unrotated) orientation */
	atlasX: number;
	atlasY: number;
	width: number;
	height: number;
	rotated: boolean;
	/** crop rect inside the original image */
	source: TrimRect;
	/** full original image size */
	sourceSize: { w: number; h: number };
}

/**
 * Read the metadata back and describe how to recover each slice from the
 * atlas PNG. The margin is skipped, and rotated frames are reported with
 * their source orientation so a caller can un-rotate them.
 * @param metadata - a parsed atlas metadata document
 * @returns one recovery descriptor per frame
 */
export const slicesFromMetadata = (metadata: AtlasMetadata): SliceRect[] => {
	const { margin } = metadata.meta;
	return metadata.frames.map((entry) => {
		const frame = entry.frame;
		return {
			name: entry.filename,
			// the frame rect stored in JSON includes the inside margin
			atlasX: frame.x + margin,
			atlasY: frame.y + margin,
			// report in source orientation: swap the rotated page rect back
			width: entry.rotated ? frame.h : frame.w,
			height: entry.rotated ? frame.w : frame.h,
			rotated: entry.rotated,
			source: entry.trim,
			sourceSize: entry.sourceSize,
		};
	});
};
