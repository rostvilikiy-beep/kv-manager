// 2ГИС: подслушивает ответы сервера 2ГИС с данными организаций (тот же JSON, из которого сайт рисует карточку)
// и передаёт их в dgis.js. Работает в мире страницы, ничего не меняет и никуда не отправляет.
(() => {
  if (window.__lp2gisHook) return;
  window.__lp2gisHook = true;

  const slim = (it) => ({
    id: String(it.id || ""),
    name: (it.name_ex && it.name_ex.primary) || it.name || "",
    address: it.address_name || (it.address && it.address.name) || "",
    contact_groups: Array.isArray(it.contact_groups) ? it.contact_groups : [],
    reviews: it.reviews || null,
    rubrics: Array.isArray(it.rubrics) ? it.rubrics.map((r) => r && r.name).filter(Boolean) : [],
  });
  function pick(obj) {
    const items = obj && obj.result && Array.isArray(obj.result.items) ? obj.result.items : null;
    if (!items) return;
    const out = items.filter((it) => it && it.id && (it.contact_groups || it.reviews)).map(slim);
    if (out.length) window.postMessage({ __lp2gis: true, items: out }, location.origin);
  }
  const isApi = (u) => /2gis\./i.test(String(u || "")) && /\/items/i.test(String(u || ""));
  function handleText(t) { try { pick(JSON.parse(t)); } catch (e) {} }

  const ofetch = window.fetch;
  if (ofetch) {
    window.fetch = function (input, init) {
      const p = ofetch.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : input && input.url;
        if (isApi(url)) p.then((r) => r.clone().text().then(handleText)).catch(() => {});
      } catch (e) {}
      return p;
    };
  }
  const oopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (isApi(url)) {
        this.addEventListener("load", () => {
          try {
            if (this.responseType === "" || this.responseType === "text") handleText(this.responseText);
            else if (this.responseType === "json") pick(this.response);
          } catch (e) {}
        });
      }
    } catch (e) {}
    return oopen.apply(this, arguments);
  };
})();
