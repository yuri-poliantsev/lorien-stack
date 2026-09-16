import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LOGIN_INSTRUCTION, looksLikeAuthFailure, runGrok } from "./grok.mjs";
import { assertUnderCaps, logCall, recordVerdict } from "./ledger.mjs";

const HEDGES = [
	"appears to",
	"appear to",
	"seems",
	"seem to",
	"possibly",
	"probably",
	"likely",
	"might be",
	"may be",
	"could be",
	"perhaps",
	"maybe",
	"presumably",
	"unclear",
	"hard to tell",
	"hard to say",
	"difficult to tell",
	"i think",
	"some kind of",
	"some sort of",
	"something like",
	"roughly",
	"or so",
	"either",
	"not sure",
	"cannot tell",
	"can't tell",
	"ambiguous",
	"suggests",
	"apparently",
];

export function readbackPrompt(imagePath) {
	return [
		`Look at the image at ${imagePath} and describe only what you can see in it.`,
		"",
		"Write plain prose, 4 to 8 sentences. Name the point of view, the layout, how many distinct repeated structures you count and how they are arranged, the dominant colours, the light, and any text or badges and what they read. Name the visual difference between the structures that look active and the ones that look dark or dormant, if there is one.",
		"",
		"State only what is present. Do not guess the purpose of the image, do not name a game or a product, and do not describe anything you cannot see. Write every statement as a flat assertion with no hedging words. If you cannot see something, leave it out rather than qualifying it.",
		"",
		"Print the description as your entire final message. No preamble, no headings, no lists.",
	].join("\n");
}

export function parseSpec(file) {
	const text = readFileSync(file, "utf8");
	const require = [];
	const forbid = [];
	for (const line of text.split("\n")) {
		const required = /^\s*-\s*require:\s*(.+)$/i.exec(line);
		if (required !== null) {
			require.push(required[1].split("|").map((term) => term.trim().toLowerCase()).filter(Boolean));
			continue;
		}
		const forbidden = /^\s*-\s*forbid:\s*(.+)$/i.exec(line);
		if (forbidden !== null) {
			forbid.push(...forbidden[1].split("|").map((term) => term.trim().toLowerCase()).filter(Boolean));
		}
	}
	if (require.length === 0) throw new Error(`${file}: no "- require:" lines, nothing to check the read-back against`);
	return { require, forbid, text };
}

// Whole-term matching, not substring: "staggered heights" contains "eight" and
// would otherwise pass a count check the image plainly fails.
export function mentions(description, term) {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(description);
}

export function diffAgainstSpec(description, spec) {
	const checks = [];
	for (const group of spec.require) {
		checks.push({
			kind: "require",
			label: group.join(" | "),
			pass: group.some((term) => mentions(description, term)),
		});
	}
	for (const term of spec.forbid) {
		checks.push({ kind: "forbid", label: term, pass: !mentions(description, term) });
	}
	const hedges = HEDGES.filter((hedge) => mentions(description, hedge));
	for (const hedge of hedges) {
		checks.push({ kind: "hedge", label: hedge, pass: false });
	}
	return { checks, hedges, verdict: checks.every((check) => check.pass) ? "pass" : "fail" };
}

export function describedFile(image) {
	return image.replace(/\.[^.]+$/, ".readback.txt");
}

// The describer opens with a line about what it is about to do; the description
// proper starts after it, and letting it through would pollute the term checks.
function stripPreamble(text) {
	return text.replace(/^\s*I(?:'|\u2019)ll[^.]*\.\s*/i, "").trim();
}

export async function readback({ image, specPath, offline = false, force = false }) {
	const spec = parseSpec(specPath);
	const outPath = describedFile(image);
	if (offline) {
		const saved = stripPreamble(readFileSync(outPath, "utf8").split("\n--- checked against")[0]);
		const diff = diffAgainstSpec(saved, spec);
		writeSummary(outPath, saved, specPath, diff);
		recordVerdict(image, diff.verdict, note(diff));
		return { ...diff, description: saved, outPath, offline: true };
	}
	if (!force && existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(image).mtimeMs) {
		return { alreadyRead: true, outPath };
	}
	assertUnderCaps(0);
	const prompt = readbackPrompt(image);
	const result = await runGrok(prompt, { maxTurns: 6 });
	logCall({ id: path.basename(image), op: "readback", images: 0, exit: result.exit, seconds: result.seconds });
	const description = stripPreamble(result.text.trim());
	if (description.length === 0 && looksLikeAuthFailure(`${result.stdout}\n${result.stderr}`)) {
		return { authFailure: true, instruction: LOGIN_INSTRUCTION, stderr: result.stderr };
	}
	if (description.length === 0) return { verdict: "fail", description, checks: [], reason: "empty read-back" };
	const diff = diffAgainstSpec(description, spec);
	writeSummary(outPath, description, specPath, diff);
	recordVerdict(image, diff.verdict, note(diff));
	return { ...diff, description, outPath, seconds: result.seconds };
}

export function note(diff) {
	const failed = diff.checks.filter((check) => !check.pass);
	return failed.length === 0
		? `${String(diff.checks.length)} checks pass`
		: failed.map((check) => `${check.kind}:${check.label.split(" | ")[0]}`).join(" ");
}

function writeSummary(outPath, description, specPath, diff) {
	writeFileSync(
		outPath,
		`${description}\n\n--- checked against ${path.basename(specPath)} ---\n${diff.checks
			.map((check) => `${check.pass ? "pass" : "FAIL"} ${check.kind} ${check.label}`)
			.join("\n")}\nverdict ${diff.verdict}\n`,
	);
}
