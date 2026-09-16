import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { defaultOutDir, existingOutput, scratchPaths, wrapperPrompt } from "../lib/gen.mjs";
import { lastPathLike, looksLikeAuthFailure } from "../lib/grok.mjs";
import { describeHeader, readImageHeader } from "../lib/header.mjs";
import {
	CALL_LEDGER,
	LOCK_PATH,
	REPO_ROOT,
	ROOT_MANIFEST,
	authoritativeRows,
	discardsFor,
	idStem,
	readManifest,
	readSuperseded,
	sha256,
	verifyRows,
} from "../lib/ledger.mjs";
import { diffAgainstSpec, mentions, note, parseSpec } from "../lib/readback.mjs";
import { aspectRatio, parseRequests } from "../lib/shape.mjs";

const REQUEST = {
	id: "01",
	theme: "lorien",
	kind: "concept",
	prompt: "A side view of a layered mallorn forest at dusk.",
	size: "16:9",
	spec: "docs/images/concepts/lorien/01.spec.md",
};

test("parseRequests accepts one request, an array, and a requests wrapper", () => {
	assert.equal(parseRequests(REQUEST, "r.json").length, 1);
	assert.equal(parseRequests([REQUEST, { ...REQUEST, id: "02" }], "r.json").length, 2);
	assert.equal(parseRequests({ requests: [REQUEST] }, "r.json").length, 1);
});

