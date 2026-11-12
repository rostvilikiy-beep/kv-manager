// Instagram, Facebook и ВКонтакте: автоподписка и автоотправка сообщений (ВК — только сообщения).
// Срабатывает ТОЛЬКО когда страница открыта программой (в адресе стоит метка #lp-follow=…, #lp-dm=… или #lp-inbox).
// При обычном просмотре соцсетей расширение ничего не делает.
(async () => {
  let mf = location.hash.match(/lp-follow=(\d+)/);
  let md = location.hash.match(/lp-dm=([A-Za-z0-9_-]+)/);
  let mi = /lp-inbox/.test(location.hash) && /facebook\.com$/.test(location.hostname);
  if (window.__lpFollow) return;
  if (!mf && !md && !mi) {
    // Facebook иногда стирает метку из адреса раньше, чем запускается расширение: спрашиваем у фона, не открыта ли эта вкладка для задания
    let r = null;
    for (let i = 0; i < 3 && !(r && (r.dm || r.inbox)); i++) {
      if (i) await new Promise((x) => setTimeout(x, 1500));
      r = await new Promise((res) => { try { chrome.runtime.sendMessage({ type: "dmMine" }, (x) => res(chrome.runtime.lastError ? null : x)); } catch (e) { res(null); } });
    }
    if (r && r.dm) md = [null, r.dm];
    else if (r && r.inbox && /facebook\.com$/.test(location.hostname)) mi = true;
    else return;
  }
  window.__lpFollow = true;
  const net = /instagram\.com$/.test(location.hostname) ? "instagram" : /(^|\.)vk\.(com|ru|me)$/.test(location.hostname) ? "vk" : "facebook";
  if (net === "vk" && !md) return; // во ВКонтакте только рассылка
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} // убираем метку из адреса

  const FAST = !!window.__LP_FAST; // только для тестов
  const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? Math.min(ms, 40) : ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  async function waitFor(fn, timeout = 8000, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < (FAST ? Math.min(timeout, 1500) : timeout)) {
      try { const v = fn(); if (v) return v; } catch (e) {}
      await new Promise((r) => setTimeout(r, FAST ? 40 : step));
    }
    return null;
  }
  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => res(chrome.runtime.lastError ? null : r)); } catch (e) { res(null); }
  });

  // ---------- общие помощники ----------
  const labelOf = (el) => ((el.innerText || "").trim().split("\n")[0] || el.getAttribute("aria-label") || "").trim();
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const BTN_SEL = 'button, div[role="button"], a[role="button"]';
  function buttons() {
    const scope = net === "instagram" ? document.querySelector("header") || document : document;
    return Array.from(scope.querySelectorAll(BTN_SEL)).filter(visible);
  }
  const loginWall = () =>
    /\/accounts\/login|\/login/.test(location.pathname) ||
    // ВК: только явная страница входа (ссылка «Управление аккаунтом» на id.vk.com есть и у вошедших — по ней не судим)
    (net === "vk" ? /(^|\.)id\.vk\.(com|ru)$/.test(location.hostname) || !!document.querySelector('input[type="password"]')
      : !!document.querySelector('input[name="username"], input[name="email"], input[type="password"]'));
  const BLOCK_RE = /(try again later|action blocked|we restrict certain activity|temporarily blocked|spróbuj ponownie później|tymczasowo zablokowan|ta czynność została zablokowana|повторите попытку позже|временно заблокирован)/i;
  const blockedDialog = () => Array.from(document.querySelectorAll('div[role="dialog"], div[role="alertdialog"]')).some((d) => BLOCK_RE.test(d.innerText || ""));
  function dismissDialogs() {
    // «Включить уведомления?» и подобные окна: нажимаем «Не сейчас»
    for (const d of document.querySelectorAll('div[role="dialog"]')) {
      const b = Array.from(d.querySelectorAll(BTN_SEL)).find((x) => /^(not now|nie teraz|не сейчас)$/i.test(labelOf(x)));
      if (b) { try { b.click(); } catch (e) {} }
    }
  }
  function toast(text, ok) {
    const d = document.createElement("div");
    d.textContent = "Leads Parser: " + text;
    d.style.cssText = `position:fixed;left:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border-radius:12px;font:14px system-ui,sans-serif;color:#fff;background:${ok ? "#1f9d6b" : "#8a5a00"};box-shadow:0 6px 24px rgba(0,0,0,.35)`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 9000);
  }

  // ---------- подписка ----------
  const FOLLOW_RE = net === "instagram"
    ? /^(follow|follow back|obserwuj|obserwuj również|подписаться|подписаться в ответ)$/i
    : /^(follow|obserwuj|подписаться)$/i;
  const REQUESTED_RE = /^(requested|wysłano prośbę|prośba wysłana|запрос отправлен|запрос на подписку отправлен)$/i;
  const DONE_RE = /^(following|obserwujesz|вы подписаны|подписки|friends|znajomi|друзья)$/i;
  const findFollow = () => buttons().find((b) => FOLLOW_RE.test(labelOf(b)));
  const followState = () => {
    const labels = buttons().map(labelOf);
    if (labels.some((l) => REQUESTED_RE.test(l))) return "requested";
    if (labels.some((l) => DONE_RE.test(l))) return "done";
    return "";
  };
  // возвращает: followed | requested | already | no_button | limit | unknown
  async function followStep(salonId) {
    const gate = await send({ type: "followGate", net });
    if (gate && gate.allowed === false) return "limit";
    const btn = await waitFor(findFollow, 8000);
    if (!btn) return followState() ? "already" : "no_button";
    await sleep(rnd(2000, 6000));
    try { btn.scrollIntoView({ block: "center" }); } catch (e) {}
    await sleep(rnd(300, 800));
    btn.click();
    await sleep(rnd(1800, 3000));
    const after = followState();
    const res = after === "requested" ? "requested" : after === "done" ? "followed" : "unknown";
    await send({ type: "followResult", net, id: salonId, result: res });
    return res;
  }
  const FOLLOW_TEXT = {
    followed: ["подписка выполнена", true], requested: ["запрос на подписку отправлен (закрытый профиль)", true],
    already: ["вы уже подписаны на этот профиль", true], no_button: ["кнопку подписки не нашли, подпишитесь вручную", false],
    not_logged_in: ["вы не вошли в аккаунт в этом браузере", false], limit: ["дневной лимит автоподписок исчерпан, подпишитесь вручную", false],
    unknown: ["не удалось подтвердить подписку, проверьте вручную", false],
  };

  // ---------- сообщение ----------
  const MSG_RE = /^(message|send message|wiadomość|wyślij wiadomość|napisz wiadomość|написать|сообщение|отправить сообщение|написать сообщение)$/i;
  const SEND_RE = /^(send|wyślij|отправить)$/i;
  // ВКонтакте: «Написать сообщение» у сообществ и людей — часто обычная ссылка на /im или /write
  const findMessageBtn = () => net !== "vk" ? buttons().find((b) => MSG_RE.test(labelOf(b)))
    : Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(visible).find((b) => MSG_RE.test(labelOf(b)))
      || Array.from(document.querySelectorAll('a[href*="/im?sel="], a[href*="/im/convo/"], a[href*="/write"]')).filter(visible)[0] || null;
  const vkInChat = () => net === "vk" && (/^\/(im|write)/.test(location.pathname) || /(^|\.)vk\.me$/.test(location.hostname));
  // ID сообщества ВК: из адреса (club123, public123) или из ссылки «Написать сообщение» на странице.
  // С ним открываем переписку напрямую (vk.com/im?sel=-ID): там поле сообщения на самой странице, а не во всплывающем окне.
  function vkGroupId() {
    const m = location.pathname.match(/^\/(?:club|public|event)(\d+)\/?$/);
    if (m) return m[1];
    for (const a of Array.from(document.querySelectorAll('a[href*="sel=-"], a[href*="/convo/-"], a[href*="/write-"]')).filter((x) => MSG_RE.test(labelOf(x)))) {
      const x = (a.getAttribute("href") || "").match(/(?:sel=|\/convo\/|\/write)-(\d+)/);
      if (x) return x[1];
    }
    return ""; // по коду страницы не ищем: там бывают ID чужих сообществ, а писать нужно точно этому
  }
  // Поле сообщения. Ищем по подписи («Message», «Wiadomość», «Сообщение»), а если подпись другая (в Facebook поле часто
  // подписано просто «Aa»), берём поле, которого на странице не было до нажатия «Message» (параметр before).
  function findComposer(before) {
    const BAD = /comment|komentar|коммент|search|szukaj|поиск|what'?s on your mind|co słychać|о чём вы думаете|о чем вы думаете|что у вас нового|что-нибудь|запись/i;
    const label = (el) => el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
    // поле сообщения: contenteditable="true", "plaintext-only" (новый ВК) или пустой атрибут
    const cands = Array.from(document.querySelectorAll('div[role="textbox"], div[contenteditable]:not([contenteditable="false"]), textarea')).filter(visible).filter((el) => el.tagName === "TEXTAREA" || el.isContentEditable);
    const ok = cands.filter((el) => !BAD.test(label(el)));
    const named = ok.find((el) => /message|wiadomo|сообщени/i.test(label(el)));
    if (named) return named;
    if (before) {
      const fresh = ok.find((el) => !before.has(el) && el.matches('[role="textbox"], textarea')) || ok.find((el) => !before.has(el));
      if (fresh) return fresh;
    }
    if (net === "instagram") return ok.find((el) => el.matches('div[role="textbox"]')) || null;
    if (net === "vk") return ok.find((el) => el.isContentEditable || el.tagName === "TEXTAREA") || null;
    return null;
  }
  // Окна, которые мешают отправке: просьба ввести PIN Messenger, запрет писать этому аккаунту
  const PIN_RE = /(\bPIN\b|przywróć czaty|restore (your )?chats|восстановить чаты)/i;
  const CANNOT_RE = /(can'?t (message|send)|cannot (message|send)|nie możesz (wysłać|napisać|odpowiedzieć)|nie można (wysłać|napisać)|невозможно (отправить|написать)|нельзя (отправить|написать)|не может получать сообщения)/i;
  const dialogsText = () => Array.from(document.querySelectorAll('div[role="dialog"], div[role="alertdialog"]')).map((d) => d.innerText || "");
  const pinDialog = () => dialogsText().some((t) => PIN_RE.test(t));
  const cannotDialog = () => dialogsText().some((t) => CANNOT_RE.test(t));
  // Чаты со страницами иногда начинаются с кнопки «Начать», пока её не нажмёшь, поля нет
  function clickGetStarted() {
    const b = Array.from(document.querySelectorAll(BTN_SEL)).filter(visible).find((x) => /^(get started|rozpocznij|zacznij|начать)$/i.test(labelOf(x)));
    if (b && !b.__lpClicked) { b.__lpClicked = true; try { b.click(); } catch (e) {} }
  }
  // Краткая «справка» о том, что видно на странице: показывается в журнале, если поле не нашлось
  function snapshot() {
    const fields = Array.from(document.querySelectorAll('[contenteditable]:not([contenteditable="false"]), textarea')).filter(visible)
      .map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute("role") || "-"}|${(e.getAttribute("aria-label") || e.getAttribute("placeholder") || "-").slice(0, 28)}]`).slice(0, 5).join(", ");
    const dlg = dialogsText().map((t) => t.replace(/\s+/g, " ").slice(0, 70)).slice(0, 2).join(" || ");
    const heads = chatHeads().map((e) => (e.getAttribute("aria-label") || "-").slice(0, 22)).slice(0, 4).join(", ");
    const frames = net === "vk" ? `; кадры: ${Array.from(document.querySelectorAll("iframe")).filter(visible).map((f) => { try { return new URL(f.src).hostname + new URL(f.src).pathname.slice(0, 15); } catch (e) { return "?"; } }).slice(0, 3).join(", ") || "нет"}` : "";
    return `страница ${location.pathname.slice(0, 40)}; поля: ${fields || "нет"}; окна: ${dlg || "нет"}; кружки чатов: ${heads || "нет"}${frames}`;
  }
  const textOf = (el) => String(el.value !== undefined ? el.value : el.innerText || "").trim();
  const normText = (t) => String(t || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
  async function clearComposer(el) {
    if (!el) return;
    el.focus();
    if (el.tagName === "TEXTAREA") {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("selectAll");
      document.execCommand("delete");
    }
    await sleep(250);
  }
  // Способ 1: вставка всего текста сразу, как будто вы его скопировали и нажали Ctrl+V (абзацы сохраняются).
  // Печатать построчно нельзя: на переносе строки поле сообщения может сбросить уже набранное или отправить кусок.
  function pasteText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA") {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }
  // Способ 2 (запасной): одной строкой, небольшими кусками, без переносов
  async function typeFlat(el, text) {
    el.focus();
    const flat = text.replace(/\s*\n+\s*/g, " ");
    for (let i = 0; i < flat.length; i += 100) {
      document.execCommand("insertText", false, flat.slice(i, i + 100));
      await sleep(rnd(100, 250));
    }
  }
  // Заполняет поле и убеждается, что там лежит весь текст. Возвращает {ok, box} или {ok:false, got, want}.
  async function fillComposer(getBox, text) {
    const want = normText(text);
    const methods = [async (b) => { pasteText(b, text); await sleep(700); }, async (b) => typeFlat(b, text)];
    for (const run of methods) {
      let box = getBox();
      if (!box) break;
      if (normText(textOf(box))) await clearComposer(box);
      box = getBox() || box;
      box.focus();
      await sleep(300);
      await run(box);
      await sleep(500);
      box = getBox() || box;
      if (normText(textOf(box)) === want) return { ok: true, box };
    }
    const cur = getBox();
    return { ok: false, got: cur ? normText(textOf(cur)).length : 0, want: want.length };
  }
  async function sendNow(box) {
    const sb = await waitFor(() => Array.from(document.querySelectorAll(BTN_SEL)).filter(visible).find((b) => SEND_RE.test(labelOf(b))), 2500);
    if (sb) { sb.click(); return; }
    for (const t of ["keydown", "keypress", "keyup"]) {
      box.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
  }
  // Пометка соцсети о неудачной отправке (красная надпись под сообщением в чате)
  const FAIL_RE = /(не удалось отправить|не отправлено|couldn['’]?t send|could not send|failed to send|message not sent|not sent|nie udało się wysłać|nie wysłano|nie można wysłać)/i;
  const failCount = () => (document.body.innerText || "").split("\n").filter((l) => FAIL_RE.test(l)).length;
  // sent — сообщение появилось в переписке и соцсеть не пометила его как неотправленное;
  // not_delivered — соцсеть написала «Не удалось отправить» (или вернула текст в поле); unconfirmed — поле очистилось, но в переписке не видно;
  // send_failed — не отправилось
  async function verifySent(text, getBox, failBefore) {
    const snippet = text.split("\n")[0].trim().slice(0, 30);
    const t0 = Date.now();
    const empty = () => { const c = getBox(); return !c || !textOf(c); };
    let seen = false;
    while (Date.now() - t0 < (FAST ? 1500 : 9000)) {
      if (blockedDialog()) return "blocked";
      if (failBefore != null && failCount() > failBefore) return "not_delivered";
      if (empty() && document.body.innerText.includes(snippet)) { seen = true; break; }
      await sleep(400);
    }
    if (!seen) return empty() ? "unconfirmed" : "send_failed";
    // сообщение появилось в чате: даём соцсети время пометить его неотправленным (пометка появляется не сразу)
    const t1 = Date.now();
    while (Date.now() - t1 < (FAST ? 700 : 7000)) {
      if (blockedDialog()) return "blocked";
      if (failBefore != null && failCount() > failBefore) return "not_delivered";
      if (!empty()) return "not_delivered"; // текст вернулся в поле ввода
      await sleep(400);
    }
    return "sent";
  }
  // Есть ли в ЭТОМ чате уже наше сообщение (доставленное). Смотрим только на колонку над полем ввода этого чата,
  // чтобы не принять за него такой же текст в других чатах или в списке чатов слева.
  function chatHasSent(box, text) {
    const key = normText(text).toLowerCase().slice(0, 50);
    if (key.length < 8) return false;
    const cr = box.getBoundingClientRect();
    const inCol = (r) => r.left >= cr.left - 30 && r.right <= cr.right + 30 && r.bottom <= cr.top + 4;
    const all = Array.from(document.querySelectorAll("div, span")).filter((e) => !e.querySelector("div, span") && visible(e) && !box.contains(e) && inCol(e.getBoundingClientRect()));
    const fails = all.filter((e) => FAIL_RE.test(e.innerText || ""));
    const msgs = Array.from(document.querySelectorAll('div[dir="auto"], span[dir="auto"]')).filter((e) => !e.querySelector('div[dir="auto"], span[dir="auto"]') && visible(e) && !box.contains(e) && inCol(e.getBoundingClientRect()));
    for (const e of msgs) {
      if (FAIL_RE.test(e.innerText || "")) continue;
      if (!normText(e.innerText).toLowerCase().includes(key)) continue;
      const r = e.getBoundingClientRect();
      // у неотправленного сообщения сразу под ним стоит пометка «Не удалось отправить»: такое сообщением не считаем
      const failed = fails.some((f) => { const fr = f.getBoundingClientRect(); return fr.top >= r.bottom - 4 && fr.top - r.bottom < 60; });
      if (!failed) return true;
    }
    return false;
  }

  // ---------- Facebook: докованные чаты ----------
  // Открытые ранее чаты остаются внизу справа и мешают: новый чат может свернуться в кружок без поля ввода.
  const normName = (v) => String(v || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
  async function closeOpenChats() {
    const re = /^(close chat|zamknij czat|закрыть чат)/i;
    const btns = Array.from(document.querySelectorAll("[aria-label]")).filter((e) => visible(e) && re.test(e.getAttribute("aria-label") || ""));
    for (const b of btns.slice(0, 6)) { try { b.click(); } catch (e) {} await sleep(rnd(300, 600)); }
    if (btns.length) await sleep(rnd(600, 1000));
  }
  // Кружки свёрнутых чатов: небольшие кнопки с картинкой в правом нижнем углу
  const chatHeads = () => Array.from(document.querySelectorAll('[role="button"][aria-label], a[aria-label]')).filter((el) => {
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.left > window.innerWidth - 170 && r.top > window.innerHeight - 480 && r.width <= 90 && r.height <= 90 && !!el.querySelector("img, image, svg");
  });
  // Раскрываем кружок ТОЛЬКО если его подпись содержит название этой страницы (чужие чаты не трогаем)
  function expandChatHead(pageName) {
    const key = normName(pageName).slice(0, 14);
    if (!key) return false;
    const head = chatHeads().find((el) => normName(el.getAttribute("aria-label")).includes(key));
    if (!head) return false;
    try { head.click(); } catch (e) { return false; }
    return true;
  }
  // Убеждаемся, что поле ввода принадлежит чату с нужной страницей (в шапке чата стоит её название)
  function composerBelongsTo(box, pageName) {
    const key = normName(pageName).slice(0, 14);
    if (!key) return false;
    let c = box;
    for (let i = 0; i < 12 && c; i++) {
      c = c.parentElement;
      if (!c) break;
      if (c.getBoundingClientRect().width > 700) break;
      if (normName(c.innerText || "").includes(key)) return true;
    }
    return false;
  }

  // Строка состояния в окне задания: видно, на каком шаге расширение сейчас (и где остановилось). Последний шаг уходит в программу.
  let stepEl = null;
  function step(id, text) {
    try {
      if (!stepEl) {
        stepEl = document.createElement("div");
        stepEl.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:90vw;padding:8px 14px;border-radius:10px;font:13px system-ui,sans-serif;color:#fff;background:rgba(40,60,90,.95);box-shadow:0 4px 18px rgba(0,0,0,.4);pointer-events:none";
        (document.body || document.documentElement).appendChild(stepEl);
      }
      if (!stepEl.isConnected) (document.body || document.documentElement).appendChild(stepEl);
      stepEl.textContent = "Leads Parser: " + text;
    } catch (e) {}
    send({ type: "dmStep", id, step: text });
  }

  // ---------- ВКонтакте: ввод текста как с клавиатуры ----------
  // Фон расширения подключается к этой вкладке через отладчик Chrome и передаёт настоящие клик и нажатия клавиш:
  // сайт не отличает их от ваших. Пока это идёт, Chrome показывает полоску «Leads Parser отлаживает этот браузер».
  function deepActive() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }
  const isEditable = (el) => !!el && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|)$/i.test(el.type || "")));
  const PH_RE = /^(сообщение|напишите сообщение|написать сообщение|message|write a message)[.…]*$/i;
  // куда кликнуть: надпись-подсказка «Сообщение» внизу чата, иначе найденное поле
  function vkComposerTarget(box) {
    const ph = Array.from(document.querySelectorAll("div, span, p, label")).filter((e) => !e.children.length && visible(e) && PH_RE.test((e.textContent || "").trim()))
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    const el = ph || (box && visible(box) ? box : null);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + Math.min(r.width / 2, 60)), y: Math.round(r.top + r.height / 2), how: ph ? "подсказка «Сообщение»" : "поле" };
  }
  const activeText = () => { const a = deepActive(); return isEditable(a) ? normText(textOf(a)) : ""; };
  async function vkTypeAndSend(id, box, text) {
    const t = vkComposerTarget(box);
    if (!t) return ["composer_missing", "не нашёл поле «Сообщение»; " + snapshot()];
    step(id, "нажимаю на поле сообщения (" + t.how + ")");
    let r = await send({ type: "cdpInput", id, actions: [{ click: [t.x, t.y] }] });
    if (!r || !r.ok) return ["error", "Chrome не дал нажать в поле: " + ((r && r.error) || "нет ответа фона") + ". Обновите расширение (нужно разрешение «отладчик»)"];
    await sleep(rnd(500, 900));
    if (!isEditable(deepActive())) return ["composer_missing", "после нажатия курсор не в поле ввода; " + snapshot()];
    if (activeText()) { // в поле уже что-то есть (черновик): очищаем
      await send({ type: "cdpInput", id, actions: [{ key: "a", mod: 2 }, { key: "Backspace" }] });
      await sleep(300);
    }
    step(id, "печатаю текст");
    const lines = String(text).split(/\r?\n/);
    const acts = [];
    lines.forEach((ln, i) => { if (i) acts.push({ key: "Enter", mod: 8 }); if (ln) acts.push({ text: ln }); }); // Shift+Enter — новая строка
    r = await send({ type: "cdpInput", id, actions: acts });
    if (!r || !r.ok) return ["send_failed", "не удалось напечатать текст: " + ((r && r.error) || "")];
    await sleep(rnd(900, 1500));
    const want = normText(text), got = activeText();
    if (!got || !got.includes(want.slice(0, Math.min(40, want.length)))) {
      await send({ type: "cdpInput", id, actions: [{ key: "a", mod: 2 }, { key: "Backspace" }] });
      return ["send_failed", `текст не появился в поле (в поле ${got.length} знаков из ${want.length}), сообщение НЕ отправлено`];
    }
    step(id, "текст в поле, отправляю (Enter)");
    const failBefore = failCount();
    await sleep(rnd(800, 1600));
    await send({ type: "cdpInput", id, actions: [{ key: "Enter" }] });
    step(id, "проверяю, что сообщение ушло");
    const snippet = normText(lines.find((l) => l.trim()) || "").slice(0, 30);
    const t0 = Date.now();
    while (Date.now() - t0 < (FAST ? 3000 : 10000)) {
      if (blockedDialog()) return ["blocked", ""];
      if (failCount() > failBefore) return ["not_delivered", ""];
      if (!activeText() && normText(document.body.innerText).includes(snippet)) {
        await sleep(FAST ? 300 : 3000);
        return failCount() > failBefore ? ["not_delivered", ""] : ["sent", ""];
      }
      await sleep(400);
    }
    return activeText() ? ["send_failed", "после Enter текст остался в поле, сообщение не ушло"] : ["unconfirmed", "поле очистилось, но сообщения в чате не видно — проверьте вручную"];
  }

  async function runDm(id) {
    step(id, "задание получено, страница " + location.pathname.slice(0, 40));
    const task = await send({ type: "dmGet", id });
    if (!task || !task.ok) { step(id, "задание не найдено или уже завершено — ничего не делаю"); return; }
    const report = (result, detail) => { step(id, "готово: " + result + (detail ? " — " + String(detail).slice(0, 80) : "")); return send({ type: "dmResult", id, result, detail: detail || "" }); };
    try {
      step(id, "жду загрузку страницы");
      await waitFor(() => document.querySelector("header, [role='main']"), 15000);
      await sleep(rnd(1500, 3000));
      if (loginWall()) return report("not_logged_in");
      if (blockedDialog()) return report("blocked");

      let followRes = "";
      if (task.follow) followRes = await followStep(task.salonId);
      if (blockedDialog()) return report("blocked", followRes);

      // ВК мог уже перейти в переписку (страница перезагрузилась после нажатия «Написать сообщение»)
      const inChat = vkInChat();
      step(id, inChat ? "уже в переписке" : "ищу, как открыть переписку");
      if (net === "vk" && !inChat) {
        // открываем переписку с сообществом отдельной страницей; после перехода расширение продолжит с того же задания
        const gid = await waitFor(vkGroupId, 6000);
        let tried = ""; try { tried = sessionStorage.getItem("lpVkNav") || ""; } catch (e) {}
        if (gid && tried !== id) {
          try { sessionStorage.setItem("lpVkNav", id); } catch (e) {}
          step(id, "открываю переписку vk.com/im?sel=-" + gid);
          location.assign("https://vk.com/im?sel=-" + gid);
          return;
        }
      }
      const mbtn = inChat ? null : await waitFor(findMessageBtn, 6000);
      if (!mbtn && !inChat) return report("cannot_message", followRes);
      await sleep(rnd(1500, 4000));
      const pageName = ((document.querySelector("h1") || {}).innerText || document.title || "").trim();
      if (net === "facebook") await closeOpenChats(); // чтобы новый чат открылся окном, а не свернулся в кружок
      // запоминаем поля, которые уже были на странице: поле чата потом узнаем по тому, что оно появилось после нажатия
      const before = new Set(document.querySelectorAll('[contenteditable]:not([contenteditable="false"]), textarea'));
      const findBox = () => findComposer(inChat ? null : before);
      if (mbtn) { step(id, "нажимаю «" + (labelOf(mbtn) || "Написать сообщение").slice(0, 30) + "»"); mbtn.click(); }
      step(id, "ищу поле сообщения");
      await sleep(rnd(2000, 4000));
      dismissDialogs();
      // ждём поле сообщения (в Facebook чат грузится медленно), попутно нажимая «Начать» и замечая окна с причиной
      let ticks = 0, viaHead = false;
      const found = await waitFor(() => {
        clickGetStarted();
        dismissDialogs();
        const b = findBox();
        if (b) return b;
        // чат мог свернуться в кружок: раскрываем кружок с названием этой страницы
        if (net === "facebook" && (++ticks === 10 || ticks === 50)) viaHead = expandChatHead(pageName) || viaHead;
        return blockedDialog() ? "BLOCK" : pinDialog() ? "PIN" : cannotDialog() ? "CANNOT" : null;
      }, net === "facebook" || net === "vk" ? 22000 : 12000);
      if (found === "BLOCK" || (!found && blockedDialog())) return report("blocked", followRes);
      if (found === "PIN" || (!found && pinDialog())) return report("pin_required", followRes);
      if (found === "CANNOT" || (!found && cannotDialog())) return report("cannot_message", followRes);
      if (!found) return report("composer_missing", snapshot());
      const box = found;
      if (viaHead && !composerBelongsTo(box, pageName)) return report("composer_missing", "в раскрытом чате не подтверждён получатель, сообщение НЕ отправлено; " + snapshot());

      // это сообщение уже есть в чате: второй раз не отправляем
      step(id, "поле найдено, проверяю, не писали ли раньше");
      if (chatHasSent(box, task.text)) return report("already", followRes);
      // ВКонтакте не принимает программную вставку (поле остаётся пустым): печатаем «настоящей клавиатурой» через Chrome
      if (net === "vk") { const [r, d] = await vkTypeAndSend(id, box, task.text); toast(r === "sent" ? "сообщение отправлено" : "результат: " + r, r === "sent"); return report(r, d); }
      step(id, "вставляю текст");

      const fill = await fillComposer(findBox, task.text);
      if (!fill.ok) {
        await clearComposer(findBox() || box); // убираем недописанный текст, ничего не отправляем
        return report("send_failed", `текст вставился не полностью (${fill.got} из ${fill.want} знаков), сообщение НЕ отправлено`);
      }
      await sleep(rnd(1200, 2500));
      const live = findBox() || fill.box;
      if (normText(textOf(live)) !== normText(task.text)) return report("send_failed", "перед отправкой текст в поле изменился, сообщение НЕ отправлено");
      const failBefore = failCount();
      step(id, "текст вставлен, отправляю");
      await sendNow(live);
      step(id, "проверяю, что сообщение ушло");
      const v = await verifySent(task.text, findBox, failBefore);
      toast(v === "sent" ? "сообщение отправлено" : "результат: " + v, v === "sent");
      return report(v, followRes);
    } catch (e) {
      return report("error", String((e && e.message) || e).slice(0, 120));
    }
  }

  // ---------- Messenger: чтение чатов и ответы (окно открывает программа) ----------
  // Окно живёт, пока программа присылает задания: список чатов, переписка одного чата или отправка ответа.
  const threadKeyOf = (a) => { const m = (a.getAttribute("href") || "").match(/\/messages\/((?:e2ee\/)?t\/[A-Za-z0-9._%-]+)/); return m ? m[1] : null; };
  const curThread = () => { const m = location.pathname.match(/\/messages\/((?:e2ee\/)?t\/[A-Za-z0-9._%-]+)/); return m ? m[1] : null; };
  const TIME_RE = /^(\d{1,2}:\d{2}|\d+\s?(min|m|h|d|w|godz\.?|dni|dzień|tyg\.?|мин|ч|д|н)\.?|yesterday|wczoraj|вчера|just now|teraz|только что)$/i;
  const ME_RE = /^(you|ty|вы)\s*[:：]/i;
  const threadLinks = () => Array.from(document.querySelectorAll('a[href*="/messages/"]')).filter((a) => threadKeyOf(a) && visible(a));
  function scrapeThreads() {
    const seen = new Map();
    for (const a of threadLinks()) {
      const key = threadKeyOf(a);
      if (seen.has(key)) continue;
      const lines = (a.innerText || "").split("\n").map((x) => x.trim()).filter(Boolean);
      if (!lines.length) continue; // ссылка-аватар без текста: возьмём следующую
      const name = lines[0].slice(0, 120);
      let time = "";
      const rest = lines.slice(1).filter((l) => {
        if (l === "·" || l === "•") return false;
        if (!time && TIME_RE.test(l)) { time = l; return false; }
        return true;
      });
      let preview = rest.join(" ");
      const m = preview.match(/\s[·•]\s(\S+(?:\s\S+)?)$/);
      if (!time && m && TIME_RE.test(m[1])) { time = m[1]; preview = preview.slice(0, m.index); }
      const label = /(unread|nieprzeczytan|непрочитан)/i.test(a.innerText || "") || !!a.querySelector('[aria-label*="nread" i], [aria-label*="nieprzeczyt" i], [aria-label*="непрочит" i]');
      const leaf = Array.from(a.querySelectorAll("span, div")).find((e) => e.children.length === 0 && (e.innerText || "").trim() && (e.innerText || "").trim() !== name);
      const bold = leaf ? (parseInt(getComputedStyle(leaf).fontWeight, 10) || 400) >= 600 : false;
      seen.set(key, { id: key, name, preview: preview.slice(0, 300), fromMe: ME_RE.test(preview), time, unread: (label || bold) && !ME_RE.test(preview), rank: seen.size });
    }
    return Array.from(seen.values());
  }
  const scrollables = () => Array.from(document.querySelectorAll("div")).filter((d) => {
    if (d.scrollHeight <= d.clientHeight + 20) return false;
    const o = getComputedStyle(d).overflowY;
    return (o === "auto" || o === "scroll") && visible(d);
  });
  const listRight = () => Math.max(0, ...threadLinks().map((a) => a.getBoundingClientRect().right));
  function listScroller() {
    const a = threadLinks()[0];
    if (!a) return null;
    return scrollables().find((d) => d.contains(a)) || null;
  }
  async function loadMoreThreads() {
    const sc = listScroller();
    if (!sc) return;
    for (let i = 0; i < 3; i++) { sc.scrollTop = sc.scrollHeight; await sleep(900); }
    sc.scrollTop = 0;
    await sleep(300);
  }
  // Поле ввода переписки: самое нижнее подходящее поле на странице
  function findInboxComposer() {
    const BAD = /comment|komentar|коммент|search|szukaj|поиск/i;
    const c = Array.from(document.querySelectorAll('div[role="textbox"][contenteditable="true"], div[contenteditable="true"], textarea')).filter(visible)
      .filter((el) => !BAD.test(el.getAttribute("aria-label") || el.getAttribute("placeholder") || ""));
    c.sort((x, y) => y.getBoundingClientRect().top - x.getBoundingClientRect().top);
    return c[0] || null;
  }
  function scrapeMessages() {
    const comp = findInboxComposer();
    const left = listRight();
    const cr = comp ? comp.getBoundingClientRect() : null;
    const mid = cr ? (cr.left + cr.right) / 2 : (left + window.innerWidth) / 2;
    const top = cr ? cr.top : window.innerHeight;
    const items = [];
    for (const e of document.querySelectorAll('div[dir="auto"], span[dir="auto"]')) {
      if (!visible(e) || e.querySelector('div[dir="auto"], span[dir="auto"]')) continue; // берём самый вложенный элемент с текстом
      if (e.closest('header, [role="banner"], [role="navigation"], [role="complementary"], a[href*="/messages/"]')) continue;
      const r = e.getBoundingClientRect();
      if (r.left < left - 4 || r.bottom > top + 2) continue;
      if (comp && comp.contains(e)) continue;
      const text = (e.innerText || "").trim();
      if (!text) continue;
      const cx = (r.left + r.right) / 2;
      if (Math.abs(cx - mid) < 40 && text.length < 28) continue; // даты и подписи по центру
      items.push({ y: r.top, fromMe: cx > mid, text: text.slice(0, 2000) });
    }
    items.sort((a, b) => a.y - b.y);
    const out = [];
    for (const it of items) { // склеиваем соседние куски одного пузыря не нужно: каждый элемент отдельная строка сообщения
      const prev = out[out.length - 1];
      if (prev && prev.text === it.text && prev.fromMe === it.fromMe && Math.abs(prev.y - it.y) < 4) continue;
      out.push(it);
    }
    const head = Array.from(document.querySelectorAll('h1, h2, [role="heading"]')).filter(visible).map((h) => (h.innerText || "").trim()).find((t) => t && t.length < 120 && !/^(chats|czaty|чаты|messenger)$/i.test(t));
    return { name: head || "", messages: out.slice(-80).map((m) => ({ fromMe: m.fromMe, text: m.text })) };
  }
  async function loadOlder() {
    const left = listRight();
    const sc = scrollables().filter((d) => d.getBoundingClientRect().left >= left - 4).sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
    if (!sc) return;
    for (let i = 0; i < 2; i++) { sc.scrollTop = 0; await sleep(1000); }
    sc.scrollTop = sc.scrollHeight;
    await sleep(500);
  }
  async function openThread(key) {
    if (curThread() === key && findInboxComposer()) return true;
    const find = () => threadLinks().find((a) => threadKeyOf(a) === key);
    let link = find();
    for (let i = 0; i < 4 && !link; i++) {
      const sc = listScroller();
      if (!sc) break;
      sc.scrollTop = sc.scrollHeight; await sleep(900); link = find();
    }
    if (!link) return false;
    link.click();
    await waitFor(() => curThread() === key && findInboxComposer(), 12000);
    await sleep(rnd(900, 1600));
    return curThread() === key;
  }
  function inboxSnapshot() {
    const fields = Array.from(document.querySelectorAll('[contenteditable="true"], textarea')).filter(visible)
      .map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute("role") || "-"}|${(e.getAttribute("aria-label") || e.getAttribute("placeholder") || "-").slice(0, 24)}]`).slice(0, 4).join(", ");
    const dlg = Array.from(document.querySelectorAll('div[role="dialog"]')).map((d) => (d.innerText || "").replace(/\s+/g, " ").slice(0, 60)).slice(0, 2).join(" || ");
    return `страница ${location.pathname.slice(0, 40)}; ссылок на чаты: ${threadLinks().length}; поля: ${fields || "нет"}; окна: ${dlg || "нет"}`;
  }
  async function doInboxTask(t) {
    await waitFor(() => document.querySelector("[role='main']") || loginWall(), 20000);
    if (loginWall()) return { result: "not_logged_in" };
    if (blockedDialog()) return { result: "blocked" };
    if (PIN_RE.test(dialogsText().join(" "))) return { result: "pin_required" };
    if (t.kind === "list") {
      await waitFor(() => threadLinks().length, 15000);
      await loadMoreThreads();
      const threads = scrapeThreads();
      return threads.length ? { result: "ok", threads } : { result: "empty", detail: inboxSnapshot() };
    }
    if (!(await openThread(t.threadId))) return { result: "thread_not_found", detail: inboxSnapshot() };
    if (t.kind === "thread") {
      await loadOlder();
      const m = scrapeMessages();
      return { result: "ok", name: m.name, messages: m.messages };
    }
    // отправка ответа
    const box = findInboxComposer();
    if (!box) return { result: "composer_missing", detail: inboxSnapshot() };
    const fill = await fillComposer(findInboxComposer, t.text);
    if (!fill.ok) {
      await clearComposer(findInboxComposer() || box);
      return { result: "send_failed", detail: `текст вставился не полностью (${fill.got} из ${fill.want} знаков), сообщение НЕ отправлено` };
    }
    await sleep(rnd(700, 1400));
    const live = findInboxComposer() || fill.box;
    if (normText(textOf(live)) !== normText(t.text)) return { result: "send_failed", detail: "перед отправкой текст в поле изменился, сообщение НЕ отправлено" };
    const failBefore = failCount();
    await sendNow(live);
    const v = await verifySent(t.text, findInboxComposer, failBefore);
    return { result: v };
  }
  async function runInbox() {
    for (;;) {
      const r = await send({ type: "inboxNext" });
      if (!r) { await sleep(2000); continue; } // фон недоступен, пробуем снова
      if (r.stop) return;
      if (!r.task) { await sleep(1500); continue; }
      let res;
      try { res = await doInboxTask(r.task); } catch (e) { res = { result: "error", detail: String((e && e.message) || e).slice(0, 120) }; }
      await send({ type: "inboxDone", id: r.task.id, ...res });
    }
  }

  // ---------- запуск ----------
  if (mi) return void runInbox();
  if (md) return void runDm(md[1]);

  const salonId = mf[1];
  (async () => {
    await waitFor(() => document.querySelector("header, [role='main']"), 15000);
    await sleep(rnd(1500, 3000));
    let res;
    if (loginWall()) res = "not_logged_in";
    else {
      res = await followStep(salonId);
      if (res === "limit" || res === "no_button" || res === "already") await send({ type: "followResult", net, id: salonId, result: res });
    }
    const [t, ok] = FOLLOW_TEXT[res] || FOLLOW_TEXT.unknown;
    toast(t, ok);
    if (res === "not_logged_in") await send({ type: "followResult", net, id: salonId, result: res });
  })();
})();
