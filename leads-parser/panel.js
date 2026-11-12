// Панель 2ГИС: список организаций, выбор и рассылка во ВКонтакте с подстановкой {имя}, {отзывы}, {рейтинг}.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);

let firms = [];
const selected = new Set();
let running = false, stopAsked = false;

const RESULT = {
  sent: ["отправлено", "ok"], already: ["уже писали", "ok"], cannot_message: ["сообщения закрыты", "bad"],
  composer_missing: ["не нашёл поле", "warn"], send_failed: ["не отправилось", "bad"], not_delivered: ["не доставлено", "bad"],
  unconfirmed: ["не подтверждено", "warn"], blocked: ["ВК ограничил", "bad"], not_logged_in: ["не вошли в ВК", "bad"],
  limit: ["лимит на сегодня", "warn"], timeout: ["не ответил", "warn"], error: ["ошибка", "bad"], skipped: ["пропущен", "warn"],
};
const DONE_OK = new Set(["sent", "already"]);
const STOP_ALL = new Set(["blocked", "not_logged_in", "limit"]);
const tag = (r) => { const x = RESULT[r]; return x ? `<span class="tag ${x[1]}">${x[0]}</span>` : ""; };
const realSite = (f) => (f.siteReal === undefined ? !!f.website : f.siteReal);
const vars = (f) => ({ name: f.name, reviews: f.reviews, rating: f.rating });

function visibleFirms() {
  const q = $("q").value.trim().toLowerCase();
  return firms.filter((f) =>
    (!$("fVk").checked || f.vk) &&
    (!$("fNoSite").checked || !realSite(f)) &&
    (!$("fHideSent").checked || !DONE_OK.has(f.vk_result)) &&
    (!q || `${f.name} ${f.rubric} ${f.address}`.toLowerCase().includes(q)));
}

function render() {
  const list = visibleFirms();
  $("count").textContent = `показано ${list.length} из ${firms.length}`;
  $("rows").innerHTML = list.length ? list.map((f) => `
    <tr>
      <td><input type="checkbox" data-id="${esc(f.id)}" ${selected.has(f.id) ? "checked" : ""} ${f.vk ? "" : "disabled title='нет ВК'"} /></td>
      <td><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a><small>${esc([f.rubric, f.address].filter(Boolean).join(" · "))}</small></td>
      <td>${esc(f.phone)}${f.telegram ? `<small><a href="${esc(f.telegram)}" target="_blank" rel="noopener">Telegram</a></small>` : ""}${f.whatsapp ? `<small>WhatsApp ${esc(f.whatsapp)}</small>` : ""}</td>
      <td>${f.vk ? `<a href="${esc(f.vk)}" target="_blank" rel="noopener">${esc(f.vk.replace("https://vk.com/", "vk.com/"))}</a>` : '<span class="muted">—</span>'}</td>
      <td class="num">${f.rating ?? "—"}</td>
      <td class="num">${f.reviews ?? "—"}</td>
      <td>${f.website ? `<a href="${esc(f.website)}" target="_blank" rel="noopener">${realSite(f) ? "есть" : "соцсеть/запись"}</a>` : '<span class="tag ok">нет</span>'}</td>
      <td>${tag(f.vk_result)}${f.vk_detail && !DONE_OK.has(f.vk_result) ? `<small>${esc(f.vk_detail.slice(0, 80))}</small>` : ""}</td>
    </tr>`).join("") : `<tr><td colspan="8" class="empty">Пока пусто. Откройте 2gis.ru, введите поиск и нажмите «Старт» в окне расширения (раздел 2ГИС).</td></tr>`;
  $("all").checked = list.length > 0 && list.filter((f) => f.vk).every((f) => selected.has(f.id));
  $("selCount").textContent = selected.size;
  updatePreview();
}

function firstSelected() { return firms.find((f) => selected.has(f.id)); }
function updatePreview() {
  const f = firstSelected(), t = $("tpl").value;
  const el = $("preview");
  if (!t.trim()) { el.textContent = "—"; el.className = "preview"; return; }
  if (!f) { el.textContent = t; el.className = "preview"; return; }
  const r = fillTemplate(t, vars(f));
  el.textContent = r.error ? `${f.name}: ${r.error}` : r.text;
  el.className = "preview" + (r.error ? " err" : "");
}

async function load() {
  const { dgisFirms = [], dmCount: c } = await chrome.storage.local.get(["dgisFirms", "dmCount"]);
  firms = dgisFirms.slice().sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  const ids = new Set(firms.map((f) => f.id));
  for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);
  const today = new Date().toLocaleDateString("sv");
  $("today").textContent = c && c.date === today ? c.vk || 0 : 0;
  render();
}

function log(text) {
  const d = document.createElement("div");
  d.textContent = new Date().toLocaleTimeString("ru") + " · " + text;
  $("log").prepend(d);
}

async function saveSettings() {
  await chrome.storage.local.set({ vkPanel: { tpl: $("tpl").value, dMin: $("dMin").value, dMax: $("dMax").value, limit: $("limit").value } });
}

// ---------- рассылка ----------
async function sendOne(f, limit) {
  const r = fillTemplate($("tpl").value, vars(f));
  if (r.error) return { result: "skipped", detail: r.error };
  const start = await send({ type: "dmTask", task: { net: "vk", url: f.vk, text: r.text, limit } });
  if (!start || !start.id) return { result: (start && start.result) || "error", detail: (start && start.detail) || "" };
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await sleep(3000);
    const p = await send({ type: "dmPoll", id: start.id });
    if (p && p.state === "done") return { result: p.result || "error", detail: p.detail || "" };
  }
  return { result: "timeout", detail: "" };
}

