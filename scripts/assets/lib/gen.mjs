import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describeHeader, readImageHeader } from "./header.mjs";
import { GROK_BIN, LOGIN_INSTRUCTION, lastPathLike, looksLikeAuthFailure, runGrok } from "./grok.mjs";
import {
	REPO_ROOT,
	assertUnderCaps,
	capLine,
	discardsFor,
	logCall,
	logManifest,
	repoRelative,
	sha256,
} from "./ledger.mjs";
import { aspectRatio } from "./shape.mjs";

const MAX_DISCARDS = 2;

export function defaultOutDir(request) {
	return request.kind === "concept"
		? path.join(REPO_ROOT, "docs/images/concepts", request.theme)
		: path.join(REPO_ROOT, "docs/images/assets", request.theme, request.kind);
}

// The model is told where to save, so that path is part of the prompt. Pointing it at
// the real output directory handed it the theme slug, which the bakeoff exists to keep
// out of the prompt. It writes into an opaque scratch directory instead and gen moves
// the result into place afterwards.
export function scratchPaths(request) {
	const token = createHash("sha256").update(`${request.theme}/${request.id}`).digest("hex").slice(0, 16);
	const dir = path.join(tmpdir(), "asset-scratch", token);
	const reference =
		request.reference === undefined
			? undefined
			: path.join(dir, `source${path.extname(request.reference).toLowerCase() || ".jpg"}`);
	return { dir, outPath: path.join(dir, "out.jpg"), reference };
}

export function wrapperPrompt(request, outPath, referencePath) {
	const dir = path.dirname(outPath);
	const call = request.reference
		? `Call image_edit exactly once. Pass image "${referencePath}" as the single source image. Pass aspect_ratio "${aspectRatio(request.size)}".`
		: `Call image_gen exactly once. Pass aspect_ratio "${aspectRatio(request.size)}".`;
	return [
		"Produce exactly one image file and stop.",
		"",
		`Step 1. ${call} Pass this prompt text verbatim, with no additions, no rewording, and no style notes of your own:`,
		"<<<PROMPT",
		request.prompt.trim(),
		"PROMPT",
		"",
		`Step 2. Copy the resulting image to exactly this absolute path, creating parent directories if they are missing: ${outPath}`,
		"",
		"Step 3. Print that absolute path as your entire final message. No prose, no markdown, no code fences, no trailing text.",
		"",
		"Hard rules. Exactly one image call, and no second attempt even if the result looks wrong. Do not call image_edit if you called image_gen, or image_gen if you called image_edit. Do not write, move, or delete any file outside " +
			dir +
			". Do not run git. Do not ask questions.",
	].join("\n");
}

const OUTPUT_EXTENSIONS = [".jpg", ".png"];

// An append-only manifest row is only worth anything if its file is still the file
// it hashed, so an output path is written exactly once. A retry of 04 is 04-2.
export function existingOutput(outDir, id) {
	return OUTPUT_EXTENSIONS.map((extension) => path.join(outDir, `${id}${extension}`)).find((candidate) =>
		existsSync(candidate),
	);
}

