#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const REQUIRED_HEADINGS = [
	"Find agent data",
	"Create the webhook",
	"Configure env",
	"Start",
	"Tailscale",
	"Troubleshoot",
];

const MAX_WORDS = 2500;

const ENV_KEYS = [
	"AGENT_DATA",
	"GATEWAY_CLIENT_TOKEN",
	"VITE_GATEWAY_TOKEN",
	"WEBHOOK_URL",
	"WEBHOOK_SENDER_KEY",
];

const failures = [];

function check(ok, message) {
	if (!ok) {
		failures.push(message);
	}
}

async function read(relativePath) {
	return readFile(path.join(repoRoot, relativePath), "utf8");
}

function headings(markdown) {
	return markdown
		.split("\n")
		.filter((line) => line.startsWith("#"))
		.map((line) => line.replace(/^#+\s*/, "").trim());
}

function wordCount(text) {
	return text.split(/\s+/).filter((word) => word.length > 0).length;
}

const live = await read("docs/live.md");
const liveHeadings = headings(live);

for (const heading of REQUIRED_HEADINGS) {
	check(
		liveHeadings.includes(heading),
		`docs/live.md is missing the heading "${heading}"`,
	);
}

const words = wordCount(live);
check(
	words < MAX_WORDS,
	`docs/live.md has ${String(words)} words, over the ${String(MAX_WORDS)} budget`,
);

const example = await read(".env.example");
for (const key of ENV_KEYS) {
	const assignment = new RegExp(`^${key}=(.*)$`, "m").exec(example);
	check(assignment !== null, `.env.example is missing ${key}`);
	if (assignment !== null) {
		check(
			assignment[1].trim().length === 0,
			`.env.example assigns a value to ${key}; placeholders stay empty`,
		);
	}
}

const readme = await read("README.md");
check(
	readme.includes("(docs/live.md)"),
	"README.md does not link docs/live.md",
);

const demoIndex = readme.indexOf("## Quick start (demo)");
const liveIndex = readme.indexOf("## Live bots");
check(demoIndex !== -1, "README.md is missing the Quick start (demo) heading");
check(liveIndex !== -1, "README.md is missing the Live bots heading");
check(
	demoIndex !== -1 && liveIndex !== -1 && demoIndex < liveIndex,
	"README.md puts Live bots before Quick start (demo)",
);

if (failures.length > 0) {
	for (const failure of failures) {
		process.stderr.write(`docs smoke: ${failure}\n`);
	}
	process.exitCode = 1;
} else {
	process.stdout.write(
		`docs smoke: ok, ${String(REQUIRED_HEADINGS.length)} headings, ${String(words)} words in docs/live.md\n`,
	);
}
