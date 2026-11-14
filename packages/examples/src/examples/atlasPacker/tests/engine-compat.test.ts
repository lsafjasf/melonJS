/**
 * melonJS — atlas packer: TextureAtlas engine compatibility.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 *
 * Proves the exported JSON is a real TexturePacker-format document that
 * the engine's own TextureAtlas can parse, including rotated frames and
 * their trim offsets.
 */
import { TextureAtlas } from "melonjs";
import { describe, expect, it } from "vitest";
import { composeAtlas, generateSampleIcons } from "../images";
import { buildMetadata } from "../metadata";
import { packAtlas } from "../packer";

describe("exported metadata and melonJS TextureAtlas", () => {
	it("parses through the engine with every frame reachable by name", () => {
		const sources = generateSampleIcons();
		const items = sources.map(({ record }) => ({
			name: record.name,
			width: record.trim.width,
			height: record.trim.height,
		}));
		const options = {
			maxWidth: 2048,
			maxHeight: 2048,
			padding: 2,
			margin: 1,
			rotate: true,
		};
		const result = packAtlas(items, options);
		const records = new Map(
			sources.map((source) => [source.record.name, source.record]),
		);
		const byName = new Map(
			sources.map((source) => [source.record.name, source]),
		);
		const metadata = buildMetadata(
			records,
			result.frames,
			options,
			"atlas.png",
		);
		const atlasCanvas = composeAtlas(
			result.frames.map((frame) => ({
				source: byName.get(frame.name) as (typeof sources)[number],
				frame,
			})),
			options.maxWidth,
			options.maxHeight,
			options.margin,
		);

		const atlas = new TextureAtlas(metadata, atlasCanvas, { cache: false });
		expect(atlas.getFormat()).toBe("texturepacker");
		const regions = atlas.getAtlas();

		for (const frame of result.frames) {
			const region = regions?.[frame.name];
			const trim = records.get(frame.name)?.trim;
			expect(region).toBeDefined();
			expect(trim).toBeDefined();
			// the engine stores the JSON frame rect as-is; it includes the
			// inside margin on both sides, while trim is the content only.
			expect(region?.width).toBe(
				(frame.rotated ? trim?.height : trim?.width) + options.margin * 2,
			);
			expect(region?.height).toBe(
				(frame.rotated ? trim?.width : trim?.height) + options.margin * 2,
			);
			const entry = metadata.frames.find(
				(frameEntry) => frameEntry.filename === frame.name,
			);
			expect(region?.trimmed).toBe(entry?.trimmed ?? false);
		}

		const rotated = result.frames.find((frame) => frame.rotated);
		if (rotated) {
			const region = regions?.[rotated.name];
			expect(region?.angle).toBe(-Math.PI / 2);
		}
	});
});
