/**
 * 画面（タイトル・ゲーム・決めるダイアログ・買い物・陰謀カード・手元・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import {
    FACTIONS, FACTION_NAME, FACTION_SHORT, ICON_NAME, ICON_SHORT, SPACES, SPACE_BY_ID, CARD_BY_ID, CONFLICT_BY_ID,
    INTRIGUE_BY_ID, INTRIGUE_KIND_NAME, LEADERS, LEADER_BY_ID, RESERVE, SELL_RATES, effectText, costText, intrigueText
} from './cards.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import { helpHtml, titleArtHtml } from './help.js';

// 自分の操作の効果音
const GAME = 'dune-imperium';
const COMMAND_SOUNDS = { agent: 'place', reveal: 'draw', buy: 'gain', plot: 'place', combat: 'place', pass: 'select', done: 'select', choose: 'select' };

const SETTINGS_KEY = 'dune-imperium.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
export const COLORS = ['#e2554a', '#4d8fe6', '#3fae5a', '#e8c33a'];
const RESULT_DELAY_MS = 900;
const ROUNDS = 10;
const ZONE_NAME = { hand: '手札', played: '出した', discard: '捨て札' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ヒントのボタン（操作の欄と、ダイアログに出す）
const HINT_BUTTON = '<button type="button" id="hint" class="icon-btn" data-act="hint" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg></button>';
const SWORD = '<svg class="ico sword" aria-hidden="true"><use href="#i-sword"/></svg>';

function loadSettings() {
    const fallback = { count: 3, level: 'normal', leader: 'random' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4].includes(saved.count) ? saved.count : fallback.count,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : fallback.level,
            leader: LEADER_BY_ID[saved.leader] ? saved.leader : 'random'
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

// ---- 図柄 ----

const res = (k, n) => `<span class="amt${n ? '' : ' zero'}"><i class="rs ${k}"></i><b>${n}</b></span>`;
const iconChip = (i) => `<i class="ic ic-${i}" title="${ICON_NAME[i]}">${ICON_SHORT[i]}</i>`;

// 効果の短い表記（盤面のマス）
function shortText(effects) {
    return (effects ?? []).map(e => {
        if (e.solari) return `<span class="amt"><i class="rs solari"></i>${e.solari}</span>`;
        if (e.spice) return `<span class="amt"><i class="rs spice"></i>${e.spice}</span>`;
        if (e.water) return `<span class="amt"><i class="rs water"></i>${e.water}</span>`;
        if (e.troops) return `部${e.troops}`;
        if (e.draw) return `札${e.draw}`;
        if (e.intrigue) return `陰${e.intrigue}`;
        if (e.persuasion) return `説${e.persuasion}`;
        if (e.trash) return '除外';
        if (e.council) return '評議会';
        if (e.swordmaster) return '3人目';
        if (e.mentat) return '+1人';
        if (e.foldspace) return '折畳';
        if (e.steal) return '奪う';
        if (e.harvest) return `<span class="amt"><i class="rs spice"></i>${e.harvest}+</span>`;
        if (e.sell) return '<span class="amt"><i class="rs spice"></i>→<i class="rs solari"></i></span>';
        return '';
    }).filter(Boolean).join(' ');
}

// カードの公開の短い表記
function revealShort(card) {
    const parts = [];
    let p = 0, s = 0;
    card.reveal.forEach(e => {
        if (e.persuasion) p += e.persuasion;
        if (e.swords) s += e.swords;
    });
    if (p) parts.push(`<span class="pers">説${p}</span>`);
    if (s) parts.push(`<span class="swd">剣${s}</span>`);
    if (card.reveal.some(e => !e.persuasion && !e.swords)) parts.push('<span class="more">＋</span>');
    return parts.join('');
}

function cardText(id) {
    const c = CARD_BY_ID[id];
    const parts = [];
    if (c.icons.length) parts.push(`送る：${c.icons.length === 7 ? 'どこでも' : c.icons.map(i => ICON_NAME[i]).join('・')}${c.anySpace ? '（ほかの人がいても置ける）' : ''}${c.agent.length ? `。${effectText(c.agent)}` : ''}`);
    else parts.push('エージェントには使えない');
    if (c.reveal.length) parts.push(`公開：${effectText(c.reveal)}`);
    if (c.acquire) parts.push(`買ったとき：${effectText(c.acquire)}`);
    return `<b>${escapeHtml(c.name)}</b>（${c.cost ? `説得${c.cost}` : '初期'}）${parts.join('。')}`;
}

function cardHtml(id, { attrs = '', cls = '' } = {}) {
    const c = CARD_BY_ID[id];
    return `<button type="button" class="card f-${c.faction ?? 'none'} ${cls}" ${attrs}>
        <span class="c-name">${escapeHtml(c.name)}</span>
        <span class="c-icons">${c.icons.length === 7 ? '<i class="ic ic-all">全</i>' : c.icons.map(iconChip).join('')}</span>
        <span class="c-rev">${revealShort(c)}</span>
    </button>`;
}

function spaceText(id) {
    const s = SPACE_BY_ID[id];
    const cost = s.cost ? `${costText(s.cost)}を払い、` : '';
    const need = s.need ? 'フレメンの影響力2以上で、' : '';
    const faction = FACTIONS.includes(s.icon) ? `${FACTION_SHORT[s.icon]}の影響力+1、` : '';
    const control = s.control ? `。支配した人は、だれかが置くたびに${effectText([s.control])}` : '';
    return `<b>${s.name}</b>（${ICON_NAME[s.icon]}${s.combat ? '・紛争' : ''}）：${need}${cost}${faction}${effectText(s.effects)}${control}`;
}

function rewardLine(rewards, i) {
    return rewards[i] ? `${i + 1}位：${effectText(rewards[i])}` : '';
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selCard = null;        // 選んだ手札の番号
        this.selSpace = null;       // 選んだ場所
        this.info = null;           // 説明を見ているもの（'s:場所'・'c:手札の番号'）
        this.decideKey = null;      // 開いている決めごとの印
        this.dismissedKey = null;   // 盤面を見るために閉じた決めごと
        this.marketKey = null;      // 買い物のダイアログを開いた番の印
        this.resultTimer = null;
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        $('#leader').innerHTML = `<option value="random">おまかせ</option>${LEADERS.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}`;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'デューン・インペリウム',
            game: 'dune-imperium',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 650,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                this.controller = null;
                this.showTitle();
            }
        });
        this.bindStatic();
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
        this.beginGame(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.stopGame();
        else document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        this.hint = null;
        this.view = null;
        this.selCard = null;
        this.selSpace = null;
        this.info = null;
        this.decideKey = null;
        this.dismissedKey = null;
        this.marketKey = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const { count, level, leader } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        const leaders = players.map((_, i) => (i === 0 && leader !== 'random' ? leader : null));
        this.startGame({ players, options: { seed: Math.floor(Math.random() * 2 ** 32), leaders } });
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
        this.selCard = null;
        this.selSpace = null;
        this.info = null;
        this.sending = command;
        try {
            return this.controller.send(command);
        } finally {
            this.sending = null;
        }
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
        $('#leader').value = this.settings.leader;
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
        $('#leader').addEventListener('change', () => {
            this.settings.leader = $('#leader').value;
            saveSettings(this.settings);
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#conflict').addEventListener('click', () => this.showConflict());

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
            if ($('#decide').open) return;
            if (this.decideKey) this.dismissedKey = this.decideKey;
            this.decideKey = null;
            if (this.view) this.renderActions(this.view);
        });

        $('#board').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-space]');
            if (tile) this.tapSpace(tile.dataset.space);
        });
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.tapCard(Number(card.dataset.card));
        });
        $('#players').addEventListener('click', (event) => {
            const row = event.target.closest('[data-seat]');
            if (row) this.showPlayer(Number(row.dataset.seat));
        });
        $('#me').addEventListener('click', (event) => {
            const button = event.target.closest('[data-act]');
            if (!button) return;
            if (button.dataset.act === 'mine') this.showPlayer(this.view.you);
            if (button.dataset.act === 'intrigue') this.showIntrigue();
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act);
        });
        $('#decide').addEventListener('click', (event) => {
            const button = event.target.closest('[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'hint') return this.showHint();
            if (button.dataset.act === 'choose') {
                this.decideKey = null;
                $('#decide').close();
                this.send({ type: 'choose', index: Number(button.dataset.index) });
            }
        });
        $('#market').addEventListener('click', (event) => {
            const button = event.target.closest('[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'hint') return this.showHint();
            if (button.dataset.act === 'close') return $('#market').close();
            if (button.dataset.act === 'buy') {
                const slot = /^\d+$/.test(button.dataset.slot) ? Number(button.dataset.slot) : button.dataset.slot;
                this.send({ type: 'buy', slot });
            }
            if (button.dataset.act === 'done') {
                $('#market').close();
                this.send({ type: 'done' });
            }
        });
        $('#intrigue').addEventListener('click', (event) => {
            const button = event.target.closest('[data-act]');
            if (!button || button.disabled) return;
            $('#intrigue').close();
            this.send({ type: button.dataset.act, index: Number(button.dataset.index) });
        });
    }

    // ---- 入力 ----

    myAct() {
        const v = this.view;
        return !!v && v.phase === 'turns' && !v.pending && v.current === v.you && v.stage === 'act';
    }

    myBuy() {
        const v = this.view;
        return !!v && v.phase === 'turns' && !v.pending && v.current === v.you && v.stage === 'buy';
    }

    myCombat() {
        const v = this.view;
        return !!v && v.phase === 'combat' && !v.pending && v.actors[0] === v.you;
    }

    // その手札で置ける場所
    spacesFor(cardIndex) {
        const v = this.view;
        const id = v.players[v.you].hand[cardIndex];
        return v.legal.filter(l => v.players[v.you].hand[l.card] === id).map(l => l.space);
    }

    // その場所に置ける手札の番号
    cardsFor(space) {
        const v = this.view;
        const hand = v.players[v.you].hand;
        const ids = new Set(v.legal.filter(l => l.space === space).map(l => hand[l.card]));
        return hand.map((id, i) => (ids.has(id) ? i : -1)).filter(i => i >= 0);
    }

    tapCard(index) {
        const v = this.view;
        if (!v) return;
        if (this.myAct()) {
            if (this.selCard === index) {
                this.selCard = null;
            } else {
                this.selCard = index;
                music.play('select');
                if (this.selSpace && !this.spacesFor(index).includes(this.selSpace)) this.selSpace = null;
            }
            this.info = null;
        } else {
            this.info = this.info === `c:${index}` ? null : `c:${index}`;
        }
        this.render();
    }

    tapSpace(space) {
        const v = this.view;
        if (!v) return;
        if (this.myAct() && this.cardsFor(space).length) {
            if (this.selSpace === space && this.selCard !== null && this.spacesFor(this.selCard).includes(space)) {
                this.send({ type: 'agent', card: this.selCard, space });
                return;
            }
            music.play('select');
            this.selSpace = space;
            this.info = null;
            if (this.selCard !== null && !this.spacesFor(this.selCard).includes(space)) this.selCard = null;
            const cards = this.cardsFor(space);
            if (this.selCard === null && cards.length === 1) this.selCard = cards[0];
        } else {
            this.selSpace = null;
            this.info = this.info === `s:${space}` ? null : `s:${space}`;
        }
        this.render();
    }

    act(name) {
        const v = this.view;
        switch (name) {
            case 'hint': return this.showHint();
            case 'send':
                if (this.selCard !== null && this.selSpace) this.send({ type: 'agent', card: this.selCard, space: this.selSpace });
                return;
            case 'reveal': return this.send({ type: 'reveal' });
            case 'market': return this.openMarket(v, true);
            case 'done': return this.send({ type: 'done' });
            case 'pass': return this.send({ type: 'pass' });
            case 'intrigue': return this.showIntrigue();
            case 'decide':
                this.dismissedKey = null;
                return this.openDecide(v);
            case 'cancel':
                this.selCard = null;
                this.selSpace = null;
                this.info = null;
                music.play('cancel');
                return this.render();
        }
    }

    // おすすめの手を、選んだ状態にして光らせる
    showHint() {
        const v = this.view;
        if (!v || this.controller?.isOnline || !v.actors.includes(v.you)) return;
        const command = this.controller.suggest();
        if (!command) return;
        music.play('select');
        this.hint = { at: v.commandCount, command };
        if (command.type === 'agent') {
            this.selCard = command.card;
            this.selSpace = command.space;
            this.info = null;
        }
        if (command.type === 'buy' && !$('#market').open) this.openMarket(v, true);
        if (command.type === 'plot' || command.type === 'combat') this.showIntrigue();
        this.render();
    }

    markHint() {
        const v = this.view;
        if (this.hint?.at !== v.commandCount) this.hint = null;
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const c = this.hint?.command;
        if (!c) return;
        const mark = (selector) => document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
        switch (c.type) {
            case 'agent':
                mark(`#hand [data-card="${c.card}"]`);
                mark(`#board [data-space="${c.space}"]`);
                mark('#actions [data-act="send"]');
                break;
            case 'reveal': mark('#actions [data-act="reveal"]'); break;
            case 'done': mark('#actions [data-act="done"], #market [data-act="done"]'); break;
            case 'pass': mark('#actions [data-act="pass"]'); break;
            case 'buy': mark(`#market [data-act="buy"][data-slot="${c.slot}"]`); break;
            case 'plot':
            case 'combat': mark(`#intrigue [data-act="${c.type}"][data-index="${c.index}"]`); mark('#actions [data-act="intrigue"]'); break;
            case 'choose': mark(`#decide [data-act="choose"][data-index="${c.index}"]`); break;
        }
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const v = this.controller.getView();
        this.view = v;
        this.playSound(prev, v);
        const me = v.players[v.you];
        if (!this.myAct()) {
            this.selCard = null;
            this.selSpace = null;
        }
        if (this.selCard !== null && this.selCard >= me.hand.length) this.selCard = null;
        this.renderStatus(v);
        this.renderPlayers(v);
        this.renderConflict(v);
        this.renderBoard(v);
        this.renderMe(v);
        this.renderHand(v);
        this.renderActions(v);
        if (v.pending?.seat === v.you && v.pending.options) this.openDecide(v);
        else if ($('#decide').open) {
            this.decideKey = null;
            $('#decide').close();
        }
        if (this.myBuy()) this.openMarket(v, false);
        else if ($('#market').open) $('#market').close();
        if ($('#intrigue').open) this.renderIntrigue(v);
        if (v.phase === 'over' && !this.resultTimer && !$('#result').open) {
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
        this.markHint();
    }

    // 1つの更新に1つの音。自分の操作は結果の音、ほかの人の手は notify、自分が動ける番になったら turn
    playSound(prev, v) {
        if (!prev || prev.commandCount === v.commandCount) return;
        if (v.phase === 'over') {
            if (prev.phase !== 'over') music.play(v.winners.includes(v.you) ? 'win' : 'lose');
            return;
        }
        if (this.sending) return music.play(COMMAND_SOUNDS[this.sending.type] ?? 'select');
        const canAct = (view) => view.actors.includes(view.you);
        music.play(canAct(v) && !canAct(prev) ? 'turn' : 'notify');
    }

    renderStatus(v) {
        const who = v.actors[0];
        let text = '';
        if (v.phase === 'over') text = 'ゲーム終了';
        else if (who !== undefined) {
            const name = who === v.you ? 'あなた' : escapeHtml(v.players[who].name);
            const what = v.pending ? 'が選ぶ' : v.phase === 'combat' ? 'の番・戦い' : v.stage === 'buy' ? 'の番・買い物' : 'の番';
            text = `<span class="who${who === v.you ? ' me' : ''}">${name}${what}</span>`;
        }
        $('#status').innerHTML = `<span class="round">${Math.min(v.round, ROUNDS)}/${ROUNDS}</span>${text}`;
    }

    renderPlayers(v) {
        const others = v.players.filter(p => p.id !== v.you);
        $('#players').innerHTML = others.map(p => `
            <button class="pl${v.actors.includes(p.id) ? ' active' : ''}${p.hasRevealed ? ' revealed' : ''}" data-seat="${p.id}" style="--c:${COLORS[p.id]}">
                ${v.firstPlayer === p.id ? '<span class="first" title="先手番">◆</span>' : ''}<span class="pl-name">${escapeHtml(p.name)}</span>
                <span class="pl-vp">${p.vp}点</span>
                ${res('solari', p.solari)}${res('spice', p.spice)}${res('water', p.water)}
                <span class="troops" title="駐屯地＋紛争">部${p.garrison}${p.troopsIn ? `<b>+${p.troopsIn}</b>` : ''}</span>
                <span class="cnt">陰${p.intrigueCount}</span>
                ${agentsHtml(p)}
            </button>`).join('');
    }

    renderConflict(v) {
        const c = CONFLICT_BY_ID[v.conflict];
        if (!c) {
            $('#conflict').innerHTML = '';
            return;
        }
        const fighters = v.players.filter(p => p.troopsIn > 0)
            .map(p => `<span class="str" style="--c:${COLORS[p.id]}">${p.strength}</span>`).join('');
        $('#conflict').innerHTML = `${SWORD}<span class="lv">Lv${c.level}</span><span class="cname">${escapeHtml(c.name)}</span>
            <span class="crw">${rewardLine(c.rewards, 0)}</span><span class="strs">${fighters}</span>`;
    }

    renderBoard(v) {
        const can = new Set(this.myAct() ? (this.selCard !== null ? this.spacesFor(this.selCard) : v.legal.map(l => l.space)) : []);
        const tile = (s) => {
            const occ = v.occupied[s.id] ?? [];
            const owner = v.control[s.id];
            const cls = ['sp', `ic-${s.icon}`, s.combat ? 'combat' : '', occ.length ? 'taken' : '',
                this.selSpace === s.id ? 'sel' : can.has(s.id) ? 'can' : '',
                this.info === `s:${s.id}` ? 'info' : ''].filter(Boolean).join(' ');
            const cost = s.cost ? `<span class="sp-cost">${shortCost(costFor(v, s))}</span>` : '';
            const bonus = s.desert && v.bonusSpice[s.id] ? `<span class="bonus">+${v.bonusSpice[s.id]}</span>` : '';
            const flag = owner !== null && owner !== undefined ? `<span class="flag" style="--c:${COLORS[owner]}" title="支配"></span>` : '';
            const who = occ.map(seat => `<i class="agent on" style="--c:${COLORS[seat]}"></i>`).join('');
            return `<button type="button" class="${cls}" data-space="${s.id}">
                <span class="sp-name">${s.name}</span>
                <span class="sp-gain">${cost}${s.need ? '<span class="need">フ2</span>' : ''}${shortText(s.effects)}${bonus}</span>
                ${s.combat ? SWORD : ''}<span class="sp-occ">${flag}${who}</span>
            </button>`;
        };
        const factions = FACTIONS.map(f => {
            const marks = v.players.map(p => `<i class="mk${v.alliance[f] === p.id ? ' ally' : ''}" style="--c:${COLORS[p.id]}">${p.influence[f]}</i>`).join('');
            return `<div class="fcol f-${f}"><div class="fhead"><span>${FACTION_SHORT[f]}</span><span class="marks">${marks}</span></div>
                ${SPACES.filter(s => s.icon === f).map(tile).join('')}</div>`;
        }).join('');
        const rest = SPACES.filter(s => !FACTIONS.includes(s.icon)).map(tile).join('');
        $('#board').innerHTML = `<div class="factions">${factions}</div><div class="spaces">${rest}</div>`;
    }

    renderMe(v) {
        const me = v.players[v.you];
        const leader = LEADER_BY_ID[me.leader];
        const active = v.actors.includes(v.you);
        const badges = [me.council ? '<span class="badge">評議会</span>' : '', me.swordmaster ? '<span class="badge">剣士</span>' : ''].join('');
        const reveal = me.hasRevealed ? `<span class="pers">説${me.persuasion}</span><span class="swd">剣${me.swords}</span>` : '';
        const top = me.deckTop ? `<span class="top">次：${escapeHtml(CARD_BY_ID[me.deckTop].name)}</span>` : '';
        $('#me').innerHTML = `
            <div class="me-row${active ? ' active' : ''}" style="--c:${COLORS[v.you]}">
                <button class="chip leader" data-act="mine">${v.firstPlayer === v.you ? '◆' : ''}${escapeHtml(leader.short)}</button>
                <span class="vp">${me.vp}点</span>
                ${res('solari', me.solari)}${res('spice', me.spice)}${res('water', me.water)}
                <span class="troops" title="駐屯地＋紛争">部${me.garrison}${me.troopsIn ? `<b>+${me.troopsIn}</b>` : ''}</span>
                <button class="chip" data-act="intrigue">陰謀${me.intrigue.length}</button>
                ${agentsHtml(me)}
            </div>
            <div class="me-row sub">
                <span class="deck">山札${me.deckCount}・捨て札${me.discard.length}</span>${badges}${reveal}${top}
            </div>`;
    }

    renderHand(v) {
        const me = v.players[v.you];
        const acting = this.myAct();
        const usable = acting ? new Set(v.legal.map(l => me.hand[l.card])) : new Set();
        const forSpace = acting && this.selSpace ? new Set(this.cardsFor(this.selSpace)) : null;
        const cards = me.hand.map((id, i) => cardHtml(id, {
            attrs: `data-card="${i}"`,
            cls: [this.selCard === i ? 'sel' : '', acting && !usable.has(id) ? 'dim' : '', forSpace && forSpace.has(i) && this.selCard !== i ? 'can' : '', this.info === `c:${i}` ? 'info' : ''].join(' ')
        }));
        if (!cards.length) cards.push(`<div class="card empty">${me.hasRevealed ? '公開済み' : '手札なし'}</div>`);
        $('#hand').innerHTML = cards.join('');
    }

    renderActions(v) {
        const me = v.players[v.you];
        let desc = '';
        let news = false;
        const buttons = [];
        const p = v.pending;
        const local = !this.controller?.isOnline;
        if (this.info) {
            desc = this.info.startsWith('s:') ? spaceText(this.info.slice(2)) + this.occupantText(v, this.info.slice(2)) : cardText(me.hand[Number(this.info.slice(2))] ?? '');
        } else if (v.phase === 'over') {
            desc = 'ゲーム終了';
        } else if (p?.seat === v.you && p.options) {
            desc = decideTitle(p, v);
            buttons.push('<button class="btn primary" data-act="decide">選ぶ</button>');
        } else if (this.myAct()) {
            const plots = me.intrigue.some(id => INTRIGUE_BY_ID[id].kind === 'plot');
            if (this.selCard !== null && this.selSpace) {
                desc = `${spaceText(this.selSpace)}<br>${cardText(me.hand[this.selCard])}`;
                buttons.push('<button class="btn secondary" data-act="cancel">戻す</button>', '<button class="btn primary" data-act="send">送る</button>');
            } else if (this.selCard !== null) {
                desc = `${cardText(me.hand[this.selCard])}<br><span class="muted">${this.spacesFor(this.selCard).length ? '送る場所を選ぶ' : 'このカードで送れる場所はない'}</span>`;
                buttons.push('<button class="btn secondary" data-act="reveal">公開</button>');
            } else if (this.selSpace) {
                desc = `${spaceText(this.selSpace)}<br><span class="muted">送るカードを選ぶ</span>`;
                buttons.push('<button class="btn secondary" data-act="reveal">公開</button>');
            } else {
                desc = v.legal.length ? 'カードを選んでエージェントを送るか、公開する' : (me.agentsLeft ? '送れる場所がない。公開する' : 'エージェントは出しきった。公開する');
                if (plots) buttons.push('<button class="btn secondary" data-act="intrigue">陰謀</button>');
                buttons.push(`<button class="btn ${v.legal.length ? 'secondary' : 'primary'}" data-act="reveal">公開</button>`);
            }
            if (local) buttons.unshift(HINT_BUTTON);
        } else if (this.myBuy()) {
            desc = `説得 <b>${me.persuasion}</b>・剣 ${me.swords}。カードを買う`;
            if (local) buttons.push(HINT_BUTTON);
            buttons.push('<button class="btn secondary" data-act="market">買う</button>', '<button class="btn primary" data-act="done">終える</button>');
        } else if (this.myCombat()) {
            desc = `戦い：戦力 ${me.strength}。戦闘の陰謀カードを使うか、パスする`;
            if (local) buttons.push(HINT_BUTTON);
            buttons.push('<button class="btn secondary" data-act="intrigue">陰謀</button>', '<button class="btn primary" data-act="pass">パス</button>');
        } else {
            news = true;
            desc = v.logs.slice(-2).map(l => escapeHtml(l.text)).join('<br>');
        }
        $('#actions').innerHTML = `<div class="desc${news ? ' news' : ''}">${desc}</div><div class="act-buttons">${buttons.join('')}</div>`;
    }

    occupantText(v, space) {
        const occ = v.occupied[space] ?? [];
        if (!occ.length) return '';
        return `（${occ.map(s => (s === v.you ? 'あなた' : escapeHtml(v.players[s].name))).join('・')}が置いている）`;
    }

    // ---- 決めるダイアログ ----

    openDecide(v) {
        const p = v.pending;
        const key = `${v.commandCount}:${p.kind}`;
        if (this.decideKey === key || this.dismissedKey === key) return;
        this.decideKey = key;
        $('#decide-title').textContent = decideTitle(p, v).replace(/<[^>]+>/g, '');
        $('#decide-note').innerHTML = decideNote(p, v);
        this.renderDecideBody(v);
        const dialog = $('#decide');
        if (!dialog.open) dialog.showModal();
        $('#decide-title').focus();
    }

    renderDecideBody(v) {
        const p = v.pending;
        const me = v.players[v.you];
        const opt = (i, inner, cls = 'choice') => `<button class="${cls}" data-act="choose" data-index="${i}">${inner}</button>`;
        let body = '';
        switch (p.kind) {
            case 'deploy':
                body = `<div class="nums">${p.options.map((n, i) => opt(i, `<b>${n}</b>`, 'num')).join('')}</div>`;
                break;
            case 'faction':
                body = p.options.map((f, i) => opt(i, `<span class="dot f-${f}"></span><span class="cname">${FACTION_NAME[f]}</span>
                    <span class="right">影響力 ${me.influence[f]} → ${me.influence[f] + 1}${v.alliance[f] === v.you ? '・同盟' : ''}</span>`)).join('');
                break;
            case 'pay':
                body = opt(0, `<span class="cname">払う</span><span class="right">${costText(p.cost)} → ${effectText(p.then)}</span>`) + opt(1, '<span class="cname">払わない</span>');
                break;
            case 'choice':
                body = p.options.map((o, i) => opt(i, `<span class="cname">${effectText(o)}</span>`)).join('');
                break;
            case 'trash':
                body = p.options.map((o, i) => (o.skip ? opt(i, '<span class="cname">除外しない</span>')
                    : opt(i, `<span class="col"><span class="cname">${escapeHtml(CARD_BY_ID[o.id].name)}</span><span class="ctext">${ZONE_NAME[o.zone]}</span></span>`))).join('');
                break;
            case 'sell':
                body = p.options.map((n, i) => opt(i, `<span class="cname">スパイス ${n}</span><span class="right">ソラリ ${SELL_RATES[n] + (me.leader === 'memnon' ? 2 : 0)}</span>`)).join('');
                break;
        }
        $('#decide-body').innerHTML = body;
        $('#decide-buttons').innerHTML = this.controller?.isOnline ? '' : HINT_BUTTON;
        this.markHint();
    }

    // ---- 買い物 ----

    openMarket(v, force) {
        const key = `${v.round}:${v.current}`;
        if (!force && (this.marketKey === key || $('#market').open)) {
            if ($('#market').open) this.renderMarket(v);
            return;
        }
        this.marketKey = key;
        this.renderMarket(v);
        if (!$('#market').open) $('#market').showModal();
        $('#market-title').focus();
    }

    renderMarket(v) {
        const me = v.players[v.you];
        const item = (slot, id, left = null) => {
            const c = CARD_BY_ID[id];
            const ok = c.cost <= me.persuasion && (left === null || left > 0);
            return `<div class="mk-card f-${c.faction ?? 'none'}">
                <div class="mk-head"><span class="cname">${escapeHtml(c.name)}</span>${c.faction ? `<span class="ftag f-${c.faction}">${FACTION_SHORT[c.faction]}</span>` : ''}
                    <span class="c-icons">${c.icons.map(iconChip).join('')}</span></div>
                <div class="ctext">${cardText(id).replace(/^<b>.*?<\/b>（.*?）/, '')}${left !== null ? `（残り${left}）` : ''}</div>
                <button class="btn ${ok ? 'primary' : 'secondary'} buy" data-act="buy" data-slot="${slot}" ${ok ? '' : 'disabled'}>説得${c.cost}</button>
            </div>`;
        };
        $('#market-note').innerHTML = `説得 <b>${me.persuasion}</b> を使って買う（買ったカードは捨て札へ）`;
        $('#market-body').innerHTML = [
            ...v.row.map((id, i) => item(i, id)),
            '<h3>予備</h3>',
            ...RESERVE.map(c => item(c.id, c.id, v.reserve[c.id]))
        ].join('');
        $('#market-buttons').innerHTML = `${this.controller?.isOnline ? '' : HINT_BUTTON}<button class="btn secondary" data-act="close">盤面を見る</button><button class="btn primary" data-act="done">買い終える</button>`;
        this.markHint();
    }

    // ---- 陰謀カード ----

    showIntrigue() {
        if (!this.view) return;
        this.renderIntrigue(this.view);
        if (!$('#intrigue').open) $('#intrigue').showModal();
    }

    renderIntrigue(v) {
        const me = v.players[v.you];
        const plotOk = v.phase === 'turns' && !v.pending && v.current === v.you;
        const combatOk = this.myCombat();
        $('#intrigue-note').textContent = me.intrigue.length ? '策略は自分の番に、戦闘は戦いのときに使う' : '陰謀カードはない';
        $('#intrigue-body').innerHTML = me.intrigue.map((id, i) => {
            const c = INTRIGUE_BY_ID[id];
            const ok = (c.kind === 'plot' && plotOk) || (c.kind === 'combat' && combatOk);
            return `<div class="icard k-${c.kind}"><div class="mk-head"><span class="cname">${escapeHtml(c.name)}</span><span class="ftag">${INTRIGUE_KIND_NAME[c.kind]}</span></div>
                <div class="ctext">${intrigueText(c)}</div>
                ${c.kind === 'end' ? '' : `<button class="btn ${ok ? 'primary' : 'secondary'} buy" data-act="${c.kind}" data-index="${i}" ${ok ? '' : 'disabled'}>使う</button>`}</div>`;
        }).join('');
        this.markHint();
    }

    // ---- ほかの画面 ----

    showPlayer(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        const mine = seat === v.you;
        const leader = LEADER_BY_ID[p.leader];
        const names = (ids) => (ids.length ? ids.map(id => escapeHtml(CARD_BY_ID[id].name)).join('・') : 'なし');
        const parts = [];
        parts.push(`<div class="lord-card"><div class="lname">${leader.name}</div><p><b>${leader.ability}</b>：${leader.text}<br><b>印章の指輪</b>：${effectText(leader.signet)}</p></div>`);
        parts.push(`<p>${p.vp}点・ソラリ${p.solari}・スパイス${p.spice}・水${p.water}・駐屯地の部隊${p.garrison}${p.troopsIn ? `・紛争に${p.troopsIn}` : ''}</p>`);
        parts.push(`<p>影響力：${FACTIONS.map(f => `${FACTION_SHORT[f]}${p.influence[f]}${v.alliance[f] === seat ? '（同盟）' : ''}`).join('・')}</p>`);
        const extra = [p.council ? '最高評議会の席' : '', p.swordmaster ? 'ソードマスター' : '', p.mentat ? 'メンタート' : ''].filter(Boolean);
        if (extra.length) parts.push(`<p>${extra.join('・')}</p>`);
        parts.push(`<h3>このラウンドに出したカード</h3><p>${names(p.played)}</p>`);
        if (p.revealed.length) parts.push(`<h3>公開したカード</h3><p>${names(p.revealed)}（説得${p.persuasion}・剣${p.swords}）</p>`);
        if (mine) {
            parts.push(`<h3>山札（${p.deckCount}枚・並びは隠す）</h3><p>${names(p.deckList)}</p>`);
            parts.push(`<h3>捨て札（${p.discard.length}枚）</h3><p>${names(p.discard)}</p>`);
        } else {
            parts.push(`<p>手札${p.handCount}枚・山札${p.deckCount}枚・捨て札${p.discard.length}枚・陰謀カード${p.intrigueCount}枚</p>`);
        }
        if (p.trashedCount) parts.push(`<p>除外したカード ${p.trashedCount}枚</p>`);
        $('#detail-title').textContent = mine ? 'あなたの手元' : p.name;
        $('#detail-body').innerHTML = parts.join('');
        $('#detail').showModal();
    }

    showConflict() {
        const v = this.view;
        const c = CONFLICT_BY_ID[v?.conflict];
        if (!c) return;
        const count = v.players.length === 4 ? 3 : 2;
        const rows = c.rewards.slice(0, count).map((_, i) => `<li>${rewardLine(c.rewards, i)}</li>`).join('');
        const strengths = v.players.map(p => `<li><span class="dot" style="--c:${COLORS[p.id]}"></span>${p.id === v.you ? 'あなた' : escapeHtml(p.name)}：部隊${p.troopsIn}${p.hasRevealed ? `・剣${p.swords}` : ''} → 戦力 ${p.strength}${p.hasRevealed || !p.troopsIn ? '' : '（＋公開の剣）'}</li>`).join('');
        $('#detail-title').textContent = `紛争（レベル${c.level}）：${c.name}`;
        $('#detail-body').innerHTML = `<h3>褒美</h3><ul class="plain">${rows}</ul><p class="muted">同点の1位は2位の褒美、同点の2位は3位の褒美。残りの紛争 ${v.conflictLeft}枚</p>
            <h3>戦力（部隊×2＋剣）</h3><ul class="plain">${strengths}</ul>`;
        $('#detail').showModal();
    }

    showLog() {
        const logs = this.view?.logs ?? [];
        $('#log-list').innerHTML = logs.map(l => `<li${l.text.startsWith('—') ? ' class="round"' : ''}>${escapeHtml(l.text)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view || view.phase !== 'over') return;
        if (view.players.filter(player => !player.isCPU).length !== 1) return;
        const id = `${GAME}-${controller.game.options.seed}`;
        if (this.recordedId === id) return;
        this.recordedId = id;
        recordResult({ game: GAME, id, outcome: outcomeFromWinners(view.winners, view.you, view.players.length) });
    }

    showResult() {
        this.recordLocalResult(this.view);
        const v = this.view;
        if (!v || v.phase !== 'over') return;
        const won = v.winners.includes(v.you);
        $('#result-title').textContent = won ? (v.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${v.winners.map(s => v.players[s].name).join('と')}の勝ち`;
        const rows = [...v.players].sort((a, b) => b.vp - a.vp || b.spice - a.spice || b.solari - a.solari).map(p => `
            <tr class="${p.id === v.you ? 'you' : ''}${v.winners.includes(p.id) ? ' win' : ''}">
                <th><span class="dot" style="--c:${COLORS[p.id]}"></span>${escapeHtml(p.name)}</th>
                <td class="total">${p.vp}</td><td>${p.spice}</td><td>${p.solari}</td><td>${p.water}</td>
            </tr>`).join('');
        const leaders = v.players.map(p => `${escapeHtml(p.name)}：${LEADER_BY_ID[p.leader].name}`).join('<br>');
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>点</th><th>スパイス</th><th>ソラリ</th><th>水</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="lords">${leaders}</div>`;
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

function agentsHtml(p) {
    const total = p.agents + (p.mentat ? 1 : 0);
    return `<span class="agents">${Array.from({ length: total }, (_, i) => `<i class="agent${i < p.agentsLeft ? '' : ' used'}" style="--c:${COLORS[p.id]}"></i>`).join('')}</span>`;
}

function costFor(v, s) {
    const cost = { ...s.cost };
    if (v.players[v.you].leader === 'leto' && s.icon === 'landsraad' && cost.solari) cost.solari -= 1;
    return cost;
}

function shortCost(cost) {
    return Object.entries(cost).map(([k, n]) => `<span class="amt"><i class="rs ${k}"></i>${n}</span>`).join('');
}

function decideTitle(p, v) {
    switch (p.kind) {
        case 'deploy': return '紛争に送る部隊の数';
        case 'faction': return '影響力を上げる勢力を選ぶ';
        case 'pay': return `${costText(p.cost)}を払う？`;
        case 'choice': return 'どれかを選ぶ';
        case 'trash': return '除外するカードを選ぶ';
        case 'sell': return '売るスパイスの量を選ぶ';
        default: return '選ぶ';
    }
}

function decideNote(p, v) {
    const me = v.players[v.you];
    if (p.kind === 'deploy') return `駐屯地 ${me.garrison}・紛争 ${me.troopsIn}（戦力は部隊×2＋剣）`;
    if (p.kind === 'pay') return `払えば ${effectText(p.then)}`;
    if (p.kind === 'trash') return '除外したカードは、もう山札に戻らない';
    return '';
}
