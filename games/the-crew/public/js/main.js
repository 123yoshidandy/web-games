/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る
 */

import LocalGameController from './game-controller.js';
import { MISSIONS, SPECIAL_TEXT, COMM_TEXT, ASSIGN_TEXT, TOKEN_NAMES, parseCard, handoverAllowed } from './missions.js';
import { commPosition, answerText } from './game.js';
import { CPU_HELP } from './cpu.js';
import * as storage from './storage.js';
import { music } from './music.js';

const CPU_NAMES = ['ハル', 'ミオ', 'ソラ', 'レン'];
const HUMAN_NAME = 'あなた';
const MISSION_COUNT = 50;

const $ = selector => document.querySelector(selector);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    selected: null,   // 選んでいるカード
    mode: null,       // 'comm'（通信するカードを選んでいる）
    prepSel: [],      // 準備で選んでいるもの（トークン・課題・人）
    hint: null,       // ヒントのおすすめの手（場面が変わったら消す）
    sending: false,   // 自分の操作を送っている間（効果音は送った操作で決める）
    settings: { count: 4, mission: null, ...storage.load('settings', {}) },
    progress: { attempts: {}, cleared: {}, ...storage.load('progress', {}) }
};

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// ===== 進み具合 =====

function nextMission() {
    for (let m = 1; m <= MISSION_COUNT; m++) if (!app.progress.cleared[m]) return m;
    return MISSION_COUNT;
}
const unlocked = m => m <= nextMission() || !!app.progress.cleared[m];
function selectedMission() {
    const m = app.settings.mission;
    return m && unlocked(m) ? m : nextMission();
}
function saveProgress() {
    storage.save('progress', app.progress);
}

// ===== 部品 =====

const ROCKET_ICON = '<svg viewBox="0 0 20 20"><use href="#sym-rocket"/></svg>';

function cardHtml(card, cls = '', attrs = '') {
    if (!card) return `<span class="card back ${cls}"${attrs}></span>`;
    const { suit, rank } = parseCard(card);
    return `<span class="card ${suit} ${cls}" data-card="${card}"${attrs}><span class="rank">${rank}</span><svg class="sym"><use href="#sym-${suit}"/></svg><svg class="big"><use href="#sym-${suit}"/></svg></span>`;
}

function tokenHtml(token) {
    if (!token) return '';
    return `<span class="token${token === 'omega' ? ' omega' : ''}">${TOKEN_NAMES[token]}</span>`;
}

function taskHtml(task, cls = '') {
    const check = task.done ? '<span class="check"><svg><use href="#sym-check"/></svg></span>' : '';
    return `<span class="task${task.done ? ' done' : ''} ${cls}" data-task="${task.index}">${cardHtml(task.card)}${tokenHtml(task.token)}${check}</span>`;
}

function commHtml(comm) {
    if (!comm) return '';
    const pos = comm.position ?? 'unknown';
    return `<span class="comm${comm.played ? ' played' : ''}">${cardHtml(comm.card)}<span class="dot ${pos}"></span></span>`;
}

const name = (view, seat) => (seat === view.viewer ? HUMAN_NAME : view.players[seat]?.name ?? '');
const POSITION_TEXT = { top: '上', single: '唯一', bottom: '下' };

function specialText(mission) {
    const s = mission.special;
    if (!s) return null;
    if (s.kind === 'winWithOnes') return SPECIAL_TEXT.winWithOnes(s.count);
    if (s.kind === 'rocketsWin') return SPECIAL_TEXT.rocketsWin(s.ordered);
    if (s.kind === 'balance' && s.commanderFirstLast) return `${SPECIAL_TEXT.balance}。さらに、${SPECIAL_TEXT.commanderFirstLast}`;
    return SPECIAL_TEXT[s.kind];
}

function commText(mission) {
    const c = mission.comm;
    if (!c) return null;
    if (c.deadSpot) return COMM_TEXT.deadSpot;
    if (c.silenced) return COMM_TEXT.silenced;
    if (c.from) return COMM_TEXT.from(c.from);
    return null;
}

function missionSummary(number) {
    const m = MISSIONS[number];
    const parts = [];
    if (m.tasks) parts.push(`課題${m.tasks}`);
    if (m.tokens.length) parts.push(m.tokens.map(t => TOKEN_NAMES[t]).join(' '));
    if (m.assign === 'decision') parts.push('指揮官の決定');
    if (m.assign === 'distribution') parts.push('指揮官の配分');
    if (m.comm?.deadSpot) parts.push('不感地帯');
    if (m.comm?.from) parts.push(`通信は${m.comm.from}トリック目から`);
    if (m.comm?.silenced) parts.push('1人通信不可');
    if (m.special && !['swapTokens', 'moveToken', 'stealAfterFirst', 'omegaLastTrick'].includes(m.special.kind)) parts.push('特別な条件');
    if (m.special?.kind === 'stealAfterFirst') parts.push('1枚引く');
    if (m.special?.kind === 'omegaLastTrick') parts.push('Ωは最後のトリック');
    return parts.join('・');
}

