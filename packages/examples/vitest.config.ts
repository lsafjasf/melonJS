/// <reference types="vitest" />
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The packer tests exercise real 2D canvases (trimming, rotation, pixel
// round-trips), so they run in Chromium like the engine's browser tests.
export default defineConfig({
	test: {
		// Only the atlas packer runs under Vitest: the earthDefender
		// `*.test.ts` is a standalone `tsx` script (it imports node:fs and
		// calls process.exit itself), not a Vitest spec.
		include: ["src/examples/atlasPacker/tests/**/*.test.ts"],
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
