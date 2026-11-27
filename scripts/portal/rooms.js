// 入口のページの「いま立っている部屋」：全ゲームの、ロビーで人を待っている部屋を並べ、押すとそのゲームの部屋に入る
// 欄は build-site.mjs が HTML に書き出す。部屋がなければ欄ごと隠す。ページが見えているあいだだけ、決まった間で読み直す
import { fetchOpenRooms } from './user-stats.js';
import { roomsHtml } from './rooms-view.js';

const REFRESH_MS = 10000;

const section = document.getElementById('rooms');
const list = document.getElementById('rooms-list');
const names = Object.fromEntries([...document.querySelectorAll('#games > li[data-game]')]
    .map((li) => [li.dataset.game, li.querySelector('.name')?.textContent ?? li.dataset.game]));

let timer = null;
let loading = false;

const refresh = async () => {
    if (loading) return;
    loading = true;
    try {
        const html = roomsHtml(await fetchOpenRooms(), names, location.search);
        // 読めなかった（null）ときも、部屋がないときも、欄を隠す
        if (list.innerHTML !== html) list.innerHTML = html;
        section.hidden = html === '';
    } finally {
        loading = false;
    }
};

const schedule = () => {
    clearInterval(timer);
    timer = null;
    if (document.visibilityState !== 'visible') return;
    refresh();
    timer = setInterval(refresh, REFRESH_MS);
};

document.addEventListener('visibilitychange', schedule);
window.addEventListener('online', schedule);
schedule();
