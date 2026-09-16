#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import {
	PREFLIGHT_WAIT_MS,
	THEME_CANVAS,
	THEME_UNIT,
	WORKING_WAIT_MS,
	countPoses,
	formatManifestLine,
	formatWorkingTimeout,
	preflightHooks,
	resolveCapturePorts,
	workingNeed,
} from "./ready.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const DEFAULT_GATEWAY_PORTS = [8044, 8045, 8046, 8047, 8048, 8049];
const DEFAULT_PREVIEW_PORTS = [5184, 5185, 5186, 5187, 5188, 5189];
let GATEWAY_PORTS = DEFAULT_GATEWAY_PORTS;
let PREVIEW_PORTS = DEFAULT_PREVIEW_PORTS;
const HOMEBREW_FFMPEG = "/opt/homebrew/bin/ffmpeg";
const MAC_CHROME = path.join(
	os.homedir(),
	"Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
);
const VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_BOTS = [1, 8, 18, 40];
const ASLEEP_N = 8;
const RECORD_N = 18;
const KILL_GRACE_MS = 1500;

const children = [];
const artifacts = [];
let browserRef = null;
let browserServerRef = null;
let shuttingDown = false;
let ffmpegBin = "ffmpeg";

function usage() {
	process.stderr.write(
		"usage: npm run capture -- --theme <id> [--bots 1,8,18,40] [--out docs/images/themes] [--record 20]\n",
	);
}

function parseArgs(argv) {
	const options = {
		theme: undefined,
		bots: DEFAULT_BOTS,
		out: path.join(repoRoot, "docs/images/themes"),
		record: undefined,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--theme") {
			options.theme = argv[i + 1];
			i += 1;
			continue;
		}
		if (arg !== undefined && arg.startsWith("--theme=")) {
			options.theme = arg.slice("--theme=".length);
			continue;
		}
		if (arg === "--bots") {
			options.bots = parseBots(argv[i + 1]);
			i += 1;
			continue;
		}
		if (arg !== undefined && arg.startsWith("--bots=")) {
			options.bots = parseBots(arg.slice("--bots=".length));
			continue;
		}
		if (arg === "--out") {
			options.out = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg !== undefined && arg.startsWith("--out=")) {
			options.out = path.resolve(arg.slice("--out=".length));
			continue;
		}
		if (arg === "--record") {
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("-")) {
				options.record = Number(next);
				i += 1;
			} else {
				options.record = 20;
			}
			continue;
		}
		if (arg !== undefined && arg.startsWith("--record=")) {
			options.record = Number(arg.slice("--record=".length));
			continue;
		}
		throw new Error(`unknown flag: ${arg}`);
	}
	if (options.theme === undefined || options.theme.length === 0) {
		throw new Error("--theme is required");
	}
	if (options.record !== undefined && (!Number.isInteger(options.record) || options.record <= 0)) {
		throw new Error("--record must be a positive integer");
	}
	return options;
}

function applyCapturePorts(env) {
	const ports = resolveCapturePorts(env, {
		gateway: DEFAULT_GATEWAY_PORTS,
		preview: DEFAULT_PREVIEW_PORTS,
	});
	GATEWAY_PORTS = ports.gateway;
	PREVIEW_PORTS = ports.preview;
}

function parseBots(raw) {
	if (raw === undefined || raw.length === 0) {
		throw new Error("--bots requires a comma-separated list");
	}
	const bots = raw.split(",").map((part) => Number(part));
	if (bots.some((n) => !Number.isInteger(n) || n < 1 || n > 40)) {
		throw new Error("--bots must be integers from 1 to 40");
	}
	return bots;
}

function isLive(child) {
	return child.exitCode === null && child.signalCode === null;
}

function registerChild(child) {
	if (!children.includes(child)) {
		children.push(child);
	}
	child.once("exit", () => {
		const index = children.indexOf(child);
		if (index >= 0) {
			children.splice(index, 1);
		}
	});
	return child;
}

function spawnTracked(command, args, options) {
	const child = spawn(command, args, {
		...options,
		stdio: options?.stdio ?? ["ignore", "pipe", "pipe"],
	});
	registerChild(child);
	if (child.stdout !== null) {
		child.stdout.on("data", () => undefined);
	}
	if (child.stderr !== null) {
		child.stderr.on("data", () => undefined);
	}
	return child;
}

