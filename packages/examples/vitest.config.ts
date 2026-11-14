/// <reference types="vitest" />
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The workbench exercises OfflineAudioContext and WAV encoding, so the
// specs run in a real Chromium like the engine's own audio tests.
export default defineConfig({
	test: {
		include: ["tests/**/*.{test,spec}.[jt]s?(x)"],
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [
				{
					browser: "chromium",
					headless: true,
					screenshotFailures: false,
				},
			],
		},
	},
});
