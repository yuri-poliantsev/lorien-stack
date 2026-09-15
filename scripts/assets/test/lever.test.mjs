import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { defaultOutDir, wrapperPrompt } from "../lib/gen.mjs";
import { lastPathLike, looksLikeAuthFailure } from "../lib/grok.mjs";
import { describeHeader, readImageHeader } from "../lib/header.mjs";
import { diffAgainstSpec, mentions, parseSpec } from "../lib/readback.mjs";
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
	const wrapper = wrapperPrompt({ ...REQUEST, reference: "docs/images/concepts/lorien/01.jpg" }, "/abs/out/02.jpg");
	assert.match(wrapper, /Call image_edit exactly once\. Pass image "\/[^"]*docs\/images\/concepts\/lorien\/01\.jpg"/);
	assert.doesNotMatch(wrapper, /Call image_gen exactly once/);
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
