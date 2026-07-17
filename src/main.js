import "./style.css";
import { MinecraftResources } from "./resources.js";
import { normalizeSchematic, parseNbt } from "./nbt.js";
import { SchematicViewer } from "./viewer.js";

const icon = (name) => {
  const paths = {
    upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12v9"/>',
    focus: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3"/>',
    grid: '<path d="M4 4h16v16H4zM4 10h16M10 4v16"/>',
    rotate: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.2 9A7 7 0 0 0 6.3 6.3L4 9m16 6-2.3 2.7A7 7 0 0 1 5.8 15"/>',
    camera: '<path d="M5 8h2l1.5-2h7L17 8h2a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
};

document.querySelector("#app").innerHTML = `
  <main class="app-shell">
    <aside class="sidebar">
      <header class="brand">
        <span class="brand-mark">${icon("cube")}</span>
        <span><strong>Schematic</strong><small>VIEWER · 1.21.11</small></span>
      </header>

      <section class="upload-zone" id="upload-zone" tabindex="0" role="button" aria-label="选择 schem 文件">
        <span class="upload-icon">${icon("upload")}</span>
        <strong>载入结构文件</strong>
        <p>拖放到此处，或点击浏览</p>
        <span class="file-type">WORLDEDIT · .SCHEM</span>
        <input id="file-input" type="file" accept=".schem,application/octet-stream" hidden />
      </section>

      <section class="file-summary is-hidden" id="file-summary">
        <div class="section-heading"><span>当前文件</span><button id="replace-file" class="text-button">替换</button></div>
        <div class="file-row"><span class="mini-cube">${icon("cube")}</span><span><strong id="file-name"></strong><small id="file-meta"></small></span></div>
      </section>

      <section class="stats-section is-hidden" id="stats-section">
        <div class="section-heading"><span>结构概览</span><span id="schem-version" class="version-chip"></span></div>
        <div class="stats-grid">
          <div><span>尺寸</span><strong id="stat-size">—</strong></div>
          <div><span>方块</span><strong id="stat-blocks">—</strong></div>
          <div><span>体积</span><strong id="stat-volume">—</strong></div>
          <div><span>种类</span><strong id="stat-types">—</strong></div>
        </div>
      </section>

      <section class="palette-section is-hidden" id="palette-section">
        <div class="section-heading"><span>方块构成</span><span id="palette-count"></span></div>
        <div class="palette-list" id="palette-list"></div>
      </section>

      <footer class="sidebar-footer"><span class="status-dot"></span> 本地解析 · 文件不会上传</footer>
    </aside>

    <section class="viewport-shell">
      <header class="toolbar">
        <div class="view-switcher" aria-label="视角">
          <button class="view-button is-active" data-view="iso">透视</button>
          <button class="view-button" data-view="front">正面</button>
          <button class="view-button" data-view="side">侧面</button>
          <button class="view-button" data-view="top">俯视</button>
        </div>
        <div class="toolbar-actions">
          <button class="icon-button is-active" id="grid-button" title="网格">${icon("grid")}</button>
          <button class="icon-button" id="rotate-button" title="自动旋转">${icon("rotate")}</button>
          <button class="icon-button" id="focus-button" title="适应窗口">${icon("focus")}</button>
          <span class="toolbar-divider"></span>
          <button class="icon-button" id="screenshot-button" title="保存截图">${icon("camera")}</button>
        </div>
      </header>

      <div class="viewport" id="viewport">
        <canvas id="scene-canvas"></canvas>
        <div class="ambient-glow"></div>
        <section class="empty-state" id="empty-state">
          <div class="empty-cube"><i></i><i></i><i></i></div>
          <span class="eyebrow">准备就绪</span>
          <h1>把你的构想<br />放进真实的空间</h1>
          <p>载入 WorldEdit 结构文件，使用 Minecraft 1.21.11 原版模型与材质即时预览。</p>
          <button class="primary-button" id="empty-open">${icon("upload")} 选择 .schem 文件</button>
          <div class="feature-row"><span>原版材质</span><span>NBT 本地解析</span><span>自由视角</span></div>
        </section>

        <section class="loading-panel is-hidden" id="loading-panel">
          <div class="loading-cube"><span></span><span></span><span></span></div>
          <strong id="loading-title">正在读取结构</strong>
          <p id="loading-message">解析 NBT 数据…</p>
          <div class="progress-track"><i id="progress-bar"></i></div>
          <small id="progress-value">0%</small>
        </section>

        <div class="hover-chip is-hidden" id="hover-chip"></div>
        <aside class="inspector is-hidden" id="inspector">
          <div class="inspector-head"><span>已选方块</span><b id="selected-position"></b></div>
          <strong id="selected-name"></strong>
          <code id="selected-id"></code>
          <div id="selected-properties" class="properties"></div>
        </aside>

        <section class="layer-control is-hidden" id="layer-control">
          <span>${icon("layers")}</span>
          <label><b>垂直剖切</b><small id="layer-label">全部层</small></label>
          <input id="layer-slider" type="range" min="0" max="1" value="1" />
          <button id="slice-toggle" aria-pressed="false">关闭</button>
        </section>

        <div class="mouse-help"><span>左键旋转</span><span>右键平移</span><span>滚轮缩放</span></div>
      </div>
    </section>
  </main>
  <div class="toast" id="toast"></div>
`;

const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
const resources = new MinecraftResources();
const viewer = new SchematicViewer(elements["scene-canvas"], resources, {
  onHover: (block) => {
    elements["hover-chip"].classList.toggle("is-hidden", !block);
    if (block) elements["hover-chip"].textContent = `${friendlyName(block.id)} · ${block.x}, ${block.y}, ${block.z}`;
  },
  onSelect: showSelectedBlock,
});

let currentSchematic = null;
let sliceEnabled = false;

function friendlyName(id) {
  return id.replace(/^minecraft:/, "").split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function showToast(message, type = "info") {
  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3600);
}

function setLoading(visible, progress = 0, message = "解析 NBT 数据…") {
  elements["loading-panel"].classList.toggle("is-hidden", !visible);
  elements["progress-bar"].style.width = `${Math.round(progress * 100)}%`;
  elements["progress-value"].textContent = `${Math.round(progress * 100)}%`;
  elements["loading-message"].textContent = message;
}

function renderPalette(schematic) {
  const entries = [...schematic.counts.entries()]
    .filter(([state]) => !/(^|:)\w*air(?:\[|$)/.test(state))
    .sort((a, b) => b[1] - a[1]);
  const maximum = entries[0]?.[1] ?? 1;
  elements["palette-list"].replaceChildren(...entries.slice(0, 80).map(([state, count], index) => {
    const id = state.split("[")[0];
    const row = document.createElement("div");
    row.className = "palette-row";
    row.innerHTML = `<i style="--swatch:${swatchColor(id, index)}"></i><span><b></b><small><em style="width:${Math.max(3, count / maximum * 100)}%"></em></small></span><strong>${formatNumber(count)}</strong>`;
    row.querySelector("b").textContent = friendlyName(id);
    row.title = state;
    return row;
  }));
  elements["palette-count"].textContent = `${entries.length} 种`;
}

function swatchColor(id, index) {
  const known = [
    [/(grass|leaves|moss|vine)/, "#79a95c"],
    [/(stone|cobble|andesite|gravel)/, "#8b918d"],
    [/(wood|log|planks|chest)/, "#a77b4c"],
    [/(water|ice)/, "#5d92c9"],
    [/(sand|sandstone)/, "#d6c48c"],
    [/(brick|terracotta)/, "#a96553"],
  ];
  return known.find(([pattern]) => pattern.test(id))?.[1] ?? `hsl(${(index * 47 + 22) % 360} 28% 58%)`;
}

function showSelectedBlock(block) {
  elements.inspector.classList.remove("is-hidden");
  elements["selected-position"].textContent = `${block.x} / ${block.y} / ${block.z}`;
  elements["selected-name"].textContent = friendlyName(block.id);
  elements["selected-id"].textContent = block.id;
  const propertyEntries = Object.entries(block.properties);
  elements["selected-properties"].replaceChildren(...propertyEntries.map(([name, value]) => {
    const item = document.createElement("span");
    item.innerHTML = `<b></b><em></em>`;
    item.querySelector("b").textContent = name;
    item.querySelector("em").textContent = value;
    return item;
  }));
  elements["selected-properties"].classList.toggle("is-empty", propertyEntries.length === 0);
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > 200 * 1024 * 1024) {
    showToast("文件超过 200 MB，浏览器可能无法安全处理", "error");
    return;
  }
  elements["empty-state"].classList.add("is-hidden");
  elements.inspector.classList.add("is-hidden");
  elements["loading-title"].textContent = "正在读取结构";
  setLoading(true, 0.02, "解压并解析 NBT 数据…");

  try {
    const parsed = await parseNbt(file);
    setLoading(true, 0.06, "正在校验 WorldEdit 结构…");
    const schematic = normalizeSchematic(parsed);
    currentSchematic = schematic;
    elements["loading-title"].textContent = "正在生成预览";
    await viewer.load(schematic, (progress, message) => setLoading(true, 0.07 + progress * 0.92, message));

    elements["file-name"].textContent = file.name;
    elements["file-meta"].textContent = `${(file.size / 1024).toFixed(file.size > 1024 * 1024 ? 0 : 1)} KB · DataVersion ${schematic.dataVersion || "未知"}`;
    elements["schem-version"].textContent = `SCHEM v${schematic.version || "?"}`;
    elements["stat-size"].textContent = `${schematic.width} × ${schematic.height} × ${schematic.length}`;
    elements["stat-blocks"].textContent = formatNumber(schematic.visibleBlocks);
    elements["stat-volume"].textContent = formatNumber(schematic.volume);
    elements["stat-types"].textContent = formatNumber(schematic.palette.filter(Boolean).length);
    renderPalette(schematic);
    for (const id of ["file-summary", "stats-section", "palette-section", "layer-control"]) elements[id].classList.remove("is-hidden");
    elements["layer-slider"].max = Math.max(0, schematic.height - 1);
    elements["layer-slider"].value = schematic.height - 1;
    elements["layer-label"].textContent = "全部层";
    sliceEnabled = false;
    elements["slice-toggle"].textContent = "关闭";
    elements["slice-toggle"].setAttribute("aria-pressed", "false");
    viewer.setSlice(false, schematic.height - 1);
    setLoading(false);
    showToast(`已载入 ${formatNumber(schematic.visibleBlocks)} 个可见方块`);
  } catch (error) {
    console.error(error);
    setLoading(false);
    elements["empty-state"].classList.remove("is-hidden");
    showToast(error instanceof Error ? error.message : "无法读取该结构文件", "error");
  }
}

function openFilePicker() {
  elements["file-input"].click();
}

elements["upload-zone"].addEventListener("click", openFilePicker);
elements["upload-zone"].addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") openFilePicker();
});
elements["empty-open"].addEventListener("click", openFilePicker);
elements["replace-file"].addEventListener("click", openFilePicker);
elements["file-input"].addEventListener("change", (event) => loadFile(event.target.files[0]));

