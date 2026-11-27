/**
 * 画面（タイトル・ゲーム・選択・陣営の盤・記録・結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 操作の選び方：ビューの legal（取れる操作の一覧）を、操作の種類ごとに決まった順で絞り込む
 * - 空き地の欄（from・to・clearing）は地図で光らせてタップ、手札のカードは手札で光らせてタップ、ほかは選択のシートで選ぶ
 * - 候補が1つに決まった欄は聞かない。全部決まったら送る（兵の数を選ぶときだけ、数のシートを出す）
 */

import {
    FACTIONS, FACTION_INFO, CARDS, SUIT_NAMES, ITEM_NAMES, BUILDING_NAMES, DECREE, DECREE_NAMES, LEADERS, CHARACTERS,
    RELATION_NAMES, QUESTS, CLEARINGS, MARQUISE_COST, MARQUISE_VP, ROOST_VP, SYMPATHY_COST, SYMPATHY_VP, WIN_SCORE
} from './data.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import BoardView from './board-view.js';
import { cardHtml, cardText, suitDot, questHtml, emblemSvg, FACTION_COLORS } from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';

// 自分の操作の音（書いていない行動は place）
const COMMAND_SOUND = {
    battle: 'capture', strike: 'capture', steal: 'capture', revolt: 'capture',
    craft: 'gain', quest: 'gain', score: 'gain', tax: 'gain', repair: 'gain',
    draw: 'draw', explore: 'draw', discard: 'pay', next: 'select', end: 'select', turn: 'select'
};

const SETTINGS_KEY = 'root.settings';
const RESULT_DELAY_MS = 900;

