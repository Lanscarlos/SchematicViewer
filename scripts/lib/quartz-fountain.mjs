export const WIDTH = 35;
export const HEIGHT = 24;
export const LENGTH = 35;
export const CENTER = 17;

export const PILLAR_CENTERS = [
  [12, 8], [9, 9], [8, 12],
  [22, 8], [25, 9], [26, 12],
  [12, 26], [9, 25], [8, 22],
  [22, 26], [25, 25], [26, 22],
];

export const ALLOWED_BLOCK_IDS = new Set([
  "minecraft:air",
  "minecraft:quartz_block",
  "minecraft:smooth_quartz",
  "minecraft:quartz_pillar",
  "minecraft:quartz_stairs",
  "minecraft:quartz_slab",
  "minecraft:smooth_quartz_slab",
  "minecraft:chiseled_quartz_block",
  "minecraft:sea_lantern",
  "minecraft:water",
]);

const AIR = "minecraft:air";
const QUARTZ = "minecraft:quartz_block";
const SMOOTH = "minecraft:smooth_quartz";
const PILLAR = "minecraft:quartz_pillar[axis=y]";
const CHISELED = "minecraft:chiseled_quartz_block";
const LIGHT = "minecraft:sea_lantern";
const WATER = "minecraft:water[level=0]";
const QUARTZ_SLAB = "minecraft:quartz_slab[type=bottom,waterlogged=false]";
const SMOOTH_SLAB = "minecraft:smooth_quartz_slab[type=bottom,waterlogged=false]";
const TOP_SMOOTH_SLAB = "minecraft:smooth_quartz_slab[type=top,waterlogged=false]";

const stair = (facing, half = "bottom") =>
  `minecraft:quartz_stairs[facing=${facing},half=${half},shape=straight,waterlogged=false]`;

const insideOctagon = (x, z, radius) => {
  const offsetX = Math.abs(x - CENTER);
  const offsetZ = Math.abs(z - CENTER);
  return Math.max(offsetX, offsetZ) <= radius && offsetX + offsetZ <= Math.floor(radius * 1.5);
};

const insideCircle = (x, z, radius) => {
  const offsetX = x - CENTER;
  const offsetZ = z - CENTER;
  return offsetX * offsetX + offsetZ * offsetZ <= radius * radius;
};

const isCardinalWalkway = (x, z) => Math.abs(x - CENTER) <= 2 || Math.abs(z - CENTER) <= 2;

function createVolume() {
  const blocks = Array(WIDTH * HEIGHT * LENGTH).fill(AIR);
  const index = (x, y, z) => {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || z < 0 || z >= LENGTH) {
      throw new Error(`Block placement out of bounds: ${x},${y},${z}`);
    }
    return x + z * WIDTH + y * WIDTH * LENGTH;
  };
  const set = (x, y, z, state) => {
    if (typeof state !== "string" || !state.startsWith("minecraft:")) {
      throw new Error(`Invalid block state: ${state}`);
    }
    blocks[index(x, y, z)] = state;
  };
  const get = (x, y, z) => blocks[index(x, y, z)];
  const fillBox = (minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ, state) => {
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (let z = minimumZ; z <= maximumZ; z += 1) {
        for (let x = minimumX; x <= maximumX; x += 1) set(x, y, z, state);
      }
    }
  };
  const fillOctagon = (y, radius, state, predicate = () => true) => {
    for (let z = 0; z < LENGTH; z += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        if (insideOctagon(x, z, radius) && predicate(x, z)) set(x, y, z, state);
      }
    }
  };
  const fillOctagonRing = (y, outerRadius, innerRadius, state, predicate = () => true) => {
    fillOctagon(y, outerRadius, state, (x, z) => !insideOctagon(x, z, innerRadius) && predicate(x, z));
  };
  const fillCircle = (y, radius, state, predicate = () => true) => {
    for (let z = CENTER - radius; z <= CENTER + radius; z += 1) {
      for (let x = CENTER - radius; x <= CENTER + radius; x += 1) {
        if (insideCircle(x, z, radius) && predicate(x, z)) set(x, y, z, state);
      }
    }
  };
  const fillCircleRing = (y, outerRadius, innerRadius, state, predicate = () => true) => {
    fillCircle(y, outerRadius, state, (x, z) => !insideCircle(x, z, innerRadius) && predicate(x, z));
  };
  const forEachMirror = (offsetX, offsetZ, callback) => {
    const points = new Set();
    for (const mirroredX of [offsetX, -offsetX]) {
      for (const mirroredZ of [offsetZ, -offsetZ]) {
        points.add(`${CENTER + mirroredX},${CENTER + mirroredZ}`);
        points.add(`${CENTER + mirroredZ},${CENTER + mirroredX}`);
      }
    }
    for (const point of points) {
      const [x, z] = point.split(",").map(Number);
      callback(x, z);
    }
  };
  return { blocks, set, get, fillBox, fillOctagon, fillOctagonRing, fillCircle, fillCircleRing, forEachMirror };
}

