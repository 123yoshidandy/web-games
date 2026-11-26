/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る
 */

import LocalGameController from './game-controller.js';
import { DOMINOES, DIRS, KINGDOM_SIZE, TERRAIN_NAMES, BONUS, dominoCells, MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { measureBefore, playAfter } from './motion.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const CPU_NAMES = ['エドガー', 'マティルダ', 'オスカー'];
const HUMAN_NAME = 'あなた';
export const PLAYER_COLORS = ['#e0559a', '#2f6fd0', '#e8862a', '#7e57c2'];

const $ = selector => document.querySelector(selector);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    place: { dir: 0, anchor: null, key: null }, // 置く向きと、置く場所（1つ目のマスの座標）
    hint: null, // ヒントで示している手 { count, command }（その手番の間だけ）
    settings: { count: 2, level: 'normal', rules: { middleKingdom: false, harmony: false }, ...storage.load('settings', {}) }
};

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// ===== 部品 =====

function crownsHtml(n) {
    if (!n) return '';
    return `<span class="crowns">${'<svg class="crown"><use href="#crown"/></svg>'.repeat(n)}</span>`;
}

function tileHtml(terrain, crowns = 0, seat = null) {
    const color = terrain === 'castle' && seat !== null ? ` style="color:${PLAYER_COLORS[seat]}"` : '';
    return `<span class="tile"${color}><svg class="art"><use href="#t-${terrain}"/></svg>${crownsHtml(crowns)}</span>`;
}

function kingHtml(king) {
    return `<span class="king" data-king="${king.id}" style="--pc:${PLAYER_COLORS[king.seat]}"><svg><use href="#crown-plain"/></svg></span>`;
}

// ドミノ（向き dir の形で並べる）
function dominoHtml(id, dir = 0) {
    const [a, b] = DOMINOES[id].halves;
    const vertical = dir % 2 === 1;
    const first = dir < 2;
    const halves = first ? [a, b] : [b, a];
    return `<span class="domino${vertical ? ' vertical' : ''}">${halves.map(h => tileHtml(h.terrain, h.crowns)).join('')}</span>`;
}

const boundsOf = cells => {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const { x, y } of cells) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX, maxX, minY, maxY };
};

// 王国を描く範囲。open：まだ置ける範囲（最大 9×9）、そうでなければ 5×5
function kingdomWindow(cells, open) {
    const b = boundsOf(cells);
    if (open) return { x0: b.maxX - KINGDOM_SIZE + 1, x1: b.minX + KINGDOM_SIZE - 1, y0: b.maxY - KINGDOM_SIZE + 1, y1: b.minY + KINGDOM_SIZE - 1 };
    const x0 = b.minX - Math.floor((KINGDOM_SIZE - 1 - (b.maxX - b.minX)) / 2);
    const y0 = b.minY - Math.floor((KINGDOM_SIZE - 1 - (b.maxY - b.minY)) / 2);
    return { x0, x1: x0 + KINGDOM_SIZE - 1, y0, y1: y0 + KINGDOM_SIZE - 1 };
}

// 王国の格子。extra：{ 'x,y': クラス名 }、ghost：{ 'x,y': { terrain, crowns } }
function kingdomHtml(player, { open = false, extra = {}, ghost = {} } = {}) {
    const win = kingdomWindow(player.cells, open);
    const byKey = Object.fromEntries(player.cells.map(c => [`${c.x},${c.y}`, c]));
    const cols = win.x1 - win.x0 + 1;
    const rows = win.y1 - win.y0 + 1;
    let html = '';
    for (let y = win.y0; y <= win.y1; y++) {
        for (let x = win.x0; x <= win.x1; x++) {
            const key = `${x},${y}`;
            const cell = byKey[key];
            const cls = extra[key] ? ` ${extra[key]}` : '';
            if (cell) {
                html += `<span class="cell filled${cls}" data-x="${x}" data-y="${y}">${tileHtml(cell.terrain, cell.crowns, player.seat)}</span>`;
            } else if (ghost[key]) {
                html += `<span class="cell ghost${cls}" data-x="${x}" data-y="${y}">${tileHtml(ghost[key].terrain, ghost[key].crowns)}</span>`;
            } else {
                html += `<span class="cell empty${cls}" data-x="${x}" data-y="${y}"></span>`;
            }
        }
    }
    return { html, cols, rows };
}

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#title-screen').hidden = scene !== 'title';
    $('#game-screen').hidden = scene !== 'game';
    if (scene === 'title') renderTitle();
}

