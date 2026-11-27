/**
 * パズルのゲームの画面（タイトル・遊ぶ画面・結果・遊び方・記録・オンライン）。種類と名前はゲームの js/game.js から読む
 * 1人用の遊びは session.js の applyCommand に操作を通し、時間は止めていた間を数えない時計（clock）で付ける
 * オンラインは共通のロビー（netplay-lobby.js）から始め、盤面は端末で解き、解けたら盤面を送る（race.js）
 * 盤面は、種類の render（js/puzzles/<id>/render.js）が描く
 */

import game from './game.js';
import { PUZZLE_TYPE, getType, DIFFICULTIES, difficultyLabel } from './puzzles/registry.js';
import { planSet, dailyPlan, dailyKey, SET_SIZES, isDifficulty } from './puzzle-set.js';
import { createSession, applyCommand, replay, totalTime, puzzleTimes, solvedCount, isTimed, currentPuzzle, HINT_PENALTY_MS } from './session.js';
import { CPU_LEVELS, cpuDurations, cumulative, suggest } from './cpu-player.js';
import { solvedBy, nextIndex, totalOf, RACE_COUNTS } from './race.js';
import { createRandom, createSeed, hashSeed } from './random.js';
import { normalizeStats, recordFree, recordAttack, recordDaily, recordOnline, dailyStreak } from './stats.js';
import { helpHtml } from './help.js';
import * as store from './storage.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { onGameResult } from './result-hook.js';
import { GAME, getServerUrl } from './online-config.js';

const $ = (id) => document.getElementById(id);
const escape = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const formatTime = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};
const SOLVED_PAUSE_MS = 900; // 解けた盤面を見せてから次の問題へ
const PLACE_SOUND_MS = 90;   // 置く音の間隔の下限（なぞると続けて入力が届くため）

// ---------- 設定 ----------

// online はオンラインの解きかけの盤面。共通のロビーの参加情報（<ゲーム>.online）と重ならない名前にする
const KEYS = { settings: 'settings', save: 'save', stats: 'stats', online: 'race' };
const settings = {
    mode: 'free',
    difficulty: 'normal',
    count: SET_SIZES[0],
    rival: 'none',
    ...store.load(KEYS.settings, {})
};
if (!isDifficulty(settings.difficulty)) settings.difficulty = 'normal';
if (!SET_SIZES.includes(settings.count)) settings.count = SET_SIZES[0];
const saveSettings = () => store.save(KEYS.settings, settings);

const loadStats = () => normalizeStats(store.load(KEYS.stats, null));
const saveStats = (stats) => store.save(KEYS.stats, stats);

// ---------- 状態 ----------

let scene = 'title';
let play = null;        // 遊んでいるもの（1人用：{ kind: 'local', session, rival }、オンライン：{ kind: 'online', ... }）
let board = null;       // 種類の render が返したもの
let boardKey = null;    // 描いている問題（変わったら描き直す）
let decoration = {};    // 盤面の飾り（ヒントで光らせるマス・まちがい・解けた）
let transition = null;  // 解けたあと、次の問題へ進むまでのタイマー
let lastPlaceSound = 0;
let ticker = null;

// 止めていた間を数えない時計（1人用）
const clock = {
    offset: 0,
    startedAt: null,
    now() { return Math.round(this.offset + (this.startedAt === null ? 0 : performance.now() - this.startedAt)); },
    start() { if (this.startedAt === null) this.startedAt = performance.now(); },
    stop() {
        if (this.startedAt === null) return;
        this.offset += performance.now() - this.startedAt;
        this.startedAt = null;
    },
    reset(offset = 0) { this.offset = offset; this.startedAt = null; }
};

// ---------- オンライン対戦（入口とロビーは netplay-lobby.js の画面） ----------

