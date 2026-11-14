/**
 * Seeded procedural generation of the sedimentary section.
 *
 * The model is built as a column grid and evolves through a deterministic
 * event sequence: each layer is deposited, two faults slip, and three
 * erosion events carve valleys. Every event snapshots every interface, which
 * is what the 20 Ma time slider rewinds. Faults apply the *same* vertical
 * throw to every interface at the same column, so the layers on either side
 * stay coherent — the whole block moves, not just one contact.
 */
import { hashSeed, mulberry32, nextBetween, nextInt, pick } from "./rng";
import type {
	ErosionDef,
	FaultDef,
	InterfaceSamples,
	LayerDef,
	RockStyle,
	RockType,
	SectionModel,
	TimelineEvent,
} from "./types";

/** number of sampled columns across the section width */
export const COLS = 160;
/** full simulated history, in millions of years */
export const TOTAL_AGE = 20;
/** modelled depth of the oldest layer base */
const BASE_DEPTH = 720;
/** average layer thickness bounds, in depth units */
const MIN_THICKNESS = 42;
const MAX_THICKNESS = 96;

const ROCK_STYLES: Record<RockType, RockStyle> = {
	conglomerate: {
		type: "conglomerate",
		label: "砾岩 Conglomerate",
		color: "#9c7a5e",
		hardness: [6, 7],
	},
	sandstone: {
		type: "sandstone",
		label: "砂岩 Sandstone",
		color: "#c9a063",
		hardness: [5.5, 6.5],
	},
	siltstone: {
		type: "siltstone",
		label: "粉砂岩 Siltstone",
		color: "#b8a383",
		hardness: [4, 5],
	},
	shale: {
		type: "shale",
		label: "页岩 Shale",
		color: "#77808c",
		hardness: [2.5, 3.5],
	},
	limestone: {
		type: "limestone",
		label: "石灰岩 Limestone",
		color: "#c8c2a8",
		hardness: [3, 4],
	},
	mudstone: {
		type: "mudstone",
		label: "泥岩 Mudstone",
		color: "#8d7b6d",
		hardness: [2, 3],
	},
	dolomite: {
		type: "dolomite",
		label: "白云岩 Dolomite",
		color: "#d8d3c0",
		hardness: [3.5, 4],
	},
};

const ROCK_ORDER: RockType[] = [
	"conglomerate",
	"sandstone",
	"siltstone",
	"shale",
	"limestone",
	"mudstone",
	"dolomite",
];

/** Smooth deterministic value noise in [0, 1] over column 0..COLS-1. */
const makeNoise1D = (
	random: () => number,
	frequency: number,
): ((column: number) => number) => {
	const phases = [
		random() * Math.PI * 2,
		random() * Math.PI * 2,
		random() * Math.PI * 2,
	];
	return (column: number) => {
		const x = (column / COLS) * Math.PI * 2 * frequency;
		const value =
			0.55 * Math.sin(x + phases[0]) +
			0.3 * Math.sin(x * 2.3 + phases[1]) +
			0.15 * Math.sin(x * 5.1 + phases[2]);
		return (value + 1) / 2;
	};
};

export const cloneSurfaces = (
	surfaces: InterfaceSamples[],
): InterfaceSamples[] => surfaces.map((surface) => Float32Array.from(surface));

/** Carve a rounded valley out of every interface (uniform erosion). */
const erodeSurfaces = (
	surfaces: InterfaceSamples[],
	centre: number,
	width: number,
	depth: number,
): void => {
	for (const surface of surfaces) {
		for (let column = 0; column < COLS; column++) {
			const distance = (column - centre) / width;
			if (Math.abs(distance) < 1) {
				const cut = depth * 0.5 * (1 + Math.cos(Math.PI * distance));
				surface[column] = Math.max(0, surface[column] - cut);
			}
		}
	}
};

/**
 * Slip every interface along the fault plane. The throw is identical for
 * every layer, so adjacent strata keep a matching displacement and the
 * contacts line up across the plane.
 */
const slipSurfaces = (
	surfaces: InterfaceSamples[],
	column: number,
	throwAmount: number,
	dipColumns: number,
): void => {
	for (const surface of surfaces) {
		const original = Float32Array.from(surface);
		for (let x = 0; x < COLS; x++) {
			const depth = original[x];
			const planeX = column + (depth / BASE_DEPTH) * dipColumns;
			surface[x] = original[x] + (x >= planeX ? throwAmount : 0);
		}
	}
};

interface GeologicalEvent {
	age: number;
	/** tie-breaker so deposits, faults and erosion stay deterministic */
	order: number;
	label: string;
	kind: TimelineEvent["kind"];
	/** mutates the live surface array when the event is replayed */
	replay: (surfaces: InterfaceSamples[]) => void;
}

/**
 * Build the complete section for a seed. Pure: identical seeds return an
 * identical model down to every texture grain and fault position.
 */