test("parseRequests rejects every malformed field with the offending path", () => {
	assert.throws(() => parseRequests({ ...REQUEST, kind: "poster" }, "r.json"), /r\.json\[0\]: kind must be one of/);
	assert.throws(() => parseRequests({ ...REQUEST, id: "../escape" }, "r.json"), /id must be a filename-safe string/);
	assert.throws(() => parseRequests({ ...REQUEST, theme: "Lorien" }, "r.json"), /theme must be a lowercase slug/);
	assert.throws(() => parseRequests({ ...REQUEST, size: "wide" }, "r.json"), /size must be an aspect ratio/);
	assert.throws(() => parseRequests({ ...REQUEST, keyColour: "magenta" }, "r.json"), /keyColour must be #rrggbb/);
	assert.throws(() => parseRequests({ ...REQUEST, prompt: "  " }, "r.json"), /prompt must be a non-empty string/);
	assert.throws(() => parseRequests({ ...REQUEST, spec: "" }, "r.json"), /spec must be a path/);
});

test("aspectRatio passes ratios through and reduces pixel sizes", () => {
	assert.equal(aspectRatio("16:9"), "16:9");
	assert.equal(aspectRatio("1024x1024"), "1:1");
	assert.equal(aspectRatio("1920x1080"), "16:9");
});

test("defaultOutDir separates concepts from asset kinds", () => {
	assert.match(defaultOutDir(REQUEST), /docs\/images\/concepts\/lorien$/);
	assert.match(defaultOutDir({ ...REQUEST, kind: "building", theme: "starcraft" }), /docs\/images\/assets\/starcraft\/building$/);
});

test("wrapperPrompt pins one image_gen call, the absolute path, and a bare final message", () => {
	const wrapper = wrapperPrompt(REQUEST, "/abs/out/01.jpg");
	assert.match(wrapper, /Call image_gen exactly once\. Pass aspect_ratio "16:9"/);
	assert.match(wrapper, /exactly this absolute path[^\n]*\/abs\/out\/01\.jpg/);
	assert.match(wrapper, /Print that absolute path as your entire final message/);
	assert.match(wrapper, /Exactly one image call/);
	assert.ok(wrapper.includes(REQUEST.prompt), "the request prompt is handed over verbatim");
});

test("wrapperPrompt switches to image_edit when a reference is set", () => {
	const scratch = scratchPaths({ ...REQUEST, reference: "docs/images/concepts/lorien/01.jpg" });
	const wrapper = wrapperPrompt({ ...REQUEST, reference: "docs/images/concepts/lorien/01.jpg" }, scratch.outPath, scratch.reference);
	assert.match(wrapper, /Call image_edit exactly once\. Pass image "[^"]*\/source\.jpg"/);
	assert.doesNotMatch(wrapper, /Call image_gen exactly once/);
});

// The bakeoff is only honest if the model never reads the theme it is drawing for, and
// the save path is part of what it reads.
test("the wrapper handed to the model names no theme, in the output path or the reference", () => {
	const themes = ["lorien", "starcraft", "mission-control", "bruegel", "night-city", "aquarium", "isometric-office"];
	for (const theme of themes) {
		const request = { ...REQUEST, theme, id: "04", reference: "docs/images/concepts/mission-control/02.jpg" };
		const scratch = scratchPaths(request);
		const wrapper = wrapperPrompt(request, scratch.outPath, scratch.reference);
		for (const slug of themes) {
			assert.ok(!wrapper.toLowerCase().includes(slug), `${theme} wrapper leaks ${slug}:\n${wrapper}`);
		}
		assert.ok(!wrapper.includes(REPO_ROOT), `${theme} wrapper leaks the repo path`);
		assert.ok(!wrapper.includes("/04"), `${theme} wrapper leaks the request id as a path segment`);
		assert.ok(wrapper.includes(scratch.dir), "the wrapper points at the opaque scratch directory");
	}
	assert.notEqual(scratchPaths({ ...REQUEST, id: "01" }).dir, scratchPaths({ ...REQUEST, id: "02" }).dir);
});

test("readImageHeader reports JPEG 4:2:0 under a png filename and real PNG alpha", async () => {
	const dir = mkdtempSync(path.join(tmpdir(), "assets-header-"));
	const pixels = Buffer.alloc(32 * 16 * 4, 0x40);
	const lying = path.join(dir, "actually-jpeg.png");
	await sharp(pixels, { raw: { width: 32, height: 16, channels: 4 } })
		.jpeg({ chromaSubsampling: "4:2:0" })
		.toFile(lying);
	const jpegHeader = readImageHeader(lying);
	assert.equal(jpegHeader.format, "jpeg");
	assert.equal(jpegHeader.width, 32);
	assert.equal(jpegHeader.height, 16);
	assert.equal(jpegHeader.chroma, "4:2:0");
	assert.equal(jpegHeader.hasAlpha, false);
	assert.equal(describeHeader(jpegHeader), "jpeg 32x16 chroma=4:2:0 alpha=false");

	const real = path.join(dir, "real.png");
	await sharp(pixels, { raw: { width: 32, height: 16, channels: 4 } }).png().toFile(real);
	const pngHeader = readImageHeader(real);
	assert.equal(pngHeader.format, "png");
	assert.equal(pngHeader.hasAlpha, true);
	assert.equal(pngHeader.chroma, "none");

	const notAnImage = path.join(dir, "text.jpg");
	writeFileSync(notAnImage, "x".repeat(64));
	assert.throws(() => readImageHeader(notAnImage), /no PNG or JPEG signature/);
	writeFileSync(notAnImage, "tiny");
	assert.throws(() => readImageHeader(notAnImage), /not an image/);
});

test("readImageHeader names 4:4:4 subsampling apart from 4:2:0", async () => {
	const dir = mkdtempSync(path.join(tmpdir(), "assets-chroma-"));
	const pixels = Buffer.alloc(16 * 16 * 3, 0x80);
	const file = path.join(dir, "444.jpg");
	await sharp(pixels, { raw: { width: 16, height: 16, channels: 3 } }).jpeg({ chromaSubsampling: "4:4:4" }).toFile(file);
	assert.equal(readImageHeader(file).chroma, "4:4:4");
});

test("looksLikeAuthFailure fires on grok auth text and stays quiet on image failures", () => {
	assert.equal(looksLikeAuthFailure("Error: not signed in. Run grok login."), true);
	assert.equal(looksLikeAuthFailure("request failed with status 401"), true);
	assert.equal(looksLikeAuthFailure("session expired, please authenticate"), true);
	assert.equal(looksLikeAuthFailure("image_gen returned a moderation block"), false);
	assert.equal(looksLikeAuthFailure("no image was produced"), false);
});

test("lastPathLike picks the final image path out of chatty output", () => {
	assert.equal(lastPathLike("saved to /tmp/a.png then /tmp/b.jpg"), "/tmp/b.jpg");
	assert.equal(lastPathLike("`/var/out/01.jpeg`"), "/var/out/01.jpeg");
	assert.equal(lastPathLike("nothing here"), undefined);
});

test("parseSpec collects require groups and forbid terms", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "assets-spec-"));
	const file = path.join(dir, "01.spec.md");
	writeFileSync(
		file,
		["# Spec", "## Read-back checks", "- require: side view | side-on", "- require: eight | 8", "- forbid: crt | scanline"].join("\n"),
	);
	const spec = parseSpec(file);
	assert.deepEqual(spec.require, [["side view", "side-on"], ["eight", "8"]]);
	assert.deepEqual(spec.forbid, ["crt", "scanline"]);

	const empty = path.join(dir, "empty.spec.md");
	writeFileSync(empty, "# Spec\nno checks here\n");
	assert.throws(() => parseSpec(empty), /no "- require:" lines/);
});

