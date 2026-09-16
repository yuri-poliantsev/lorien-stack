import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
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

export function wrapperPrompt(request, outPath) {
	const dir = path.dirname(outPath);
	const call = request.reference
		? `Call image_edit exactly once. Pass image "${path.resolve(REPO_ROOT, request.reference)}" as the single source image. Pass aspect_ratio "${aspectRatio(request.size)}".`
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

export const OUTPUT_EXTENSIONS = [".jpg", ".png"];

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
		return { ok: false, clash: repoRelative(clash) };
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
	const wrapper = wrapperPrompt(request, outPath);
	writeFileSync(promptPath, `${request.prompt.trim()}\n\n--- wrapper handed to ${GROK_BIN} ---\n${wrapper}\n`);

	if (dryRun) return { ok: true, dryRun: true, outPath, promptPath, wrapper };

	assertUnderCaps(1);
	const result = await runGrok(wrapper);
	const combined = `${result.stdout}\n${result.stderr}`;
	const landed = existsSync(outPath) ? outPath : resolveLanded(result.text, outPath);
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

function retypeExtension(file, header) {
	const wanted = header.format === "png" ? ".png" : ".jpg";
	if (path.extname(file).toLowerCase() === wanted) return file;
	const renamed = file.replace(/\.[^.]+$/, wanted);
	renameSync(file, renamed);
	return renamed;
}
