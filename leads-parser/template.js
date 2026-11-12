// Переменные в тексте сообщения: {имя} — название салона, {отзывы} — количество отзывов, {рейтинг} — рейтинг.
// Общий файл для фона расширения (рассылка из программы) и панели 2ГИС.
// Название чистим от эмодзи и украшений («💈🏆 BARBEROS 🏆💈» → «BARBEROS»)
var cleanName = (n) => String(n || "").replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, "").replace(/^[\s|•·—–-]+|[\s|•·—–-]+$/g, "").replace(/\s+/g, " ").trim();
var VARS = { "имя": "name", "название": "name", "name": "name", "отзывы": "reviews", "reviews": "reviews", "рейтинг": "rating", "rating": "rating" };
// Возвращает { text } или { error } — если в шаблоне есть переменная, для которой нет данных, сообщение не отправляем
function fillTemplate(text, data) {
  data = data || {};
  const missing = [];
  const out = String(text || "").replace(/\{\s*([^{}]+?)\s*\}/g, (all, key) => {
    const f = VARS[key.toLowerCase()];
    if (!f) return all;
    let v = data[f];
    if (f === "name") v = cleanName(v);
    if (f === "rating" && typeof v === "number") v = String(v).replace(".", ",");
    if (v === null || v === undefined || v === "") { missing.push("{" + key + "}"); return all; }
    return String(v);
  });
  return missing.length ? { error: "нет данных для " + [...new Set(missing)].join(", ") } : { text: out };
}
var hasVars = (text) => /\{\s*(имя|название|name|отзывы|reviews|рейтинг|rating)\s*\}/i.test(String(text || ""));
