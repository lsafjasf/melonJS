/**
 * melonJS — Thermal Control example: play and end screens.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { CanvasRenderer, WebGLRenderer } from "melonjs";
import {
	type Application,
	Container,
	input,
	Renderable,
	RoundRect,
	Stage,
	state,
	Text,
} from "melonjs";
import { DeviceButton, TextButton, ValveSlider } from "./controls";
import { GameHud } from "./hud";
import { type OverheatRecord, ThermalSim } from "./simulation";
import { SoundController } from "./sound";
import {
	COMP_RECTS,
	RADIATOR_SLIDER,
	ShipView,
	VALVE_SLIDERS,
	VIEW_H,
	VIEW_W,
} from "./view";

type Renderer = CanvasRenderer | WebGLRenderer;

export interface GameResult {
	won: boolean;
	reason: string;
	time: number;
	coolant: number;
	battery: number;
	overheatCount: number;
	firstOverheat: OverheatRecord | null;
}

// test hook: the live simulation, readable from the browser console
export const testHook: { sim: ThermalSim | null } = { sim: null };

export class PlayScreen extends Stage {
	private sim!: ThermalSim;
	private sound = new SoundController();

	override onResetEvent(app: Application) {
		this.sim = new ThermalSim();
		this.sound = new SoundController();
		testHook.sim = this.sim;
		const sim = this.sim;

		app.world.addChild(new ShipView(sim), 0);

		// coolant valve sliders, one per compartment
		for (const c of sim.list) {
			const s = VALVE_SLIDERS[c.id];
			app.world.addChild(
				new ValveSlider(
					s.x,
					s.y,
					s.w,
					s.h,
					"#2e9ec8",
					() => c.valveTarget,
					(v) => {
						c.valveTarget = v;
					},
					() => c.valveActual,
				),
				10,
			);
		}
		// radiator deployment slider
		app.world.addChild(
			new ValveSlider(
				RADIATOR_SLIDER.x,
				RADIATOR_SLIDER.y,
				RADIATOR_SLIDER.w,
				RADIATOR_SLIDER.h,
				"#78c8eb",
				() => sim.radiatorTarget,
				(v) => {
					sim.radiatorTarget = v;
				},
				() => sim.radiatorActual,
			),
			10,
		);
		// device switches, laid out along the bottom of each compartment
		for (const c of sim.list) {
			const r = COMP_RECTS[c.id];
			const n = c.devices.length;
			c.devices.forEach((d, i) => {
				const w = 132;
				const x = r.x + r.w / 2 + (i - (n - 1) / 2) * (w + 10) - w / 2;
				app.world.addChild(
					new DeviceButton(x, r.y + r.h - 40, sim, c.id, d.id),
					10,
				);
			});
		}
		app.world.addChild(new GameHud(sim), 20);
	}

	override update(dt: number) {
		this.sim.update(dt);
		this.sound.update(dt, this.sim);
		if (this.sim.status !== "running") {
			const sim = this.sim;
			const result: GameResult = {
				won: sim.status === "won",
				reason: sim.loseReason,
				time: sim.t,
				coolant: sim.coolant,
				battery: sim.battery,
				overheatCount: sim.overheatLog.length,
				firstOverheat: sim.firstOverheat,
			};
			state.change(
				sim.status === "won" ? state.GAME_END : state.GAMEOVER,
				false,
				result,
			);
		}
		return super.update(dt);
	}
}

/** dark backdrop + mini ship diagram with the first overheat point flashing */
class EndView extends Renderable {
	private result: GameResult;
	private phase = 0;

	constructor(result: GameResult) {
		super(0, 0, VIEW_W, VIEW_H);
		this.anchorPoint.set(0, 0);
		this.result = result;
	}

	override update(dt: number) {
		this.phase += dt / 1000;
		return true;
	}

	override draw(renderer: Renderer) {
		renderer.setColor("rgba(6,8,12,0.92)");
		renderer.fillRect(0, 0, VIEW_W, VIEW_H);
		// mini ship: the three compartments, first overheat flashes red
		const ids = ["crew", "equipment", "propulsion"] as const;
		const first = this.result.firstOverheat;
		ids.forEach((id, i) => {
			const x = 440 + i * 150;
			const isFirst = first?.compartment === id;
			const flash = isFirst && Math.floor(this.phase * 3) % 2 === 0;
			renderer.setColor(flash ? "#ff4030" : isFirst ? "#7a2018" : "#232c3a");
			renderer.fill(new RoundRect(x, 300, 120, 90, 10));
			renderer.setColor(flash ? "#ffd75e" : "#8d9db5");
			renderer.stroke(new RoundRect(x, 300, 120, 90, 10));
		});
	}
}

export class EndScreen extends Stage {
	private result!: GameResult;

	override onResetEvent(app: Application, ...args: unknown[]) {
		this.result = args[0] as GameResult;
		const result = this.result;

		app.world.addChild(new EndView(result), 0);

		const panel = new Container(0, 0, VIEW_W, VIEW_H);
		const add = (t: Text) => panel.addChild(t);
		const line = (y: number, size: number, text: string, color = "#e8eef6") =>
			add(
				new Text(VIEW_W / 2, y, {
					font: "Noto Sans CJK SC, Microsoft YaHei, PingFang SC, Arial, sans-serif",
					size,
					fillStyle: color,
					text,
					textAlign: "center",
					textBaseline: "middle",
				}),
			);

		line(
			120,
			40,
			result.won ? "任务成功" : "任务失败",
			result.won ? "#5ee08a" : "#ff6050",
		);
		line(170, 18, result.won ? "飞船安全通过日照区" : result.reason, "#c8d4e2");

		const first = result.firstOverheat;
		line(
			240,
			18,
			first
				? `首处过热：${first.label} · t=${first.time.toFixed(1)}s · ${first.temp.toFixed(1)}°C（下方红色舱段）`
				: "无舱段过热记录",
			first ? "#ffb04a" : "#8d9db5",
		);
		line(
			430,
			16,
			`存活 ${result.time.toFixed(1)}s · 过热断电 ${result.overheatCount} 次 · 剩余冷却剂 ${result.coolant.toFixed(0)}% · 电量 ${result.battery.toFixed(0)}%`,
			"#9fb2c8",
		);
		line(560, 14, "点击按钮或按 R 重新开始", "#8d9db5");
		app.world.addChild(panel, 10);

		app.world.addChild(
			new TextButton(VIEW_W / 2 - 80, 480, 160, 40, "重新开始", () =>
				state.change(state.PLAY),
			),
			20,
		);

		input.bindKey(input.KEY.R, "restart", true);
	}

	override update(dt: number) {
		if (input.isKeyPressed("restart")) {
			state.change(state.PLAY);
		}
		return super.update(dt);
	}

	override onDestroyEvent() {
		input.unbindKey(input.KEY.R);
	}
}
