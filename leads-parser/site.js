// Конструктор сайтов: собирает со страницы салона (Booksy или Google Maps) всё, что нужно для сайта:
// название, адрес, телефон, описание, часы работы, услуги с ценами, отзывы, фото, логотип и соцсети.
// Срабатывает ТОЛЬКО во вкладке, которую открыла программа (фон подтверждает это по номеру вкладки).
(async () => {
  if (window.__lpSite) return;
  const host = location.hostname;
  const IS_BOOKSY = /(^|\.)booksy\.com$/.test(host);
  const IS_MAPS = (/(^|\.)google\.[a-z.]+$/.test(host) && location.pathname.startsWith("/maps")) || /^maps\.google\./.test(host);
  if (!IS_BOOKSY && !IS_MAPS) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (m) => new Promise((res) => { try { chrome.runtime.sendMessage(m, (r) => res(chrome.runtime.lastError ? null : r)); } catch (e) { res(null); } });

  // это задание программы? (спрашиваем несколько раз: фон мог ещё не запомнить вкладку)
  let task = null;
  for (let i = 0; i < 6 && !task; i++) {
    if (i) await sleep(1000);
    const r = await send({ type: "siteMine" });
    if (r && r.id) task = r;
  }
  if (!task || window.__lpSite) return;
  window.__lpSite = true;
  const progress = (text, extra) => send({ type: "siteProgress", id: task.id, text, ...(extra || {}) });

  async function waitFor(fn, timeout = 8000, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch (e) {}
      await sleep(step);
    }
    return null;
  }
  const clean = (s) => String(s || "").replace(/[-]/g, "").replace(/\s+/g, " ").trim();
  const cleanMulti = (s) => String(s || "").replace(/[-]/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const num = (s) => { const m = String(s || "").replace(",", ".").match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const intOf = (s) => { const d = String(s || "").replace(/[^\d]/g, ""); return d ? parseInt(d, 10) : null; };

  // ----- структурированные данные страницы (JSON-LD) -----
  function ldObjects() {
    const out = [];
    const add = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(add);
      out.push(o);
      if (o["@graph"]) add(o["@graph"]);
    };
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) { try { add(JSON.parse(sc.textContent)); } catch (e) {} }
    return out;
  }
  const BIZ_RE = /Salon|Barber|Spa|Beauty|Health|LocalBusiness|Store|Hair|Nail|Tattoo|Massage|Clinic|Organization/i;
  const ldBiz = () => ldObjects().find((o) => BIZ_RE.test(String(o["@type"] || "")) && o.name);

  // ----- дни недели -----
  const LANG = (document.documentElement.lang || navigator.language || "pl").slice(0, 2).toLowerCase();
  const DAYS = {
    pl: ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"],
    en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    ru: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
    uk: ["Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота", "Неділя"],
    de: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    es: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
  };
  const dayNames = DAYS[LANG] || DAYS.en;
  const CLOSED = { pl: "Zamknięte", en: "Closed", ru: "Закрыто", uk: "Зачинено", de: "Geschlossen", es: "Cerrado" }[LANG] || "Closed";
  const EN_IDX = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };
  const DAY_RE = /^(poniedzia|wtorek|środa|sroda|czwartek|piątek|piatek|sobota|niedziela|pon|wt|śr|sr|czw|pt|sob|nd|ndz|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/i;
  const TIME_RE = /\d{1,2}[:.]\d{2}\s*(?:[–—-]|do|to|до)\s*\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)|zamkni|closed|закрыт|nieczynne|geschlossen|cerrado|24\s*h|całą dobę|open 24/i;

  function hoursFromLd(o) {
    if (!o) return [];
    const spec = [].concat(o.openingHoursSpecification || []);
    const byDay = new Array(7).fill(null);
    for (const s of spec) {
      if (!s) continue;
      const days = [].concat(s.dayOfWeek || []);
      for (const d of days) {
        const key = String(d).split("/").pop().slice(0, 2).toLowerCase();
        if (!(key in EN_IDX)) continue;
        const t = s.opens && s.closes ? `${String(s.opens).slice(0, 5)}–${String(s.closes).slice(0, 5)}` : CLOSED;
        byDay[EN_IDX[key]] = byDay[EN_IDX[key]] ? byDay[EN_IDX[key]] + ", " + t : t;
      }
    }
    // формат "Mo-Fr 09:00-18:00"
    for (const line of [].concat(o.openingHours || [])) {
      const m = String(line).match(/^([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!m) continue;
      const a = EN_IDX[m[1].toLowerCase()], b = m[2] ? EN_IDX[m[2].toLowerCase()] : a;
      if (a == null || b == null) continue;
      for (let i = a; i <= b; i++) byDay[i] = `${m[3]}–${m[4]}`;
    }
    if (!byDay.some(Boolean)) return [];
    return byDay.map((t, i) => ({ day: dayNames[i], time: t || CLOSED }));
  }
  // часы со страницы: строки, где рядом стоят день недели и время
  function hoursFromDom(root) {
    const out = [], seen = new Set();
    const leaves = Array.from((root || document.body).querySelectorAll("*")).filter((e) => e.children.length === 0 && DAY_RE.test(clean(e.textContent)) && clean(e.textContent).length < 40);
    for (const el of leaves) {
      const day = clean(el.textContent).replace(/[:：]$/, "");
      if (seen.has(day.toLowerCase())) continue;
      let row = el.parentElement, time = "";
      for (let i = 0; i < 3 && row && !time; i++, row = row.parentElement) {
        const t = clean(row.innerText).replace(day, "").trim();
        if (t.length < 80 && TIME_RE.test(t)) time = t.replace(/^[:\s–-]+/, "");
      }
      if (!time) continue;
      seen.add(day.toLowerCase());
      out.push({ day, time });
      if (out.length >= 7) break;
    }
    return out.length >= 3 ? out : [];
  }

  // ----- фото -----
  const photoSet = new Map(); // ключ (без параметров размера) -> лучший адрес
  function addPhoto(u, priority = 0) {
    if (!u) return;
    u = String(u).trim().replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    if (u.startsWith("//")) u = "https:" + u;
    if (!/^https:\/\//.test(u)) return;
    if (/\.svg(\?|$)|sprite|favicon|placeholder|\/icons?\/|maps\.gstatic|\/maps\/vt|staticmap|streetview|cbk\?|\/emoji|flag/i.test(u)) return;
    let key = u;
    if (/googleusercontent\.com|ggpht\.com/.test(u)) {
      if (/googleusercontent\.com\/a[-/]/.test(u)) return; // аватары авторов отзывов
      // просим большую версию: …=w1600-h1200-k-no
      u = u.replace(/=[swh]\d+[^/?#]*$/, "") + "=w1600-h1200-k-no";
      key = u.replace(/=w1600.*$/, "");
    } else key = u.split("?")[0];
    const old = photoSet.get(key);
    if (!old || priority > old.priority) photoSet.set(key, { url: u, priority, order: old ? old.order : photoSet.size });
  }
  const bigFromSrcset = (ss) => {
    let best = "", bw = 0;
    String(ss || "").split(",").forEach((part) => { const [u, w] = part.trim().split(/\s+/); const n = parseInt(w, 10) || 1; if (u && n >= bw) { bw = n; best = u; } });
    return best;
  };
  function imgsIn(root, minSize, priority, filter) {
    root.querySelectorAll("img").forEach((img) => {
      const u = bigFromSrcset(img.getAttribute("srcset") || img.getAttribute("data-srcset")) || img.currentSrc || img.getAttribute("data-src") || img.src;
      const w = img.naturalWidth || img.width || parseInt(img.getAttribute("width"), 10) || 0;
      if (w && w < minSize) return;
      if (filter && !filter(u, img)) return;
      addPhoto(u, priority);
    });
    root.querySelectorAll('[style*="background-image"]').forEach((el) => {
      const m = (el.getAttribute("style") || "").match(/url\((['"]?)(.*?)\1\)/);
      if (m && (!filter || filter(m[2], el))) addPhoto(m[2], priority);
    });
  }

  // ===================================== BOOKSY =====================================
  function hasCaptcha() {
    for (const f of document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], iframe[src*="captcha"]')) if (visible(f)) return true;
    if (/just a moment|attention required|verify you are human/i.test(document.title)) return true;
    const t = (document.body && document.body.innerText) || "";
    return t.length < 1500 && /captcha|nie jestem robotem|verify you are human/i.test(t);
  }
  async function waitNoCaptcha() {
    if (!hasCaptcha()) return;
    await progress("⚠ Капча! Решите её в окне Booksy, сбор продолжится сам.", { captcha: true });
    while (hasCaptcha()) await sleep(1000);
    await progress("Капча пройдена, продолжаю…", { captcha: false });
    await sleep(1500);
  }
  const PRICE_RE = /(?:od\s+|from\s+|от\s+)?\d[\d\s ]*(?:[.,]\d{1,2})?\s*(?:zł|pln|€|eur|£|gbp|\$|usd|kr|czk|kč|руб|₽|грн|₴)\+?|(?:€|£|\$)\s*\d[\d\s]*(?:[.,]\d{1,2})?\+?/i;
  const DUR_RE = /^\d+\s*(?:min|mins|minut|minutes|h|godz|ч|мин)\b.*$|^\d+\s*h\s*\d+\s*min/i;
  const BTN_RE = /^(umów|umow|book|zarezerwuj|записаться|rezerwuj|wybierz|select|choose|dodaj|add|pokaż|show|więcej|more|\+)$/i;
  function booksyServices() {
    const out = [], seen = new Set();
    const leaves = Array.from(document.querySelectorAll("main *, body *")).filter((e) => e.children.length === 0 && PRICE_RE.test(clean(e.textContent)) && clean(e.textContent).length < 40);
    for (const el of leaves) {
      // поднимаемся к строке услуги: в ней есть название и ровно одна цена
      let row = el.parentElement, best = null;
      for (let i = 0; i < 6 && row && row !== document.body; i++, row = row.parentElement) {
        const lines = cleanMulti(row.innerText).split("\n").map(clean).filter(Boolean);
        const prices = lines.filter((l) => PRICE_RE.test(l) && l.length < 40);
        if (prices.length > 1 || lines.length > 10) break;
        const nameLine = lines.find((l) => !PRICE_RE.test(l) && !DUR_RE.test(l) && !BTN_RE.test(l) && l.length >= 3 && l.length <= 120);
        if (nameLine) { best = { row, lines, nameLine, price: clean(el.textContent) }; break; }
      }
      if (!best) continue;
      const key = (best.nameLine + "|" + best.price).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const duration = best.lines.find((l) => DUR_RE.test(l)) || "";
      const description = best.lines.find((l) => l !== best.nameLine && !PRICE_RE.test(l) && !DUR_RE.test(l) && !BTN_RE.test(l) && l.length > 30) || "";
      // категория: ближайший заголовок выше строки услуги
      let category = "";
      const heads = Array.from(document.querySelectorAll("h2,h3,h4"));
      for (const h of heads) if (h.compareDocumentPosition(best.row) & Node.DOCUMENT_POSITION_FOLLOWING) category = clean(h.textContent).slice(0, 80);
      out.push({ name: best.nameLine, price: best.price.replace(/\s+/g, " "), duration: clean(duration).slice(0, 40), description: clean(description).slice(0, 300), category });
      if (out.length >= 100) break;
    }
    return out;
  }
  function headingText(re) {
    const h = Array.from(document.querySelectorAll("h1,h2,h3,h4,div,span,p")).find((el) => el.children.length === 0 && re.test(clean(el.textContent)));
    if (!h) return "";
    // текст под заголовком: ближайший следующий блок с длинным текстом
    let box = h.parentElement;
    for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
      const t = cleanMulti(box.innerText).replace(clean(h.textContent), "").trim();
      if (t.length > 60) return t.replace(/\n?(pokaż więcej|show more|więcej|read more|показать больше)\s*$/i, "").trim();
    }
    return "";
  }
  function socialsFrom(urls) {
    const found = { instagram: "", facebook: "" };
    for (const raw of urls) {
      let x; try { x = new URL(raw, location.href); } catch (e) { continue; }
      const h = x.hostname.toLowerCase().replace(/^(www|m|l|web)\./, "");
      const first = (x.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
      if (h === "instagram.com" && first && !/^(p|reel|reels|explore|accounts|stories|tv|about|direct|legal|share)$/.test(first) && !/^booksy/.test(first) && !found.instagram) found.instagram = "https://www.instagram.com/" + first + "/";
      if ((h === "facebook.com" || h === "fb.com") && first && !/^(sharer|share|dialog|plugins|login|tr|policy|help|groups|events|watch|marketplace|business|ads|privacy|legal|hashtag|photo|permalink|story|l\.php|booksy)/.test(first) && !found.facebook) {
        found.facebook = first === "profile.php" && x.searchParams.get("id") ? "https://www.facebook.com/profile.php?id=" + x.searchParams.get("id") : "https://www.facebook.com/" + x.pathname.split("/").filter(Boolean).slice(0, first === "pages" ? 3 : 1).join("/");
      }
    }
    return found;
  }

  async function collectBooksy() {
    await waitNoCaptcha();
    await progress("Открываю страницу салона…");
    await waitFor(() => document.querySelector("h1"), 20000);
    await waitNoCaptcha();
    // листаем страницу, чтобы подгрузились фото, услуги и отзывы
    await progress("Листаю страницу, чтобы загрузились фото и услуги…");
    for (let i = 0; i < 14; i++) {
      window.scrollBy(0, Math.round(window.innerHeight * 0.85));
      await sleep(450);
      await waitNoCaptcha();
    }
    // раскрываем «Pokaż wszystkie / Show all» у услуг и описания
    for (const b of Array.from(document.querySelectorAll("button, a, [role=button]")).filter((e) => /^(pokaż (wszystkie|więcej)|show (all|more)|więcej|zobacz wszystkie usługi|показать (все|больше))/i.test(clean(e.innerText)) && clean(e.innerText).length < 40).slice(0, 8)) {
      try { b.click(); await sleep(500); } catch (e) {}
    }
    window.scrollTo(0, 0);
    await sleep(500);

    const biz = ldBiz() || {};
    const h1 = document.querySelector("h1");
    const name = clean(biz.name) || clean(h1 && h1.textContent);
    await progress("Читаю данные салона…");
    const a = biz.address || {};
    const address = typeof a === "string" ? clean(a) : [a.streetAddress, [a.postalCode, a.addressLocality].filter(Boolean).join(" ")].filter(Boolean).map(clean).join(", ");
    const tel = document.querySelector('a[href^="tel:"]');
    const phone = clean(biz.telephone) || (tel ? tel.getAttribute("href").replace(/^tel:/i, "") : "");
    const description = cleanMulti(biz.description) || headingText(/^(o nas|about( us)?|о нас|opis|o salonie|про нас)$/i);
    const ar = biz.aggregateRating || {};
    let rating = num(ar.ratingValue), reviewsCount = intOf(ar.reviewCount != null ? ar.reviewCount : ar.ratingCount);
    let hours = hoursFromLd(biz);
    if (!hours.length) hours = hoursFromDom();
    const services = booksyServices();
    // отзывы: из данных страницы
    const reviews = [].concat(biz.review || []).map((r) => ({
      author: clean(r.author && (r.author.name || r.author)), text: cleanMulti(r.reviewBody || r.description), rating: num(r.reviewRating && r.reviewRating.ratingValue), date: clean(r.datePublished),
    })).filter((r) => r.text && r.text.length > 15);

    await progress("Собираю фото…");
    // фото: из данных страницы, из галереи и из скрытых данных приложения Booksy
    [].concat(biz.image || []).forEach((im) => addPhoto(typeof im === "string" ? im : im && (im.contentUrl || im.url), 3));
    const og = document.querySelector('meta[property="og:image"]');
    if (og) addPhoto(og.content, 2);
    const notAvatar = (u, el) => !/avatar|staff|employee|user|profile_photo|logo/i.test(u + " " + ((el && el.className) || "") + " " + ((el && el.alt) || ""));
    imgsIn(document, 260, 2, notAvatar);
    const scriptsText = Array.from(document.scripts).filter((s) => !s.src && s.textContent.length > 200).map((s) => s.textContent).join("\n");
    const re = /https?:(?:\\?\/|\\u002F){2}[^"'\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>\\]*)?/gi;
    for (const m of scriptsText.matchAll(re)) {
      const u = m[0].replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
      if (/biz_photo|business|photo|gallery|inspiration|cover/i.test(u) && notAvatar(u)) addPhoto(u, 1);
    }
    // логотип
    let logo = "";
    if (biz.logo) logo = typeof biz.logo === "string" ? biz.logo : biz.logo.url || biz.logo.contentUrl || "";
    if (!logo) { const li = Array.from(document.images).find((i) => /logo/i.test(i.alt + " " + i.className + " " + i.src) && !/booksy\.com\/.*booksy|booksy-logo|\/static\//i.test(i.src)); if (li) logo = li.currentSrc || li.src; }

    const urls = [].concat(biz.sameAs || []).concat(Array.from(document.querySelectorAll("a[href]")).map((x) => x.href));
    const soc = socialsFrom(urls);
    const geo = biz.geo || {};
    return {
      source: "booksy", sourceUrl: location.origin + location.pathname, bookingUrl: location.origin + location.pathname,
      name, phone, address, city: clean(a.addressLocality), street: clean(a.streetAddress), postalCode: clean(a.postalCode),
      lat: num(geo.latitude), lng: num(geo.longitude), description, rating, reviewsCount, priceRange: clean(biz.priceRange),
      category: "", hours, services, reviews, instagram: soc.instagram, facebook: soc.facebook, logo,
    };
  }

  // ===================================== GOOGLE MAPS =====================================
  const pane = () => { const h = document.querySelector("h1.DUwDvf") || document.querySelector('div[role="main"] h1'); return h ? h.closest('div[role="main"]') || document : document; };
  function clickTab(re) {
    const tab = Array.from(document.querySelectorAll('button[role="tab"]')).find((b) => re.test(clean(b.getAttribute("aria-label")) + " " + clean(b.innerText)));
    if (tab) { tab.click(); return true; }
    return false;
  }
  function scrollerOf(el) {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 50) return p;
    }
    return null;
  }
  function mapsHours() {
    // 1) таблица часов
    const rows = Array.from(document.querySelectorAll("table.eK4R0e tr, table[class] tr")).map((tr) => {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 2) return null;
      const day = clean(tds[0].innerText), time = clean(tds[1].getAttribute("aria-label") || tds[1].innerText).replace(/\s*,\s*/g, ", ");
      return DAY_RE.test(day) && time ? { day, time } : null;
    }).filter(Boolean);
    if (rows.length >= 5) return rows.slice(0, 7);
    // 2) подпись вида «Monday, 9 AM to 7 PM; Tuesday, …»
    const lab = Array.from(document.querySelectorAll("[aria-label]")).map((e) => e.getAttribute("aria-label")).find((t) => (t.match(/;/g) || []).length >= 5 && DAY_RE.test(t.trim()));
    if (lab) {
      return lab.split(";").map((p) => p.trim()).filter((p) => DAY_RE.test(p)).slice(0, 7).map((p) => {
        const i = p.indexOf(",");
        return { day: clean(p.slice(0, i > 0 ? i : p.length)), time: clean(i > 0 ? p.slice(i + 1) : "").replace(/\.\s*(Hide|Ukryj|Скрыть).*$/i, "").replace(/\s+to\s+/g, "–") };
      });
    }
    return hoursFromDom(pane());
  }
  async function mapsReviews() {
    if (!clickTab(/review|opini|отзыв|rezension|reseñ|avis|recens/i)) return [];
    await waitFor(() => document.querySelector("[data-review-id]"), 8000);
    await sleep(1200);
    const first = document.querySelector("[data-review-id]");
    const sc = first && scrollerOf(first);
    for (let i = 0; i < 4 && sc; i++) { sc.scrollTop = sc.scrollHeight; await sleep(1300); }
    // раскрываем длинные отзывы («Ещё»)
    document.querySelectorAll("button.w8nwRe, button[aria-label*='See more'], button[aria-label*='Więcej'], button[aria-label*='Ещё'], button[jsaction*='review.expandReview']").forEach((b) => { try { b.click(); } catch (e) {} });
    await sleep(700);
    const out = [], seen = new Set();
    document.querySelectorAll("[data-review-id]").forEach((el) => {
      const id = el.getAttribute("data-review-id");
      if (seen.has(id)) return;
      const author = clean((el.querySelector(".d4r55") || {}).textContent || el.getAttribute("aria-label"));
      const textEl = el.querySelector(".wiI7pd") || el.querySelector("[class*='MyEned'] span");
      const text = cleanMulti(textEl && textEl.innerText);
      const stEl = el.querySelector("span.kvMYJc, span[role='img'][aria-label]");
      const rating = stEl ? num(stEl.getAttribute("aria-label")) : null;
      const date = clean((el.querySelector(".rsqaWe") || {}).textContent);
      if (!text || text.length < 20) return;
      seen.add(id);
      out.push({ author, text, rating, date });
    });
    // лучшие отзывы: 4–5 звёзд, сначала подробные
    return out.filter((r) => r.rating == null || r.rating >= 4).sort((a, b) => (b.rating || 5) - (a.rating || 5) || b.text.length - a.text.length).slice(0, 12);
  }
  const MAPS_PHOTO = (u) => /googleusercontent\.com\/(p|gps-cs-s|gps-proxy|geougc|proxy)\/|ggpht\.com\/(p|gps)/.test(u);
  async function mapsPhotos() {
    imgsIn(pane(), 0, 2, MAPS_PHOTO);
    // открываем галерею фото (большая картинка в шапке карточки)
    const hero = document.querySelector('button[jsaction*="heroHeaderImage"], button[aria-label^="Photo of"], button[aria-label^="Zdjęcie"], button[aria-label^="Фото"]');
    if (!hero) return;
    hero.click();
    await waitFor(() => document.querySelector("[data-photo-index]"), 8000);
    await sleep(1500);
    const first = document.querySelector("[data-photo-index]");
    const sc = first && scrollerOf(first);
    for (let i = 0; i < 6; i++) {
      imgsIn(document, 0, 1, MAPS_PHOTO);
      if (!sc) break;
      sc.scrollTop = sc.scrollHeight;
      await sleep(1200);
      if (photoSet.size >= 30) break;
    }
    imgsIn(document, 0, 1, MAPS_PHOTO);
  }

  async function collectMaps() {
    await progress("Открываю карточку заведения…");
    const h1 = await waitFor(() => document.querySelector("h1.DUwDvf") || document.querySelector('div[role="main"] h1'), 25000);
    if (!h1) throw new Error("Не открылась карточка заведения в Google Maps");
    await waitFor(() => document.querySelector('button[data-item-id="address"], button[data-item-id^="phone:tel:"]'), 6000);
    await sleep(1200);
    const name = clean(h1.textContent);
    const cat = document.querySelector("button.DkEaL") || document.querySelector('button[jsaction*="category"]');
    const addrBtn = document.querySelector('button[data-item-id="address"]');
    const address = addrBtn ? clean((addrBtn.querySelector(".Io6YTe") || addrBtn).innerText || "") || clean((addrBtn.getAttribute("aria-label") || "").replace(/^[^:]+:\s*/, "")) : "";
    const phBtn = document.querySelector('button[data-item-id^="phone:tel:"], a[data-item-id^="phone:tel:"]');
    const phone = phBtn ? clean((phBtn.querySelector(".Io6YTe") || phBtn).innerText) || (phBtn.getAttribute("data-item-id") || "").replace("phone:tel:", "") : "";
    const web = document.querySelector('a[data-item-id="authority"]');
    const ratingBox = document.querySelector("div.F7nice");
    const rating = ratingBox ? num((ratingBox.querySelector('span[aria-hidden="true"]') || ratingBox).textContent) : null;
    const rcEl = ratingBox && Array.from(ratingBox.querySelectorAll("span[aria-label]")).find((s) => /\d/.test(s.getAttribute("aria-label")));
    const reviewsCount = rcEl ? intOf(rcEl.getAttribute("aria-label")) : ratingBox ? intOf((ratingBox.innerText.match(/\(([\d\s.,]+)\)/) || [])[1]) : null;
    const desc = document.querySelector(".PYvSYb") || document.querySelector('div[aria-label*="About"] .WeS02d');
    // часы: если таблица скрыта, раскрываем её
    let hours = mapsHours();
    if (!hours.length) {
      const t = document.querySelector('[data-item-id="oh"], [jsaction*="openhours"], div.OMl5r');
      if (t) { try { t.click(); } catch (e) {} await sleep(1200); hours = mapsHours(); }
    }
    // координаты из адреса страницы
    const m = location.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const city = (() => { const p = address.split(",").map((x) => x.trim()); const last = p[p.length - 1] || ""; return clean(last.replace(/^\d{2}-\d{3}\s*/, "").replace(/\d{5}\s*/, "")); })();
    const soc = socialsFrom(Array.from(pane().querySelectorAll("a[href]")).map((a) => a.href).concat(web ? [web.href] : []));
    await progress("Собираю отзывы…");
    const reviews = await mapsReviews().catch(() => []);
    clickTab(/overview|przegląd|обзор|übersicht|resumen|aperçu/i);
    await sleep(800);
    await progress("Собираю фото…");
    await mapsPhotos().catch(() => {});
    return {
      source: "maps", sourceUrl: location.href.split("#")[0], mapsUrl: location.href.split("#")[0], bookingUrl: "",
      name, category: clean(cat && cat.textContent), phone, address, city, lat: m ? parseFloat(m[1]) : null, lng: m ? parseFloat(m[2]) : null,
      website: web ? web.href : "", description: cleanMulti(desc && desc.innerText), rating, reviewsCount, hours, services: [], reviews,
      instagram: soc.instagram, facebook: soc.facebook, logo: "",
    };
  }

  try {
    const data = IS_BOOKSY ? await collectBooksy() : await collectMaps();
    data.photos = Array.from(photoSet.values()).sort((a, b) => b.priority - a.priority || a.order - b.order).map((p) => p.url).slice(0, 40);
    await progress(`Готово: фото ${data.photos.length}, услуг ${data.services.length}, отзывов ${data.reviews.length}`);
    await send({ type: "siteResult", id: task.id, data });
  } catch (e) {
    await send({ type: "siteResult", id: task.id, error: String((e && e.message) || e) });
  }
})();
