importScripts("template.js");

// Центр расширения: хранит базу номеров, отправляет её в программу рассылки
// и ведёт обход салонов Booksy (в отдельной фоновой вкладке).

const BASES = ["http://127.0.0.1:3000", "http://localhost:3000"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- простая очередь, чтобы записи в базу не мешали друг другу ----------
let lock = Promise.resolve();
function withLock(fn) {
  const p = lock.then(fn);
  lock = p.catch(() => {});
  return p;
}

// ---------- программа рассылки ----------
async function post(leads) {
  for (const b of BASES) {
    try {
      const r = await fetch(b + "/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;
}
// Связь с программой: заодно узнаём, какая папка сейчас открыта (в неё попадают новые контакты)
async function pingInfo() {
  for (const b of BASES) {
    try {
      const r = await fetch(b + "/api/ping");
      if (r.ok) { const j = await r.json().catch(() => ({})); return { ok: true, folder: String(j.folder || "") }; }
    } catch (e) {}
  }
  return { ok: false, folder: "" };
}
async function ping() { return (await pingInfo()).ok; }
// Какая папка открыта в программе прямо сейчас; null — программа не отвечает
async function currentFolder() { const p = await pingInfo(); return p.ok ? p.folder : null; }
// В какие папки запись уже отправлялась. Старые записи (без отметки) ушли в «Без папки».
const sentTo = (x) => (Array.isArray(x.folders) ? x.folders : [""]);
const isNewFolder = (x, folder) => folder !== null && !sentTo(x).includes(folder);
function markSent(x, folder) { if (folder !== null && !sentTo(x).includes(folder)) x.folders = sentTo(x).concat(folder); }
const numOrNull = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const toApp = (l) => ({
  name: l.name, phone: l.phone, mapsUrl: l.url || l.mapsUrl || "", note: l.note || "", email: l.email || "",
  website: l.website || "", siteChecked: l.siteChecked === true, hasSocial: !!l.hasSocial,
  rating: numOrNull(l.rating), reviews: numOrNull(l.reviews), priceMin: numOrNull(l.priceMin), priceMax: numOrNull(l.priceMax),
  currency: l.currency || "", metricsChecked: l.metricsChecked === true,
});

async function flushPending() {
  const { pending = [] } = await chrome.storage.local.get("pending");
  if (!pending.length) return { ok: true, added: 0 };
  const r = await post(pending);
  if (r) {
    await chrome.storage.local.set({ pending: [] });
    return { ok: true, added: r.added };
  }
  return { ok: false };
}

// ---------- соцсети (режим «Соцсети» для Booksy) ----------
async function postSocials(items) {
  for (const base of BASES) {
    try {
      const r = await fetch(base + "/api/socials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socials: items }),
      });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;
}
async function flushPendingSocials() {
  const { pendingSocial = [] } = await chrome.storage.local.get("pendingSocial");
  if (!pendingSocial.length) return { ok: true, added: 0 };
  const r = await postSocials(pendingSocial);
  if (r) {
    await chrome.storage.local.set({ pendingSocial: [] });
    return { ok: true, added: r.added };
  }
  return { ok: false };
}
function saveSocial(item) {
  return withLock(async () => {
    if (!item.url || (!item.instagram && !item.facebook)) return false;
    const { socials = [], pendingSocial = [] } = await chrome.storage.local.get(["socials", "pendingSocial"]);
    const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
    const rec = {
      name: item.name || "", url: item.url, instagram: item.instagram || "", facebook: item.facebook || "",
      phone: item.phone ? toIntl(item.phone, item.url) : "", email: item.email || "",
      website: item.website || "", siteChecked: true,
      rating: num(item.rating), reviews: num(item.reviews), priceMin: num(item.priceMin), priceMax: num(item.priceMax),
      currency: item.currency || "", metricsChecked: item.metricsChecked === true,
    };
    const folder = await currentFolder();
    const old = socials.find((s) => s.url === item.url);
    if (old) {
      // салон уже был сохранён раньше: дополняем запись (сайт, показатели) и отправляем в программу.
      // Если в программе открыта папка, куда этот салон ещё не попадал, тоже отправляем — иначе папка останется пустой.
      const complete = old.siteChecked && old.metricsChecked && (old.phone || !rec.phone) && (old.email || !rec.email);
      if (complete && !isNewFolder(old, folder)) return false;
      Object.assign(old, rec, { phone: rec.phone || old.phone || "", email: rec.email || old.email || "" });
      markSent(old, folder);
      pendingSocial.push(rec);
      await chrome.storage.local.set({ socials, pendingSocial });
      flushPendingSocials();
      return false;
    }
    socials.push(folder === null ? rec : { ...rec, folders: [folder] });
    pendingSocial.push(rec);
    await chrome.storage.local.set({ socials, pendingSocial });
    flushPendingSocials();
    return true;
  });
}

// ---------- автоподписка (Instagram / Facebook): счётчик и передача результата ----------
const FOLLOW_LIMIT = 20; // подписок в сутки на каждую сеть
async function followCount() {
  const { followCount: c } = await chrome.storage.local.get("followCount");
  const d = new Date().toLocaleDateString("sv");
  return c && c.date === d ? c : { date: d, instagram: 0, facebook: 0 };
}
async function postFollow(msg) {
  for (const base of BASES) {
    try {
      const r = await fetch(base + "/api/socials/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: msg.id, network: msg.net, result: msg.result }),
      });
      if (r.ok) return true;
    } catch (e) {}
  }
  return false;
}

// ---------- автоотправка сообщений: счётчик и задания ----------
// Лимит сообщений в сутки задаёт программа (0 = без лимита); если она его не передала, по умолчанию 20
async function dmCount() {
  const { dmCount: c } = await chrome.storage.local.get("dmCount");
  const d = new Date().toLocaleDateString("sv");
  return c && c.date === d ? c : { date: d, instagram: 0, facebook: 0, vk: 0 };
}
async function getDmTasks() {
  const { dmTasks = {} } = await chrome.storage.local.get("dmTasks");
  return dmTasks;
}
async function saveDmTasks(tasks) {
  const now = Date.now();
  for (const k of Object.keys(tasks)) if (now - tasks[k].startedAt > 6 * 3600 * 1000) delete tasks[k]; // старые задания удаляем
  await chrome.storage.local.set({ dmTasks: tasks });
}

// ---------- Facebook Messenger: окно-наблюдатель ----------
// Программа просит прочитать список чатов, переписку или отправить ответ. Расширение открывает ОДНО отдельное окно
// facebook.com/messages (в вашем аккаунте), оно выполняет задания по очереди и закрывается само после 5 минут простоя.
const INBOX_IDLE_MS = 5 * 60 * 1000;
const INBOX_THREAD_RE = /^(e2ee\/)?t\/[A-Za-z0-9._%-]{3,80}$/;
async function inboxLoad() {
  const { inbox } = await chrome.storage.local.get("inbox");
  return inbox && inbox.tasks ? inbox : { tasks: {}, win: null, lastTaskAt: 0 };
}
async function inboxSave(st) {
  const now = Date.now();
  for (const k of Object.keys(st.tasks)) if (now - st.tasks[k].createdAt > 3600000) delete st.tasks[k];
  await chrome.storage.local.set({ inbox: st });
}
async function inboxCloseWindow(st) {
  if (st.win && st.win.windowId) { try { await chrome.windows.remove(st.win.windowId); } catch (e) {} }
  st.win = null;
}
// Окно «живое», если страница недавно спрашивала у нас задания
async function inboxEnsureWindow(st) {
  if (st.win && Date.now() - st.win.lastSeen < 15000) return;
  await inboxCloseWindow(st);
  const w = await chrome.windows.create({ url: "https://www.facebook.com/messages/#lp-inbox", type: "popup", focused: false, width: 560, height: 780 });
  st.win = { windowId: w.id, tabId: w.tabs && w.tabs[0] && w.tabs[0].id, createdAt: Date.now(), lastSeen: Date.now() };
}

// ---------- Facebook Ads: сбор рекламодателей из библиотеки рекламы ----------
// Программа просит собрать рекламодателей по запросу. Расширение открывает окно библиотеки рекламы, страница-помощник (adlib.js)
// читает карточки и информацию о рекламодателях, а сюда присылает результаты. Программа забирает их порциями (adsPoll).
const ADS_MAX = 80;
const adsBlank = () => ({ state: "idle", leads: [], found: 0, processed: 0, note: "", windowId: null, tabId: null, task: null, updated: 0 });
async function adsLoad() { const { ads } = await chrome.storage.local.get("ads"); return ads && ads.state ? ads : adsBlank(); }
async function adsSave(a) { a.updated = Date.now(); await chrome.storage.local.set({ ads: a }); }
async function adsCloseWindow(a) {
  if (a.windowId) { try { await chrome.windows.remove(a.windowId); } catch (e) {} }
  a.windowId = null; a.tabId = null;
}

// ---------- международный формат номера ----------
// Страна определяется по адресу Booksy (например /en-us/ → США). Для WhatsApp и Telegram нужен код страны.
// страна: [код, возможные длины номера без кода, убирать ли ведущий 0]
const REGIONS = {
  pl: [48, [9], false], us: [1, [10], false], ca: [1, [10], false], gb: [44, [10], true], ie: [353, [9], true],
  es: [34, [9], false], it: [39, [9, 10], false], fr: [33, [9], true], de: [49, [10, 11], true], pt: [351, [9], false],
  nl: [31, [9], true], br: [55, [10, 11], true], mx: [52, [10], false], au: [61, [9], true], za: [27, [9], true],
};
const NANP = /^\(?\d{3}\)\s?\d{3}[-.\s]\d{4}$|^\d{3}-\d{3}-\d{4}$/; // американский формат (517) 894-1961
function regionFromUrl(url) {
  const m = String(url || "").match(/booksy\.com\/([a-z]{2})-([a-z]{2})\//i);
  if (!m) return "";
  const a = m[1].toLowerCase(), c = m[2].toLowerCase();
  return REGIONS[c] ? c : REGIONS[a] ? a : "";
}
function toIntl(phone, url) {
  const p = String(phone || "").trim();
  if (!p || p.startsWith("+")) return p;
  let d = p.replace(/\D/g, "");
  // российский формат «8 (495) 123-45-67» (Google Maps и 2ГИС в России) → +7
  if (d.length === 11 && /^8\s*\(?\d{3,5}\)?/.test(p) && !/booksy\.com/.test(String(url || ""))) return "+7 " + d.slice(1);
  if (d.startsWith("00")) return "+" + d.slice(2);
  const region = regionFromUrl(url);
  if (!region) return NANP.test(p) ? "+1 " + p : p; // страна неизвестна: узнаём только американский формат
  const [cc, lens, trunk0] = REGIONS[region];
  if (trunk0 && d.startsWith("0")) d = d.slice(1);
  if (lens.includes(d.length)) return "+" + cc + " " + (trunk0 ? d : p);
  const c = String(cc);
  if (d.startsWith(c) && lens.includes(d.length - c.length)) return "+" + d;
  return p;
}

// ---------- база номеров ----------
const keyOf = (p) => String(p || "").replace(/\D/g, "").slice(-9);

function saveLead(lead) {
  return withLock(async () => {
    lead = { ...lead, phone: toIntl(lead.phone, lead.url) };
    const k = keyOf(lead.phone);
    if (k.length < 7) return false;
    const { leads = [], pending = [] } = await chrome.storage.local.get(["leads", "pending"]);
    // признаки для оценки клиента: есть ли сайт и (для Booksy) показатели салона
    const extra = {
      website: lead.website || "", siteChecked: lead.siteChecked === true, hasSocial: !!lead.hasSocial,
      rating: numOrNull(lead.rating), reviews: numOrNull(lead.reviews), priceMin: numOrNull(lead.priceMin), priceMax: numOrNull(lead.priceMax),
      currency: lead.currency || "", metricsChecked: lead.metricsChecked === true,
    };
    const folder = await currentFolder();
    const old = leads.find((l) => keyOf(l.phone) === k);
    if (old) {
      // номер уже есть: дополняем запись тем, чего раньше не знали (почта, сайт, показатели) и отправляем в программу
      let changed = false;
      if (lead.email && !old.email) { old.email = lead.email; changed = true; }
      if (extra.siteChecked && !old.siteChecked) { old.website = extra.website; old.siteChecked = true; changed = true; }
      if (extra.metricsChecked && !old.metricsChecked) { Object.assign(old, { rating: extra.rating, reviews: extra.reviews, priceMin: extra.priceMin, priceMax: extra.priceMax, currency: extra.currency, metricsChecked: true }); changed = true; }
      if (extra.hasSocial && !old.hasSocial) { old.hasSocial = true; changed = true; }
      // номер уже отправлялся, но в другую папку: отправляем и в открытую сейчас
      if (isNewFolder(old, folder)) changed = true;
      if (changed) {
        markSent(old, folder);
        pending.push(toApp(old));
        await chrome.storage.local.set({ leads, pending });
        flushPending();
      }
      return false;
    }
    const item = { name: lead.name || "", phone: lead.phone, url: lead.url || "", note: lead.note || "", email: lead.email || "", ...extra };
    if (folder !== null) item.folders = [folder];
    leads.push(item);
    pending.push(toApp(item));
    await chrome.storage.local.set({ leads, pending });
    flushPending();
    return true;
  });
}

// ---------- Booksy: обход салонов ----------
const RUN = "booksyRun";
async function getRun() {
  const o = await chrome.storage.local.get(RUN);
  return o[RUN] || { running: false };
}
async function setRun(run) {
  await chrome.storage.local.set({ [RUN]: run });
}
async function patch(p) {
  const r = await getRun();
  Object.assign(r, p);
  await setRun(r);
  return r;
}
const armTimeout = () => chrome.alarms.create("salonTimeout", { delayInMinutes: 1 });
const clearTimeoutAlarm = () => chrome.alarms.clear("salonTimeout");

async function finish(text) {
  const run = await patch({ running: false, captcha: false, statusText: text });
  clearTimeoutAlarm();
  chrome.action.setBadgeText({ text: "" });
  if (run.workerTabId) {
    try { await chrome.tabs.remove(run.workerTabId); } catch (e) {}
  }
}

async function booksyStart(listingTabId, opts) {
  let links = [];
  try {
    const res = await chrome.tabs.sendMessage(listingTabId, { cmd: "collect" });
    links = (res && res.links) || [];
  } catch (e) {}
  if (!links.length) {
    await setRun({
      running: false,
      statusText: "Не нашёл салоны на странице. Откройте список салонов Booksy и обновите страницу.",
    });
    return;
  }
  let startPage = 1;
  try { startPage = Number(new URL((await chrome.tabs.get(listingTabId)).url).searchParams.get("businessesPage") || 1); } catch (e) {}
  await setRun({
    page: startPage,
    mode: "all",
    opts: { email: !!(opts && opts.email) },
    running: true, queue: links, seen: [], idx: 0, visited: 0, saved: 0, nophone: 0, timeouts: 0, last: "", captcha: false,
    listingTabId, workerTabId: null, statusText: `Найдено салонов: ${links.length}. Начинаю…`,
  });
  processNext();
}

// В Booksy страницы списка переключаются параметром ?businessesPage=N: открываем следующую и собираем салоны
function waitTabComplete(tabId, timeout) {
  return (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const t = await chrome.tabs.get(tabId);
        if (t.status === "complete") return true;
      } catch (e) { return false; }
      await sleep(400);
    }
    return false;
  })();
}
async function nextListingPage(run) {
  try {
    const tab = await chrome.tabs.get(run.listingTabId);
    const u = new URL(tab.url);
    if (!/\/s\//.test(u.pathname)) return []; // это не страница списка
    const cur = Number(u.searchParams.get("businessesPage") || 1);
    if (cur >= 300) return [];
    const next = cur + 1;
    u.searchParams.set("businessesPage", String(next));
    await chrome.tabs.update(run.listingTabId, { url: u.toString() });

    // ждём, пока вкладка реально откроет СЛЕДУЮЩУЮ страницу (а не останется старая) и загрузится
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      await sleep(500);
      try {
        const t = await chrome.tabs.get(run.listingTabId);
        if (t.status === "complete" && String(t.url).includes("businessesPage=" + next)) break;
      } catch (e) { return []; }
    }
    await sleep(2000);

    const known = new Set([...(run.seen || []), ...(run.queue || [])]);
    let links = [];
    for (let i = 0; i < 4; i++) {
      try {
        const res = await chrome.tabs.sendMessage(run.listingTabId, { cmd: "collect" });
        links = (res && res.links) || [];
        if (links.some((l) => !known.has(l))) break; // есть новые салоны: страница прочитана
      } catch (e) {}
      await sleep(2000); // страница ещё грузится или ответил старый экземпляр: пробуем ещё
    }
    if (links.some((l) => !known.has(l))) await patch({ page: next });
    return links;
  } catch (e) {}
  return [];
}

async function processNext() {
  let run = await getRun();
  if (!run.running) return;

  if (run.idx >= run.queue.length) {
    await patch({ statusText: `Страница ${run.page || 1} закончилась, перехожу на следующую…` });
    let links = await nextListingPage(run);
    if (!links.length) {
      try {
        const res = await chrome.tabs.sendMessage(run.listingTabId, { cmd: "nextPage" }); // запасной способ: кнопка «дальше»
        links = (res && res.links) || [];
      } catch (e) {}
    }
    run = await getRun();
    const fresh = links.filter((l) => !run.seen.includes(l) && !run.queue.includes(l));
    if (!fresh.length) return finish(`Готово: салоны закончились. Просмотрено ${run.visited}, сохранено ${run.saved}`);
    run.queue.push(...fresh);
    await setRun(run);
  }

  await sleep(rnd(2000, 4500));
  run = await getRun();
  if (!run.running) return;

  const url = run.queue[run.idx];
  run.idx++;
  run.seen.push(url);
  run.captcha = false;
  run.statusText = `Страница ${run.page || 1} · салон ${run.idx} из ${run.queue.length} · сохранено ${run.saved}` + (run.nophone ? ` · без контактов ${run.nophone}` : "") + (run.timeouts ? ` · без ответа ${run.timeouts}` : "");

  let exists = false;
  if (run.workerTabId) {
    try { await chrome.tabs.get(run.workerTabId); exists = true; } catch (e) {}
  }
  if (exists) {
    await setRun(run);
    armTimeout();
    await chrome.tabs.update(run.workerTabId, { url });
  } else {
    const t = await chrome.tabs.create({ url, active: false });
    run.workerTabId = t.id;
    await setRun(run);
    armTimeout();
  }
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "salonTimeout") return;
  const run = await getRun();
  if (!run.running) return;
  if (run.captcha) return armTimeout(); // ждём, пока пользователь решит капчу
  run.visited = (run.visited || 0) + 1;
  run.timeouts = (run.timeouts || 0) + 1;
  run.last = "⚠ Салон не ответил за минуту (страница не загрузилась или расширение не запустилось на ней)";
  await setRun(run);
  processNext();
});