// 人の印（指揮官・選ばれた人・役割・通信不可）
function seatTags(view, seat) {
    const tags = [];
    const kind = MISSIONS[view.mission].special?.kind;
    if (view.silenced === seat) tags.push('通信不可');
    if (view.chosen === seat) {
        const label = { sick: '具合が悪い', exactlyOne: '1トリックだけ', firstAndLast: '最初と最後', pinkLeftOfNine: '桃を全部' }[kind];
        if (label) tags.push(label);
    }
    if (view.roles) {
        if (view.roles.first === seat) tags.push('最初の4');
        if (view.roles.last === seat) tags.push('最後');
    }
    return tags.map(t => `<span class="tag">${t}</span>`).join('');
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
    const m = selectedMission();
    $('#mission-number').textContent = m;
    const attempts = app.progress.attempts[m] ?? 0;
    $('#mission-progress').textContent = app.progress.cleared[m] ? `クリア（${app.progress.cleared[m]}回）` : attempts ? `挑戦${attempts}回` : missionSummary(m);
    $('#resume-button').hidden = !LocalGameController.loadSaved();
}

function newSetup(mission = selectedMission()) {
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    for (let i = 1; i < app.settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, mission };
}

function startGame(setup) {
    app.controller?.stop();
    app.view = null;
    resetSelection();
    if ($('#result-dialog').open) $('#result-dialog').close();
    app.controller = new LocalGameController(setup, { onUpdate: () => update(), onError: () => {
        music.play('error');
        update();
    }, onEnd: onGameEnd });
    showScene('game');
    update();
}

function goHome() {
    app.controller?.stop();
    app.controller = null;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

function resetSelection() {
    app.selected = null;
    app.mode = null;
    app.prepSel = [];
}

// ゲームが終わったら、航海日誌に挑戦の回数を書く（遭難信号を使ったら1回増やす）
function onGameEnd(result) {
    music.play(result.success ? 'win' : 'lose');
    const view = app.controller.getView();
    const m = view.mission;
    const attempts = (app.progress.attempts[m] ?? 0) + 1 + (view.distressUsed ? 1 : 0);
    app.progress.attempts[m] = attempts;
    if (result.success && !app.progress.cleared[m]) app.progress.cleared[m] = attempts;
    saveProgress();
    if (app.view) renderTopbar(app.view);
    setTimeout(showResult, 1500);
}

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const previous = app.view;
    const view = app.controller.getView();
    if (previous && view.commandCount !== previous.commandCount) {
        // 自分の操作で場面が変わったら、選んでいたものを捨てる
        const keepComm = app.mode === 'comm' && view.options?.communicate;
        if (!keepComm) resetSelection();
        app.hint = null;
        // ほかの人が動いて自分の番になったら知らせる（CPU の手ごとには鳴らさない）
        const myTurn = v => !v.result && v.current === v.viewer;
        if (!app.sending && myTurn(view) && !myTurn(previous)) music.play('turn');
    }
    app.view = view;
    render(view);
}

const isLandscape = () => window.innerWidth > window.innerHeight && window.innerHeight < 600;

function render(view) {
    document.body.classList.toggle('landscape', isLandscape());
    const sizes = startSizes(view);
    applySizes(sizes);
    renderTopbar(view);
    renderOthers(view);
    renderTable(view);
    renderStatus(view);
    renderMe(view);
    renderActions(view);
    markHint();
    // はみ出したら、カードを小さくして描き直す
    for (let i = 0; i < 16 && overflowing(); i++) {
        sizes.mini *= 0.97;
        sizes.tc *= 0.9;
        sizes.hc *= 0.93;
        applySizes(sizes, view);
        renderOthers(view);
        renderTable(view);
        renderMe(view);
        markHint();
    }
}

// ===== ヒント =====

function showHint() {
    const command = app.controller?.hint();
    if (!command) return;
    resetSelection();
    app.hint = command;
    // カードを出す・渡すときは、そのカードを選んだ状態にする（「出す」「渡す」で決められる）
    if (command.type === 'play' || command.type === 'passCard') app.selected = command.card;
    render(app.view);
}

// おすすめの手のカード・課題・ボタンに印を付ける
function markHint() {
    const c = app.hint;
    if (!c) return;
    const selectors = {
        play: [`#me .card[data-card="${c.card}"]`, '[data-act="play"]'],
        passCard: [`#me .card[data-card="${c.card}"]`, '[data-act="pass"]'],
        pickTask: [`.task.pickable[data-task="${c.index}"]`],
        answer: [`[data-answer="${c.value}"]`],
        choose: [`[data-choose="${c.seat}"]`],
        assignTask: [`[data-assign="${c.seat}"]`],
        silence: [`[data-silence="${c.seat}"]`],
        roles: [`[data-role="${app.prepSel.length ? c.last : c.first}"]`],
        skip: ['[data-prep="skip"]']
    }[c.type] ?? [];
    selectors.forEach(sel => document.querySelectorAll(sel).forEach(el => el.classList.add('recommended')));
}

