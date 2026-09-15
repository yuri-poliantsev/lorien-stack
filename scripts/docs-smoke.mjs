#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const REQUIRED_HEADINGS = [
	"Before you start",
	"Find agent data",
	"Configure env",
	"Start",
	"Tailscale",
	"Verify observation",
	"Troubleshoot",
];

const MAX_WORDS = 2500;

const PROMPT_PATH = "docs/prompts/lorien-stack-setup.md";
const TEMPLATE_PATH = "docs/prompts/lorien-bot-template.md";
const PROMPT_MAX_WORDS = 1200;

const PROMPT_REQUIRED = [
	"AGENT_DATA",
	"npm run gateway",
	"npm run dev -w apps/client",
	"tailscale",
	"nodejs.org/dist",
	"$HOME/.local/node22",
];

const ENV_KEYS = ["AGENT_DATA"];

const FORBIDDEN = [
	"GATEWAY_CLIENT_TOKEN",
	"VITE_GATEWAY_TOKEN",
	"GATEWAY_ALLOWLIST",
	"WEBHOOK_URL",
	"WEBHOOK_SENDER_KEY",
	"WEBHOOK_",
	"secret-request",
	"requestWake",
	"parseWakeRequest",
	"WakeRequest",
	"WakePrompt",
	"--allowlist",
	"--webhook-url",
	"/api/prompt",
];

const SETUP_FILES = [
	"docs/live.md",
	PROMPT_PATH,
	TEMPLATE_PATH,
	".env.example",
	"apps/gateway/README.md",
	"apps/client/README.md",
	"docs/contracts.md",
];

const OBSERVE_ONLY =
	"lorien-stack observes Grok Bots; it does not wake bots or provide chat.";

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

check(
	live.includes("prompts/lorien-stack-setup.md"),
	`docs/live.md does not link ${PROMPT_PATH}`,
);
check(
	live.includes("nodejs.org/dist") && live.includes("$HOME/.local/node22"),
	"docs/live.md does not teach the user-local Node 22 install",
);

const prompt = await read(PROMPT_PATH);

for (const needle of PROMPT_REQUIRED) {
	check(prompt.includes(needle), `${PROMPT_PATH} never names ${needle}`);
}

const promptWords = wordCount(prompt);
check(
	promptWords < PROMPT_MAX_WORDS,
	`${PROMPT_PATH} has ${String(promptWords)} words, over the ${String(PROMPT_MAX_WORDS)} budget`,
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

check(
	example.includes("docs/live.md"),
	".env.example does not point at docs/live.md",
);

const readme = await read("README.md");
check(readme.includes(OBSERVE_ONLY), "README.md is missing the observe-only sentence");

const demoIndex = readme.indexOf("## Quick start (demo)");
const liveIndex = readme.indexOf("## Live bots");
check(demoIndex !== -1, "README.md is missing the Quick start (demo) heading");
check(liveIndex !== -1, "README.md is missing the Live bots heading");
check(
	demoIndex !== -1 && liveIndex !== -1 && demoIndex < liveIndex,
	"README.md puts Live bots before Quick start (demo)",
);

if (liveIndex !== -1) {
	const nextHeading = readme.indexOf("\n## ", liveIndex + 1);
	const liveSection = readme.slice(
		liveIndex,
		nextHeading === -1 ? readme.length : nextHeading,
	);
	check(
		liveSection.includes("(docs/live.md)"),
		"README.md does not link docs/live.md from the Live bots section",
	);
	check(
		liveSection.includes(`(${PROMPT_PATH})`),
		`README.md does not link ${PROMPT_PATH} from the Live bots section`,
	);
}

for (const relativePath of SETUP_FILES) {
	const text = await read(relativePath);
	for (const term of FORBIDDEN) {
		check(
			!text.includes(term),
			`${relativePath} still names ${term}`,
		);
	}
	check(
		!/\bwake\b/i.test(text),
		`${relativePath} still names wake`,
	);
	check(!/\ballowlist\b/i.test(text), `${relativePath} still names allowlist`);
}

const readmeWithoutObserve = readme.replace(OBSERVE_ONLY, "");
for (const term of FORBIDDEN) {
	check(!readme.includes(term), `README.md still names ${term}`);
}
check(
	!/\bwake\b/i.test(readmeWithoutObserve),
	"README.md names wake outside the observe-only sentence",
);
check(!/\ballowlist\b/i.test(readme), "README.md still names allowlist");

if (failures.length > 0) {
	for (const failure of failures) {
		process.stderr.write(`docs smoke: ${failure}\n`);
	}
	process.exitCode = 1;
} else {
	process.stdout.write(
		`docs smoke: ok, ${String(REQUIRED_HEADINGS.length)} headings, ${String(words)} words in docs/live.md, ${String(promptWords)} words in ${PROMPT_PATH}\n`,
	);
}
