"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const TOOL_NAME = "manifest-json-generator";
const TOOL_VERSION = "1.0.0";

// パック種別ごとに選べるモジュールと既定値
const PACK_TYPES = {
  behavior: { modules: ["data", "script", "client_data"], defaults: ["data"] },
  resource: { modules: ["resources"], defaults: ["resources"] },
  world_template: { modules: ["world_template"], defaults: ["world_template"] },
  skin: { modules: ["skin_pack", "persona_piece"], defaults: ["skin_pack"] },
};

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const INVALID_FOLDER = /[\\/:*?"<>|]/;
const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- state ---
const uuids = { header: crypto.randomUUID() };
const deps = [];     // { kind: "uuid"|"module", uuid, module_name, version }
const settings = []; // { type, text, name, default, min, max, step, options:[{text,name}] }
const subpacks = []; // { folder_name, name, tier }
let currentModules = new Set(PACK_TYPES.behavior.defaults);
let warnings = [];

const packType = () => $("packType").value;
const fmt = () => Number($("formatVersion").value);
// platform_locked は v1 非対応、v3 ではスキン/ビヘイビアのみ
const platformLockedApplies = () =>
  fmt() !== 1 && (fmt() === 3 ? ["behavior", "skin"].includes(packType()) : packType() !== "world_template");
const uuidFor = (key) => (uuids[key] ??= crypto.randomUUID());

// v1/v2 は [a,b,c]、v3 は semver 文字列。不正なら null
function ver(str, label) {
  const s = str.trim();
  if (fmt() === 3) {
    if (SEMVER.test(s)) return s;
  } else if (/^\d+\.\d+\.\d+$/.test(s)) {
    return s.split(".").map(Number);
  }
  warnings.push(`${label} のバージョン形式が不正です(例: 1.0.0)`);
  return fmt() === 3 ? "1.0.0" : [1, 0, 0];
}

function buildManifest() {
  warnings = [];
  const type = packType();
  const f = fmt();

  const header = {
    name: $("name").value,
    description: $("description").value,
    uuid: uuids.header,
    version: ver($("version").value, "version"),
  };
  if (!header.name.trim()) warnings.push("name は必須です");
  if (type === "behavior" || type === "resource") {
    header.min_engine_version = ver($("minEngine").value, "min_engine_version");
  }
  if (platformLockedApplies() && $("platformLocked").checked) header.platform_locked = true;
  if (type === "resource" && $("packScope").value) header.pack_scope = $("packScope").value;
  if (type === "world_template") {
    header.base_game_version = ver($("baseGame").value, "base_game_version");
    header.lock_template_options = $("lockTemplate").checked;
    if ($("randomSeed").checked) header.allow_random_seed = true;
  }

  const mods = [...currentModules];
  if (!mods.length) warnings.push("モジュールを1つ以上選んでください");
  const modules = mods.map((t) => {
    const m = { type: t, uuid: uuidFor(t), version: header.version };
    const d = $("moduleDesc").value.trim();
    if (d) m.description = d;
    if (t === "script") {
      m.language = "javascript";
      m.entry = $("scriptEntry").value;
    }
    return m;
  });

  if (f === 1 && currentModules.has("persona_piece")) warnings.push("persona_piece は format_version 2 以上で使います");
  const manifest = { format_version: f, header, modules };

  if (type !== "skin") {
    const dependencies = [];
    deps.forEach((d, i) => {
      if (d.kind === "module") {
        if (!d.module_name.trim()) return;
        // スクリプトモジュール依存のバージョンは常に文字列
        dependencies.push({ module_name: d.module_name.trim(), version: d.version.trim() });
      } else {
        if (!UUID_RE.test(d.uuid.trim())) {
          warnings.push(`依存 #${i + 1}: UUID の形式が不正です`);
          return;
        }
        dependencies.push({ uuid: d.uuid.trim(), version: ver(d.version, `依存 #${i + 1}`) });
      }
    });
    if (dependencies.length) manifest.dependencies = dependencies;
    if (currentModules.has("script") && !deps.some((d) => d.kind === "module" && d.module_name.trim())) {
      warnings.push("script モジュールには @minecraft/server などのモジュール依存が通常必要です");
    }

    if (type === "resource" && subpacks.length) {
      const seen = new Set();
      manifest.subpacks = subpacks.map((s, i) => {
        const label = `サブパック #${i + 1}`;
        if (!s.folder_name.trim() || !s.name.trim()) warnings.push(`${label}: folder_name と name は必須です`);
        if (INVALID_FOLDER.test(s.folder_name)) warnings.push(`${label}: folder_name に使えない文字(\\ / : * ? " < > |)が含まれています`);
        if (s.folder_name.trim() && seen.has(s.folder_name)) warnings.push(`${label}: folder_name "${s.folder_name}" が重複しています`);
        seen.add(s.folder_name);
        return { folder_name: s.folder_name, name: s.name, memory_performance_tier: Number(s.tier) };
      });
    }

    const caps = [...document.querySelectorAll("#capabilities input:checked")].map((c) => c.value);
    if (caps.length) manifest.capabilities = caps;
  }

  const metadata = {};
  const authors = $("authors").value.split(",").map((a) => a.trim()).filter(Boolean);
  if (authors.length) metadata.authors = authors;
  else if (f === 3) warnings.push("format_version 3 では metadata.authors の設定が必要です");
  if ($("license").value.trim()) metadata.license = $("license").value.trim();
  if ($("url").value.trim()) metadata.url = $("url").value.trim();
  if ($("productAddon").checked && type !== "skin") metadata.product_type = "addon";
  if ($("generatedWith").checked) metadata.generated_with = { [TOOL_NAME]: [TOOL_VERSION] };
  if (Object.keys(metadata).length) manifest.metadata = metadata;

  if (f === 3 && settings.length) {
    manifest.settings = settings.map((s, i) => buildSetting(s, i));
  }
  return manifest;
}

function buildSetting(s, i) {
  const n = (v, label) => {
    const x = Number(v);
    if (v === "" || Number.isNaN(x)) warnings.push(`設定 #${i + 1}: ${label} は数値で入力してください`);
    return x;
  };
  if (s.type === "label") return { type: "label", text: s.text };
  if (!s.name.trim()) warnings.push(`設定 #${i + 1}: name は必須です`);
  else if (!s.name.includes(":")) warnings.push(`設定 #${i + 1}: name には名前空間が必要です(例: my_ns:option)`);
  if (s.type === "toggle") {
    return { type: "toggle", text: s.text, name: s.name, default: s.default === "true" };
  }
  if (s.type === "dropdown" || s.type === "multiselect") {
    if (!s.options.length || s.options.some((o) => !o.name.trim() || !o.text.trim())) {
      warnings.push(`設定 #${i + 1}: 選択肢の text と name をすべて入力してください`);
    } else if (!s.options.some((o) => o.name === s.default)) {
      warnings.push(`設定 #${i + 1}: default は選択肢の name のいずれかにしてください`);
    }
    return {
      type: s.type, text: s.text, name: s.name,
      options: s.options.map((o) => ({ text: o.text, name: o.name })), default: s.default,
    };
  }
  return {
    type: "slider", text: s.text, name: s.name,
    min: n(s.min, "min"), max: n(s.max, "max"), step: n(s.step, "step"), default: n(s.default, "default"),
  };
}

// --- ⓘ ヘルプアイコン ---
const ICON_SRC = "information_mark.svg";
const tooltip = $("tooltip");

// data-tip を持つ要素の最初のテキストの直後に ⓘ を挿入(テキストが無ければ末尾)
function decorate(root = document) {
  root.querySelectorAll("[data-tip]").forEach((el) => {
    const text = TIPS[el.dataset.tip];
    if (!text || el.querySelector(":scope > .info")) return;
    const img = document.createElement("img");
    img.src = ICON_SRC;
    img.className = "info";
    img.alt = "";
    img.tabIndex = 0;
    img.dataset.text = text;
    img.setAttribute("aria-label", text);
    const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    node ? node.after(img) : el.append(img);
  });
}

function showTip(icon) {
  tooltip.textContent = icon.dataset.text;
  tooltip.hidden = false;
  const r = icon.getBoundingClientRect();
  const w = tooltip.offsetWidth;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  const below = r.bottom + 8 + tooltip.offsetHeight < window.innerHeight;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${below ? r.bottom + 8 : r.top - 8 - tooltip.offsetHeight}px`;
}
const hideTip = () => (tooltip.hidden = true);

document.addEventListener("mouseover", (e) => e.target.classList?.contains("info") && showTip(e.target));
document.addEventListener("mouseout", (e) => e.target.classList?.contains("info") && hideTip());
document.addEventListener("focusin", (e) => e.target.classList?.contains("info") && showTip(e.target));
document.addEventListener("focusout", hideTip);
window.addEventListener("scroll", hideTip, true);

// --- rendering ---
function renderModuleChoices() {
  const def = PACK_TYPES[packType()];
  $("modules").innerHTML = def.modules
    .map((m) => `<label data-tip="mod_${m}"><input type="checkbox" value="${m}" ${currentModules.has(m) ? "checked" : ""}> ${m}</label>`)
    .join("");
  decorate($("modules"));
}

function renderUuids() {
  $("headerUuid").value = uuids.header;
  $("moduleUuids").innerHTML = [...currentModules]
    .map((m) => `
      <div class="uuid-row">
        <label data-tip="uuids">${esc(m)} モジュールの UUID
          <input type="text" readonly value="${uuidFor(m)}">
        </label>
        <button type="button" data-regen="${esc(m)}">再生成</button>
      </div>`)
    .join("");
  decorate($("moduleUuids"));
}

function renderDeps() {
  $("deps").innerHTML = deps.map((d, i) => `
    <div class="item">
      <div class="row">
        <label data-tip="dep_kind">種類
          <select data-list="deps" data-i="${i}" data-f="kind">
            <option value="uuid" ${d.kind === "uuid" ? "selected" : ""}>パック (uuid)</option>
            <option value="module" ${d.kind === "module" ? "selected" : ""}>スクリプトモジュール (module_name)</option>
          </select>
        </label>
        ${d.kind === "module"
          ? `<label data-tip="dep_module">module_name <input type="text" list="moduleNames" data-list="deps" data-i="${i}" data-f="module_name" value="${esc(d.module_name)}"></label>`
          : `<label data-tip="dep_uuid">uuid <input type="text" data-list="deps" data-i="${i}" data-f="uuid" value="${esc(d.uuid)}"></label>`}
        <label data-tip="dep_version">version
          <input type="text" data-list="deps" data-i="${i}" data-f="version" value="${esc(d.version)}">
        </label>
        <button type="button" data-remove="deps" data-i="${i}">削除</button>
      </div>
    </div>`).join("");
  decorate($("deps"));
}

function renderSettings() {
  $("settings").innerHTML = settings.map((s, i) => {
    const inp = (field, label, tip = `st_${field}`) =>
      `<label data-tip="${tip}">${label} <input type="text" data-list="settings" data-i="${i}" data-f="${field}" value="${esc(s[field])}"></label>`;
    let body = inp("text", "text");
    if (s.type === "toggle") {
      body += inp("name", "name") + `<label data-tip="st_default">default
        <select data-list="settings" data-i="${i}" data-f="default">
          <option value="true" ${s.default === "true" ? "selected" : ""}>true</option>
          <option value="false" ${s.default === "false" ? "selected" : ""}>false</option>
        </select></label>`;
    } else if (s.type === "slider") {
      body += inp("name", "name") + inp("min", "min") + inp("max", "max") + inp("step", "step") + inp("default", "default");
    } else if (s.type === "dropdown" || s.type === "multiselect") {
      body += inp("name", "name") + inp("default", "default(選択肢の name)", "st_dd_default");
    }
    let opts = "";
    if (s.type === "dropdown" || s.type === "multiselect") {
      opts = s.options.map((o, j) => `
        <div class="row wrap opt">
          <label data-tip="st_opt_text">選択肢 text <input type="text" data-list="settings" data-i="${i}" data-opt="${j}" data-f="text" value="${esc(o.text)}"></label>
          <label data-tip="st_opt_name">選択肢 name <input type="text" data-list="settings" data-i="${i}" data-opt="${j}" data-f="name" value="${esc(o.name)}"></label>
          <button type="button" data-remove-option="${j}" data-i="${i}">×</button>
        </div>`).join("") + `<button type="button" data-add-option="${i}">+ 選択肢</button>`;
    }
    return `<div class="item"><strong>${s.type}</strong><div class="row wrap">${body}
      <button type="button" data-remove="settings" data-i="${i}">削除</button></div>${opts}</div>`;
  }).join("");
  decorate($("settings"));
}

const subpackPath = (s) => `subpacks/${esc(s.folder_name.trim() || "<folder_name>")}/`;

function renderSubpacks() {
  $("subpacks").innerHTML = subpacks.map((s, i) => `
    <div class="item"><div class="row wrap">
      <label data-tip="sp_folder">folder_name <input type="text" data-list="subpacks" data-i="${i}" data-f="folder_name" value="${esc(s.folder_name)}" placeholder="low"></label>
      <label data-tip="sp_name">name <input type="text" data-list="subpacks" data-i="${i}" data-f="name" value="${esc(s.name)}"></label>
      <label data-tip="sp_tier">memory_performance_tier
        <select data-list="subpacks" data-i="${i}" data-f="tier">
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${String(s.tier) === String(n) ? "selected" : ""}>${n}</option>`).join("")}
        </select></label>
      <button type="button" data-remove="subpacks" data-i="${i}">削除</button>
    </div>
    <p class="hint path">配置先: <code data-path="${i}">${subpackPath(s)}</code></p></div>`).join("");
  decorate($("subpacks"));
}

