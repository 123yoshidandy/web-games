/**
 * 画面（タイトル・編成・対戦・シート）
 * 画面はビューだけを見て描く。操作はコントローラーの send(seat, command) に渡す
 * 対戦：自分のポケモンを押す → 光るマスを押して動く → 技を選んで相手を押す（相手を直接押すと、届くマスへ動いて攻撃する）
 */

import LocalGameController, { loadSavedGame, clearSavedGame, CPU_STEP_DELAY_MS } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS, END_REASONS, normalizeTeam } from './game.js';
import {
    W, H, TYPES, MOVES, SPECIES, SPECIES_IDS, CONDITIONS, ACTIONS, MAX_RULES, MOVE_SLOTS, TEAM_SIZE,
    statsOf, moveRangeOf
} from './data.js';
import { reachable, attackOptions, targetsFrom, key, dist } from './rules.js';
import { LEVELS } from './cpu-player.js';
import { loadTeam, saveTeam, defaultTeam } from './team.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult } from './netplay/user-stats.js';

// オンラインのコントローラーを、画面が使うローカルの形（send(seat, command)・canControl(seat) など）に合わせる
// オンラインでは自分の席だけを動かす。ヒントはない
function onlineAdapter(net) {
    const mySeat = () => net.getView()?.you;
    return {
        isOnline: true,
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

const SETTINGS_KEY = 'pokemon-battle.settings';
const AUTO_DELAY_MS = 450;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
    home: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
    help: '<svg viewBox="0 0 24 24" class="line-icon"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
    log: '<svg viewBox="0 0 24 24" class="line-icon"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>'
};

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { level: LEVELS.includes(s.level) ? s.level : 'normal', auto: s.auto === true };
    } catch {
        return { level: 'normal', auto: false };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// ポケモンの丸（タイプの色。2タイプなら斜めに塗り分ける）
const typeBg = (types) => {
    const [a, b = a] = types.map(t => TYPES[t].color);
    return `background:linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`;
};
const typeChips = (types) => types.map(t => `<span class="type" style="background:${TYPES[t].color}">${TYPES[t].name}</span>`).join('');
const avatar = (id, cls = '') => `<span class="avatar ${cls}" style="${typeBg(SPECIES[id].types)}">${SPECIES[id].short}</span>`;
const hpBar = (u) => {
    const r = Math.max(0, u.hp) / u.maxHp;
    return `<span class="hp ${r <= 0.3 ? 'low' : r <= 0.6 ? 'mid' : ''}"><i style="width:${(r * 100).toFixed(1)}%"></i></span>`;
};
const moveLine = (moveId) => {
    const m = MOVES[moveId];
    return `<span class="type" style="background:${TYPES[m.type].color}">${TYPES[m.type].name}</span><b>${m.name}</b><small>${m.cat === 'p' ? '物理' : '特殊'} 威力${m.power} 命中${m.acc} 射程${m.range}</small>`;
};
const rulesText = (rules) => (rules.length ? rules.map((r, i) => `${'①②③'[i]}${CONDITIONS[r.cond]}→${ACTIONS[r.act]}`).join(' ') : 'ルールなし（最も近い敵を攻撃）');

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.team = loadTeam();
        this.controller = null;
        this.view = null;
        this.sel = null;         // 動かしているポケモン：{ unit, to: { x, y }, move: null|0|1 }
        this.inspect = null;     // 見ているポケモン：{ seat, unit }
        this.hint = null;        // { key, command }
        this.autoOnce = false;   // 「全員おまかせ」：このフェイズだけ自動で動かす
        this.autoTimer = null;
        this.resultShown = false;
        this.teamSent = false;
        this.sheetKind = null;
        ['home', 'open-help-game', 'open-log'].forEach(id => {
            $(id).innerHTML = ICONS[{ home: 'home', 'open-help-game': 'help', 'open-log': 'log' }[id]];
        });
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'ポケモン6対6タクティクス',
            game: GAME,
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_STEP_DELAY_MS,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
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
        this.bindTeam();
        this.bindGame();
        window.addEventListener('resize', () => this.fitBoard());
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea, select')) event.preventDefault();
        });
    }

    // ---- タイトル ----

    bindTitle() {
        $('level').addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            music.play('select');
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderTitle();
        });
        $('start').addEventListener('click', () => this.start());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startWith(saved);
        });
        $('open-team').addEventListener('click', () => {
            music.play('select');
            this.showTeam();
        });
        $('open-help-title').addEventListener('click', () => this.openHelp());
        $('online-button').addEventListener('click', () => this.online.open());
    }

    renderTitle() {
        $('level').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === this.settings.level));
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online.available;
        $('team-preview').innerHTML = this.team.map(t => avatar(t.id)).join('');
    }

    showScreen(name) {
        ['title', 'team', 'game'].forEach(s => { $(`screen-${s}`).hidden = s !== name; });
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.autoTimer);
        this.closeSheet();
        this.showScreen('title');
        this.renderTitle();
    }

    start() {
        clearSavedGame();
        const seed = Math.floor(Math.random() * 2 ** 32);
        this.startWith({
            players: [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true }],
            options: { seed, first: 0, level: this.settings.level },
            team: this.team
        });
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
        this.teamSent = false;
        this.hint = null;
        this.sel = null;
        this.inspect = null;
        this.autoOnce = false;
        this.closeSheet();
        this.controller = controller;
        this.showScreen('game');
        $('board').innerHTML = '';
        this.view = null;
        this.update();
    }

    // ---- 編成 ----

    bindTeam() {
        $('team-back').addEventListener('click', () => {
            music.play('cancel');
            this.showTitle();
        });
        $('team-reset').addEventListener('click', () => {
            music.play('select');
            this.team = defaultTeam();
            saveTeam(this.team);
            this.renderTeam();
        });
        $('slots').addEventListener('click', event => {
            const slot = event.target.closest('[data-slot]');
            if (!slot) return;
            music.play('select');
            this.openSlot(Number(slot.dataset.slot));
        });
    }

    showTeam() {
        this.showScreen('team');
        this.renderTeam();
    }

    renderTeam() {
        $('slots').innerHTML = this.team.map((t, i) => {
            const sp = SPECIES[t.id];
            const st = statsOf(t.id);
            return `<button type="button" class="slot" data-slot="${i}">${avatar(t.id)}
                <span class="slot-main"><span class="slot-name">${sp.name} ${typeChips(sp.types)}</span>
                <span class="slot-sub">HP${st.hp} 攻${st.atk} 防${st.def} 特攻${st.spa} 特防${st.spd} 速${st.spe}・移動${moveRangeOf(t.id)}</span>
                <span class="slot-sub">${t.moves.map(m => MOVES[m].name).join('・')}</span>
                <span class="slot-sub rules">${escapeHtml(rulesText(t.rules))}</span></span></button>`;
        }).join('');
    }

    openSlot(slot) {
        const t = this.team[slot];
        this.edit = { slot, id: t.id, moves: [...t.moves], rules: t.rules.map(r => ({ ...r })) };
        this.renderSlot();
    }

    renderSlot() {
        const e = this.edit;
        const used = new Set(this.team.filter((_, i) => i !== e.slot).map(t => t.id));
        const sp = SPECIES[e.id];
        const species = SPECIES_IDS.map(id => `<button type="button" class="pick${id === e.id ? ' on' : ''}" data-species="${id}" ${used.has(id) ? 'disabled' : ''}>${avatar(id, 'small')}<span>${SPECIES[id].name}</span></button>`).join('');
        const moves = sp.pool.map(m => `<button type="button" class="move-pick${e.moves.includes(m) ? ' on' : ''}" data-move="${m}">${moveLine(m)}</button>`).join('');
        const select = (name, map, value, i, none) => `<select data-rule="${i}" data-field="${name}" aria-label="ルール${i + 1}の${name === 'cond' ? '条件' : '行動'}">${none ? '<option value="">（なし）</option>' : ''}${Object.entries(map).map(([k, v]) => `<option value="${k}"${k === value ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
        const rules = Array.from({ length: MAX_RULES }, (_, i) => {
            const r = e.rules[i];
            return `<div class="rule-row"><span class="rule-no">${'①②③'[i]}</span>${select('cond', CONDITIONS, r?.cond ?? '', i, true)}${r ? select('act', ACTIONS, r.act, i, false) : '<span class="rule-off">—</span>'}</div>`;
        }).join('');
        this.openSheet({
            kind: 'slot',
            title: `${slot1(e.slot)}：${sp.name}`,
            html: `<h3>ポケモン</h3><div class="species">${species}</div>
                <h3>技（${MOVE_SLOTS}つ）</h3><div class="moves">${moves}</div>
                <h3>戦術ルール（上から順に評価）</h3><div class="rules">${rules}</div>`,
            items: [
                { label: '決定', primary: true, run: () => this.commitSlot() },
                { label: 'やめる', run: () => this.closeSheet() }
            ]
        });
        const body = $('sheet-body');
        body.onclick = (event) => {
            const sb = event.target.closest('[data-species]');
            const mb = event.target.closest('[data-move]');
            if (sb && !sb.disabled) {
                music.play('select');
                e.id = sb.dataset.species;
                e.moves = SPECIES[e.id].pool.slice(0, MOVE_SLOTS);
                this.renderSlot();
            } else if (mb) {
                music.play('select');
                const m = mb.dataset.move;
                if (e.moves.includes(m)) e.moves = e.moves.filter(x => x !== m);
                else e.moves = [...e.moves, m].slice(-MOVE_SLOTS);
                this.renderSlot();
            }
        };
        body.onchange = (event) => {
            const s = event.target.closest('select[data-rule]');
            if (!s) return;
            const i = Number(s.dataset.rule);
            if (s.dataset.field === 'cond') {
                if (!s.value) e.rules.splice(i);
                else if (e.rules[i]) e.rules[i].cond = s.value;
                else e.rules.push({ cond: s.value, act: 'nearest' });
            } else {
                e.rules[i].act = s.value;
            }
            this.renderSlot();
        };
    }

    commitSlot() {
        const e = this.edit;
        if (e.moves.length !== MOVE_SLOTS) {
            music.play('error');
            this.toast(`技を${MOVE_SLOTS}つ選んでください`);
            return;
        }
        const team = this.team.map((t, i) => (i === e.slot ? { id: e.id, moves: [...e.moves], rules: e.rules.map(r => ({ ...r })) } : t));
        const ok = normalizeTeam(team);
        if (!ok) {
            music.play('error');
            this.toast('編成が正しくありません');
            return;
        }
        music.play('place');
        this.team = ok;
        saveTeam(ok);
        this.closeSheet();
        this.renderTeam();
    }

    // ---- 対戦 ----

    bindGame() {
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-game').addEventListener('click', () => this.openHelp());
        $('open-log').addEventListener('click', () => this.openLog());
        $('hint').addEventListener('click', () => this.showHint());
        $('auto').addEventListener('click', () => {
            this.settings.auto = !this.settings.auto;
            saveSettings(this.settings);
            music.play('select');
            this.sel = null;
            this.render();
            this.toast(this.settings.auto ? 'AUTO：自分のフェイズを戦術ルールで戦います' : 'AUTO を切りました');
        });
        $('board').addEventListener('click', event => {
            const el = event.target.closest('[data-cx]');
            if (el) this.tapCell(Number(el.dataset.cx), Number(el.dataset.cy));
        });
        $('actions').addEventListener('click', event => {
            const b = event.target.closest('[data-act]');
            if (b && !b.disabled) this.doAct(b.dataset.act, b.dataset);
        });
        $('overlay').addEventListener('click', event => {
            if (event.target === $('overlay') && !['result', 'slot'].includes(this.sheetKind)) this.closeSheet();
        });
        $('sheet-buttons').addEventListener('click', event => {
            const item = event.target.closest('[data-i]');
            if (item && this.sheetHandlers) this.sheetHandlers[Number(item.dataset.i)]?.();
        });
    }

    get you() {
        return this.view?.you ?? 0;
    }

    isMyTurn() {
        const v = this.view;
        return !!v && !v.result && v.phase === 'battle' && v.current === v.you && !!this.controller?.canControl(v.you);
    }

    // 盤の上下を返すか（自分の軍を下に描く）
    flip() {
        return this.view?.you === 1;
    }

    screenPos(x, y) {
        return this.flip() ? { x: W - 1 - x, y: H - 1 - y } : { x, y };
    }

    send(command) {
        const ok = this.controller?.send(this.you, command) ?? false;
        if (ok) {
            const v = this.controller.getView();
            const hitKo = v.events.some(e => e.type === 'attack' && e.fainted);
            if (!v.result) music.play(hitKo ? 'capture' : command.type === 'team' ? 'select' : 'place');
        }
        return ok;
    }

    update() {
        if (!this.controller) return;
        const v = this.controller.getView();
        if (!v) return;
        const prev = this.view;
        this.view = v;
        if (prev && (prev.logTotal !== v.logTotal || prev.current !== v.current)) {
            this.sel = null;
            this.hint = null;
        }
        if (prev && prev.current !== v.current) this.autoOnce = false;
        // オンライン：編成の段階では、自分の編成を送る
        if (v.phase === 'setup' && v.you !== null && !v.players[v.you].ready && !this.teamSent && this.controller.canControl(v.you)) {
            this.teamSent = true;
            this.send({ type: 'team', team: this.team });
        }
        this.render();
        if (prev && prev.logTotal !== v.logTotal) this.showEvents(v);
        this.playUpdateSound(prev);
        if (v.result && !this.resultShown) {
            this.resultShown = true;
            // ローカル対戦の結果を、ログインしている人の記録に送る（オンライン対戦はサーバーが記録する）
            const outcome = v.result.winner === null ? 'draw' : v.result.winner === v.you ? 'win' : 'loss';
            if (!this.controller.isOnline) recordResult({ game: GAME, id: `${GAME}-${this.controller.seed}`, outcome });
            setTimeout(() => this.openResult(), 900);
        }
        this.scheduleAuto();
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。相手の手は知らせ、自分の番になったらチャイム
    playUpdateSound(prev) {
        const v = this.view;
        if (!prev) return;
        if (v.result) {
            if (!prev.result) music.play(v.result.winner === null ? 'notify' : v.result.winner === v.you ? 'win' : 'lose');
            return;
        }
        const mine = prev.current === v.you && prev.phase === 'battle';
        if (this.isMyTurn() && !mine) music.play('turn');
        else if (prev.logTotal !== v.logTotal && !mine) music.play('notify');
    }

    // AUTO か「全員おまかせ」のとき、自分のフェイズを1体ずつ戦術ルールで動かす
    scheduleAuto() {
        clearTimeout(this.autoTimer);
        if (!(this.settings.auto || this.autoOnce) || !this.isMyTurn() || this.sheetKind) return;
        this.autoTimer = setTimeout(() => {
            if (!(this.settings.auto || this.autoOnce) || !this.isMyTurn() || this.controller?.awaitingResponse) return;
            const i = this.view.sides[this.you].units.findIndex(u => !u.fainted && !u.acted);
            if (i >= 0) this.send({ type: 'auto', unit: i });
        }, AUTO_DELAY_MS);
    }

    // 描く位置（動かしているポケモンは、選んだマス）
    posOf(seat, i, u) {
        return this.sel && seat === this.you && i === this.sel.unit ? this.sel.to : u;
    }

    unitAt(x, y) {
        const v = this.view;
        if (!v?.sides) return null;
        for (const seat of [0, 1]) {
            const i = v.sides[seat].units.findIndex((u, j) => !u.fainted && this.posOf(seat, j, u).x === x && this.posOf(seat, j, u).y === y);
            if (i >= 0) return { seat, i, u: v.sides[seat].units[i] };
        }
        return null;
    }

    tapCell(x, y) {
        const v = this.view;
        if (!v?.sides) return;
        const hit = this.unitAt(x, y);
        if (!this.isMyTurn() || this.settings.auto || this.autoOnce) {
            if (hit) this.showInspect(hit);
            return;
        }
        const me = this.you;
        if (this.sel) {
            const s = this.sel;
            const cells = reachable(v, me, s.unit);
            if (hit && hit.seat !== me) {
                this.attackTap(hit.i);
                return;
            }
            if (hit && hit.seat === me && hit.i !== s.unit) {
                if (!hit.u.acted) this.select(hit.i);
                else this.showInspect(hit);
                return;
            }
            if (cells.has(key({ x, y })) && !(hit && hit.i === s.unit)) {
                music.play('select');
                this.sel = { ...s, to: { x, y } };
                this.render();
                return;
            }
            if (hit && hit.i === s.unit) return;
            music.play('cancel');
            this.sel = null;
            this.render();
            return;
        }
        if (hit && hit.seat === me && !hit.u.acted) this.select(hit.i);
        else if (hit) this.showInspect(hit);
        else if (this.inspect) {
            this.inspect = null;
            this.render();
        }
    }

    select(i) {
        const u = this.view.sides[this.you].units[i];
        music.play('select');
        this.inspect = null;
        this.sel = { unit: i, to: { x: u.x, y: u.y }, move: null };
        this.render();
    }

    showInspect(hit) {
        music.play('select');
        this.inspect = { seat: hit.seat, unit: hit.i };
        this.render();
    }

    // 相手を押した：今の場所から届くならそこから、届かなければ届くマスへ動いて攻撃する
    attackTap(target) {
        const v = this.view;
        const s = this.sel;
        const me = this.you;
        const moves = s.move === null ? [0, 1] : [s.move];
        const here = attackOptions(v, me, s.unit, new Map([[key(s.to), { ...s.to, steps: 0 }]])).filter(o => o.target === target && moves.includes(o.move));
        let pick = here.sort((a, b) => b.exp - a.exp)[0];
        if (!pick) {
            const all = attackOptions(v, me, s.unit).filter(o => o.target === target && moves.includes(o.move));
            pick = all.sort((a, b) => b.exp - a.exp || a.steps - b.steps)[0];
        }
        if (!pick) {
            music.play('error');
            this.toast(s.move === null ? 'この相手には届きません' : `${MOVES[v.sides[me].units[s.unit].moves[s.move]].name}が届きません`);
            return;
        }
        this.send({ type: 'act', unit: s.unit, to: pick.to, move: pick.move, target });
    }

    doAct(act, data) {
        const v = this.view;
        if (!this.isMyTurn()) return;
        const s = this.sel;
        if (act === 'move' && s) {
            music.play('select');
            const m = Number(data.move);
            this.sel = { ...s, move: s.move === m ? null : m };
            this.render();
        } else if (act === 'wait' && s) {
            this.send({ type: 'act', unit: s.unit, to: s.to, move: null, target: null });
        } else if (act === 'auto' && s) {
            this.send({ type: 'auto', unit: s.unit });
        } else if (act === 'cancel') {
            music.play('cancel');
            this.sel = null;
            this.render();
        } else if (act === 'all') {
            music.play('select');
            this.autoOnce = true;
            this.render();
            this.scheduleAuto();
        } else if (act === 'end') {
            const left = v.sides[this.you].units.filter(u => !u.fainted && !u.acted).length;
            this.openSheet({
                kind: 'confirm',
                title: 'フェイズを終える',
                html: `<p class="sheet-text">まだ行動していない ${left} 体は待機します。</p>`,
                items: [
                    { label: '終える', primary: true, run: () => { this.closeSheet(); this.send({ type: 'end' }); } },
                    { label: 'やめる', run: () => this.closeSheet() }
                ]
            });
        }
    }

    // 盤の大きさ：残りの高さと幅に、8×10 のマスが収まるようにする
    fitBoard() {
        const wrap = document.querySelector('.board-wrap');
        if (!wrap || $('screen-game').hidden) return;
        const r = wrap.getBoundingClientRect();
        const cell = Math.max(16, Math.floor(Math.min(r.width / W, r.height / H)));
        const board = $('board');
        board.style.width = `${cell * W}px`;
        board.style.height = `${cell * H}px`;
        board.style.setProperty('--cell', `${cell}px`);
    }

    render() {
        const v = this.view;
        if (!v || !this.controller) return;
        this.fitBoard();
        $('auto').setAttribute('aria-pressed', String(this.settings.auto));
        const me = this.you;
        const phaseText = v.result ? '決着' : v.phase === 'setup' ? '編成中' : v.current === me ? 'あなたのフェイズ' : `${escapeHtml(v.players[v.current].name)}のフェイズ`;
        $('turn').innerHTML = `<b>${v.phase === 'setup' ? '準備' : `ターン ${v.round}/${v.maxRounds}`}</b><span class="phase ${v.current === me ? 'mine' : 'foe'}">${phaseText}</span>`;
        this.renderBoard();
        this.renderPanel();
    }

    renderBoard() {
        const v = this.view;
        const board = $('board');
        if (!board.firstChild) {
            const cells = [];
            for (let sy = 0; sy < H; sy++) {
                for (let sx = 0; sx < W; sx++) cells.push(`<div class="cell" data-sx="${sx}" data-sy="${sy}"></div>`);
            }
            board.innerHTML = `<div class="cells">${cells.join('')}</div><div class="units"></div><div class="fx"></div>`;
        }
        const me = this.you;
        const blocks = new Set((v.map?.blocks ?? []).map(([x, y]) => y * W + x));
        // 光らせるマス
        const reach = new Set();
        const range = new Set();
        const targetable = new Set();
        const s = this.sel;
        if (s && v.sides) {
            for (const k of reachable(v, me, s.unit).keys()) reach.add(k);
            const u = v.sides[me].units[s.unit];
            const ms = s.move === null ? [0, 1] : [s.move];
            if (s.move !== null) {
                const rg = MOVES[u.moves[s.move]].range;
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dist({ x, y }, s.to) <= rg && dist({ x, y }, s.to) > 0) range.add(y * W + x);
            }
            ms.forEach(m => targetsFrom(v, me, s.unit, s.to, m).forEach(t => targetable.add(t)));
        }
        const hc = this.hint?.key === this.hintKey() ? this.hint.command : null;
        board.querySelectorAll('.cell').forEach(el => {
            const p = this.screenPos(Number(el.dataset.sx), Number(el.dataset.sy));
            const k = p.y * W + p.x;
            el.dataset.cx = p.x;
            el.dataset.cy = p.y;
            el.className = `cell${(p.x + p.y) % 2 ? ' alt' : ''}${blocks.has(k) ? ' block' : ''}${reach.has(k) ? ' reach' : ''}${range.has(k) ? ' range' : ''}`
                + `${s && s.to.x === p.x && s.to.y === p.y ? ' dest' : ''}${hc?.to && hc.to.x === p.x && hc.to.y === p.y ? ' recommended' : ''}`;
        });
        const layer = board.querySelector('.units');
        if (!v.sides) {
            layer.innerHTML = '';
            return;
        }
        if (layer.childElementCount !== 2 * v.sides[0].units.length) {
            layer.innerHTML = v.sides.flatMap((side, seat) => side.units.map((u, i) => `<div class="unit" id="u-${seat}-${i}"></div>`)).join('');
        }
        v.sides.forEach((side, seat) => side.units.forEach((u, i) => {
            const el = $(`u-${seat}-${i}`);
            const at = this.posOf(seat, i, u);
            const p = this.screenPos(at.x, at.y);
            el.style.transform = `translate(${p.x * 100}%, ${p.y * 100}%)`;
            el.dataset.cx = at.x;
            el.dataset.cy = at.y;
            const cls = ['unit', seat === me ? 'own' : 'foe'];
            if (u.fainted) cls.push('fainted');
            else if (u.acted && v.phase === 'battle' && v.current === seat) cls.push('done');
            if (s && seat === me && i === s.unit) cls.push('sel');
            if (seat !== me && targetable.has(i)) cls.push('targetable');
            if (this.inspect && this.inspect.seat === seat && this.inspect.unit === i) cls.push('looking');
            if (hc && ((seat === me && hc.unit === i) || (seat !== me && hc.target === i))) cls.push('recommended');
            el.className = cls.join(' ');
            el.innerHTML = `<span class="ball" style="${typeBg(u.types)}">${u.short}</span>${hpBar(u)}`;
        }));
    }

    renderPanel() {
        const v = this.view;
        const me = this.you;
        let info = '';
        let actions = '';
        const unitInfo = (u, own) => `<div class="unit-head">${avatar(u.id)}<div><div class="uname">${own ? '' : '<span class="foe-tag">相手</span>'}${u.name} ${typeChips(u.types)}</div>`
            + `<div class="uhp">${hpBar(u)}<span>${u.hp}/${u.maxHp}</span><small>移動${u.mov}</small></div></div></div>`;
        if (v.phase === 'setup') {
            info = `<p class="status">${v.players[me]?.ready ? '相手の編成を待っています…' : '編成を送っています…'}</p>`;
        } else if (this.sel && this.isMyTurn()) {
            const u = v.sides[me].units[this.sel.unit];
            info = unitInfo(u, true);
            actions = u.moves.map((m, i) => `<button type="button" class="act move${this.sel.move === i ? ' on' : ''}" data-act="move" data-move="${i}" style="--tc:${TYPES[MOVES[m].type].color}"><b>${MOVES[m].name}</b><small>威力${MOVES[m].power} 命中${MOVES[m].acc} 射程${MOVES[m].range}</small></button>`).join('')
                + '<button type="button" class="act" data-act="wait">待機</button><button type="button" class="act" data-act="auto">おまかせ</button><button type="button" class="act ghost" data-act="cancel">やめる</button>';
        } else if (this.inspect) {
            const u = v.sides[this.inspect.seat].units[this.inspect.unit];
            const own = this.inspect.seat === me;
            info = unitInfo(u, own) + `<div class="umoves">${u.moves.map(m => `<span class="mv">${moveLine(m)}</span>`).join('')}</div>`
                + (own && u.rules ? `<div class="urules">${escapeHtml(rulesText(u.rules))}</div>` : '');
            if (this.isMyTurn() && !this.settings.auto && !this.autoOnce) actions = this.phaseButtons();
        } else if (this.isMyTurn()) {
            const left = v.sides[me].units.filter(u => !u.fainted && !u.acted).length;
            info = `<p class="status">${this.settings.auto || this.autoOnce ? '戦術ルールで戦っています…' : `動かすポケモンを選んでください（残り ${left} 体）`}</p>`;
            if (!this.settings.auto && !this.autoOnce) actions = this.phaseButtons();
        } else if (!v.result) {
            info = `<p class="status">${escapeHtml(v.players[v.current].name)} のフェイズです。ポケモンを押すと詳しく見られます</p>`;
        } else {
            info = `<p class="status">${v.result.winner === null ? '引き分け' : v.result.winner === me ? 'あなたの勝ち' : 'あなたの負け'}</p>`;
        }
        const last = v.logs.at(-1);
        $('panel').classList.toggle('picking', !!(this.sel && this.isMyTurn()));
        $('info').innerHTML = info + (last && !this.sel && !this.inspect ? `<p class="last">${escapeHtml(last.text)}</p>` : '');
        $('actions').innerHTML = actions;
        $('hint').disabled = !this.isMyTurn() || !!this.controller?.isOnline || this.settings.auto;
    }

    phaseButtons() {
        return '<button type="button" class="act" data-act="all">全員おまかせ</button><button type="button" class="act ghost" data-act="end">フェイズ終了</button>';
    }

    // 技の結果を盤の上に出す（ダメージ・はずれ・効果）
    showEvents(v) {
        const fx = $('board').querySelector('.fx');
        if (!fx) return;
        for (const e of v.events) {
            if (e.type !== 'attack') continue;
            const t = v.sides[1 - e.seat].units[e.target];
            const p = this.screenPos(t.x, t.y);
            const el = document.createElement('div');
            el.className = `pop${e.hit ? '' : ' miss'}${e.eff > 1 ? ' super' : ''}`;
            el.style.transform = `translate(${p.x * 100}%, ${p.y * 100}%)`;
            el.innerHTML = `<b>${e.hit ? `-${e.damage}` : 'はずれ'}</b>${e.hit && e.eff !== 1 ? `<small>${e.eff === 0 ? 'こうかなし' : e.eff > 1 ? 'ばつぐん' : 'いまひとつ'}</small>` : ''}`;
            fx.appendChild(el);
            setTimeout(() => el.remove(), reduceMotion() ? 900 : 1300);
            const target = $(`u-${1 - e.seat}-${e.target}`);
            if (e.hit && target && !reduceMotion()) {
                target.classList.remove('shake');
                void target.offsetWidth;
                target.classList.add('shake');
            }
        }
    }

    hintKey() {
        const v = this.view;
        return JSON.stringify([v.logTotal, v.current]);
    }

    showHint() {
        const h = this.controller?.suggest();
        if (!h || !this.isMyTurn()) {
            this.toast('今はおすすめの手がありません');
            return;
        }
        music.play('select');
        const v = this.view;
        const c = h.command;
        this.sel = null;
        this.inspect = null;
        this.hint = { key: this.hintKey(), command: c };
        this.render();
        if (c.type === 'act') {
            const u = v.sides[this.you].units[c.unit];
            const text = c.move === null ? `${u.name}を動かして待機` : `${u.name}の${MOVES[u.moves[c.move]].name}で${v.sides[1 - this.you].units[c.target].name}を攻撃`;
            this.toast(`おすすめ：${text}`);
        } else {
            this.toast('おすすめ：フェイズを終える');
        }
    }

    // ---- シート ----

    openSheet({ kind, title, html, items = [] }) {
        this.sheetKind = kind;
        clearTimeout(this.autoTimer);
        $('sheet-title').textContent = title;
        $('sheet-body').innerHTML = html;
        $('sheet-body').onclick = null;
        $('sheet-body').onchange = null;
        $('sheet').className = `sheet ${kind}`;
        this.sheetHandlers = items.map(item => item.run);
        $('sheet-buttons').innerHTML = items.map((item, i) => `<button type="button" class="btn ${item.primary ? 'primary' : 'secondary'}" data-i="${i}"${item.id ? ` id="${item.id}"` : ''}>${item.label}</button>`).join('');
        $('overlay').hidden = false;
    }

    closeSheet() {
        $('overlay').hidden = true;
        this.sheetKind = null;
        this.sheetHandlers = null;
        if (this.view) this.scheduleAuto();
    }

    openHelp() {
        music.play('select');
        this.openSheet({ kind: 'help', title: '遊び方', html: `<div id="help" class="help">${HELP_HTML}</div>`, items: [{ label: '閉じる', run: () => this.closeSheet() }] });
    }

    openLog() {
        const v = this.view;
        if (!v) return;
        music.play('select');
        const rows = v.logs.slice().reverse().map(l => `<li class="${l.seat === null ? '' : l.seat === v.you ? 'own' : 'foe'}">${escapeHtml(l.text)}</li>`).join('');
        this.openSheet({ kind: 'log', title: '記録', html: `<ol class="log" id="log">${rows}</ol>`, items: [{ label: '閉じる', run: () => this.closeSheet() }] });
    }

    openResult() {
        const v = this.view;
        if (!v?.result) return;
        const r = v.result;
        const me = v.you ?? 0;
        const title = r.winner === null ? '引き分け' : r.winner === me ? 'あなたの勝ち！' : 'あなたの負け';
        const row = (seat) => `<div class="res-row ${seat === me ? 'own' : 'foe'}"><b>${escapeHtml(v.players[seat].name)}</b><span>${v.sides[seat].units.map(u => `<span class="mini${u.fainted ? ' out' : ''}" style="${typeBg(u.types)}">${u.short}</span>`).join('')}</span><small>残り ${r.left[seat]} 体・HP ${Math.round(r.scores[seat] / TEAM_SIZE * 100)}%</small></div>`;
        this.openSheet({
            kind: 'result',
            title,
            html: `<p class="sheet-text">${END_REASONS[r.reason]}（${v.round}ターン）</p>${row(me)}${row(1 - me)}`,
            items: [
                // オンラインは、ロビーを出し、ホストの「もう一度」で再戦する
                { label: 'もう一度', primary: true, run: () => (this.controller?.isOnline ? this.online.rematch() : this.start()) },
                { label: 'ホーム', id: 'result-home', run: () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()) }
            ]
        });
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

const slot1 = (i) => `${i + 1}番目`;

