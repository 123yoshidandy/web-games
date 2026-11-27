/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController, { CPU_STEP_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { GOODS, GOOD_NAMES, ROLE_NAMES, ROLE_TEXT, BUILDINGS, buildingOf, CITY_SPACES } from './data.js';
import { barrel, coin, vpIcon, colonistIcon, roleIcon, titleArt, describeEvent, GOOD_COLORS, TILE_NAMES, TILE_SHORT } from './art.js';
import { arrangeColonists } from './cpu-player.js';
import { createSeed } from './random.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';

const GAME = 'puerto-rico';

// 自分の操作の音（役割を選ぶ・入植・市長・建てる・監督・商人・船長・倉庫）。見送りは select
const COMMAND_SOUND = { role: 'place', settle: 'place', hacienda: 'draw', mayor: 'place', build: 'pay', privilege: 'gain', sell: 'gain', ship: 'gain', store: 'place' };

const $ = id => document.getElementById(id);
const KEYS = { settings: 'puertorico.settings.v1', save: 'puertorico.save.v1' };
const CPU_NAMES = ['カルロス', 'イサベル', 'ディエゴ', 'ルシア'];
// 確かめるときだけ、URL の ?cpuDelay=ミリ秒 で CPU の間隔を縮められる
const CPU_DELAY = Number(new URLSearchParams(location.search).get('cpuDelay')) || undefined;
const SUMMARY_MS = 3200;

const store = {
    load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* 同上 */ } }
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let settings = { count: 3, level: 'normal', ...store.load(KEYS.settings) };
let scene = 'title';
let controller = null;
let view = null;
let ui = freshUi();
let seenSeq = 0;
let resultShown = false;
let sending = false; // 自分の操作を送っている間（その音は送った側で鳴らす）

// オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
const online = new NetplayLobby({
    title: 'プエルトリコ',
    game: 'puerto-rico',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: CPU_STEP_DELAY_MS,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: [{ key: 'cpuLevel', label: 'CPU の強さ', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }] }],
    onStart: (next) => beginGame(next),
    onUpdate: () => onUpdate(),
    onError: (message) => onError(message),
    onExit: () => {
        controller = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        showScene('title');
    }
});
let summaryTimer = null;

// ヒント：おすすめの手 { key, command }（その場面の間だけ）
let hint = null;
const HINT_BUTTON = '<button type="button" id="hint" class="chip hint-button" data-act="hint" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>ヒント</button>';

// おすすめの手を、選んだ状態にして光らせる
function showHint() {
    if (!mine() || !controller) return;
    const c = controller.suggest();
    if (!c) return;
    if (c.type === 'role') ui.role = c.role;
    if (c.type === 'mayor') ui.mayor = { island: [...c.island], city: [...c.city] };
    if (c.type === 'build') ui.building = c.building;
    if (c.type === 'store') ui.store = { warehouse: [...(c.warehouse ?? [])], single: c.single ?? null };
    hint = { key: ui.key, command: c };
    music.play('select');
    render();
}

function renderHint() {
    const c = hint?.key === ui.key && mine() ? hint.command : null;
    if (!c) {
        hint = null;
        return;
    }
    let target = null;
    if (c.type === 'role') target = '[data-act="role"]';
    if (c.type === 'hacienda') target = '[data-act="hacienda"]';
    if (c.type === 'settle') target = c.take === null ? '[data-act="settlePass"]' : `[data-take="${c.take}"]`;
    if (c.type === 'mayor') target = '[data-act="mayor"]';
    if (c.type === 'build') target = c.building ? '[data-act="build"]' : '[data-act="buildPass"]';
    if (c.type === 'privilege') target = `[data-good="${c.good}"]`;
    if (c.type === 'sell') target = c.good ? `[data-sell="${c.good}"]` : '[data-act="sellPass"]';
    if (c.type === 'ship') target = c.pass ? '[data-act="shipPass"]' : `[data-load="${view.decision.options.findIndex(o => o.good === c.good && o.ship === c.ship)}"]`;
    if (c.type === 'store') target = '[data-act="store"]';
    if (target) $('panel').querySelector(target)?.classList.add('suggested');
}

