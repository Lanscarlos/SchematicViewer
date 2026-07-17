import { mkdir, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
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
  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultOutput;
  const summary = await generateQuartzFountain(outputPath);
  console.log(`Generated ${summary.outputPath}`);
  console.log(`Dimensions: ${summary.dimensions}`);
  console.log(`Placed blocks: ${summary.totalBlocks.toLocaleString()}`);
  const materialCounts = [...summary.counts]
    .filter(([state]) => state !== "minecraft:air")
    .sort((left, right) => right[1] - left[1]);
  for (const [state, count] of materialCounts) {
    console.log(`${String(count).padStart(6)}  ${state}`);
  }
}
