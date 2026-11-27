// 入口のページの検索・絞り込みの判定（画面を持たない部分）。ブラウザと node のテストの両方で読む
// 状態は { q, players, online, genres, open } の形。URL の ?q=...&players=2&online=yes&genre=協力&genre=パズル&panel=open と行き来する
// ジャンルはいくつでも選べ、どれか1つに当たれば残す（選んでいなければすべて）。種類の違う条件どうしは、すべてを満たすものだけ残す
// open は「絞り込み」の欄を開いているか（条件ではないので、本数の表示や「解除」には数えない）

// 「6人以上」のボタンの値（5人までは、その人数ちょうどで遊べるもの）
export const MANY_PLAYERS = 6;
export const PLAYER_CHOICES = [1, 2, 3, 4, 5, MANY_PLAYERS];
export const ONLINE_CHOICES = ['yes', 'no'];

export const EMPTY_STATE = Object.freeze({ q: '', players: null, online: null, genres: Object.freeze([]), open: false });

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
    const picked = params.getAll('genre');
    return {
        q: (params.get('q') ?? '').slice(0, 100),
        players: PLAYER_CHOICES.includes(players) ? players : null,
        online: ONLINE_CHOICES.includes(online) ? online : null,
        // 並びはジャンルの一覧の順にそろえ、重なりと知らない値は捨てる
        genres: genres.filter((genre) => picked.includes(genre)),
        open: params.get('panel') === 'open'
    };
};

// 既定の値は URL に書かない（何も絞っていなければ ? もつけない）
export const stateToSearch = (state) => {
    const params = new URLSearchParams();
    if (state.q.trim()) params.set('q', state.q.trim());
    if (state.players) params.set('players', String(state.players));
    if (state.online) params.set('online', state.online);
    for (const genre of state.genres) params.append('genre', genre);
    if (state.open) params.set('panel', 'open');
    const text = params.toString();
    return text ? `?${text}` : '';
};

export const isEmptyState = (state) => !state.q.trim() && !state.players && !state.online && state.genres.length === 0;

// 「絞り込み」の欄の中で選んでいる条件の数（人数・オンラインは1つ、ジャンルは選んだ数）。閉じていても「絞り込み（2）」と出す
export const activeFilterCount = (state) => (state.players ? 1 : 0) + (state.online ? 1 : 0) + state.genres.length;

// 「解除」：欄の中の条件だけを外す（検索の文字と、欄の開け閉めは残す）
export const clearFilters = (state) => ({ ...state, players: null, online: null, genres: [] });

// ジャンルのボタンを押したとき：選んでいなければ足し、選んでいれば外す（並びは一覧の順）
export const toggleGenre = (selected, genre, genres) => genres.filter((g) => (g === genre) !== selected.includes(g));

// game は { search（正規化した名前・原題・フォルダ名）, players（人数の一覧）, online, genres }
export const matches = (game, state) => {
    const words = state.q.split(/[\s　]+/).map(normalize).filter(Boolean);
    if (!words.every((word) => game.search.includes(word))) return false;
    if (state.players === MANY_PLAYERS && !game.players.some((n) => n >= MANY_PLAYERS)) return false;
    if (state.players && state.players !== MANY_PLAYERS && !game.players.includes(state.players)) return false;
    if (state.online === 'yes' && !game.online) return false;
    if (state.online === 'no' && game.online) return false;
    if (state.genres.length > 0 && !state.genres.some((genre) => game.genres.includes(genre))) return false;
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