function freshUi(key = null) {
    return { key, role: null, building: null, mayor: null, store: { warehouse: [], single: null } };
}

const nameOf = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);
const me = () => view.players[view.seat];
const mine = kind => view?.decision && view.decision.seat === view.seat && (!kind || view.decision.kind === kind);
const capacity = key => buildingOf(key).capacity;

// ---------- 画面の切り替え ----------

function showScene(name) {
    scene = name;
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    if (name === 'title') renderTitle();
}

function renderTitle() {
    document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === settings.count)));
    document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === settings.level)));
    $('resume').hidden = !store.load(KEYS.save);
    $('online-button').hidden = !online.available;
}

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed() }, level: settings.level };
}

function startGame(setup) {
    let next;
    try {
        next = new LocalGameController({ ...setup, cpuDelay: CPU_DELAY }, { onUpdate, onError });
    } catch (error) {
        console.warn(error);
        store.remove(KEYS.save);
        next = new LocalGameController({ ...newSetup(), cpuDelay: CPU_DELAY }, { onUpdate, onError });
    }
    beginGame(next);
}

// ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(next) {
    if (controller !== next) controller?.stop();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    resultShown = false;
    controller = next;
    view = controller.getView();
    seenSeq = view.eventSeq;
    ui = freshUi();
    showScene('game');
    render();
    saveProgress();
}

function saveProgress() {
    if (!controller || controller.isOnline) return; // 途中経過を保存するのはローカル対戦だけ
    if (controller.game.isOver()) store.remove(KEYS.save);
    else store.save(KEYS.save, controller.saveData());
}

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (controller?.isOnline) return online.confirmLeave();
    controller?.stop();
    controller = null;
    showScene('title');
}

function onUpdate() {
    if (!controller) return;
    const previous = view;
    view = controller.getView();
    saveProgress();
    render();
    playUpdateSound(previous);
}

// ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
// id はシードから作る（同じ対戦を2回数えない）。1台で人が交代する対戦（人が2人以上）は送らない
function recordLocalResult() {
    if (!controller || controller.isOnline || controller.game.players.filter(p => !p.isCPU).length !== 1) return;
    recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(view.winners ?? [], view.seat, view.players.length) });
}

// 1回の更新に1つの音。CPU の手は知らせ、自分の番になったらチャイム、終わったら勝ち負け
function playUpdateSound(previous) {
    if (!previous) return;
    if (view.phase === 'end') {
        const winners = view.winners ?? [];
        if (previous.phase !== 'end') {
            music.play(!winners.includes(view.seat) ? 'lose' : winners.length > 1 ? 'notify' : 'win');
            recordLocalResult();
        }
        return;
    }
    if (sending) return;
    const wasMine = previous.decision && previous.decision.seat === previous.seat;
    music.play(mine() && !wasMine ? 'turn' : 'notify');
}

function onError(message) {
    music.play('error');
    const feed = $('panel').querySelector('.feed');
    if (feed) feed.innerHTML = `<span class="error">${esc(message)}</span>`;
}

function send(command) {
    if (!controller) return;
    sending = true;
    const ok = controller.send(command);
    sending = false;
    const passed = command.take === null || command.building === null || command.good === null || command.pass;
    if (ok && view.phase !== 'end') music.play(passed ? 'select' : COMMAND_SOUND[command.type] ?? 'place');
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const key = JSON.stringify([view.eventSeq, view.decision]);
    if (ui.key !== key) {
        const keepMayor = ui.mayor && mine('mayor');
        ui = { ...freshUi(key), mayor: keepMayor ? ui.mayor : null };
    }
    if (mine('mayor') && !ui.mayor) {
        const p = me();
        ui.mayor = { island: p.island.map(t => t.occupied), city: p.city.map(c => c.colonists) };
    }
    renderStatus();
    renderOpponents();
    renderBoard();
    renderMine();
    renderPanel();
    renderBuildDialog();
    checkSummary();
    if (view.phase === 'end' && !resultShown) {
        resultShown = true;
        setTimeout(showResult, 800);
    }
}