function applyPackTypeUI() {
  const type = packType();
  const isSkin = type === "skin";
  // format_version 1 はスキンパック専用
  $("formatVersion").querySelector('option[value="1"]').disabled = !isSkin;
  $("formatHint").textContent = fmt() === 1
    ? "format_version 1 は旧形式です(スキンパック向け)。"
    : fmt() === 3
      ? "v3 はプレビュー版(Minecraft 1.21.110 以降)。バージョンは semver 文字列(例 1.0.0)になり、metadata.authors が必要です。"
      : "リソース / ビヘイビア / ワールドテンプレートは format_version 2 を使います。";
  document.querySelectorAll("[data-types]").forEach((el) => {
    el.hidden = !el.dataset.types.split(" ").includes(type);
  });
  $("settingsSection").hidden = fmt() !== 3;
  $("platformLockedLabel").hidden = !platformLockedApplies();
  $("authorsLabel").textContent = fmt() === 3 ? "authors(v3 では必須・カンマ区切り)" : "authors(カンマ区切り)";
  $("scriptOptions").hidden = !currentModules.has("script");
}

// JSON.stringify の出力のうち、数値や文字列だけの配列(version など)は1行にまとめる
function formatJson(obj) {
  return JSON.stringify(obj, null, 2).replace(/\[\n[^\[\]{}]*?\n\s*\]/g, (m) =>
    "[" + m.slice(1, -1).split("\n").map((l) => l.trim()).filter(Boolean).join(" ") + "]");
}

