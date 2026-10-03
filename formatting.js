"use strict";

// Minecraft の装飾コード(§)の定義とプレビュー描画

const MC_COLORS = [
  // Java / 統合版 共通
  { c: "0", name: "黒", hex: "#000000" },
  { c: "1", name: "濃い青", hex: "#0000AA" },
  { c: "2", name: "濃い緑", hex: "#00AA00" },
  { c: "3", name: "濃い水色", hex: "#00AAAA" },
  { c: "4", name: "濃い赤", hex: "#AA0000" },
  { c: "5", name: "濃い紫", hex: "#AA00AA" },
  { c: "6", name: "金", hex: "#FFAA00" },
  { c: "7", name: "灰", hex: "#AAAAAA" },
  { c: "8", name: "濃い灰", hex: "#555555" },
  { c: "9", name: "青", hex: "#5555FF" },
  { c: "a", name: "緑", hex: "#55FF55" },
  { c: "b", name: "水色", hex: "#55FFFF" },
  { c: "c", name: "赤", hex: "#FF5555" },
  { c: "d", name: "ピンク", hex: "#FF55FF" },
  { c: "e", name: "黄", hex: "#FFFF55" },
  { c: "f", name: "白", hex: "#FFFFFF" },
];

// 統合版のみ
const MC_BEDROCK_COLORS = [
  { c: "g", name: "マインコイン金", hex: "#DDD605" },
  { c: "h", name: "クォーツ", hex: "#E3D4D1" },
  { c: "i", name: "鉄", hex: "#CECACA" },
  { c: "j", name: "ネザライト", hex: "#443A3B" },
  { c: "m", name: "レッドストーン", hex: "#971607" },
  { c: "n", name: "銅", hex: "#B4684D" },
  { c: "p", name: "金(素材)", hex: "#DEB12D" },
  { c: "q", name: "エメラルド", hex: "#47A036" },
  { c: "s", name: "ダイヤモンド", hex: "#2CBAA8" },
  { c: "t", name: "ラピス", hex: "#21497B" },
  { c: "u", name: "アメジスト", hex: "#9A5CC6" },
];

const MC_STYLES = [
  { c: "l", name: "太字" },
  { c: "o", name: "斜体" },
  { c: "k", name: "難読化" },
  { c: "r", name: "リセット" },
];

const MC_COLOR_MAP = Object.fromEntries([...MC_COLORS, ...MC_BEDROCK_COLORS].map((x) => [x.c, x.hex]));
const MC_FIELDS = ["name", "description"];
const OBF_CHARS = "!#$%&*+<=>?@ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Minecraft 風の影(文字色の 1/4 の明るさ)
function shadowOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) / 4 | 0}, ${((n >> 8) & 255) / 4 | 0}, ${(n & 255) / 4 | 0})`;
}

// § コードを解釈して HTML にする。色は上書き、装飾(太字など)は §r まで継続
function renderMinecraftText(text, base = "#FFFFFF") {
  let color = base, bold = false, italic = false, obf = false;
  let out = "", buf = "";

  const flush = () => {
    if (!buf) return;
    const style = `color:${color};text-shadow:.1em .1em 0 ${shadowOf(color)};` +
      (bold ? "font-weight:700;" : "") + (italic ? "font-style:italic;" : "");
    out += obf
      ? `<span class="mc-k" style="${style}" data-orig="${escHtml(buf)}">${escHtml(buf)}</span>`
      : `<span style="${style}">${escHtml(buf)}</span>`;
    buf = "";
  };

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "§" && i + 1 < text.length) {
      const code = text[i + 1].toLowerCase();
      flush();
      if (MC_COLOR_MAP[code]) color = MC_COLOR_MAP[code];
      else if (code === "l") bold = true;
      else if (code === "o") italic = true;
      else if (code === "k") obf = true;
      else if (code === "r") { color = base; bold = italic = obf = false; }
      i++; // コード文字を消費(未知のコードも表示しない)
    } else {
      buf += text[i];
    }
  }
  flush();
  return out;
}

function insertAtCursor(el, str) {
  const pos = el.selectionStart ?? el.value.length;
  el.value = el.value.slice(0, pos) + str + el.value.slice(el.selectionEnd ?? pos);
  el.focus();
  el.setSelectionRange(pos + str.length, pos + str.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function buildPalette(el) {
  const swatch = (x) =>
    `<button type="button" class="mc-sw" data-code="${x.c}" title="§${x.c} ${x.name}" aria-label="§${x.c} ${x.name}" style="background:${x.hex}"></button>`;
  return `
    <summary data-tip="mcCodes">§ 装飾コード</summary>
    <div class="mc-palette">
      <div>${MC_COLORS.map(swatch).join("")}</div>
      <div class="mc-group"><span class="hint">統合版のみ:</span> ${MC_BEDROCK_COLORS.map(swatch).join("")}</div>
      <div class="mc-group">
        ${MC_STYLES.map((s) => `<button type="button" class="mc-fmt" data-code="${s.c}" title="§${s.c} ${s.name}">§${s.c} ${s.name}</button>`).join("")}
        <button type="button" class="mc-fmt" data-code="§" title="§ 記号そのものを入力">§</button>
        <button type="button" class="mc-fmt" data-toggle-bg title="プレビューの背景色を切り替え">背景切替</button>
      </div>
    </div>`;
}

function updatePreview(id) {
  const preview = document.querySelector(`[data-preview-for="${id}"]`);
  const text = document.getElementById(id).value;
  preview.hidden = !text.includes("§");
  if (!preview.hidden) preview.innerHTML = renderMinecraftText(text);
}

function initFormatting() {
  MC_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    const tools = document.querySelector(`[data-for="${id}"]`);
    tools.innerHTML = buildPalette(el);

    // ボタンを押してもテキスト欄のカーソル/選択を失わないようにする
    tools.addEventListener("mousedown", (e) => e.target.closest("button") && e.preventDefault());
    tools.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.hasAttribute("data-toggle-bg")) {
        document.body.classList.toggle("light-preview");
      } else {
        insertAtCursor(el, btn.dataset.code === "§" ? "§" : `§${btn.dataset.code}`);
      }
    });

    el.addEventListener("input", () => updatePreview(id));
    updatePreview(id);
  });

  // 難読化(§k)の文字をパラパラ切り替える
  setInterval(() => {
    document.querySelectorAll(".mc-k").forEach((span) => {
      span.textContent = [...span.dataset.orig]
        .map((ch) => (ch.trim() ? OBF_CHARS[Math.floor(Math.random() * OBF_CHARS.length)] : ch))
        .join("");
    });
  }, 80);
}