test("note summarises a verdict for the manifest readback column", () => {
	const spec = { require: [["eight", "8"], ["lantern", "lanterns"]], forbid: ["crt"] };
	assert.equal(note(diffAgainstSpec("Eight lit lanterns.", spec)), "3 checks pass");
	assert.equal(note(diffAgainstSpec("Seven lit lanterns.", spec)), "require:eight");
	assert.equal(note(diffAgainstSpec("Seven boxes behind a crt.", spec)), "require:eight require:lantern forbid:crt");
	assert.equal(
		diffAgainstSpec("Eight lit lanterns.", { require: [["lantern"]], forbid: [] }).verdict,
		"fail",
		"a singular-only require group misses the plural, so specs list both forms",
	);
});

test("authoritativeRows keeps the newest row per theme and id and marks the rest superseded", () => {
	const rows = [
		{ theme: "lorien", id: "01", sha256: "a" },
		{ theme: "starcraft", id: "01", sha256: "b" },
		{ theme: "lorien", id: "01", sha256: "c" },
		{ theme: "lorien", id: "02", sha256: "d" },
	];
	assert.deepEqual(
		authoritativeRows(rows).map((entry) => [entry.row.theme, entry.row.id, entry.row.sha256, entry.superseded]),
		[
			["lorien", "01", "a", true],
			["starcraft", "01", "b", false],
			["lorien", "01", "c", false],
			["lorien", "02", "d", false],
		],
	);
});

// `assets key` emits a palette PNG, whose transparency lives in a tRNS chunk rather than
// in an alpha sample per pixel, so the colour type alone called the keyed output opaque.
test("readImageHeader reports alpha on a palette PNG carrying a tRNS chunk", async () => {
	const dir = mkdtempSync(path.join(tmpdir(), "assets-trns-"));
	const pixels = Buffer.alloc(8 * 8 * 4);
	for (let index = 0; index < 8 * 8; index += 1) {
		pixels[index * 4] = 0xff;
		pixels[index * 4 + 3] = index < 32 ? 0 : 0xff;
	}
	const palette = path.join(dir, "keyed.png");
	await sharp(pixels, { raw: { width: 8, height: 8, channels: 4 } }).png({ palette: true }).toFile(palette);
	const header = readImageHeader(palette);
	assert.equal(header.colourType, 3, "sharp wrote a palette PNG, not an RGBA one");
	assert.equal(header.transparency, true);
	assert.equal(header.hasAlpha, true);
	assert.match(describeHeader(header), /^png 8x8 chroma=none alpha=true$/);

	const opaque = path.join(dir, "opaque.png");
	await sharp(Buffer.alloc(8 * 8 * 3, 0x20), { raw: { width: 8, height: 8, channels: 3 } })
		.png({ palette: true })
		.toFile(opaque);
	assert.equal(readImageHeader(opaque).hasAlpha, false, "a palette PNG with no tRNS is still opaque");

	const keyed = readImageHeader(path.join(REPO_ROOT, "scripts/assets/examples/starcraft-worker-keyed.png"));
	assert.equal(keyed.hasAlpha, true, "the committed keyed example reads back as having alpha");
});