const TYPE_LABELS = {
    move: '移動', battle: '戦闘', craft: '工作', recruit: '徴兵', build: '建設', overwork: '残業', hawks: '行動を足す',
    decree: '布告', newRoost: '新しい止まり木', revolt: '暴動', spread: '同調を広める', mobilize: '動員', train: '訓練', organize: '組織',
    slip: '抜け出す', explore: '探索', aid: '援助', quest: 'クエスト', strike: '狙撃', repair: '修理', steal: '盗む', daylabor: '日雇い',
    hideout: '隠れ家', dominance: '支配を出す', takeDominance: '支配を取る', royal: '王の権利', stand: '金を出せ', bank: '巣穴銀行',
    tax: '徴税', peek: '手札を見る', keep: '本拠', place: '建物を置く', corner: '隅', leader: '指導者', character: 'キャラクター', forest: '森'
};
// 自由に使える操作（ほかの操作が1種類だけなら、そちらを自動で選び始める）
const FREE_TYPES = new Set(['dominance', 'takeDominance', 'tax', 'peek', 'royal', 'stand', 'bank', 'hawks']);
const FIELD_ORDER = {
    move: ['from', 'to', 'card'], battle: ['clearing', 'defender', 'card'], craft: ['card'], recruit: ['clearing'], build: ['kind', 'clearing'],
    overwork: ['card', 'clearing'], hawks: ['card'], decree: ['card', 'column'], newRoost: ['clearing'], revolt: ['clearing'], spread: ['clearing'],
    mobilize: ['card'], train: ['card'], organize: ['clearing'], slip: ['place'], explore: [], aid: ['target', 'card'], quest: ['quest', 'reward'],
    strike: ['target'], repair: ['item'], steal: ['target'], daylabor: ['card'], hideout: [], dominance: ['card'], takeDominance: ['card', 'pay'],
    royal: ['card'], stand: ['card', 'target'], bank: ['card', 'target'], tax: ['card', 'clearing'], peek: ['card', 'target'],
    keep: ['clearing'], place: ['clearing'], corner: ['clearing'], leader: ['leader'], character: ['character'], forest: ['forest'], next: []
};
const MAP_FIELDS = new Set(['from', 'to', 'clearing']);
const FIELD_PROMPTS = {
    from: 'どこから', to: 'どこへ', clearing: 'どの空き地', card: 'どのカード', pay: '払うカード', defender: 'どの相手', target: 'どの相手',
    kind: 'どの建物', column: 'どの列', quest: 'どのクエスト', reward: '報酬', item: 'どのアイテム', leader: '指導者', character: 'キャラクター',
    forest: 'どの森', place: '行き先'
};
const PHASE_NAMES = { birdsong: '鳥の歌', daylight: '昼', evening: '夕方' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    const fallback = { faction: 'marquise', cpus: 3, level: 'normal' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            faction: FACTIONS.includes(saved.faction) ? saved.faction : fallback.faction,
            cpus: Number.isInteger(saved.cpus) && saved.cpus >= 1 && saved.cpus <= 3 ? saved.cpus : fallback.cpus,
            level: saved.level === 'easy' ? 'easy' : fallback.level
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

// 相手の陣営：侯爵家・鷲の王朝・森林連合・放浪者の順に、自分の陣営を除いて選ぶ
export function opponentsFor(faction, cpus) {
    return FACTIONS.filter(f => f !== faction).slice(0, cpus);
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.sel = null;
        this.hintCommand = null;
        this.discardPick = new Set();
        this.lastLegalKey = '';
        this.lastPeekKey = '';
        this.resultTimer = null;
        this.board = new BoardView($('#board'), { onTap: (kind, id) => this.onMapTap(kind, id) });
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。席の順に勢力が決まり、足りない席は CPU
        this.online = new NetplayLobby({
            title: 'ルート',
            game: 'root',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 500,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onUpdate(),
            onError: (message) => this.onControllerError(message),
            onExit: () => {
                this.stopGame();
                this.showTitle();
            }
        });
        this.bindStatic();
        this.renderTitleArt();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderSetup();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.onUpdate(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
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
        document.querySelectorAll('dialog[open]').forEach(d => { if (d.id !== 'help') d.close(); });
        this.controller = controller;
        $('#hint').hidden = Boolean(controller.isOnline); // ヒントはローカル対戦だけ
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.board.reset();
        this.sel = null;
        this.hintCommand = null;
        this.view = null; // 前のゲームのビューと比べて音を鳴らさない
        this.onUpdate();
    }

    newGame() {
        const { faction, cpus, level } = this.settings;
        const players = [{ name: 'あなた', faction, isCPU: false },
            ...opponentsFor(faction, cpus).map(f => ({ name: FACTION_INFO[f].name, faction: f, isCPU: true }))];
        this.startGame({ players, options: level === 'easy' ? { level } : {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => { if (d.id !== 'help') d.close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#faction-pick').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-faction]');
            if (button) this.changeSetting({ faction: button.dataset.faction });
        });
        $('#count-down').addEventListener('click', () => this.changeSetting({ cpus: this.settings.cpus - 1 }));
        $('#count-up').addEventListener('click', () => this.changeSetting({ cpus: this.settings.cpus + 1 }));
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (button) this.changeSetting({ level: button.dataset.level });
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (this.controller?.isOnline) {
                $('#result').close();
                this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
                return;
            }
            this.newGame();
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => this.openLog());
        $('#zoom-in').addEventListener('click', () => this.board.zoomBy(1.3));
        $('#zoom-out').addEventListener('click', () => this.board.zoomBy(1 / 1.3));
        $('#cancel').addEventListener('click', () => this.cancelSelection());
        $('#next').addEventListener('click', () => {
            if (this.view?.legal.some(a => a.type === 'next')) this.send({ type: 'next' });
        });
        $('#mine').addEventListener('click', () => this.openFaction(this.view?.you));
        $('#scores').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-seat]');
            if (chip) this.openFaction(Number(chip.dataset.seat));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-type]');
            if (button) this.startSelection(button.dataset.type);
        });
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.onCardTap(Number(card.dataset.card));
        });
        $('#choice-list').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-index]');
            if (button) this.onChoice(Number(button.dataset.index));
        });

        // ダイアログは外側のタップと「閉じる」で閉じる（結果は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        // 選択のシートを閉じたら、選んでいる途中の操作もやめる（割り込みの答えは、また出す）
        $('#choice').addEventListener('close', () => {
            const kind = this.choiceKind;
            this.choiceKind = null;
            this.choices = [];
            if ((kind === 'field' || kind === 'count') && this.sel) this.cancelSelection();
            if (kind === 'prompt') setTimeout(() => this.renderPrompt(), 0);
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    changeSetting(change) {
        const next = { ...this.settings, ...change };
        next.cpus = Math.min(3, Math.max(1, next.cpus));
        this.settings = next;
        saveSettings(next);
        this.renderSetup();
    }

    renderSetup() {
        const { faction, cpus } = this.settings;
        $('#faction-pick').innerHTML = FACTIONS.map(f => `<button data-faction="${f}" role="radio" aria-checked="${f === faction}" class="${f === faction ? 'on' : ''}" style="--fc:${FACTION_COLORS[f]}">
            ${emblemSvg(f, 30)}<span>${FACTION_INFO[f].name}</span></button>`).join('');
        $('#faction-note').textContent = {
            marquise: '木材を運んで建物を建て、点を重ねる',
            eyrie: '布告に従って止まり木を増やす。布告を果たせないと混乱',
            alliance: '同調者を広げ、暴動で拠点を築く',
            vagabond: 'アイテムを使い、探索・クエスト・援助で点を稼ぐ'
        }[faction];
        $('#count-value').textContent = `${cpus}人`;
        $('#count-down').disabled = cpus <= 1;
        $('#count-up').disabled = cpus >= 3;
        document.querySelectorAll('#level [data-level]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
        $('#opponents').textContent = `相手：${opponentsFor(faction, cpus).map(f => FACTION_INFO[f].name).join('・')}`;
    }

    renderTitleArt() {
        $('#title-art').innerHTML = FACTIONS.map((f, i) => `<span class="title-emblem e${i}">${emblemSvg(f, 58)}</span>`).join('');
    }

    // ---- 更新 ----

    onUpdate() {
        if (!this.controller) return;
        const previous = this.view;
        this.view = this.controller.getView();
        this.playUpdateSound(previous);
        this.recordLocalResult(previous);
        // ヒントを出している間は、今の場面のおすすめに出し直す
        if (this.hintCommand) this.hintCommand = this.myTurn() ? this.controller.hint() : null;
        const key = JSON.stringify(this.view.legal);
        if (key !== this.lastLegalKey) {
            // 取れる操作が変わったら、選んでいる途中の操作はやめる
            this.lastLegalKey = key;
            this.sel = null;
            this.discardPick.clear();
            if ($('#choice').open && this.choiceKind !== 'prompt') $('#choice').close();
            this.autoStart();
        }
        this.render();
        this.renderPrompt();
        this.showPeek();
        if (this.view.over && !$('#result').open) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // 終局に切り替わった1回だけ送る。id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(previous) {
        const v = this.view;
        const controller = this.controller;
        if (!previous || !v || controller?.isOnline || controller?.isReplay) return;
        const finished = v.over;
        const wasOver = previous.over;
        if (!finished || wasOver) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners(v.winners, v.you, v.players.length) });
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const v = this.view;
        if (!previous) return;
        if (v.over) {
            if (!previous.over) music.play(v.winners.includes(v.you) ? 'win' : 'lose');
            return;
        }
        if (this.sending) return;
        const wasMine = !previous.over && previous.legal.length > 0 && !previous.prompt;
        music.play(this.myTurn() && !wasMine ? 'turn' : 'notify');
    }

    myTurn() {
        const v = this.view;
        return !!v && !v.over && v.legal.length > 0 && !v.prompt;
    }

    mainTypes() {
        return [...new Set(this.view.legal.map(a => a.type))].filter(t => t !== 'next' && t !== 'discard');
    }

    // できることが1種類だけ（自由な操作を除く）なら、その選択を始める
    autoStart() {
        if (!this.myTurn()) return;
        const types = this.mainTypes().filter(t => !FREE_TYPES.has(t));
        if (types.length === 1 && !this.view.legal.some(a => a.type === 'next')) this.startSelection(types[0]);
    }

    render() {
        const v = this.view;
        if (!v) return;
        this.renderScores();
        const last = v.logs.at(-1) ?? '';
        $('#ticker').textContent = last;
        this.renderBoard();
        this.renderStatus();
        this.renderMine();
        this.renderActions();
        this.renderHand();
    }

    renderScores() {
        const v = this.view;
        $('#scores').innerHTML = v.players.map(p => {
            const active = v.turn === p.id && !v.over;
            const mark = p.dominance !== null ? `<small>${p.coalition !== null ? '連合' : SUIT_NAMES[CARDS[p.dominance].suit]}</small>` : '';
            return `<button class="score-chip${active ? ' active' : ''}${p.id === v.you ? ' me' : ''}" data-seat="${p.id}" style="--fc:${FACTION_COLORS[p.faction]}" aria-label="${escapeHtml(p.name)} ${p.score}点">
                ${emblemSvg(p.faction, 18)}<b>${p.dominance !== null ? '支配' : p.score}</b>${mark}</button>`;
        }).join('');
    }

    renderBoard() {
        const glow = { clearings: new Set(), forests: new Set() };
        const marks = {};
        const sel = this.sel;
        if (sel && sel.asking) {
            const values = this.fieldValues(sel.asking);
            if (MAP_FIELDS.has(sel.asking)) values.forEach(c => { if (c !== null && c !== undefined) glow.clearings.add(c); });
            if (sel.asking === 'forest') values.forEach(f => glow.forests.add(f));
            if (sel.asking === 'place') {
                sel.candidates.forEach(a => {
                    if (a.clearing !== null) glow.clearings.add(a.clearing);
                    else glow.forests.add(a.forest);
                });
            }
            if (sel.fields.from !== undefined && sel.fields.from !== null) marks[sel.fields.from] = 'from';
        } else if (this.myTurn() && this.hintCommand) {
            // ヒントを出しているときは、おすすめの手の場所だけを光らせる
            const c = this.hintCommand;
            ['from', 'to', 'clearing'].forEach(k => { if (c[k] !== undefined && c[k] !== null) glow.clearings.add(c[k]); });
            if (c.from !== undefined && c.from !== null) marks[c.from] = 'from';
            if (c.type === 'forest' || (c.clearing === null && c.forest !== undefined)) glow.forests.add(c.forest);
        } else if (this.myTurn()) {
            // 何も選んでいないときは、操作できる空き地を光らせる
            this.view.legal.forEach(a => {
                if (FREE_TYPES.has(a.type)) return;
                const first = FIELD_ORDER[a.type]?.find(f => MAP_FIELDS.has(f));
                const c = first ? a[first] : undefined;
                if (c !== undefined && c !== null) glow.clearings.add(c);
                if (a.type === 'forest') glow.forests.add(a.forest);
            });
        }
        this.board.render(this.view, glow, marks);
    }

    statusText() {
        const v = this.view;
        if (v.over) return '決着';
        const me = v.players[v.you];
        if (v.waitingFor !== null && v.waitingFor !== v.you) return `${v.players[v.waitingFor].name}が考えています`;
        if (v.turn !== v.you || v.legal.length === 0) {
            const p = v.players[v.turn];
            if (v.phase === 'setup') return `${p.name}が準備しています`;
            return `${p.name}の番・${PHASE_NAMES[v.phase] ?? ''}`;
        }
        const t = v.turnState;
        const discard = v.legal.find(a => a.type === 'discard');
        if (discard) return `手札を${discard.count}枚捨てる`;
        if (v.phase === 'setup') {
            const step = v.step;
            if (step === 'keep') return '本拠を置く隅を選ぶ';
            if (step === 'place') return `${BUILDING_NAMES[['sawmill', 'workshop', 'recruiter'][t.setupBuild]]}を置く空き地を選ぶ`;
            if (step === 'corner') return '止まり木を置く隅を選ぶ';
            if (step === 'leader') return '指導者を選ぶ';
            if (step === 'character') return 'キャラクターを選ぶ';
            if (step === 'forest') return '始める森を選ぶ';
        }
        const phase = PHASE_NAMES[v.phase];
        switch (me.faction) {
            case 'marquise':
                if (v.phase === 'daylight') return `昼・行動あと${t.actions}${t.marchLeft > 0 ? '・もう1回移動できる' : ''}`;
                return phase;
            case 'eyrie':
                if (v.step === 'decree') return `布告にカードを足す（あと${2 - t.added}枚まで）`;
                if (v.step === 'newRoost') return '新しい止まり木の空き地を選ぶ';
                if (v.step === 'craft') return '昼・工作';
                if (v.step === 'leader') return '混乱：新しい指導者を選ぶ';
                if (v.step === 'resolve') {
                    const col = DECREE[t.decreeCol];
                    const left = v.eyrie.decree[col].filter((e, i) => !t.resolved.includes(i));
                    return `布告の${DECREE_NAMES[col]}・${left.map(e => SUIT_NAMES[e.suit]).join('・')}`;
                }
                return phase;
            case 'alliance':
                if (v.phase === 'evening') return `夕方・作戦あと${Math.max(0, v.alliance.officers - t.opsUsed)}`;
                return phase;
            default:
                return phase;
        }
    }

    // 「移動：どこへ」の後ろの部分。操作の名前と同じ言葉なら「を選ぶ」にする（「指導者：指導者」にしない）
    fieldPrompt(type, field) {
        if (!field) return '';
        const prompt = FIELD_PROMPTS[field] ?? '';
        return prompt === TYPE_LABELS[type] ? 'を選ぶ' : `：${prompt}`;
    }

    renderStatus() {
        const sel = this.sel;
        if (sel) {
            const label = TYPE_LABELS[sel.type] ?? '';
            $('#status-text').innerHTML = `<b>${label}</b>${this.fieldPrompt(sel.type, sel.asking)}`;
            $('#cancel').hidden = false;
        } else {
            $('#status-text').textContent = this.statusText();
            $('#cancel').hidden = true;
        }
        $('#status').classList.toggle('mine-turn', this.myTurn());
    }

    renderMine() {
        const v = this.view;
        const me = v.players[v.you];
        const f = me.faction;
        let html = `${emblemSvg(f, 22)}`;
        if (f === 'marquise') {
            const b = v.marquise.built;
            html += `<span>木材 <b>${v.marquise.wood}</b></span><span>製 <b>${b.sawmill}</b> 工 <b>${b.workshop}</b> 徴 <b>${b.recruiter}</b></span><span>兵 <b>${me.supply}</b></span>`;
        } else if (f === 'eyrie') {
            html += DECREE.map(col => `<span class="mini-col"><small>${DECREE_NAMES[col]}</small>${v.eyrie.decree[col].map(e => suitDot(e.suit)).join('') || '<i>—</i>'}</span>`).join('');
        } else if (f === 'alliance') {
            const a = v.alliance;
            const dots = (a.supporters ?? []).map(id => suitDot(CARDS[id].suit)).join('');
            html += `<span>支持者 ${dots || '<b>0</b>'}</span><span>官吏 <b>${a.officers}</b></span>`;
        } else if (v.vagabond) {
            html += `<span class="items">${v.vagabond.items.map(i => `<i class="item${i.exhausted ? ' ex' : ''}${i.damaged ? ' dm' : ''}">${ITEM_NAMES[i.type]}</i>`).join('')}</span>`;
        }
        $('#mine').innerHTML = html;
        $('#mine').style.setProperty('--fc', FACTION_COLORS[f]);
    }

    renderActions() {
        const v = this.view;
        const types = this.myTurn() ? this.mainTypes() : [];
        const hinted = this.sel ? null : this.hintCommand?.type;
        $('#actions').innerHTML = types.map(t => `<button class="act${this.sel?.type === t ? ' on' : ''}${hinted === t ? ' recommended' : ''}" data-type="${t}">${TYPE_LABELS[t] ?? t}</button>`).join('');
        const next = this.myTurn() && v.legal.some(a => a.type === 'next');
        const discard = this.myTurn() && v.legal.find(a => a.type === 'discard');
        const button = $('#next');
        button.hidden = !next && !discard;
        button.classList.toggle('recommended', !this.sel && ['next', 'discard'].includes(this.hintCommand?.type));
        if (discard) {
            button.textContent = `捨てる ${this.discardPick.size}/${discard.count}`;
            button.disabled = this.discardPick.size !== discard.count;
            button.onclick = () => {
                if (this.discardPick.size === discard.count) this.send({ type: 'discard', cards: [...this.discardPick] });
            };
        } else {
            button.onclick = null;
            button.disabled = false;
            button.textContent = this.nextLabel();
        }
    }

    nextLabel() {
        const v = this.view;
        if (v.phase === 'birdsong') return '昼へ';
        if (v.phase === 'daylight') return v.step === 'craft' ? '布告へ' : '夕方へ';
        return '番を終える';
    }

    renderHand() {
        const v = this.view;
        const me = v.players[v.you];
        const hand = me.hand ?? [];
        const sel = this.sel;
        const glowCards = new Set();
        if (sel?.asking === 'card' || sel?.asking === 'pay') this.fieldValues(sel.asking).forEach(id => glowCards.add(id));
        const discard = this.myTurn() && v.legal.some(a => a.type === 'discard');
        const hintCards = new Set(this.sel ? [] : [this.hintCommand?.card, ...(this.hintCommand?.cards ?? [])].filter(id => id !== undefined && id !== null));
        $('#hand').innerHTML = hand.length === 0 ? '<p class="empty">手札なし</p>'
            : hand.map(id => cardHtml(id, { cls: `${glowCards.has(id) ? 'glow' : ''}${hintCards.has(id) ? ' recommended' : ''}${discard && this.discardPick.has(id) ? ' picked' : ''}` })).join('');
    }

    // ---- 選ぶ ----

    send(command) {
        this.sel = null;
        this.hintCommand = null;
        if ($('#choice').open) {
            this.choiceKind = null;
            $('#choice').close();
        }
        this.sending = true;
        const ok = this.controller?.send(command);
        this.sending = false;
        if (ok && !this.view.over) music.play(COMMAND_SOUND[command.type] ?? 'place');
    }

    startSelection(type, preset = {}) {
        if (!this.myTurn()) return;
        const candidates = this.view.legal.filter(a => a.type === type && Object.entries(preset).every(([k, val]) => a[k] === val));
        if (candidates.length === 0) return;
        this.sel = { type, fields: { ...preset }, candidates, asking: null };
        this.advance();
    }

    cancelSelection() {
        this.sel = null;
        this.render();
    }

    fieldValues(field) {
        const values = [];
        this.sel.candidates.forEach(a => { if (!values.includes(a[field])) values.push(a[field]); });
        return values;
    }

    setField(field, value) {
        const sel = this.sel;
        sel.fields[field] = value;
        sel.candidates = sel.candidates.filter(a => a[field] === value);
        sel.asking = null;
        this.advance();
    }

    advance() {
        const sel = this.sel;
        const order = FIELD_ORDER[sel.type] ?? [];
        for (const field of order) {
            if (field === 'place') {
                if (sel.candidates.length === 1) continue;
                sel.asking = 'place';
                this.render();
                return;
            }
            if (Object.hasOwn(sel.fields, field)) continue;
            const values = this.fieldValues(field);
            if (values.length === 1) {
                sel.fields[field] = values[0];
                continue;
            }
            // 司令の巣穴・靴職人で、行動を使わずにできるなら、そちらを使う
            if (field === 'card' && (sel.type === 'battle' || sel.type === 'move')) {
                const free = values.find(x => x !== null);
                this.setFieldQuiet(field, free);
                continue;
            }
            sel.asking = field;
            if (MAP_FIELDS.has(field) || field === 'forest') {
                this.render();
                return;
            }
            const hand = this.view.players[this.view.you].hand ?? [];
            if ((field === 'card' || field === 'pay') && values.every(id => hand.includes(id))) {
                this.render();
                return;
            }
            this.render();
            this.openFieldChoice(field, values);
            return;
        }
        this.finish();
    }

    setFieldQuiet(field, value) {
        this.sel.fields[field] = value;
        this.sel.candidates = this.sel.candidates.filter(a => a[field] === value);
    }

    finish() {
        const sel = this.sel;
        const action = sel.candidates[0];
        if (!action) {
            this.cancelSelection();
            return;
        }
        const command = { ...action };
        delete command.max;
        if (action.max && action.max > 1) {
            this.openCount(action);
            return;
        }
        if (action.max) command.count = 1;
        this.send(command);
    }

    onMapTap(kind, id) {
        const sel = this.sel;
        if (sel?.asking) {
            if (sel.asking === 'place') {
                const action = sel.candidates.find(a => (kind === 'clearing' ? a.clearing === id : kind === 'forest' && a.clearing === null && a.forest === id));
                if (action) {
                    sel.candidates = [action];
                    sel.asking = null;
                    this.advance();
                }
                return;
            }
            if (MAP_FIELDS.has(sel.asking) && kind === 'clearing' && this.fieldValues(sel.asking).includes(id)) this.setField(sel.asking, id);
            else if (sel.asking === 'forest' && kind === 'forest' && this.fieldValues('forest').includes(id)) this.setField('forest', id);
            return;
        }
        if (!this.myTurn() || kind !== 'clearing') {
            if (kind === 'clearing') this.openClearingInfo(id);
            return;
        }
        // 何も選んでいないとき：この空き地で始められる操作
        const types = [];
        this.view.legal.forEach(a => {
            const first = FIELD_ORDER[a.type]?.find(f => MAP_FIELDS.has(f));
            if (first && a[first] === id && !types.some(t => t.type === a.type && t.field === first)) types.push({ type: a.type, field: first });
        });
        if (types.length === 0) {
            this.openClearingInfo(id);
            return;
        }
        if (types.length === 1) {
            this.startSelection(types[0].type, { [types[0].field]: id });
            return;
        }
        this.openChoice({
            kind: 'clearing', title: `${id + 1}（${SUIT_NAMES[CLEARINGS[id].suit]}）`, body: this.clearingInfoHtml(id),
            choices: types.map(t => ({ label: TYPE_LABELS[t.type], run: () => this.startSelection(t.type, { [t.field]: id }) }))
        });
    }

    onCardTap(id) {
        const v = this.view;
        if (this.myTurn() && v.legal.some(a => a.type === 'discard')) {
            const need = v.legal.find(a => a.type === 'discard').count;
            if (this.discardPick.has(id)) this.discardPick.delete(id);
            else if (this.discardPick.size < need) this.discardPick.add(id);
            this.renderActions();
            this.renderHand();
            return;
        }
        const sel = this.sel;
        if (sel && (sel.asking === 'card' || sel.asking === 'pay')) {
            if (this.fieldValues(sel.asking).includes(id)) this.setField(sel.asking, id);
            return;
        }
        // カードの説明と、そのカードでできる操作
        const types = this.myTurn() ? [...new Set(v.legal.filter(a => a.card === id || a.pay === id).map(a => a.type))] : [];
        const card = CARDS[id];
        this.openChoice({
            kind: 'card', title: card.name,
            body: `<div class="card-detail">${cardHtml(id, { cls: 'big' })}<p>${escapeHtml(cardText(card))}</p></div>`,
            choices: types.map(t => ({ label: TYPE_LABELS[t], run: () => this.startSelection(t, v.legal.some(a => a.type === t && a.card === id) ? { card: id } : { pay: id }) }))
        });
    }

    // ---- シート ----

    openChoice({ kind, title, body = '', choices = [], closeLabel = 'やめる', cancellable = true }) {
        this.choiceKind = kind;
        this.choices = choices;
        $('#choice-title').textContent = title;
        $('#choice-body').innerHTML = body;
        $('#choice-list').innerHTML = choices.map((c, i) => `<button class="choice${c.cls ? ` ${c.cls}` : ''}" data-index="${i}">${c.html ?? escapeHtml(c.label)}</button>`).join('');
        const close = $('#choice-buttons .close');
        close.textContent = closeLabel;
        close.hidden = !cancellable;
        if (!$('#choice').open) $('#choice').showModal();
    }

    onChoice(index) {
        const choice = this.choices?.[index];
        if (!choice) return;
        this.choiceKind = null;
        $('#choice').close();
        choice.run();
    }

    openFieldChoice(field, values) {
        this.openChoice({
            kind: 'field', title: `${TYPE_LABELS[this.sel.type]}${this.fieldPrompt(this.sel.type, field)}`,
            choices: values.map(value => ({ html: this.valueLabel(field, value), run: () => this.setField(field, value) }))
        });
    }

    valueLabel(field, value) {
        const v = this.view;
        if (field === 'defender' || field === 'target') {
            const p = typeof value === 'number' ? v.players[value] : v.players.find(x => x.faction === value);
            return `<span class="who" style="--fc:${FACTION_COLORS[p.faction]}">${escapeHtml(p.name)}</span>`;
        }
        if (field === 'kind') {
            const placed = v.marquise?.built[value] ?? 0;
            return `${BUILDING_NAMES[value]}<small>木材${MARQUISE_COST[placed]}・${MARQUISE_VP[value][placed]}点</small>`;
        }
        if (field === 'column') return DECREE_NAMES[value];
        if (field === 'quest') return questHtml(value);
        if (field === 'reward') {
            if (value === 'draw') return '2枚引く';
            const q = QUESTS[this.sel.fields.quest];
            const n = v.vagabond.completed.filter(id => QUESTS[id].suit === q.suit).length + 1;
            return `${n}点を得る`;
        }
        if (field === 'item') return ITEM_NAMES[value];
        if (field === 'leader') return `${LEADERS[value].name}<small>${LEADERS[value].text}</small>`;
        if (field === 'character') return `${CHARACTERS[value].name}<small>${CHARACTERS[value].items.map(i => ITEM_NAMES[i]).join('・')}／${CHARACTERS[value].special}</small>`;
        if (field === 'card' || field === 'pay') return value === null ? 'なし' : `${suitDot(CARDS[value].suit)} ${escapeHtml(CARDS[value].name)}`;
        return escapeHtml(String(value));
    }

    openCount(action) {
        const choices = [];
        for (let n = action.max; n >= 1; n--) choices.push({ label: `${n}体`, run: () => this.send({ ...this.stripMax(action), count: n }) });
        this.openChoice({ kind: 'count', title: `${TYPE_LABELS[action.type]}：${action.from + 1} → ${action.to + 1}`, choices });
    }

    stripMax(action) {
        const command = { ...action };
        delete command.max;
        return command;
    }

    // 割り込みの答え（待ち伏せ・野戦病院）。答えるまで出し続ける
    renderPrompt() {
        const v = this.view;
        if (!v?.prompt) {
            if (this.choiceKind === 'prompt' && $('#choice').open) {
                this.choiceKind = null;
                $('#choice').close();
            }
            return;
        }
        if (this.choiceKind === 'prompt' && $('#choice').open) return;
        const p = v.prompt;
        const c = p.clearing;
        const options = v.legal;
        const where = `${c + 1}（${SUIT_NAMES[CLEARINGS[c].suit]}）`;
        let title;
        let body;
        if (p.kind === 'ambush') {
            title = '待ち伏せを出しますか';
            body = `<p>${where}で攻撃を受けています。出すと、サイコロの前に攻撃側へ2打撃。</p>`;
        } else if (p.kind === 'counter') {
            title = '待ち伏せを打ち消しますか';
            body = `<p>${where}で待ち伏せを受けました。合う待ち伏せを出すと打ち消せます。</p>`;
        } else {
            title = '野戦病院';
            body = `<p>${where}で兵が${p.count}体除かれました。カードを1枚払うと、本拠に戻せます。</p>`;
        }
        this.openChoice({
            kind: 'prompt', title, body, cancellable: false,
            choices: options.map(a => ({
                html: a.card === null ? (p.kind === 'hospital' ? '戻さない' : '出さない') : `${suitDot(CARDS[a.card].suit)} ${escapeHtml(CARDS[a.card].name)}を出す`,
                cls: a.card === null ? 'plain' : '',
                run: () => this.send({ type: a.type, card: a.card })
            }))
        });
    }

    showPeek() {
        const peek = this.view.peek;
        if (!peek) return;
        const key = `${this.view.logCount}`;
        if (key === this.lastPeekKey) return;
        this.lastPeekKey = key;
        this.openChoice({
            kind: 'info', title: `${this.view.players[peek.target].name}の手札`, closeLabel: '閉じる',
            body: `<div class="peek">${peek.cards.length ? peek.cards.map(id => cardHtml(id)).join('') : '<p class="muted">なし</p>'}</div>`
        });
    }

    clearingInfoHtml(c) {
        const v = this.view;
        const m = v.map[c];
        const parts = [];
        Object.entries(m.warriors).filter(([, n]) => n > 0).forEach(([f, n]) => parts.push(`${FACTION_INFO[f].name}の兵 ${n}`));
        m.buildings.forEach(b => parts.push(`${FACTION_INFO[b.faction].name}の${BUILDING_NAMES[b.kind]}`));
        const wood = m.tokens.filter(t => t.kind === 'wood').length;
        if (wood) parts.push(`木材 ${wood}`);
        if (m.tokens.some(t => t.kind === 'keep')) parts.push('本拠');
        if (m.tokens.some(t => t.kind === 'sympathy')) parts.push('同調者');
        if (m.ruin) parts.push('遺跡');
        if (v.vagabond?.clearing === c) parts.push('放浪者');
        const ruler = m.ruler ? `支配：${FACTION_INFO[m.ruler].name}` : '支配なし';
        return `<p class="muted">${ruler}・空き枠 ${m.free}</p><p>${parts.join('、') || '駒なし'}</p>`;
    }

    openClearingInfo(c) {
        this.openChoice({ kind: 'info', title: `${c + 1}（${SUIT_NAMES[CLEARINGS[c].suit]}）`, body: this.clearingInfoHtml(c), closeLabel: '閉じる' });
    }

    // ---- 陣営の盤 ----

    openFaction(seat) {
        if (seat === null || seat === undefined || !this.view) return;
        const v = this.view;
        const p = v.players[seat];
        const f = p.faction;
        let html = `<div class="fb-head" style="--fc:${FACTION_COLORS[f]}">${emblemSvg(f, 34)}<div><h2>${escapeHtml(p.name)}</h2><small>${p.name === FACTION_INFO[f].name ? '' : `${FACTION_INFO[f].name}・`}${p.dominance !== null ? '支配' : `${p.score}点`}・手札${p.handCount}枚</small></div></div>`;
        if (f === 'marquise') {
            const b = v.marquise.built;
            html += `<h3>建物（建てた数／6）</h3><table class="fb-table">${['sawmill', 'workshop', 'recruiter'].map(k =>
                `<tr><th>${BUILDING_NAMES[k]}</th><td>${b[k]}</td><td>${b[k] < 6 ? `次は木材${MARQUISE_COST[b[k]]}・${MARQUISE_VP[k][b[k]]}点` : '全部'}</td></tr>`).join('')}</table>
                <p>地図の木材 ${v.marquise.wood}／8・手元の兵 ${p.supply}</p>`;
        } else if (f === 'eyrie') {
            const e = v.eyrie;
            html += `<p>指導者：<b>${e.leader ? LEADERS[e.leader].name : '—'}</b>${e.leader ? `<small>（${LEADERS[e.leader].text}）</small>` : ''}</p>
                <h3>布告</h3><div class="decree">${DECREE.map(col => `<div><b>${DECREE_NAMES[col]}</b>${e.decree[col].map(x => `<span>${suitDot(x.suit)}${x.vizier ? '宰相' : escapeHtml(CARDS[x.card].name)}</span>`).join('') || '<i>—</i>'}</div>`).join('')}</div>
                <p>止まり木 ${e.roosts}／7（夕方に${e.roosts > 0 ? ROOST_VP[e.roosts - 1] : 0}点）・手元の兵 ${p.supply}</p>`;
        } else if (f === 'alliance') {
            const a = v.alliance;
            html += `<p>支持者 ${a.supporterCount}枚${a.supporters ? `：${a.supporters.map(id => `${suitDot(CARDS[id].suit)}`).join('')}` : ''}</p>
                <p>官吏 ${a.officers}・同調者 ${a.sympathy}／10${a.sympathy < 10 ? `（次は支持者${SYMPATHY_COST[a.sympathy]}枚・${SYMPATHY_VP[a.sympathy]}点）` : ''}</p>
                <p>拠点：${a.bases.length ? a.bases.map(s => suitDot(s)).join('') : 'なし'}・手元の兵 ${p.supply}</p>`;
        } else if (v.vagabond) {
            const vb = v.vagabond;
            html += `<p>${vb.character ? `<b>${CHARACTERS[vb.character].name}</b><small>（${CHARACTERS[vb.character].special}）</small>` : ''}</p>
                <h3>アイテム</h3><p class="items">${vb.items.map(i => `<i class="item${i.exhausted ? ' ex' : ''}${i.damaged ? ' dm' : ''}">${ITEM_NAMES[i.type]}${i.damaged ? '（傷）' : i.exhausted ? '（使用済）' : ''}</i>`).join('')}</p>
                <h3>関係</h3><p>${Object.entries(vb.relations).map(([g, r]) => `${FACTION_INFO[g].name}：<b>${RELATION_NAMES[r]}</b>`).join('　')}</p>
                <h3>クエスト（果たした ${vb.completed.length}）</h3><p class="quests">${vb.quests.map(q => questHtml(q)).join('')}</p>`;
        }
        if (p.effects.length) html += `<h3>前に置いたカード</h3><div class="peek">${p.effects.map(id => cardHtml(id)).join('')}</div>`;
        if (p.crafted.length) html += `<p>作ったアイテム：${p.crafted.map(i => ITEM_NAMES[i]).join('・')}</p>`;
        if (p.dominance !== null) html += `<p>支配：${escapeHtml(CARDS[p.dominance].name)}${p.coalition !== null ? `（${escapeHtml(v.players[p.coalition].name)}と連合）` : ''}</p>`;
        if (seat === v.you && v.dominancePool.length) html += `<p class="muted">場の支配のカード：${v.dominancePool.map(id => escapeHtml(CARDS[id].name)).join('・')}</p>`;
        $('#faction-body').innerHTML = html;
        $('#faction').showModal();
    }

    openLog() {
        const logs = this.view?.logs ?? [];
        $('#log-list').innerHTML = logs.slice(-150).map(t => `<li>${escapeHtml(t)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    showResult() {
        const v = this.view;
        if (!v?.over) return;
        if ($('#choice').open) $('#choice').close();
        const win = v.winners.includes(v.you);
        $('#result-title').textContent = win ? 'あなたの勝ち' : `${v.winners.map(id => v.players[id].name).join('と')}の勝ち`;
        $('#result-reason').textContent = { score: `${WIN_SCORE}点に到達`, dominance: '支配による勝利', rounds: '巡の上限に到達（得点で判定）' }[v.endReason] ?? '';
        const order = [...v.players].sort((a, b) => b.score - a.score);
        $('#result-list').innerHTML = order.map(p => `<li class="${v.winners.includes(p.id) ? 'winner' : ''}${p.id === v.you ? ' mine' : ''}" style="--fc:${FACTION_COLORS[p.faction]}">
            ${emblemSvg(p.faction, 26)}<span class="r-name">${escapeHtml(p.name)}</span><span class="r-score">${p.dominance !== null ? '支配' : p.score}</span></li>`).join('');
        $('#result').showModal();
    }

    // ---- ヒント ----

    // おすすめの手を、操作のボタン・地図・手札に印を付けて知らせる（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.myTurn() ? this.controller?.hint() : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.sel = null;
        this.hintCommand = command;
        music.play('select');
        this.render();
        this.toast(`おすすめ：${this.hintText(command)}`);
    }

    hintText(c) {
        if (c.type === 'next') return this.nextLabel();
        if (c.type === 'discard') return `${c.cards.map(id => CARDS[id].name).join('・')}を捨てる`;
        const places = ['from', 'to', 'clearing'].filter(k => c[k] !== undefined && c[k] !== null).map(k => c[k] + 1);
        const where = places.length ? `（${places.join('→')}）` : '';
        const card = c.card !== undefined && c.card !== null ? `・${CARDS[c.card].name}` : '';
        return `${TYPE_LABELS[c.type] ?? c.type}${where}${card}`;
    }

    toast(message) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }
}