function startSizes(view) {
    const width = Math.min(window.innerWidth, 640);
    const height = window.innerHeight;
    const others = view.players.length - 1;
    if (isLandscape()) {
        const body = height - 52;
        return {
            mini: Math.min(40, (body / Math.max(others, 2) - 16) / 1.45, window.innerWidth / 24),
            tc: Math.min(70, body / 4.6),
            hc: Math.min(84, body / 4)
        };
    }
    return {
        mini: Math.min(40, Math.max(20, height / 19), width / 12),
        tc: Math.min(84, height / (others >= 3 ? 8.5 : 7), width / 6.5),
        hc: Math.min(100, height / 7, width / 5.5)
    };
}

function applySizes(sizes, view = app.view) {
    const root = document.documentElement.style;
    root.setProperty('--mini', `${Math.floor(sizes.mini)}px`);
    root.setProperty('--tc', `${Math.floor(sizes.tc)}px`);
    root.setProperty('--hc', `${Math.floor(sizes.hc)}px`);
    // 手札は重ねて並べる。1枚ごとのずれ
    const width = (isLandscape() ? $('#right').clientWidth : Math.min(window.innerWidth, 640) - 16) - 20;
    const count = Math.max(1, handCards(view).length);
    const step = count === 1 ? sizes.hc : Math.min(sizes.hc + 4, (width - sizes.hc) / (count - 1));
    root.setProperty('--step', `${Math.floor(step)}px`);
}

function overflowing() {
    const h = el => el.getBoundingClientRect().height;
    const play = $('#play');
    const tableNeed = [...$('#table').children].reduce((sum, el) => sum + h(el) + 6, 0);
    const rest = ['#status', '#me', '#actions'].reduce((sum, sel) => sum + h($(sel)), 0);
    const available = h(play) - 8;
    if (isLandscape()) return h($('#others')) > available + 1 || tableNeed + rest + 12 > available + 1;
    return h($('#others')) + tableNeed + rest + 16 > available + 1;
}

function renderTopbar(view) {
    const attempts = (app.progress.attempts[view.mission] ?? 0) + (view.result ? 0 : 1);
    $('#mission-label').innerHTML = `<b>${view.mission}</b>${escapeHtml(missionSummary(view.mission) || 'ミッション')}<span class="attempt">・${attempts}回目</span>`;
    $('#trick-label').textContent = view.phase === 'prep' ? '準備' : `トリック ${Math.min(view.trickNumber, view.totalTricks)}/${view.totalTricks}`;
    $('#result-button').hidden = !view.result;
}

function seatHighlighted(view, seat) {
    if (view.phase === 'end') return false;
    if (view.phase === 'play') return view.passing ? false : view.turnSeat === seat;
    const step = view.step;
    if (!step) return false;
    if (step.kind === 'pick') return step.turn === seat;
    if (step.kind === 'ask') return step.order?.[view.answers.length] === seat;
    return step.actor === seat;
}

function seatHtml(view, seat) {
    const p = view.players[seat];
    const tasks = view.tasks.filter(t => t.owner === seat);
    const answer = view.phase === 'prep' && view.step?.kind === 'ask' ? view.answers.find(a => a.seat === seat) : null;
    const bubble = answer ? `<span class="bubble${answer.value === 'no' ? ' no' : ''}">${answerText(answer.value)}</span>` : '';
    const stats = p.jarvis ? `取${p.tricksWon}` : `取${p.tricksWon}・手${p.handCount}`;
    const jarvis = p.jarvis && view.jarvis
        ? `<div class="jarvis-cards mini">${view.jarvis.map(x => (x.up ? `<span class="pile${x.down ? ' has-down' : ''}">${cardHtml(x.up)}</span>` : x.down ? `<span class="pile">${cardHtml(null)}</span>` : '<span class="gone"></span>')).join('')}</div>`
        : '';
    const cls = ['seat', seatHighlighted(view, seat) ? 'turn' : '', p.jarvis ? 'jarvis' : '', view.chosen === seat ? 'chosen' : ''].join(' ');
    return `<div class="${cls}" data-seat="${seat}">
        <div class="seat-name"><span class="pname">${view.commander === seat ? ROCKET_ICON : ''}${escapeHtml(name(view, seat))}</span><span class="stats">${stats}</span></div>
        <div class="seat-comm mini">${commHtml(view.comms[seat])}</div>
        <div class="seat-tasks mini" data-count="${tasks.length}">${tasks.map(t => taskHtml(t)).join('')}${seatTags(view, seat)}</div>
        ${bubble}
        ${jarvis}
    </div>`;
}

function renderOthers(view) {
    const n = view.players.length;
    const seats = [];
    for (let i = 1; i < n; i++) seats.push((view.viewer + i) % n);
    $('#others').innerHTML = seats.map(seat => seatHtml(view, seat)).join('');
    fitTaskRows();
}

// 課題が多い列は、課題のカードを小さくする
function fitTaskRows() {
    for (const row of document.querySelectorAll('.seat-tasks')) {
        row.style.fontSize = '';
        row.classList.remove('tight');
        const count = Number(row.dataset.count);
        if (!count) continue;
        const available = row.clientWidth;
        const mini = parseFloat(getComputedStyle(row).fontSize);
        const need = count * (mini + 5) + row.querySelectorAll('.tag').length * 50;
        if (need > available) {
            row.classList.add('tight');
            row.style.fontSize = `${Math.max(12, Math.floor((available - row.querySelectorAll('.tag').length * 50) / count - 2))}px`;
        }
    }
}

