/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import {
    LOCATIONS, NEIGHBORS, DIST, MONSTER_KEYS, ITEMS, COLORS, COLOR_NAMES, HERO, MONSTER, VILLAGERS, PERK_CARDS, PERK, LEVELS, TERROR_MAX, MONSTER_CARDS, SPECIAL_EVENTS
} from './data.js';
import { mapSvg, monsterBadge, heroPositions, monsterPositions, villagerPositions, ITEM_COLORS } from './map.js';
import { minimalSet } from './cpu-player.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import * as Motion from './motion/motion.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { recordResult } from './netplay/user-stats.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席だけを動かす。ヒント・任せる処理はない
function onlineAdapter(net) {
    const mySeat = () => net.getView()?.you;
    return {
        isOnline: true,
        mode: 'team',
        net,
        getView: () => net.getView(),
        canControl: (seat) => seat === mySeat(),
        send: (seat, command) => seat === mySeat() && net.send(command),
        get awaitingResponse() { return net.awaitingResponse; },
        suggest: () => null,
        assist: () => false,
        scheduleCpu() {},
        stop: () => net.stop()
    };
}

// 自分の操作の音（コマンドの種類ごと）
const COMMAND_SOUND = {
    move: 'place', guide: 'place', special: 'place', pickup: 'gain', share: 'select', advance: 'capture', defeat: 'capture',
    perk: 'select', end: 'select', target: 'select', defend: 'pay'
};

const SETTINGS_KEY = 'horrified.settings';
const CPU_NAMES = ['ハル', 'ミナ', 'ソラ', 'レン'];
const ACT_LABEL = { pickup: '拾う', guide: '案内', share: '共有', advance: '前進', defeat: '退治', special: '特殊', perk: '特典', end: '終える' };

