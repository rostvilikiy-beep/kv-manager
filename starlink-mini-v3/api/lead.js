// Приймає заявки з форм сайту і пересилає їх у Telegram.
// Потрібні змінні середовища у Vercel (Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN — токен бота від @BotFather
//   TELEGRAM_CHAT_ID   — ID чату (або кількох, через кому), куди надсилати заявки

const MAX = 80; // максимальна довжина кожного поля

const clean = v => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = String(process.env.TELEGRAM_CHAT_ID || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!token || !chatIds.length) {
    console.error("TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID не задані");
    return res.status(500).json({ ok: false, error: "Not configured" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Пастка для ботів: приховане поле, яке людина не бачить і не заповнює
  if (clean(body.website)) return res.status(200).json({ ok: true });

  const name = clean(body.name);
  const surname = clean(body.surname);
  const phone = clean(body.phone);
  const type = body.type === "Купити в 1 клік" ? "Купити в 1 клік" : "Форма заявки";
  const digits = phone.replace(/\D/g, "");

  if (name.length < 2 || !/^380\d{9}$/.test(digits)) {
    return res.status(400).json({ ok: false, error: "Invalid data" });
  }

  const time = new Date().toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" });
  const lines = [
    `🛰 <b>Нова заявка — VOMTEX</b>`,
    `📌 ${esc(type)}`,
    ``,
    `👤 <b>Ім’я:</b> ${esc(name)}`,
    surname ? `👤 <b>Прізвище:</b> ${esc(surname)}` : null,
    `📞 <b>Телефон:</b> +${digits}`,
    ``,
    `🕒 ${esc(time)} (Київ)`
  ].filter(l => l !== null);

  try {
    const results = await Promise.all(chatIds.map(chat_id =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true })
      }).then(r => r.json())
    ));
    const failed = results.filter(r => !r.ok);
    if (failed.length === results.length) {
      console.error("Telegram error:", failed.map(f => f.description).join("; "));
      return res.status(502).json({ ok: false, error: "Telegram error" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Telegram request failed:", e.message);
    return res.status(502).json({ ok: false, error: "Telegram unavailable" });
  }
};