const online = new NetplayLobby({
    title: game.title,
    game: GAME,
    serverUrl: getServerUrl(),
    minPlayers: 2,
    maxPlayers: 4,
    settings: [
        { key: 'difficulty', label: '難しさ', options: DIFFICULTIES.map(d => ({ value: d.id, label: d.label })) },
        { key: 'count', label: '問題の数', options: RACE_COUNTS.map(n => ({ value: n, label: `${n}問` })) },
        { key: 'cpuLevel', label: 'CPU の強さ', options: CPU_LEVELS.map(level => ({ value: level.id, label: level.label })) }
    ],
    onStart: (controller) => beginOnline(controller),
    onUpdate: () => onOnlineUpdate(),
    onError: (message) => setStatus(message, 'error'),
    onExit: () => {
        play = null;
        closeDialogs();
        showScene('title');
    }
});

// ---------- 画面の切り替え ----------

function showScene(name) {
    scene = name;
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    if (name === 'title') {
        stopTicker();
        clearTimeout(transition);
        board?.destroy();
        board = null;
        boardKey = null;
        renderTitle();
    }
}

function closeDialogs() {
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
}

// ---------- タイトル ----------

function segmented(container, items, selected, attr, onPick) {
    container.replaceChildren(...items.map(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'radio');
        button.dataset[attr] = item.value;
        button.textContent = item.label;
        button.setAttribute('aria-checked', String(String(item.value) === String(selected)));
        button.addEventListener('click', () => {
            music.play('select');
            onPick(item.value);
        });
        return button;
    }));
}

