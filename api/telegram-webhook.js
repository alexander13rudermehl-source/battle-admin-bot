// Вебхук вместо long polling — Telegram сам стучится сюда при каждом
// новом сообщении/апдейте, никакого постоянно запущенного процесса не
// нужно (см. README → "Vercel (полностью бесплатно, без карты)").
// Регистрируется один раз командой setWebhook (см. README) и продолжает
// работать сам, пока задеплоен этот проект.
const { sendMessage } = require('./_lib/telegram');

const MINI_APP_URL = process.env.MINI_APP_URL;

function withCacheBust(url) {
  // Telegram агрессивно кэширует Mini App по точному URL — без меняющегося
  // параметра открытая когда-то давно кнопка продолжала бы грузить старую
  // версию страницы даже после обновления деплоя
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}

function sendAdminButton(chatId) {
  return sendMessage(chatId,
    'Открой панель управления БАТТЛ. Доступ проверяется по твоей роли в базе — если её ещё не выдали, страница сама покажет «доступ запрещён».',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🛠 Открыть админ-панель', web_app: { url: withCacheBust(MINI_APP_URL) } }
        ]]
      }
    }
  );
}

const HELP_TEXT =
  'Этот бот — вход в Mini App админ-панель проекта БАТТЛ.\n\n' +
  '/admin — открыть панель\n\n' +
  'Панель видна только тем, у кого в базе выставлена роль moderator/admin/superadmin ' +
  '(выдаётся вручную через Firebase Console — так же, как и на самом сайте).';

module.exports = async function handler(req, res) {
  // Telegram шлёт апдейты только методом POST — на GET (например, если кто-то
  // просто откроет этот URL в браузере) отвечаем без ошибки, но ничего не делаем
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }

  try {
    const update = req.body || {};
    const msg = update.message;
    if (msg && typeof msg.text === 'string') {
      const chatId = msg.chat.id;
      const text = msg.text.trim();
      if (text === '/start' || text === '/admin') {
        await sendAdminButton(chatId);
      } else if (text === '/help') {
        await sendMessage(chatId, HELP_TEXT);
      }
    }
  } catch (err) {
    // логируем, но всё равно отвечаем 200 — иначе Telegram решит, что
    // доставка не удалась, и будет повторно слать тот же апдейт снова и снова
    console.error('telegram-webhook error:', err);
  }
  res.status(200).send('ok');
};
