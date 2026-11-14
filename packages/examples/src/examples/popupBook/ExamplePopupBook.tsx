/**
 * melonJS — 2.5D pop-up book scene editor.
 *
 * Every visual inside the book is drawn with Canvas paths. The editor exposes
 * four paper layers, a movable light, four keyframes over a ten-second loop,
 * JSON project round-tripping and a clean PNG export.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	Application,
	type CanvasRenderer,
	Renderable,
	video,
	type WebGLRenderer,
} from "melonjs";
import { createRoot } from "react-dom/client";
import { createExampleComponent } from "../utils";
import { EditorUI } from "./EditorUI";
import { BookEditor } from "./editor-store";
import { SCENE_HEIGHT, SCENE_WIDTH } from "./project";
import { createSceneCaches, type SceneCaches } from "./scene-art";
import { drawScene } from "./scene-render";
import "./popupBook.css";

class PopupBookStage extends Renderable {
	private lastRevision = -1;

	constructor(
		private readonly editor: BookEditor,
		private readonly caches: SceneCaches,
	) {
		super(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
		this.anchorPoint.set(0, 0);
		this.floating = true;
		this.isKinematic = false;
		this.alwaysUpdate = true;
	}

	override update(deltaMs: number) {
		this.editor.tick(deltaMs);
		return (
			this.editor.playing || this.editor.getRevision() !== this.lastRevision
		);
	}

	override draw(renderer: CanvasRenderer | WebGLRenderer) {
		if (renderer.type !== "CANVAS") {
			return;
		}
		this.lastRevision = this.editor.getRevision();
		const canvasRenderer = renderer as CanvasRenderer;
		const context = canvasRenderer.getContext() as CanvasRenderingContext2D;
		renderer.save();
		context.setTransform(1, 0, 0, 1, 0, 0);
		drawScene(
			context,
			this.editor.project,
			this.editor.getPose(),
			this.caches,
			this.editor.parallaxX,
			this.editor.parallaxY,
		);
		renderer.restore();
	}
}

const downloadBlob = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1200);
};

const createGame = async () => {
	const body = document.body;
	const screen = document.getElementById("screen");
	body.classList.add("pb-open");

	let app: Application;
	try {
		app = new Application(SCENE_WIDTH, SCENE_HEIGHT, {
			parent: "screen",
			renderer: video.CANVAS,
			scale: "auto",
			scaleMethod: "fit",
			antiAlias: true,
			backgroundColor: "#111219",
			...(screen ? { scaleTarget: screen } : {}),
		});
		await app.init();
	} catch (error) {
		body.classList.remove("pb-open");
		throw error;
	}

	app.world.backgroundColor.parseCSS("#111219");
	const editor = new BookEditor();
	const caches = createSceneCaches();
	app.world.addChild(new PopupBookStage(editor, caches), 0);

	const canvas = (app.renderer as CanvasRenderer).getCanvas();
	canvas.id = "popup-book-canvas";
	canvas.dataset.testid = "popup-book-canvas";
	canvas.setAttribute(
		"aria-label",
		"2.5D pop-up book stage. Drag the scene for parallax or drag the lamp to relight it.",
	);

	const pointFromEvent = (event: PointerEvent) => {
		const bounds = canvas.getBoundingClientRect();
		return {
			x: ((event.clientX - bounds.left) / bounds.width) * SCENE_WIDTH,
			y: ((event.clientY - bounds.top) / bounds.height) * SCENE_HEIGHT,
		};
	};

	let dragMode: "stage" | "light" | null = null;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let startParallaxX = 0;
	let startParallaxY = 0;

	const onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0 || pointerId !== null) {
			return;
		}
		event.preventDefault();
		editor.pauseAtCurrent();
		const point = pointFromEvent(event);
		const pose = editor.getPose();
		const nearLight =
			Math.hypot(point.x - pose.lightX, point.y - pose.lightY) <= 42;
		dragMode = nearLight ? "light" : "stage";
		pointerId = event.pointerId;
		startX = point.x;
		startY = point.y;
		startParallaxX = editor.parallaxX;
		startParallaxY = editor.parallaxY;
		canvas.setPointerCapture(event.pointerId);
		canvas.classList.add("pb-dragging");
		if (dragMode === "light") {
			editor.setLightPosition(point.x, point.y);
		}
	};

	const onPointerMove = (event: PointerEvent) => {
		const point = pointFromEvent(event);
		if (pointerId === null) {
			const pose = editor.getPose();
			const nearLight =
				Math.hypot(point.x - pose.lightX, point.y - pose.lightY) <= 42;
			canvas.style.cursor = nearLight ? "move" : "grab";
			return;
		}
		if (event.pointerId !== pointerId) {
			return;
		}
		if (dragMode === "light") {
			editor.setLightPosition(point.x, point.y);
			return;
		}
		editor.setParallax(
			startParallaxX + (point.x - startX) * 0.82,
			startParallaxY + (point.y - startY) * 0.46,
		);
	};

	const finishDrag = (event: PointerEvent) => {
		if (event.pointerId !== pointerId) {
			return;
		}
		if (canvas.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}
		pointerId = null;
		dragMode = null;
		canvas.classList.remove("pb-dragging");
		canvas.style.cursor = "grab";
	};

	const onDoubleClick = () => {
		editor.resetParallax();
	};

	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", finishDrag);
	canvas.addEventListener("pointercancel", finishDrag);
	canvas.addEventListener("dblclick", onDoubleClick);

	const saveProject = () => {
		downloadBlob(
			new Blob([editor.serialize()], { type: "application/json" }),
			"popup-book-project.json",
		);
		editor.setNotice("Project saved as popup-book-project.json");
	};

	const loadProject = async (file: File) => {
		try {
			const text = await file.text();
			editor.loadProjectJson(text);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			editor.setNotice(`Load failed: ${reason}`);
		}
	};

	const exportScreenshot = async () => {
		// Let the current editor state reach the live canvas first.
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
		const blob = await app.renderer.toBlob("image/png");
		downloadBlob(blob, "popup-book-scene.png");
		editor.setNotice("Screenshot exported as popup-book-scene.png");
	};

	const uiHost = document.createElement("div");
	uiHost.id = "popup-book-ui";
	document.body.appendChild(uiHost);
	const root = createRoot(uiHost);
	root.render(
		<EditorUI
			editor={editor}
			onSave={saveProject}
			onLoadFile={loadProject}
			onExport={exportScreenshot}
		/>,
	);

	return () => {
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerup", finishDrag);
		canvas.removeEventListener("pointercancel", finishDrag);
		canvas.removeEventListener("dblclick", onDoubleClick);
		if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
			canvas.releasePointerCapture(pointerId);
		}
		root.unmount();
		uiHost.remove();
		editor.dispose();
		body.classList.remove("pb-open");
	};
};

export const ExamplePopupBook = createExampleComponent(createGame);
