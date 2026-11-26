/**
 * 画面（タイトル・ゲーム・季節の得点・結果・勅令・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { SIZE, CELLS, TERRAINS, TERRAIN_NAMES, SEASONS, RUIN_SET, exploreCard, ambushCard, edictCard } from './game.js';
import { EDICT_LETTERS, MOUNTAINS } from './cards.js';
import { scoreEdict, monsterPenalty, surroundedMountains, neighbors } from './scoring.js';
import { normalize, rotate, flip, sizeOf } from './shapes.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, icon, shapeHtml, terrainChip } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'cartographers.settings';
const CPU_NAMES = ['ルカ', 'ミラ', 'ノア'];
const RESULT_DELAY_MS = 700;
const MOUNTAIN_SET = new Set(MOUNTAINS.map(([r, c]) => r * SIZE + c));

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [1, 2, 3, 4].includes(saved.count) ? saved.count : 2,
            level: ['easy', 'normal'].includes(saved.level) ? saved.level : 'normal'
        };
    } catch {
        return { count: 2, level: 'normal' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 形の中心に近いマス（押したマスに、このマスを合わせる）
function pivotOf(cells) {
    const [h, w] = sizeOf(cells);
    const cr = (h - 1) / 2, cc = (w - 1) / 2;
    return [...cells].sort((a, b) => (Math.abs(a[0] - cr) + Math.abs(a[1] - cc)) - (Math.abs(b[0] - cr) + Math.abs(b[1] - cc)))[0];
}

// 向きを決めた形を、押したマスを中心に置く。はみ出す分は内側へずらす
function ghostCells(shape, anchor) {
    const [pr, pc] = pivotOf(shape);
    const [h, w] = sizeOf(shape);
    let r0 = Math.floor(anchor / SIZE) - pr;
    let c0 = (anchor % SIZE) - pc;
    r0 = Math.max(0, Math.min(SIZE - h, r0));
    c0 = Math.max(0, Math.min(SIZE - w, c0));
    return shape.map(([r, c]) => (r0 + r) * SIZE + (c0 + c));
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.cardKey = null;     // 今のカード（変わったら選び直す）
        this.variant = 0;        // 選んだ形と地形の組
        this.shape = null;       // 回転・裏返しした形
        this.anchor = null;      // 押したマス
        this.terrain = null;     // 1×1 のときの地形
        this.lastSeq = 0;
        this.fresh = new Set();  // さっき描かれたマス
        this.seenSeasons = 0;    // 得点を見せた季節の数
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderTitleArt();
        $('#help-coin').innerHTML = icon('coin');
        $('#help-clock').innerHTML = icon('clock');
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
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.cardKey = null;
        this.view = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.lastSeq = view.events.at(-1)?.seq ?? 0;
        this.seenSeasons = view.players[view.you].seasons.length;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        ['#scores', '#edict-detail', '#player-map'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

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
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#edicts').addEventListener('click', () => this.showEdicts());
        $('#seasons').addEventListener('click', () => this.showScores({ final: false }));
        $('#players').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-player]');
            if (chip) this.showPlayerMap(Number(chip.dataset.player));
        });

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#scores-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button) return;
            $('#scores').close();
            if (button.dataset.act === 'again') this.newGame();
            if (button.dataset.act === 'home') this.showTitle();
        });

        $('#map').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-cell]');
            if (cell) this.pickCell(Number(cell.dataset.cell));
        });
        $('#card').addEventListener('click', (event) => {
            const option = event.target.closest('[data-variant]');
            if (option) return this.pickVariant(Number(option.dataset.variant));
            const terrain = event.target.closest('[data-terrain]');
            if (terrain) this.pickTerrain(terrain.dataset.terrain);
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act);
        });

        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
        $('#level-row').classList.toggle('dim', this.settings.count === 1);
    }

    renderTitleArt() {
        // 小さな地図の一角
        const rows = ['FFWW.', 'FVWAA', '.VVAM', 'XV.AA', '..R..'];
        const letters = { F: 'forest', V: 'village', W: 'water', A: 'farm', M: 'mountain', X: 'monster' };
        $('#title-art').innerHTML = `<div class="title-map">${rows.join('').split('').map(ch => {
            if (ch === 'R') return `<span class="cell ruin">${icon('ruins', 'ruin-mark')}</span>`;
            const t = letters[ch];
            return t ? `<span class="cell t-${t}">${icon(t)}</span>` : '<span class="cell"></span>';
        }).join('')}</div>`;
    }

    // ---- 描く操作 ----

    // 今描く形（ambush なら異形、1×1 なら1マス）
    currentShape() {
        const view = this.view;
        if (view.fallback) return [[0, 0]];
        if (view.monsterTarget !== null) return ambushCard(view.card.id).cells;
        if (view.mustPlace) return exploreCard(view.card.id).variants[this.variant].cells;
        return null;
    }

    // 効果音：新しいできごとを見て、1回の更新に1つだけ鳴らす（ほかの人が描くのは鳴らさない）
    // 終局は勝ち（同点は知らせ）・負け、コインは得た音、自分が描いたら置いた音、季節の終わりは知らせ、カードをめくったら引く音
    playSounds(view, fresh) {
        if (!fresh.length) return;
        const me = view.you;
        const end = fresh.find(e => e.type === 'end');
        if (end) {
            if (!end.winners.includes(me)) return music.play('lose');
            return music.play(end.winners.length > 1 ? 'notify' : 'win');
        }
        if (fresh.some(e => e.type === 'coin' && e.seat === me)) return music.play('gain');
        if (fresh.some(e => e.type === 'draw' && e.seat === me)) return music.play('place');
        if (fresh.some(e => e.type === 'season-end')) return music.play('notify');
        if (fresh.some(e => e.type === 'reveal')) music.play('draw');
    }

    resetPlacement() {
        const base = this.currentShape();
        this.shape = base ? normalize(base) : null;
        this.anchor = null;
    }

    pickVariant(index) {
        if (!this.view?.mustPlace || this.view.fallback) return;
        if (this.variant === index) return;
        const keep = this.anchor;
        music.play('select');
        this.hintKey = null;
        this.variant = index;
        this.resetPlacement();
        this.anchor = keep;
        this.render();
    }

    pickTerrain(terrain) {
        if (!this.view?.fallback) return;
        music.play('select');
        this.terrain = terrain;
        this.render();
    }

    pickCell(cell) {
        if (!this.shape) return;
        music.play('select');
        this.hintKey = null;
        this.anchor = cell;
        this.render();
    }

    act(action) {
        if (action === 'rotate' || action === 'flip') this.hintKey = null;
        if (action === 'rotate' && this.shape) this.shape = rotate(this.shape);
        if (action === 'flip' && this.shape) this.shape = flip(this.shape);
        if (action === 'draw') return this.draw();
        this.render();
    }

    // ヒント：CPU（ふつう）が選ぶ描き方を、形・向き・場所まで選んだ状態にする
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('描く番になったら、おすすめを出せます');
        if (command.type === 'place' && command.fallback) this.terrain = command.terrain;
        if (command.type === 'place' && !command.fallback) this.variant = command.variant;
        const rc = command.cells.map(c => [Math.floor(c / SIZE), c % SIZE]);
        const minR = Math.min(...rc.map(([r]) => r));
        const minC = Math.min(...rc.map(([, c]) => c));
        this.shape = normalize(rc);
        const [pr, pc] = pivotOf(this.shape);
        this.anchor = (minR + pr) * SIZE + (minC + pc);
        this.hintKey = this.cardKey;
        this.render();
        this.toast('おすすめ：この形と場所で「描く」');
    }

    draw() {
        const placement = this.placement();
        if (!placement || placement.error) return;
        const view = this.view;
        let command;
        if (view.monsterTarget !== null) command = { type: 'monster', cells: placement.cells };
        else if (view.fallback) command = { type: 'place', fallback: true, terrain: this.terrain, cells: placement.cells };
        else command = { type: 'place', variant: this.variant, cells: placement.cells };
        this.anchor = null;
        this.controller?.send(command);
    }

    // 今の置き方と、描けない理由・得点の見込み
    placement() {
        const view = this.view;
        if (!this.shape || this.anchor === null) return null;
        const cells = ghostCells(this.shape, this.anchor);
        const board = this.displayBoard();
        let error = null;
        if (cells.some(c => board[c] === 'mountain')) error = '山には描けません';
        else if (cells.some(c => board[c] !== null)) error = '描いたマスには重ねられません';
        else if (view.mustPlace && !view.fallback && view.ruins && !cells.some(c => RUIN_SET.has(c))) error = '廃墟のマスにかけて描きます';
        else if (view.fallback && !this.terrain) error = '地形を選びます';
        return { cells, error };
    }

    // 地図に出す盤（襲撃なら相手の地図）
    displayBoard() {
        const view = this.view;
        const owner = view.monsterTarget ?? view.you;
        return view.players[owner].board;
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        const reveal = [...view.events].reverse().find(e => e.type === 'reveal');
        const key = `${view.phase}:${view.card?.id}:${reveal?.seq}:${view.mustPlace}:${view.monsterTarget}:${view.fallback}`;
        if (key !== this.cardKey) {
            this.cardKey = key;
            this.variant = 0;
            this.terrain = null;
            this.resetPlacement();
        }
        // さっき描かれたマス（表示している地図の分）
        this.playSounds(view, view.events.filter(e => e.seq > this.lastSeq));
        const fresh = view.events.filter(e => e.seq > this.lastSeq && e.type === 'draw');
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        const owner = view.monsterTarget ?? view.you;
        this.fresh = new Set(fresh.filter(e => e.seat === owner).flatMap(e => e.cells));

        this.renderTop();
        this.renderEdicts();
        this.renderCard();
        this.renderMap();
        this.renderActions();
        this.afterRender();
    }

    afterRender() {
        const view = this.view;
        const me = view.players[view.you];
        // 季節が終わったら、その季節の得点を見せる
        if (me.seasons.length > this.seenSeasons) {
            this.seenSeasons = me.seasons.length;
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showScores({ final: view.phase === 'end', season: me.seasons.length - 1 }), RESULT_DELAY_MS);
        }
    }

    renderTop() {
        const view = this.view;
        const name = view.phase === 'end' ? '終了' : SEASONS[view.season].name;
        const dots = SEASONS.map((s, i) => `<span class="sdot ${i === view.season ? 'now' : i < view.season ? 'past' : ''}"></span>`).join('');
        const time = view.phase === 'end' ? '' : `<span class="time">${icon('clock')}<b>${view.time}</b>/${view.seasonTime}</span>`;
        const bar = view.phase === 'end' ? '' : `<span class="time-bar"><span style="width:${Math.min(100, view.time / view.seasonTime * 100)}%"></span></span>`;
        $('#seasons').innerHTML = `<span class="season-now">${name}</span>${time}<span class="sdots">${dots}</span>${bar}`;
        $('#players').innerHTML = view.players.map(p => `<button class="pchip ${p.id === view.you ? 'me' : ''} ${p.done ? '' : 'waiting'}" data-player="${p.id}"
            aria-label="${escapeHtml(p.name)}の地図"><span class="pname">${escapeHtml(p.name)}</span><b>${p.total}</b><span class="pcoin">${icon('coin')}${p.coins}</span></button>`).join('');
    }

    renderEdicts() {
        const view = this.view;
        const season = SEASONS[Math.min(view.season, 3)];
        const board = view.players[view.you].board;
        $('#edicts').innerHTML = view.edicts.map((id, i) => {
            const active = view.phase !== 'end' && season.edicts.includes(i);
            return `<span class="edict g-${edictCard(id).group} ${active ? 'active' : ''}">
                <span class="letter">${EDICT_LETTERS[i]}</span><span class="ename">${edictCard(id).name}</span><b>${scoreEdict(id, board)}</b></span>`;
        }).join('');
    }

    renderCard() {
        const view = this.view;
        const el = $('#card');
        if (view.phase === 'end' || !view.card) {
            el.innerHTML = '<span class="card-name">ゲーム終了</span>';
            return;
        }
        if (view.card.kind === 'ambush') {
            const card = ambushCard(view.card.id);
            const target = view.monsterTarget !== null ? `<span class="card-note">${escapeHtml(view.players[view.monsterTarget].name)}の地図に描く</span>` : '<span class="card-note">ほかの人を待っています</span>';
            el.innerHTML = `<span class="card-head ambush"><span class="card-name">${card.name}</span>${target}</span>
                <span class="variants">${shapeHtml(card.cells, 'monster', { cls: 'big' })}</span>`;
            return;
        }
        const card = exploreCard(view.card.id);
        const head = `<span class="card-head"><span class="card-name">${card.name}</span>
            <span class="card-sub"><span class="card-time">${icon('clock')}${card.time}</span>${view.ruins ? `<span class="ruins-badge">${icon('ruins')}廃墟</span>` : ''}</span></span>`;
        if (!view.mustPlace) {
            el.innerHTML = `${head}<span class="variants waiting">${card.variants.slice(0, 2).map(v => shapeHtml(v.cells, v.terrain, { coin: v.coin })).join('')}
                <span class="card-note">ほかの人を待っています</span></span>`;
            return;
        }
        if (view.fallback) {
            const note = `<span class="card-head"><span class="card-name">${card.name}</span><span class="card-note">1×1 で描く</span></span>`;
            el.innerHTML = `${note}<span class="variants">
                ${TERRAINS.map(t => `<button class="variant terrain ${this.terrain === t ? 'on' : ''}" data-terrain="${t}" aria-label="${TERRAIN_NAMES[t]}">${terrainChip(t)}</button>`).join('')}</span>`;
            return;
        }
        el.innerHTML = `${head}<span class="variants">${card.variants.map((v, i) => `<button class="variant ${i === this.variant ? 'on' : ''}" data-variant="${i}">
            ${shapeHtml(v.cells, v.terrain, { coin: v.coin })}</button>`).join('')}</span>`;
    }

    renderMap() {
        const view = this.view;
        const board = this.displayBoard();
        const placement = this.placement();
        const ghost = new Set(placement?.cells ?? []);
        const ghostTerrain = view.monsterTarget !== null ? 'monster'
            : view.fallback ? this.terrain ?? 'none'
                : view.mustPlace ? exploreCard(view.card.id).variants[this.variant].terrain : 'none';
        const needRuins = view.mustPlace && view.ruins && !view.fallback;
        const surrounded = new Set([...MOUNTAIN_SET].filter(c => neighbors(c).every(n => board[n] !== null)));
        $('#map').className = `map ${view.monsterTarget !== null ? 'other' : ''}`;
        $('#map').innerHTML = Array.from({ length: CELLS }, (_, cell) => {
            const t = board[cell];
            const cls = ['cell', t ? `t-${t}` : 'empty'];
            if (RUIN_SET.has(cell)) cls.push('ruin');
            if (needRuins && RUIN_SET.has(cell) && t === null) cls.push('need');
            if (this.fresh.has(cell)) cls.push('fresh');
            let inner = t ? icon(t) : '';
            if (RUIN_SET.has(cell)) inner += icon('ruins', 'ruin-mark');
            if (surrounded.has(cell)) inner += `<span class="mcoin">${icon('coin')}</span>`;
            if (ghost.has(cell)) {
                cls.push('ghost', placement.error ? 'bad' : 'good', `g-${ghostTerrain}`);
                if (!t && ghostTerrain !== 'none') inner = icon(ghostTerrain);
            }
            return `<button class="${cls.join(' ')}" data-cell="${cell}" aria-label="${t ? TERRAIN_NAMES[t] : '空き'}">${inner}</button>`;
        }).join('');
    }

    renderActions() {
        const view = this.view;
        const placement = this.placement();
        const canTurn = !!this.shape && !view.fallback;
        let label;
        if (!this.shape) label = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        else if (!placement && view.fallback) label = `<span class="act-hint">${view.ruins ? '廃墟にかけられない' : 'どの形も描けない'}ので、地形と1マスを選ぶ</span>`;
        else if (!placement) label = '<span class="act-hint">地図を押して置く場所を選ぶ</span>';
        else if (placement.error) label = `<span class="act-error">${placement.error}</span>`;
        else label = `<span class="act-gain">${this.gainText(placement.cells)}</span>`;
        $('#actions').innerHTML = `
            <button class="icon-btn turn" data-act="rotate" aria-label="回転" title="回転" ${canTurn ? '' : 'disabled'}>${icon('rotate')}</button>
            <button class="icon-btn turn" data-act="flip" aria-label="裏返し" title="裏返し" ${canTurn ? '' : 'disabled'}>${icon('flip')}</button>
            <span class="act-label">${label}</span>
            <button class="btn small primary${this.hintKey === this.cardKey && placement && !placement.error ? ' recommended' : ''}" data-act="draw" ${placement && !placement.error ? '' : 'disabled'}>描く</button>`;
    }

    // 描いたときの得点の見込み（自分の地図なら今の季節の得点の増え方、襲撃なら相手の減点の増え方）
    gainText(cells) {
        const view = this.view;
        const board = this.displayBoard();
        const after = [...board];
        if (view.monsterTarget !== null) {
            cells.forEach(c => { after[c] = 'monster'; });
            return `異形の減点 ${monsterPenalty(board)}→${monsterPenalty(after)}`;
        }
        const terrain = view.fallback ? this.terrain : exploreCard(view.card.id).variants[this.variant].terrain;
        cells.forEach(c => { after[c] = terrain; });
        const season = SEASONS[view.season];
        const score = (b) => season.edicts.reduce((sum, i) => sum + scoreEdict(view.edicts[i], b), 0) - monsterPenalty(b);
        const coin = (!view.fallback && exploreCard(view.card.id).variants[this.variant].coin ? 1 : 0)
            + surroundedMountains(after) - surroundedMountains(board);
        const diff = score(after) - score(board) + coin;
        return `${season.name}の見込み ${diff >= 0 ? '+' : ''}${diff}${coin > 0 ? `（${icon('coin')}${coin}）` : ''}`;
    }

    // ---- ダイアログ ----

    showEdicts() {
        const view = this.view;
        if (!view) return;
        const scoredIn = (i) => SEASONS.filter(s => s.edicts.includes(i)).map(s => s.name).join('・');
        $('#edict-body').innerHTML = view.edicts.map((id, i) => {
            const card = edictCard(id);
            const scores = view.players.map(p => `<span class="escore">${escapeHtml(p.name)} <b>${scoreEdict(id, p.board)}</b></span>`).join('');
            return `<div class="edict-item g-${card.group}"><div class="edict-title"><span class="letter">${EDICT_LETTERS[i]}</span>${card.name}<span class="when">${scoredIn(i)}</span></div>
                <p>${card.text}</p><div class="escores">${scores}</div></div>`;
        }).join('');
        $('#edict-detail').showModal();
    }

    // 季節ごとの得点の表。final：結果として出す。season：その季節を強調する
    showScores({ final, season = null }) {
        const view = this.view;
        if (!view) return;
        const done = view.players[0].seasons.length;
        const title = final
            ? (view.players.length === 1 ? `合計 ${view.players[0].total}点` : view.winners.includes(view.you) ? (view.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${view.players[view.winners[0]].name}の勝ち`)
            : season !== null ? `${SEASONS[season].name}の得点` : '季節の得点';
        $('#scores-title').textContent = title;
        const head = `<tr><th></th>${SEASONS.map((s, i) => `<th class="${i === season ? 'hl' : ''}">${s.name}</th>`).join('')}<th>合計</th></tr>`;
        const rows = view.players.map(p => {
            const cells = SEASONS.map((s, i) => {
                const sc = p.seasons[i];
                if (!sc) return '<td class="none">-</td>';
                const [a, b] = s.edicts.map(e => EDICT_LETTERS[e]);
                return `<td class="${i === season ? 'hl' : ''}"><b>${sc.total}</b><small>${a}${sc.edicts[0]} ${b}${sc.edicts[1]}<br>${icon('coin')}${sc.coins} 異形-${sc.monsters}</small></td>`;
            }).join('');
            return `<tr class="${final && view.winners.includes(p.id) && view.players.length > 1 ? 'winner' : ''}"><th>${escapeHtml(p.name)}</th>${cells}<td class="sum"><b>${p.total}</b></td></tr>`;
        }).join('');
        $('#scores-body').innerHTML = `<table class="score-table">${head}${rows}</table>${done === 0 ? '<p class="muted">まだ得点した季節はありません</p>' : ''}`;
        $('#scores-buttons').innerHTML = final
            ? '<button class="btn primary" data-act="again">もう一度</button><button class="btn secondary" data-act="home">ホーム</button>'
            : '<button class="btn secondary" data-act="close">閉じる</button>';
        if (!$('#scores').open) $('#scores').showModal();
    }

    showPlayerMap(seat) {
        const view = this.view;
        if (!view) return;
        const p = view.players[seat];
        $('#player-map-name').textContent = `${p.name}　${p.total}点`;
        const board = p.board;
        const map = Array.from({ length: CELLS }, (_, cell) => {
            const t = board[cell];
            return `<span class="cell ${t ? `t-${t}` : 'empty'} ${RUIN_SET.has(cell) ? 'ruin' : ''}">${t ? icon(t) : ''}${RUIN_SET.has(cell) ? icon('ruins', 'ruin-mark') : ''}</span>`;
        }).join('');
        const edicts = view.edicts.map((id, i) => `<span class="escore">${EDICT_LETTERS[i]} <b>${scoreEdict(id, board)}</b></span>`).join('');
        $('#player-map-body').innerHTML = `<div class="map mini">${map}</div>
            <div class="escores">${edicts}<span class="escore">${icon('coin')} <b>${p.coins}</b></span><span class="escore">異形 <b>-${monsterPenalty(board)}</b></span></div>`;
        $('#player-map').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