async function fileExists(filePath) {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

function canRun(bin, args) {
	return new Promise((resolve) => {
		const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
		child.on("error", () => {
			resolve(false);
		});
		child.on("exit", (code) => {
			resolve(code === 0);
		});
	});
}

async function resolveFfmpeg() {
	const fromEnv = process.env.FFMPEG;
	if (fromEnv !== undefined && fromEnv.length > 0) {
		return fromEnv;
	}
	if (await canRun("ffmpeg", ["-version"])) {
		return "ffmpeg";
	}
	if ((await fileExists(HOMEBREW_FFMPEG)) && (await canRun(HOMEBREW_FFMPEG, ["-version"]))) {
		return HOMEBREW_FFMPEG;
	}
	throw new Error(
		"ffmpeg not found. Checked env FFMPEG, PATH via `ffmpeg -version`, and /opt/homebrew/bin/ffmpeg.",
	);
}

async function resolveChrome() {
	const fromEnv = process.env.CAPTURE_CHROME;
	if (fromEnv !== undefined && fromEnv.length > 0) {
		return fromEnv;
	}
	if (await fileExists(MAC_CHROME)) {
		return MAC_CHROME;
	}
	return undefined;
}

async function launchBrowser() {
	const executablePath = await resolveChrome();
	const launch = {
		headless: true,
		args: ["--disable-dev-shm-usage"],
	};
	if (executablePath !== undefined) {
		launch.executablePath = executablePath;
	}
	try {
		const server = await chromium.launchServer(launch);
		browserServerRef = server;
		registerChild(server.process());
		const browser = await chromium.connect(server.wsEndpoint());
		browserRef = browser;
		return browser;
	} catch (error) {
		process.stderr.write("capture: Chromium launch failed. Run `npx playwright install chromium`.\n");
		throw error;
	}
}

async function killTracked(child) {
	if (!isLive(child)) {
		return;
	}
	child.kill("SIGTERM");
	await Promise.race([
		new Promise((resolve) => {
			child.once("exit", resolve);
		}),
		new Promise((resolve) => {
			setTimeout(resolve, KILL_GRACE_MS);
		}),
	]);
	if (isLive(child)) {
		child.kill("SIGKILL");
		await Promise.race([
			new Promise((resolve) => {
				child.once("exit", resolve);
			}),
			new Promise((resolve) => {
				setTimeout(resolve, 500);
			}),
		]);
	}
}

async function killAll() {
	const live = children.filter((child) => isLive(child));
	await Promise.all(live.map((child) => killTracked(child)));
	children.length = 0;
}

async function closeBrowser() {
	const browser = browserRef;
	const server = browserServerRef;
	browserRef = null;
	browserServerRef = null;
	if (browser !== null) {
		await Promise.race([
			browser.close().catch(() => undefined),
			new Promise((resolve) => {
				setTimeout(resolve, KILL_GRACE_MS);
			}),
		]);
	}
	if (server !== null) {
		await Promise.race([
			server.close().catch(() => undefined),
			new Promise((resolve) => {
				setTimeout(resolve, KILL_GRACE_MS);
			}),
		]);
	}
}

async function shutdown(code) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	try {
		await closeBrowser();
		await killAll();
	} finally {
		process.exit(code);
	}
}

function portFree(port) {
	return new Promise((resolve) => {
		const server = createServer();
		server.unref();
		server.once("error", () => {
			resolve(false);
		});
		server.listen(port, "127.0.0.1", () => {
			server.close(() => {
				resolve(true);
			});
		});
	});
}

async function pickPort(ports) {
	for (const port of ports) {
		if (await portFree(port)) {
			return port;
		}
	}
	throw new Error(`no free port in ${ports.join(", ")}`);
}

function waitForExitOr(child, predicate, timeoutMs, label) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`timeout: ${label}`));
		}, timeoutMs);
		const onExit = (code) => {
			clearTimeout(timer);
			reject(new Error(`${label} exited with ${String(code)}`));
		};
		child.once("exit", onExit);
		const poll = async () => {
			try {
				if (await predicate()) {
					clearTimeout(timer);
					child.off("exit", onExit);
					resolve();
					return;
				}
			} catch {
			}
			setTimeout(() => {
				void poll();
			}, 150);
		};
		void poll();
	});
}

