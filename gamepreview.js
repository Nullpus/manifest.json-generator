"use strict";

// マイクラ(統合版)のパック画面っぽいプレビュー。manifest の内容から描画する

const TEXT_COLOR = "#FFFFFF"; // パック名・説明文の既定色(ゲーム内でも白)
let selectedSub = 0; // サブパックスライダーで選択中の位置

const mc = (text) => renderMinecraftText(text ?? "", TEXT_COLOR);

function renderSettingRow(s) {
  const label = `<span class="gp-label">${mc(s.text)}</span>`;
  switch (s.type) {
    case "label":
      return `<div class="gp-set gp-set-label">${label}</div>`;
    case "toggle":
      return `<div class="gp-set">${label}<span class="gp-toggle ${s.default ? "on" : ""}"><i></i></span></div>`;
    case "slider": {
      const range = s.max - s.min;
      const pct = Math.min(100, Math.max(0, range > 0 ? ((s.default - s.min) / range) * 100 : 0)) || 0;
      return `<div class="gp-set gp-set-col">${label}
        <div class="gp-slider"><i style="left:${pct}%"></i></div>
        <span class="gp-sub">${esc(String(s.default))}(${esc(String(s.min))} 〜 ${esc(String(s.max))})</span></div>`;
    }
    case "dropdown": {
      const sel = s.options.find((o) => o.name === s.default);
      return `<div class="gp-set">${label}<span class="gp-select">${mc(sel ? sel.text : "")} ▾</span></div>`;
    }
    case "multiselect":
      return `<div class="gp-set gp-set-col">${label}${s.options.map((o) =>
        `<span class="gp-check ${o.name === s.default ? "on" : ""}"><i></i>${mc(o.text)}</span>`).join("")}</div>`;
    default:
      return "";
  }
}

// サブパックのスライダー(各サブパックの位置に目盛り、クリックで選択)
function renderSubpackSlider(subs) {
  const n = subs.length;
  selectedSub = Math.min(selectedSub, n - 1);
  const pos = (i) => (n > 1 ? (i / (n - 1)) * 100 : 0);
  const current = subs[selectedSub];
  return `<div class="gp-set gp-set-col">
    <span class="gp-label">解像度: ${mc(current.name || current.folder_name || "")}</span>
    <div class="gp-subslider" data-count="${n}">
      <div class="gp-track">
        ${subs.map((_, i) => `<b style="left:${pos(i)}%"></b>`).join("")}
        <i style="left:${pos(selectedSub)}%"></i>
      </div>
    </div>
  </div>`;
}

function updateGamePreview(manifest) {
  const h = manifest.header;
  const settings = manifest.format_version === 3 ? manifest.settings ?? [] : [];
  const subs = manifest.subpacks ?? [];

  // パック一覧(名前と説明文)
  let html = `
    <div class="gp-list">
      <div class="gp-name">${h.name.trim() ? mc(h.name) : '<span class="gp-empty">(名前なし)</span>'}</div>
      <div class="gp-desc">${mc(h.description)}</div>
    </div>`;

  // ⚙ から開く設定画面
  if (settings.length || subs.length) {
    html += `
    <p class="hint">⚙ から開く設定画面:</p>
    <div class="gp-dialog">
      <div class="gp-dtitle"><span>${mc(h.name)} Settings</span><span class="gp-x">×</span></div>
      <div class="gp-dbody">
        ${subs.length ? renderSubpackSlider(subs) : ""}
        ${settings.map(renderSettingRow).join("")}
      </div>
    </div>`;
  }

  $("gameScreens").innerHTML = html;
}

function initGamePreview() {
  // サブパックスライダーをクリックした位置の目盛りを選択
  $("gameScreens").addEventListener("click", (e) => {
    const slider = e.target.closest(".gp-subslider");
    if (!slider) return;
    const n = Number(slider.dataset.count);
    const r = slider.querySelector(".gp-track").getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    selectedSub = n > 1 ? Math.round(frac * (n - 1)) : 0;
    update();
  });
}
