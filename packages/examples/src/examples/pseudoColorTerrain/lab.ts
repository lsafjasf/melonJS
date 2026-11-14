/**
 * melonJS — pseudo-colour terrain: editor shell.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */

import { CurveCard } from "./curveEditor";
import { buildExportCanvas, downloadExport } from "./export";
import {
	type Channel,
	type CurvePoints,
	channelColor,
	composeImage,
	type EditorState,
	makeEditorState,
	PRESETS,
	type ProcessedImage,
	sampleTerrain,
} from "./process";
import { type SamplePoint, TerrainViewport, type ViewMode } from "./renderer";
import { STYLE_ID, STYLES } from "./styles";
import { BAND_DEFINITIONS, generateTerrain, type Terrain } from "./terrain";

const VIEW_LABELS: Record<ViewMode, string> = {
	composite: "FALSE COLOUR / COMPOSITE",
	single: "SINGLE BAND / RAW",
	original: "ORIGINAL / FOUR BANDS",
};

const TEMPLATE = `
<div class="tcl-app">
	<header class="tcl-topbar">
		<div class="tcl-brand">
			<div class="tcl-mark"></div>
			<div>
				<div class="tcl-brand-name">TERRA COLOUR LAB</div>
				<div class="tcl-brand-sub">FALSE-COLOUR TERRAIN PROCESSOR</div>
			</div>
		</div>
		<div class="tcl-header-mid">
			<label class="tcl-seed-label" for="tcl-seed">SEED</label>
			<div class="tcl-seed-box">
				<span class="tcl-hash">#</span>
				<input id="tcl-seed" class="tcl-seed-input" value="424242" maxlength="32" spellcheck="false" />
				<button id="tcl-random" class="tcl-ghost-button" type="button" title="Generate a new random seed">RND</button>
				<button id="tcl-generate" class="tcl-generate" type="button">GENERATE</button>
			</div>
			<label class="tcl-preset-label" for="tcl-preset">PRESET</label>
			<select id="tcl-preset" class="tcl-preset-select"></select>
			<button id="tcl-reset-preset" class="tcl-ghost-button" type="button" title="Restore the selected preset">RESTORE</button>
		</div>
		<div class="tcl-header-right">
			<div class="tcl-size-badge">
				<strong>384 × 384</strong>
				<span>RGBA8 · CPU</span>
			</div>
			<button id="tcl-export" class="tcl-export" type="button">EXPORT PNG</button>
		</div>
	</header>
	<div class="tcl-main">
		<section class="tcl-workbench">
			<div class="tcl-view-toolbar">
				<div class="tcl-view-tabs" role="group" aria-label="View mode">
					<button class="tcl-view-tab active" data-view="composite" type="button">COMPOSITE</button>
					<button class="tcl-view-tab" data-view="single" type="button">SINGLE</button>
					<button class="tcl-view-tab" data-view="original" type="button">ORIGINAL</button>
				</div>
				<div id="tcl-single-bands" class="tcl-single-bands" hidden></div>
				<div class="tcl-toolbar-spacer"></div>
				<button id="tcl-zoom-out" class="tcl-icon-button" type="button" title="Zoom out">−</button>
				<span id="tcl-zoom" class="tcl-zoom-readout">100%</span>
				<button id="tcl-zoom-in" class="tcl-icon-button" type="button" title="Zoom in">+</button>
				<button id="tcl-fit" class="tcl-ghost-button" type="button">FIT</button>
			</div>
			<div id="tcl-viewport" class="tcl-viewport">
				<div id="tcl-generating" class="tcl-generating">GENERATING FOUR BANDS…</div>
				<div class="tcl-viewport-note">
					<span id="tcl-mode-badge" class="tcl-mode-badge">FALSE COLOUR / COMPOSITE</span>
					<span id="tcl-coordinates" class="tcl-coordinates">X — · Y —</span>
				</div>
				<div id="tcl-sample" class="tcl-sample-float"></div>
				<div class="tcl-viewport-hint">CLICK TO SAMPLE · DRAG TO PAN · SCROLL TO ZOOM</div>
				<div id="tcl-toast" class="tcl-toast"></div>
			</div>
		</section>
		<aside class="tcl-sidebar">
			<section class="tcl-section">
				<div class="tcl-section-head">
					<span class="tcl-section-title">01 / CHANNEL MIXER</span>
					<span class="tcl-section-sub">INPUT → OUTPUT</span>
				</div>
				<div id="tcl-channels" class="tcl-channel-list"></div>
				<div class="tcl-alpha-note">The fourth band is written to the extra A channel. RGB values run through their own tone curves; every edit recomposes real pixels.</div>
			</section>
			<section class="tcl-section">
				<div class="tcl-section-head">
					<span class="tcl-section-title">02 / TONE CURVES</span>
					<span class="tcl-section-sub">DRAG VERTICALLY</span>
				</div>
				<div id="tcl-curves" class="tcl-curves"></div>
			</section>
		</aside>
	</div>
	<footer class="tcl-statusbar">
		<span class="tcl-status-dot"></span>
		<span id="tcl-status">READY</span>
		<span id="tcl-status-seed">SEED —</span>
		<span class="spacer"></span>
		<span>4 BANDS</span>
		<span>3 TONE CURVES</span>
		<span><strong>CPU PIXEL COMPOSITE</strong></span>
	</footer>
</div>
`;