export async function generate(request, { outDir = defaultOutDir(request), dryRun = false } = {}) {
	const clash = existingOutput(outDir, request.id);
	if (clash !== undefined) {
		return { ok: false, clash };
	}

	const discards = discardsFor(request.theme, request.id);
	if (discards >= MAX_DISCARDS) {
		const row = logManifest(
			{
				id: request.id,
				theme: request.theme,
				kind: request.kind,
				path: "",
				sha256: "",
				promptPath: "",
				source: "grok",
				attempts: String(discards),
				readback: "",
				verdict: "exhausted",
			},
			outDir,
		);
		return { ok: false, exhausted: true, row };
	}

	mkdirSync(outDir, { recursive: true });
	const outPath = path.join(outDir, `${request.id}.jpg`);
	const promptPath = path.join(outDir, `${request.id}.prompt.txt`);
	const scratch = scratchPaths(request);
	const wrapper = wrapperPrompt(request, scratch.outPath, scratch.reference);
	writeFileSync(promptPath, `${request.prompt.trim()}\n\n--- wrapper handed to ${GROK_BIN} ---\n${wrapper}\n`);

	if (dryRun) return { ok: true, dryRun: true, outPath, promptPath, wrapper };

	let result;
	let landed;
	try {
		rmSync(scratch.dir, { recursive: true, force: true });
		mkdirSync(scratch.dir, { recursive: true });
		if (scratch.reference !== undefined) copyFileSync(path.resolve(REPO_ROOT, request.reference), scratch.reference);

		assertUnderCaps(1);
		result = await runGrok(wrapper);
		const scratched = existsSync(scratch.outPath) ? scratch.outPath : resolveLanded(result.text, scratch.outPath);
		landed = scratched === undefined ? undefined : movePath(scratched, outPath);
	} finally {
		// A missing reference, a cap refusal or a failed call all leave the scratch
		// directory behind otherwise, under a name that is stable per request.
		rmSync(scratch.dir, { recursive: true, force: true });
	}

	const combined = `${result.stdout}\n${result.stderr}`;
	logCall({
		id: `${request.theme}/${request.id}`,
		op: request.reference ? "image_edit" : "image_gen",
		images: landed ? 1 : 0,
		exit: result.exit,
		seconds: result.seconds,
	});

	if (!landed && looksLikeAuthFailure(combined)) {
		const row = logManifest(
			{
				id: request.id,
				theme: request.theme,
				kind: request.kind,
				path: "",
				sha256: "",
				promptPath: repoRelative(promptPath),
				source: "needs-cursor",
				attempts: String(discards + 1),
				readback: "",
				verdict: "pending",
			},
			outDir,
		);
		return { ok: false, authFailure: true, row, instruction: LOGIN_INSTRUCTION, stderr: result.stderr };
	}

	if (!landed) {
		const row = logManifest(
			{
				id: request.id,
				theme: request.theme,
				kind: request.kind,
				path: "",
				sha256: "",
				promptPath: repoRelative(promptPath),
				source: "grok",
				attempts: String(discards + 1),
				readback: "",
				verdict: "fail",
			},
			outDir,
		);
		return { ok: false, row, reason: `no image at ${outPath}`, text: result.text, stderr: result.stderr };
	}

	const header = readImageHeader(landed);
	const finalPath = retypeExtension(landed, header);
	const row = logManifest(
		{
			id: request.id,
			theme: request.theme,
			kind: request.kind,
			path: repoRelative(finalPath),
			sha256: sha256(finalPath),
			promptPath: repoRelative(promptPath),
			source: "grok",
			attempts: String(discards + 1),
			readback: "",
			verdict: "unread",
		},
		outDir,
	);
	return { ok: true, row, header, headerLine: describeHeader(header), outPath: finalPath, caps: capLine(), seconds: result.seconds };
}

function resolveLanded(text, outPath) {
	const printed = lastPathLike(text ?? "");
	if (printed === undefined) return undefined;
	if (printed === outPath) return existsSync(outPath) ? outPath : undefined;
	if (!existsSync(printed)) return undefined;
	renameSync(printed, outPath);
	return outPath;
}

// The scratch directory is under the system temp root, which is often a different
// filesystem from the repo, so rename can fail with EXDEV.
function movePath(from, to) {
	try {
		renameSync(from, to);
	} catch (error) {
		if (error.code !== "EXDEV") throw error;
		copyFileSync(from, to);
		rmSync(from, { force: true });
	}
	return to;
}

function retypeExtension(file, header) {
	const wanted = header.format === "png" ? ".png" : ".jpg";
	if (path.extname(file).toLowerCase() === wanted) return file;
	const renamed = file.replace(/\.[^.]+$/, wanted);
	renameSync(file, renamed);
	return renamed;
}
