// 入口のページのログイン（名前だけ）と「自分の記録」。ボタンとダイアログは build-site.mjs が HTML に書き出す
// 右上：ログイン前は「ログイン」（押すと名前の入力のダイアログ）、ログイン後は「記録」と「ログアウト」（幅があれば名前も）
// user-stats.js は netplay-kit の画面側の部品の写し（build-site.mjs が _site/portal/ に置く）。ログインの名前はロビーと同じ
import { currentUser, login, logout, fetchStats, flushResults, pendingResults, resolveStatsUrl } from './user-stats.js';
import { cardBadgeText, statsHtml } from './stats-view.js';

const $ = (id) => document.getElementById(id);
const account = $('account');
const loginOpen = $('login-open');
const loginDialog = $('login-dialog');
const form = $('login-form');
const nameInput = $('login-name');
const userBox = $('account-user');
const note = $('account-note');
const dialog = $('stats-dialog');
const body = $('stats-body');

const cards = [...document.querySelectorAll('#games > li[data-game]')];
const names = Object.fromEntries(cards.map((li) => [li.dataset.game, li.querySelector('.name')?.textContent ?? li.dataset.game]));

let record = null;

const renderCards = () => {
    for (const li of cards) {
        const badge = li.querySelector('.mine');
        const text = cardBadgeText(record?.games?.[li.dataset.game]);
        badge.textContent = text;
        badge.hidden = !text;
    }
};

const renderAccount = () => {
    const user = currentUser();
    loginOpen.hidden = Boolean(user);
    userBox.hidden = !user;
    $('account-name').textContent = user ? `${user} さん` : '';
    $('account-name').title = user;
    const pending = pendingResults().length;
    const messages = [];
    if (user && !resolveStatsUrl()) messages.push('記録のサーバーがまだ用意されていません');
    if (user && pending > 0) messages.push(`送れていない結果が ${pending} 件あります（つながったら送ります）`);
    note.textContent = messages.join('。');
    note.hidden = messages.length === 0;
    if (dialog.open) body.innerHTML = record ? statsHtml(record, names) : '<p class="stats-empty">記録を読み込めませんでした</p>';
};

const refresh = async () => {
    const user = currentUser();
    if (!user) {
        record = null;
    } else {
        await flushResults();
        record = await fetchStats(user);
    }
    renderCards();
    renderAccount();
};

loginOpen.addEventListener('click', () => {
    nameInput.value = '';
    loginDialog.showModal();
    nameInput.focus();
});
$('login-cancel').addEventListener('click', () => loginDialog.close());
loginDialog.addEventListener('click', (event) => { if (event.target === loginDialog) loginDialog.close(); });

form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!login(nameInput.value)) {
        nameInput.focus();
        return;
    }
    nameInput.value = '';
    loginDialog.close();
    refresh();
});

$('logout').addEventListener('click', () => {
    logout();
    refresh();
});

$('stats-open').addEventListener('click', () => {
    body.innerHTML = '<p class="stats-empty">読み込み中…</p>';
    dialog.showModal();
    refresh();
});
$('stats-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

// ほかのタブ（ゲーム）で名前を変えた・結果がたまったときと、ページに戻ってきたときに読み直す
window.addEventListener('storage', (event) => { if (event.key?.startsWith('netplay.')) refresh(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
window.addEventListener('online', () => refresh());

account.hidden = false;
renderAccount();
refresh();
