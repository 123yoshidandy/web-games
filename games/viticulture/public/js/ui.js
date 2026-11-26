/**
 * 画面（タイトル・ゲーム・選ぶ・手札とブドウ園・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { CARDS, STRUCTURES, STRUCTURE, ACTIONS, WAKE_ROWS, MAMAS, PAPAS, DECK_NAME, vineValue, orderText } from './cards.js';
import { SEASON_NAME } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, sym, titleArtHtml } from './art.js';
import { helpHtml } from './help.js';
import { music } from './music.js';

const SETTINGS_KEY = 'viticulture.settings';
const CPU_NAMES = ['ジュリア', 'マルコ', 'ソフィア', 'ニコロ', 'キアラ'];
export const COLORS = ['#e8b23a', '#5b95e0', '#5fb35a', '#c07ae0', '#ee8640', '#e5e2da'];
const RESULT_DELAY_MS = 900;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5, 6].includes(saved.count) ? saved.count : 3,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 3, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// ---- 部品の文字 ----

const vineShort = (card) => card.name.replace('・ブラン', '').slice(0, 4);
const valueBadges = (card) => `${card.red ? `<i class="vb r">${card.red}</i>` : ''}${card.white ? `<i class="vb w">${card.white}</i>` : ''}`;
const needsText = (card) => (card.needs.length ? card.needs.map(id => STRUCTURE[id].name).join('・') : '');
const ORDER_CLASS = { red: 'r', white: 'w', blush: 'b', sparkling: 's' };

function cardHtml(id) {
    const card = CARDS[id];
    if (card.deck === 'vine') {
        return `<div class="card vine-card"><div class="c-head">${valueBadges(card)}<b>${card.name}</b></div>
<div class="c-text">価値${vineValue(card)}${card.needs.length ? `・要るもの：${needsText(card)}` : ''}</div></div>`;
    }
    if (card.deck === 'order') {
        return `<div class="card order-card"><div class="c-head">${card.wines.map(w => `<i class="wb ${ORDER_CLASS[w.kind]}">${w.min}</i>`).join('')}<b>注文</b></div>
<div class="c-text">${orderText(card)} → ${card.vp}点${card.residual ? `・残りの収入+${card.residual}` : ''}</div></div>`;
    }
    return `<div class="card visitor-card ${card.deck}"><div class="c-head"><span class="season-tag ${card.deck}">${card.deck === 'summer' ? '夏' : '冬'}</span><b>${card.name}</b></div>
<ul class="c-opts">${card.options.map(o => `<li>${escapeHtml(o.label)}</li>`).join('')}</ul></div>`;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.grandeMode = false;    // 大きいワーカーで置く
        this.decideKey = null;      // 開いている選択の id
        this.dismissedKey = null;   // 盤面を見るために閉じた選択の id
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
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
        this.hintCommand = null;
        this.grandeMode = false;
        this.decideKey = null;
        this.dismissedKey = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
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

    send(command) {
        if (!this.controller) return false;
        const before = this.view?.players[this.view.you];
        const wasOver = this.view?.season === 'end';
        this.hintCommand = null;
        this.sending = true;
        let ok = false;
        try {
            ok = this.controller.send(command);
        } finally {
            this.sending = false;
        }
        if (ok) this.playSent(command, before, wasOver);
        return ok;
    }

    // ---- 効果音 ----

    // 自分が送った操作の音（1つの操作に1つ）。点やお金が増えたら gain、お金を払ったら pay
    playSent(command, before, wasOver) {
        const view = this.view;
        if (view.season === 'end') {
            if (!wasOver) music.play(view.winners.includes(view.you) ? 'win' : 'lose');
            return;
        }
        const me = view.players[view.you];
        if (before && (me.vp > before.vp || me.lira > before.lira)) return music.play('gain');
        if (before && me.lira < before.lira) return music.play('pay');
        music.play(command.type === 'place' || command.type === 'choose' ? 'place' : 'select');
    }

    // ほかの人が動いたときの音。自分が操作する番になったら turn、終わりは勝ち負け（CPU の手ごとには鳴らさない）
    playUpdate(prev) {
        const view = this.view;
        if (view.season === 'end') {
            if (prev.season !== 'end') music.play(view.winners.includes(view.you) ? 'win' : 'lose');
            return;
        }
        if (view.actors.includes(view.you) && !prev.actors.includes(prev.you)) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        if (command.type === 'place') this.grandeMode = !!command.grande;
        if (command.type === 'choose') this.dismissedKey = null;
        this.render();
        const text = { place: '印の付いた場所に置く', wake: '印の付いた起きる時間', pass: 'パス', choose: '印の付いたもの' }[command.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    // おすすめの手のボタンに印を付ける（選ぶダイアログのボタンは描き直さないので、前の印を外してから）
    markHint() {
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const c = this.hintCommand;
        if (!c) return;
        const selector = {
            place: `[data-action="${c.action}"]`, wake: `[data-row="${c.row}"]`, pass: '[data-act="pass"]', choose: `#decide-body [data-index="${c.index}"]`
        }[c.type];
        if (selector) document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
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
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => this.showLog());

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりの画面は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        // 選ぶダイアログを閉じたら、盤面を見る扱いにする（選択は消さない。下の「選ぶ」で開き直す）
        $('#decide').addEventListener('close', () => {
            if (this.decideKey !== null) this.dismissedKey = this.decideKey;
            this.decideKey = null;
            if (this.view) this.renderActions(this.view);
        });
        $('#decide-body').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-index]');
            if (!button || !this.view?.pending) return;
            const key = this.decideKey;
            this.decideKey = null;
            $('#decide').close();
            this.dismissedKey = null;
            if (!this.send({ type: 'choose', index: Number(button.dataset.index) })) this.decideKey = key;
        });

        $('#board').addEventListener('click', (event) => {
            const row = event.target.closest('[data-row]');
            if (row) {
                this.send({ type: 'wake', row: Number(row.dataset.row) });
                return;
            }
            const tile = event.target.closest('[data-action]');
            if (tile) this.tapAction(tile.dataset.action);
        });
        $('#players').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-seat]');
            if (chip) this.showPlayer(Number(chip.dataset.seat));
        });
        $('#me').addEventListener('click', (event) => {
            if (event.target.closest('[data-act="hand"]')) this.showHand();
            else if (this.view) this.showPlayer(this.view.you);
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || !this.view) return;
            const act = button.dataset.act;
            if (act === 'pass') this.send({ type: 'pass' });
            else if (act === 'grande') {
                this.grandeMode = !this.grandeMode;
                music.play(this.grandeMode ? 'select' : 'cancel');
                this.render();
            } else if (act === 'decide') {
                this.dismissedKey = null;
                this.renderDecide(this.view);
            } else if (act === 'hand') this.showHand();
        });
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // 行動の場所をタップしたとき：ふつうの人で置けなければ大きいワーカーで置く
    tapAction(action) {
        const view = this.view;
        if (!view) return;
        const legal = view.placements;
        const normal = legal.some(p => p.action === action && !p.grande);
        const grande = legal.some(p => p.action === action && p.grande);
        let useGrande = this.grandeMode ? grande : !normal && grande;
        if (this.grandeMode && !grande && normal) useGrande = false;
        if (this.send({ type: 'place', action, grande: useGrande }) && useGrande) this.grandeMode = false;
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        if (prev && view.logCount !== prev.logCount) this.hintCommand = null;
        if (prev && !this.sending) this.playUpdate(prev);
        const me = view.players[view.you];
        if (!me.grandeFree) this.grandeMode = false;
        $('#status').innerHTML = this.statusHtml(view);
        this.renderPlayers(view);
        const last = view.logs.at(-1) ?? '';
        $('#ticker').textContent = last.startsWith('──') ? last.replace(/^── /, '') : last;
        this.renderBoard(view);
        $('#me').innerHTML = this.estateHtml(me, { mine: true });
        this.renderActions(view);
        this.renderDecide(view);
        this.markHint();
        if ($('#log').open) this.renderLog();
        if (view.season === 'end' && !this.resultTimer && !$('#result').open) {
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    statusHtml(view) {
        if (view.season === 'end') return '<b>終わり</b>';
        const when = view.year ? `${view.year}年目・${SEASON_NAME[view.season]}` : '準備';
        const actor = view.actors[0];
        let who = '';
        if (actor === view.you) who = '<b class="you">あなたの番</b>';
        else if (actor !== undefined) who = `${escapeHtml(view.players[actor].name)}の番`;
        return `<span class="when">${when}</span>${who}`;
    }

    renderPlayers(view) {
        $('#players').innerHTML = view.players.map(p => {
            const active = view.actors.includes(p.id);
            const total = p.workers + p.temp;
            return `<button class="chip${active ? ' active' : ''}${p.id === view.you ? ' mine' : ''}${p.passed && (view.season === 'summer' || view.season === 'winter') ? ' passed' : ''}" data-seat="${p.id}" style="--c:${COLORS[p.id]}">
<span class="c-name">${escapeHtml(p.name)}</span>
<span class="c-stats">${sym('s-star')}<b>${p.vp}</b>${sym('s-coin')}${p.lira}</span>
<span class="c-workers">${sym('s-worker')}${p.available}/${total}${p.grandeFree ? sym('s-grande', 'g') : ''}</span>
</button>`;
        }).join('');
    }

    renderBoard(view) {
        const board = $('#board');
        if (view.season === 'spring') {
            board.innerHTML = this.wakeHtml(view);
            return;
        }
        const season = ['winter', 'yearEnd', 'end'].includes(view.season) ? 'winter' : 'summer';
        const me = view.players[view.you];
        const myTurn = view.placements.length > 0;
        const tiles = ACTIONS.filter(a => a.season === season).map(a => this.tileHtml(view, a, myTurn));
        if (me.structures.includes('yoke')) {
            const legal = view.placements.some(p => p.action === 'yoke');
            const used = me.yokeUsed === season;
            tiles.push(`<button class="tile yoke${legal ? ' legal' : ''}${myTurn && !legal ? ' dim' : ''}" data-action="yoke">
<span class="t-name">くびき</span><span class="t-text">ブドウを抜くか、畑を1つ収穫（自分だけ）</span>
<span class="slots"><span class="slot${used ? ' on' : ''}" style="--c:${COLORS[view.you]}">${used ? sym('s-worker') : ''}</span></span></button>`);
        }
        board.innerHTML = `<div class="board-head ${season}">${season === 'summer' ? '夏' : '冬'}の行動${this.grandeMode ? '<span class="gm">大きいワーカーで置く</span>' : ''}</div><div class="tiles">${tiles.join('')}</div>`;
    }

    tileHtml(view, action, myTurn) {
        const space = view.spaces[action.id] ?? { slots: [], extra: [] };
        const legal = view.placements.some(p => p.action === action.id && (this.grandeMode ? p.grande : true));
        const slot = (seat, i) => `<span class="slot${i === 0 && action.bonusText ? ' bonus' : ''}${seat !== null ? ' on' : ''}" style="--c:${seat !== null ? COLORS[seat] : 'transparent'}">${seat !== null ? sym('s-worker') : i === 0 && action.bonusText ? '★' : ''}</span>`;
        const placed = action.open ? space.extra.map(seat => `<span class="slot on" style="--c:${COLORS[seat]}">${sym('s-worker')}</span>`).join('') : space.slots.map(slot).join('');
        const extra = action.open ? '' : space.extra.map(seat => `<span class="slot on grande" style="--c:${COLORS[seat]}">${sym('s-grande')}</span>`).join('');
        return `<button class="tile ${action.season}${legal ? ' legal' : ''}${myTurn && !legal ? ' dim' : ''}" data-action="${action.id}">
<span class="t-name">${action.name}</span>
<span class="t-text">${action.text}${action.bonusText ? `<em>★${action.bonusText}</em>` : ''}</span>
<span class="slots">${placed}${extra}</span></button>`;
    }

    wakeHtml(view) {
        const myTurn = view.actors[0] === view.you && !view.pending;
        const rows = WAKE_ROWS.map((row, i) => {
            const seat = view.wakeTaken[i];
            const free = seat === null;
            return `<button class="wake${free && myTurn ? ' legal' : ''}${!free ? ' taken' : ''}" data-row="${i}" ${free && myTurn ? '' : 'disabled'}>
<span class="w-num">${i + 1}</span><span class="w-label">${row.label}</span>
<span class="w-who">${free ? '' : `<span class="slot on" style="--c:${COLORS[seat]}">${sym('s-worker')}</span>${escapeHtml(view.players[seat].name)}`}</span></button>`;
        });
        return `<div class="board-head spring">春：起床時間<span class="sub">上ほど先に動ける</span></div><div class="wakes">${rows.join('')}</div>`;
    }

    // ブドウ園（畑・ブドウ・ワイン・建物）。mine：自分の画面の下に出す形
    estateHtml(p, { mine = false } = {}) {
        const total = p.workers + p.temp;
        const top = `<div class="me-top">
<span class="stat">${sym('s-star')}<b>${p.vp}</b>点</span>
<span class="stat">${sym('s-coin')}<b>${p.lira}</b>リラ</span>
<span class="stat" title="残りの収入">収入<b>${p.residual}</b></span>
<span class="stat">${sym('s-worker')}<b>${p.available}</b>/${total}${p.grandeFree ? sym('s-grande', 'g') : `<span class="g-used">${sym('s-grande', 'g')}</span>`}</span>
${mine ? `<button class="hand-btn" data-act="hand">手札<b>${p.handCount}</b></button>` : ''}</div>`;
        const fields = `<div class="fields">${p.fields.map(f => {
            const sum = f.vines.reduce((s, id) => s + vineValue(CARDS[id]), 0);
            return `<div class="field${f.sold ? ' sold' : ''}${f.harvested ? ' harvested' : ''}">
<div class="f-head"><span>畑${f.max}</span><span class="f-sum">${f.sold ? '売却' : `${sum}/${f.max}`}</span></div>
<div class="f-vines">${f.vines.map(id => (f.vines.length > 2 ? `<span class="vine badge">${valueBadges(CARDS[id])}</span>` : `<span class="vine">${valueBadges(CARDS[id])}${vineShort(CARDS[id])}</span>`)).join('')}</div></div>`;
        }).join('')}</div>`;
        const cap = p.structures.includes('large') ? 9 : p.structures.includes('medium') ? 6 : 3;
        const rows = [
            ['赤ブドウ', 'gr', p.crush.red, 1, 9],
            ['白ブドウ', 'gw', p.crush.white, 1, 9],
            ['赤ワイン', 'wr', p.cellar.red, 1, cap],
            ['白ワイン', 'ww', p.cellar.white, 1, cap],
            ['ブラッシュ', 'wb', p.cellar.blush, 4, cap],
            ['スパーク', 'ws', p.cellar.sparkling, 7, cap]
        ];
        const grid = `<div class="cellar">${rows.map(([label, cls, list, lo, hi]) => `<span class="cl">${label}</span>${Array.from({ length: 9 }, (_, i) => {
            const v = i + 1;
            const off = v < lo || v > hi;
            return `<i class="cc ${cls}${list.includes(v) ? ' on' : ''}${off ? ' off' : ''}">${v}</i>`;
        }).join('')}`).join('')}</div>`;
        const structs = `<div class="structs">${STRUCTURES.map(s => `<span class="st${p.structures.includes(s.id) ? ' on' : ''}">${s.name}</span>`).join('')}</div>`;
        return `${top}${fields}${grid}${structs}`;
    }

    renderActions(view) {
        const el = $('#actions');
        const me = view.players[view.you];
        const hand = `<button class="btn ghost small" data-act="hand">手札 ${me.handCount}</button>`;
        let main = '';
        if (view.season === 'end') {
            main = '<span class="hint">終わりました</span>';
        } else if (view.pending?.seat === view.you) {
            main = `<button class="btn primary" data-act="decide">選ぶ</button>`;
        } else if (view.placements.length) {
            main = `${me.grandeFree ? `<button class="btn ${this.grandeMode ? 'primary' : 'ghost'} small" data-act="grande" aria-pressed="${this.grandeMode}">${sym('s-grande')}大きいワーカー</button>` : ''}
<button class="btn secondary" data-act="pass">パス</button>`;
        } else if (view.season === 'spring' && view.actors[0] === view.you) {
            main = '<span class="hint">起床時間の段を選んでください</span>';
        } else if (view.pending) {
            main = `<span class="hint">${escapeHtml(view.players[view.pending.seat].name)}：${escapeHtml(view.pending.title)}</span>`;
        } else {
            main = '<span class="hint">待っています…</span>';
        }
        el.innerHTML = `${hand}<div class="act-main">${main}</div>`;
    }

    renderDecide(view) {
        const dialog = $('#decide');
        const pending = view.pending;
        if (!pending || pending.seat !== view.you || view.season === 'end') {
            if (dialog.open) {
                this.decideKey = null;
                dialog.close();
            }
            return;
        }
        if (this.dismissedKey === pending.id) return;
        if (dialog.open && this.decideKey === pending.id) return;
        this.decideKey = pending.id;
        $('#decide-title').textContent = pending.title;
        $('#decide-body').innerHTML = pending.options.map((o, i) => {
            if (pending.handler === 'visitor' && o.card !== undefined) return `<button class="opt card-opt" data-index="${i}">${cardHtml(o.card)}</button>`;
            if (pending.handler === 'discardCard') return `<button class="opt card-opt" data-index="${i}">${cardHtml(o.card)}</button>`;
            return `<button class="opt${o.skip ? ' skip' : ''}" data-index="${i}">${escapeHtml(o.label)}</button>`;
        }).join('');
        if (!dialog.open) dialog.showModal();
        $('#decide-body').scrollTop = 0;
    }

    // ---- ダイアログ ----

    showHand() {
        const view = this.view;
        if (!view) return;
        const me = view.players[view.you];
        const order = ['vine', 'order', 'summer', 'winter'];
        const ids = [...me.hand].sort((a, b) => order.indexOf(CARDS[a].deck) - order.indexOf(CARDS[b].deck) || a - b);
        $('#cards-title').textContent = `手札（${ids.length}枚）`;
        $('#cards-body').innerHTML = ids.length ? ids.map(cardHtml).join('') : '<p class="empty">手札はありません</p>';
        $('#cards').showModal();
    }

    showPlayer(seat) {
        const view = this.view;
        if (!view) return;
        const p = view.players[seat];
        $('#cards-title').textContent = p.name;
        const counts = Object.entries(p.handCounts).map(([deck, k]) => `${DECK_NAME[deck]}${k}`).join('・');
        const mama = MAMAS[p.mama];
        const papa = PAPAS[p.papa];
        $('#cards-body').innerHTML = `<div class="estate">${this.estateHtml(p)}</div>
<p class="p-info">手札 ${p.handCount}枚（${counts}）<br>起床 ${p.wake !== null ? p.wake + 1 : '—'}・ママ${mama.name}・パパ${papa.name}</p>
${seat === view.you && p.hand.length ? p.hand.map(cardHtml).join('') : ''}`;
        $('#cards').showModal();
    }

    renderLog() {
        $('#log-list').innerHTML = (this.view?.logs ?? []).map(line => `<li class="${line.startsWith('──') ? 'sep' : ''}">${escapeHtml(line.replace(/^── /, ''))}</li>`).join('');
    }

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    showResult() {
        const view = this.view;
        if (!view) return;
        const wineTotal = (p) => Object.values(p.cellar).flat().reduce((s, v) => s + v, 0);
        const ranked = [...view.players].sort((a, b) => b.vp - a.vp || b.lira - a.lira || wineTotal(b) - wineTotal(a));
        const won = view.winners.includes(view.you);
        $('#result-title').textContent = won ? 'あなたの勝ち' : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
        $('#result-table').innerHTML = `<table><tr><th></th><th>名前</th><th>点</th><th>リラ</th><th>ワイン</th></tr>${ranked.map((p, i) => `<tr class="${view.winners.includes(p.id) ? 'win' : ''}">
<td>${i + 1}</td><td><span class="dot" style="--c:${COLORS[p.id]}"></span>${escapeHtml(p.name)}</td><td>${p.vp}</td><td>${p.lira}</td><td>${wineTotal(p)}</td></tr>`).join('')}</table>
<p class="result-year">${view.year}年目で終わり</p>`;
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
