/**
 * 画面（タイトル・ゲーム・決めるダイアログ・手元・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import {
    BASIC_SPACES, SPACE_BY_ID, BUILDING_BY_ID, QUEST_BY_ID, INTRIGUE_BY_ID, LORD_BY_ID, CUBES, RESOURCES, RESOURCE_NAME,
    QUEST_TYPE_NAME, FAVOR_OPTIONS, ROUNDS, gainText, buildingText, plotText, lordText
} from './cards.js';
import { meets } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { helpHtml, titleArtHtml } from './help.js';

const SETTINGS_KEY = 'lords-of-waterdeep.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン'];
export const COLORS = ['#d9473b', '#4a86e8', '#3c9f4b', '#e2b72a', '#2bb3b3'];
const RESULT_DELAY_MS = 900;
// 盤面に並べる順（4列）。会館の売り物は会館の後ろ、建てた建物は最後に並べる
const BOARD_ORDER = ['castle', 'shop', 'tower', 'field', 'tavern', 'plinth', 'inn0', 'inn1', 'inn2', 'harbor0', 'harbor1', 'harbor2', 'builders'];
const SPACE_GAIN = {
    castle: '先手番・陰謀1',
    builders: '建てる',
    inn0: 'クエスト・<i class="cb g"></i>2',
    inn1: 'クエスト・陰謀1',
    inn2: '入替・クエスト',
    harbor0: '陰謀を使う',
    harbor1: '陰謀を使う',
    harbor2: '陰謀を使う'
};
const SPECIAL_GAIN = { palace: '大使', zoar: '他の場所', stone: '<i class="cb g"></i>×建物', garden: 'クエスト+4点' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ヒントのボタン（操作の欄と、決めるダイアログに出す）
const HINT_BUTTON = '<button type="button" id="hint" class="icon-btn" data-act="hint" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg></button>';

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5].includes(saved.count) ? saved.count : 3,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'normal'
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

// ---- 図柄 ----

const cube = (k) => `<i class="cb ${k}"></i>`;
const amt = (k, n) => `<span class="amt${n ? '' : ' zero'}">${cube(k)}<b>${n}</b></span>`;

// 資源の並び（要求や報酬）を図柄で
function resHtml(req) {
    return RESOURCES.filter(r => req[r]).map(r => `<span class="amt">${cube(r)}<b>${req[r]}</b></span>`).join('');
}

function gainHtml(g) {
    const parts = [];
    if (g.vp) parts.push(`<span class="amt"><b>${g.vp}点</b></span>`);
    if (g.pay) parts.push(`<span class="amt">−${cube('g')}<b>${g.pay}</b></span>`);
    parts.push(resHtml(g));
    if (g.pick) parts.push(`<span class="amt">${g.pick.types.length === 4 ? '好き' : g.pick.types.map(cube).join('')}<b>${g.pick.n}</b></span>`);
    if (g.intrigue) parts.push(`陰謀${g.intrigue}`);
    if (g.quest) parts.push(`クエスト${g.quest}`);
    if (g.building) parts.push('建物');
    return parts.filter(Boolean).join(' ');
}

function rewardHtml(q) {
    if (q.plot) return `<div class="qrew plot">${q.reward.vp ? `${q.reward.vp}点・` : ''}プロット</div>`;
    return `<div class="qrew">${gainHtml(q.reward)}</div>`;
}

// クエストのカード（小：盤面と手元、big：ダイアログ）
function questCard(id, { big = false, ready = false, lord = null, attrs = '' } = {}) {
    const q = QUEST_BY_ID[id];
    const isLord = lord && lord.types.includes(q.type);
    const cls = ['qc', q.type, big ? 'big' : '', ready ? 'ready' : '', isLord ? 'lord' : ''].filter(Boolean).join(' ');
    const plot = big && q.plot ? `<div class="qrew plot">${q.reward.vp ? `${q.reward.vp}点。` : ''}プロット：${plotText(q.plot)}</div>` : rewardHtml(q);
    return `<button class="${cls}" ${attrs}>
        ${big ? `<span class="qtype">${QUEST_TYPE_NAME[q.type]}</span>` : ''}
        <div class="qn">${escapeHtml(q.name)}</div>
        <div class="qreq gain">${resHtml(q.req)}</div>
        ${plot}
    </button>`;
}

function questText(id) {
    const q = QUEST_BY_ID[id];
    const reward = q.plot ? `${q.reward.vp ? `${q.reward.vp}点。` : ''}プロット：${plotText(q.plot)}` : gainText(q.reward);
    return `<b>${escapeHtml(q.name)}</b>（${QUEST_TYPE_NAME[q.type]}）${gainText(q.req)} → ${reward}`;
}

function spaceTitle(space) {
    return space.startsWith('b:') ? BUILDING_BY_ID[space.slice(2)].name : SPACE_BY_ID[space].name;
}

function spaceText(space) {
    if (space.startsWith('b:')) {
        const b = BUILDING_BY_ID[space.slice(2)];
        return `<b>${b.name}</b>：${buildingText(b)}。持ち主は${gainText(b.owner)}を得る`;
    }
    const s = SPACE_BY_ID[space];
    return `<b>${s.name}</b>：${s.text}`;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.sel = null;            // 置く場所として選んだ場所
        this.info = null;           // 説明を見ているもの（'s:場所'・'q:クエスト'・'h:売り物の番号'）
        this.form = null;           // 決めるダイアログの中身（冒険者の数）
        this.decideKey = null;      // 開いている決めごとの印
        this.dismissedKey = null;   // 盤面を見るために閉じた決めごと
        this.resultTimer = null;
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
                onError: (message) => this.toast(message)
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.sel = null;
        this.info = null;
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
        this.startGame({ players, options: { seed: Math.floor(Math.random() * 2 ** 32) } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        this.decideKey = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        if (!this.controller) return false;
        this.sel = null;
        this.info = null;
        return this.controller.send(command);
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
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
        // 決めるダイアログを閉じたら、盤面を見る扱いにする（決めごとは消さない。下の「選ぶ」で開き直す）
        $('#decide').addEventListener('close', () => {
            // close のイベントは遅れて届く。その間に次の決めごとで開き直していたら、何もしない
            if ($('#decide').open) return;
            if (this.decideKey) this.dismissedKey = this.decideKey;
            this.decideKey = null;
            if (this.view) this.renderActions(this.view);
        });

        $('#board').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-space],[data-sale]');
            if (!tile) return;
            if (tile.dataset.space) this.tapSpace(tile.dataset.space);
            else this.tapInfo(`h:${tile.dataset.sale}`);
        });
        $('#inn').addEventListener('click', (event) => {
            const card = event.target.closest('[data-quest]');
            if (card) this.tapInfo(`q:${card.dataset.quest}`);
        });
        $('#players').addEventListener('click', (event) => {
            const row = event.target.closest('[data-seat]');
            if (row) this.showPlayer(Number(row.dataset.seat));
        });
        $('#me').addEventListener('click', (event) => {
            const card = event.target.closest('[data-quest]');
            if (card) return this.tapInfo(`q:${card.dataset.quest}`);
            if (event.target.closest('[data-act="hand"]')) this.showPlayer(this.view.you);
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'hint') return this.showHint();
            if (button.dataset.act === 'place' && this.sel) this.send({ type: 'place', space: this.sel });
            if (button.dataset.act === 'decide') {
                this.dismissedKey = null;
                this.openDecide(this.view);
            }
        });
        $('#decide').addEventListener('click', (event) => {
            const button = event.target.closest('[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'hint') return this.showHint();
            this.decideButton(button.dataset.act, button.dataset);
        });
    }

    // ---- 入力 ----

    myPlacement() {
        const v = this.view;
        return !!v && !v.pending && v.legal.length > 0;
    }

    tapSpace(space) {
        const v = this.view;
        if (!v) return;
        if (this.myPlacement() && v.legal.includes(space)) {
            if (this.sel === space) {
                this.send({ type: 'place', space });
                return;
            }
            this.sel = space;
            this.info = null;
        } else {
            this.sel = null;
            this.info = this.info === `s:${space}` ? null : `s:${space}`;
        }
        this.render();
    }

    // おすすめの手を、選んだ状態にして光らせる（置く場所か、決めるダイアログの答え）
    showHint() {
        const v = this.view;
        if (!v || !(this.myPlacement() || v.pending?.seat === v.you)) return;
        const command = this.controller?.suggest();
        if (!command) return;
        this.hint = { at: v.commandCount, command };
        if (command.type === 'place') {
            this.sel = command.space;
            this.info = null;
        }
        if (command.type === 'pick') this.form = { cubes: { f: 0, r: 0, w: 0, c: 0, ...command.cubes } };
        if ($('#decide').open) this.renderDecideBody(v);
        this.render();
    }

    markHint() {
        const v = this.view;
        if (this.hint?.at !== v.commandCount) this.hint = null;
        const c = this.hint?.command;
        if (!c) return;
        const mark = (selector) => document.querySelector(selector)?.classList.add('suggested');
        if (c.type === 'place') {
            if (this.sel === c.space) mark('#actions [data-act="place"]');
            return;
        }
        const target = {
            pick: '[data-act="pick"]', quest: `[data-act="quest"][data-index="${c.index}"]`, buy: `[data-act="buy"][data-building="${c.building}"]`,
            intrigue: `[data-act="intrigue"][data-index="${c.index}"]`, opponent: `[data-act="opponent"][data-seat="${c.seat}"]`,
            option: `[data-act="option"][data-index="${c.index}"]`, target: `[data-act="target"][data-space="${c.space}"]`,
            complete: c.quest ? `[data-act="complete"][data-quest="${c.quest}"]` : '#decide-buttons [data-act="complete"]'
        }[c.type];
        if (target) mark(`#decide ${target}`);
    }

    tapInfo(key) {
        this.info = this.info === key ? null : key;
        this.render();
    }

    decideButton(act, data) {
        const p = this.view?.pending;
        if (!p) return;
        let command = null;
        switch (act) {
            case 'plus':
            case 'minus': {
                const k = data.cube;
                const sum = CUBES.reduce((s, c) => s + this.form.cubes[c], 0);
                if (act === 'plus' && sum < p.n) this.form.cubes[k]++;
                if (act === 'minus' && this.form.cubes[k] > 0) this.form.cubes[k]--;
                this.renderDecideBody(this.view);
                return;
            }
            case 'pick': command = { type: 'pick', cubes: { ...this.form.cubes } }; break;
            case 'quest': command = { type: 'quest', index: Number(data.index) }; break;
            case 'buy': command = { type: 'buy', building: data.building }; break;
            case 'intrigue': command = { type: 'intrigue', index: Number(data.index) }; break;
            case 'opponent': command = { type: 'opponent', seat: Number(data.seat) }; break;
            case 'option': command = { type: 'option', index: Number(data.index) }; break;
            case 'target': command = { type: 'target', space: data.space }; break;
            case 'complete': command = { type: 'complete', quest: data.quest ?? null }; break;
            default: return;
        }
        this.decideKey = null;
        $('#decide').close();
        this.send(command);
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const v = this.controller.getView();
        this.view = v;
        if (this.sel && !v.legal.includes(this.sel)) this.sel = null;
        this.renderStatus(v);
        this.renderPlayers(v);
        this.renderBoard(v);
        this.renderInn(v);
        this.renderMe(v);
        this.renderActions(v);
        if (v.pending?.seat === v.you && v.pending.type in DECIDE_TITLE) this.openDecide(v);
        else if ($('#decide').open) {
            this.decideKey = null;
            $('#decide').close();
        }
        if (v.phase === 'over' && !this.resultTimer && !$('#result').open) {
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    renderStatus(v) {
        const who = v.actors[0];
        let text = '';
        if (v.phase === 'over') text = 'ゲーム終了';
        else if (who !== undefined) {
            const name = who === v.you ? 'あなた' : escapeHtml(v.players[who].name);
            const what = v.pending && v.pending.type !== 'complete' ? '' : v.phase === 'reassign' ? '・港から置き直す' : v.phase === 'ambassador' ? '・大使を置く' : '';
            text = `<span class="who${who === v.you ? ' me' : ''}">${name}の番${what}</span>`;
        }
        $('#status').innerHTML = `<span class="round">${Math.min(v.round, ROUNDS)}/${ROUNDS}ラウンド</span>${text}`;
    }

    renderPlayers(v) {
        const others = v.players.filter(p => p.id !== v.you);
        $('#players').innerHTML = others.map(p => `
            <button class="pl${v.actors.includes(p.id) ? ' active' : ''}" data-seat="${p.id}" style="--c:${COLORS[p.id]}">
                <span class="pl-top">${v.firstPlayer === p.id ? '<span class="first" title="先手番">◆</span>' : ''}<span class="pl-name">${escapeHtml(p.name)}</span>${agentsHtml(p, v)}<span class="pl-vp">${p.vp}点</span></span>
                <span class="pl-bottom">${CUBES.map(k => amt(k, p.res[k])).join('')}${amt('g', p.res.g)}<span>Q${p.quests.length}</span><span>陰${p.intrigueCount}</span></span>
            </button>`).join('');
        $('#players').style.gridTemplateColumns = others.length === 1 ? '1fr' : '';
    }

    renderBoard(v) {
        const placing = this.myPlacement();
        const tile = (space) => {
            const occ = v.occupied[space];
            const isBuilding = space.startsWith('b:');
            const b = isBuilding ? BUILDING_BY_ID[space.slice(2)] : null;
            const owner = isBuilding ? v.buildings.find(x => `b:${x.id}` === space).owner : null;
            const gain = isBuilding ? (SPECIAL_GAIN[b.special] ?? gainHtml(b.gain)) : (SPACE_GAIN[space] ?? gainHtml(SPACE_BY_ID[space].gain));
            const name = isBuilding ? b.name : SPACE_BY_ID[space].short;
            const cls = ['tile', isBuilding ? 'building' : 'basic', occ ? 'taken' : '',
                this.sel === space ? 'sel' : placing && v.legal.includes(space) ? 'can' : '',
                this.info === `s:${space}` ? 'info' : ''].filter(Boolean).join(' ');
            const style = owner !== null ? ` style="--c:${COLORS[owner]}"` : '';
            const who = occ ? `<span class="who" style="--c:${COLORS[occ.seat]}">${occ.ambassador ? '大' : ''}</span>` : '';
            return `<button class="${cls}" data-space="${space}"${style}><span class="tile-name">${name}</span><span class="tile-gain gain">${gain}</span>${who}</button>`;
        };
        const sale = (h, i) => {
            if (!h) return '<div class="tile forsale empty"><span class="tile-name">—</span></div>';
            const b = BUILDING_BY_ID[h.id];
            const cls = ['tile', 'forsale', this.info === `h:${i}` ? 'info' : ''].filter(Boolean).join(' ');
            return `<button class="${cls}" data-sale="${i}"><span class="tile-name">${h.vp ? `<span class="badge">${h.vp}点</span>` : ''}${b.name}</span>
                <span class="tile-gain gain"><span class="cost">${cube('g')}${b.cost}</span>${SPECIAL_GAIN[b.special] ?? gainHtml(b.gain)}</span></button>`;
        };
        $('#board').innerHTML = [
            ...BOARD_ORDER.map(tile),
            ...v.hall.map(sale),
            ...v.buildings.map(b => tile(`b:${b.id}`))
        ].join('');
    }

    renderInn(v) {
        const me = v.players[v.you];
        const lord = me.lord ? LORD_BY_ID[me.lord] : null;
        const cards = v.inn.map(id => questCard(id, { lord, attrs: `data-quest="${id}"` }));
        while (cards.length < 4) cards.push('<div class="qc empty">—</div>');
        $('#inn').innerHTML = cards.join('');
        $('#inn').querySelectorAll('[data-quest]').forEach(el => el.classList.toggle('info', this.info === `q:${el.dataset.quest}`));
    }

    renderMe(v) {
        const me = v.players[v.you];
        const lord = me.lord ? LORD_BY_ID[me.lord] : null;
        const active = v.actors.includes(v.you);
        const quests = me.quests.map(id => questCard(id, { lord, ready: meets(me.res, QUEST_BY_ID[id].req), attrs: `data-quest="${id}"` }));
        if (!quests.length) quests.push('<div class="qc empty">クエストなし</div>');
        $('#me').innerHTML = `
            <div class="me-row${active ? ' active' : ''}" style="--c:${COLORS[v.you]}">
                <span class="vp">${me.vp}点</span>${agentsHtml(me, v)}
                ${CUBES.map(k => amt(k, me.res[k])).join('')}${amt('g', me.res.g)}
                <button class="chip" data-act="hand"><svg class="ico" aria-hidden="true"><use href="#i-scroll"/></svg>手元 ${me.intrigue.length}</button>
            </div>
            <div class="qrow mine">${quests.join('')}</div>`;
        $('#me').querySelectorAll('[data-quest]').forEach(el => el.classList.toggle('info', this.info === `q:${el.dataset.quest}`));
    }

    renderActions(v) {
        let desc = '';
        let news = false;
        let button = '';
        const p = v.pending;
        if (this.info) {
            desc = this.infoText(v, this.info);
        } else if (v.phase === 'over') {
            desc = 'ゲーム終了';
        } else if (p?.seat === v.you && p.type in DECIDE_TITLE) {
            desc = DECIDE_TITLE[p.type](p, v);
            button = '<button class="btn primary" data-act="decide">選ぶ</button>';
        } else if (this.myPlacement()) {
            if (this.sel) {
                desc = spaceText(this.sel);
                button = '<button class="btn primary" data-act="place">置く</button>';
            } else {
                desc = v.phase === 'reassign' ? '港のエージェントを置き直す場所を選ぶ' : v.phase === 'ambassador' ? '大使を置く場所を選ぶ' : 'エージェントを置く場所を選ぶ';
            }
        } else {
            news = true;
            desc = v.logs.slice(-2).map(l => escapeHtml(l.text)).join('<br>');
        }
        const hint = this.myPlacement() && !this.info ? HINT_BUTTON : '';
        $('#actions').innerHTML = `<div class="desc${news ? ' news' : ''}">${desc}</div>${hint}${button}`;
        this.markHint();
    }

    infoText(v, key) {
        const [kind, value] = [key.slice(0, 1), key.slice(2)];
        if (kind === 'q') return questText(value);
        if (kind === 's') {
            const occ = v.occupied[value];
            return spaceText(value) + (occ ? `（${occ.seat === v.you ? 'あなた' : escapeHtml(v.players[occ.seat].name)}が置いている）` : '');
        }
        const h = v.hall[Number(value)];
        if (!h) return '';
        const b = BUILDING_BY_ID[h.id];
        return `<b>${b.name}</b>（金貨${b.cost}${h.vp ? `・${h.vp}点つき` : ''}）：${buildingText(b)}。持ち主は${gainText(b.owner)}を得る`;
    }

    // ---- 決めるダイアログ ----

    openDecide(v) {
        const p = v.pending;
        const key = `${v.commandCount}:${p.type}`;
        if (this.decideKey === key || this.dismissedKey === key) return;
        this.decideKey = key;
        this.form = { cubes: { f: 0, r: 0, w: 0, c: 0 } };
        $('#decide-title').textContent = DECIDE_TITLE[p.type](p, v).replace(/<[^>]+>/g, '');
        $('#decide-note').textContent = DECIDE_NOTE[p.type]?.(p, v) ?? '';
        this.renderDecideBody(v);
        const dialog = $('#decide');
        if (!dialog.open) dialog.showModal();
        $('#decide-title').focus();
    }

    renderDecideBody(v) {
        const p = v.pending;
        const me = v.players[v.you];
        const lord = me.lord ? LORD_BY_ID[me.lord] : null;
        let body = '';
        let buttons = '';
        switch (p.type) {
            case 'pick': {
                const sum = CUBES.reduce((s, c) => s + this.form.cubes[c], 0);
                body = `<div class="picks">${p.types.map(k => `<div class="prow">${cube(k)}<span>${RESOURCE_NAME[k]}</span>
                    <button class="step" data-act="minus" data-cube="${k}" ${this.form.cubes[k] ? '' : 'disabled'} aria-label="減らす">−</button>
                    <b>${this.form.cubes[k]}</b>
                    <button class="step" data-act="plus" data-cube="${k}" ${sum < p.n ? '' : 'disabled'} aria-label="増やす">＋</button></div>`).join('')}</div>`;
                buttons = `<button class="btn primary" data-act="pick" ${sum === p.n ? '' : 'disabled'}>決定</button>`;
                break;
            }
            case 'quest':
                body = `<div class="qlist">${v.inn.map((id, i) => questCard(id, { big: true, lord, attrs: `data-act="quest" data-index="${i}"` })).join('')}</div>`;
                break;
            case 'buy':
                body = v.hall.filter(Boolean).map(h => {
                    const b = BUILDING_BY_ID[h.id];
                    const ok = p.free || b.cost <= me.res.g;
                    return `<button class="choice" data-act="buy" data-building="${h.id}" ${ok ? '' : 'disabled'}>
                        <span class="col"><span class="cname">${b.name}${h.vp ? `（${h.vp}点つき）` : ''}</span><span class="ctext">${buildingText(b)}。持ち主は${gainText(b.owner)}</span></span>
                        <span class="right">${p.free ? 'ただ' : `${cube('g')}${b.cost}`}</span></button>`;
                }).join('');
                break;
            case 'intrigue':
                body = me.intrigue.map((id, i) => {
                    const c = INTRIGUE_BY_ID[id];
                    return `<button class="icard" data-act="intrigue" data-index="${i}"><span class="iname">${escapeHtml(c.name)}</span><p>${escapeHtml(c.text)}</p></button>`;
                }).join('');
                break;
            case 'opponent':
                body = p.seats.map(s => {
                    const o = v.players[s];
                    return `<button class="choice" data-act="opponent" data-seat="${s}" style="--c:${COLORS[s]}"><span class="dot"></span><span class="cname">${escapeHtml(o.name)}</span>
                        <span class="right">${o.vp}点${o.quests.some(id => QUEST_BY_ID[id].type === 'mandatory') ? '・義務あり' : ''}</span></button>`;
                }).join('');
                break;
            case 'option':
                body = FAVOR_OPTIONS.map((g, i) => `<button class="choice" data-act="option" data-index="${i}"><span class="gain">${gainHtml(g)}</span><span class="right">${gainText(g)}</span></button>`).join('');
                break;
            case 'target':
                body = p.spaces.map(s => `<button class="choice" data-act="target" data-space="${s}"><span class="col"><span class="cname">${spaceTitle(s)}</span><span class="ctext">${spaceText(s).replace(/<b>.*?<\/b>：/, '')}</span></span></button>`).join('');
                break;
            case 'complete':
                body = `<div class="qlist">${p.quests.map(id => questCard(id, { big: true, lord, attrs: `data-act="complete" data-quest="${id}"` })).join('')}</div>`;
                buttons = '<button class="btn secondary" data-act="complete">達成しない</button>';
                break;
        }
        $('#decide-body').innerHTML = body;
        $('#decide-buttons').innerHTML = HINT_BUTTON + buttons;
        this.markHint();
    }

    // ---- ほかの画面 ----

    showPlayer(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        const mine = seat === v.you;
        const lord = p.lord ? LORD_BY_ID[p.lord] : null;
        const parts = [];
        if (lord) parts.push(`<div class="lord-card"><div class="lname">ロード：${lord.name}</div><p>${lordText(lord)}</p></div>`);
        if (mine) {
            parts.push('<h3>陰謀カード</h3>');
            parts.push(p.intrigue.length
                ? p.intrigue.map(id => `<div class="icard"><span class="iname">${escapeHtml(INTRIGUE_BY_ID[id].name)}</span><p>${escapeHtml(INTRIGUE_BY_ID[id].text)}</p></div>`).join('')
                : '<p class="empty-note">なし（港で使う）</p>');
        } else {
            parts.push(`<p>陰謀カード ${p.intrigueCount}枚・達成したクエスト ${p.completedCount}枚</p>`);
            parts.push('<h3>受けているクエスト</h3>');
            parts.push(p.quests.length ? `<div class="qlist">${p.quests.map(id => questCard(id, { big: true })).join('')}</div>` : '<p class="empty-note">なし</p>');
        }
        if (p.plots.length) {
            parts.push('<h3>プロット</h3>');
            parts.push(`<div class="blist">${p.plots.map(id => `<div class="bline"><span class="bname">${escapeHtml(QUEST_BY_ID[id].name)}</span>${plotText(QUEST_BY_ID[id].plot)}</div>`).join('')}</div>`);
        }
        const owned = v.buildings.filter(b => b.owner === seat);
        if (owned.length) {
            parts.push('<h3>建物</h3>');
            parts.push(`<div class="blist">${owned.map(b => `<div class="bline"><span class="bname">${BUILDING_BY_ID[b.id].name}</span>持ち主は${gainText(BUILDING_BY_ID[b.id].owner)}</div>`).join('')}</div>`);
        }
        if (mine && p.completed.length) {
            parts.push('<h3>達成したクエスト</h3>');
            parts.push(`<div class="blist">${p.completed.map(id => `<div class="bline"><span class="bname">${escapeHtml(QUEST_BY_ID[id].name)}</span>${QUEST_TYPE_NAME[QUEST_BY_ID[id].type]}</div>`).join('')}</div>`);
        }
        $('#detail-title').textContent = mine ? '手元' : p.name;
        $('#detail-body').innerHTML = parts.join('');
        $('#detail').showModal();
    }

    showLog() {
        const logs = this.controller?.game.logs ?? [];
        $('#log-list').innerHTML = logs.map(l => `<li${l.text.startsWith('—') ? ' class="round"' : ''}>${escapeHtml(l.text)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'over') return;
        const won = v.winners.includes(v.you);
        $('#result-title').textContent = won ? (v.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${v.winners.map(s => v.players[s].name).join('と')}の勝ち`;
        const rows = [...v.players].sort((a, b) => b.vp - a.vp).map(p => `
            <tr class="${p.id === v.you ? 'you' : ''}${v.winners.includes(p.id) ? ' win' : ''}">
                <th><span class="dot" style="--c:${COLORS[p.id]}"></span>${escapeHtml(p.name)}</th>
                <td>${p.final.base}</td><td>${p.final.cubes}</td><td>${p.final.gold}</td><td>${p.final.lord}</td><td class="total">${p.final.total}</td>
            </tr>`).join('');
        const lords = v.players.map(p => `${escapeHtml(p.name)}：${LORD_BY_ID[p.lord].name}（${lordText(LORD_BY_ID[p.lord]).replace('終わりに、', '')}）`).join('<br>');
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>ゲーム中</th><th>冒険者</th><th>金貨</th><th>ロード</th><th>合計</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="lords">${lords}</div>`;
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }
}

function agentsHtml(p, v) {
    return `<span class="agents">${Array.from({ length: p.agents }, (_, i) => `<i class="agent${i < p.agentsLeft ? '' : ' used'}" style="--c:${COLORS[p.id]}"></i>`).join('')}</span>`;
}

const typesText = (types) => (types.length === 4 ? '好きな冒険者' : types.map(t => RESOURCE_NAME[t]).join('か'));

const DECIDE_TITLE = {
    pick: (p) => `${typesText(p.types)}を${p.n}体選ぶ`,
    quest: (p) => (p.garden ? 'クエストを取る（この番に達成すると4点）' : 'クエストを取る'),
    buy: (p) => (p.free ? '建物をただで建てる' : '建てる建物を選ぶ'),
    intrigue: () => '使う陰謀カードを選ぶ',
    opponent: (p) => (p.mandatory ? '義務クエストを渡す相手を選ぶ' : `${gainText(p.give)}を渡す相手を選ぶ`),
    option: () => '頼みごと：得るものを選ぶ',
    target: () => 'ゾアスターで使う場所を選ぶ',
    complete: () => 'クエストを達成する'
};

const DECIDE_NOTE = {
    complete: () => '番の終わりに1枚だけ達成できる'
};
