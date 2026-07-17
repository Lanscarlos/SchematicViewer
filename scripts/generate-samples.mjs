import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { normalizeSchematic, parseNbt } from "../src/nbt.js";

const TAG = {
  END: 0,
  SHORT: 2,
  INT: 3,
  BYTE_ARRAY: 7,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
};

const DATA_VERSION = 4189;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samplesDirectory = path.join(projectRoot, "samples");

class NbtWriter {
  constructor() {
    this.bytes = [];
  }

  byte(value) {
    this.bytes.push(value & 0xff);
  }

  short(value) {
    this.bytes.push((value >>> 8) & 0xff, value & 0xff);
  }

  int(value) {
    this.bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  }

  string(value) {
    const encoded = Buffer.from(value, "utf8");
    this.short(encoded.length);
    this.bytes.push(...encoded);
  }

  named(type, name, writePayload) {
    this.byte(type);
    this.string(name);
    writePayload();
  }

  shortTag(name, value) {
    this.named(TAG.SHORT, name, () => this.short(value));
  }

  intTag(name, value) {
    this.named(TAG.INT, name, () => this.int(value));
  }

  compound(name, writeEntries) {
    this.named(TAG.COMPOUND, name, () => {
      writeEntries();
      this.byte(TAG.END);
    });
  }

  byteArray(name, values) {
    this.named(TAG.BYTE_ARRAY, name, () => {
      this.int(values.length);
      this.bytes.push(...values);
    });
  }

  intArray(name, values) {
    this.named(TAG.INT_ARRAY, name, () => {
      this.int(values.length);
      for (const value of values) this.int(value);
    });
  }

  emptyCompoundList(name) {
    this.named(TAG.LIST, name, () => {
      this.byte(TAG.COMPOUND);
      this.int(0);
    });
  }

  root(name, writeEntries) {
    this.byte(TAG.COMPOUND);
    this.string(name);
    writeEntries();
    this.byte(TAG.END);
    return Buffer.from(this.bytes);
  }
}

function encodeVarInts(values) {
  const bytes = [];
  for (const original of values) {
    let value = original >>> 0;
    do {
      let byte = value & 0x7f;
      value >>>= 7;
      if (value !== 0) byte |= 0x80;
      bytes.push(byte);
    } while (value !== 0);
  }
  return bytes;
}

function createVolume(width, height, length, fill = 0) {
  return new Array(width * height * length).fill(fill);
}

function setBlock(indices, width, length, x, y, z, paletteId) {
  indices[x + z * width + y * width * length] = paletteId;
}

function singleStoneV2() {
  return {
    file: "single-stone-v2.schem",
    version: 2,
    width: 1,
    height: 1,
    length: 1,
    palette: ["minecraft:stone"],
    indices: [0],
    visibleBlocks: 1,
  };
}

function paletteCheckerV2() {
  const width = 4;
  const height = 3;
  const length = 4;
  const indices = createVolume(width, height, length);

  for (let z = 0; z < length; z += 1) {
    for (let x = 0; x < width; x += 1) {
      setBlock(indices, width, length, x, 0, z, 1);
      setBlock(indices, width, length, x, 1, z, (x + z) % 2 === 0 ? 2 : 3);
    }
  }

  return {
    file: "palette-checker-v2.schem",
    version: 2,
    width,
    height,
    length,
    palette: ["minecraft:air", "minecraft:stone", "minecraft:oak_planks", "minecraft:glass"],
    indices,
    visibleBlocks: 32,
  };
}

function miniStructureV3() {
  const width = 5;
  const height = 4;
  const length = 5;
  const indices = createVolume(width, height, length);

  for (let z = 0; z < length; z += 1) {
    for (let x = 0; x < width; x += 1) setBlock(indices, width, length, x, 0, z, 1);
  }

  for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]]) {
    for (let y = 1; y < height; y += 1) setBlock(indices, width, length, x, y, z, 2);
  }

  for (let x = 1; x <= 3; x += 1) setBlock(indices, width, length, x, 3, 0, 3);
  setBlock(indices, width, length, 2, 2, 4, 4);
  setBlock(indices, width, length, 2, 1, 0, 5);

  return {
    file: "mini-structure-v3.schem",
    version: 3,
    width,
    height,
    length,
    palette: [
      "minecraft:air",
      "minecraft:cobblestone",
      "minecraft:oak_log[axis=y]",
      "minecraft:oak_planks",
      "minecraft:glass",
      "minecraft:oak_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]",
    ],
    indices,
    visibleBlocks: 42,
  };
}

function writePalette(writer, palette) {
  writer.compound("Palette", () => {
    for (const [paletteId, state] of palette.entries()) writer.intTag(state, paletteId);
  });
}

function serializeSample(sample) {
  const writer = new NbtWriter();
  const blockData = encodeVarInts(sample.indices);

  return writer.root("Schematic", () => {
    writer.intTag("Version", sample.version);
    writer.intTag("DataVersion", DATA_VERSION);
    writer.shortTag("Width", sample.width);
    writer.shortTag("Height", sample.height);
    writer.shortTag("Length", sample.length);
    writer.intArray("Offset", [0, 0, 0]);
    writer.compound("Metadata", () => {});

    if (sample.version === 2) {
      writer.intTag("PaletteMax", sample.palette.length);
      writePalette(writer, sample.palette);
      writer.byteArray("BlockData", blockData);
      writer.emptyCompoundList("BlockEntities");
    } else {
      writer.compound("Blocks", () => {
        writePalette(writer, sample.palette);
        writer.byteArray("Data", blockData);
        writer.emptyCompoundList("BlockEntities");
      });
    }

    writer.emptyCompoundList("Entities");
  });
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

async function validateOutput(sample, compressed) {
  const uncompressed = gunzipSync(compressed);
  const parsed = await parseNbt(
    uncompressed.buffer.slice(uncompressed.byteOffset, uncompressed.byteOffset + uncompressed.byteLength),
  );
  const normalized = normalizeSchematic(parsed);

  assertEqual(normalized.version, sample.version, `${sample.file} version`);
  assertEqual(
    [normalized.width, normalized.height, normalized.length],
    [sample.width, sample.height, sample.length],
    `${sample.file} dimensions`,
  );
  assertEqual(normalized.visibleBlocks, sample.visibleBlocks, `${sample.file} visible blocks`);
  assertEqual(normalized.palette, sample.palette, `${sample.file} palette`);
}

const samples = [singleStoneV2(), paletteCheckerV2(), miniStructureV3()];
await mkdir(samplesDirectory, { recursive: true });

for (const sample of samples) {
  const uncompressed = serializeSample(sample);
  const compressed = gzipSync(uncompressed, { level: 9, mtime: 0 });
  await validateOutput(sample, compressed);
  await writeFile(path.join(samplesDirectory, sample.file), compressed);
  console.log(`Generated ${sample.file} (${sample.width}×${sample.height}×${sample.length})`);
}

console.log(`Generated and validated ${samples.length} schematic samples`);