function renderTable(view) {
    const table = $('#table');
    if (view.phase === 'prep') {
        table.innerHTML = prepHtml(view);
        return;
    }
    if (view.passing) {
        const pending = view.players.filter(p => !p.jarvis && !view.passing.chosen.includes(p.seat)).map(p => name(view, p.seat));
        table.innerHTML = `<div class="prep"><div class="prep-title">遭難信号：全員が${view.passing.direction === 1 ? '左' : '右'}の人へ1枚渡します<small>まだ選んでいない人：${escapeHtml(pending.join('・'))}</small></div></div>`;
        return;
    }
    const n = view.players.length;
    const showLast = view.trick.plays.length === 0 && view.lastTrick;
    const trick = showLast ? view.lastTrick : view.trick;
    const slots = [];
    for (let i = 0; i < n; i++) {
        const seat = (trick.leader + i) % n;
        const play = trick.plays.find(p => p.seat === seat);
        const win = showLast && trick.winner === seat;
        slots.push(`<div class="trick-slot${win ? ' win' : ''}">${play ? cardHtml(play.card) : '<span class="placeholder"></span>'}<span class="who">${escapeHtml(name(view, seat))}</span></div>`);
    }
    let note = '';
    if (showLast) note = `${escapeHtml(name(view, trick.winner))}が取りました`;
    else if (view.trick.plays.length === 0 && view.phase === 'play') note = `${escapeHtml(name(view, view.trick.leader))}から`;
    table.innerHTML = `<div class="trick${showLast ? ' past' : ''}">${slots.join('')}</div><div class="table-note">${note}</div>`;
}

function answersHtml(view, answers) {
    if (!answers?.length) return '';
    return `<div class="answers">${answers.map(a => `<span class="bubble${a.value === 'no' ? ' no' : ''}">${escapeHtml(name(view, a.seat))}：${answerText(a.value)}</span>`).join('')}</div>`;
}

function seatButtons(view, seats, attr) {
    return `<div class="prep-buttons">${seats.map(seat => `<button type="button" class="btn btn-secondary small" data-${attr}="${seat}">${escapeHtml(name(view, seat))}</button>`).join('')}</div>`;
}

