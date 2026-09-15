import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALL_COLUMNS, MANIFEST_COLUMNS, validateManifestRow } from "./shape.mjs";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const ASSETS_DIR = path.join(REPO_ROOT, "scripts/assets");
export const ROOT_MANIFEST = path.join(ASSETS_DIR, "manifest.tsv");
export const CALL_LEDGER = path.join(ASSETS_DIR, "calls.tsv");

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

// The manifest is append-only, so an id that was generated again keeps its old
// rows. Only the newest row per theme and id still describes a file on disk.
export function authoritativeRows(rows = readManifest()) {
	const newest = new Map();
	for (const [index, row] of rows.entries()) newest.set(`${row.theme}\t${row.id}`, index);
	return rows.map((row, index) => ({ row, superseded: newest.get(`${row.theme}\t${row.id}`) !== index }));
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
	return () => {
		rmSync(LOCK_PATH, { force: true });
	};
}

export function sha256(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function repoRelative(file) {
	return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

// Frame ids restart at 01 per theme, so an asset is only identified by the pair.
export function attemptsFor(theme, id) {
	return readManifest().filter((row) => row.theme === theme && row.id === id).length;
}

export function discardsFor(theme, id) {
	return readManifest().filter((row) => row.theme === theme && row.id === id && row.verdict === "fail").length;
}
