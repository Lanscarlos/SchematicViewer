import { gzipSync } from "zlib";

const TAG = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
};

export const DATA_VERSION = 4671;

class NbtWriter {
  constructor() {
    this.parts = [];
  }

  pushByte(value) {
    const buffer = Buffer.allocUnsafe(1);
    buffer.writeUInt8(value);
    this.parts.push(buffer);
  }

  pushShort(value) {
    const buffer = Buffer.allocUnsafe(2);
    buffer.writeInt16BE(value);
    this.parts.push(buffer);
  }

  pushUnsignedShort(value) {
    const buffer = Buffer.allocUnsafe(2);
    buffer.writeUInt16BE(value);
    this.parts.push(buffer);
  }

  pushInt(value) {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeInt32BE(value);
    this.parts.push(buffer);
  }

  pushLong(value) {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigInt64BE(BigInt(value));
    this.parts.push(buffer);
  }

  stringPayload(value) {
    const encoded = Buffer.from(value, "utf8");
    if (encoded.length > 0xffff) throw new Error("NBT string exceeds 65,535 UTF-8 bytes");
    this.pushUnsignedShort(encoded.length);
    this.parts.push(encoded);
  }

  named(type, name, writePayload) {
    this.pushByte(type);
    this.stringPayload(name);
    writePayload();
  }

  compound(name, writeChildren) {
    this.named(TAG.COMPOUND, name, () => {
      writeChildren();
      this.pushByte(TAG.END);
    });
  }

  short(name, value) {
    this.named(TAG.SHORT, name, () => this.pushShort(value));
  }

  int(name, value) {
    this.named(TAG.INT, name, () => this.pushInt(value));
  }

  long(name, value) {
    this.named(TAG.LONG, name, () => this.pushLong(value));
  }

  string(name, value) {
    this.named(TAG.STRING, name, () => this.stringPayload(value));
  }

  byteArray(name, values) {
    if (values.length > 0x7fffffff) throw new Error("NBT byte array exceeds signed-int length");
    this.named(TAG.BYTE_ARRAY, name, () => {
      this.pushInt(values.length);
      this.parts.push(Buffer.from(values));
    });
  }

  intArray(name, values) {
    this.named(TAG.INT_ARRAY, name, () => {
      this.pushInt(values.length);
      for (const value of values) this.pushInt(value);
    });
  }

  emptyList(name, childType) {
    this.named(TAG.LIST, name, () => {
      this.pushByte(childType);
      this.pushInt(0);
    });
  }

  toBuffer() {
    return Buffer.concat(this.parts);
  }
}

export function encodeVarInt(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("VarInt value must be a non-negative integer");
  }

  const bytes = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0);
  return Uint8Array.from(bytes);
}

export function collectPalette(blocks) {
  const palette = new Map();
  const indices = [];
  for (const state of blocks) {
    if (typeof state !== "string" || !state.startsWith("minecraft:")) {
      throw new Error(`Invalid block state: ${state}`);
    }
    if (!palette.has(state)) palette.set(state, palette.size);
    indices.push(palette.get(state));
  }
  return { palette, indices };
}

export function encodeSchematic({ width, height, length, blocks }) {
  if (![width, height, length].every((value) => Number.isInteger(value) && value > 0 && value <= 32767)) {
    throw new Error("Schematic dimensions must be positive signed shorts");
  }
  if (blocks.length !== width * height * length) {
    throw new Error("Block volume does not match dimensions");
  }

  const { palette, indices } = collectPalette(blocks);
  const blockData = Buffer.concat(indices.map((value) => Buffer.from(encodeVarInt(value))));
  const writer = new NbtWriter();
  writer.compound("Schematic", () => {
    writer.int("Version", 3);
    writer.int("DataVersion", DATA_VERSION);
    writer.short("Width", width);
    writer.short("Height", height);
    writer.short("Length", length);
    writer.intArray("Offset", [0, 0, 0]);
    writer.compound("Metadata", () => {
      writer.string("Name", "Quartz Pavilion Fountain");
      writer.string("Author", "Codex");
      writer.long("Date", 0n);
    });
    writer.compound("Blocks", () => {
      writer.compound("Palette", () => {
        for (const [state, id] of palette) writer.int(state, id);
      });
      writer.byteArray("Data", blockData);
      writer.emptyList("BlockEntities", TAG.COMPOUND);
    });
    writer.emptyList("Entities", TAG.COMPOUND);
  });

  return gzipSync(writer.toBuffer(), { level: 9, mtime: 0 });
}
