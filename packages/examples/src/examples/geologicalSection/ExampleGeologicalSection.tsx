/**
 * melonJS — procedural sedimentary cross-section.
 *
 * The page opens straight onto a horizontally draggable rock section, not a
 * menu. A seeded model produces 8–12 sedimentary layers, two coherent faults
 * and three erosion events over 20 Ma. All rock textures (grain, fractures,
 * caves) are painted on offscreen Canvas 2D tiles — no image assets exist.
 * The engine runs with the Canvas renderer and a single custom Renderable;
 * DOM handles the time slider, sea-level slider, legend/layer toggles and
 * the PNG export.
 */
import { Application, type CanvasRenderer, Renderable, video } from "melonjs";
import { createExampleComponent } from "../utils";
import { generateSection, surfacesAtAge } from "./geology";
import { createPanel } from "./panel";
import {
	computeGeometry,
	type HoverInfo,
	hitTest,
	renderSection,
	type ViewState,
} from "./render";
import type { SectionModel } from "./types";

const WIDTH = 1280;
const HEIGHT = 760;
/** how much wider the modelled world is than one screen of plot width */
const PAN_OVERSHOOT = 0.9;

const createGame = async () => {
	const app = new Application(WIDTH, HEIGHT, {
		parent: "screen",
		renderer: video.CANVAS,
		backgroundColor: "#0e131b",
	});
	await app.init();

	const renderer = app.renderer as CanvasRenderer;
	const canvas = renderer.getCanvas();

	let model: SectionModel = generateSection("melon-2026");
	const view: ViewState = {
		panX: 0,
		viewAge: 0,
		seaLevel: 0.35,
		hidden: new Set<number>(),
	};
	let hover: HoverInfo | null = null;

	const maxPan = () => {
		const geometry = computeGeometry(WIDTH, HEIGHT);
		return geometry.plotW * PAN_OVERSHOOT;
	};

	class SectionRenderable extends Renderable {
		constructor() {
			super(0, 0, WIDTH, HEIGHT);
			this.anchorPoint.set(0, 0);
		}

		override draw(activeRenderer: CanvasRenderer) {
			const ctx = activeRenderer.getContext();
			renderSection(ctx, WIDTH, HEIGHT, model, view, hover);
		}
	}

	app.world.addChild(new SectionRenderable());

	// ── drag to pan + hover tooltip ────────────────────────────────────────
	let dragging = false;
	let dragStartX = 0;
	let dragStartPan = 0;

	const pointerToCanvas = (event: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		return {
			x: (event.clientX - rect.left) * scaleX,
			y: (event.clientY - rect.top) * scaleY,
		};
	};

	const onPointerDown = (event: PointerEvent) => {
		dragging = true;
		dragStartX = event.clientX;
		dragStartPan = view.panX;
		canvas.setPointerCapture(event.pointerId);
		canvas.style.cursor = "grabbing";
	};

	const onPointerMove = (event: PointerEvent) => {
		const point = pointerToCanvas(event);
		if (dragging) {
			const delta = event.clientX - dragStartX;
			const scaleX = canvas.width / canvas.getBoundingClientRect().width;
			view.panX = Math.max(
				-maxPan(),
				Math.min(0, dragStartPan + delta * scaleX),
			);
			return;
		}
		const geometry = computeGeometry(WIDTH, HEIGHT);
		const { surfaces, deposited } = surfacesAtAge(model, view.viewAge);
		hover = hitTest(
			model,
			surfaces,
			deposited,
			geometry,
			view,
			point.x,
			point.y,
		);
		canvas.style.cursor = hover ? "crosshair" : "grab";
	};

	const endDrag = (event: PointerEvent) => {
		if (!dragging) {
			return;
		}
		dragging = false;
		canvas.style.cursor = "grab";
		if (canvas.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}
	};

	const onPointerLeave = () => {
		hover = null;
	};

	canvas.style.cursor = "grab";
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", endDrag);
	canvas.addEventListener("pointercancel", endDrag);
	canvas.addEventListener("pointerleave", onPointerLeave);

	// ── DOM control panel ──────────────────────────────────────────────────
	const panelParent = canvas.parentElement;
	panelParent?.style.setProperty("position", "relative");
	const teardownPanel = panelParent
		? createPanel(panelParent, model, view, {
				onSeedChange: (seed) => {
					model = generateSection(seed);
					view.hidden = new Set<number>();
					view.panX = 0;
					hover = null;
					// expose the regenerated model for acceptance checks
					(window as unknown as Record<string, unknown>).__geoSection = {
						model,
						view,
						renderSection,
						hitTest,
						surfacesAtAge,
						computeGeometry,
						WIDTH,
						HEIGHT,
					};
				},
				onViewChange: (patch) => {
					Object.assign(view, patch);
				},
				getState: () => ({ model, view }),
			})
		: () => undefined;

	(window as unknown as Record<string, unknown>).__geoSection = {
		model,
		view,
		renderSection,
		hitTest,
		surfacesAtAge,
		computeGeometry,
		WIDTH,
		HEIGHT,
	};

	return () => {
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerup", endDrag);
		canvas.removeEventListener("pointercancel", endDrag);
		canvas.removeEventListener("pointerleave", onPointerLeave);
		teardownPanel();
		delete (window as unknown as Record<string, unknown>).__geoSection;
	};
};

export const ExampleGeologicalSection = createExampleComponent(createGame);
