/**
 * melonJS — Thermal Control example: ship thermal / power simulation.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Pure simulation, no engine imports: the ship just crossed from shadow
 * into sunlight and three compartments start heating up. The player only
 * manages coolant valves, the radiator deployment and device switches.
 */

export const DURATION = 120; // seconds of sunlight to survive
export const COOLANT_MAX = 100;
export const COOLANT_LOW = 25; // below this the pump cavitates
export const BATTERY_START = 75;
export const PROP_MIN_CHARGE = 15; // propulsion reserve that must be kept
export const SHUTDOWN_LIMIT = 48; // compartment auto power-off temperature
export const RECOVERY_TEMP = 38; // reboot sequence starts below this
export const RECOVERY_TIME = 6; // seconds before devices come back
export const CREW_SAFE_MIN = 10;
export const CREW_SAFE_MAX = 38;
export const CREW_HARD_LIMIT = 42; // mission fails above this

export type CompartmentId = "crew" | "equipment" | "propulsion";

export interface DeviceState {
	id: string;
	label: string;
	heat: number; // °C/s generated while on
	power: number; // battery %/s drawn while on
	toggleable: boolean;
	on: boolean;
	prevOn: boolean; // state to restore after an auto-shutdown reboot
}

export interface CompartmentState {
	id: CompartmentId;
	label: string;
	solarGain: number; // °C/s at full sunlight
	temp: number;
	valveTarget: number; // 0..1 set by the player
	valveActual: number; // underdamped follower, overshoots the target
	valveVel: number;
	offline: boolean; // auto power-off after overheat
	rebootTimer: number; // counts up while temp < RECOVERY_TEMP
	devices: DeviceState[];
}

export interface OverheatRecord {
	compartment: CompartmentId;
	label: string;
	time: number;
	temp: number;
}

const device = (
	id: string,
	label: string,
	heat: number,
	power: number,
	toggleable: boolean,
	on: boolean,
): DeviceState => ({ id, label, heat, power, toggleable, on, prevOn: on });

const makeCompartment = (
	id: CompartmentId,
	label: string,
	solarGain: number,
	devices: DeviceState[],
): CompartmentState => ({
	id,
	label,
	solarGain,
	temp: 2,
	valveTarget: 0,
	valveActual: 0,
	valveVel: 0,
	offline: false,
	rebootTimer: 0,
	devices,
});

export class ThermalSim {
	t = 0;
	flux = 0; // 0 shadow → 1 full sunlight
	coolant = COOLANT_MAX;
	radiatorTarget = 0;
	radiatorActual = 0;
	battery = BATTERY_START;
	status: "running" | "won" | "lost" = "running";
	loseReason = "";
	firstOverheat: OverheatRecord | null = null;
	overheatLog: OverheatRecord[] = [];
	pumpSpeed = 0; // 0..1, drives the pump sound
	alarmLevel = 0; // 0 none … 3 critical
	timeScale = 1; // test hook: fast-forward the simulation

	compartments: Record<CompartmentId, CompartmentState> = {
		crew: makeCompartment("crew", "乘员舱", 1.35, [
			device("lifesupport", "生命维持", 0.25, 0.3, false, true),
		]),
		equipment: makeCompartment("equipment", "设备舱", 1.15, [
			device("experiment", "实验设备", 0.55, 0.35, true, true),
			device("comms", "通信阵列", 0.35, 0.3, true, true),
		]),
		propulsion: makeCompartment("propulsion", "推进舱", 1.25, [
			device("heater", "推进剂加热", 0.3, 0.2, true, true),
		]),
	};

	get coolantLow() {
		return this.coolant < COOLANT_LOW;
	}

	get list(): CompartmentState[] {
		return [
			this.compartments.crew,
			this.compartments.equipment,
			this.compartments.propulsion,
		];
	}

	toggleDevice(comp: CompartmentId, deviceId: string) {
		const c = this.compartments[comp];
		const d = c.devices.find((dev) => dev.id === deviceId);
		if (!d?.toggleable || c.offline) {
			return;
		}
		d.on = !d.on;
		d.prevOn = d.on;
	}

	update(frameDt: number) {
		if (this.status !== "running") {
			return;
		}
		// sub-step so a large timeScale stays numerically stable
		let remaining = (frameDt * this.timeScale) / 1000;
		while (remaining > 0 && this.status === "running") {
			const dt = Math.min(remaining, 0.1);
			this.step(dt);
			remaining -= dt;
		}
	}

