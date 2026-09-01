// Тонкая обёртка над Telegram Bot API через обычный fetch — без пакета
// node-telegram-bot-api. Тот пакет заточен под постоянный процесс
// (long polling или свой HTTP-сервер под вебхук), а serverless-функции
// Vercel живут только на время одного запроса — им куда естественнее
// просто дёргать REST API напрямую.
const BOT_TOKEN = process.env.BOT_TOKEN;

async function tgCall(method, payload) {
  if (!BOT_TOKEN) throw new Error('Не задан BOT_TOKEN (переменная окружения в настройках проекта Vercel)');
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  return data.result;
}

function sendMessage(chatId, text, extra = {}) {
  return tgCall('sendMessage', { chat_id: chatId, text, ...extra });
}

module.exports = { tgCall, sendMessage };
