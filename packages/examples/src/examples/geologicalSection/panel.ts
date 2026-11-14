/**
 * DOM control panel for the section example. Mirrors the pattern used by
 * the HDR example: the canvas stays a pure melonJS surface while every
 * knob (seed, time, sea level, layer visibility, export) lives in an
 * absolutely positioned, pointer-events-auto panel.
 */
import { exportSectionPNG, type ViewState } from "./render";
import type { SectionModel } from "./types";

export interface PanelCallbacks {
	onSeedChange: (seed: string) => void;
	onViewChange: (patch: Partial<ViewState>) => void;
	getState: () => { model: SectionModel; view: ViewState };
}

const PANEL_STYLE =
	"position:absolute;top:12px;right:12px;z-index:1000;width:264px;" +
	"max-height:calc(100% - 24px);overflow:auto;padding:12px 14px;" +
	"background:rgba(10,14,20,0.88);color:#d5dde7;" +
	"border:1px solid #2c3a4e;border-radius:10px;" +
	"font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei'," +
	"'Noto Sans CJK SC','WenQuanYi Micro Hei',sans-serif;" +
	"font-size:12px;pointer-events:auto;";

const makeSlider = (
	panel: HTMLElement,
	labelText: string,
	min: number,
	max: number,
	step: number,
	value: number,
	format: (v: number) => string,
	onInput: (v: number) => void,
): void => {
	const wrap = document.createElement("div");
	wrap.style.marginBottom = "10px";
	const label = document.createElement("label");
	label.style.cssText =
		"display:flex;justify-content:space-between;color:#9fb6e8;";
	const name = document.createElement("span");
	name.textContent = labelText;
	const valueEl = document.createElement("span");
	valueEl.style.color = "#ffd98a";
	valueEl.textContent = format(value);
	const input = document.createElement("input");
	input.type = "range";
	input.min = String(min);
	input.max = String(max);
	input.step = String(step);
	input.value = String(value);
	input.style.cssText = "width:100%;margin-top:4px;";
	input.addEventListener("input", () => {
		const next = Number(input.value);
		valueEl.textContent = format(next);
		onInput(next);
	});
	label.append(name, valueEl);
	wrap.append(label, input);
	panel.appendChild(wrap);
};

/**
 * Build the panel inside `parent`. Returns a teardown that removes every
 * DOM node this created (the example wrapper calls it on unmount).
 */
