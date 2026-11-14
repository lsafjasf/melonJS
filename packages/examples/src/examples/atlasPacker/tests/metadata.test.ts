/**
 * melonJS — atlas packer: metadata export and slice recovery descriptors.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */
import { describe, expect, it } from "vitest";
import {
	buildMetadata,
	type ImageRecord,
	slicesFromMetadata,
} from "../metadata";
import { packAtlas } from "../packer";

describe("buildMetadata / slicesFromMetadata", () => {
	it("records original size, trim rect and atlas position for every frame", () => {
		const items = [
			{ name: "a.png", width: 40, height: 30 },
			{ name: "b.png", width: 60, height: 20 },
		];
		const options = {
			maxWidth: 256,
			maxHeight: 256,
			padding: 2,
			margin: 1,
			rotate: true,
		};
		const result = packAtlas(items, options);
		const records = new Map<string, ImageRecord>(
			items.map((item) => [
				item.name,
				{
					name: item.name,
					sourceWidth: item.width + 8,
					sourceHeight: item.height + 6,
					trim: { x: 4, y: 3, width: item.width, height: item.height },
				},
			]),
		);
		const metadata = buildMetadata(
			records,
			result.frames,
			options,
			"atlas.png",
		);

		expect(metadata.meta.app).toContain("texturepacker");
		expect(metadata.meta.size).toEqual({ w: 256, h: 256 });
		expect(metadata.frames).toHaveLength(2);
		for (const entry of metadata.frames) {
			expect(entry.trimmed).toBe(true);
			expect(entry.sourceSize).toEqual({
				w: entry.filename === "a.png" ? 48 : 68,
				h: entry.filename === "a.png" ? 36 : 26,
			});
			expect(entry.spriteSourceSize.x).toBe(4);
			expect(entry.spriteSourceSize.y).toBe(3);
		}

		const slices = slicesFromMetadata(metadata);
		expect(slices).toHaveLength(2);
		for (const slice of slices) {
			const frame = result.frames.find((f) => f.name === slice.name);
			expect(frame).toBeDefined();
			// margin is skipped on the way back out
			expect(slice.atlasX).toBe((frame?.x ?? 0) + options.margin);
			expect(slice.atlasY).toBe((frame?.y ?? 0) + options.margin);
		}
	});

	it("stores rotated frames with swapped width/height and flags them", () => {
		const items = [{ name: "wide.png", width: 140, height: 80 }];
		const options = {
			maxWidth: 100,
			maxHeight: 256,
			padding: 0,
			margin: 0,
			rotate: true,
		};
		const result = packAtlas(items, options);
		expect(result.frames[0]?.rotated).toBe(true);
		const records = new Map<string, ImageRecord>([
			[
				"wide.png",
				{
					name: "wide.png",
					sourceWidth: 140,
					sourceHeight: 80,
					trim: { x: 0, y: 0, width: 140, height: 80 },
				},
			],
		]);
		const metadata = buildMetadata(
			records,
			result.frames,
			options,
			"atlas.png",
		);
		const entry = metadata.frames[0];
		expect(entry?.rotated).toBe(true);
		// the page rect is footprint-oriented, so the rotated frame swaps
		// to 80 wide x 140 tall; the source orientation stays in `trim`.
		expect(entry?.frame).toMatchObject({ w: 80, h: 140 });
		expect(entry?.trim).toMatchObject({ width: 140, height: 80 });
		const slice = slicesFromMetadata(metadata)[0];
		expect(slice).toMatchObject({ width: 140, height: 80, rotated: true });
	});
});
