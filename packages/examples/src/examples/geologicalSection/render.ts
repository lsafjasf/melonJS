/**
 * Canvas 2D rendering of the section, shared by the on-screen melonJS
 * renderable and the offscreen PNG export. Nothing here touches the engine:
 * given a 2D context, a model and a view state it paints the whole figure,
 * including margins and annotations, so an export is never cropped.
 */
import { COLS, surfacesAtAge } from "./geology";
import { getRockTexture, textureTileSize } from "./textures";
import type { InterfaceSamples, LayerDef, SectionModel } from "./types";

/** margins reserved for the title, age axis and legend */
export const MARGIN = { top: 140, right: 36, bottom: 56, left: 72 };

/**
 * Font stack with CJK fallbacks so the Chinese labels render on systems
 * that ship a Chinese font; the generic sans-serif still covers headless
 * environments that only have a Latin face.
 */
const FONT_STACK =
	'"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif';

export interface ViewState {
	/** horizontal world offset the section has been dragged to */
	panX: number;
	/** view age in Ma the time slider is parked at (0 = present) */
	viewAge: number;
	/** sea level 0..1 as a fraction of the visible relief */
	seaLevel: number;
	/** layer indices currently hidden from the drawing */
	hidden: ReadonlySet<number>;
}

export interface Geometry {
	plotX: number;
	plotY: number;
	plotW: number;
	plotH: number;
	/** world depth units per screen pixel */
	depthScale: number;
	/** columns per screen pixel */
	columnScale: number;
}

/** modelled world width in the same units as the depth samples */
export const WORLD_WIDTH = 1600;
export const WORLD_DEPTH = 860;

export const computeGeometry = (width: number, height: number): Geometry => {
	const plotX = MARGIN.left;
	const plotY = MARGIN.top;
	const plotW = Math.max(120, width - MARGIN.left - MARGIN.right);
	const plotH = Math.max(120, height - MARGIN.top - MARGIN.bottom);
	return {
		plotX,
		plotY,
		plotW,
		plotH,
		depthScale: plotH / WORLD_DEPTH,
		columnScale: plotW / COLS,
	};
};

/** screen x for a column, including the current drag offset */
export const columnToX = (
	geometry: Geometry,
	column: number,
	panX: number,
): number => geometry.plotX + panX + column * geometry.columnScale;

/** screen y for a modelled depth value */
export const depthToY = (geometry: Geometry, depth: number): number =>
	geometry.plotY + depth * geometry.depthScale;

/** inverse of columnToX, used by hover hit-testing */
export const xToColumn = (
	geometry: Geometry,
	x: number,
	panX: number,
): number => (x - geometry.plotX - panX) / geometry.columnScale;

const layerPath = (
	ctx: CanvasRenderingContext2D,
	geometry: Geometry,
	top: InterfaceSamples,
	bottom: InterfaceSamples | null,
	panX: number,
): void => {
	ctx.beginPath();
	ctx.moveTo(columnToX(geometry, 0, panX), depthToY(geometry, top[0]));
	for (let column = 1; column < COLS; column++) {
		ctx.lineTo(
			columnToX(geometry, column, panX),
			depthToY(geometry, top[column]),
		);
	}
	const lastColumn = COLS - 1;
	if (bottom) {
		for (let column = lastColumn; column >= 0; column--) {
			ctx.lineTo(
				columnToX(geometry, column, panX),
				depthToY(geometry, bottom[column]),
			);
		}
	} else {
		ctx.lineTo(
			columnToX(geometry, lastColumn, panX),
			geometry.plotY + geometry.plotH,
		);
		ctx.lineTo(columnToX(geometry, 0, panX), geometry.plotY + geometry.plotH);
	}
	ctx.closePath();
};

/**
 * Fill one layer body with its repeating procedural texture. The texture is
 * translated with the drag offset so the grain stays glued to the rock
 * instead of sliding across it.
 */
