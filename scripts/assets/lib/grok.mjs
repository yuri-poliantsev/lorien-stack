import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export const GROK_BIN = process.env.GROK_BIN ?? path.join(homedir(), ".grok/bin/grok");

const AUTH_PATTERNS = [
	/not (?:signed in|logged in|authenticated)/i,
	/\bunauthenti?cated\b/i,
	/\bunauthorized\b/i,
	/\b401\b/,
	/\b403\b/,
	/(?:auth|credential|session|token)[^.\n]{0,40}(?:expired|invalid|missing|required)/i,
	/grok login/i,
];

export const LOGIN_INSTRUCTION = `${GROK_BIN} login --device-auth`;

export function looksLikeAuthFailure(text) {
	return AUTH_PATTERNS.some((pattern) => pattern.test(text));
}

export async function runGrok(prompt, { timeoutMs = 300_000, maxTurns = 10 } = {}) {
	const args = [
		"-p",
		prompt,
		"--output-format",
		"json",
		"--permission-mode",
		"bypassPermissions",
		"--max-turns",
		String(maxTurns),
		"--disable-web-search",
		"--verbatim",
	];
	const startedAt = Date.now();
	return await new Promise((resolve) => {
		const child = spawn(GROK_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			stderr += `\nassets: killed after ${String(timeoutMs)}ms\n`;
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			resolve({ exit: 127, stdout, stderr: `${stderr}${error.message}`, text: "", seconds: 0 });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				exit: code ?? 1,
				stdout,
				stderr,
				text: finalText(stdout),
				seconds: (Date.now() - startedAt) / 1000,
			});
		});
	});
}

// Headless `--output-format json` wraps the transcript; the shape has moved
// between Grok Build releases, so pull the last assistant text out of any of
// the known envelopes and fall back to raw stdout.
function finalText(stdout) {
	const trimmed = stdout.trim();
	if (trimmed.length === 0) return "";
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		const lines = trimmed.split("\n");
		for (let index = lines.length - 1; index >= 0; index -= 1) {
			try {
				const line = JSON.parse(lines[index]);
				const text = extractText(line);
				if (text) return text;
			} catch {
				continue;
			}
		}
		return trimmed;
	}
	return extractText(parsed) ?? trimmed;
}

function extractText(node) {
	if (typeof node === "string") return node;
	if (Array.isArray(node)) {
		const texts = node.map(extractText).filter((value) => typeof value === "string" && value.length > 0);
		return texts.length > 0 ? texts[texts.length - 1] : undefined;
	}
	if (typeof node !== "object" || node === null) return undefined;
	for (const key of ["result", "response", "text", "content", "message", "messages"]) {
		if (key in node) {
			const text = extractText(node[key]);
			if (typeof text === "string" && text.length > 0) return text;
		}
	}
	return undefined;
}

export function lastPathLike(text) {
	const matches = text.match(/\/[^\s'"`,)\]]*\.(?:png|jpe?g|webp)/gi);
	return matches === null ? undefined : matches[matches.length - 1];
}
