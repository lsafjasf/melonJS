/**
 * Data model of a procedurally generated geological cross-section.
 *
 * The section is sampled on a regular column grid (`COLS` columns). Each
 * layer stores the depth of its top interface at every column; depth grows
 * downward, matching the on-screen y axis. Every geological event (layer
 * deposition, erosion, fault slip) stores a full interface snapshot so the
 * time slider can rewind the section to any point in its 20 Ma history.
 */

/** Depth samples of one interface (a layer top), one value per column. */
export type InterfaceSamples = Float32Array;

export type RockType =
	| "conglomerate"
	| "sandstone"
	| "siltstone"
	| "shale"
	| "limestone"
	| "mudstone"
	| "dolomite";

export interface RockStyle {
	type: RockType;
	label: string;
	/** base fill colour used by the procedural texture */
	color: string;
	/** Mohs-scale hardness range, sampled per layer from the seed */
	hardness: [number, number];
}

export interface LayerDef {
	index: number;
	name: string;
	rock: RockStyle;
	/** Mohs hardness rolled for this specific layer */
	hardness: number;
	/** age of the layer top in Ma (0 = present) */
	ageTop: number;
	/** age of the layer base in Ma */
	ageBase: number;
	/** mean modelled thickness, in world depth units */
	meanThickness: number;
	visible: boolean;
}

export interface FaultDef {
	index: number;
	/** column at which the fault plane crosses the section */
	column: number;
	/** vertical slip in depth units applied to every interface coherently */
	throwAmount: number;
	/** plane tilt: horizontal shift in columns over the visible depth */
	dipColumns: number;
	/** Ma at which the slip happened */
	age: number;
}

export interface ErosionDef {
	index: number;
	/** valley centre in column space */
	column: number;
	/** valley half-width in columns */
	width: number;
	/** maximum carved depth in depth units */
	depth: number;
	/** Ma at which the erosion happened */
	age: number;
}

/** One entry of the event timeline used by the time slider. */
export interface TimelineEvent {
	/** age in Ma at/after which this snapshot is valid */
	age: number;
	label: string;
	kind: "deposit" | "erosion" | "fault";
	/** depth of every interface at every column at this point in time */
	surfaces: InterfaceSamples[];
	/** number of layers present in this snapshot (youngest not yet deposited) */
	deposited: number;
}

export interface SectionModel {
	seed: string;
	seedHash: number;
	cols: number;
	layers: LayerDef[];
	faults: FaultDef[];
	erosions: ErosionDef[];
	/** events ordered youngest (present) first, oldest last */
	timeline: TimelineEvent[];
	/** full span of simulated time, in Ma */
	totalAge: number;
}