function renderTitle() {
    for (const b of document.querySelectorAll('#count-select button')) b.classList.toggle('on', Number(b.dataset.value) === app.settings.count);
    for (const b of document.querySelectorAll('#level-select button')) b.classList.toggle('on', b.dataset.value === app.settings.level);
    for (const b of document.querySelectorAll('#rule-select button')) b.classList.toggle('on', !!app.settings.rules[b.dataset.rule]);
    $('#resume-button').hidden = !LocalGameController.loadSaved();
    $('#online-button').hidden = !online.available;
}

function newSetup() {
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    for (let i = 1; i < app.settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, level: app.settings.level, rules: { ...app.settings.rules } };
}

function startGame(setup) {
    beginGame(new LocalGameController(setup, {
        onUpdate: () => update(),
        onError: () => {
            music.play('error');
            update();
        }
    }));
}

// ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(controller) {
    if (app.controller !== controller) app.controller?.stop();
    app.view = null;
    app.hint = null;
    app.place = { dir: 0, anchor: null, key: null };
    if ($('#result-dialog').open) $('#result-dialog').close();
    app.controller = controller;
    showScene('game');
    update();
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

const online = new NetplayLobby({
    title: 'キングドミノ',
    game: 'kingdomino',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: 700,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: [
        { key: 'middleKingdom', label: '中王国', options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] },
        { key: 'harmony', label: '調和', options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] }
    ],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: (message) => {
        music.play('error');
        update();
    },
    onExit: () => {
        app.controller = null;
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        showScene('title');
    }
});
app.online = online;

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (app.controller?.isOnline) return online.confirmLeave();
    app.controller?.stop();
    app.controller = null;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const previous = app.view;
    const view = app.controller.getView();
    const moved = previous && view.commandCount === previous.commandCount + 1 ? view.lastMove : null;
    const before = measureBefore(moved);
    app.view = view;
    playSound(view, previous, moved);
    render(view);
    playAfter(moved, before, view.viewer);
    if (view.phase === 'end' && previous && previous.phase !== 'end') setTimeout(showResult, 1200);
}

const myTurn = view => view.phase !== 'end' && view.currentSeat === view.viewer;

// 1つの更新に1つの音。自分の手は取る・置く・捨てる、ほかの人の手は notify、自分の番になったら turn
function playSound(view, previous, moved) {
    if (!previous) return;
    if (view.phase === 'end') {
        if (previous.phase !== 'end') music.play(view.result?.winners.includes(view.viewer) ? 'win' : 'lose');
        return;
    }
    if (!moved) return;
    if (moved.seat === view.viewer) return music.play({ pick: 'draw', place: 'place', discard: 'pay' }[moved.type] ?? 'place');
    music.play(myTurn(view) && !myTurn(previous) ? 'turn' : 'notify');
}

function render(view) {
    fitLayout(view);
    // 置く番が変わったら、向きと場所を戻す
    const placeKey = view.step === 'place' && myTurn(view) ? `${view.commandCount}` : null;
    if (placeKey !== app.place.key) app.place = { dir: app.place.dir, anchor: null, key: placeKey };

    // 全部のラウンド数 = 今のラウンド + 次の並び + 山に残る並び
    const rounds = view.round + (view.next ? 1 : 0) + view.deckCount / view.kings.length;
    $('#round-label').textContent = view.phase === 'end' ? '終了' : `ラウンド ${view.round}/${rounds}`;
    $('#result-button').hidden = view.phase !== 'end';
    $('#hint').hidden = Boolean(app.controller?.isOnline); // ヒントはローカル対戦だけ
    $('#hint').disabled = !myTurn(view);
    if (app.hint && app.hint.count !== view.commandCount) app.hint = null;
    if ($('#log-dialog').open) renderLog(view);
    renderOpponents(view);
    renderLines(view);
    renderMine(view);
}