async function run() {
  const tpl = $("tpl").value;
  if (!tpl.trim()) return alert("Напишите текст сообщения.");
  const chosen = firms.filter((f) => selected.has(f.id) && f.vk && !DONE_OK.has(f.vk_result));
  if (!chosen.length) return alert("Не выбрано ни одного бизнеса с ВК, которому ещё не писали.");
  // бизнесы, для которых нечем заполнить шаблон (например, нет отзывов), пропускаем сразу, без пауз
  const noData = chosen.filter((f) => fillTemplate(tpl, vars(f)).error);
  const queue = chosen.filter((f) => !noData.includes(f));
  for (const f of noData) await send({ type: "dgisMark", id: f.id, result: "skipped", detail: fillTemplate(tpl, vars(f)).error });
  if (noData.length) log(`Пропущено ${noData.length}: нет данных для шаблона (${noData.slice(0, 3).map((f) => f.name).join(", ")}${noData.length > 3 ? "…" : ""})`);
  if (!queue.length) return alert("Ни одному из выбранных нельзя заполнить шаблон: проверьте переменные.");
  const limit = Math.max(1, Number($("limit").value) || 20);
  const dMin = Math.max(20, Number($("dMin").value) || 60), dMax = Math.max(dMin, Number($("dMax").value) || dMin);
  if (!confirm(`Разослать сообщение ${queue.length} бизнесам во ВКонтакте?\nПауза ${dMin}–${dMax} сек, лимит ${limit} в день.`)) return;
  running = true; stopAsked = false; setRunning();
  await saveSettings();
  log(`Старт: ${queue.length} в очереди`);
  let sent = 0;
  for (let i = 0; i < queue.length && !stopAsked; i++) {
    const f = queue[i];
    log(`${i + 1}/${queue.length} ${f.name}: открываю ВК…`);
    const res = await sendOne(f, limit);
    await send({ type: "dgisMark", id: f.id, result: res.result, detail: res.detail });
    log(`${f.name}: ${(RESULT[res.result] || [res.result])[0]}${res.detail ? " — " + res.detail.slice(0, 120) : ""}`);
    if (res.result === "sent") sent++;
    if (STOP_ALL.has(res.result)) { log("Рассылка остановлена: " + RESULT[res.result][0]); break; }
    if (i < queue.length - 1 && !stopAsked) {
      const wait = Math.round(dMin + Math.random() * (dMax - dMin));
      log(`Пауза ${wait} сек`);
      for (let s = 0; s < wait && !stopAsked; s++) await sleep(1000);
    }
  }
  log(`Готово. Отправлено: ${sent}`);
  running = false; setRunning();
}
function setRunning() {
  $("start").textContent = running ? "⏹ Остановить после текущего" : "▶ Разослать выбранным в ВК";
  $("start").classList.toggle("stop", running);
}

// ---------- события ----------
$("rows").addEventListener("change", (e) => {
  const id = e.target.dataset && e.target.dataset.id;
  if (!id) return;
  if (e.target.checked) selected.add(id); else selected.delete(id);
  $("selCount").textContent = selected.size;
  updatePreview();
});
$("all").onchange = () => {
  for (const f of visibleFirms()) if (f.vk) { if ($("all").checked) selected.add(f.id); else selected.delete(f.id); }
  render();
};
for (const id of ["q", "fVk", "fNoSite", "fHideSent"]) $(id).addEventListener("input", render);
$("tpl").addEventListener("input", () => { updatePreview(); saveSettings(); });
for (const id of ["dMin", "dMax", "limit"]) $(id).addEventListener("change", saveSettings);
document.querySelectorAll(".chip[data-var]").forEach((b) => b.onclick = () => {
  const ta = $("tpl"), v = b.dataset.var, s = ta.selectionStart ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + v + ta.value.slice(ta.selectionEnd ?? s);
  ta.focus(); ta.selectionStart = ta.selectionEnd = s + v.length;
  updatePreview(); saveSettings();
});
$("start").onclick = () => { if (running) { stopAsked = true; log("Остановлю после текущего сообщения…"); } else run(); };
$("delSel").onclick = async () => {
  if (!selected.size) return alert("Ничего не выбрано.");
  if (!confirm(`Удалить ${selected.size} организаций из базы расширения?`)) return;
  await send({ type: "dgisDelete", ids: [...selected] });
  selected.clear();
};
$("exportSel").onclick = () => {
  const list = firms.filter((f) => selected.has(f.id));
  if (!list.length) return alert("Ничего не выбрано.");
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = [["name", "Название"], ["phone", "Телефон"], ["vk", "ВКонтакте"], ["telegram", "Telegram"], ["whatsapp", "WhatsApp"], ["email", "Почта"], ["website", "Сайт"], ["reviews", "Отзывы"], ["rating", "Рейтинг"], ["address", "Адрес"], ["url", "Ссылка 2ГИС"]];
  const csv = [cols.map((c) => cell(c[1])).join(",")].concat(list.map((f) => cols.map((c) => cell(f[c[0]])).join(","))).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `2gis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};
chrome.storage.onChanged.addListener((ch) => { if (ch.dgisFirms || ch.dmCount) load(); });

(async () => {
  const { vkPanel: s } = await chrome.storage.local.get("vkPanel");
  if (s) { $("tpl").value = s.tpl || ""; $("dMin").value = s.dMin || 60; $("dMax").value = s.dMax || 120; $("limit").value = s.limit || 20; }
  load();
})();
