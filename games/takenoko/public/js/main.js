/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る
 */

import LocalGameController, { CPU_STEP_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import BoardView, { TILE_COLORS, improvementIcon } from './board.js';
import {
    CARDS, SHAPES, COLOR_NAMES, IMPROVEMENTS, IMPROVEMENT_NAMES, CARD_TYPES, CARD_TYPE_NAMES, WEATHER_NAMES,
    ACTIONS, ACTION_NAMES, OBJECTIVES_TO_END, EMPEROR_POINTS
} from './data.js';
import { rotations } from './game.js';
import { progressOf } from './progress.js';
import * as storage from './storage.js';
import { music } from './music.js';

const CPU_NAMES = ['ハル', 'ミオ', 'ソラ'];
const HUMAN_NAME = 'あなた';
const BAMBOO = { green: '#3f8f2f', yellow: '#c99a12', pink: '#d0507a' };

const $ = selector => document.querySelector(selector);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    board: null,
    mode: null,        // 'irrigation' | 'gardener' | 'panda' | 'objective'
    plotChoice: 0,     // 引いた区画のどれを置くか
    cloudKind: null,   // 雲で置く改良
    moveFrom: null,    // 雲で動かす改良の区画
    autoEnd: null,
    hint: null,        // ヒントのおすすめの手（画面だけ。記録には入れない）
    settings: { count: 2, level: 'normal', ...storage.load('settings', {}) }
};

// オンライン対戦（入口とロビーは netplay-lobby.js の画面）
const online = new NetplayLobby({
    title: 'タケノコ',
    game: 'takenoko',
    serverUrl: getServerUrl(),
    cpuStepDelayMs: CPU_STEP_DELAY_MS,
    minPlayers: 2,
    maxPlayers: 4,
    settings: [],
    onStart: (controller) => beginGame(controller),
    onUpdate: () => update(),
    onError: () => {
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

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// ===== 部品 =====

// 盤面の情報を、progress.js が使える形にする（ビューから）
function boardLike(view) {
    const byKey = Object.fromEntries(view.tiles.map(t => [`${t.q},${t.r}`, t]));
    return {
        players: view.players.map(p => ({ eaten: p.eaten })),
        plots: () => view.tiles.filter(t => t.color !== 'pond'),
        tileAt: (q, r) => byKey[`${q},${r}`],
        isIrrigated: (q, r) => !!byKey[`${q},${r}`]?.irrigated
    };
}

// 区画の目標の形（小さな六角形）
function shapeSvg(card, size = 7) {
    const cells = rotations(SHAPES[card.shape])[0];
    const pts = cells.map(([q, r]) => [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r]);
    const minX = Math.min(...pts.map(p => p[0])) - size;
    const maxX = Math.max(...pts.map(p => p[0])) + size;
    const minY = Math.min(...pts.map(p => p[1])) - size;
    const maxY = Math.max(...pts.map(p => p[1])) + size;
    const hex = (x, y) => Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * (60 * i - 30);
        return `${(x + (size - 0.6) * Math.cos(a)).toFixed(1)},${(y + (size - 0.6) * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    const body = pts.map(([x, y], i) => `<polygon points="${hex(x, y)}" fill="${TILE_COLORS[card.colors[i]]}" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>`).join('');
    return `<svg class="shape" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}">${body}</svg>`;
}

function bambooIcon(color, n, w = 6) {
    let html = `<svg class="bamboo-icon" viewBox="0 0 ${w + 2} ${n * 5 + 2}" width="${w + 2}" height="${n * 5 + 2}">`;
    for (let i = 0; i < n; i++) html += `<rect x="1" y="${1 + i * 5}" width="${w}" height="4.4" rx="1" fill="${BAMBOO[color]}"/>`;
    return `${html}</svg>`;
}

function cardBody(card) {
    if (card.type === 'plot') return shapeSvg(card);
    if (card.type === 'gardener') {
        const imp = IMPROVEMENTS.includes(card.improvement)
            ? `<svg class="imp-icon" viewBox="-10 -10 20 20">${improvementIcon(card.improvement, 0, 0, 1)}</svg>`
            : card.improvement === 'none' ? '<span class="no-imp">改良なし</span>' : `<span class="count">×${card.count}</span>`;
        return `<span class="gbody">${bambooIcon(card.color, card.height)}${imp}</span>`;
    }
    return `<span class="pbody">${['green', 'yellow', 'pink'].filter(c => card.need[c]).map(c => bambooIcon(c, card.need[c], 7)).join('')}</span>`;
}

function cardHtml(view, seat, id, { completable = false, small = false } = {}) {
    const card = CARDS[id];
    const prog = view ? progressOf(boardLike(view), seat, id) : null;
    const bar = prog ? `<span class="prog"><span style="width:${Math.round(prog.ratio * 100)}%"></span></span><span class="prog-text">${prog.text}</span>` : '';
    return `<button type="button" class="obj ${card.type}${completable ? ' ready' : ''}${small ? ' small' : ''}" data-card="${id}"
        title="${CARD_TYPE_NAMES[card.type]}の目標 ${card.points}点">
        <span class="obj-head"><span class="obj-type">${CARD_TYPE_NAMES[card.type]}</span><span class="obj-pts">${card.points}</span></span>
        <span class="obj-body">${cardBody(card)}</span>${bar}
    </button>`;
}

const eatenHtml = eaten => ['green', 'yellow', 'pink'].map(c => `<span class="eaten" title="${COLOR_NAMES[c]}の竹">${bambooIcon(c, 1, 7)}${eaten[c]}</span>`).join('');

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
    $('#resume-button').hidden = !LocalGameController.loadSaved();
    $('#online-button').hidden = !online.available;
}

function newSetup() {
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    for (let i = 1; i < app.settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, level: app.settings.level };
}

function startGame(setup) {
    beginGame(new LocalGameController(setup, { onUpdate: () => update(), onError: () => {
        music.play('error');
        update();
    } }));
}

// ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(controller) {
    if (app.controller !== controller) app.controller?.stop();
    app.view = null;
    resetModes();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    app.controller = controller;
    $('#hint').hidden = Boolean(controller.isOnline); // ヒントはローカル対戦だけ
    showScene('game');
    app.board.userMoved = false;
    app.board.tileCount = 0;
    update();
}

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (app.controller?.isOnline) return online.confirmLeave();
    app.controller?.stop();
    app.controller = null;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

