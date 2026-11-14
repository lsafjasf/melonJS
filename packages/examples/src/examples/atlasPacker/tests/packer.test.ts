/**
 * melonJS — atlas packer: DOM-free packing heuristics.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */
import { describe, expect, it } from "vitest";
import {
	assertNoOverlap,
	overlaps,
	type PackerItem,
	type PackerOptions,
	packAtlas,
} from "../packer";

const options: PackerOptions = {
	maxWidth: 256,
	maxHeight: 256,
	padding: 2,
	margin: 1,
	rotate: true,
};

const items = (sizes: Array<[number, number]>): PackerItem[] =>
	sizes.map(([width, height], index) => ({
		name: `img-${index}.png`,
		width,
		height,
	}));

describe("packAtlas", () => {
	it("places every item inside the configured page", () => {
		const result = packAtlas(
			items([
				[64, 32],
				[40, 80],
				[100, 100],
				[20, 20],
				[70, 50],
			]),
			options,
		);
		expect(result.overflow).toHaveLength(0);
		expect(result.frames).toHaveLength(5);
		for (const frame of result.frames) {
			expect(frame.x).toBeGreaterThanOrEqual(0);
			expect(frame.y).toBeGreaterThanOrEqual(0);
			expect(frame.x + frame.width).toBeLessThanOrEqual(options.maxWidth);
			expect(frame.y + frame.height).toBeLessThanOrEqual(options.maxHeight);
		}
	});

	it("never produces overlapping frames, including the inside margin", () => {
		const result = packAtlas(
			items(
				Array.from({ length: 30 }, (_, i) => [
					12 + (i % 7) * 6,
					10 + (i % 5) * 9,
				]),
			),
			options,
		);
		expect(result.overflow).toHaveLength(0);
		expect(() => assertNoOverlap(result.frames)).not.toThrow();
	});

	it("keeps at least the padding gap between neighbouring frames", () => {
		const result = packAtlas(
			items([
				[50, 50],
				[50, 50],
			]),
			options,
		);
		const [a, b] = result.frames;
		const gapX = Math.abs(a.x - (b.x + b.width));
		const gapY = Math.abs(a.y - (b.y + b.height));
		// frames share a row or a column; the separating axis keeps 2 * padding
		expect(Math.min(gapX, gapY)).toBeGreaterThanOrEqual(options.padding * 2);
	});

	it("rotates frames when that makes them fit", () => {
		// a 120x80 bar does not fit upright in a 100 px-wide page, but
		// rotated to 80 wide it does.
		const result = packAtlas(items([[120, 80]]), {
			...options,
			maxWidth: 100,
			maxHeight: 256,
			padding: 0,
			margin: 0,
		});
		expect(result.overflow).toHaveLength(0);
		expect(result.frames.some((frame) => frame.rotated)).toBe(true);
	});

	it("respects the max width even without rotation", () => {
		// footprints add padding (2) + margin (1) on each side, so a
		// 52x52 item occupies 58x58 and two fit one per 64 px column.
		const narrow = packAtlas(
			items([
				[52, 52],
				[52, 52],
			]),
			{ ...options, maxWidth: 64, maxHeight: 256, rotate: false },
		);
		expect(narrow.overflow).toHaveLength(0);
		for (const frame of narrow.frames) {
			expect(frame.x + frame.width).toBeLessThanOrEqual(64);
			expect(frame.rotated).toBe(false);
		}
	});

	it("reports items that cannot fit as overflow instead of overlapping", () => {
		const result = packAtlas(
			items([
				[100, 100],
				[100, 100],
				[300, 300],
			]),
			options,
		);
		expect(result.frames).toHaveLength(2);
		expect(result.overflow.map((item) => item.name)).toEqual(["img-2.png"]);
		expect(() => assertNoOverlap(result.frames)).not.toThrow();
	});

	it("computes utilization from the trimmed pixel area", () => {
		const result = packAtlas(items([[128, 128]]), {
			...options,
			padding: 0,
			margin: 0,
		});
		expect(result.utilization).toBeCloseTo((128 * 128) / (256 * 256), 5);
	});

	it("exposes bounds that contain every frame", () => {
		const result = packAtlas(
			items([
				[40, 40],
				[80, 30],
			]),
			options,
		);
		for (const frame of result.frames) {
			expect(frame.x + frame.width).toBeLessThanOrEqual(result.bounds.width);
			expect(frame.y + frame.height).toBeLessThanOrEqual(result.bounds.height);
		}
	});

	it("detects overlap and touching edges correctly", () => {
		expect(
			overlaps(
				{ x: 0, y: 0, width: 10, height: 10 },
				{ x: 10, y: 0, width: 5, height: 5 },
			),
		).toBe(false);
		expect(
			overlaps(
				{ x: 0, y: 0, width: 10, height: 10 },
				{ x: 9, y: 0, width: 5, height: 5 },
			),
		).toBe(true);
	});
});
