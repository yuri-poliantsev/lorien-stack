import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { downsampleNearest, keyImage, keyPixels, parseHex, quantise } from "../lib/key.mjs";

const SIDE = 64;
const GRID = 8;
const SPRITE_AT = 16;
const SPRITE_SIDE = 16;
const KEY = "#ff00ec";
const BACKGROUND = { r: 255, g: 0, b: 236 };
const SPRITE = { r: 34, g: 139, b: 34 };

// The generator returns a magenta that drifts a few points per pixel, so the
// fixture jitters the key colour deterministically rather than painting it flat.
function syntheticSprite() {
	const data = Buffer.alloc(SIDE * SIDE * 4);
	for (let y = 0; y < SIDE; y += 1) {
		for (let x = 0; x < SIDE; x += 1) {
			const at = (y * SIDE + x) * 4;
			const inSprite =
				x >= SPRITE_AT && x < SPRITE_AT + SPRITE_SIDE && y >= SPRITE_AT && y < SPRITE_AT + SPRITE_SIDE;
			const jitter = ((x * 7 + y * 13) % 11) - 5;
			const colour = inSprite ? SPRITE : BACKGROUND;
			data[at] = clamp(colour.r + (inSprite ? 0 : jitter));
			data[at + 1] = clamp(colour.g + (inSprite ? 0 : Math.abs(jitter)));
			data[at + 2] = clamp(colour.b + (inSprite ? 0 : jitter));
			data[at + 3] = 255;
		}
	}
	return data;
}

function clamp(value) {
	return Math.max(0, Math.min(255, value));
}

test("parseHex reads the key colour channels", () => {
	assert.deepEqual(parseHex(KEY), { r: 255, g: 0, b: 236 });
	assert.deepEqual(parseHex("00ff00"), { r: 0, g: 255, b: 0 });
	assert.throws(() => parseHex("#abc"), /key colour must be #rrggbb/);
});

test("keyPixels clears the jittered background and keeps the sprite opaque", () => {
	const result = keyPixels({
		data: syntheticSprite(),
		width: SIDE,
		height: SIDE,
		key: parseHex(KEY),
		tolerance: 24,
	});
	assert.equal(result.keyed, SIDE * SIDE - SPRITE_SIDE * SPRITE_SIDE, "every non-sprite pixel is keyed out");
	const spriteAt = ((SPRITE_AT + 1) * SIDE + SPRITE_AT + 1) * 4;
	assert.equal(result.data[spriteAt + 3], 255, "sprite pixel stays opaque");
	assert.deepEqual([...result.data.subarray(0, 4)], [0, 0, 0, 0], "top-left background pixel is fully transparent");
});

test("keyPixels with a tolerance below the drift leaves background opaque", () => {
	const result = keyPixels({
		data: syntheticSprite(),
		width: SIDE,
		height: SIDE,
		key: parseHex(KEY),
		tolerance: 1,
	});
	assert.equal(result.keyed, 349, "only pixels within 1 of the key colour are cleared at tolerance 1");
});

test("quantise snaps opaque channels to the 16-level ladder and leaves keyed pixels alone", () => {
	const keyed = keyPixels({
		data: syntheticSprite(),
		width: SIDE,
		height: SIDE,
		key: parseHex(KEY),
		tolerance: 24,
	});
	const out = quantise({ data: keyed.data, width: SIDE, height: SIDE, levels: 16 });
	const spriteAt = ((SPRITE_AT + 1) * SIDE + SPRITE_AT + 1) * 4;
	assert.deepEqual([...out.subarray(spriteAt, spriteAt + 4)], [34, 136, 34, 255]);
	assert.deepEqual([...out.subarray(0, 4)], [0, 0, 0, 0]);
	assert.throws(() => quantise({ data: out, width: SIDE, height: SIDE, levels: 1 }), /levels must be 2 or more/);
});

test("downsampleNearest lands the sprite on exactly the cells it covers", () => {
	const keyed = keyPixels({
		data: syntheticSprite(),
		width: SIDE,
		height: SIDE,
		key: parseHex(KEY),
		tolerance: 24,
	});
	const small = downsampleNearest({ data: keyed.data, width: SIDE, height: SIDE, grid: GRID });
	assert.equal(small.width, 8);
	assert.equal(small.height, 8);
	const opaqueCells = [];
	for (let y = 0; y < small.height; y += 1) {
		for (let x = 0; x < small.width; x += 1) {
			if (small.data[(y * small.width + x) * 4 + 3] !== 0) opaqueCells.push(`${String(x)},${String(y)}`);
		}
	}
	assert.deepEqual(opaqueCells, ["2,2", "3,2", "2,3", "3,3"]);
});

test("keyImage writes a real PNG with alpha at the true pixel grid", async () => {
	const dir = mkdtempSync(path.join(tmpdir(), "assets-key-"));
	const input = path.join(dir, "sprite.jpg");
	const output = path.join(dir, "sprite.png");
	await sharp(syntheticSprite(), { raw: { width: SIDE, height: SIDE, channels: 4 } })
		.jpeg({ quality: 100, chromaSubsampling: "4:2:0" })
		.toFile(input);

	const stats = await keyImage({ input, output, key: KEY, tolerance: 40, grid: GRID, levels: 16 });
	assert.equal(stats.sourceWidth, SIDE);
	assert.equal(stats.width, 8);
	assert.equal(stats.height, 8);
	assert.equal(stats.opaquePixels, 4, "the 16px sprite fills exactly 4 cells of the 8px grid");
	assert.equal(stats.transparentPixels, 60);

	const written = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	assert.equal(written.info.width, 8);
	assert.equal(written.info.height, 8);
	assert.equal(written.data[3], 0, "cell 0,0 is transparent in the written PNG");
	assert.equal(written.data[(2 * 8 + 2) * 4 + 3], 255, "cell 2,2 is opaque in the written PNG");
	const metadata = await sharp(output).metadata();
	assert.equal(metadata.format, "png");
	assert.equal(metadata.hasAlpha, true);
});