function renderStatus() {
    const d = view.decision;
    const phase = view.phase === 'end' ? '終了' : view.roleKey ? ROLE_NAMES[view.roleKey] : '役割を選ぶ';
    const who = d ? (d.seat === view.seat ? 'あなたの番' : `${nameOf(d.seat)}の番`) : '';
    $('status').innerHTML = `R${view.round}・${phase}<small>${esc(who)}</small>`;
    $('supply').innerHTML = `<span title="入植者の補充の山">${colonistIcon()}${view.colonists}</span><span title="勝利点チップの残り">${vpIcon}${Math.max(0, view.chips)}</span>`;
}

const goodsHtml = goods => GOODS.filter(g => goods[g] > 0).map(g => `<span class="gd">${barrel(g, 14)}${goods[g]}</span>`).join('') || '<span class="muted">品なし</span>';

function renderOpponents() {
    $('opponents').innerHTML = view.players.filter(p => p.id !== view.seat).map(p => {
        const turn = view.decision?.seat === p.id;
        const roles = view.roles.filter(r => r.taken === p.id).map(r => roleIcon(r.key)).join('');
        return `<button class="opp ${turn ? 'turn' : ''}" data-seat="${p.id}">
            <span class="opp-name">${p.id === view.governor ? '<span class="gov" title="総督">総</span>' : ''}${esc(p.name)}<span class="opp-roles">${roles}</span></span>
            <span class="opp-stats"><span>${vpIcon}${p.chips}</span><span>${coin}${p.money}</span><span title="島">島${p.island.length}</span><span title="都市">都${p.citySpaces}</span><span title="品">${barrel('sugar', 12)}${GOODS.reduce((s, g) => s + p.goods[g], 0)}</span></span>
        </button>`;
    }).join('');
}

function tileHtml(type, { occupied = false, cls = '', data = '' } = {}) {
    return `<button class="tile t-${type} ${occupied ? 'occ' : ''} ${cls}" ${data} style="--g:${GOOD_COLORS[type]}" title="${TILE_NAMES[type]}">
        <span class="tile-name">${TILE_SHORT[type]}</span>${occupied ? colonistIcon('on') : ''}</button>`;
}

function renderBoard() {
    const roles = view.roles.map(r => `<span class="role-chip ${r.taken !== null ? 'taken' : ''} ${view.roleKey === r.key && r.taken !== null ? 'active' : ''}" title="${ROLE_NAMES[r.key]}">${roleIcon(r.key)}${r.money ? `<b>${r.money}</b>` : ''}</span>`).join('');
    const ships = view.ships.map((s, i) => `<span class="ship" title="船${i + 1}（${s.size}）"><span class="ship-no">${i + 1}</span>${Array.from({ length: s.size }, (_, k) => `<i class="${k < s.count ? 'full' : ''}" style="--g:${s.good ? GOOD_COLORS[s.good] : 'transparent'}"></i>`).join('')}</span>`).join('');
    const house = Array.from({ length: 4 }, (_, i) => (view.tradingHouse[i] ? barrel(view.tradingHouse[i], 15) : '<i class="slot"></i>')).join('');
    $('board').innerHTML = `<div class="board-row roles-row">${roles}</div>
        <div class="board-row"><span class="ships">${ships}</span><span class="house" title="商館">${house}</span><span class="cship" title="入植者の船">${colonistIcon()}${view.shipColonists}</span></div>`;
}

