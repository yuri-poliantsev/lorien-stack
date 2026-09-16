export const THEME_CANVAS = "theme-canvas";
export const THEME_UNIT = "theme-unit";
export const WORKING_WAIT_MS = 40_000;

export function workingNeed(botCount) {
	return Math.ceil(botCount / 3);
}

export function countPoses(poses) {
	const counts = { working: 0, idle: 0, sleeping: 0 };
	for (const pose of poses) {
		if (pose === "working" || pose === "idle" || pose === "sleeping") {
			counts[pose] += 1;
		}
	}
	return counts;
}

export function formatManifestLine(input) {
	const mix =
		input.working !== undefined
			? `\tworking=${String(input.working)}\tidle=${String(input.idle)}\tsleeping=${String(input.sleeping)}`
			: "";
	return `${input.path}\tN=${String(input.n)}\ttheme=${input.theme}\tavgFrameMs=${input.avgFrameMs}${mix}`;
}
