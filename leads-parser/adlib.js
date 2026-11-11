// Facebook Ads: сбор рекламодателей из библиотеки рекламы Meta (facebook.com/ads/library).
// Срабатывает ТОЛЬКО в окне, которое открыла программа (фон расширения подтверждает это по номеру вкладки).
// Для каждого рекламодателя открывается окно «Информация об объявлении», раскрывается блок «Информация о рекламодателе»,
// и оттуда читаются страница Facebook, Instagram, число подписчиков, категория и описание. Работает медленно, как человек.
(() => {
  if (window.__lpAdlib) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  let FAST = false; // для автоматических проверок: короткие паузы
  const wait = (ms) => sleep(FAST ? Math.min(ms, 30) : ms);
  const send = (m) => new Promise((res) => { try { chrome.runtime.sendMessage(m, (r) => res(chrome.runtime.lastError ? null : r)); } catch (e) { res(null); } });
  const leafs = (root) => Array.from((root || document).querySelectorAll("*")).filter((e) => e.children.length === 0);
  const txt = (e) => (e.textContent || "").trim();
  async function waitFor(fn, ms, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(FAST ? 20 : step); }
    return null;
  }

  // ----- подписи на разных языках интерфейса Facebook -----
  const DET_RE = /^(Информация об объявлении|Szczegóły reklamy|Zobacz szczegóły reklamy|See ad details|See summary details)$/i;
  const ADV_HEAD_RE = /^(Информация о рекламодателе|Informacje o reklamodawcy|About the advertiser)$/i;
  const CLOSE_RE = /^(Закрыть|Zamknij|Close)$/i;
  const INACTIVE_RE = /Неактивно|Nieaktywn|Inactive/i;
  const FOLLOW_RE = /подписчик|obserwując|follower|отметк|polubie|likes?\b/i;
  const DOP_RE = /^(Дополнительная информация|Dodatkowe informacje|Additional info(rmation)?)$/i;
  const SLOW_RE = /слишком часто|too fast|zbyt szybko|temporarily blocked|временно заблокир|spróbuj ponownie później/i;

  // ----- «настоящий» ли сайт -----
  const MSG_HOSTS = /(^|\.)(fb\.me|m\.me|wa\.me|facebook\.com|fb\.com|instagram\.com|l\.instagram\.com|messenger\.com|whatsapp\.com|forms\.gle|linktr\.ee|linktree\.com|beacons\.ai|lnk\.bio|taplink\.cc)$/i;
  const FAKE_HOSTS = /(^|\.)(business\.site|negocio\.site|booksy\.com|fresha\.com|vagaro\.com|styleseat\.com|calendly\.com|wixsite\.com|weebly\.com|godaddysites\.com|mystrikingly\.com)$/i;
  const MAIL_FREE = /^(gmail|wp|o2|onet|interia|poczta|op|vp|yahoo|outlook|hotmail|icloud|protonmail|me|live|tlen|gazeta|proton)\./i;
  const realHost = (h) => !!h && !MSG_HOSTS.test(h) && !FAKE_HOSTS.test(h);

  // ----- числа: «1 099», «1,2 тыс.», «12K» -----
  function parseCount(s) {
    const m = String(s).replace(/\u00a0/g, " ").match(/(\d[\d\s.,]*)\s*(тыс|млн|tys|mln|K|M)?/i);
    if (!m) return null;
    const suf = (m[2] || "").toLowerCase();
    let num = m[1].trim();
    num = suf ? num.replace(/\s/g, "").replace(",", ".") : num.replace(/[\s.,]/g, "");
    let v = parseFloat(num);
    if (!isFinite(v)) return null;
    if (/^(тыс|tys|k)$/.test(suf)) v *= 1000; else if (/^(млн|mln|m)$/.test(suf)) v *= 1e6;
    return Math.round(v);
  }

  // ----- телефон, почта, сайт из текста объявлений -----
  const CC = { PL: "48", US: "1", CA: "1", GB: "44", DE: "49", CZ: "420", SK: "421", UA: "380", ES: "34", IT: "39", FR: "33" };
  function findPhone(text, country) {
    const t = text.split("\n").filter((l) => !/ID (Библиотеки|Library)|Library ID/i.test(l)).join("\n");
    let m;
    if (country === "PL") {
      m = t.match(/(?<![\d])(?:\+?48[ -]?)?(\d{3}[ -]\d{3}[ -]\d{3})(?![\d])/) || t.match(/(?<![\d])\+48[ -]?(\d{9})(?![\d])/) || t.match(/(?:tel\.?|telefon|zadzwoń|whatsapp|kontakt)[^\d+]{0,12}(\d{9})(?![\d])/i);
      if (m) { const d = (m[1] || "").replace(/\D/g, ""); if (d.length === 9) return `+48 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`; }
    } else if (country === "US" || country === "CA") {
      m = t.match(/(?<![\d])\(?(\d{3})\)?[ .-](\d{3})[ .-](\d{4})(?![\d])/);
      if (m) return `+1 ${m[1]} ${m[2]} ${m[3]}`;
    } else {
      m = t.match(/(?<![\d])\+\d{1,3}[\d ().-]{8,16}\d/);
      if (m) return m[0].replace(/\s+/g, " ").trim();
    }
    return "";
  }
  function findEmail(text) {
    const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/);
    return m && !/\.(png|jpg|jpeg|gif)$/i.test(m[0]) ? m[0].toLowerCase() : "";
  }
  function findSiteInText(text, email) {
    const own = email && !MAIL_FREE.test(email.split("@")[1]) ? email.split("@")[1] : "";
    const re = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:pl|com|eu|net|org|de|us|uk|io|info|shop|store|studio|co))\b(?!@)/gi;
    let m;
    while ((m = re.exec(text))) {
      const h = m[1].toLowerCase();
      if (realHost(h) && !/^\d+\./.test(h) && !/@/.test(text.slice(Math.max(0, m.index - 1), m.index))) return h;
    }
    return own;
  }

  // ----- карточки объявлений -----
  const isAdvLink = (a) => {
    let u; try { u = new URL(a.href, location.href); } catch (e) { return false; }
    const p = u.pathname.split("/").filter(Boolean);
    return /(^|\.)facebook\.com$/.test(u.hostname) && p.length === 1 && !/^(ads|help|policies|privacy|about|legal|login|recover)$/i.test(p[0]) && txt(a).length > 2;
  };
  function adCards() {
    const btns = leafs().filter((e) => DET_RE.test(txt(e)));
    return btns.map((b) => {
      let best = b, c = b;
      for (let i = 0; i < 16 && c.parentElement; i++) {
        c = c.parentElement;
        if (btns.filter((x) => c.contains(x)).length === 1) best = c; else break;
      }
      return { btn: b, card: best };
    });
  }
  function collect() {
    const map = new Map();
    for (const { btn, card } of adCards()) {
      const a = Array.from(card.querySelectorAll("a[href]")).find(isAdvLink);
      if (!a) continue;
      const path = new URL(a.href).pathname.replace(/\//g, "");
      const text = card.innerText || "";
      const cta = Array.from(card.querySelectorAll('a[href*="l.facebook.com/l.php"]')).map((x) => {
        try { return new URL(new URL(x.href).searchParams.get("u")).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; }
      }).filter(Boolean);
      let adv = map.get(path);
      if (!adv) { adv = { path, name: txt(a).slice(0, 120), cards: 0, active: 0, cta: new Set(), texts: [] }; map.set(path, adv); }
      adv.cards++;
      if (!INACTIVE_RE.test(text)) adv.active++;
      cta.forEach((h) => adv.cta.add(h));
      adv.texts.push(text);
    }
    return map;
  }

  // ----- окно «Информация об объявлении» -----
  // Окно рекламодателя узнаём по блоку «Информация о рекламодателе» (на странице есть и другие окна, например меню аккаунта)
  const lastDialog = () => { const d = Array.from(document.querySelectorAll('[role="dialog"]')).filter((x) => leafs(x).some((e) => ADV_HEAD_RE.test(txt(e)))); return d[d.length - 1] || null; };
  async function closeDialog() {
    const d = lastDialog();
    if (!d) return;
    const b = leafs(d).find((e) => CLOSE_RE.test(txt(e)));
    if (b) b.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await waitFor(() => !lastDialog(), 3000);
  }
  // читает блок «Информация о рекламодателе»: страница Facebook, Instagram, подписчики, категория, описание
  function parseAdvInfo(box, fbPath) {
    const lines = (box.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const handles = [];
    let desc = "";
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^@/.test(l)) handles.push({ h: l.slice(1), followers: null, cat: "" });
      else if (DOP_RE.test(l)) { desc = lines.slice(i + 1).join(" ").slice(0, 400); break; }
      else if (FOLLOW_RE.test(l) && handles.length) {
        handles[handles.length - 1].followers = parseCount(l);
        if (/•/.test(l) && lines[i + 1] && !/^@/.test(lines[i + 1]) && !DOP_RE.test(lines[i + 1])) { handles[handles.length - 1].cat = lines[i + 1].slice(0, 80); i++; }
      }
    }
    let fb = null, ig = null;
    if (handles.length >= 2) { fb = handles[0]; ig = handles[1]; }
    else if (handles.length === 1) {
      const h = handles[0];
      if (h.cat || h.h.toLowerCase() === String(fbPath).toLowerCase()) fb = h; else ig = h;
    }
    return { name: lines[0] || "", fb, ig, desc };
  }
  async function readAdvertiser(adv) {
    const fresh = adCards().find(({ card }) => { const a = Array.from(card.querySelectorAll("a[href]")).find(isAdvLink); return a && new URL(a.href).pathname.replace(/\//g, "") === adv.path; });
    if (!fresh) return null;
    fresh.btn.scrollIntoView({ block: "center" });
    await wait(rnd(500, 900));
    fresh.btn.click();
    const dlg = await waitFor(lastDialog, 9000);
    if (!dlg) return null;
    await wait(rnd(800, 1300));
    const head = leafs(dlg).find((e) => ADV_HEAD_RE.test(txt(e)));
    const hasInfo = () => leafs(dlg).some((e) => FOLLOW_RE.test(txt(e)) && /\d/.test(txt(e)));
    if (head && !hasInfo()) { head.click(); await wait(rnd(700, 1200)); }
    await waitFor(hasInfo, 5000);
    const marks = leafs(dlg).filter((e) => FOLLOW_RE.test(txt(e)) && /\d/.test(txt(e)));
    let info = null;
    if (marks.length) {
      let box = marks[0];
      while (box && marks.length > 1 && !box.contains(marks[marks.length - 1])) box = box.parentElement;
      for (let i = 0; i < 4 && box; i++) { if ((box.innerText || "").split("\n").length >= 3) break; box = box.parentElement; }
      // описание лежит в блоке «Дополнительная информация» чуть выше: поднимаемся, пока он не попадёт в выборку
      const DOP_ANY = /Дополнительная информация|Dodatkowe informacje|Additional info/i;
      for (let i = 0; i < 3 && box && box.parentElement && !DOP_ANY.test(box.innerText || ""); i++) {
        const up = box.parentElement;
        if (DOP_ANY.test(up.innerText || "") && !leafs(up).some((e) => /^(Видимость местоположения|Рекламодатель и плательщик)$/i.test(txt(e)))) { box = up; break; }
        if ((up.innerText || "").length > 1200) break;
        box = up;
      }
      if (box) info = parseAdvInfo(box, adv.path);
    }
    await closeDialog();
    return info;
  }

  // ----- основной ход -----
  async function run(task) {
    FAST = !!task.fast;
    const country = task.country || "PL";
    const stopped = async () => { const r = await send({ type: "adsAlive" }); return !r || r.stop; };
    const progress = (found, processed, note) => send({ type: "adsProgress", found, processed, note });
    try {
      await progress(0, 0, "Жду загрузки результатов…");
      const ok = await waitFor(() => adCards().length, 25000);
      if (!ok) return send({ type: "adsDone", ok: false, note: "Объявления не найдены. Проверьте запрос и страну, либо Facebook не загрузил страницу." });
      // прокручиваем список, чтобы загрузить больше рекламодателей
      let last = 0, stagn = 0;
      for (let i = 0; i < 14; i++) {
        const n = collect().size;
        if (n >= task.max) break;
        window.scrollTo(0, document.body.scrollHeight);
        await wait(rnd(1500, 2400));
        const now = collect().size;
        await progress(now, 0, `Загружаю список… найдено рекламодателей: ${now}`);
        if (now === last) { if (++stagn >= 2) break; } else stagn = 0;
        last = now;
        if (await stopped()) return;
      }
      window.scrollTo(0, 0);
      await wait(600);
      const list = Array.from(collect().values()).slice(0, task.max);
      let processed = 0, saved = 0;
      for (const adv of list) {
        if (await stopped()) return;
        if (SLOW_RE.test(document.body.innerText || "")) { await send({ type: "adsDone", ok: false, note: "Facebook просит замедлиться. Подождите и запустите позже." }); return; }
        await progress(list.length, processed, `Читаю соцсети: ${adv.name}`);
        let info = null;
        try { info = await readAdvertiser(adv); } catch (e) { await closeDialog(); }
        if (!info && /^ID:/i.test(adv.name)) { processed++; continue; } // страница без названия и без данных: сохранять нечего
        const text = adv.texts.join("\n");
        const email = findEmail(text);
        const ctaReal = Array.from(adv.cta).filter(realHost);
        const textSite = findSiteInText(text, email);
        const site = ctaReal[0] || textSite;
        const lead = {
          path: adv.path,
          name: ((info && info.name) || adv.name).slice(0, 160),
          facebook: `https://www.facebook.com/${adv.path}/`,
          instagram: info && info.ig ? `https://www.instagram.com/${info.ig.h}/` : "",
          fbFollowers: info && info.fb ? info.fb.followers : null,
          igFollowers: info && info.ig ? info.ig.followers : null,
          category: (info && info.fb && info.fb.cat) || "",
          desc: (info && info.desc) || "",
          adsCount: adv.cards, adsActive: adv.active,
          adDomains: Array.from(adv.cta).slice(0, 6),
          website: site ? `https://${site}` : "",
          siteChecked: adv.cta.size > 0 || !!site,
          phone: findPhone(text, country), email,
          country, query: task.query,
        };
        await send({ type: "adsLead", lead });
        processed++; saved++;
        await progress(list.length, processed, `Готово: ${processed} из ${list.length}`);
        await wait(rnd(2500, 5500)); // пауза между рекламодателями
      }
      await send({ type: "adsDone", ok: true, note: `Готово: прочитано рекламодателей ${processed}.` });
    } catch (e) {
      await send({ type: "adsDone", ok: false, note: "Ошибка: " + String((e && e.message) || e).slice(0, 120) });
    }
  }

  (async () => {
    let r = null;
    for (let i = 0; i < 3 && !(r && r.task); i++) { if (i) await sleep(1200); r = await send({ type: "adsGet" }); }
    if (!r || !r.task) return;
    window.__lpAdlib = true;
    run(r.task);
  })();
})();