function update() {
  applyPackTypeUI();
  const manifest = buildManifest();
  $("output").textContent = formatJson(manifest);
  updateGamePreview(manifest);
  $("warnings").innerHTML = warnings.map((w) => `<li>${esc(w)}</li>`).join("");
}

function refreshAll() {
  renderModuleChoices();
  renderUuids();
  update();
}

function flash(msg) {
  $("status").textContent = msg;
  setTimeout(() => ($("status").textContent = ""), 2000);
}

// --- events ---
$("packType").addEventListener("change", () => {
  currentModules = new Set(PACK_TYPES[packType()].defaults);
  const fv = $("formatVersion");
  fv.value = packType() === "skin" ? "1" : fv.value === "1" ? "2" : fv.value;
  refreshAll();
});

$("formatVersion").addEventListener("change", () => {
  // バージョン文字列を新形式に合わせて既定値へ戻す
  update();
});

$("modules").addEventListener("change", (e) => {
  const t = e.target;
  t.checked ? currentModules.add(t.value) : currentModules.delete(t.value);
  // script を初めて選んだら @minecraft/server 依存を提案
  if (t.value === "script" && t.checked && !deps.some((d) => d.kind === "module")) {
    deps.push({ kind: "module", uuid: "", module_name: "@minecraft/server", version: "1.15.0" });
    renderDeps();
  }
  renderUuids();
  update();
});