function resetModes() {
    app.mode = null;
    app.plotChoice = 0;
    app.cloudKind = null;
    app.moveFrom = null;
    app.hint = null;
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const previous = app.view;
    const view = app.controller.getView();
    if (previous && view.commandCount !== previous.commandCount) resetModes();
    app.view = view;
    if (previous && view.commandCount !== previous.commandCount) playSound(view, previous);
    render(view);
    scheduleAutoEnd(view);
    if (view.phase === 'end' && previous && previous.phase !== 'end') setTimeout(showResult, 1200);
}

const myTurn = view => view.phase === 'play' && view.current === view.viewer;

// 進んだ1手から効果音を1つ鳴らす。自分の手はその音、自分の番に戻ったら turn、終わりは勝ち負け
// CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
const MOVE_SOUNDS = {
    complete: 'gain', placePlot: 'place', irrigate: 'place', improve: 'place', gardener: 'place',
    rain: 'place', storm: 'place', weather: 'select', drawPlots: 'draw', drawObjective: 'draw', skip: 'cancel'
};
function playSound(view, previous) {
    if (view.phase === 'end') return music.play(view.result?.winners.includes(view.viewer) ? 'win' : 'lose');
    const move = view.lastMove;
    if (move?.seat === view.viewer) {
        // パンダ（嵐で動かしたときも）が竹を食べたら、竹を得る
        if (move.eaten) return music.play('gain');
        if (move.type === 'panda') return music.play('place');
        if (MOVE_SOUNDS[move.type]) return music.play(MOVE_SOUNDS[move.type]);
    }
    if (myTurn(view) && !myTurn(previous)) music.play('turn');
}

