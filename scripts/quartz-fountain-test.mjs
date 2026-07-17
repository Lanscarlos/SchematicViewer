import assert from "assert";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { gunzipSync } from "zlib";
import { normalizeSchematic, parseNbt } from "../src/nbt.js";
import { generateQuartzFountain } from "./generate-quartz-fountain.mjs";
import { encodeSchematic } from "./lib/schematic-writer.mjs";
import { ALLOWED_BLOCK_IDS, CENTER, PILLAR_CENTERS, buildQuartzFountain } from "./lib/quartz-fountain.mjs";

const fountain = buildQuartzFountain();
assert.deepStrictEqual([fountain.width, fountain.height, fountain.length], [35, 24, 35]);
assert.strictEqual(fountain.blocks.length, 35 * 24 * 35);
assert.strictEqual(PILLAR_CENTERS.length, 12);

const baseId = (state) => state.split("[")[0];
for (let y = 0; y < fountain.height; y += 1) {
  for (let z = 0; z < fountain.length; z += 1) {
    for (let x = 0; x < fountain.width; x += 1) {
      const state = baseId(fountain.get(x, y, z));
      assert.strictEqual(state, baseId(fountain.get(34 - x, y, z)), `X symmetry at ${x},${y},${z}`);
      assert.strictEqual(state, baseId(fountain.get(x, y, 34 - z)), `Z symmetry at ${x},${y},${z}`);
      assert.ok(ALLOWED_BLOCK_IDS.has(state), `Unexpected material ${state}`);
    }
  }
}

for (const [pillarX, pillarZ] of PILLAR_CENTERS) {
  for (let y = 7; y <= 12; y += 1) {
    assert.strictEqual(baseId(fountain.get(pillarX, y, pillarZ)), "minecraft:quartz_pillar");
  }
}

assert.strictEqual(fountain.get(CENTER, 19, 7), "minecraft:chiseled_quartz_block", "north pediment apex");
assert.strictEqual(fountain.get(CENTER, 19, 27), "minecraft:chiseled_quartz_block", "south pediment apex");
assert.strictEqual(fountain.get(7, 19, CENTER), "minecraft:chiseled_quartz_block", "west pediment apex");
assert.strictEqual(fountain.get(27, 19, CENTER), "minecraft:chiseled_quartz_block", "east pediment apex");
assert.strictEqual(fountain.get(9, 16, 6), "minecraft:air", "north pediment must not overhang its facade");

for (let distance = 0; distance <= 11; distance += 1) {
  for (let offset = -2; offset <= 2; offset += 1) {
    for (let y = 4; y <= 7; y += 1) {
      assert.strictEqual(fountain.get(17 + offset, y, distance), "minecraft:air", "north entrance clearance");
      assert.strictEqual(fountain.get(17 + offset, y, 34 - distance), "minecraft:air", "south entrance clearance");
      assert.strictEqual(fountain.get(distance, y, 17 + offset), "minecraft:air", "west entrance clearance");
      assert.strictEqual(fountain.get(34 - distance, y, 17 + offset), "minecraft:air", "east entrance clearance");
    }
  }
}

for (let coordinate = 0; coordinate < 35; coordinate += 1) {
  for (let y = 0; y < 24; y += 1) {
    assert.notStrictEqual(baseId(fountain.get(0, y, coordinate)), "minecraft:water");
    assert.notStrictEqual(baseId(fountain.get(34, y, coordinate)), "minecraft:water");
    assert.notStrictEqual(baseId(fountain.get(coordinate, y, 0)), "minecraft:water");
    assert.notStrictEqual(baseId(fountain.get(coordinate, y, 34)), "minecraft:water");
  }
}

const encoded = encodeSchematic(fountain);
const uncompressed = gunzipSync(encoded);
const buffer = uncompressed.buffer.slice(uncompressed.byteOffset, uncompressed.byteOffset + uncompressed.byteLength);
const roundTrip = normalizeSchematic(await parseNbt(buffer));
assert.deepStrictEqual([roundTrip.width, roundTrip.height, roundTrip.length], [35, 24, 35]);
assert.strictEqual(roundTrip.dataVersion, 4671);
assert.ok(roundTrip.visibleBlocks > 2500);
assert.ok(roundTrip.palette.includes("minecraft:water[level=0]"));
assert.ok(roundTrip.palette.includes("minecraft:sea_lantern"));

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "quartz-fountain-"));
try {
  const outputPath = path.join(temporaryDirectory, "fountain.schem");
  const summary = await generateQuartzFountain(outputPath);
  const generated = await readFile(outputPath);
  assert.ok(generated.length > 0);
  assert.strictEqual(summary.outputPath, outputPath);
  assert.strictEqual(summary.dimensions, "35 × 35 × 24");
  assert.ok(summary.totalBlocks > 2500);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log("Quartz fountain geometry tests passed");
