/**
 * melonJS — pseudo-colour terrain: editor skin.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */

export const STYLE_ID = "pseudo-color-terrain-style";

export const STYLES = `
.tcl-app {
	--bg: #080b0e;
	--panel: #0d1217;
	--panel-2: #111820;
	--line: #202b34;
	--line-soft: rgba(255, 255, 255, 0.07);
	--text: #e9f0f3;
	--muted: #8195a0;
	--dim: #5d707b;
	--accent: #a5eb6f;
	--accent-ink: #0b1307;
	--danger: #ff6b63;
	font-family: "Inter", "Segoe UI", system-ui, sans-serif;
	color: var(--text);
	background: var(--bg);
	width: 100%;
	height: 100%;
	min-height: 0;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}
.tcl-app * { box-sizing: border-box; }
.tcl-app button, .tcl-app select, .tcl-app input { font: inherit; }
.tcl-topbar {
	height: 68px;
	flex: none;
	display: flex;
	align-items: center;
	gap: 22px;
	padding: 0 22px;
	background: linear-gradient(180deg, #0d1318 0%, #090e12 100%);
	border-bottom: 1px solid var(--line);
	z-index: 5;
}
.tcl-brand {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 245px;
}
.tcl-mark {
	width: 31px;
	height: 31px;
	border: 1px solid #35434d;
	display: grid;
	place-items: center;
	background: #0a1015;
	position: relative;
}
.tcl-mark::before, .tcl-mark::after {
	content: "";
	position: absolute;
	inset: 6px;
	border: 1px solid #71909f;
	transform: rotate(45deg);
}
.tcl-mark::after {
	inset: 10px;
	border-color: var(--accent);
	transform: none;
}
.tcl-brand-name {
	font-size: 15px;
	font-weight: 700;
	letter-spacing: 0.12em;
	line-height: 1.1;
}
.tcl-brand-sub {
	margin-top: 4px;
	font-size: 9px;
	letter-spacing: 0.16em;
	color: var(--dim);
}
.tcl-header-mid {
	display: flex;
	align-items: center;
	gap: 10px;
	flex: 1;
	min-width: 0;
}
.tcl-seed-label, .tcl-preset-label {
	font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
	letter-spacing: 0.1em;
	color: var(--dim);
}
.tcl-seed-box {
	display: flex;
	align-items: center;
	height: 34px;
	background: #070b0e;
	border: 1px solid #2b3740;
	border-radius: 4px;
	overflow: hidden;
}
.tcl-seed-box:focus-within { border-color: #627680; }
.tcl-hash {
	color: #5e7480;
	padding-left: 10px;
	font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-seed-input {
	width: 108px;
	border: 0;
	outline: 0;
	background: transparent;
	color: var(--text);
	padding: 0 8px;
	font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace;
	letter-spacing: 0.03em;
}
.tcl-generate, .tcl-ghost-button, .tcl-export, .tcl-icon-button {
	border: 1px solid #33414a;
	background: #131b22;
	color: #cfdbe0;
	cursor: pointer;
	height: 32px;
	border-radius: 4px;
	padding: 0 12px;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.08em;
	white-space: nowrap;
}
.tcl-generate, .tcl-export {
	border-color: #90c761;
	background: var(--accent);
	color: var(--accent-ink);
}
.tcl-generate:hover, .tcl-export:hover { filter: brightness(1.06); }
.tcl-ghost-button:hover, .tcl-icon-button:hover {
	border-color: #5c707b;
	background: #1a252d;
}
.tcl-preset-select {
	height: 34px;
	min-width: 176px;
	max-width: 220px;
	background: #0a0f13;
	border: 1px solid #2b3740;
	border-radius: 4px;
	color: #c9d7dd;
	padding: 0 9px;
	outline: none;
	font-size: 11px;
}
.tcl-header-right {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}
.tcl-size-badge {
	display: flex;
	flex-direction: column;
	line-height: 1.3;
	font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
	color: var(--dim);
	text-align: right;
}
.tcl-size-badge strong { color: #a9bcc5; font-weight: 600; }
.tcl-main {
	flex: 1;
	min-height: 0;
	display: flex;
}
.tcl-workbench {
	flex: 1;
	min-width: 0;
	min-height: 0;
	padding: 14px 14px 10px;
	display: flex;
	flex-direction: column;
	gap: 9px;
}
.tcl-view-toolbar {
	height: 38px;
	flex: none;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 0 2px;
}
.tcl-view-tabs {
	display: flex;
	gap: 2px;
	padding: 3px;
	border: 1px solid var(--line);
	background: #0b1015;
	border-radius: 5px;
}
.tcl-view-tab {
	height: 28px;
	border: 0;
	border-radius: 3px;
	padding: 0 14px;
	background: transparent;
	color: #77909b;
	cursor: pointer;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.06em;
}
.tcl-view-tab.active {
	background: #e9f1f4;
	color: #0b1216;
}
.tcl-view-tab:hover:not(.active) { color: #cfdde3; }
.tcl-single-bands {
	display: flex;
	gap: 3px;
	margin-left: 2px;
}
.tcl-single-bands[hidden] { display: none; }
.tcl-band-button {
	height: 28px;
	min-width: 30px;
	padding: 0 7px;
	border: 1px solid var(--line);
	border-radius: 3px;
	background: #0d1318;
	color: #8297a2;
	cursor: pointer;
	font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-band-button.active {
	border-color: #697f8b;
	color: #f0f7fa;
	background: #18232b;
}
.tcl-toolbar-spacer { flex: 1; }
.tcl-zoom-readout {
	min-width: 52px;
	text-align: center;
	color: #a6bac3;
	font: 600 10px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-icon-button {
	width: 30px;
	padding: 0;
	font-size: 15px;
	font-weight: 400;
	letter-spacing: 0;
}
.tcl-viewport {
	position: relative;
	flex: 1;
	min-height: 0;
	border: 1px solid var(--line);
	border-radius: 5px;
	overflow: hidden;
	background: #090d11;
}
.tcl-view-canvas {
	position: absolute;
	inset: 0;
	display: block;
	cursor: crosshair;
	touch-action: none;
	z-index: 0;
}
.tcl-viewport-note {
	position: absolute;
	left: 14px;
	top: 12px;
	display: flex;
	gap: 8px;
	align-items: center;
	pointer-events: none;
	z-index: 2;
}
.tcl-mode-badge {
	padding: 5px 8px;
	background: rgba(3, 8, 11, 0.68);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 3px;
	color: #d8e5e9;
	font: 600 9px ui-monospace, SFMono-Regular, Menlo, monospace;
	letter-spacing: 0.08em;
}
.tcl-coordinates {
	padding: 5px 8px;
	background: rgba(3, 8, 11, 0.5);
	border-radius: 3px;
	color: #8297a2;
	font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-viewport-hint {
	position: absolute;
	right: 14px;
	bottom: 12px;
	color: #657a85;
	font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
	pointer-events: none;
	z-index: 2;
}
.tcl-sample-float {
	position: absolute;
	left: 14px;
	bottom: 14px;
	width: 332px;
	padding: 9px 10px 8px;
	background: rgba(7, 12, 16, 0.93);
	border: 1px solid rgba(255, 255, 255, 0.13);
	border-radius: 5px;
	box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
	backdrop-filter: blur(10px);
	pointer-events: none;
	z-index: 3;
}
.tcl-sample-float:empty { display: none; }
.tcl-sidebar {
	width: 394px;
	flex: none;
	min-height: 0;
	overflow-y: auto;
	border-left: 1px solid var(--line);
	background: #0b1014;
	scrollbar-width: thin;
	scrollbar-color: #2b3942 #0b1014;
}
.tcl-section {
	border-bottom: 1px solid var(--line);
	padding: 11px 14px 13px;
}
.tcl-section-head {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: 12px;
	margin-bottom: 9px;
}
.tcl-section-title {
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.11em;
	color: #d8e6ec;
}
.tcl-section-sub {
	font: 9px ui-monospace, SFMono-Regular, Menlo, monospace;
	color: var(--dim);
	letter-spacing: 0.04em;
	text-align: right;
}
.tcl-channel-list { display: flex; flex-direction: column; gap: 6px; }
.tcl-channel-row {
	display: grid;
	grid-template-columns: 25px 1fr auto;
	align-items: center;
	gap: 8px;
	height: 36px;
	padding: 0 8px 0 7px;
	border: 1px solid #1d2830;
	background: #0e151b;
	border-radius: 3px;
}
.tcl-channel-letter {
	font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-channel-row[data-channel="R"] .tcl-channel-letter { color: #ff625d; }
.tcl-channel-row[data-channel="G"] .tcl-channel-letter { color: #5ddd7f; }
.tcl-channel-row[data-channel="B"] .tcl-channel-letter { color: #63a1ff; }
.tcl-channel-row[data-channel="A"] .tcl-channel-letter { color: #f2bf63; }
.tcl-band-select {
	width: 100%;
	min-width: 0;
	height: 28px;
	padding: 0 5px;
	border: 0;
	background: transparent;
	color: #d8e5ea;
	outline: none;
	font-size: 11px;
	cursor: pointer;
}
.tcl-band-tag {
	color: #70858f;
	font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
	white-space: nowrap;
}
.tcl-alpha-note {
	margin-top: 7px;
	padding: 6px 8px;
	border-radius: 3px;
	background: #0d1419;
	color: #6d838e;
	font-size: 9.5px;
	line-height: 1.4;
}
.tcl-sample-empty {
	min-height: 68px;
	display: grid;
	place-items: center;
	padding: 10px;
	border: 1px dashed #26343e;
	border-radius: 4px;
	color: #607681;
	font-size: 11px;
	text-align: center;
	line-height: 1.5;
}
.tcl-sample-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 6px;
	color: #cfe0e6;
	font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-sample-head span { color: #6c828d; font-weight: 400; }
.tcl-sample-table { width: 100%; border-collapse: collapse; }
.tcl-sample-table th {
	text-align: right;
	font: 600 8px ui-monospace, SFMono-Regular, Menlo, monospace;
	letter-spacing: 0.08em;
	color: #5e747e;
	padding: 0 0 5px 4px;
}
.tcl-sample-table th:first-child { text-align: left; }
.tcl-sample-table td {
	border-top: 1px solid #17222a;
	padding: 3px 0 3px 4px;
	vertical-align: top;
}
.tcl-sample-band {
	display: flex;
	align-items: center;
	gap: 7px;
	font-size: 9.5px;
	color: #c5d5dc;
}
.tcl-sample-dot { width: 4px; height: 14px; flex: none; }
.tcl-sample-index {
	font: 9px ui-monospace, SFMono-Regular, Menlo, monospace;
	color: #66808b;
}
.tcl-value {
	text-align: right;
	font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace;
	color: #dfebef;
}
.tcl-value small {
	display: block;
	font: 7.5px ui-monospace, SFMono-Regular, Menlo, monospace;
	color: #627883;
}
.tcl-value.output { color: var(--accent); }
.tcl-curve-channel {
	font: 700 9px ui-monospace, SFMono-Regular, Menlo, monospace;
	color: #8398a2;
}
.tcl-extra-row {
	margin-top: 5px;
	padding-top: 6px;
	border-top: 1px solid #1b262e;
	display: flex;
	align-items: center;
	justify-content: space-between;
	font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-output-chips { display: flex; gap: 5px; }
.tcl-chip {
	min-width: 34px;
	padding: 2px 4px;
	background: #121a20;
	border-radius: 2px;
	text-align: center;
	color: #8da2ac;
}
.tcl-chip b { display: block; color: #e3eef2; font-weight: 600; }
.tcl-curves { display: flex; flex-direction: column; gap: 7px; }
.tcl-curve-card {
	border: 1px solid #1e2a32;
	border-radius: 4px;
	overflow: hidden;
	background: #0c1216;
}
.tcl-curve-head {
	height: 25px;
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 0 8px;
	border-bottom: 1px solid #1b262e;
	font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-curve-head .dot { width: 5px; height: 5px; border-radius: 50%; }
.tcl-curve-head strong { font-weight: 700; }
.tcl-curve-band { color: #91a4ad; }
.tcl-curve-values {
	margin-left: auto;
	color: #5f7681;
	font-size: 9px;
	letter-spacing: 0.02em;
}
.tcl-curve-reset {
	border: 0;
	background: transparent;
	color: #647b85;
	font-size: 9px;
	cursor: pointer;
	padding: 2px 4px;
}
.tcl-curve-reset:hover { color: #c9d9df; }
.tcl-curve-canvas {
	display: block;
	width: 100%;
	height: 66px;
	cursor: ns-resize;
	touch-action: none;
}
.tcl-curve-foot {
	display: flex;
	justify-content: space-between;
	padding: 1px 8px 4px;
	color: #506771;
	font: 8px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tcl-statusbar {
	height: 26px;
	flex: none;
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 0 16px;
	border-top: 1px solid var(--line);
	background: #080c0f;
	color: #5e747e;
	font: 9px ui-monospace, SFMono-Regular, Menlo, monospace;
	letter-spacing: 0.04em;
}
.tcl-status-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--accent);
}
.tcl-statusbar .spacer { flex: 1; }
.tcl-statusbar strong { color: #99adb7; font-weight: 500; }
.tcl-toast {
	position: absolute;
	left: 50%;
	bottom: 22px;
	transform: translate(-50%, 10px);
	opacity: 0;
	transition: opacity 160ms ease, transform 160ms ease;
	background: #e8f3ea;
	color: #122016;
	border-radius: 4px;
	padding: 8px 14px;
	font-size: 11px;
	font-weight: 600;
	pointer-events: none;
	box-shadow: 0 8px 28px rgba(0,0,0,0.35);
	z-index: 4;
}
.tcl-toast.show { opacity: 1; transform: translate(-50%, 0); }
.tcl-generating {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	background: rgba(4, 8, 11, 0.52);
	color: #cfe1e7;
	font: 600 10px ui-monospace, SFMono-Regular, Menlo, monospace;
	letter-spacing: 0.12em;
	pointer-events: none;
	opacity: 0;
	transition: opacity 120ms ease;
	z-index: 5;
}
.tcl-generating.show { opacity: 1; }
@media (max-width: 1080px) {
	.tcl-brand-sub { display: none; }
	.tcl-brand { min-width: 170px; }
	.tcl-size-badge { display: none; }
	.tcl-preset-select { min-width: 142px; }
}
@media (max-width: 860px) {
	.tcl-topbar { gap: 10px; padding: 0 12px; }
	.tcl-header-mid { gap: 6px; }
	.tcl-seed-label, .tcl-preset-label { display: none; }
	.tcl-preset-select { min-width: 120px; max-width: 145px; }
	.tcl-sidebar { width: 330px; }
	.tcl-view-tab { padding: 0 9px; }
}
`;