function render(view) {
    renderTurnInfo(view);
    renderOpponents(view);
    renderBoard(view);
    renderMe(view);
    renderActionbar(view);
    $('#result-button').hidden = view.phase !== 'end';
}

function renderTurnInfo(view) {
    const w = view.turn.weather;
    const weather = w ? `<span class="weather" title="${WEATHER_NAMES[w]}"><svg><use href="#w-${w}"/></svg>${WEATHER_NAMES[w]}</span>` : '';
    let text;
    if (view.phase === 'end') text = '終了';
    else if (myTurn(view)) text = `あなたの番・行動 ${view.turn.actions.length}/${view.turn.max}`;
    else text = `${escapeHtml(view.players[view.current].name)}の番`;
    const last = view.finalRound && view.phase === 'play' ? '<span class="last">最後の1巡</span>' : '';
    $('#turn-info').innerHTML = `${weather}<span>${text}</span>${last}`;
}

function renderOpponents(view) {
    $('#opponents').innerHTML = view.players.filter(p => p.seat !== view.viewer).map(p => {
        const turn = view.phase === 'play' && view.current === p.seat;
        const backs = p.handTypes.map(t => `<i class="back ${t}"></i>`).join('');
        return `<button type="button" class="opp${turn ? ' turn' : ''}" data-seat="${p.seat}">
            <span class="opp-name">${escapeHtml(p.name)}${p.emperor ? '<span class="emp">皇帝</span>' : ''}</span>
            <span class="opp-score">${p.score.total}<small>点</small></span>
            <span class="opp-done">★${p.done.length}</span>
            <span class="backs">${backs}</span>
        </button>`;
    }).join('');
}

function boardMarks(view) {
    const marks = { hexes: [], edges: [], spots: [], fresh: [] };
    const o = view.options;
    const lm = view.lastMove;
    if (lm?.to) marks.fresh.push(lm.to);
    if (lm?.at) marks.fresh.push(lm.at);
    if (!myTurn(view) || !o) return marks;
    const pending = view.turn.pending;
    if (pending === 'rain') marks.hexes = o.rain;
    else if (pending === 'storm') marks.hexes = view.tiles.filter(t => t.color !== 'pond').map(t => [t.q, t.r]);
    else if (pending === 'clouds') {
        if (app.cloudKind) marks.hexes = o.improvable;
        else if (app.moveFrom) marks.hexes = o.improvable;
        else if (IMPROVEMENTS.every(i => view.tokens[i] === 0)) marks.hexes = view.tiles.filter(t => t.improvement && !t.fixed).map(t => [t.q, t.r]);
    } else if (view.turn.drawn) marks.spots = o.plotSpots;
    else if (app.mode === 'irrigation') marks.edges = o.irrigationSpots;
    else if (app.mode === 'gardener') marks.hexes = o.gardener;
    else if (app.mode === 'panda') marks.hexes = o.panda;
    const h = app.hint;
    if (h?.type === 'irrigate') marks.best = { edge: [h.a, h.b] };
    else if (h && h.q !== undefined) marks.best = { hex: [h.q, h.r] };
    return marks;
}

function renderBoard(view) {
    const marks = boardMarks(view);
    app.board.render(view, marks);
    let hint = '';
    if (myTurn(view)) {
        const pending = view.turn.pending;
        if (pending === 'rain') hint = '雨：竹を伸ばす区画を選ぶ';
        else if (pending === 'storm') hint = '嵐：パンダを動かす区画を選ぶ';
        else if (pending === 'clouds') hint = app.cloudKind || app.moveFrom ? '改良を置く区画を選ぶ' : IMPROVEMENTS.every(i => view.tokens[i] === 0) ? '動かす改良を選ぶ' : '雲：置く改良を選ぶ';
        else if (view.turn.drawn) hint = '区画を置く場所を選ぶ';
        else if (app.mode === 'irrigation') hint = '水路を置く境目を選ぶ';
        else if (app.mode === 'gardener') hint = '庭師の行き先を選ぶ';
        else if (app.mode === 'panda') hint = 'パンダの行き先を選ぶ';
    }
    $('#guide').hidden = !hint;
    $('#guide').textContent = hint;
}

