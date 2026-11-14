import type { Cue } from "./webvtt";

export const initialCues = (): Cue[] => {
	return [
		{
			id: "cue-1",
			start: 0,
			end: 4_500,
			text: "清晨的第一束光，落在旧放映机上。",
		},
		{
			id: "cue-2",
			start: 4_800,
			end: 9_000,
			text: "胶片转动，城市从梦里醒来。",
		},
		{
			id: "cue-3",
			start: 9_500,
			end: 14_000,
			text: "我们把每一句话，都对到正确的瞬间。",
		},
		{
			id: "cue-4",
			start: 14_300,
			end: 19_000,
			text: "声音先到，画面随后，字幕不再迟到。",
		},
		{
			id: "cue-5",
			start: 19_500,
			end: 24_500,
			text: "拖动入点与出点，时间以 0.1 秒为单位改变。",
		},
		{
			id: "cue-6",
			start: 25_000,
			end: 29_500,
			text: "导出 WebVTT，再导入，文字与顺序原样回来。",
		},
	];
};
