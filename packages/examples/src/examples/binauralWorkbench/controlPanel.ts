/**
 * DOM control panel for the binaural workbench. Kept separate from the
 * engine bootstrap so the example file stays a thin wiring layer.
 *
 * The panel starts in a "configure" state: room size and wall material
 * are chosen, then sound generation is explicitly built. The room plan
 * and transport only appear once that build has finished — the plan is
 * an acoustic readout, never a pre-rendered game map.
 */
import {
	OUTPUT_MODES,
	type OutputMode,
	ROOM_PRESETS,
	type RoomDimensions,
	WALL_MATERIALS,
	type WallMaterial,
} from "./types";

export interface WorkbenchSettings {
	room: RoomDimensions;
	material: WallMaterial;
	mode: OutputMode;
}

export interface ControlPanel {
	element: HTMLElement;
	getSettings: () => WorkbenchSettings;
	setMode: (mode: OutputMode) => void;
	setStatus: (text: string) => void;
	onBuild: (handler: () => void) => void;
	onModeChange: (handler: (mode: OutputMode) => void) => void;
	onExport: (handler: () => void) => void;
	setSoundReady: (ready: boolean) => void;
}

const createSelect = <T>(
	options: ReadonlyArray<{ value: T; label: string }>,
): HTMLSelectElement => {
	const select = document.createElement("select");
	for (const option of options) {
		const element = document.createElement("option");
		element.value = String(options.indexOf(option));
		element.textContent = option.label;
		select.appendChild(element);
	}
	return select;
};

export const createControlPanel = (): ControlPanel => {
	const element = document.createElement("div");
	element.className = "binaural-panel";

	const roomSelect = createSelect(
		ROOM_PRESETS.map((preset) => ({
			value: preset.dimensions,
			label: preset.label,
		})),
	);
	const materialSelect = createSelect(
		WALL_MATERIALS.map((material) => ({
			value: material,
			label: material.label,
		})),
	);
	const modeSelect = createSelect(
		OUTPUT_MODES.map((mode) => ({
			value: mode.id,
			label: mode.label,
		})),
	);
	modeSelect.value = "2";

	const buildButton = document.createElement("button");
	buildButton.type = "button";
	buildButton.textContent = "Build room sound";
	const exportButton = document.createElement("button");
	exportButton.type = "button";
	exportButton.textContent = "Render trajectory WAV";
	exportButton.disabled = true;
	const status = document.createElement("p");
	status.className = "binaural-status";
	status.textContent = "Choose a room and wall material, then build the sound.";

	const labelled = (labelText: string, control: HTMLElement) => {
		const row = document.createElement("label");
		row.className = "binaural-row";
		const label = document.createElement("span");
		label.textContent = labelText;
		row.append(label, control);
		return row;
	};

	element.append(
		labelled("Room size", roomSelect),
		labelled("Wall material", materialSelect),
		labelled("Output mode", modeSelect),
		buildButton,
		exportButton,
		status,
	);

	const getSettings = (): WorkbenchSettings => ({
		room: ROOM_PRESETS[Number(roomSelect.value)].dimensions,
		material: WALL_MATERIALS[Number(materialSelect.value)],
		mode: OUTPUT_MODES[Number(modeSelect.value)].id,
	});

	const buildHandlers: Array<() => void> = [];
	const modeHandlers: Array<(mode: OutputMode) => void> = [];
	const exportHandlers: Array<() => void> = [];

	buildButton.addEventListener("click", () => {
		for (const handler of buildHandlers) {
			handler();
		}
	});
	modeSelect.addEventListener("change", () => {
		const mode = OUTPUT_MODES[Number(modeSelect.value)].id;
		for (const handler of modeHandlers) {
			handler(mode);
		}
	});
	exportButton.addEventListener("click", () => {
		for (const handler of exportHandlers) {
			handler();
		}
	});

	return {
		element,
		getSettings,
		setMode: (mode) => {
			modeSelect.value = String(
				OUTPUT_MODES.findIndex((entry) => entry.id === mode),
			);
		},
		setStatus: (text) => {
			status.textContent = text;
		},
		onBuild: (handler) => buildHandlers.push(handler),
		onModeChange: (handler) => modeHandlers.push(handler),
		onExport: (handler) => exportHandlers.push(handler),
		// Room and material stay editable so the room can be rebuilt;
		// only WAV export needs a live sound.
		setSoundReady: (ready) => {
			exportButton.disabled = !ready;
		},
	};
};
