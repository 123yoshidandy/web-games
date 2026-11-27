/**
 * 画面（タイトル・プレイ中・結果）と入力
 * 画面はビューだけを見て描く。操作はコントローラーの send() に送る（ローカル・オンライン・リプレイで同じ形）
 * 考えている間の「試し動かし」と、自分の実演の途中の手は、画面の中だけで動かす（送るのは宣言と、実演の手順の全体）
 */

import { LocalGameController, ReplayController } from './game-controller.js';
import { MAX_BID, MAX_PLAYERS } from './game.js';
import { slide, applyMoves, reached, targetInfo, ROBOT_NAMES, DIR_NAMES, SIZE } from './board.js';
import { LEVEL_NAMES } from './cpu-player.js';
import { solve } from './solver.js';
import { staticBoard, robotElements, centerOf, targetMark, targetIcon, trailPath, ghostRobots, arrowsFor, titleArt, UNIT } from './render.js';
import * as storage from './storage.js';
import { music } from './music.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';

const CPU_NAMES = ['ロボ博士', 'ギア', 'ボルト'];
const HUMAN_NAME = 'あなた';
const TOAST_MS = 2800;
const ANIM_STEP_MS = 420;
const TICK_MS = 2500;        // オンライン：時間で進む出来事を確かめてもらう間隔
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = selector => document.querySelector(selector);
const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const app = {
    scene: 'title',
    controller: null,
    view: null,
    settings: { mode: 'race', count: 2, level: 'normal', targets: 9, silver: 'off', ...storage.load('settings', {}) },
    boardKey: null,
    robotCells: [],
    selected: null,
    trial: null,        // { key, robots, moves }：試し動かし・自分の実演の途中
    found: null,        // { round, moves }：試しで目標に着いた手順
    hint: null,         // { round, robot, dir }
    anim: null,         // 実演を見せている間 { robots, path }
    attemptsSeen: 0,
    revealedRound: null,
    drag: null,
    online: null,
    lastTick: 0,
    toastTimer: null,
    newRecord: false
};

// ===== 画面の切り替え =====

function showScene(scene) {
    app.scene = scene;
    $('#screen-title').hidden = scene !== 'title';
    $('#screen-game').hidden = scene !== 'game';
    if (scene === 'title') renderTitle();
}

function renderTitle() {
    const s = app.settings;
    const mark = (id, value) => document.querySelectorAll(`#${id} button`).forEach(button => button.classList.toggle('on', button.dataset.value === String(value)));
    mark('mode-select', s.mode);
    mark('count-select', s.count);
    mark('level-select', s.level);
    mark('targets-select', s.targets);
    mark('silver-select', s.silver);
    document.querySelectorAll('.race-only').forEach(el => { el.hidden = s.mode !== 'race'; });
    $('#resume-button').hidden = !LocalGameController.loadSaved();
    $('#online-button').hidden = !app.online?.available;
    $('#replay-title').hidden = !LocalGameController.loadRecord();
    const best = bestRecord();
    $('#best-record').hidden = s.mode !== 'solo' || !best;
    if (best) $('#best-record').textContent = `練習のベスト（${s.targets}枚${s.silver === 'on' ? '・銀あり' : ''}）：${best.points}点・${formatTime(best.time)}`;
}

const bestKey = () => `best-${app.settings.targets}-${app.settings.silver}`;
const bestRecord = () => storage.load(bestKey());

