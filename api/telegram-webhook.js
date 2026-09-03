// Вебхук вместо long polling — Telegram сам стучится сюда при каждом
// новом сообщении/апдейте, никакого постоянно запущенного процесса не
// нужно (см. README → "Vercel (полностью бесплатно, без карты)").
// Регистрируется один раз командой setWebhook (см. README) и продолжает
// работать сам, пока задеплоен этот проект.
const { sendMessage } = require('./_lib/telegram');

const MINI_APP_URL = process.env.MINI_APP_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  // не роняем функцию — просто предупреждаем в логах Vercel. Без секрета
  // эндпоинт технически открыт: URL легко угадать (api/telegram-webhook),
  // и без проверки заголовка кто угодно может слать сюда поддельные
  // "апдейты" от имени Telegram (см. README → "Секрет вебхука")
  console.warn('WEBHOOK_SECRET не задан — вебхук принимает запросы без проверки, что они реально от Telegram. См. README.');
}

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

  // Telegram подписывает каждый запрос заголовком X-Telegram-Bot-Api-Secret-Token,
  // если он был указан при setWebhook (см. README). Без этой проверки URL
  // функции — единственная защита эндпоинта, а он легко угадывается.
  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    res.status(401).send('unauthorized');
    return;
  }

  try {
    const update = req.body || {};
    const msg = update.message;
    if (msg && typeof msg.text === 'string') {
      const chatId = msg.chat.id;
      // /start@ИмяБота — Telegram иногда дописывает юзернейм бота к команде
      // (групповые чаты, подсказки клиента) — без этой обрезки такие
      // сообщения тихо игнорировались бы
      const command = msg.text.trim().split(/\s+/)[0].split('@')[0];
      if (command === '/start' || command === '/admin') {
        await sendAdminButton(chatId);
      } else if (command === '/help') {
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