function renderOpponents(view) {
    $('#opponents').innerHTML = view.players.filter(p => p.seat !== view.viewer).map(player => {
        const turn = view.phase !== 'end' && view.currentSeat === player.seat;
        const { html } = kingdomHtml(player);
        return `<button type="button" class="opp${turn ? ' turn' : ''}" data-seat="${player.seat}" style="--pc:${PLAYER_COLORS[player.seat]}" aria-label="${escapeHtml(player.name)}の王国">
            <span class="opp-head"><span class="pname">${escapeHtml(player.name)}</span><span class="pscore">${player.score.total}</span></span>
            <span class="mini">${html}</span>
        </button>`;
    }).join('');
}

function renderLines(view) {
    const kings = view.kings;
    const pickable = myTurn(view) && view.step === 'pick' ? view.pickFrom : null;
    const row = (name, label, slots, size) => {
        const cards = [];
        for (let i = 0; i < size; i++) {
            const slot = slots?.[i];
            if (!slot || slot.done) {
                cards.push('<span class="card blank"></span>');
                continue;
            }
            const active = name === 'current' && view.activeIndex === i && view.phase === 'play';
            const live = pickable === name && slot.king === null;
            const suggested = live && hinted('pick')?.index === i;
            cards.push(`<button type="button" class="card${active ? ' active' : ''}${live ? ' live' : ''}${suggested ? ' suggested' : ''}" data-line="${name}" data-index="${i}" data-domino="${slot.domino}">
                ${dominoHtml(slot.domino)}<span class="num">${slot.domino}</span>${slot.king !== null ? kingHtml(kings[slot.king]) : ''}
            </button>`);
        }
        return `<div class="line-row"><span class="row-label">${label}</span><div class="cards">${cards.join('')}</div></div>`;
    };
    const size = view.kings.length;
    $('#lines').innerHTML = row('current', '今', view.current, size) + row('next', '次', view.next, size);
}

function renderMine(view) {
    const me = view.players[view.viewer];
    const placing = myTurn(view) && view.step === 'place';
    const myKings = view.kings.filter(k => k.seat === view.viewer).map(kingHtml).join('');
    $('#my-head').innerHTML = `<span class="pname">${myKings}${escapeHtml(me.name)}</span><span class="pscore">${me.score.total}<small>点</small></span>`;
    $('#mine').classList.toggle('turn', myTurn(view));

    const extra = {};
    const ghost = {};
    if (placing) {
        const domino = DOMINOES[view.activeDomino];
        // 今の向きで置ける場所がなければ、置ける向きへ回しておく（光るマスが1つもない状態を作らない）
        if (!app.place.anchor && !view.placements.some(p => p.dir === app.place.dir)) {
            const found = [1, 2, 3].map(i => (app.place.dir + i) % 4).find(d => view.placements.some(p => p.dir === d));
            if (found !== undefined) app.place.dir = found;
        }
        const { anchor, dir } = app.place;
        if (anchor) {
            dominoCells(anchor.x, anchor.y, dir).forEach(([x, y], i) => { ghost[`${x},${y}`] = domino.halves[i]; });
        } else {
            for (const p of view.placements) {
                if (p.dir !== dir) continue;
                for (const [x, y] of dominoCells(p.x, p.y, p.dir)) extra[`${x},${y}`] = 'cand';
            }
        }
    }
    const { html, cols, rows } = kingdomHtml(me, { open: view.phase !== 'end', extra, ghost });
    const kingdom = $('#kingdom');
    kingdom.style.setProperty('--cols', cols);
    kingdom.style.setProperty('--rows', rows);
    // 台の枠線（2px×2）と内側の余白（5px×2）を引いて、マスの大きさを決める
    kingdom.style.setProperty('--k', `calc((var(--box) - 14px - ${Math.max(cols, rows) - 1} * var(--kgap)) / ${Math.max(cols, rows)})`);
    kingdom.classList.toggle('placing', placing);
    kingdom.innerHTML = html;

    let controls = '';
    if (placing) {
        if (view.placements.length === 0) {
            controls = `<span class="note">置ける場所がありません</span>
                <button type="button" class="btn btn-danger${hinted('discard') ? ' suggested' : ''}" data-action="discard">捨てる</button>`;
        } else {
            controls = `<span class="preview">${dominoHtml(view.activeDomino, app.place.dir)}</span>
                <button type="button" class="icon-btn rotate" data-action="rotate" aria-label="回転" title="回転">
                    <svg class="line-icon" viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>
                </button>
                <button type="button" class="btn btn-primary${placeHinted() ? ' suggested' : ''}" data-action="place"${app.place.anchor ? '' : ' disabled'}>置く</button>`;
        }
    }
    $('#controls').innerHTML = controls;
}

