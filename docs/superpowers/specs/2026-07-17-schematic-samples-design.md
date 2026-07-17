# Schematic Sample Files Design

## Goal

Provide three small, deterministic `.schem` files that exercise the viewer's supported Sponge Schematic v2 and v3 paths without adding third-party dependencies.

## Outputs

The generated files live in `samples/`:

- `single-stone-v2.schem`: a gzip-compressed 1×1×1 Sponge v2 schematic containing one stone block.
- `palette-checker-v2.schem`: a gzip-compressed 4×3×4 Sponge v2 schematic containing air, stone, oak planks, and glass.
- `mini-structure-v3.schem`: a gzip-compressed 5×4×5 Sponge v3 schematic containing a compact structure, including block states on stairs and logs.

All files use data version 4189, matching the project's existing smoke-test fixture.

## Generator

Add `scripts/generate-samples.mjs`, implemented with Node.js built-ins only. It contains a focused NBT writer, VarInt encoding, v2/v3 schematic layout assembly, and gzip output. Re-running the command overwrites only the three named generated samples with deterministic contents.

Expose the generator as `npm run samples` so the fixtures are easy to recreate.

## Validation

After generation, the script reads every output through the project's existing `parseNbt` and `normalizeSchematic` functions. It verifies the expected format version, dimensions, palette entries, and visible-block count. Project smoke tests and the production build provide broader regression checks.

## Scope

This change adds sample artifacts and their generator only. It does not change parser or renderer behavior, add dependencies, or attempt to cover entities, block entities, biomes, or every NBT compression variant.
