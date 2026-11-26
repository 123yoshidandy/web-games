/**
 * 画面（タイトル・ゲーム・戦闘・遭遇・工場・結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 移動は、地図の上で下書きを組み立ててから、まとめて1つの操作として送る
 */

import {
    MAP, FACTIONS, FACTION_KEYS, MATS, MAT_KEYS, RESOURCES, RESOURCE_NAMES, BOTTOMS, BOTTOM_INFO, TOPS, TOP_UPGRADES,
    ONE_TIME, STRUCTURES, MECH_ABILITIES, ENCOUNTER_CARDS, FACTORY_CARDS, GAIN_NAMES, TERRAINS, amountText
} from './data.js';
import {
    hexOf, isBoard, isFighter, unitsAt, structureAt, workersOnBoard, hasAbility, resourceTotals, reachable, tierOf,
    OBJECTIVES, STRUCTURE_BONUSES, structureBonusOf, terrainName, WORKERS_MAX
} from './rules.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { LEVELS } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import BoardView, { RES_COLORS, RES_GLYPH } from './board-view.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';

// 自分の操作の音（書いていない行動は place）
const COMMAND_SOUND = {
    section: 'select', skip: 'select', gain: 'gain', produce: 'gain', trade: 'gain', bolster: 'gain',
    combat: 'capture', encounter: 'draw', factory: 'draw'
};