function renderMe(view) {
    const me = view.players[view.viewer];
    const ready = view.options?.completable ?? [];
    const cards = me.hand.map(id => cardHtml(view, view.viewer, id, { completable: ready.includes(id) })).join('');
    const empty = Array.from({ length: 5 - me.hand.length }, () => '<span class="obj empty"></span>').join('');
    $('#me').innerHTML = `<div class="me-head">
            <span class="pname">${escapeHtml(me.name)}${me.emperor ? '<span class="emp">皇帝</span>' : ''}</span>
            <span class="me-eaten">${eatenHtml(me.eaten)}</span>
            <button type="button" class="me-done" data-seat="${me.seat}">★${me.done.length}/${OBJECTIVES_TO_END[view.players.length]}</button>
            <span class="me-score">${me.score.total}<small>点</small></span>
        </div>
        <div class="hand">${cards}${empty}</div>`;
    $('#me').classList.toggle('turn', myTurn(view));
}

function actionButton(view, action) {
    const used = view.turn.actions.includes(action);
    const ok = view.options.actions.includes(action);
    const on = app.mode === action;
    return `<button type="button" class="act${used ? ' used' : ''}${on ? ' on' : ''}" data-act="${action}"${ok ? '' : ' disabled'}>
        <svg><use href="#a-${action}"/></svg><span>${ACTION_NAMES[action]}</span></button>`;
}

function renderActionbar(view) {
    let html = '';
    if (myTurn(view) && view.options) {
        const pending = view.turn.pending;
        if (pending === 'choice') {
            html = ['sun', 'rain', 'wind', 'storm', 'clouds'].map(w => `<button type="button" class="act" data-weather="${w}"><svg><use href="#w-${w}"/></svg><span>${WEATHER_NAMES[w]}</span></button>`).join('');
        } else if (pending === 'rain' || pending === 'storm') {
            html = '<button type="button" class="btn btn-ghost" data-action="skip">使わない</button>';
        } else if (pending === 'clouds') {
            if (IMPROVEMENTS.some(i => view.tokens[i] > 0)) {
                html = IMPROVEMENTS.map(i => `<button type="button" class="act${app.cloudKind === i ? ' on' : ''}" data-improvement="${i}"${view.tokens[i] ? '' : ' disabled'}>
                    <svg viewBox="-10 -10 20 20">${improvementIcon(i, 0, 0, 1)}</svg><span>${IMPROVEMENT_NAMES[i]} ${view.tokens[i]}</span></button>`).join('');
            }
            html += '<button type="button" class="btn btn-ghost" data-action="skip">使わない</button>';
        } else if (view.turn.drawn) {
            html = view.turn.drawn.map((plot, i) => `<button type="button" class="pick${app.plotChoice === i ? ' on' : ''}" data-plot="${i}">
                <svg viewBox="-22 -22 44 44"><polygon points="${hexPts(20)}" fill="${TILE_COLORS[plot.color]}" stroke="rgba(0,0,0,0.3)"/>${plot.improvement ? improvementIcon(plot.improvement, 0, 4, 1) : ''}</svg>
                <span>${COLOR_NAMES[plot.color]}${plot.improvement ? `・${IMPROVEMENT_NAMES[plot.improvement]}` : ''}</span></button>`).join('');
        } else if (app.mode === 'objective') {
            html = CARD_TYPES.map(t => `<button type="button" class="act" data-kind="${t}"${view.deckCounts[t] ? '' : ' disabled'}>
                <i class="back ${t} big"></i><span>${CARD_TYPE_NAMES[t]} ${view.deckCounts[t]}</span></button>`).join('')
                + '<button type="button" class="btn btn-ghost" data-action="cancel">戻る</button>';
        } else {
            html = ACTIONS.map(a => actionButton(view, a)).join('');
            if (view.options.canEndTurn) html += '<button type="button" class="btn btn-primary end" data-action="end-turn">終える</button>';
        }
    }
    $('#actionbar').innerHTML = html;
    markHint();
}