function renderMine() {
    const p = me();
    const m = ui.mayor;
    const islandOcc = i => (m ? m.island[i] : p.island[i].occupied);
    const cityCol = i => (m ? m.city[i] : p.city[i].colonists);
    const roles = view.roles.filter(r => r.taken === view.seat).map(r => roleIcon(r.key)).join('');
    const placed = m ? m.island.filter(Boolean).length + m.city.reduce((s, v) => s + v, 0) : 0;
    const sanJuan = m ? view.decision.total - placed : p.sanJuan;
    $('my-summary').innerHTML = `<span class="ms-name">${view.seat === view.governor ? '<span class="gov">総</span>' : ''}あなた${roles}</span><span>${vpIcon}${p.chips}</span><span>${coin}${p.money}</span><span title="サンフアン（置いていない入植者）">${colonistIcon()}${sanJuan}</span><span class="ms-goods">${goodsHtml(p.goods)}</span>`;
    const tiles = p.island.map((t, i) => tileHtml(t.type, { occupied: islandOcc(i), data: `data-island="${i}"`, cls: m ? 'pickable' : '' }));
    for (let i = p.island.length; i < 12; i++) tiles.push('<span class="tile empty"></span>');
    $('island').innerHTML = tiles.join('');
    $('city').innerHTML = cityHtml(p, cityCol, !!m);
}

function cityHtml(p, cityCol = i => p.city[i].colonists, pickable = false) {
    const parts = p.city.map((c, i) => {
        const b = buildingOf(c.key);
        const col = cityCol(i);
        const dots = Array.from({ length: b.capacity }, (_, k) => `<i class="${k < col ? 'on' : ''}"></i>`).join('');
        return `<button class="bld k-${b.kind} ${b.size === 2 ? 'wide' : ''} ${pickable ? 'pickable' : ''}" data-city="${i}" style="--g:${b.good ? GOOD_COLORS[b.good] : 'transparent'}">
            <span class="bld-name">${esc(b.name)}</span><span class="bld-dots">${dots}</span></button>`;
    });
    const used = p.city.reduce((s, c) => s + buildingOf(c.key).size, 0);
    for (let i = used; i < CITY_SPACES; i++) parts.push('<span class="bld empty"></span>');
    return parts.join('');
}

// ---------- 判断の欄 ----------

function feedLine() {
    const last = [...view.events].reverse().map(e => describeEvent(e, view)).find(Boolean) ?? '';
    return `<div class="feed">${esc(last)}</div>`;
}

function renderPanel() {
    const d = view.decision;
    let body;
    if (view.phase === 'end') body = '<div class="prompt">ゲーム終了</div><div class="btn-row"><button class="primary" data-act="result">結果</button></div>';
    else if (!mine()) body = `<div class="prompt muted">${d ? `${esc(nameOf(d.seat))}が${{ role: '役割を選んでいます', settle: '農園を選んでいます', mayor: '入植者を並べています', build: '建物を選んでいます', privilege: '品を選んでいます', sell: '売る品を選んでいます', ship: '船に積んでいます', store: 'とっておく品を選んでいます' }[d.kind]}` : ''}</div>`;
    else body = ({ role: roleHtml, settle: settleHtml, mayor: mayorHtml, build: buildHtml, privilege: privilegeHtml, sell: sellHtml, ship: shipHtml, store: storeHtml })[d.kind]();
    // ヒントのボタン（自分が選ぶ番だけ。案内文の右端）
    // ヒントはローカル対戦だけ
    if (mine() && view.phase !== 'end' && !controller?.isOnline) body = body.replace('<div class="prompt">', `<div class="prompt">${HINT_BUTTON}`);
    $('panel').innerHTML = feedLine() + body;
    renderHint();
}

function roleHtml() {
    const free = view.roles.filter(r => r.taken === null);
    const sel = ui.role !== null ? view.roles[ui.role] : null;
    return `<div class="prompt">役割を選ぶ</div>
        <div class="role-grid">${free.map(r => `<button class="role-btn ${ui.role === r.id ? 'selected' : ''}" data-role="${r.id}">${roleIcon(r.key)}<span>${ROLE_NAMES[r.key]}</span>${r.money ? `<b class="money">${coin}${r.money}</b>` : ''}</button>`).join('')}</div>
        <div class="hint">${sel ? `<b>${ROLE_NAMES[sel.key]}</b>：${ROLE_TEXT[sel.key]}` : '役割を押すと説明が出ます'}</div>
        <div class="btn-row"><button class="primary" data-act="role" ${sel ? '' : 'disabled'}>決定</button></div>`;
}

