#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultOutDir, generate } from "./lib/gen.mjs";
import { describeHeader, readImageHeader } from "./lib/header.mjs";
import { keyImage } from "./lib/key.mjs";
import {
	NIGHT_CAP_CALLS,
	NIGHT_CAP_IMAGES,
	REPO_ROOT,
	SUPERSEDED_LEDGER,
	authoritativeRows,
	capLine,
	readManifest,
	sha256,
	supersededHashes,
	takeLock,
	repoRelative,
	totals,
	verifyRows,
} from "./lib/ledger.mjs";
import { readback } from "./lib/readback.mjs";
import { MANIFEST_COLUMNS, parseRequests } from "./lib/shape.mjs";

const USAGE = `usage:
  assets gen --request <file.json> [--out-dir <dir>] [--parallel 4] [--dry-run]
  assets key --in <img> --out <png> --key <#rrggbb|auto> --tolerance <n> --grid <px> [--levels 16]
  assets readback --in <img> --spec <file> [--offline] [--force]
  assets ledger [--verify]
  assets concepts
  assets selftest`;

const [command, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);

function parseFlags(argv) {
	const out = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) continue;
		const name = token.slice(2);
		const next = argv[index + 1];
		if (next === undefined || next.startsWith("--")) {
			out[name] = true;
			continue;
		}
		out[name] = next;
		index += 1;
	}
	return out;
}

function need(name) {
	const value = flags[name];
	if (typeof value !== "string") throw new Error(`--${name} is required`);
	return value;
}

