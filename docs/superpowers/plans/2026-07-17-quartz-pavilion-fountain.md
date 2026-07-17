# Quartz Pavilion Fountain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and verify a deterministic `35 × 35 × 24` neoclassical quartz pavilion fountain as a Sponge Schematic v3 file.

**Architecture:** A geometry module builds an in-memory block volume with bounds checking and named construction stages. A separate NBT module converts that volume into a palette, VarInt block stream, Sponge v3 compound, and deterministic gzip file. A thin CLI writes the final artifact, while focused tests validate geometry, symmetry, materials, water containment, and round-trip parsing through the viewer.

**Tech Stack:** Node.js ES modules, Node built-ins (`assert`, `fs`, `path`, `url`, `zlib`), existing `src/nbt.js` parser, npm scripts.

---

## File Map

- Create `scripts/lib/schematic-writer.mjs`: palette collection, VarInt encoding, NBT serialization, deterministic gzip output.
- Create `scripts/lib/quartz-fountain.mjs`: bounded volume, geometry helpers, pavilion and fountain construction.
- Create `scripts/schematic-writer-test.mjs`: focused writer and parser round-trip tests.
- Create `scripts/quartz-fountain-test.mjs`: structural, symmetry, path, water, and material tests.
- Create `scripts/generate-quartz-fountain.mjs`: CLI that validates, writes atomically, and prints material counts.
- Create `public/schematics/quartz-pavilion-fountain.schem`: generated binary deliverable.
- Modify `package.json`: add fountain generation and tests to project scripts.
- Modify `.gitignore`: ignore `.superpowers/` visual brainstorming artifacts.

### Task 1: Sponge v3 Writer

**Files:**
- Create: `scripts/schematic-writer-test.mjs`
- Create: `scripts/lib/schematic-writer.mjs`

- [ ] **Step 1: Write the failing writer test**

Create `scripts/schematic-writer-test.mjs` with a `2 × 1 × 2` fixture containing air, quartz, water, and a palette index above 127 so multi-byte VarInt behavior is exercised directly:

```js
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { normalizeSchematic, parseNbt } from "../src/nbt.js";
import { encodeSchematic, encodeVarInt } from "./lib/schematic-writer.mjs";

assert.deepEqual([...encodeVarInt(0)], [0]);
assert.deepEqual([...encodeVarInt(127)], [127]);
assert.deepEqual([...encodeVarInt(128)], [128, 1]);
assert.deepEqual([...encodeVarInt(300)], [172, 2]);
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
assert.deepEqual(first, second, "gzip output must be deterministic");
assert.equal(gunzipSync(first)[0], 10, "root tag must be a compound");

const arrayBuffer = first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength);
const schematic = normalizeSchematic(await parseNbt(arrayBuffer));
assert.deepEqual([schematic.width, schematic.height, schematic.length], [2, 1, 2]);
assert.equal(schematic.version, 3);
assert.equal(schematic.dataVersion, 4671);
assert.deepEqual([...schematic.indices], [0, 1, 2, 3]);
assert.equal(schematic.palette[2], "minecraft:water[level=0]");
console.log("Schematic writer tests passed");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/schematic-writer-test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/schematic-writer.mjs`.

- [ ] **Step 3: Implement the writer**

Create `scripts/lib/schematic-writer.mjs` with these exact public contracts:

```js
import { gzipSync } from "node:zlib";

const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11 };
const DATA_VERSION = 4671;

export function encodeVarInt(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error("VarInt value must be a non-negative integer");
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
    if (typeof state !== "string" || !state.startsWith("minecraft:")) throw new Error(`Invalid block state: ${state}`);
    if (!palette.has(state)) palette.set(state, palette.size);
    indices.push(palette.get(state));
  }
  return { palette, indices };
}

export function encodeSchematic({ width, height, length, blocks }) {
  if (![width, height, length].every((value) => Number.isInteger(value) && value > 0 && value <= 32767)) {
    throw new Error("Schematic dimensions must be positive signed shorts");
  }
  if (blocks.length !== width * height * length) throw new Error("Block volume does not match dimensions");
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
```

