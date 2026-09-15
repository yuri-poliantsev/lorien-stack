import sharp from "sharp";

export function parseHex(hex) {
	const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
	if (match === null) throw new Error(`key colour must be #rrggbb, got ${hex}`);
	const value = Number.parseInt(match[1], 16);
	return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function keyPixels({ data, width, height, key, tolerance }) {
	const out = Buffer.from(data);
	let keyed = 0;
	for (let index = 0; index < width * height; index += 1) {
		const at = index * 4;
		const dr = out[at] - key.r;
		const dg = out[at + 1] - key.g;
		const db = out[at + 2] - key.b;
		if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) {
			out[at] = 0;
			out[at + 1] = 0;
			out[at + 2] = 0;
			out[at + 3] = 0;
			keyed += 1;
		} else {
			out[at + 3] = 255;
		}
	}
	return { data: out, keyed };
}

export function quantise({ data, width, height, levels }) {
	if (levels < 2) throw new Error(`levels must be 2 or more, got ${String(levels)}`);
	const step = 255 / (levels - 1);
	const out = Buffer.from(data);
	for (let index = 0; index < width * height; index += 1) {
		const at = index * 4;
		if (out[at + 3] === 0) continue;
		for (let channel = 0; channel < 3; channel += 1) {
			out[at + channel] = Math.round(Math.round(out[at + channel] / step) * step);
		}
	}
	return out;
}

// Nearest-neighbour by cell centre rather than sharp's resize: keying leaves a
// hard alpha edge and any filtered kernel would smear it back into fringe.
export function downsampleNearest({ data, width, height, grid }) {
	if (grid < 1) throw new Error(`grid must be 1 or more, got ${String(grid)}`);
	const outWidth = Math.max(1, Math.round(width / grid));
	const outHeight = Math.max(1, Math.round(height / grid));
	const out = Buffer.alloc(outWidth * outHeight * 4);
	for (let y = 0; y < outHeight; y += 1) {
		const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / outHeight));
		for (let x = 0; x < outWidth; x += 1) {
			const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / outWidth));
			data.copy(out, (y * outWidth + x) * 4, (sourceY * width + sourceX) * 4, (sourceY * width + sourceX) * 4 + 4);
		}
	}
	return { data: out, width: outWidth, height: outHeight };
}

export async function keyImage({ input, output, key, tolerance, grid, levels = 16 }) {
	const source = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const { width, height } = source.info;
	const keyed = keyPixels({ data: source.data, width, height, key: parseHex(key), tolerance });
	const quantised = quantise({ data: keyed.data, width, height, levels });
	const small = downsampleNearest({ data: quantised, width, height, grid });
	await sharp(small.data, { raw: { width: small.width, height: small.height, channels: 4 } })
		.png({ palette: true, compressionLevel: 9 })
		.toFile(output);
	const opaque = countOpaque(small.data);
	return {
		sourceWidth: width,
		sourceHeight: height,
		width: small.width,
		height: small.height,
		keyedSourcePixels: keyed.keyed,
		opaquePixels: opaque,
		transparentPixels: small.width * small.height - opaque,
	};
}

function countOpaque(data) {
	let opaque = 0;
	for (let at = 3; at < data.length; at += 4) {
		if (data[at] !== 0) opaque += 1;
	}
	return opaque;
}