function settleHtml() {
    const d = view.decision;
    const full = me().island.length >= 12;
    const tiles = full ? '' : view.faceUp.map((t, i) => tileHtml(t, { data: `data-take="${i}"`, cls: 'choice' })).join('');
    return `<div class="prompt">開拓者：島に置く農園を選ぶ${view.roleSeat === view.seat ? '（特権：石切り場も選べる）' : ''}</div>
        <div class="tile-row">${tiles}${d.canQuarry && !full ? tileHtml('quarry', { data: 'data-take="quarry"', cls: 'choice' }) : ''}</div>
        <div class="btn-row">${d.canHacienda ? '<button class="secondary" data-act="hacienda">アシエンダ（山から1枚）</button>' : ''}<button class="tertiary" data-act="settlePass">取らない</button></div>`;
}

function mayorLeft() {
    const m = ui.mayor;
    return view.decision.total - m.island.filter(Boolean).length - m.city.reduce((s, v) => s + v, 0);
}

function mayorValid() {
    const p = me();
    const m = ui.mayor;
    const left = mayorLeft();
    if (left < 0) return false;
    const full = m.island.every(Boolean) && m.city.every((v, i) => v === capacity(p.city[i].key));
    return left === 0 || full;
}

function mayorHtml() {
    const left = mayorLeft();
    return `<div class="prompt">市長：島の農園と都市の建物を押して、入植者を置く（残り ${left} 人）</div>
        <div class="hint">空いたマスがあるうちは、サンフアンに残せません</div>
        <div class="btn-row"><button class="secondary" data-act="mayorAuto">おまかせ</button><button class="tertiary" data-act="mayorClear">全部外す</button><button class="primary" data-act="mayor" ${mayorValid() ? '' : 'disabled'}>決定</button></div>`;
}

function buildHtml() {
    const sel = ui.building ? buildingOf(ui.building) : null;
    return `<div class="prompt">建築家：建物を1つ建てられる${view.roleSeat === view.seat ? '（特権：1安い）' : ''}　${coin}${me().money}</div>
        ${sel ? `<div class="hint"><b>${esc(sel.name)}</b>（${view.options.costs[ui.building]}ドゥブロン）</div>` : ''}
        <div class="btn-row"><button class="secondary" data-act="openBuild">建物を見る</button><button class="primary" data-act="build" ${sel ? '' : 'disabled'}>建てる</button><button class="tertiary" data-act="buildPass">建てない</button></div>`;
}

function privilegeHtml() {
    return `<div class="prompt">監督の特権：もう1つ取る品を選ぶ</div>
        <div class="good-row">${view.decision.goods.map(g => `<button class="good-btn" data-good="${g}">${barrel(g, 20)}${GOOD_NAMES[g]}</button>`).join('')}</div>`;
}

function sellHtml() {
    const o = view.options;
    return `<div class="prompt">商人：商館に品を1つ売れる</div>
        <div class="good-row">${o.sellable.map(g => `<button class="good-btn" data-sell="${g}">${barrel(g, 20)}${GOOD_NAMES[g]}<b>${coin}${o.prices[g]}</b></button>`).join('')}</div>
        <div class="btn-row"><button class="tertiary" data-act="sellPass">売らない</button></div>`;
}

function shipHtml() {
    const d = view.decision;
    const p = me();
    const amount = o => (o.ship === 'wharf' ? p.goods[o.good] : Math.min(p.goods[o.good], view.ships[o.ship].size - view.ships[o.ship].count));
    return `<div class="prompt">船長：品を船に積む${d.mustShip ? '（積めるので、必ず積む）' : ''}</div>
        <div class="ship-options">${d.options.map((o, i) => `<button class="ship-btn" data-load="${i}">${barrel(o.good, 18)}${GOOD_NAMES[o.good]} → ${o.ship === 'wharf' ? '波止場' : `船${o.ship + 1}`}<b>${amount(o)}つ・+${amount(o)}点</b></button>`).join('')}</div>
        ${d.mustShip ? '' : '<div class="btn-row"><button class="tertiary" data-act="shipPass">積まない</button></div>'}`;
}