const hexPts = size => Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return `${(size * Math.cos(a)).toFixed(1)},${(size * Math.sin(a)).toFixed(1)}`;
}).join(' ');

// ===== ヒント =====

const HINT_TEXT = {
    weather: h => `天気「${WEATHER_NAMES[h.weather]}」を選ぶ`,
    rain: () => '白い枠の区画の竹を伸ばす',
    storm: () => '白い枠の区画にパンダを動かす',
    skip: () => '使わない',
    improve: h => (h.improvement ? `白い枠の区画に${IMPROVEMENT_NAMES[h.improvement]}を置く` : '改良を白い枠の区画へ動かす'),
    placePlot: () => '選んだ区画を白い枠の場所に置く',
    gardener: () => '庭師を白い枠の区画へ動かす',
    panda: () => 'パンダを白い枠の区画へ動かす',
    irrigate: () => '白い線の所に水路を置く',
    drawPlots: () => '区画を引く',
    drawObjective: h => `${CARD_TYPE_NAMES[h.kind]}の目標を引く`,
    complete: () => '白い枠の目標を達成する',
    endTurn: () => '手番を終える'
};

// おすすめの手を、選んだ状態にして盤とボタンに印を付ける（画面だけ。記録には入れず、次の操作で消える）
function showHint() {
    const view = app.view;
    const command = view && myTurn(view) ? app.controller?.hint() : null;
    if (!command) return toast('いまはあなたの番ではありません');
    resetModes();
    app.hint = command;
    if (command.type === 'improve') {
        if (command.improvement) app.cloudKind = command.improvement;
        else app.moveFrom = command.from;
    }
    if (command.type === 'placePlot') app.plotChoice = command.choice;
    if (command.type === 'gardener' || command.type === 'panda') app.mode = command.type;
    if (command.type === 'irrigate') app.mode = 'irrigation';
    if (command.type === 'drawObjective') app.mode = 'objective';
    render(view);
    toast(`おすすめ：${HINT_TEXT[command.type]?.(command) ?? ''}`);
}

function markHint() {
    const h = app.hint;
    if (!h) return;
    const selector = {
        weather: `[data-weather="${h.weather}"]`,
        skip: '[data-action="skip"]',
        improve: h.improvement ? `[data-improvement="${h.improvement}"]` : null,
        placePlot: `[data-plot="${h.choice}"]`,
        gardener: '[data-act="gardener"]',
        panda: '[data-act="panda"]',
        irrigate: '[data-act="irrigation"]',
        drawPlots: '[data-act="plot"]',
        drawObjective: `[data-kind="${h.kind}"]`,
        complete: `#me .obj[data-card="${h.card}"]`,
        endTurn: '[data-action="end-turn"]'
    }[h.type];
    if (selector) document.querySelector(selector)?.classList.add('recommended');
}

function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// 行動を使い切り、達成できる目標もなければ、少し待って手番を終える
function scheduleAutoEnd(view) {
    clearTimeout(app.autoEnd);
    if (!myTurn(view) || !view.options || !view.options.canEndTurn) return;
    if (view.options.completable.length) return;
    if (view.options.actions.length > 0 && view.turn.actions.length < view.turn.max) return;
    const count = view.commandCount;
    app.autoEnd = setTimeout(() => {
        if (app.view && app.view.commandCount === count && myTurn(app.view)) app.controller.send({ type: 'endTurn' });
    }, 900);
}

// ===== 入力 =====

