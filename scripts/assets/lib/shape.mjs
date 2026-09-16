const KINDS = new Set(["concept", "tile", "building", "backdrop", "sprite"]);
const SOURCES = new Set(["grok", "cursor", "procedural", "needs-cursor"]);
const VERDICTS = new Set(["pending", "pass", "fail", "exhausted", "unread"]);

export const MANIFEST_COLUMNS = [
	"id",
	"theme",
	"kind",
	"path",
	"sha256",
	"promptPath",
	"source",
	"attempts",
	"readback",
	"verdict",
];

export const CALL_COLUMNS = ["ts", "id", "op", "images", "exit", "seconds"];

export function parseRequests(json, file) {
	const raw = Array.isArray(json) ? json : Array.isArray(json.requests) ? json.requests : [json];
	return raw.map((request, index) => validateRequest(request, `${file}[${String(index)}]`));
}

function validateRequest(request, where) {
	const fail = (message) => {
		throw new Error(`${where}: ${message}`);
	};
	if (typeof request !== "object" || request === null) fail("not an object");
	const { id, theme, kind, prompt, size, keyColour, reference, spec } = request;
	if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
		fail("id must be a filename-safe string");
	}
	if (typeof theme !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(theme)) {
		fail("theme must be a lowercase slug");
	}
	if (!KINDS.has(kind)) fail(`kind must be one of ${[...KINDS].join(", ")}`);
	if (typeof prompt !== "string" || prompt.trim().length === 0) fail("prompt must be a non-empty string");
	if (typeof size !== "string" || !/^\d+:\d+$|^\d+x\d+$/.test(size)) {
		fail("size must be an aspect ratio like 16:9 or a pixel size like 1024x1024");
	}
	if (keyColour !== undefined && !/^#[0-9a-fA-F]{6}$/.test(keyColour)) fail("keyColour must be #rrggbb");
	if (reference !== undefined && typeof reference !== "string") fail("reference must be a path");
	if (typeof spec !== "string" || spec.trim().length === 0) fail("spec must be a path to a spec file");
	return { id, theme, kind, prompt, size, keyColour, reference, spec };
}

export function validateManifestRow(row) {
	if (!SOURCES.has(row.source)) throw new Error(`unknown source ${row.source}`);
	if (!VERDICTS.has(row.verdict)) throw new Error(`unknown verdict ${row.verdict}`);
	return row;
}

export function aspectRatio(size) {
	if (size.includes(":")) return size;
	const [w, h] = size.split("x").map(Number);
	const g = gcd(w, h);
	return `${String(w / g)}:${String(h / g)}`;
}

function gcd(a, b) {
	return b === 0 ? a : gcd(b, a % b);
}