// ===== ヒント・履歴 =====

// ヒントで示している手のうち、種類が合うもの
const hinted = type => (app.hint?.count === app.view?.commandCount && app.hint.command.type === type ? app.hint.command : null);

// 選んでいる置き方が、ヒントの置き方と同じか
function placeHinted() {
    const c = hinted('place');
    return !!c && app.place.anchor?.x === c.x && app.place.anchor?.y === c.y && app.place.dir === c.dir;
}

// おすすめの手を示す。置く番なら、その場所と向きを選んでおく（「置く」を押せば置ける）
function showHint() {
    const view = app.view;
    if (!view || !app.controller || app.controller.isOnline || !myTurn(view)) return;
    const command = app.controller.suggest();
    if (!command) return;
    music.play('select');
    app.hint = { count: view.commandCount, command };
    if (command.type === 'place') {
        app.place.anchor = { x: command.x, y: command.y };
        app.place.dir = command.dir;
    }
    render(view);
}

function renderLog(view) {
    $('#log').innerHTML = view.logs.length
        ? view.logs.map(line => `<li>${escapeHtml(line)}</li>`).reverse().join('')
        : '<li class="empty">まだ何も起きていません</li>';
}

// ===== 大きさ =====

function fitLayout(view) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const landscape = width > height && width >= 600;
    document.body.classList.toggle('landscape', landscape);
    const root = document.documentElement.style;
    const lineSize = view.kings.length;
    const opponents = view.players.length - 1;
    const TOP = 44;
    const HEAD = 26;
    const CONTROLS = 54;
    if (!landscape) {
        const w = Math.min(width, 560) - 16;
        const m = opponents >= 3 ? 10 : 11;
        const oppH = 5 * m + 4 * 1 + 30;
        const d = Math.min(26, (w - 26 - (lineSize - 1) * 6 - lineSize * 10) / (2 * lineSize));
        const linesH = 2 * (d + 12) + 6;
        // すき間（並びと王国の間・王国と操作の間など）と下の余白の合計
        const box = Math.min(w - 8, 440, height - TOP - oppH - linesH - HEAD - CONTROLS - 38);
        root.setProperty('--m', `${m}px`);
        root.setProperty('--d', `${Math.floor(d)}px`);
        root.setProperty('--box', `${Math.floor(box)}px`);
    } else {
        const box = Math.min(height - TOP - HEAD - CONTROLS - 30, width * 0.5, 470);
        const leftW = Math.min(width - box - 48, 640);
        const m = height < 420 ? 9 : height < 640 ? 11 : 16;
        const d = Math.min(46, (leftW - 26 - (lineSize - 1) * 6 - lineSize * 10) / (2 * lineSize));
        root.setProperty('--m', `${m}px`);
        root.setProperty('--d', `${Math.floor(d)}px`);
        root.setProperty('--box', `${Math.floor(box)}px`);
    }
}

// ===== 入力 =====

function setPlace(anchor, dir) {
    app.place.anchor = anchor;
    app.place.dir = dir;
    render(app.view);
}

function rotate() {
    const view = app.view;
    music.play('select');
    const { anchor, dir } = app.place;
    if (anchor) {
        for (let i = 1; i <= 4; i++) {
            const d = (dir + i) % 4;
            if (view.placements.some(p => p.x === anchor.x && p.y === anchor.y && p.dir === d)) {
                setPlace(anchor, d);
                return;
            }
        }
    }
    setPlace(null, (dir + 1) % 4);
}