const fillLayer = (
	ctx: CanvasRenderingContext2D,
	geometry: Geometry,
	model: SectionModel,
	layer: LayerDef,
	top: InterfaceSamples,
	bottom: InterfaceSamples | null,
	view: ViewState,
): void => {
	const tile = getRockTexture(
		model.seed,
		layer.index,
		layer.rock.type,
		layer.rock.color,
	);
	ctx.save();
	layerPath(ctx, geometry, top, bottom, view.panX);
	ctx.clip();

	const pattern = ctx.createPattern(tile, "repeat");
	if (pattern) {
		const shift =
			((view.panX % textureTileSize) + textureTileSize) % textureTileSize;
		pattern.setTransform(new DOMMatrix().translate(shift, 0));
		ctx.fillStyle = pattern;
		ctx.fillRect(
			geometry.plotX - textureTileSize,
			geometry.plotY,
			geometry.plotW + textureTileSize * 2,
			geometry.plotH,
		);
	}

	// subtle top shading so the contact stands out from the texture
	ctx.globalAlpha = 0.22;
	ctx.strokeStyle = "#101418";
	ctx.lineWidth = 1.4;
	ctx.beginPath();
	ctx.moveTo(columnToX(geometry, 0, view.panX), depthToY(geometry, top[0]));
	for (let column = 1; column < COLS; column++) {
		ctx.lineTo(
			columnToX(geometry, column, view.panX),
			depthToY(geometry, top[column]),
		);
	}
	ctx.stroke();
	ctx.restore();
};

/**
 * Paint the complete figure. The same routine drives the live canvas and
 * the PNG export, so the export always includes the title, axes, legend and
 * hover-free annotation margins.
 */
export const renderSection = (
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	model: SectionModel,
	view: ViewState,
	hover: HoverInfo | null = null,
): void => {
	const geometry = computeGeometry(width, height);
	const { surfaces, deposited } = surfacesAtAge(model, view.viewAge);

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = "#0e131b";
	ctx.fillRect(0, 0, width, height);

	// plot backdrop
	ctx.fillStyle = "#141b26";
	ctx.fillRect(geometry.plotX, geometry.plotY, geometry.plotW, geometry.plotH);

	// Everything geological stays inside the plot rectangle, even while the
	// section is dragged sideways — otherwise the rock spills over the axes
	// into the page margin (and into a PNG export's edge).
	ctx.save();
	ctx.beginPath();
	ctx.rect(geometry.plotX, geometry.plotY, geometry.plotW, geometry.plotH);
	ctx.clip();

	// layers oldest-first so younger (upper) surfaces are painted on top
	for (let layerIndex = 0; layerIndex < deposited; layerIndex++) {
		if (view.hidden.has(layerIndex)) {
			continue;
		}
		const top = surfaces[layerIndex];
		const bottom = layerIndex === 0 ? null : surfaces[layerIndex - 1];
		fillLayer(
			ctx,
			geometry,
			model,
			model.layers[layerIndex],
			top,
			bottom,
			view,
		);
	}

	drawSeaAndAquifer(ctx, geometry, surfaces, view);
	drawFaults(ctx, geometry, model, surfaces, view);
	drawLabels(ctx, geometry, model, surfaces, deposited, view);
	ctx.restore();
	drawFrame(ctx, geometry);
	drawLegend(ctx, geometry, model, view, width);
	drawHeader(ctx, model, view, width);

	if (hover) {
		drawHover(ctx, hover, width, height);
	}
};

/**
 * Render to a fresh offscreen canvas and trigger a PNG download. The
 * offscreen canvas keeps the full annotation margins, guaranteeing the
 * exported image is not cropped.
 */
export const exportSectionPNG = (
	model: SectionModel,
	view: ViewState,
	fileName: string,
	width = 1600,
	height = 900,
): void => {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}
	renderSection(ctx, width, height, model, view, null);
	canvas.toBlob((blob) => {
		if (!blob) {
			return;
		}
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = fileName;
		anchor.click();
		URL.revokeObjectURL(url);
	}, "image/png");
};

const drawFrame = (ctx: CanvasRenderingContext2D, geometry: Geometry): void => {
	ctx.strokeStyle = "rgba(220,228,236,0.55)";
	ctx.lineWidth = 1;
	ctx.strokeRect(
		geometry.plotX,
		geometry.plotY,
		geometry.plotW,
		geometry.plotH,
	);

	// depth axis with 100 m ticks
	ctx.fillStyle = "#aeb9c6";
	ctx.font = `11px ${FONT_STACK}`;
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	for (let depth = 0; depth <= WORLD_DEPTH; depth += 100) {
		const y = depthToY(geometry, depth);
		ctx.strokeStyle = "rgba(220,228,236,0.25)";
		ctx.beginPath();
		ctx.moveTo(geometry.plotX - 5, y);
		ctx.lineTo(geometry.plotX, y);
		ctx.stroke();
		ctx.fillText(`${depth} m`, geometry.plotX - 9, y);
	}

	// horizontal distance ticks
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	for (let column = 0; column <= COLS; column += 20) {
		const x = columnToX(geometry, column, 0);
		ctx.strokeStyle = "rgba(220,228,236,0.25)";
		ctx.beginPath();
		ctx.moveTo(x, geometry.plotY + geometry.plotH);
		ctx.lineTo(x, geometry.plotY + geometry.plotH + 5);
		ctx.stroke();
		ctx.fillText(
			`${Math.round((column / COLS) * WORLD_WIDTH)} m`,
			x,
			geometry.plotY + geometry.plotH + 9,
		);
	}
};

