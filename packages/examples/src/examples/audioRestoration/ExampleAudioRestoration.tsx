/**
 * melonJS — audio restoration lab example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * The app first synthesizes a fictional ten-second "old recording" (rumble,
 * mains hum, crackle and hard clipping) entirely with Web Audio, then lets
 * the player repair it with five bypassable nodes — high-pass, low-pass,
 * notch, gate and soft clip. Before/after waveforms and spectra plus clip
 * counts update live; the repaired result exports to WAV through an
 * `OfflineAudioContext`. The synthesized source buffer is never modified.
 */

import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createExampleComponent } from "../utils";
import type { BypassState, ClipCounters, RepairParams } from "./chain";
import { lab } from "./engine";
import "./restoration.css";
import { RECORDING_SECONDS } from "./synthesis";

/** mounts the melonJS Application + live repair graph under #screen */
const EngineHost = createExampleComponent(() => {
	lab.start().catch((error: unknown) => {
		console.error("Audio restoration lab failed to start", error);
	});
	return () => {
		lab.dispose();
	};
});

interface SliderSpec {
	key: keyof RepairParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

const SLIDERS: SliderSpec[] = [
	{
		key: "highpassFrequency",
		label: "High-pass cutoff",
		min: 20,
		max: 500,
		step: 1,
		unit: "Hz",
	},
	{
		key: "lowpassFrequency",
		label: "Low-pass cutoff",
		min: 2000,
		max: 16_000,
		step: 50,
		unit: "Hz",
	},
	{
		key: "notchFrequency",
		label: "Notch frequency",
		min: 30,
		max: 300,
		step: 1,
		unit: "Hz",
	},
	{
		key: "notchQ",
		label: "Notch Q (depth)",
		min: 1,
		max: 30,
		step: 0.5,
		unit: "",
	},
	{
		key: "gateThreshold",
		label: "Gate threshold",
		min: -90,
		max: 0,
		step: 1,
		unit: "dB",
	},
	{
		key: "softClipDrive",
		label: "Soft-clip drive",
		min: 1,
		max: 6,
		step: 0.1,
		unit: "×",
	},
];

const BYPASS_LABELS: { key: keyof BypassState; label: string }[] = [
	{ key: "highpass", label: "High-pass" },
	{ key: "lowpass", label: "Low-pass" },
	{ key: "notch", label: "Notch" },
	{ key: "gate", label: "Gate" },
	{ key: "softClip", label: "Soft clip" },
];

/** draws one waveform or spectrum canvas from an analyser node */
const drawMeter = (
	canvas: HTMLCanvasElement,
	analyser: AnalyserNode | null,
	mode: "waveform" | "spectrum",
	timeData: Float32Array,
	freqData: Uint8Array,
) => {
	const context = canvas.getContext("2d");
	if (!context) return;
	const { width, height } = canvas;
	context.clearRect(0, 0, width, height);
	context.lineWidth = 1.5;
	context.strokeStyle = "#7fd1ff";
	context.beginPath();

	if (!analyser) {
		context.strokeStyle = "#555";
		context.moveTo(0, height / 2);
		context.lineTo(width, height / 2);
		context.stroke();
		return;
	}

	if (mode === "waveform") {
		analyser.getFloatTimeDomainData(timeData);
		for (let x = 0; x < width; x += 1) {
			const index = Math.floor((x / width) * timeData.length);
			const y = ((1 - timeData[index]) / 2) * height;
			if (x === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
	} else {
		analyser.getByteFrequencyData(freqData);
		const barCount = 64;
		const barWidth = width / barCount;
		for (let bar = 0; bar < barCount; bar += 1) {
			const index = Math.floor((bar / barCount) * freqData.length);
			const barHeight = (freqData[index] / 255) * height;
			context.rect(
				bar * barWidth,
				height - barHeight,
				Math.max(1, barWidth - 1),
				barHeight,
			);
		}
	}
	context.stroke();
};

const MeterPanel = ({
	title,
	waveRef,
	spectrumRef,
	clips,
}: {
	title: string;
	waveRef: React.RefObject<HTMLCanvasElement | null>;
	spectrumRef: React.RefObject<HTMLCanvasElement | null>;
	clips: number;
}) => (
	<section className="ar-meter">
		<header>
			<h3>{title}</h3>
			<span className="ar-clips" data-testid={`clips-${title}`}>
				clipped samples: <strong>{clips.toLocaleString()}</strong>
			</span>
		</header>
		<canvas ref={waveRef} width={420} height={90} className="ar-canvas" />
		<canvas ref={spectrumRef} width={420} height={90} className="ar-canvas" />
	</section>
);

const RestorationUI = () => {
	const [params, setParams] = useState<RepairParams>(lab.params);
	const [bypass, setBypass] = useState<BypassState>(lab.bypass);
	const [playing, setPlaying] = useState(false);
	const [clips, setClips] = useState<ClipCounters>({ input: 0, output: 0 });
	const [exportInfo, setExportInfo] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false);

	const inputWaveRef = useRef<HTMLCanvasElement | null>(null);
	const inputSpectrumRef = useRef<HTMLCanvasElement | null>(null);
	const outputWaveRef = useRef<HTMLCanvasElement | null>(null);
	const outputSpectrumRef = useRef<HTMLCanvasElement | null>(null);

	// live meter + clip-counter refresh on requestAnimationFrame
	useEffect(() => {
		let frame = 0;
		const timeData = new Float32Array(2048);
		const freqData = new Uint8Array(1024);
		const render = () => {
			drawMeter(
				inputWaveRef.current,
				lab.getInputAnalyser(),
				"waveform",
				timeData,
				freqData,
			);
			drawMeter(
				outputWaveRef.current,
				lab.getOutputAnalyser(),
				"waveform",
				timeData,
				freqData,
			);
			drawMeter(
				inputSpectrumRef.current,
				lab.getInputAnalyser(),
				"spectrum",
				timeData,
				freqData,
			);
			drawMeter(
				outputSpectrumRef.current,
				lab.getOutputAnalyser(),
				"spectrum",
				timeData,
				freqData,
			);
			setClips(lab.readClipCounters());
			frame = requestAnimationFrame(render);
		};
		frame = requestAnimationFrame(render);
		return () => cancelAnimationFrame(frame);
	}, []);

	const onSlider = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		const key = event.target.name as keyof RepairParams;
		const value = Number.parseFloat(event.target.value);
		const patch = { [key]: value } as Partial<RepairParams>;
		lab.setParams(patch);
		setParams({ ...lab.params });
	}, []);