test("gen refuses an output path that already exists, spending no call and appending no row", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "assets-clash-"));
	writeFileSync(path.join(dir, "01.jpg"), "not really a jpeg");
	assert.equal(existingOutput(dir, "01"), path.join(dir, "01.jpg"));
	assert.equal(existingOutput(dir, "02"), undefined);

	const requestFile = path.join(dir, "request.json");
	writeFileSync(requestFile, JSON.stringify(REQUEST));
	const before = readFileSync(ROOT_MANIFEST, "utf8");
	const callsBefore = readFileSync(CALL_LEDGER, "utf8");
	const run = spawnSync(
		process.execPath,
		[fileURLToPath(new URL("../main.mjs", import.meta.url)), "gen", "--request", requestFile, "--out-dir", dir],
		// A broken GROK_BIN means a regression here fails the test instead of spending a call.
		{ encoding: "utf8", env: { ...process.env, GROK_BIN: path.join(dir, "no-such-grok") } },
	);
	assert.equal(run.status, 1);
	assert.match(run.stderr, /REFUSED/);
	assert.match(run.stderr, /pick a new id \(01-2\)/);
	assert.ok(
		run.stderr.split("\n").some((line) => line.includes(`REFUSED, ${path.join(dir, "01.jpg")} already exists`)),
		`stderr names the clashing path outright rather than as a walk up out of the repo: ${run.stderr}`,
	);
	assert.doesNotMatch(run.stderr, /\.\.\/\.\.\//);
	assert.equal(readFileSync(ROOT_MANIFEST, "utf8"), before, "no manifest row appended");
	assert.equal(readFileSync(CALL_LEDGER, "utf8"), callsBefore, "no call logged");
});

// The refusal is a verdict on the request file, so it has to survive an unrelated
// failure. Taking the global lock first meant a stale lock reported itself instead and
// the author never learned which id to change.
test("an existing .png plus a stale lock still refuses, leaving the lock untouched", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "assets-lock-"));
	writeFileSync(path.join(dir, "01.png"), "not really a png");
	const requestFile = path.join(dir, "request.json");
	writeFileSync(requestFile, JSON.stringify(REQUEST));
	assert.equal(existsSync(LOCK_PATH), false, "no real gen run is holding the lock");

	const stale = "99999 2026-09-16T00:00:00.000Z\n";
	writeFileSync(LOCK_PATH, stale, { flag: "wx" });
	try {
		const run = spawnSync(
			process.execPath,
			[fileURLToPath(new URL("../main.mjs", import.meta.url)), "gen", "--request", requestFile, "--out-dir", dir],
			{ encoding: "utf8", env: { ...process.env, GROK_BIN: path.join(dir, "no-such-grok") } },
		);
		assert.equal(run.status, 1);
		assert.match(run.stderr, /REFUSED/);
		assert.doesNotMatch(run.stderr, /holds scripts\/assets\/\.gen\.lock/, "the lock error did not take priority");
		assert.ok(
			run.stderr.split("\n").some((line) => line.includes(`REFUSED, ${path.join(dir, "01.png")} already exists`)),
			`the .png output is refused by name: ${run.stderr}`,
		);
		assert.equal(readFileSync(LOCK_PATH, "utf8"), stale, "the lock was neither rewritten nor released");
	} finally {
		rmSync(LOCK_PATH, { force: true });
	}
});

test("verifyRows fails a row whose file hash differs unless the hash is named superseded", () => {
	const rows = [
		{ theme: "lorien", id: "01", path: "a.jpg", sha256: "aaa" },
		{ theme: "lorien", id: "02", path: "b.jpg", sha256: "bbb" },
		{ theme: "lorien", id: "03", path: "c.jpg", sha256: "ccc" },
		{ theme: "lorien", id: "04", path: "", sha256: "" },
	];
	const disk = { "a.jpg": "aaa", "b.jpg": "drifted", "c.jpg": "drifted" };
	const results = verifyRows(rows, new Set(["ccc"]), (file) => {
		if (!(file in disk)) throw new Error("no such file");
		return disk[file];
	});
	assert.deepEqual(
		results.map((result) => [result.row.path, result.status]),
		[
			["a.jpg", "ok"],
			["b.jpg", "mismatch"],
			["c.jpg", "superseded"],
		],
		"a row with no path is skipped, an unnamed drift is a mismatch, a named one is tolerated",
	);
});

