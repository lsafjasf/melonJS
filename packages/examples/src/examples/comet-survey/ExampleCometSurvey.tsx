/**
 * melonJS — Comet Survey example: component, HUD and input.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Mouse aims the equatorial mount, the wheel sets the exposure
 * length, space opens/closes the shutter. Three accepted plates
 * (sharp and well exposed) complete the survey before the film
 * or the night runs out.
 */
import { useEffect, useRef, useState } from "react";
import { SurveyAudio } from "./audio";
import "./comet-survey.css";
import {
	CometSurveyGame,
	EXPOSURE_MAX,
	EXPOSURE_MIN,
	FILM_TOTAL,
	type HudState,
	PLATES_NEEDED,
	SIGNAL_THRESHOLD,
	VIEW_H,
	VIEW_W,
} from "./game";
import { drawFrame } from "./render";

const formatClock = (seconds: number) => {
	const s = Math.max(0, Math.ceil(seconds));
	return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const ExampleCometSurvey = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [hud, setHud] = useState<HudState | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) {
			return;
		}
		const audio = new SurveyAudio();
		const game = new CometSurveyGame(audio);
		let raf = 0;
		let last = performance.now();
		const loop = (now: number) => {
			game.update(now - last);
			last = now;
			drawFrame(ctx, game, now / 1000);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		const hudTimer = setInterval(() => setHud(game.getHud()), 100);

		const toCanvas = (e: PointerEvent) => {
			const rect = canvas.getBoundingClientRect();
			return {
				x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
				y: ((e.clientY - rect.top) / rect.height) * VIEW_H,
			};
		};
		const onMove = (e: PointerEvent) => {
			const p = toCanvas(e);
			game.setAim(p.x, p.y);
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			game.adjustExposure(e.deltaY);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.code === "Space" && !e.repeat) {
				e.preventDefault();
				audio.ensure();
				game.pressShutter();
			}
		};
		const onDown = () => audio.ensure();
		canvas.addEventListener("pointermove", onMove);
		canvas.addEventListener("pointerdown", onDown);
		canvas.addEventListener("wheel", onWheel, { passive: false });
		window.addEventListener("keydown", onKey);

		// debug hook used by the automated playtest scripts
		const debug = {
			canvas,
			game,
			getDebugSnapshot: () => game.getDebugSnapshot(),
		};
		Object.assign(globalThis, { __cometSurvey: debug });

		return () => {
			cancelAnimationFrame(raf);
			clearInterval(hudTimer);
			canvas.removeEventListener("pointermove", onMove);
			canvas.removeEventListener("pointerdown", onDown);
			canvas.removeEventListener("wheel", onWheel);
			window.removeEventListener("keydown", onKey);
			audio.dispose();
			Object.assign(globalThis, { __cometSurvey: undefined });
		};
	}, []);

	const phaseLabel = hud
		? {
				aim: "LIVE",
				exposing: "EXPOSING",
				review: "REVIEW",
				success: "COMPLETE",
				failed: "FAILED",
			}[hud.phase]
		: "LIVE";

	return (
		<div className="comet-survey">
			<header className="cs-header">
				<div className="cs-title">
					<h1>COMET SURVEY</h1>
					<p>EQUATORIAL MOUNT / NIGHT PLATE SESSION</p>
				</div>
				<div className="cs-status">
					<span className={`cs-live cs-live-${hud?.phase ?? "aim"}`} />
					<span>{phaseLabel}</span>
					<span className="cs-plates-count">
						{hud?.accepted ?? 0} / {PLATES_NEEDED} PLATES
					</span>
				</div>
			</header>
			<div className="cs-main">
				<div className="cs-viewport">
					<canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} />
					<div className="cs-hints">
						<span>
							<b>MOUSE</b> AIM
						</span>
						<span>
							<b>WHEEL</b> EXPOSURE
						</span>
						<span>
							<b>SPACE</b> SHUTTER
						</span>
						<span className="cs-hint-right">
							KEEP THE COMET IN THE LOCK RING
						</span>
					</div>
				</div>
				<aside className="cs-panel">
					<div className="cs-row">
						<div className="cs-box">
							<span className="cs-label">SESSION REMAINING</span>
							<strong>{formatClock(hud?.timeLeft ?? 0)}</strong>
						</div>
						<div className="cs-box">
							<span className="cs-label">FILM REMAINING</span>
							<strong>
								{String(hud?.filmLeft ?? FILM_TOTAL).padStart(2, "0")} /{" "}
								{FILM_TOTAL}
							</strong>
							<div className="cs-pips">
								{Array.from({ length: FILM_TOTAL }, (_, i) => (
									<i
										// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length pip row, never reorders
										key={i}
										className={i < (hud?.filmLeft ?? FILM_TOTAL) ? "on" : ""}
									/>
								))}
							</div>
						</div>
					</div>
					<div className="cs-box">
						<span className="cs-label">EXPOSURE</span>
						<strong>{(hud?.exposurePlan ?? 0).toFixed(1)} s</strong>
						<div className="cs-scale">
							<span
								className="cs-scale-fill"
								style={{
									left: `${((EXPOSURE_MIN - 1) / (EXPOSURE_MAX - 1)) * 100}%`,
									width: `${(((hud?.exposurePlan ?? 1) - 1) / (EXPOSURE_MAX - 1)) * 100}%`,
								}}
							/>
							<span
								className="cs-scale-threshold"
								style={{
									left: `${((SIGNAL_THRESHOLD - 1) / (EXPOSURE_MAX - 1)) * 100}%`,
								}}
							/>
						</div>
						<small>
							{(hud?.exposurePlan ?? 0) >= SIGNAL_THRESHOLD
								? "SIGNAL THRESHOLD PASSED"
								: `NEEDS ≥ ${SIGNAL_THRESHOLD.toFixed(1)}s`}
						</small>
					</div>
					<div className="cs-box">
						<span className="cs-label">MOUNT TELEMETRY</span>
						<strong className={hud?.locked ? "ok" : "warn"}>
							{hud?.locked ? "TARGET LOCKED" : "SEEKING"}
						</strong>
						<small>
							ERROR {Math.round(hud?.error ?? 0)} px · STAR TRAIL{" "}
							{Math.round(hud?.trailPct ?? 0)}%
						</small>
					</div>
					<div className="cs-box cs-log">
						<span className="cs-label">CAPTURE LOG</span>
						{(hud?.plates ?? []).map((plate, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: one row per film plate, never reorders
							<div key={i} className="cs-log-row">
								<span>PLATE {String(i + 1).padStart(2, "0")}</span>
								<em className={plate ? plate.status : ""}>
									{plate
										? plate.status === "accepted"
											? `ACCEPTED · ${Math.round(plate.sharp * 100)}%`
											: `REJECTED · ${plate.reason}`
										: "EMPTY"}
								</em>
							</div>
						))}
					</div>
					<p className="cs-foot">
						Aim at the comet. {PLATES_NEEDED} accepted plates complete the
						survey.
					</p>
				</aside>
			</div>
		</div>
	);
};

export default ExampleCometSurvey;
