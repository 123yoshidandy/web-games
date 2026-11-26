/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 操作：下の行動タイルを押して選ぶ
 * - 刑事を進める：光る行き先（1マス先・2マス先）を押す
 * - ジョーカー：盤の刑事を押してから、光る1マス先を押す（ジャック側は「動かさない」も選べる）
 * - 回転：タイルを押すたびに、右回りに向きが変わる
 * - 入れ替え：タイルを2枚押す
 * - アリバイ：そのまま「決定」
 * 下書きは盤に点線で出し、「決定」で確定する。今の盤で刑事から見える容疑者には、目の印を付ける
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { JACK, DETECTIVE, visibleSuspects, wallOf, pickOrder } from './game.js';
import { SUSPECTS, DETECTIVES, TOKENS, ACTION_NAMES, ROUNDS, HOURGLASSES_TO_WIN } from './data.js';
import { TRACK, spaceCell } from './board.js';
import { symbolsSvg, icon, districtShape, detectiveShape, actionIcon, portraitSvg } from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const SETTINGS_KEY = 'mr-jack-pocket.settings';
const RESULT_DELAY_MS = 1400;
const CPU_ACTION_DELAY_MS = 900; // game-controller.js と同じ（オンラインの CPU の間）
const NAME = Object.fromEntries(SUSPECTS.map(s => [s.key, s.name]));
const DET_NAME = Object.fromEntries(DETECTIVES.map(d => [d.key, d.name]));
const ROLE_NAME = ['ジャック側', '刑事側'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const tileXY = (pos) => ({ x: 10 + (pos % 3) * 10, y: 10 + Math.floor(pos / 3) * 10 });
const spaceXY = (space) => {
    const { row, col } = spaceCell(space);
    return { x: col * 10 + 5, y: row * 10 + 5 };
};

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            role: saved.role === DETECTIVE ? DETECTIVE : JACK,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { role: JACK, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.sel = null;   // { action, who, steps, tile, rot, a, b }
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。2人で、足りない席は CPU
        this.online = new NetplayLobby({
            title: 'ミスター・ジャック・ポケット',
            game: 'mr-jack-pocket',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_ACTION_DELAY_MS,
            minPlayers: 2,
            maxPlayers: 2,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onControllerUpdate(),
            onError: (message) => this.onControllerError(message),
            onExit: () => {
                this.stopGame();
                this.showTitle();
            }
        });
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelp();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderSetup();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.onControllerUpdate(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.beginGame(controller);
        controller.scheduleCpu();
    }

    onControllerUpdate() {
        this.render();
        this.updateSound();
    }

    onControllerError(message) {
        music.play('error');
        this.toast(message);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        this.sel = null;
        this.resultShown = false;
        $('#toast').classList.remove('show');
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView()?.events.at(-1)?.seq ?? 0;
        this.view = null;
        this.render();
        this.wasMine = this.myTurn();
        this.endSounded = this.view?.phase === 'end';
    }

    newGame() {
        const { role, level } = this.settings;
        const me = { name: 'あなた', isCPU: false };
        const cpu = { name: 'CPU', isCPU: true, cpuLevel: level };
        this.startGame({ players: role === JACK ? [me, cpu] : [cpu, me], options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        const segment = (selector, attr, apply) => $(selector).addEventListener('click', (event) => {
            const button = event.target.closest(`button[${attr}]`);
            if (!button) return;
            apply(button.getAttribute(attr));
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#role', 'data-role', (v) => { this.settings.role = Number(v); });
        segment('#cpu-level', 'data-level', (v) => { this.settings.level = v; });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (this.controller?.isOnline) {
                $('#result').close();
                this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
                return;
            }
            this.newGame();
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#result-board').addEventListener('click', () => $('#result').close());
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hint').addEventListener('click', () => this.showHint());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#board').addEventListener('click', (event) => this.tapBoard(event));
        $('#actions').addEventListener('click', (event) => this.tapActions(event));
    }

    myTurn() {
        const v = this.view;
        return !!v && v.phase !== 'end' && v.answering.includes(v.you);
    }

    // ---- 選ぶ ----

    tapActions(event) {
        const b = event.target.closest('button');
        if (!b || b.disabled || !this.myTurn()) return;
        if (b.dataset.act === 'confirm') {
            const command = this.pendingCommand();
            this.sending = true;
            const ok = command && this.controller.send(command);
            this.sending = false;
            if (ok) {
                this.sel = null;
                this.hintAction = null;
                if (this.view.phase !== 'end') music.play(command.type === 'alibi' ? 'draw' : 'place');
            }
            this.render();
            return;
        }
        if (b.dataset.act === 'stay') {
            music.play('select');
            this.sel = { action: 'joker', who: 'holmes', steps: 0 };
            this.render();
            return;
        }
        const action = b.dataset.action;
        if (!action) return;
        if (action !== this.hintAction) this.hintAction = null;
        music.play(this.sel?.action === action ? 'cancel' : 'select');
        this.sel = this.sel?.action === action ? null : { action };
        this.render();
    }

    tapBoard(event) {
        if (!this.myTurn() || !this.sel) return;
        const p = this.toBoard(event);
        if (!p) return;
        const col = Math.floor(p.x / 10);
        const row = Math.floor(p.y / 10);
        const s = this.sel;
        const v = this.view;
        const inside = row >= 1 && row <= 3 && col >= 1 && col <= 3;
        const pos = inside ? (row - 1) * 3 + (col - 1) : null;
        const space = inside ? null : [...Array(TRACK).keys()].find(k => {
            const c = spaceCell(k);
            return c.row === row && c.col === col;
        }) ?? null;
        if (['holmes', 'watson', 'toby'].includes(s.action)) {
            if (space === null) return;
            const steps = (space - v.detectives[s.action] + TRACK) % TRACK;
            if (steps === 1 || steps === 2) s.steps = steps;
        } else if (s.action === 'joker') {
            if (space === null) return;
            const here = DETECTIVES.filter(d => v.detectives[d.key] === space).map(d => d.key);
            if (here.length) {
                // 同じマスに何人かいれば、押すたびに順に選ぶ
                const i = here.indexOf(s.who);
                s.who = here[(i + 1) % here.length];
                s.steps = undefined;
            } else if (s.who && (space - v.detectives[s.who] + TRACK) % TRACK === 1) {
                s.steps = 1;
            }
        } else if (s.action === 'rotate') {
            if (pos === null || v.rotated.includes(pos)) return;
            if (s.tile !== pos) {
                s.tile = pos;
                s.rot = (v.tiles[pos].rot + 1) % 4;
            } else {
                s.rot = (s.rot + 1) % 4;
                if (s.rot === v.tiles[pos].rot) s.rot = (s.rot + 1) % 4;
            }
        } else if (s.action === 'exchange') {
            if (pos === null) return;
            if (s.a === undefined || (s.a !== undefined && s.b !== undefined)) {
                s.a = pos;
                s.b = undefined;
            } else if (pos === s.a) {
                s.a = undefined;
            } else {
                s.b = pos;
            }
        }
        music.play('select');
        this.render();
    }

    toBoard(event) {
        const m = $('#board').getScreenCTM();
        if (!m) return null;
        const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
        return { x: pt.x, y: pt.y };
    }

    pendingCommand() {
        const s = this.sel;
        if (!s) return null;
        if (['holmes', 'watson', 'toby'].includes(s.action)) return s.steps ? { type: 'move', who: s.action, steps: s.steps } : null;
        if (s.action === 'joker') return s.who && s.steps !== undefined ? { type: 'joker', who: s.who, steps: s.steps } : null;
        if (s.action === 'rotate') return s.tile !== undefined ? { type: 'rotate', tile: s.tile, rot: s.rot } : null;
        if (s.action === 'exchange') return s.a !== undefined && s.b !== undefined ? { type: 'exchange', a: s.a, b: s.b } : null;
        if (s.action === 'alibi') return { type: 'alibi' };
        return null;
    }

    // 下書きを当てた盤（タイルと刑事）
    previewBoard() {
        const v = this.view;
        const tiles = v.tiles.map(t => ({ ...t }));
        const detectives = { ...v.detectives };
        const c = this.pendingCommand();
        if (c?.type === 'move' || c?.type === 'joker') detectives[c.who] = (detectives[c.who] + c.steps) % TRACK;
        if (c?.type === 'rotate') tiles[c.tile].rot = c.rot;
        if (c?.type === 'exchange') [tiles[c.a], tiles[c.b]] = [tiles[c.b], tiles[c.a]];
        return { tiles, detectives, command: c };
    }

    // ---- タイトル ----

    renderSetup() {
        const s = this.settings;
        document.querySelectorAll('#role button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.role) === s.role)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === s.level)));
    }

    renderTitleArt() {
        const tiles = [
            { suspect: 'madame', rot: 0, cleared: false }, { suspect: 'gull', rot: 2, cleared: true }, { suspect: 'lestrade', rot: 1, cleared: false }
        ];
        let body = '<rect class="track" x="0" y="0" width="50" height="20" rx="2"/>';
        tiles.forEach((t, i) => { body += districtShape(t, 10 + i * 10, 5, wallOf(t)); });
        body += detectiveShape('holmes', 5, 10) + detectiveShape('toby', 45, 10);
        $('#title-art').innerHTML = `<svg viewBox="0 0 50 20">${body}<rect class="fog" x="0" y="0" width="50" height="20"/></svg>`;
    }

    renderHelp() {
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>9人の容疑者のうち1人が切り裂きジャック。<strong>ジャック側</strong>は正体を隠して逃げ切り、<strong>刑事側</strong>は8ラウンドのうちに正体を突き止めます。</p>
            <h3>ラウンド</h3>
            <p>行動タイル4枚を、奇数ラウンドは刑事側1枚 → ジャック側2枚 → 刑事側1枚、偶数ラウンドはジャック側1枚 → 刑事側2枚 → ジャック側1枚の順に選んで使います。奇数ラウンドは4枚を投げて面を決め、偶数ラウンドは前のラウンドの4枚を裏返します。</p>
            <h3>行動</h3>
            <p><strong>ホームズ・ワトソン・トビー</strong>：その刑事を時計回りに1〜2マス。<strong>ジョーカー</strong>：どの刑事でも1マス（ジャック側は動かさなくてもよい）。<strong>回転</strong>：タイル1枚の向きを変える（そのラウンドに回したタイルは回せない）。<strong>入れ替え</strong>：タイル2枚を入れ替える。<strong>アリバイ</strong>：刑事側は引いた容疑者が無実に、ジャック側は伏せて持ち、札の砂時計を得る。</p>
            <h3>目撃</h3>
            <p>ラウンドの終わりに、刑事から通りをまっすぐ見て、壁にさえぎられずに見える容疑者を調べます。ジャックが見えていれば、見えていない容疑者が全員無実。見えていなければ、見えている容疑者が全員無実になり、ジャック側が砂時計を1つ得ます。目の印は、今の盤で見えている容疑者です。</p>
            <h3>勝ち</h3>
            <p>ラウンドの終わりに、残った容疑者がジャックだけなら刑事側の勝ち。ジャック側の砂時計（アリバイの分も含む）が6つになればジャック側の勝ち。両方を同時に満たしたらゲームは続き、そのあとジャックが見えたラウンドで刑事側の勝ち、8ラウンドの終わりまで見えなければジャック側の勝ち。8ラウンドで決まらなければジャック側の勝ちです。</p>
            <h3>操作</h3>
            <p>下の行動タイルを選び、盤の光る行き先やタイルを押して、「決定」。回転は、同じタイルを押すたびに向きが変わります。</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        if (!view) return;
        this.view = view;
        if (!this.myTurn()) this.sel = null;
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.renderStatus(view);
        this.renderInfo(view);
        this.renderBoard(view);
        this.renderNote(view);
        this.renderActions(view);
        $('#hint').disabled = !this.myTurn();
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        this.announce(view, fresh);
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    renderStatus(view) {
        let text;
        if (view.phase === 'end') text = '終わり';
        else text = `${view.answering.includes(view.you) ? 'あなたの番' : '相手の番'}`;
        const rounds = Array.from({ length: ROUNDS }, (_, i) => `<i class="${i + 1 < view.round ? 'done' : i + 1 === view.round ? 'now' : ''}"></i>`).join('');
        $('#status').innerHTML = `<span class="who">${ROLE_NAME[view.you]}・${text}</span><span class="rounds" aria-label="ラウンド ${view.round}/${ROUNDS}">${rounds}</span>`;
    }

    renderInfo(view) {
        const glass = view.totalHourglasses ?? view.hourglasses;
        const hidden = view.totalHourglasses === null && view.jackCardCount ? `<small>＋伏せた札${view.jackCardCount}枚</small>` : '';
        const glasses = Array.from({ length: HOURGLASSES_TO_WIN }, (_, i) => `<i class="${i < glass ? 'on' : ''}"></i>`).join('');
        let who = '';
        if (view.jack) {
            const cards = (view.jackCards ?? []).map(k => `<span class="card" title="${NAME[k]}">${portraitSvg(k)}<b>${SUSPECTS.find(s => s.key === k).hourglasses}</b></span>`).join('');
            who = `<span class="jack">${portraitSvg(view.jack)}<span class="label">ジャック</span></span>${cards}`;
        } else {
            const left = view.tiles.filter(t => !t.cleared).length;
            who = `<span class="left">容疑者 <b>${left}</b>人</span>`;
        }
        $('#info').innerHTML = `<span class="glass" title="砂時計">${icon('hourglass')}<span class="pips">${glasses}</span>${hidden}</span>${who}`;
    }

    renderBoard(view) {
        const { tiles, detectives, command } = this.previewBoard();
        const seen = visibleSuspects(tiles, detectives);
        const s = this.sel;
        let body = '<rect class="track" x="0" y="0" width="50" height="50" rx="3"/>';
        // 道のマス
        for (let k = 0; k < TRACK; k++) {
            const { x, y } = spaceXY(k);
            body += `<circle class="space" cx="${x}" cy="${y}" r="3.4"/>`;
        }
        // 角の街灯
        [[5, 5], [45, 5], [5, 45], [45, 45]].forEach(([x, y]) => { body += `<g class="gaslamp"><circle cx="${x}" cy="${y}" r="2.6"/><circle class="flame" cx="${x}" cy="${y}" r="1"/></g>`; });
        tiles.forEach((t, pos) => {
            const { x, y } = tileXY(pos);
            body += districtShape(t, x, y, wallOf(t), { seen: seen.has(t.suspect) && !t.cleared, jack: view.jack === t.suspect && !t.cleared });
            if (seen.has(t.suspect) && !t.cleared) body += `<use class="eye" href="#i-eye" x="${x + 6.6}" y="${y + 0.4}" width="3" height="3"/>`;
        });
        // 刑事（同じマスなら少しずらす）
        const bySpace = {};
        DETECTIVES.forEach(d => { (bySpace[detectives[d.key]] ??= []).push(d.key); });
        Object.entries(bySpace).forEach(([space, keys]) => {
            const { x, y } = spaceXY(Number(space));
            keys.forEach((key, i) => {
                const dx = keys.length > 1 ? (i - (keys.length - 1) / 2) * 3 : 0;
                const moved = command && (command.type === 'move' || command.type === 'joker') && command.who === key && command.steps;
                body += detectiveShape(key, x + dx, y + (keys.length > 2 ? (i % 2) * 1.5 : 0), `${moved ? 'ghost' : ''} ${s?.action === 'joker' && s.who === key ? 'picked' : ''}`);
            });
        });
        // 光る行き先・選んだタイル
        let marks = '';
        if (s && this.myTurn()) {
            const ring = (k) => {
                const { x, y } = spaceXY(k);
                marks += `<circle class="hint" cx="${x}" cy="${y}" r="3.8"/>`;
            };
            if (['holmes', 'watson', 'toby'].includes(s.action)) [1, 2].forEach(n => ring((view.detectives[s.action] + n) % TRACK));
            if (s.action === 'joker' && s.who) ring((view.detectives[s.who] + 1) % TRACK);
            if (s.action === 'joker' && !s.who) DETECTIVES.forEach(d => ring(view.detectives[d.key]));
            const box = (pos, cls) => {
                const { x, y } = tileXY(pos);
                marks += `<rect class="${cls}" x="${x + 0.3}" y="${y + 0.3}" width="9.4" height="9.4" rx="1"/>`;
            };
            if (s.action === 'rotate') view.tiles.forEach((t, pos) => { if (!view.rotated.includes(pos)) box(pos, s.tile === pos ? 'target' : 'hint-tile'); });
            if (s.action === 'exchange') {
                [s.a, s.b].forEach(pos => { if (pos !== undefined) box(pos, 'target'); });
                if (s.b === undefined) view.tiles.forEach((t, pos) => { if (pos !== s.a) box(pos, 'hint-tile'); });
            }
        }
        if (view.rotated.length) view.rotated.forEach(pos => {
            const { x, y } = tileXY(pos);
            marks += `<use class="rotated" href="#i-rotate" x="${x + 0.4}" y="${y + 6.6}" width="3" height="3"/>`;
        });
        $('#board').innerHTML = `${body}${marks}<rect class="fog" x="0" y="0" width="50" height="50" rx="3"/>`;
    }

    renderNote(view) {
        let text = '';
        if (view.phase === 'end') text = '';
        else if (this.myTurn()) {
            const s = this.sel;
            const c = this.pendingCommand();
            if (!s) text = '行動タイルを選ぶ';
            else if (c) {
                const { tiles, detectives } = this.previewBoard();
                const seen = [...visibleSuspects(tiles, detectives)].filter(k => tiles.find(t => t.suspect === k && !t.cleared));
                text = c.type === 'alibi' ? 'アリバイカードを引く' : `見える容疑者 ${seen.length}人${view.jack ? (seen.includes(view.jack) ? '（ジャックも見える）' : '（ジャックは見えない）') : ''}`;
            } else if (['holmes', 'watson', 'toby'].includes(s.action)) text = `${DET_NAME[s.action]}の行き先を選ぶ`;
            else if (s.action === 'joker') text = s.who ? '1マス先を選ぶ' : '動かす刑事を選ぶ';
            else if (s.action === 'rotate') text = '回すタイルを選ぶ';
            else if (s.action === 'exchange') text = s.a === undefined ? '入れ替えるタイルを2枚選ぶ' : 'もう1枚を選ぶ';
        } else {
            text = '相手が考えています';
        }
        $('#note').innerHTML = escapeHtml(text);
    }

    renderActions(view) {
        const mine = this.myTurn();
        const order = view.phase === 'end' ? [] : pickOrder(view.round);
        const tokens = view.tokens.map((t, i) => {
            const action = TOKENS[i][t.face];
            const on = this.sel?.action === action;
            const recommended = mine && !t.used && this.hintAction === action;
            return `<button class="token ${t.used ? 'used' : ''} ${on ? 'selected' : ''} ${recommended ? 'recommended' : ''}" data-action="${action}" ${mine && !t.used ? '' : 'disabled'} aria-label="${ACTION_NAMES[action]}">${actionIcon(action)}<span>${ACTION_NAMES[action]}</span></button>`;
        }).join('');
        const turns = order.map((seat, i) => `<i class="${seat === view.you ? 'me' : ''} ${i < view.pick ? 'done' : i === view.pick ? 'now' : ''}"></i>`).join('');
        const stay = mine && this.sel?.action === 'joker' && view.you === JACK ? '<button class="btn secondary small" data-act="stay">動かさない</button>' : '';
        $('#actions').innerHTML = `<div class="tokens">${tokens}</div><div class="act"><span class="turns" aria-label="このラウンドの順">${turns}</span>${stay}<button class="btn primary small" data-act="confirm" ${mine && this.pendingCommand() ? '' : 'disabled'}>決定</button></div>`;
    }

    announce(view, fresh) {
        fresh.forEach(e => {
            if (e.type === 'witness') {
                this.toast(e.jackSeen ? `目撃あり：${e.cleared.length}人が無実` : `目撃なし：${e.cleared.length}人が無実、ジャック側に砂時計`);
            } else if (e.type === 'alibi' && e.seat !== view.you) {
                this.toast(e.card ? `アリバイ：${NAME[e.card]}` : '相手がアリバイカードを引きました');
            }
        });
    }

    // ヒント：おすすめの手を下書きにし、その行動タイルに印を付ける。「決定」はしない
    showHint() {
        const c = this.myTurn() && this.controller.hint();
        if (!c) {
            music.play('error');
            return;
        }
        music.play('select');
        if (c.type === 'move') this.sel = { action: c.who, steps: c.steps };
        else if (c.type === 'joker') this.sel = { action: 'joker', who: c.who, steps: c.steps };
        else if (c.type === 'rotate') this.sel = { action: 'rotate', tile: c.tile, rot: c.rot };
        else if (c.type === 'exchange') this.sel = { action: 'exchange', a: c.a, b: c.b };
        else this.sel = { action: c.type };
        this.hintAction = this.sel.action;
        this.render();
    }

    // コントローラーが進めたときの音。自分の手の音は押したときに鳴らすので、ここでは相手の手・自分の番・終わりだけ
    updateSound() {
        const view = this.view;
        if (!view) return;
        const mine = this.myTurn();
        if (view.phase === 'end') {
            if (!this.endSounded) music.play(view.winner === view.you ? 'win' : 'lose');
            this.endSounded = true;
        } else if (!this.sending) {
            music.play(mine && !this.wasMine ? 'turn' : 'notify');
        }
        this.wasMine = mine;
    }

    // ---- 記録・終わり ----

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-300).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        this.resultShown = true;
        $('#result-title').textContent = v.winner === v.you ? 'あなたの勝ち' : 'あなたの負け';
        const reason = { caught: 'ジャックの正体を突き止めました', hourglasses: '砂時計が6つそろいました', time: '8ラウンドを逃げ切りました', both: v.winner === DETECTIVE ? '砂時計はそろったが、正体を絞ったあと、ジャックが見えました' : '正体は絞られたが、見えないまま逃げ切りました' }[v.endReason];
        $('#result-reason').textContent = `${ROLE_NAME[v.winner]}の勝ち：${reason}`;
        const cards = (v.jackCards ?? []).map(k => `${portraitSvg(k)}`).join('');
        $('#result-body').innerHTML = `<div class="reveal">${portraitSvg(v.jack)}<span>ジャックは<b>${escapeHtml(NAME[v.jack])}</b></span></div>
            <p class="result-meta">砂時計 ${v.totalHourglasses}つ（目撃 ${v.hourglasses}・アリバイ ${(v.totalHourglasses ?? 0) - v.hourglasses}）${cards ? `<span class="cards">${cards}</span>` : ''}</p>`;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.innerHTML = escapeHtml(message);
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }
}
