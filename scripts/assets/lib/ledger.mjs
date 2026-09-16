import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALL_COLUMNS, MANIFEST_COLUMNS, validateManifestRow } from "./shape.mjs";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const ASSETS_DIR = path.join(REPO_ROOT, "scripts/assets");
export const ROOT_MANIFEST = path.join(ASSETS_DIR, "manifest.tsv");
export const CALL_LEDGER = path.join(ASSETS_DIR, "calls.tsv");
export const SUPERSEDED_LEDGER = path.join(ASSETS_DIR, "superseded.tsv");
const SUPERSEDED_COLUMNS = ["manifestLine", "theme", "id", "sha256", "reason"];

export const NIGHT_CAP_CALLS = 500;
export const NIGHT_CAP_IMAGES = 400;
export const REFUSE_AT_CALLS = 480;
export const REFUSE_AT_IMAGES = 390;

function readRows(file, columns) {
	if (!existsSync(file)) return [];
	const lines = readFileSync(file, "utf8").split("\n").filter((line) => line.length > 0);
	if (lines.length === 0) return [];
	return lines.slice(1).map((line) => {
		const cells = line.split("\t");
		return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""]));
	});
}

function appendRow(file, columns, row) {
	mkdirSync(path.dirname(file), { recursive: true });
	if (!existsSync(file)) appendFileSync(file, `${columns.join("\t")}\n`);
	const cells = columns.map((column) => String(row[column] ?? "").replace(/[\t\r\n]+/g, " "));
	appendFileSync(file, `${cells.join("\t")}\n`);
}

export function readCalls() {
	return readRows(CALL_LEDGER, CALL_COLUMNS);
}

export function readManifest(file = ROOT_MANIFEST) {
	return readRows(file, MANIFEST_COLUMNS);
}

export function totals() {
	const calls = readCalls();
	const images = calls.reduce((sum, call) => sum + (Number(call.images) || 0), 0);
	return { calls: calls.length, images };
}

export function capLine() {
	const { calls, images } = totals();
	return `caps: ${String(calls)}/${String(NIGHT_CAP_CALLS)} calls, ${String(images)}/${String(NIGHT_CAP_IMAGES)} images`;
}

export function assertUnderCaps(plannedImages) {
	const { calls, images } = totals();
	if (calls >= REFUSE_AT_CALLS) {
		throw new Error(`refusing to call: ${String(calls)} calls logged, floor is ${String(REFUSE_AT_CALLS)}`);
	}
	if (images + plannedImages > REFUSE_AT_IMAGES) {
		throw new Error(`refusing to call: ${String(images)} images logged, floor is ${String(REFUSE_AT_IMAGES)}`);
	}
}

export function logCall({ id, op, images, exit, seconds }) {
	appendRow(CALL_LEDGER, CALL_COLUMNS, {
		ts: new Date().toISOString(),
		id,
		op,
		images: String(images),
		exit: String(exit),
		seconds: seconds.toFixed(1),
	});
}

export function logManifest(row, outDir) {
	const checked = validateManifestRow(row);
	appendRow(ROOT_MANIFEST, MANIFEST_COLUMNS, checked);
	if (outDir) appendRow(path.join(outDir, "manifest.tsv"), MANIFEST_COLUMNS, checked);
	return checked;
}

// Rows written before gen refused to overwrite an output: the file moved out from
// under the hash, so the hash can never be reproduced. Each one is named here with
// its reason, and `ledger --verify` tolerates a mismatch only for these. Nothing
// gets added to this file; a new mismatch is a bug, not an exception.
export function readSuperseded() {
	return readRows(SUPERSEDED_LEDGER, SUPERSEDED_COLUMNS);
}

export function supersededHashes() {
	return new Set(readSuperseded().map((row) => row.sha256));
}

