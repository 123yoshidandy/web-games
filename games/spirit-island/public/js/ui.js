/**
 * 画面（タイトル・ゲーム・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 * 下の欄は「見ている精霊」（タブで切り替え）の、今の段階でできることを出す
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import {
    SPIRITS, SPIRIT_KEYS, CARD, INNATE, ELEMENTS, ELEMENT_NAMES, ELEMENT_SHORT, TERRAINS, LEVELS, INVADER_CARD, INVADER_NAMES,
    BOARD_LETTERS, CONDITIONS, FEAR_CARD, growthPartText, invaderCardName
} from './data.js';
import { mapSvg, titleArtSvg, TERRAIN_COLORS } from './map.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の精霊だけを動かす。ヒントはない
function onlineAdapter(net) {
    const mySeat = () => net.getView()?.you;
    return {
        isOnline: true,
        mode: 'team',
        net,
        getView: () => net.getView(),
        canControl: (seat) => seat === mySeat(),
        send: (seat, command) => seat === mySeat() && net.send(command),
        suggest: () => null,
        scheduleCpu() {},
        stop: () => net.stop()
    };
}

const SETTINGS_KEY = 'spirit-island.settings';
const CPU_NAMES = ['ハル', 'ミナ', 'ソラ'];
const ELEMENT_COLORS = { sun: '#f2c230', moon: '#a7b2d6', fire: '#e2572b', air: '#bfe0ee', water: '#3d8fd9', earth: '#8b6b3e', plant: '#4caf50', animal: '#c0392b' };
const TERRAIN_SHORT = { M: '山', W: '湿', J: '密', S: '砂' };
const PHASE_NAMES = { spirit: '精霊', fast: '速い力', invader: '侵略者', slow: '遅い力' };
const RESULT_TEXT = {
    terror: '恐怖に駆られた侵略者は、島を去った。',
    fear: '恐怖カードをすべて得て、侵略者は島を捨てた。',
    blight: '荒廃が島を覆いつくした。',
    presence: '精霊の1つが、島から消えてしまった。',
    time: '侵略者の勢いを止められなかった。'
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const landLabel = (v, id) => `${BOARD_LETTERS[v.lands[id].board]}${v.lands[id].num}`;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>'
};

function loadSettings() {
    const fallback = { count: 2, spirit: 'river', mode: 'team', level: 'normal' };
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : fallback.count,
            spirit: SPIRIT_KEYS.includes(s.spirit) ? s.spirit : fallback.spirit,
            mode: s.mode === 'all' ? 'all' : 'team',
            level: Object.hasOwn(LEVELS, s.level) ? s.level : fallback.level
        };
    } catch {
        return fallback;
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

const elementChip = (e, n = 0) => `<i class="el" style="--ec:${ELEMENT_COLORS[e]}" title="${ELEMENT_NAMES[e]}">${ELEMENT_SHORT[e]}${n > 1 ? `<small>${n}</small>` : ''}</i>`;

// 力のカードの札
function cardHtml(id, { extra = '', attrs = '' } = {}) {
    const c = CARD[id];
    return `<button type="button" class="pcard ${c.speed} ${c.major ? 'major' : ''} ${extra}" data-card="${id}" ${attrs}>`
        + `<span class="cost">${c.cost}</span><b class="cname">${c.name}</b>`
        + `<span class="els">${c.elements.map(e => elementChip(e)).join('')}</span>`
        + `<span class="ctext">${c.text}</span></button>`;
}

function rangeText(range, when) {
    const target = CONDITIONS[when ?? 'any']?.text ?? '';
    if (!range) return '精霊を対象';
    return `${range.from === 'sacred' ? '聖地' : '存在'}から範囲${range.n}・${target}`;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.focus = null;        // 下の欄で見ている精霊
        this.pick = null;         // 地図で土地を選んでいるとき：{ text, lands: Set, onPick }
        this.selected = new Set(); // カードを使う段で選んでいるカード
        this.track = null;        // 存在を取る列
        this.hint = null;
        this.resultShown = false;
        this.newsFrom = 0;
        ['home', 'open-help-game', 'open-log'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log' }[id]];
        });
        $('title-art').innerHTML = titleArtSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU の精霊
        this.online = new NetplayLobby({
            title: 'スピリット・アイランド',
            game: 'spirit-island',
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
        const seg = (id, key, parse = (v) => v) => $(id).addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
            music.play('select');
            this.renderTitle();
        });
        seg('count', 'count', Number);
        seg('spirit', 'spirit');
        seg('mode', 'mode');
        seg('level', 'level');
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
        mark('spirit', 'spirit');
        mark('mode', 'mode');
        mark('level', 'level');
        $('mode-row').classList.toggle('off', this.settings.count === 1);
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
        const { count, spirit, mode, level } = this.settings;
        const spirits = [spirit, ...SPIRIT_KEYS.filter(k => k !== spirit)].slice(0, count);
        const team = mode === 'team' || count === 1;
        const players = spirits.map((key, i) => (team
            ? { name: i === 0 ? 'あなた' : CPU_NAMES[i - 1], isCPU: i > 0 }
            : { name: `${i + 1}P`, isCPU: false }));
        clearSavedGame();
        this.startWith({ players, options: { level, spirits }, mode: team ? 'team' : 'all' });
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

    // ローカル対戦とオンライン対戦で同じ：前の対局の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        this.resultShown = false;
        this.newsFrom = 0;
        this.focus = null;
        this.pick = null;
        this.hint = null;
        this.selected = new Set();
        this.closeSheet();
        this.controller = controller;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.view = null;
        this.update();
    }

    // ---- ゲーム ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた精霊は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('hint').addEventListener('click', () => this.showHint());
        $('track').addEventListener('click', () => this.openInvaders());
        $('status').addEventListener('click', () => this.openInvaders());
        $('map').addEventListener('click', event => {
            const g = event.target.closest('[data-land]');
            if (g) this.tapLand(Number(g.dataset.land));
        });
        $('tabs').addEventListener('click', event => {
            const tab = event.target.closest('[data-seat]');
            if (!tab) return;
            this.focus = Number(tab.dataset.seat);
            this.pick = null;
            this.selected = new Set();
            music.play('select');
            this.render();
        });
        $('spirit-bar').addEventListener('click', event => {
            if (event.target.closest('[data-spirit-info]')) this.openSpirit(this.focusSeat());
        });
        $('actions').addEventListener('click', event => this.tapAction(event));
        this.bindLongPress($('actions'));
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && this.sheetKind !== 'result') this.closeSheet();
        });
        $('sheet').addEventListener('click', event => {
            const item = event.target.closest('[data-i]');
            if (item && !item.disabled && this.sheetHandlers) this.sheetHandlers[Number(item.dataset.i)]?.();
        });
    }

    // カードの長押しで全文を出す。長押しのあとの click は捨てる
    bindLongPress(root) {
        let timer = null;
        root.addEventListener('pointerdown', event => {
            const el = event.target.closest('[data-card]');
            if (!el) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                this.suppressClick = true;
                this.openCard(el.dataset.card);
            }, 480);
        });
        ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach(type => root.addEventListener(type, event => {
            if (type === 'pointermove' && Math.abs(event.movementX) + Math.abs(event.movementY) < 4) return;
            clearTimeout(timer);
        }));
        root.addEventListener('click', event => {
            if (this.suppressClick) {
                this.suppressClick = false;
                event.stopPropagation();
                event.preventDefault();
            }
        }, true);
    }

    can(seat) {
        return !!this.controller?.canControl(seat);
    }

    // 見ている精霊：選んだ精霊か、操作を待っている自分の精霊
    focusSeat() {
        const v = this.view;
        if (!v) return 0;
        if (this.focus !== null && v.spirits[this.focus]) return this.focus;
        const mine = v.spirits.filter(sp => this.can(sp.seat)).map(sp => sp.seat);
        return mine.find(seat => v.actors.includes(seat)) ?? mine[0] ?? (v.you ?? 0);
    }

    send(seat, command) {
        this.sending = true;
        const before = this.view;
        const ok = this.controller?.send(seat, command) ?? false;
        this.sending = false;
        if (ok) {
            this.pick = null;
            this.hint = null;
            if (command.type === 'play') this.selected = new Set();
            const v = this.view;
            if (!v?.result) music.play(this.commandSound(command, before, v));
        }
        return ok;
    }

    // 自分の操作の音（1つの操作に1つ）
    commandSound(command, before, after) {
        if (command.type === 'power') {
            const destroyed = (after?.events ?? []).some(e => e.type === 'destroy');
            return destroyed ? 'capture' : 'place';
        }
        if (command.type === 'play') return command.cards.length ? 'pay' : 'select';
        return { growth: 'select', presence: 'place', deck: 'draw', pick: 'gain', forget: 'pay', done: 'select' }[command.type] ?? 'select';
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        const prev = this.view;
        this.view = v;
        if (prev && (prev.phase !== v.phase || prev.turn !== v.turn)) {
            this.pick = null;
            this.selected = new Set();
        }
        // 全員を操作するときは、見ている精霊の番が終わったら、次に操作を待つ精霊へ移る
        if (this.focus !== null && this.can(this.focus) && !v.actors.includes(this.focus)) {
            const next = v.actors.find(seat => this.can(seat));
            if (next !== undefined) this.focus = next;
        }
        if (this.pick && !this.pickStillValid()) this.pick = null;
        this.render();
        this.playUpdateSound(prev);
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.openResult(), 700);
        }
    }

    pickStillValid() {
        const v = this.view;
        const seat = this.pick?.seat;
        return seat !== undefined && v.actors.includes(seat) && this.can(seat);
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。協力ゲームなので、勝ち負けは全員に win・lose
    playUpdateSound(prev) {
        const v = this.view;
        if (!prev) return;
        if (v.result) {
            if (!prev.result) music.play(v.result.won ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const mine = v.spirits.filter(sp => this.can(sp.seat)).map(sp => sp.seat);
        const myTurnNow = mine.some(seat => v.actors.includes(seat)) && !mine.some(seat => prev.actors.includes(seat));
        if (myTurnNow) music.play('turn');
        else if (prev.phase !== v.phase || prev.turn !== v.turn) music.play('notify');
    }

    // ---- 描画 ----

    render() {
        const v = this.view;
        if (!v) return;
        const seat = this.focusSeat();
        const sp = v.spirits[seat];
        this.renderStatus(v);
        this.renderTrack(v);
        // 地図：選んでいる土地の候補と、ヒントの土地
        let picks = this.pick?.lands ?? null;
        if (!picks && sp.prompt?.kind === 'presence' && this.can(seat) && v.actors.includes(seat)) picks = new Set(sp.presenceLands);
        const hintLand = this.hintCommand(seat);
        const recommended = hintLand?.command?.land ?? null;
        const recommendedDest = this.pick?.dest && hintLand?.command?.dest !== undefined ? hintLand.command.dest : null;
        $('map').innerHTML = mapSvg(v, { picks, recommended: recommendedDest ?? recommended, selected: this.pick?.land ?? null });
        this.renderTabs(v, seat);
        this.renderSpiritBar(v, sp);
        this.renderActions(v, sp);
        this.renderNews(v);
        this.markHint(v, seat);
        $('hint').hidden = !this.controller || !!v.result || Boolean(this.controller.isOnline) || !this.can(seat) || !v.actors.includes(seat);
    }

    renderStatus(v) {
        const phase = v.result ? (v.result.won ? '勝利' : '敗北') : `${v.turn}<small>T</small> ${PHASE_NAMES[v.phase]}`;
        const tl = ['Ⅰ', 'Ⅱ', 'Ⅲ'][v.fear.tl - 1];
        // 恐怖：段階と、次の恐怖カードまでの溜まり。得た恐怖カードの数は小さく
        $('status').innerHTML = `<span class="chip phase">${phase}</span>`
            + `<span class="chip fear" title="恐怖の段階・次の恐怖カードまで・得た恐怖カード"><b>恐怖${tl}</b>${v.fear.gen}/${v.fear.pool}<small>札${v.fear.earnedCount}${v.fear.pending ? `+${v.fear.pending}` : ''}</small></span>`
            + `<span class="chip blight${v.blight.pool <= 2 ? ' warn' : ''}" title="荒廃カードの残り"><svg viewBox="0 0 20 20"><use href="#sym-B"/></svg>${v.blight.pool}${v.blight.flipped ? '<small>裏</small>' : ''}</span>`;
    }

    renderTrack(v) {
        const slot = (label, id, cls) => {
            if (!id) return `<span class="slot ${cls}"><small>${label}</small><span class="none">―</span></span>`;
            const card = INVADER_CARD[id];
            const sw = card.coastal ? '<i class="sw coast"></i>' : card.terrains.map(t => `<i class="sw" style="background:${TERRAIN_COLORS[t]}"></i>`).join('');
            const name = card.coastal ? '海沿い' : card.terrains.map(t => TERRAIN_SHORT[t]).join('・');
            return `<span class="slot ${cls}"><small>${label}</small>${sw}<b>${name}</b></span>`;
        };
        const stage = v.invader.nextStage ? ['Ⅰ', 'Ⅱ', 'Ⅲ'][v.invader.nextStage - 1] : '―';
        $('track').innerHTML = slot('荒らし', v.invader.ravage, 'ravage') + slot('建設', v.invader.build, 'build')
            + `<span class="slot explore"><small>探検</small><b>${stage}</b><small>残${v.invader.deckCount}</small></span>`;
    }

    renderTabs(v, seat) {
        if (v.spirits.length === 1) {
            $('tabs').innerHTML = '';
            $('tabs').hidden = true;
            return;
        }
        $('tabs').hidden = false;
        $('tabs').innerHTML = v.spirits.map(sp => {
            const def = SPIRITS[sp.key];
            const waiting = v.actors.includes(sp.seat);
            const name = escapeHtml(v.players[sp.seat].name);
            return `<button type="button" class="tab${sp.seat === seat ? ' on' : ''}${waiting ? ' waiting' : ''}" data-seat="${sp.seat}" style="--sc:${def.color}">`
                + `<i class="dot"></i><b>${def.short}</b><small>${name}</small></button>`;
        }).join('');
    }

    renderSpiritBar(v, sp) {
        const def = SPIRITS[sp.key];
        const els = ELEMENTS.filter(e => sp.elements[e] > 0).map(e => elementChip(e, sp.elements[e])).join('');
        $('spirit-bar').innerHTML = `<button type="button" class="spirit-name" data-spirit-info style="--sc:${def.color}"><i class="dot"></i>${def.name}</button>`
            + `<span class="stat" title="エネルギー（毎ターン +${sp.energyValue}）"><b class="en">${sp.energy}</b><small>+${sp.energyValue}</small></span>`
            + `<span class="stat" title="使えるカードの枚数"><b class="cp">${sp.cardPlays}</b><small>枚</small></span>`
            + `<span class="els">${els}</span>`;
    }

    renderNews(v) {
        const logs = v.logs.filter(l => l.kind !== 'phase').slice(-2);
        $('news').innerHTML = logs.map(l => `<p class="${l.kind}">${escapeHtml(l.text)}</p>`).join('');
    }

    renderActions(v, sp) {
        const seat = sp.seat;
        const mine = this.can(seat);
        const html = [];
        if (v.result) {
            html.push(`<p class="msg">${v.result.won ? '勝利' : '敗北'}：${RESULT_TEXT[v.result.reason]}</p>`);
            html.push('<div class="row"><button type="button" class="btn primary" data-act="result">結果を見る</button></div>');
        } else if (this.pick) {
            html.push(`<p class="msg pick-msg">${this.pick.text}</p><div class="row"><button type="button" class="btn secondary" data-act="cancel-pick">やめる</button></div>`);
        } else if (!mine) {
            html.push(`<p class="msg">${this.otherStatus(v, sp)}</p>`);
            if (sp.played.length) html.push(`<div class="cards">${sp.played.map(id => cardHtml(id, { extra: sp.used.includes(`c:${id}`) ? 'used' : '' })).join('')}</div>`);
        } else if (v.phase === 'spirit') {
            html.push(this.spiritPhaseHtml(v, sp));
        } else if (v.phase === 'fast' || v.phase === 'slow') {
            html.push(this.powerPhaseHtml(v, sp));
        }
        $('actions').innerHTML = html.join('');
    }

    otherStatus(v, sp) {
        const def = SPIRITS[sp.key];
        if (v.phase === 'spirit') {
            if (sp.step === 'growth') return `${def.short}：成長を選んでいます`;
            if (sp.step === 'grow') return `${def.short}：成長しています`;
            if (sp.step === 'play') return `${def.short}：使うカードを選んでいます`;
            return `${def.short}：準備ができました`;
        }
        return sp.done ? `${def.short}：このフェイズを終えました` : `${def.short}：力を使っています`;
    }

    spiritPhaseHtml(v, sp) {
        const def = SPIRITS[sp.key];
        if (sp.step === 'growth') {
            return '<p class="msg">成長を1つ選ぶ</p><div class="growth">'
                + def.growth.map((parts, i) => `<button type="button" class="gopt" data-act="growth" data-i="${i}">${parts.map(p => `<span>${growthPartText(p)}</span>`).join('')}</button>`).join('')
                + '</div>';
        }
        const p = sp.prompt;
        if (p?.kind === 'presence') {
            const sources = sp.presenceSources;
            if (!this.track || !sources.includes(this.track)) this.track = sources[0];
            const next = {
                energy: () => `エネルギー列 → ${def.energy[sp.energyIdx]}`,
                cards: () => `カード列 → ${def.cards[sp.cardIdx] === 'R' ? '取り戻し' : `${def.cards[sp.cardIdx]}枚`}`,
                destroyed: () => `壊された存在（${sp.destroyed}）`
            };
            return `<p class="msg">存在を置く（範囲${p.range}）：列を選び、光る土地を押す</p><div class="row tracks">`
                + sources.map(src => `<button type="button" class="btn secondary track${this.track === src ? ' on' : ''}" data-act="track" data-track="${src}">${next[src]()}</button>`).join('')
                + '</div>';
        }
        if (p?.kind === 'deck') {
            const minorOk = v.minorCount > 0 || true;
            return '<p class="msg">力のカードを得る</p><div class="row">'
                + `<button type="button" class="btn secondary" data-act="deck" data-deck="minor"${minorOk ? '' : ' disabled'}>小さな力</button>`
                + `<button type="button" class="btn secondary" data-act="deck" data-deck="major">大いなる力<small>（1枚忘れる）</small></button></div>`;
        }
        if (p?.kind === 'pick') {
            return `<p class="msg">1枚を選ぶ（${p.deck === 'major' ? '大いなる力' : '小さな力'}）</p><div class="cards">${p.cards.map(id => cardHtml(id, { attrs: 'data-act="pick"' })).join('')}</div>`;
        }
        if (p?.kind === 'forget') {
            const pool = [...sp.hand, ...sp.discard].filter(id => id !== p.gained);
            return `<p class="msg">忘れるカードを1枚選ぶ</p><div class="cards">${pool.map(id => cardHtml(id, { attrs: 'data-act="forget"' })).join('')}</div>`;
        }
        if (sp.step === 'play') {
            [...this.selected].forEach(id => { if (!sp.hand.includes(id)) this.selected.delete(id); });
            const cost = [...this.selected].reduce((a, id) => a + CARD[id].cost, 0);
            const over = cost > sp.energy || this.selected.size > sp.cardPlays;
            return `<p class="msg">使うカードを選ぶ（${sp.cardPlays}枚まで）${sp.discard.length ? `<small>捨て札${sp.discard.length}</small>` : ''}</p>`
                + `<div class="cards">${sp.hand.map(id => cardHtml(id, { extra: this.selected.has(id) ? 'chosen' : '', attrs: 'data-act="toggle"' })).join('')}</div>`
                + `<div class="row"><button type="button" class="btn primary" data-act="play"${over ? ' disabled' : ''}>${this.selected.size ? `使う（費用${cost}）` : 'カードを使わない'}</button></div>`;
        }
        return `<p class="msg">ほかの精霊を待っています</p>${sp.played.length ? `<div class="cards">${sp.played.map(id => cardHtml(id)).join('')}</div>` : ''}`;
    }

    powerPhaseHtml(v, sp) {
        if (sp.done) return `<p class="msg">ほかの精霊を待っています</p>${sp.played.length ? `<div class="cards">${sp.played.map(id => cardHtml(id, { extra: sp.used.includes(`c:${id}`) ? 'used' : '' })).join('')}</div>` : ''}`;
        const tiles = sp.powers.map((p, i) => {
            const [kind, id] = p.power.split(':');
            if (kind === 'i') {
                const inn = INNATE[id];
                return `<button type="button" class="pcard innate ${inn.speed}" data-act="power" data-i="${i}"><b class="cname">${inn.name}</b><span class="ctext">生まれ持つ力・段${sp.innateLevel}</span></button>`;
            }
            return cardHtml(id, { extra: `${kind === 'r' ? 'repeat' : ''}${p.swift ? ' swift' : ''}`, attrs: `data-act="power" data-i="${i}"` });
        });
        return `<p class="msg">${v.phase === 'fast' ? '速い力' : '遅い力'}を使う</p><div class="cards">${tiles.join('')}</div>`
            + '<div class="row"><button type="button" class="btn secondary" data-act="done">このフェイズを終える</button></div>';
    }

    // ---- 操作 ----

    tapAction(event) {
        const el = event.target.closest('[data-act]');
        if (!el || el.disabled) return;
        const v = this.view;
        const seat = this.focusSeat();
        const sp = v.spirits[seat];
        const act = el.dataset.act;
        if (act === 'result') return this.openResult();
        if (act === 'cancel-pick') {
            this.pick = null;
            music.play('cancel');
            return this.render();
        }
        if (!this.can(seat)) return;
        if (act === 'growth') this.send(seat, { type: 'growth', option: Number(el.dataset.i) });
        else if (act === 'track') {
            this.track = el.dataset.track;
            music.play('select');
            this.render();
        } else if (act === 'deck') this.send(seat, { type: 'deck', deck: el.dataset.deck });
        else if (act === 'pick') this.send(seat, { type: 'pick', card: el.dataset.card });
        else if (act === 'forget') this.send(seat, { type: 'forget', card: el.dataset.card });
        else if (act === 'toggle') {
            const id = el.dataset.card;
            if (this.selected.has(id)) this.selected.delete(id);
            else this.selected.add(id);
            music.play('select');
            this.render();
        } else if (act === 'play') this.send(seat, { type: 'play', cards: [...this.selected] });
        else if (act === 'done') this.send(seat, { type: 'done' });
        else if (act === 'power') this.startPower(seat, sp.powers[Number(el.dataset.i)]);
    }

    // 力を選んだ：精霊が対象ならシートで選び、土地が対象なら地図で選ぶ（押し出す力は、続けて押し出す先を選ぶ）
    startPower(seat, power) {
        if (!power) return;
        const v = this.view;
        music.play('select');
        if (power.target === 'spirit') {
            const items = power.targets.map(t => ({ label: `${SPIRITS[v.spirits[t.spirit].key].name}${t.spirit === seat ? '（自分）' : ''}`, run: () => this.send(seat, { type: 'power', power: power.power, spirit: t.spirit }) }));
            this.openSheet({ kind: 'spirit-target', title: `${power.name}の対象`, html: '', items, closeLabel: 'やめる' });
            return;
        }
        const extra = new Map(power.targets.map(t => [t.land, t.extra]));
        this.pick = {
            seat,
            text: `${power.name}：対象の土地を選ぶ${[...extra.values()].some(x => x) ? '（範囲の外のダハンの土地はエネルギー1）' : ''}`,
            lands: new Set(extra.keys()),
            onPick: (land) => {
                const L = v.lands[land];
                const pushable = L.inv.length > 0 || L.dahan.length > 0;
                if (power.push && pushable) {
                    this.pick = {
                        seat, land, dest: true,
                        text: `${power.name}：押し出す先を選ぶ（${landLabel(v, land)} のとなり）`,
                        lands: new Set(L.adj),
                        onPick: (dest) => this.send(seat, { type: 'power', power: power.power, land, dest })
                    };
                    music.play('select');
                    this.render();
                    return;
                }
                this.send(seat, { type: 'power', power: power.power, land });
            }
        };
        this.render();
    }

    tapLand(id) {
        const v = this.view;
        if (!v) return;
        const seat = this.focusSeat();
        const sp = v.spirits[seat];
        if (this.pick) {
            if (!this.pick.lands.has(id)) return;
            this.pick.onPick(id);
            return;
        }
        if (sp.prompt?.kind === 'presence' && this.can(seat) && v.actors.includes(seat) && sp.presenceLands.includes(id)) {
            const track = sp.presenceSources.includes(this.track) ? this.track : sp.presenceSources[0];
            this.send(seat, { type: 'presence', track, land: id });
            return;
        }
        this.openLand(id);
    }

    // ---- ヒント ----

    hintCommand(seat) {
        const v = this.view;
        if (!this.hint || this.hint.at !== this.hintKey(v, seat)) return null;
        return this.hint;
    }

    hintKey(v, seat) {
        const sp = v.spirits[seat];
        return JSON.stringify([v.logTotal, v.phase, seat, sp.step, sp.prompt, sp.used, sp.done]);
    }

    showHint() {
        const v = this.view;
        const seat = this.focusSeat();
        const h = this.controller?.suggest(seat);
        if (!v || !h) {
            this.toast('今はおすすめの手がありません');
            return;
        }
        this.hint = { at: this.hintKey(v, seat), ...h };
        music.play('select');
        if (h.command.type === 'play') this.selected = new Set(h.command.cards);
        if (h.command.type === 'presence') this.track = h.command.track;
        if (h.command.type === 'power' && h.command.land !== undefined) {
            const power = v.spirits[seat].powers.find(p => p.power === h.command.power);
            if (power) this.startPower(seat, power);
            this.hint = { at: this.hintKey(v, seat), ...h };
        }
        this.toast(`おすすめ：${this.hintText(v, seat, h.command)}`);
        this.render();
    }

    hintText(v, seat, c) {
        const sp = v.spirits[seat];
        const def = SPIRITS[sp.key];
        const power = (p) => {
            const [kind, id] = p.split(':');
            return kind === 'i' ? INNATE[id].name : CARD[id].name;
        };
        return ({
            growth: () => `成長「${def.growth[c.option].map(growthPartText).join('・')}」`,
            presence: () => `${landLabel(v, c.land)} に存在（${c.track === 'energy' ? 'エネルギー列' : c.track === 'cards' ? 'カード列' : '壊された存在'}から）`,
            deck: () => (c.deck === 'major' ? '大いなる力を得る' : '小さな力を得る'),
            pick: () => `「${CARD[c.card].name}」を取る`,
            forget: () => `「${CARD[c.card].name}」を忘れる`,
            play: () => (c.cards.length ? c.cards.map(id => CARD[id].name).join('・') : 'カードを使わない'),
            power: () => `${power(c.power)}を${c.land !== undefined ? landLabel(v, c.land) : SPIRITS[v.spirits[c.spirit].key].short}に${c.dest !== undefined ? `（${landLabel(v, c.dest)}へ押し出す）` : ''}`,
            done: () => 'このフェイズを終える'
        }[c.type] ?? (() => c.type))();
    }

    // ヒントの印（その場面のあいだだけ）
    markHint(v, seat) {
        const h = this.hintCommand(seat);
        if (!h) return;
        const c = h.command;
        const mark = (el) => el?.classList.add('recommended');
        const act = $('actions');
        if (c.type === 'growth') mark(act.querySelector(`[data-act="growth"][data-i="${c.option}"]`));
        if (c.type === 'presence') mark(act.querySelector(`[data-track="${c.track}"]`));
        if (c.type === 'deck') mark(act.querySelector(`[data-deck="${c.deck}"]`));
        if (c.type === 'pick' || c.type === 'forget') mark(act.querySelector(`[data-card="${c.card}"]`));
        if (c.type === 'play') mark(act.querySelector('[data-act="play"]'));
        if (c.type === 'done') mark(act.querySelector('[data-act="done"]'));
        if (c.type === 'power' && c.spirit !== undefined) {
            const i = v.spirits[seat].powers.findIndex(p => p.power === c.power);
            mark(act.querySelector(`[data-act="power"][data-i="${i}"]`));
        }
    }

    // ---- シート ----

    openSheet({ kind, title, html, items = [], buttons = [], closeLabel = '閉じる' }) {
        this.sheetKind = kind;
        this.sheetHandlers = [];
        $('sheet-title').textContent = title;
        const list = items.map(item => {
            const i = this.sheetHandlers.push(() => {
                this.closeSheet();
                item.run();
            }) - 1;
            return `<button type="button" class="btn secondary item" data-i="${i}">${escapeHtml(item.label)}</button>`;
        }).join('');
        $('sheet-body').innerHTML = html + (list ? `<div class="items">${list}</div>` : '');
        const btns = [...buttons, ...(closeLabel ? [{ label: closeLabel, run: () => {} }] : [])].map(b => {
            const i = this.sheetHandlers.push(() => {
                this.closeSheet();
                b.run();
            }) - 1;
            return `<button type="button" class="btn ${b.primary ? 'primary' : 'secondary'}" data-i="${i}"${b.id ? ` id="${b.id}"` : ''}>${escapeHtml(b.label)}</button>`;
        }).join('');
        $('sheet-buttons').innerHTML = btns;
        $('overlay').hidden = false;
        $('sheet').scrollTop = 0;
    }

    closeSheet() {
        $('overlay').hidden = true;
        this.sheetKind = null;
        this.sheetHandlers = null;
    }

    openHelp() {
        this.openSheet({ kind: 'help', title: '遊び方', html: `<div class="help" id="help">${HELP_HTML}</div>` });
    }

    openLog() {
        const v = this.view;
        if (!v) return;
        const rows = [...v.logs].reverse().map(l => `<li class="${l.kind}">${escapeHtml(l.text)}</li>`).join('');
        this.openSheet({ kind: 'log', title: '記録', html: `<ul class="log" id="log">${rows}</ul>` });
    }

    openCard(id) {
        const c = CARD[id];
        if (!c) return;
        const kind = c.major ? '大いなる力' : c.minor ? '小さな力' : `${SPIRITS[c.unique]?.short ?? ''}のカード`;
        this.openSheet({
            kind: 'card',
            title: c.name,
            html: `<div class="card-detail">${cardHtml(id, { extra: 'big' })}<p class="sheet-sub">${kind}・${c.speed === 'fast' ? '速い' : '遅い'}・費用${c.cost}・${rangeText(c.range, c.when)}</p></div>`
        });
    }

    openLand(id) {
        const v = this.view;
        const L = v.lands[id];
        const count = (k) => L.inv.filter(p => p.k === k).length;
        const rows = [];
        ['C', 'T', 'E'].forEach(k => { if (count(k)) rows.push(`${INVADER_NAMES[k]} ${count(k)}`); });
        if (L.dahan.length) rows.push(`ダハン ${L.dahan.length}`);
        if (L.blight) rows.push(`荒廃 ${L.blight}`);
        if (L.defend) rows.push(`防御 ${L.defend}`);
        L.presence.forEach((p, seat) => { if (p) rows.push(`${SPIRITS[v.spirits[seat].key].short}の存在 ${p}${v.spirits[seat].sacred.includes(id) ? '（聖地）' : ''}`); });
        const flags = [];
        if (L.flags.skipAll) flags.push('このターン侵略者は何もしない');
        if (L.flags.skipBuild) flags.push('建設しない');
        if (L.flags.skipRavage) flags.push('荒らさない');
        if (L.flags.skipExplore) flags.push('探検しない');
        if (L.flags.dahanSafe) flags.push('ダハンはダメージを受けない');
        this.openSheet({
            kind: 'land',
            title: `${landLabel(v, id)}・${TERRAINS[L.terrain]}${L.coastal ? '（海沿い）' : ''}`,
            html: `<p class="sheet-text">${rows.length ? rows.join('　') : '何もない'}</p>${flags.length ? `<p class="sheet-sub">${flags.join('・')}</p>` : ''}`
        });
    }

    openInvaders() {
        const v = this.view;
        if (!v) return;
        const resolved = v.fear.resolved.map(id => `<li>${FEAR_CARD[id].name}</li>`).join('');
        this.openSheet({
            kind: 'invaders',
            title: '侵略者と恐怖',
            html: `<p class="sheet-text">次の荒らし：${v.invader.ravage ? invaderCardName(v.invader.ravage) : 'なし'}<br>次の建設：${v.invader.build ? invaderCardName(v.invader.build) : 'なし'}<br>探検の山：残り${v.invader.deckCount}枚${v.invader.nextStage ? `（次は段階${['Ⅰ', 'Ⅱ', 'Ⅲ'][v.invader.nextStage - 1]}）` : ''}</p>`
                + `<p class="sheet-text">恐怖：段階${v.fear.tl}・溜まり ${v.fear.gen}/${v.fear.pool}・得たカード ${v.fear.earnedCount}/${v.fear.total}（まだ明かしていないもの ${v.fear.pending}）</p>`
                + `<p class="sheet-sub">勝ちの条件：${['島に侵略者が1つもいない', '町と都市がない', '都市がない'][v.fear.tl - 1]}</p>`
                + `<p class="sheet-text">荒廃カード：残り${v.blight.pool}${v.blight.flipped ? '（裏返った。尽きると負け）' : '（尽きると裏返る）'}</p>`
                + (resolved ? `<p class="sheet-sub">明かした恐怖カード</p><ul class="log">${resolved}</ul>` : '')
        });
    }

    openSpirit(seat) {
        const v = this.view;
        const sp = v.spirits[seat];
        const def = SPIRITS[sp.key];
        const trackHtml = (values, idx) => `<div class="ptrack">${values.map((val, i) => `<span class="${i < idx ? 'open' : 'covered'}">${val === 'R' ? '戻' : val}</span>`).join('')}</div>`;
        const innate = def.innate;
        const levels = innate.levels.map((lv, i) => `<li class="${sp.innateLevel > i ? 'met' : ''}"><span class="need">${Object.entries(lv.need).map(([e, n]) => elementChip(e, n)).join('')}</span>${lv.text}</li>`).join('');
        const list = (ids) => (ids.length ? ids.map(id => CARD[id].name).join('・') : 'なし');
        this.openSheet({
            kind: 'spirit',
            title: def.name,
            html: `<p class="sheet-sub">エネルギーの列（毎ターン得る）</p>${trackHtml(def.energy, sp.energyIdx)}`
                + `<p class="sheet-sub">カードの列（使える枚数。「戻」は毎ターン捨て札を1枚手札へ）</p>${trackHtml(def.cards, sp.cardIdx)}`
                + `<p class="sheet-sub">生まれ持つ力「${innate.name}」（${innate.speed === 'fast' ? '速い' : '遅い'}・${rangeText(innate.range, innate.when)}）</p><ul class="innate">${levels}</ul>`
                + `<p class="sheet-sub">特別なルール</p><p class="sheet-text">${def.special}</p>`
                + `<p class="sheet-sub">成長</p><ul class="log">${def.growth.map(parts => `<li>${parts.map(growthPartText).join('・')}</li>`).join('')}</ul>`
                + `<p class="sheet-sub">手札：${list(sp.hand)}<br>捨て札：${list(sp.discard)}<br>壊された存在：${sp.destroyed}</p>`
        });
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        this.openSheet({
            kind: 'result',
            title: v.result.won ? '勝利' : '敗北',
            html: `<p class="sheet-text">${RESULT_TEXT[v.result.reason]}</p><p class="sheet-sub">${LEVELS[v.level].name}・${v.n}体の精霊・${v.turn}ターン目・恐怖カード ${v.fear.earnedCount}/${v.fear.total}</p>`,
            buttons: [
                { label: 'もう一度', primary: true, id: 'rematch', run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
                { label: 'タイトルへ', id: 'result-home', run: () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()) }
            ],
            closeLabel: '盤面を見る'
        });
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), reducedMotion() ? 2600 : 2200);
    }
}
