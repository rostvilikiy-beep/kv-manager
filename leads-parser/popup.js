const $ = (id) => document.getElementById(id);
let source = "maps"; // maps | booksy
let state = { running: false, text: "", visited: 0, saved: 0, last: "", other: false };


const HINTS = {
  maps: "Введите в Google Maps поиск (например «салон красоты Вроцлав»), дождитесь списка и нажмите «Старт».",
  dgis: "Откройте 2gis.ru, введите поиск (например «салон красоты» в нужном городе) и нажмите «Старт». Расширение пройдёт по всем организациям и страницам выдачи и сохранит телефон, ВК, Telegram, WhatsApp, почту, рейтинг и количество отзывов. Список и рассылка ВК — в программе, вкладка «2ГИС».",
  booksy: "Откройте на booksy.com список салонов и нажмите «Старт». Расширение зайдёт в каждый салон и соберёт телефон, Instagram, Facebook, сайт, показатели для оценки клиента и (по галочке) почту. Если появится капча, решите её сами, расширение продолжит.",
};

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}
function detect(url) {
  let host = "";
  try { host = new URL(url || "http://x").hostname; } catch (e) {}
  if (/(^|\.)booksy\.com$/.test(host)) return "booksy";
  if (/(^|\.)2gis\.ru$/.test(host)) return "dgis";
  if (/google\.[a-z.]+\/maps|maps\.google\./.test(url || "")) return "maps";
  return null;
}

async function setSource(s, remember = true) {
  source = s;
  $("srcMaps").classList.toggle("active", s === "maps");
  $("srcBooksy").classList.toggle("active", s === "booksy");
  $("srcDgis").classList.toggle("active", s === "dgis");
  $("hint").textContent = HINTS[s];
  $("optBox").style.display = s === "booksy" ? "none" : "flex";
  $("optText").textContent = s === "dgis" ? "Только бизнесы без сайта" : "Пропускать заведения, у которых есть сайт";
  $("skipSite").checked = s === "dgis" ? dgisSkip : mapsSkip;
  $("emailBox").style.display = s === "booksy" ? "flex" : "none";
  if (remember) await chrome.storage.local.set({ src: s });
  refresh();
}

async function refresh() {
  const tab = await activeTab();
  const onSite = detect(tab && tab.url) === source;
  let st = null;

  if (source === "maps" || source === "dgis") {
    if (onSite) {
      try { st = await chrome.tabs.sendMessage(tab.id, { cmd: "status" }); } catch (e) {}
    }
    const site = source === "dgis" ? ["2ГИС", "2gis.ru"] : ["Google Maps", "google.com/maps"];
    state = st
      ? { running: st.running, text: st.statusText, visited: st.visited, saved: st.saved, last: "", other: false }
      : { running: false, text: onSite ? `Обновите страницу ${site[0]} (F5) и откройте расширение снова.` : `Откройте ${site[1]} в этой вкладке.`, visited: 0, saved: 0, last: "", other: false };
  } else {
    const { booksyRun } = await chrome.storage.local.get("booksyRun");
    const r = booksyRun || {};
    state = {
      running: !!r.running,
      text: r.statusText || (onSite ? "Готов к запуску" : "Откройте список салонов на booksy.com."),
      visited: r.visited || 0, saved: r.saved || 0, last: r.last || "", other: false,
    };
  }

  const { leads = [], socials = [], dgisFirms = [], followCount: fc, dmCount: dc } = await chrome.storage.local.get(["leads", "socials", "dgisFirms", "followCount", "dmCount"]);
  const today = new Date().toLocaleDateString("sv");
  const f = fc && fc.date === today ? fc : { instagram: 0, facebook: 0 };
  const dmDay = dc && dc.date === today ? dc : { instagram: 0, facebook: 0, vk: 0 };
  $("status").textContent = state.text || "Готов к запуску";
  $("last").textContent = source === "maps" ? "" : source === "dgis" ? `Сообщений ВК сегодня: ${dmDay.vk || 0}` :
    (state.last ? "Последний: " + state.last + " · " : "") +
    `Подписки сегодня: Instagram ${f.instagram}/20, Facebook ${f.facebook}/20 · Сообщения: Instagram ${dmDay.instagram}, Facebook ${dmDay.facebook}`;
  $("vis").textContent = state.visited; $("sav").textContent = state.saved;
  // всего салонов Booksy в базе: объединение раздела «Соцсети» и номеров с пометкой Booksy
  const booksyAll = new Set([...socials.map((s) => s.url), ...leads.filter((l) => l.note === "Booksy").map((l) => l.url || l.mapsUrl)]);
  $("all").textContent = source === "booksy" ? booksyAll.size : source === "dgis" ? dgisFirms.length : leads.length;
  $("allLbl").textContent = source === "booksy" ? "салонов в базе" : source === "dgis" ? "организаций" : "всего номеров";
  $("savLbl").textContent = source === "booksy" ? "новых салонов" : "новых";
  $("toggle").textContent = state.running ? "⏹ Стоп" : "▶ Старт";
  $("toggle").classList.toggle("stop", state.running);
  $("toggle").disabled = !state.running && !onSite;
}