Implement private `NbtWriter` methods `byte`, `short`, `int`, `long`, `stringPayload`, `named`, `compound`, `string`, `byteArray`, `intArray`, `emptyList`, and `toBuffer`. Each numeric payload must use a freshly allocated big-endian `Buffer`; each named tag writes tag type, unsigned-short UTF-8 name length, name bytes, payload; each compound ends with `TAG.END`. Reject strings longer than 65,535 UTF-8 bytes and byte arrays longer than signed-int range.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node scripts/schematic-writer-test.mjs`

Expected: `Schematic writer tests passed` with exit code 0.

- [ ] **Step 5: Record the checkpoint**

If Git becomes available, run `git add scripts/lib/schematic-writer.mjs scripts/schematic-writer-test.mjs && git commit -m "feat: add Sponge v3 schematic writer"`. In the current workspace, skip this command because `.git` is not a valid repository.

### Task 2: Fountain Geometry

**Files:**
- Create: `scripts/quartz-fountain-test.mjs`
- Create: `scripts/lib/quartz-fountain.mjs`

- [ ] **Step 1: Write the failing geometry test**

Create `scripts/quartz-fountain-test.mjs`:

```js
import assert from "node:assert/strict";
import { normalizeSchematic, parseNbt } from "../src/nbt.js";
import { encodeSchematic } from "./lib/schematic-writer.mjs";
import { ALLOWED_BLOCK_IDS, PILLAR_CENTERS, buildQuartzFountain } from "./lib/quartz-fountain.mjs";

const fountain = buildQuartzFountain();
assert.deepEqual([fountain.width, fountain.height, fountain.length], [35, 24, 35]);
assert.equal(fountain.blocks.length, 35 * 24 * 35);
assert.equal(PILLAR_CENTERS.length, 12);

const baseId = (state) => state.split("[")[0];
for (let y = 0; y < fountain.height; y += 1) {
  for (let z = 0; z < fountain.length; z += 1) {
    for (let x = 0; x < fountain.width; x += 1) {
      const state = baseId(fountain.get(x, y, z));
      assert.equal(state, baseId(fountain.get(34 - x, y, z)), `X symmetry at ${x},${y},${z}`);
      assert.equal(state, baseId(fountain.get(x, y, 34 - z)), `Z symmetry at ${x},${y},${z}`);
      assert.ok(ALLOWED_BLOCK_IDS.has(state), `Unexpected material ${state}`);
    }
  }
}

for (const [pillarX, pillarZ] of PILLAR_CENTERS) {
  for (let y = 7; y <= 12; y += 1) assert.equal(baseId(fountain.get(pillarX, y, pillarZ)), "minecraft:quartz_pillar");
}

for (let distance = 0; distance <= 11; distance += 1) {
  for (let offset = -2; offset <= 2; offset += 1) {
    for (let y = 4; y <= 7; y += 1) {
      assert.equal(fountain.get(17 + offset, y, distance), "minecraft:air", "north entrance clearance");
      assert.equal(fountain.get(17 + offset, y, 34 - distance), "minecraft:air", "south entrance clearance");
      assert.equal(fountain.get(distance, y, 17 + offset), "minecraft:air", "west entrance clearance");
      assert.equal(fountain.get(34 - distance, y, 17 + offset), "minecraft:air", "east entrance clearance");
    }
  }
}

for (let coordinate = 0; coordinate < 35; coordinate += 1) {
  for (let y = 0; y < 24; y += 1) {
    assert.notEqual(baseId(fountain.get(0, y, coordinate)), "minecraft:water");
    assert.notEqual(baseId(fountain.get(34, y, coordinate)), "minecraft:water");
    assert.notEqual(baseId(fountain.get(coordinate, y, 0)), "minecraft:water");
    assert.notEqual(baseId(fountain.get(coordinate, y, 34)), "minecraft:water");
  }
}

