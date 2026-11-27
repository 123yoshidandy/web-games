/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS, planExorcism, FACE_NAMES } from './game.js';
import {
    TILES, POWERS, COLOR_NAMES, LEVELS, EFFECT_TEXT, FACING, MAX_QI, HAUNT_LIMIT, MONKS, BLACK, GHOSTS,
    boardOf, ghostOf, tileDistance
} from './data.js';
import {
    COLOR_HEX, ICONS, ghostSvg, monkSvg, haunterSvg, buddhaSvg, tileSvg, effectSvg, dieSvg, curseDieSvg, titleArt
} from './art.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席の僧だけを動かす。ヒントはない
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
        scheduleCpu() {},
        stop: () => net.stop()
    };
}

const SETTINGS_KEY = 'ghost-stories.settings';
const TILE = Object.fromEntries(TILES.map(t => [t.key, t]));
const ALL_NAMES = ['赤の僧', '黄の僧', '緑の僧', '青の僧'];
const RESULT_TEXT = {
    wufeng: '魔王の化身を祓い、村を守り抜きました',
    haunted: `村のタイルが${HAUNT_LIMIT}枚呪われました`,
    dead: '僧が全員倒れました',
    deck: '魔王が残ったまま、幽霊の山が尽きました'
};
const CURSE_TEXT = { none: '何もなし', qi: '気を失う', tao: '札を失う', haunt: '前のタイルが呪われる', ghost: '幽霊が来る' };

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 盤の格子（5×5）の位置
const tileCell = (t) => [1 + Math.floor(t / 3), 1 + (t % 3)];
const slotCell = (s) => {
    const b = boardOf(s);
    const k = s % 3;
    return [[4, 1 + k], [1 + k, 0], [0, 1 + k], [1 + k, 4]][b];
};
const CORNERS = [[4, 0], [0, 0], [0, 4], [4, 4]];
const at = ([r, c]) => `grid-row:${r + 1};grid-column:${c + 1}`;

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            level: Object.hasOwn(LEVELS, s.level) ? s.level : 'initiation',
            mode: s.mode === 'all' ? 'all' : 'team'
        };
    } catch {
        return { level: 'initiation', mode: 'team' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 幽霊の説明（シートと札の title）
function ghostText(g) {
    const parts = [];
    if (g.arrive.length) parts.push(`来たとき：${g.arrive.map(e => EFFECT_TEXT[e]).join('・')}`);
    if (g.yin.length) parts.push(`陰の段階：${g.yin.map(e => EFFECT_TEXT[e]).join('・')}`);
    parts.push(`祓ったら：${g.reward.length ? g.reward.map(e => EFFECT_TEXT[e]).join('・') : 'なし'}`);
    return parts;
}

function ghostCard(g, { res = g.res, mantra = false, haunterOnCard = false, mini = false } = {}) {
    const pips = Array.from({ length: res }, () => '<i></i>').join('');
    const fx = [...g.arrive.filter(e => e !== 'haunter' || !haunterOnCard), ...g.yin.filter(e => e !== 'haunt')];
    return `<span class="ghost c${g.color} ${g.incarnation ? 'boss' : ''} ${mini ? 'mini' : ''}">
        ${ghostSvg(g.color, { incarnation: g.incarnation })}
        <span class="g-name">${escapeHtml(g.name.replace('魔王の化身・', '魔王・'))}</span>
        <span class="g-res" aria-label="抵抗${res}">${pips}</span>
        <span class="g-fx">${fx.map(e => `<span class="fx fx-${e}">${effectSvg(e)}</span>`).join('')}${haunterOnCard ? `<span class="fx fx-haunter">${effectSvg('haunter')}</span>` : ''}</span>
        ${mantra ? '<span class="mantra-mark" title="真言">真</span>' : ''}
    </span>`;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.pick = null;          // 盤で選んでいるとき：{ text, slots, tiles, onPick }
        this.selected = [];        // 除霊で祓う幽霊（置き場）
        this.selectedKey = null;
        this.resultShown = false;
        this.recommend = null;     // ヒントで光らせる { kind, value }
        this.logBook = new Map();
        this.lastLogTotal = 0;
        this.sentByMe = false;
        this.wasMyTurn = false;
        $('home').innerHTML = ICONS.home;
        $('open-help-game').innerHTML = ICONS.help;
        $('open-log').innerHTML = ICONS.log;
        document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon]; });
        $('title-art').innerHTML = titleArt();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない僧は CPU
        this.online = new NetplayLobby({
            title: 'ゴーストストーリーズ',
            game: GAME,
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [{ key: 'level', label: '難易度', options: Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.name })) }],
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
        const seg = (id, key) => $(id).addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            music.play('select');
            this.settings[key] = button.dataset[key];
            saveSettings(this.settings);
            this.renderTitle();
        });
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
        const mark = (id, key) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', this.settings[key] === b.dataset[key]));
        mark('level', 'level');
        mark('mode', 'mode');
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        this.closeSheet();
        this.pick = null;
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        this.renderTitle();
    }

    start() {
        const { level, mode } = this.settings;
        const players = mode === 'all'
            ? ALL_NAMES.map(name => ({ name, isCPU: false }))
            : [{ name: 'あなた', isCPU: false }];
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
        this.pick = null;
        this.selected = [];
        this.selectedKey = null;
        this.recommend = null;
        this.logBook = new Map();
        this.lastLogTotal = 0;
        this.wasMyTurn = false;
        this.closeSheet();
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.update();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた僧は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('hint').addEventListener('click', () => this.showHint());
        $('board').addEventListener('click', event => {
            const el = event.target.closest('[data-tile],[data-slot],[data-monk]');
            if (!el) return;
            if (el.dataset.slot !== undefined) this.tapSlot(Number(el.dataset.slot));
            else if (el.dataset.tile !== undefined) this.tapTile(Number(el.dataset.tile));
            else this.openMonk(Number(el.dataset.monk));
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('[data-act]');
            if (button && !button.disabled) this.action(button.dataset.act);
        });
        $('tray').addEventListener('click', event => {
            const button = event.target.closest('[data-tray]');
            if (!button || button.disabled) return;
            const kind = button.dataset.tray;
            if (kind === 'assign') this.send({ type: 'assign', targets: [...this.selected] });
            else if (kind === 'giveup') this.send({ type: 'assign', targets: [] });
            else if (kind === 'cancel-pick') {
                music.play('cancel');
                this.pick = null;
                this.render();
            }
        });
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && this.sheetKind !== 'result') this.closeSheet();
        });
    }

    // 自分が動かせる手番の僧（なければ null）
    mySeat(v = this.view) {
        if (!v || v.result || !this.controller) return null;
        const seat = v.actors[0];
        return seat !== undefined && this.controller.canControl(seat) ? seat : null;
    }

    send(command, seat = this.mySeat()) {
        if (seat === null || this.controller?.awaitingResponse) return false;
        this.pick = null;
        this.recommend = null;
        this.sentByMe = true;
        const ok = this.controller.send(seat, command);
        if (!ok) this.sentByMe = false;
        return ok;
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        if (!v) return;
        const prev = this.view;
        this.view = v;
        v.logs.forEach(l => this.logBook.set(l.n, l));
        if (this.logBook.size > 300) [...this.logBook.keys()].slice(0, this.logBook.size - 300).forEach(k => this.logBook.delete(k));
        this.playSounds(prev, v);
        // 除霊の出目が変わったら、祓える一番多い組を選んでおく
        const key = v.phase === 'exorcise' && v.dice ? `${v.logTotal}` : null;
        if (key !== this.selectedKey) {
            this.selectedKey = key;
            this.selected = key ? this.defaultTargets(v) : [];
        }
        if (prev && prev.logTotal !== v.logTotal) this.recommend = null;
        this.render();
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 700);
        }
    }

    playSounds(prev, v) {
        if (!prev || v.logTotal === prev.logTotal) return;
        const mine = this.sentByMe;
        this.sentByMe = false;
        const types = new Set(v.events.map(e => e.type));
        if (v.result && !prev.result) return; // 結果のシートで鳴らす
        const myTurn = this.mySeat(v) !== null;
        if (mine) {
            const sound = ['exorcise', 'buddha'].some(t => types.has(t)) ? 'capture'
                : types.has('dice') ? 'dice'
                    : types.has('gain') ? 'gain'
                        : types.has('qi') || types.has('haunt') ? 'pay'
                            : types.has('fail') ? 'cancel'
                                : types.has('arrive') ? 'draw' : 'place';
            music.play(sound);
            if (myTurn && !this.wasMyTurn) music.play('turn', { delay: 0.25 });
        } else if (myTurn && !this.wasMyTurn) {
            music.play('turn');
        } else if (types.has('haunt') || types.has('dead')) {
            music.play('notify');
        }
        this.wasMyTurn = myTurn;
    }

    // 出目で祓える、一番多い組
    defaultTargets(v) {
        const seat = v.current;
        const facing = FACING[v.players[seat].tile].filter(s => v.slots[s]);
        const sets = facing.length === 2 ? [facing, [facing[0]], [facing[1]]] : facing.map(s => [s]);
        return sets.find(ts => this.planFor(v, ts)) ?? [];
    }

    planFor(v, targets) {
        const need = [0, 0, 0, 0, 0];
        targets.forEach(s => { need[ghostOf(v.slots[s].card).color] += v.slots[s].res; });
        return planExorcism(need, v.dice ?? [], v.players[v.current].tao);
    }

    // ---- 描画 ----

    render() {
        const v = this.view;
        if (!v) return;
        this.renderStats(v);
        this.renderBoard(v);
        this.renderDock(v);
    }

    renderStats(v) {
        const until = v.untilIncarnation === null ? (v.result?.won ? '祓った' : '出現') : `あと${v.untilIncarnation}枚`;
        $('stats').innerHTML = `
            <span class="stat" title="幽霊の山"><b>山</b>${v.deckCount}</span>
            <span class="stat boss-stat ${v.untilIncarnation === null ? 'out' : ''}" title="魔王の化身"><b>魔王</b>${until}</span>
            <span class="stat ${v.hauntedCount >= HAUNT_LIMIT - 1 ? 'danger' : ''}" title="呪われたタイル"><b>呪</b>${v.hauntedCount}/${HAUNT_LIMIT}</span>`;
    }

    renderBoard(v) {
        const mine = this.mySeat(v);
        const me = mine !== null ? v.players[mine] : null;
        const pick = this.pick;
        const canMove = me && v.phase === 'yang' && !v.moved && !pick;
        const peaks = me && mine === 0 && me.power;
        const placing = mine !== null && v.phase === 'place' && !pick;
        const exorcising = mine !== null && v.phase === 'exorcise';
        const facingNow = exorcising ? FACING[me.tile].filter(s => v.slots[s]) : [];
        const rec = this.recommend;
        const cells = [];
        // 村のタイル
        v.tiles.forEach((t, i) => {
            const info = TILE[t.key];
            const monks = v.players.filter(p => p.tile === i && p.alive);
            const haunters = v.slots.map((s, slot) => (s && s.haunter === i ? ghostOf(s.card).color : null)).filter(c => c !== null);
            const movable = canMove && i !== me.tile && (peaks || tileDistance(me.tile, i) <= 1);
            const pickable = pick?.tiles?.includes(i);
            const recd = rec?.kind === 'tile' && rec.value === i;
            cells.push(`<button type="button" class="cell tile ${t.haunted ? 'haunted' : ''} ${movable ? 'target' : ''} ${pickable ? 'target pick' : ''} ${recd ? 'recommended' : ''} ${me && me.tile === i && !v.result ? 'here' : ''}"
                data-tile="${i}" style="${at(tileCell(i))}" aria-label="${info.name}${t.haunted ? '（呪われている）' : ''}">
                <span class="t-icon">${tileSvg(t.key)}</span>
                <span class="t-name">${info.name}</span>
                ${t.key === 'prayer' && v.prayer !== null ? `<span class="prayer-dot" style="--pc:${COLOR_HEX[v.prayer]}" title="祈りの色"></span>` : ''}
                ${t.key === 'temple' ? `<span class="temple-count" title="仏堂の仏像">${'●'.repeat(v.temple)}</span>` : ''}
                <span class="t-monks">${monks.map(p => `<span class="pawn ${p.id === v.current ? 'active' : ''}">${monkSvg(p.id)}</span>`).join('')}</span>
                ${haunters.map(c => `<span class="haunter">${haunterSvg(c)}</span>`).join('')}
                ${t.haunted ? '<span class="curse-seal" aria-hidden="true">呪</span>' : ''}
            </button>`);
        });
        // 幽霊の置き場
        v.slots.forEach((s, i) => {
            const b = boardOf(i);
            const target = (placing && v.placeOptions.includes(i)) || pick?.slots?.includes(i);
            const selectable = facingNow.includes(i);
            const selected = selectable && this.selected.includes(i);
            const recd = rec?.kind === 'slot' && rec.value.includes(i);
            let body = '';
            if (s) body = ghostCard(ghostOf(s.card), { res: s.res, mantra: v.mantraAt === i, haunterOnCard: s.haunter === -1 });
            else if (v.buddhaAt[i]) body = `<span class="buddha">${buddhaSvg()}</span>`;
            cells.push(`<button type="button" class="cell slot side-${b} ${s ? 'full' : 'empty'} ${target ? 'target' : ''} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''} ${recd ? 'recommended' : ''}"
                data-slot="${i}" style="${at(slotCell(i))};--bc:${COLOR_HEX[b]}" aria-label="${s ? escapeHtml(ghostOf(s.card).name) : `${COLOR_NAMES[b]}のボードの空き`}">${body}</button>`);
        });
        // 四隅：僧の状態
        v.players.forEach((p, i) => {
            const tao = p.tao.map((n, c) => (n ? `<span class="tok c${c}">${n}</span>` : '')).join('');
            cells.push(`<button type="button" class="cell monk-panel m${i} ${p.id === v.current && !v.result ? 'current' : ''} ${p.alive ? '' : 'dead'} ${p.id === v.you ? 'you' : ''}"
                data-monk="${i}" style="${at(CORNERS[i])};--bc:${COLOR_HEX[i]}" aria-label="${escapeHtml(p.name)}">
                <span class="mp-head">${monkSvg(i, { dead: !p.alive })}<span class="mp-name">${escapeHtml(p.name)}</span></span>
                <span class="mp-qi" aria-label="気${p.qi}">${Array.from({ length: MAX_QI }, (_, k) => `<i class="${k < p.qi ? 'on' : ''}"></i>`).join('')}</span>
                <span class="mp-tao">${tao}${p.buddhas ? `<span class="tok bud">仏${p.buddhas}</span>` : ''}${p.power ? '' : '<span class="tok sealed">封</span>'}</span>
            </button>`);
        });
        $('board').innerHTML = cells.join('');
    }

    renderDock(v) {
        const mine = this.mySeat(v);
        const cur = v.players[v.current];
        let prompt = '';
        let tray = '';
        const actions = $('actions');
        const showActions = mine !== null && v.phase === 'yang' && !this.pick;
        if (v.result) {
            prompt = v.result.won ? '勝利！ 村を守り抜きました' : `敗北：${RESULT_TEXT[v.result.reason]}`;
        } else if (this.pick && mine !== null) {
            prompt = this.pick.text;
            tray = '<button type="button" class="btn secondary small" data-tray="cancel-pick">やめる</button>';
        } else if (mine !== null && v.phase === 'place') {
            const g = v.pendingGhost;
            prompt = `${escapeHtml(g.name)}が来た。置く場所を選んでください${v.pendingCount > 1 ? `（あと${v.pendingCount - 1}体）` : ''}`;
            tray = `<span class="pending">${ghostCard(g, { mini: true })}</span><span class="pending-text">${COLOR_NAMES[g.color]}・抵抗${g.res}<br>${ghostText(g).map(escapeHtml).join('<br>')}</span>`;
        } else if (mine !== null && v.phase === 'exorcise') {
            const ok = this.selected.length > 0 && this.planFor(v, this.selected);
            prompt = '出目と札で祓う幽霊を選んでください';
            tray = `<span class="dice">${v.dice.map(f => `<span class="die" title="${FACE_NAMES[f]}">${dieSvg(f)}</span>`).join('')}</span>
                <button type="button" class="btn primary small ${this.recommend?.kind === 'assign' ? 'recommended' : ''}" data-tray="assign" ${ok ? '' : 'disabled'}>祓う${this.selected.length ? `（${this.selected.length}体）` : ''}</button>
                <button type="button" class="btn secondary small" data-tray="giveup">あきらめる</button>`;
        } else if (mine !== null && v.phase === 'yang') {
            const tile = TILE[v.tiles[cur.tile].key];
            prompt = `${escapeHtml(cur.name)}の番：${v.moved ? '' : '動くタイルを押すか、'}行動を選んでください（${tile.name}${v.tiles[cur.tile].haunted ? '・呪われている' : ''}）`;
            tray = this.lastNews(v);
        } else {
            prompt = `${escapeHtml(cur.name)}の番${cur.alive ? '' : '（倒れている）'}…`;
            tray = this.lastNews(v);
        }
        $('prompt').innerHTML = prompt;
        $('tray').innerHTML = tray;
        actions.classList.toggle('waiting', !showActions);
        const avail = showActions ? this.availableActions(v, mine) : {};
        actions.querySelectorAll('[data-act]').forEach(button => {
            const act = button.dataset.act;
            button.disabled = !avail[act];
            button.hidden = act === 'mantra' && !(mine === 3 || (showActions && v.current === 3));
            button.classList.toggle('recommended', this.recommend?.kind === 'act' && this.recommend.value === act);
        });
        // ヒントはローカル対戦で、自分が動かせる番だけ
        const hint = $('hint');
        hint.hidden = Boolean(this.controller?.isOnline) || Boolean(v.result);
        hint.disabled = mine === null;
    }

    // 最後のダイスと記録（2行）
    lastNews(v) {
        const logs = [...this.logBook.values()].filter(l => l.kind !== 'turn').slice(-2);
        const roll = v.lastRoll;
        const dice = roll ? `<span class="dice small">${roll.kind === 'curse'
            ? `<span class="die" title="呪い：${CURSE_TEXT[roll.faces[0]]}">${curseDieSvg(roll.faces[0])}</span>`
            : roll.faces.map(f => `<span class="die" title="${FACE_NAMES[f]}">${dieSvg(f)}</span>`).join('')}</span>` : '';
        return `${dice}<span class="news">${logs.map(l => `<span class="k-${l.kind}">${escapeHtml(l.text)}</span>`).join('')}</span>`;
    }

    availableActions(v, seat) {
        const me = v.players[seat];
        const t = v.tiles[me.tile];
        const facing = FACING[me.tile];
        return {
            help: !t.haunted && this.helpPossible(v, seat, t.key),
            exorcise: facing.some(s => v.slots[s]),
            buddha: me.buddhas > 0 && facing.some(s => !v.slots[s] && !v.buddhaAt[s]),
            mantra: seat === 3 && me.power && v.mantraAt === null && v.slots.some(Boolean),
            pass: true
        };
    }

    helpPossible(v, seat, key) {
        const me = v.players[seat];
        switch (key) {
            case 'sorcerer': return me.qi >= 2 && v.slots.some(s => s && !ghostOf(s.card).incarnation);
            case 'temple': return v.temple > 0;
            case 'cemetery': return v.players.some(p => !p.alive);
            case 'altar': return v.deckCount > 0;
            case 'watch': return v.tiles.some(x => x.haunted);
            case 'pavilion': return true;
            default: return true;
        }
    }

    // ---- 操作 ----

    tapTile(i) {
        const v = this.view;
        if (!v) return;
        if (this.pick?.tiles) {
            if (this.pick.tiles.includes(i)) this.pick.onPick(i);
            return;
        }
        const mine = this.mySeat(v);
        if (mine !== null && v.phase === 'yang' && !v.moved && i !== v.players[mine].tile) {
            const peaks = mine === 0 && v.players[mine].power;
            if (peaks || tileDistance(v.players[mine].tile, i) <= 1) {
                this.send({ type: 'move', to: i });
                return;
            }
        }
        this.openTile(i);
    }

    tapSlot(i) {
        const v = this.view;
        if (!v) return;
        if (this.pick?.slots) {
            if (this.pick.slots.includes(i)) this.pick.onPick(i);
            else if (v.slots[i]) this.openGhost(i);
            return;
        }
        const mine = this.mySeat(v);
        if (mine !== null && v.phase === 'place' && v.placeOptions.includes(i)) {
            this.send({ type: 'place', slot: i });
            return;
        }
        if (mine !== null && v.phase === 'exorcise' && FACING[v.players[mine].tile].includes(i) && v.slots[i]) {
            music.play('select');
            this.selected = this.selected.includes(i) ? this.selected.filter(s => s !== i) : [...this.selected, i];
            this.render();
            return;
        }
        if (v.slots[i]) this.openGhost(i);
        else if (v.buddhaAt[i]) this.toast('仏像：ここに来たふつうの幽霊は、すぐに祓われる');
    }

    setPick(pick) {
        music.play('select');
        this.pick = pick;
        this.render();
    }

    action(act) {
        const v = this.view;
        const seat = this.mySeat(v);
        if (seat === null) return;
        const me = v.players[seat];
        if (act === 'pass') this.send({ type: 'pass' });
        else if (act === 'exorcise') this.send({ type: 'exorcise' });
        else if (act === 'buddha') {
            const free = FACING[me.tile].filter(s => !v.slots[s] && !v.buddhaAt[s]);
            if (free.length === 1) this.send({ type: 'buddha', slot: free[0] });
            else this.setPick({ text: '仏像を置く場所を選んでください', slots: free, onPick: (slot) => this.send({ type: 'buddha', slot }) });
        } else if (act === 'mantra') {
            const slots = v.slots.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
            this.setPick({ text: '真言の札を置く幽霊を選んでください', slots, onPick: (slot) => this.send({ type: 'mantra', slot }) });
        } else if (act === 'help') this.askHelp(v, seat);
    }

    // 村人の力：必要な選択を集めてから送る
    askHelp(v, seat) {
        const me = v.players[seat];
        const key = v.tiles[me.tile].key;
        const pockets = seat === 1 && me.power && (key === 'tea' || key === 'herb');
        const withBonus = (command) => {
            if (!pockets) return this.send(command);
            this.chooseColor('底なしの袋：もう1枚の札の色', (bonus) => this.send({ ...command, bonus }));
        };
        switch (key) {
            case 'tea':
                this.chooseColor('茶屋：受け取る札の色', (color) => withBonus({ type: 'help', color }));
                break;
            case 'herb':
                withBonus({ type: 'help' });
                break;
            case 'prayer':
                this.chooseColor('祈りの輪：抵抗を下げる色', (color) => this.send({ type: 'help', color }), v.prayer);
                break;
            case 'sorcerer': {
                const slots = v.slots.map((s, i) => (s && !ghostOf(s.card).incarnation ? i : -1)).filter(i => i >= 0);
                this.setPick({ text: '呪術師の庵：気を1つ払って祓う幽霊を選んでください', slots, onPick: (slot) => this.send({ type: 'help', slot }) });
                break;
            }
            case 'pavilion': {
                const alive = v.players.filter(p => p.alive);
                this.openSheet('風の楼閣：動かす僧', '<p>どこへでも動かせます。</p>', alive.map(p => ({
                    label: p.name,
                    run: () => this.setPick({
                        text: `${p.name}の行き先のタイルを選んでください`,
                        tiles: [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(t => t !== p.tile),
                        onPick: (to) => this.send({ type: 'help', monk: p.id, to })
                    })
                })).concat([{ label: 'やめる', run: () => {} }]), 'help');
                break;
            }
            case 'cemetery': {
                const dead = v.players.filter(p => !p.alive);
                if (dead.length === 1) this.send({ type: 'help', monk: dead[0].id });
                else this.openSheet('墓所：呼び戻す僧', '', dead.map(p => ({ label: p.name, run: () => this.send({ type: 'help', monk: p.id }) })), 'help');
                break;
            }
            case 'watch': {
                const tiles = v.tiles.map((t, i) => (t.haunted ? i : -1)).filter(i => i >= 0);
                if (tiles.length === 1) this.send({ type: 'help', tile: tiles[0] });
                else this.setPick({ text: '夜回りの番所：呪いを解くタイルを選んでください', tiles, onPick: (tile) => this.send({ type: 'help', tile }) });
                break;
            }
            default:
                this.send({ type: 'help' });
        }
    }

    chooseColor(title, onChoose, except = null) {
        const buttons = [0, 1, 2, 3, BLACK].filter(c => c !== except).map(c => ({
            label: `<span class="tok c${c}">&nbsp;</span>${COLOR_NAMES[c]}`,
            run: () => onChoose(c)
        }));
        this.openSheet(title, '<p>道の札は、除霊で同じ色の目の代わりになります。</p>', [...buttons, { label: 'やめる', run: () => {} }], 'color');
    }

    showHint() {
        const h = this.controller?.suggest();
        if (!h) {
            this.toast('今はおすすめの手がありません');
            return;
        }
        music.play('select');
        const c = h.command;
        const v = this.view;
        const text = {
            place: () => { this.recommend = { kind: 'slot', value: [c.slot] }; return '光っている場所に置くのがおすすめです'; },
            move: () => { this.recommend = { kind: 'tile', value: c.to }; return `${TILE[v.tiles[c.to].key].name}へ動くのがおすすめです`; },
            exorcise: () => { this.recommend = { kind: 'act', value: 'exorcise' }; return '除霊がおすすめです'; },
            assign: () => {
                this.selected = [...c.targets];
                this.recommend = c.targets.length ? { kind: 'assign' } : null;
                return c.targets.length ? '選んだ幽霊を祓うのがおすすめです' : '祓えないので、あきらめましょう';
            },
            help: () => { this.recommend = { kind: 'act', value: 'help' }; return `${TILE[v.tiles[v.players[h.seat].tile].key].name}で力を借りるのがおすすめです`; },
            buddha: () => { this.recommend = { kind: 'slot', value: [c.slot] }; return '仏像を光っている場所に置くのがおすすめです'; },
            mantra: () => { this.recommend = { kind: 'slot', value: [c.slot] }; return '光っている幽霊に真言を置くのがおすすめです'; },
            pass: () => { this.recommend = { kind: 'act', value: 'pass' }; return '何もせずに終えるのがおすすめです'; }
        }[c.type]?.() ?? '';
        this.render();
        this.toast(text);
    }

    // ---- シート ----

    openSheet(title, html, buttons = [{ label: '閉じる', run: () => {} }], kind = 'info') {
        this.sheetKind = kind;
        $('sheet-title').textContent = title;
        $('sheet-body').innerHTML = html;
        const box = $('sheet-buttons');
        box.innerHTML = '';
        buttons.forEach((b, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn ${b.primary ? 'primary' : 'secondary'}`;
            if (b.id) button.id = b.id;
            button.innerHTML = b.label;
            button.addEventListener('click', () => {
                this.closeSheet();
                b.run();
            });
            box.appendChild(button);
            if (i === 0) setTimeout(() => button.focus({ preventScroll: true }), 0);
        });
        $('overlay').hidden = false;
        $('sheet').classList.toggle('wide', kind === 'help' || kind === 'log');
    }

    closeSheet() {
        $('overlay').hidden = true;
        this.sheetKind = null;
    }

    openHelp() {
        this.openSheet('遊び方', `<div class="help">${HELP_HTML}</div>`, undefined, 'help');
    }

    openLog() {
        const logs = [...this.logBook.values()].slice(-150).reverse();
        this.openSheet('記録', `<ol class="log" id="log">${logs.map(l => `<li class="k-${l.kind}">${escapeHtml(l.text)}</li>`).join('')}</ol>`, undefined, 'log');
    }

    openGhost(i) {
        const v = this.view;
        const s = v.slots[i];
        const g = ghostOf(s.card);
        const notes = [];
        if (s.res !== g.res) notes.push(`抵抗 ${g.res} → ${s.res}（祈りの輪・真言）`);
        if (s.haunter === -1) notes.push('憑き手は札の上（次の陰の段階で村へ出る）');
        else if (s.haunter !== null) notes.push(`憑き手が${TILE[v.tiles[s.haunter].key].name}の上（次の陰の段階で呪う）`);
        this.openSheet(g.name, `<div class="ghost-info">${ghostCard(g, { res: s.res })}<div>
            <p>${COLOR_NAMES[g.color]}・抵抗${s.res}　${COLOR_NAMES[boardOf(i)]}のボード</p>
            <ul>${ghostText(g).map(t => `<li>${escapeHtml(t)}</li>`).join('')}${notes.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div></div>`);
    }

    openTile(i) {
        const t = this.view.tiles[i];
        const info = TILE[t.key];
        this.openSheet(info.name, `<p>${info.text}</p>${t.haunted ? '<p class="bad">呪われていて、力を借りられません（夜回りの番所や、ごほうびで戻せます）。</p>' : ''}`);
    }

    openMonk(i) {
        const p = this.view.players[i];
        const tao = p.tao.map((n, c) => `${COLOR_NAMES[c]}${n}`).join('・');
        this.openSheet(`${p.name}（${COLOR_NAMES[i]}）`, `<p>気 ${p.qi}/${MAX_QI}${p.alive ? '' : '（倒れている）'}　道の札：${tao}${p.buddhas ? `　仏像${p.buddhas}` : ''}</p>
            <p><b>${POWERS[i].name}</b>：${POWERS[i].text}${p.power ? '' : '（今は封じられている）'}</p>
            <p>${p.isCPU ? 'CPU が動かします。' : ''}${MONKS}人の僧のボードは、盤の${['下', '左', '上', '右'][i]}です。</p>`);
    }

    showResult() {
        const v = this.view;
        if (!v?.result) return;
        const won = v.result.won;
        music.play(won ? 'win' : 'lose');
        if (!this.controller?.isOnline && this.controller?.setup) {
            recordResult({ game: GAME, id: `${GAME}-${this.controller.setup.seed}`, outcome: won ? 'win' : 'loss' });
        }
        const dead = v.players.filter(p => !p.alive).length;
        this.openSheet(won ? '勝利' : '敗北', `<p class="result-text">${RESULT_TEXT[v.result.reason]}</p>
            <p>${v.levelName}・${v.turnNo}手番・呪われたタイル ${v.hauntedCount}・倒れた僧 ${dead}</p>`, [
            { label: 'もう一度', primary: true, id: 'again', run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
            { label: 'ホーム', id: 'result-home', run: () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()) }
        ], 'result');
    }

    toast(text) {
        const el = $('toast');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

export { GHOSTS };
