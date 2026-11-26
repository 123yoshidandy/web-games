// 入口のページの検索・絞り込みの画面。カードとボタンは build-site.mjs が HTML に書き出し、ここでは表示を切り替える
import { EMPTY_STATE, parseState, stateToSearch, isEmptyState, matches } from './filter.js';

const panel = document.getElementById('filters');
const input = document.getElementById('q');
const count = document.getElementById('count');
const empty = document.getElementById('empty');
const chips = [...panel.querySelectorAll('button[data-key]')];
const genres = [...new Set(chips.filter((b) => b.dataset.key === 'genre').map((b) => b.dataset.value))];

const cards = [...document.querySelectorAll('#games > li')].map((li) => ({
    li,
    search: li.dataset.search,
    players: li.dataset.players.split(' ').filter(Boolean).map(Number),
    online: li.dataset.online === '1',
    genres: li.dataset.genres.split('|').filter(Boolean)
}));

let state = parseState(location.search, genres);

const render = () => {
    let shown = 0;
    for (const card of cards) {
        const hit = matches(card, state);
        card.li.hidden = !hit;
        if (hit) shown++;
    }
    for (const chip of chips) {
        const value = state[chip.dataset.key];
        chip.setAttribute('aria-pressed', String(String(value ?? '') === chip.dataset.value));
    }
    if (input.value !== state.q) input.value = state.q;
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
        update({ [key]: value === '' ? null : key === 'players' ? Number(value) : value });
    });
}

document.querySelectorAll('[data-reset]').forEach((button) => {
    button.addEventListener('click', () => update({ ...EMPTY_STATE }));
});

panel.hidden = false;
render();
