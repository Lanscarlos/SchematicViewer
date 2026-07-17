import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { normalizeSchematic, parseBlockState, parseNbt } from "../src/nbt.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const assertEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const bytes = [];
const writeShort = (value) => bytes.push((value >>> 8) & 0xff, value & 0xff);
const writeInt = (value) => bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
const writeString = (value) => {
  const encoded = Buffer.from(value, "utf8");
  writeShort(encoded.length);
  bytes.push(...encoded);
};
const writeNamedTag = (type, name) => {
  bytes.push(type);
  writeString(name);
};

bytes.push(10);
writeString("");
writeNamedTag(3, "Version");
writeInt(2);
writeNamedTag(3, "DataVersion");
writeInt(4189);
writeNamedTag(2, "Width");
writeShort(1);
writeNamedTag(2, "Height");
writeShort(1);
writeNamedTag(2, "Length");
writeShort(1);
writeNamedTag(10, "Palette");
writeNamedTag(3, "minecraft:air");
writeInt(0);
writeNamedTag(3, "minecraft:stone");
writeInt(1);
bytes.push(0);
writeNamedTag(7, "BlockData");
writeInt(1);
bytes.push(1);
bytes.push(0);

const buffer = Uint8Array.from(bytes).buffer;
const parsed = await parseNbt(buffer);
const schematic = normalizeSchematic(parsed);

assertEqual([schematic.width, schematic.height, schematic.length], [1, 1, 1], "v2 dimensions");
assertEqual(schematic.visibleBlocks, 1, "v2 visible blocks");
assertEqual(schematic.palette[schematic.indices[0]], "minecraft:stone", "v2 palette");
assertEqual(parseBlockState("minecraft:oak_stairs[facing=north,half=bottom]"), {
  id: "minecraft:oak_stairs",
  properties: { facing: "north", half: "bottom" },
  raw: "minecraft:oak_stairs[facing=north,half=bottom]",
}, "block state parser");

const v3 = normalizeSchematic({
  Version: 3,
  DataVersion: 4189,
  Width: 1,
  Height: 1,
  Length: 1,
  Blocks: {
    Palette: { "minecraft:oak_planks": 0 },
    Data: Uint8Array.of(0),
  },
});
assertEqual(v3.palette[0], "minecraft:oak_planks", "v3 palette");
assertEqual(v3.visibleBlocks, 1, "v3 visible blocks");

const sampleExpectations = [
  {
    file: "single-stone-v2.schem",
    version: 2,
    size: [1, 1, 1],
    visibleBlocks: 1,
    palette: ["minecraft:stone"],
  },
  {
    file: "palette-checker-v2.schem",
    version: 2,
    size: [4, 3, 4],
    visibleBlocks: 32,
    palette: ["minecraft:air", "minecraft:stone", "minecraft:oak_planks", "minecraft:glass"],
  },
  {
    file: "mini-structure-v3.schem",
    version: 3,
    size: [5, 4, 5],
    visibleBlocks: 42,
    palette: [
      "minecraft:air",
      "minecraft:cobblestone",
      "minecraft:oak_log[axis=y]",
      "minecraft:oak_planks",
      "minecraft:glass",
      "minecraft:oak_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]",
    ],
  },
];

for (const expected of sampleExpectations) {
  const file = await readFile(path.join(projectRoot, "samples", expected.file));
  const uncompressed = gunzipSync(file);
  const parsedSample = await parseNbt(
    uncompressed.buffer.slice(uncompressed.byteOffset, uncompressed.byteOffset + uncompressed.byteLength),
  );
  const normalized = normalizeSchematic(parsedSample);
  assertEqual(normalized.version, expected.version, `${expected.file} version`);
  assertEqual([normalized.width, normalized.height, normalized.length], expected.size, `${expected.file} dimensions`);
  assertEqual(normalized.visibleBlocks, expected.visibleBlocks, `${expected.file} visible blocks`);
  assertEqual(normalized.palette, expected.palette, `${expected.file} palette`);
}

console.log("NBT and schematic smoke tests passed");
