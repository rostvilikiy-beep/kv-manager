// Мост между страницей программы рассылки (localhost) и расширением.
// Передаёт команды программы расширению и ответы обратно. Работает только с настоящей программой
// (проверяется по подписи в /api/ping), чужие локальные сайты управлять расширением не могут.
(() => {
  let verified = null;
  async function verify() {
    if (verified !== null) return verified;
    try {
      const r = await fetch("/api/ping");
      const j = await r.json();
      verified = !!(j && j.app === "star-mailer");
    } catch (e) { verified = false; }
    return verified;
  }
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.lp !== "req" || typeof m.id !== "string") return;
    if (!(await verify())) return;
    let data = null;
    try {
      if (m.kind === "ping") data = await chrome.runtime.sendMessage({ type: "dmPing" });
      else if (m.kind === "task") data = await chrome.runtime.sendMessage({ type: "dmTask", task: m.payload });
      else if (m.kind === "poll") data = await chrome.runtime.sendMessage({ type: "dmPoll", id: m.payload && m.payload.id });
      else if (m.kind === "inboxTask") data = await chrome.runtime.sendMessage({ type: "inboxTask", task: m.payload });
      else if (m.kind === "inboxPoll") data = await chrome.runtime.sendMessage({ type: "inboxPoll", id: m.payload && m.payload.id });
      else if (m.kind === "inboxStop") data = await chrome.runtime.sendMessage({ type: "inboxStop" });
      else if (m.kind === "adsStart") data = await chrome.runtime.sendMessage({ type: "adsStart", task: m.payload });
      else if (m.kind === "adsPoll") data = await chrome.runtime.sendMessage({ type: "adsPoll", cursor: m.payload && m.payload.cursor });
      else if (m.kind === "siteTask") data = await chrome.runtime.sendMessage({ type: "siteTask", task: m.payload });
      else if (m.kind === "sitePoll") data = await chrome.runtime.sendMessage({ type: "sitePoll", id: m.payload && m.payload.id });
      else if (m.kind === "siteStop") data = await chrome.runtime.sendMessage({ type: "siteStop", id: m.payload && m.payload.id });
      else if (m.kind === "adsStop") data = await chrome.runtime.sendMessage({ type: "adsStop" });
    } catch (err) { data = { error: String((err && err.message) || err) }; }
    window.postMessage({ lp: "res", id: m.id, data }, location.origin);
  });
  // Сообщаем странице, что мост готов (страница могла спросить раньше, чем мы успели подключиться)
  window.postMessage({ lp: "hello" }, location.origin);
  window.addEventListener("load", () => window.postMessage({ lp: "hello" }, location.origin));
})();
