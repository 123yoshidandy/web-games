/**
 * 画面（タイトル・ゲーム・願い・竜・ラウンドの結果・結果・記録・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 自分が下、味方が上、次の人（席1）が左、その次（席3）が右。出す順は 自分 → 左 → 上 → 右
 * - 手札は数の順。8枚を超えたら2段に並べる。押して選ぶか、組の候補を押してまとめて選ぶ
 * - 札を渡す場面では、押した順に 左へ・味方へ・右へ
 * - 各席には、残りの枚数・宣言・取った札の点・上がった順と、この場で最後にしたこと（出した組かパス）を出す
 */

import { MAHJONG, DRAGON, classify, beats, rankOf, rankLabel, comboLabel, pointsOf, cardName } from './cards.js';
import { teamOf, PLAYERS } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { cardHtml } from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

const SETTINGS_KEY = 'tichu.settings';
const NAMES = ['あなた', 'ロン', '味方のメイ', 'ハク'];
const GIVE_LABELS = ['左へ', '味方へ', '右へ'];
const FROM_LABELS = { 1: '左から', 2: '味方から', 3: '右から' };
const TYPE_ORDER = { bomb: 0, straight: 1, pairs: 2, fullhouse: 3, triple: 4, pair: 5, single: 6, dog: 7 };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const sameCards = (a, b) => a.length === b.length && a.every(c => b.includes(c));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { level: ['easy', 'normal'].includes(saved.level) ? saved.level : 'normal', target: [1000, 500].includes(saved.target) ? saved.target : 1000 };
    } catch {
        return { level: 'normal', target: 1000 };
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
        this.selected = [];   // 選んだ札
        this.giving = [];     // 渡す札（左・味方・右の順）
        this.pending = null;  // 願いを選んでいる間の札
        this.bindStatic();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ティチュー',
            game: 'tichu',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 800,
            minPlayers: PLAYERS,
            maxPlayers: PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
        $('#title-art').innerHTML = [DRAGON, 51, 38, 12, MAHJONG].map((c, i) => cardHtml(c, { cls: `fan fan-${i}` })).join('');
        $('#help-cards').innerHTML = [MAHJONG, 53, 54, DRAGON].map(c => cardHtml(c, { cls: 'mini' })).join('');
        window.addEventListener('resize', () => { if (this.view) this.fitHand(); });
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderSettings();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
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
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.stopGame();
        this.controller = controller;
        this.selected = [];
        this.giving = [];
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は出さない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    newGame() {
        const players = NAMES.map((name, i) => ({ name, isCPU: i !== 0 }));
        this.startGame({ players, options: { target: this.settings.target }, level: this.settings.level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    // 受け付けられたら、コントローラーが描き直す（ここでもう一度描くと、出した札の動きが消える）
    // 選んだ札は送る前に外し、断られたら戻して描き直す
    send(command) {
        const selected = this.selected;
        const giving = this.giving;
        this.hintCommand = null;
        this.selected = [];
        if (command.type === 'exchange') this.giving = [];
        const ok = this.controller?.send(command);
        if (!ok) {
            this.selected = selected;
            this.giving = giving;
            this.render();
        }
        return ok;
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('#target').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-target]');
            if (!button) return;
            this.settings.target = Number(button.dataset.target);
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle())); // オンラインは確かめてから部屋を出る
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        // ダイアログを開いている間は、CPU を止める
        const pausing = (id, open) => {
            $(id).addEventListener('close', () => this.controller?.resume());
            return () => {
                this.controller?.pause();
                open?.();
                $(id).showModal();
            };
        };
        $('#open-help-game').addEventListener('click', pausing('#help'));
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', pausing('#log', () => {
            $('#log-list').innerHTML = (this.view?.logs ?? []).map(text => `<li>${escapeHtml(text)}</li>`).join('');
            requestAnimationFrame(() => { $('#log-list').scrollTop = $('#log-list').scrollHeight; });
        }));
        $('#round').addEventListener('close', () => {
            this.controller?.resume();
            if (this.view?.phase === 'end') this.showResult();
        });
        $('#round-next').addEventListener('click', () => $('#round').close());
        $('#wish-ranks').innerHTML = Array.from({ length: 13 }, (_, i) => i + 2).map(r => `<button type="button" class="wish-rank" data-wish="${r}">${rankLabel(r)}</button>`).join('');
        $('#wish').addEventListener('click', (event) => {
            const button = event.target.closest('[data-wish]');
            if (!button || !this.pending) return;
            const cards = this.pending;
            this.pending = null;
            $('#wish').close();
            this.send(button.dataset.wish === 'none' ? { type: 'play', cards } : { type: 'play', cards, wish: Number(button.dataset.wish) });
        });
        $('#wish').addEventListener('close', () => { this.pending = null; });
        $('#dragon-choices').addEventListener('click', (event) => {
            const button = event.target.closest('[data-to]');
            if (!button) return;
            $('#dragon').close();
            this.send({ type: 'dragon', to: Number(button.dataset.to) });
        });
        $('#dragon').addEventListener('cancel', event => event.preventDefault());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (['result', 'dragon', 'round'].includes(dialog.id)) {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hand').addEventListener('click', (event) => {
            const el = event.target.closest('[data-card]');
            if (el) this.tapCard(Number(el.dataset.card));
        });
        $('#candidates').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-cards]');
            if (!chip) return;
            const cards = chip.dataset.cards.split(',').map(Number);
            this.selected = sameCards(cards, this.selected) ? [] : cards;
            music.play(this.selected.length ? 'select' : 'cancel');
            this.render();
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act);
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSettings() {
        document.querySelectorAll('#level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
        document.querySelectorAll('#target button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.target) === this.settings.target)));
    }

    // ---- 操作 ----

    tapCard(card) {
        const view = this.view;
        if (!view) return;
        if (view.phase === 'exchange' && !view.myExchange) {
            this.giving = this.giving.includes(card) ? this.giving.filter(c => c !== card) : this.giving.length < 3 ? [...this.giving, card] : this.giving;
            music.play(this.giving.includes(card) ? 'select' : 'cancel');
            this.render();
            return;
        }
        if (view.phase !== 'play' || !view.hand.length) return;
        this.selected = this.selected.includes(card) ? this.selected.filter(c => c !== card) : [...this.selected, card];
        music.play(this.selected.includes(card) ? 'select' : 'cancel');
        this.render();
    }

    act(act) {
        const view = this.view;
        if (act === 'grand-yes' || act === 'grand-no') this.send({ type: 'grand', call: act === 'grand-yes' });
        else if (act === 'tichu') this.send({ type: 'tichu' });
        else if (act === 'give') this.send({ type: 'exchange', cards: [...this.giving] });
        else if (act === 'reset') {
            music.play('cancel');
            this.giving = [];
            this.selected = [];
            this.render();
        } else if (act === 'pass') this.send({ type: 'pass' });
        else if (act === 'play' || act === 'bomb') {
            const cards = [...this.selected];
            if (cards.includes(MAHJONG) && view.current === view.seat) {
                this.pending = cards;
                $('#wish').showModal();
                return;
            }
            this.send({ type: 'play', cards });
        }
    }

    // 選んだ札が出せるか。{ ok, combo, reason }
    checkSelection() {
        const view = this.view;
        const cards = this.selected;
        if (!cards.length) return { ok: false, reason: '' };
        const top = view.table.at(-1)?.combo ?? null;
        const combo = classify(cards, top);
        if (!combo) return { ok: false, reason: '組になっていません' };
        const myTurn = view.current === view.seat;
        if (!myTurn) {
            const ok = combo.type === 'bomb' && !!top && beats(combo, top);
            return { ok, combo, reason: ok ? '' : 'あなたの番ではありません' };
        }
        if (top && combo.type === 'dog') return { ok: false, combo, reason: '犬は最初にだけ出せます' };
        if (top && !beats(combo, top)) return { ok: false, combo, reason: '場の組に勝てません' };
        if (view.options?.wishBound && !cards.some(c => c < 52 && rankOf(c) === view.wish)) return { ok: false, combo, reason: `願いの ${rankLabel(view.wish)} を含めてください` };
        return { ok: true, combo };
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        this.selected = this.selected.filter(c => view.hand.includes(c));
        this.giving = this.giving.filter(c => view.hand.includes(c));
        if (view.phase !== 'exchange') this.giving = [];

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (prev) this.playSound(fresh, prev);
        if (prev && (prev.current !== view.current || prev.phase !== view.phase)) this.hintCommand = null;

        this.renderScore();
        [0, 1, 2, 3].forEach(s => this.renderSeat(s));
        this.renderCenter(fresh);
        this.renderHand();
        this.renderCandidates();
        this.renderActions();
        this.markHint();
        this.notify(fresh);

        // 竜の場を渡す相手を選ぶ
        if (view.phase === 'dragon' && view.dragonFrom === view.seat && !$('#dragon').open) this.showDragon();
        const roundEnd = fresh.filter(e => e.type === 'roundEnd').at(-1);
        if (roundEnd) this.showRound(roundEnd.result);
        else if (view.phase === 'end' && !$('#round').open && !$('#result').open) this.showResult();
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、自分の番になったら turn、終わりは勝ち負け（チーム）
    // CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
    playSound(fresh, prev) {
        const view = this.view;
        const me = view.seat;
        if (fresh.length === 0) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winner === teamOf(me) ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'roundEnd')) return music.play('notify');
        if (fresh.some(e => e.type === 'deal')) return music.play('shuffle');
        const mine = fresh.filter(e => e.seat === me);
        if (mine.some(e => e.type === 'out')) return music.play('gain');
        if (fresh.some(e => e.type === 'trick' && e.to === me)) return music.play('capture');
        if (mine.some(e => e.type === 'play')) return music.play('place');
        if (mine.some(e => e.type === 'call')) return music.play('notify');
        if (mine.some(e => e.type === 'pass')) return music.play('cancel');
        if (fresh.some(e => e.type === 'exchange')) return music.play('draw');
        if (view.current === me && prev.current !== me) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        // 出す札・渡す札は、選んだ状態にする（「出す」「渡す」で決められる）
        if (command.type === 'play') this.selected = [...command.cards];
        if (command.type === 'exchange') this.giving = [...command.cards];
        if (command.type === 'dragon' && !$('#dragon').open) this.showDragon();
        this.render();
        const text = { pass: 'パス', tichu: 'ティチューを宣言する', grand: command.call ? '大ティチューを宣言する' : '宣言しない', dragon: '印の付いた相手に渡す', exchange: '選んだ3枚を渡す', play: '選んだ札を出す' }[command.type];
        if (text) this.toast(`おすすめ：${text}`);
    }

    // おすすめの手のボタンに印を付ける
    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const selector = {
            play: '[data-act="play"], [data-act="bomb"]', pass: '[data-act="pass"]', tichu: '[data-act="tichu"]',
            grand: c.call ? '[data-act="grand-yes"]' : '[data-act="grand-no"]', exchange: '[data-act="give"]', dragon: `[data-to="${c.to}"]`
        }[c.type];
        if (selector) document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    renderScore() {
        const view = this.view;
        $('#scoreboard').innerHTML = `<span class="team mine">あなたのチーム <b>${view.scores[0]}</b></span>
            <span class="team">相手 <b>${view.scores[1]}</b></span>
            <span class="goal">第${view.round}ラウンド・${view.target}点まで</span>`;
    }

    // この場で、各席が最後にしたこと（出した組・パス）
    trickActions() {
        const actions = {};
        for (const e of this.view.events) {
            if (e.type === 'trick' || e.type === 'deal' || e.type === 'exchange') for (const k in actions) delete actions[k];
            else if (e.type === 'play') actions[e.seat] = { text: e.label, bomb: e.bomb };
            else if (e.type === 'pass') actions[e.seat] = { text: 'パス' };
        }
        return actions;
    }

    renderSeat(seat) {
        const view = this.view;
        const p = view.players[seat];
        const el = $(`#seat-${seat}`);
        // 今操作を待っている席（同時に決める場面では、まだ決めていない人）
        const active = (view.phase === 'grand' && !p.grandDecided) || (view.phase === 'exchange' && !p.exchanged)
            || (view.phase === 'play' && view.current === seat) || (view.phase === 'dragon' && view.dragonFrom === seat);
        const firstOut = view.players.find(x => x.place === 1);
        let call = '';
        if (p.call) {
            const state = firstOut ? (firstOut.id === seat ? 'ok' : 'ng') : '';
            call = `<span class="call ${p.call} ${state}">${p.call === 'grand' ? '大ティチュー' : 'ティチュー'}${state === 'ok' ? ' 成功' : state === 'ng' ? ' 失敗' : ''}</span>`;
        }
        let status = '';
        if (view.phase === 'grand') status = p.grandDecided ? '' : '<span class="thinking">考え中</span>';
        else if (view.phase === 'exchange') status = p.exchanged ? '<span class="done">渡した</span>' : '<span class="thinking">選び中</span>';
        const last = this.trickActions()[seat];
        const bubble = view.phase === 'play' && last ? `<span class="bubble ${last.text === 'パス' ? 'pass' : ''} ${last.bomb ? 'bomb' : ''}">${escapeHtml(last.text)}</span>` : '';
        const place = p.place ? `<span class="place">${p.place}番</span>` : `<span class="count" title="残りの枚数"><i class="mini-back"></i>${p.count}</span>`;
        const team = teamOf(seat) === teamOf(view.seat) ? 'ally' : 'rival';
        el.className = `seat ${el.classList[1]} ${team} ${active ? 'active' : ''}`;
        el.innerHTML = `<div class="seat-head"><span class="name">${escapeHtml(p.name)}</span>${place}</div>
            <div class="seat-info">${call}<span class="won" title="取った札の点">取 ${p.wonPoints}点</span>${status}</div>${bubble}`;
    }

    renderCenter(fresh) {
        const view = this.view;
        const el = $('#center');
        const top = view.table.at(-1);
        const wish = view.wish !== null ? `<span class="wish-badge">願い ${rankLabel(view.wish)}</span>` : '';
        if (view.phase === 'grand') {
            el.innerHTML = `<p class="center-text">8枚が配られました。<br>大ティチュー（200点）を宣言しますか？</p>`;
        } else if (view.phase === 'exchange') {
            el.innerHTML = `<p class="center-text">${view.myExchange ? 'ほかの人が渡す札を選んでいます' : '左・味方・右に渡す札を<br>1枚ずつ、順に押してください'}</p>`;
        } else if (top) {
            const points = pointsOf(view.table.flatMap(t => t.combo.cards));
            const popped = fresh.some(e => e.type === 'play') ? 'pop' : '';
            el.innerHTML = `<div class="trick">
                <div class="trick-head"><b>${escapeHtml(view.players[top.seat].name)}</b>：${escapeHtml(comboLabel(top.combo))}</div>
                <div class="trick-cards ${popped}">${top.combo.cards.map(c => cardHtml(c, { cls: 'mini' })).join('')}</div>
                <div class="trick-foot">${wish}<span>場の点 ${points}</span>${view.table.length > 1 ? `<span class="muted">${view.table.length}組目</span>` : ''}</div></div>`;
        } else {
            const trick = [...view.events].reverse().find(e => e.type === 'trick' || e.type === 'exchange' || e.type === 'deal');
            let text = '';
            if (trick?.type === 'trick') {
                text = trick.dragon
                    ? `${escapeHtml(view.players[trick.seat].name)}が竜の場を${escapeHtml(view.players[trick.to].name)}に渡しました（${trick.points}点）`
                    : `${escapeHtml(view.players[trick.seat].name)}が場を取りました（${trick.points}点）`;
            }
            if (view.phase === 'dragon') text = `${escapeHtml(view.players[view.dragonFrom].name)}が竜の場（${view.dragonPoints}点）を渡す相手を選んでいます`;
            const lead = view.phase === 'play' ? `<p class="center-sub">${view.current === view.seat ? 'あなたが最初に出す番です' : `${escapeHtml(view.players[view.current].name)}が最初に出します`}</p>` : '';
            el.innerHTML = `<div class="trick empty"><p class="center-text">${text}</p>${lead}<div class="trick-foot">${wish}</div></div>`;
        }
    }

    renderHand() {
        const view = this.view;
        const hand = view.hand;
        const giving = view.myExchange ?? this.giving;
        const received = view.received && !view.players[view.seat].played ? view.received : null;
        const fromOf = (card) => {
            if (!received) return null;
            const from = Object.entries(received).find(([, c]) => c === card)?.[0];
            return from === undefined ? null : FROM_LABELS[(Number(from) - view.seat + 4) % 4];
        };
        $('#hand').innerHTML = hand.map(card => {
            const give = giving.indexOf(card);
            const from = fromOf(card);
            const tag = give >= 0 ? `<span class="tag give">${GIVE_LABELS[give]}</span>` : from ? `<span class="tag from">${from}</span>` : '';
            const cls = `${this.selected.includes(card) ? 'selected' : ''} ${give >= 0 ? 'giving' : ''} ${from ? 'received' : ''}`;
            return `<button type="button" class="hand-card ${cls}" data-card="${card}" aria-label="${cardName(card)}">${cardHtml(card)}${tag}</button>`;
        }).join('');
        this.fitHand();
    }

    // 手札がすべて入る大きさ。8枚を超えたら2段
    fitHand() {
        const el = $('#hand');
        const n = this.view?.hand.length ?? 0;
        if (!n || !el.clientWidth) return;
        const rows = n > 8 ? 2 : 1;
        const per = Math.ceil(n / rows);
        const gap = 3;
        const lift = 8; // 選んだ札が上がる分
        const w = Math.min((el.clientWidth - gap * (per - 1)) / per, ((el.clientHeight - lift - gap * (rows - 1)) / rows) / 1.4, 64);
        el.style.setProperty('--cw', `${Math.floor(w)}px`);
        // grid の repeat に CSS の変数の計算は使えないので、列はここで決める
        el.style.gridTemplateColumns = `repeat(${per}, ${Math.floor(w)}px)`;
    }

    renderCandidates() {
        const view = this.view;
        let combos = [];
        if (view.phase === 'play' && view.options) {
            combos = view.options.combos.filter(c => view.options.wishBound || c.type !== 'single' || c.cards[0] >= 52);
        } else if (view.phase === 'play' && view.bombs.length) combos = view.bombs;
        // 同じ形・同じ強さは、不死鳥を使わないほうを残す
        const seen = new Map();
        for (const c of combos) {
            const key = `${c.type}:${c.length}:${c.rank}`;
            if (!seen.has(key) || (seen.get(key).cards.includes(54) && !c.cards.includes(54))) seen.set(key, c);
        }
        const list = [...seen.values()].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.rank - b.rank);
        $('#candidates').innerHTML = list.length
            ? list.map(c => `<button type="button" class="chip ${c.type} ${sameCards(c.cards, this.selected) ? 'on' : ''}" data-cards="${c.cards.join(',')}">${escapeHtml(comboLabel(c))}</button>`).join('')
            : `<span class="muted chips-empty">${view.phase === 'play' && view.current === view.seat && view.table.length ? '出せる組がありません' : ''}</span>`;
    }

    renderActions() {
        const view = this.view;
        const me = view.players[view.seat];
        const tichu = view.canTichu ? '<button class="btn small call-btn" data-act="tichu">ティチュー</button>' : '';
        let html = '';
        if (view.phase === 'grand') {
            html = me.grandDecided
                ? '<span class="hint muted">ほかの人を待っています</span>'
                : '<button class="btn small ghost" data-act="grand-no">宣言しない</button><button class="btn small call-btn" data-act="grand-yes">大ティチュー</button>';
        } else if (view.phase === 'exchange') {
            html = view.myExchange
                ? `<span class="hint muted">ほかの人を待っています</span>${tichu}`
                : `${this.giving.length < 3 ? `<span class="hint">${GIVE_LABELS[this.giving.length]}渡す札を押す</span>` : ''}
                    <button class="btn small ghost" data-act="reset" ${this.giving.length ? '' : 'disabled'}>やり直す</button>
                    <button class="btn small primary" data-act="give" ${this.giving.length === 3 ? '' : 'disabled'}>渡す</button>${tichu}`;
        } else if (view.phase === 'play' && me.count > 0) {
            const check = this.checkSelection();
            if (view.current === view.seat) {
                const canPass = !view.options?.mustPlay;
                const label = check.ok ? escapeHtml(comboLabel(check.combo)) : check.reason ? escapeHtml(check.reason) : '札を選ぶ';
                html = `${tichu}<button class="btn small ghost" data-act="pass" ${canPass ? '' : 'disabled'}>パス</button>
                    <button class="btn small primary play-btn" data-act="play" ${check.ok ? '' : 'disabled'}><span>出す</span><small>${label}</small></button>`;
            } else if (check.ok) {
                html = `<button class="btn small bomb-btn" data-act="bomb">爆弾を出す<small>${escapeHtml(comboLabel(check.combo))}</small></button>`;
            } else {
                const who = view.phase === 'play' ? view.players[view.current].name : '';
                html = `${tichu}<span class="hint muted">${escapeHtml(who)}の番です${view.bombs.length ? '（爆弾を出せます）' : ''}</span>`;
            }
        } else if (view.phase === 'play') {
            html = `<span class="hint muted">上がりました。${escapeHtml(view.players[view.current].name)}の番です</span>`;
        } else if (view.phase === 'dragon') {
            html = `<span class="hint muted">竜の場を渡す相手を選んでいます</span>`;
        }
        $('#actions').innerHTML = html;
    }

    // 出来事を短く知らせる（宣言・爆弾・願い・上がり）
    notify(events) {
        const view = this.view;
        const messages = [];
        for (const e of events) {
            const name = view.players[e.seat]?.name;
            if (e.type === 'call') messages.push(`${name}が${e.call === 'grand' ? '大ティチュー' : 'ティチュー'}を宣言！`);
            else if (e.type === 'play' && e.bomb) messages.push(`${name}の爆弾！`);
            else if (e.type === 'play' && e.wish) messages.push(`${name}が ${rankLabel(e.wish)} を願いました`);
            else if (e.type === 'out' && e.place === 1) messages.push(`${name}が1番に上がりました`);
            else if (e.type === 'exchange') {
                const got = Object.entries(view.received ?? {}).map(([from, card]) => `${FROM_LABELS[(Number(from) - view.seat + 4) % 4]}${cardName(card)}`);
                if (got.length) messages.push(`もらった札：${got.join('・')}`);
            }
        }
        if (messages.length) this.toast(messages.join('　'));
    }

    showDragon() {
        const view = this.view;
        const opponents = [0, 1, 2, 3].filter(s => teamOf(s) !== teamOf(view.seat));
        $('#dragon-note').textContent = `竜で取った場（${view.dragonPoints}点）は、相手に渡します。最後まで残った人の取った札は、1番に上がった人に移ります`;
        $('#dragon-choices').innerHTML = opponents.map(s => `<button class="btn secondary" data-to="${s}">${escapeHtml(view.players[s].name)}<small>（残り${view.players[s].count}枚）</small></button>`).join('');
        $('#dragon').showModal();
    }

    showRound(result) {
        const view = this.view;
        this.controller?.pause();
        const first = result.finished[0];
        const doubleTeam = result.detail === 'double' ? teamOf(first) : null;
        $('#round-title').textContent = `第${result.round}ラウンドの結果${doubleTeam !== null ? `（${doubleTeam === teamOf(view.seat) ? 'あなたのチーム' : '相手'}のダブル勝利）` : ''}`;
        const calls = result.calls.map((call, s) => (call ? `${view.players[s].name}：${call === 'grand' ? '大ティチュー' : 'ティチュー'}${s === first ? '成功' : '失敗'}` : '')).filter(Boolean);
        const row = (label, values, cls = '') => `<tr class="${cls}"><th>${label}</th>${values.map(v => `<td>${v}</td>`).join('')}</tr>`;
        $('#round-table').innerHTML = `<tr><th></th><th>あなたのチーム</th><th>相手</th></tr>
            ${row(result.detail === 'double' ? 'ダブル勝利' : '札の点', result.cardPoints.map(signed))}
            ${row('宣言', result.bonus.map(signed))}
            ${row('このラウンド', result.total.map(signed), 'sum')}
            ${row('合計', result.scores, 'total')}
            <tr><td colspan="3" class="muted round-note">上がった順：${result.finished.map(s => escapeHtml(view.players[s].name)).join(' → ')}${calls.length ? `<br>${calls.map(escapeHtml).join('・')}` : ''}</td></tr>`;
        $('#round-next').textContent = view.phase === 'end' ? '結果を見る' : '次のラウンドへ';
        if (!$('#round').open) $('#round').showModal();
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open) return;
        const won = view.winner === teamOf(view.seat);
        $('#result-title').textContent = won ? 'あなたのチームの勝ち' : '相手のチームの勝ち';
        $('#result-detail').textContent = `${view.scores[0]} 対 ${view.scores[1]}（${view.rounds.length}ラウンド）`;
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }
}

