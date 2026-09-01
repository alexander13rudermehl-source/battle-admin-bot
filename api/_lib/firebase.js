// Чтение той же Realtime Database через обычный REST API (<путь>.json),
// без Firebase SDK — для пары точечных чтений в serverless-функции это
// проще и не тянет лишнюю зависимость. database.rules.json разрешает
// чтение всем (.read: true), так что без ключа/токена это штатно работает
// — тот же принцип, что и у public/admin.html и bot/index.js.
const DB_URL = 'https://zolotaya-kletka-default-rtdb.firebaseio.com';

async function firebaseGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  if (!res.ok) throw new Error(`Firebase GET ${path} failed: ${res.status}`);
  return res.json();
}

module.exports = { firebaseGet };
