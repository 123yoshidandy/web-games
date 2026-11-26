/**
 * 画面（タイトル・対局・結果・遊び方）
 * 画面はコントローラーのビューだけを見て描き、操作は send() で送る
 * 席の並びは自分から見た位置（rel）で描く。0：自分（下）・1：下家（右）・2：対面（上）・3：上家（左）
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { DRAW_REASONS, roundName } from './game.js';
import { windName } from './tiles.js';
import { handPoints } from './scoring.js';
import { symbolsSvg, tileHtml, kindTileHtml, titleArtHtml } from './art.js';

const SETTINGS_KEY = 'mahjong.settings';
const NAMES = ['あなた', '下家', '対面', '上家'];
const CALL_LABELS = { pon: 'ポン', chi: 'チー', kan: 'カン', riichi: 'リーチ', ron: 'ロン', tsumo: 'ツモ', kyuushu: '九種九牌' };
const RESULT_DELAY_MS = 1100;   // 和了の声を見せてから結果を出す
const AUTO_DISCARD_MS = 550;    // 立直のあとのツモ切り

const $ = (id) => document.getElementById(id);

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { length: saved.length === 'south' ? 'south' : 'east', level: saved.level === 'easy' ? 'easy' : 'normal', calls: saved.calls !== false };
    } catch {
        return { length: 'east', level: 'normal', calls: true };
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
        this.selected = null;     // 選んで持ち上げた牌
        this.riichiMode = false;  // 立直の宣言牌を選んでいる
        this.chiOpen = false;     // チーの組み合わせを選んでいる
        this.lastSeq = 0;
        this.revealedResult = null;
        this.timers = {};
        $('symbols').innerHTML = symbolsSvg();
        $('title-art').innerHTML = titleArtHtml();
        $('help-body').innerHTML = helpHtml();
        this.bind();
    }

    bind() {
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
        $('length').addEventListener('click', event => {
            const button = event.target.closest('button[data-length]');
            if (!button) return;
            this.settings.length = button.dataset.length;
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('level').addEventListener('click', event => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('start').addEventListener('click', () => this.startGame(null));
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
            else this.renderSetup();
        });
        $('home').addEventListener('click', () => this.showTitle());
        $('open-help-title').addEventListener('click', () => this.openHelp());
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('close-help').addEventListener('click', () => this.closeHelp());
        $('overlay-help').addEventListener('click', event => {
            if (event.target === $('overlay-help')) this.closeHelp();
        });
        $('toggle-calls').addEventListener('click', () => {
            this.settings.calls = !this.settings.calls;
            saveSettings(this.settings);
            this.render();
        });
        $('hand').addEventListener('click', event => {
            const tile = event.target.closest('.hand-tile');
            if (tile) this.onTile(Number(tile.dataset.id));
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('button[data-act]');
            if (button?.dataset.act === 'hint') return this.showHint();
            if (button) this.onAction(button.dataset.act, button.dataset.arg);
        });
        $('result-buttons').addEventListener('click', event => {
            const button = event.target.closest('button[data-act]');
            if (!button) return;
            if (button.dataset.act === 'next') this.send({ type: 'next' });
            if (button.dataset.act === 'again') this.startGame(null);
            if (button.dataset.act === 'home') this.showTitle();
        });
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('screen-game').hidden = true;
        $('overlay-result').hidden = true;
        $('screen-title').hidden = false;
        this.renderSetup();
    }

    renderSetup() {
        document.querySelectorAll('#length button').forEach(button => {
            button.setAttribute('aria-checked', String(button.dataset.length === this.settings.length));
        });
        document.querySelectorAll('#level button').forEach(button => {
            button.setAttribute('aria-checked', String(button.dataset.level === this.settings.level));
        });
        $('resume').hidden = !loadSavedGame();
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        Object.values(this.timers).forEach(clearTimeout);
        this.timers = {};
    }

    startGame(saved) {
        this.stopGame();
        if (!saved) clearSavedGame();
        const setup = saved ?? {
            players: NAMES.map((name, i) => ({ name, isCPU: i !== 0 })),
            options: { length: this.settings.length, level: this.settings.level }
        };
        try {
            this.controller = new LocalGameController(setup, {
                onUpdate: () => this.render(),
                onError: (message) => this.toast(message)
            });
        } catch (error) {
            // 保存が壊れていたら、新しく始める
            console.error(error);
            clearSavedGame();
            this.controller = new LocalGameController({
                players: NAMES.map((name, i) => ({ name, isCPU: i !== 0 })),
                options: { length: this.settings.length, level: this.settings.level }
            }, { onUpdate: () => this.render(), onError: (message) => this.toast(message) });
        }
        this.selected = null;
        this.riichiMode = false;
        this.chiOpen = false;
        this.revealedResult = null;
        this.lastSeq = this.controller.game.eventSeq;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    send(command) {
        if (!this.controller) return false;
        this.selected = null;
        this.riichiMode = false;
        this.chiOpen = false;
        const ok = this.controller.send(command);
        if (!ok) this.render();
        return ok;
    }

    openHelp() {
        $('overlay-help').hidden = false;
        $('help-body').scrollTop = 0;
    }

    closeHelp() {
        $('overlay-help').hidden = true;
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.timers.toast);
        this.timers.toast = setTimeout(() => el.classList.remove('show'), 1800);
    }

    // ---- ヒント ----

    hintKey(view) {
        return `${view.handNo}:${view.wallCount}:${view.options?.type}:${view.call?.tile ?? ''}`;
    }

    // おすすめの手を示す。捨てる牌は選んでおき（もう一度押すと捨てる）、リーチは宣言牌を選んでおく。ほかはボタンを光らせる
    showHint() {
        const view = this.view;
        const command = this.controller?.suggest();
        if (!view || !command) return;
        this.hint = { at: this.hintKey(view), command };
        if (command.type === 'discard') {
            this.riichiMode = !!command.riichi;
            this.selected = command.tile;
        }
        this.render();
    }

    markHint(view) {
        if (this.hint?.at !== this.hintKey(view)) this.hint = null;
        const c = this.hint?.command;
        if (!c) return;
        const mark = (selector) => document.querySelector(selector)?.classList.add('suggested');
        if (c.type === 'discard') mark(`#hand [data-id="${c.tile}"]`);
        else if (c.type === 'kan') mark(`#actions [data-act="kan"][data-arg="${c.kind}"]`);
        else if (c.type === 'pon') mark('#actions [data-act="pon"]');
        else mark(`#actions [data-act="${c.type}"]`);
    }

    // ---- 操作 ----

    onTile(id) {
        const view = this.view;
        const o = view?.options;
        if (!o || o.type !== 'turn') return;
        const allowed = this.riichiMode ? o.riichi : o.discards;
        if (!allowed.includes(id)) return;
        if (this.selected === id) {
            this.send({ type: 'discard', tile: id, riichi: this.riichiMode });
            return;
        }
        this.selected = id;
        this.render();
    }

    onAction(act, arg) {
        const o = this.view?.options;
        if (!o) return;
        if (act === 'tsumo') this.send({ type: 'tsumo' });
        if (act === 'riichi') {
            this.riichiMode = true;
            this.selected = o.riichi.length === 1 ? o.riichi[0] : (o.riichi.includes(this.selected) ? this.selected : null);
            this.render();
        }
        if (act === 'cancel') {
            this.riichiMode = false;
            this.chiOpen = false;
            this.render();
        }
        if (act === 'kan') this.send({ type: 'kan', kind: Number(arg) });
        if (act === 'kyuushu') this.send({ type: 'kyuushu' });
        if (act === 'ron') this.send({ type: 'ron' });
        if (act === 'pon') this.send({ type: 'pon', tiles: o.pon[Number(arg)] });
        if (act === 'minkan') this.send({ type: 'minkan' });
        if (act === 'pass') this.send({ type: 'pass' });
        if (act === 'chi') {
            if (o.chi.length === 1) this.send({ type: 'chi', tiles: o.chi[0] });
            else {
                this.chiOpen = true;
                this.render();
            }
        }
        if (act === 'chi-pick') this.send({ type: 'chi', tiles: o.chi[Number(arg)] });
    }

    // 立直のあとのツモ切りと、鳴きの確認をしないときの見送りは、自動で行う
    autoActions(view) {
        const o = view.options;
        clearTimeout(this.timers.auto);
        if (!o) return;
        const me = view.players[view.you];
        if (o.type === 'turn' && me.riichi > 0 && !o.tsumo && o.kans.length === 0 && o.discards.length === 1) {
            const key = `${view.handNo}:${view.wallCount}:${o.discards[0]}`;
            this.timers.auto = setTimeout(() => {
                if (this.view?.options?.type === 'turn' && `${this.view.handNo}:${this.view.wallCount}:${this.view.options.discards[0]}` === key) {
                    this.send({ type: 'discard', tile: o.discards[0] });
                }
            }, AUTO_DISCARD_MS);
        }
        if (o.type === 'call' && !o.ron && !this.settings.calls) {
            this.timers.auto = setTimeout(() => {
                if (this.view?.options?.type === 'call' && !this.view.options.ron) this.send({ type: 'pass' });
            }, 0);
        }
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        const o = view.options;
        if (!o || o.type !== 'turn') { this.selected = null; this.riichiMode = false; }
        if (!o || o.type !== 'call') this.chiOpen = false;
        if (o?.type === 'turn' && this.selected !== null && !o.discards.includes(this.selected) && !o.riichi.includes(this.selected)) this.selected = null;
        $('toggle-calls').setAttribute('aria-pressed', String(this.settings.calls));
        this.renderTable(view);
        this.renderPanels(view);
        this.renderMine(view);
        this.renderHand(view);
        this.renderActions(view);
        this.renderBubbles(view);
        this.renderResult(view);
        this.autoActions(view);
    }

    rel(view, seat) {
        return (seat - view.you + 4) % 4;
    }

    renderTable(view) {
        const target = view.call && view.options?.type === 'call' ? view.call : null;
        view.players.forEach(p => {
            const rel = this.rel(view, p.id);
            const rows = [];
            p.discards.forEach((d, i) => {
                const row = Math.floor(i / 6);
                rows[row] = rows[row] ?? [];
                const cls = [
                    d.called ? 'called' : '',
                    view.lastDiscard?.seat === p.id && i === p.discards.length - 1 && !d.called ? (target ? 'target' : 'last') : ''
                ].filter(Boolean).join(' ');
                rows[row].push(tileHtml(d.tile, { size: 'sm', side: d.riichi, cls }));
            });
            document.querySelector(`.pond[data-rel="${rel}"]`).innerHTML = rows.map(r => `<div class="pond-row">${r.join('')}</div>`).join('');
            const wind = document.querySelector(`.seat-wind[data-rel="${rel}"]`);
            wind.textContent = windName(p.seatWind);
            wind.classList.toggle('dealer', p.id === view.dealer);
            wind.classList.toggle('active', view.turn === p.id);
        });
        $('round-name').textContent = roundName(view.round);
        $('round-sub').textContent = `${view.round.honba}本場・供託${view.round.kyotaku}`;
        $('dora').innerHTML = view.doraIndicators.map(id => tileHtml(id, { size: 'xs' })).join('');
        $('wall-count').textContent = `残り ${view.wallCount}`;
    }

    whoHtml(view, p) {
        const dealer = p.id === view.dealer ? ' dealer' : '';
        const stick = p.riichi > 0 || p.riichiPending ? '<span class="riichi-stick" title="リーチ"></span>' : '';
        return `<div class="who"><span class="wind${dealer}">${windName(p.seatWind)}</span>`
            + `<span class="name">${escapeHtml(p.name)}</span>${stick}<span class="score">${p.score.toLocaleString()}</span></div>`;
    }

    meldsHtml(meld, owner, size) {
        const rel = (meld.from - owner + 4) % 4; // 1：下家から（右に倒す）・2：対面から（中央）・3：上家から（左）
        if (meld.type === 'ankan') {
            return `<span class="meld">${meld.tiles.map((id, i) => tileHtml(i === 0 || i === 3 ? null : id, { size })).join('')}</span>`;
        }
        const rest = meld.tiles.filter(id => id !== meld.called && id !== meld.added);
        const called = [tileHtml(meld.called, { size, side: true })];
        if (meld.added !== undefined && meld.added !== null) called.push(tileHtml(meld.added, { size, side: true }));
        const plain = rest.map(id => tileHtml(id, { size }));
        const at = rel === 3 ? 0 : rel === 2 ? 1 : plain.length;
        plain.splice(at, 0, ...called);
        return `<span class="meld">${plain.join('')}</span>`;
    }

    renderPanels(view) {
        [1, 2, 3].forEach(rel => {
            const p = view.players[(view.you + rel) % 4];
            const el = document.querySelector(`.panel[data-rel="${rel}"]`);
            el.classList.toggle('active', view.turn === p.id);
            el.innerHTML = this.whoHtml(view, p)
                + `<div class="melds">${p.melds.map(m => this.meldsHtml(m, p.id, 'xs')).join('')}</div>`;
        });
    }

    renderMine(view) {
        const me = view.players[view.you];
        const el = $('mine');
        el.classList.toggle('active', view.turn === me.id);
        let waits = '';
        if (view.me?.waits.length) {
            waits = `<div class="waits"><span class="label">待ち</span>${view.me.waits.map(k => kindTileHtml(k, { size: 'xs' })).join('')}`
                + `${view.me.furiten ? '<span class="furiten">フリテン</span>' : ''}</div>`;
        }
        el.innerHTML = this.whoHtml(view, me) + waits;
    }

    renderHand(view) {
        const me = view.players[view.you];
        const o = view.options;
        const myTurn = o?.type === 'turn';
        const allowed = myTurn ? (this.riichiMode ? o.riichi : o.discards) : [];
        let tiles = [...(me.hand ?? [])];
        let drawn = null;
        if (myTurn && view.drew && me.drawn !== null && tiles.includes(me.drawn)) {
            tiles.splice(tiles.indexOf(me.drawn), 1);
            drawn = me.drawn;
        }
        const tile = (id, extra = '') => {
            const cls = ['hand-tile', extra];
            if (myTurn && !allowed.includes(id)) cls.push('disabled');
            if (this.selected === id) cls.push('selected');
            return tileHtml(id, { size: 'lg', cls: cls.filter(Boolean).join(' '), attrs: `data-id="${id}"` });
        };
        const hand = tiles.map(id => tile(id)).join('') + (drawn !== null ? tile(drawn, 'drawn') : '');
        const melds = me.melds.length
            ? `<div class="melds">${me.melds.map(m => this.meldsHtml(m, me.id, 'md')).join('')}</div>` : '';
        $('hand').innerHTML = `<div class="hand-tiles">${hand}</div>${melds}`;
        $('hand').classList.toggle('my-turn', myTurn);
    }

    renderActions(view) {
        const o = view.options;
        const el = $('actions');
        if (!o || o.type === 'next') {
            el.innerHTML = '';
            return;
        }
        const button = (act, label, cls = '', arg = '') =>
            `<button class="act ${cls}" data-act="${act}"${arg !== '' ? ` data-arg="${arg}"` : ''}>${label}</button>`;
        const rows = [];
        let prompt = '';
        if (o.type === 'turn') {
            if (this.riichiMode) {
                prompt = '<div class="prompt">リーチの宣言牌を選択</div>';
                rows.push(button('cancel', 'キャンセル', 'skip'));
            } else {
                if (o.tsumo) rows.push(button('tsumo', 'ツモ', 'win'));
                if (o.riichi.length) rows.push(button('riichi', 'リーチ', 'riichi'));
                o.kans.forEach(k => rows.push(button('kan', `カン${kindTileHtml(k, {})}`, '', k)));
                if (o.kyuushu) rows.push(button('kyuushu', '九種九牌', 'skip'));
            }
        } else if (o.type === 'call') {
            const from = view.players[view.call.from];
            prompt = `<div class="prompt">${escapeHtml(from.name)}の${view.call.kind === 'chankan' ? '加槓' : '打牌'}${tileHtml(view.call.tile, { size: 'sm' })}</div>`;
            if (this.chiOpen) {
                o.chi.forEach((pair, i) => rows.push(button('chi-pick', pair.map(id => tileHtml(id, {})).join(''), '', i)));
                rows.push(button('cancel', '戻る', 'skip'));
            } else {
                if (o.ron) rows.push(button('ron', 'ロン', 'win'));
                o.pon.forEach((pair, i) => rows.push(button('pon', o.pon.length > 1 ? `ポン${pair.map(id => tileHtml(id, {})).join('')}` : 'ポン', '', i)));
                if (o.chi.length) rows.push(button('chi', 'チー'));
                if (o.minkan) rows.push(button('minkan', 'カン'));
                rows.push(button('pass', 'スキップ', 'skip'));
            }
        }
        // 打牌と鳴きの場面には、ヒントのボタンを出す
        if (!this.chiOpen && !this.riichiMode) rows.unshift('<button type="button" id="hint" class="act hint-button" data-act="hint" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg></button>');
        el.innerHTML = rows.length ? `${prompt}<div class="action-row">${rows.join('')}</div>` : '';
        this.markHint(view);
    }

    renderBubbles(view) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        if (view.events.length) this.lastSeq = Math.max(this.lastSeq, view.events.at(-1).seq);
        fresh.filter(e => e.type === 'call').forEach(e => {
            const el = document.createElement('div');
            el.className = `bubble${e.call === 'ron' || e.call === 'tsumo' ? ' win' : ''}`;
            el.dataset.rel = this.rel(view, e.seat);
            el.textContent = CALL_LABELS[e.call] ?? '';
            $('bubbles').appendChild(el);
            setTimeout(() => el.remove(), 1400);
        });
    }

    renderResult(view) {
        const overlay = $('overlay-result');
        if (view.phase === 'end') {
            overlay.hidden = false;
            $('result-body').innerHTML = this.finalHtml(view);
            $('result-buttons').innerHTML = '<button class="btn primary" data-act="again">もう一度</button><button class="btn secondary" data-act="home">ホーム</button>';
            return;
        }
        if (view.phase !== 'result' || view.options?.type !== 'next') {
            overlay.hidden = true;
            return;
        }
        // 和了や流局の声を少し見せてから出す
        const key = `${view.handNo}`;
        if (this.revealedResult !== key) {
            overlay.hidden = true;
            if (!this.timers.reveal) {
                this.timers.reveal = setTimeout(() => {
                    this.timers.reveal = null;
                    this.revealedResult = key;
                    this.render();
                }, RESULT_DELAY_MS);
            }
            return;
        }
        overlay.hidden = false;
        const body = $('result-body');
        const html = this.resultHtml(view);
        if (body.dataset.key !== key) {
            body.innerHTML = html;
            body.dataset.key = key;
            body.scrollTop = 0;
        }
        $('result-buttons').innerHTML = '<button class="btn primary" data-act="next">次へ</button>';
    }

    resultHtml(view) {
        const r = view.result;
        const name = (seat) => escapeHtml(view.players[seat].name);
        let html = '';
        if (r.type === 'win') {
            html += r.wins.map(w => {
                const hand = [...w.hand];
                hand.splice(hand.indexOf(w.tile), 1);
                const melds = w.melds.map(m => this.meldsHtml(m, w.seat, 'md')).join('');
                const how = w.tsumo ? 'ツモ' : 'ロン';
                const from = w.tsumo ? '' : `<span class="muted">${name(w.from)}から</span>`;
                const yaku = w.yaku.map(y => `<li><span>${escapeHtml(y.name)}</span><span class="han">${w.yakuman ? (y.han >= 26 ? 'ダブル役満' : '役満') : `${y.han}翻`}</span></li>`).join('');
                const pay = w.tsumo
                    ? (w.seat === r.dealer ? `${w.pay.child.toLocaleString()}オール` : `${w.pay.child.toLocaleString()}・${w.pay.dealer.toLocaleString()}`)
                    : '';
                const detail = w.yakuman ? '' : `${w.fu}符${w.han}翻 `;
                return `<div class="win-block">
                    <div class="result-title"><span class="big">${how}</span><span class="who">${name(w.seat)}</span>${from}</div>
                    <div class="result-hand">${hand.map(id => tileHtml(id, { size: 'md' })).join('')}${melds ? `<span class="melds">${melds}</span>` : ''}${tileHtml(w.tile, { size: 'md', cls: 'win-tile' })}</div>
                    <ul class="yaku-list">${yaku}</ul>
                    <div class="points">${w.limit ? `<span class="limit">${w.limit}</span>` : ''}${detail}${w.points.toLocaleString()}点${pay ? `（${pay}）` : ''}</div>
                </div>`;
            }).join('');
            html += `<div class="result-dora">ドラ${r.doraIndicators.map(id => tileHtml(id, { size: 'sm' })).join('')}`
                + (r.uraIndicators.length ? `<span class="gap"></span>裏ドラ${r.uraIndicators.map(id => tileHtml(id, { size: 'sm' })).join('')}` : '')
                + '</div>';
        } else {
            html += `<div class="result-title"><span class="big">${DRAW_REASONS[r.reason]}</span></div>`;
            if (r.reason === 'exhaust') {
                const rows = view.players.map(p => (r.hands[p.id]
                    ? `<div class="row"><span class="name">${name(p.id)}</span>${r.hands[p.id].map(id => tileHtml(id, { size: 'sm' })).join('')}</div>`
                    : '')).join('');
                html += `<div class="tenpai-hands">${rows || '<div class="row">全員ノーテン</div>'}</div>`;
            }
        }
        html += this.scoreTableHtml(view, r.deltas);
        return html;
    }

    scoreTableHtml(view, deltas) {
        const rows = [0, 1, 2, 3].map(rel => {
            const p = view.players[(view.you + rel) % 4];
            const d = deltas[p.id];
            const delta = d ? `<span class="${d > 0 ? 'plus' : 'minus'}">${d > 0 ? '+' : ''}${d.toLocaleString()}</span>` : '';
            return `<tr><td>${windName(p.seatWind)}</td><td>${escapeHtml(p.name)}</td><td class="num">${p.score.toLocaleString()}</td><td class="num">${delta}</td></tr>`;
        }).join('');
        return `<table class="score-table">${rows}</table>`;
    }

    finalHtml(view) {
        const rows = view.final.map(f => {
            const p = view.players[f.seat];
            return `<tr><td class="rank">${f.rank}位</td><td>${escapeHtml(p.name)}</td><td class="num">${f.score.toLocaleString()}</td></tr>`;
        }).join('');
        const mine = view.final.find(f => f.seat === view.you);
        return `<div class="result-title"><span class="big">終局</span><span class="who">${mine.rank}位</span></div>`
            + `<table class="score-table">${rows}</table>`;
    }
}

// ---- 遊び方 ----

function helpHtml() {
    const t = (text) => text.split(' ').map(code => {
        const m = code.match(/^(\d)([mpsz])$/);
        const kind = m[2] === 'z' ? 26 + Number(m[1]) : 'mps'.indexOf(m[2]) * 9 + Number(m[1]) - 1;
        return kindTileHtml(kind, { size: 'sm' });
    }).join('');
    const yaku = [
        ['1翻', '立直・一発・門前清自摸和・平和・断幺九・一盃口・役牌（三元牌・自風・場風）・海底摸月・河底撈魚・嶺上開花・槍槓'],
        ['2翻', 'ダブル立直・七対子・三色同順※・一気通貫※・混全帯幺九※・対々和・三暗刻・三色同刻・三槓子・小三元・混老頭'],
        ['3翻', '二盃口・純全帯幺九※・混一色※'],
        ['6翻', '清一色※'],
        ['役満', '国士無双・四暗刻・大三元・小四喜・大四喜・字一色・緑一色・清老頭・九蓮宝燈・四槓子・天和・地和']
    ];
    const points = [[1, 30], [2, 30], [3, 30], [4, 30], [5, 0]].map(([han, fu]) => {
        const child = handPoints(han, fu || 30).ron;
        const dealer = handPoints(han, fu || 30, { dealer: true }).ron;
        return `<tr><td>${han === 5 ? '満貫（5翻）' : `${han}翻30符`}</td><td>${child.toLocaleString()}</td><td>${dealer.toLocaleString()}</td></tr>`;
    }).join('');
    return `
        <h2>遊び方</h2>
        <h3>目的</h3>
        <p>4人で点数を取り合い、終局のときに一番点数が多い人の勝ちです。25,000点から始めます。</p>
        <p>手牌13枚に1枚を足して、<strong>4つの面子と1つの雀頭</strong>（または七対子・国士無双）を作ると和了（あがり）です。和了には1つ以上の<strong>役</strong>が要ります。</p>
        <div class="help-pic">${t('1m 2m 3m')}<span class="gap"></span>${t('5p 5p 5p')}<span class="gap"></span>${t('7s 8s 9s')}<span class="gap"></span>${t('1z 1z 1z')}<span class="gap"></span>${t('7z 7z')}</div>
        <h3>手番</h3>
        <ul>
            <li>山から1枚ツモり、1枚捨てます。牌を1回タップで選び、もう1回で捨てます</li>
            <li>和了れる牌をツモったら「ツモ」、ほかの人の捨て牌なら「ロン」</li>
            <li>門前（鳴いていない）でテンパイしたら「リーチ」できます（1,000点を供託）。そのあとは手を変えられません</li>
            <li>ほかの人の捨て牌で、ポン（同じ牌3枚）・チー（上家からだけ、3枚の連番）・カン（同じ牌4枚）ができます。鳴きの確認は、左上の吹き出しのボタンで切れます</li>
        </ul>
        <h3>フリテン</h3>
        <p>待ちの牌を自分で捨てていると、ロンできません（ツモはできます）。ロンできる牌を見送ると、次に自分が捨てるまでロンできません。リーチのあとに見送ると、その局はずっとロンできません。</p>
        <h3>役</h3>
        <table class="help-table">${yaku.map(([han, list]) => `<tr><th>${han}</th><td>${list}</td></tr>`).join('')}</table>
        <p>※は鳴くと1翻下がります（清一色は5翻、ほかは1翻少なく）。ドラ・赤ドラ・裏ドラは役ではなく、役があるときに1枚1翻を足します。</p>
        <h3>点数</h3>
        <p>点数は翻と符で決まります。和了の画面に、符と翻、点数を出します。</p>
        <table class="help-table"><tr><th></th><th>子のロン</th><th>親のロン</th></tr>${points}</table>
        <p>跳満（6・7翻）12,000、倍満（8〜10翻）16,000、三倍満（11・12翻）24,000、役満 32,000（親は1.5倍）。13翻以上は数え役満。</p>
        <h3>局の進み方</h3>
        <ul>
            <li>親が和了するか、流局で親がテンパイなら連荘（本場が1つ増えます）</li>
            <li>山がなくなったら流局。テンパイの人が、ノーテンの人から合わせて3,000点を受け取ります</li>
            <li>東風戦は東4局、半荘戦は南4局まで。そのとき30,000点以上の人がいなければ、次の風に延長します</li>
            <li>だれかの点数が0点未満になったら、その局で終わりです</li>
        </ul>
    `;
}