const byId = <T extends HTMLElement>(root: ParentNode, id: string): T => {
	const element = root.querySelector<T>(`#${id}`);
	if (!element) {
		throw new Error(`Missing terrain-lab element #${id}`);
	}
	return element;
};

export type TerrainLabApi = {
	getState: () => EditorState;
	getPixels: () => Uint8ClampedArray | null;
	getSeed: () => string;
	setSeed: (seed: string) => Promise<void>;
	setChannel: (channel: Channel, bandIndex: number) => void;
	setCurve: (channel: Channel, points: CurvePoints) => void;
	setView: (mode: ViewMode) => void;
	getExportDataUrl: () => string | null;
};

export const createTerrainLab = (parent: HTMLElement): (() => void) => {
	let insertedStyle: HTMLStyleElement | null = null;
	if (!document.getElementById(STYLE_ID)) {
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = STYLES;
		document.head.appendChild(style);
		insertedStyle = style;
	}

	const host = document.createElement("div");
	host.style.cssText = "width:100%;height:100%;";
	host.innerHTML = TEMPLATE;
	parent.appendChild(host);
	const root = host.firstElementChild as HTMLElement;

	const seedInput = byId<HTMLInputElement>(root, "tcl-seed");
	const generateButton = byId<HTMLButtonElement>(root, "tcl-generate");
	const randomButton = byId<HTMLButtonElement>(root, "tcl-random");
	const presetSelect = byId<HTMLSelectElement>(root, "tcl-preset");
	const resetPresetButton = byId<HTMLButtonElement>(root, "tcl-reset-preset");
	const exportButton = byId<HTMLButtonElement>(root, "tcl-export");
	const viewportHost = byId<HTMLDivElement>(root, "tcl-viewport");
	const generating = byId<HTMLDivElement>(root, "tcl-generating");
	const modeBadge = byId<HTMLSpanElement>(root, "tcl-mode-badge");
	const coordinates = byId<HTMLSpanElement>(root, "tcl-coordinates");
	const toast = byId<HTMLDivElement>(root, "tcl-toast");
	const zoomReadout = byId<HTMLSpanElement>(root, "tcl-zoom");
	const status = byId<HTMLSpanElement>(root, "tcl-status");
	const statusSeed = byId<HTMLSpanElement>(root, "tcl-status-seed");
	const channelList = byId<HTMLDivElement>(root, "tcl-channels");
	const sampleHost = byId<HTMLDivElement>(root, "tcl-sample");
	const curveHost = byId<HTMLDivElement>(root, "tcl-curves");
	const singleBands = byId<HTMLDivElement>(root, "tcl-single-bands");

	const teardown = initialize(root, {
		seedInput,
		generateButton,
		randomButton,
		presetSelect,
		resetPresetButton,
		exportButton,
		viewportHost,
		generating,
		modeBadge,
		coordinates,
		toast,
		zoomReadout,
		status,
		statusSeed,
		channelList,
		sampleHost,
		curveHost,
		singleBands,
	});
	return () => {
		teardown();
		insertedStyle?.remove();
	};
};

type LabElements = {
	seedInput: HTMLInputElement;
	generateButton: HTMLButtonElement;
	randomButton: HTMLButtonElement;
	presetSelect: HTMLSelectElement;
	resetPresetButton: HTMLButtonElement;
	exportButton: HTMLButtonElement;
	viewportHost: HTMLDivElement;
	generating: HTMLDivElement;
	modeBadge: HTMLSpanElement;
	coordinates: HTMLSpanElement;
	toast: HTMLDivElement;
	zoomReadout: HTMLSpanElement;
	status: HTMLSpanElement;
	statusSeed: HTMLSpanElement;
	channelList: HTMLDivElement;
	sampleHost: HTMLDivElement;
	curveHost: HTMLDivElement;
	singleBands: HTMLDivElement;
};

