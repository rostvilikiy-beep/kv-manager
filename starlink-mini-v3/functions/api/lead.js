// Cloudflare Pages Function: приймає заявки з форм сайту і пересилає їх у Telegram.
// (Для Vercel є такий самий обробник у api/lead.js)
// Потрібні змінні в Cloudflare (Workers & Pages → проєкт → Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN — токен бота від @BotFather (тип Secret)
//   TELEGRAM_CHAT_ID   — ID чату (або кількох, через кому), куди надсилати заявки

const MAX = 80;
const clean = v => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost({ request, env }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatIds = String(env.TELEGRAM_CHAT_ID || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!token || !chatIds.length) {
    console.error("TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID не задані");
    return json({ ok: false, error: "Not configured" }, 500);
  }

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  // Пастка для ботів: приховане поле, яке людина не бачить і не заповнює
  if (clean(body.website)) return json({ ok: true });

  const name = clean(body.name);
  const surname = clean(body.surname);
  const type = body.type === "Купити в 1 клік" ? "Купити в 1 клік" : "Форма заявки";
  const digits = clean(body.phone).replace(/\D/g, "");
  if (name.length < 2 || !/^380\d{9}$/.test(digits)) return json({ ok: false, error: "Invalid data" }, 400);

  const time = new Date().toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" });
  const text = [
    `🛰 <b>Нова заявка — VOMTEX</b>`,
    `📌 ${esc(type)}`,
    ``,
    `👤 <b>Ім’я:</b> ${esc(name)}`,
    surname ? `👤 <b>Прізвище:</b> ${esc(surname)}` : null,
    `📞 <b>Телефон:</b> +${digits}`,
    ``,
    `🕒 ${esc(time)} (Київ)`
  ].filter(l => l !== null).join("\n");

  try {
    const results = await Promise.all(chatIds.map(chat_id =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true })
      }).then(r => r.json())
    ));
    const failed = results.filter(r => !r.ok);
    if (failed.length === results.length) {
      console.error("Telegram error:", failed.map(f => f.description).join("; "));
      return json({ ok: false, error: "Telegram error" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("Telegram request failed:", e.message);
    return json({ ok: false, error: "Telegram unavailable" }, 502);
  }
}

export const onRequest = () => json({ ok: false, error: "Method not allowed" }, 405);
