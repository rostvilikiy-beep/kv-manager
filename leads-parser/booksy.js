// Booksy: на странице списка собирает салоны, на странице салона (в рабочей вкладке) берёт название и телефон.
(() => {
  if (window.__booksyParser) return;
  window.__booksyParser = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const PROFILE_RE = /^\/[a-z]{2}-[a-z]{2}\/\d+_/;
  const isProfile = () => PROFILE_RE.test(location.pathname);

  async function waitFor(fn, timeout = 8000, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {}
      await sleep(step);
    }
    return null;
  }

  // ---------- Капча: мы её НЕ решаем, только ждём, пока её решит пользователь ----------
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    }
    return true;
  }
  function hasCaptcha() {
    const frames = document.querySelectorAll(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], iframe[src*="captcha"]'
    );
    for (const f of frames) if (isVisible(f)) return true;
    if (/just a moment|attention required|verify you are human|подтвердите, что вы человек/i.test(document.title)) return true;
    const t = (document.body && document.body.innerText) || "";
    if (t.length < 1500 && /captcha|nie jestem robotem|potwierdź, że jesteś człowiekiem|verify you are human/i.test(t)) return true;
    return false;
  }
  async function waitNoCaptcha() {
    if (!hasCaptcha()) return;
    chrome.runtime.sendMessage({ type: "captcha", active: true });
    while (hasCaptcha()) await sleep(1000);
    chrome.runtime.sendMessage({ type: "captcha", active: false });
    await sleep(1500);
  }

  // ---------- Страница салона ----------
  const SHOW_RE = /^(poka[żz]|show|показать)$/i;
  const HIDDEN_RE = /(ukryte|hidden|скрыт|e-?mail|telefon|phone|@)/i;
  // Телефон в любом виде: 798 043 134, +48 798 043 134, (517) 894-1961, 517-894-1961, 517.894.1961
