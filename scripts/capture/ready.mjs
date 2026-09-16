export const THEME_CANVAS = "theme-canvas";
export const THEME_UNIT = "theme-unit";
export const THEME_POSES = Object.freeze(["working", "idle", "sleeping"]);
export const WORKING_WAIT_MS = 40_000;
export const PREFLIGHT_WAIT_MS = 5_000;

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

export function preflightHooks(input) {
	const canvasCount = input.canvases.length;
	const unitCountAttr = input.canvases[0]?.unitCount ?? "";
	const unitCount = input.units.length;
	const withBotId = input.units.filter((unit) => unit.botId.length > 0).length;
	const withPose = input.units.filter((unit) => THEME_POSES.includes(unit.pose)).length;
	const counts = `canvases=${String(canvasCount)} unitCount=${unitCountAttr} units=${String(unitCount)} withBotId=${String(withBotId)} withPose=${String(withPose)}`;
	let hook;
	if (canvasCount !== 1 || unitCountAttr !== String(input.bots)) {
		hook = "theme-canvas";
	} else if (unitCount !== input.bots) {
		hook = "theme-unit";
	} else if (withBotId !== input.bots) {
		hook = "data-bot-id";
	} else if (withPose !== input.bots) {
		hook = "data-pose";
	} else {
		return { ok: true };
	}
	return {
		ok: false,
		hook,
		message: `theme=${input.theme} missing ${hook} ${counts}`,
	};
}

export function formatManifestLine(input) {
	const mix =
		input.working !== undefined
			? `\tworking=${String(input.working)}\tidle=${String(input.idle)}\tsleeping=${String(input.sleeping)}`
			: "";
	return `${input.path}\tN=${String(input.n)}\ttheme=${input.theme}\tavgFrameMs=${input.avgFrameMs}${mix}`;
}
