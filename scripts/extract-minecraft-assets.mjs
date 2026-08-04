#!/usr/bin/env node
// Cross-platform replacement for extract-minecraft-assets.ps1.
// Extracts every file under `assets/minecraft/` from the Minecraft client jar
// into `public/minecraft/`, using only Node built-ins (fs, zlib) so it runs on
// Linux, macOS and Windows without any external tooling.
//
// Usage:
//   node scripts/extract-minecraft-assets.mjs [path/to/client.jar]
//
// The jar path defaults to `.minecraft/versions/<VERSION>/<VERSION>.jar` at the
// project root, or can be overridden with the MINECRAFT_JAR env var or a CLI
// argument. Set MINECRAFT_VERSION to target a different version directory.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const version = process.env.MINECRAFT_VERSION ?? "1.21.11";

const jarPath = resolve(
  process.argv[2] ??
    process.env.MINECRAFT_JAR ??
    join(projectRoot, ".minecraft", "versions", version, `${version}.jar`),
);
const outputRoot = join(projectRoot, "public", "minecraft");
const ASSET_PREFIX = "assets/minecraft/";

if (!existsSync(jarPath)) {
  console.error(`Minecraft ${version} client jar not found: ${jarPath}`);
  console.error(
    "Pass the jar path as an argument or set MINECRAFT_JAR / MINECRAFT_VERSION.",
  );
  process.exit(1);
}

// --- Minimal ZIP reader (central directory + local headers, deflate/stored) ---

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buffer) {
  // The EOCD record lives at the end of the file, followed only by an optional
  // comment (max 65535 bytes). Scan backwards for its signature.
  const minEnd = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minEnd; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("End of central directory record not found (not a zip/jar?)");
}

function readCentralDirectory(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  if (offset === 0xffffffff || totalEntries === 0xffff) {
    throw new Error("ZIP64 archives are not supported by this extractor.");
  }

  const entries = [];
  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`Bad central directory header at offset ${offset}`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString(
      "utf8",
      offset + 46,
      offset + 46 + nameLength,
    );
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntryData(buffer, entry) {
  // The local header repeats name/extra lengths, which may differ from the
  // central directory, so we must read them here to find the data start.
  const { localOffset } = entry;
  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`Bad local file header for ${entry.name}`);
  }
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return compressed; // stored
  if (entry.method === 8) return inflateRawSync(compressed); // deflate
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

// --- Extraction ---

const buffer = readFileSync(jarPath);
const entries = readCentralDirectory(buffer);
const assetEntries = entries.filter(
  (entry) => entry.name.startsWith(ASSET_PREFIX) && !entry.name.endsWith("/"),
);

mkdirSync(outputRoot, { recursive: true });

let written = 0;
for (const entry of assetEntries) {
  const targetPath = join(outputRoot, ...entry.name.split("/"));
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, readEntryData(buffer, entry));
  written++;
}

console.log(`Extracted ${written} Minecraft assets to ${outputRoot}`);