function pause(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function gatewayArgs(input) {
	const args = [
		"--disable-warning=ExperimentalWarning",
		"--experimental-strip-types",
		path.join(repoRoot, "apps/gateway/src/main.ts"),
		"--demo",
		"--listen",
		`127.0.0.1:${String(input.port)}`,
		"--bots",
		String(input.bots),
	];
	if (input.idle) {
		args.push("--replay-idle");
	}
	return args;
}

function viteBin() {
	return path.join(repoRoot, "node_modules/vite/bin/vite.js");
}

async function startPair(input) {
	const gatewayPort = await pickPort(GATEWAY_PORTS);
	const previewPort = await pickPort(PREVIEW_PORTS);
	const gateway = spawnTracked(
		process.execPath,
		gatewayArgs({
			port: gatewayPort,
			bots: input.bots,
			idle: input.idle === true,
		}),
		{ cwd: repoRoot },
	);
	await waitForExitOr(
		gateway,
		async () => {
			const res = await fetch(`http://127.0.0.1:${String(gatewayPort)}/health`);
			return res.ok;
		},
		15000,
		"gateway health",
	);
	const preview = spawnTracked(
		process.execPath,
		[viteBin(), "preview", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"],
		{
			cwd: path.join(repoRoot, "apps/client"),
			env: {
				...process.env,
				GATEWAY_ORIGIN: `http://127.0.0.1:${String(gatewayPort)}`,
			},
		},
	);
	await waitForExitOr(
		preview,
		async () => {
			const res = await fetch(`http://127.0.0.1:${String(previewPort)}/`);
			return res.ok;
		},
		20000,
		"preview",
	);
	return {
		gateway,
		preview,
		url: `http://127.0.0.1:${String(previewPort)}/?theme=${encodeURIComponent(input.theme)}`,
	};
}

async function stopPair(pair) {
	await killTracked(pair.preview);
	await killTracked(pair.gateway);
}

async function readAvgFrameMs(page) {
	return page.evaluate(() => {
		const html = document.documentElement.dataset.avgFrameMs;
		if (html !== undefined && html.length > 0) {
			return { value: html, source: "html" };
		}
		const canvas = document.querySelector('[data-testid="theme-canvas"]');
		if (canvas instanceof HTMLElement && canvas.dataset.avgFrameMs) {
			return { value: canvas.dataset.avgFrameMs, source: "canvas" };
		}
		return { value: "n/a", source: "missing" };
	});
}

async function readHookSnapshot(page) {
	return page.evaluate(
		({ canvasTestId, unitTestId }) => {
			const canvases = [...document.querySelectorAll(`[data-testid="${canvasTestId}"]`)].map(
				(el) => ({
					unitCount: el instanceof HTMLElement ? (el.dataset.unitCount ?? "") : "",
				}),
			);
			const units = [...document.querySelectorAll(`[data-testid="${unitTestId}"]`)].map((el) => ({
				botId: el instanceof HTMLElement ? (el.dataset.botId ?? "") : "",
				pose: el instanceof HTMLElement ? (el.dataset.pose ?? "") : "",
			}));
			return { canvases, units };
		},
		{ canvasTestId: THEME_CANVAS, unitTestId: THEME_UNIT },
	);
}

async function assertThemeHooks(page, input) {
	const deadline = Date.now() + PREFLIGHT_WAIT_MS;
	let report;
	while (true) {
		const snap = await readHookSnapshot(page);
		report = preflightHooks({
			theme: input.theme,
			bots: input.bots,
			canvases: snap.canvases,
			units: snap.units,
		});
		if (report.ok) {
			return;
		}
		if (Date.now() >= deadline) {
			throw new Error(report.message);
		}
		await pause(150);
	}
}

async function preparePage(page, input) {
	await page.setViewportSize(VIEWPORT);
	await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30000 });
	await page.waitForFunction(
		() => document.documentElement.dataset.rosterReady === "true",
		null,
		{ timeout: 30000 },
	);
	await assertThemeHooks(page, { theme: input.theme, bots: input.bots });
	const htmlTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
	if (htmlTheme !== input.theme) {
		process.stderr.write(
			`capture: warn html[data-theme] is ${htmlTheme.length === 0 ? "absent" : htmlTheme}, expected ${input.theme}\n`,
		);
	}
	await page.waitForFunction(
		(count) => document.querySelectorAll("[data-testid=bot-row]").length === count,
		input.bots,
		{ timeout: 15000 },
	);
}