function resolve(file) {
	return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

async function pool(items, size, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return results;
}

async function cmdGen() {
	const file = resolve(need("request"));
	const requests = parseRequests(JSON.parse(readFileSync(file, "utf8")), path.basename(file));
	const parallel = Math.min(4, Number(flags.parallel ?? 3));
	process.stdout.write(`assets gen: ${String(requests.length)} requests, ${String(parallel)} in parallel, ${capLine()}\n`);
	const releaseLock = flags["dry-run"] === true ? () => {} : takeLock();
	try {
		await runBatch(requests, parallel);
	} finally {
		releaseLock();
	}
}

async function runBatch(requests, parallel) {
	const outcomes = await pool(requests, parallel, async (request) => {
		const outDir = typeof flags["out-dir"] === "string" ? resolve(flags["out-dir"]) : defaultOutDir(request);
		try {
			const result = await generate(request, { outDir, dryRun: flags["dry-run"] === true });
			if (result.dryRun) {
				process.stdout.write(`  ${request.id} dry-run -> ${path.relative(REPO_ROOT, result.outPath)}\n`);
				return { id: request.id, ok: true };
			}
			if (result.clash !== undefined) {
				process.stderr.write(
					`  ${request.id} REFUSED, ${result.clash} already exists; a manifest row hashed it, so pick a new id (${request.id}-2)\n`,
				);
				return { id: request.id, ok: false };
			}
			if (result.exhausted) {
				process.stdout.write(`  ${request.id} exhausted after 2 discards, verdict written, coordinator decides\n`);
				return { id: request.id, ok: false, exhausted: true };
			}
			if (result.authFailure) {
				process.stderr.write(`  ${request.id} AUTH FAILURE, manifest source needs-cursor\n    run: ${result.instruction}\n`);
				return { id: request.id, ok: false, authFailure: true };
			}
			if (!result.ok) {
				process.stderr.write(`  ${request.id} FAIL ${result.reason}\n`);
				return { id: request.id, ok: false };
			}
			process.stdout.write(
				`  ${request.id} ${result.headerLine} sha256=${result.row.sha256.slice(0, 12)} ${result.seconds.toFixed(0)}s -> ${result.row.path}\n`,
			);
			return { id: request.id, ok: true };
		} catch (error) {
			process.stderr.write(`  ${request.id} ERROR ${error.message}\n`);
			return { id: request.id, ok: false };
		}
	});
	process.stdout.write(`assets gen: ${capLine()}\n`);
	const failed = outcomes.filter((outcome) => !outcome.ok);
	if (outcomes.some((outcome) => outcome.authFailure)) process.exitCode = 3;
	else if (failed.length > 0) process.exitCode = 1;
}

async function cmdKey() {
	const input = resolve(need("in"));
	const output = resolve(need("out"));
	const header = readImageHeader(input);
	const stats = await keyImage({
		input,
		output,
		key: need("key"),
		tolerance: Number(need("tolerance")),
		grid: Number(need("grid")),
		levels: Number(flags.levels ?? 16),
	});
	process.stdout.write(
		`assets key: in ${describeHeader(header)}\n` +
			`assets key: key colour ${stats.key}, keyed ${String(stats.keyedSourcePixels)} of ${String(stats.sourceWidth * stats.sourceHeight)} source pixels\n` +
			`assets key: out png ${String(stats.width)}x${String(stats.height)} opaque ${String(stats.opaquePixels)} transparent ${String(stats.transparentPixels)} sha256=${sha256(output)}\n`,
	);
}

async function cmdReadback() {
	const image = resolve(need("in"));
	const result = await readback({
		image,
		specPath: resolve(need("spec")),
		offline: flags.offline === true,
		force: flags.force === true,
	});
	if (result.alreadyRead) {
		process.stdout.write(`assets readback: already read into ${result.outPath}, pass --force to spend another call\n`);
		return;
	}
	if (result.authFailure) {
		process.stderr.write(`assets readback: AUTH FAILURE\n  run: ${result.instruction}\n`);
		process.exitCode = 3;
		return;
	}
	for (const check of result.checks) {
		process.stdout.write(`  ${check.pass ? "pass" : "FAIL"} ${check.kind} ${check.label}\n`);
	}
	process.stdout.write(`assets readback: ${result.verdict} -> ${result.outPath ?? "(not written)"}\n${capLine()}\n`);
	if (result.verdict !== "pass") process.exitCode = 1;
}

function cmdLedger() {
	const rows = readManifest();
	const { calls, images } = totals();
	process.stdout.write(
		`assets ledger: ${String(rows.length)} manifest rows, ${String(calls)}/${String(NIGHT_CAP_CALLS)} calls, ${String(images)}/${String(NIGHT_CAP_IMAGES)} images\n`,
	);
	if (flags.verify !== true) return;
	// Every row with a path is checked against the file it hashed. A mismatch is a
	// failure unless the hash is named in superseded.tsv, which only holds rows
	// written before gen refused to overwrite an output.
	const results = verifyRows(rows, supersededHashes(), (relative) => sha256(path.join(REPO_ROOT, relative)));
	for (const result of results) {
		if (result.status === "ok") {
			const header = readImageHeader(path.join(REPO_ROOT, result.row.path));
			process.stdout.write(`  ok ${result.row.path} ${describeHeader(header)}\n`);
		} else if (result.status === "missing") {
			process.stdout.write(`  MISSING ${result.row.path} ${result.detail}\n`);
		} else {
			process.stdout.write(
				`  ${result.status === "superseded" ? "superseded" : "MISMATCH"} ${result.row.path} row=${result.row.sha256.slice(0, 12)} disk=${result.actual.slice(0, 12)}\n`,
			);
		}
	}
	const bad = results.filter((result) => result.status === "mismatch" || result.status === "missing").length;
	const superseded = results.filter((result) => result.status === "superseded").length;
	process.stdout.write(
		`assets ledger: ${String(bad)} bad rows, ${String(superseded)} rows superseded by name in ${repoRelative(SUPERSEDED_LEDGER)}\n`,
	);
	if (bad > 0) process.exitCode = 1;
}

// A roll-up across every theme's concept directory. Derived, so it is rewritten
// from the authoritative rows rather than appended to.
function cmdConcepts() {
	const rows = authoritativeRows()
		.filter((entry) => !entry.superseded && entry.row.kind === "concept")
		.map((entry) => entry.row);
	const out = path.join(REPO_ROOT, "docs/images/concepts/manifest.tsv");
	writeFileSync(
		out,
		`${MANIFEST_COLUMNS.join("\t")}\n${rows
			.map((row) => MANIFEST_COLUMNS.map((column) => row[column]).join("\t"))
			.join("\n")}\n`,
	);
	process.stdout.write(`assets concepts: ${String(rows.length)} concept frames -> ${repoRelative(out)}\n`);
}

async function cmdSelftest() {
	const { spawnSync } = await import("node:child_process");
	const result = spawnSync(process.execPath, ["--test", "scripts/assets/test/*.test.mjs"], {
		cwd: REPO_ROOT,
		stdio: "inherit",
	});
	process.exitCode = result.status ?? 1;
}

try {
	switch (command) {
		case "gen":
			await cmdGen();
			break;
		case "key":
			await cmdKey();
			break;
		case "readback":
			await cmdReadback();
			break;
		case "ledger":
			cmdLedger();
			break;
		case "concepts":
			cmdConcepts();
			break;
		case "selftest":
			await cmdSelftest();
			break;
		default:
			process.stdout.write(`${USAGE}\n`);
			process.exitCode = command === undefined || command === "help" ? 0 : 2;
	}
} catch (error) {
	process.stderr.write(`assets ${command ?? ""}: ${error.message}\n`);
	process.exitCode = 1;
}