// 王国のマスを押した：そのマスを含む置き方を選ぶ
function tapCell(x, y) {
    const view = app.view;
    music.play('select');
    const { anchor, dir } = app.place;
    if (anchor) {
        const ghostCells = dominoCells(anchor.x, anchor.y, dir);
        if (ghostCells.some(([gx, gy]) => gx === x && gy === y)) {
            rotate();
            return;
        }
    }
    const list = view.placements;
    // 1. 今の向きで、押したマスを1つ目にする
    if (list.some(p => p.x === x && p.y === y && p.dir === dir)) return setPlace({ x, y }, dir);
    // 2. 押したマスを1つ目にできる向き（今の向きから順に）
    for (let i = 1; i < 4; i++) {
        const d = (dir + i) % 4;
        if (list.some(p => p.x === x && p.y === y && p.dir === d)) return setPlace({ x, y }, d);
    }
    // 3. 押したマスが2つ目になる置き方
    const second = list.find(p => p.x + DIRS[p.dir][0] === x && p.y + DIRS[p.dir][1] === y);
    if (second) setPlace({ x: second.x, y: second.y }, second.dir);
}

function onPlayClick(event) {
    const view = app.view;
    if (!view || !app.controller) return;
    const opp = event.target.closest('.opp');
    if (opp) {
        openBoard(Number(opp.dataset.seat));
        return;
    }
    if (!myTurn(view)) return;
    const card = event.target.closest('.card.live');
    if (card) {
        app.controller.send({ type: 'pick', index: Number(card.dataset.index) });
        return;
    }
    if (view.step !== 'place') return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'rotate') return rotate();
    if (action === 'place' && app.place.anchor) {
        const { anchor, dir } = app.place;
        app.controller.send({ type: 'place', x: anchor.x, y: anchor.y, dir });
        return;
    }
    if (action === 'discard') {
        app.controller.send({ type: 'discard' });
        return;
    }
    const cell = event.target.closest('#kingdom .cell');
    if (cell && !cell.classList.contains('filled')) tapCell(Number(cell.dataset.x), Number(cell.dataset.y));
}

function openBoard(seat) {
    const player = app.view.players[seat];
    const { html } = kingdomHtml(player);
    $('#board-dialog-body').innerHTML = `
        <div class="board-title" style="--pc:${PLAYER_COLORS[seat]}"><span class="pname">${escapeHtml(player.name)}</span><span class="pscore">${player.score.total}<small>点</small></span></div>
        <div class="big-kingdom">${html}</div>
        ${scoreLines(player.score)}`;
    openDialog($('#board-dialog'));
}

// 領域ごとの得点（点になる領域だけ）
function scoreLines(score) {
    const items = score.properties.filter(p => p.points > 0).sort((a, b) => b.points - a.points)
        .map(p => `<li><span>${TERRAIN_NAMES[p.terrain]}</span><span>${p.size}マス × ${p.crowns}</span><b>${p.points}</b></li>`);
    if (score.middle) items.push(`<li><span>中王国</span><span></span><b>${score.middle}</b></li>`);
    if (score.harmony) items.push(`<li><span>調和</span><span></span><b>${score.harmony}</b></li>`);
    return items.length ? `<ul class="score-lines">${items.join('')}</ul>` : '';
}

function openDialog(dialog) {
    app.controller?.pause();
    dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume();
}

// ===== 結果 =====

function showResult() {
    const view = app.view;
    if (!view?.result || app.scene !== 'game') return;
    const { standings, winners } = view.result;
    const names = winners.map(seat => view.players[seat].name);
    let title;
    if (winners.length > 1) title = `${names.join('と')}が同点で勝ち`;
    else if (winners[0] === view.viewer) title = 'あなたの勝ち';
    else title = `${names[0]}の勝ち`;
    // 同点を決まりで分けたときは、その理由を添える
    const tied = standings.length > 1 && standings[0].total === standings[1].total && winners.length === 1;
    let note = '';
    if (tied) note = standings[0].largest !== standings[1].largest ? '同点のため、最大の領域で決着' : '同点のため、王冠の数で決着';
    $('#result-title').textContent = title;
    $('#result-body').innerHTML = `${note ? `<p class="result-note">${note}</p>` : ''}<ol class="standings">${standings.map(entry => {
        const player = view.players[entry.seat];
        const bonus = [entry.middle ? `中王国 +${BONUS.middleKingdom}` : '', entry.harmony ? `調和 +${BONUS.harmony}` : ''].filter(Boolean);
        const detail = [`最大の領域 ${entry.largest}マス`, `王冠 ${entry.crowns}`, ...bonus].join('・');
        return `<li class="${entry.seat === view.viewer ? 'me' : ''}">
            <span class="rank">${entry.rank}</span>
            <span class="who"><span class="pname">${escapeHtml(player.name)}</span><span class="detail">${detail}</span></span>
            <span class="total">${entry.total}</span>
        </li>`;
    }).join('')}</ol>`;
    openDialog($('#result-dialog'));
}