test("superseded.tsv names exactly the six rows written before gen refused to overwrite", () => {
	const named = readSuperseded();
	assert.equal(named.length, 6);
	const drifted = verifyRows(readManifest(), new Set(), (relative) => sha256(path.join(REPO_ROOT, relative))).filter(
		(result) => result.status !== "ok",
	);
	assert.deepEqual(
		drifted.map((result) => result.row.sha256).sort(),
		named.map((row) => row.sha256).sort(),
		"every row that no longer matches its file is named in superseded.tsv, and nothing else is",
	);
	for (const row of named) assert.ok(row.reason.length > 20, `${row.theme}/${row.id} states why`);
});

test("discardsFor counts a retry suffix against the same asset, so the discard cap cannot reset", () => {
	const rows = [
		{ theme: "lorien", id: "04", verdict: "fail" },
		{ theme: "lorien", id: "04-2", verdict: "fail" },
		{ theme: "lorien", id: "04-3", verdict: "unread" },
		{ theme: "lorien", id: "05", verdict: "fail" },
		{ theme: "starcraft", id: "04", verdict: "fail" },
	];
	// The third attempt sees both earlier discards, which is what makes MAX_DISCARDS of 2
	// fire on it rather than on an id that has been renamed out of its own history.
	assert.equal(discardsFor("lorien", "04-3", rows), 2);
	assert.equal(discardsFor("lorien", "04", rows), 2);
	assert.equal(discardsFor("lorien", "05", rows), 1, "a different asset keeps its own budget");
	assert.equal(discardsFor("starcraft", "04", rows), 1, "the same id under another theme is another asset");
	assert.equal(discardsFor("lorien", "06", rows), 0);

	assert.equal(idStem("04"), "04");
	assert.equal(idStem("04-2"), "04");
	assert.equal(idStem("04-2-3"), "04-2");
	assert.equal(idStem("worker-idle"), "worker-idle", "a dash before a non-number is part of the name");
});

test("mentions matches whole terms, so a count check cannot pass on a substring", () => {
	assert.equal(mentions("Six platforms at staggered heights.", "eight"), false);
	assert.equal(mentions("Eight platforms in the canopy.", "eight"), true);
	assert.equal(mentions("A grid of 8 cards.", "8"), true);
	assert.equal(mentions("Rendered at 1080p.", "8"), false);
	assert.equal(mentions("Eighteen platforms.", "eight"), false, "a count term does not match a longer number word");
	assert.equal(mentions("A near-black surface.", "near-black"), true);
	assert.equal(
		mentions("Seen from a raised three-quarter viewpoint.", "three-quarter view"),
		false,
		"the trailing boundary is strict, so specs must name the stem",
	);
	assert.equal(mentions("Seen from a raised three-quarter viewpoint.", "three-quarter"), true);
});

test("diffAgainstSpec fails a count check when the describer counts something else", () => {
	const spec = { require: [["eight", "8"]], forbid: [] };
	assert.equal(diffAgainstSpec("Ten distinct timber houses at staggered heights.", spec).verdict, "fail");
	assert.equal(diffAgainstSpec("Eight distinct timber houses.", spec).verdict, "pass");
});

test("diffAgainstSpec passes a flat description and fails a hedged one", () => {
	const spec = { require: [["side view", "side-on"], ["eight", "8"]], forbid: ["crt"] };
	const clean = diffAgainstSpec("A side view of eight lit platforms in a dark forest.", spec);
	assert.equal(clean.verdict, "pass");
	assert.deepEqual(clean.hedges, []);
	assert.equal(clean.checks.length, 3);

	const hedged = diffAgainstSpec("A side view of what appears to be eight platforms, possibly lit.", spec);
	assert.equal(hedged.verdict, "fail");
	assert.deepEqual(hedged.hedges, ["appears to", "possibly"]);

	const missing = diffAgainstSpec("A top-down grid of eight platforms.", spec);
	assert.equal(missing.verdict, "fail");
	assert.deepEqual(
		missing.checks.filter((check) => !check.pass).map((check) => check.label),
		["side view | side-on"],
	);

	const forbidden = diffAgainstSpec("A side view of eight cards behind a crt curve.", spec);
	assert.equal(forbidden.verdict, "fail");
	assert.deepEqual(
		forbidden.checks.filter((check) => !check.pass).map((check) => check.label),
		["crt"],
	);
});