	private step(dt: number) {
		this.t += dt;
		// sunlight transition: 4 s of shadow, then a 12 s ramp to full sun
		const ramp = Math.min(Math.max((this.t - 4) / 12, 0), 1);
		this.flux = ramp * ramp * (3 - 2 * ramp);

		// radiator takes ~6 s to deploy or stow
		const dir = Math.sign(this.radiatorTarget - this.radiatorActual);
		this.radiatorActual = Math.min(
			Math.max(this.radiatorActual + (dir * dt) / 6, 0),
			1,
		);

		// coolant pump degrades sharply once the tank runs low
		const coolantFactor = this.coolantLow
			? (this.coolant / COOLANT_LOW) ** 1.5
			: 1;

		let totalFlow = 0;
		for (const c of this.list) {
			// underdamped valve follower: overshoots before settling
			const acc = 30 * (c.valveTarget - c.valveActual) - 5 * c.valveVel;
			c.valveVel += acc * dt;
			c.valveActual = Math.min(
				Math.max(c.valveActual + c.valveVel * dt, -0.05),
				1.2,
			);
			totalFlow += Math.min(Math.max(c.valveActual, 0), 1);
		}
		this.pumpSpeed = totalFlow / this.list.length;
		this.coolant = Math.max(this.coolant - totalFlow * 0.4 * dt, 0);

		// heat budget per compartment
		for (const c of this.list) {
			const flow = Math.min(Math.max(c.valveActual, 0), 1) * coolantFactor;
			// the loop cannot cool below the coolant's own temperature,
			// so heat rejection tapers off as a compartment approaches -5°C
			const thermalHead = Math.min(Math.max((c.temp + 5) / 35, 0), 1.2);
			const cooling = flow * (0.5 + 2.0 * this.radiatorActual) * thermalHead;
			let heating = c.solarGain * this.flux;
			if (!c.offline) {
				for (const d of c.devices) {
					if (d.on) {
						heating += d.heat;
					}
				}
			}
			c.temp += (heating - cooling) * dt;
		}

		// conduction between neighbouring compartments
		const pairs: [CompartmentState, CompartmentState][] = [
			[this.compartments.crew, this.compartments.equipment],
			[this.compartments.equipment, this.compartments.propulsion],
		];
		for (const [a, b] of pairs) {
			const flow = (b.temp - a.temp) * 0.02 * dt;
			a.temp += flow;
			b.temp -= flow;
		}

		// power budget
		let draw = 0.3 * this.pumpSpeed;
		for (const c of this.list) {
			if (c.offline) {
				continue;
			}
			for (const d of c.devices) {
				if (d.on) {
					draw += d.power;
				}
			}
		}
		this.battery = Math.min(
			Math.max(this.battery + (0.9 * this.flux - draw) * dt, 0),
			100,
		);

		this.updateOverheat(dt);
		this.updateAlarm();
		this.checkEnd();
	}

	private updateOverheat(dt: number) {
		for (const c of this.list) {
			if (!c.offline && c.temp >= SHUTDOWN_LIMIT) {
				c.offline = true;
				c.rebootTimer = 0;
				for (const d of c.devices) {
					d.prevOn = d.on;
					d.on = false;
				}
				const record: OverheatRecord = {
					compartment: c.id,
					label: c.label,
					time: this.t,
					temp: c.temp,
				};
				this.overheatLog.push(record);
				this.firstOverheat ??= record;
			} else if (c.offline) {
				if (c.temp < RECOVERY_TEMP) {
					c.rebootTimer += dt;
					if (c.rebootTimer >= RECOVERY_TIME) {
						c.offline = false;
						c.rebootTimer = 0;
						for (const d of c.devices) {
							d.on = d.prevOn;
						}
					}
				} else {
					c.rebootTimer = 0;
				}
			}
		}
	}

	private updateAlarm() {
		const crew = this.compartments.crew;
		let level = 0;
		if (this.coolantLow || this.list.some((c) => c.temp > CREW_SAFE_MAX)) {
			level = 1;
		}
		if (this.list.some((c) => c.offline || c.temp > SHUTDOWN_LIMIT - 5)) {
			level = 2;
		}
		if (crew.temp > CREW_SAFE_MAX + 2 || this.battery < PROP_MIN_CHARGE + 5) {
			level = 3;
		}
		this.alarmLevel = level;
	}

	private checkEnd() {
		const crew = this.compartments.crew;
		if (crew.temp >= CREW_HARD_LIMIT) {
			this.status = "lost";
			this.loseReason = `乘员舱温度 ${crew.temp.toFixed(1)}°C 超出安全上限`;
		} else if (this.battery < PROP_MIN_CHARGE) {
			this.status = "lost";
			this.loseReason = "推进系统电量低于最低需求";
		} else if (this.t >= DURATION) {
			this.status = "won";
		}
	}
}
