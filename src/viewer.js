import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { isAir, parseBlockState } from "./nbt.js";

const FACE_VERTICES = {
  north: (from, to) => [[from[0], from[1], from[2]], [from[0], to[1], from[2]], [to[0], to[1], from[2]], [to[0], from[1], from[2]]],
  south: (from, to) => [[to[0], from[1], to[2]], [to[0], to[1], to[2]], [from[0], to[1], to[2]], [from[0], from[1], to[2]]],
  west: (from, to) => [[from[0], from[1], to[2]], [from[0], to[1], to[2]], [from[0], to[1], from[2]], [from[0], from[1], from[2]]],
  east: (from, to) => [[to[0], from[1], from[2]], [to[0], to[1], from[2]], [to[0], to[1], to[2]], [to[0], from[1], to[2]]],
  up: (from, to) => [[from[0], to[1], from[2]], [from[0], to[1], to[2]], [to[0], to[1], to[2]], [to[0], to[1], from[2]]],
  down: (from, to) => [[from[0], from[1], to[2]], [from[0], from[1], from[2]], [to[0], from[1], from[2]], [to[0], from[1], to[2]]],
};

const DIRECTIONS = {
  north: new THREE.Vector3(0, 0, -1),
  south: new THREE.Vector3(0, 0, 1),
  west: new THREE.Vector3(-1, 0, 0),
  east: new THREE.Vector3(1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
  down: new THREE.Vector3(0, -1, 0),
};

const TRIANGLE_ORDER = [0, 1, 2, 0, 2, 3];

function defaultUv(face, from, to) {
  switch (face) {
    case "down": return [from[0], 16 - to[2], to[0], 16 - from[2]];
    case "up": return [from[0], from[2], to[0], to[2]];
    case "north": return [16 - to[0], 16 - to[1], 16 - from[0], 16 - from[1]];
    case "south": return [from[0], 16 - to[1], to[0], 16 - from[1]];
    case "west": return [from[2], 16 - to[1], to[2], 16 - from[1]];
    case "east": return [16 - to[2], 16 - to[1], 16 - from[2], 16 - from[1]];
    default: return [0, 0, 16, 16];
  }
}

function faceUvs(face, from, to) {
  const [u1, v1, u2, v2] = face.uv ?? defaultUv(face.name, from, to);
  let values = [
    [u1 / 16, 1 - v2 / 16],
    [u1 / 16, 1 - v1 / 16],
    [u2 / 16, 1 - v1 / 16],
    [u2 / 16, 1 - v2 / 16],
  ];
  const turns = ((face.rotation ?? 0) / 90) % 4;
  if (turns) values = values.map((_, index) => values[(index - turns + 4) % 4]);
  return values;
}

function applyRotation(vector, rotation, center) {
  if (!rotation?.angle) return vector;
  const axis = DIRECTIONS[rotation.axis === "x" ? "east" : rotation.axis === "y" ? "up" : "south"];
  return vector.sub(center).applyAxisAngle(axis, THREE.MathUtils.degToRad(-rotation.angle)).add(center);
}

function rotateBlockVector(vector, application) {
  const center = new THREE.Vector3(0.5, 0.5, 0.5);
  vector.sub(center);
  if (application.x) vector.applyAxisAngle(DIRECTIONS.east, THREE.MathUtils.degToRad(-application.x));
  if (application.y) vector.applyAxisAngle(DIRECTIONS.up, THREE.MathUtils.degToRad(-application.y));
  return vector.add(center);
}

function rotatedDirection(name, application) {
  const vector = DIRECTIONS[name]?.clone();
  if (!vector) return null;
  if (application.x) vector.applyAxisAngle(DIRECTIONS.east, THREE.MathUtils.degToRad(-application.x));
  if (application.y) vector.applyAxisAngle(DIRECTIONS.up, THREE.MathUtils.degToRad(-application.y));
  return vector.round();
}

function tintFor(blockId, tintIndex) {
  if (tintIndex === undefined) return 0xffffff;
  const path = blockId.split(":").pop();
  if (path.includes("water")) return 0x3f76e4;
  if (path.includes("redstone")) return 0xff2a16;
  if (path.includes("grass") || path.includes("fern") || path.includes("sugar_cane")) return 0x91bd59;
  return 0x77ab2f;
}

function isTranslucent(blockId) {
  return /(water|lava|glass|ice|slime|honey|portal)/.test(blockId);
}

function blockLabel(rawState) {
  const state = parseBlockState(rawState);
  return { id: state.id, properties: state.properties, raw: rawState };
}

export class SchematicViewer {
  constructor(canvas, resources, callbacks = {}) {
    this.canvas = canvas;
    this.resources = resources;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
    this.camera.position.set(12, 10, 12);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.localClippingEnabled = true;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.target.set(0, 2, 0);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.meshes = [];
    this.schematic = null;
    this.slicePlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100000);
    this.renderer.clippingPlanes = [];
    this.makeSceneHelpers();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.animate();
  }

  makeSceneHelpers() {
    const hemisphere = new THREE.HemisphereLight(0xd8ecff, 0x263023, 2.35);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff4d6, 2.15);
    sun.position.set(-20, 35, 15);
    this.scene.add(sun);
    this.grid = new THREE.GridHelper(40, 40, 0x526555, 0x2d3930);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.4;
    this.scene.add(this.grid);

    const selectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012));
    this.selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({ color: 0xf0c766, depthTest: false }));
    this.selection.renderOrder = 1000;
    this.selection.visible = false;
    this.scene.add(this.selection);
  }

  bindEvents() {
    this.canvas.addEventListener("pointermove", (event) => this.pick(event, false));
    this.canvas.addEventListener("pointerleave", () => this.callbacks.onHover?.(null));
    this.canvas.addEventListener("click", (event) => this.pick(event, true));
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = Math.max(parent.clientWidth, 1);
    const height = Math.max(parent.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  clear() {
    for (const mesh of this.meshes) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes = [];
    this.selection.visible = false;
  }

  async load(schematic, onProgress = () => {}) {
    this.clear();
    this.schematic = schematic;
    const usedStates = schematic.palette.filter((state) => state && !isAir(state));
    onProgress(0.05, "正在解析方块模型");
    const resolvedEntries = await Promise.all(usedStates.map(async (state) => [state, await this.resources.getBlockParts(state)]));
    const resolvedStates = new Map(resolvedEntries);
    const groups = new Map();
    const materialDefinitions = new Map();
    const layerSize = schematic.width * schematic.length;

    const isSolidAt = (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= schematic.width || y >= schematic.height || z >= schematic.length) return false;
      const index = x + z * schematic.width + y * layerSize;
      return !isAir(schematic.palette[schematic.indices[index]] ?? "minecraft:air");
    };

    for (let index = 0; index < schematic.volume; index += 1) {
      const rawState = schematic.palette[schematic.indices[index]] ?? "minecraft:air";
      if (isAir(rawState)) continue;
      const y = Math.floor(index / layerSize);
      const remainder = index - y * layerSize;
      const z = Math.floor(remainder / schematic.width);
      const x = remainder - z * schematic.width;
      const state = parseBlockState(rawState);
      const parts = resolvedStates.get(rawState) ?? [];

      for (const application of parts) {
        const model = application.resolvedModel;
        if (!model?.elements) continue;
        for (const element of model.elements) {
          const from = element.from.map((value) => value / 16);
          const to = element.to.map((value) => value / 16);
          const origin = new THREE.Vector3(...(element.rotation?.origin ?? [8, 8, 8]).map((value) => value / 16));

          for (const [faceName, face] of Object.entries(element.faces ?? {})) {
            if (!FACE_VERTICES[faceName]) continue;
            if (face.cullface) {
              const direction = rotatedDirection(face.cullface, application);
              if (direction && isSolidAt(x + direction.x, y + direction.y, z + direction.z)) continue;
            }

            const textureReference = this.resources.resolveTextureReference(face.texture, model.textures);
            const tint = tintFor(state.id, face.tintindex);
            const translucent = isTranslucent(state.id);
            const materialKey = `${textureReference ?? "missing"}|${tint}|${translucent}`;
            if (!groups.has(materialKey)) groups.set(materialKey, { positions: [], normals: [], uvs: [], blocks: [] });
            materialDefinitions.set(materialKey, { textureReference, tint, translucent });
            const group = groups.get(materialKey);
            const vertices = FACE_VERTICES[faceName](from, to).map((coordinates) => {
              const vector = new THREE.Vector3(...coordinates);
              applyRotation(vector, element.rotation, origin);
              rotateBlockVector(vector, application);
              vector.add(new THREE.Vector3(x - schematic.width / 2, y, z - schematic.length / 2));
              return vector;
            });
            const uvValues = faceUvs({ ...face, name: faceName }, element.from, element.to);
            const normal = new THREE.Vector3().crossVectors(
              vertices[1].clone().sub(vertices[0]),
              vertices[2].clone().sub(vertices[0]),
            ).normalize();

            for (const vertexIndex of TRIANGLE_ORDER) {
              group.positions.push(...vertices[vertexIndex].toArray());
              group.normals.push(...normal.toArray());
              group.uvs.push(...uvValues[vertexIndex]);
            }
            const block = { x, y, z, ...blockLabel(rawState) };
            group.blocks.push(block, block);
          }
        }
      }

      if (index % 4096 === 0) {
        onProgress(0.1 + 0.68 * (index / schematic.volume), `正在构建方块 ${index.toLocaleString()} / ${schematic.volume.toLocaleString()}`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    onProgress(0.82, "正在载入材质");
    const entries = [...groups.entries()];
    for (let index = 0; index < entries.length; index += 1) {
      const [key, data] = entries[index];
      const definition = materialDefinitions.get(key);
      const texture = await this.resources.loadTexture(definition.textureReference);
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        color: definition.tint,
        alphaTest: definition.translucent ? 0.02 : 0.22,
        transparent: definition.translucent,
        opacity: definition.translucent ? 0.78 : 1,
        depthWrite: !definition.translucent,
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.faceBlocks = data.blocks;
      this.root.add(mesh);
      this.meshes.push(mesh);
      onProgress(0.82 + 0.17 * ((index + 1) / entries.length), `正在载入材质 ${index + 1} / ${entries.length}`);
    }

    this.grid.scale.set(Math.max(1, schematic.width / 40), 1, Math.max(1, schematic.length / 40));
    this.fitView();
    onProgress(1, "预览已就绪");
  }

  pick(event, select) {
    if (!this.meshes.length) return;
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    const block = hit?.object.userData.faceBlocks?.[hit.faceIndex] ?? null;
    this.callbacks.onHover?.(block);
    if (select && block) {
      this.selection.position.set(
        block.x - this.schematic.width / 2 + 0.5,
        block.y + 0.5,
        block.z - this.schematic.length / 2 + 0.5,
      );
      this.selection.visible = true;
      this.callbacks.onSelect?.(block);
    }
  }

  fitView() {
    if (!this.schematic) return;
    const size = Math.max(this.schematic.width, this.schematic.height, this.schematic.length, 2);
    this.controls.target.set(0, this.schematic.height / 2, 0);
    this.camera.position.set(size * 1.15, this.schematic.height / 2 + size * 0.85, size * 1.15);
    this.camera.near = Math.max(0.02, size / 1000);
    this.camera.far = Math.max(500, size * 12);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setView(view) {
    if (!this.schematic) return;
    const target = new THREE.Vector3(0, this.schematic.height / 2, 0);
    const distance = Math.max(this.schematic.width, this.schematic.height, this.schematic.length) * 1.8;
    const directions = {
      top: new THREE.Vector3(0.001, 1, 0.001),
      front: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0),
      iso: new THREE.Vector3(1, 0.72, 1),
    };
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(directions[view].normalize().multiplyScalar(distance));
    this.controls.update();
  }

  setSlice(enabled, layer) {
    this.slicePlane.constant = layer + 1.01;
    this.renderer.clippingPlanes = enabled ? [this.slicePlane] : [];
  }

  setGrid(visible) {
    this.grid.visible = visible;
  }

  setAutoRotate(enabled) {
    this.controls.autoRotate = enabled;
    this.controls.autoRotateSpeed = 1.2;
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    const link = document.createElement("a");
    link.download = "schematic-preview.png";
    link.href = this.canvas.toDataURL("image/png");
    link.click();
  }
}