async function readPoseCounts(page) {
	const poses = await page.evaluate((unitTestId) => {
		return [...document.querySelectorAll(`[data-testid="${unitTestId}"]`)].map((el) =>
			el instanceof HTMLElement ? (el.dataset.pose ?? "") : "",
		);
	}, THEME_UNIT);
	return countPoses(poses);
}

async function waitWorking(page, input) {
	const need = workingNeed(input.bots);
	try {
		await page.waitForFunction(
			({ unitTestId, needCount }) => {
				const units = [...document.querySelectorAll(`[data-testid="${unitTestId}"]`)];
				const working = units.filter(
					(el) => el instanceof HTMLElement && el.dataset.pose === "working",
				).length;
				return working >= needCount;
			},
			{ unitTestId: THEME_UNIT, needCount: need },
			{ timeout: WORKING_WAIT_MS },
		);
	} catch (error) {
		let poses;
		try {
			poses = await readPoseCounts(page);
		} catch {
			throw error;
		}
		throw new Error(
			formatWorkingTimeout({
				theme: input.theme,
				n: input.bots,
				need,
				working: poses.working,
				idle: poses.idle,
				sleeping: poses.sleeping,
			}),
		);
	}
}

async function waitAsleep(page) {
	await page.waitForFunction(
		(unitTestId) => {
			const units = [...document.querySelectorAll(`[data-testid="${unitTestId}"]`)];
			return (
				units.length > 0 &&
				units.every((el) => el instanceof HTMLElement && el.dataset.pose === "sleeping")
			);
		},
		THEME_UNIT,
		{ timeout: 35000 },
	);
}

async function assertPainted(page, bots) {
	const info = await page.evaluate(
		({ count, canvasTestId, unitTestId }) => {
			const canvas = document.querySelector(`[data-testid="${canvasTestId}"]`);
			if (!(canvas instanceof HTMLElement)) {
				return { ok: false, reason: "missing theme-canvas" };
			}
			const unitCount = canvas.dataset.unitCount;
			const units = document.querySelectorAll(`[data-testid="${unitTestId}"]`).length;
			let colors = 0;
			if (canvas instanceof HTMLCanvasElement) {
				const ctx = canvas.getContext("2d");
				if (ctx === null) {
					return { ok: false, reason: "no 2d context" };
				}
				const sample = ctx.getImageData(
					Math.floor(canvas.width / 2),
					Math.floor(canvas.height / 2),
					48,
					48,
				).data;
				const seen = new Set();
				for (let i = 0; i < sample.length; i += 16) {
					seen.add(`${sample[i]},${sample[i + 1]},${sample[i + 2]}`);
				}
				colors = seen.size;
			}
			const paintOk = canvas instanceof HTMLCanvasElement ? colors >= 3 : true;
			return {
				ok: unitCount === String(count) && units === count && paintOk,
				reason: `unitCount=${unitCount} units=${units} colors=${colors}`,
			};
		},
		{ count: bots, canvasTestId: THEME_CANVAS, unitTestId: THEME_UNIT },
	);
	if (!info.ok) {
		throw new Error(`blank or empty capture: ${info.reason}`);
	}
}

async function assertFile(filePath) {
	const info = await stat(filePath);
	if (info.size === 0) {
		throw new Error(`zero-byte artifact: ${filePath}`);
	}
}

function printManifest(input) {
	process.stdout.write(`${formatManifestLine(input)}\n`);
	artifacts.push(input.path);
}

async function captureStill(input) {
	const pair = await startPair({
		theme: input.theme,
		bots: input.bots,
		idle: input.idle === true,
	});
	const page = await input.browser.newPage();
	try {
		await preparePage(page, { url: pair.url, theme: input.theme, bots: input.bots });
		if (input.idle) {
			await waitAsleep(page);
		} else {
			await waitWorking(page, { theme: input.theme, bots: input.bots });
		}
		await pause(800);
		await assertPainted(page, input.bots);
		const poses = await readPoseCounts(page);
		const avg = await readAvgFrameMs(page);
		if (avg.source === "missing") {
			process.stderr.write("capture: warn document.documentElement.dataset.avgFrameMs is absent\n");
		}
		await page.screenshot({ path: input.filePath, type: "png" });
		await assertFile(input.filePath);
		printManifest({
			path: input.filePath,
			n: input.bots,
			theme: input.theme,
			avgFrameMs: avg.source === "html" ? avg.value : "n/a",
			working: poses.working,
			idle: poses.idle,
			sleeping: poses.sleeping,
		});
	} finally {
		await page.close();
		await stopPair(pair);
	}
}

