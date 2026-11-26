// 入口のページの検索・絞り込みの判定（画面を持たない部分）。ブラウザと node のテストの両方で読む
// 状態は { q, players, online, genre } の形。URL の ?q=...&players=2&online=yes&genre=協力 と行き来する

// 「5人以上」のボタンの値
export const MANY_PLAYERS = 5;
export const PLAYER_CHOICES = [1, 2, 3, 4, MANY_PLAYERS];
export const ONLINE_CHOICES = ['yes', 'no'];

export const EMPTY_STATE = Object.freeze({ q: '', players: null, online: null, genre: null });

// 検索のための文字の正規化：全角・半角をそろえ、大文字を小文字に、欧文のアクセントを外し（é → e）、
// カタカナをひらがなにし、空白と区切りの記号を除く
export const normalize = (text) => String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･\-‐–—_:：!！?？'’"“”.,、。&＆()（）「」『』]/g, '');

export const parseState = (search, genres) => {
    const params = new URLSearchParams(search);
    const players = Number(params.get('players'));
    const online = params.get('online');
    const genre = params.get('genre');
    return {
        q: (params.get('q') ?? '').slice(0, 100),
        players: PLAYER_CHOICES.includes(players) ? players : null,
        online: ONLINE_CHOICES.includes(online) ? online : null,
        genre: genres.includes(genre) ? genre : null
    };
};

// 既定の値は URL に書かない（何も絞っていなければ ? もつけない）
export const stateToSearch = (state) => {
    const params = new URLSearchParams();
    if (state.q.trim()) params.set('q', state.q.trim());
    if (state.players) params.set('players', String(state.players));
    if (state.online) params.set('online', state.online);
    if (state.genre) params.set('genre', state.genre);
    const text = params.toString();
    return text ? `?${text}` : '';
};

export const isEmptyState = (state) => !state.q.trim() && !state.players && !state.online && !state.genre;

// game は { search（正規化した名前・原題・フォルダ名）, players（人数の一覧）, online, genres }
export const matches = (game, state) => {
    const words = state.q.split(/[\s　]+/).map(normalize).filter(Boolean);
    if (!words.every((word) => game.search.includes(word))) return false;
    if (state.players === MANY_PLAYERS && !game.players.some((n) => n >= MANY_PLAYERS)) return false;
    if (state.players && state.players !== MANY_PLAYERS && !game.players.includes(state.players)) return false;
    if (state.online === 'yes' && !game.online) return false;
    if (state.online === 'no' && game.online) return false;
    if (state.genre && !game.genres.includes(state.genre)) return false;
    return true;
};

// カードに出す人数の表記（例：2人・2〜4人・2人・4人）
export const playersLabel = (players) => {
    if (players.length === 0) return '';
    if (players.length === 1) return `${players[0]}人`;
    const contiguous = players.every((n, i) => i === 0 || n === players[i - 1] + 1);
    if (contiguous) return `${players[0]}〜${players[players.length - 1]}人`;
    return players.map((n) => `${n}人`).join('・');
};