const isPhoneText = (t) => {
  t = String(t || "").trim();
  const digits = t.replace(/\D/g, "");
  return t.length <= 24 && /^[+(\d][\d\s\-().+]*$/.test(t) && digits.length >= 8 && digits.length <= 15;
};

  // Заголовок блока «DANE BIZNESU»
  function findSection() {
    return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,div,span,p")).find(
      (el) => el.children.length === 0 && /^(dane biznesu|business (data|info|details)|данные бизнеса|информация о бизнесе)$/i.test((el.textContent || "").trim())
    );
  }
  function afterSection(el, section) {
    return !section || !!(section.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  // Телефон из структурированных данных страницы (JSON-LD, поле telephone): Booksy добавляет его уже в браузере
  function ldPhone() {
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(sc.textContent);
        const arr = Array.isArray(j) ? j : j["@graph"] || [j];
        for (const o of arr) if (o && o.telephone) return String(o.telephone).trim();
      } catch (e) {}
    }
    return "";
  }
  const hasDetailsHeading = () => !!findSection();

  function readPhone() {
    const fromLd = ldPhone();
    if (fromLd) return fromLd;
    const section = findSection();
    const tel = Array.from(document.querySelectorAll('a[href^="tel:"]')).find((a) => afterSection(a, section));
    if (tel) return tel.getAttribute("href").replace(/^tel:/i, "").trim();
    const cand = Array.from(document.querySelectorAll("a, span, div, p")).find(
      (el) => el.children.length === 0 && isPhoneText(el.innerText) && afterSection(el, section)
    );
    return cand ? cand.innerText.trim() : "";
  }

  // Ждём, пока телефон появится на странице (он грузится с задержкой, в фоновой вкладке ещё медленнее).
  // Если блок контактов уже отрисован, а телефона в нём нет, ждём ещё немного и считаем, что номера нет.
  async function waitForPhone(maxMs = 25000) {
    const t0 = Date.now();
    let headSeen = 0, scrolls = 0, lastScroll = t0;
    while (Date.now() - t0 < maxMs) {
      await waitNoCaptcha();
      const p = readPhone();
      if (p) return p;
      if (hasDetailsHeading()) {
        if (!headSeen) headSeen = Date.now();
        else if (Date.now() - headSeen > 6000) return "";
      } else if (scrolls < 6 && Date.now() - lastScroll > 2000 && Date.now() - t0 > 5000) {
        // блока ещё нет: возможно, он подгружается при прокрутке. Листаем понемногу, пока не появится
        window.scrollBy(0, Math.round(window.innerHeight * 0.8));
        scrolls++; lastScroll = Date.now();
      }
      await sleep(400);
    }
    return "";
  }

  function hasHiddenContext(el) {
    let p = el;
    for (let i = 0; i < 3 && p; i++) {
      p = p.parentElement;
      if (p && p.innerText && p.innerText.length < 120 && HIDDEN_RE.test(p.innerText)) return true;
    }
    return false;
  }
  const clicked = new WeakSet();
  function findShowButtons() {
    return Array.from(document.querySelectorAll('button, a, [role="button"], span')).filter((el) => {
      if (clicked.has(el) || el.children.length > 1) return false;
      const t = (el.innerText || "").trim();
      return t.length < 15 && SHOW_RE.test(t) && hasHiddenContext(el);
    });
  }
  // Почта салона: на странице скрыта кнопкой «Pokaż / Show» и после нажатия появляется обычным текстом в блоке контактов.
  const EMAIL_FULL_RE = /^[a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,}$/i;
  function readEmail() {
    const section = findSection();
    const found = [];
    document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
      const e = a.getAttribute("href").replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
      if (e) found.push(e);
    });
    Array.from(document.querySelectorAll("a, span, div, p"))
      .filter((el) => el.children.length === 0 && afterSection(el, section))
      .forEach((el) => {
        const t = (el.innerText || "").trim();
        if (EMAIL_FULL_RE.test(t)) found.push(t.toLowerCase());
      });
    // служебные адреса самого Booksy (подвал сайта) почтой салона не считаем
    return found.find((e) => !/@(.+\.)?booksy\.com$/.test(e) && !/\.(png|jpe?g|svg|webp|gif)$/.test(e)) || "";
  }
  // Нажимает «Pokaż» в блоке контактов и ждёт появления почты. Если появится капча, ждёт, пока вы её решите.
  async function collectEmail() {
    let email = readEmail();
    if (email) return email;
    for (const el of findShowButtons()) {
      clicked.add(el);
      try {
        el.scrollIntoView({ block: "center" });
        await sleep(rnd(400, 900));
        el.click();
      } catch (e) {}
      await sleep(rnd(900, 1500));
      await waitNoCaptcha();
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      email = readEmail();
      if (email) return email;
      await sleep(400);
    }
    return "";
  }

  // Нажимаем «Pokaż», только если телефон не виден сразу
  async function revealContacts() {
    for (const el of findShowButtons()) {
      clicked.add(el);
      try {
        el.scrollIntoView({ block: "center" });
        await sleep(rnd(300, 600));
        el.click();
      } catch (e) {}
      await sleep(rnd(700, 1100));
      await waitNoCaptcha();
    }
  }

  let parsing = false;

  // ---------- Соцсети салона (режим «Соцсети») ----------
  // Из ссылки берём только страницу самого салона: чужие и служебные ссылки (Booksy, шаринг, посты) отбрасываем.
  function classifySocial(raw) {
    let x;
    try { x = new URL(raw, location.href); } catch (e) { return null; }
    const host = x.hostname.toLowerCase().replace(/^(www|m|l|mobile|web)\./, "");
    const parts = x.pathname.split("/").filter(Boolean);
    const first = (parts[0] || "").toLowerCase();
    if (/(^|\.)booksy\.com$/.test(host)) return null;
    if (host === "instagram.com") {
      if (!first || /^(p|reel|reels|explore|accounts|stories|tv|about|direct|legal|developer|web|share)$/.test(first)) return null;
      if (/^booksy/.test(first)) return null;
      return { net: "instagram", url: "https://www.instagram.com/" + parts[0] + "/" };
    }
    if (host === "facebook.com" || host === "fb.com" || host === "fb.me") {
      if (first === "profile.php") {
        const id = x.searchParams.get("id");
        return id ? { net: "facebook", url: "https://www.facebook.com/profile.php?id=" + id } : null;
      }
      if (first === "share") return parts.length === 2 && parts[1].length > 3 ? { net: "facebook", url: "https://www.facebook.com/share/" + parts[1] + "/" } : null;
      if (!first || /^(sharer|share|dialog|plugins|login|tr|policy|policies|help|groups|events|watch|marketplace|business|ads|privacy|legal|hashtag|photo|permalink|story|l\.php|booksy)/.test(first)) return null;
      const keep = first === "pages" ? parts.slice(0, 3) : parts.slice(0, 1); // pages/Название/ID
      return { net: "facebook", url: "https://www.facebook.com/" + keep.join("/") };
    }
    return null;
  }
  // Сайт салона. Booksy кладёт его в данные страницы (sameAs) вместе с соцсетями.
  // Не считаем сайтом: соцсети, карты, справочники, сервисы записи и «ссылку в профиле» (Linktree и подобные).
  const NOT_SITE = ["booksy.com", "instagram.com", "facebook.com", "fb.com", "fb.me", "messenger.com", "tiktok.com", "youtube.com", "youtu.be", "twitter.com", "x.com",
    "linkedin.com", "snapchat.com", "threads.net", "wikipedia.org", "goo.gl", "g.page", "yelp.com", "vagaro.com", "fresha.com", "styleseat.com", "squareup.com", "square.site",
    "setmore.com", "schedulicity.com", "mindbodyonline.com", "versum.com", "znanylekarz.pl", "whatsapp.com", "wa.me", "t.me", "telegram.me", "foursquare.com", "apple.com",
    "linktr.ee", "linkin.bio", "beacons.ai", "bio.link", "taplink.cc", "lnk.bio", "hoo.be", "campsite.bio", "msha.ke", "solo.to"];
  function siteFrom(raw) {
    let x;
    try { x = new URL(raw, location.href); } catch (e) { return ""; }
    if (!/^https?:$/.test(x.protocol)) return "";
    const host = x.hostname.toLowerCase().replace(/^www\./, "");
    if (NOT_SITE.some((d) => host === d || host.endsWith("." + d))) return "";
    if (/(^|\.)(google|pinterest|treatwell|tripadvisor)\.[a-z.]{2,}$/.test(host)) return "";
    return x.protocol + "//" + x.hostname + x.pathname.replace(/\/+$/, "");
  }
  // Показатели салона для оценки клиента: рейтинг, число отзывов и диапазон цен (берём из данных страницы)
  function readMetrics() {
    const m = { rating: null, reviews: null, priceMin: null, priceMax: null, currency: "", metricsChecked: false };
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(sc.textContent);
        const arr = Array.isArray(j) ? j : j["@graph"] || [j];
        for (const o of arr) {
          if (!o || !/Salon|Barber|Spa|Beauty|Health|LocalBusiness/i.test(String(o["@type"] || ""))) continue;
          m.metricsChecked = true;
          const ar = o.aggregateRating;
          if (ar) {
            const r = parseFloat(ar.ratingValue), c = parseInt(ar.reviewCount != null ? ar.reviewCount : ar.ratingCount, 10);
            if (!isNaN(r)) m.rating = r;
            if (!isNaN(c)) m.reviews = c;
          }
          const pr = String(o.priceRange || "");
          if (pr) {
            const nums = (pr.match(/\d+(?:[.,]\d{1,2})?/g) || []).map((x) => parseFloat(x.replace(",", "."))).filter((x) => !isNaN(x));
            if (nums.length) { m.priceMin = Math.min(...nums); m.priceMax = Math.max(...nums); }
            m.currency = /zł|PLN/i.test(pr) ? "PLN" : /£|GBP/.test(pr) ? "GBP" : /€|EUR/.test(pr) ? "EUR" : /\$|USD/.test(pr) ? "USD" : "";
          }
        }
      } catch (e) {}
    }
    return m;
  }
  function readWebsite() {
    const cands = [];
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(sc.textContent);
        const arr = Array.isArray(j) ? j : j["@graph"] || [j];
        for (const o of arr) {
          const same = o && o.sameAs;
          (Array.isArray(same) ? same : same ? [same] : []).forEach((u) => cands.push(u));
        }
      } catch (e) {}
    }
    const sec = findSection();
    if (sec) {
      let box = sec.parentElement;
      for (let i = 0; i < 3 && box && !box.querySelector("a[href]"); i++) box = box.parentElement;
      if (box) box.querySelectorAll("a[href]").forEach((a) => cands.push(a.href));
    }
    for (const c of cands) { const w = siteFrom(c); if (w) return w; }
    return "";
  }
  const socialHeading = () => Array.from(document.querySelectorAll("h2,h3")).find((e) => /social|media społeczn|социальн/i.test(e.textContent));

  function readSocials() {
    const found = { instagram: "", facebook: "" };
    const take = (raw) => { const c = classifySocial(raw); if (c && !found[c.net]) found[c.net] = c.url; };
    // 1) данные страницы (JSON-LD, поле sameAs)
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(sc.textContent);
        const arr = Array.isArray(j) ? j : j["@graph"] || [j];
        for (const o of arr) {
          const same = o && o.sameAs;
          (Array.isArray(same) ? same : same ? [same] : []).forEach(take);
        }
      } catch (e) {}
    }
    // 2) ссылки в блоке «Social Media»
    const h = socialHeading();
    if (h) {
      let box = h.parentElement;
      for (let i = 0; i < 3 && box && !box.querySelector("a[href]"); i++) box = box.parentElement;
      if (box) box.querySelectorAll("a[href]").forEach((a) => take(a.href));
    }
    return found;
  }

  // Единый разбор салона: телефон, соцсети, сайт, показатели и (по желанию) почта
  async function parseAll(opts) {
    if (parsing) return;
    parsing = true;
    await waitNoCaptcha();
    await waitFor(() => document.querySelector("h1"), 15000);
    await waitNoCaptcha();

    // телефон подгружается с задержкой, а соцсети и показатели лежат в данных страницы и доступны сразу
    let phone = await waitForPhone();
    if (!phone) {
      await revealContacts(); // телефон может быть скрыт за кнопкой «Show / Pokaż»
      await waitNoCaptcha();
      await sleep(600);
      phone = readPhone();
    }
    const email = opts && opts.email ? await collectEmail() : "";

    const soc = readSocials();
    const h1 = document.querySelector("h1");
    chrome.runtime.sendMessage({
      type: "result",
      data: {
        name: ((h1 && h1.innerText) || document.title || "").trim(),
        url: location.origin + location.pathname,
        phone, email,
        instagram: soc.instagram, facebook: soc.facebook,
        website: readWebsite(),
        ...readMetrics(),
      },
    });
  }

  // ---------- Страница списка ----------
  function profileLinks() {
    const s = new Set();
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const u = new URL(a.href, location.href);
        if (u.hostname.endsWith("booksy.com") && PROFILE_RE.test(u.pathname)) s.add(u.origin + u.pathname);
      } catch (e) {}
    });
    return [...s];
  }
  async function collect() {
    let last = 0;
    for (let i = 0; i < 8; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(1200);
      const n = profileLinks().length;
      if (n === last && i > 1) break;
      last = n;
    }
    window.scrollTo(0, 0);
    return profileLinks();
  }
  async function nextPage() {
    const el = Array.from(document.querySelectorAll("a, button")).find((e) => {
      if (e.disabled || e.getAttribute("aria-disabled") === "true") return false;
      const t = (e.getAttribute("aria-label") || e.innerText || "").trim().toLowerCase();
      return (
        e.rel === "next" ||
        /^(następna|nastepna|następna strona|next|next page|dalej|далее|вперёд|›|»)$/.test(t) ||
        /(załaduj więcej|pokaż więcej wyników|load more|show more results)/.test(t)
      );
    });
    if (!el) return { links: [] };
    el.click();
    await sleep(2500);
    return { links: await collect() };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.cmd === "collect") {
      collect().then((links) => sendResponse({ links }));
      return true;
    }
    if (msg.cmd === "nextPage") {
      nextPage().then(sendResponse);
      return true;
    }
  });

  // Если это рабочая вкладка расширения — разбираем салон. Спрашиваем несколько раз:
  // фоновый скрипт мог ещё не успеть запомнить вкладку, когда страница загрузилась.
  function askTask(n) {
    chrome.runtime.sendMessage({ type: "whoami" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.task) {
        if (n < 5) setTimeout(() => askTask(n + 1), 1500);
        return;
      }
      parseAll(res.opts || {});
    });
  }
  if (isProfile()) askTask(0);
})();