// ---------- конструктор сайтов: сбор данных салона для сайта ----------
// Программа присылает ссылку на салон (Booksy или Google Maps), расширение открывает её в отдельном окне,
// site.js собирает данные и фото, а программа забирает результат опросом (sitePoll).
const SITE_URL_RE = /^https:\/\/([a-z0-9-]+\.)?booksy\.com\/[a-z]{2}-[a-z]{2}\/\d+_|^https:\/\/(www\.)?google\.[a-z.]+\/maps\/|^https:\/\/maps\.google\.[a-z.]+\//i;
const SITE_TIMEOUT = 5 * 60 * 1000;
async function siteLoad() { const { siteTasks } = await chrome.storage.local.get("siteTasks"); return siteTasks && typeof siteTasks === "object" ? siteTasks : {}; }
async function siteSave(t) {
  // старые задания (больше часа) не храним
  for (const k of Object.keys(t)) if (Date.now() - (t[k].startedAt || 0) > 3600000) delete t[k];
  await chrome.storage.local.set({ siteTasks: t });
}
async function siteClose(id, delay = 0) {
  setTimeout(async () => {
    const ts = await siteLoad();
    const x = ts[id];
    if (!x || x.closed) return;
    x.closed = true;
    await siteSave(ts);
    try { if (x.windowId) await chrome.windows.remove(x.windowId); } catch (e) {}
  }, delay);
}