function prepHtml(view) {
    const step = view.step;
    const mine = view.current === view.viewer;
    const waitName = escapeHtml(name(view, view.current));
    const all = view.players.map(p => p.seat);
    switch (step.kind) {
        case 'pick': {
            const jarvis = view.players[step.turn].jarvis;
            const title = mine ? (jarvis ? 'JARVIS の課題を選んでください（指揮官）' : 'あなたの番：課題を1枚選んでください') : `${escapeHtml(name(view, step.turn))}が課題を選んでいます`;
            const tasks = view.tasks.filter(t => t.owner === null);
            return `<div class="prep"><div class="prep-title">${title}<small>課題のカードを、持ち主がトリックで取れば達成</small></div>
                <div class="prep-tasks">${tasks.map(t => taskHtml(t, mine ? 'pickable' : '')).join('')}</div></div>`;
        }
        case 'ask': {
            const q = askText(view, step);
            const task = step.question === 'task' ? `<div class="prep-tasks">${taskHtml(view.tasks[step.task])}</div>` : step.purpose === 'decision' ? facedownTasks(view) : '';
            const values = step.question === 'condition' ? ['good', 'bad'] : step.question === 'role' ? ['first', 'last', 'middle'] : ['yes', 'no'];
            const buttons = mine ? `<div class="prep-buttons">${values.map(v => `<button type="button" class="btn ${v === 'no' || v === 'bad' ? 'btn-plain' : 'btn-secondary'} small" data-answer="${v}">${answerText(v)}</button>`).join('')}</div>` : `<div class="table-note">${waitName}が答えています</div>`;
            return `<div class="prep"><div class="prep-title">${q}</div>${task}${answersHtml(view, view.answers)}${buttons}</div>`;
        }
        case 'choose': {
            const title = {
                sick: '具合が悪い人を選んでください<small>その人は1トリックも取れません</small>',
                decision: 'すべての課題を受け持つ人を選んでください<small>指揮官は自分を選べません</small>',
                exactlyOne: 'ロケット以外でちょうど1トリックだけ取る人を選んでください',
                firstAndLast: '最初と最後のトリックだけを取る人を選んでください<small>どちらもロケット以外で取ります</small>'
            }[step.purpose];
            const seats = all.filter(s => step.purpose !== 'decision' || s !== view.commander);
            const body = mine ? seatButtons(view, seats, 'choose') : `<div class="table-note">指揮官（${waitName}）が決めています</div>`;
            const tasks = step.purpose === 'decision' ? facedownTasks(view) : '';
            return `<div class="prep"><div class="prep-title">${title}</div>${tasks}${answersHtml(view, view.lastAnswers?.answers)}${body}</div>`;
        }
        case 'assignTask': {
            const body = mine ? seatButtons(view, view.assignable ?? [], 'assign') : `<div class="table-note">指揮官（${waitName}）が配っています</div>`;
            return `<div class="prep"><div class="prep-title">この課題をだれに配りますか<small>最後に2枚以上の差がつかないように配ります</small></div>
                <div class="prep-tasks">${taskHtml(view.tasks[step.task])}</div>${answersHtml(view, view.lastAnswers?.answers)}${body}</div>`;
        }
        case 'swapTokens':
        case 'moveToken': {
            const swap = step.kind === 'swapTokens';
            const title = swap ? '順番のトークンを2つ入れ替えられます' : '順番のトークンを1つ、トークンのない課題へ動かせます';
            const hint = swap ? 'トークンのある課題を2つ選びます' : '動かすトークンの課題、動かす先の課題の順に選びます';
            if (!mine) return `<div class="prep"><div class="prep-title">${title}</div><div class="table-note">指揮官（${waitName}）が決めています</div></div>`;
            const ready = swap ? app.prepSel.length === 2 : app.prepSel.length === 2;
            return `<div class="prep"><div class="prep-title">${title}<small>${hint}</small></div>
                <div class="prep-tasks">${view.tasks.map(t => taskHtml(t, `pickable${app.prepSel.includes(t.index) ? ' selected' : ''}`)).join('')}</div>
                <div class="prep-buttons"><button type="button" class="btn btn-secondary small" data-prep="${step.kind}"${ready ? '' : ' disabled'}>${swap ? '入れ替える' : '動かす'}</button><button type="button" class="btn btn-plain small" data-prep="skip">そのまま</button></div></div>`;
        }
        case 'silence': {
            const seats = all.filter(s => s !== view.commander && !view.players[s].jarvis);
            const body = mine ? seatButtons(view, seats, 'silence') : `<div class="table-note">指揮官（${waitName}）が決めています</div>`;
            return `<div class="prep"><div class="prep-title">このミッションで通信できない人を選んでください</div>${body}</div>`;
        }
        case 'roles': {
            if (!mine) return `<div class="prep"><div class="prep-title">役割を決めています</div>${answersHtml(view, view.lastAnswers?.answers)}<div class="table-note">指揮官（${waitName}）が決めています</div></div>`;
            const first = app.prepSel[0];
            const title = first === undefined ? '最初の4トリックを取る人を選んでください' : `最後のトリックを取る人を選んでください<small>最初の4トリック：${escapeHtml(name(view, first))}</small>`;
            const seats = all.filter(s => s !== first);
            return `<div class="prep"><div class="prep-title">${title}</div>${answersHtml(view, view.lastAnswers?.answers)}${seatButtons(view, seats, 'role')}</div>`;
        }
        case 'handover': {
            if (!mine) return `<div class="prep"><div class="prep-title">課題を渡すか決めています</div><div class="table-note">${waitName}が決めています</div></div>`;
            const sel = app.prepSel[0];
            const tasks = view.tasks.map(t => `<span class="task-wrap">${taskHtml(t, `pickable${sel === t.index ? ' selected' : ''}`)}<span class="owner">${escapeHtml(name(view, t.owner))}</span></span>`).join('');
            const owner = sel === undefined ? null : view.tasks[sel].owner;
            const targets = owner === null ? '' : seatButtons(view, all.filter(s => s !== owner), 'handover');
            return `<div class="prep"><div class="prep-title">課題を1枚、ほかの人へ渡せます（5人のとき）<small>${sel === undefined ? '渡す課題を選びます' : '渡す相手を選びます'}</small></div>
                <div class="prep-tasks">${tasks}</div>${targets}<div class="prep-buttons"><button type="button" class="btn btn-plain small" data-prep="skip">渡さない</button></div></div>`;
        }
        default:
            return '';
    }
}

// 指揮官の決定：受け持つ人が決まるまで裏向き
function facedownTasks(view) {
    return `<div class="prep-tasks mini">${view.tasks.map(t => taskHtml(t)).join('')}</div>`;
}

function askText(view, step) {
    if (step.question === 'condition') return '具合はどうですか？<small>具合が悪い人は、1トリックも取れません</small>';
    if (step.question === 'role') return 'どの役割をやりたいですか？<small>1人が最初の4トリック、別の1人が最後のトリック、残りの人が間のトリックをすべて取ります</small>';
    if (step.question === 'task') return 'この課題を受け持ちたいですか？';
    if (step.purpose === 'decision') return 'すべての課題を受け持てますか？<small>課題のカードは、受け持つ人が決まるまで裏向きです</small>';
    if (step.purpose === 'exactlyOne') return 'ロケット以外で、ちょうど1トリックだけ取れますか？';
    if (step.purpose === 'firstAndLast') return '最初と最後のトリックだけを取れますか？<small>どちらもロケット以外で取ります</small>';
    return 'はい・いいえで答えてください';
}

