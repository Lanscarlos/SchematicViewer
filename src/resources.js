import * as THREE from "three";
import { parseBlockState } from "./nbt.js";

const FACE_NAMES = ["north", "south", "west", "east", "up", "down"];

function splitId(id, defaultPathPrefix = "") {
  const separator = id.indexOf(":");
  const namespace = separator >= 0 ? id.slice(0, separator) : "minecraft";
  let path = separator >= 0 ? id.slice(separator + 1) : id;
  if (defaultPathPrefix && !path.includes("/")) path = `${defaultPathPrefix}/${path}`;
  return { namespace, path };
}

function matchesProperties(expression, properties) {
  if (!expression) return true;
  return expression.split(",").every((condition) => {
    const [name, values = ""] = condition.split("=");
    return values.split("|").includes(properties[name]);
  });
}

function matchesWhen(when, properties) {
  if (!when) return true;
  if (when.OR) return when.OR.some((entry) => matchesWhen(entry, properties));
  if (when.AND) return when.AND.every((entry) => matchesWhen(entry, properties));
  return Object.entries(when).every(([name, expected]) => {
    const values = String(expected).split("|");
    if (values[0]?.startsWith("!")) return !values.map((value) => value.slice(1)).includes(properties[name]);
    return values.includes(properties[name]);
  });
}

function chooseModel(value) {
  if (!Array.isArray(value)) return value;
  return value[0];
}

function normalizeApply(value) {
  if (!value) return [];
  const selected = chooseModel(value);
  return selected ? [selected] : [];
}

function fallbackElements(texture) {
  return [{
    from: [0, 0, 0],
    to: [16, 16, 16],
    faces: Object.fromEntries(FACE_NAMES.map((face) => [face, { texture, cullface: face }])),
  }];
}

export class MinecraftResources {
  constructor() {
    this.assetRoot = `${import.meta.env.BASE_URL}minecraft/assets`;
    this.jsonCache = new Map();
    this.modelCache = new Map();
    this.blockCache = new Map();
    this.textureCache = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.missingTexture = this.createMissingTexture();
  }

  createMissingTexture() {
    const size = 16;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dark = ((x >> 2) + (y >> 2)) % 2 === 0;
        const offset = (y * size + x) * 4;
        data.set(dark ? [28, 18, 28, 255] : [238, 52, 178, 255], offset);
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }

  async fetchJson(url) {
    if (!this.jsonCache.has(url)) {
      this.jsonCache.set(url, fetch(url).then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      }).catch(() => null));
    }
    return this.jsonCache.get(url);
  }

  async getBlockParts(rawState) {
    if (!this.blockCache.has(rawState)) {
      this.blockCache.set(rawState, this.resolveBlockParts(rawState));
    }
    return this.blockCache.get(rawState);
  }

  async resolveBlockParts(rawState) {
    const state = parseBlockState(rawState);
    const { namespace, path } = splitId(state.id);
    const definition = await this.fetchJson(`${this.assetRoot}/${namespace}/blockstates/${path}.json`);
    const applications = [];

    if (definition?.variants) {
      const variant = Object.entries(definition.variants)
        .find(([expression]) => matchesProperties(expression, state.properties));
      if (variant) applications.push(...normalizeApply(variant[1]));
    }
    if (definition?.multipart) {
      for (const part of definition.multipart) {
        if (matchesWhen(part.when, state.properties)) applications.push(...normalizeApply(part.apply));
      }
    }

    const resolved = await Promise.all(applications.map(async (application) => ({
      ...application,
      resolvedModel: await this.getModel(application.model),
    })));

    if (resolved.length && resolved.some((part) => part.resolvedModel?.elements?.length)) return resolved;

    const fallbackTexture = this.fallbackTextureFor(state.id, resolved[0]?.resolvedModel?.textures);
    return [{
      model: "schematic-viewer:fallback",
      resolvedModel: { textures: { all: fallbackTexture }, elements: fallbackElements("#all") },
    }];
  }

  fallbackTextureFor(id, textures = {}) {
    const particle = this.resolveTextureReference("#particle", textures);
    if (particle) return particle;
    const { namespace, path } = splitId(id);
    if (path === "water") return `${namespace}:block/water_still`;
    if (path === "lava") return `${namespace}:block/lava_still`;
    return `${namespace}:block/${path}`;
  }

  async getModel(id) {
    if (!id) return null;
    if (!this.modelCache.has(id)) this.modelCache.set(id, this.resolveModel(id, new Set()));
    return this.modelCache.get(id);
  }

  async resolveModel(id, ancestors) {
    if (ancestors.has(id)) throw new Error(`方块模型存在循环继承：${id}`);
    const nextAncestors = new Set(ancestors).add(id);
    const { namespace, path } = splitId(id, "block");
    const model = await this.fetchJson(`${this.assetRoot}/${namespace}/models/${path}.json`);
    if (!model) return null;

    const parent = model.parent && !model.parent.startsWith("builtin/")
      ? await this.resolveModel(model.parent, nextAncestors)
      : null;

    return {
      ambientocclusion: model.ambientocclusion ?? parent?.ambientocclusion ?? true,
      textures: { ...(parent?.textures ?? {}), ...(model.textures ?? {}) },
      elements: model.elements ?? parent?.elements ?? [],
      display: { ...(parent?.display ?? {}), ...(model.display ?? {}) },
    };
  }

  resolveTextureReference(reference, textures) {
    let current = reference;
    const visited = new Set();
    while (current?.startsWith("#")) {
      const key = current.slice(1);
      if (visited.has(key)) return null;
      visited.add(key);
      current = textures[key];
    }
    return current || null;
  }

  textureUrl(reference) {
    const { namespace, path } = splitId(reference);
    return `${this.assetRoot}/${namespace}/textures/${path}.png`;
  }

  async loadTexture(reference) {
    if (!reference) return this.missingTexture;
    if (!this.textureCache.has(reference)) {
      this.textureCache.set(reference, new Promise((resolve) => {
        this.textureLoader.load(this.textureUrl(reference), (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestMipmapLinearFilter;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          resolve(texture);
        }, undefined, () => resolve(this.missingTexture));
      }));
    }
    return this.textureCache.get(reference);
  }
}