function buildTerrace(volume) {
  volume.fillOctagon(0, 17, SMOOTH);
  volume.fillOctagon(1, 16, QUARTZ);
  volume.fillOctagon(2, 15, SMOOTH);

  for (let offset = -7; offset <= 7; offset += 1) {
    volume.set(CENTER + offset, 1, 0, stair("north"));
    volume.set(CENTER + offset, 1, 34, stair("south"));
    volume.set(0, 1, CENTER + offset, stair("west"));
    volume.set(34, 1, CENTER + offset, stair("east"));
  }

  volume.fillOctagonRing(2, 15, 14, QUARTZ_SLAB);
}

function buildBasin(volume) {
  volume.fillOctagon(2, 14, SMOOTH);
  volume.fillOctagonRing(3, 14, 12, QUARTZ);
  volume.fillOctagonRing(4, 14, 13, SMOOTH_SLAB, (x, z) => !isCardinalWalkway(x, z));

  for (let z = 0; z < LENGTH; z += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (!insideOctagon(x, z, 12) || insideCircle(x, z, 4)) continue;
      volume.set(x, 3, z, isCardinalWalkway(x, z) ? SMOOTH : WATER);
    }
  }

  volume.forEachMirror(8, 8, (x, z) => volume.set(x, 2, z, LIGHT));
  volume.forEachMirror(0, 10, (x, z) => volume.set(x, 2, z, LIGHT));
}

function buildWalkways(volume) {
  for (let z = 0; z < LENGTH; z += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (insideOctagon(x, z, 14) && isCardinalWalkway(x, z)) volume.set(x, 3, z, SMOOTH);
    }
  }

  for (let coordinate = 12; coordinate <= 22; coordinate += 1) {
    volume.set(CENTER - 3, 4, coordinate, SMOOTH_SLAB);
    volume.set(CENTER + 3, 4, coordinate, SMOOTH_SLAB);
    volume.set(coordinate, 4, CENTER - 3, SMOOTH_SLAB);
    volume.set(coordinate, 4, CENTER + 3, SMOOTH_SLAB);
  }
}

function buildColumns(volume) {
  for (const [pillarX, pillarZ] of PILLAR_CENTERS) {
    volume.fillBox(pillarX - 1, 4, pillarZ - 1, pillarX + 1, 4, pillarZ + 1, SMOOTH_SLAB);
    volume.fillBox(pillarX - 1, 5, pillarZ - 1, pillarX + 1, 5, pillarZ + 1, SMOOTH);
    volume.set(pillarX, 6, pillarZ, CHISELED);
    volume.set(pillarX - 1, 6, pillarZ, QUARTZ_SLAB);
    volume.set(pillarX + 1, 6, pillarZ, QUARTZ_SLAB);
    volume.set(pillarX, 6, pillarZ - 1, QUARTZ_SLAB);
    volume.set(pillarX, 6, pillarZ + 1, QUARTZ_SLAB);
    for (let y = 7; y <= 12; y += 1) volume.set(pillarX, y, pillarZ, PILLAR);
    volume.set(pillarX, 13, pillarZ, CHISELED);
    volume.set(pillarX - 1, 13, pillarZ, TOP_SMOOTH_SLAB);
    volume.set(pillarX + 1, 13, pillarZ, TOP_SMOOTH_SLAB);
    volume.set(pillarX, 13, pillarZ - 1, TOP_SMOOTH_SLAB);
    volume.set(pillarX, 13, pillarZ + 1, TOP_SMOOTH_SLAB);
    volume.fillBox(pillarX - 1, 14, pillarZ - 1, pillarX + 1, 14, pillarZ + 1, SMOOTH_SLAB);
  }
}

