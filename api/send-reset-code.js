// Вызывается напрямую из public/admin.html (fetch('/api/send-reset-code'))
// при запросе кода подтверждения для "Правила платформы" → полного сброса.
// Раньше это делал слушатель Firebase внутри постоянно запущенного
// bot/index.js — теперь код доставляет эта serverless-функция, без
// какого-либо постоянного процесса.
//
// Публично доступный HTTP-эндпоинт, который шлёт сообщения от имени бота,
// сам по себе был бы открытым ретранслятором спама на произвольный
// telegramId. Поэтому НЕ доверяем присланному телу запроса напрямую —
// функция сама читает из базы (а) что роль запрошенного telegramId
// действительно superadmin и (б) что для него только что реально
// запросили код (resetConfirmations/<telegramId>, свежий и не использован)
// — отправляет только то, что уже лежит в базе, а не то, что прислали в
// POST.
const { firebaseGet } = require('./_lib/firebase');
const { sendMessage } = require('./_lib/telegram');

const CODE_TTL_MS = 5 * 60 * 1000;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const telegramId = req.body?.telegramId;
  if (!telegramId || typeof telegramId !== 'string') {
    res.status(400).json({ error: 'telegramId required' });
    return;
  }

  try {
    const [role, confirmation] = await Promise.all([
      firebaseGet(`users/${telegramId}/role`),
      firebaseGet(`resetConfirmations/${telegramId}`)
    ]);

    if (role !== 'superadmin') {
      res.status(403).json({ error: 'not superadmin' });
      return;
    }
    const isFresh = confirmation && !confirmation.used && confirmation.code &&
      (Date.now() - confirmation.createdAt) < CODE_TTL_MS;
    if (!isFresh) {
      res.status(400).json({ error: 'no fresh code request found for this telegramId' });
      return;
    }

    await sendMessage(telegramId,
      `🔐 Код подтверждения для ПОЛНОГО СБРОСА БАТТЛ перед бета-тестом: <b>${confirmation.code}</b>\n\n` +
      `Действует 5 минут. Введи его в панели («Правила платформы»). Если ты не запрашивал сброс — просто игнорируй это сообщение и никому код не сообщай.`,
      { parse_mode: 'HTML' }
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-reset-code error:', err);
    res.status(502).json({ error: err.message || 'failed to send code' });
  }
};