$("srcMaps").onclick = () => setSource("maps");
$("srcBooksy").onclick = () => setSource("booksy");
$("srcDgis").onclick = () => setSource("dgis");
// галочка «без сайта» у Google Maps и 2ГИС своя (в 2ГИС по умолчанию включена)
let mapsSkip = false, dgisSkip = true;
const saveOpts = () => chrome.storage.local.set({ opts: { skipWebsite: mapsSkip, dgisSkip, email: $("emailOpt").checked } });
$("skipSite").onchange = () => { if (source === "dgis") dgisSkip = $("skipSite").checked; else mapsSkip = $("skipSite").checked; saveOpts(); };
$("emailOpt").onchange = saveOpts;

$("toggle").onclick = async () => {
  const tab = await activeTab();
  if (source === "maps" || source === "dgis") {
    try {
      await chrome.tabs.sendMessage(tab.id, state.running ? { cmd: "stop" } : { cmd: "start", opts: { skipWebsite: $("skipSite").checked } });
    } catch (e) {}
  } else if (state.running) {
    await chrome.runtime.sendMessage({ cmd: "booksyStop" });
  } else {
    $("status").textContent = "Собираю список салонов…";
    chrome.runtime.sendMessage({ cmd: "booksyStart", tabId: tab.id, opts: { email: $("emailOpt").checked } });
  }
  setTimeout(refresh, 300);
};

// ---------- связь с программой ----------
async function pingApp() {
  let r = null;
  try { r = await chrome.runtime.sendMessage({ type: "ping" }); } catch (e) {}
  const ok = !!(r && r.ok);
  $("dot").className = "dot " + (ok ? "ok" : "bad");
  $("app").textContent = ok
    ? "Программа подключена. Новые контакты идут в папку «" + ((r && r.folder) || "Без папки") + "»"
    : "Программа не запущена. Данные копятся здесь и уйдут позже";
}
$("flush").onclick = async () => {
  let r = null;
  try { r = await chrome.runtime.sendMessage({ type: "flushAll" }); } catch (e) {}
  alert(r && r.ok
    ? `Готово. Новых номеров в программе: ${r.added}, новых профилей соцсетей: ${r.addedSocial}`
    : "Программа не запущена. Запустите start.bat в папке wa-checker и повторите.");
};

// ---------- импорт CSV (формат «Скачать CSV» для Booksy) в папку, открытую в программе ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}
function csvToSalons(text) {
  const [head = [], ...body] = parseCsv(text);
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const ix = { name: col("название"), phone: col("телефон"), email: col("почта"), instagram: col("instagram"), facebook: col("facebook"),
    website: col("сайт"), reviews: col("отзывы"), rating: col("рейтинг"), url: col("ссылка booksy") };
  if (ix.url < 0 || ix.phone < 0) return null;
  const get = (r, k) => (ix[k] >= 0 ? (r[ix[k]] || "").trim() : "");
  const num = (v) => (v === "" || isNaN(Number(v)) ? null : Number(v));
  return body.map((r) => {
    const site = get(r, "website"), rating = num(get(r, "rating")), reviews = num(get(r, "reviews"));
    return {
      name: get(r, "name"), phone: get(r, "phone"), email: get(r, "email"), url: get(r, "url"),
      instagram: get(r, "instagram"), facebook: get(r, "facebook"),
      website: site === "нет" ? "" : site, siteChecked: site !== "",
      rating, reviews, metricsChecked: rating !== null || reviews !== null,
    };
  }).filter((s) => s.url);
}
$("import").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const salons = csvToSalons(await file.text());
  if (!salons) return alert("Не похоже на CSV из «Скачать CSV» (Booksy): нет колонок «Телефон» и «Ссылка Booksy».");
  if (!salons.length) return alert("В файле нет салонов.");
  let r = null;
  try { r = await chrome.runtime.sendMessage({ type: "ping" }); } catch (err) {}
  if (!r || !r.ok) return alert("Программа не запущена. Запустите её, откройте нужную папку и повторите импорт.");
  if (!confirm(`Импортировать ${salons.length} салонов в папку «${r.folder || "Без папки"}»?`)) return;
  $("import").disabled = true;
  try { r = await chrome.runtime.sendMessage({ type: "importCsv", rows: salons }); } catch (err) { r = null; }
  $("import").disabled = false;
  alert(r && r.ok
    ? `Готово. Отправлено в программу: номеров ${r.leads}, профилей соцсетей ${r.socials}.`
    : "Не удалось отправить в программу. Данные сохранены в расширении и уйдут при следующей связи.");
};