function newSetup() {
    const s = app.settings;
    const players = [{ name: HUMAN_NAME, isCPU: false }];
    if (s.mode === 'race') for (let i = 1; i < s.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { mode: s.mode, players, level: s.level, targets: s.targets, silver: s.silver === 'on' };
}

function startGame(setup) {
    beginGame(new LocalGameController(setup, {
        onUpdate: () => update(),
        onError: message => {
            music.play('error');
            showNote(message);
            update();
        }
    }));
}

// ローカル・オンライン・リプレイで同じ：前の対戦の表示を消して、コントローラーのビューを描く
function beginGame(controller) {
    if (app.controller !== controller) app.controller?.stop();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    Object.assign(app, { controller, view: null, boardKey: null, selected: null, trial: null, found: null, hint: null, anim: null, attemptsSeen: 0, revealedRound: null, newRecord: false });
    hideToast();
    showScene('game');
    update();
}

function goHome() {
    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    if (app.controller?.isOnline) return app.online.confirmLeave();
    app.controller?.stop();
    app.controller = null;
    hideToast();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    showScene('title');
}

// ===== オンライン対戦（入口とロビーは netplay-lobby.js の画面） =====

async function setupOnline() {
    try {
        const [{ NetplayLobby }, { getServerUrl, GAME }] = await Promise.all([import('./netplay/netplay-lobby.js'), import('./online-config.js')]);
        app.online = new NetplayLobby({
            title: 'リコシェロボット',
            game: GAME,
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 500,
            allowCpu: true,
            minPlayers: 2,
            maxPlayers: MAX_PLAYERS,
            settings: [
                { key: 'targets', label: '目標の数', options: [{ value: '5', label: '5枚' }, { value: '9', label: '9枚' }, { value: '17', label: '17枚' }] },
                { key: 'silver', label: '銀のロボット', options: [{ value: 'off', label: 'なし' }, { value: 'on', label: 'あり' }] },
                { key: 'level', label: 'CPU の強さ', options: Object.entries(LEVEL_NAMES).map(([value, label]) => ({ value, label })) }
            ],
            onStart: controller => beginGame(controller),
            onUpdate: () => update(),
            onError: message => {
                music.play('error');
                showNote(message);
                update();
            },
            onExit: () => {
                app.controller = null;
                hideToast();
                for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
                showScene('title');
            }
        });
        if (app.scene === 'title') renderTitle();
        // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
        app.online.boot();
    } catch {
        app.online = null; // オンラインの部品がなくても、ひとりと CPU の対戦は遊べる
    }
}

// ===== 時刻 =====

const gameNow = () => {
    const controller = app.controller;
    if (!controller) return 0;
    if (controller.isOnline) return controller.net.serverNow();
    return controller.now();
};

const formatTime = ms => {
    const total = Math.max(0, ms) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
};

const revealed = view => Boolean(view?.round) && gameNow() >= view.round.revealAt;

// ===== 描画 =====

function update() {
    if (!app.controller) return;
    const previous = app.view;
    const view = app.controller.getView();
    if (!view) return;
    app.view = view;
    if (previous && previous.round?.number !== view.round?.number) {
        app.selected = null;
        app.hint = null;
    }
    syncTrial(view);
    const attempt = newAttempt(view, previous);
    if (previous) playSounds(previous, view, attempt);
    if (attempt) animateAttempt(attempt);
    render();
    if (view.phase === 'end' && previous?.phase !== 'end') onGameEnd(view);
}

// 試し動かしの状態を、今の目標と段階に合わせる（目標や実演の人が変わったら、ビューのロボットからやり直す）
function syncTrial(view) {
    const round = view.round;
    let key = null;
    if (round && view.mode === 'race' && view.phase !== 'end') {
        if (['search', 'countdown'].includes(round.phase)) key = `${round.number}:think`;
        if (round.phase === 'demo' && round.demo.seat === view.viewer) key = `${round.number}:demo${round.attempts.length}`;
    }
    if (!key) {
        app.trial = null;
        return;
    }
    if (app.trial?.key !== key) app.trial = { key, robots: [...view.robots], moves: [] };
}

// 新しく行われた実演（見せるもの）。自分の実演は、もう画面で動かしたので見せない
// 最初の描画（続きから・再接続）では、前の実演は見せない
function newAttempt(view, previous) {
    const all = [...view.rounds.flatMap(round => round.attempts.map(attempt => ({ attempt, round }))),
        ...(view.round && view.round.phase !== 'done' ? view.round.attempts.map(attempt => ({ attempt, round: view.round })) : [])];
    const fresh = previous && all.length > app.attemptsSeen ? all[all.length - 1] : null;
    app.attemptsSeen = all.length;
    if (!fresh) return null;
    if (fresh.attempt.seat === view.viewer && fresh.attempt.moves.length && !app.controller.isReplay) return null;
    return fresh;
}

function animateAttempt({ attempt, round }) {
    if (!attempt.moves.length) return;
    const { path } = applyMoves(app.view.board.walls, round.startRobots, attempt.moves);
    app.anim = { robots: [...round.startRobots], path: [], steps: path, success: attempt.success };
    const step = () => {
        if (!app.anim) return;
        const next = app.anim.steps.shift();
        if (!next) {
            setTimeout(() => {
                app.anim = null;
                render();
            }, attempt.success ? 900 : 1300);
            return;
        }
        app.anim.robots[next.robot] = next.to;
        app.anim.path.push(next);
        render();
        // 次の目標をめくるまでに見せ終わるよう、手数が多いときは1手の間を縮める
        setTimeout(step, reducedMotion.matches ? 120 : Math.min(ANIM_STEP_MS, 3200 / Math.max(1, path.length)));
    };
    setTimeout(step, 300);
}

// 効果音：1回の更新に1つだけ。終局 → チップ → 実演の失敗 → 自分の実演の番 → ほかの人の宣言 → 自分の動き
function playSounds(previous, view, attempt) {
    const round = view.round;
    const prevRound = previous.round;
    if (view.phase === 'end' && previous.phase !== 'end') {
        if (view.mode === 'solo') return music.play('win');
        const winners = view.result?.winners ?? [];
        return music.play(winners.length > 1 && winners.includes(view.viewer) ? 'notify' : winners.includes(view.viewer) ? 'win' : 'lose');
    }
    if (view.mode === 'solo') {
        if (round?.phase === 'result' && prevRound?.phase === 'solve') return music.play(round.solved ? 'gain' : 'cancel');
        if (view.commandCount > previous.commandCount && round?.phase === 'solve') return music.play('place');
        return;
    }
    const finished = view.rounds.length > previous.rounds.length ? view.rounds[view.rounds.length - 1] : null;
    if (finished && finished.winner !== null) return music.play(finished.winner === view.viewer ? 'gain' : 'notify');
    if (attempt && !attempt.attempt.success) return music.play('error');
    const myDemo = round?.phase === 'demo' && round.demo.seat === view.viewer;
    const wasMyDemo = prevRound?.phase === 'demo' && prevRound.demo?.seat === previous.viewer && prevRound.number === round?.number && prevRound.attempts.length === round.attempts.length;
    if (myDemo && !wasMyDemo) return music.play('turn');
    const newBids = round && prevRound?.number === round.number ? round.bids.slice(prevRound.bids.length) : [];
    if (newBids.some(bid => bid.seat !== view.viewer)) return music.play('notify');
}

function render() {
    const view = app.view;
    if (!view) return;
    fitLayout();
    renderTopbar(view);
    renderBoard(view);
    renderStatus(view);
    renderPlayers(view);
    renderControls(view);
}

function renderTopbar(view) {
    const done = view.rounds.length;
    $('#round-label').textContent = view.phase === 'end'
        ? (app.controller.isReplay ? 'リプレイ' : '終了')
        : `${app.controller.isReplay ? 'リプレイ ' : ''}目標 ${Math.min(done + 1, view.targetTotal)}/${view.targetTotal}`;
    $('#hint').hidden = Boolean(app.controller.isOnline || app.controller.isReplay);
}

// ロボットの今の表示位置（実演を見せている間・試し動かしの間は、画面の中の位置）
function displayRobots(view) {
    if (app.anim) return app.anim.robots;
    if (app.trial && interaction(view)) return app.trial.robots;
    return view.robots;
}

// 今、盤面で何ができるか：'solo'（1人の練習で動かす）・'trial'（試し動かし）・'demo'（自分の実演）・null
function interaction(view) {
    const round = view?.round;
    if (!round || view.phase === 'end' || app.controller?.isReplay || app.anim) return null;
    if (!revealed(view)) return null;
    if (view.mode === 'solo') return round.phase === 'solve' ? 'solo' : null;
    if (['search', 'countdown'].includes(round.phase)) return 'trial';
    if (round.phase === 'demo' && round.demo.seat === view.viewer) return 'demo';
    return null;
}

function renderBoard(view) {
    const board = $('#board');
    const key = view.board.walls.join('') + view.robots.length;
    if (app.boardKey !== key) {
        app.boardKey = key;
        board.innerHTML = staticBoard(view);
        $('#layer-robots').innerHTML = robotElements(view.robots.length);
        app.robotCells = [];
    }
    const round = view.round;
    const showTarget = round && revealed(view) && view.phase !== 'end';
    // 目標の印：今の目標を光らせ、使った目標は薄く
    const used = new Set(view.rounds.map(done => done.target));
    board.querySelectorAll('.target').forEach(el => {
        const id = Number(el.dataset.target);
        el.classList.toggle('current', Boolean(showTarget) && id === round.target);
        el.classList.toggle('used', used.has(id) && !(showTarget && id === round.target));
    });
    $('#center-target').innerHTML = showTarget ? targetMark(round.target, 1.35) : '<text class="center-q" y="3">?</text>';

    const mode = interaction(view);
    const robots = displayRobots(view);
    placeRobots(robots);
    board.querySelectorAll('.robot').forEach(el => {
        const robot = Number(el.dataset.robot);
        el.classList.toggle('selected', mode !== null && robot === app.selected);
        el.classList.toggle('recommended', mode !== null && app.hint?.round === round?.number && app.hint.robot === robot && !(app.trial?.moves.length));
    });

    // 道筋：実演を見せている間はその手、試し動かしの間は試した手、1人の練習は動かした手
    let trail = [];
    if (app.anim) trail = app.anim.path;
    else if (app.trial && mode) trail = applyMoves(view.board.walls, view.robots, app.trial.moves).path;
    else if (view.mode === 'solo' && round) trail = applyMoves(view.board.walls, round.startRobots, round.moves).path;
    $('#layer-trail').innerHTML = trailPath(trail);
    // 影：試し動かしで動かしたロボットの、本当の位置
    const moved = robots.map((cell, i) => cell !== view.robots[i]);
    $('#layer-ghosts').innerHTML = app.trial && mode && !app.anim ? ghostRobots(view.robots, moved) : '';
    // 矢印：選んだロボットの、動ける向き
    let overlay = '';
    if (mode && app.selected !== null && app.selected < robots.length) {
        const targets = [0, 1, 2, 3].map(dir => ({ dir, to: slide(view.board.walls, robots, app.selected, dir) }));
        const recommendedDir = app.hint?.round === round.number && app.hint.robot === app.selected && !(app.trial?.moves.length) ? app.hint.dir : null;
        overlay = arrowsFor(robots[app.selected], targets, recommendedDir);
    }
    $('#layer-overlay').innerHTML = overlay;
    board.classList.toggle('interactive', Boolean(mode));
}

// ロボットを動かす（滑る距離に合わせて時間を変える）
function placeRobots(robots) {
    document.querySelectorAll('#layer-robots .robot').forEach(el => {
        const robot = Number(el.dataset.robot);
        const cell = robots[robot];
        const before = app.robotCells[robot];
        if (before === cell) return;
        const [cx, cy] = centerOf(cell);
        const distance = before === undefined ? 0 : Math.abs((before % SIZE) - (cell % SIZE)) + Math.abs(Math.floor(before / SIZE) - Math.floor(cell / SIZE));
        el.style.transitionDuration = reducedMotion.matches || before === undefined ? '0ms' : `${Math.min(380, 90 + distance * 24)}ms`;
        el.style.transform = `translate(${cx}px, ${cy}px)`;
        app.robotCells[robot] = cell;
    });
}

function nameOf(view, seat) {
    return seat === view.viewer ? 'あなた' : view.players[seat]?.name ?? '';
}

function renderStatus(view) {
    const round = view.round;
    const icon = $('#status-target');
    let text = '';
    const showTarget = round && revealed(view) && view.phase !== 'end';
    const lastRound = view.rounds[view.rounds.length - 1];
    icon.innerHTML = showTarget ? targetIcon(round.target) : lastRound && view.phase !== 'end' ? targetIcon(lastRound.target) : '';
    if (view.phase === 'end') {
        text = 'ゲーム終了';
    } else if (!round) {
        text = '';
    } else if (!revealed(view)) {
        const last = view.rounds[view.rounds.length - 1];
        if (last && view.mode === 'race') {
            text = last.winner === null ? '流れました。次の目標へ' : `${escapeHtml(nameOf(view, last.winner))}がチップを獲得`;
        } else {
            text = '次の目標をめくります';
        }
    } else if (view.mode === 'solo') {
        const name = targetInfo(round.target).name;
        if (round.phase === 'solve') text = `${escapeHtml(name)}へ　<b>${round.moves.length}</b>手`;
        else text = round.solved ? `${round.moves.length}手（最短 ${round.optimum ?? '?'}手）<b>+${round.points}点</b>` : `最短は ${round.optimum ?? '?'}手でした`;
    } else if (round.phase === 'search') {
        text = `${escapeHtml(targetInfo(round.target).name)}：手順を探そう`;
    } else if (round.phase === 'countdown') {
        const low = lowestBid(round);
        text = `いちばん少ない宣言 <b>${low.count}手</b>（${escapeHtml(nameOf(view, low.seat))}）`;
    } else if (round.phase === 'demo') {
        const { seat, count } = round.demo;
        text = seat === view.viewer ? `あなたの実演：<b>${count}手</b>以内で` : `${escapeHtml(nameOf(view, seat))}が<b>${count}手</b>で実演`;
    }
    $('#status-text').innerHTML = text;
    updateClock();
}

function lowestBid(round) {
    let best = null;
    for (const bid of round.bids) if (!best || bid.count < best.count) best = bid;
    return best;
}

// 時計：0.2秒ごとに、残り時間と経過時間を描き直す。目標をめくる時刻を過ぎたら描き直す
function updateClock() {
    const view = app.view;
    const timer = $('#timer');
    if (!view || app.scene !== 'game') return;
    const round = view.round;
    const now = gameNow();
    let text = '';
    let urgent = false;
    if (round && view.phase !== 'end') {
        if (now < round.revealAt) {
            text = String(Math.ceil((round.revealAt - now) / 1000));
        } else if (view.mode === 'solo') {
            text = formatTime((round.phase === 'solve' ? now : round.endAt) - round.revealAt);
        } else if (round.phase === 'countdown' || round.phase === 'demo') {
            const deadline = round.phase === 'demo' ? round.demo.deadline : round.deadline;
            const left = Math.max(0, deadline - now);
            text = `${Math.ceil(left / 1000)}`;
            urgent = left < 10000;
        } else if (round.phase === 'search') {
            text = formatTime(now - round.revealAt).replace(/\.\d$/, '');
        }
    }
    timer.textContent = text;
    timer.classList.toggle('urgent', urgent);
    timer.classList.toggle('countdown', round?.phase === 'countdown' && revealed(view));
    // めくる時刻を過ぎた
    if (round && revealed(view) && app.revealedRound !== round.number && view.phase !== 'end') {
        app.revealedRound = round.number;
        app.selected = null;
        if (round.revealAt > (view.startAt ?? 0)) music.play('draw');
        render();
    }
    onlineTick(view, now);
}

// オンライン：CPU の宣言・砂時計の時間切れは、届いたメッセージでサーバーが確かめるので、数秒ごとに知らせる
function onlineTick(view, now) {
    const controller = app.controller;
    if (!controller?.isOnline || view.phase === 'end' || !view.round) return;
    const round = view.round;
    const deadline = round.phase === 'demo' ? round.demo?.deadline : round.deadline;
    const hasCpu = view.players.some(player => player.isCPU);
    const waiting = ['search', 'countdown'].includes(round.phase) && hasCpu;
    const expired = Number.isFinite(deadline) && now >= deadline;
    if ((waiting || expired) && Date.now() - app.lastTick > TICK_MS) {
        app.lastTick = Date.now();
        controller.net.send('tick', {});
    }
}

function renderPlayers(view) {
    const round = view.round;
    if (view.mode === 'solo') {
        const points = view.rounds.reduce((sum, done) => sum + (done.points ?? 0), 0);
        const time = view.rounds.reduce((sum, done) => sum + (done.time ?? 0), 0);
        const best = app.controller.isReplay ? null : bestRecord();
        $('#players').innerHTML = `<div class="player solo"><span class="pname">点</span><span class="pscore">${points}</span><span class="pmeta">タイム ${formatTime(time)}</span>${best ? `<span class="pmeta">ベスト ${best.points}点</span>` : ''}</div>`;
        return;
    }
    $('#players').innerHTML = view.players.map(player => {
        const demo = round?.phase === 'demo' && round.demo.seat === player.seat;
        const bid = player.bid !== null && round && round.phase !== 'done' && revealed(view) ? `<span class="bid">${player.bid}手</span>` : '';
        const passed = player.done && ['search', 'countdown'].includes(round?.phase) && revealed(view) ? '<span class="passed">✓</span>' : '';
        return `<div class="player${player.seat === view.viewer ? ' me' : ''}${demo ? ' demo' : ''}">
            <span class="pname">${escapeHtml(nameOf(view, player.seat))}</span>
            <span class="pchips" aria-label="チップ ${player.score}">${player.chips.slice(-3).map(id => targetIcon(id, 'chip')).join('')}<b>${player.score}</b></span>
            ${bid}${passed}
        </div>`;
    }).join('');
}

// ===== 操作の欄 =====

function renderControls(view) {
    const controls = $('#controls');
    const controller = app.controller;
    const round = view.round;
    if (controller.isReplay) {
        controls.innerHTML = `<div class="row replay-bar">
            <button type="button" class="btn btn-secondary" data-action="replay-pause">${controller.userPaused ? '再生' : '停止'}</button>
            ${ReplayController.SPEEDS.map(speed => `<button type="button" class="btn chip-btn${controller.speed === speed ? ' on' : ''}" data-action="replay-speed" data-speed="${speed}">×${speed}</button>`).join('')}
            <button type="button" class="btn btn-primary" data-action="replay-end">終了</button>
        </div><p class="controls-note">${controller.finished ? 'リプレイが終わりました' : '記録した時刻どおりに再生しています（長い待ちは詰めます）'}</p>`;
        return;
    }
    if (view.phase === 'end') {
        controls.innerHTML = '<div class="row"><button type="button" class="btn btn-primary wide" data-action="result">結果を見る</button></div>';
        return;
    }
    if (!round) {
        controls.innerHTML = '';
        return;
    }
    if (!revealed(view)) {
        controls.innerHTML = view.rounds.length ? roundSummary(view, view.rounds[view.rounds.length - 1]) : '<p class="controls-note big">まもなく最初の目標をめくります</p>';
        return;
    }
    const mode = interaction(view);
    if (view.mode === 'solo') {
        if (round.phase === 'solve') {
            controls.innerHTML = `${trialTools(round.moves.length, 'solo')}
                <div class="row"><button type="button" class="btn btn-secondary" data-action="giveup">あきらめる</button></div>
                <p class="controls-note">ロボットを押して矢印へ。払っても動きます</p>`;
        } else {
            controls.innerHTML = `<div class="row"><button type="button" class="btn btn-primary wide" data-action="next">${view.rounds.length >= view.targetTotal ? '結果へ' : '次の目標'}</button></div>`;
        }
        return;
    }
    if (mode === 'trial') {
        const me = view.players[view.viewer];
        const trialCount = app.trial?.moves.length ?? 0;
        if (round.done[view.viewer]) {
            controls.innerHTML = `${trialTools(trialCount, 'trial')}<p class="controls-note big">宣言を終えました（${me.bid ? `${me.bid}手` : 'パス'}）。ほかの人を待っています</p>`;
            return;
        }
        const foundCount = app.found?.round === round.number ? app.found.moves.length : null;
        const numbers = [...Array(MAX_BID).keys()].map(i => {
            const count = i + 1;
            const disabled = me.bid !== null && count >= me.bid;
            return `<button type="button" class="num${count === foundCount ? ' found' : ''}" data-action="declare" data-count="${count}"${disabled ? ' disabled' : ''}>${count}</button>`;
        }).join('');
        controls.innerHTML = `${trialTools(trialCount, 'trial')}
            <div class="numpad" role="group" aria-label="手数を宣言">${numbers}</div>
            <div class="row"><span class="controls-note">${me.bid ? `宣言：${me.bid}手。もっと少なくもできます` : '見つけたら手数を押して宣言'}</span><button type="button" class="btn btn-secondary small" data-action="pass">パス</button></div>`;
        return;
    }
    if (mode === 'demo') {
        const count = app.trial?.moves.length ?? 0;
        const foundOk = app.found?.round === round.number && app.found.moves.length <= round.demo.count;
        controls.innerHTML = `${trialTools(count, 'demo', round.demo.count)}
            <div class="row">
                ${foundOk ? `<button type="button" class="btn btn-primary" data-action="use-found">試した手順（${app.found.moves.length}手）で実演</button>` : ''}
                <button type="button" class="btn btn-secondary" data-action="concede">あきらめる</button>
            </div>
            <p class="controls-note">${count >= round.demo.count ? '手数を使い切りました。「最初から」でやり直せます' : 'ロボットを動かして、目標に止めてください'}</p>`;
        return;
    }
    let note = '';
    if (round.phase === 'demo') note = `${escapeHtml(nameOf(view, round.demo.seat))}の実演を待っています`;
    controls.innerHTML = `<p class="controls-note big">${note}</p>`;
}

// 目標の間：前の目標の宣言・実演と、最短の手数
function roundSummary(view, last) {
    const best = solve(view.board.walls, last.startRobots, last.target, last.cell);
    const lines = last.attempts.map(attempt => `<li>${escapeHtml(nameOf(view, attempt.seat))}：${attempt.count}手と宣言 → ${attempt.success ? `<b>${attempt.moves.length}手で成功</b>` : attempt.timeout ? '時間切れ' : attempt.moves.length ? '失敗' : 'あきらめた'}</li>`);
    if (!lines.length) lines.push('<li>だれも宣言しませんでした</li>');
    return `<ul class="summary">${lines.join('')}</ul><p class="controls-note">最短は ${best ? `<b>${best.count}手</b>` : '?'}でした。まもなく次の目標をめくります</p>`;
}

function trialTools(count, kind, limit = null) {
    const label = kind === 'trial' ? '試し' : kind === 'demo' ? '実演' : '手数';
    return `<div class="row tools">
        <button type="button" class="btn tool" data-action="undo" aria-label="1手戻す"${count ? '' : ' disabled'}><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>戻す</button>
        <button type="button" class="btn tool" data-action="reset" aria-label="最初から"${count ? '' : ' disabled'}><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>最初から</button>
        <span class="trial-count">${label} <b>${count}</b>${limit ? ` / ${limit}` : ''}手</span>
    </div>`;
}

// ===== 盤面の操作 =====

function select(robot) {
    if (app.selected === robot) return;
    app.selected = robot;
    music.play('select');
    renderBoard(app.view);
}

function doMove(robot, dir) {
    const view = app.view;
    const mode = interaction(view);
    if (!mode || robot === null || robot === undefined) return;
    const round = view.round;
    if (mode === 'solo') {
        app.controller.send({ type: 'move', robot, dir });
        return;
    }
    const trial = app.trial;
    if (!trial) return;
    if (mode === 'demo' && trial.moves.length >= round.demo.count) {
        music.play('error');
        showNote('手数を使い切りました。「最初から」でやり直せます');
        return;
    }
    const to = slide(view.board.walls, trial.robots, robot, dir);
    if (to === trial.robots[robot]) {
        music.play('error');
        return;
    }
    trial.robots[robot] = to;
    trial.moves.push([robot, dir]);
    music.play('place');
    if (reached(round.target, round.cell, trial.robots)) {
        if (mode === 'demo') {
            app.controller.send({ type: 'demo', moves: trial.moves.map(move => [...move]) });
        } else {
            const best = app.found?.round === round.number ? app.found.moves.length : Infinity;
            if (trial.moves.length < best) app.found = { round: round.number, moves: trial.moves.map(move => [...move]) };
            showNote(`${trial.moves.length}手で着きました`);
        }
    }
    renderBoard(view);
    renderControls(view);
}

function trialUndo() {
    const view = app.view;
    const mode = interaction(view);
    if (mode === 'solo') return app.controller.send({ type: 'undo' });
    if (!app.trial?.moves.length) return;
    app.trial.moves.pop();
    app.trial.robots = applyMoves(view.board.walls, view.robots, app.trial.moves).robots;
    music.play('cancel');
    renderBoard(view);
    renderControls(view);
}

function trialReset() {
    const view = app.view;
    const mode = interaction(view);
    if (mode === 'solo') return app.controller.send({ type: 'reset' });
    if (!app.trial?.moves.length) return;
    app.trial.moves = [];
    app.trial.robots = [...view.robots];
    music.play('cancel');
    renderBoard(view);
    renderControls(view);
}

// 盤面の座標（SVG の単位）
function boardPoint(event) {
    const svg = $('#board');
    const rect = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    return [(event.clientX - rect.left) / rect.width * box.width + box.x, (event.clientY - rect.top) / rect.height * box.height + box.y];
}

function onBoardDown(event) {
    const view = app.view;
    if (!interaction(view)) return;
    const arrow = event.target.closest('.arrow');
    if (arrow && app.selected !== null) {
        event.preventDefault();
        doMove(app.selected, Number(arrow.dataset.dir));
        return;
    }
    const [x, y] = boardPoint(event);
    const cx = Math.floor(x / UNIT);
    const cy = Math.floor(y / UNIT);
    const robots = displayRobots(view);
    const robot = cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE ? robots.indexOf(cy * SIZE + cx) : -1;
    app.drag = { robot: robot >= 0 ? robot : app.selected, onRobot: robot >= 0, x: event.clientX, y: event.clientY };
    if (robot >= 0) select(robot);
    $('#board').setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function onBoardUp(event) {
    const drag = app.drag;
    app.drag = null;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const cellPx = $('#board').getBoundingClientRect().width / 16.2;
    if (Math.hypot(dx, dy) >= Math.max(14, cellPx * 0.6) && drag.robot !== null) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
        doMove(drag.robot, dir);
    } else if (!drag.onRobot && app.selected !== null) {
        app.selected = null;
        renderBoard(app.view);
    }
}

function onKey(event) {
    if (app.scene !== 'game' || document.querySelector('dialog[open]')) return;
    const view = app.view;
    if (!interaction(view)) return;
    const number = Number(event.key);
    if (number >= 1 && number <= view.robots.length) return select(number - 1);
    const dir = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[event.key];
    if (dir !== undefined && app.selected !== null) {
        event.preventDefault();
        doMove(app.selected, dir);
    }
    if (event.key === 'Backspace') trialUndo();
}

// ===== ヒント =====

function openHint() {
    const view = app.view;
    const round = view?.round;
    const open = round && revealed(view) && (view.mode === 'solo' ? round.phase === 'solve' : ['search', 'countdown'].includes(round.phase) && !round.done[view.viewer]);
    if (!open) return showNote('目標をめくって、考えている間に使えます');
    openDialog($('#hint-dialog'));
}

function useHint(kind) {
    $('#hint-dialog').close();
    const result = app.controller.hint(kind);
    if (!result) return;
    if (!result.solution) return showNote('最短の手順が見つかりませんでした');
    const view = app.view;
    if (kind === 'count') return showNote(`最短は ${result.solution.count}手です`);
    const [robot, dir] = result.solution.moves[0];
    // 早解きは、目標をめくったときの位置からの1手なので、試し動かしを戻して見せる
    if (app.trial?.moves.length) {
        app.trial.moves = [];
        app.trial.robots = [...view.robots];
    }
    app.hint = { round: view.round.number, robot, dir };
    app.selected = robot;
    render();
    showNote(`最初の1手：${ROBOT_NAMES[robot]}を${DIR_NAMES[dir]}へ`);
}

// ===== 終局と結果 =====

// ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
// ひとり用の練習は勝ち負けがないので回数だけ。id はシードから作る（同じ対戦を2回数えない）
function recordLocalResult(view, controller) {
    if (controller.isOnline || controller.isReplay || !controller.setup?.seed) return;
    const outcome = view.mode === 'solo' ? null : outcomeFromWinners(view.result?.winners, view.viewer, view.players.length);
    recordResult({ game: 'ricochet-robots', id: `ricochet-robots-${controller.setup.seed}`, outcome });
}

function onGameEnd(view) {
    const controller = app.controller;
    recordLocalResult(view, controller);
    if (view.mode === 'solo' && !controller.isReplay && !controller.isOnline) {
        const best = bestRecord();
        const { points, time } = view.result;
        if (!best || points > best.points || (points === best.points && time < best.time)) {
            storage.save(bestKey(), { points, time });
            app.newRecord = true;
        }
    }
    setTimeout(() => {
        if (app.view === view || app.view?.phase === 'end') showResult();
    }, controller.isReplay ? 600 : 1600);
}

function showResult() {
    const view = app.view;
    if (!view?.result || app.scene !== 'game') return;
    hideToast();
    const controller = app.controller;
    $('#result-replay').hidden = Boolean(controller.isOnline) || !LocalGameController.loadRecord();
    if (view.mode === 'solo') {
        const { points, max, time, optimal, rounds } = view.result;
        $('#result-title').textContent = app.newRecord ? 'ベスト更新' : '練習の結果';
        const best = bestRecord();
        $('#result-body').innerHTML = `<div class="solo-result">
            <p class="big-score">${points}<small> / ${max}点</small></p>
            <p>最短で着いた目標 ${optimal} / ${rounds}・タイム ${formatTime(time)}</p>
            ${best ? `<p class="muted">ベスト：${best.points}点・${formatTime(best.time)}</p>` : ''}
            <ol class="solo-rounds">${view.rounds.map(round => `<li>${targetIcon(round.target, 'chip')}<span>${round.solved ? `${round.moves.length}手（最短 ${round.optimum ?? '?'}）` : 'あきらめた'}</span><span>${formatTime(round.time)}</span><b>+${round.points}</b></li>`).join('')}</ol>
        </div>`;
    } else {
        const { standings, winners } = view.result;
        const title = winners.length > 1 ? '同点' : winners[0] === view.viewer ? 'あなたの勝ち' : `${nameOf(view, winners[0])}の勝ち`;
        $('#result-title').textContent = title;
        $('#result-body').innerHTML = `<ol class="standings">${standings.map(entry => `<li class="${entry.seat === view.viewer ? 'me' : ''}">
            <span class="rank">${entry.rank}</span>
            <span class="who"><span class="pname">${escapeHtml(nameOf(view, entry.seat))}</span>
                <span class="detail">${view.players[entry.seat].chips.map(id => targetIcon(id, 'chip')).join('')}${entry.penalty ? `<span class="minus">ヒント -${entry.penalty}</span>` : ''}</span></span>
            <span class="total">${entry.score}</span>
        </li>`).join('')}</ol>`;
    }
    openDialog($('#result-dialog'));
}

// ===== 記録・知らせ =====

function showLog() {
    const logs = app.view?.logs ?? [];
    $('#log-list').innerHTML = logs.length
        ? logs.map(entry => `<li><span class="log-time">${formatTime(entry.at).replace(/\.\d$/, '')}</span>${escapeHtml(entry.text)}</li>`).join('')
        : '<li>まだ記録はありません</li>';
    openDialog($('#log'));
    $('#log-list').scrollTop = $('#log-list').scrollHeight;
}

function showNote(text) {
    const toast = $('#toast');
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
    clearTimeout(app.toastTimer);
    $('#toast').hidden = true;
}

function openDialog(dialog) {
    if (!app.controller?.isOnline) app.controller?.pause?.();
    if (!dialog.open) dialog.showModal();
}

function onDialogClose() {
    if (!document.querySelector('dialog[open]')) app.controller?.resume?.();
}

// ===== 大きさ =====

// 一番小さい画面（360×640、375×548）でもスクロールなしで収まるように、盤面の大きさを決める
function fitLayout() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const wide = width >= 720 && width > height * 1.15;
    document.body.classList.toggle('wide', wide);
    const size = wide
        ? Math.min(height - 44 - 20, width - 380 - 36, 760)
        : Math.min(width - 12, height - 44 - 36 - 36 - 132 - 22, 600);
    document.documentElement.style.setProperty('--board', `${Math.max(200, Math.floor(size))}px`);
}