const initialize = (root: HTMLElement, elements: LabElements): (() => void) => {
	const state = makeEditorState(PRESETS[0], "424242");
	let terrain: Terrain | null = null;
	let image: ProcessedImage | null = null;
	let sample: SamplePoint | null = null;
	let mode: ViewMode = "composite";
	let singleBand = 3;
	let generation = 0;
	let processingFrame = 0;
	let toastTimer = 0;

	const viewport = new TerrainViewport(elements.viewportHost, {
		onSample: (nextSample) => {
			sample = nextSample;
			renderSample();
		},
		onZoom: (percent) => {
			elements.zoomReadout.textContent = `${percent}%`;
		},
	});

	for (const preset of PRESETS) {
		const option = document.createElement("option");
		option.value = preset.key;
		option.textContent = preset.name;
		elements.presetSelect.appendChild(option);
	}
	const customOption = document.createElement("option");
	customOption.value = "custom";
	customOption.textContent = "Custom mix";
	elements.presetSelect.appendChild(customOption);
	elements.presetSelect.value = state.preset;

	const channelRows = BAND_DEFINITIONS.map((_, channelIndex) => {
		const channel = (["R", "G", "B", "A"] as Channel[])[channelIndex];
		const row = document.createElement("div");
		row.className = "tcl-channel-row";
		row.dataset.channel = channel;
		const letter = document.createElement("span");
		letter.className = "tcl-channel-letter";
		letter.textContent = channel;
		const select = document.createElement("select");
		select.className = "tcl-band-select";
		for (const [bandIndex, definition] of BAND_DEFINITIONS.entries()) {
			const option = document.createElement("option");
			option.value = String(bandIndex);
			option.textContent = `0${bandIndex}  ${definition.name}`;
			select.appendChild(option);
		}
		select.addEventListener("change", () => {
			setChannel(channelIndex, Number(select.value));
		});
		const tag = document.createElement("span");
		tag.className = "tcl-band-tag";
		row.append(letter, select, tag);
		elements.channelList.appendChild(row);
		return { select, tag };
	});

	const curves = (["R", "G", "B"] as Channel[]).map((channel) => {
		const card = new CurveCard(
			channel,
			(editedChannel, points) => {
				state.curves[editedChannel as "R" | "G" | "B"] = points;
				markCustom();
				reprocess();
			},
			(editedChannel) => {
				state.curves[editedChannel as "R" | "G" | "B"] = [0.25, 0.5, 0.75];
				markCustom();
				reprocess();
				syncCurveCards();
				showToast(`${editedChannel} curve restored`);
			},
		);
		elements.curveHost.appendChild(card.element);
		return card;
	});

	for (const [index, definition] of BAND_DEFINITIONS.entries()) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `tcl-band-button${index === singleBand ? " active" : ""}`;
		button.dataset.band = String(index);
		button.textContent = `0${index}`;
		button.title = definition.name;
		button.addEventListener("click", () => {
			singleBand = index;
			viewport.setSingleBand(index);
			syncSingleBands();
		});
		elements.singleBands.appendChild(button);
	}

	const renderSample = () => {
		if (!terrain || !state) return;
		if (!sample) {
			elements.sampleHost.innerHTML = "";
			elements.coordinates.textContent = "X — · Y —";
			return;
		}
		const current = sampleTerrain(terrain, state, sample.x, sample.y);
		elements.coordinates.textContent = `X ${String(sample.x).padStart(3, "0")} · Y ${String(sample.y).padStart(3, "0")}`;
		const rows = terrain.bands
			.map((band, index) => {
				const channelIndex = state.assignments.indexOf(index);
				const channel =
					channelIndex >= 0
						? (["R", "G", "B", "A"] as Channel[])[channelIndex]
						: "A";
				const raw = Math.round(current.raw[index] * 255);
				const out = Math.round(current.processed[index] * 255);
				return `
					<tr>
						<td>
							<div class="tcl-sample-band">
								<span class="tcl-sample-dot" style="background:${channelColor(channel)}"></span>
								<span class="tcl-sample-index">0${index}</span>
								<span>${band.name}</span>
							</div>
						</td>
						<td class="tcl-value">${raw}<small>${current.raw[index].toFixed(3)}</small></td>
						<td class="tcl-value tcl-curve-channel">${channel}</td>
						<td class="tcl-value output">${out}<small>${current.processed[index].toFixed(3)}</small></td>
					</tr>`;
			})
			.join("");
		const chips = current.channels
			.map(
				(value, index) =>
					`<span class="tcl-chip">${["R", "G", "B", "A"][index]}<b>${value}</b></span>`,
			)
			.join("");
		elements.sampleHost.innerHTML = `
			<div class="tcl-sample-head">
				<span>PIXEL ${sample.x}, ${sample.y}${sample.band === undefined ? "" : ` · BAND 0${sample.band}`}</span>
				<span>255-SCALE</span>
			</div>
			<table class="tcl-sample-table">
				<thead><tr><th>BAND</th><th>RAW</th><th>CURVE</th><th>OUT</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
			<div class="tcl-extra-row">
				<span>OUTPUT</span>
				<div class="tcl-output-chips">${chips}</div>
			</div>`;
	};

	const reprocess = () => {
		if (!terrain) return;
		if (processingFrame) cancelAnimationFrame(processingFrame);
		processingFrame = requestAnimationFrame(() => {
			processingFrame = 0;
			image = composeImage(terrain as Terrain, state);
			viewport.updateImage(image, state);
			renderSample();
			elements.status.textContent = "PIXELS UPDATED";
		});
	};

	const syncSelects = () => {
		channelRows.forEach((row, channelIndex) => {
			row.select.value = String(state.assignments[channelIndex]);
			const band = terrain?.bands[state.assignments[channelIndex]];
			row.tag.textContent = band
				? `BAND 0${band.index}`
				: `BAND 0${state.assignments[channelIndex]}`;
		});
		elements.presetSelect.value = state.preset;
	};

	const syncCurveCards = () => {
		if (!terrain) return;
		for (const card of curves) {
			card.update(terrain, state);
		}
	};

	const syncSingleBands = () => {
		for (const button of elements.singleBands.querySelectorAll<HTMLElement>(
			".tcl-band-button",
		)) {
			button.classList.toggle(
				"active",
				Number(button.dataset.band) === singleBand,
			);
		}
	};

	const setChannel = (channelIndex: number, bandIndex: number) => {
		const previousBand = state.assignments[channelIndex];
		const occupiedBy = state.assignments.indexOf(bandIndex);
		if (occupiedBy >= 0 && occupiedBy !== channelIndex) {
			state.assignments[occupiedBy] = previousBand;
		}
		state.assignments[channelIndex] = bandIndex;
		markCustom();
		syncSelects();
		syncCurveCards();
		if (mode === "single") singleBand = bandIndex;
		viewport.setSingleBand(singleBand);
		syncSingleBands();
		reprocess();
	};

	const setView = (nextMode: ViewMode) => {
		mode = nextMode;
		viewport.setMode(mode, singleBand);
		elements.modeBadge.textContent = VIEW_LABELS[mode];
		elements.singleBands.hidden = mode !== "single";
		for (const tab of root.querySelectorAll<HTMLElement>(".tcl-view-tab")) {
			tab.classList.toggle("active", tab.dataset.view === mode);
		}
	};

	const markCustom = () => {
		state.preset = "custom";
		elements.presetSelect.value = "custom";
	};

	const showToast = (message: string) => {
		window.clearTimeout(toastTimer);
		elements.toast.textContent = message;
		elements.toast.classList.add("show");
		toastTimer = window.setTimeout(() => {
			elements.toast.classList.remove("show");
		}, 1400);
	};

	const generate = (seedText: string): Promise<void> => {
		const token = ++generation;
		state.seed = seedText.trim() || "0";
		elements.seedInput.value = state.seed;
		elements.generating.classList.add("show");
		elements.status.textContent = "GENERATING";
		return new Promise((resolve) => {
			requestAnimationFrame(() => {
				window.setTimeout(() => {
					if (token !== generation) {
						resolve();
						return;
					}
					terrain = generateTerrain(state.seed);
					image = composeImage(terrain, state);
					sample = null;
					viewport.setSample(null);
					viewport.setData(terrain, image, state);
					viewport.setMode(mode, singleBand);
					elements.statusSeed.textContent = `SEED ${terrain.seedText} · HASH ${terrain.numericSeed.toString(16).toUpperCase().padStart(8, "0")}`;
					elements.status.textContent = "READY";
					elements.generating.classList.remove("show");
					syncSelects();
					syncCurveCards();
					renderSample();
					resolve();
				}, 20);
			});
		});
	};

	const applyPreset = (presetKey: string, announce = true) => {
		const preset =
			PRESETS.find((candidate) => candidate.key === presetKey) ?? PRESETS[0];
		state.preset = preset.key;
		state.assignments = [...preset.assignments] as EditorState["assignments"];
		state.curves = {
			R: [...preset.curves.R] as CurvePoints,
			G: [...preset.curves.G] as CurvePoints,
			B: [...preset.curves.B] as CurvePoints,
		};
		syncSelects();
		syncCurveCards();
		reprocess();
		if (announce) showToast(`${preset.name} restored`);
	};

	elements.generateButton.addEventListener("click", () => {
		void generate(elements.seedInput.value);
	});
	elements.seedInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			void generate(elements.seedInput.value);
		}
	});
	elements.randomButton.addEventListener("click", () => {
		const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
		const nextSeed = String(random).padStart(6, "0");
		elements.seedInput.value = nextSeed;
		void generate(nextSeed);
	});
	elements.presetSelect.addEventListener("change", () => {
		if (elements.presetSelect.value !== "custom") {
			applyPreset(elements.presetSelect.value);
		}
	});
	elements.resetPresetButton.addEventListener("click", () => {
		const key =
			state.preset === "custom" ? PRESETS[0].key : elements.presetSelect.value;
		applyPreset(key);
	});
	elements.exportButton.addEventListener("click", () => {
		if (!terrain || !image) {
			showToast("Generate a terrain first");
			return;
		}
		const presetName =
			PRESETS.find((preset) => preset.key === state.preset)?.name ??
			"Custom mix";
		void downloadExport(terrain, state, image, presetName).then(() => {
			showToast("Annotated PNG exported");
			elements.status.textContent = "PNG EXPORTED";
		});
	});

	for (const tab of root.querySelectorAll<HTMLElement>(".tcl-view-tab")) {
		tab.addEventListener("click", () => {
			const nextMode = tab.dataset.view as ViewMode;
			setView(nextMode);
		});
	}
	byId<HTMLButtonElement>(root, "tcl-zoom-out").addEventListener(
		"click",
		() => {
			viewport.zoomBy(1 / 1.25);
		},
	);
	byId<HTMLButtonElement>(root, "tcl-zoom-in").addEventListener("click", () => {
		viewport.zoomBy(1.25);
	});
	byId<HTMLButtonElement>(root, "tcl-fit").addEventListener("click", () => {
		viewport.resetView();
	});

	const api: TerrainLabApi = {
		getState: () => ({
			seed: state.seed,
			preset: state.preset,
			assignments: [...state.assignments] as EditorState["assignments"],
			curves: {
				R: [...state.curves.R] as CurvePoints,
				G: [...state.curves.G] as CurvePoints,
				B: [...state.curves.B] as CurvePoints,
			},
		}),
		getPixels: () => image?.pixels.slice() ?? null,
		getSeed: () => state.seed,
		setSeed: (seed) => generate(seed),
		setChannel: (channel, bandIndex) => {
			setChannel(
				(["R", "G", "B", "A"] as Channel[]).indexOf(channel),
				bandIndex,
			);
		},
		setCurve: (channel, points) => {
			if (channel === "A") return;
			state.curves[channel] = [...points] as CurvePoints;
			markCustom();
			syncCurveCards();
			reprocess();
		},
		setView: (nextMode) => setView(nextMode),
		getExportDataUrl: () => {
			if (!terrain || !image) return null;
			const presetName =
				PRESETS.find((preset) => preset.key === state.preset)?.name ??
				"Custom mix";
			return buildExportCanvas(terrain, state, image, presetName).toDataURL(
				"image/png",
			);
		},
	};
	Object.defineProperty(globalThis, "__terrainLab", {
		value: api,
		configurable: true,
	});

	setView("composite");
	void generate(state.seed);

	return () => {
		generation++;
		if (processingFrame) cancelAnimationFrame(processingFrame);
		window.clearTimeout(toastTimer);
		viewport.destroy();
		for (const card of curves) card.destroy();
		if (
			Object.getOwnPropertyDescriptor(globalThis, "__terrainLab")?.value === api
		) {
			delete (globalThis as { __terrainLab?: TerrainLabApi }).__terrainLab;
		}
		host.remove();
	};
};