// ---------- база ----------
const csvCell = (v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
function download(rows, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
$("export").onclick = async () => {
  const { leads = [], socials = [], dgisFirms = [] } = await chrome.storage.local.get(["leads", "socials", "dgisFirms"]);
  if (source === "dgis") {
    if (!dgisFirms.length) return alert("База 2ГИС пуста");
    const cols = [["name", "Название"], ["phone", "Телефон"], ["email", "Почта"], ["vk", "ВКонтакте"], ["telegram", "Telegram"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["website", "Сайт"], ["reviews", "Отзывы"], ["rating", "Рейтинг"], ["rubric", "Рубрика"], ["address", "Адрес"], ["url", "Ссылка 2ГИС"]];
    return download([cols.map((c) => csvCell(c[1])).join(",")].concat(dgisFirms.map((f) => cols.map((c) => csvCell(c[0] === "website" ? f.website || "нет" : f[c[0]])).join(","))), "2gis");
  }
  if (source === "booksy") {
    // салоны Booksy: соцсети + телефон + почта; салоны только с телефоном добавляем отдельными строками
    const known = new Set(socials.map((s) => (s.phone || "").replace(/\D/g, "").slice(-9)).filter(Boolean));
    const phoneOnly = leads.filter((l) => l.note === "Booksy" && !known.has((l.phone || "").replace(/\D/g, "").slice(-9)));
    const rows = socials.concat(phoneOnly.map((l) => ({ name: l.name, phone: l.phone, email: l.email, url: l.url || l.mapsUrl })));
    if (!rows.length) return alert("База Booksy пуста");
    const cols = [["name", "Название"], ["phone", "Телефон"], ["email", "Почта"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["website", "Сайт"], ["reviews", "Отзывы"], ["rating", "Рейтинг"], ["url", "Ссылка Booksy"]];
    return download([cols.map((c) => csvCell(c[1])).join(",")].concat(rows.map((s) => cols.map((c) => csvCell(c[0] === "website" ? (s.siteChecked ? s.website || "нет" : "") : s[c[0]])).join(","))), "booksy");
  }
  if (!leads.length) return alert("База пуста");
  const cols = [["name", "Название"], ["phone", "Телефон"], ["email", "Почта"], ["url", "Ссылка"], ["note", "Примечание"]];
  const rows = [cols.map((c) => csvCell(c[1])).join(",")];
  for (const l of leads) rows.push(cols.map((c) => csvCell(c[0] === "url" ? l.url || l.mapsUrl : l[c[0]])).join(","));
  download(rows, "leads");
};
$("clear").onclick = async () => {
  if (source === "dgis") {
    if (confirm("Удалить организации 2ГИС, сохранённые в расширении? (В программе рассылки номера останутся.)")) { await chrome.runtime.sendMessage({ type: "dgisDelete", ids: [] }); refresh(); }
    return;
  }
  const what = source === "booksy" ? "салоны Booksy" : "номера";
  if (confirm(`Удалить ${what}, сохранённые в расширении? (В программе рассылки они останутся.)`)) {
    if (source === "booksy") {
      const { leads = [] } = await chrome.storage.local.get("leads");
      await chrome.storage.local.set({ socials: [], pendingSocial: [], leads: leads.filter((l) => l.note !== "Booksy") });
    } else {
      const { leads = [] } = await chrome.storage.local.get("leads");
      await chrome.storage.local.set({ leads: leads.filter((l) => l.note === "Booksy" || l.note === "2ГИС"), pending: [] });
    }
    refresh();
  }
};

chrome.storage.onChanged.addListener((ch) => {
  if (ch.mapsStatus || ch.dgisStatus || ch.dgisFirms || ch.booksyRun || ch.leads || ch.socials || ch.followCount || ch.dmCount) refresh();
});

(async () => {
  const { opts, src } = await chrome.storage.local.get(["opts", "src"]);
  mapsSkip = !!(opts && opts.skipWebsite);
  dgisSkip = !(opts && opts.dgisSkip === false);
  $("emailOpt").checked = !!(opts && opts.email);
  const tab = await activeTab();
  const site = detect(tab && tab.url);
  const saved = src === "social" ? "booksy" : src; // прежний раздел «Соцсети» теперь часть Booksy
  await setSource(site || saved || "maps", false);
  pingApp();
  setInterval(pingApp, 5000);
})();
