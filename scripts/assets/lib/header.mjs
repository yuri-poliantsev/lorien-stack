import { readFileSync } from "node:fs";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readImageHeader(file) {
	const bytes = readFileSync(file);
	if (bytes.length < 24) throw new Error(`${file}: only ${String(bytes.length)} bytes, not an image`);
	if (bytes.subarray(0, 8).equals(PNG_MAGIC)) return png(bytes, file);
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes, file);
	throw new Error(`${file}: no PNG or JPEG signature (first bytes ${bytes.subarray(0, 4).toString("hex")})`);
}

function png(bytes, file) {
	if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error(`${file}: PNG without IHDR first`);
	const colourType = bytes[25];
	// Colour types 4 and 6 carry an alpha sample per pixel, but a palette PNG spends its
	// transparency in a tRNS chunk instead, which is what `assets key` emits after
	// quantisation. Reading only the colour type called those images opaque.
	const transparency = hasChunk(bytes, "tRNS");
	return {
		format: "png",
		width: bytes.readUInt32BE(16),
		height: bytes.readUInt32BE(20),
		bitDepth: bytes[24],
		colourType,
		hasAlpha: colourType === 4 || colourType === 6 || transparency,
		transparency,
		chroma: "none",
	};
}

// Walk the chunk chain to the first IDAT; tRNS is required to appear before it.
function hasChunk(bytes, wanted) {
	let offset = 8;
	while (offset + 8 <= bytes.length) {
		const length = bytes.readUInt32BE(offset);
		const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
		if (type === wanted) return true;
		if (type === "IDAT" || type === "IEND") return false;
		offset += 12 + length;
	}
	return false;
}

// Walk the JPEG marker chain to the first frame header; the component
// sampling factors are the only place the 4:2:0 subsampling shows up, and
// the plan needs that recorded because both image sources emit 4:2:0 JPEG
// under a .png filename.
function jpeg(bytes, file) {
	let offset = 2;
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = bytes[offset + 1];
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			offset += 2;
			continue;
		}
		const length = bytes.readUInt16BE(offset + 2);
		const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isFrame) {
			const start = offset + 4;
			const height = bytes.readUInt16BE(start + 1);
			const width = bytes.readUInt16BE(start + 3);
			const components = bytes[start + 5];
			const factors = [];
			for (let c = 0; c < components; c += 1) {
				const sampling = bytes[start + 7 + c * 3];
				factors.push(`${String(sampling >> 4)}x${String(sampling & 0x0f)}`);
			}
			return {
				format: "jpeg",
				width,
				height,
				bitDepth: bytes[start],
				colourType: components === 1 ? "greyscale" : "ycbcr",
				hasAlpha: false,
				chroma: chromaName(factors),
			};
		}
		offset += 2 + length;
	}
	throw new Error(`${file}: JPEG with no frame header`);
}

function chromaName(factors) {
	if (factors.length !== 3) return factors.join(",");
	if (factors[0] === "2x2") return "4:2:0";
	if (factors[0] === "2x1") return "4:2:2";
	if (factors[0] === "1x1") return "4:4:4";
	return factors.join(",");
}

export function describeHeader(header) {
	return `${header.format} ${String(header.width)}x${String(header.height)} chroma=${header.chroma} alpha=${String(header.hasAlpha)}`;
}
