import { Application, input, type Pointer } from "melonjs";
import { createExampleComponent } from "../utils";
import {
	type ConnectResult,
	type GameSnapshot,
	parseSeed,
	VIEW_HEIGHT,
	VIEW_WIDTH,
} from "./model";
import { SignalRepairView } from "./renderer";

interface SignalRepairTestBridge {
	getSeed(): number;
	start(): Promise<void>;
	restart(seed?: number): Promise<void>;
	reseed(): void;
	applySolution(): void;
	miswire(lane?: number): ConnectResult;
	snapshot(): GameSnapshot & {
		audioAvailable: boolean;
		protectionActive: boolean;
	};
}

type BridgeHost = typeof globalThis & {
	__SIGNAL_REPAIR_TEST__?: SignalRepairTestBridge;
};

const seedFromAddress = (): number => {
	const query = globalThis.location.hash.split("?")[1] ?? "";
	const seed = new URLSearchParams(query).get("seed");
	return parseSeed(seed);
};

const pointerPosition = (pointer: Pointer): { x: number; y: number } => {
	return { x: pointer.gameWorldX, y: pointer.gameWorldY };
};

const createGame = async () => {
	const app = new Application(VIEW_WIDTH, VIEW_HEIGHT, {
		parent: "screen",
		scale: "auto",
		scaleMethod: "fit",
		backgroundColor: "#061015",
		antiAlias: true,
	});
	await app.init();

	const view = new SignalRepairView(seedFromAddress());
	app.world.addChild(view, 20);

	const onDown = (pointer: Pointer): boolean => {
		const point = pointerPosition(pointer);
		view.onPointerDown(point.x, point.y);
		return false;
	};
	const onMove = (pointer: Pointer): boolean => {
		const point = pointerPosition(pointer);
		view.onPointerMove(point.x, point.y);
		return false;
	};
	const onUp = (pointer: Pointer): boolean => {
		const point = pointerPosition(pointer);
		view.onPointerUp(point.x, point.y);
		return false;
	};

	input.registerPointerEvent("pointerdown", app.viewport, onDown);
	input.registerPointerEvent("pointermove", app.viewport, onMove);
	input.registerPointerEvent("pointerup", app.viewport, onUp);

	const bridge: SignalRepairTestBridge = {
		getSeed: () => view.session.model.seed,
		async start() {
			view.start();
			await view.audio.resume();
		},
		async restart(seed = view.session.model.seed) {
			view.restart(seed, true);
			await view.audio.resume();
		},
		reseed: () => view.reseed(),
		applySolution: () => view.applySolution(),
		miswire: (lane = 0) => view.miswire(lane),
		snapshot: () => view.snapshot(),
	};
	(globalThis as BridgeHost).__SIGNAL_REPAIR_TEST__ = bridge;

	return () => {
		input.releasePointerEvent("pointerdown", app.viewport, onDown);
		input.releasePointerEvent("pointermove", app.viewport, onMove);
		input.releasePointerEvent("pointerup", app.viewport, onUp);
		view.audio.destroy();
		const host = globalThis as BridgeHost;
		if (host.__SIGNAL_REPAIR_TEST__ === bridge) {
			delete host.__SIGNAL_REPAIR_TEST__;
		}
	};
};

export const ExampleSignalRepair = createExampleComponent(createGame);