for (const target of [elements["upload-zone"], elements.viewport]) {
  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements["upload-zone"].classList.add("is-dragging");
  });
  target.addEventListener("dragleave", () => elements["upload-zone"].classList.remove("is-dragging"));
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    elements["upload-zone"].classList.remove("is-dragging");
    loadFile(event.dataTransfer.files[0]);
  });
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
  viewer.setView(button.dataset.view);
}));

elements["grid-button"].addEventListener("click", () => {
  const active = elements["grid-button"].classList.toggle("is-active");
  viewer.setGrid(active);
});
elements["rotate-button"].addEventListener("click", () => {
  const active = elements["rotate-button"].classList.toggle("is-active");
  viewer.setAutoRotate(active);
});
elements["focus-button"].addEventListener("click", () => viewer.fitView());
elements["screenshot-button"].addEventListener("click", () => {
  if (!currentSchematic) return showToast("请先载入一个结构文件");
  viewer.screenshot();
});
elements["slice-toggle"].addEventListener("click", () => {
  sliceEnabled = !sliceEnabled;
  elements["slice-toggle"].textContent = sliceEnabled ? "开启" : "关闭";
  elements["slice-toggle"].setAttribute("aria-pressed", String(sliceEnabled));
  viewer.setSlice(sliceEnabled, Number(elements["layer-slider"].value));
});
elements["layer-slider"].addEventListener("input", () => {
  const layer = Number(elements["layer-slider"].value);
  elements["layer-label"].textContent = currentSchematic && layer === currentSchematic.height - 1 ? "全部层" : `显示至 Y ${layer}`;
  if (!sliceEnabled) {
    sliceEnabled = true;
    elements["slice-toggle"].textContent = "开启";
    elements["slice-toggle"].setAttribute("aria-pressed", "true");
  }
  viewer.setSlice(true, layer);
});

fetch(`${import.meta.env.BASE_URL}minecraft/assets/minecraft/blockstates/stone.json`, { method: "HEAD" })
  .then((response) => {
    if (!response.ok) showToast("未找到游戏资源，请先运行 npm run assets", "error");
  })
  .catch(() => showToast("未找到游戏资源，请先运行 npm run assets", "error"));

if (import.meta.env.DEV) {
  window.__SCHEMATIC_VIEWER__ = { resources, viewer, parseNbt, normalizeSchematic };
}