const SETTINGS_KEY = 'scythe.settings';
const CPU_NAMES = ['ヘルガ', 'イワン', 'マレク', 'ベルタ'];
const RESULT_DELAY_MS = 1200;
const TOAST_MS = 2400;
// 区画が5つになって狭いときの、下段の短い名前
const SHORT_BOTTOM = { upgrade: 'アップ', deploy: '展開', build: '建設', enlist: '募集' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const plural = (obj) => amountText(obj);

function loadSettings() {
    const fallback = { cpus: 2, level: 'normal', faction: 'random', mat: 'random' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            cpus: Number.isInteger(saved.cpus) && saved.cpus >= MIN_PLAYERS - 1 && saved.cpus <= MAX_PLAYERS - 1 ? saved.cpus : fallback.cpus,
            level: Object.hasOwn(LEVELS, saved.level) ? saved.level : fallback.level,
            faction: saved.faction === 'random' || FACTION_KEYS.includes(saved.faction) ? saved.faction : fallback.faction,
            mat: saved.mat === 'random' || MAT_KEYS.includes(saved.mat) ? saved.mat : fallback.mat
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

const resChip = (k, n) => `<span class="res-chip"><i style="background:${RES_COLORS[k]};color:${k === 'food' ? '#2b2210' : '#fff'}">${RES_GLYPH[k]}</i>${n}</span>`;
const factionDot = (key) => `<i class="dot" style="background:${FACTIONS[key].color}"></i>`;

// 払えるか（game.canPay と同じ考え。ビューから見積もる）
function canAfford(view, seat, cost) {
    const p = view.players[seat];
    if ((cost.coins ?? 0) > p.coins || (cost.power ?? 0) > p.power || (cost.popularity ?? 0) > p.popularity) return false;
    const cards = p.cardCount - (cost.cards ?? 0);
    if (cards < 0) return false;
    const have = resourceTotals(view, seat);
    const short = RESOURCES.reduce((n, r) => n + Math.max(0, (cost[r] ?? 0) - have[r]), 0);
    if (short === 0) return true;
    return short === 1 && p.faction === 'crimea' && !p.coercionUsed && cards >= 1 && view.turn === seat;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.sel = null;
        this.selKey = null;
        this.hintCommand = null;
        this.resultTimer = null;
        this.toastTimer = null;
        this.dialogKey = null;
        this.board = new BoardView($('#board'));
        this.board.onTap = (hex) => this.onHexTap(hex);
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。勢力と個人ボードは部屋が決め、足りない席は CPU
        this.online = new NetplayLobby({
            title: '大鎌戦役',
            game: 'scythe',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 500,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.update(),
            onError: (message) => this.onControllerError(message),
            onExit: () => this.showTitle()
        });
        this.bindStatic();
    }

    // ---- タイトル ----

    bindStatic() {
        $('#count-down').addEventListener('click', () => this.changeCount(-1));
        $('#count-up').addEventListener('click', () => this.changeCount(1));
        $('#start').addEventListener('click', () => this.start(false));
        $('#resume').addEventListener('click', () => this.start(true));
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#again').addEventListener('click', () => {
            $('#result').close();
            if (this.controller?.isOnline) this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
            else this.start(false);
        });
        $('#result-home').addEventListener('click', () => {
            $('#result').close();
            if (this.controller?.isOnline) this.online.leave();
            else this.showTitle();
        });
        $('#online-button').addEventListener('click', () => this.online.open());
        ['#open-help-title', '#open-help-game'].forEach(id => $(id).addEventListener('click', () => $('#help').showModal()));
        $('#hint').addEventListener('click', () => this.showHint());
        $('#last-log').addEventListener('click', () => this.openLog());
        document.querySelectorAll('dialog .close').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog').close()));
        document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', (event) => {
            // 選ぶ必要のあるダイアログ（戦闘・遭遇・工場）は、外をタップしても閉じない
            if (event.target === d && !['combat', 'pick'].includes(d.id)) d.close();
        }));
        $('#zoom-in').addEventListener('click', () => this.board.zoomBy(1.5));
        $('#zoom-out').addEventListener('click', () => this.board.zoomBy(1 / 1.5));
        $('#zoom-fit').addEventListener('click', () => this.board.resetZoom());
        $('#dial-down').addEventListener('click', () => this.changeDial(-1));
        $('#dial-up').addEventListener('click', () => this.changeDial(1));
        $('#combat-ok').addEventListener('click', () => this.sendCombat());
        $('#pick-ok').addEventListener('click', () => this.sendPick());
        // 戦闘・遭遇・工場のダイアログを Esc で閉じたら、パネルのボタンで開き直せる
        ['#combat', '#pick'].forEach(id => $(id).addEventListener('cancel', () => { this.dialogKey = null; }));
        document.addEventListener('contextmenu', (event) => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    changeCount(delta) {
        this.settings.cpus = Math.min(MAX_PLAYERS - 1, Math.max(MIN_PLAYERS - 1, this.settings.cpus + delta));
        saveSettings(this.settings);
        this.renderTitle();
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        this.renderTitle();
    }

    renderTitle() {
        const s = this.settings;
        $('#count-value').textContent = `${s.cpus}人`;
        $('#count-down').disabled = s.cpus <= MIN_PLAYERS - 1;
        $('#count-up').disabled = s.cpus >= MAX_PLAYERS - 1;
        const segment = (target, items, key) => {
            target.innerHTML = items.map(([value, label]) => `<button class="seg${s[key] === value ? ' on' : ''}" data-value="${value}">${label}</button>`).join('');
            target.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                s[key] = b.dataset.value;
                saveSettings(s);
                this.renderTitle();
            }));
        };
        segment($('#level'), Object.entries(LEVELS), 'level');
        segment($('#faction'), [['random', 'おまかせ'], ...FACTION_KEYS.map(k => [k, `${factionDot(k)}${FACTIONS[k].name}`])], 'faction');
        segment($('#mat'), [['random', 'おまかせ'], ...MAT_KEYS.map(k => [k, `${MATS[k].no} ${MATS[k].name}`])], 'mat');
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
    }

    start(resume) {
        clearTimeout(this.resultTimer);
        const saved = resume ? loadSavedGame() : null;
        let setup = saved;
        if (!setup) {
            clearSavedGame();
            const s = this.settings;
            const me = { name: 'あなた', isCPU: false };
            if (s.faction !== 'random') me.faction = s.faction;
            if (s.mat !== 'random') me.mat = s.mat;
            const players = [me, ...CPU_NAMES.slice(0, s.cpus).map(name => ({ name, isCPU: true }))];
            setup = { players, options: {}, level: s.level };
        }
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.update(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.toast('続きを読み込めませんでした');
            return;
        }
        this.beginGame(controller);
        controller.scheduleCpu();
    }

    onControllerError(message) {
        music.play('error');
        this.toast(message);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.controller?.stop();
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        $('#hint').hidden = Boolean(controller.isOnline); // ヒントはローカル対戦だけ
        this.lastSeq = controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は見せない
        this.sel = null;
        this.selKey = null;
        this.hintCommand = null;
        this.dialogKey = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.board.resize();
        this.board.resetZoom();
        this.view = null; // 前のゲームのビューと比べて音を鳴らさない
        this.update();
    }

    // ---- 更新 ----

    update() {
        if (!this.controller) return;
        const previous = this.view;
        this.view = this.controller.getView();
        this.playUpdateSound(previous);
        const v = this.view;
        const key = `${v.turnCount}:${v.step}:${v.section}:${v.combat ? v.combat.hex : ''}`;
        if (key !== this.selKey) {
            this.selKey = key;
            this.sel = this.freshSelection();
            // 手順が変わったら、ヒントは今の手順のおすすめに出し直す（自分の番でなければ消す）
            if (this.hintCommand) this.hintCommand = this.controller.hint();
        }
        this.handleEvents();
        this.render();
        this.openDialogs();
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const v = this.view;
        if (!previous) return;
        if (v.phase === 'end') {
            if (previous.phase !== 'end') music.play(v.winners.includes(v.you) ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const turnOf = (view) => view.phase === 'play' && view.turn === view.you;
        music.play(turnOf(v) && !turnOf(previous) ? 'turn' : 'notify');
    }

    freshSelection() {
        const v = this.view;
        const me = v.you;
        const sel = { moves: [], selected: null, riders: 0, hexes: [], res: {}, hex: null, top: null, bottom: null, mech: null, structure: null, recruit: null, bonus: null };
        // 交易で資源を置く場所：労働者の多い領地
        const counts = new Map();
        v.units.forEach(u => { if (u.seat === me && u.kind === 'worker' && isBoard(u.hex)) counts.set(u.hex, (counts.get(u.hex) ?? 0) + 1); });
        sel.hex = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        if (!['trade'].includes(this.topKey())) sel.hex = null;
        return sel;
    }

    handleEvents() {
        const fresh = this.view.events.filter(e => e.seq > this.lastSeq);
        if (fresh.length === 0) return;
        this.lastSeq = fresh.at(-1).seq;
        const v = this.view;
        const name = (s) => v.players[s].name;
        fresh.forEach(e => {
            if (e.type === 'combat') {
                if (e.attacker === v.you || e.defender === v.you) this.showCombatResult(e);
                else this.toast(`戦闘：${name(e.winner)}の勝ち（${e.totals[e.attacker]} 対 ${e.totals[e.defender]}）`);
            } else if (e.type === 'star') {
                this.toast(`${name(e.seat)}が星を置きました（${e.count}つ目）`);
            } else if (e.type === 'objective') {
                this.toast(`${name(e.seat)}が目標を達成しました`);
            } else if (e.type === 'retreat' && v.units.some(u => u.seat === v.you)) {
                this.toast(`${name(e.seat)}が労働者を退かせました`);
            } else if (e.type === 'end') {
                clearTimeout(this.resultTimer);
                this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
            }
        });
    }

    render() {
        this.renderTopbar();
        this.renderPlayers();
        this.renderMe();
        this.renderMat();
        this.renderPanel();
        this.renderBoard();
    }

    renderTopbar() {
        const last = this.view.logs.at(-1) ?? '';
        $('#last-log').textContent = last;
    }

    renderPlayers() {
        const v = this.view;
        $('#players').classList.toggle('many', v.players.length >= 4);
        $('#players').classList.toggle('most', v.players.length >= 5);
        $('#players').innerHTML = v.players.map(p => {
            const f = FACTIONS[p.faction];
            const active = v.phase === 'play' && (v.step === 'combat' ? !v.combat.chosen.includes(p.id) && [v.combat.attacker, v.combat.defender].includes(p.id) : v.turn === p.id);
            return `<button class="pchip${active ? ' active' : ''}${p.id === v.you ? ' mine' : ''}" data-seat="${p.id}">
                <span class="pname">${factionDot(p.faction)}<span class="pn">${escapeHtml(p.name)}</span></span>
                <span class="pstats"><b class="star">★${p.starCount}</b> 力${p.power}<span class="pop"> 人${p.popularity}</span><span class="coin"> 金${p.coins}</span></span>
                <span class="pbar" style="background:${f.color}"></span>
            </button>`;
        }).join('');
        $('#players').querySelectorAll('.pchip').forEach(b => b.addEventListener('click', () => this.openDetail(Number(b.dataset.seat))));
    }

    renderMe() {
        const v = this.view;
        const p = v.players[v.you];
        const res = resourceTotals(v, v.you);
        const cards = p.cards.length ? [...p.cards].sort((a, b) => b - a).join(' ') : 'なし';
        $('#me').innerHTML = `<span class="me-stats"><b class="star">★${p.starCount}</b> 力${p.power} 人気${p.popularity} 金${p.coins}</span>
            <span class="me-cards" title="戦闘カード">札 ${cards}</span>
            <span class="me-res">${RESOURCES.map(r => resChip(r, res[r])).join('')}</span>`;
    }

    myTurn() {
        const v = this.view;
        return v.phase === 'play' && v.turn === v.you && v.step !== 'combat';
    }

    topKey() {
        const v = this.view;
        if (v.section === null) return null;
        if (v.section === 4) return 'factoryTop';
        return MATS[v.players[v.turn].mat].tops[v.section];
    }

    bottomKey() {
        const v = this.view;
        if (v.section === null) return null;
        return v.section === 4 ? 'factoryMove' : BOTTOMS[v.section];
    }

    topLabel(p, key) {
        const up = (k) => p.upgrades.top.includes(k);
        if (key === 'move') return `移動 ${up('moveUnits') ? 3 : 2}体／金${up('gainCoins') ? 2 : 1}`;
        if (key === 'produce') return `生産 ${up('produce') ? 3 : 2}か所`;
        if (key === 'trade') return `交易 資源2／人気${up('popularity') ? 2 : 1}`;
        if (key === 'bolster') return `支持 力${up('power') ? 3 : 2}／札${up('cards') ? 2 : 1}`;
        return '';
    }

    renderMat() {
        const v = this.view;
        const p = v.players[v.you];
        const mat = MATS[p.mat];
        const canChoose = this.myTurn() && v.step === 'choose';
        const five = p.factoryCard !== null;
        const sections = [0, 1, 2, 3].map(i => {
            const b = BOTTOMS[i];
            const info = BOTTOM_INFO[b];
            const cost = mat.bottom[i].cost - p.upgrades.bottom[i];
            const structure = mat.structures[i];
            const built = p.built.includes(structure);
            const blocked = i === p.lastSection && p.faction !== 'rusviet';
            const current = v.turn === v.you && v.section === i;
            return `<button class="sec${current ? ' current' : ''}${blocked ? ' blocked' : ''}" data-index="${i}" ${canChoose && !blocked ? '' : 'disabled'}>
                <span class="sec-top">${this.topLabel(p, mat.tops[i])}${built ? `<em class="sb">${STRUCTURES[structure].name}</em>` : ''}</span>
                <span class="sec-bottom">${five ? SHORT_BOTTOM[b] : info.name}<br>${resChip(info.resource, cost)}${mat.bottom[i].coins ? ` 金${mat.bottom[i].coins}` : ''}${p.recruits[i] ? ' <em class="rc">兵</em>' : ''}</span>
            </button>`;
        });
        if (p.factoryCard !== null) {
            const card = FACTORY_CARDS[p.factoryCard];
            const blocked = p.lastSection === 4 && p.faction !== 'rusviet';
            const current = v.turn === v.you && v.section === 4;
            sections.push(`<button class="sec factory${current ? ' current' : ''}${blocked ? ' blocked' : ''}" data-index="4" ${canChoose && !blocked ? '' : 'disabled'}>
                <span class="sec-top">工場 ${plural(card.cost)}→${plural(card.gain)}</span>
                <span class="sec-bottom">1体を2マス</span>
            </button>`);
        }
        const row = $('#mat-row');
        row.innerHTML = sections.join('');
        row.classList.toggle('five', sections.length === 5);
        row.querySelectorAll('.sec').forEach(b => b.addEventListener('click', () => this.send({ type: 'section', index: Number(b.dataset.index) })));
        if (this.hintCommand?.type === 'section') row.querySelector(`.sec[data-index="${this.hintCommand.index}"]`)?.classList.add('recommended');
    }

    // ---- パネル（今の手順の選択） ----

    renderPanel() {
        const v = this.view;
        const prompt = $('#prompt');
        const choices = $('#choices');
        const actions = $('#actions');
        choices.innerHTML = '';
        actions.innerHTML = '';
        const name = (s) => v.players[s].name;
        if (v.phase === 'end') {
            prompt.textContent = 'ゲームが終わりました';
            this.button(actions, '結果を見る', () => this.showResult(), 'primary');
            return;
        }
        if (v.step === 'combat') {
            const c = v.combat;
            const mine = [c.attacker, c.defender].includes(v.you) && !c.chosen.includes(v.you);
            prompt.textContent = mine ? '戦闘の力とカードを選んでください' : `${name(c.attacker)}と${name(c.defender)}が戦っています`;
            if (mine) this.button(actions, '戦闘を選ぶ', () => this.openCombat(true), 'primary');
            return;
        }
        if (v.turn !== v.you) {
            const stepText = { choose: '区画を選んでいます', top: '上段を行っています', bottom: '下段を行っています', encounter: '遭遇しています', factory: '工場カードを選んでいます' }[v.step] ?? '';
            prompt.innerHTML = `${factionDot(v.players[v.turn].faction)}${escapeHtml(name(v.turn))}の番：${stepText}`;
            return;
        }
        if (v.step === 'choose') {
            prompt.textContent = 'マットの区画を選んでください';
            return;
        }
        if (v.step === 'encounter' || v.step === 'factory') {
            prompt.textContent = v.step === 'encounter' ? '遭遇：選択肢を選んでください' : '工場カードを選んでください';
            this.button(actions, '選ぶ', () => this.openPick(true), 'primary');
            return;
        }
        if (v.step === 'top') this.renderTop(prompt, choices, actions);
        else if (v.step === 'bottom') this.renderBottom(prompt, choices, actions);
    }

    button(target, label, onClick, kind = 'secondary', disabled = false) {
        const b = document.createElement('button');
        b.className = `btn small ${kind}`;
        b.innerHTML = label;
        b.disabled = disabled;
        b.addEventListener('click', onClick);
        target.append(b);
        return b;
    }

    // 選択肢のボタン（on：選んでいる）
    choice(target, label, on, onClick, disabled = false) {
        const b = document.createElement('button');
        b.className = `opt${on ? ' on' : ''}`;
        b.innerHTML = label;
        b.disabled = disabled;
        b.addEventListener('click', onClick);
        target.append(b);
        return b;
    }

    renderTop(prompt, choices, actions) {
        const v = this.view;
        const p = v.players[v.you];
        const key = this.topKey();
        const skip = () => this.button(actions, '上段をとばす', () => this.send({ type: 'skip' }));
        if (key === 'move') {
            const limit = p.upgrades.top.includes('moveUnits') ? 3 : 2;
            this.renderMoveDraft(prompt, choices, actions, limit, '移動');
            this.button(actions, `代わりに金+${p.upgrades.top.includes('gainCoins') ? 2 : 1}`, () => this.send({ type: 'gain' }));
            skip();
        } else if (key === 'produce') {
            const limit = p.upgrades.top.includes('produce') ? 3 : 2;
            const cost = v.produceCost;
            const costText = plural(cost);
            prompt.textContent = `生産する領地をタップ（${this.sel.hexes.length}/${limit}）。費用：${costText}`;
            this.button(actions, '生産する', () => this.send({ type: 'produce', hexes: this.sel.hexes }), 'primary', this.sel.hexes.length === 0 || !canAfford(v, v.you, cost));
            skip();
        } else if (key === 'trade') {
            const total = Object.values(this.sel.res).reduce((a, b) => a + b, 0);
            prompt.textContent = `交易（金1）：資源を2つ選ぶ（${total}/2）か、人気。置く領地は地図でも選べます`;
            RESOURCES.forEach(r => this.choice(choices, `${resChip(r, this.sel.res[r] ?? 0)}${RESOURCE_NAMES[r]}`, (this.sel.res[r] ?? 0) > 0, () => {
                if (total >= 2) this.sel.res = {};
                this.sel.res[r] = (this.sel.res[r] ?? 0) + 1;
                this.render();
            }));
            const poor = p.coins < 1;
            this.button(actions, '資源をもらう', () => this.send({ type: 'trade', mode: 'res', res: this.sel.res, hex: this.sel.hex }), 'primary', poor || total !== 2 || this.sel.hex === null);
            this.button(actions, `人気+${p.upgrades.top.includes('popularity') ? 2 : 1}`, () => this.send({ type: 'trade', mode: 'popularity' }), 'secondary', poor);
            skip();
        } else if (key === 'bolster') {
            prompt.textContent = '支持（金1）：力かカードを選んでください';
            const poor = p.coins < 1;
            this.button(actions, `力+${p.upgrades.top.includes('power') ? 3 : 2}`, () => this.send({ type: 'bolster', choice: 'power' }), 'primary', poor);
            this.button(actions, `カード+${p.upgrades.top.includes('cards') ? 2 : 1}`, () => this.send({ type: 'bolster', choice: 'cards' }), 'primary', poor);
            skip();
        } else if (key === 'factoryTop') {
            const card = FACTORY_CARDS[p.factoryCard];
            prompt.textContent = `工場カード：${plural(card.cost)}を払って${plural(card.gain)}`;
            this.button(actions, '行う', () => this.send({ type: 'factoryTop' }), 'primary', !canAfford(v, v.you, card.cost));
            skip();
        }
    }

    renderBottom(prompt, choices, actions) {
        const v = this.view;
        const p = v.players[v.you];
        const mat = MATS[p.mat];
        const key = this.bottomKey();
        const finish = () => this.button(actions, '下段をとばす', () => this.send({ type: 'skip' }));
        if (key === 'factoryMove') {
            this.renderMoveDraft(prompt, choices, actions, 1, '工場の移動（2マスまで）');
            finish();
            return;
        }
        const index = BOTTOMS.indexOf(key);
        const info = BOTTOM_INFO[key];
        const cost = { [info.resource]: mat.bottom[index].cost - p.upgrades.bottom[index] };
        const affordable = canAfford(v, v.you, cost);
        const costText = `${RESOURCE_NAMES[info.resource]}${cost[info.resource]}${mat.bottom[index].coins ? `・金+${mat.bottom[index].coins}` : ''}`;
        const s = this.sel;
        if (key === 'upgrade') {
            prompt.textContent = `アップグレード（${costText}）：よくする上段と、費用を下げる下段を選ぶ`;
            const tops = document.createElement('div');
            tops.className = 'opt-group';
            Object.entries(TOP_UPGRADES).filter(([k]) => !p.upgrades.top.includes(k)).forEach(([k, t]) => this.choice(tops, t.name, s.top === k, () => { s.top = k; this.render(); }));
            const bottoms = document.createElement('div');
            bottoms.className = 'opt-group';
            BOTTOMS.forEach((b, i) => {
                const c = mat.bottom[i].cost - p.upgrades.bottom[i];
                if (c > mat.bottom[i].min) this.choice(bottoms, `${BOTTOM_INFO[b].name} ${c}→${c - 1}`, s.bottom === i, () => { s.bottom = i; this.render(); });
            });
            choices.append(tops, bottoms);
            this.button(actions, 'アップグレード', () => this.send({ type: 'upgrade', top: s.top, bottom: s.bottom }), 'primary', !affordable || s.top === null || s.bottom === null);
        } else if (key === 'deploy') {
            prompt.textContent = `展開（${costText}）：メックを選び、労働者のいる領地をタップ`;
            const abilities = FACTIONS[p.faction].mechs;
            p.mechs.forEach((on, i) => { if (!on) this.choice(choices, this.mechLabel(p.faction, abilities[i]), s.mech === i, () => { s.mech = i; this.render(); }); });
            this.button(actions, s.hex !== null ? `${terrainName(s.hex)}に展開` : '展開', () => this.send({ type: 'deploy', mech: s.mech, hex: s.hex }), 'primary', !affordable || s.mech === null || s.hex === null);
        } else if (key === 'build') {
            prompt.textContent = `建設（${costText}）：建物を選び、労働者のいる領地をタップ`;
            Object.entries(STRUCTURES).filter(([k]) => !p.built.includes(k)).forEach(([k, st]) => this.choice(choices, `<b>${st.name}</b><small>${st.text}</small>`, s.structure === k, () => { s.structure = k; this.render(); }));
            this.button(actions, s.hex !== null ? `${terrainName(s.hex)}に建てる` : '建てる', () => this.send({ type: 'build', structure: s.structure, hex: s.hex }), 'primary', !affordable || s.structure === null || s.hex === null);
        } else if (key === 'enlist') {
            prompt.textContent = `募集（${costText}）：新兵を置く下段（常時の恩恵）と、1回だけの恩恵を選ぶ`;
            const slots = document.createElement('div');
            slots.className = 'opt-group';
            BOTTOMS.forEach((b, i) => {
                if (!p.recruits[i]) this.choice(slots, `${BOTTOM_INFO[b].name}<small>${GAIN_NAMES[BOTTOM_INFO[b].ongoing]}+1</small>`, s.recruit === i, () => { s.recruit = i; this.render(); });
            });
            const bonuses = document.createElement('div');
            bonuses.className = 'opt-group';
            Object.entries(ONE_TIME).filter(([k]) => !p.oneTime.includes(k)).forEach(([k, o]) => this.choice(bonuses, o.name, s.bonus === k, () => { s.bonus = k; this.render(); }));
            choices.append(slots, bonuses);
            this.button(actions, '募集する', () => this.send({ type: 'enlist', recruit: s.recruit, bonus: s.bonus }), 'primary', !affordable || s.recruit === null || s.bonus === null);
        }
        if (!affordable) prompt.textContent += `（${RESOURCE_NAMES[info.resource]}が足りません）`;
        finish();
    }

    mechLabel(faction, ability) {
        const a = MECH_ABILITIES[ability];
        const text = ability === 'riverwalk'
            ? `川を渡って${FACTIONS[faction].riverwalk.map(t => TERRAINS[t].name).join('と')}に入れる`
            : a.text;
        return `<b>${a.name}</b><small>${text}</small>`;
    }

    // ---- 移動の下書き ----

    // 下書きを当てた盤面（ルールの関数にそのまま渡せる形）
    draftState() {
        const v = this.view;
        const units = v.units.map(u => ({ ...u }));
        const res = v.res.map(r => ({ ...r }));
        this.sel.moves.forEach(m => {
            const unit = units.find(u => u.id === m.unit);
            const from = unit.hex;
            unit.hex = m.to;
            m.workers.forEach(id => { units.find(u => u.id === id).hex = m.to; });
            if (m.carry) RESOURCES.forEach(r => { res[m.to][r] += res[from][r]; res[from][r] = 0; });
        });
        return { ...v, units, res };
    }

    movedIds() {
        const set = new Set();
        this.sel.moves.forEach(m => { set.add(m.unit); m.workers.forEach(id => set.add(id)); });
        return set;
    }

    moveRange(unit) {
        if (this.bottomKey() === 'factoryMove' && this.view.step === 'bottom') return 2;
        return isFighter(unit) && hasAbility(this.view, this.view.you, 'speed') ? 2 : 1;
    }

    renderMoveDraft(prompt, choices, actions, limit, label) {
        const S = this.draftState();
        const sel = this.sel;
        const unit = sel.selected !== null ? S.units.find(u => u.id === sel.selected) : null;
        const left = limit - sel.moves.length;
        if (unit) {
            prompt.textContent = `${label}：${this.unitName(unit)}の行き先をタップ（あと${left}体）`;
            if (unit.kind === 'mech') {
                const riders = this.riderCandidates(S, unit);
                if (riders.length > 0) {
                    const row = document.createElement('div');
                    row.className = 'stepper inline';
                    row.innerHTML = `<span class="row-label">運ぶ労働者</span><button class="step-btn" data-d="-1">−</button><span class="count-value">${sel.riders}</span><button class="step-btn" data-d="1">＋</button>`;
                    row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                        sel.riders = Math.max(0, Math.min(riders.length, sel.riders + Number(b.dataset.d)));
                        this.render();
                    }));
                    choices.append(row);
                }
            }
        } else {
            prompt.textContent = left > 0 ? `${label}：動かすユニットのいる領地をタップ（あと${left}体）` : `${label}：決めてください`;
        }
        this.button(actions, '1つ戻す', () => {
            sel.moves.pop();
            sel.selected = null;
            this.render();
        }, 'secondary', sel.moves.length === 0 && sel.selected === null);
        const type = this.view.step === 'bottom' ? 'factoryMove' : 'move';
        this.button(actions, `移動を決める（${sel.moves.length}）`, () => this.send({ type, moves: sel.moves }), 'primary', sel.moves.length === 0);
    }

    riderCandidates(S, mech) {
        const moved = this.movedIds();
        return S.units.filter(u => u.seat === mech.seat && u.kind === 'worker' && u.hex === mech.hex && !moved.has(u.id));
    }

    unitName(unit) {
        return { char: '指導者', mech: 'メック', worker: '労働者' }[unit.kind];
    }

    // 地図のタップ
    onHexTap(hex) {
        const v = this.view;
        if (!v || !this.myTurn()) return;
        const s = this.sel;
        const top = v.step === 'top' ? this.topKey() : null;
        const bottom = v.step === 'bottom' ? this.bottomKey() : null;
        const mineWorker = (h) => v.units.some(u => u.seat === v.you && u.kind === 'worker' && u.hex === h);
        if (top === 'move' || bottom === 'factoryMove') {
            this.tapMove(hex, top === 'move' ? (v.players[v.you].upgrades.top.includes('moveUnits') ? 3 : 2) : 1);
        } else if (top === 'produce') {
            const limit = v.players[v.you].upgrades.top.includes('produce') ? 3 : 2;
            const mill = v.structures.some(st => st.seat === v.you && st.type === 'mill' && st.hex === hex);
            if (!isBoard(hex) || (!mineWorker(hex) && !mill)) return;
            if (s.hexes.includes(hex)) s.hexes = s.hexes.filter(h => h !== hex);
            else if (s.hexes.length < limit) s.hexes.push(hex);
            else this.toast(`${limit}か所までです`);
        } else if (top === 'trade') {
            if (isBoard(hex) && mineWorker(hex)) s.hex = hex;
        } else if (bottom === 'deploy' || bottom === 'build') {
            if (!isBoard(hex) || !mineWorker(hex)) return;
            if (bottom === 'build' && (hex === MAP.factory || structureAt(v, hex))) {
                this.toast('その領地には建てられません');
                return;
            }
            s.hex = hex;
        } else return;
        this.render();
    }

    tapMove(hex, limit) {
        const v = this.view;
        const s = this.sel;
        const S = this.draftState();
        const moved = this.movedIds();
        if (s.selected !== null) {
            const unit = S.units.find(u => u.id === s.selected);
            const dests = reachable(S, unit, this.moveRange(unit));
            if (dests.has(hex)) {
                const riders = unit.kind === 'mech' && hexOf(hex).terrain !== 'lake' ? this.riderCandidates(S, unit).slice(0, s.riders).map(u => u.id) : [];
                const from = unit.hex;
                const leftBehind = S.units.filter(u => u.seat === v.you && u.hex === from && u.id !== unit.id && !riders.includes(u.id)).length;
                const carry = isBoard(from) && isBoard(hex) && leftBehind === 0 && !S.structures.some(st => st.seat === v.you && st.hex === from)
                    && RESOURCES.some(r => S.res[from][r] > 0);
                s.moves.push({ unit: unit.id, to: hex, workers: riders, carry });
                s.selected = null;
                s.riders = 0;
                return;
            }
        }
        if (s.moves.length >= limit) {
            this.toast('もう動かせません。「移動を決める」を押してください');
            return;
        }
        // その領地の自分のユニットを、指導者・メック・労働者の順に選ぶ（同じ領地をもう一度タップすると次へ）
        const order = { char: 0, mech: 1, worker: 2 };
        const here = S.units.filter(u => u.seat === v.you && u.hex === hex && !moved.has(u.id)).sort((a, b) => order[a.kind] - order[b.kind]);
        const kinds = [];
        here.forEach(u => { if (!kinds.some(k => k.kind === u.kind)) kinds.push(u); });
        if (kinds.length === 0) {
            s.selected = null;
            return;
        }
        const current = kinds.findIndex(u => u.id === s.selected);
        const next = kinds[(current + 1) % kinds.length];
        s.selected = next.id;
        s.riders = 0;
        if (reachable(S, next, this.moveRange(next)).size === 0) this.toast(`${this.unitName(next)}はどこへも動けません`);
    }

    renderBoard() {
        const v = this.view;
        const marks = { hexes: new Set(), chosen: new Set() };
        let state = v;
        if (v.step === 'combat') marks.combat = v.combat.hex;
        if (this.myTurn()) {
            const top = v.step === 'top' ? this.topKey() : null;
            const bottom = v.step === 'bottom' ? this.bottomKey() : null;
            const myWorkerHexes = new Set(v.units.filter(u => u.seat === v.you && u.kind === 'worker' && isBoard(u.hex)).map(u => u.hex));
            if (top === 'move' || bottom === 'factoryMove') {
                state = this.draftState();
                const moved = this.movedIds();
                if (this.sel.selected !== null) {
                    const unit = state.units.find(u => u.id === this.sel.selected);
                    marks.selected = unit.id;
                    reachable(state, unit, this.moveRange(unit)).forEach((_, h) => marks.hexes.add(h));
                } else {
                    state.units.filter(u => u.seat === v.you && !moved.has(u.id)).forEach(u => marks.hexes.add(u.hex));
                }
                this.sel.moves.forEach(m => marks.chosen.add(m.to));
            } else if (top === 'produce') {
                myWorkerHexes.forEach(h => { if (!['lake', 'factory'].includes(hexOf(h).terrain)) marks.hexes.add(h); });
                v.structures.forEach(st => { if (st.seat === v.you && st.type === 'mill') marks.hexes.add(st.hex); });
                this.sel.hexes.forEach(h => marks.chosen.add(h));
            } else if (top === 'trade') {
                myWorkerHexes.forEach(h => marks.hexes.add(h));
                if (this.sel.hex !== null) marks.chosen.add(this.sel.hex);
            } else if (bottom === 'deploy' || bottom === 'build') {
                myWorkerHexes.forEach(h => { if (bottom === 'deploy' || (h !== MAP.factory && !structureAt(v, h))) marks.hexes.add(h); });
                if (this.sel.hex !== null) marks.chosen.add(this.sel.hex);
            }
        }
        // ヒント：まだ何も選んでいなければ、おすすめの手の場所を選んだ印で見せる
        const h = this.hintCommand;
        if (h && marks.chosen.size === 0) {
            (h.moves ?? []).forEach(m => marks.chosen.add(m.to));
            (h.hexes ?? []).forEach(x => marks.chosen.add(x));
            if (h.hex !== undefined && h.hex !== null) marks.chosen.add(h.hex);
        }
        this.board.render(state, marks);
    }

    // ---- 送る ----

    send(command) {
        if (!this.controller) return;
        this.hintCommand = null;
        this.sending = true;
        const ok = this.controller.send(command);
        this.sending = false;
        if (ok && this.view.phase !== 'end') music.play(COMMAND_SOUND[command.type] ?? 'place');
    }

    // ---- ヒント ----

    // おすすめの手を、区画と地図の印・文で知らせる（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        music.play('select');
        this.render();
        this.toast(`おすすめ：${this.hintText(command)}`);
    }

    hintText(c) {
        const res = (r) => Object.entries(r ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${RESOURCE_NAMES[k]}${n}`).join('・');
        switch (c.type) {
            case 'section': return '金の枠の区画を選ぶ';
            case 'skip': return 'とばす';
            case 'gain': return '金をもらう';
            case 'move': return `移動（${c.moves.length}体。行き先に印）`;
            case 'factoryMove': return `工場カードで移動（${c.moves.length}体）`;
            case 'produce': return `生産（${c.hexes.length}か所。印の場所）`;
            case 'trade': return c.mode === 'popularity' ? '取引で人気を上げる' : `取引で${res(c.res)}をもらう`;
            case 'bolster': return c.choice === 'power' ? '増強で力を上げる' : '増強でカードをもらう';
            case 'factoryTop': return '工場カードの上段を行う';
            case 'upgrade': case 'deploy': case 'build': case 'enlist': return `${BOTTOM_INFO[c.type].name}${c.hex !== undefined ? '（印の場所）' : ''}`;
            case 'combat': return `力${c.power}${c.cards.length ? `＋戦闘カード${c.cards.join('・')}` : ''}で戦う`;
            case 'encounter': return `選択肢${c.options.map(i => i + 1).join('と')}`;
            case 'factory': return '工場カードを選ぶ';
            default: return '';
        }
    }

    // ---- ダイアログ（戦闘・遭遇・工場） ----

    openDialogs() {
        const v = this.view;
        if (v.phase !== 'play') return;
        if (v.step === 'combat' && [v.combat.attacker, v.combat.defender].includes(v.you) && !v.combat.chosen.includes(v.you)) this.openCombat(false);
        else if (v.step === 'combat' && $('#combat').open) $('#combat').close();
        if ((v.step === 'encounter' || v.step === 'factory') && v.turn === v.you) this.openPick(false);
        else if ($('#pick').open) $('#pick').close();
    }

    openCombat(force) {
        const v = this.view;
        const c = v.combat;
        const key = `combat:${v.turnCount}:${c.hex}:${c.attacker}`;
        if (!force && this.dialogKey === key) return;
        this.dialogKey = key;
        const p = v.players[v.you];
        const foe = c.attacker === v.you ? c.defender : c.attacker;
        const F = v.players[foe];
        this.combatSel = { power: 0, cards: [] };
        $('#combat-info').innerHTML = `${terrainName(c.hex)}で${escapeHtml(F.name)}（${FACTIONS[F.faction].name}）と戦います。${c.attacker === v.you ? 'あなたが仕掛けました（同点なら勝ち）' : '同点なら相手の勝ちです'}<br>相手：力${F.power}・戦闘カード${F.cardCount}枚（最大${c.allowance[foe]}枚使える）`;
        $('#combat-cards-label').textContent = `戦闘カード（${c.allowance[v.you]}枚まで）`;
        this.renderCombat();
        if (!$('#combat').open) $('#combat').showModal();
    }

    renderCombat() {
        const v = this.view;
        const p = v.players[v.you];
        const c = v.combat;
        const sel = this.combatSel;
        const max = Math.min(7, p.power);
        $('#dial-value').textContent = sel.power;
        $('#dial-down').disabled = sel.power <= 0;
        $('#dial-up').disabled = sel.power >= max;
        const box = $('#combat-cards');
        box.innerHTML = p.cards.length ? '' : '<span class="note">カードはありません</span>';
        p.cards.forEach((value, i) => {
            const on = sel.cards.includes(i);
            const b = document.createElement('button');
            b.className = `ccard${on ? ' on' : ''}`;
            b.textContent = value;
            b.disabled = !on && sel.cards.length >= c.allowance[v.you];
            b.addEventListener('click', () => {
                sel.cards = on ? sel.cards.filter(x => x !== i) : [...sel.cards, i];
                this.renderCombat();
            });
            box.append(b);
        });
        const total = sel.power + sel.cards.reduce((a, i) => a + p.cards[i], 0);
        $('#combat-total').textContent = `合計 ${total}`;
    }

    changeDial(delta) {
        const p = this.view.players[this.view.you];
        this.combatSel.power = Math.max(0, Math.min(Math.min(7, p.power), this.combatSel.power + delta));
        this.renderCombat();
    }

    sendCombat() {
        const p = this.view.players[this.view.you];
        const cards = this.combatSel.cards.map(i => p.cards[i]);
        $('#combat').close();
        this.send({ type: 'combat', power: this.combatSel.power, cards });
    }

    showCombatResult(e) {
        const v = this.view;
        const name = (s) => escapeHtml(v.players[s].name);
        const won = e.winner === v.you;
        $('#combat-result-title').textContent = won ? '戦闘に勝ちました' : '戦闘に負けました';
        const line = (s) => `<tr><th>${factionDot(v.players[s].faction)}${name(s)}</th><td>力${e.choices[s].power}</td><td>カード${e.choices[s].cards.join('+') || '0'}</td><td class="num">${e.totals[s]}</td></tr>`;
        $('#combat-result-body').innerHTML = `<table class="ctable">${line(e.attacker)}${line(e.defender)}</table>
            <p class="note">${won ? (e.star ? '星を1つ置きました。' : '') : '本拠地へ退きました。'}${e.popularity && e.winner === v.you ? `労働者を退かせたので人気−${e.popularity}。` : ''}</p>`;
        if (!$('#combat-result').open) $('#combat-result').showModal();
    }

    openPick(force) {
        const v = this.view;
        const key = `pick:${v.turnCount}:${v.step}:${v.encounter?.card ?? ''}`;
        if (!force && this.dialogKey === key) return;
        this.dialogKey = key;
        this.pickSel = [];
        this.renderPick();
        if (!$('#pick').open) $('#pick').showModal();
    }

    renderPick() {
        const v = this.view;
        const p = v.players[v.you];
        const list = $('#pick-list');
        list.innerHTML = '';
        if (v.step === 'encounter') {
            const max = p.faction === 'polania' ? 2 : 1;
            $('#pick-title').textContent = '遭遇';
            $('#pick-note').textContent = `指導者が出会った人々から、${max === 2 ? '2つまで（放浪）' : '1つ'}選んでください。資源と労働者は指導者のいる領地に置きます`;
            const card = ENCOUNTER_CARDS[v.encounter.card];
            card.forEach((o, i) => {
                const cost = o.cost ?? {};
                const total = { ...cost };
                this.pickSel.filter(j => j !== i).forEach(j => Object.entries(card[j].cost ?? {}).forEach(([k, n]) => { total[k] = (total[k] ?? 0) + n; }));
                const ok = canAfford(v, v.you, total);
                const on = this.pickSel.includes(i);
                this.choice(list, `<b>${Object.keys(cost).length ? `${plural(cost)}を払う` : 'もらう'}</b><small>${plural(o.gain)}</small>`, on, () => {
                    if (on) this.pickSel = this.pickSel.filter(j => j !== i);
                    else this.pickSel = max === 1 ? [i] : [...this.pickSel, i].slice(-max);
                    this.renderPick();
                }, !on && !ok);
            });
            $('#pick-ok').disabled = this.pickSel.length === 0;
        } else {
            $('#pick-title').textContent = '工場';
            $('#pick-note').textContent = '工場カードを1枚選んでください。5つ目の区画として、次の手番から使えます（上段：払ってもらう、下段：1体を2マスまで動かす）';
            (v.factoryOffer ?? []).forEach(id => {
                const card = FACTORY_CARDS[id];
                const on = this.pickSel[0] === id;
                this.choice(list, `<b>${plural(card.cost)} → ${plural(card.gain)}</b>`, on, () => { this.pickSel = [id]; this.renderPick(); });
            });
            $('#pick-ok').disabled = this.pickSel.length === 0;
        }
    }

    sendPick() {
        const v = this.view;
        $('#pick').close();
        if (v.step === 'encounter') this.send({ type: 'encounter', options: this.pickSel });
        else this.send({ type: 'factory', card: this.pickSel[0] });
    }

    // ---- 詳しい様子・記録・結果 ----

    openDetail(seat) {
        const v = this.view;
        const p = v.players[seat];
        const f = FACTIONS[p.faction];
        const mat = MATS[p.mat];
        const res = resourceTotals(v, seat);
        const starNames = { upgrade: 'アップグレード', mech: 'メック', build: '建物', enlist: '新兵', workers: '労働者', popularity: '人気', power: '力' };
        const stars = [...Object.keys(p.stars).map(k => starNames[k]), ...p.doneObjectives.map(() => '目標'), ...Array(p.combatStars).fill('戦闘')];
        const abilities = f.mechs.map((a, i) => `<li class="${p.mechs[i] ? 'on' : 'off'}">${this.mechLabel(p.faction, a)}</li>`).join('');
        const objectives = p.objectives
            ? p.objectives.map(id => `<li class="${p.doneObjectives.includes(id) ? 'on' : ''}">${OBJECTIVES[id].text}${p.doneObjectives.includes(id) ? '（達成）' : ''}</li>`).join('')
            : `<li>${p.objectiveCount}枚（伏せてある）${p.doneObjectives.map(id => `／達成：${OBJECTIVES[id].text}`).join('')}</li>`;
        const bonus = structureBonusOf(v, seat, v.structureBonus);
        $('#detail-body').innerHTML = `
            <h2 tabindex="-1" autofocus>${factionDot(p.faction)}${escapeHtml(p.name)}</h2>
            <p class="note">${f.name}・${mat.no} ${mat.name}　指導者：${f.leader}</p>
            <p><b>勢力の能力</b>：${f.ability}</p>
            <p><b>★${p.starCount}</b>：${stars.join('・') || 'まだなし'}</p>
            <p>力${p.power}・人気${p.popularity}・金${p.coins}・戦闘カード${p.cardCount}枚${p.cards && seat === v.you ? `（${p.cards.join(' ')}）` : ''}</p>
            <p>資源：${RESOURCES.map(r => resChip(r, res[r])).join('')}　労働者${workersOnBoard(v, seat)}/${WORKERS_MAX}</p>
            <h3>メックの能力（${p.mechs.filter(Boolean).length}/4）</h3><ul class="ab-list">${abilities}</ul>
            <h3>アップグレード（${p.upgrades.top.length}/6）</h3><p>${p.upgrades.top.map(k => TOP_UPGRADES[k].name).join('・') || 'まだなし'}</p>
            <h3>建物（${p.built.length}/4）</h3><p>${p.built.map(k => STRUCTURES[k].name).join('・') || 'まだなし'}</p>
            <h3>新兵（${p.recruits.filter(Boolean).length}/4）</h3><p>${BOTTOMS.filter((_, i) => p.recruits[i]).map(b => `${BOTTOM_INFO[b].name}（${GAIN_NAMES[BOTTOM_INFO[b].ongoing]}）`).join('・') || 'まだなし'}${p.oneTime.length ? `／もらった恩恵：${p.oneTime.map(k => ONE_TIME[k].name).join('・')}` : ''}</p>
            <h3>目標</h3><ul class="ab-list">${objectives}</ul>
            ${p.factoryCard !== null ? `<h3>工場カード</h3><p>${plural(FACTORY_CARDS[p.factoryCard].cost)} → ${plural(FACTORY_CARDS[p.factoryCard].gain)}</p>` : ''}
            <h3>建物の得点（このゲーム）</h3><p>${STRUCTURE_BONUSES[v.structureBonus].name}：今${bonus.count}つ（${bonus.points}点）</p>
            <p class="note">人気の段 ${tierOf(p.popularity).name}：星${tierOf(p.popularity).star}・領地${tierOf(p.popularity).territory}・資源2つで${tierOf(p.popularity).resource}</p>`;
        $('#detail').showModal();
    }

    openLog() {
        if (!this.view) return;
        $('#log-list').innerHTML = this.view.logs.map(l => `<li>${escapeHtml(l)}</li>`).reverse().join('');
        $('#log').showModal();
    }

    showResult() {
        const v = this.controller?.getView();
        if (!v?.results) return;
        const won = v.winners.includes(v.you);
        $('#result-title').textContent = won ? 'あなたの勝ちです' : `${v.winners.map(s => v.players[s].name).join('と')}の勝ちです`;
        $('#result-reason').textContent = v.endReason ?? '';
        const rows = [...v.results].sort((a, b) => b.total - a.total).map(r => {
            const p = v.players[r.seat];
            return `<tr class="${v.winners.includes(r.seat) ? 'win' : ''}"><th>${factionDot(p.faction)}${escapeHtml(p.name)}</th><td class="num">${r.coins}</td><td class="num">${r.stars}<small>★${r.counts.stars}</small></td><td class="num">${r.territories}<small>${r.counts.territories}</small></td><td class="num">${r.resources}<small>${r.counts.resources}</small></td><td class="num">${r.bonus}</td><td class="num total">${r.total}</td></tr>`;
        }).join('');
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>金</th><th>星</th><th>領地</th><th>資源</th><th>建物</th><th>計</th></tr></thead><tbody>${rows}</tbody></table>`;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    toast(message) {
        const t = $('#toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), TOAST_MS);
    }
}

export { unitsAt };
