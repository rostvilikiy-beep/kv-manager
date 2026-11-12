// 2ГИС: обходит организации из выдачи поиска и сохраняет название, телефон, ВК, Telegram, WhatsApp, почту,
// сайт, рейтинг и количество отзывов. По галочке пропускает тех, у кого есть настоящий сайт.
// Данные берём из ответа сервера 2ГИС (dgis-hook.js), а если его нет — читаем из открытой карточки.
(() => {
  if (window.__dgisLeadsParser) return;
  window.__dgisLeadsParser = true;

  let running = false, statusText = "Остановлен", visited = 0, saved = 0, skipped = 0;
  let opts = { skipWebsite: true };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  async function waitFor(fn, timeout = 6000, step = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch (e) {}
      await sleep(step);
    }
    return null;
  }
  const clean = (s) => String(s || "").replace(/[‒-―]/g, "-").replace(/\s+/g, " ").trim();
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  // Не настоящий сайт: соцсети, мессенджеры, мультиссылки, онлайн-запись и бесплатные конструкторы
  const FAKE_SITE_RE = /(^|\.)(vk\.com|vk\.ru|vk\.me|ok\.ru|t\.me|telegram\.me|wa\.me|whatsapp\.com|instagram\.com|facebook\.com|youtube\.com|tiktok\.com|taplink\.cc|taplink\.ws|linktr\.ee|mssg\.me|hipolink\.me|hipolink\.net|dikidi\.net|dikidi\.ru|yclients\.com|n\d+\.yclients\.com|sonline\.su|arnica\.pro|booksy\.com|2gis\.ru|yandex\.ru|avito\.ru|profi\.ru|business\.site|wixsite\.com|tilda\.ws|ucoz\.ru|ucoz\.net|narod\.ru|wordpress\.com|blogspot\.com)$/i;
  const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };
  const siteIsReal = (u) => { const h = hostOf(u); return !!h && !FAKE_SITE_RE.test(h); };

  // Ссылки 2ГИС идут через переадресацию link.2gis.ru: достаём настоящий адрес
  function unwrap(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (!/link\.2gis\./i.test(u)) return u;
    const q = u.indexOf("?");
    if (q > 0) {
      const tail = decodeURIComponent(u.slice(q + 1));
      const m = tail.match(/https?:\/\/[^\s"'<>]+/i);
      if (m) return m[0];
    }
    for (const part of u.split(/[/?&=]/)) {
      if (part.length < 12) continue;
      try {
        const s = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
        const m = s.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/i);
        if (m) return m[0];
      } catch (e) {}
    }
    return u;
  }
  const withProto = (u) => (u && !/^https?:\/\//i.test(u) ? "https://" + u.replace(/^\/+/, "") : u);
  function normVk(u) {
    u = withProto(unwrap(u));
    const m = String(u).match(/^https?:\/\/(?:m\.|www\.)?vk\.(?:com|ru)\/([A-Za-z0-9_.]+)/i);
    return m && !/^(away\.php|share\.php|im|login|feed)$/i.test(m[1]) ? "https://vk.com/" + m[1] : "";
  }
  function normTg(u) {
    const m = String(withProto(unwrap(u))).match(/^https?:\/\/(?:t|telegram)\.me\/([A-Za-z0-9_+]+)/i);
    return m ? "https://t.me/" + m[1] : "";
  }
  function normWa(u) {
    const s = String(unwrap(u));
    const m = s.match(/wa\.me\/(\d{10,15})/i) || s.match(/phone=(\d{10,15})/i);
    return m ? "+" + m[1] : "";
  }
  function phoneRu(p) {
    p = clean(p);
    const d = p.replace(/\D/g, "");
    if (d.length === 11 && /^[78]/.test(d)) return "+7 " + d.slice(1);
    if (p.startsWith("+")) return p;
    return d.length >= 7 ? p : "";
  }

  // ---------- данные из ответа сервера ----------
  const cache = new Map(); // id организации (до «_») -> данные
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || !e.data.__lp2gis || !Array.isArray(e.data.items)) return;
    for (const it of e.data.items) {
      const id = String(it.id || "").split("_")[0];
      if (id) cache.set(id, Object.assign(cache.get(id) || {}, it));
    }
  });
  const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
  function fromApi(it) {
    const f = { name: clean(it.name), address: clean(it.address), rubric: (it.rubrics || [])[0] || "", phones: [], website: "", email: "", vk: "", telegram: "", whatsapp: "", instagram: "" };
    for (const g of it.contact_groups || []) {
      for (const c of (g && g.contacts) || []) {
        const type = String(c.type || "").toLowerCase();
        const val = c.url || c.value || c.text || "";
        if (type === "phone") { const p = phoneRu(c.value || c.text); if (p && !f.phones.includes(p)) f.phones.push(p); }
        else if (type === "website") { if (!f.website) f.website = withProto(unwrap(c.url || "") || c.text || c.value || ""); }
        else if (type === "email") { if (!f.email) f.email = clean(c.value || c.text); }
        else if (type === "vkontakte" || type === "vk") { if (!f.vk) f.vk = normVk(val) || normVk(c.value); }
        else if (type === "telegram") { if (!f.telegram) f.telegram = normTg(val) || normTg(c.value); }
        else if (type === "whatsapp") { if (!f.whatsapp) f.whatsapp = normWa(val) || normWa(c.value); }
        else if (type === "instagram") { if (!f.instagram) f.instagram = withProto(unwrap(val)); }
      }
    }
    const r = it.reviews || {};
    f.rating = num(r.general_rating != null ? r.general_rating : r.org_rating != null ? r.org_rating : r.rating);
    f.reviews = num(r.general_review_count != null ? r.general_review_count : r.org_review_count != null ? r.org_review_count : r.review_count);
    return f;
  }

  // ---------- запасной путь: читаем открытую карточку ----------
  const firmIdOf = (href) => { const m = String(href || "").match(/\/firm\/(\d+)/); return m ? m[1] : ""; };
  async function revealPhones() {
    const b = Array.from(document.querySelectorAll('button, [role="button"], a')).filter(visible)
      .find((x) => /показать (телефон|номер)/i.test(x.innerText || x.getAttribute("aria-label") || ""));
    if (b) { try { b.click(); } catch (e) {} await sleep(rnd(800, 1400)); }
  }
  function fromDom() {
    const f = { name: "", address: "", rubric: "", phones: [], website: "", email: "", vk: "", telegram: "", whatsapp: "", instagram: "", rating: null, reviews: null };
    const h1 = Array.from(document.querySelectorAll("h1")).filter(visible).pop();
    f.name = clean(h1 && h1.innerText);
    // карточка: ближайший к заголовку крупный блок
    let card = h1 || document.body;
    for (let i = 0; i < 8 && card.parentElement; i++) { card = card.parentElement; if ((card.innerText || "").length > 400) break; }
    for (const a of card.querySelectorAll('a[href^="tel:"]')) { const p = phoneRu(a.getAttribute("href").slice(4)); if (p && !f.phones.includes(p)) f.phones.push(p); }
    const m = card.querySelector('a[href^="mailto:"]');
    if (m) f.email = clean(m.getAttribute("href").slice(7).split("?")[0]);
    for (const a of card.querySelectorAll("a[href]")) {
      const real = unwrap(a.href), label = (a.innerText || a.getAttribute("aria-label") || "").trim();
      if (!f.vk && (normVk(real) || /^вконтакте$/i.test(label))) f.vk = normVk(real);
      else if (!f.telegram && normTg(real)) f.telegram = normTg(real);
      else if (!f.whatsapp && normWa(real)) f.whatsapp = normWa(real);
      else if (!f.instagram && /instagram\.com\//i.test(real)) f.instagram = real;
      else if (!f.website && /link\.2gis\./i.test(a.href) && /^[a-zа-я0-9-]+(\.[a-zа-я0-9-]+)+(\/\S*)?$/i.test(label)) f.website = withProto(siteIsReal(withProto(real)) ? real : label);
    }
    const text = card.innerText || "";
    const rv = text.match(/(\d[\d\s]*)\s+(отзыв|оцен)/i);
    if (rv) f.reviews = Number(rv[1].replace(/\s/g, ""));
    const rt = text.match(/(?:^|\n)\s*([1-5][.,]\d)\s*(?:\n|$)/);
    if (rt) f.rating = Number(rt[1].replace(",", "."));
    return f;
  }

  // ---------- список выдачи ----------
  const scrollParent = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 20) return p; } return document.scrollingElement; };
  // Ссылки на организации из списка результатов (а не из открытой карточки: «филиалы», «рядом»).
  // Берём группу ссылок с общим прокручиваемым контейнером, в которой их больше всего.
  function listLinks() {
    const groups = new Map();
    for (const a of document.querySelectorAll('a[href*="/firm/"]')) {
      if (!visible(a) && !a.offsetParent) continue;
      const sp = scrollParent(a);
      if (!groups.has(sp)) groups.set(sp, []);
      groups.get(sp).push(a);
    }
    let best = { box: null, links: [] };
    for (const [box, links] of groups) if (links.length > best.links.length) best = { box, links };
    const seen = new Set();
    best.links = best.links.filter((a) => { const id = firmIdOf(a.href); if (!id || seen.has(id)) return false; seen.add(id); return true; });
    return best;
  }
  const curPage = () => { const m = location.pathname.match(/\/page\/(\d+)/); return m ? Number(m[1]) : 1; };
  async function nextPage() {
    const n = curPage() + 1;
    const a = Array.from(document.querySelectorAll(`a[href*="/page/${n}"]`)).find((x) => !/\/firm\//.test(x.getAttribute("href") || ""));
    if (!a) return false;
    a.scrollIntoView({ block: "center" });
    a.click();
    return !!(await waitFor(() => curPage() === n, 8000));
  }

  function setStatus(text) {
    statusText = text;
    try { chrome.storage.local.set({ dgisStatus: { running, text, visited, saved, ts: Date.now() } }); } catch (e) {}
  }

  async function processOne(link) {
    const id = firmIdOf(link.href);
    link.scrollIntoView({ block: "center" });
    await sleep(rnd(300, 700));
    link.click();
    await waitFor(() => firmIdOf(location.href) === id, 6000);
    let it = await waitFor(() => cache.get(id), 5000);
    await sleep(rnd(900, 1600));
    let f;
    if (it && (it.contact_groups || []).length) f = fromApi(it);
    else {
      await revealPhones();
      f = fromDom();
      if (it) { const a = fromApi(it); f.rating = a.rating ?? f.rating; f.reviews = a.reviews ?? f.reviews; f.name = a.name || f.name; }
    }
    visited++;
    if (!f.name) return;
    if (!f.phones.length && !f.vk && !f.telegram && !f.whatsapp && !f.email) return;
    if (opts.skipWebsite && f.website && siteIsReal(f.website)) { skipped++; return; }
    const url = "https://2gis.ru" + location.pathname.replace(/\/tab\/.*$/, "");
    try {
      const res = await chrome.runtime.sendMessage({ type: "dgisFirm", firm: { id, url, ...f, phone: f.phones[0] || "", siteReal: !!f.website && siteIsReal(f.website) } });
      if (res && res.saved) saved++;
    } catch (e) {}
  }

  async function run() {
    visited = 0; saved = 0; skipped = 0;
    const processed = new Set();
    let idle = 0;
    setStatus("Работаю…");
    while (running) {
      const { box, links } = listLinks();
      if (!links.length) { setStatus("Не вижу список организаций. Введите поиск в 2ГИС (например «салон красоты»)."); break; }
      const link = links.find((a) => !processed.has(firmIdOf(a.href)));
      if (link) {
        idle = 0;
        processed.add(firmIdOf(link.href));
        try { await processOne(link); } catch (e) { console.warn("[Leads Parser 2ГИС]", e); }
        setStatus(`Работаю… стр. ${curPage()}, просмотрено ${visited}, сохранено ${saved}` + (skipped ? `, с сайтом пропущено ${skipped}` : ""));
        await sleep(rnd(800, 1600));
        continue;
      }
      // все видимые обработаны: прокручиваем список, затем переходим на следующую страницу
      if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
      await sleep(1500);
      if (listLinks().links.some((a) => !processed.has(firmIdOf(a.href)))) continue;
      if (await nextPage()) { await sleep(rnd(2000, 3000)); continue; }
      if (++idle >= 2) {
        running = false;
        setStatus(`Список закончился. Просмотрено ${visited}, сохранено ${saved}` + (skipped ? `, с сайтом пропущено ${skipped}` : ""));
        return;
      }
    }
    const byUser = !running;
    running = false;
    setStatus(byUser ? `Остановлен. Просмотрено ${visited}, сохранено ${saved}` : statusText);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.cmd === "start") {
      if (!running) { running = true; opts = Object.assign(opts, msg.opts || {}); run(); }
    } else if (msg.cmd === "stop") {
      running = false;
      setStatus(`Остановлен. Просмотрено ${visited}, сохранено ${saved}`);
    } else if (msg.cmd !== "status") return;
    sendResponse({ running, statusText, visited, saved });
  });
})();
