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
			? `\tpose_working=${String(input.working)}\tpose_idle=${String(input.idle)}\tpose_sleeping=${String(input.sleeping)}`
			: "";
	return `${input.path}\tN=${String(input.n)}\ttheme=${input.theme}\tavgFrameMs=${input.avgFrameMs}${mix}`;
}

export function formatWorkingTimeout(input) {
	return `theme=${input.theme} N=${String(input.n)} need=${String(input.need)} pose_working=${String(input.working)} pose_idle=${String(input.idle)} pose_sleeping=${String(input.sleeping)}`;
}

export function parsePortPool(raw, label) {
	if (raw === undefined || raw.length === 0) {
		return undefined;
	}
	const ports = raw.split(",").map((part) => Number(part.trim()));
	if (ports.length === 0 || ports.some((n) => !Number.isInteger(n) || n < 1 || n > 65535)) {
		throw new Error(`${label} must be comma-separated integers from 1 to 65535`);
	}
	return ports;
}

export function resolveCapturePorts(env, defaults) {
	const gateway = parsePortPool(env.CAPTURE_GATEWAY_PORTS, "CAPTURE_GATEWAY_PORTS") ?? defaults.gateway;
	const preview = parsePortPool(env.CAPTURE_PREVIEW_PORTS, "CAPTURE_PREVIEW_PORTS") ?? defaults.preview;
	if (gateway.length !== preview.length) {
		throw new Error(
			`CAPTURE_GATEWAY_PORTS and CAPTURE_PREVIEW_PORTS must have the same length, got ${String(gateway.length)} and ${String(preview.length)}`,
		);
	}
	return { gateway, preview };
}