const $ = (id) => document.getElementById(id);
const esc = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    assist: '<svg viewBox="0 0 24 24" class="line-icon"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor"/><path d="M2.5 12v3M21.5 12v3"/></svg>',
    pickup: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M12 4v10M8 10l4 4 4-4"/><path d="M5 16v3h14v-3"/></svg>',
    guide: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="8" cy="6" r="2.5"/><path d="M5 20l2-8 3 2v6"/><path d="M14 12h6M17 9l3 3-3 3"/></svg>',
    share: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    advance: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M12 3l2.5 5.5L20 9l-4.2 3.9L17 19l-5-3-5 3 1.2-6.1L4 9l5.5-.5z"/></svg>',
    defeat: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M5 19 19 5M15 5h4v4"/><path d="M5 5l5 5M14 14l5 5M5 19l3-1"/></svg>',
    special: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M13 3 6 13h5l-1 8 7-10h-5z"/></svg>',
    perk: '<svg viewBox="0 0 24 24" class="line-icon"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8l1.3 2.7 2.7.3-2 1.9.5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-1.9 2.7-.3z"/></svg>',
    end: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M5 5l8 7-8 7z"/><path d="M17 5v14"/></svg>'
};

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 2,
            level: Object.hasOwn(LEVELS, s.level) ? Number(s.level) : 2,
            mode: s.mode === 'all' ? 'all' : 'team'
        };
    } catch {
        return { count: 2, level: 2, mode: 'team' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

const itemChip = (id, extra = '') => `<span class="item ${ITEMS[id].color} ${extra}"><b>${ITEMS[id].strength}</b><small>${esc(ITEMS[id].name)}</small></span>`;
const itemText = (id) => `${COLOR_NAMES[ITEMS[id].color]}${ITEMS[id].strength}の${ITEMS[id].name}`;
const heroDot = (key) => `<span class="dot" style="--hc:${HERO[key].color}"></span>`;
const badgeSvg = (key, extra = '') => `<svg class="badge ${extra}" viewBox="-11 -11 22 22" aria-hidden="true">${monsterBadge(key, 0, 0, 10)}</svg>`;

// 怪物の目的の短い表示
function taskShort(m) {
    if (m.defeated) return '退治';
    if (m.done) return `退治 ${COLOR_NAMES[MONSTER[m.key].defeat.color]}${MONSTER[m.key].defeat.total}`;
    const label = { vampire: '棺', golem: '心', werewolf: '薬', mummy: '封印', fishman: '探索', invisible: '証拠' }[m.key];
    return `${label} ${m.progress}/${m.total}`;
}

// ヒントが指す場面（手を打つと変わる）
const hintKey = (v) => JSON.stringify([v.logTotal, v.phase, v.actionsLeft, v.current, v.prompt?.type ?? '']);

const SLIDE_MS = 420; // 英雄・怪物・村人が地点から地点へ進む長さ（普通の速さ）

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.focus = null;        // 持ち物を見せる英雄
        this.pick = null;         // 地図で地点を選んでいるとき：{ text, locs, onPick }
        this.sheetKind = null;
        this.answered = null;     // 答えた選択（返事が来るまで出し直さない）
        this.resultShown = false;
        this.hint = null;
        this.newsTimer = null;
        ['home', 'open-help-game', 'open-log', 'assist'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log', assist: 'assist' }[id]];
        });
        document.querySelectorAll('[data-act]').forEach(el => { el.innerHTML = `${ICONS[el.dataset.act]}<span>${ACT_LABEL[el.dataset.act]}</span>`; });
        $('title-art').innerHTML = mapSvg(null, { mini: true });
        $('title-monsters').innerHTML = MONSTER_KEYS.map(k => badgeSvg(k)).join('');
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'ホラーファイド',
            game: 'horrified',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: 2,
            maxPlayers: MAX_PLAYERS,
            settings: [{ key: 'level', label: '怪物', options: [{ value: '2', label: '2体' }, { value: '3', label: '3体' }, { value: '4', label: '4体' }] }],
            onStart: (net) => this.beginGame(this.controller?.net === net ? this.controller : onlineAdapter(net)),
            onUpdate: () => this.update(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                this.controller = null;
                this.showTitle();
            }
        });
        this.bindTitle();
        this.bindGame();
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    // ---- タイトル ----

    bindTitle() {
        const seg = (id, key, parse = (v) => v) => $(id).addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            music.play('select');
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
            this.renderTitle();
        });
        Motion.mountSpeedSetting($('motion-setting'), { label: '' });
        seg('count', 'count', Number);
        seg('level', 'level', Number);
        seg('mode', 'mode');
        $('start').addEventListener('click', () => this.start());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startWith(saved);
        });
        $('open-help-title').addEventListener('click', () => this.openHelp());
        $('online-button').addEventListener('click', () => this.online.open());
    }

    renderTitle() {
        const mark = (id, key) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', String(this.settings[key]) === b.dataset[key]));
        mark('count', 'count');
        mark('level', 'level');
        mark('mode', 'mode');
        $('mode-row').classList.toggle('off', this.settings.count === 1);
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.closeSheet();
        this.setPick(null);
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        this.renderTitle();
    }

    start() {
        const { count, level, mode } = this.settings;
        const team = mode === 'team' && count > 1;
        const players = Array.from({ length: count }, (_, i) => (team
            ? { name: i === 0 ? 'あなた' : CPU_NAMES[i - 1], isCPU: i > 0 }
            : { name: count === 1 ? 'あなた' : `${i + 1}P`, isCPU: false }));
        clearSavedGame();
        this.startWith({ players, options: { level }, mode: team ? 'team' : 'all' });
    }

    startWith(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.update(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.toast('続きを読み込めませんでした');
            this.renderTitle();
            return;
        }
        this.beginGame(controller);
        controller.scheduleCpu();
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.resultShown = false;
        this.focus = null;
        this.answered = null;
        this.hint = null;
        this.closeSheet();
        this.setPick(null);
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.cancelResult?.();
        this.update();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('assist').addEventListener('click', () => this.controller?.assist());
        $('hint').addEventListener('click', () => this.showHint());
        $('pick-cancel').addEventListener('click', () => this.setPick(null));
        $('news').addEventListener('click', () => { $('news').hidden = true; });
        $('map').addEventListener('click', event => {
            const g = event.target.closest('[data-loc]');
            if (g) this.tapLoc(Number(g.dataset.loc));
        });
        $('monsters').addEventListener('click', event => {
            const chip = event.target.closest('[data-monster]');
            if (chip) this.openMonster(Number(chip.dataset.monster));
        });
        $('heroes').addEventListener('click', event => {
            const chip = event.target.closest('[data-seat]');
            if (!chip) return;
            this.focus = Number(chip.dataset.seat);
            music.play('select');
            this.render();
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('[data-act]');
            if (button && !button.disabled) this.doAct(button.dataset.act);
        });
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && this.sheetKind !== 'prompt') this.closeSheet();
        });
        $('sheet').addEventListener('click', event => {
            const item = event.target.closest('[data-i]');
            if (item && !item.disabled && this.sheetHandlers) this.sheetHandlers[Number(item.dataset.i)]?.();
        });
    }

    send(seat, command) {
        const ok = this.controller?.send(seat, command) ?? false;
        if (ok && !this.view?.result) music.play(COMMAND_SOUND[command.type] ?? 'place');
        return ok;
    }

    can(seat) { return !!this.controller?.canControl(seat); }

    // 自分が動かす英雄のアクションの番か
    isMyActions(v = this.view) {
        return !!v && v.phase === 'actions' && !v.prompt && !v.result && this.can(v.current)
            && !(this.controller?.mode === 'team' && v.players[v.current].isCPU);
    }

    me(v = this.view) { return v.players[v.current]; }

    update() {
        const v = this.controller?.getView();
        if (!v) return;
        const prev = this.view;
        this.view = v;
        if (prev && prev.logTotal !== v.logTotal) this.afterChange(prev, v);
        if (this.hint && this.hint.at !== hintKey(v)) this.hint = null;
        if (this.focus === null || this.focus >= v.players.length) this.focus = v.current;
        else if (!prev || prev.current !== v.current) this.focus = v.current;
        if (this.pick && !this.isMyActions(v)) this.setPick(null);
        this.render();
        if (prev) this.animateChanges(prev, v);
        this.openPrompt(v);
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            this.cancelResult = Motion.afterIdle(() => this.openResult(), 900);
        }
    }

    // 描き直したあと：前のビューとの差を動かす（英雄・怪物・村人は地点から地点へ滑り、置かれたアイテム・拾ったアイテム・現れた村人は弾み、恐怖と山札は目立つ）
    animateChanges(prev, v) {
        if (!Motion.enabled() || prev.turnNo === undefined) return;
        const map = $('map');
        const slide = (selector, from, to, id) => {
            const [ox, oy] = from.get(id) ?? [];
            const [nx, ny] = to.get(id) ?? [];
            if (ox === undefined || nx === undefined || (Math.abs(ox - nx) < 0.5 && Math.abs(oy - ny) < 0.5)) return;
            const length = Motion.ms(SLIDE_MS);
            const animation = map.querySelector(selector)?.animate([
                { transform: `translate(${ox - nx}px, ${oy - ny}px)` },
                { transform: `translate(${(ox - nx) / 2}px, ${(oy - ny) / 2 - 12}px)`, offset: 0.5 },
                { transform: 'translate(0, 0)' }
            ], { duration: length, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
            if (animation) Motion.track(animation, length);
        };
        const heroes = [heroPositions(prev), heroPositions(v)];
        v.players.forEach(p => slide(`.hslot[data-hero="${p.id}"]`, ...heroes, p.id));
        const monsters = [monsterPositions(prev), monsterPositions(v)];
        v.monsters.forEach((_, i) => slide(`.mslot[data-mon="${i}"]`, ...monsters, i));
        const villagers = [villagerPositions(prev), villagerPositions(v)];
        v.villagers.forEach((at, id) => {
            if (at === null) return;
            if (prev.villagers[id] === null) Motion.popIn(map.querySelector(`.vslot[data-vil="${id}"]`), { duration: 360 });
            else slide(`.vslot[data-vil="${id}"]`, ...villagers, id);
        });
        v.board.forEach((items, at) => {
            const gained = items.length - prev.board[at].length;
            if (gained <= 0) return;
            const marks = map.querySelectorAll(`.m-loc[data-loc="${at}"] .m-item`);
            [...marks].slice(-gained).forEach((el, i) => Motion.popIn(el, { duration: 340, delay: 100 + i * 80 }));
        });
        const mine = v.players[this.focus]?.items.length ?? 0;
        const had = prev.players[this.focus]?.items.length ?? 0;
        if (mine > had) [...$('items').querySelectorAll('.item')].slice(-(mine - had)).forEach(el => Motion.popIn(el, { duration: 320 }));
        if (v.terror !== prev.terror) Motion.pulse($('terror'), { duration: 380, scale: 1.25 });
        if (v.deckCount !== prev.deckCount) Motion.pulse($('deck'), { duration: 380, scale: 1.25 });
        v.monsters.forEach((m, i) => {
            if (m.defeated !== prev.monsters[i]?.defeated || m.progress !== prev.monsters[i]?.progress) Motion.pulse($('monsters').children[i], { duration: 380, scale: 1.12 });
        });
    }

    afterChange(prev, v) {
        // 怪物の番が来たら、起きたことをまとめて見せる
        const fresh = v.logs.filter(l => l.n > prev.logTotal);
        const start = fresh.findIndex(l => l.head && l.text.startsWith('怪物の番'));
        if (start >= 0) {
            const lines = [];
            for (const l of fresh.slice(start)) {
                if (lines.length && l.head && l.text.endsWith('の手番')) break;
                lines.push(l);
            }
            this.showNews(v, lines);
        }
        if (v.result) {
            if (!prev.result) {
                music.play(v.result.won ? 'win' : 'lose');
                // ローカル対戦の結果を、ログインしていれば記録する（オンライン対戦はサーバーが記録する）
                // 1台で複数の人が操作するとき（人が2人以上）は、誰の記録か分からないので送らない
                const seed = this.controller?.game?.options.seed;
                const humans = this.controller?.game?.players.filter(p => !p.isCPU).length;
                if (!this.controller?.isOnline && humans === 1 && seed !== undefined) recordResult({ game: 'horrified', id: `horrified-${seed}`, outcome: v.result.won ? 'win' : 'loss' });
            }
            return;
        }
        const mine = this.isMyActions(v) && (prev.current !== v.current || !this.isMyActions(prev));
        if (mine) music.play('turn');
        else if (!this.isMyActions(v) || start >= 0) music.play(fresh.some(l => l.text.includes('を襲います')) ? 'dice' : 'notify');
    }

    showNews(v, lines) {
        if (!lines.length) return;
        const card = v.card !== null ? MONSTER_CARDS[v.card] : null;
        const icons = card ? card.strike.icons.map(k => (k === 'frenzy' ? '<span class="frenzy-icon" title="狂乱">狂</span>' : badgeSvg(k, v.monsters.some(m => m.key === k && !m.defeated) ? '' : 'off'))).join('') : '';
        const head = card ? `<div class="news-head">${icons}<span>${card.strike.steps}歩・ダイス${card.strike.dice}</span></div>` : '';
        $('news').innerHTML = head + lines.slice(1).map(l => `<p class="${l.head ? 'head' : ''}">${esc(l.text)}</p>`).join('');
        $('news').hidden = false;
        clearTimeout(this.newsTimer);
        this.newsTimer = setTimeout(() => { $('news').hidden = true; }, 5200);
    }

    render() {
        const v = this.view;
        if (!v) return;
        const mine = this.isMyActions(v);
        const p = this.me(v);
        const best = this.hint?.at === hintKey(v) ? this.hint.command : null;

        // 恐怖と山札
        $('terror').innerHTML = `<span class="mk">恐怖</span>${Array.from({ length: TERROR_MAX }, (_, i) => `<i class="${i < v.terror ? 'on' : ''}"></i>`).join('')}`;
        $('terror').classList.toggle('warn', v.terror >= TERROR_MAX - 2);
        $('deck').innerHTML = `<span class="mk">山札</span><b>${v.deckCount}</b>`;
        $('deck').classList.toggle('warn', v.deckCount <= 5);

        // 怪物
        $('monsters').innerHTML = v.monsters.map((m, i) => `<button type="button" class="mon ${m.defeated ? 'gone' : ''} ${i === v.frenzy && !m.defeated ? 'frenzy' : ''} ${m.done && !m.defeated ? 'ready' : ''}" data-monster="${i}">`
            + `${badgeSvg(m.key)}<span class="mon-name">${MONSTER[m.key].name}</span><span class="mon-task">${taskShort(m)}</span></button>`).join('');

        // 地図
        const targets = mine && v.actionsLeft > 0 ? NEIGHBORS[p.loc] : [];
        const pickLocs = this.pick?.locs ?? null;
        let bestLoc = null;
        if (best && ['move', 'special'].includes(best.type)) bestLoc = best.to;
        if (best?.type === 'perk' && best.to !== undefined) bestLoc = best.to;
        $('map').innerHTML = mapSvg(v, { targets: pickLocs ?? targets, best: bestLoc });

        // 手番の英雄
        const status = v.result ? (v.result.won ? '勝利！' : '敗北……')
            : v.prompt ? (v.prompt.type === 'target' ? `${esc(v.players[v.prompt.seat].name)}が標的を選びます` : `${esc(v.players[v.prompt.seat].name)}が防ぐかを選びます`)
                : v.phase === 'monster' ? '怪物の番' : `残り${v.actionsLeft}アクション${v.skipMonster ? '・夜明け' : ''}`;
        $('who').innerHTML = `${heroDot(p.hero)}<b>${esc(p.name)}</b><span class="role">${HERO[p.hero].name}</span><span class="state">${status}</span>`;

        // 英雄の一覧
        $('heroes').innerHTML = v.players.map(q => `<button type="button" class="hero-chip ${q.id === v.current ? 'current' : ''} ${q.id === this.focus ? 'focus' : ''}" data-seat="${q.id}">`
            + `${heroDot(q.hero)}<span class="hn">${esc(q.name)}</span><span class="hc">${q.items.length}</span></button>`).join('');

        // 見ている英雄の持ち物
        const f = v.players[this.focus] ?? p;
        const perks = f.perks.map(id => `<span class="perk-chip">${PERK[PERK_CARDS[id].key].name}</span>`).join('');
        $('items').innerHTML = (f.items.length ? f.items.map(id => itemChip(id)).join('') : '<span class="empty">アイテムなし</span>') + perks;

        // 操作
        const acts = this.availableActs(v);
        document.querySelectorAll('#actions [data-act]').forEach(b => {
            b.disabled = !mine || !acts[b.dataset.act];
            b.classList.toggle('recommended', !!best && this.actOf(best) === b.dataset.act);
        });
        $('hint').hidden = !this.controller || !!v.result || Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        $('assist').hidden = !this.controller || !!v.result || Boolean(this.controller.isOnline) || this.controller.mode === 'team';
        $('hint').disabled = !v.actors.some(s => this.can(s));
        $('assist').disabled = !v.actors.some(s => this.can(s));
    }

    // おすすめの手が、どのボタンの操作か
    actOf(command) {
        if (command.type === 'move') return null;
        return command.type;
    }

    // ---- 操作の候補 ----

    guideOptions(v) {
        const p = this.me(v);
        const out = [];
        v.villagers.forEach((at, k) => {
            if (at === null) return;
            if (at === p.loc) NEIGHBORS[p.loc].forEach(to => out.push({ villager: k, from: at, to }));
            else if (NEIGHBORS[p.loc].includes(at)) out.push({ villager: k, from: at, to: p.loc });
        });
        return out;
    }

    pickupSources(v) {
        const p = this.me(v);
        const out = v.board[p.loc].length ? [p.loc] : [];
        if (p.hero === 'archaeologist') NEIGHBORS[p.loc].forEach(n => { if (v.board[n].length) out.push(n); });
        return out;
    }

    advanceMonsters(v) {
        const p = this.me(v);
        return v.monsters.map((m, i) => ({ m, i })).filter(({ m }) => {
            if (m.defeated || m.done) return false;
            const def = MONSTER[m.key];
            if (m.key === 'vampire') return def.coffins.some((l, k) => l === p.loc && !m.task[k]);
            return p.loc === def.at;
        });
    }

    defeatMonsters(v) {
        const p = this.me(v);
        return v.monsters.map((m, i) => ({ m, i })).filter(({ m }) => !m.defeated && m.done && m.loc === p.loc);
    }

    availableActs(v) {
        const p = this.me(v);
        const has = v.actionsLeft > 0;
        const freeGuide = p.hero === 'inspector' && !v.guideUsed;
        return {
            pickup: has && this.pickupSources(v).length > 0,
            guide: (has || freeGuide) && this.guideOptions(v).length > 0,
            share: has && v.players.some(q => q.id !== p.id && q.loc === p.loc),
            advance: has && this.advanceMonsters(v).length > 0 && p.items.length > 0,
            defeat: has && this.defeatMonsters(v).length > 0 && p.items.length > 0,
            special: has && p.hero === 'courier' && v.players.some(q => q.id !== p.id && q.loc !== p.loc),
            perk: p.perks.length > 0,
            end: true
        };
    }

    doAct(act) {
        const v = this.view;
        if (!this.isMyActions(v)) return;
        const p = this.me(v);
        music.play('select');
        switch (act) {
            case 'pickup': {
                const sources = this.pickupSources(v);
                if (sources.length === 1) return void this.send(p.id, { type: 'pickup', from: sources[0] });
                return this.openList('拾う', sources.map(at => ({
                    html: `<b>${LOCATIONS[at].name}</b> ${v.board[at].map(id => itemChip(id, 'mini')).join('')}`,
                    run: () => this.send(p.id, { type: 'pickup', from: at })
                })));
            }
            case 'guide':
                return this.openList('案内', this.guideOptions(v).map(o => ({
                    html: `<b>${VILLAGERS[o.villager].name}</b>：${LOCATIONS[o.from].name} → ${LOCATIONS[o.to].name}<small>家は${LOCATIONS[VILLAGERS[o.villager].home].name}${DIST[o.to][VILLAGERS[o.villager].home] < DIST[o.from][VILLAGERS[o.villager].home] ? '（近づく）' : ''}</small>`,
                    run: () => this.send(p.id, { type: 'guide', villager: o.villager, to: o.to })
                })));
            case 'share': {
                const others = v.players.filter(q => q.id !== p.id && q.loc === p.loc);
                if (others.length === 1) return this.openShare(others[0].id);
                return this.openList('共有する相手', others.map(q => ({ html: `${heroDot(q.hero)}<b>${esc(q.name)}</b>（${HERO[q.hero].name}）`, run: () => this.openShare(q.id) })));
            }
            case 'advance': {
                const list = this.advanceMonsters(v);
                if (list.length === 1) return this.openUse('advance', list[0].i);
                return this.openList('前進する怪物', list.map(({ m, i }) => ({ html: `${badgeSvg(m.key)}<b>${MONSTER[m.key].name}</b>`, run: () => this.openUse('advance', i) })));
            }
            case 'defeat': {
                const list = this.defeatMonsters(v);
                if (list.length === 1) return this.openUse('defeat', list[0].i);
                return this.openList('退治する怪物', list.map(({ m, i }) => ({ html: `${badgeSvg(m.key)}<b>${MONSTER[m.key].name}</b>`, run: () => this.openUse('defeat', i) })));
            }
            case 'special': {
                const locs = [...new Set(v.players.filter(q => q.id !== p.id && q.loc !== p.loc).map(q => q.loc))];
                return this.openList('駆けつける', locs.map(at => ({
                    html: `<b>${LOCATIONS[at].name}</b>（${v.players.filter(q => q.loc === at).map(q => esc(q.name)).join('・')}）`,
                    run: () => this.send(p.id, { type: 'special', to: at })
                })));
            }
            case 'perk':
                return this.openPerks();
            case 'end':
                return void this.send(p.id, { type: 'end' });
        }
    }

    // 前進・退治で使うアイテムを選ぶ
    openUse(kind, index) {
        const v = this.view;
        const p = this.me(v);
        const m = v.monsters[index];
        const def = MONSTER[m.key];
        let colors;
        let need;
        let note;
        if (kind === 'defeat') {
            colors = [def.defeat.color];
            need = def.defeat.total;
            note = `${COLOR_NAMES[def.defeat.color]}の合計${need}以上`;
        } else if (m.key === 'mummy') {
            colors = COLORS.filter((_, k) => !m.task[k]);
            need = def.need.total;
            note = `まだの封印の色（${colors.map(c => COLOR_NAMES[c]).join('・')}）を1色、合計${need}以上`;
        } else if (m.key === 'invisible') {
            colors = COLORS;
            need = 0;
            note = `出どころの違うアイテムを、あと${m.total - m.progress}つまで（出どころ：${[...new Set(m.task)].map(l => LOCATIONS[l].name).join('・') || 'まだなし'}）`;
        } else {
            colors = [def.need.color];
            need = def.need.total;
            note = `${COLOR_NAMES[def.need.color]}の合計${need}以上`;
        }
        const ids = p.items.filter(id => colors.includes(ITEMS[id].color));
        const bonus = p.hero === 'scientist' && !v.bonusUsed ? 1 : 0;
        let selected = new Set();
        if (m.key !== 'invisible') {
            for (const c of colors) {
                const set = minimalSet(ids.filter(id => ITEMS[id].color === c), need - bonus);
                if (set && set.length) {
                    selected = new Set(set);
                    break;
                }
            }
        }
        const title = `${def.name}を${kind === 'defeat' ? '退治' : '前進'}`;
        const draw = () => {
            const total = [...selected].reduce((s, id) => s + ITEMS[id].strength, 0);
            const body = `<p class="note">${note}${bonus ? '（科学者の+1あり）' : ''}</p>`
                + `<div class="pick-items">${ids.map((id, i) => `<button type="button" class="item-btn ${selected.has(id) ? 'on' : ''}" data-i="${i}">${itemChip(id)}<small>${LOCATIONS[ITEMS[id].at].name}</small></button>`).join('')}</div>`
                + `<p class="total">${m.key === 'invisible' ? `${selected.size}つ` : `合計 ${total}${bonus ? `（+1で${total + 1}）` : ''}`}</p>`;
            this.openSheet('use', title, body, [
                { label: kind === 'defeat' ? '退治する' : '使う', primary: true, disabled: !selected.size, run: () => this.send(p.id, { type: kind, monster: index, items: [...selected] }) },
                { label: 'やめる', run: () => {} }
            ], ids.map(id => () => {
                if (selected.has(id)) selected.delete(id);
                else selected.add(id);
                music.play('select');
                draw();
            }));
        };
        if (!ids.length) return this.toast('使えるアイテムを持っていません');
        draw();
    }

    openShare(other) {
        const v = this.view;
        const p = this.me(v);
        const q = v.players[other];
        const give = new Set();
        const take = new Set();
        const list = [...p.items.map(id => ({ id, mine: true })), ...q.items.map(id => ({ id, mine: false }))];
        const draw = () => {
            const row = (x, i) => `<button type="button" class="item-btn ${(x.mine ? give : take).has(x.id) ? 'on' : ''}" data-i="${i}">${itemChip(x.id)}</button>`;
            const body = `<p class="note">押したアイテムを渡し合います（1アクション）</p>`
                + `<h4>${esc(p.name)}から渡す</h4><div class="pick-items">${list.map((x, i) => (x.mine ? row(x, i) : '')).join('') || '<span class="empty">なし</span>'}</div>`
                + `<h4>${esc(q.name)}から受け取る</h4><div class="pick-items">${list.map((x, i) => (!x.mine ? row(x, i) : '')).join('') || '<span class="empty">なし</span>'}</div>`;
            this.openSheet('use', '共有', body, [
                { label: '渡し合う', primary: true, disabled: !give.size && !take.size, run: () => this.send(p.id, { type: 'share', with: other, give: [...give], take: [...take] }) },
                { label: 'やめる', run: () => {} }
            ], list.map(x => () => {
                const set = x.mine ? give : take;
                if (set.has(x.id)) set.delete(x.id);
                else set.add(x.id);
                music.play('select');
                draw();
            }));
        };
        draw();
    }

    openPerks() {
        const v = this.view;
        const p = this.me(v);
        this.openList('特典', p.perks.map(id => {
            const perk = PERK[PERK_CARDS[id].key];
            return {
                html: `<b>${perk.name}</b><small>${perk.text}</small>`,
                run: () => {
                    if (perk.key === 'hurry') {
                        const locs = LOCATIONS.map((_, l) => l).filter(l => DIST[p.loc][l] >= 1 && DIST[p.loc][l] <= 2);
                        this.setPick({ text: '急ぎ足：行き先を選ぶ', locs, onPick: (to) => this.send(p.id, { type: 'perk', card: id, to }) });
                    } else if (perk.key === 'search') {
                        const all = v.board.flatMap((list, at) => list.map(item => ({ item, at })));
                        if (!all.length) return this.toast('村にアイテムがありません');
                        this.openList('探し物', all.map(x => ({ html: `${itemChip(x.item)}<small>${LOCATIONS[x.at].name}</small>`, run: () => this.send(p.id, { type: 'perk', card: id, item: x.item }) })));
                    } else this.send(p.id, { type: 'perk', card: id });
                }
            };
        }));
    }

    tapLoc(at) {
        const v = this.view;
        if (!v) return;
        if (this.pick) {
            if (this.pick.locs.includes(at)) {
                const run = this.pick.onPick;
                this.setPick(null);
                run(at);
            }
            return;
        }
        if (this.isMyActions(v) && v.actionsLeft > 0 && NEIGHBORS[this.me(v).loc].includes(at)) {
            const p = this.me(v);
            const here = v.villagers.map((l, k) => (l === p.loc ? k : -1)).filter(k => k >= 0);
            if (!here.length) return void this.send(p.id, { type: 'move', to: at });
            const closer = here.filter(k => DIST[at][VILLAGERS[k].home] < DIST[p.loc][VILLAGERS[k].home]);
            return this.openSheet('move', `${LOCATIONS[at].name}へ移動`, `<p class="note">${here.map(k => `${VILLAGERS[k].name}（家は${LOCATIONS[VILLAGERS[k].home].name}）`).join('・')}がいます</p>`, [
                { label: '連れて行く', primary: true, run: () => this.send(p.id, { type: 'move', to: at, villagers: closer.length ? closer : here }) },
                { label: '1人で行く', run: () => this.send(p.id, { type: 'move', to: at }) }
            ]);
        }
        this.openLocation(at);
    }

    openLocation(at) {
        const v = this.view;
        const heroes = v.players.filter(p => p.loc === at);
        const mons = v.monsters.filter(m => !m.defeated && m.loc === at);
        const vs = v.villagers.map((l, k) => (l === at ? k : -1)).filter(k => k >= 0);
        const homes = VILLAGERS.map((x, k) => (x.home === at ? x.name : null)).filter(Boolean);
        const tasks = v.monsters.filter(m => !m.defeated && !m.done && (m.key === 'vampire' ? MONSTER.vampire.coffins.some((l, k) => l === at && !m.task[k]) : MONSTER[m.key].at === at));
        const body = [
            mons.length ? `<p>${mons.map(m => `${badgeSvg(m.key)}${MONSTER[m.key].name}`).join(' ')}</p>` : '',
            heroes.length ? `<p>${heroes.map(p => `${heroDot(p.hero)}${esc(p.name)}`).join(' ')}</p>` : '',
            vs.length ? `<p>村人：${vs.map(k => `${VILLAGERS[k].name}（家は${LOCATIONS[VILLAGERS[k].home].name}）`).join('・')}</p>` : '',
            v.board[at].length ? `<div class="pick-items">${v.board[at].map(id => itemChip(id)).join('')}</div>` : '<p class="note">アイテムなし</p>',
            tasks.length ? `<p class="note">${tasks.map(m => (m.key === 'vampire' ? '吸血鬼の棺がある' : `${MONSTER[m.key].name}の目的の地点`)).join('・')}</p>` : '',
            homes.length ? `<p class="note">${homes.join('・')}の家</p>` : ''
        ].join('');
        this.openSheet('info', LOCATIONS[at].name, body, [{ label: '閉じる', run: () => {} }]);
    }

    openMonster(i) {
        const v = this.view;
        const m = v.monsters[i];
        const def = MONSTER[m.key];
        const sp = SPECIAL_EVENTS[m.key];
        const body = `<p>${badgeSvg(m.key, 'big')}${m.defeated ? '退治しました' : `${LOCATIONS[m.loc].name}にいます${i === v.frenzy ? '（狂乱）' : ''}`}</p>`
            + `<p><b>目的</b>：${def.task}（${m.progress}/${m.total}）</p>`
            + `<p><b>退治</b>：怪物のいる地点で、${COLOR_NAMES[def.defeat.color]}の合計${def.defeat.total}以上</p>`
            + `<p><b>力</b>：${def.power}</p><p class="note">できごと「${sp.name}」：${sp.text}</p>`;
        this.openSheet('info', def.name, body, [{ label: '閉じる', run: () => {} }]);
    }

    // 怪物の番の選択（標的・防御）。動かせる人のときだけ出す
    openPrompt(v) {
        const pr = v.prompt;
        if (!pr || v.result || !this.can(pr.seat) || (this.controller?.mode === 'team' && v.players[pr.seat].isCPU)) {
            if (this.sheetKind === 'prompt') this.closeSheet();
            return;
        }
        const key = `${v.logTotal}:${pr.type}`;
        if (this.answered === key || this.sheetKind === 'prompt') return;
        const m = v.monsters[pr.monster];
        const name = MONSTER[m.key].name;
        const answer = (command) => {
            this.answered = key;
            this.closeSheet();
            this.send(pr.seat, command);
        };
        if (pr.type === 'target') {
            this.openSheet('prompt', `${name}の標的`, `<p class="note">${LOCATIONS[m.loc].name}で、${name}が襲います（ダイス${pr.dice}）。誰が狙われるかを選びます</p>`,
                pr.options.map((o, i) => ({
                    label: o.kind === 'hero' ? `${v.players[o.id].name}（アイテム${v.players[o.id].items.length}）` : VILLAGERS[o.id].name,
                    primary: i === 0,
                    run: () => answer({ type: 'target', choice: i })
                })), null, { keep: true });
            return;
        }
        const p = v.players[pr.seat];
        const selected = new Set([...p.items].sort((a, b) => ITEMS[a].strength - ITEMS[b].strength).slice(0, pr.hits));
        const draw = () => {
            const body = `<p class="note">${name}の命中が${pr.hits}つ。${pr.hits}つのアイテムを捨てて防ぐか、防がずに病院へ運ばれるか（恐怖+1）</p>`
                + `<div class="pick-items">${p.items.map((id, i) => `<button type="button" class="item-btn ${selected.has(id) ? 'on' : ''}" data-i="${i}">${itemChip(id)}</button>`).join('')}</div>`;
            this.openSheet('prompt', `${esc(p.name)}が襲われた`, body, [
                { label: `${pr.hits}つ捨てて防ぐ`, primary: true, disabled: selected.size !== pr.hits, run: () => answer({ type: 'defend', items: [...selected] }) },
                { label: '防がない', run: () => answer({ type: 'defend', items: [] }) }
            ], p.items.map(id => () => {
                if (selected.has(id)) selected.delete(id);
                else if (selected.size < pr.hits) selected.add(id);
                music.play('select');
                draw();
            }), { keep: true });
        };
        draw();
    }

    // ---- ヒント ----

    showHint() {
        const v = this.view;
        const h = this.controller?.suggest();
        if (!v || !h) return;
        this.hint = { at: hintKey(v), ...h };
        music.play('select');
        this.toast(`おすすめ：${this.hintText(v, h.seat, h.command)}`);
        this.render();
    }

    hintText(v, seat, c) {
        const p = v.players[seat];
        switch (c.type) {
            case 'move': return `${LOCATIONS[c.to].name}へ移動${c.villagers?.length ? '（村人を連れて）' : ''}`;
            case 'guide': return `${VILLAGERS[c.villager].name}を${LOCATIONS[c.to].name}へ案内`;
            case 'pickup': return `${LOCATIONS[c.from ?? p.loc].name}のアイテムを拾う`;
            case 'share': return `${v.players[c.with].name}と共有（${(c.give ?? c.take ?? []).map(itemText).join('・')}）`;
            case 'advance': return `${MONSTER[v.monsters[c.monster].key].name}の目的を進める（${c.items.map(itemText).join('・')}）`;
            case 'defeat': return `${MONSTER[v.monsters[c.monster].key].name}を退治（${c.items.map(itemText).join('・')}）`;
            case 'special': return `${LOCATIONS[c.to].name}へ駆けつける`;
            case 'perk': return `特典「${PERK[PERK_CARDS[c.card].key].name}」を使う${c.to !== undefined ? `（${LOCATIONS[c.to].name}へ）` : ''}`;
            case 'end': return '手番を終える';
            case 'target': return `標的は${(o => (o.kind === 'hero' ? v.players[o.id].name : VILLAGERS[o.id].name))(v.prompt.options[c.choice])}`;
            case 'defend': return c.items.length ? `${c.items.map(itemText).join('・')}を捨てて防ぐ` : '防がない';
            default: return '';
        }
    }

    // ---- シート ----

    setPick(pick) {
        this.pick = pick;
        $('pick-banner').hidden = !pick;
        if (pick) {
            $('pick-text').textContent = pick.text;
            this.closeSheet();
        }
        if (this.view) this.render();
    }

    openList(title, rows) {
        this.openSheet('list', title, `<div class="rows">${rows.map((r, i) => `<button type="button" class="row" data-i="${i}">${r.html}</button>`).join('')}</div>`,
            [{ label: 'やめる', run: () => {} }],
            rows.map(r => () => {
                this.closeSheet();
                r.run();
            }));
    }

    // buttons: [{ label, primary, disabled, run }]。handlers: シートの中の [data-i] を押したとき
    openSheet(kind, title, bodyHtml, buttons = [], handlers = null, { keep = false } = {}) {
        this.sheetKind = kind;
        this.sheetHandlers = handlers;
        $('sheet-title').innerHTML = title;
        $('sheet-body').innerHTML = bodyHtml;
        $('sheet-buttons').innerHTML = '';
        buttons.forEach(b => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = `btn ${b.primary ? 'primary' : 'secondary'}`;
            el.textContent = b.label;
            el.disabled = !!b.disabled;
            if (b.id) el.id = b.id;
            el.addEventListener('click', () => {
                if (!keep) this.closeSheet();
                b.run();
            });
            $('sheet-buttons').appendChild(el);
        });
        $('overlay').hidden = false;
    }

    closeSheet() {
        this.sheetKind = null;
        this.sheetHandlers = null;
        $('overlay').hidden = true;
    }

    openHelp() {
        this.openSheet('help', '遊び方', `<div class="help" id="help">${HELP_HTML}</div>`, [{ label: '閉じる', run: () => {} }]);
        $('sheet-body').scrollTop = 0;
    }

    openLog() {
        const v = this.view;
        if (!v) return;
        const lines = v.logs.slice(-150).reverse().map(l => `<p class="${l.head ? 'head' : ''}">${esc(l.text)}</p>`).join('');
        this.openSheet('log', '記録', `<div class="log" id="log">${lines}</div>`, [{ label: '閉じる', run: () => {} }]);
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        $('news').hidden = true;
        const reason = { won: 'すべての怪物を退治しました', terror: '恐怖が限界に達しました', deck: '怪物カードが尽きました' }[v.result.reason];
        const body = `<p class="result-reason">${reason}</p>`
            + `<div class="result-mons">${v.monsters.map(m => `<span class="${m.defeated ? 'done' : ''}">${badgeSvg(m.key)}${MONSTER[m.key].name}${m.defeated ? ' 退治' : ''}</span>`).join('')}</div>`
            + `<p class="note">恐怖 ${v.terror}/${TERROR_MAX}・残りの山札 ${v.deckCount}枚</p>`;
        this.openSheet('result', v.result.won ? '勝利！' : '敗北……', body, [
            { label: 'もう一度', primary: true, id: 'again', run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
            { label: 'ホーム', id: 'result-home', run: () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()) }
        ]);
    }

    toast(text) {
        const el = $('toast');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }
}
