// Telegram-бот для проекта БАТТЛ — точка входа в Mini App админ-панель.
//
// Сам бот не трогает Firebase напрямую: он только выдаёт кнопку, открывающую
// public/admin.html как Telegram Web App. Проверка роли (moderator/admin/
// superadmin) происходит внутри самой страницы — тем же способом, что и в
// основном сайте (users/<telegramId>/role в той же Realtime Database).
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL;

if (!BOT_TOKEN) {
  console.error('Не задан BOT_TOKEN. Скопируй .env.example в .env и вставь токен от @BotFather.');
  process.exit(1);
}
if (!MINI_APP_URL || !MINI_APP_URL.startsWith('https://')) {
  console.error('Не задан корректный MINI_APP_URL (обязательно https://...). Telegram Mini App не откроется по http.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.setMyCommands([
  { command: 'admin', description: 'Открыть админ-панель' },
  { command: 'help', description: 'Что умеет этот бот' }
]).catch((err) => console.error('setMyCommands failed:', err.message));

// Кнопка синего меню рядом с полем ввода — тоже сразу открывает Mini App
bot.setChatMenuButton({
  menu_button: { type: 'web_app', text: 'Админ-панель', web_app: { url: MINI_APP_URL } }
}).catch((err) => console.error('setChatMenuButton failed:', err.message));

function sendAdminButton(chatId) {
  return bot.sendMessage(chatId, 'Открой панель управления БАТТЛ. Доступ проверяется по твоей роли в базе — если её ещё не выдали, страница сама покажет «доступ запрещён».', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛠 Открыть админ-панель', web_app: { url: MINI_APP_URL } }
      ]]
    }
  });
}

bot.onText(/\/start/, (msg) => sendAdminButton(msg.chat.id));
bot.onText(/\/admin/, (msg) => sendAdminButton(msg.chat.id));
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Этот бот — вход в Mini App админ-панель проекта БАТТЛ.\n\n' +
    '/admin — открыть панель\n\n' +
    'Панель видна только тем, у кого в базе выставлена роль moderator/admin/superadmin ' +
    '(выдаётся вручную через Firebase Console — так же, как и на самом сайте).'
  );
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));

console.log('Бот запущен (long polling). Mini App:', MINI_APP_URL);
