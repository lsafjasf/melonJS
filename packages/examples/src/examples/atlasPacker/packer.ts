/**
 * melonJS — atlas packer: the DOM-free bin packing core.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A MAXRECTS (Maximum Rectangles) packer with best short-side placement,
 * the same family of heuristic TexturePacker uses. Everything here works
 * on plain rectangles so it can be unit-tested without a browser; canvas
 * trimming and compositing live in `images.ts`.
 */

/** one image to pack, measured after trimming */
export interface PackerItem {
	/** stable identifier, also the exported frame name */
	name: string;
	/** trimmed width, before packing padding is added */
	width: number;
	/** trimmed height, before packing padding is added */
	height: number;
}

/** user-facing packing options */
export interface PackerOptions {
	/** atlas page width in pixels */
	maxWidth: number;
	/** atlas page height in pixels */
	maxHeight: number;
	/** transparent gap kept between every pair of frames, in pixels */
	padding: number;
	/** extra transparent border kept inside each frame, in pixels */
	margin: number;
	/** allow rotating a frame 90 degrees when that packs tighter */
	rotate: boolean;
}

/** an axis-aligned free or occupied rectangle inside the page */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** a placed frame: a {@link Rect} plus how it was packed */
export interface PackedFrame extends Rect {
	name: string;
	/** true when the source was rotated 90 degrees clockwise to fit */
	rotated: boolean;
}

/** the outcome of one packing run */
export interface PackResult {
	/** every frame that fit, in placement order */
	frames: PackedFrame[];
	/** items larger than the page once padded, which no placement can hold */
	overflow: PackerItem[];
	/** smallest page size that contains every placed frame */
	bounds: Rect;
	/** placed-pixel area divided by the configured page area, 0..1 */
	utilization: number;
}

/**
 * Do two axis-aligned rectangles share any pixel? Touching edges do not
 * count: frames separated by zero-padding may sit next to each other.
 * @param a - first rectangle
 * @param b - second rectangle
 * @returns true when their interiors overlap
 */
export const overlaps = (a: Rect, b: Rect): boolean => {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
};

/**
 * Assert that no pair of placed frames overlaps. Used by the tests and
 * the editor's self-check; throws on the first collision.
 * @param frames - the placed frames
 */
export const assertNoOverlap = (frames: Rect[]): void => {
	for (let i = 0; i < frames.length; i++) {
		for (let j = i + 1; j < frames.length; j++) {
			if (overlaps(frames[i], frames[j])) {
				throw new Error(`atlas frames ${String(i)} and ${String(j)} overlap`);
			}
		}
	}
};

/** one candidate placement for the item currently being considered */
interface Placement {
	rect: Rect;
	rotated: boolean;
	/** best short-side fit score, lower is tighter */
	shortSide: number;
	/** tie-breaker: best long-side fit score */
	longSide: number;
}

/**
 * Pick the tightest free rectangle for an item (best short-side fit, then
 * best long-side fit), trying the rotated footprint when allowed.
 * @param freeRects - the current free list
 * @param width - item width including padding
 * @param height - item height including padding
 * @param rotate - whether rotation may be tried
 * @returns the best placement, or undefined when nothing fits
 */
const findPlacement = (
	freeRects: Rect[],
	width: number,
	height: number,
	rotate: boolean,
): Placement | undefined => {
	let best: Placement | undefined;
	const consider = (w: number, h: number, rotated: boolean): void => {
		for (const free of freeRects) {
			if (w > free.width || h > free.height) {
				continue;
			}
			const leftoverW = free.width - w;
			const leftoverH = free.height - h;
			const shortSide = Math.min(leftoverW, leftoverH);
			const longSide = Math.max(leftoverW, leftoverH);
			if (
				!best ||
				shortSide < best.shortSide ||
				(shortSide === best.shortSide && longSide < best.longSide)
			) {
				best = {
					rect: { x: free.x, y: free.y, width: w, height: h },
					rotated,
					shortSide,
					longSide,
				};
			}
		}
	};
	consider(width, height, false);
	if (rotate && width !== height) {
		consider(height, width, true);
	}
	return best;
};

/**
 * Pack the given items into one page. Items are tried largest first (by
 * longest edge, then area), the order that gives MAXRECTS its best fill;
 * anything that never fits is returned in `overflow` rather than dropped
 * silently.
 * @param items - the trimmed images to place
 * @param options - page size, gaps and rotation settings
 * @returns the placed frames, the leftovers, bounds and utilization
 */