export const generateSection = (seed: string): SectionModel => {
	const seedHash = hashSeed(seed);
	const random = mulberry32(seedHash);

	const layerCount = nextInt(random, 8, 12);
	const basementNoise = makeNoise1D(random, 1.4);
	const thicknessNoise = makeNoise1D(random, 2.2);

	// Age bands: oldest layer base at 20 Ma, youngest top near the present.
	const weights = Array.from({ length: layerCount }, () =>
		nextBetween(random, 0.7, 1.3),
	);
	const weightSum = weights.reduce((sum, value) => sum + value, 0);

	const layers: LayerDef[] = [];
	const events: GeologicalEvent[] = [];

	// Basement top, the base under the oldest sedimentary layer.
	const basement = new Float32Array(COLS);
	for (let column = 0; column < COLS; column++) {
		basement[column] = BASE_DEPTH + (basementNoise(column) - 0.5) * 40;
	}

	let ageCursor = 0;
	let previousTop = basement;

	// Layers are authored oldest-first. Their deposition events are replayed
	// in the same order below.
	for (let i = 0; i < layerCount; i++) {
		const mean = nextBetween(random, MIN_THICKNESS, MAX_THICKNESS);
		const top = new Float32Array(COLS);
		for (let column = 0; column < COLS; column++) {
			const thickness = mean * (0.78 + thicknessNoise(column) * 0.44);
			top[column] = Math.max(0, previousTop[column] - thickness);
		}
		previousTop = top;

		const ageSpan = (weights[i] / weightSum) * TOTAL_AGE;
		const ageBase = TOTAL_AGE - ageCursor;
		ageCursor += ageSpan;
		const ageTop = TOTAL_AGE - ageCursor;

		let rockType = pick(random, ROCK_ORDER);
		if (i > 0 && layers[layers.length - 1].rock.type === rockType) {
			rockType = pick(random, ROCK_ORDER);
		}
		const rock = ROCK_STYLES[rockType];
		const hardness = nextBetween(random, rock.hardness[0], rock.hardness[1]);

		layers.push({
			index: i,
			name: `L${String(i + 1).padStart(2, "0")}`,
			rock,
			hardness: Number(hardness.toFixed(1)),
			ageTop: Number(ageTop.toFixed(2)),
			ageBase: Number(ageBase.toFixed(2)),
			meanThickness: Number(mean.toFixed(1)),
			visible: true,
		});

		// The surface only exists from this layer's deposition onward.
		const surfaceCopy = Float32Array.from(top);
		events.push({
			age: Number(ageTop.toFixed(2)),
			order: i,
			label: `${layers[i].name} ${rock.label} 沉积`,
			kind: "deposit",
			replay: (surfaces) => {
				surfaces.push(Float32Array.from(surfaceCopy));
			},
		});
	}

	// Two faults with separated columns and a coherent slip on every layer.
	const faults: FaultDef[] = [];
	let lastFaultColumn = -COLS;
	for (let f = 0; f < 2; f++) {
		let column = nextInt(random, COLS * 0.2, COLS * 0.8);
		if (Math.abs(column - lastFaultColumn) < COLS * 0.2) {
			column = Math.min(COLS - 12, column + Math.round(COLS * 0.24));
		}
		lastFaultColumn = column;
		const fault: FaultDef = {
			index: f,
			column,
			throwAmount: Number(nextBetween(random, 26, 58) * (f === 0 ? 1 : -1)),
			dipColumns: Number(nextBetween(random, -7, 7).toFixed(1)),
			age: Number(nextBetween(random, 4, 16).toFixed(2)),
		};
		faults.push(fault);
		events.push({
			age: fault.age,
			order: 100 + f,
			label: `F${f + 1} 断层错动 ${Math.abs(fault.throwAmount).toFixed(0)} m`,
			kind: "fault",
			replay: (surfaces) => {
				slipSurfaces(
					surfaces,
					fault.column,
					fault.throwAmount,
					fault.dipColumns,
				);
			},
		});
	}

	// Three erosion events carving valleys at distinct times and places.
	const erosions: ErosionDef[] = [];
	for (let e = 0; e < 3; e++) {
		const erosion: ErosionDef = {
			index: e,
			column: Math.round(nextBetween(random, COLS * 0.12, COLS * 0.88)),
			width: nextBetween(random, 9, 18),
			depth: nextBetween(random, 34, 78),
			age: Number(nextBetween(random, 1, 17).toFixed(2)),
		};
		erosions.push(erosion);
		events.push({
			age: erosion.age,
			order: 200 + e,
			label: `E${e + 1} 侵蚀沟谷`,
			kind: "erosion",
			replay: (surfaces) => {
				erodeSurfaces(surfaces, erosion.column, erosion.width, erosion.depth);
			},
		});
	}

	// Replay oldest-first; each event snapshots the interfaces as they were.
	events.sort((a, b) => b.age - a.age || a.order - b.order);
	const liveSurfaces: InterfaceSamples[] = [];
	const timeline: TimelineEvent[] = [];
	for (const event of events) {
		event.replay(liveSurfaces);
		timeline.push({
			age: event.age,
			label: event.label,
			kind: event.kind,
			surfaces: cloneSurfaces(liveSurfaces),
			deposited: liveSurfaces.length,
		});
	}
	timeline.reverse();

	faults.sort((a, b) => a.age - b.age);
	erosions.sort((a, b) => a.age - b.age);

	return {
		seed,
		seedHash,
		cols: COLS,
		layers,
		faults,
		erosions,
		timeline,
		totalAge: TOTAL_AGE,
	};
};

/**
 * Interface snapshot to draw at a given view age. Events older than the
 * view age have happened; younger layers and events are not shown yet.
 */
export const surfacesAtAge = (
	model: SectionModel,
	viewAge: number,
): { surfaces: InterfaceSamples[]; deposited: number; eventIndex: number } => {
	let eventIndex = -1;
	for (let i = 0; i < model.timeline.length; i++) {
		if (model.timeline[i].age <= viewAge + 1e-6) {
			eventIndex = i;
		} else {
			break;
		}
	}
	if (eventIndex < 0) {
		return { surfaces: [], deposited: 0, eventIndex };
	}
	const event = model.timeline[eventIndex];
	return {
		surfaces: event.surfaces,
		deposited: event.deposited,
		eventIndex,
	};
};