function storeHtml() {
    const d = view.decision;
    const p = me();
    const s = ui.store;
    const rows = d.kinds.map(g => `<div class="store-row">${barrel(g, 18)}<span>${GOOD_NAMES[g]} ${p.goods[g]}</span>
        ${d.slots ? `<button class="chip ${s.warehouse.includes(g) ? 'on' : ''}" data-wh="${g}">倉庫（全部）</button>` : ''}
        <button class="chip ${s.single === g ? 'on' : ''}" data-single="${g}">1つ残す</button></div>`).join('');
    return `<div class="prompt">とっておく品を選ぶ（1つ${d.slots ? `と、倉庫に${d.slots}種類` : ''}）。残りは腐ります</div>
        <div class="store-list">${rows}</div>
        <div class="btn-row"><button class="primary" data-act="store">決定</button></div>`;
}

// ---------- 建物の一覧 ----------

function renderBuildDialog() {
    const dialog = $('build-dialog');
    if (!dialog.open) return;
    const can = mine('build') ? new Set(view.options.buildable) : new Set();
    const costs = mine('build') ? view.options.costs : null;
    const p = me();
    $('build-title').textContent = mine('build') ? `建物を建てる（${p.money}ドゥブロン）` : '建物の一覧';
    $('build-list').innerHTML = [1, 2, 3, 4].map(col => `<h3>${col}列目（石切り場 ${col} まで）</h3>` + BUILDINGS.filter(b => b.column === col).map(b => {
        const left = view.buildings[b.key];
        const owned = p.city.some(c => c.key === b.key);
        const cost = costs ? costs[b.key] : b.cost;
        const text = b.kind === 'production' ? `${GOOD_NAMES[b.good]}を作る（入植者${b.capacity}人まで）` : b.text;
        return `<button class="build-item k-${b.kind} ${can.has(b.key) ? '' : 'dim'} ${ui.building === b.key ? 'selected' : ''}" data-build="${b.key}" style="--g:${b.good ? GOOD_COLORS[b.good] : 'transparent'}">
            <span class="bi-head"><b>${esc(b.name)}</b><span class="bi-cost">${coin}${cost}${costs && cost !== b.cost ? `<s>${b.cost}</s>` : ''}</span><span>${vpIcon}${b.vp}</span><span class="muted">残り${left}${owned ? '・持っている' : ''}</span></span>
            <span class="bi-text">${esc(text)}</span></button>`;
    }).join('')).join('');
}

// ---------- 役割ごとに何が起きたか ----------

function checkSummary() {
    const fresh = view.events.filter(e => e.seq > seenSeq);
    seenSeq = view.eventSeq;
    const end = [...fresh].reverse().find(e => e.type === 'roleEnd');
    if (!end) return;
    const start = [...view.events].reverse().find(e => e.type === 'role' && e.seq < end.seq);
    const lines = view.events.filter(e => e.seq > (start?.seq ?? 0) && e.seq < end.seq).map(e => describeEvent(e, view)).filter(Boolean);
    $('summary-title').innerHTML = `${roleIcon(end.role)}${esc(nameOf(end.seat))}の${ROLE_NAMES[end.role]}`;
    $('summary-body').innerHTML = (lines.length ? lines : ['何も起きなかった']).map(l => `<li>${esc(l)}</li>`).join('');
    if ($('build-dialog').open) $('build-dialog').close();
    openDialog('summary-dialog');
    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => { if ($('summary-dialog').open) $('summary-dialog').close(); }, SUMMARY_MS);
}

// ---------- ダイアログ ----------

function openDialog(id) {
    const dialog = $(id);
    if (dialog.open) return;
    controller?.pause();
    dialog.showModal();
}

function setupDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', e => {
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
        });
    });
    $('help-content').innerHTML = helpMarkup();
}

function showInfo(title, html) {
    $('info-title').textContent = title;
    $('info-body').innerHTML = html;
    openDialog('info-dialog');
}

