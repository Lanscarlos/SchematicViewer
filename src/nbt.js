const TAG = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12,
};

class NbtReader {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.offset = 0;
    this.decoder = new TextDecoder();
  }

  ensure(length) {
    if (this.offset + length > this.bytes.length) {
      throw new Error("NBT 数据意外结束，文件可能已损坏");
    }
  }

  byte() {
    this.ensure(1);
    return this.view.getInt8(this.offset++);
  }

  unsignedByte() {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  short() {
    this.ensure(2);
    const value = this.view.getInt16(this.offset, false);
    this.offset += 2;
    return value;
  }

  unsignedShort() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return value;
  }

  int() {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, false);
    this.offset += 4;
    return value;
  }

  long() {
    this.ensure(8);
    const value = this.view.getBigInt64(this.offset, false);
    this.offset += 8;
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value.toString();
  }

  float() {
    this.ensure(4);
    const value = this.view.getFloat32(this.offset, false);
    this.offset += 4;
    return value;
  }

  double() {
    this.ensure(8);
    const value = this.view.getFloat64(this.offset, false);
    this.offset += 8;
    return value;
  }

  string() {
    const length = this.unsignedShort();
    this.ensure(length);
    const value = this.decoder.decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  payload(type) {
    switch (type) {
      case TAG.BYTE:
        return this.byte();
      case TAG.SHORT:
        return this.short();
      case TAG.INT:
        return this.int();
      case TAG.LONG:
        return this.long();
      case TAG.FLOAT:
        return this.float();
      case TAG.DOUBLE:
        return this.double();
      case TAG.BYTE_ARRAY: {
        const length = this.int();
        if (length < 0) throw new Error("NBT 字节数组长度无效");
        this.ensure(length);
        const value = this.bytes.slice(this.offset, this.offset + length);
        this.offset += length;
        return value;
      }
      case TAG.STRING:
        return this.string();
      case TAG.LIST: {
        const childType = this.unsignedByte();
        const length = this.int();
        if (length < 0) throw new Error("NBT 列表长度无效");
        return Array.from({ length }, () => this.payload(childType));
      }
      case TAG.COMPOUND: {
        const value = {};
        while (true) {
          const childType = this.unsignedByte();
          if (childType === TAG.END) break;
          const name = this.string();
          value[name] = this.payload(childType);
        }
        return value;
      }
      case TAG.INT_ARRAY: {
        const length = this.int();
        if (length < 0) throw new Error("NBT 整数数组长度无效");
        return Array.from({ length }, () => this.int());
      }
      case TAG.LONG_ARRAY: {
        const length = this.int();
        if (length < 0) throw new Error("NBT 长整数数组长度无效");
        return Array.from({ length }, () => this.long());
      }
      default:
        throw new Error(`不支持的 NBT 标签类型：${type}`);
    }
  }

  readRoot() {
    const type = this.unsignedByte();
    if (type !== TAG.COMPOUND) throw new Error("文件根节点不是 NBT Compound");
    this.string();
    return this.payload(type);
  }
}

async function decompress(buffer, format) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持压缩流解码，请使用新版 Chrome、Edge 或 Firefox");
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream(format));
  return new Response(stream).arrayBuffer();
}

export async function parseNbt(source) {
  let buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const header = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));

  if (header[0] === 0x1f && header[1] === 0x8b) {
    buffer = await decompress(buffer, "gzip");
  } else if (header.length === 2 && ((header[0] << 8) | header[1]) % 31 === 0) {
    buffer = await decompress(buffer, "deflate");
  }

  return new NbtReader(buffer).readRoot();
}

function decodeVarInts(bytes, expectedLength) {
  const values = new Uint32Array(expectedLength);
  let outputIndex = 0;
  let value = 0;
  let shift = 0;

  for (const byte of bytes) {
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      if (outputIndex >= expectedLength) break;
      values[outputIndex++] = value >>> 0;
      value = 0;
      shift = 0;
    } else {
      shift += 7;
      if (shift > 28) throw new Error("方块数据包含无效 VarInt");
    }
  }

  if (outputIndex !== expectedLength) {
    throw new Error(`方块数据不完整：期望 ${expectedLength} 项，实际 ${outputIndex} 项`);
  }
  return values;
}

export function normalizeSchematic(parsed) {
  const root = parsed.Schematic ?? parsed.schematic ?? parsed;
  const blocks = root.Blocks ?? root.blocks ?? root;
  const width = Number(root.Width ?? root.width);
  const height = Number(root.Height ?? root.height);
  const length = Number(root.Length ?? root.length);

  if (![width, height, length].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error("无法读取结构尺寸；目前支持 Sponge/WorldEdit .schem v2 与 v3");
  }

  const paletteObject = blocks.Palette ?? blocks.palette ?? root.Palette;
  const encodedBlocks = blocks.Data ?? blocks.data ?? blocks.BlockData ?? root.BlockData;
  if (!paletteObject || !encodedBlocks) {
    throw new Error("文件中缺少方块调色板或方块数据");
  }

  const palette = [];
  for (const [state, id] of Object.entries(paletteObject)) palette[Number(id)] = state;
  const volume = width * height * length;
  const indices = decodeVarInts(encodedBlocks, volume);
  const counts = new Map();
  let visibleBlocks = 0;

  for (const paletteId of indices) {
    const state = palette[paletteId] ?? "minecraft:air";
    counts.set(state, (counts.get(state) ?? 0) + 1);
    if (!isAir(state)) visibleBlocks += 1;
  }

  return {
    version: Number(root.Version ?? root.version ?? 0),
    dataVersion: Number(root.DataVersion ?? root.dataVersion ?? 0),
    width,
    height,
    length,
    volume,
    visibleBlocks,
    palette,
    indices,
    counts,
    offset: root.Offset ?? root.offset ?? [0, 0, 0],
    metadata: root.Metadata ?? root.metadata ?? {},
  };
}

export function parseBlockState(value) {
  const match = /^([^\[]+)(?:\[(.*)\])?$/.exec(value);
  const id = match?.[1] ?? value;
  const properties = {};
  if (match?.[2]) {
    for (const pair of match[2].split(",")) {
      const separator = pair.indexOf("=");
      if (separator > 0) properties[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
  }
  return { id: id.includes(":") ? id : `minecraft:${id}`, properties, raw: value };
}

export function isAir(state) {
  const id = typeof state === "string" ? state.split("[")[0] : state.id;
  return id === "minecraft:air" || id === "minecraft:cave_air" || id === "minecraft:void_air";
}
