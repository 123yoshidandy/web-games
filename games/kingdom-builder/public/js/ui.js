/**
 * 画面（タイトル・ゲーム・王のカード・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { TERRAINS, LOCATIONS, KING_CARDS, CASTLE_POINTS } from './boards.js';
import { MANDATORY } from './game.js';
import { buildTargets, tileTargets, moveSources, usableTiles } from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import BoardView from './board-view.js';
import { symbolsSvg, icon, terrainHex, locationHex, houseSvg, PLAYER_COLORS } from './art.js';
import { helpHtml, titleArtHtml } from './help.js';

const SETTINGS_KEY = 'kingdom-builder.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 1000;
const AUTO_END_MS = 900;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [2, 3, 4].includes(saved.count) ? saved.count : 3, level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy' };
    } catch {
        return { count: 3, level: 'easy' };
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
        this.mode = null;            // 場所タイルを使う途中 { tile, from }
        this.recent = new Set();     // 自分の前の番のあとに、ほかの人が建てた家
        this.seenCommands = 0;
        this.resultTimer = null;
        this.endTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        this.board = new BoardView($('#map'), {
            onPick: (cell) => this.pick(cell),
            onInfo: (cell) => this.info(cell)
        });
        this.bindStatic();
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
                onError: (message) => this.toast(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.mode = null;
        this.recent = new Set();
        this.seenCommands = this.controller.game.commands.length;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.board.resize();
        this.board.resetZoom();
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
        clearTimeout(this.endTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        if (!this.controller) return false;
        clearTimeout(this.endTimer);
        return this.controller.send(command);
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
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#cards').addEventListener('click', () => this.showCards());
        $('#zoom-in').addEventListener('click', () => this.board.zoomBy(1.6));
        $('#zoom-out').addEventListener('click', () => this.board.zoomBy(1 / 1.6));
        $('#zoom-fit').addEventListener('click', () => this.board.resetZoom());
        $('#mine').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-tile]');
            if (tile) return this.pressTile(tile.dataset.tile);
            if (event.target.closest('#end-turn')) return this.send({ type: 'end' });
            if (event.target.closest('#undo')) {
                clearTimeout(this.endTimer);
                this.mode = null;
                this.controller?.undo();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.mode && !document.querySelector('dialog[open]')) {
                this.mode = null;
                this.render();
            }
        });

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // ---- 操作 ----

    myTurn(view = this.view) {
        return view && view.phase === 'play' && view.active === view.you;
    }

    pressTile(type) {
        const view = this.view;
        if (!view) return;
        const info = LOCATIONS[type];
        if (!this.myTurn() || !usableTiles(view, view.you).includes(type)) {
            const held = view.players[view.you].tiles.filter(t => t.type === type);
            const note = held.length && held.every(t => t.fresh) ? '（取った番には使えません）' : '';
            this.toast(`${info.name}：${info.text}${note}`);
            return;
        }
        this.mode = this.mode?.tile === type ? null : { tile: type, from: -1 };
        if (this.mode) this.toast(`${info.name}：${info.text}`);
        this.render();
    }

    // 盤で選べるマスと、その意味
    picking(view) {
        if (!this.myTurn(view)) return { pick: [], kind: null };
        const seat = view.you;
        if (this.mode) {
            const { tile, from } = this.mode;
            if (LOCATIONS[tile].kind === 'build') return { pick: tileTargets(view, seat, tile), kind: 'tile' };
            if (from < 0) return { pick: moveSources(view, seat, tile), kind: 'source' };
            return { pick: tileTargets(view, seat, tile, from), kind: 'target' };
        }
        if (!view.mandatoryDone) return { pick: buildTargets(view, seat), kind: 'build' };
        return { pick: [], kind: null };
    }

    pick(cell) {
        const view = this.view;
        const { kind } = this.picking(view);
        if (kind === 'build') this.send({ type: 'build', cell });
        else if (kind === 'tile') {
            const tile = this.mode.tile;
            this.mode = null;
            this.send({ type: 'tile', tile, cell });
        } else if (kind === 'source') {
            this.mode.from = cell;
            this.render();
        } else if (kind === 'target') {
            const { tile, from } = this.mode;
            this.mode = null;
            this.send({ type: 'tile', tile, from, cell });
        }
    }

    // 選べないマスをタップした：動かす家の選び直し、場所や城の説明
    info(cell) {
        const view = this.view;
        if (!view) return;
        if (this.mode && LOCATIONS[this.mode.tile].kind === 'move' && this.mode.from >= 0 && view.owner[cell] === view.you
            && moveSources(view, view.you, this.mode.tile).includes(cell)) {
            this.mode.from = cell;
            this.render();
            return;
        }
        const t = view.terrain[cell];
        if (t === 'L') {
            const loc = view.locations.find(l => l.cell === cell);
            this.toast(`${LOCATIONS[loc.type].name}（残り${loc.tiles}枚）：${LOCATIONS[loc.type].text}`);
        } else if (t === 'K') {
            this.toast(`城：隣接して建てると${CASTLE_POINTS}点`);
        }
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        this.trackRecent(view);
        if (this.mode && (!this.myTurn(view) || !usableTiles(view, view.you).includes(this.mode.tile))) this.mode = null;
        const { pick, kind } = this.picking(view);
        this.board.setMap(view.terrain, view.locations);
        this.board.render({
            owner: view.owner,
            locations: view.locations,
            pick,
            picking: kind === 'source' ? 'source' : null,
            selected: this.mode?.from ?? -1,
            recent: [...this.recent]
        });
        this.renderStatus(view, kind);
        this.renderPlayers(view);
        this.renderCards(view);
        this.renderMine(view);
        this.scheduleAutoEnd(view);
        if (view.phase === 'end' && !this.resultTimer && !$('#result').open) {
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
        if ($('#log').open) this.renderLog();
    }

    // 自分の前の番のあとに、ほかの人が建てた家と動かした家を覚えておく（盤に印を付ける）
    trackRecent(view) {
        if (view.commandCount <= this.seenCommands) {
            this.seenCommands = view.commandCount;
            return;
        }
        this.seenCommands = view.commandCount;
        view.events.forEach(event => {
            if (event.type === 'turn' && event.seat === view.you) this.recent.clear();
            if (event.seat === view.you) return;
            if (event.type === 'build') this.recent.add(event.cell);
            if (event.type === 'move') {
                this.recent.delete(event.from);
                this.recent.add(event.cell);
            }
        });
    }

    renderStatus(view, kind) {
        const active = view.players[view.active];
        let html;
        if (view.phase === 'end') {
            html = '<span class="who">終わり</span>';
        } else if (this.myTurn(view)) {
            const card = active.card;
            let what = '';
            if (kind === 'build') what = `${TERRAINS[card].name}に建てる<small>あと${MANDATORY - view.built}軒</small>`;
            else if (this.mode) {
                const name = LOCATIONS[this.mode.tile].name;
                what = kind === 'source' ? `${name}：動かす家` : `${name}：行き先`;
            } else what = '場所タイルを使えます';
            html = `<span class="who me">あなたの番</span><span class="what">${what}</span>`;
        } else {
            html = `<span class="dot" style="--c:${PLAYER_COLORS[view.active]}"></span><span class="who">${escapeHtml(active.name)}の番</span>`
                + (active.card ? `<span class="what">${terrainHex(active.card, 18)}${TERRAINS[active.card].name}</span>` : '');
        }
        if (view.finalRound && view.phase === 'play') html += '<span class="final">最後の巡</span>';
        $('#status').innerHTML = html;
    }

    renderPlayers(view) {
        $('#players').style.setProperty('--n', view.players.length);
        $('#players').innerHTML = view.players.map((p, i) => {
            const tiles = p.tiles.map(t => `<span class="${t.fresh || t.used ? 'dim' : ''}">${locationHex(t.type, 15)}</span>`).join('');
            return `<div class="pl${i === view.active && view.phase === 'play' ? ' active' : ''}" style="--c:${PLAYER_COLORS[i]}">
                <div class="pl-top">${houseSvg(i, 13)}<span class="pl-name">${escapeHtml(p.name)}</span><b class="pl-score">${view.scores[i].total}</b></div>
                <div class="pl-bottom"><span class="pl-supply">${houseSvg(i, 11)}${p.supply}</span><span class="pl-tiles">${tiles}</span></div>
            </div>`;
        }).join('');
    }

    renderCards(view) {
        const mine = view.scores[view.you ?? 0];
        $('#cards').innerHTML = view.cards.map((id, k) => `<span class="kc"><b>${KING_CARDS[id].name}</b><small>${mine.cards[k]}</small></span>`).join('')
            + `<span class="kc castle">${terrainHex('K', 16)}<small>${mine.castles}</small></span>`;
    }

    renderMine(view) {
        const me = view.players[view.you];
        const my = this.myTurn(view);
        const usable = my ? usableTiles(view, view.you) : [];
        const card = me.card ? `<div class="hand">${terrainHex(me.card, 38)}<span>${TERRAINS[me.card].name}</span></div>` : '<div class="hand none">−</div>';
        const progress = my ? `<div class="progress" aria-label="建てた数">${Array.from({ length: MANDATORY }, (_, i) => `<i class="${i < view.built || view.mandatoryDone ? 'on' : ''}"></i>`).join('')}</div>` : '';
        // 同じ種類のタイルは1つのボタンにまとめ、使える回数を出す
        const groups = new Map();
        me.tiles.forEach(t => {
            const g = groups.get(t.type) ?? { total: 0, ready: 0 };
            g.total++;
            if (!t.fresh && !t.used) g.ready++;
            groups.set(t.type, g);
        });
        const tiles = [...groups].map(([type, g]) => {
            const can = usable.includes(type);
            const cls = [can ? 'can' : '', this.mode?.tile === type ? 'on' : '', g.ready ? '' : 'dim'].filter(Boolean).join(' ');
            return `<button class="tile ${cls}" data-tile="${type}">${locationHex(type, 24)}<span>${LOCATIONS[type].name}</span>${g.total > 1 ? `<small>×${g.ready}</small>` : ''}</button>`;
        }).join('') || '<span class="none">場所タイルなし</span>';
        const canUndo = my && this.controller.canUndo();
        const endBtn = my ? `<button id="end-turn" class="btn primary"${view.mandatoryDone ? '' : ' disabled'}>番を終える</button>` : '';
        $('#mine').innerHTML = `
            <div class="mine-top">${card}${progress}
                <button id="undo" class="icon-btn" aria-label="1手戻す" title="1手戻す"${canUndo ? '' : ' disabled'}>${icon('undo')}</button>${endBtn}</div>
            <div class="tiles">${tiles}</div>`;
    }

    // 3軒建て終えて、使える場所タイルもなければ、少し待って番を終える
    scheduleAutoEnd(view) {
        clearTimeout(this.endTimer);
        if (!this.myTurn(view) || !view.mandatoryDone || this.mode || usableTiles(view, view.you).length) return;
        const count = view.commandCount;
        this.endTimer = setTimeout(() => {
            const now = this.controller?.getView();
            if (now && this.myTurn(now) && now.commandCount === count && now.mandatoryDone && !usableTiles(now, now.you).length) this.send({ type: 'end' });
        }, AUTO_END_MS);
    }

    // ---- ダイアログ ----

    showCards() {
        const view = this.view;
        if (!view) return;
        const head = view.players.map((p, i) => `<th><span class="dot" style="--c:${PLAYER_COLORS[i]}"></span>${escapeHtml(p.name)}</th>`).join('');
        const row = (label, text, get) => `<tr><th>${label}<small>${text}</small></th>${view.scores.map(s => `<td>${get(s)}</td>`).join('')}</tr>`;
        const rows = view.cards.map((id, k) => row(KING_CARDS[id].name, KING_CARDS[id].text, s => s.cards[k])).join('')
            + row('城', `隣接する城1つにつき${CASTLE_POINTS}点`, s => s.castles)
            + `<tr class="sum"><th>計</th>${view.scores.map(s => `<td>${s.total}</td>`).join('')}</tr>`;
        $('#cards-body').innerHTML = `<table class="ktable"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>
            <p class="note">今の盤で数えた点です。</p>`;
        $('#cards-dialog').showModal();
    }

    showLog() {
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        if (!this.view) return;
        $('#log-list').innerHTML = this.view.logs.map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    showResult() {
        const view = this.controller?.getView();
        if (!view) return;
        const won = view.winners.includes(view.you);
        $('#result-title').textContent = won ? (view.winners.length > 1 ? '引き分け（勝ち）' : 'あなたの勝ち') : `${view.winners.map(i => view.players[i].name).join('・')}の勝ち`;
        const head = view.cards.map(id => `<th>${KING_CARDS[id].name}</th>`).join('');
        const order = view.players.map((_, i) => i).sort((a, b) => view.scores[b].total - view.scores[a].total);
        const rows = order.map(i => {
            const s = view.scores[i];
            const cls = [view.winners.includes(i) ? 'win' : '', i === view.you ? 'you' : ''].join(' ');
            return `<tr class="${cls}"><th><span class="dot" style="--c:${PLAYER_COLORS[i]}"></span>${escapeHtml(view.players[i].name)}</th>${s.cards.map(v => `<td>${v}</td>`).join('')}<td>${s.castles}</td><td class="total">${s.total}</td></tr>`;
        }).join('');
        $('#result-table').innerHTML = `<table><thead><tr><th></th>${head}<th>城</th><th>計</th></tr></thead><tbody>${rows}</tbody></table>`;
        $('#result').showModal();
    }

    toast(message) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }
}