function renderStatus(view) {
    const status = $('#status');
    let text = '';
    let mine = false;
    if (view.result) {
        text = view.result.success ? 'ミッション成功！' : `ミッション失敗：${view.result.reason}`;
    } else if (view.passing) {
        mine = view.current === view.viewer;
        text = mine ? `${view.passing.direction === 1 ? '左' : '右'}の人へ渡すカードを選んでください（ロケット以外）` : '渡すカードを選んでいます';
    } else if (view.phase === 'play') {
        if (app.mode === 'comm') {
            text = '通信するカードを選んでください';
            mine = true;
        } else if (view.options?.play) {
            mine = true;
            text = view.options.play.seat === view.viewer ? 'あなたの番：カードを出してください' : 'JARVIS のカードを選んでください';
        } else {
            text = `${name(view, view.turnSeat)}の番`;
        }
    } else if (view.phase === 'prep') {
        mine = view.current === view.viewer;
        text = mine ? 'あなたが決める番です' : '準備をしています';
    }
    status.textContent = text;
    status.classList.toggle('mine', mine);
}

// 下に並べるカード（JARVIS の番で自分が指揮官なら JARVIS の表のカード）
function handCards(view) {
    if (!view) return [];
    if (view.options?.play && view.options.play.seat !== view.viewer) return view.jarvis.map(x => x.up).filter(Boolean);
    return view.hand;
}

function renderMe(view) {
    const me = $('#me');
    const seat = view.viewer;
    const p = view.players[seat];
    const tasks = view.tasks.filter(t => t.owner === seat);
    const jarvisTurn = view.options?.play && view.options.play.seat !== seat;
    me.classList.toggle('turn', !!view.options?.play || (view.passing && view.current === seat) || (view.phase === 'prep' && view.current === seat));
    const cards = handCards(view);
    // 出せないカードを暗くする
    let enabled;
    if (app.mode === 'comm') enabled = new Set((view.options?.communicate ?? []).map(c => c.card));
    else if (view.passing) enabled = new Set(view.passing && view.current === seat ? view.hand.filter(c => !c.startsWith('rocket')) : view.hand);
    else if (view.options?.play) enabled = new Set(view.options.play.cards);
    else if (view.phase === 'play' && view.trick.plays.length && !view.trick.plays.some(x => x.seat === seat)) {
        const led = parseCard(view.trick.plays[0].card).suit;
        const follow = view.hand.filter(c => parseCard(c).suit === led);
        enabled = new Set(follow.length ? follow : view.hand);
    } else enabled = new Set(cards);
    const handHtml = cards.map(card => {
        const cls = [enabled.has(card) ? '' : 'dim', app.selected === card ? 'selected' : '', enabled.has(card) ? 'pickable' : ''].join(' ');
        const pos = app.mode === 'comm' && enabled.has(card) ? `<span class="comm-pos">${POSITION_TEXT[commPosition(view.hand, card)]}</span>` : '';
        return cardHtml(card, cls, ' data-hand="1"').replace('</span><svg class="sym">', `</span>${pos}<svg class="sym">`);
    }).join('');
    const stats = `取${p.tricksWon}・手${p.handCount}`;
    me.innerHTML = `<div class="me-head">
            <div class="seat-name"><span class="pname">${view.commander === seat ? ROCKET_ICON : ''}${HUMAN_NAME}</span><span class="stats">${stats}</span></div>
            <div class="seat-comm mini">${commHtml(view.comms[seat])}</div>
            <div class="seat-tasks mini" data-count="${tasks.length}">${tasks.length ? tasks.map(t => taskHtml(t)).join('') : '<span class="empty-note">課題なし</span>'}${seatTags(view, seat)}</div>
        </div>
        ${jarvisTurn ? '<div class="hand-label">JARVIS の表のカード（指揮官のあなたが選びます）</div>' : ''}
        <div class="hand">${handHtml}</div>`;
    fitTaskRows();
}

function renderActions(view) {
    const actions = $('#actions');
    const buttons = [];
    if (view.result) {
        buttons.push('<button type="button" class="btn btn-primary" data-action="result">結果を見る</button>');
    } else if (view.passing) {
        if (view.current === view.viewer) {
            const ok = app.selected && !app.selected.startsWith('rocket');
            buttons.push(`<button type="button" class="btn btn-primary" data-act="pass"${ok ? '' : ' disabled'}>渡す</button>`);
        }
    } else if (view.phase === 'play') {
        if (app.mode === 'comm') {
            const ok = (view.options?.communicate ?? []).some(c => c.card === app.selected);
            buttons.push(`<button type="button" class="btn btn-primary" data-act="send-comm"${ok ? '' : ' disabled'}>通信する</button>`);
            buttons.push('<button type="button" class="btn btn-plain" data-act="cancel-comm">やめる</button>');
        } else {
            if (view.options?.play) {
                const ok = view.options.play.cards.includes(app.selected);
                buttons.push(`<button type="button" class="btn btn-primary" data-act="play"${ok ? '' : ' disabled'}>出す</button>`);
            }
            if (view.options?.communicate) buttons.push('<button type="button" class="btn btn-secondary" data-act="comm">通信</button>');
            if (view.options?.distress) buttons.push('<button type="button" class="btn btn-warn" data-act="distress">遭難信号</button>');
        }
    }
    actions.innerHTML = buttons.join('');
}

// ===== 入力 =====