function runFfmpeg(args) {
	return new Promise((resolve, reject) => {
		const child = spawnTracked(ffmpegBin, args);
		let err = "";
		if (child.stderr !== null) {
			child.stderr.on("data", (chunk) => {
				err += String(chunk);
			});
		}
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`ffmpeg exited ${String(code)}: ${err.slice(-400)}`));
		});
		child.on("error", (error) => {
			reject(error);
		});
	});
}

async function captureRecord(input) {
	const pair = await startPair({
		theme: input.theme,
		bots: RECORD_N,
		idle: false,
	});
	const tmpDir = path.join(os.tmpdir(), "lorien-capture-video");
	await mkdir(tmpDir, { recursive: true });
	const context = await input.browser.newContext({
		viewport: VIEWPORT,
		recordVideo: {
			dir: tmpDir,
			size: VIEWPORT,
		},
	});
	const page = await context.newPage();
	try {
		await preparePage(page, { url: pair.url, theme: input.theme, bots: RECORD_N });
		await waitWorking(page, { theme: input.theme, bots: RECORD_N });
		await pause(input.seconds * 1000);
		const avg = await readAvgFrameMs(page);
		if (avg.source === "missing") {
			process.stderr.write("capture: warn document.documentElement.dataset.avgFrameMs is absent\n");
		}
		const video = page.video();
		await page.close();
		await context.close();
		if (video === null) {
			throw new Error("playwright did not record a video");
		}
		const webm = path.join(tmpDir, `${input.theme}.webm`);
		await video.saveAs(webm);
		await runFfmpeg([
			"-y",
			"-i",
			webm,
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			input.mp4Path,
		]);
		await assertFile(input.mp4Path);
		printManifest({
			path: input.mp4Path,
			n: RECORD_N,
			theme: input.theme,
			avgFrameMs: avg.source === "html" ? avg.value : "n/a",
		});
	} finally {
		await stopPair(pair);
	}
}

function buildClient() {
	return new Promise((resolve, reject) => {
		const child = spawnTracked("npm", ["run", "build", "-w", "apps/client"], {
			cwd: repoRoot,
			stdio: "inherit",
		});
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`client build exited ${String(code)}`));
		});
	});
}

async function main() {
	let options;
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (error) {
		usage();
		throw error;
	}
	applyCapturePorts(process.env);
	await mkdir(options.out, { recursive: true });
	if (options.record !== undefined) {
		ffmpegBin = await resolveFfmpeg();
	}
	await buildClient();
	const browser = await launchBrowser();
	try {
		for (const bots of options.bots) {
			await captureStill({
				browser,
				theme: options.theme,
				bots,
				idle: false,
				filePath: path.join(options.out, `${options.theme}-${String(bots)}.png`),
			});
		}
		if (options.bots.includes(ASLEEP_N)) {
			await captureStill({
				browser,
				theme: options.theme,
				bots: ASLEEP_N,
				idle: true,
				filePath: path.join(options.out, `${options.theme}-${String(ASLEEP_N)}-asleep.png`),
			});
		}
		if (options.record !== undefined) {
			await captureRecord({
				browser,
				theme: options.theme,
				seconds: options.record,
				mp4Path: path.join(options.out, `${options.theme}.mp4`),
			});
		}
	} finally {
		await closeBrowser();
	}
	for (const filePath of artifacts) {
		await assertFile(filePath);
	}
}

process.on("SIGINT", () => {
	void shutdown(130);
});
process.on("SIGTERM", () => {
	void shutdown(143);
});
process.on("unhandledRejection", (reason) => {
	const msg = reason instanceof Error ? reason.message : String(reason);
	process.stderr.write(`capture: unhandled rejection: ${msg}\n`);
	void shutdown(1);
});
process.on("beforeExit", (code) => {
	if (shuttingDown) {
		return;
	}
	if (browserRef !== null || browserServerRef !== null || children.some((child) => isLive(child))) {
		void shutdown(code === 0 ? 1 : code);
	}
});

try {
	await main();
} catch (error) {
	const msg = error instanceof Error ? error.message : String(error);
	process.stderr.write(`capture: ${msg}\n`);
	await shutdown(1);
} finally {
	if (!shuttingDown) {
		await closeBrowser();
		await killAll();
	}
}