function showBuilding(key) {
    const b = buildingOf(key);
    const text = b.kind === 'production' ? `${GOOD_NAMES[b.good]}を作る。入植者${b.capacity}人まで（入植者のいる${GOOD_NAMES[b.good]}の農園の数まで作れる）` : b.text;
    showInfo(b.name, `<p>${coin}${b.cost}・${vpIcon}${b.vp}・${b.size === 2 ? '大きい建物（2マス）' : `${b.column}列目`}</p><p>${esc(text)}</p><p class="muted">${esc(b.en)}</p>`);
}

function showPlayer(seat) {
    const p = view.players[seat];
    const tiles = p.island.map(t => tileHtml(t.type, { occupied: t.occupied })).join('') + Array.from({ length: 12 - p.island.length }, () => '<span class="tile empty"></span>').join('');
    showInfo(`${nameOf(seat)}の島と都市`, `<p class="info-stats">${vpIcon}${p.chips}　${coin}${p.money}　サンフアン${colonistIcon()}${p.sanJuan}</p><p>${goodsHtml(p.goods)}</p>
        <div class="island">${tiles}</div><div class="city info-city">${cityHtml(p)}</div>`);
}

function openLog() {
    const lines = view.events.map(e => describeEvent(e, view)).filter(Boolean);
    $('log-list').innerHTML = lines.map(l => `<li>${esc(l)}</li>`).join('');
    openDialog('log-dialog');
    const body = $('log-dialog').querySelector('.dialog-body');
    body.scrollTop = body.scrollHeight;
}

