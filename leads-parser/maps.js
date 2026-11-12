// Google Maps: обходит заведения из выдачи и сохраняет название, телефон и ссылку.
(() => {
  if (window.__mapsLeadsParser) return;
  window.__mapsLeadsParser = true;

  let running = false;
  let statusText = "Остановлен";
  let processed = new Set();
  let visited = 0;
  let saved = 0;
  // Настоящий ли это сайт: закрытые сайты Google (business.site), ссылки на соцсети, страницы записи и бесплатные конструкторы настоящими не считаем
  const FAKE_SITE_RE = /(^|\.)(business\.site|negocio\.site|instagram\.com|facebook\.com|fb\.com|fb\.me|linktr\.ee|linktree\.com|beacons\.ai|lnk\.bio|bio\.site|taplink\.cc|campsite\.bio|booksy\.com|fresha\.com|vagaro\.com|styleseat\.com|schedulicity\.com|glossgenius\.com|setmore\.com|calendly\.com|wixsite\.com|weebly\.com|godaddysites\.com|mystrikingly\.com|vk\.com|vk\.ru|ok\.ru|t\.me|wa\.me|taplink\.ws|mssg\.me|hipolink\.me|dikidi\.net|dikidi\.ru|yclients\.com|2gis\.ru|tilda\.ws)$/i;
  function siteIsReal(url) {
    try { return !FAKE_SITE_RE.test(new URL(url).hostname.toLowerCase().replace(/^www\./, "")); } catch (e) { return true; }
  }
  let opts = { skipWebsite: false };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);

  async function waitFor(fn, timeout = 6000, step = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {}
      await sleep(step);
    }
    return null;
  }

  const clean = (s) => (s || "").replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ").trim();
  const getFeed = () => document.querySelector('div[role="feed"]');
  const getLinks = (feed) => Array.from(feed.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]'));

  function setStatus(text) {
    statusText = text;
    try {
      chrome.storage.local.set({ mapsStatus: { running, text, visited, saved, ts: Date.now() } });
    } catch (e) {}
  }

  function readDetails() {
    const h1 = document.querySelector("h1.DUwDvf") || Array.from(document.querySelectorAll("h1")).pop();
    const name = clean(h1 && h1.textContent);

    let phone = "";
    const phoneBtn =
      document.querySelector('button[data-item-id^="phone:tel:"]') ||
      document.querySelector('a[data-item-id^="phone:tel:"]');
    if (phoneBtn) {
      phone = clean(phoneBtn.innerText);
      if (!phone) phone = (phoneBtn.getAttribute("data-item-id") || "").replace("phone:tel:", "");
    }

    const webEl = document.querySelector('a[data-item-id="authority"]');
    const website = webEl ? webEl.href : "";
    return { name, phone, website, ...readMetrics() };
  }

  // Рейтинг и количество отзывов из шапки карточки: «4,8 ★★★★★ (123)»
  const toNum = (s) => { const n = Number(String(s || "").replace(/[\s\u00a0\u202f.,](?=\d{3}\b)/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
  function readMetrics() {
    let rating = null, reviews = null;
    const box = document.querySelector("div.F7nice") || document.querySelector('[role="main"] [role="img"][aria-label*="★"], [role="main"] span[role="img"]')?.parentElement;
    const text = clean(box && box.innerText);
    const m = text.match(/([1-5][.,]\d)\s*\(?\s*([\d\s\u00a0\u202f.,]+)?\)?/);
    if (m) { rating = toNum(m[1]); if (m[2] && /\d/.test(m[2])) reviews = toNum(m[2].trim()); }
    if (reviews === null) {
      const el = Array.from(document.querySelectorAll('[role="main"] [aria-label]')).find((e) => /\d[\d\s\u00a0.,]*\s*(reviews?|opini|recenz|отзыв|Rezension|reseñ|avis)/i.test(e.getAttribute("aria-label")));
      if (el) reviews = toNum((el.getAttribute("aria-label").match(/\d[\d\s\u00a0.,]*/) || [""])[0].trim());
    }
    return { rating, reviews, metricsChecked: rating !== null || reviews !== null };
  }

  async function processOne(link) {
    const listName = clean(link.getAttribute("aria-label"));
    link.scrollIntoView({ block: "center" });
    link.click();

    // ждём, пока откроется карточка заведения
    const t0 = Date.now();
    await waitFor(() => {
      const h1 = document.querySelector("h1.DUwDvf");
      if (!h1) return false;
      const n = clean(h1.textContent);
      return n && (n === listName || Date.now() - t0 > 3500);
    }, 8000);

    await waitFor(
      () => document.querySelector('button[data-item-id="address"], button[data-item-id^="phone:tel:"], a[data-item-id="authority"]'),
      4000
    );
    await sleep(rnd(900, 1500));

    const d = readDetails();
    visited++;
    if (!d.name || !d.phone) return;
    if (opts.skipWebsite && d.website && siteIsReal(d.website)) return; // по умолчанию сайт игнорируется; «мёртвые» и «слабые» сайты не пропускаем

    try {
      const res = await chrome.runtime.sendMessage({
        type: "lead",
        lead: { name: d.name, phone: d.phone, url: location.href, note: "Google Maps", website: d.website || "", siteChecked: true, rating: d.rating, reviews: d.reviews, metricsChecked: d.metricsChecked },
      });
      if (res && res.saved) saved++;
    } catch (e) {}
  }

  async function goBack() {
    if (getFeed()) return true;
    const labels = ["Back", "Wstecz", "Назад", "Zurück", "Atrás", "Retour"];
    for (const l of labels) {
      const el = document.querySelector(`button[aria-label="${l}"]`);
      if (el) {
        el.click();
        break;
      }
    }
    if (await waitFor(getFeed, 3000)) return true;
    history.back();
    return !!(await waitFor(getFeed, 5000));
  }

  async function run() {
    processed = new Set();
    visited = 0;
    saved = 0;
    let idle = 0;
    setStatus("Работаю…");

    while (running) {
      const feed = await waitFor(getFeed, 8000);
      if (!feed) {
        setStatus("Не вижу список результатов. Введите поиск (например «салон красоты Вроцлав»).");
        break;
      }

      const link = getLinks(feed).find((a) => !processed.has(a.href));
      if (link) {
        idle = 0;
        processed.add(link.href);
        try {
          await processOne(link);
        } catch (e) {
          console.warn("[Leads Parser]", e);
        }
        setStatus(`Работаю… просмотрено ${visited}, сохранено ${saved}`);
        if (!running) break;
        const back = await goBack();
        if (!back) {
          setStatus("Не удалось вернуться к списку. Остановлено.");
          break;
        }
        await sleep(rnd(700, 1400));
        continue;
      }

      // все видимые обработаны — подгружаем ещё
      feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
      await sleep(2200);
      const more = getLinks(feed).some((a) => !processed.has(a.href));
      if (!more) {
        idle++;
        if (idle >= 4) {
          running = false;
          setStatus(`Список закончился. Просмотрено ${visited}, сохранено ${saved}`);
          return;
        }
      }
    }

    const stoppedByUser = !running;
    running = false;
    if (stoppedByUser) setStatus(`Остановлен. Просмотрено ${visited}, сохранено ${saved}`);
    else setStatus(statusText);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.cmd === "start") {
      if (!running) {
        running = true;
        opts = Object.assign(opts, msg.opts || {});
        run();
      }
      sendResponse({ running, statusText, visited, saved });
    } else if (msg.cmd === "stop") {
      running = false;
      setStatus(`Остановлен. Просмотрено ${visited}, сохранено ${saved}`);
      sendResponse({ running, statusText, visited, saved });
    } else if (msg.cmd === "status") {
      sendResponse({ running, statusText, visited, saved });
    }
    return true;
  });
})();
