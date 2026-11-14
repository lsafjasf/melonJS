/**
 * melonJS — Airlock Dispatch example: play stage.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import type { Application } from "melonjs";
import { Stage } from "melonjs";
import { DispatchBoard } from "./board";

/**
 * The single scene that owns one dispatch board.
 */
export class DispatchStage extends Stage {
	private board: DispatchBoard | null = null;

	override onResetEvent(app: Application): void {
		this.board = new DispatchBoard(app);
		app.world.addChild(this.board, 1);
	}

	override onDestroyEvent(): void {
		if (this.board) {
			this.board.ancestor?.removeChild(this.board);
			this.board = null;
		}
	}
}
