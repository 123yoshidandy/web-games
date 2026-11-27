/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 * 島のマスを押すと移動する。「補強」「特技」や特別なカードを選ぶと、押せる場所が光り、押すとその操作になる
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS, END_REASONS, FLOODED } from './game.js';
import { TILES, TREASURES, TREASURE_KEYS, ROLE, LEVELS, SPECIALS, MAX_WATER, FLOOD_RATES, HAND_LIMIT, FOOLS, isTreasureCard, cardName } from './data.js';
import { islandHtml, titleArtHtml, treasureIcon, pawnHtml, viewGame } from './board.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席だけを動かす。ヒントと待ったはない
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
        canUndo: () => false,
        undo: () => false,
        scheduleCpu() {},
        stop: () => net.stop()
    };
}

// 自分の操作の音（コマンドの種類ごと）
const COMMAND_SOUND = {
    move: 'place', fly: 'place', navigate: 'place', swim: 'place', heli: 'place', shore: 'place', sand: 'place',
    give: 'pay', discard: 'pay', capture: 'gain', draw: 'draw', flood: 'draw', pass: 'select'
};
const STEP_DELAY_MS = 900;   // 「引く」「浸水」を自動で進めるまでの間

const SETTINGS_KEY = 'forbidden-island.settings';
const CPU_NAMES = ['ハル', 'ミナ', 'ソラ'];
const LEVEL_KEYS = Object.keys(LEVELS);
// ヒントが指す場面（手を打つと変わる）
const hintKey = (v) => JSON.stringify([v.logTotal, v.phase, v.actionsLeft, v.current, v.players.map(p => `${p.tile}:${p.hand.length}`)]);

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    undo: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>'
};

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 2,
            level: Object.hasOwn(LEVELS, s.level) ? s.level : 'novice',
            mode: s.mode === 'all' ? 'all' : 'team'
        };
    } catch {
        return { count: 2, level: 'novice', mode: 'team' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 手札の1枚（宝は色と印、特別なカードは文字）
const cardHtml = (card, extra = '') => {
    if (isTreasureCard(card)) {
        const k = TREASURE_KEYS.indexOf(card);
        return `<span class="card tr ${extra}" style="--tc:${TREASURES[k].color}" data-card="${card}" title="${TREASURES[k].name}">${treasureIcon(k)}</span>`;
    }
    return `<span class="card sp ${card} ${extra}" data-card="${card}" title="${SPECIALS[card].name}">${card === 'heli' ? 'ヘリ' : '土のう'}</span>`;
};

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.pick = null;         // 島で場所を選んでいるとき：{ kind, text, targets: Set, chosen: Set, onPick }
        this.sheetKind = null;    // 開いているシートの種類（discard は段階に合わせて開き直す）
        this.resultShown = false;
        this.newsFrom = 0;
        this.flash = new Set();
        ['home', 'open-help-game', 'open-log', 'undo'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log', undo: 'undo' }[id]];
        });
        $('title-art').innerHTML = titleArtHtml();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: '禁断の島',
            game: 'forbidden-island',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [{ key: 'level', label: '難易度', options: LEVEL_KEYS.map(value => ({ value, label: LEVELS[value].name })) }],
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
        seg('count', 'count', Number);
        seg('level', 'level');
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
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.stepTimer);
        this.closeSheet();
        this.setPick(null);
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        this.renderTitle();
    }

    start() {
        const { count, level, mode } = this.settings;
        const players = Array.from({ length: count }, (_, i) => (mode === 'team'
            ? { name: i === 0 ? 'あなた' : CPU_NAMES[i - 1], isCPU: i > 0 }
            : { name: `${i + 1}P`, isCPU: false }));
        clearSavedGame();
        this.startWith({ players, options: { level }, mode });
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
        this.newsFrom = 0;
        this.hint = null;
        this.closeSheet();
        this.setPick(null);
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.update();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('decks').addEventListener('click', () => this.openDecks());
        $('hint').addEventListener('click', () => this.showHint());
        $('undo').addEventListener('click', () => {
            if (this.controller?.undo()) {
                music.play('cancel');
                this.setPick(null);
            }
        });
        $('pick-cancel').addEventListener('click', () => {
            music.play('cancel');
            this.setPick(null);
        });
        $('pick-done').addEventListener('click', () => this.pick?.onDone?.());
        $('island').addEventListener('click', event => {
            const el = event.target.closest('[data-tile]');
            if (el) this.tapTile(Number(el.dataset.tile));
        });
        $('team').addEventListener('click', event => {
            const card = event.target.closest('[data-card]');
            const row = event.target.closest('[data-seat]');
            if (card && row) this.tapCard(Number(row.dataset.seat), card.dataset.card);
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('[data-act]');
            if (button && !button.disabled) this.doAct(button.dataset.act);
        });
        $('step-btn').addEventListener('click', () => this.sendStep());
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && this.sheetKind !== 'discard') this.closeSheet();
        });
        $('sheet').addEventListener('click', event => {
            const item = event.target.closest('[data-i]');
            if (item && !item.disabled && this.sheetHandlers) this.sheetHandlers[Number(item.dataset.i)]?.();
        });
    }

    send(seat, command) {
        this.sending = true;
        const ok = this.controller?.send(seat, command) ?? false;
        this.sending = false;
        // 脱出は、結果が届いたときの勝ちの音だけにする（オンラインでは結果があとから届く）
        if (ok && !this.view?.result && command.type !== 'liftoff') music.play(COMMAND_SOUND[command.type] ?? 'place');
        return ok;
    }

    can(seat) {
        return !!this.controller?.canControl(seat);
    }

    // 自分が動かせる人のアクションの段階か
    isMyActions() {
        const v = this.view;
        return v && v.phase === 'actions' && this.can(v.current);
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        const prev = this.view;
        this.view = v;
        if (this.pick && !this.pickStillValid(v, prev)) this.setPick(null);
        this.flash = new Set(prev && prev.logTotal !== v.logTotal ? v.flooded : []);
        this.render();
        this.playUpdateSound(prev);
        // 割り込み（捨てる・泳ぐ）
        const discarder = v.phase === 'discard' ? v.actors.find(s => this.can(s)) : undefined;
        if (discarder !== undefined) this.openDiscard(discarder);
        else if (this.sheetKind === 'discard') this.closeSheet();
        if (v.phase === 'swim' && this.can(v.actors[0]) && this.pick?.kind !== 'swim') this.startSwim(v.actors[0]);
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            this.setPick(null);
            this.recordLocalResult(v);
            setTimeout(() => this.openResult(), 700);
        }
        this.scheduleStep();
    }

    // 選んでいる途中で局面が変わったら、選ぶのをやめる（特別なカードは、手番が変わっても続ける）
    pickStillValid(v, prev) {
        if (!prev) return false;
        if (this.pick.kind === 'swim') return v.phase === 'swim';
        if (['sand', 'heli'].includes(this.pick.kind)) return v.phase !== 'end' && v.phase !== 'swim';
        return v.phase === 'actions' && v.current === prev.current && v.actionsLeft === prev.actionsLeft;
    }

    // 自分が押す番の「引く」「浸水」は、少し待って自動で押す（シートや選ぶ途中は待つ）
    scheduleStep() {
        clearTimeout(this.stepTimer);
        const v = this.view;
        if (!v || v.result || !['draw', 'flood'].includes(v.phase) || !this.can(v.current)) return;
        if (this.controller.mode === 'team' && v.players[v.current].isCPU) return;
        this.stepTimer = setTimeout(() => {
            if (!$('overlay').hidden || this.pick || this.controller?.awaitingResponse) {
                this.scheduleStep();
                return;
            }
            this.sendStep();
        }, STEP_DELAY_MS);
    }

    sendStep() {
        const v = this.view;
        const type = { draw: 'draw', flood: 'flood' }[v?.phase];
        if (type && this.can(v.current)) this.send(v.current, { type });
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。ほかの人の手は知らせ、自分のアクションの番になったらチャイム
    playUpdateSound(prev) {
        const v = this.view;
        if (!prev) return;
        if (v.result) {
            if (!prev.result) music.play(v.result.won ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const wasMine = prev.phase === 'actions' && this.can(prev.current);
        if (this.isMyActions() && !wasMine) music.play('turn');
        else if (this.can(v.current) && v.phase !== 'actions' && prev.logTotal !== v.logTotal) music.play('draw');
        else if (prev.logTotal !== v.logTotal) music.play('notify');
    }

    render() {
        const v = this.view;
        if (!v || !this.controller) return;
        const g = viewGame(v);
        // 上の欄：水位・山
        const segs = Array.from({ length: MAX_WATER }, (_, i) => `<i class="${i < v.water ? 'on' : ''}${i === MAX_WATER - 1 ? ' skull' : ''}"></i>`).join('');
        $('water').innerHTML = `<span class="mk">水位</span><span class="bar">${segs}</span><b>${v.water}</b>`;
        $('water').title = `水位${v.water}：浸水のカード${FLOOD_RATES[v.water] ?? ''}枚（${MAX_WATER}で沈む）`;
        $('water').classList.toggle('warn', v.water >= MAX_WATER - 2);
        $('rate').innerHTML = `<span class="mk">浸水</span><b>${v.rate}</b><span class="mk">枚</span>`;
        $('decks').innerHTML = `<span class="mini-card tc"></span><b>${v.treasureDeckCount}</b><span class="mini-card fc"></span><b>${v.floodDeckCount}</b>`;
        // 島
        const targets = this.pick ? this.pick.targets : this.isMyActions() ? new Set(g.moveTargets(v.current)) : new Set();
        $('island').innerHTML = islandHtml(v, { targets, chosen: this.pick?.chosen ?? new Set(), flash: this.flash });
        $('island').classList.toggle('picking', !!this.pick);
        // 仲間（手札は全員に見える）
        $('team').innerHTML = v.players.map(p => {
            const cls = ['tm', p.id === v.current ? 'cur' : '', v.actors.includes(p.id) && v.phase !== 'actions' ? 'actor' : ''].join(' ');
            const who = this.controller.isOnline || this.controller.mode === 'team' ? `<span class="tm-who">${escapeHtml(p.name)}${p.isCPU ? '・CPU' : ''}</span>` : '';
            const hand = p.hand.map(c => cardHtml(c, isTreasureCard(c) ? '' : this.can(p.id) ? 'usable' : '')).join('');
            return `<div class="${cls}" data-seat="${p.id}">${pawnHtml(p.role)}<span class="tm-role">${ROLE[p.role].name}</span>${who}`
                + `<span class="tm-hand${p.hand.length > HAND_LIMIT ? ' over' : ''}">${hand || '<span class="empty">手札なし</span>'}</span></div>`;
        }).join('');
        // 状態の行
        $('status').innerHTML = this.statusHtml(v);
        this.showNews(v);
        this.renderActions(v, g);
        this.markHint(v);
    }

    statusHtml(v) {
        const p = v.players[v.current];
        const role = `${pawnHtml(p.role)}<b>${ROLE[p.role].name}</b>`;
        if (v.result) return `<span class="phase">${v.result.won ? '脱出成功' : '島に沈んだ'}</span>`;
        if (this.pick) return `<span class="phase">${escapeHtml(this.pick.text)}</span>`;
        switch (v.phase) {
            case 'actions': return `${role}<span class="pips">${[0, 1, 2].map(i => `<i class="${i < v.actionsLeft ? 'on' : ''}"></i>`).join('')}</span><span class="sub">${this.can(v.current) ? '光る場所へ移動、または下の操作' : 'の番'}</span>`;
            case 'draw': return `${role}<span class="phase">宝のカードを引く</span>`;
            case 'flood': return `${role}<span class="phase">浸水（あと${v.floodLeft}枚）</span>`;
            case 'discard': return `<span class="phase">${v.actors.map(s => ROLE[v.players[s].role].name).join('・')}：手札を${HAND_LIMIT}枚に</span>`;
            case 'swim': return `${pawnHtml(v.players[v.actors[0]].role)}<span class="phase">${ROLE[v.players[v.actors[0]].role].name}が泳いで逃げる</span>`;
        }
        return '';
    }

    // 新しい出来事を、島の上に数秒だけ出す（最後の3行）
    showNews(v) {
        const fresh = v.logs.filter(l => l.n > this.newsFrom);
        if (!fresh.length) return;
        this.newsFrom = v.logTotal;
        const el = $('news');
        el.innerHTML = fresh.slice(-3).map(l => `<div class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</div>`).join('');
        el.classList.add('show');
        clearTimeout(this.newsTimer);
        this.newsTimer = setTimeout(() => el.classList.remove('show'), 3000);
    }

    renderActions(v, g) {
        const mine = this.isMyActions() && !this.pick;
        const step = ['draw', 'flood'].includes(v.phase) && this.can(v.current) && !v.result
            && !(this.controller.mode === 'team' && v.players[v.current].isCPU);
        $('actions').hidden = step;
        $('step').hidden = !step;
        if (step) $('step-btn').textContent = v.phase === 'draw' ? '宝のカードを2枚引く' : `浸水のカードをめくる（あと${v.floodLeft}枚）`;
        const me = v.players[v.current];
        const opts = mine ? {
            shore: g.shoreTargets(v.current).length > 0,
            give: g.giveTargets(v.current).length > 0 && me.hand.some(isTreasureCard),
            capture: g.capturable(v.current) !== null,
            special: (me.role === 'pilot' && !v.pilotUsed) || me.role === 'navigator',
            pass: true
        } : {};
        $('actions').querySelectorAll('[data-act]').forEach(b => {
            b.disabled = !opts[b.dataset.act];
            b.classList.toggle('ready', b.dataset.act === 'capture' && !!opts.capture);
        });
        const local = !this.controller.isOnline;
        $('undo').hidden = !local || !!v.result;
        $('undo').disabled = !this.controller.canUndo();
        $('hint').hidden = !local || !!v.result; // ヒントと待ったはローカル対戦だけ
        $('hint').disabled = !v.actors.some(s => this.can(s));
    }

    // ---- 島を押す ----

    setPick(pick) {
        this.pick = pick;
        $('pick-bar').hidden = !pick;
        if (pick) {
            $('pick-text').textContent = pick.text;
            $('pick-done').hidden = !pick.onDone;
            $('pick-cancel').hidden = pick.kind === 'swim';
        }
        if (this.view) this.render();
    }

    tapTile(tile) {
        const v = this.view;
        if (!v) return;
        if (this.pick) {
            if (!this.pick.targets.has(tile)) {
                this.toast(TILES[tile].name);
                return;
            }
            this.pick.onPick(tile);
            return;
        }
        if (this.isMyActions() && viewGame(v).moveTargets(v.current).includes(tile)) {
            this.send(v.current, { type: 'move', to: tile });
            return;
        }
        this.showTileInfo(tile);
    }

    showTileInfo(tile) {
        const v = this.view;
        const t = TILES[tile];
        const state = ['', '（浸水）', '（沈んだ）'][v.tiles[tile]];
        const extra = t.treasure !== null ? `・${TREASURES[t.treasure].name}の神殿` : tile === FOOLS ? '・脱出の発着場' : '';
        this.toast(`${t.name}${state}${extra}`);
    }

    // ---- アクション ----

    doAct(act) {
        const v = this.view;
        const g = viewGame(v);
        const me = v.players[v.current];
        music.play('select');
        switch (act) {
            case 'shore': return this.startShore();
            case 'give': return this.openGive();
            case 'capture': return this.send(me.id, { type: 'capture' });
            case 'special':
                if (me.role === 'pilot') {
                    const targets = new Set(TILES.map(t => t.id).filter(t => g.alive(t) && t !== me.tile));
                    return this.setPick({ kind: 'fly', text: '飛ぶ先を選ぶ', targets, onPick: (to) => { this.setPick(null); this.send(me.id, { type: 'fly', to }); } });
                }
                return this.openNavigate();
            case 'pass': return this.send(me.id, { type: 'pass' });
        }
    }

    startShore() {
        const v = this.view;
        const g = viewGame(v);
        const me = v.players[v.current];
        const all = g.shoreTargets(v.current);
        if (me.role !== 'engineer' || all.length < 2) {
            this.setPick({ kind: 'shore', text: '補強する場所を選ぶ', targets: new Set(all), onPick: (tile) => { this.setPick(null); this.send(me.id, { type: 'shore', tile }); } });
            return;
        }
        // 技師：2か所まで選んで決める
        const chosen = new Set();
        const pick = {
            kind: 'shore', text: '補強する場所を2か所まで選ぶ', targets: new Set(all), chosen,
            onPick: (tile) => {
                if (chosen.has(tile)) chosen.delete(tile);
                else chosen.add(tile);
                if (chosen.size === 2) return pick.onDone();
                music.play('select');
                this.render();
            },
            onDone: () => {
                if (!chosen.size) return;
                const [tile, tile2] = [...chosen];
                this.setPick(null);
                this.send(me.id, { type: 'shore', tile, tile2 });
            }
        };
        this.setPick(pick);
    }

    openGive() {
        const v = this.view;
        const g = viewGame(v);
        const me = v.players[v.current];
        const items = [];
        g.giveTargets(v.current).forEach(to => {
            [...new Set(me.hand.filter(isTreasureCard))].forEach(card => items.push({
                label: `${cardHtml(card)} ${cardName(card)}を${pawnHtml(v.players[to].role)}${ROLE[v.players[to].role].name}へ`, html: true,
                run: () => this.send(me.id, { type: 'give', to, card })
            }));
        });
        this.openSheet({ title: '宝のカードを渡す', items, close: 'やめる' });
    }

    openNavigate() {
        const v = this.view;
        const g = viewGame(v);
        const me = v.players[v.current];
        const items = v.players.filter(p => p.id !== me.id).map(p => ({
            label: `${pawnHtml(p.role)}${ROLE[p.role].name}（${TILES[p.tile].name}）`, html: true,
            run: () => this.setPick({
                kind: 'navigate', text: `${ROLE[p.role].name}を動かす先を選ぶ`, targets: new Set(g.navigateTargets(p.id)),
                onPick: (to) => { this.setPick(null); this.send(me.id, { type: 'navigate', pawn: p.id, to }); }
            })
        }));
        this.openSheet({ title: '動かす仲間（2マスまで）', items, close: 'やめる' });
    }

    startSwim(seat) {
        const v = this.view;
        const targets = new Set(viewGame(v).swimTargets(seat));
        this.setPick({ kind: 'swim', text: `${ROLE[v.players[seat].role].name}が泳いで逃げる先を選ぶ`, targets, onPick: (to) => { this.setPick(null); this.send(seat, { type: 'swim', to }); } });
    }

    // ---- 手札 ----

    tapCard(seat, card) {
        const v = this.view;
        if (isTreasureCard(card) || !this.can(seat) || ['end', 'swim'].includes(v.phase)) {
            this.toast(isTreasureCard(card) ? cardName(card) : `${SPECIALS[card].name}：${SPECIALS[card].text}`);
            return;
        }
        this.useSpecial(seat, card);
    }

    useSpecial(seat, card) {
        const v = this.view;
        const g = viewGame(v);
        music.play('select');
        if (card === 'sand') {
            const targets = new Set(TILES.map(t => t.id).filter(t => v.tiles[t] === FLOODED));
            if (!targets.size) return this.toast('浸水している場所がありません');
            this.closeSheet();
            this.setPick({ kind: 'sand', text: '土のう：乾かす場所を選ぶ', targets, onPick: (tile) => { this.setPick(null); this.send(seat, { type: 'sand', tile }); } });
            return;
        }
        // ヘリ：脱出できれば脱出。それ以外は、運ぶ駒を選んでから行き先を選ぶ
        const items = [];
        if (g.canLiftoff()) items.push({ label: '全員で島から脱出する', primary: true, run: () => this.send(seat, { type: 'liftoff' }) });
        const groups = new Map();
        v.players.forEach(p => groups.set(p.tile, [...(groups.get(p.tile) ?? []), p.id]));
        groups.forEach((pawns, from) => {
            const options = pawns.length > 1 ? [pawns, ...pawns.map(s => [s])] : [pawns];
            options.forEach(list => items.push({
                label: `${list.map(s => pawnHtml(v.players[s].role) + ROLE[v.players[s].role].name).join('・')}（${TILES[from].name}）`, html: true,
                run: () => this.setPick({
                    kind: 'heli', text: 'ヘリ：行き先を選ぶ', targets: new Set(TILES.map(t => t.id).filter(t => g.alive(t) && t !== from)),
                    onPick: (to) => { this.setPick(null); this.send(seat, { type: 'heli', pawns: list, to }); }
                })
            }));
        });
        this.openSheet({ title: 'ヘリで脱出', html: `<p class="sheet-text">${SPECIALS.heli.text}</p>`, items, close: 'やめる' });
    }

    openDiscard(seat) {
        const v = this.view;
        const p = v.players[seat];
        const items = [...new Set(p.hand)].map(card => ({
            label: `${cardHtml(card)} ${cardName(card)}を${isTreasureCard(card) ? '捨てる' : '捨てる'}`, html: true,
            run: () => this.send(seat, { type: 'discard', card })
        }));
        p.hand.filter(c => !isTreasureCard(c)).filter((c, i, a) => a.indexOf(c) === i).forEach(card => items.push({
            label: `${cardHtml(card)} ${cardName(card)}を使う`, html: true, run: () => this.useSpecial(seat, card)
        }));
        this.openSheet({ kind: 'discard', title: `${ROLE[p.role].name}：手札が${p.hand.length}枚`, html: `<p class="sheet-text">${HAND_LIMIT}枚になるまで捨てる（特別なカードは使ってもよい）</p>`, items });
    }

    // ---- ヒント ----

    // おすすめの手を、短い文で知らせ、押す場所・ボタンを光らせる（打つのは自分）
    showHint() {
        const v = this.view;
        const h = this.controller?.suggest();
        if (!v || !h) {
            this.toast('今はおすすめの手がありません');
            return;
        }
        this.hint = { at: hintKey(v), ...h };
        music.play('select');
        this.toast(`おすすめ：${this.hintText(v, h.seat, h.command)}`);
        this.render();
    }

    hintText(v, seat, c) {
        const tile = (id) => TILES[id].name;
        const role = (s) => ROLE[v.players[s].role].name;
        const text = {
            move: () => `${tile(c.to)}へ移動`, fly: () => `${tile(c.to)}へ飛ぶ`, navigate: () => `${role(c.pawn)}を${tile(c.to)}へ動かす`,
            shore: () => `${[c.tile, c.tile2].filter(t => t !== undefined).map(tile).join('と')}を補強`, give: () => `${cardName(c.card)}を${role(c.to)}に渡す`,
            capture: () => '宝を手に入れる', pass: () => 'アクションを終える', draw: () => '宝のカードを引く', flood: () => '浸水へ進む',
            discard: () => `${cardName(c.card)}を捨てる`, swim: () => `${tile(c.to)}へ泳ぐ`, heli: () => `ヘリで${tile(c.to)}へ`,
            sand: () => `土のうで${tile(c.tile)}を補強`, liftoff: () => 'ヘリで脱出する'
        }[c.type];
        return (seat !== v.current ? `${role(seat)}：` : '') + (text ? text() : c.type);
    }

    // ヒントの印（その手のあいだだけ）
    markHint(v) {
        if (this.hint && this.hint.at !== hintKey(v)) this.hint = null;
        const c = this.hint?.command;
        if (!c) return;
        const mark = (el) => el?.classList.add('recommended');
        const tileEl = (t) => $('island').querySelector(`[data-tile="${t}"]`);
        if (['move', 'fly', 'navigate', 'swim', 'heli'].includes(c.type)) mark(tileEl(c.to));
        if (['shore', 'sand'].includes(c.type)) [c.tile, c.tile2].filter(t => t !== undefined).forEach(t => mark(tileEl(t)));
        const act = { shore: 'shore', give: 'give', capture: 'capture', pass: 'pass', fly: 'special', navigate: 'special' }[c.type];
        if (act) mark($('actions').querySelector(`[data-act="${act}"]`));
        if (['draw', 'flood'].includes(c.type)) mark($('step-btn'));
        if (['discard', 'sand', 'heli', 'liftoff'].includes(c.type)) {
            const card = c.type === 'discard' ? c.card : c.type === 'sand' ? 'sand' : 'heli';
            mark($('team').querySelector(`[data-seat="${this.hint.seat}"] [data-card="${card}"]`));
        }
    }

    // ---- 情報 ----

    openDecks() {
        const v = this.view;
        const chip = (t) => `<span class="chip${v.tiles[t] === FLOODED ? ' wet' : ''}">${escapeHtml(TILES[t].name)}</span>`;
        const html = `<p class="sheet-text">宝のカードの山 ${v.treasureDeckCount}枚・浸水のカードの山 ${v.floodDeckCount}枚</p>`
            + `<h3>浸水のカードの捨て札（${v.floodDiscard.length}枚。水位上昇で山の上に戻る）</h3><div class="chips">${v.floodDiscard.map(chip).join('') || 'なし'}</div>`
            + (v.floodRemoved.length ? `<h3>沈んだ場所</h3><div class="chips">${v.floodRemoved.map(t => `<span class="chip">${escapeHtml(TILES[t].name)}</span>`).join('')}</div>` : '')
            + `<h3>宝のカードの捨て札（${v.treasureDiscard.length}枚）</h3><div class="chips">${v.treasureDiscard.map(c => (c === 'rise' ? '<span class="chip rise">水位上昇</span>' : cardHtml(c))).join('') || 'なし'}</div>`;
        this.openSheet({ title: '山と捨て札', html, close: '閉じる' });
    }

    openLog() {
        const v = this.view;
        const html = `<div class="log">${v.logs.slice().reverse().map(l => `<div class="${l.head ? 'head' : ''}">${escapeHtml(l.text)}</div>`).join('')}</div>`;
        this.openSheet({ title: '記録', html, close: '閉じる' });
    }

    openHelp() {
        this.openSheet({ title: '遊び方', html: HELP_HTML, close: '閉じる', wide: true });
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // 協力ゲームなので、脱出できれば勝ち、沈めば負け。1台で交代する対戦は誰の記録か分からないので送らない
    // id はシードから作る（続きから開き直しても、同じ対戦を2回数えない）
    recordLocalResult(v) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !v.result) return;
        const game = controller.game;
        if (game.players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({ game: 'forbidden-island', id: `forbidden-island-${game.options.seed}`, outcome: v.result.won ? 'win' : 'loss' });
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        const got = v.captured.map((c, k) => treasureIcon(k, c ? 'done' : 'missing')).join('');
        this.openSheet({
            kind: 'result',
            title: v.result.won ? '脱出成功' : '島に沈んだ',
            html: `<p class="sheet-text">${END_REASONS[v.result.reason]}</p><div class="result-treasures">${got}</div>`
                + `<p class="sheet-sub">${LEVELS[v.level].name}・${v.players.length}人・${v.turnNo}手番目・水位${v.water}</p>`,
            items: [
                // オンラインは、ロビーを出し、ホストの「もう一度」で再戦する
                { label: 'もう一度', primary: true, run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
                { label: 'ホーム', center: true, id: 'result-home', run: () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()) }
            ]
        });
    }

    // ---- シート ----

    // items: [{ label, sub, html, run, primary, disabled, keep, id }]。keep は押しても閉じない
    openSheet({ kind = 'info', title, html = '', items = [], close = null, wide = false }) {
        this.sheetKind = kind;
        $('sheet-title').textContent = title;
        const list = items.map((it, i) => `<button type="button" class="opt${it.primary ? ' primary' : ''}${it.center ? ' center' : ''}" data-i="${i}"${it.id ? ` id="${it.id}"` : ''} ${it.disabled ? 'disabled' : ''}>`
            + `<span class="opt-label">${it.html ? it.label : escapeHtml(it.label)}</span>${it.sub ? `<small>${escapeHtml(it.sub)}</small>` : ''}</button>`).join('');
        $('sheet-body').innerHTML = html + (items.length ? `<div class="opts">${list}</div>` : '');
        this.sheetHandlers = items.map(it => () => {
            if (!it.keep) this.closeSheet();
            it.run();
        });
        $('sheet-buttons').innerHTML = close ? `<button type="button" class="btn secondary" data-i="${items.length}">${close}</button>` : '';
        if (close) this.sheetHandlers.push(() => this.closeSheet());
        $('sheet').classList.toggle('wide', wide);
        $('overlay').hidden = false;
        $('sheet-body').scrollTop = 0;
    }

    closeSheet() {
        this.sheetKind = null;
        this.sheetHandlers = null;
        $('overlay').hidden = true;
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