// ===== タイトルの絵・遊び方の図 =====

function sampleHtml(rows, seat = 0) {
    const L = { C: 'castle', W: 'wheat', F: 'forest', L: 'lake', G: 'grass', S: 'swamp', M: 'mine' };
    return rows.map(row => row.split(' ').map(t => t === '.'
        ? '<span class="cell empty"></span>'
        : `<span class="cell filled">${tileHtml(L[t[0]], Number(t.slice(1) || 0), seat)}</span>`).join('')).join('');
}

function renderStaticArt() {
    $('#title-art').innerHTML = `<div class="sample" style="--cols:5">${sampleHtml([
        'F F1 L L1 L',
        'F W C L G',
        'W1 W W G G1',
        'S W M2 M G',
        'S1 S W W W'
    ])}</div>`;
    $('#help-art').innerHTML = `<div class="sample small" style="--cols:3">${sampleHtml([
        'F1 F .',
        'W C L',
        'W1 . L'
    ])}</div>`;
}

// ===== 初期化 =====

function init() {
    renderStaticArt();
    $('#count-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.count = Number(button.dataset.value);
        storage.save('settings', app.settings);
        renderTitle();
    });
    $('#level-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.level = button.dataset.value;
        storage.save('settings', app.settings);
        renderTitle();
    });
    $('#rule-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        const rule = button.dataset.rule;
        app.settings.rules = { ...app.settings.rules, [rule]: !app.settings.rules[rule] };
        storage.save('settings', app.settings);
        renderTitle();
    });
    $('#start-button').addEventListener('click', () => startGame(newSetup()));
    $('#online-button').addEventListener('click', () => online.open());
    $('#resume-button').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#play').addEventListener('click', onPlayClick);

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'home') goHome();
        if (action === 'help') openDialog($('#help-dialog'));
        if (action === 'hint') showHint();
        if (action === 'log' && app.view) {
            renderLog(app.view);
            openDialog($('#log-dialog'));
        }
        if (action === 'close-log') $('#log-dialog').close();
        if (action === 'close-help') $('#help-dialog').close();
        if (action === 'result') showResult();
        if (action === 'close-result') $('#result-dialog').close();
        if (action === 'rematch' && app.controller?.isOnline) {
            $('#result-dialog').close();
            online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            return;
        }
        if (action === 'rematch') {
            const setup = app.controller?.setup;
            $('#result-dialog').close();
            startGame(setup ? { players: setup.players, level: setup.level, rules: setup.rules } : newSetup());
        }
    });
    for (const dialog of document.querySelectorAll('dialog')) {
        dialog.addEventListener('close', onDialogClose);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
    }

    document.addEventListener('contextmenu', event => {
        if (!event.target.closest('input, textarea')) event.preventDefault();
    });
    document.addEventListener('gesturestart', event => event.preventDefault());
    window.addEventListener('resize', () => {
        if (app.view && app.scene === 'game') render(app.view);
    });

    showScene('title');
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').then(registration => {
            const worker = registration.active || registration.waiting || registration.installing;
            const urls = performance.getEntriesByType('resource').map(entry => entry.name).concat(location.href);
            const send = target => target?.postMessage({ type: 'cache-urls', urls });
            if (worker?.state === 'activated') send(worker);
            else navigator.serviceWorker.ready.then(ready => send(ready.active));
        }).catch(() => {});
    }

    // 確認用（画面の確認スクリプトから状態を作る）
    window.__kd = app;
    window.__app = app;
}

init();
