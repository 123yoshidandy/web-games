/**
 * 画面（タイトル・ゲーム・ダイアログ）
 * 画面はビューだけを見て描く。操作はコントローラーの send() に渡す
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import Game, { MIN_PLAYERS, MAX_PLAYERS, CHOICE_EFFECTS } from './game.js';
import {
    EFFECT_NAMES, POOL_SCORES, BIS_PENALTY, ESTATE_VALUES, MAX_REFUSALS
} from './cards.js';
import {
    createSheet, writableHouses, bisSpots, fenceSpots, canRaiseEstate, planEstates, completedEstates, estateValue, writeHouse
} from './sheet.js';
import { effectIcon, sheetSvg, planSizesHtml, LINE_ICONS } from './art.js';
import { HELP_HTML } from './help.js';
import { suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';
import * as Motion from './motion/motion.js';

const SETTINGS_KEY = 'welcome-to.settings';
// 動き（普通の速さでの長さ。部品が速さの設定を掛ける）
const FLY_MS = 420;      // カードから家へ
const FLIP_MS = 380;     // カードがめくれる
const STAGGER_MS = 110;  // 何枚も動くときの間
const RESULT_DELAY_MS = 600;   // 動きが終わってから数える
const CPU_NAMES = ['ベティ', 'フランク', 'ドリス', 'ハロルド', 'ルース'];
const STREET_NAMES = ['上', '中', '下'];

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 3,
            level: s.level === 'easy' ? 'easy' : 'normal'
        };
    } catch {
        return { count: 3, level: 'normal' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 得点の内訳（短い表記）
export function scoreParts(s) {
    return [['計画', s.plans], ['公園', s.parks], ['プール', s.pools], ['派遣', s.temps], ['家並み', s.estates]]
        .map(([k, v]) => `<span class="sp">${k}<b>${v}</b></span>`).join('')
        + [['ビス', s.bis], ['断り', s.refusals]].map(([k, v]) => `<span class="sp minus">${k}<b>${v > 0 ? '−' : ''}${v}</b></span>`).join('');
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.sel = { num: null, eff: null, value: null };   // 選んだカード（番号・効果）と書く番号
        this.turnNo = 0;
        this.resultShown = false;
        this.pendingPlan = null;
        $('home').innerHTML = LINE_ICONS.home;
        $('open-help-game').innerHTML = LINE_ICONS.help;
        $('open-others').innerHTML = LINE_ICONS.people;
        $('undo').innerHTML = LINE_ICONS.undo;
        this.flying = new Set();   // 飛んでいる最中の家（描き直しても番号を隠し続ける）
        Motion.mountSpeedSetting($('motion-setting'), { label: '' });
        Motion.mountSpeedSetting($('motion-setting-help'), { label: '動き' });
        $('help-body').innerHTML = HELP_HTML;
        $('title-art').innerHTML = this.titleArt();
        this.bindTitle();
        this.bindGame();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ウェルカム・トゥ',
            game: 'welcome-to',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: Math.max(2, MIN_PLAYERS),
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
        document.addEventListener('contextmenu', event => event.preventDefault());
    }

    // タイトルの絵：番号を書きかけた通り
    titleArt() {
        const sheet = createSheet();
        [[0, 0, 1], [0, 1, 3], [0, 2, 4], [0, 4, 8], [0, 5, 9], [0, 7, 12], [1, 0, 2], [1, 1, 5], [1, 3, 6], [1, 4, 7], [1, 6, 10], [1, 9, 14],
            [2, 1, 2], [2, 2, 4], [2, 3, 6], [2, 6, 9], [2, 7, 11], [2, 10, 15]].forEach(([s, h, n]) => writeHouse(sheet, s, h, n));
        writeHouse(sheet, 1, 2, 5, { bis: true });
        sheet.fences[0][2] = true;
        sheet.fences[1][2] = true;
        sheet.fences[1][4] = true;
        sheet.pools[0][2] = true;
        sheet.pools[1][3] = true;
        return sheetSvg(sheet, { small: true });
    }

    // ---- タイトル ----

    bindTitle() {
        $('count-down').addEventListener('click', () => this.changeCount(-1));
        $('count-up').addEventListener('click', () => this.changeCount(1));
        $('level').addEventListener('click', event => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderTitle();
        });
        $('start').addEventListener('click', () => this.start());
        $('online-button').addEventListener('click', () => this.online.open());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startWith(saved);
        });
        $('open-help-title').addEventListener('click', () => this.openDialog('help'));
    }

    changeCount(delta) {
        this.settings.count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, this.settings.count + delta));
        saveSettings(this.settings);
        this.renderTitle();
    }

    renderTitle() {
        $('count-value').textContent = `${this.settings.count}人`;
        $('count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('count-up').disabled = this.settings.count >= MAX_PLAYERS;
        $('level').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === this.settings.level));
        $('level').closest('.setup-row').classList.toggle('off', this.settings.count === 1);
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online?.available;
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.cancelResult?.();
        this.cancelResult = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('screen-game').hidden = true;
        this.renderTitle();
        $('screen-title').hidden = false;
    }

    start() {
        clearSavedGame();
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, this.settings.count - 1).map(name => ({ name, isCPU: true }))];
        this.startWith({ players, options: { level: this.settings.level } });
    }

    startWith(setup) {
        this.begin(new LocalGameController(setup, {
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            }
        }));
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.cancelResult?.();
        this.cancelResult = null;
        this.flying.clear();
        this.sel = { num: null, eff: null, value: null };
        this.turnNo = 0;
        this.resultShown = false;
        this.controller = controller;
        this.view = null;
        this.hintCommand = null;
        this.lastSeq = controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は鳴らさない
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openDialog('help'));
        $('open-others').addEventListener('click', () => this.showOthers());
        $('hint').addEventListener('click', () => this.showHint());
        $('cards').addEventListener('click', event => {
            const b = event.target.closest('[data-card]');
            if (b && !b.disabled) this.selectCard(Number(b.dataset.card));
        });
        $('plans').addEventListener('click', event => {
            const b = event.target.closest('[data-plan]');
            if (b) this.tapPlan(Number(b.dataset.plan));
        });
        $('sheet').addEventListener('click', event => {
            const fence = event.target.closest('[data-fence]');
            if (fence) return this.send({ type: 'effect', street: Number(fence.dataset.street), pos: Number(fence.dataset.fence) });
            const house = event.target.closest('[data-house]');
            if (house) this.tapHouse(Number(house.dataset.street), Number(house.dataset.house));
        });
        $('tracks').addEventListener('click', event => {
            const b = event.target.closest('[data-size]');
            if (b && b.classList.contains('target')) this.send({ type: 'effect', size: Number(b.dataset.size) });
        });
        $('temp-down').addEventListener('click', () => this.stepValue(-1));
        $('temp-up').addEventListener('click', () => this.stepValue(1));
        $('undo').addEventListener('click', () => {
            this.sel = { num: null, eff: null, value: null };
            this.send({ type: 'undo' });
        });
        $('refuse').addEventListener('click', () => this.send({ type: 'refuse' }));
        $('end').addEventListener('click', () => {
            this.sel = { num: null, eff: null, value: null };
            this.send({ type: 'end' });
        });
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('.close').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => {
                if (event.target === dialog && dialog.id !== 'result' && dialog.id !== 'reshuffle') dialog.close();
            });
        });
        $('reshuffle-yes').addEventListener('click', () => this.answerReshuffle(true));
        $('reshuffle-no').addEventListener('click', () => this.answerReshuffle(false));
        $('again').addEventListener('click', () => {
            $('result').close();
            if (this.controller?.isOnline) return this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            this.start();
        });
        $('result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
    }

    openDialog(id) {
        const dialog = $(id);
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.help-body, .others-list, .table-wrap')?.scrollTo?.(0, 0);
    }

    me() {
        return this.view.players[this.view.you];
    }

    mine() {
        return this.view.actors.includes(this.view.you);
    }

    acted() {
        const t = this.me().turn;
        return !!(t.built || t.refused);
    }

    // 選んでいる組み合わせ（番号と効果がそろっていなければ null）
    combo() {
        const { num, eff } = this.sel;
        if (num === null || eff === null) return null;
        return this.view.combos.find(c => c.num === num && c.eff === eff) ?? null;
    }

    selectCard(i) {
        if (!this.mine() || this.acted()) return;
        const sel = this.sel;
        if (!this.view.solo) {
            this.sel = sel.num === i ? { num: null, eff: null, value: null } : { num: i, eff: i, value: null };
        } else if (sel.num === null) {
            this.sel = { num: i, eff: null, value: null };
        } else if (sel.num === i) {
            this.sel = { num: sel.eff, eff: null, value: null };
        } else if (sel.eff === i) {
            this.sel = { num: sel.num, eff: null, value: null };
        } else {
            this.sel = { num: sel.num, eff: i, value: null };
        }
        const combo = this.combo();
        if (combo) this.sel.value = combo.n;
        music.play(this.sel.num === null ? 'cancel' : 'select');
        this.render();
    }

    stepValue(delta) {
        const combo = this.combo();
        if (!combo) return;
        const values = Game.values(combo);
        const next = this.sel.value + delta;
        if (values.includes(next)) this.sel.value = next;
        music.play(values.includes(next) ? 'select' : 'error');
        this.render();
    }

    tapHouse(street, house) {
        if (!this.mine()) return;
        const me = this.me();
        const t = me.turn;
        if (this.effectMode() === 'bis') {
            const spot = bisSpots(me.sheet).find(b => b.street === street && b.house === house);
            if (spot) return this.send({ type: 'effect', street, pos: house, value: spot.n });
            return this.toast('ビスは、隣の家と同じ番号で、フェンスをはさまずに建てます');
        }
        if (t.built || t.refused) return;
        const combo = this.combo();
        if (!combo) return this.toast(this.view.solo && this.sel.num !== null ? '効果に使うカードも選んでください' : '先に、上のカードを選んでください');
        if (this.send({ type: 'build', num: combo.num, eff: combo.eff, value: this.sel.value, street, house })) {
            this.sel = { num: null, eff: null, value: null };
            this.render();
        }
    }

    tapPlan(k) {
        if (!this.mine()) return;
        const plan = this.view.plans[k];
        const me = this.me();
        if (me.plans[k] || me.turn.plans.includes(k)) return this.toast('この都市計画は達成しました');
        if (!planEstates(me.sheet, plan)) return this.toast(`家並み ${plan.sizes.join('・')} 軒がそろうと達成できます`);
        if (!this.acted()) return this.toast('先に家を建てます');
        if (this.view.canAskReshuffle) {
            this.pendingPlan = k;
            return this.openDialog('reshuffle');
        }
        this.send({ type: 'plan', plan: k, reshuffle: false });
    }

    answerReshuffle(yes) {
        $('reshuffle').close();
        if (this.pendingPlan === null) return;
        const k = this.pendingPlan;
        this.pendingPlan = null;
        this.send({ type: 'plan', plan: k, reshuffle: yes });
    }

    send(command) {
        if (!this.controller) return false;
        this.hintCommand = null;
        this.sending = true;
        let ok = false;
        try {
            ok = this.controller.send(command);
        } finally {
            this.sending = false;
        }
        if (ok) this.playSent(command);
        return ok;
    }

    // ---- 効果音 ----

    freshEvents() {
        const events = this.controller.getView().events;
        const fresh = events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = events.at(-1)?.seq ?? this.lastSeq;
        return fresh;
    }

    endSound(fresh) {
        const end = fresh.find(e => e.type === 'end');
        if (end) music.play(end.winners.includes(this.view.you) ? 'win' : 'lose');
        return !!end;
    }

    // 自分が送った操作の音（1つの操作に1つ）
    playSent(command) {
        const fresh = this.freshEvents();
        if (this.endSound(fresh)) return;
        // 全員が書き終えて、次のカードがめくられた
        if (fresh.some(e => e.type === 'turn')) return music.play('turn');
        const sound = { build: 'place', effect: 'place', plan: 'gain', refuse: 'pay', undo: 'cancel', end: 'select' }[command.type];
        if (sound) music.play(sound);
    }

    // ほかの人が動いたときの音。次のカードがめくられて自分が書けるようになったら turn、終わりは勝ち負け
    // CPU は速く書くので、CPU の手ごとには鳴らさない
    playUpdate() {
        const fresh = this.freshEvents();
        if (this.endSound(fresh)) return;
        if (fresh.some(e => e.type === 'turn') && this.mine()) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.view ? suggest(this.view) : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        // 建てる手は、カードと番号を選んだ状態にする（光っている家を押して決める）
        if (command.type === 'build') this.sel = { num: command.num, eff: command.eff, value: command.value };
        this.render();
        const text = {
            build: `${command.value} を印の付いた家に建てる`, effect: '印の付いたところに効果を使う', plan: '印の付いた都市計画を達成する',
            refuse: '建てられないので、断る', end: '手番を終える'
        }[command.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    // おすすめの手の家・フェンス・ボタンに印を付ける
    markHint() {
        // シートとボタンは描き直さないことがあるので、前の印を外してから付ける
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const c = this.hintCommand;
        if (!c) return;
        let selector = { plan: `[data-plan="${c.plan}"]`, refuse: '#refuse', end: '#end' }[c.type];
        if (c.type === 'build') selector = `[data-street="${c.street}"][data-house="${c.house}"]`;
        if (c.type === 'effect') {
            if (c.size !== undefined) selector = `[data-size="${c.size}"]`;
            else if (c.value !== undefined) selector = `[data-street="${c.street}"][data-house="${c.pos}"]`;
            else if (c.pos !== undefined) selector = `[data-street="${c.street}"][data-fence="${c.pos}"]`;
        }
        if (selector) document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    // 選んで使う効果を待っているか（'surveyor'・'estate'・'bis' か null）
    effectMode() {
        if (!this.mine()) return null;
        const t = this.me().turn;
        if (!t.built || t.effectUsed || !CHOICE_EFFECTS.includes(t.built.effect)) return null;
        return t.built.effect;
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        // 描き直す前に、動きの出発点（選んだカード・得点の欄）を測る
        const before = prev && Motion.enabled() ? this.measure() : null;
        this.view = view;
        $('hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        if (prev && !this.sending) this.playUpdate();
        if (view.turnNo !== this.turnNo) {
            this.turnNo = view.turnNo;
            this.sel = { num: null, eff: null, value: null };
        }
        if (!this.mine() || this.acted()) this.sel = { num: null, eff: null, value: null };
        const me = this.me();

        $('turn').innerHTML = view.phase === 'end' ? '終了' : view.solo ? `山札 <b>${view.deckLeft}</b>` : `第<b>${view.turnNo}</b>手`;
        $('total').innerHTML = `${view.phase === 'end' ? '' : '見込み'}<b>${me.score.total}</b>点`;
        $('total').innerHTML = `${view.phase === 'end' ? '' : '見込み'}<b>${me.score.total}</b>点`;
        const others = view.players.filter(p => p.id !== view.you);
        $('others').textContent = others.length === 0 || view.phase === 'end' ? '' : `建て終えた人 ${others.filter(p => p.done).length}/${others.length}`;
        $('open-others').hidden = others.length === 0;

        this.renderCards(view, me);
        this.renderPlans(view, me);
        this.renderSheet(view, me);
        this.renderTracks(view, me);
        this.renderActions(view, me);
        this.markHint();
        if (before) this.animateUpdate(prev, view, before);

        if (view.phase === 'end' && !this.resultShown) {
            this.resultShown = true;
            const controller = this.controller;
            this.cancelResult = Motion.afterIdle(() => {
                this.cancelResult = null;
                if (this.controller === controller) this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // ---- 動き ----

    measure() {
        const picked = document.querySelector('#cards .card.selected, #cards .card.as-num');
        return {
            card: picked ? { rect: Motion.rectOf(picked), el: picked } : null,
            marks: [...$('tracks').querySelectorAll('.chip, .estate')].map(el => el.innerHTML)
        };
    }

    // 書いた番号は、選んだカードから家へ飛ぶ。飛んでいる間、家の番号は隠す（描き直しても隠し続ける）
    hideFlying() {
        this.flying.forEach(key => {
            const [street, house] = key.split(':');
            $('sheet').querySelectorAll(`g[data-street="${street}"][data-house="${house}"] text`).forEach(el => { el.style.visibility = 'hidden'; });
        });
    }

    // 前のビューから増えた出来事（events の seq で見る）を動かす
    // 新しい手番ではカードがめくれ、自分が書いた家へはカードが飛び、都市計画の達成・得点・家並みや記録の欄の変化は弾む
    animateUpdate(prev, v, before) {
        const lastSeq = Math.max(0, ...(prev.events ?? []).map(e => e.seq));
        const fresh = (v.events ?? []).filter(e => e.seq > lastSeq);
        let settle = 0;
        fresh.forEach(e => {
            if (e.type === 'build' && e.seat === v.you && before.card) {
                const key = `${e.street}:${e.house}`;
                const to = $('sheet').querySelector(`g[data-street="${e.street}"][data-house="${e.house}"]`);
                if (!to) return;
                this.flying.add(key);
                this.hideFlying();
                Motion.fly(before.card.rect, to, { content: before.card.el, duration: FLY_MS }).then(() => {
                    this.flying.delete(key);
                    $('sheet').querySelectorAll(`g[data-street="${e.street}"][data-house="${e.house}"] text`).forEach(el => { el.style.visibility = ''; });
                });
                settle = FLY_MS;
            } else if (e.type === 'plan' && e.seat === v.you) {
                Motion.pulse($('plans').querySelector(`.plan[data-plan="${e.plan}"]`), { delay: settle, scale: 1.12, duration: 420 });
            }
        });
        if (v.turnNo !== prev.turnNo) {
            document.querySelectorAll('#cards .card').forEach((el, i) => Motion.flipCard(el, { duration: FLIP_MS, delay: i * STAGGER_MS }));
        }
        const old = prev.players[prev.you]?.score?.total;
        const now = v.players[v.you]?.score?.total;
        if (old !== undefined && now !== undefined && old !== now) Motion.pulse($('total').querySelector('b'), { delay: settle, scale: 1.4, duration: 400 });
        // 記録の欄（プール・温度・ビス・断り・家並み）で変わったもの
        [...$('tracks').querySelectorAll('.chip, .estate')].forEach((el, i) => {
            if (before.marks[i] !== undefined && before.marks[i] !== el.innerHTML) Motion.pulse(el, { delay: settle, scale: 1.25, duration: 380 });
        });
    }

    renderCards(view, me) {
        const locked = !this.mine() || this.acted();
        const built = me.turn.built;
        if (view.solo) {
            $('cards').innerHTML = view.cards.map((c, i) => {
                const classes = ['card', 'solo'];
                let tag = '';
                if (this.sel.num === i) { classes.push('as-num'); tag = '番号'; }
                if (this.sel.eff === i) { classes.push('as-eff'); tag = '効果'; }
                return `<button class="${classes.join(' ')}" data-card="${i}" ${locked ? 'disabled' : ''} aria-label="${c.n}・${EFFECT_NAMES[c.e]}">
                    <span class="card-num">${c.n}</span>${effectIcon(c.e)}${tag ? `<i class="card-tag">${tag}</i>` : ''}</button>`;
            }).join('');
            return;
        }
        $('cards').innerHTML = view.combos.map((c, i) => {
            const classes = ['card'];
            if (this.sel.num === i) classes.push('selected');
            if (built && locked && view.combos[i].n === built.n && view.combos[i].e === built.effect) classes.push('chosen');
            return `<button class="${classes.join(' ')}" data-card="${i}" ${locked ? 'disabled' : ''} aria-label="${c.n}・${EFFECT_NAMES[c.e]}">
                ${effectIcon(c.e)}<span class="card-num">${c.n}</span></button>`;
        }).join('');
    }

    renderPlans(view, me) {
        $('plans').innerHTML = view.plans.map((p, k) => {
            const mineDone = me.plans[k];
            const now = me.turn.plans.includes(k);
            const ready = !mineDone && !now && this.mine() && this.acted() && !!planEstates(me.sheet, p);
            const classes = ['plan'];
            if (mineDone || now) classes.push('done');
            if (ready) classes.push('ready');
            const pts = mineDone ? `<span class="plan-got">達成<b>${mineDone.points}</b></span>`
                : now ? '<span class="plan-got">達成</span>'
                    : `<span class="plan-pts">${p.claimed ? `<s>${p.points[0]}</s>` : `<b>${p.points[0]}</b>`}<i>/</i>${p.claimed ? `<b>${p.points[1]}</b>` : p.points[1]}</span>`;
            return `<button class="${classes.join(' ')}" data-plan="${k}" aria-label="都市計画 n°${k + 1}：家並み ${p.sizes.join('・')}">
                ${planSizesHtml(p.sizes)}<span class="plan-no">n°${k + 1}</span>${pts}</button>`;
        }).join('');
    }

    renderSheet(view, me) {
        const opts = { fresh: new Set() };
        const t = me.turn;
        if (t.built) opts.fresh.add(`${t.built.street}:${t.built.house}`);
        if (t.bisAt) opts.fresh.add(`${t.bisAt.street}:${t.bisAt.house}`);
        const combo = this.combo();
        if (this.mine() && !this.acted() && combo) {
            opts.targets = new Set(writableHouses(me.sheet, this.sel.value).map(h => `${h.street}:${h.house}`));
        }
        const mode = this.effectMode();
        if (mode === 'surveyor') opts.fenceTargets = new Set(fenceSpots(me.sheet).map(f => `${f.street}:${f.pos}`));
        if (mode === 'bis') opts.bisTargets = new Set(bisSpots(me.sheet).map(b => `${b.street}:${b.house}`));
        this.targetCount = opts.targets?.size ?? 0;
        $('sheet').innerHTML = sheetSvg(me.sheet, opts);
        this.hideFlying();
    }

    renderTracks(view, me) {
        const sheet = me.sheet;
        const pools = sheet.pools.flat().filter(Boolean).length;
        const refusals = Array.from({ length: MAX_REFUSALS }, (_, i) => `<i class="dot${i < sheet.refusals ? ' on' : ''}"></i>`).join('');
        const chips = [
            `<span class="chip">${effectIcon('pool')}<span class="chip-sub">${pools}</span><b>${POOL_SCORES[Math.min(pools, POOL_SCORES.length - 1)]}</b></span>`,
            `<span class="chip">${effectIcon('temp')}<b>${sheet.temps}</b></span>`,
            `<span class="chip">${effectIcon('bis')}<span class="chip-sub">${sheet.bis}</span><b class="minus">${BIS_PENALTY[sheet.bis] ? '−' : ''}${BIS_PENALTY[sheet.bis]}</b></span>`,
            `<span class="chip refusal" title="断り">断り${refusals}</span>`
        ].join('');
        const counts = [0, 0, 0, 0, 0, 0];
        completedEstates(sheet).forEach(e => { counts[e.size - 1]++; });
        const estateMode = this.effectMode() === 'estate';
        const estates = [1, 2, 3, 4, 5, 6].map(size => {
            const steps = ESTATE_VALUES[size - 1].length - 1;
            const used = sheet.estates[size - 1];
            const target = estateMode && canRaiseEstate(sheet, size);
            const dots = Array.from({ length: steps }, (_, i) => `<i class="dot${i < used ? ' on' : ''}"></i>`).join('');
            return `<button class="estate${target ? ' target' : ''}" data-size="${size}" ${target ? '' : 'tabindex="-1"'} aria-label="${size}軒の家並み：1つ${estateValue(sheet, size)}点">
                <span class="estate-size">${size}軒</span><b>${estateValue(sheet, size)}</b><span class="dots">${dots}</span>${counts[size - 1] ? `<i class="estate-count">×${counts[size - 1]}</i>` : ''}</button>`;
        }).join('');
        $('tracks').innerHTML = `<div class="chips">${chips}</div><div class="estates">${estates}</div>`;
    }

    renderActions(view, me) {
        const t = me.turn;
        const mine = this.mine();
        const combo = this.combo();
        const mode = this.effectMode();
        let prompt = '';
        let bad = false;
        if (view.phase === 'end') prompt = 'ゲーム終了';
        else if (!mine) prompt = 'ほかの人が建て終えるのを待っています';
        else if (!t.built && !t.refused) {
            if (me.mustRefuse) {
                prompt = 'どの番号も書けません。建築許可が下りません';
                bad = true;
            } else if (!combo) {
                prompt = view.solo
                    ? (this.sel.num === null ? '番号に使うカードを選んでください' : '効果に使うカードを選んでください')
                    : '番号と効果の組み合わせを選んでください';
            } else if (this.targetCount === 0) {
                prompt = combo.e === 'temp' ? 'この番号は書けません。番号を変えてください' : 'この番号は、どの通りにも書けません';
                bad = true;
            } else prompt = `${this.sel.value}番を建てる家を選んでください`;
        } else if (mode) {
            prompt = mode === 'surveyor' ? 'フェンスを立てる場所を選べます'
                : mode === 'estate' ? '値を上げる家並みを選べます'
                    : 'ビスを建てる家を選べます';
            prompt += '（使わないなら「次へ」）';
        } else if (view.plans.some((p, k) => !me.plans[k] && !t.plans.includes(k) && planEstates(me.sheet, p))) {
            prompt = '都市計画を達成できます';
        } else if (t.refused) {
            prompt = `断りが${me.sheet.refusals}つになりました`;
            bad = true;
        } else {
            const b = t.built;
            prompt = `${STREET_NAMES[b.street]}の通りに${b.value}番を建てました`;
        }
        $('prompt').textContent = prompt;
        $('prompt').classList.toggle('bad', bad);

        const showTemp = mine && !t.built && !t.refused && combo?.e === 'temp';
        $('temp').hidden = !showTemp;
        if (showTemp) {
            const values = Game.values(combo);
            $('temp-value').textContent = this.sel.value;
            $('temp-down').disabled = !values.includes(this.sel.value - 1);
            $('temp-up').disabled = !values.includes(this.sel.value + 1);
        }
        $('undo').disabled = !mine || !me.canUndo;
        $('refuse').hidden = !(mine && !t.built && !t.refused && me.mustRefuse);
        $('end').disabled = !mine || !(t.built || t.refused);
    }

    showOthers() {
        const view = this.controller.getView();
        $('others-list').innerHTML = view.players.map(p => `<div class="other${p.id === view.you ? ' self' : ''}">
            <div class="other-head"><b>${escapeHtml(p.name)}</b>${view.phase !== 'end' && p.done && p.id !== view.you ? '<i class="done-mark">済</i>' : ''}<span>${p.score.total}点</span></div>
            ${sheetSvg(p.sheet, { small: true })}
            <div class="other-score">${scoreParts(p.score)}</div></div>`).join('');
        this.openDialog('others-dialog');
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）。ひとり用は勝ち負けがないので、回数だけ
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !controller.game) return;
        if (controller.game.players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({
            game: GAME,
            id: `${GAME}-${controller.game.options.seed}`,
            outcome: view.players.length === 1 ? null : outcomeFromWinners(view.winners, view.you, view.players.length)
        });
    }

    showResult() {
        const view = this.controller?.getView();
        if (!view || view.phase !== 'end') return;
        this.recordLocalResult(view);
        const won = view.winners.includes(view.you);
        const solo = view.players.length === 1;
        $('result-title').textContent = solo ? `${view.players[0].score.total}点` : won ? 'あなたの勝ち！' : 'あなたの負け';
        $('result-reason').textContent = view.endReason ?? '';
        const ranked = [...view.players].sort((a, b) => b.score.total - a.score.total);
        $('result-table').innerHTML = ranked.map(p => `<tr class="${view.winners.includes(p.id) && !solo ? 'win' : ''}${p.id === view.you ? ' self' : ''}">
            <td class="name">${escapeHtml(p.name)}</td><td class="total">${p.score.total}</td><td class="parts">${scoreParts(p.score)}</td></tr>`).join('');
        this.openDialog('result');
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }
}