/** Sea fill down to the current sea level, plus the saturated aquifer band. */
const drawSeaAndAquifer = (
	ctx: CanvasRenderingContext2D,
	geometry: Geometry,
	surfaces: InterfaceSamples[],
	view: ViewState,
): void => {
	const top = surfaces[surfaces.length - 1];
	if (!top) {
		return;
	}
	// Sea level is expressed relative to the section's current relief:
	// 0 sits at the highest ground, 1 at the deepest valley floor. Moving
	// the slider therefore floods valleys first and shifts the aquifer up,
	// instead of drowning the whole section from a fixed absolute depth.
	let minDepth = Number.POSITIVE_INFINITY;
	let maxDepth = 0;
	for (let column = 0; column < COLS; column++) {
		minDepth = Math.min(minDepth, top[column]);
		maxDepth = Math.max(maxDepth, top[column]);
	}
	const seaDepth = minDepth + view.seaLevel * (maxDepth - minDepth);

	// The aquifer's water table tracks the relief and rises with sea level,
	// from 70 m below the surface down to 12 m below it.
	const waterTableOffset = 70 - view.seaLevel * 58;
	ctx.save();
	ctx.beginPath();
	ctx.rect(geometry.plotX, geometry.plotY, geometry.plotW, geometry.plotH);
	ctx.clip();
	ctx.fillStyle = "rgba(46,138,214,0.22)";
	ctx.beginPath();
	let started = false;
	for (let column = 0; column < COLS; column++) {
		const x = columnToX(geometry, column, view.panX);
		const y = depthToY(geometry, top[column] + Math.max(0, waterTableOffset));
		if (!started) {
			ctx.moveTo(x, y);
			started = true;
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.lineTo(
		columnToX(geometry, COLS - 1, view.panX),
		geometry.plotY + geometry.plotH,
	);
	ctx.lineTo(
		columnToX(geometry, 0, view.panX),
		geometry.plotY + geometry.plotH,
	);
	ctx.closePath();
	ctx.fill();

	// Sea water: fills valleys that dip below the sea level surface.
	const seaY = depthToY(geometry, seaDepth);
	ctx.fillStyle = "rgba(38,110,205,0.4)";
	const flooded: number[] = [];
	for (let column = 0; column < COLS; column++) {
		if (top[column] < seaDepth) {
			flooded.push(column);
		}
	}
	// Each contiguous run of flooded columns becomes its own closed polygon:
	// a flat sea surface over the valley, the ground profile underneath.
	let runStart = 0;
	while (runStart < flooded.length) {
		let runEnd = runStart;
		while (
			runEnd + 1 < flooded.length &&
			flooded[runEnd + 1] === flooded[runEnd] + 1
		) {
			runEnd++;
		}
		ctx.beginPath();
		ctx.moveTo(columnToX(geometry, flooded[runStart], view.panX), seaY);
		for (let i = runStart; i <= runEnd; i++) {
			const column = flooded[i];
			ctx.lineTo(
				columnToX(geometry, column, view.panX),
				depthToY(geometry, top[column]),
			);
		}
		ctx.lineTo(columnToX(geometry, flooded[runEnd], view.panX), seaY);
		ctx.closePath();
		ctx.fill();
		runStart = runEnd + 1;
	}

	// sea level line
	ctx.strokeStyle = "rgba(125,196,255,0.9)";
	ctx.setLineDash([7, 5]);
	ctx.lineWidth = 1.4;
	ctx.beginPath();
	const firstFlood = flooded[0];
	const lastFlood = flooded[flooded.length - 1];
	if (firstFlood !== undefined && lastFlood !== undefined) {
		ctx.moveTo(columnToX(geometry, firstFlood, view.panX), seaY);
		ctx.lineTo(columnToX(geometry, lastFlood, view.panX), seaY);
	}
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.restore();
};

/** Fault planes: one tilted line per fault, drawn through every contact. */
const drawFaults = (
	ctx: CanvasRenderingContext2D,
	geometry: Geometry,
	model: SectionModel,
	surfaces: InterfaceSamples[],
	view: ViewState,
): void => {
	const top = surfaces[surfaces.length - 1];
	const bottom = surfaces[0];
	if (!top || !bottom) {
		return;
	}
	model.faults.forEach((fault, index) => {
		if (fault.age > view.viewAge + 1e-6) {
			return;
		}
		const topY = depthToY(geometry, top[fault.column] ?? 0);
		const baseDepth = bottom[fault.column] ?? WORLD_DEPTH;
		const bottomY = depthToY(geometry, Math.min(WORLD_DEPTH, baseDepth + 80));
		const topX = columnToX(geometry, fault.column, view.panX);
		const bottomX = topX + fault.dipColumns * geometry.columnScale;

		ctx.save();
		ctx.strokeStyle = "#ff5d5d";
		ctx.lineWidth = 2;
		ctx.setLineDash([9, 5]);
		ctx.beginPath();
		ctx.moveTo(topX, topY - 6);
		ctx.lineTo(bottomX, bottomY);
		ctx.stroke();
		ctx.setLineDash([]);

		// teeth on the down-thrown side
		const down = fault.throwAmount >= 0 ? 1 : -1;
		ctx.fillStyle = "#ff5d5d";
		for (let step = 1; step <= 4; step++) {
			const t = step / 5;
			const x = topX + (bottomX - topX) * t;
			const y = topY + (bottomY - topY) * t;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + 7 * down, y + 5);
			ctx.lineTo(x, y + 10);
			ctx.closePath();
			ctx.fill();
		}

		ctx.font = `bold 11px ${FONT_STACK}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		ctx.fillStyle = "#ff8a8a";
		ctx.fillText(`F${index + 1}`, topX, topY - 9);
		ctx.restore();
	});
};

const drawLabels = (
	ctx: CanvasRenderingContext2D,
	geometry: Geometry,
	model: SectionModel,
	surfaces: InterfaceSamples[],
	deposited: number,
	view: ViewState,
): void => {
	ctx.save();
	ctx.font = `11px ${FONT_STACK}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";

	for (let layerIndex = 0; layerIndex < deposited; layerIndex++) {
		const layer = model.layers[layerIndex];
		if (view.hidden.has(layerIndex)) {
			continue;
		}
		const top = surfaces[layerIndex];
		const bottom = layerIndex === 0 ? null : surfaces[layerIndex - 1];
		const labelColumn = Math.floor(COLS * 0.08);
		const x = columnToX(geometry, labelColumn, view.panX);
		const topDepth = top[labelColumn];
		const bottomDepth = bottom ? bottom[labelColumn] : topDepth + 60;
		const y = depthToY(geometry, (topDepth + bottomDepth) / 2);
		if (
			x < geometry.plotX ||
			x > geometry.plotX + geometry.plotW ||
			y < geometry.plotY ||
			y > geometry.plotY + geometry.plotH
		) {
			continue;
		}
		const label = `${layer.name} · ${layer.rock.label.split(" ")[0]}`;
		const width = ctx.measureText(label).width;
		ctx.fillStyle = "rgba(12,16,22,0.72)";
		ctx.fillRect(x - 6, y - 9, width + 12, 18);
		ctx.fillStyle = "#e8eef5";
		ctx.fillText(label, x, y);
	}
	ctx.restore();
};

const drawLegend = (
	ctx: CanvasRenderingContext2D,
	geometry: Geometry,
	model: SectionModel,
	view: ViewState,
	width: number,
): void => {
	ctx.save();
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.font = `bold 12px ${FONT_STACK}`;
	ctx.fillStyle = "#e8eef5";
	const left = MARGIN.left;
	// keep the legend clear of the DOM control panel docked on the right
	const right = Math.min(geometry.plotX + geometry.plotW, width - 288);
	let x = left;
	let y = 74;
	ctx.fillText("图例 Legend", x, y);
	x += ctx.measureText("图例 Legend").width + 14;
	ctx.font = `11px ${FONT_STACK}`;
	for (const layer of model.layers) {
		const hidden = view.hidden.has(layer.index);
		const label = `${layer.name} ${layer.rock.label.split(" ")[0]}${
			hidden ? " (隐藏)" : ""
		}`;
		const itemWidth = 20 + ctx.measureText(label).width + 12;
		if (x + itemWidth > right) {
			x = left;
			y += 20;
		}
		ctx.globalAlpha = hidden ? 0.35 : 1;
		ctx.fillStyle = layer.rock.color;
		ctx.fillRect(x, y - 7, 14, 14);
		ctx.strokeStyle = "rgba(255,255,255,0.4)";
		ctx.strokeRect(x, y - 7, 14, 14);
		ctx.fillStyle = "#d5dde7";
		ctx.fillText(label, x + 18, y);
		x += itemWidth;
		ctx.globalAlpha = 1;
	}

	x += 6;
	ctx.strokeStyle = "#ff5d5d";
	ctx.setLineDash([6, 4]);
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + 16, y);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.fillStyle = "#d5dde7";
	ctx.fillText("断层 Fault", x + 21, y);
	x += 21 + ctx.measureText("断层 Fault").width + 18;

	ctx.fillStyle = "rgba(38,110,205,0.55)";
	ctx.fillRect(x, y - 7, 16, 14);
	ctx.fillStyle = "#d5dde7";
	ctx.fillText("海水/含水层 Sea/Aquifer", x + 21, y);
	x += 21 + ctx.measureText("海水/含水层 Sea/Aquifer").width + 18;

	ctx.font = `10px ${FONT_STACK}`;
	ctx.fillStyle = "#8fa0b2";
	ctx.fillText(`seed: ${model.seed} · ${model.seedHash.toString(16)}`, x, y);
	ctx.restore();
};

const drawHeader = (
	ctx: CanvasRenderingContext2D,
	model: SectionModel,
	view: ViewState,
	width: number,
): void => {
	ctx.save();
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.font = `bold 17px ${FONT_STACK}`;
	ctx.fillStyle = "#f0f4f8";
	ctx.fillText("沉积岩地层剖面 · Sedimentary Cross-Section", MARGIN.left, 30);

	ctx.font = `12px ${FONT_STACK}`;
	ctx.fillStyle = "#9fb2c5";
	const ageText =
		view.viewAge <= 0
			? "现今 Present (0 Ma)"
			: `回溯 ${view.viewAge.toFixed(1)} Ma 前`;
	ctx.fillText(
		`${ageText} · 海平面 ${Math.round(view.seaLevel * 100)}% · 共 ${model.layers.length} 层 / 2 断层 / 3 侵蚀`,
		MARGIN.left,
		50,
	);

	ctx.textAlign = "right";
	ctx.fillText(
		`横向拖动浏览 · ${width}px 导出无裁切`,
		width - MARGIN.right,
		30,
	);
	ctx.restore();
};

export interface HoverInfo {
	x: number;
	y: number;
	layer: LayerDef;
	column: number;
	localThickness: number;
}

/** Find the layer under a screen point, accounting for hidden layers. */
export const hitTest = (
	model: SectionModel,
	surfaces: InterfaceSamples[],
	deposited: number,
	geometry: Geometry,
	view: ViewState,
	x: number,
	y: number,
): HoverInfo | null => {
	const column = Math.round(xToColumn(geometry, x, view.panX));
	if (column < 0 || column >= COLS) {
		return null;
	}
	const depth = (y - geometry.plotY) / geometry.depthScale;
	for (let layerIndex = 0; layerIndex < deposited; layerIndex++) {
		if (view.hidden.has(layerIndex)) {
			continue;
		}
		const topDepth = surfaces[layerIndex][column];
		const bottomDepth =
			layerIndex === 0 ? WORLD_DEPTH : surfaces[layerIndex - 1][column];
		if (depth >= topDepth && depth <= bottomDepth) {
			return {
				x,
				y,
				layer: model.layers[layerIndex],
				column,
				localThickness: bottomDepth - topDepth,
			};
		}
	}
	return null;
};

const drawHover = (
	ctx: CanvasRenderingContext2D,
	info: HoverInfo,
	width: number,
	height: number,
): void => {
	const lines = [
		`${info.layer.name} ${info.layer.rock.label}`,
		`年代 Age: ${info.layer.ageTop}–${info.layer.ageBase} Ma`,
		`硬度 Hardness: ${info.layer.hardness} Mohs`,
		`此处厚度 Thickness: ${info.localThickness.toFixed(1)} m`,
		`平均厚度 Avg: ${info.layer.meanThickness} m`,
	];
	ctx.save();
	ctx.font = `12px ${FONT_STACK}`;
	const boxWidth =
		Math.max(...lines.map((line) => ctx.measureText(line).width)) + 22;
	const boxHeight = lines.length * 18 + 12;
	const boxX = Math.min(width - boxWidth - 8, info.x + 16);
	const boxY = Math.max(
		8,
		Math.min(height - boxHeight - 8, info.y - boxHeight - 12),
	);
	ctx.fillStyle = "rgba(10,14,20,0.9)";
	ctx.strokeStyle = "rgba(150,180,215,0.6)";
	ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
	ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	lines.forEach((line, index) => {
		ctx.fillStyle = index === 0 ? "#ffd98a" : "#e6edf5";
		ctx.fillText(line, boxX + 11, boxY + 16 + index * 18);
	});
	ctx.restore();
};
