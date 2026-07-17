# Schematic Samples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three deterministic, gzip-compressed Sponge v2/v3 `.schem` fixtures and a dependency-free command that regenerates and validates them.

**Architecture:** A focused Node.js script serializes the subset of NBT tags used by Sponge schematics, encodes palette IDs as VarInts, writes gzip files, and immediately verifies them through the production parser. The existing smoke test independently reads the generated artifacts so regressions fail through `npm test`.

**Tech Stack:** Node.js ES modules, Node built-ins (`fs`, `path`, `url`, `zlib`), existing `src/nbt.js` parser.

---

### Task 1: Add failing sample validation

**Files:**
- Modify: `scripts/smoke-test.mjs`

- [ ] **Step 1: Import the fixture reader**

Add the Node built-ins and project-root calculation:

```js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
```

- [ ] **Step 2: Add exact fixture expectations**

Append a table and parse each gzip file through production code:

```js
const sampleExpectations = [
  { file: "single-stone-v2.schem", version: 2, size: [1, 1, 1], visibleBlocks: 1 },
  { file: "palette-checker-v2.schem", version: 2, size: [4, 3, 4], visibleBlocks: 32 },
  { file: "mini-structure-v3.schem", version: 3, size: [5, 4, 5], visibleBlocks: 42 },
];

for (const expected of sampleExpectations) {
  const file = await readFile(path.join(projectRoot, "samples", expected.file));
  const parsedSample = await parseNbt(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const normalized = normalizeSchematic(parsedSample);
  assertEqual(normalized.version, expected.version, `${expected.file} version`);
  assertEqual([normalized.width, normalized.height, normalized.length], expected.size, `${expected.file} dimensions`);
  assertEqual(normalized.visibleBlocks, expected.visibleBlocks, `${expected.file} visible blocks`);
}
```

- [ ] **Step 3: Verify the test fails for missing fixtures**

Run: `npm test`

Expected: FAIL with `ENOENT` for `samples/single-stone-v2.schem`.

- [ ] **Step 4: Commit the failing test when Git metadata is available**

Run: `git add scripts/smoke-test.mjs && git commit -m "test: validate schematic samples"`

Expected: one commit. In the current workspace this step is skipped because `.git` is not recognized as a repository.

### Task 2: Implement the NBT sample generator

**Files:**
- Create: `scripts/generate-samples.mjs`
- Create: `samples/single-stone-v2.schem`
- Create: `samples/palette-checker-v2.schem`
- Create: `samples/mini-structure-v3.schem`

- [ ] **Step 1: Implement big-endian NBT serialization**

Create an `NbtWriter` backed by a byte array with `byte`, `short`, `int`, `string`, `named`, `compound`, `byteArray`, and `intArray` methods. Strings are UTF-8 with unsigned-short lengths; named compounds end with tag `0`; integers use big-endian byte order.

```js
const TAG = { END: 0, SHORT: 2, INT: 3, BYTE_ARRAY: 7, LIST: 9, COMPOUND: 10, INT_ARRAY: 11 };

class NbtWriter {
  constructor() { this.bytes = []; }
  byte(value) { this.bytes.push(value & 0xff); }
  short(value) { this.bytes.push((value >>> 8) & 0xff, value & 0xff); }
  int(value) { this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff); }
  string(value) { const encoded = Buffer.from(value, "utf8"); this.short(encoded.length); this.bytes.push(...encoded); }
  named(type, name, payload) { this.byte(type); this.string(name); payload(); }
  compound(name, entries) { this.named(TAG.COMPOUND, name, () => { entries(); this.byte(TAG.END); }); }
  byteArray(name, values) { this.named(TAG.BYTE_ARRAY, name, () => { this.int(values.length); this.bytes.push(...values); }); }
  intArray(name, values) { this.named(TAG.INT_ARRAY, name, () => { this.int(values.length); values.forEach((value) => this.int(value)); }); }
  finish() { return Buffer.from(this.bytes); }
}
```

- [ ] **Step 2: Encode every palette index as a VarInt**

```js
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
```

- [ ] **Step 3: Serialize v2 and v3 layouts**

Write common root fields `Version`, `DataVersion`, `Width`, `Height`, `Length`, and `Offset`. For v2, write `Palette`, `PaletteMax`, and `BlockData` at the root. For v3, write `Palette` and `Data` inside a root `Blocks` compound. Write the root as an unnamed compound and gzip with `{ level: 9, mtime: 0 }`.

- [ ] **Step 4: Define deterministic block volumes**

Use `index = x + z * width + y * width * length`.

```js
const samples = [
  singleStoneV2(),      // one stone
  paletteCheckerV2(),  // stone floor, alternating oak/glass middle layer, air top layer
  miniStructureV3(),   // cobblestone floor, four log posts, plank beam, glass, and oak stairs
];
```

Each factory returns `{ file, version, width, height, length, palette, indices }`; assert the final visible counts are `1`, `32`, and `42` before writing.

- [ ] **Step 5: Write and self-validate all outputs**

Use `mkdir(samplesDirectory, { recursive: true })`, write exactly the three named files, then read each output through `parseNbt` and `normalizeSchematic`. Throw if version, dimensions, palette states, or visible count differ from the factory definition. Print one line per file plus a final success line.

- [ ] **Step 6: Run the generator**

Run: `node scripts/generate-samples.mjs`

Expected: three generated-file lines followed by `Generated and validated 3 schematic samples`.

- [ ] **Step 7: Verify the formerly failing test passes**

Run: `npm test`

Expected: PASS with `NBT and schematic smoke tests passed`.

- [ ] **Step 8: Commit the generator and fixtures when Git metadata is available**

Run: `git add scripts/generate-samples.mjs samples && git commit -m "feat: add schematic sample generator"`

Expected: one commit. Skip in the current workspace for the documented invalid `.git` state.

### Task 3: Expose the command and run regressions

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add the package script**

Add this entry before `test`:

```json
"samples": "node scripts/generate-samples.mjs"
```

- [ ] **Step 2: Document sample usage**

Add a short README section listing `npm run samples`, the `samples/` output directory, and the three covered scenarios.

- [ ] **Step 3: Regenerate through the public command**

Run: `npm run samples`

Expected: all three files are regenerated and validated successfully.

- [ ] **Step 4: Run targeted validation**

Run: `npm test`

Expected: PASS with `NBT and schematic smoke tests passed`.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: Vite exits with code 0 and reports generated assets.

- [ ] **Step 6: Commit command and documentation when Git metadata is available**

Run: `git add package.json README.md && git commit -m "docs: document schematic samples"`

Expected: one commit. Skip in the current workspace for the documented invalid `.git` state.