const encoded = encodeSchematic(fountain);
const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
const roundTrip = normalizeSchematic(await parseNbt(buffer));
assert.deepEqual([roundTrip.width, roundTrip.height, roundTrip.length], [35, 24, 35]);
assert.equal(roundTrip.dataVersion, 4671);
assert.ok(roundTrip.visibleBlocks > 2500);
assert.ok(roundTrip.palette.includes("minecraft:water[level=0]"));
assert.ok(roundTrip.palette.includes("minecraft:sea_lantern"));
console.log("Quartz fountain geometry tests passed");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/quartz-fountain-test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/quartz-fountain.mjs`.

- [ ] **Step 3: Implement the bounded volume and geometry**

Create `scripts/lib/quartz-fountain.mjs` with exports:

```js
export const WIDTH = 35;
export const HEIGHT = 24;
export const LENGTH = 35;
export const CENTER = 17;
export const PILLAR_CENTERS = [
  [12, 8], [9, 9], [8, 12], [22, 8], [25, 9], [26, 12],
  [12, 26], [9, 25], [8, 22], [22, 26], [25, 25], [26, 22],
];
export const ALLOWED_BLOCK_IDS = new Set([
  "minecraft:air", "minecraft:quartz_block", "minecraft:smooth_quartz",
  "minecraft:quartz_pillar", "minecraft:quartz_stairs", "minecraft:quartz_slab",
  "minecraft:smooth_quartz_slab", "minecraft:chiseled_quartz_block",
  "minecraft:sea_lantern", "minecraft:water",
]);
```

Implement `createVolume()` with `index(x,y,z) = x + z * WIDTH + y * WIDTH * LENGTH`, bounds-checking `set`, `get`, `fillBox`, `fillOctagon`, `fillOctagonRing`, `fillCircle`, `fillCircleRing`, and `forEachMirror` helpers. Any out-of-bounds write throws with coordinates.

Implement `buildQuartzFountain()` in these deterministic stages:

1. `buildTerrace`: y=0 octagon radius 17; y=1 radius 16; y=2 radius 15. Use smooth quartz surfaces, quartz edge rings, and cardinal stair approaches.
2. `buildBasin`: radius-14 sealed floor at y=2; radius-13 wall at y=3; water at y=3 inside radius 12 except the five-wide cardinal cross and radius-4 central island; sea lanterns at mirrored offsets `(±8,±8)` and `(0,±10)/(±10,0)` beneath water.
3. `buildWalkways`: five-wide cardinal smooth-quartz bridges from each boundary to radius 5, with quartz-slab edge trim; keep y=4..7 clear on the tested entrance segments.
4. `buildColumns`: at all 12 exported centers place a 3×3 slab plinth at y=4, chiseled base at y=5..6, quartz pillar shaft at y=7..12, chiseled capital at y=13, and 3×3 slab cap at y=14.
5. `buildEntablature`: connect columns with a two-block-thick octagonal ring at y=15, add smooth-quartz slab cornices, then build four mirrored triangular pediments from y=16 through y=19 without closing the central oculus.
6. `buildRoof`: create stepped octagonal roof rings at y=16..20 with decreasing outer radii 10, 9, 8, 7, 6 and a constant inner radius 3; hide sea lanterns under the inner cornice.
7. `buildCentralFountain`: create radius-4 island, radius-4 lower bowl at y=5, a pillar through y=9, radius-2 upper bowl at y=10, crown through y=14, and symmetric source-water curtains that terminate in the main basin. Keep the fountain clear of the four tested entrance corridors.
8. `buildFinial`: extend the central quartz-and-chiseled-quartz crown through y=23 so the structure uses its intended landmark height without adding water above the roof.

Stair states must always include `facing`, `half=bottom`, `shape=straight`, and `waterlogged=false`; slab states must include `type` and `waterlogged=false`; pillar states must use `axis=y`. Return `{ width, height, length, blocks, get, counts }`, with `counts` computed from final block states.

- [ ] **Step 4: Run the geometry test and verify GREEN**

Run: `node scripts/quartz-fountain-test.mjs`

Expected: `Quartz fountain geometry tests passed` with exit code 0.

- [ ] **Step 5: Record the checkpoint**

If Git becomes available, commit `scripts/lib/quartz-fountain.mjs` and `scripts/quartz-fountain-test.mjs`. Otherwise retain the verified working tree changes without committing.

### Task 3: Generator CLI and Artifact

**Files:**
- Create: `scripts/generate-quartz-fountain.mjs`
- Create: `public/schematics/quartz-pavilion-fountain.schem`

- [ ] **Step 1: Add a failing CLI integration assertion**

Append to `scripts/quartz-fountain-test.mjs`:

```js
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateQuartzFountain } from "./generate-quartz-fountain.mjs";

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "quartz-fountain-"));
try {
  const outputPath = path.join(temporaryDirectory, "fountain.schem");
  const summary = await generateQuartzFountain(outputPath);
  const generated = await readFile(outputPath);
  assert.ok(generated.length > 0);
  assert.equal(summary.outputPath, outputPath);
  assert.equal(summary.dimensions, "35 × 35 × 24");
  assert.ok(summary.totalBlocks > 2500);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/quartz-fountain-test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/generate-quartz-fountain.mjs`.

- [ ] **Step 3: Implement atomic generation**

Create `scripts/generate-quartz-fountain.mjs`:

```js
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQuartzFountain } from "./lib/quartz-fountain.mjs";
import { encodeSchematic } from "./lib/schematic-writer.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = path.join(projectRoot, "public", "schematics", "quartz-pavilion-fountain.schem");