	const onBypass = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		const key = event.target.name as keyof BypassState;
		const patch = { [key]: event.target.checked } as Partial<BypassState>;
		lab.setBypass(patch);
		setBypass({ ...lab.bypass });
	}, []);

	const onPlay = useCallback(() => {
		void lab.togglePlayback().then(() => setPlaying(lab.isPlaying()));
	}, []);

	const onRegenerate = useCallback(() => {
		void lab.regenerate().then(() => setPlaying(lab.isPlaying()));
	}, []);

	const onExport = useCallback(async () => {
		setExporting(true);
		try {
			const result = await lab.exportWav();
			setExportInfo(
				`WAV ${result.sampleRate} Hz, ${result.length} samples, ` +
					`${result.duration.toFixed(3)} s, ${result.bytes.toLocaleString()} bytes — ` +
					`output clips: ${result.clips.output.toLocaleString()}`,
			);
		} finally {
			setExporting(false);
		}
	}, []);

	return (
		<div className="ar-panel">
			<EngineHost />
			<p className="ar-intro">
				A fictional {RECORDING_SECONDS}-second recording, synthesized with Web
				Audio and damaged with rumble, 50 Hz hum, crackle and hard clipping.
				Repair it below — every node bypasses and every slider reaches the live
				graph instantly.
			</p>

			<div className="ar-toolbar">
				<button
					type="button"
					onClick={onPlay}
					className="ar-button"
					data-testid="play"
				>
					{playing ? "Stop" : "Play"}
				</button>
				<button type="button" onClick={onRegenerate} className="ar-button">
					New take
				</button>
				<button
					type="button"
					onClick={() => void onExport()}
					className="ar-button ar-primary"
					disabled={exporting}
					data-testid="export"
				>
					{exporting ? "Rendering…" : "Export WAV (offline)"}
				</button>
			</div>

			<div className="ar-meters">
				<MeterPanel
					title="Before"
					waveRef={inputWaveRef}
					spectrumRef={inputSpectrumRef}
					clips={clips.input}
				/>
				<MeterPanel
					title="After"
					waveRef={outputWaveRef}
					spectrumRef={outputSpectrumRef}
					clips={clips.output}
				/>
			</div>

			<div className="ar-controls">
				{SLIDERS.map((slider) => (
					<label key={slider.key} className="ar-slider">
						<span>
							{slider.label}
							<strong>
								{params[slider.key]}
								{slider.unit ? ` ${slider.unit}` : ""}
							</strong>
						</span>
						<input
							type="range"
							name={slider.key}
							min={slider.min}
							max={slider.max}
							step={slider.step}
							value={params[slider.key]}
							onChange={onSlider}
						/>
					</label>
				))}
			</div>

			<fieldset className="ar-bypass">
				<legend>Bypass nodes (dry path)</legend>
				{BYPASS_LABELS.map((item) => (
					<label key={item.key} className="ar-check">
						<input
							type="checkbox"
							name={item.key}
							checked={bypass[item.key]}
							onChange={onBypass}
						/>
						{item.label}
					</label>
				))}
			</fieldset>

			{exportInfo ? (
				<p className="ar-export-info" data-testid="export-info">
					{exportInfo}
				</p>
			) : null}
		</div>
	);
};

export const ExampleAudioRestoration = RestorationUI;