export const createPanel = (
	parent: HTMLElement,
	model: SectionModel,
	view: ViewState,
	callbacks: PanelCallbacks,
): (() => void) => {
	const panel = document.createElement("div");
	panel.style.cssText = PANEL_STYLE;

	const heading = document.createElement("div");
	heading.textContent = "地层控制台 Controls";
	heading.style.cssText =
		"font-weight:bold;font-size:13px;color:#ffd98a;margin-bottom:10px;";
	panel.appendChild(heading);

	// ── seed ──────────────────────────────────────────────────────────────
	const seedLabel = document.createElement("label");
	seedLabel.textContent = "Seed（相同 seed → 相同地层）";
	seedLabel.style.cssText = "display:block;color:#9fb6e8;margin-bottom:4px;";
	const seedRow = document.createElement("div");
	seedRow.style.cssText = "display:flex;gap:6px;margin-bottom:10px;";
	const seedInput = document.createElement("input");
	seedInput.type = "text";
	seedInput.value = model.seed;
	seedInput.style.cssText =
		"flex:1;min-width:0;background:#16202e;color:#e8eef5;border:1px solid #345;" +
		"border-radius:5px;padding:5px 7px;font-size:12px;";
	const seedButton = document.createElement("button");
	seedButton.type = "button";
	seedButton.textContent = "生成";
	seedButton.style.cssText =
		"background:#274a73;color:#e8eef5;border:none;border-radius:5px;" +
		"padding:5px 10px;cursor:pointer;";
	const applySeed = () => {
		const value = seedInput.value.trim();
		if (value) {
			callbacks.onSeedChange(value);
		}
	};
	seedInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			applySeed();
		}
	});
	seedButton.addEventListener("click", applySeed);
	seedRow.append(seedInput, seedButton);
	panel.append(seedLabel, seedRow);

	// ── sliders ───────────────────────────────────────────────────────────
	makeSlider(
		panel,
		"时间轴 Time（回溯 2000 万年）",
		0,
		model.totalAge,
		0.1,
		view.viewAge,
		(v) => (v <= 0 ? "现今 0 Ma" : `${v.toFixed(1)} Ma 前`),
		(v) => callbacks.onViewChange({ viewAge: v }),
	);
	makeSlider(
		panel,
		"海平面 Sea Level",
		0,
		1,
		0.01,
		view.seaLevel,
		(v) => `${Math.round(v * 100)}%`,
		(v) => callbacks.onViewChange({ seaLevel: v }),
	);

	// ── layer visibility (the legend's checkboxes) ───────────────────────
	const layerHeading = document.createElement("div");
	layerHeading.textContent = "图层显隐 Layers";
	layerHeading.style.cssText = "color:#9fb6e8;margin-bottom:5px;";
	panel.appendChild(layerHeading);

	const layerList = document.createElement("div");
	layerList.style.cssText =
		"max-height:168px;overflow:auto;border:1px solid #2c3a4e;" +
		"border-radius:6px;padding:5px 7px;margin-bottom:10px;";
	for (const layer of model.layers) {
		const row = document.createElement("label");
		row.style.cssText =
			"display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;";
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = layer.visible;
		const swatch = document.createElement("span");
		swatch.style.cssText =
			`width:12px;height:12px;border-radius:2px;background:${layer.rock.color};` +
			"border:1px solid rgba(255,255,255,0.35);flex:none;";
		const text = document.createElement("span");
		text.textContent = `${layer.name} ${layer.rock.label.split(" ")[0]}`;
		checkbox.addEventListener("change", () => {
			const hidden = new Set(callbacks.getState().view.hidden);
			if (checkbox.checked) {
				hidden.delete(layer.index);
			} else {
				hidden.add(layer.index);
			}
			callbacks.onViewChange({ hidden });
		});
		row.append(checkbox, swatch, text);
		layerList.appendChild(row);
	}
	panel.appendChild(layerList);

	// ── geological event list (faults + erosion, with ages) ───────────────
	const eventHeading = document.createElement("div");
	eventHeading.textContent = "地质事件 Events";
	eventHeading.style.cssText = "color:#9fb6e8;margin-bottom:5px;";
	panel.appendChild(eventHeading);
	const eventList = document.createElement("div");
	eventList.style.cssText = "margin-bottom:10px;line-height:1.5;";
	for (const fault of model.faults) {
		const item = document.createElement("div");
		item.style.color = "#ff9a9a";
		item.textContent =
			`F${fault.index + 1} 断层 · ${fault.age} Ma · ` +
			`断距 ${Math.abs(fault.throwAmount).toFixed(0)} m`;
		eventList.appendChild(item);
	}
	for (const erosion of model.erosions) {
		const item = document.createElement("div");
		item.style.color = "#9ad3ff";
		item.textContent =
			`E${erosion.index + 1} 侵蚀 · ${erosion.age} Ma · ` +
			`沟谷深 ${erosion.depth.toFixed(0)} m`;
		eventList.appendChild(item);
	}
	panel.appendChild(eventList);

	// ── PNG export ────────────────────────────────────────────────────────
	const exportButton = document.createElement("button");
	exportButton.type = "button";
	exportButton.textContent = "导出 PNG（含全部标注）";
	exportButton.style.cssText =
		"width:100%;background:#3d6b3a;color:#f1f8ee;border:none;border-radius:6px;" +
		"padding:8px 10px;font-weight:bold;cursor:pointer;margin-bottom:8px;";
	exportButton.addEventListener("click", () => {
		const { model: currentModel, view: currentView } = callbacks.getState();
		exportSectionPNG(
			currentModel,
			currentView,
			`geological-section-${currentModel.seed}.png`,
		);
	});
	panel.appendChild(exportButton);

	const hint = document.createElement("div");
	hint.textContent = "画布上横向拖动浏览；鼠标悬停查看年代/硬度/厚度。";
	hint.style.cssText = "color:#7f8aa8;font-size:11px;line-height:1.45;";
	panel.appendChild(hint);

	parent.appendChild(panel);
	return () => {
		panel.remove();
	};
};