function renderTitle() {
    const mode = settings.mode;
    document.querySelectorAll('#mode-tabs button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    document.querySelectorAll('[data-modes]').forEach(node => { node.hidden = !node.dataset.modes.split(' ').includes(mode); });

    segmented($('difficulty'), DIFFICULTIES.map(d => ({ value: d.id, label: d.label })), settings.difficulty, 'difficulty', (value) => {
        settings.difficulty = value;
        saveSettings();
        renderTitle();
    });
    segmented($('count'), SET_SIZES.map(n => ({ value: n, label: `${n}問` })), settings.count, 'count', (value) => {
        settings.count = Number(value);
        saveSettings();
        renderTitle();
    });
    segmented($('rival'), [{ value: 'none', label: 'なし' }, ...CPU_LEVELS.map(l => ({ value: l.id, label: l.label }))], settings.rival, 'level', (value) => {
        settings.rival = value;
        saveSettings();
        renderTitle();
    });

    const stats = loadStats();
    let note = '';
    if (mode === 'free') {
        const best = stats.free[settings.difficulty]?.best;
        note = `${escape(PUZZLE_TYPE.difficulties[settings.difficulty])}を1問ずつ。${best ? `最短 <strong>${formatTime(best)}</strong>` : ''}`;
    } else if (mode === 'attack') {
        const best = stats.attack[bestKey()];
        note = best ? `自己ベスト <strong>${formatTime(best)}</strong>` : 'この設定の記録はまだありません。';
    } else note = '3問の合計の時間を記録します。';
    $('mode-note').innerHTML = note;
    if (mode === 'daily') renderDaily(stats);

    $('resume').hidden = !store.load(KEYS.save);
    $('online-row').hidden = !online.available;
}

function renderDaily(stats) {
    const key = dailyKey();
    const [, month, day] = key.split('-').map(Number);
    const plan = dailyPlan(key);
    const record = stats.daily[key];
    $('daily-info').innerHTML = `
        <div class="daily-date">${month}月${day}日の${plan.length}問${record ? `（クリア ${formatTime(record)}）` : ''}</div>
        <ol class="daily-list">${plan.map(p => `<li>${difficultyLabel(p.difficulty)}（${escape(PUZZLE_TYPE.difficulties[p.difficulty])}）</li>`).join('')}</ol>`;
}

const bestKey = () => `${settings.difficulty}:${settings.count}`;

// ---------- 記録 ----------

function openStats() {
    const stats = loadStats();
    const streak = dailyStreak(stats, dailyKey());
    const days = Object.keys(stats.daily).length;
    const row = (label, value) => `<li><span>${label}</span><span class="time">${value}</span></li>`;
    const free = DIFFICULTIES.map(d => {
        const r = stats.free[d.id];
        return row(`${d.label} <span class="meta">${escape(PUZZLE_TYPE.difficulties[d.id])}</span>`, r ? `${r.solved}問${r.best ? `・最短 ${formatTime(r.best)}` : ''}` : '—');
    }).join('');
    const attack = DIFFICULTIES.flatMap(d => SET_SIZES.map(n => {
        const best = stats.attack[`${d.id}:${n}`];
        return best ? row(`${d.label}・${n}問`, formatTime(best)) : '';
    })).join('') || row('まだ記録がありません', '');
    $('stats').innerHTML = `
        <h3>フリー</h3><ul class="result-log">${free}</ul>
        <h3>タイムアタック（自己ベスト）</h3><ul class="result-log">${attack}</ul>
        <h3>今日のパズル</h3><ul class="result-log">${row('解いた日', `${days}日（連続 ${streak}日）`)}</ul>
        <h3>オンライン</h3><ul class="result-log">${row('対戦', `${stats.online.played}回（1位 ${stats.online.wins}回）`)}</ul>`;
    $('stats-dialog').showModal();
}

// ---------- 1人用の遊び ----------

function newSetup() {
    const mode = settings.mode;
    if (mode === 'daily') {
        const key = dailyKey();
        return { mode, plan: dailyPlan(key), dailyKey: key };
    }
    if (mode === 'attack') {
        return {
            mode,
            plan: planSet({ seed: createSeed(), difficulty: settings.difficulty, count: settings.count }),
            cpuLevel: settings.rival === 'none' ? null : settings.rival,
            bestKey: bestKey()
        };
    }
    return { mode: 'free', plan: planSet({ seed: createSeed(), difficulty: settings.difficulty, count: 1 }) };
}

function startLocal(setup, { commands = [], t = 0 } = {}) {
    closeDialogs();
    const session = commands.length ? replay(setup, commands) : createSession(setup);
    // ライバルの解き終わる時刻（組のシードから作った乱数で決める。同じ組なら同じ）
    let rival = null;
    if (setup.cpuLevel) {
        const random = createRandom(hashSeed(`rival:${JSON.stringify(setup.plan)}`));
        rival = { level: setup.cpuLevel, times: cumulative(cpuDurations(session.puzzles, setup.cpuLevel, random)) };
    }
    play = { kind: 'local', session, rival };
    clock.reset(t);
    decoration = {};
    showScene('game');
    mountBoard();
    if (session.phase === 'done') finishLocal();
    else clock.start();
    startTicker();
    saveProgress(true);
}

let saveTimer = null;
function saveProgress(now = false) {
    if (play?.kind !== 'local') return;
    clearTimeout(saveTimer);
    const write = () => {
        if (play?.kind !== 'local' || play.session.phase !== 'playing') return;
        store.save(KEYS.save, { setup: play.session.setup, commands: play.session.commands, t: clock.now() });
    };
    if (now) write();
    else saveTimer = setTimeout(write, 400);
}

function localCommand(command) {
    const result = applyCommand(play.session, { ...command, t: clock.now() });
    if (result.ok) saveProgress();
    return result;
}

function finishLocal() {
    clock.stop();
    store.remove(KEYS.save);
    const session = play.session;
    const total = totalTime(session);
    const setup = session.setup;
    let record = '';
    const stats = loadStats();
    if (setup.mode === 'attack') {
        const result = recordAttack(stats, setup.bestKey, total);
        record = result.best ? '自己ベスト更新' : result.first ? '初めての記録' : '';
    } else if (setup.mode === 'daily') {
        record = recordDaily(stats, setup.dailyKey, total).best ? '今日の記録を更新' : '';
    } else {
        const difficulty = setup.plan[0].difficulty;
        const before = stats.free[difficulty]?.best ?? null;
        if (recordFree(stats, difficulty, total, session.hints.reduce((a, b) => a + b, 0)) && before !== null) record = '最短を更新';
    }
    saveStats(stats);
    const rivalTotal = play.rival ? play.rival.times[play.rival.times.length - 1] : null;
    const lost = rivalTotal !== null && rivalTotal < total;
    onGameResult({ mode: setup.mode, id: `${GAME}-${setup.mode}-${setup.plan.map(p => p.seed).join('.')}`, outcome: rivalTotal === null ? null : (lost ? 'loss' : 'win'), totalMs: total, rank: null });
    music.play(lost ? 'lose' : 'win');
    showLocalResult({ total, record, rivalTotal, lost });
}

function showLocalResult({ total, record, rivalTotal, lost }) {
    const session = play.session;
    const times = puzzleTimes(session);
    const hints = session.hints.reduce((a, b) => a + b, 0);
    const timed = isTimed(session);
    $('result-title').textContent = rivalTotal === null ? 'クリア' : (lost ? 'ライバルの勝ち' : 'ライバルに勝ちました');
    let summary = `合計 <strong>${formatTime(total)}</strong>`;
    if (timed && session.penaltyMs) summary += `<br>ヒント ${hints}回（+${formatTime(session.penaltyMs)}）`;
    else if (hints) summary += `<br>ヒント ${hints}回`;
    if (rivalTotal !== null) summary += `<br>ライバル（${CPU_LEVELS.find(l => l.id === play.rival.level).label}） ${formatTime(rivalTotal)}`;
    if (record) summary += `<br><span class="best">${record}</span>`;
    $('result-summary').innerHTML = summary;
    $('log').innerHTML = session.puzzles.map((entry, i) => {
        const type = getType(entry.type);
        const hint = session.hints[i] ? ` <span class="meta">ヒント${session.hints[i]}</span>` : '';
        return `<li><span>${i + 1}. ${difficultyLabel(entry.difficulty)} <span class="meta">${escape(type.difficulties[entry.difficulty])}</span>${hint}</span><span class="time">${times[i] === null ? '—' : formatTime(times[i])}</span></li>`;
    }).join('');
    $('again').textContent = session.setup.mode === 'free' ? 'もう1問' : 'もう一度';
    $('again').hidden = session.setup.mode === 'daily';
    $('result-dialog').showModal();
}

// ---------- 盤面 ----------

// 今の問題（種類・問題・状態）。1人用とオンラインで同じ形
function current() {
    if (!play) return null;
    if (play.kind === 'local') {
        const session = play.session;
        const entry = currentPuzzle(session);
        return { key: `local:${session.setup.plan[session.index].seed}:${session.index}`, entry, state: session.states[session.index], index: session.index, count: session.puzzles.length };
    }
    const view = play.view;
    const index = Math.min(play.index, view.puzzles.length - 1);
    return { key: `online:${play.matchId}:${index}`, entry: view.puzzles[index], state: play.states[index], index, count: view.puzzles.length };
}

function mountBoard() {
    const now = current();
    if (!now) return;
    const type = getType(now.entry.type);
    board?.destroy();
    decoration = {};
    board = type.render($('board'), now.entry.puzzle, now.state, { onInput });
    boardKey = now.key;
    $('game-title').textContent = type.name;
    setStatus(type.controls);
    refreshBoard();
    renderHeader();
}

function refreshBoard() {
    const now = current();
    if (!board || !now) return;
    const type = getType(now.entry.type);
    const result = type.check(now.entry.puzzle, now.state);
    board.update(now.state, { ...decoration, errors: result.errors, solved: decoration.solved });
    $('undo').disabled = !canUndo();
}

function canUndo() {
    if (!play || decoration.solved) return false;
    if (play.kind === 'local') return play.session.history[play.session.index].length > 0;
    return (play.history[play.index] ?? []).length > 0;
}

function setStatus(text, kind = '') {
    const node = $('status');
    node.textContent = text;
    node.className = `status-text${kind ? ` ${kind}` : ''}`;
}

function playInputSound(input) {
    const now = performance.now();
    if (now - lastPlaceSound < PLACE_SOUND_MS) return;
    lastPlaceSound = now;
    music.play(input.value === 0 || input.type === 'clear' ? 'cancel' : 'place');
}

// 盤面からの入力
function onInput(input) {
    if (!play || decoration.solved || transition) return;
    if (play.kind === 'online') return onlineInput(input);
    const before = play.session.index;
    const result = localCommand({ type: 'input', input });
    if (!result.ok) return;
    playInputSound(input);
    if (decoration.highlight) {
        decoration = {};
        setStatus(getType(currentPuzzle(play.session).type).controls);
    }
    if (result.events.includes('solved')) return showSolved(before, result.events.includes('finished'));
    refreshBoard();
}

// 解けた：解けた盤面を少し見せてから、次の問題か結果へ（その間は時計を止める）
function showSolved(index, finished) {
    const entry = play.kind === 'local' ? play.session.puzzles[index] : play.view.puzzles[index];
    const state = play.kind === 'local' ? play.session.states[index] : play.states[index];
    if (play.kind === 'local') clock.stop();
    decoration = { solved: true };
    board.update(state, { solved: true });
    $('undo').disabled = true;
    if (!finished) music.play('gain');
    showOverlay('正解', '', { clear: true });
    setStatus(`${getType(entry.type).name}：解けました`);
    transition = setTimeout(() => {
        transition = null;
        hideOverlay();
        if (!play) return;
        if (play.kind === 'local') {
            if (finished) return finishLocal();
            mountBoard();
            clock.start();
        } else {
            if (finished) return showOnlineWaiting();
            mountBoard();
        }
    }, SOLVED_PAUSE_MS);
    renderHeader();
}

function showOverlay(text, sub = '', { clear = false } = {}) {
    $('overlay-text').textContent = text;
    $('overlay-sub').textContent = sub;
    const overlay = $('overlay');
    overlay.classList.toggle('clear', clear);
    overlay.classList.remove('pop');
    void overlay.offsetWidth;
    overlay.classList.add('pop');
    overlay.hidden = false;
}
const hideOverlay = () => { $('overlay').hidden = true; };

function onHint() {
    if (!play || decoration.solved || transition) return;
    const now = current();
    let hint;
    if (play.kind === 'local') {
        const result = localCommand({ type: 'hint' });
        if (!result.ok) return;
        hint = result.hint;
    } else {
        if (play.countdown) return;
        hint = suggest(now.entry.type, now.entry.puzzle, now.state);
        if (!hint) return;
        sendOnline({ type: 'hint', index: play.index });
    }
    music.play('notify');
    decoration = { highlight: hint.cells };
    const penalty = play.kind === 'online' || isTimed(play.session) ? `（+${HINT_PENALTY_MS / 1000}秒）` : '';
    setStatus(`${hint.message}${penalty}`, 'hint');
    refreshBoard();
    renderHeader();
}

function onUndo() {
    if (!canUndo() || transition) return;
    if (play.kind === 'local') {
        if (!localCommand({ type: 'undo' }).ok) return;
    } else {
        play.states[play.index] = play.history[play.index].pop();
    }
    music.play('cancel');
    decoration = {};
    refreshBoard();
}

function onReset() {
    if (!play || decoration.solved || transition) return;
    if (play.kind === 'local') {
        if (!localCommand({ type: 'reset' }).ok) return;
    } else {
        const now = current();
        const initial = getType(now.entry.type).initialState(now.entry.puzzle);
        if (JSON.stringify(initial) === JSON.stringify(now.state)) return;
        play.history[play.index].push(now.state);
        play.states[play.index] = initial;
    }
    music.play('cancel');
    decoration = {};
    refreshBoard();
}

// ---------- 上の帯・進み具合 ----------

function renderHeader() {
    if (!play) return;
    const now = current();
    if (play.kind === 'local') {
        const session = play.session;
        const done = solvedCount(session);
        const label = difficultyLabel(now.entry.difficulty);
        $('game-progress').textContent = session.puzzles.length > 1 ? `${Math.min(done + 1, session.puzzles.length)} / ${session.puzzles.length}・${label}` : label;
        const penalty = session.penaltyMs ? `<span class="penalty">+${formatTime(session.penaltyMs)}</span>` : '';
        $('timer').innerHTML = `${formatTime(session.phase === 'done' ? totalTime(session) - session.penaltyMs : clock.now())}${penalty}`;
        renderRacers(play.rival ? [
            { name: 'あなた', me: true, solved: done, total: session.phase === 'done' ? totalTime(session) : null, count: session.puzzles.length },
            { name: `CPU（${CPU_LEVELS.find(l => l.id === play.rival.level).label}）`, cpu: true, solved: play.rival.times.filter(t => t <= clock.now()).length, total: play.rival.times[play.rival.times.length - 1], count: session.puzzles.length }
        ] : null);
        return;
    }
    const view = play.view;
    const me = view.players[view.seat];
    const elapsed = Math.max(0, serverElapsed());
    const finished = nextIndex(me) < 0;
    $('game-progress').textContent = `${Math.min(play.index + 1, view.puzzles.length)} / ${view.puzzles.length}`;
    const penalty = me.penaltyMs ? `<span class="penalty">+${formatTime(me.penaltyMs)}</span>` : '';
    $('timer').innerHTML = `${formatTime(finished ? me.solvedAt[me.solvedAt.length - 1] : elapsed)}${penalty}`;
    renderRacers(view.players.map((player, seat) => {
        const solved = solvedBy(player, elapsed);
        const total = solved === view.puzzles.length ? totalOf(player) : null;
        return { name: seat === view.seat ? 'あなた' : player.name, me: seat === view.seat, cpu: player.isCPU, solved, total, count: view.puzzles.length };
    }));
}

function renderRacers(rows) {
    const node = $('racers');
    node.hidden = !rows;
    if (!rows) return;
    node.innerHTML = rows.map(row => `
        <div class="racer${row.me ? ' me' : ''}${row.cpu ? ' cpu' : ''}">
            <span class="racer-name">${escape(row.name)}</span>
            <span class="racer-bar"><i style="width:${(row.solved / row.count) * 100}%"></i></span>
            <span class="racer-time">${row.total !== null && row.solved === row.count ? formatTime(row.total) : `${row.solved}/${row.count}`}</span>
        </div>`).join('');
}

function startTicker() {
    stopTicker();
    ticker = setInterval(() => {
        if (scene !== 'game' || !play) return;
        if (play.kind === 'online') tickOnline();
        renderHeader();
    }, 250);
}
function stopTicker() {
    clearInterval(ticker);
    ticker = null;
}

// ---------- オンライン ----------

const serverElapsed = () => (play?.kind === 'online' ? play.controller.net.serverNow() - play.view.startAt : 0);

function beginOnline(controller) {
    closeDialogs();
    const view = controller.getView();
    const matchId = controller.lobby?.matchId ?? null;
    const me = view.players[view.seat];
    const index = Math.max(0, nextIndex(me) < 0 ? view.puzzles.length - 1 : nextIndex(me));
    play = {
        kind: 'online',
        controller,
        matchId,
        view,
        index,
        states: view.puzzles.map(entry => getType(entry.type).initialState(entry.puzzle)),
        history: view.puzzles.map(() => []),
        queue: [],
        countdown: serverElapsed() < 0,
        resultShown: false
    };
    // 前回の分（同じ対戦で再読み込みしたとき）
    const saved = store.load(KEYS.online, null);
    if (saved?.matchId === matchId && saved.states?.length === play.states.length) play.states = saved.states;
    showScene('game');
    mountBoard();
    startTicker();
    tickOnline();
    if (nextIndex(me) < 0) showOnlineWaiting();
    onOnlineUpdate();
}

function onOnlineUpdate() {
    if (play?.kind !== 'online') return;
    const view = play.controller.getView();
    if (!view) return;
    const before = play.view;
    play.view = view;
    // ほかの人が解いたら知らせる（自分の番の概念はないので、相手の進みは notify）
    const othersSolved = (v) => v.players.reduce((sum, p, seat) => sum + (seat === v.seat ? 0 : p.solvedAt.filter(t => t !== null).length), 0);
    if (before && !play.countdown && othersSolved(view) > othersSolved(before) && view.players.some((p, s) => s !== view.seat && !p.isCPU)) music.play('notify');
    const me = view.players[view.seat];
    if (me.wrong > (before?.players[view.seat].wrong ?? 0)) {
        music.play('error');
        setStatus('答えがちがいました（+30秒）。盤面を見直しましょう', 'error');
    }
    flushQueue();
    renderHeader();
    if (view.phase === 'end') showOnlineResult();
}

// 返事を待っている間に送れなかった操作は、並べておいて次の知らせで送る
function sendOnline(command) {
    play.queue.push(command);
    flushQueue();
}
function flushQueue() {
    if (play?.kind !== 'online') return;
    while (play.queue.length && play.controller.send(play.queue[0])) play.queue.shift();
}

function tickOnline() {
    const elapsed = serverElapsed();
    if (elapsed < 0) {
        play.countdown = true;
        showOverlay(String(Math.ceil(-elapsed / 1000)), 'まもなく始まります');
    } else if (play.countdown) {
        play.countdown = false;
        hideOverlay();
        music.play('turn');
    }
    flushQueue();
}

function onlineInput(input) {
    if (play.countdown) return;
    const now = current();
    const type = getType(now.entry.type);
    const next = type.applyInput(now.entry.puzzle, now.state, input);
    if (next === now.state) return;
    play.history[play.index].push(now.state);
    play.states[play.index] = next;
    store.save(KEYS.online, { matchId: play.matchId, states: play.states });
    playInputSound(input);
    if (decoration.highlight) {
        decoration = {};
        setStatus(type.controls);
    }
    if (type.check(now.entry.puzzle, next).solved) {
        sendOnline({ type: 'submit', index: play.index, state: next });
        const solvedIndex = play.index;
        const finished = solvedIndex + 1 >= play.view.puzzles.length;
        if (!finished) play.index++;
        showSolved(solvedIndex, finished);
        return;
    }
    refreshBoard();
}

function showOnlineWaiting() {
    if (play?.kind !== 'online' || play.view.phase === 'end') return;
    showOverlay('完走', 'ほかの人を待っています');
    setStatus('全部解きました。ほかの人を待っています');
}

function showOnlineResult() {
    if (play.resultShown) return;
    play.resultShown = true;
    clearTimeout(transition);
    transition = null;
    hideOverlay();
    store.remove(KEYS.online);
    const view = play.view;
    const mine = view.ranking.find(row => row.seat === view.seat);
    const stats = loadStats();
    recordOnline(stats, mine?.rank);
    onGameResult({ mode: 'online', id: `${GAME}-online-${play.matchId}`, outcome: mine?.rank === 1 ? 'win' : 'loss', totalMs: mine?.total ?? null, rank: mine?.rank ?? null });
    saveStats(stats);
    music.play(mine?.rank === 1 ? 'win' : 'lose');
    $('result-title').textContent = mine?.rank === 1 ? '1位' : `${mine?.rank ?? '-'}位`;
    $('result-summary').innerHTML = mine?.total !== null && mine?.total !== undefined ? `合計 <strong>${formatTime(mine.total)}</strong>` : `${mine?.solved ?? 0} 問を解きました`;
    $('log').innerHTML = view.ranking.map(row => {
        const player = view.players[row.seat];
        const name = row.seat === view.seat ? 'あなた' : player.name;
        const extra = [player.hints ? `ヒント${player.hints}` : '', player.wrong ? `ミス${player.wrong}` : '', player.isCPU ? 'CPU' : ''].filter(Boolean).join('・');
        const time = row.total !== null ? formatTime(row.total) : `${row.solved}/${view.puzzles.length}`;
        return `<li class="${row.seat === view.seat ? 'me' : ''}"><span>${row.rank}. ${escape(name)} <span class="meta">${extra}</span></span><span class="time">${time}</span></li>`;
    }).join('');
    $('again').textContent = 'もう一度';
    $('again').hidden = false;
    $('result-dialog').showModal();
}

// ---------- 遊び方 ----------

function openHelp() {
    if (play?.kind === 'local' && scene === 'game' && !transition) clock.stop();
    $('help-dialog').showModal();
}

// ---------- 起動 ----------

function goHome() {
    if (play?.kind === 'online') return online.confirmLeave();
    if (play?.kind === 'local') {
        clock.stop();
        saveProgress(true);
    }
    play = null;
    closeDialogs();
    showScene('title');
}

function setup() {
    $('help').innerHTML = helpHtml();

    document.querySelectorAll('#mode-tabs button').forEach(button => button.addEventListener('click', () => {
        music.play('select');
        settings.mode = button.dataset.mode;
        saveSettings();
        renderTitle();
    }));
    $('start').addEventListener('click', () => {
        store.remove(KEYS.save);
        startLocal(newSetup());
    });
    $('resume').addEventListener('click', () => {
        const saved = store.load(KEYS.save);
        if (!saved) return renderTitle();
        try {
            startLocal(saved.setup, { commands: saved.commands, t: saved.t });
        } catch {
            store.remove(KEYS.save);
            showScene('title');
        }
    });
    $('online').addEventListener('click', () => online.open());
    $('open-help-title').addEventListener('click', openHelp);
    $('open-stats').addEventListener('click', openStats);
    $('open-help-game').addEventListener('click', openHelp);
    $('home').addEventListener('click', goHome);
    $('hint').addEventListener('click', onHint);
    $('undo').addEventListener('click', onUndo);
    $('reset').addEventListener('click', onReset);
    $('again').addEventListener('click', () => {
        $('result-dialog').close();
        if (play?.kind === 'online') return online.rematch();
        const mode = play?.session.setup.mode ?? settings.mode;
        if (mode === 'daily') return goHome();
        if (mode === 'attack') {
            const { plan, cpuLevel, bestKey: key } = play.session.setup;
            startLocal({ mode, plan: planSet({ seed: createSeed(), difficulty: plan[0].difficulty, count: plan.length }), cpuLevel, bestKey: key });
        } else {
            const { difficulty } = play.session.setup.plan[0];
            startLocal({ mode: 'free', plan: planSet({ seed: createSeed(), difficulty, count: 1 }) });
        }
    });
    $('result-home').addEventListener('click', () => {
        $('result-dialog').close();
        if (play?.kind === 'online') return online.leave();
        goHome();
    });
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    $('help-dialog').addEventListener('close', () => {
        if (play?.kind === 'local' && scene === 'game' && play.session.phase === 'playing' && !transition && !document.hidden) clock.start();
    });

    // 裏に回ったら時計を止めて保存する（1人用）
    document.addEventListener('visibilitychange', () => {
        if (play?.kind !== 'local' || play.session.phase !== 'playing' || scene !== 'game') return;
        if (document.hidden) {
            clock.stop();
            saveProgress(true);
        } else if (!$('help-dialog').open && !transition) clock.start();
    });
    window.addEventListener('pagehide', () => saveProgress(true));

    // ページの拡大を止める
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea, select')) e.preventDefault();
    });

    showScene('title');
    registerServiceWorker();

    // ?play&difficulty=<難しさ>&seed=<数>：その問題のフリープレイをすぐ始める（確かめ用）
    const params = new URLSearchParams(location.search);
    if (params.has('play')) {
        const difficulty = isDifficulty(params.get('difficulty')) ? params.get('difficulty') : 'normal';
        const seed = Number.isFinite(Number(params.get('seed'))) && params.get('seed') !== null ? Number(params.get('seed')) : createSeed();
        startLocal({ mode: 'free', plan: [{ type: PUZZLE_TYPE.id, difficulty, seed }] });
    } else {
        // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
        online.boot();
    }

    // 確かめるときに使う
    window.__app = {
        get play() { return play; },
        get scene() { return scene; },
        get board() { return board; },
        get boardKey() { return boardKey; },
        settings,
        clock,
        online,
        startLocal,
        onInput,
        current
    };
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
