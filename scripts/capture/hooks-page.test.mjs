import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { THEME_POSES } from "../../apps/client/src/themes/hooks.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const GATEWAY_PORTS = [8060, 8061, 8062, 8063];
const VITE_PORTS = [5160, 5161, 5162, 5163];
const BOTS = 40;
const MAC_CHROME = path.join(
	os.homedir(),
	"Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
);

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

function waitFor(predicate, timeoutMs, label) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`timeout: ${label}`));
		}, timeoutMs);
		const poll = async () => {
			try {
				if (await predicate()) {
					clearTimeout(timer);
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

function stop(child) {
	return new Promise((resolve) => {
		if (child.exitCode !== null) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			if (child.exitCode === null) {
				child.kill("SIGKILL");
			}
		}, 1500);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve();
		});
		child.kill("SIGTERM");
	});
}

async function chromePath() {
	const fromEnv = process.env.CAPTURE_CHROME;
	if (fromEnv !== undefined && fromEnv.length > 0) {
		return fromEnv;
	}
	try {
		await stat(MAC_CHROME);
		return MAC_CHROME;
	} catch {
		return undefined;
	}
}

async function startPair() {
	const gatewayPort = await pickPort(GATEWAY_PORTS);
	const vitePort = await pickPort(VITE_PORTS);
	const gateway = spawn(
		process.execPath,
		[
			"--disable-warning=ExperimentalWarning",
			"--experimental-strip-types",
			path.join(repoRoot, "apps/gateway/src/main.ts"),
			"--demo",
			"--listen",
			`127.0.0.1:${String(gatewayPort)}`,
			"--bots",
			String(BOTS),
		],
		{ cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
	);
	const vite = spawn(
		process.execPath,
		[
			path.join(repoRoot, "node_modules/vite/bin/vite.js"),
			"--host",
			"127.0.0.1",
			"--port",
			String(vitePort),
			"--strictPort",
		],
		{
			cwd: path.join(repoRoot, "apps/client"),
			env: {
				...process.env,
				GATEWAY_ORIGIN: `http://127.0.0.1:${String(gatewayPort)}`,
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	try {
		await waitFor(async () => {
			const res = await fetch(`http://127.0.0.1:${String(gatewayPort)}/health`);
			return res.ok;
		}, 15000, "gateway health");
		await waitFor(async () => {
			const res = await fetch(`http://127.0.0.1:${String(vitePort)}/`);
			return res.ok;
		}, 20000, "vite");
	} catch (error) {
		await stop(gateway);
		await stop(vite);
		throw error;
	}
	return {
		gateway,
		vite,
		url: `http://127.0.0.1:${String(vitePort)}/?theme=starcraft`,
	};
}

describe("starcraft hook page", () => {
	it("mounts 40 theme-unit elements on one theme-canvas", async () => {
		const pair = await startPair();
		let browser;
		try {
			if (process.env.HOOKS_PAGE_LAUNCH_FAIL === "1") {
				throw new Error("forced launch failure");
			}
			const executablePath = await chromePath();
			const launch = { headless: true, args: ["--disable-dev-shm-usage"] };
			if (executablePath !== undefined) {
				launch.executablePath = executablePath;
			}
			browser = await chromium.launch(launch);
			const page = await browser.newPage();
			await page.goto(pair.url, { waitUntil: "domcontentloaded", timeout: 30000 });
			await page.waitForFunction(() => {
				const canvas = document.querySelector('[data-testid="theme-canvas"]');
				const units = document.querySelectorAll('[data-testid="theme-unit"]');
				return (
					canvas instanceof HTMLElement &&
					canvas.dataset.unitCount === "40" &&
					units.length === 40
				);
			}, null, { timeout: 30000 });
			const allowed = [...THEME_POSES];
			const info = await page.evaluate((poses) => {
				const canvases = document.querySelectorAll('[data-testid="theme-canvas"]');
				const canvas = canvases[0];
				const units = [...document.querySelectorAll('[data-testid="theme-unit"]')];
				return {
					canvases: canvases.length,
					unitCount: canvas instanceof HTMLElement ? canvas.dataset.unitCount : "",
					units: units.length,
					withBotId: units.filter(
						(el) => el instanceof HTMLElement && (el.dataset.botId ?? "").length > 0,
					).length,
					withPose: units.filter((el) => {
						if (!(el instanceof HTMLElement)) {
							return false;
						}
						return poses.includes(el.dataset.pose ?? "");
					}).length,
				};
			}, allowed);
			assert.deepEqual(info, {
				canvases: 1,
				unitCount: "40",
				units: 40,
				withBotId: 40,
				withPose: 40,
			});
		} finally {
			if (browser !== undefined) {
				await browser.close();
			}
			await stop(pair.gateway);
			await stop(pair.vite);
		}
	});
});
