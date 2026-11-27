// 入口のページの検索・絞り込みの画面。カードとボタンは build-site.mjs が HTML に書き出し、ここでは表示を切り替える
import { EMPTY_STATE, parseState, stateToSearch, isEmptyState, activeFilterCount, clearFilters, toggleGenre, matches, sortGames } from './filter.js';

const panel = document.getElementById('filters');
const input = document.getElementById('q');
const count = document.getElementById('count');
const empty = document.getElementById('empty');
const toggle = document.getElementById('filter-toggle');
const toggleCount = document.getElementById('filter-count');
const groups = document.getElementById('filter-groups');
const clear = document.getElementById('filter-clear');
const chips = [...panel.querySelectorAll('button[data-key]')];
const genres = chips.filter((b) => b.dataset.key === 'genre' && b.dataset.value).map((b) => b.dataset.value);

const list = document.getElementById('games');
const cards = [...list.querySelectorAll(':scope > li')].map((li) => ({
    li,
    search: li.dataset.search,
    players: li.dataset.players.split(' ').filter(Boolean).map(Number),
    online: li.dataset.online === '1',
    genres: li.dataset.genres.split('|').filter(Boolean),
    // 時間は「短い 長い」、難しさは 1〜5。書いていないゲームは空
    minutes: li.dataset.minutes ? li.dataset.minutes.split(' ').map(Number) : null,
    weight: li.dataset.weight ? Number(li.dataset.weight) : null
}));

let state = parseState(location.search, genres);

let sorted = null;
const render = () => {
    // 並べる順が変わったときだけ、カードを並べ直す
    if (sorted !== state.sort) {
        sorted = state.sort;
        list.append(...sortGames(cards, state.sort).map((card) => card.li));
    }
    let shown = 0;
    for (const card of cards) {
        const hit = matches(card, state);
        card.li.hidden = !hit;
        if (hit) shown++;
    }
    for (const chip of chips) {
        const { key, value } = chip.dataset;
        // ジャンルは選んだものすべてを押した見た目にし、1つも選んでいなければ「すべて」を押した見た目にする
        const pressed = key === 'genre'
            ? (value === '' ? state.genres.length === 0 : state.genres.includes(value))
            : String(state[key] ?? '') === value;
        chip.setAttribute('aria-pressed', String(pressed));
    }
    if (input.value !== state.q) input.value = state.q;
    // 閉じていても、選んでいる条件があれば数と「解除」を出す（隠れた条件で本数が減って見えるのを防ぐ）
    const active = activeFilterCount(state);
    toggle.setAttribute('aria-expanded', String(state.open));
    toggle.classList.toggle('active', active > 0);
    toggleCount.textContent = active > 0 ? `（${active}）` : '';
    groups.hidden = !state.open;
    clear.hidden = active === 0;
    const filtered = !isEmptyState(state);
    count.textContent = filtered ? `${cards.length} 本中 ${shown} 本` : `全 ${cards.length} 本`;
    document.querySelectorAll('[data-reset]').forEach((b) => { b.disabled = !filtered; });
    empty.hidden = shown > 0;
};

const update = (next) => {
    state = { ...state, ...next };
    history.replaceState(null, '', `${location.pathname}${stateToSearch(state)}${location.hash}`);
    render();
};

input.addEventListener('input', () => update({ q: input.value }));
// 送信してもページを読み直さない（スマホのキーボードの「検索」で閉じるだけ）
input.form.addEventListener('submit', (event) => { event.preventDefault(); input.blur(); });

for (const chip of chips) {
    chip.addEventListener('click', () => {
        const { key, value } = chip.dataset;
        if (key === 'genre') update({ genres: value === '' ? [] : toggleGenre(state.genres, value, genres) });
        else update({ [key]: value === '' ? null : key === 'players' ? Number(value) : value });
    });
}

toggle.addEventListener('click', () => update({ open: !state.open }));
clear.addEventListener('click', () => update(clearFilters(state)));

// 「条件をクリア」は検索の文字も含めてすべて外す（欄の開け閉めは残す）
document.querySelectorAll('[data-reset]').forEach((button) => {
    button.addEventListener('click', () => update({ ...EMPTY_STATE, open: state.open }));
});

panel.hidden = false;
render();
