/**
 * 画面（タイトル・ゲーム・結果・記録・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 上にほかの人のマット（名前・持ち札の枚数・コースター・伏せた札・宣言）、真ん中に今の状況、下に自分のマットと手札
 * - 伏せた札は、重なった丸で並べる（右がいちばん上）。めくられた札は表を見せる。自分の伏せた札は、中身を薄く見せる
 * - 手札の札を押すと伏せる。挑戦・上げるときは、−／＋ で数を選ぶ
 * - めくる場面では、めくる人の山を押す（自分の山から）。めくるたびに札が回って表になり、ドクロなら赤く揺れる
 * - 挑戦が決着したら、結果の帯を出し、少しのあいだ CPU を止める
 */

import { FLOWER, SKULL, WINS_NEEDED } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { discHtml, coasterHtml, PLAYER_COLORS } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'skull.settings';
const CPU_NAMES = ['ジャック', 'ローズ', 'ダン', 'ミア', 'ケン'];
const RESULT_PAUSE_MS = 2200;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [3, 4, 5, 6].includes(saved.count) ? saved.count : 4, level: ['easy', 'normal'].includes(saved.level) ? saved.level : 'normal' };
    } catch {
        return { count: 4, level: 'normal' };
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
        this.bidding = null; // 選んでいる宣言の数（挑戦・上げるとき）
        this.bindStatic();
        $('#title-art').innerHTML = [[FLOWER, 0], [null, 1], [SKULL, 3], [null, 2], [FLOWER, 4]].map(([d, c], i) => discHtml(d, PLAYER_COLORS[c], { cls: `t${i}` })).join('');
        $('#help-discs').innerHTML = discHtml(FLOWER, PLAYER_COLORS[0]) + discHtml(SKULL, PLAYER_COLORS[0]);
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        this.renderSettings();
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
        this.bidding = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, this.settings.count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level: this.settings.level });
    }

    stopGame() {
        this.controller?.stop();
        clearTimeout(this.resumeTimer);
        this.controller = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        // 受け付けられたら、コントローラーが描き直す（ここでもう一度描くと、めくる動きが消える）
        if (this.controller) this.bidding = null;
        this.hintCommand = null;
        const ok = this.controller?.send(command);
        if (!ok) this.render();
        return ok;
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSettings();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        // 遊び方・記録を開いている間は、CPU を止める
        $('#open-help-game').addEventListener('click', () => {
            this.controller?.pause();
            $('#help').showModal();
        });
        $('#open-log').addEventListener('click', () => {
            this.controller?.pause();
            $('#log-list').innerHTML = (this.view?.logs ?? []).map(text => `<li>${escapeHtml(text)}</li>`).join('');
            $('#log').showModal();
            requestAnimationFrame(() => { $('#log-list').scrollTop = $('#log-list').scrollHeight; });
        });
        $('#help').addEventListener('close', () => this.resumeCpu());
        $('#log').addEventListener('close', () => this.resumeCpu());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        // 手札の札を押して伏せる
        $('#me').addEventListener('click', (event) => {
            const disc = event.target.closest('[data-disc]');
            if (disc) {
                this.send({ type: 'place', disc: disc.dataset.disc });
                return;
            }
            if (event.target.closest('[data-stack]')) this.flip(this.view.seat);
        });
        // めくる山を押す
        $('#opponents').addEventListener('click', (event) => {
            const mat = event.target.closest('.mat[data-seat]');
            if (mat) this.flip(Number(mat.dataset.seat));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act, button.dataset);
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSettings() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // 結果の帯を見せている間などは CPU を止めておき、あとで再開する
    resumeCpu() {
        if ($('#help').open || $('#log').open || this.holding) return;
        this.controller?.resume();
    }

    hold(ms) {
        this.holding = true;
        this.controller?.pause();
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
            this.holding = false;
            this.resumeCpu();
        }, ms);
    }

    // ---- 操作 ----

    myTurn(phase) {
        const view = this.view;
        if (!view) return false;
        if (view.phase === 'ante') return phase === 'ante' && !view.players[view.seat].placed && !view.players[view.seat].out;
        return view.phase === phase && view.current === view.seat;
    }

    // ---- ヒント ----

    // おすすめの手を、札・山・ボタンに印を付けて知らせる（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        if (command.type === 'challenge' || command.type === 'raise') this.bidding = command.bid;
        this.render();
        const name = (seat) => (seat === this.view.seat ? '自分' : this.view.players[seat].name);
        const disc = (d) => (d === SKULL ? 'ドクロ' : '花');
        const text = {
            place: () => `${disc(command.disc)}を伏せる`,
            challenge: () => `${command.bid}枚で挑戦する`,
            raise: () => `${command.bid}枚に上げる`,
            pass: () => 'パスする',
            flip: () => `${name(command.target)}の山をめくる`,
            lose: () => `${disc(command.disc)}を手放す`
        }[command.type]?.() ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        if (!this.myTurn(this.view.phase)) {
            this.hintCommand = null;
            return;
        }
        const list = {
            place: [`#me [data-disc="${c.disc}"]`],
            challenge: ['#actions [data-act="challenge"]', '#actions [data-act="open-bid"]'],
            raise: ['#actions [data-act="raise"]'],
            pass: ['#actions [data-act="pass"]'],
            flip: [c.target === this.view.seat ? '#actions [data-act="flip-own"]' : `#opponents .mat[data-seat="${c.target}"]`],
            lose: [`#actions [data-act="lose"][data-disc="${c.disc}"]`]
        }[c.type] ?? [];
        // 同じ札が並ぶので、印はそれぞれ最初の1つにだけ付ける
        list.forEach(s => document.querySelector(s)?.classList.add('recommended'));
    }

    flip(target) {
        if (!this.myTurn('reveal')) return;
        const me = this.view.players[this.view.seat];
        if (target !== this.view.seat && me.revealed.length < me.stackCount) {
            music.play('error');
            this.toast('先に自分の山を全部めくります');
            return;
        }
        this.send({ type: 'flip', target });
    }

    act(act, data) {
        const view = this.view;
        if (act === 'open-bid') {
            music.play('select');
            this.bidding = view.phase === 'bid' ? view.bid + 1 : Math.min(view.total, Math.max(1, view.players[view.seat].stackCount));
            this.render();
        } else if (act === 'minus' || act === 'plus') {
            const min = view.phase === 'bid' ? view.bid + 1 : 1;
            this.bidding = Math.max(min, Math.min(view.total, this.bidding + (act === 'plus' ? 1 : -1)));
            music.play('select');
            this.render();
        } else if (act === 'cancel') {
            music.play('cancel');
            this.bidding = null;
            this.render();
        } else if (act === 'challenge') this.send({ type: 'challenge', bid: this.bidding });
        else if (act === 'raise') this.send({ type: 'raise', bid: this.bidding });
        else if (act === 'pass') this.send({ type: 'pass' });
        else if (act === 'flip-own') this.flip(view.seat);
        else if (act === 'lose') this.send({ type: 'lose', disc: data.disc });
        else if (act === 'again') this.newGame();
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、相手の手は番が回るときに notify、自分の番になったら turn、終わりは勝ち負け
    playSound(fresh, prevCurrent) {
        const view = this.view;
        const me = view.seat;
        if (fresh.length === 0) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winner === me ? 'win' : 'lose');
        const success = fresh.find(e => e.type === 'success');
        if (success) return music.play(success.seat === me ? 'gain' : 'notify');
        if (fresh.some(e => e.type === 'lost' && e.seat === me)) return music.play('pay');
        const flip = fresh.findLast(e => e.type === 'flip' && e.seat === me);
        if (flip) return music.play(flip.disc === SKULL ? 'pay' : 'draw');
        if (fresh.some(e => e.type === 'round')) return music.play('shuffle');
        if (fresh.some(e => e.seat === me && ['place', 'bid', 'pass'].includes(e.type))) return music.play('place');
        if (view.phase === 'end') return;
        if (view.current === me && prevCurrent !== me) return music.play('turn');
        if (prevCurrent !== me) music.play('notify');
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prevCurrent = this.view?.current;
        this.view = view;
        if (view.phase === 'bid' && this.bidding === null && view.current === view.seat) this.bidding = view.bid + 1;
        if (!(this.myTurn('turn') || this.myTurn('bid'))) this.bidding = null;

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        this.playSound(fresh, prevCurrent);

        this.renderTop();
        this.renderOpponents();
        this.renderCenter(fresh);
        this.renderMe();
        this.renderActions();
        this.markHint();
        this.animate(fresh);
        if (view.phase === 'end' && !$('#result').open) setTimeout(() => this.showResult(), 1600);
    }

    renderTop() {
        const view = this.view;
        $('#round-info').innerHTML = `第${view.round}ラウンド<small>・伏せた札 ${view.total}枚</small>`;
    }

    // 伏せた札の並び（右がいちばん上）。mine なら中身を薄く見せる
    stackHtml(player, mine) {
        const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
        const n = player.stackCount;
        const shown = player.revealed.length;
        const items = [];
        for (let i = 0; i < n; i++) {
            // i は下から。上から数えて revealed.length 枚がめくられている
            const fromTop = n - 1 - i;
            const revealed = fromTop < shown ? player.revealed[fromTop] : null;
            const peek = mine && !revealed ? this.view.myStack[i] : null;
            // 自分の伏せた札は、中身を薄く見せる（自分にだけ見える）
            items.push(discHtml(revealed ?? peek, color, { cls: `${peek ? 'peek' : ''} ${revealed ? 'shown' : ''}`, attrs: `data-index="${fromTop + 1}"` }));
        }
        return `<div class="stack" data-stack="${player.id}">${items.join('') || '<span class="empty-stack"></span>'}</div>`;
    }

    statusHtml(player) {
        const view = this.view;
        if (player.out) return '<span class="status out">脱落</span>';
        if (view.phase === 'ante') return player.placed ? '' : '<span class="status thinking">伏せ中</span>';
        if (view.phase === 'bid' || view.phase === 'reveal' || view.phase === 'lose') {
            if (view.passed.includes(player.id)) return '<span class="status passed">パス</span>';
            if (view.bidder === player.id) return `<span class="status bid">${view.phase === 'bid' ? '最高 ' : '挑戦 '}${view.bid}</span>`;
        }
        return '';
    }

    matHtml(player) {
        const view = this.view;
        const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
        const active = view.phase !== 'end' && (view.current === player.id || (view.phase === 'ante' && !player.placed && !player.out));
        const target = this.myTurn('reveal') && player.revealed.length < player.stackCount && player.id !== view.seat
            && view.players[view.seat].revealed.length >= view.players[view.seat].stackCount;
        return `<div class="mat ${active ? 'active' : ''} ${player.out ? 'out' : ''} ${target ? 'target' : ''}" data-seat="${player.id}" style="--pc:${color}">
            <div class="mat-head">${coasterHtml(player.wins, color)}<span class="name">${escapeHtml(player.name)}</span><span class="discs" title="持っている札の枚数">${player.discCount}枚</span></div>
            ${this.stackHtml(player, false)}
            <div class="mat-foot">${this.statusHtml(player)}</div></div>`;
    }

    renderOpponents() {
        const view = this.view;
        const others = view.players.filter(p => p.id !== view.seat);
        // 自分の次の人から順に
        others.sort((a, b) => ((a.id - view.seat + view.players.length) % view.players.length) - ((b.id - view.seat + view.players.length) % view.players.length));
        const el = $('#opponents');
        el.style.setProperty('--cols', Math.min(3, others.length));
        el.innerHTML = others.map(p => this.matHtml(p)).join('');
    }

    renderCenter(fresh) {
        const view = this.view;
        const name = (s) => escapeHtml(view.players[s].name);
        let html;
        if (view.phase === 'ante') {
            const summary = this.lastChallenge();
            html = summary ?? `<p class="center-main">全員が1枚伏せます</p><p class="center-sub">${name(view.start)}から始めます</p>`;
        } else if (view.phase === 'turn') {
            html = `<p class="center-main">${view.current === view.seat ? 'あなたの番' : `${name(view.current)}の番`}</p><p class="center-sub">伏せるか、挑戦する</p>`;
        } else if (view.phase === 'bid') {
            const passed = view.passed.length ? `パス：${view.passed.map(name).join('・')}` : '';
            html = `<p class="center-main"><b class="big">${view.bid}</b>枚の挑戦<small>（${name(view.bidder)}）</small></p><p class="center-sub">${view.current === view.seat ? 'あなたの番：上げるかパス' : `${name(view.current)}が考えています`}　${passed}</p>`;
        } else if (view.phase === 'reveal' || view.phase === 'lose') {
            const meter = Array.from({ length: view.bid }, (_, i) => `<i class="pip ${i < view.flipped ? 'on' : ''}"></i>`).join('');
            html = `<p class="center-main">${name(view.challenger)}が<b class="big">${view.bid}</b>枚めくる</p><div class="meter">${meter}</div>
                <p class="center-sub">${view.phase === 'lose' ? '自分のドクロで失敗…' : `${view.flipped}／${view.bid}枚`}</p>`;
        } else {
            html = `<p class="center-main">${view.winner === view.seat ? 'あなたの勝ち！' : `${name(view.winner)}の勝ち`}</p>`;
        }
        $('#center').innerHTML = html;
    }

    // 直前の挑戦の結果（次のラウンドの1枚目を伏せている間に見せる）
    lastChallenge() {
        const view = this.view;
        const events = view.events;
        const roundIndex = events.findLastIndex(e => e.type === 'round');
        if (roundIndex < 0) return null;
        const before = events.slice(0, roundIndex);
        const revealIndex = before.findLastIndex(e => e.type === 'reveal');
        if (revealIndex < 0 || before.slice(revealIndex).some(e => e.type === 'round')) return null;
        const flips = before.slice(revealIndex).filter(e => e.type === 'flip');
        const reveal = before[revealIndex];
        const success = before.slice(revealIndex).some(e => e.type === 'success');
        const discs = flips.map(f => discHtml(f.disc, PLAYER_COLORS[f.target % PLAYER_COLORS.length], { cls: 'small' })).join('');
        const who = escapeHtml(view.players[reveal.seat].name);
        return `<p class="center-main ${success ? 'ok' : 'ng'}">${who}の挑戦は${success ? '成功！' : '失敗…'}</p><div class="flips">${discs}</div>`;
    }

    renderMe() {
        const view = this.view;
        const me = view.players[view.seat];
        const color = PLAYER_COLORS[view.seat % PLAYER_COLORS.length];
        const canPlace = this.myTurn('ante') || this.myTurn('turn');
        const hand = [];
        for (let i = 0; i < view.hand.F; i++) hand.push(FLOWER);
        for (let i = 0; i < view.hand.S; i++) hand.push(SKULL);
        const handHtml = hand.map(d => `<button type="button" class="hand-disc ${canPlace ? 'can' : ''}" data-disc="${d}" ${canPlace ? '' : 'disabled'} aria-label="${d === SKULL ? 'ドクロを伏せる' : '花を伏せる'}">${discHtml(d, color)}</button>`).join('');
        const active = view.current === view.seat || this.myTurn('ante');
        const ownTarget = this.myTurn('reveal') && me.revealed.length < me.stackCount;
        const el = $('#me');
        el.className = `mat me ${active && view.phase !== 'end' ? 'active' : ''} ${me.out ? 'out' : ''} ${ownTarget ? 'target' : ''}`;
        el.style.setProperty('--pc', color);
        el.innerHTML = `<div class="mat-head">${coasterHtml(me.wins, color)}<span class="name">あなた</span><span class="wins">${me.wins}／${WINS_NEEDED}勝</span>${this.statusHtml(me)}<span class="discs">${me.discCount}枚</span></div>
            <div class="me-body"><div class="me-stack"><small>伏せた札</small>${this.stackHtml(me, true)}</div>
            <div class="me-hand"><small>手札</small><div class="hand">${handHtml || '<span class="muted none">なし</span>'}</div></div></div>`;
    }

    renderActions() {
        const view = this.view;
        let html = '';
        const stepper = (label, act) => `<span class="stepper">
                <button class="step" data-act="minus" ${this.bidding <= (view.phase === 'bid' ? view.bid + 1 : 1) ? 'disabled' : ''} aria-label="1減らす">−</button>
                <span class="step-num">${this.bidding}<small>枚</small></span>
                <button class="step" data-act="plus" ${this.bidding >= view.total ? 'disabled' : ''} aria-label="1増やす">＋</button>
            </span><button class="btn small primary" data-act="${act}">${label}</button>`;
        if (this.myTurn('ante')) html = '<span class="hint">手札の札を押して、1枚伏せる</span>';
        else if (this.myTurn('turn')) {
            const handCount = view.hand.F + view.hand.S;
            html = this.bidding !== null
                ? `${stepper('挑戦する', 'challenge')}${handCount ? '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>' : ''}`
                : `<span class="hint">${handCount ? '札を伏せるか' : '手札がないので'}</span><button class="btn small primary" data-act="open-bid">挑戦する</button>`;
        } else if (this.myTurn('bid')) {
            html = view.bid >= view.total
                ? '<button class="btn small ghost" data-act="pass">パス</button>'
                : `${stepper('上げる', 'raise')}<button class="btn small ghost" data-act="pass">パス</button>`;
        } else if (this.myTurn('reveal')) {
            const me = view.players[view.seat];
            html = me.revealed.length < me.stackCount
                ? '<span class="hint">まず自分の山から</span><button class="btn small primary" data-act="flip-own">自分の山をめくる</button>'
                : '<span class="hint strong">めくる人の山を押す</span>';
        } else if (this.myTurn('lose')) {
            const discs = view.myDiscs;
            html = `<span class="hint">取り除く札を選ぶ</span>
                <button class="btn small ghost lose-btn" data-act="lose" data-disc="F" ${discs.F ? '' : 'disabled'}>${discHtml(FLOWER, PLAYER_COLORS[view.seat])}花</button>
                <button class="btn small ghost lose-btn" data-act="lose" data-disc="S" ${discs.S ? '' : 'disabled'}>${discHtml(SKULL, PLAYER_COLORS[view.seat])}ドクロ</button>`;
        } else if (view.phase === 'end') {
            html = '<button class="btn small primary" data-act="again">もう一度</button>';
        } else {
            html = `<span class="hint muted">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        }
        $('#actions').innerHTML = html;
    }

    // めくった札を回して見せる。ドクロなら山を赤く揺らす。決着したら帯を出して少し止める
    animate(events) {
        const view = this.view;
        const motion = !reducedMotion();
        for (const e of events) {
            if (e.type === 'flip' && motion) {
                const container = e.target === view.seat ? $('#me') : document.querySelector(`#opponents .mat[data-seat="${e.target}"]`);
                const disc = container?.querySelector(`.stack [data-index="${e.index}"]`);
                disc?.classList.add('flipping');
                if (e.disc === SKULL) container?.classList.add('hit');
            }
            if (e.type === 'success') this.banner(`${view.players[e.seat].name}の挑戦は成功！`, 'ok');
            if (e.type === 'lost') {
                const who = view.players[e.seat].name;
                const text = e.seat === view.seat && e.disc ? `${e.disc === SKULL ? 'ドクロ' : '花'}が取り除かれました` : `${who}の札が1枚取り除かれました`;
                this.banner(`ドクロ！ ${text}`, 'ng');
            }
            if (e.type === 'out') this.toast(`${view.players[e.seat].name}は脱落しました`);
        }
        if (events.some(e => e.type === 'success' || e.type === 'lost') && view.phase !== 'end') this.hold(RESULT_PAUSE_MS);
    }

    banner(text, kind) {
        const el = $('#banner');
        el.textContent = text;
        el.className = `banner show ${kind}`;
        clearTimeout(this.bannerTimer);
        this.bannerTimer = setTimeout(() => { el.className = 'banner'; }, RESULT_PAUSE_MS);
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open) return;
        const reason = view.events.findLast?.(e => e.type === 'end')?.reason;
        $('#result-title').textContent = view.winner === view.seat ? 'あなたの勝ち' : `${view.players[view.winner].name}の勝ち`;
        $('#result-detail').textContent = reason === 'last' ? '最後の1人になりました' : '挑戦に2回成功しました';
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
