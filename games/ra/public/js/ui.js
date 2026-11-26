/**
 * 画面（タイトル・ゲーム・時代の得点・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 競りの番は、出せる自分の太陽駒が光る。押すと出す。神は「神で取る」を押してから、競りのトラックのタイルを選ぶ
 */

import { TILES, TILE_ORDER, CIVS, MONUMENTS, AUCTION_MAX, SUN_SETS, RA_TRACK } from './data.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, icon, tileHtml, sunHtml } from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';

// 自分の操作の音：引く・ラー宣言・神で取る・太陽駒を出す・見送る・災害で捨てる
const COMMAND_SOUND = { draw: 'draw', ra: 'place', god: 'gain', bid: 'place', pass: 'select', discard: 'pay' };

const SETTINGS_KEY = 'ra.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン'];
const RESULT_DELAY_MS = 900;
const FLOAT_MS = 1100;
const ROWS = { god: '神', gold: '金', pharaoh: 'ファラオ', river: 'ナイル河', civ: '文明', monument: 'モニュメント', sun: '太陽駒' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [2, 3, 4, 5].includes(saved.count) ? saved.count : 3, level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy' };
    } catch {
        return { count: 3, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 手元のタイル（種類ごとに枚数）
export function holdingsHtml(tiles, { cls = '' } = {}) {
    const list = TILE_ORDER.filter(t => (tiles[t] ?? 0) > 0);
    return list.length ? list.map(t => tileHtml(t, { cls, count: tiles[t] })).join('') : '<span class="empty">タイルなし</span>';
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.godMode = false;
        this.godPicks = [];
        this.discardPicks = [];
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'ラー',
            game: 'ra',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 650,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
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
        const previous = this.view;
        this.render();
        this.playUpdateSound(previous);
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
        $('#fx').innerHTML = '';
        this.controller = controller;
        this.view = null;
        this.godMode = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
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
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#fx').innerHTML = '';
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
        $('#again').addEventListener('click', () => {
            if (this.controller?.isOnline) {
                $('#result').close();
                this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
                return;
            }
            this.newGame();
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hint').addEventListener('click', () => this.showHint());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result' || dialog.id === 'choose') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#others').addEventListener('click', (event) => {
            const row = event.target.closest('[data-player]');
            if (row) this.showDetail(Number(row.dataset.player));
        });
        $('#table').addEventListener('click', (event) => {
            const slot = event.target.closest('[data-slot]');
            if (!slot) return;
            const i = Number(slot.dataset.slot);
            const type = this.view.auctionTrack[i];
            if (!this.godMode) return this.toast(this.tileText(type));
            if (type === 'god') return this.toast('神は神で取れません');
            const gods = this.me().tiles.god ?? 0;
            if (this.godPicks.includes(i)) this.godPicks = this.godPicks.filter(x => x !== i);
            else if (this.godPicks.length < gods) this.godPicks.push(i);
            music.play('select');
            this.render();
        });
        $('#me').addEventListener('click', (event) => {
            const sun = event.target.closest('[data-sun]');
            if (sun && this.myPrompt('auction')) return this.send({ type: 'bid', sun: Number(sun.dataset.sun) });
            const tile = event.target.closest('[data-type]');
            if (tile) this.toast(this.tileText(tile.dataset.type));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            this.onAction(button.dataset.act);
        });
        $('#choose-body').addEventListener('click', (event) => {
            const el = event.target.closest('[data-pick]');
            if (!el) return;
            const i = Number(el.dataset.pick);
            const need = this.view.disaster.needed;
            if (this.discardPicks.includes(i)) this.discardPicks = this.discardPicks.filter(x => x !== i);
            else if (this.discardPicks.length < need) this.discardPicks.push(i);
            music.play('select');
            this.renderChoose();
        });
        $('#choose-ok').addEventListener('click', () => {
            const held = this.view.disaster.held;
            const tiles = this.discardPicks.map(i => held[i]);
            $('#choose').close();
            this.send({ type: 'discard', tiles });
        });
    }

    send(command) {
        this.sending = true;
        const ok = this.controller?.send(command);
        this.sending = false;
        if (ok) {
            this.godMode = false;
            this.godPicks = [];
            this.hint = null;
            if (!this.view.over) music.play(COMMAND_SOUND[command.type] ?? 'place');
        }
        return ok;
    }

    // 1回の更新に1つの音。自分の手の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const v = this.view;
        if (!previous) return;
        if (v.over) {
            if (!previous.over) music.play(v.winner === v.you ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const mine = v.answering.includes(v.you);
        music.play(mine && !previous.answering.includes(previous.you) ? 'turn' : 'notify');
    }

    hintKey(view = this.view) {
        return `${view.phase}:${view.logs.length}`;
    }

    // おすすめの手：押すボタン・出す太陽駒を光らせる。神で取る手は、取るタイルを選んだ状態にする（押すのは自分）
    showHint() {
        const c = (this.myPrompt('play') || this.myPrompt('auction')) && this.controller?.hint();
        if (!c) {
            music.play('error');
            return;
        }
        music.play('select');
        this.godMode = c.type === 'god';
        this.godPicks = c.type === 'god' ? [...c.slots] : [];
        this.hint = { key: this.hintKey(), command: c };
        this.render();
    }

    markHint() {
        const c = this.hint?.key === this.hintKey() ? this.hint.command : null;
        if (!c) {
            this.hint = null;
            return;
        }
        if (c.type === 'bid') $(`#me [data-sun="${c.sun}"]`)?.classList.add('recommended');
        else $(`#actions [data-act="${c.type === 'god' ? 'god-take' : c.type}"]`)?.classList.add('recommended');
    }

    me() {
        return this.view.players[this.view.you];
    }

    myPrompt(phase) {
        const v = this.view;
        return !!v && !v.over && v.phase === phase && v.answering.includes(v.you);
    }

    tileText(type) {
        const t = TILES[type];
        const text = {
            ra: '引くとラーのトラックに置き、競りになる',
            god: '時代の終わりに2点。手番に使うと、競りのトラックから1枚取れる（神は取れない）',
            gold: '時代の終わりに3点',
            pharaoh: '時代の終わりに、一番多い人+5、一番少ない人-2。残る',
            nile: '洪水が1枚以上あれば、時代の終わりに1点。残る',
            flood: '時代の終わりに1点（ナイル河も数えられる）'
        }[type];
        if (text) return `${t.name}：${text}`;
        if (t.group === 'civ') return `${t.name}（文明）：時代の終わりに、0種-5、3種+5、4種+10、5種+15`;
        if (t.group === 'monument') return `${t.name}（モニュメント）：最後に、種類の数と、同じ種類3〜5枚で点。残る`;
        return `${t.name}（災害）：取った人は${t.hits}を2枚捨てる`;
    }

    onAction(act) {
        switch (act) {
            case 'draw': return this.send({ type: 'draw' });
            case 'ra': return this.send({ type: 'ra' });
            case 'god':
                this.godMode = !this.godMode;
                this.godPicks = [];
                music.play(this.godMode ? 'select' : 'cancel');
                return this.render();
            case 'god-take': return this.send({ type: 'god', slots: [...this.godPicks] });
            case 'pass': return this.send({ type: 'pass' });
        }
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        $('#title-art').innerHTML = ['pharaoh', 'nile', 'god', 'ra', 'pyramid', 'gold', 'sphinx'].map((t, i) => `<span class="t-tile" style="--i:${i}">${tileHtml(t)}</span>`).join('');
    }

    renderHelp() {
        const list = (types) => types.map(t => `${tileHtml(t, { cls: 'mini' })}`).join('');
        const suns = Object.entries(SUN_SETS).map(([n, sets]) => `<li><strong>${n}人</strong><span>${sets.map(s => s.join('・')).join(' ／ ')}（ラー ${RA_TRACK[n]}枚）</span></li>`).join('');
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>3つの時代で、太陽駒を出してタイルの競りに勝ち、点を集めます。各自10点で始め、点の一番多い人の勝ちです。</p>
            <h3>手番</h3>
            <ul class="help-list">
                <li><strong>引く</strong><span>袋から1枚引いて、競りのトラックに置く（8枚まで）。ラーなら、ラーのトラックに置いて競り</span></li>
                <li><strong>ラー</strong><span>競りを始める。ほかの全員が見送ったら、ラー宣言した人は太陽駒を出さなければならない（トラックが8枚のときを除く）</span></li>
                <li><strong>神</strong><span>持っている神1枚につき、競りのトラックから1枚取る（神は取れない）</span></li>
            </ul>
            <h3>競り</h3>
            <p>ラーの人の左から順に1回ずつ、前より大きい太陽駒を1枚出すか見送ります。ラーの人は最後。勝った人は、トラックのタイルをすべて取り、出した太陽駒を中央に置いて、中央の太陽駒を裏向きで受け取ります（この時代では使えない）。表の太陽駒がなくなった人は、時代の終わりまで休みです。</p>
            <h3>災害</h3>
            <p>${list(['funeral', 'drought', 'unrest', 'earthquake'])} 取った人は、それぞれ2枚捨てます：葬式はファラオ、干ばつは洪水（足りなければナイル河）、内乱は文明、地震はモニュメント。</p>
            <h3>時代の終わり</h3>
            <p>ラーのトラックが埋まるか、全員の太陽駒が裏になったら終わり（ラーのトラックが埋まったときは、競りのトラックのタイルも捨てる）。得点のあと、太陽駒を表に戻します。</p>
            <ul class="help-list">
                <li><strong>神</strong><span>1枚2点（捨てる）</span></li>
                <li><strong>金</strong><span>1枚3点（捨てる）</span></li>
                <li><strong>ファラオ</strong><span>一番多い人+5、一番少ない人-2（残る）</span></li>
                <li><strong>ナイル河・洪水</strong><span>洪水が1枚以上あれば、ナイル河と洪水1枚1点（洪水は捨て、ナイル河は残る）</span></li>
                <li><strong>文明</strong><span>0種-5、3種+5、4種+10、5種+15（捨てる）</span></li>
                <li><strong>モニュメント</strong><span>最後だけ：種類の数で1〜6点（7種10、8種15）、同じ種類3/4/5枚で+5/10/15（残る）</span></li>
                <li><strong>太陽駒</strong><span>最後だけ：合計の一番大きい人+5、一番小さい人-5</span></li>
            </ul>
            <p>点は0より下がりません。同点なら、一番大きい太陽駒を持つ人が上です。</p>
            <h3>太陽駒の組</h3>
            <ul class="help-list">${suns}</ul>
            <h3>タイル（180枚）</h3>
            <p>${list(['ra', 'god', 'gold', 'pharaoh', 'nile', 'flood'])}<br>${list(CIVS)}<br>${list(MONUMENTS)}</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const view = this.controller.getView();
        this.view = view;
        if (!this.myPrompt('play')) {
            this.godMode = false;
            this.godPicks = [];
        }
        this.renderStatus(view);
        this.renderOthers(view);
        this.renderTable(view);
        this.renderMe(view);
        this.renderActions(view);
        $('#hint').disabled = !(this.myPrompt('play') || this.myPrompt('auction'));
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        this.markHint();
        this.updateChoose(view);
        this.playEvents(view, prev);
        if ($('#log').open) this.renderLog();
        if (view.over && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    renderStatus(view) {
        $('#status').innerHTML = `<span class="epoch">第${view.epoch}/3時代</span><span class="bag">袋 ${view.bagCount}</span>`;
    }

    // その人の状態（競りでの答え・ラーの印・手番）
    stateTag(view, p) {
        const a = view.auction;
        if (a) {
            if (p.id in a.bids) return a.bids[p.id] === null ? '<span class="tag pass">見送り</span>' : `<span class="tag bidtag">出す ${a.bids[p.id]}</span>`;
            if (a.order[a.index] === p.id) return '<span class="tag think">…</span>';
        }
        if (!view.over && view.phase === 'play' && view.current === p.id) return '<span class="tag turn">手番</span>';
        if (!p.suns.length && !view.over) return '<span class="tag rest">休み</span>';
        return '';
    }

    renderOthers(view) {
        const n = view.players.length;
        const others = Array.from({ length: n - 1 }, (_, k) => view.players[(view.you + 1 + k) % n]);
        $('#others').dataset.count = String(others.length);
        $('#others').innerHTML = others.map(p => {
            const ra = view.auction?.raPlayer === p.id ? '<span class="ra-mark" title="ラーの人">ラー</span>' : '';
            const current = view.answering.includes(p.id) && !view.over;
            return `<button class="other ${current ? 'current' : ''}" data-player="${p.id}">
                <span class="o-head"><span class="o-name">${escapeHtml(p.name)}</span>${ra}<span class="score" data-score="${p.id}">${p.score}</span></span>
                <span class="o-suns">${p.suns.map(v => sunHtml(v, { cls: 'small' })).join('')}${Array.from({ length: p.downCount }, () => sunHtml(null, { cls: 'small', down: true })).join('')}${this.stateTag(view, p)}</span>
                <span class="o-tiles">${holdingsHtml(p.tiles, { cls: 'micro' })}</span>
            </button>`;
        }).join('');
    }

    renderTable(view) {
        const ra = Array.from({ length: view.raLimit }, (_, i) => `<span class="ra-slot ${i < view.raTrack ? 'on' : ''}">${i < view.raTrack ? tileHtml('ra', { cls: 'micro' }) : ''}</span>`).join('');
        const slots = Array.from({ length: AUCTION_MAX }, (_, i) => {
            const t = view.auctionTrack[i];
            if (!t) return '<span class="slot"></span>';
            const cls = this.godMode ? (t === 'god' ? 'off' : 'pickable') : '';
            return tileHtml(t, { cls: `${cls} ${this.godPicks.includes(i) ? 'picked' : ''}`, attrs: `data-slot="${i}"` });
        }).join('');
        const a = view.auction;
        const note = a ? (a.high ? `一番高いのは ${escapeHtml(view.players[a.high.seat].name)} の ${a.high.sun}` : '競り：まだだれも出していません') : (view.over ? '' : `${escapeHtml(view.players[view.current]?.name ?? '')}の手番`);
        $('#table').innerHTML = `<div class="ra-row"><span class="ra-label">ラー</span><span class="ra-track">${ra}</span>
                <span class="center">${sunHtml(view.center, { cls: 'big' })}</span></div>
            <div class="auction">${slots}</div>
            <div class="note">${note}</div>
            <div class="last-log">${escapeHtml(view.logs.at(-1) ?? '')}</div>`;
    }

    renderMe(view) {
        const me = this.me();
        const bidding = this.myPrompt('auction');
        const high = view.auction?.high?.sun ?? 0;
        const suns = me.suns.map(v => sunHtml(v, { cls: bidding && v > high ? 'can' : '', attrs: bidding && v > high ? `data-sun="${v}"` : '' })).join('');
        const down = (me.downSuns ?? []).map(v => sunHtml(v, { down: true })).join('');
        $('#me').innerHTML = `<div class="me-head">${suns}${down}<span class="me-score">あなた <b data-score="${me.id}">${me.score}</b>点</span></div>
            <div class="me-tiles">${holdingsHtml(me.tiles)}</div>`;
    }

    renderActions(view) {
        let html = '';
        if (this.myPrompt('play')) {
            const gods = this.me().tiles.god ?? 0;
            const full = view.auctionTrack.length >= AUCTION_MAX;
            if (this.godMode) {
                html = `<span class="hint">神で取るタイルを選ぶ（${this.godPicks.length}/${gods}）</span>
                    <button class="act gold" data-act="god-take" ${this.godPicks.length ? '' : 'disabled'}>取る</button>
                    <button class="act" data-act="god">やめる</button>`;
            } else {
                html = `<button class="act" data-act="draw" ${full ? 'disabled' : ''}>引く</button>
                    <button class="act ra" data-act="ra">ラー</button>
                    ${gods && view.auctionTrack.some(t => t !== 'god') ? `<button class="act god" data-act="god">神で取る</button>` : ''}`;
            }
        } else if (this.myPrompt('auction')) {
            html = `<span class="hint">${view.mustBid ? '太陽駒を出してください（自分でラー宣言した競り）' : '出す太陽駒を押す'}</span>${view.mustBid ? '' : '<button class="act" data-act="pass">見送る</button>'}`;
        }
        $('#actions').innerHTML = html;
    }

    // 災害で捨てるタイルを選ぶ
    updateChoose(view) {
        if (!this.myPrompt('disaster')) {
            if ($('#choose').open) $('#choose').close();
            return;
        }
        if (!$('#choose').open) {
            this.discardPicks = [];
            this.renderChoose();
            $('#choose').showModal();
        }
    }

    renderChoose() {
        const d = this.view.disaster;
        $('#choose-title').textContent = `${TILES[d.kind].name}：${d.needed}枚を捨てる`;
        $('#choose-body').innerHTML = d.held.map((t, i) => tileHtml(t, { cls: `big ${this.discardPicks.includes(i) ? 'picked' : ''}`, attrs: `data-pick="${i}"` })).join('');
        $('#choose-ok').disabled = this.discardPicks.length !== d.needed;
    }

    // ---- 得点・記録・終わり ----

    epochTable(rows, view, { final = false } = {}) {
        const keys = Object.keys(ROWS).filter(k => final || (k !== 'monument' && k !== 'sun'));
        const head = `<tr><th></th>${rows.map(r => `<th>${escapeHtml(view.players[r.seat].name)}</th>`).join('')}</tr>`;
        const body = keys.map(k => `<tr><td>${ROWS[k]}</td>${rows.map(r => `<td class="${r[k] < 0 ? 'neg' : ''}">${r[k] ? (r[k] > 0 ? `+${r[k]}` : r[k]) : '·'}</td>`).join('')}</tr>`).join('');
        const total = `<tr class="total"><td>計</td>${rows.map(r => `<td>${r.after}</td>`).join('')}</tr>`;
        return `<table class="score-table">${head}${body}${total}</table>`;
    }

    showEpoch(event) {
        const v = this.view;
        $('#epoch-title').textContent = `第${event.epoch}時代の得点`;
        $('#epoch-body').innerHTML = this.epochTable(event.rows, v, { final: event.epoch === 3 });
        if (event.epoch < 3) $('#epoch').showModal();
    }

    showDetail(seat) {
        const v = this.view;
        const p = v.players[seat];
        $('#detail-title').textContent = `${p.name}（${p.score}点）`;
        const down = p.downSuns ? p.downSuns.map(x => sunHtml(x, { down: true })).join('') : Array.from({ length: p.downCount }, () => sunHtml(null, { down: true })).join('');
        $('#detail-body').innerHTML = `<div class="d-suns">${p.suns.map(x => sunHtml(x)).join('')}${down}</div><div class="d-tiles">${holdingsHtml(p.tiles)}</div>`;
        $('#detail').showModal();
    }

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
        if (!v || !v.over) return;
        $('#result-title').textContent = v.winner === v.you ? 'あなたの勝ち' : `${v.players[v.winner].name}の勝ち`;
        const ranking = v.ranking.map((seat, i) => `<li><span class="rank-no">${i + 1}</span><span class="name">${escapeHtml(v.players[seat].name)}</span><span class="total">${v.players[seat].score}点</span></li>`).join('');
        $('#result-body').innerHTML = `<ol class="result-list">${ranking}</ol><h3>第3時代の得点</h3>${this.epochTable(v.epochScores.at(-1), v, { final: true })}`;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        fresh.forEach(e => {
            if (e.type === 'epoch') {
                e.rows.forEach(r => { if (r.after !== r.before) this.floatText(`[data-score="${r.seat}"]`, r.after - r.before); });
                this.showEpoch(e);
            }
            if (e.type === 'draw' && e.seat !== view.you && e.tile === 'ra') this.toast(`${view.players[e.seat].name}がラーを引きました`);
            if (e.type === 'disaster' && e.seat === view.you) this.toast(`${TILES[e.kind].name}：${e.tiles.map(t => TILES[t].name).join('・')}を失いました`);
        });
    }

    floatText(selector, amount) {
        const target = $(selector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = `float ${amount > 0 ? 'plus' : 'minus'}`;
        el.textContent = amount > 0 ? `+${amount}` : `−${-amount}`;
        el.style.left = `${rect.left + rect.width / 2}px`;
        el.style.top = `${rect.top}px`;
        $('#fx').appendChild(el);
        setTimeout(() => el.remove(), reduceMotion() ? 600 : FLOAT_MS);
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}