// ===== 初期化 =====

function init() {
    $('#title-art').innerHTML = titleArt();
    $('#help-art').innerHTML = titleArt();

    const segments = { 'mode-select': 'mode', 'count-select': 'count', 'level-select': 'level', 'targets-select': 'targets', 'silver-select': 'silver' };
    for (const [id, key] of Object.entries(segments)) {
        $(`#${id}`).addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            const value = button.dataset.value;
            app.settings[key] = ['count', 'targets'].includes(key) ? Number(value) : value;
            storage.save('settings', app.settings);
            music.play('select');
            renderTitle();
        });
    }
    $('#start-button').addEventListener('click', () => startGame(newSetup()));
    $('#online-button').addEventListener('click', () => app.online?.open());
    $('#resume-button').addEventListener('click', () => {
        const saved = LocalGameController.loadSaved();
        if (saved) startGame(saved);
    });

    const board = $('#board');
    board.addEventListener('pointerdown', onBoardDown);
    board.addEventListener('pointerup', onBoardUp);
    board.addEventListener('pointercancel', () => { app.drag = null; });
    document.addEventListener('keydown', onKey);

    document.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        const action = button?.dataset.action;
        if (!action || button.disabled) return;
        const controller = app.controller;
        switch (action) {
            case 'home': goHome(); break;
            case 'help': openDialog($('#help-dialog')); break;
            case 'close-help': $('#help-dialog').close(); break;
            case 'hint': openHint(); break;
            case 'hint-first': useHint('first'); break;
            case 'hint-count': useHint('count'); break;
            case 'close-hint': $('#hint-dialog').close(); break;
            case 'log': showLog(); break;
            case 'close-log': $('#log').close(); break;
            case 'result': showResult(); break;
            case 'close-result': $('#result-dialog').close(); break;
            case 'undo': trialUndo(); break;
            case 'reset': trialReset(); break;
            case 'giveup': controller?.send({ type: 'giveup' }); break;
            case 'next': controller?.send({ type: 'next' }); break;
            case 'pass': controller?.send({ type: 'pass' }); break;
            case 'declare':
                if (controller?.send({ type: 'declare', count: Number(button.dataset.count) })) music.play('select');
                break;
            case 'use-found':
                if (app.found) controller?.send({ type: 'demo', moves: app.found.moves.map(move => [...move]) });
                break;
            case 'concede': controller?.send({ type: 'demo', moves: [] }); break;
            case 'replay': {
                const record = LocalGameController.loadRecord();
                if (record) beginGame(new ReplayController(record, { onUpdate: () => update() }));
                break;
            }
            case 'replay-pause': controller?.togglePause?.(); render(); break;
            case 'replay-speed': controller?.setSpeed?.(Number(button.dataset.speed)); render(); break;
            case 'replay-end': goHome(); break;
            case 'rematch':
                $('#result-dialog').close();
                if (controller?.isOnline) {
                    app.online.rematch(); // ロビーを出し、ホストの「開始」で再戦する
                } else {
                    const setup = controller?.setup;
                    startGame(setup ? { mode: setup.mode, players: setup.players, level: setup.level, targets: setup.targets, silver: setup.silver } : newSetup());
                }
                break;
        }
    });

    for (const dialog of document.querySelectorAll('dialog')) {
        dialog.addEventListener('close', onDialogClose);
        // 外側のタップで閉じる
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
    }

    // 長押しのメニューと、2本指の拡大を止める
    document.addEventListener('contextmenu', event => {
        if (!event.target.closest('input, textarea')) event.preventDefault();
    });
    document.addEventListener('gesturestart', event => event.preventDefault());

    window.addEventListener('resize', () => {
        if (app.view && app.scene === 'game') render();
    });
    // 閉じる前に時計を保存する（続きから、で同じ残り時間から始める）
    window.addEventListener('pagehide', () => {
        if (!app.controller?.isOnline && !app.controller?.isReplay) app.controller?.persist?.();
    });
    setInterval(updateClock, 200);

    showScene('title');
    setupOnline();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').then(registration => {
            const worker = registration.active || registration.waiting || registration.installing;
            const urls = performance.getEntriesByType('resource').map(entry => entry.name).concat(location.href);
            const send = target => target?.postMessage({ type: 'cache-urls', urls });
            if (worker?.state === 'activated') send(worker);
            else navigator.serviceWorker.ready.then(ready => send(ready.active));
        }).catch(() => {});
    }

    // 確認用（画面の確認スクリプトから状態を見る）
    window.__app = app;
}

init();
