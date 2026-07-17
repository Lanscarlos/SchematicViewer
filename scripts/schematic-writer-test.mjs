import assert from "assert";
import { gunzipSync } from "zlib";
import { normalizeSchematic, parseNbt } from "../src/nbt.js";
import { encodeSchematic, encodeVarInt } from "./lib/schematic-writer.mjs";

assert.deepStrictEqual([...encodeVarInt(0)], [0]);
assert.deepStrictEqual([...encodeVarInt(127)], [127]);
assert.deepStrictEqual([...encodeVarInt(128)], [128, 1]);
assert.deepStrictEqual([...encodeVarInt(300)], [172, 2]);
assert.throws(() => encodeVarInt(-1), /non-negative integer/);

const fixture = {
  width: 2,
  height: 1,
  length: 2,
  blocks: [
    "minecraft:air",
    "minecraft:quartz_block",
    "minecraft:water[level=0]",
    "minecraft:smooth_quartz",
  ],
};

const first = encodeSchematic(fixture);
const second = encodeSchematic(fixture);
assert.deepStrictEqual(first, second, "gzip output must be deterministic");
assert.strictEqual(gunzipSync(first)[0], 10, "root tag must be a compound");

const uncompressed = gunzipSync(first);
const arrayBuffer = uncompressed.buffer.slice(uncompressed.byteOffset, uncompressed.byteOffset + uncompressed.byteLength);
const schematic = normalizeSchematic(await parseNbt(arrayBuffer));
assert.deepStrictEqual([schematic.width, schematic.height, schematic.length], [2, 1, 2]);
assert.strictEqual(schematic.version, 3);
assert.strictEqual(schematic.dataVersion, 4671);
assert.deepStrictEqual([...schematic.indices], [0, 1, 2, 3]);
assert.strictEqual(schematic.palette[2], "minecraft:water[level=0]");

console.log("Schematic writer tests passed");