function onBoardTap({ hex, edge }) {
    const view = app.view;
    if (!view || !myTurn(view)) return;
    const o = view.options;
    const pending = view.turn.pending;
    const send = command => app.controller.send(command);
    if (hex) {
        const [q, r] = hex;
        const inList = list => list.some(p => same(p, hex));
        if (pending === 'rain' && inList(o.rain)) return send({ type: 'rain', q, r });
        if (pending === 'storm' && view.tiles.some(t => t.color !== 'pond' && same([t.q, t.r], hex))) return send({ type: 'storm', q, r });
        if (pending === 'clouds') {
            if (app.cloudKind && inList(o.improvable)) return send({ type: 'improve', improvement: app.cloudKind, q, r });
            if (app.moveFrom && inList(o.improvable)) return send({ type: 'improve', from: app.moveFrom, q, r });
            if (IMPROVEMENTS.every(i => view.tokens[i] === 0) && view.tiles.some(t => same([t.q, t.r], hex) && t.improvement && !t.fixed)) {
                app.moveFrom = hex;
                return render(view);
            }
            return;
        }
        if (view.turn.drawn && inList(o.plotSpots)) return send({ type: 'placePlot', choice: app.plotChoice, q, r });
        if (app.mode === 'gardener' && inList(o.gardener)) return send({ type: 'gardener', q, r });
        if (app.mode === 'panda' && inList(o.panda)) return send({ type: 'panda', q, r });
    }
    if (edge && app.mode === 'irrigation') return send({ type: 'irrigate', a: edge[0], b: edge[1] });
}

function onPlayClick(event) {
    const view = app.view;
    if (!view || !app.controller) return;
    const target = event.target;
    const opp = target.closest('.opp, .me-done');
    if (opp) return openPlayer(Number(opp.dataset.seat));
    const zoom = target.closest('[data-action^="zoom"]')?.dataset.action;
    if (zoom === 'zoom-in') return app.board.zoomBy(1.25);
    if (zoom === 'zoom-out') return app.board.zoomBy(0.8);
    if (zoom === 'zoom-fit') return app.board.fit();
    if (!myTurn(view)) return;
    const card = target.closest('.obj[data-card]');
    if (card && view.options.completable.includes(card.dataset.card)) return app.controller.send({ type: 'complete', card: card.dataset.card });
    const weather = target.closest('[data-weather]')?.dataset.weather;
    if (weather) return app.controller.send({ type: 'weather', weather });
    const improvement = target.closest('[data-improvement]')?.dataset.improvement;
    if (improvement) {
        app.cloudKind = app.cloudKind === improvement ? null : improvement;
        music.play(app.cloudKind ? 'select' : 'cancel');
        return render(view);
    }
    const plot = target.closest('[data-plot]')?.dataset.plot;
    if (plot !== undefined) {
        app.plotChoice = Number(plot);
        music.play('select');
        return render(view);
    }
    const kind = target.closest('[data-kind]')?.dataset.kind;
    if (kind) return app.controller.send({ type: 'drawObjective', kind });
    const action = target.closest('[data-action]')?.dataset.action;
    if (action === 'skip') return app.controller.send({ type: 'skip' });
    if (action === 'cancel') {
        app.mode = null;
        music.play('cancel');
        return render(view);
    }
    if (action === 'end-turn') return app.controller.send({ type: 'endTurn' });
    const act = target.closest('[data-act]')?.dataset.act;
    if (act) {
        if (act === 'plot') return app.controller.send({ type: 'drawPlots' });
        app.mode = app.mode === act ? null : act;
        music.play(app.mode ? 'select' : 'cancel');
        return render(view);
    }
}

function openDialog(dialog) {
    app.controller?.pause();
    dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume();
}

function openPlayer(seat) {
    const view = app.view;
    const p = view.players[seat];
    const done = p.done.map(id => cardHtml(null, seat, id, { small: true })).join('') || '<p class="none">まだありません</p>';
    $('#info-body').innerHTML = `<h2 class="sheet-title">${escapeHtml(p.name)}</h2>
        <p class="info-line">${p.score.total}点・達成 ${p.done.length}枚・手札 ${p.handTypes.length}枚</p>
        <p class="info-line">食べた竹 ${eatenHtml(p.eaten)}</p>
        <h3 class="info-h">達成した目標</h3><div class="done-list">${done}</div>`;
    openDialog($('#info-dialog'));
}