function showResult() {
    if (!view || view.phase !== 'end' || scene !== 'game') return;
    const winners = view.winners ?? [];
    $('result-title').textContent = winners.includes(view.seat) ? (winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${winners.map(nameOf).join('・')}の勝ち`;
    const ranked = [...view.players].sort((a, b) => b.score.total - a.score.total || b.score.tiebreak - a.score.tiebreak);
    $('result-body').innerHTML = `<table class="score-table"><thead><tr><th></th><th>チップ</th><th>建物</th><th>大きい建物</th><th>合計</th></tr></thead><tbody>
        ${ranked.map(p => `<tr class="${p.id === view.seat ? 'me' : ''}"><td>${esc(nameOf(p.id))}</td><td>${p.score.chips}</td><td>${p.score.buildings}</td><td>${p.score.bonus}</td><td><b>${p.score.total}</b></td></tr>`).join('')}
    </tbody></table><p class="muted">同点のときは、お金と品の合計が多い人の勝ち</p>`;
    openDialog('result-dialog');
}

// ---------- 操作 ----------

function onMayorIsland(i) {
    const m = ui.mayor;
    if (m.island[i]) m.island[i] = false;
    else if (mayorLeft() > 0) m.island[i] = true;
    music.play('select');
    render();
}

function onMayorCity(i) {
    const m = ui.mayor;
    const cap = capacity(me().city[i].key);
    if (m.city[i] < cap && mayorLeft() > 0) m.city[i]++;
    else m.city[i] = 0;
    music.play('select');
    render();
}

function onAct(act) {
    const d = view.decision;
    switch (act) {
        case 'hint': return showHint();
        case 'role': return send({ type: 'role', role: ui.role });
        case 'hacienda': return send({ type: 'hacienda' });
        case 'settlePass': return send({ type: 'settle', take: null });
        case 'mayorAuto': {
            const c = arrangeColonists(me(), d.total);
            ui.mayor = { island: c.island, city: c.city };
            music.play('select');
            return render();
        }
        case 'mayorClear': ui.mayor = { island: me().island.map(() => false), city: me().city.map(() => 0) }; music.play('cancel'); return render();
        case 'mayor': return send({ type: 'mayor', island: ui.mayor.island, city: ui.mayor.city });
        case 'openBuild': openDialog('build-dialog'); return renderBuildDialog();
        case 'build': return send({ type: 'build', building: ui.building });
        case 'buildPass': return send({ type: 'build', building: null });
        case 'sellPass': return send({ type: 'sell', good: null });
        case 'shipPass': return send({ type: 'ship', pass: true });
        case 'store': return send({ type: 'store', warehouse: ui.store.warehouse, single: ui.store.single });
        case 'result': return showResult();
        default: return null;
    }
}

function setup() {
    $('title-art').innerHTML = titleArt();
    setupDialogs();
    const segment = (id, apply) => $(id).addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        apply(b.dataset);
        store.save(KEYS.settings, settings);
        renderTitle();
    });
    segment('player-count', d => { settings.count = Number(d.count); });
    segment('cpu-level', d => { settings.level = d.level; });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('resume').addEventListener('click', () => startGame(store.load(KEYS.save) ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('open-log').addEventListener('click', openLog);
    $('home').addEventListener('click', goHome);
    $('opponents').addEventListener('click', e => { const b = e.target.closest('[data-seat]'); if (b) showPlayer(Number(b.dataset.seat)); });
    $('my-summary').addEventListener('click', () => showPlayer(view.seat));
    $('board').addEventListener('click', () => { openDialog('build-dialog'); renderBuildDialog(); });
    $('island').addEventListener('click', e => {
        const b = e.target.closest('[data-island]');
        if (b && ui.mayor) onMayorIsland(Number(b.dataset.island));
    });
    $('city').addEventListener('click', e => {
        const b = e.target.closest('[data-city]');
        if (!b) return;
        if (ui.mayor) onMayorCity(Number(b.dataset.city));
        else showBuilding(me().city[Number(b.dataset.city)].key);
    });
    $('panel').addEventListener('click', e => {
        const t = e.target;
        const role = t.closest('[data-role]');
        if (role) { ui.role = Number(role.dataset.role); music.play('select'); return render(); }
        const take = t.closest('[data-take]');
        if (take) return send({ type: 'settle', take: take.dataset.take === 'quarry' ? 'quarry' : Number(take.dataset.take) });
        const good = t.closest('[data-good]');
        if (good) return send({ type: 'privilege', good: good.dataset.good });
        const sell = t.closest('[data-sell]');
        if (sell) return send({ type: 'sell', good: sell.dataset.sell });
        const load = t.closest('[data-load]');
        if (load) { const o = view.decision.options[Number(load.dataset.load)]; return send({ type: 'ship', good: o.good, ship: o.ship }); }
        const wh = t.closest('[data-wh]');
        if (wh) {
            const g = wh.dataset.wh;
            const s = ui.store;
            s.warehouse = s.warehouse.includes(g) ? s.warehouse.filter(x => x !== g) : s.warehouse.length < view.decision.slots ? [...s.warehouse, g] : s.warehouse;
            if (s.single === g) s.single = null;
            music.play('select');
            return render();
        }
        const single = t.closest('[data-single]');
        if (single) {
            const g = single.dataset.single;
            ui.store.single = ui.store.single === g ? null : g;
            ui.store.warehouse = ui.store.warehouse.filter(x => x !== g);
            music.play('select');
            return render();
        }
        const act = t.closest('[data-act]')?.dataset.act;
        if (act) onAct(act);
    });
    $('build-list').addEventListener('click', e => {
        const b = e.target.closest('[data-build]');
        if (!b) return;
        if (mine('build') && view.options.buildable.includes(b.dataset.build)) {
            ui.building = b.dataset.build;
            $('build-dialog').close();
            music.play('select');
            render();
        } else showBuilding(b.dataset.build);
    });
    // オンラインは、ロビーを出し、ホストの「もう一度」で再戦する
    $('again').addEventListener('click', () => { $('result-dialog').close(); if (controller?.isOnline) online.rematch(); else startGame(newSetup()); });
    $('result-home').addEventListener('click', () => { $('result-dialog').close(); if (controller?.isOnline) online.leave(); else goHome(); });
    $('online-button').addEventListener('click', () => online.open());

    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });

    showScene('title');
    online.boot(); // 招待の URL（?room=）から入る、または前の部屋に戻る
    registerServiceWorker();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, startGame, send, online };
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(registration => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map(r => r.name)];
        const post = worker => worker?.postMessage({ type: 'cache-urls', urls });
        if (registration.active) post(registration.active);
        else navigator.serviceWorker.ready.then(r => post(r.active));
    }).catch(() => {});
}

setup();
