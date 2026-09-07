// Задаёт/сбрасывает пароль для входа в админ-панель с другого устройства
// (см. вкладка "Аккаунт" в public/admin.html). Пароль НЕ хранится в
// Realtime Database — она публична на чтение (.read:true), любой хэш там
// можно было бы скачать и брутфорсить офлайн. Вместо этого используется
// настоящий Firebase Authentication (email/password), а "email" — это
// детерминированный синтетический адрес из PLR-кода игрока (см.
// playerIdToAuthEmail и её пару в admin.html).
//
// Ключевое свойство: эта функция вызывается ТОЛЬКО из-под настоящего
// Telegram-сеанса — подпись initData проверяется здесь же, на сервере
// (verifyTelegramInitData), с использованием секретного BOT_TOKEN, которого
// у клиента нет и быть не может. Значит пароль-вход на чужом устройстве
// не может сам себя перевыпустить: чтобы сменить/сбросить пароль, всегда
// нужен живой Telegram — это и есть доверенный канал восстановления,
// вместо email-рассылки (у синтетических адресов нет настоящих ящиков).
//
// Firebase Admin SDK, в отличие от клиентского, может задать пароль уже
// существующему пользователю без знания старого — клиентский SDK это
// прямо запрещает (auth.currentUser.updatePassword требует живой сессии
// или недавней реаутентификации). Так решается "забыл пароль" целиком на
// сервере, без отдельного flow сброса по почте.
const crypto = require('crypto');
const admin = require('firebase-admin');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MAX_INIT_DATA_AGE_SEC = 24 * 60 * 60; // не одноразовый токен, но и вечно доверять старому не стоит
const ALLOWED_ROLES = ['moderator', 'admin', 'superadmin'];

if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: 'https://zolotaya-kletka-default-rtdb.firebaseio.com'
  });
}

// Официальный алгоритм проверки Telegram WebApp initData:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN) throw new Error('Сервер не настроен: нет BOT_TOKEN');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('initData без hash');
  params.delete('hash');
  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) throw new Error('Подпись initData не совпала');

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || (Date.now() / 1000 - authDate) > MAX_INIT_DATA_AGE_SEC) {
    throw new Error('initData устарел — перезайди в бота и открой панель заново');
  }
  const userJson = params.get('user');
  if (!userJson) throw new Error('initData без user');
  return JSON.parse(userJson);
}

function playerIdToAuthEmail(playerId) {
  return String(playerId).trim().toLowerCase() + '@admin.trollbattle.internal';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method not allowed' }); return; }
  if (!admin.apps.length) { res.status(500).json({ ok: false, error: 'Сервер не настроен: нет FIREBASE_SERVICE_ACCOUNT' }); return; }

  try {
    const { initData, password } = req.body || {};
    if (!initData) { res.status(400).json({ ok: false, error: 'нет initData' }); return; }
    if (!password || String(password).length < 8) {
      res.status(400).json({ ok: false, error: 'пароль минимум 8 символов' });
      return;
    }

    const tgUser = verifyTelegramInitData(initData);
    const telegramId = String(tgUser.id);

    const db = admin.database();
    const userSnap = await db.ref('users/' + telegramId).once('value');
    const user = userSnap.val();
    const role = user?.role || (user?.isAdmin ? 'admin' : 'user');
    if (!user || !ALLOWED_ROLES.includes(role)) {
      res.status(403).json({ ok: false, error: 'у этого аккаунта нет доступа к панели' });
      return;
    }
    if (!user.playerId) {
      res.status(400).json({ ok: false, error: 'у аккаунта нет playerId' });
      return;
    }

    const email = playerIdToAuthEmail(user.playerId);
    const auth = admin.auth();
    try {
      const existing = await auth.getUserByEmail(email);
      await auth.updateUser(existing.uid, { password: String(password) });
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        await auth.createUser({ email, password: String(password) });
      } else {
        throw err;
      }
    }

    res.status(200).json({ ok: true, playerId: user.playerId });
  } catch (err) {
    console.error('admin-set-password error:', err);
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
};