// 送った操作の音（1つの操作に1つ。終わったときは onGameEnd が勝ち負けを鳴らす）
const SEND_SOUNDS = {
    play: 'place', passCard: 'place', communicate: 'place', pickTask: 'draw', assignTask: 'place', handover: 'place',
    swapTokens: 'place', moveToken: 'place', answer: 'select', choose: 'select', silence: 'select', roles: 'select',
    skip: 'cancel', distress: 'shuffle'
};

function send(command) {
    if (!app.controller) return;
    app.sending = true;
    let ok = false;
    try {
        ok = app.controller.send(command);
    } finally {
        app.sending = false;
    }
    if (ok && !app.controller?.game.isOver && SEND_SOUNDS[command.type]) music.play(SEND_SOUNDS[command.type]);
}

function onPlayClick(event) {
    const view = app.view;
    if (!view || view.result) return;
    const target = event.target;
    // 手札
    const handCard = target.closest('.card[data-hand]');
    if (handCard) {
        const card = handCard.dataset.card;
        if (handCard.classList.contains('dim')) return;
        if (app.mode === 'comm' || view.passing) {
            app.selected = app.selected === card ? null : card;
            music.play(app.selected ? 'select' : 'cancel');
        } else if (view.options?.play) {
            if (app.selected === card) {
                send({ type: 'play', card });
                return;
            }
            app.selected = card;
            music.play('select');
        } else return;
        render(view);
        return;
    }
    // 準備：課題を選ぶ
    const task = target.closest('.task.pickable');
    if (task && view.phase === 'prep') {
        const index = Number(task.dataset.task);
        const kind = view.step.kind;
        if (kind === 'pick') return send({ type: 'pickTask', index });
        if (kind === 'swapTokens') {
            if (!view.tasks[index].token) return;
            app.prepSel = app.prepSel.includes(index) ? app.prepSel.filter(i => i !== index) : [...app.prepSel, index].slice(-2);
        }
        if (kind === 'moveToken') {
            if (app.prepSel.length === 0 || app.prepSel.length === 2) app.prepSel = view.tasks[index].token ? [index] : [];
            else if (!view.tasks[index].token) app.prepSel = [app.prepSel[0], index];
            else app.prepSel = [index];
        }
        if (kind === 'handover') app.prepSel = app.prepSel[0] === index ? [] : [index];
        music.play(app.prepSel.includes(index) ? 'select' : 'cancel');
        render(view);
        return;
    }
    const button = target.closest('button');
    if (!button) return;
    const data = button.dataset;
    if (data.answer) return send({ type: 'answer', value: data.answer });
    if (data.choose !== undefined) return send({ type: 'choose', seat: Number(data.choose) });
    if (data.assign !== undefined) return send({ type: 'assignTask', seat: Number(data.assign) });
    if (data.silence !== undefined) return send({ type: 'silence', seat: Number(data.silence) });
    if (data.role !== undefined) {
        const seat = Number(data.role);
        if (app.prepSel.length === 0) {
            app.prepSel = [seat];
            render(view);
        } else send({ type: 'roles', first: app.prepSel[0], last: seat });
        return;
    }
    if (data.handover !== undefined) {
        const index = app.prepSel[0];
        return send({ type: 'handover', from: view.tasks[index].owner, to: Number(data.handover), task: index });
    }
    if (data.prep === 'skip') return send({ type: 'skip' });
    if (data.prep === 'swapTokens') return send({ type: 'swapTokens', a: app.prepSel[0], b: app.prepSel[1] });
    if (data.prep === 'moveToken') return send({ type: 'moveToken', from: app.prepSel[0], to: app.prepSel[1] });
    if (data.act === 'play' && app.selected) return send({ type: 'play', card: app.selected });
    if (data.act === 'pass' && app.selected) return send({ type: 'passCard', card: app.selected });
    if (data.act === 'comm') {
        music.play('select');
        app.mode = 'comm';
        app.selected = null;
        render(view);
        return;
    }
    if (data.act === 'cancel-comm') {
        music.play('cancel');
        resetSelection();
        render(view);
        return;
    }
    if (data.act === 'send-comm' && app.selected) {
        const card = app.selected;
        resetSelection();
        return send({ type: 'communicate', card });
    }
    if (data.act === 'distress') openDialog($('#distress-dialog'));
}

function openDialog(dialog) {
    app.controller?.pause();
    dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume();
}

function openLog() {
    const view = app.view;
    if (!view) return;
    $('#log-body').innerHTML = [...view.logs].reverse().map(line => `<li>${escapeHtml(line)}</li>`).join('');
    openDialog($('#log-dialog'));
}

function missionDetailHtml(number, players) {
    const m = MISSIONS[number];
    const lines = [];
    if (m.tasks) {
        lines.push(`<li>課題：${m.tasks}枚</li>`);
        if (m.tokens.length) lines.push(`<li>順番のトークン：</li><div class="mission-tokens">${m.tokens.map(t => `<span class="task">${cardHtml(null)}${tokenHtml(t)}</span>`).join('')}</div>`);
    } else lines.push('<li>課題のカードは使いません</li>');
    if (ASSIGN_TEXT[m.assign]) lines.push(`<li>${ASSIGN_TEXT[m.assign]}</li>`);
    const comm = commText(m);
    if (comm) lines.push(`<li>${comm}</li>`);
    const special = specialText(m);
    if (special) lines.push(`<li>${special}</li>`);
    if (players && handoverAllowed(number, players)) lines.push('<li>5人：最初のトリックの前に、課題を1枚ほかの人へ渡せます</li>');
    return `<ul>${lines.join('')}</ul>`;
}