export const packAtlas = (
	items: PackerItem[],
	options: PackerOptions,
): PackResult => {
	const { maxWidth, maxHeight, padding, margin, rotate } = options;
	// each frame keeps `margin` of empty space on every side, and `padding`
	// separates neighbouring frames; the footprint adds both.
	const footprint = (item: PackerItem): [number, number] => {
		return [
			item.width + (margin + padding) * 2,
			item.height + (margin + padding) * 2,
		];
	};

	const ordered = [...items].sort((a, b) => {
		const edgeA = Math.max(a.width, a.height);
		const edgeB = Math.max(b.width, b.height);
		if (edgeA !== edgeB) {
			return edgeB - edgeA;
		}
		return b.width * b.height - a.width * a.height;
	});

	const freeRects: Rect[] = [
		{ x: 0, y: 0, width: maxWidth, height: maxHeight },
	];
	const frames: PackedFrame[] = [];
	const overflow: PackerItem[] = [];
	let usedArea = 0;

	for (const item of ordered) {
		const [footW, footH] = footprint(item);
		const placement = findPlacement(freeRects, footW, footH, rotate);
		if (!placement) {
			overflow.push(item);
			continue;
		}
		splitFreeRects(freeRects, placement.rect);
		// the stored frame keeps only margin inside it; padding lives in the
		// gap to the next frame, so it is not part of the frame rectangle.
		// Width/height follow the placed footprint: when rotated, the page
		// rect is trim.height wide and trim.width tall, so the frame swaps
		// orientation to match it (TexturePacker stores the source-oriented
		// w/h separately in the metadata layer).
		const frame: PackedFrame = {
			name: item.name,
			x: placement.rect.x + padding,
			y: placement.rect.y + padding,
			width: placement.rect.width - padding * 2,
			height: placement.rect.height - padding * 2,
			rotated: placement.rotated,
		};
		frames.push(frame);
		usedArea += item.width * item.height;
	}

	const bounds =
		frames.length === 0
			? { x: 0, y: 0, width: 0, height: 0 }
			: frames.reduce(
					(acc, frame) => ({
						x: 0,
						y: 0,
						width: Math.max(acc.width, frame.x + frame.width),
						height: Math.max(acc.height, frame.y + frame.height),
					}),
					{ x: 0, y: 0, width: 0, height: 0 },
				);

	return {
		frames,
		overflow,
		bounds,
		utilization: usedArea / (maxWidth * maxHeight),
	};
};

const contains = (outer: Rect, inner: Rect): boolean => {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
};

/**
 * Standard MAXRECTS update: every free rectangle intersected by the
 * freshly placed frame is replaced by up to four pieces (left, right,
 * top, bottom of the shared band), then rectangles contained in another
 * are pruned. The free list is rebuilt rather than spliced in place so
 * pruning cannot invalidate an iteration index.
 * @param freeRects - the current free list (mutated in place)
 * @param placed - the frame just placed
 */
const splitFreeRects = (freeRects: Rect[], placed: Rect): void => {
	const next: Rect[] = [];
	for (let i = freeRects.length - 1; i >= 0; i--) {
		const free = freeRects[i];
		if (!overlaps(free, placed)) {
			next.push(free);
			continue;
		}
		const pieces: Rect[] = [];
		// intersection: only the shared band is carved out, so every piece
		// stays inside the original free rectangle.
		const cutX = Math.max(free.x, placed.x);
		const cutY = Math.max(free.y, placed.y);
		const cutRight = Math.min(free.x + free.width, placed.x + placed.width);
		const cutBottom = Math.min(free.y + free.height, placed.y + placed.height);
		if (placed.x > free.x) {
			pieces.push({
				x: free.x,
				y: free.y,
				width: cutX - free.x,
				height: free.height,
			});
		}
		if (placed.x + placed.width < free.x + free.width) {
			pieces.push({
				x: cutRight,
				y: free.y,
				width: free.x + free.width - cutRight,
				height: free.height,
			});
		}
		// the top/bottom bands span only the shared x range; keeping the
		// free rect's full width here would reach into the placed frame.
		if (placed.y > free.y) {
			pieces.push({
				x: cutX,
				y: free.y,
				width: cutRight - cutX,
				height: cutY - free.y,
			});
		}
		if (placed.y + placed.height < free.y + free.height) {
			pieces.push({
				x: cutX,
				y: cutBottom,
				width: cutRight - cutX,
				height: free.y + free.height - cutBottom,
			});
		}
		next.push(...pieces.filter((piece) => piece.width > 0 && piece.height > 0));
	}
	// prune rectangles fully contained in another (equal rectangles are
	// duplicates, so the later index is dropped too)
	freeRects.length = 0;
	for (let i = 0; i < next.length; i++) {
		let contained = false;
		for (let j = 0; j < next.length; j++) {
			if (i !== j && contains(next[j], next[i])) {
				contained = true;
				break;
			}
		}
		if (!contained) {
			freeRects.push(next[i]);
		}
	}
};