// ---------- шаблоны сообщений: {имя}, {отзывы}, {рейтинг} ----------
// функции fillTemplate, hasVars, cleanName — в template.js (общие с панелью 2ГИС)
// Ссылка на профиль без мусора: для сравнения ссылок из разных мест
function normProfile(u) {
  try {
    const x = new URL(String(u || "").trim());
    const host = x.hostname.toLowerCase().replace(/^(www|m|web)\./, "").replace(/^vk\.ru$/, "vk.com");
    const path = x.pathname.replace(/\/+$/, "").toLowerCase();
    return host + path + (path === "/profile.php" ? "?id=" + x.searchParams.get("id") : "");
  } catch (e) { return ""; }
}
// Данные салона для шаблона: ищем по ссылке на профиль среди салонов Booksy и организаций 2ГИС
async function profileData(url) {
  const key = normProfile(url);
  if (!key) return null;
  const { socials = [], dgisFirms = [] } = await chrome.storage.local.get(["socials", "dgisFirms"]);
  const s = socials.find((x) => normProfile(x.instagram) === key || normProfile(x.facebook) === key);
  if (s) return { name: s.name, reviews: s.reviews, rating: s.rating };
  const f = dgisFirms.find((x) => normProfile(x.vk) === key || normProfile(x.instagram) === key);
  if (f) return { name: f.name, reviews: f.reviews, rating: f.rating };
  return null;
}