export async function generateQuartzFountain(outputPath = defaultOutput) {
  const fountain = buildQuartzFountain();
  const encoded = encodeSchematic(fountain);
  const temporaryPath = `${outputPath}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await writeFile(temporaryPath, encoded);
    await rm(outputPath, { force: true });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return {
    outputPath,
    dimensions: `${fountain.width} × ${fountain.length} × ${fountain.height}`,
    totalBlocks: fountain.blocks.length - (fountain.counts.get("minecraft:air") ?? 0),
    counts: fountain.counts,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await generateQuartzFountain(process.argv[2] ? path.resolve(process.argv[2]) : defaultOutput);
  console.log(`Generated ${summary.outputPath}`);
  console.log(`Dimensions: ${summary.dimensions}`);
  console.log(`Placed blocks: ${summary.totalBlocks.toLocaleString()}`);
  for (const [state, count] of [...summary.counts].filter(([state]) => state !== "minecraft:air").sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(6)}  ${state}`);
  }
}
```

- [ ] **Step 4: Verify CLI integration GREEN**

Run: `node scripts/quartz-fountain-test.mjs`

Expected: `Quartz fountain geometry tests passed` with exit code 0.

- [ ] **Step 5: Generate the final artifact**

Run: `node scripts/generate-quartz-fountain.mjs`

Expected: exit code 0, a `Generated ...quartz-pavilion-fountain.schem` line, dimensions `35 × 35 × 24`, a nonzero placed-block count, and per-state material counts.

### Task 4: Project Integration and Final Verification

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Update project scripts**

Change `package.json` scripts to:

```json
{
  "scripts": {
    "assets": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/extract-minecraft-assets.ps1",
    "generate:fountain": "node scripts/generate-quartz-fountain.mjs",
    "test": "node scripts/smoke-test.mjs && node scripts/schematic-writer-test.mjs && node scripts/quartz-fountain-test.mjs",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Append `.superpowers/` to `.gitignore` so temporary visual brainstorming screens are not treated as project deliverables.

- [ ] **Step 2: Run focused tests**

Run: `node scripts/schematic-writer-test.mjs`

Expected: `Schematic writer tests passed`.

Run: `node scripts/quartz-fountain-test.mjs`

Expected: `Quartz fountain geometry tests passed`.

- [ ] **Step 3: Run the full project test command**

Run: `npm test`

Expected: all three test scripts print their pass messages and npm exits 0.

- [ ] **Step 4: Regenerate and compare deterministically**

Run `npm run generate:fountain` twice and hash the result after each run with:

```powershell
(Get-FileHash -Algorithm SHA256 public/schematics/quartz-pavilion-fountain.schem).Hash
```

Expected: both SHA-256 values are identical.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: Vite completes successfully with exit code 0.

- [ ] **Step 6: Inspect final deliverables**

Run:

```powershell
Get-Item public/schematics/quartz-pavilion-fountain.schem | Select-Object FullName,Length
node scripts/generate-quartz-fountain.mjs
```

Expected: the `.schem` file exists, has nonzero length, reports `35 × 35 × 24`, and lists only approved material families.

- [ ] **Step 7: Record the final checkpoint**

If Git becomes available, commit the generator, tests, package script, ignore rule, and binary artifact together. In the current workspace, report that verification succeeded but no commit was created because the directory is not a valid Git repository.
