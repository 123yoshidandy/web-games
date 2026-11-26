/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 盤は1つの SVG。氷は毎回描き直し、ペンギンは同じ要素を動かして（CSS の transition で）滑らせる
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { CELLS, CELL_COUNT, ROWS } from './board.js';
import { symbolsSvg, iceTile, penguinUse, penguinIcon, fishIcon, hexPoints, HEX_W, HEX_H, PLAYER_COLORS } from './art.js';

const SETTINGS_KEY = 'hey-thats-my-fish.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 1200;
const PENGUIN_SCALE = 0.86;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// マスの中心（盤の座標）
const MARGIN = 6;
const center = (cell) => {
    const { x, y } = CELLS[cell];
    return { cx: MARGIN + HEX_W / 2 + x * HEX_W / 2, cy: MARGIN + 16 + HEX_H / 2 + y * HEX_H * 0.75 };
};
const BOARD_W = MARGIN * 2 + HEX_W * Math.max(...ROWS);
const BOARD_H = MARGIN * 2 + 16 + HEX_H + (ROWS.length - 1) * HEX_H * 0.75;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4].includes(saved.count) ? saved.count : 2,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 2, level: 'easy' };
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
        this.selected = null;   // 選んでいるペンギン（番号）
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#board').setAttribute('viewBox', `0 0 ${BOARD_W.toFixed(1)} ${BOARD_H.toFixed(1)}`);
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
        this.renderSetup();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
                onUpdate: () => this.render(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.selected = null;
        $('#pens').innerHTML = '';
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#cpu-level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりは、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        // 盤のタップ：ペンギンを押したら、そのペンギンのいるマスとして扱う
        $('#hint').addEventListener('click', () => this.showHint());
        $('#board').addEventListener('click', (event) => {
            const el = event.target.closest('[data-cell]');
            this.tapCell(el ? Number(el.dataset.cell) : null);
        });
    }

    send(command) {
        this.controller?.send(command);
    }

    myTurn() {
        const v = this.view;
        return !!v && v.answering.includes(v.you);
    }

    tapCell(cell) {
        const v = this.view;
        if (!this.myTurn()) return;
        if (v.phase === 'place') {
            if (v.placeable.includes(cell)) this.send({ type: 'place', cell });
            return;
        }
        const pick = v.penguins.findIndex(p => p.cell === cell);
        if (pick >= 0 && v.moves[pick]) {
            music.play(this.selected === pick ? 'cancel' : 'select');
            this.selected = this.selected === pick && this.movable(v).length > 1 ? null : pick;
            this.render();
            return;
        }
        if (this.selected !== null && v.moves[this.selected]?.includes(cell)) {
            const penguin = this.selected;
            this.selected = null;
            this.send({ type: 'move', penguin, to: cell });
            return;
        }
        // 盤の外や行けないマスを押したら、選び直す
        if (this.movable(v).length > 1) {
            this.selected = null;
            this.render();
        }
    }

    movable(view) {
        return Object.keys(view.moves).map(Number);
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // 氷の上のペンギンたち（横一列の氷）
    renderTitleArt() {
        const tiles = [[0, 0, 3, 0], [1, 0, 1, 1], [2, 0, 2, 2], [0.5, 1, 2, null], [1.5, 1, 3, 3]];
        const body = tiles.map(([col, row, fish, owner]) => {
            const cx = 30 + col * HEX_W;
            const cy = 34 + row * HEX_H * 0.75;
            const pg = owner === null ? '' : `<g style="color:${PLAYER_COLORS[owner]}" transform="translate(0 6)">${penguinUse(0.95)}</g>`;
            return `<g transform="translate(${cx} ${cy})">${iceTile(fish)}${pg}</g>`;
        }).join('');
        $('#title-art').innerHTML = `<svg viewBox="0 0 140 92">${body}</svg>`;
    }

    // 遊び方の図：まっすぐ進めるのは、穴やペンギンの手前まで
    renderHelp() {
        const row = [1, 2, 1, 3, 1, 2];
        const hole = 4;
        const tiles = row.map((fish, i) => {
            const cx = 24 + i * HEX_W;
            if (i === hole) return `<g transform="translate(${cx} 30)"><polygon class="hole" points="${hexPoints(0.93)}"/></g>`;
            const ok = i >= 1 && i < hole;
            const mark = i === 0 ? '' : ok ? `<polygon class="dest-ring" points="${hexPoints(0.8)}"/>` : '<path class="ng" d="M-5 -5l10 10M5 -5l-10 10"/>';
            return `<g transform="translate(${cx} 30)">${iceTile(fish)}${mark}</g>`;
        }).join('');
        const pg = `<g style="color:${PLAYER_COLORS[0]}" transform="translate(24 36)">${penguinUse(0.8)}</g>`;
        $('#help-diagram').innerHTML = `<svg viewBox="0 0 256 58">${tiles}${pg}</svg>
            <p class="caption">金の縁まで行ける。穴の先（×）へは行けない</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const view = this.controller.getView();
        this.view = view;
        // 選んでいるペンギンが動けなくなったら外す。動けるペンギンが1羽だけなら、選んでおく
        if (!this.myTurn() || view.phase !== 'move' || !view.moves[this.selected]) this.selected = null;
        const movable = this.movable(view);
        if (this.myTurn() && view.phase === 'move' && movable.length === 1) this.selected = movable[0];
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.renderScores(view);
        this.renderTiles(view, prev ? fresh : []);
        this.renderMarks(view);
        this.renderPenguins(view);
        this.renderNote(view);
        if (prev) this.announce(view, fresh);
        if (prev) this.playSound(view, fresh);
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    renderScores(view) {
        $('#scores').innerHTML = view.players.map(p => {
            const cls = [p.id === view.current && view.phase !== 'end' ? 'current' : '', p.out ? 'out' : ''].join(' ');
            return `<span class="score ${cls}" title="${escapeHtml(p.name)}">${penguinIcon(PLAYER_COLORS[p.id])}<b>${p.fish}</b></span>`;
        }).join('');
    }

    renderTiles(view, fresh) {
        const sinking = new Map(fresh.filter(e => e.type === 'move').map(e => [e.from, e.fish]));
        fresh.filter(e => e.type === 'retire').forEach(e => e.cells.forEach(c => sinking.set(c, 1)));
        let html = '';
        for (let c = 0; c < CELL_COUNT; c++) {
            const { cx, cy } = center(c);
            if (view.fish[c] > 0) html += `<g class="tile" data-cell="${c}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">${iceTile(view.fish[c])}</g>`;
            else if (sinking.has(c)) html += `<g class="tile sinking" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})"><g class="sink">${iceTile(sinking.get(c))}</g></g>`;
        }
        $('#tiles').innerHTML = html;
    }

    // 置ける氷・選べるペンギン・行き先の印
    renderMarks(view) {
        let html = '';
        const mine = this.myTurn();
        const ring = (c, cls) => {
            const { cx, cy } = center(c);
            return `<polygon class="${cls}" data-cell="${c}" points="${hexPoints(0.93)}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
        };
        if (mine && view.phase === 'place') view.placeable.forEach(c => { html += ring(c, 'can-place'); });
        if (mine && view.phase === 'move') {
            this.movable(view).forEach(i => { html += ring(view.penguins[i].cell, i === this.selected ? 'chosen' : 'can-pick'); });
            if (this.selected !== null) {
                view.moves[this.selected].forEach(c => {
                    const { cx, cy } = center(c);
                    html += `<g class="dest-mark" data-cell="${c}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">
                        <polygon class="dest-area" points="${hexPoints(0.93)}"/><polygon class="dest-ring" points="${hexPoints(0.8)}"/></g>`;
                });
            }
        }
        const hinted = this.hintCell();
        if (hinted !== null) html += ring(hinted, 'recommended');
        $('#hint').disabled = !mine;
        $('#marks').innerHTML = html;
    }

    // ペンギンは同じ要素を使い続け、位置だけを変えて滑らせる
    renderPenguins(view) {
        const layer = $('#pens');
        view.penguins.forEach((p, i) => {
            let el = layer.querySelector(`[data-penguin="${i}"]`);
            if (p.cell === null) {
                if (el) el.remove();
                return;
            }
            const { cx, cy } = center(p.cell);
            if (!el) {
                el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                el.setAttribute('class', 'pen entering');
                el.dataset.penguin = String(i);
                el.style.color = PLAYER_COLORS[p.owner];
                el.innerHTML = `<g class="pen-body">${penguinUse(PENGUIN_SCALE)}</g>`;
                layer.appendChild(el);
                setTimeout(() => el.classList.remove('entering'), 500);
            }
            if (el.classList.contains('entering')) el.style.transition = 'none';
            else el.style.transition = '';
            el.dataset.cell = String(p.cell);
            el.style.transform = `translate(${cx.toFixed(1)}px, ${(cy + 7).toFixed(1)}px)`;
            el.classList.toggle('selected', i === this.selected);
        });
    }

    renderNote(view) {
        const name = (seat) => (seat === view.you ? 'あなた' : escapeHtml(view.players[seat].name));
        const who = `${penguinIcon(PLAYER_COLORS[view.current])}`;
        let text = '';
        if (view.phase === 'end') text = '';
        else if (!this.myTurn()) text = `${who}${name(view.current)}の番`;
        else if (view.phase === 'place') text = `${who}魚1匹の氷にペンギンを置く`;
        else if (this.selected === null) text = `${who}動かすペンギンを選ぶ`;
        else text = `${who}行き先を選ぶ`;
        $('#note').innerHTML = text;
    }

    // 抜けた人を知らせる
    announce(view, fresh) {
        if (view.phase === 'end') return; // 終わったときは、結果の画面で分かる
        fresh.filter(e => e.type === 'retire').forEach(e => {
            this.toast(e.seat === view.you ? 'あなたのペンギンは、もう動けません' : `${view.players[e.seat].name}のペンギンは、もう動けません`);
        });
    }

    // 1つの更新に1つの音。自分は置く・魚を得る、ほかの人の手は notify、自分の番になったら turn
    playSound(view, fresh) {
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(view.you) ? 'win' : 'lose');
        const last = fresh.filter(e => e.type === 'place' || e.type === 'move').at(-1);
        if (!last) return;
        if (last.seat === view.you) return music.play(last.type === 'move' ? 'gain' : 'place');
        music.play(this.myTurn() ? 'turn' : 'notify');
    }

    // ---- ヒント ----

    showHint() {
        if (!this.myTurn()) return;
        const command = suggest(this.controller.game, this.view.you);
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        if (command.type === 'move') this.selected = command.penguin;
        this.render();
    }

    // おすすめの手のマス（置く先・動かす先）。盤面が進んだら消す
    hintCell() {
        if (this.hint && (this.hint.at !== this.controller?.game.commands.length || !this.myTurn())) this.hint = null;
        const c = this.hint?.command;
        if (!c || (c.type === 'move' && this.selected !== c.penguin)) return null;
        return c.type === 'place' ? c.cell : c.to;
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
        $('#log-list').innerHTML = this.view.logs.slice(-200).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const names = v.winners.map(id => (id === v.you ? 'あなた' : v.players[id].name));
        $('#result-title').textContent = v.winners.length > 1
            ? `${names.join('と')}の引き分け`
            : v.winners[0] === v.you ? 'あなたの勝ち' : `${names[0]}の勝ち`;
        const ranked = [...v.players].sort((a, b) => b.fish - a.fish || b.tiles - a.tiles || a.id - b.id);
        $('#result-list').innerHTML = ranked.map(p => `
            <li class="${v.winners.includes(p.id) ? 'winner' : ''}">${penguinIcon(PLAYER_COLORS[p.id])}<span class="name">${escapeHtml(p.name)}</span>
                <span class="pts">${fishIcon()}<b>${p.fish}</b></span><span class="tiles">氷${p.tiles}枚</span></li>`).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}