// Every row that names a file is checked against that file. `mismatch` and
// `missing` are failures; `superseded` is the only tolerated disagreement, and only
// because the hash is named in superseded.tsv.
export function verifyRows(rows, tolerated, hash) {
	const results = [];
	for (const row of rows) {
		if (row.path.length === 0) continue;
		let actual;
		try {
			actual = hash(row.path);
		} catch (error) {
			results.push({ row, status: "missing", detail: error.message });
			continue;
		}
		if (actual === row.sha256) results.push({ row, status: "ok", actual });
		else results.push({ row, status: tolerated.has(row.sha256) ? "superseded" : "mismatch", actual });
	}
	return results;
}

// The manifest is append-only, so an id that was generated again keeps its old
// rows. Only the newest row per theme and id still describes a file on disk.
export function authoritativeRows(rows = readManifest()) {
	const newest = new Map();
	for (const [index, row] of rows.entries()) newest.set(`${row.theme}\t${row.id}`, index);
	return rows.map((row, index) => ({ row, superseded: newest.get(`${row.theme}\t${row.id}`) !== index }));
}

// A read-back has to land in the manifest or the discard cap never fires. The
// manifest is append-only, so the verdict arrives as a fresh row that supersedes
// the generation row for the same theme and id.
export function recordVerdict(imagePath, verdict, readbackNote) {
	const wanted = repoRelative(imagePath);
	const rows = readManifest();
	const found = [...rows].reverse().find((row) => row.path === wanted);
	if (found === undefined) throw new Error(`${wanted} has no manifest row to carry a verdict`);
	return logManifest({ ...found, readback: readbackNote, verdict }, path.dirname(imagePath));
}

export const LOCK_PATH = path.join(ASSETS_DIR, ".gen.lock");

// Two concurrent gen runs would both spend from a shared cap and overwrite each
// other's outputs, which is how six duplicate frames got generated once already.
export function takeLock() {
	mkdirSync(ASSETS_DIR, { recursive: true });
	try {
		writeFileSync(LOCK_PATH, `${String(process.pid)} ${new Date().toISOString()}\n`, { flag: "wx" });
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		throw new Error(
			`another assets gen run holds ${repoRelative(LOCK_PATH)} (${readFileSync(LOCK_PATH, "utf8").trim()}); delete it if that run is gone`,
		);
	}
	// Node's default handling of SIGINT and SIGTERM exits without unwinding, so the
	// release in a `finally` never runs and Ctrl-C on a batch that takes minutes
	// strands the lock. The next run then refuses for a holder that no longer exists.
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		process.off("SIGINT", onInterrupt);
		process.off("SIGTERM", onTerminate);
		rmSync(LOCK_PATH, { force: true });
	};
	const onSignal = (code) => {
		release();
		process.exit(code);
	};
	// 128 plus the signal number, so a caller can tell an interrupted batch from a
	// failed one.
	const onInterrupt = () => onSignal(130);
	const onTerminate = () => onSignal(143);
	process.once("SIGINT", onInterrupt);
	process.once("SIGTERM", onTerminate);
	return release;
}

export function sha256(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function repoRelative(file) {
	return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

// For messages rather than manifest rows: a path outside the repo would come back from
// repoRelative as a walk up through `..`, which is worse to read than the absolute path.
export function displayPath(file) {
	const relative = repoRelative(file);
	return relative.startsWith("../") ? file : relative;
}

// Frame ids restart at 01 per theme, so an asset is only identified by the pair.
export function attemptsFor(theme, id) {
	return readManifest().filter((row) => row.theme === theme && row.id === id).length;
}

// gen refuses to overwrite an output, so a retry of frame 04 arrives as 04-2 and
// then 04-3. The stem before that suffix is the asset, and the discard cap counts
// the stem, or a retry would silently reset its own budget.
export function idStem(id) {
	return id.replace(/-\d+$/, "");
}

export function discardsFor(theme, id, rows = readManifest()) {
	const stem = idStem(id);
	return rows.filter((row) => row.theme === theme && idStem(row.id) === stem && row.verdict === "fail").length;
}
