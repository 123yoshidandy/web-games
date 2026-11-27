// 入口のページの検索・絞り込みの判定（画面を持たない部分）。ブラウザと node のテストの両方で読む
// 状態は { q, players, online, genres, time, weight, sort, fav, open } の形。
// URL の ?q=...&players=2&online=yes&genre=協力&genre=パズル&time=30&weight=easy&sort=time&fav=1&panel=open と行き来する
// ジャンルはいくつでも選べ、どれか1つに当たれば残す（選んでいなければすべて）。種類の違う条件どうしは、すべてを満たすものだけ残す
// fav はお気に入りだけを出すか（「絞り込み」の欄の外のボタン。欄の数と「解除」には数えない）
// open は「絞り込み」の欄を開いているか、sort は並べる順（どちらも条件ではないので、本数の表示や「解除」には数えない）

// 「6人以上」のボタンの値（5人までは、その人数ちょうどで遊べるもの）
export const MANY_PLAYERS = 6;
export const PLAYER_CHOICES = [1, 2, 3, 4, 5, MANY_PLAYERS];
export const ONLINE_CHOICES = ['yes', 'no'];

// 遊ぶ時間（package.json の portal.minutes。1ゲーム、パズルは1問の分数）のボタン。
// 「〜30分」は短いほうの時間が30分以内のもの（短い時間はそれより短いものも含む）。「60分〜」は長いほうの時間が60分を超えるもの
export const LONG_GAME = 'long';
export const TIME_CHOICES = ['15', '30', '60', LONG_GAME];
export const TIME_LABELS = { 15: '〜15分', 30: '〜30分', 60: '〜60分', [LONG_GAME]: '60分〜' };

// 難しさ（portal.weight。1〜5）のボタン。5段階を3つにまとめる
export const WEIGHT_LEVELS = Object.freeze({ easy: [1, 2], normal: [3], hard: [4, 5] });
export const WEIGHT_CHOICES = Object.keys(WEIGHT_LEVELS);
export const WEIGHT_LABELS = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };

// 並べる順（null は一覧の順）。time：短い順、weight：かんたん順
export const SORT_CHOICES = ['time', 'weight'];

export const EMPTY_STATE = Object.freeze({
    q: '', players: null, online: null, genres: Object.freeze([]), time: null, weight: null, sort: null, fav: false, open: false
});

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
    const pick = (key, choices) => (choices.includes(params.get(key)) ? params.get(key) : null);
    return {
        q: (params.get('q') ?? '').slice(0, 100),
        players: PLAYER_CHOICES.includes(players) ? players : null,
        online: ONLINE_CHOICES.includes(online) ? online : null,
        // 並びはジャンルの一覧の順にそろえ、重なりと知らない値は捨てる
        genres: genres.filter((genre) => picked.includes(genre)),
        time: pick('time', TIME_CHOICES),
        weight: pick('weight', WEIGHT_CHOICES),
        sort: pick('sort', SORT_CHOICES),
        fav: params.get('fav') === '1',
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
    for (const key of ['time', 'weight', 'sort']) if (state[key]) params.set(key, state[key]);
    if (state.fav) params.set('fav', '1');
    if (state.open) params.set('panel', 'open');
    const text = params.toString();
    return text ? `?${text}` : '';
};

export const isEmptyState = (state) => !state.q.trim() && !state.fav && activeFilterCount(state) === 0;

// 「絞り込み」の欄の中で選んでいる条件の数（人数・オンライン・時間・難しさは1つ、ジャンルは選んだ数）。閉じていても「絞り込み（2）」と出す
export const activeFilterCount = (state) => ['players', 'online', 'time', 'weight'].filter((key) => state[key]).length + state.genres.length;

// 「解除」：欄の中の条件だけを外す（検索の文字と、並べる順と、欄の開け閉めは残す）
export const clearFilters = (state) => ({ ...state, players: null, online: null, genres: [], time: null, weight: null });

// ジャンルのボタンを押したとき：選んでいなければ足し、選んでいれば外す（並びは一覧の順）
export const toggleGenre = (selected, genre, genres) => genres.filter((g) => (g === genre) !== selected.includes(g));

// game は { search（正規化した名前・原題・フォルダ名）, players（人数の一覧）, online, genres, minutes（[短い, 長い] か null）, weight（1〜5 か null）, fav（お気に入りか）}
// 時間や難しさを書いていないゲームは、その条件を選んだときには出さない
export const matches = (game, state) => {
    const words = state.q.split(/[\s　]+/).map(normalize).filter(Boolean);
    if (!words.every((word) => game.search.includes(word))) return false;
    if (state.fav && !game.fav) return false;
    if (state.players === MANY_PLAYERS && !game.players.some((n) => n >= MANY_PLAYERS)) return false;
    if (state.players && state.players !== MANY_PLAYERS && !game.players.includes(state.players)) return false;
    if (state.online === 'yes' && !game.online) return false;
    if (state.online === 'no' && game.online) return false;
    if (state.genres.length > 0 && !state.genres.some((genre) => game.genres.includes(genre))) return false;
    if (state.time && !game.minutes) return false;
    if (state.time === LONG_GAME && game.minutes[1] <= 60) return false;
    if (state.time && state.time !== LONG_GAME && game.minutes[0] > Number(state.time)) return false;
    if (state.weight && !WEIGHT_LEVELS[state.weight].includes(game.weight)) return false;
    return true;
};

// 並べる順の比べ方（同じなら一覧の順のまま。時間や難しさのないゲームは後ろ）
const byTime = (a, b) => (a.minutes?.[0] ?? Infinity) - (b.minutes?.[0] ?? Infinity) || (a.minutes?.[1] ?? Infinity) - (b.minutes?.[1] ?? Infinity);
const byWeight = (a, b) => (a.weight ?? Infinity) - (b.weight ?? Infinity);
export const sortGames = (games, sort) => {
    if (sort === 'time') return [...games].sort((a, b) => byTime(a, b) || byWeight(a, b));
    if (sort === 'weight') return [...games].sort((a, b) => byWeight(a, b) || byTime(a, b));
    return [...games];
};

// カードに出す時間の表記（例：15分・20〜30分）。minutes は [短い, 長い]
export const minutesLabel = (minutes) => {
    if (!minutes) return '';
    return minutes[0] === minutes[1] ? `${minutes[0]}分` : `${minutes[0]}〜${minutes[1]}分`;
};

// カードに出す人数の表記（例：2人・2〜4人・2人・4人）
export const playersLabel = (players) => {
    if (players.length === 0) return '';
    if (players.length === 1) return `${players[0]}人`;
    const contiguous = players.every((n, i) => i === 0 || n === players[i - 1] + 1);
    if (contiguous) return `${players[0]}〜${players[players.length - 1]}人`;
    return players.map((n) => `${n}人`).join('・');
};