$("form").addEventListener("input", (e) => {
  const t = e.target;
  const list = t.dataset.list;
  if (list) {
    const arr = { deps, settings, subpacks }[list];
    const target = t.dataset.opt !== undefined ? arr[t.dataset.i].options[t.dataset.opt] : arr[t.dataset.i];
    target[t.dataset.f] = t.value;
    if (t.dataset.f === "kind") renderDeps(); // select のみ再描画(テキスト入力中はフォーカス維持)
    if (list === "subpacks" && t.dataset.f === "folder_name") {
      document.querySelector(`[data-path="${t.dataset.i}"]`).innerHTML = subpackPath(target);
    }
  }
  update();
});

$("form").addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.regen) {
    uuids[t.dataset.regen] = crypto.randomUUID();
    renderUuids();
    update();
  } else if (t.dataset.remove) {
    const key = t.dataset.remove;
    ({ deps, settings, subpacks }[key]).splice(Number(t.dataset.i), 1);
    ({ deps: renderDeps, settings: renderSettings, subpacks: renderSubpacks }[key])();
    update();
  } else if (t.dataset.addOption !== undefined) {
    settings[t.dataset.addOption].options.push({ text: "", name: "" });
    renderSettings();
    update();
  } else if (t.dataset.removeOption !== undefined) {
    settings[t.dataset.i].options.splice(Number(t.dataset.removeOption), 1);
    renderSettings();
    update();
  } else if (t.dataset.addSetting) {
    const type = t.dataset.addSetting;
    const choice = type === "dropdown" || type === "multiselect";
    settings.push({
      type, text: "", name: "", min: "0", max: "10", step: "1",
      default: type === "toggle" ? "true" : choice ? "" : "0",
      options: choice ? [{ text: "", name: "" }] : [],
    });
    renderSettings();
    update();
  }
});

$("addDep").addEventListener("click", () => {
  deps.push({ kind: "uuid", uuid: "", module_name: "", version: fmt() === 3 ? "1.0.0" : "1.0.0" });
  renderDeps();
  update();
});

$("addSubpack").addEventListener("click", () => {
  subpacks.push({ folder_name: "", name: "", tier: "1" });
  renderSubpacks();
  update();
});

// 解像度違いの定番構成を一括追加(既に同じ folder_name があればスキップ)
$("addSubpackPreset").addEventListener("click", () => {
  [["low", "Low", "1"], ["medium", "Medium", "3"], ["high", "High", "5"]].forEach(([folder_name, name, tier]) => {
    if (!subpacks.some((s) => s.folder_name === folder_name)) subpacks.push({ folder_name, name, tier });
  });
  renderSubpacks();
  update();
});

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("output").textContent);
    flash("コピーしました");
  } catch {
    flash("コピーに失敗しました");
  }
});

$("download").addEventListener("click", () => {
  const blob = new Blob([$("output").textContent + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "manifest.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

initFormatting();
initGamePreview();
decorate();
refreshAll();
