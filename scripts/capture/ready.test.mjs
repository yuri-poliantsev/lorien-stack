import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countPoses, formatManifestLine, workingNeed } from "./ready.mjs";

describe("capture ready", () => {
	it("needs 1, 3, and 14 working poses at N=1, 8, and 40", () => {
		assert.equal(workingNeed(1), 1);
		assert.equal(workingNeed(8), 3);
		assert.equal(workingNeed(40), 14);
	});

	it("writes the pose mix on the still manifest line", () => {
		assert.equal(
			formatManifestLine({
				path: "/tmp/theme-night/04c/starcraft-40.png",
				n: 40,
				theme: "starcraft",
				avgFrameMs: "1.55",
				working: 14,
				idle: 18,
				sleeping: 8,
			}),
			"/tmp/theme-night/04c/starcraft-40.png\tN=40\ttheme=starcraft\tavgFrameMs=1.55\tworking=14\tidle=18\tsleeping=8",
		);
	});

	it("counts only working, idle, and sleeping poses", () => {
		assert.deepEqual(countPoses(["working", "idle", "sleeping", "working", "rest"]), {
			working: 2,
			idle: 1,
			sleeping: 1,
		});
	});
});
