// 入口のページのお気に入り（画面を持たない部分）。ブラウザと node のテストの両方で読む
// - ログインしていなければ、端末（localStorage の portal.favorites）だけに置く
// - ログインしていれば、サーバー（記録の API の GET・PUT /favorites）に置き、ほかのスマホでも同じになる
//   端末には写し（portal.favorites.account）を持ち、すぐに出す。送れなかった変更は印（dirty）を付けて、次に合わせるときに送る
// - ログインしているときに合わせると、ログインしていないあいだに付けたお気に入りをサーバーの分に足し、送れたら端末の分を空にする
//   （ログアウトすると、端末の分だけが出る）

export const LOCAL_KEY = 'portal.favorites';
export const ACCOUNT_KEY = 'portal.favorites.account';

const sameUser = (a, b) => Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase();
const isGameList = (value) => Array.isArray(value) && value.every((game) => typeof game === 'string');

// 重なりを除いて名前の順にする（サーバーの normalizeFavorites と同じ並び）
export const mergeFavorites = (...lists) => [...new Set(lists.flat())].sort();

// storage は localStorage の形、fetchImpl は fetch の形。user・url は今の名前と記録の API の場所を返す関数（url が null なら端末だけ）
export function createFavorites({ storage, fetchImpl, user = () => '', url = () => null }) {
    const read = (key, fallback) => {
        try {
            const value = JSON.parse(storage?.getItem(key) ?? 'null');
            return value ?? fallback;
        } catch {
            return fallback;
        }
    };
    const write = (key, value) => {
        try {
            if (value === null) storage?.removeItem(key);
            else storage?.setItem(key, JSON.stringify(value));
        } catch {
            // 保存できなくても、この画面のあいだは使える
        }
    };
    const readLocal = () => {
        const games = read(LOCAL_KEY, []);
        return isGameList(games) ? games : [];
    };
    const writeLocal = (games) => write(LOCAL_KEY, games.length > 0 ? mergeFavorites(games) : null);
    // ログインしている人の写し（別の人のものなら null）
    const readAccount = (name) => {
        const account = read(ACCOUNT_KEY, null);
        return account && sameUser(account.name, name) && isGameList(account.games) ? account : null;
    };
    const writeAccount = (name, games, dirty) => write(ACCOUNT_KEY, { name, games: mergeFavorites(games), dirty });

    const listeners = new Set();
    const notify = () => listeners.forEach((listener) => listener());
    // サーバーに置くのは、ログインしていて、記録の API があるときだけ
    const accountName = () => (url() && typeof fetchImpl === 'function' ? user() : '') || '';

    const list = () => {
        const name = accountName();
        if (!name) return mergeFavorites(readLocal());
        return mergeFavorites(readAccount(name)?.games ?? [], readLocal());
    };

    const send = async (name, games) => {
        const response = await fetchImpl(`${url()}/favorites`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, games })
        });
        if (!response.ok) throw new Error(`PUT /favorites ${response.status}`);
        const body = await response.json();
        return isGameList(body?.games) ? body.games : games;
    };

    let changes = 0; // 付け外しの回数（合わせているあいだに変わったら、合わせた結果を写さない）

    // 送受信は1つずつ（同時に押しても、後の変更が前の変更で上書きされないように）
    let queue = Promise.resolve();
    const serial = (task) => {
        queue = queue.then(task, task);
        return queue;
    };

    // サーバーと合わせる。うまくいけば true
    const sync = () => serial(async () => {
        const name = accountName();
        if (!name) {
            notify();
            return true;
        }
        const start = changes;
        try {
            const local = readLocal();
            const account = readAccount(name);
            let games;
            if (account?.dirty) {
                games = await send(name, mergeFavorites(account.games, local));
            } else {
                const response = await fetchImpl(`${url()}/favorites?name=${encodeURIComponent(name)}`);
                if (!response.ok) throw new Error(`GET /favorites ${response.status}`);
                const body = await response.json();
                games = isGameList(body?.games) ? body.games : [];
                if (local.some((game) => !games.includes(game))) games = await send(name, mergeFavorites(games, local));
            }
            // 合わせているあいだに名前が変わった・付け外しがあったら、写さない（付け外しの後の sync がもう一度送る）
            if (sameUser(accountName(), name) && changes === start) {
                writeAccount(name, games, false);
                writeLocal([]);
            }
            return true;
        } catch {
            return false;
        } finally {
            notify();
        }
    });

    // お気に入りを付け外しする。付けたら true
    const toggle = (game) => {
        const current = list();
        const next = current.includes(game) ? current.filter((g) => g !== game) : [...current, game];
        const name = accountName();
        changes++;
        if (name) {
            writeAccount(name, next, true);
            writeLocal([]);
            notify();
            sync();
        } else {
            writeLocal(next);
            notify();
        }
        return next.includes(game);
    };

    return {
        list,
        has: (game) => list().includes(game),
        toggle,
        sync,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
}