// ---------- 2ГИС: база организаций ----------
const S = (v) => String(v || "").slice(0, 300);
function saveDgisFirm(f) {
  return withLock(async () => {
    const id = S(f.id).replace(/\D/g, "");
    if (!id) return { saved: false };
    const { dgisFirms = [] } = await chrome.storage.local.get("dgisFirms");
    const rec = {
      id, url: S(f.url), name: S(f.name), address: S(f.address), rubric: S(f.rubric),
      phone: S(f.phone), phones: Array.isArray(f.phones) ? f.phones.slice(0, 5).map(S) : [],
      email: S(f.email), website: S(f.website), siteReal: f.siteReal === true, vk: S(f.vk), telegram: S(f.telegram), whatsapp: S(f.whatsapp), instagram: S(f.instagram),
      rating: numOrNull(f.rating), reviews: numOrNull(f.reviews), updatedAt: Date.now(),
    };
    const old = dgisFirms.find((x) => x.id === id);
    if (old) Object.assign(old, rec); else dgisFirms.push({ ...rec, addedAt: Date.now() });
    await chrome.storage.local.set({ dgisFirms });
    return { saved: !old, phone: rec.phone, rec };
  });
}

// ---------- сообщения ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // от Google Maps
    if (msg.type === "lead") {
      return sendResponse({ saved: await saveLead(msg.lead || {}) });
    }
    // от окна расширения
    if (msg.type === "ping") return sendResponse(await pingInfo());
    if (msg.type === "flushAll") {
      const { leads = [], socials = [] } = await chrome.storage.local.get(["leads", "socials"]);
      const r = leads.length ? await post(leads.map(toApp)) : { added: 0 };
      if (r) await chrome.storage.local.set({ pending: [] });
      const r2 = socials.length ? await postSocials(socials) : { added: 0 };
      if (r2) await chrome.storage.local.set({ pendingSocial: [] });
      return sendResponse(r && r2 ? { ok: true, added: r.added, addedSocial: r2.added } : { ok: false });
    }
    // от окна расширения: импорт салонов из CSV (выгрузка «Скачать CSV») в открытую в программе папку
    if (msg.type === "importCsv") {
      let leadsN = 0, socialsN = 0;
      for (const d of Array.isArray(msg.rows) ? msg.rows.slice(0, 5000) : []) {
        if (!d || !d.url) continue;
        const hasSocial = !!(d.instagram || d.facebook);
        if (d.phone) { await saveLead({ ...d, note: "Booksy", hasSocial }); leadsN++; }
        if (hasSocial) { await saveSocial(d); socialsN++; }
      }
      const r = await withLock(flushPending);
      const r2 = await withLock(flushPendingSocials);
      return sendResponse({ ok: !!(r && r.ok && r2 && r2.ok), leads: leadsN, socials: socialsN });
    }
    // от 2ГИС: организация из выдачи. Телефон уходит в программу (база номеров), остальное хранится в расширении (панель 2ГИС)
    if (msg.type === "dgisFirm") {
      const f = msg.firm || {};
      const r = await saveDgisFirm(f);
      if (r.phone) {
        await saveLead({ name: f.name, phone: r.phone, url: r.rec.url, note: "2ГИС", email: r.rec.email, website: r.rec.website, siteChecked: true,
          hasSocial: !!(r.rec.vk || r.rec.instagram || r.rec.telegram), rating: r.rec.rating, reviews: r.rec.reviews, metricsChecked: r.rec.rating !== null || r.rec.reviews !== null });
      }
      return sendResponse({ saved: r.saved });
    }
    // от панели 2ГИС: пометка о рассылке ВК
    if (msg.type === "dgisMark") {
      return withLock(async () => {
        const { dgisFirms = [] } = await chrome.storage.local.get("dgisFirms");
        const f = dgisFirms.find((x) => x.id === String(msg.id || ""));
        if (f) { f.vk_result = S(msg.result); f.vk_detail = S(msg.detail); f.vk_at = Date.now(); await chrome.storage.local.set({ dgisFirms }); }
        sendResponse({ ok: !!f });
      });
    }
    if (msg.type === "dgisDelete") {
      return withLock(async () => {
        const ids = new Set((msg.ids || []).map(String));
        const { dgisFirms = [], leads = [] } = await chrome.storage.local.get(["dgisFirms", "leads"]);
        const left = ids.size ? dgisFirms.filter((x) => !ids.has(x.id)) : [];
        const gone = new Set(dgisFirms.filter((x) => !left.includes(x)).map((x) => x.url));
        await chrome.storage.local.set({ dgisFirms: left, leads: leads.filter((l) => !(l.note === "2ГИС" && gone.has(l.url))) });
        sendResponse({ ok: true, left: left.length });
      });
    }
    if (msg.cmd === "booksyStart") { await booksyStart(msg.tabId, msg.opts); return sendResponse({ ok: true }); }
    if (msg.cmd === "booksyStop") {
      const run = await getRun();
      await finish(`Остановлен. Просмотрено ${run.visited || 0}, сохранено ${run.saved || 0}`);
      return sendResponse({ ok: true });
    }

    // от страниц Instagram / Facebook (автоподписка)
    if (msg.type === "followGate") {
      const c = await followCount();
      const n = c[msg.net] || 0;
      return sendResponse({ allowed: n < FOLLOW_LIMIT, count: n, limit: FOLLOW_LIMIT });
    }
    if (msg.type === "followResult") {
      if (msg.result === "followed" || msg.result === "requested") {
        const c = await followCount();
        c[msg.net] = (c[msg.net] || 0) + 1;
        await chrome.storage.local.set({ followCount: c });
      }
      await postFollow(msg);
      return sendResponse({});
    }

    // ---------- Facebook Ads: сбор рекламодателей ----------
    if (msg.type === "adsStart") {
      const t = msg.task || {};
      const query = String(t.query || "").trim().slice(0, 80);
      const country = /^[A-Z]{2}$/.test(String(t.country || "")) ? t.country : "";
      const max = Math.max(3, Math.min(ADS_MAX, parseInt(t.max, 10) || 30));
      if (query.length < 2 || !country) return sendResponse({ error: "укажите запрос и страну" });
      return withLock(async () => {
        const a = await adsLoad();
        await adsCloseWindow(a);
        const url = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=" + country + "&q=" + encodeURIComponent(query) + "&search_type=keyword_unordered&media_type=all";
        Object.assign(a, adsBlank(), { state: "running", task: { query, country, max, fast: t.fast === true }, note: "Открываю библиотеку рекламы…" });
        try {
          const w = await chrome.windows.create({ url, type: "popup", focused: false, width: 1200, height: 900 });
          a.windowId = w.id; a.tabId = w.tabs && w.tabs[0] && w.tabs[0].id;
        } catch (e) { a.state = "error"; a.note = "Не удалось открыть окно библиотеки рекламы"; }
        await adsSave(a);
        sendResponse(a.state === "running" ? { ok: true } : { error: a.note });
      });
    }
    if (msg.type === "adsGet") {
      const a = await adsLoad();
      if (a.state === "running" && sender.tab && sender.tab.id === a.tabId) return sendResponse({ task: a.task });
      return sendResponse({});
    }
    if (msg.type === "adsAlive") {
      const a = await adsLoad();
      return sendResponse({ stop: !(a.state === "running" && sender.tab && sender.tab.id === a.tabId) });
    }
    if (msg.type === "adsProgress") {
      return withLock(async () => {
        const a = await adsLoad();
        if (a.state === "running") { a.found = Number(msg.found) || a.found; a.processed = Number(msg.processed) || 0; a.note = String(msg.note || "").slice(0, 160); await adsSave(a); }
        sendResponse({});
      });
    }
    if (msg.type === "adsLead") {
      return withLock(async () => {
        const a = await adsLoad();
        if (a.state === "running" && msg.lead && msg.lead.path) { a.leads.push(msg.lead); await adsSave(a); }
        sendResponse({});
      });
    }
    if (msg.type === "adsDone") {
      return withLock(async () => {
        const a = await adsLoad();
        if (a.state === "running") { a.state = msg.ok ? "done" : "error"; a.note = String(msg.note || "").slice(0, 200); await adsCloseWindow(a); await adsSave(a); }
        sendResponse({});
      });
    }
    if (msg.type === "adsPoll") {
      return withLock(async () => {
        const a = await adsLoad();
        if (a.state === "running" && Date.now() - a.updated > 300000) { a.state = "error"; a.note = "Окно библиотеки рекламы не отвечает. Закройте его и запустите поиск снова."; await adsCloseWindow(a); await adsSave(a); }
        const cur = Math.max(0, parseInt(msg.cursor, 10) || 0);
        sendResponse({ state: a.state, found: a.found, processed: a.processed, note: a.note, leads: a.leads.slice(cur), next: a.leads.length });
      });
    }
    if (msg.type === "adsStop") {
      return withLock(async () => {
        const a = await adsLoad();
        if (a.state === "running") { a.state = "stopped"; a.note = "Остановлено."; }
        await adsCloseWindow(a); await adsSave(a);
        sendResponse({ ok: true });
      });
    }

    // ---------- Messenger: задания для окна-наблюдателя ----------
    if (msg.type === "inboxTask") {
      const t = msg.task || {};
      const kind = ["list", "thread", "send"].includes(t.kind) ? t.kind : "";
      if (!kind) return sendResponse({ error: "некорректное задание" });
      if (kind !== "list" && !INBOX_THREAD_RE.test(String(t.threadId || ""))) return sendResponse({ error: "некорректный чат" });
      const text = String(t.text || "");
      if (kind === "send" && (!text.trim() || text.length > 2000)) return sendResponse({ error: "некорректный текст" });
      return withLock(async () => {
        const st = await inboxLoad();
        const id = "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        st.tasks[id] = { id, kind, threadId: String(t.threadId || ""), text: kind === "send" ? text : "", state: "pending", createdAt: Date.now() };
        try { await inboxEnsureWindow(st); } catch (e) { st.tasks[id].state = "done"; st.tasks[id].result = "no_worker"; st.tasks[id].detail = "не удалось открыть окно Messenger"; }
        await inboxSave(st);
        sendResponse({ id });
      });
    }
    if (msg.type === "inboxNext") {
      return withLock(async () => {
        const st = await inboxLoad();
        if (!st.win || !sender.tab || sender.tab.id !== st.win.tabId) return sendResponse({ stop: true });
        st.win.lastSeen = Date.now();
        const now = Date.now();
        for (const x of Object.values(st.tasks)) if (x.state === "running" && now - x.startedAt > 90000) { x.state = "done"; x.result = "timeout"; x.detail = "окно Messenger не ответило вовремя"; }
        const next = Object.values(st.tasks).filter((x) => x.state === "pending").sort((a, b) => a.createdAt - b.createdAt)[0];
        if (next) {
          next.state = "running"; next.startedAt = now; st.lastTaskAt = now;
          await inboxSave(st);
          return sendResponse({ task: { id: next.id, kind: next.kind, threadId: next.threadId, text: next.text } });
        }
        if (now - Math.max(st.lastTaskAt || 0, st.win.createdAt) > INBOX_IDLE_MS) {
          await inboxCloseWindow(st);
          await inboxSave(st);
          return sendResponse({ stop: true });
        }
        await inboxSave(st);
        sendResponse({});
      });
    }
    if (msg.type === "inboxDone") {
      return withLock(async () => {
        const st = await inboxLoad();
        const x = st.tasks[msg.id];
        if (x && x.state !== "done") {
          x.state = "done"; x.result = String(msg.result || "error"); x.detail = String(msg.detail || "").slice(0, 400);
          if (Array.isArray(msg.threads)) x.threads = msg.threads.slice(0, 80);
          if (Array.isArray(msg.messages)) x.messages = msg.messages.slice(-120);
          if (msg.name) x.name = String(msg.name).slice(0, 120);
          st.lastTaskAt = Date.now();
          await inboxSave(st);
        }
        sendResponse({});
      });
    }
    if (msg.type === "inboxPoll") {
      return withLock(async () => {
        const st = await inboxLoad();
        const x = st.tasks[msg.id];
        if (!x) return sendResponse({ state: "done", result: "error", detail: "задание не найдено" });
        const now = Date.now();
        if (x.state === "pending" && now - x.createdAt > 60000) { x.state = "done"; x.result = "no_worker"; x.detail = "окно Messenger не отвечает: откройте в нём facebook.com и войдите в аккаунт"; await inboxSave(st); }
        if (x.state === "running" && now - x.startedAt > 90000) { x.state = "done"; x.result = "timeout"; x.detail = "окно Messenger не ответило вовремя"; await inboxSave(st); }
        sendResponse({ state: x.state, result: x.result || "", detail: x.detail || "", threads: x.threads, messages: x.messages, name: x.name });
      });
    }
    if (msg.type === "inboxStop") {
      return withLock(async () => { const st = await inboxLoad(); await inboxCloseWindow(st); await inboxSave(st); sendResponse({ ok: true }); });
    }

    // ---------- автоотправка сообщений в Instagram / Facebook ----------
    if (msg.type === "dmPing") return sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    if (msg.type === "dmTask") {
      const t = msg.task || {};
      const net = ["facebook", "instagram", "vk"].includes(t.net) ? t.net : "";
      let url = String(t.url || "");
      if (net === "vk") url = url.replace(/^https?:\/\/(?:www\.|m\.)?vk\.(?:com|ru)\//i, "https://vk.com/");
      const okUrl = net === "instagram" ? /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(url)
        : net === "facebook" ? /^https:\/\/(www\.)?facebook\.com\/[^\s]+$/.test(url)
        : net === "vk" ? /^https:\/\/vk\.com\/[A-Za-z0-9_.]+\/?$/.test(url) : false;
      let text = String(t.text || "");
      if (!okUrl || !text.trim()) return sendResponse({ done: true, state: "done", result: "error", detail: "некорректное задание" });
      // переменные {имя}, {отзывы}, {рейтинг}: данные передаёт программа (t.vars) или берём из базы расширения по ссылке
      if (hasVars(text)) {
        const data = t.vars && typeof t.vars === "object" ? t.vars : await profileData(url);
        const r = fillTemplate(text, data);
        if (r.error) return sendResponse({ done: true, state: "done", result: "error", detail: r.error + " — сообщение НЕ отправлено" });
        text = r.text;
      }
      if (text.length > 2000) return sendResponse({ done: true, state: "done", result: "error", detail: "некорректное задание" });
      const c = await dmCount();
      const lim = t.limit === 0 || t.limit === "0" ? Infinity : Number(t.limit) > 0 ? Number(t.limit) : 20;
      if ((c[net] || 0) >= lim) return sendResponse({ done: true, state: "done", result: "limit" });
      const id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const tasks = await getDmTasks();
      tasks[id] = { id, net, text, follow: !!t.follow && net !== "vk", salonId: String(t.salonId || ""), state: "running", startedAt: Date.now() };
      await saveDmTasks(tasks);
      try {
        const w = await chrome.windows.create({ url: url + "#lp-dm=" + id, type: "popup", focused: false, width: 1000, height: 820 });
        const t2 = await getDmTasks();
        if (t2[id]) { t2[id].windowId = w.id; t2[id].tabId = w.tabs && w.tabs[0] && w.tabs[0].id; await saveDmTasks(t2); }
      } catch (e) {
        const t2 = await getDmTasks();
        if (t2[id]) { t2[id].state = "done"; t2[id].result = "error"; t2[id].detail = "не удалось открыть окно"; t2[id].finishedAt = Date.now(); t2[id].closed = true; await saveDmTasks(t2); }
      }
      return sendResponse({ id, started: true, text });
    }
    if (msg.type === "dmMine") {
      // вкладка спрашивает, не открыта ли она для задания (Facebook мог стереть метку из адреса)
      const tabId = sender.tab && sender.tab.id;
      if (!tabId) return sendResponse({});
      const tasks = await getDmTasks();
      const t = Object.values(tasks).find((x) => x.state === "running" && x.tabId === tabId);
      if (t) return sendResponse({ dm: t.id });
      const st = await inboxLoad();
      if (st.win && st.win.tabId === tabId) return sendResponse({ inbox: true });
      return sendResponse({});
    }
    if (msg.type === "dmGet") {
      const tasks = await getDmTasks();
      const t = tasks[msg.id];
      if (!t || t.state !== "running") return sendResponse({ ok: false });
      if (t.tabId && sender.tab && sender.tab.id !== t.tabId) return sendResponse({ ok: false });
      return sendResponse({ ok: true, text: t.text, follow: t.follow, salonId: t.salonId, net: t.net });
    }
    if (msg.type === "dmResult") {
      const tasks = await getDmTasks();
      const t = tasks[msg.id];
      if (!t || t.state !== "running") return sendResponse({});
      t.state = "done"; t.result = String(msg.result || "error"); t.detail = String(msg.detail || ""); t.finishedAt = Date.now();
      await saveDmTasks(tasks);
      if (t.result === "sent") {
        const c = await dmCount();
        c[t.net] = (c[t.net] || 0) + 1;
        await chrome.storage.local.set({ dmCount: c });
      }
      // окно закрываем сами через пару секунд (страница программы к этому моменту уже могла перестать опрашивать)
      setTimeout(async () => {
        const ts = await getDmTasks();
        const x = ts[msg.id];
        if (x && !x.closed) {
          x.closed = true;
          await saveDmTasks(ts);
          try { if (x.windowId) await chrome.windows.remove(x.windowId); } catch (e) {}
        }
      }, 2500);
      return sendResponse({});
    }
    if (msg.type === "dmPoll") {
      const tasks = await getDmTasks();
      const t = tasks[msg.id];
      if (!t) return sendResponse({ state: "done", result: "error", detail: "задание не найдено" });
      if (t.state === "running" && Date.now() - t.startedAt > 180000) {
        t.state = "done"; t.result = "timeout"; t.finishedAt = Date.now();
        await saveDmTasks(tasks);
      }
      if (t.state === "done" && !t.closed && Date.now() - (t.finishedAt || 0) > 2500) {
        t.closed = true;
        await saveDmTasks(tasks);
        try { if (t.windowId) await chrome.windows.remove(t.windowId); } catch (e) {}
      }
      return sendResponse({ state: t.state, result: t.result || "", detail: t.detail || "" });
    }

    // ---------- конструктор сайтов ----------
    if (msg.type === "siteTask") {
      const url = String((msg.task && msg.task.url) || "").trim();
      if (!SITE_URL_RE.test(url)) return sendResponse({ error: "Нужна ссылка на салон в Booksy или на заведение в Google Maps" });
      const id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const tasks = await siteLoad();
      tasks[id] = { id, url, state: "running", progress: "Открываю страницу…", startedAt: Date.now() };
      await siteSave(tasks);
      try {
        const w = await chrome.windows.create({ url: url.split("#")[0] + "#lp-site=" + id, type: "popup", focused: false, width: 1200, height: 900 });
        const t2 = await siteLoad();
        if (t2[id]) { t2[id].windowId = w.id; t2[id].tabId = w.tabs && w.tabs[0] && w.tabs[0].id; await siteSave(t2); }
      } catch (e) {
        const t2 = await siteLoad();
        if (t2[id]) { Object.assign(t2[id], { state: "done", error: "не удалось открыть окно", closed: true }); await siteSave(t2); }
      }
      return sendResponse({ id });
    }
    if (msg.type === "siteMine") {
      const tabId = sender.tab && sender.tab.id;
      const tasks = await siteLoad();
      const t = tabId && Object.values(tasks).find((x) => x.state === "running" && x.tabId === tabId && !x.claimed);
      if (!t) return sendResponse({});
      t.claimed = true;
      await siteSave(tasks);
      return sendResponse({ id: t.id });
    }
    if (msg.type === "siteProgress") {
      const tasks = await siteLoad();
      const t = tasks[msg.id];
      if (!t || t.state !== "running" || (sender.tab && sender.tab.id !== t.tabId)) return sendResponse({});
      t.progress = String(msg.text || "").slice(0, 200);
      t.captcha = !!msg.captcha;
      t.startedAt = msg.captcha ? Date.now() : t.startedAt; // пока решается капча, время ожидания не идёт
      await siteSave(tasks);
      if (msg.captcha) { try { await chrome.windows.update(t.windowId, { focused: true }); } catch (e) {} }
      return sendResponse({});
    }
    if (msg.type === "siteResult") {
      const tasks = await siteLoad();
      const t = tasks[msg.id];
      if (!t || t.state !== "running" || (sender.tab && sender.tab.id !== t.tabId)) return sendResponse({});
      t.state = "done";
      if (msg.error) t.error = String(msg.error).slice(0, 300); else t.data = msg.data || {};
      await siteSave(tasks);
      siteClose(msg.id, 1500);
      return sendResponse({});
    }
    if (msg.type === "sitePoll") {
      const tasks = await siteLoad();
      const t = tasks[msg.id];
      if (!t) return sendResponse({ state: "done", error: "задание не найдено" });
      if (t.state === "running" && Date.now() - t.startedAt > SITE_TIMEOUT) {
        t.state = "done"; t.error = "страница не ответила за 5 минут";
        await siteSave(tasks);
        siteClose(t.id);
      }
      return sendResponse({ state: t.state, progress: t.progress || "", captcha: !!t.captcha, data: t.data || null, error: t.error || "" });
    }
    if (msg.type === "siteStop") {
      const tasks = await siteLoad();
      const t = tasks[msg.id];
      if (t && t.state === "running") { t.state = "done"; t.error = "остановлено"; await siteSave(tasks); }
      if (t) siteClose(t.id);
      return sendResponse({ ok: true });
    }

    // от рабочей вкладки Booksy
    const run = await getRun();
    const mine = run.running && sender.tab && sender.tab.id === run.workerTabId;
    if (msg.type === "whoami") {
      if (mine) {
        if (run.captcha) {
          await patch({ captcha: false });
          chrome.action.setBadgeText({ text: "" });
        }
        armTimeout();
      }
      return sendResponse({ task: !!mine, mode: "all", opts: run.opts || {} });
    }
    if (msg.type === "captcha") {
      if (!mine) return sendResponse({});
      if (msg.active) {
        await patch({ captcha: true, statusText: "⚠ Капча! Решите её во вкладке Booksy, работа продолжится сама." });
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
        try {
          await chrome.tabs.update(sender.tab.id, { active: true });
          await chrome.windows.update(sender.tab.windowId, { focused: true });
        } catch (e) {}
      } else {
        await patch({ captcha: false, statusText: "Капча пройдена, продолжаю…" });
        chrome.action.setBadgeText({ text: "" });
        armTimeout();
      }
      return sendResponse({});
    }
    if (msg.type === "result") {
      if (!mine) return sendResponse({});
      clearTimeoutAlarm();
      const d = msg.data || {};
      const hasSocial = !!(d.instagram || d.facebook);
      const found = !!(d.phone || hasSocial || d.email);
      let isNew = false;
      // телефон попадает в «Базу номеров» (для проверки и рассылки в WhatsApp/Telegram), с почтой и пометкой «Booksy»
      if (d.phone) isNew = (await saveLead({ name: d.name, phone: d.phone, url: d.url, note: "Booksy", email: d.email, website: d.website, siteChecked: true, hasSocial, rating: d.rating, reviews: d.reviews, priceMin: d.priceMin, priceMax: d.priceMax, currency: d.currency, metricsChecked: d.metricsChecked })) || isNew;
      // салоны хотя бы с одной соцсетью попадают в раздел «Соцсети» вместе с телефоном, почтой, сайтом и показателями
      if (hasSocial) {
        const s = await saveSocial({ name: d.name, url: d.url, instagram: d.instagram, facebook: d.facebook, phone: d.phone, email: d.email, website: d.website, rating: d.rating, reviews: d.reviews, priceMin: d.priceMin, priceMax: d.priceMax, currency: d.currency, metricsChecked: d.metricsChecked });
        isNew = s || isNew;
      }
      const r2 = await getRun();
      r2.visited = (r2.visited || 0) + 1;
      if (isNew) r2.saved = (r2.saved || 0) + 1;
      if (!found) r2.nophone = (r2.nophone || 0) + 1;
      const ok = (v) => (v ? "✓" : "—");
      const parts = `тел ${ok(d.phone)}, Instagram ${ok(d.instagram)}, Facebook ${ok(d.facebook)}` + (r2.opts && r2.opts.email ? `, почта ${ok(d.email)}` : "");
      r2.last = found ? `${d.name || "Салон"}: ${parts}${isNew ? "" : " (уже есть в базе)"}` : `${d.name || "Салон"}: контактов не нашли, пропущен`;
      await setRun(r2);
      sendResponse({});
      processNext();
    }
  })();
  return true;
});
