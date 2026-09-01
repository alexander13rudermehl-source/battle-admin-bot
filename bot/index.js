// Telegram-бот для проекта БАТТЛ — точка входа в Mini App админ-панель.
//
// Сам бот не трогает Firebase напрямую: он только выдаёт кнопку, открывающую
// public/admin.html как Telegram Web App. Проверка роли (moderator/admin/
// superadmin) происходит внутри самой страницы — тем же способом, что и в
// основном сайте (users/<telegramId>/role в той же Realtime Database).
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onChildAdded } = require('firebase/database');

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

// ===== та же Firebase-база, что и у admin.html / основного сайта =====
// Этот apiKey — публичный клиентский ключ веб-конфига Firebase, не секрет
// (см. тот же комментарий в admin.html); реальная защита — database.rules.json.
const firebaseConfig = {
  apiKey: "AIzaSyBe2eSG48yzv_9r6Q5yUF7fe2b6YLQGuQg",
  authDomain: "zolotaya-kletka.firebaseapp.com",
  databaseURL: "https://zolotaya-kletka-default-rtdb.firebaseio.com",
  projectId: "zolotaya-kletka",
  storageBucket: "zolotaya-kletka.firebasestorage.app",
  messagingSenderId: "570732456851",
  appId: "1:570732456851:web:1a5e2ec46f5abf0e22d666"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ===== код подтверждения для "Правила платформы" → полного сброса =====
// Панель (admin.html), когда superadmin запрашивает сброс, пишет сюда
// одноразовый код — этот бот, работающий отдельным постоянным процессом,
// присылает его владельцу того же telegramId личным сообщением. Смысл
// в том, что сама веб-страница НЕ может ни сгенерировать код себе же, ни
// прочитать то, что бот прислал — код обязательно проходит через реальный
// Telegram-чат, до которого у человека с одним лишь открытым в браузере
// вкладкой панели доступа нет. Без этого "пароль" был бы просто ещё одной
// строкой в том же JS, который человек и так уже открыл.
const RESET_CODE_FRESH_MS = 2 * 60 * 1000; // не пересылать уже протухшие/старые записи при перезапуске бота
onChildAdded(ref(db, 'resetConfirmations'), (snap) => {
  const telegramId = snap.key;
  const data = snap.val();
  if (!data || data.used || !data.code || !data.createdAt) return;
  if (Date.now() - data.createdAt > RESET_CODE_FRESH_MS) return; // старая запись, увиденная заново при перезапуске (child_added срабатывает и на уже существующих узлах)
  bot.sendMessage(telegramId,
    `🔐 Код подтверждения для ПОЛНОГО СБРОСА БАТТЛ перед бета-тестом: <b>${data.code}</b>\n\nДействует 5 минут. Введи его в панели («Правила платформы»). Если ты не запрашивал сброс — просто игнорируй это сообщение и никому код не сообщай.`,
    { parse_mode: 'HTML' }
  ).catch((err) => console.error('Не удалось отправить код подтверждения сброса:', err.message));
});

// Telegram кэширует Mini App очень агрессивно по точному URL — обновление
// public/admin.html на хостинге само по себе не гарантирует, что открытая
// через кнопку страница подтянет новую версию. Добавляем меняющийся
// параметр ?v=..., чтобы каждый перезапуск бота (после деплоя новой версии
// страницы) и каждое нажатие /start открывали заведомо "новый" для Telegram
// URL и не показывали старый кэш.
function withCacheBust(url, version) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${version}`;
}

const startupVersion = Date.now();

bot.setMyCommands([
  { command: 'admin', description: 'Открыть админ-панель' },
  { command: 'help', description: 'Что умеет этот бот' }
]).catch((err) => console.error('setMyCommands failed:', err.message));

// Кнопка синего меню рядом с полем ввода — тоже сразу открывает Mini App
bot.setChatMenuButton({
  menu_button: { type: 'web_app', text: 'Админ-панель', web_app: { url: withCacheBust(MINI_APP_URL, startupVersion) } }
}).catch((err) => console.error('setChatMenuButton failed:', err.message));

function sendAdminButton(chatId) {
  return bot.sendMessage(chatId, 'Открой панель управления БАТТЛ. Доступ проверяется по твоей роли в базе — если её ещё не выдали, страница сама покажет «доступ запрещён».', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛠 Открыть админ-панель', web_app: { url: withCacheBust(MINI_APP_URL, Date.now()) } }
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
