#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const GATEWAY_PORTS = [8044, 8045, 8046, 8047, 8048, 8049];
const PREVIEW_PORTS = [5184, 5185, 5186, 5187, 5188, 5189];
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_BOTS = [1, 8, 18, 40];
const ASLEEP_N = 8;
const RECORD_N = 18;

const children = [];
const artifacts = [];
let failed = false;

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

function spawnTracked(command, args, options) {
	const child = spawn(command, args, {
		...options,
		stdio: ["ignore", "pipe", "pipe"],
	});
	children.push(child);
	child.stdout.on("data", () => undefined);
	child.stderr.on("data", () => undefined);
	return child;
}

async function killTracked(child) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	child.kill("SIGTERM");
	await Promise.race([
		new Promise((resolve) => {
			child.once("exit", resolve);
		}),
		new Promise((resolve) => {
			setTimeout(resolve, 1500);
		}),
	]);
	if (child.exitCode === null && child.signalCode === null) {
		child.kill("SIGKILL");
	}
}

async function killAll() {
	const live = [...children];
	children.length = 0;
	await Promise.all(live.map((child) => killTracked(child)));
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
		const canvas = document.querySelector("[data-testid=starcraft-canvas]");
		if (canvas instanceof HTMLElement && canvas.dataset.avgFrameMs) {
			return { value: canvas.dataset.avgFrameMs, source: "canvas" };
		}
		return { value: "n/a", source: "missing" };
	});
}

async function preparePage(page, input) {
	await page.setViewportSize(VIEWPORT);
	await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30000 });
	await page.waitForFunction(
		() => document.documentElement.dataset.rosterReady === "true",
		null,
		{ timeout: 30000 },
	);
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

async function waitWorking(page) {
	await page.waitForSelector('[data-testid="sc-unit"][data-pose="working"]', {
		timeout: 45000,
	});
}

async function waitAsleep(page) {
	await page.waitForFunction(
		() => {
			const units = [...document.querySelectorAll('[data-testid="sc-unit"]')];
			return units.length > 0 && units.every((el) => el.dataset.pose === "sleeping");
		},
		null,
		{ timeout: 35000 },
	);
}

async function assertPainted(page, bots) {
	const info = await page.evaluate((count) => {
		const canvas = document.querySelector("[data-testid=starcraft-canvas]");
		if (!(canvas instanceof HTMLCanvasElement)) {
			return { ok: false, reason: "missing canvas" };
		}
		const unitCount = canvas.dataset.unitCount;
		const rows = document.querySelectorAll("[data-testid=bot-row]").length;
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
		const colors = new Set();
		for (let i = 0; i < sample.length; i += 16) {
			colors.add(`${sample[i]},${sample[i + 1]},${sample[i + 2]}`);
		}
		return {
			ok: unitCount === String(count) && rows === count && colors.size >= 3,
			reason: `unitCount=${unitCount} rows=${rows} colors=${colors.size}`,
		};
	}, bots);
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
	process.stdout.write(
		`${input.path}\tN=${String(input.n)}\ttheme=${input.theme}\tavgFrameMs=${input.avgFrameMs}\n`,
	);
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
			await waitWorking(page);
		}
		await pause(800);
		await assertPainted(page, input.bots);
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
		});
	} finally {
		await page.close();
		await stopPair(pair);
	}
}

function runFfmpeg(args) {
	return new Promise((resolve, reject) => {
		const child = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
		let err = "";
		child.stderr.on("data", (chunk) => {
			err += String(chunk);
		});
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`ffmpeg exited ${String(code)}: ${err.slice(-400)}`));
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
		await waitWorking(page);
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
		const webm = await video.path();
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
		await runFfmpeg([
			"-y",
			"-ss",
			"00:00:08",
			"-i",
			input.mp4Path,
			"-frames:v",
			"1",
			input.stillPath,
		]);
		await assertFile(input.stillPath);
		printManifest({
			path: input.mp4Path,
			n: RECORD_N,
			theme: input.theme,
			avgFrameMs: avg.source === "html" ? avg.value : "n/a",
		});
		printManifest({
			path: input.stillPath,
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
		const child = spawn("npm", ["run", "build", "-w", "apps/client"], {
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
	await mkdir(options.out, { recursive: true });
	await buildClient();
	const browser = await chromium.launch({
		headless: true,
		args: ["--disable-dev-shm-usage"],
	});
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
				stillPath: path.join(options.out, `${options.theme}-record.png`),
			});
		}
	} finally {
		await browser.close();
	}
	for (const filePath of artifacts) {
		await assertFile(filePath);
	}
}

process.on("SIGINT", () => {
	failed = true;
	void killAll().finally(() => {
		process.exit(130);
	});
});

try {
	await main();
} catch (error) {
	failed = true;
	const msg = error instanceof Error ? error.message : String(error);
	process.stderr.write(`capture: ${msg}\n`);
	process.exitCode = 1;
} finally {
	await killAll();
	if (failed && process.exitCode === undefined) {
		process.exitCode = 1;
	}
}
