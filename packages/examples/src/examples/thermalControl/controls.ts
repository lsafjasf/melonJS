/**
 * melonJS — Thermal Control example: interactive controls.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { CanvasRenderer, Pointer, WebGLRenderer } from "melonjs";
import { Container, event, input, Renderable, RoundRect, Text } from "melonjs";
import type { CompartmentId, ThermalSim } from "./simulation";

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

type Renderer = CanvasRenderer | WebGLRenderer;

/**
 * A vertical slider. Draws the target value as the filled track and the
 * physically-followed actual value as a bright marker, so the valve
 * overshoot is visible while the mechanism settles.
 */
export class ValveSlider extends Renderable {
	private getValue: () => number;
	private setValue: (v: number) => void;
	private getActual: () => number;
	private accent: string;
	private dragging = false;
	private onGlobalMove = (pointer: Pointer) => {
		if (this.dragging) {
			this.setFromY(pointer.gameWorldY);
		}
	};

	constructor(
		x: number,
		y: number,
		w: number,
		h: number,
		accent: string,
		getValue: () => number,
		setValue: (v: number) => void,
		getActual: () => number,
	) {
		super(x, y, w, h);
		this.anchorPoint.set(0, 0);
		this.accent = accent;
		this.getValue = getValue;
		this.setValue = setValue;
		this.getActual = getActual;
		this.isKinematic = false;
	}

	private setFromY(worldY: number) {
		this.setValue(clamp01(1 - (worldY - this.pos.y) / this.height));
	}

	override onActivateEvent() {
		input.registerPointerEvent("pointerdown", this, (e) => {
			this.dragging = true;
			this.setFromY(e.gameWorldY);
			return false;
		});
		// the region receives the release of a press made on it,
		// even when the pointer is let go outside the track
		input.registerPointerEvent("pointerup", this, () => {
			this.dragging = false;
			return false;
		});
		event.on(event.POINTERMOVE, this.onGlobalMove);
	}

	override onDeactivateEvent() {
		input.releasePointerEvent("pointerdown", this);
		input.releasePointerEvent("pointerup", this);
		event.off(event.POINTERMOVE, this.onGlobalMove);
	}

	override update() {
		return true;
	}

	override draw(renderer: Renderer) {
		const { x, y } = this.pos;
		const w = this.width;
		const h = this.height;
		const value = clamp01(this.getValue());
		const actual = clamp01(this.getActual());
		// track
		renderer.setColor("#10151d");
		renderer.fill(new RoundRect(x, y, w, h, 6));
		// filled portion up to the target value
		renderer.setColor(this.accent);
		const fillH = value * h;
		if (fillH > 2) {
			renderer.fill(new RoundRect(x + 3, y + h - fillH, w - 6, fillH - 3, 4));
		}
		// handle at the target
		renderer.setColor("#e8eef6");
		renderer.fillRect(x - 4, y + h - value * h - 3, w + 8, 6);
		// actual valve position marker (lags and overshoots the handle)
		renderer.setColor("#ffd75e");
		const ay = y + h - actual * h;
		renderer.fillRect(x + w + 6, ay - 2, 8, 4);
		renderer.strokeRect(x, y, w, h);
	}
}

/** A clickable labelled button with a status color. */
export class TextButton extends Container {
	protected caption: Text;
	private fillColor = "#2a3444";
	private onClick: () => void;

	constructor(
		x: number,
		y: number,
		w: number,
		h: number,
		text: string,
		onClick: () => void,
	) {
		super(x, y, w, h);
		this.onClick = onClick;
		this.caption = this.addChild(
			new Text(w / 2, h / 2, {
				font: "Noto Sans CJK SC, Microsoft YaHei, PingFang SC, Arial, sans-serif",
				size: 13,
				fillStyle: "#e8eef6",
				text,
				textAlign: "center",
				textBaseline: "middle",
			}),
		);
	}

	setColor(color: string) {
		this.fillColor = color;
	}

	override onActivateEvent() {
		input.registerPointerEvent("pointerdown", this, () => {
			this.onClick();
			return false;
		});
	}

	override onDeactivateEvent() {
		input.releasePointerEvent("pointerdown", this);
	}

	override draw(renderer: Renderer) {
		renderer.setColor(this.fillColor);
		renderer.fill(
			new RoundRect(this.pos.x, this.pos.y, this.width, this.height, 6),
		);
		renderer.setColor("#8d9db5");
		renderer.stroke(
			new RoundRect(this.pos.x, this.pos.y, this.width, this.height, 6),
		);
		super.draw(renderer);
	}
}

/** Toggles one device of a compartment; greys out while that bay is offline. */
export class DeviceButton extends TextButton {
	private sim: ThermalSim;
	private compId: CompartmentId;
	private deviceId: string;

	constructor(
		x: number,
		y: number,
		sim: ThermalSim,
		compId: CompartmentId,
		deviceId: string,
	) {
		super(x, y, 132, 26, "", () => sim.toggleDevice(compId, deviceId));
		this.sim = sim;
		this.compId = compId;
		this.deviceId = deviceId;
	}

	override update(dt: number) {
		const c = this.sim.compartments[this.compId];
		const d = c.devices.find((dev) => dev.id === this.deviceId);
		if (d) {
			const state = c.offline ? "断电" : d.on ? "运行" : "关闭";
			this.caption.setText(`${d.label} · ${state}`);
			this.setColor(
				c.offline
					? "#3a2020"
					: !d.toggleable
						? "#2a3444"
						: d.on
							? "#1f4d2e"
							: "#4d2a1f",
			);
		}
		return super.update(dt);
	}
}