function openMission() {
    const view = app.view;
    if (!view) return;
    $('#mission-title').textContent = `ミッション ${view.mission}`;
    $('#mission-body').innerHTML = missionDetailHtml(view.mission, view.players.filter(p => !p.jarvis).length);
    openDialog($('#mission-dialog'));
}

function openMissions() {
    const current = selectedMission();
    const next = nextMission();
    $('#missions-grid').innerHTML = Array.from({ length: MISSION_COUNT }, (_, i) => {
        const m = i + 1;
        const cleared = app.progress.cleared[m];
        const cls = [cleared ? 'cleared' : '', m === next && !cleared ? 'next' : '', m === current ? 'on' : ''].join(' ');
        return `<button type="button" class="${cls}" data-mission="${m}"${unlocked(m) ? '' : ' disabled'}>${m}<small>${cleared ? `${cleared}回` : ''}</small></button>`;
    }).join('');
    openDialog($('#missions-dialog'));
}

// ===== 結果 =====

function showResult() {
    const view = app.view;
    if (!view || !view.result || app.scene !== 'game') return;
    const success = view.result.success;
    const m = view.mission;
    $('#result-title').textContent = `ミッション ${m} ${success ? '成功' : '失敗'}`;
    $('#result-title').classList.toggle('won', success);
    $('#result-title').classList.toggle('lost', !success);
    const attempts = app.progress.attempts[m] ?? 1;
    const note = success
        ? `${attempts}回目の挑戦でクリアしました${view.distressUsed ? '（遭難信号の1回を含む）' : ''}`
        : `${escapeHtml(view.result.reason)}<br>挑戦の回数：${attempts}回`;
    $('#result-body').innerHTML = `<p class="result-note">${note}</p>`;
    const next = $('#result-next');
    next.textContent = success ? (m < MISSION_COUNT ? '次のミッションへ' : '航海日誌へ') : 'もう一度挑む';
    next.dataset.mission = success ? Math.min(m + 1, MISSION_COUNT) : m;
    next.dataset.home = success && m === MISSION_COUNT ? '1' : '';
    if (!$('#result-dialog').open) openDialog($('#result-dialog'));
}

// ===== タイトルの絵 =====

function renderStaticArt() {
    const cards = ['pink9', 'yellow7', 'rocket4', 'blue5', 'green3'];
    $('#title-art').innerHTML = cards.map((c, i) => cardHtml(c, '', ` style="--i:${i - 2}"`)).join('');
}

// ===== 初期化 =====

function init() {
    // ヘッドレス Chrome での確認に使う
    window.__app = app;
    renderStaticArt();
    $('#cpu-help').innerHTML = CPU_HELP.map(line => `<li>${escapeHtml(line)}</li>`).join('');
    $('#count-select').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        app.settings.count = Number(button.dataset.value);
        storage.save('settings', app.settings);
        renderTitle();
    });
    $('#mission-button').addEventListener('click', openMissions);
    $('#missions-grid').addEventListener('click', event => {
        const button = event.target.closest('button[data-mission]');
        if (!button || button.disabled) return;
        app.settings.mission = Number(button.dataset.mission);
        storage.save('settings', app.settings);
        $('#missions-dialog').close();
        renderTitle();
    });
    $('#start-button').addEventListener('click', () => {
        LocalGameController.clearSaved();
        startGame(newSetup());
    });
    $('#resume-button').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });
    $('#play').addEventListener('click', onPlayClick);

    document.addEventListener('click', event => {
        const el = event.target.closest('[data-action]');
        const action = el?.dataset.action;
        if (!action) return;
        if (action === 'home') goHome();
        if (action === 'help') openDialog($('#help-dialog'));
        if (action === 'close-help') $('#help-dialog').close();
        if (action === 'log') openLog();
        if (action === 'hint') showHint();
        if (action === 'mission') openMission();
        if (action === 'close-mission') $('#mission-dialog').close();
        if (action === 'close-missions') $('#missions-dialog').close();
        if (action === 'result') showResult();
        if (action === 'close-result') $('#result-dialog').close();
        if (action === 'close-distress') $('#distress-dialog').close();
        if (action === 'distress-left' || action === 'distress-right') {
            $('#distress-dialog').close();
            send({ type: 'distress', direction: action === 'distress-left' ? 1 : -1 });
        }
        if (action === 'next') {
            const setup = app.controller?.setup;
            $('#result-dialog').close();
            if (el.dataset.home) return goHome();
            const mission = Number(el.dataset.mission);
            app.settings.mission = mission;
            storage.save('settings', app.settings);
            startGame(setup ? { players: setup.players, mission } : newSetup(mission));
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
    window.__crew = { app, startGame, render };
}

init();
