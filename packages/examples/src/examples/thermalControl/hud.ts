/**
 * melonJS — Thermal Control example: HUD text layer.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Container, Text } from "melonjs";
import {
	CREW_SAFE_MAX,
	CREW_SAFE_MIN,
	DURATION,
	PROP_MIN_CHARGE,
	SHUTDOWN_LIMIT,
	type ThermalSim,
} from "./simulation";
import { COMP_RECTS, VALVE_SLIDERS, VIEW_H, VIEW_W } from "./view";

const FONT = {
	font: "Noto Sans CJK SC, Microsoft YaHei, PingFang SC, Arial, sans-serif",
	fillStyle: "#e8eef6",
} as const;

const label = (
	x: number,
	y: number,
	size: number,
	text: string,
	align: "left" | "center" | "right" = "center",
	color = "#e8eef6",
) =>
	new Text(x, y, {
		...FONT,
		fillStyle: color,
		size,
		text,
		textAlign: align,
		textBaseline: "middle",
	});

/** All dynamic text, updated from the simulation once per frame. */
export class GameHud extends Container {
	private sim: ThermalSim;
	private timeText: Text;
	private coolantText: Text;
	private batteryText: Text;
	private alarmText: Text;
	private compName: Text[] = [];
	private compTemp: Text[] = [];
	private compStatus: Text[] = [];
	private valveText: Text[] = [];
	private radiatorText: Text;

	constructor(sim: ThermalSim) {
		super(0, 0, VIEW_W, VIEW_H);
		this.sim = sim;

		this.addChild(
			label(16, 10, 15, "热控管理 — 日照区生存 120 秒", "left", "#9fb2c8"),
		);
		this.timeText = this.addChild(label(640, 26, 13, ""));
		this.coolantText = this.addChild(label(310, 26, 13, "", "left"));
		this.batteryText = this.addChild(label(1100, 44, 13, ""));
		this.alarmText = this.addChild(label(640, 57, 14, "", "center", "#ffffff"));

		const ids = ["crew", "equipment", "propulsion"] as const;
		ids.forEach((id, i) => {
			const r = COMP_RECTS[id];
			this.compName[i] = this.addChild(
				label(r.x + r.w / 2, r.y + 18, 17, sim.compartments[id].label),
			);
			this.compTemp[i] = this.addChild(label(r.x + r.w / 2, r.y + 44, 22, ""));
			this.compStatus[i] = this.addChild(
				label(r.x + r.w / 2, r.y + r.h - 62, 13, "", "center", "#ffd75e"),
			);
			const s = VALVE_SLIDERS[id];
			this.valveText[i] = this.addChild(
				label(s.x + s.w / 2, s.y + s.h + 14, 13, ""),
			);
		});
		this.radiatorText = this.addChild(label(73, 424, 13, ""));
		this.addChild(
			label(
				VIEW_W / 2,
				VIEW_H - 10,
				13,
				`拖动滑阀调节冷却剂 · 点击设备按钮开关设备 · 目标：${DURATION} 秒内乘员舱保持 ${CREW_SAFE_MIN}–${CREW_SAFE_MAX}°C，电量不低于 ${PROP_MIN_CHARGE}%`,
				"center",
				"#8d9db5",
			),
		);
	}

	override update(dt: number) {
		const sim = this.sim;
		this.timeText.setText(
			`剩余 ${Math.max(DURATION - sim.t, 0).toFixed(0)} 秒`,
		);
		this.coolantText.setText(
			`冷却剂 ${sim.coolant.toFixed(0)}%${sim.coolantLow ? " · 不足！" : ""}`,
		);
		this.batteryText.setText(
			`电量 ${sim.battery.toFixed(0)}%（推进最低 ${PROP_MIN_CHARGE}%）`,
		);
		const alarms = [
			"",
			sim.coolantLow ? "警告：冷却剂不足" : "警告：舱温偏高",
			"舱段过热 · 自动断电",
			"危险：接近任务极限",
		];
		this.alarmText.setText(alarms[sim.alarmLevel]);

		sim.list.forEach((c, i) => {
			this.compTemp[i].setText(`${c.temp.toFixed(1)}°C`);
			this.compStatus[i].setText(
				c.offline
					? c.rebootTimer > 0
						? `自动断电 · 重启中 ${(6 - c.rebootTimer).toFixed(1)}s`
						: `自动断电 · 待降温至 ${SHUTDOWN_LIMIT - 10}°C 以下`
					: "",
			);
			this.valveText[i].setText(`阀门 ${(c.valveTarget * 100).toFixed(0)}%`);
		});
		this.radiatorText.setText(
			`散热板 ${(this.sim.radiatorActual * 100).toFixed(0)}%`,
		);
		return super.update(dt);
	}
}