function openLog() {
    const view = app.view;
    if (!view) return;
    $('#info-body').innerHTML = `<h2 class="sheet-title">履歴</h2><ol class="log-list">${[...view.logs].reverse().map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ol>`;
    openDialog($('#info-dialog'));
}

// ===== 結果 =====

function showResult() {
    const view = app.view;
    if (!view?.result || app.scene !== 'game') return;
    const { standings, winners } = view.result;
    const names = winners.map(s => view.players[s].name);
    $('#result-title').textContent = winners.length > 1 ? `${names.join('と')}が同点で勝ち` : winners[0] === view.viewer ? 'あなたの勝ち' : `${names[0]}の勝ち`;
    const tied = standings.length > 1 && standings[0].total === standings[1].total && winners.length === 1;
    $('#result-body').innerHTML = `${tied ? '<p class="result-note">同点のため、パンダの目標の点で決着</p>' : ''}<ol class="standings">${standings.map(s => {
        const p = view.players[s.seat];
        const detail = [`目標 ${s.count}枚`, `パンダ ${s.panda}点`, s.emperor ? `皇帝 +${EMPEROR_POINTS}` : ''].filter(Boolean).join('・');
        return `<li class="${s.seat === view.viewer ? 'me' : ''}"><span class="rank">${s.rank}</span>
            <span class="who"><span class="pname">${escapeHtml(p.name)}</span><span class="detail">${detail}</span></span>
            <span class="total">${s.total}</span></li>`;
    }).join('')}</ol>`;
    openDialog($('#result-dialog'));
}

// ===== タイトルの絵 =====

function renderStaticArt() {
    const tiles = [
        { q: 0, r: 0, color: 'pond', bamboo: 0, irrigated: false },
        { q: 1, r: 0, color: 'green', bamboo: 3, irrigated: true },
        { q: 0, r: 1, color: 'pink', bamboo: 2, irrigated: true },
        { q: -1, r: 1, color: 'yellow', bamboo: 1, irrigated: true },
        { q: 1, r: -1, color: 'yellow', bamboo: 4, irrigated: true, improvement: 'fertilizer' },
        { q: 0, r: -1, color: 'green', bamboo: 2, irrigated: true },
        { q: -1, r: 0, color: 'pink', bamboo: 1, irrigated: true, improvement: 'enclosure' }
    ];
    const art = new BoardView($('#title-art svg'), { onTap: () => {} });
    art.render({ tiles, channels: [], gardener: [1, 0], panda: [-1, 1] });
    art.fit();
}

// ===== 初期化 =====

function init() {
    $('#title-art').innerHTML = '<svg class="art-svg" xmlns="http://www.w3.org/2000/svg"></svg>';
    app.board = new BoardView($('#board'), { onTap: onBoardTap });
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
    $('#start-button').addEventListener('click', () => startGame(newSetup()));
    $('#online-button').addEventListener('click', () => online.open());
    $('#resume-button').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#play').addEventListener('click', onPlayClick);
    $('#hint').addEventListener('click', showHint);

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'home') goHome();
        if (action === 'help') openDialog($('#help-dialog'));
        if (action === 'close-help') $('#help-dialog').close();
        if (action === 'log') openLog();
        if (action === 'result') showResult();
        if (action === 'close-result') $('#result-dialog').close();
        if (action === 'rematch') {
            $('#result-dialog').close();
            // オンライン対戦は、ロビーを出し、ホストの「もう一度」で再戦する
            if (app.controller?.isOnline) return online.rematch();
            const setup = app.controller?.setup;
            startGame(setup ? { players: setup.players, level: setup.level } : newSetup());
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
        if (app.view && app.scene === 'game') {
            render(app.view);
            if (!app.board.userMoved) app.board.fit();
        }
    });

    showScene('title');
    requestAnimationFrame(renderStaticArt);
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
    window.__app = app;
    window.__tk = app;
}

init();