function buildEntablature(volume) {
  volume.fillOctagonRing(15, 11, 8, QUARTZ);
  volume.fillOctagonRing(14, 11, 9, TOP_SMOOTH_SLAB);
  volume.fillOctagonRing(16, 11, 9, SMOOTH_SLAB);
  volume.forEachMirror(0, 8, (x, z) => volume.set(x, 14, z, LIGHT));
  volume.forEachMirror(6, 6, (x, z) => volume.set(x, 14, z, LIGHT));
}

function buildRoof(volume) {
  const layers = [10, 9, 8, 7, 6];
  for (let layer = 0; layer < layers.length; layer += 1) {
    const state = layer % 2 === 0 ? SMOOTH : QUARTZ;
    volume.fillOctagonRing(16 + layer, layers[layer], 3, state);
  }

  for (let level = 0; level < 4; level += 1) {
    const y = 16 + level;
    const halfSpan = 7 - level * 2;
    const facade = 7;
    for (let offset = -halfSpan; offset <= halfSpan; offset += 1) {
      const state = level === 3 ? CHISELED : QUARTZ;
      volume.set(CENTER + offset, y, facade, state);
      volume.set(CENTER + offset, y, 34 - facade, state);
      volume.set(facade, y, CENTER + offset, state);
      volume.set(34 - facade, y, CENTER + offset, state);
    }
  }
}

function buildCentralFountain(volume) {
  volume.fillCircle(3, 4, QUARTZ);
  volume.fillCircle(4, 4, SMOOTH);
  volume.fillCircleRing(5, 4, 3, stair("north"));
  volume.fillCircle(5, 3, WATER);

  volume.fillCircle(5, 1, CHISELED);
  volume.fillCircle(6, 1, QUARTZ);
  volume.set(CENTER, 7, CENTER, PILLAR);
  volume.set(CENTER, 8, CENTER, PILLAR);
  volume.fillCircleRing(9, 3, 1, QUARTZ_SLAB);
  volume.fillCircle(9, 1, WATER);

  volume.set(CENTER, 9, CENTER, CHISELED);
  volume.set(CENTER, 10, CENTER, PILLAR);
  volume.set(CENTER, 11, CENTER, PILLAR);
  volume.fillCircleRing(12, 2, 1, SMOOTH_SLAB);
  volume.set(CENTER, 12, CENTER, CHISELED);

  for (const [offsetX, offsetZ] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let y = 10; y <= 12; y += 1) volume.set(CENTER + offsetX, y, CENTER + offsetZ, WATER);
  }

  volume.set(CENTER, 13, CENTER, PILLAR);
  volume.set(CENTER, 14, CENTER, CHISELED);
}

function buildFinial(volume) {
  for (let y = 15; y <= 20; y += 1) volume.set(CENTER, y, CENTER, PILLAR);
  volume.set(CENTER, 21, CENTER, SMOOTH);
  volume.set(CENTER, 22, CENTER, CHISELED);
  volume.set(CENTER, 23, CENTER, QUARTZ);
  volume.set(CENTER - 1, 21, CENTER, QUARTZ_SLAB);
  volume.set(CENTER + 1, 21, CENTER, QUARTZ_SLAB);
  volume.set(CENTER, 21, CENTER - 1, QUARTZ_SLAB);
  volume.set(CENTER, 21, CENTER + 1, QUARTZ_SLAB);
}

export function buildQuartzFountain() {
  const volume = createVolume();
  buildTerrace(volume);
  buildBasin(volume);
  buildWalkways(volume);
  buildColumns(volume);
  buildEntablature(volume);
  buildRoof(volume);
  buildCentralFountain(volume);
  buildFinial(volume);

  const counts = new Map();
  for (const state of volume.blocks) counts.set(state, (counts.get(state) ?? 0) + 1);
  return {
    width: WIDTH,
    height: HEIGHT,
    length: LENGTH,
    blocks: volume.blocks,
    get: volume.get,
    counts,
  };
}
