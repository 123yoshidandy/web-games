/**
 * 画面（タイトル・ゲーム・ラウンドの得点・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { CARDS, CARD_ORDER } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, miniHtml, icon } from './art.js';
import { makiIcons } from './scoring.js';

const SETTINGS_KEY = 'sushi-go.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン'];
const RESULT_DELAY_MS = 700;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5].includes(saved.count) ? saved.count : 4,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 4, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 手札の並び：札の種類の順
const sortCards = (cards) => [...cards].sort((a, b) => CARD_ORDER.indexOf(a) - CARD_ORDER.indexOf(b));
// 場の並び：種類の順（わさびに載ったにぎりは、にぎりの位置）
const sortTableau = (tableau) => [...tableau].sort((a, b) => CARD_ORDER.indexOf(a.nigiri ?? a.type) - CARD_ORDER.indexOf(b.nigiri ?? b.type));

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.hintCommand = null;
        this.selected = [];         // 選んだ札（手札の並びの位置）
        this.chopsticks = false;    // 箸で2枚取るか
        this.shownRound = 0;        // 得点を見せたラウンド
        this.seenRound = 0;         // 最後に描いたラウンド（新しいラウンドで選択を消す）
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelp();
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
                onUpdate: () => {
                    // ほかの人が動いても、ヒントを出している間は、今の場面のおすすめに出し直す
                    if (this.hintCommand) this.hintCommand = this.controller.hint();
                    this.render();
                },
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
        this.selected = [];
        this.chopsticks = false;
        const view = this.controller.getView();
        // 続きから始めたときは、もう見せたはずのラウンドの得点は出さない
        this.shownRound = view.roundResult?.round ?? 0;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
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
        $('#hint').addEventListener('click', () => this.showHint());
        $('#round-ok').addEventListener('click', () => $('#round-result').close());

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりの画面は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-index]');
            if (card) this.tapCard(Number(card.dataset.index));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'chopsticks') {
                this.chopsticks = !this.chopsticks;
                if (!this.chopsticks) this.selected = this.selected.slice(0, 1);
                this.render();
            } else if (button.dataset.act === 'pick') {
                this.submit();
            }
        });
    }

    canPick() {
        const v = this.view;
        return !!v && v.phase === 'pick' && !v.players[v.you].picked;
    }

    tapCard(index) {
        if (!this.canPick()) return;
        const limit = this.chopsticks ? 2 : 1;
        if (this.selected.includes(index)) this.selected = this.selected.filter(i => i !== index);
        else if (this.selected.length < limit) this.selected.push(index);
        else this.selected = limit === 1 ? [index] : [this.selected[0], index];
        this.render();
    }

    submit() {
        if (!this.canPick() || !this.selected.length) return;
        const hand = sortCards(this.view.players[this.view.you].hand);
        const [first, second] = this.selected.map(i => hand[i]);
        const command = { type: 'pick', card: first };
        if (this.chopsticks && second) command.second = second;
        this.selected = [];
        this.chopsticks = false;
        this.hintCommand = null;
        this.controller.send(command);
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        const cards = ['tempura', 'salmon', 'maki2', 'dumpling', 'pudding'];
        $('#title-art').innerHTML = cards.map((type, i) => `<div class="fan" style="--i:${i - 2}">${cardHtml(type)}</div>`).join('');
    }

    renderHelp() {
        const kinds = ['tempura', 'sashimi', 'dumpling', 'maki2', 'salmon', 'wasabi', 'pudding', 'chopsticks'];
        const counts = {
            maki2: '巻き寿司（●1つ6枚・2つ12枚・3つ8枚）',
            salmon: 'にぎり（玉子5枚・サーモン10枚・イカ5枚）'
        };
        const texts = { salmon: '玉子1点・サーモン2点・イカ3点（わさびの上で3倍）' };
        $('#help-cards').innerHTML = kinds.map(type => {
            const c = CARDS[type];
            return `<li>${cardHtml(type, { cls: 'small' })}<div><strong>${counts[type] ?? `${c.name}（${c.count}枚）`}</strong><br>${texts[type] ?? c.text}</div></li>`;
        }).join('');
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        const me = view.players[view.you];
        if (view.round !== this.seenRound || me.picked) {
            // 新しいラウンドか、選び終えたら、選択を消す
            if (view.round !== this.seenRound) this.chopsticks = false;
            if (me.picked || view.round !== this.seenRound) this.selected = [];
            this.seenRound = view.round;
        }
        if (!view.canUseChopsticks) this.chopsticks = false;
        // 手札の枚数が変わったら（渡された）、古い選択を消す
        const handSize = me.hand.length;
        if (this.lastHandSize !== handSize) {
            this.selected = [];
            this.lastHandSize = handSize;
        }
        $('#round').textContent = view.phase === 'end' ? '' : `ラウンド ${view.round}/3`;
        this.renderOpponents(view);
        this.renderMe(view);
        this.renderHand(view);
        this.renderActions(view);
        if ($('#log').open) this.renderLog();
        this.showRoundResult(view);
        if (view.phase === 'end' && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    tableauHtml(tableau) {
        return sortTableau(tableau).map(c => miniHtml(c)).join('');
    }

    // プリンは、取っておいた数と、今のラウンドの場の数（終わったあとは、場の分も取っておいた数に入っている）
    stats(p, view) {
        const maki = makiIcons(p.tableau);
        const pudding = p.puddings + (view.phase === 'end' ? 0 : p.tableau.filter(c => c.type === 'pudding').length);
        return `<span class="stat score">${p.score}<small>点</small></span>
            <span class="stat maki" title="巻き寿司">●${maki}</span>
            <span class="stat pud" title="プリン">プ${pudding}</span>`;
    }

    renderOpponents(view) {
        const others = view.players.filter(p => p.id !== view.you);
        $('#opponents').innerHTML = others.map(p => `
            <div class="opponent ${p.picked ? 'picked' : ''}">
                <div class="op-head">
                    <span class="op-name">${escapeHtml(p.name)}</span>
                    <span class="op-check" aria-label="${p.picked ? '選んだ' : '選んでいる'}">${p.picked ? icon('check') : '…'}</span>
                </div>
                <div class="op-stats">${this.stats(p, view)}</div>
                <div class="tableau">${this.tableauHtml(p.tableau)}</div>
            </div>`).join('');
    }

    renderMe(view) {
        const me = view.players[view.you];
        $('#me').innerHTML = `<div class="op-stats">${this.stats(me, view)}</div><div class="tableau">${this.tableauHtml(me.tableau)}</div>`;
    }

    renderHand(view) {
        const me = view.players[view.you];
        const hand = sortCards(me.hand);
        const picked = me.pick ? [...me.pick] : [];
        const can = this.canPick();
        // 列は5（9枚以上）か4。段の数から、札の大きさを決める（style.css）
        const cols = hand.length >= 9 ? 5 : 4;
        $('#hand').style.setProperty('--cols', String(cols));
        $('#hand').style.setProperty('--rows', String(Math.max(1, Math.ceil(hand.length / cols))));
        const hinted = this.hintIndexes(hand);
        $('#hand').innerHTML = hand.map((type, i) => {
            const order = this.selected.indexOf(i);
            let cls = can ? 'selectable' : '';
            if (order >= 0) cls += ' selected';
            if (!can) {
                const j = picked.indexOf(type);
                if (j >= 0) {
                    picked.splice(j, 1);
                    cls += ' chosen';
                } else cls += ' waiting';
            }
            if (hinted.has(i)) cls += ' recommended';
            const mark = order >= 0 && this.chopsticks ? `<span class="order">${order + 1}</span>` : '';
            return cardHtml(type, { cls, attrs: `data-index="${i}"` }).replace('</div>', `${mark}</div>`);
        }).join('');
    }

    renderActions(view) {
        const can = this.canPick();
        if (view.phase === 'end') {
            $('#actions').innerHTML = '';
            return;
        }
        const need = this.chopsticks ? 2 : 1;
        const ready = can && this.selected.length === need;
        const chop = view.canUseChopsticks
            ? `<button class="btn chop ${this.chopsticks ? 'on' : ''}" data-act="chopsticks" aria-pressed="${this.chopsticks}">箸で2枚</button>`
            : '';
        const label = can ? (this.chopsticks ? '2枚に決める' : '決める') : '選んだ';
        $('#actions').innerHTML = `${chop}<button class="btn primary" data-act="pick" ${ready ? '' : 'disabled'}>${label}</button>`;
    }

    // ---- 得点 ----

    showRoundResult(view) {
        const r = view.roundResult;
        if (!r || r.round <= this.shownRound) return;
        this.shownRound = r.round;
        if (view.phase === 'end') return; // 最後のラウンドは、終わりの画面にまとめる
        $('#round-title').textContent = `ラウンド${r.round}の得点`;
        $('#round-table').innerHTML = this.roundTable(view, r);
        if (!$('#round-result').open) $('#round-result').showModal();
    }

    roundTable(view, r) {
        const cols = [['maki', '巻'], ['tempura', '天'], ['sashimi', '刺'], ['dumpling', '餃'], ['nigiri', '握']];
        return `<table><thead><tr><th></th>${cols.map(([, h]) => `<th>${h}</th>`).join('')}<th>計</th></tr></thead><tbody>
            ${view.players.map((p, i) => `<tr class="${p.id === view.you ? 'you' : ''}"><th>${escapeHtml(p.name)}</th>
                ${cols.map(([k]) => `<td>${r.scores[i][k] || ''}</td>`).join('')}<td class="total">${r.scores[i].total}</td></tr>
                <tr class="cards-row"><td colspan="7"><div class="tableau">${this.tableauHtml(r.tableaus[i])}</div></td></tr>`).join('')}
        </tbody></table>`;
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const names = v.winners.map(id => v.players[id].name);
        $('#result-title').textContent = v.winners.includes(v.you)
            ? (v.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち')
            : `${names.join('と')}の勝ち`;
        const ranked = [...v.players].sort((a, b) => (b.score - a.score) || (b.puddings - a.puddings));
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>1</th><th>2</th><th>3</th><th>プ</th><th>計</th></tr></thead><tbody>
            ${ranked.map(p => `<tr class="${p.id === v.you ? 'you' : ''} ${v.winners.includes(p.id) ? 'win' : ''}"><th>${escapeHtml(p.name)}</th>
                ${p.rounds.map(s => `<td>${s}</td>`).join('')}<td>${v.puddingResult[p.id] > 0 ? '+' : ''}${v.puddingResult[p.id]}<small>（${p.puddings}）</small></td>
                <td class="total">${p.score}</td></tr>`).join('')}
        </tbody></table>`;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-150).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    // ---- ヒント ----

    // おすすめの札に印を付ける（画面だけ。記録には入れず、自分が選んだら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) {
            this.toast('いまは選ぶ札がありません');
            return;
        }
        this.hintCommand = command;
        this.render();
        const names = [command.card, command.second].filter(Boolean).map(type => CARDS[type].name);
        this.toast(`おすすめ：${names.join('と')}${command.second ? '（箸で2枚）' : ''}`);
    }

    // 手札の並びのうち、おすすめの札の位置
    hintIndexes(hand) {
        const marked = new Set();
        const c = this.hintCommand;
        if (!c) return marked;
        for (const type of [c.card, c.second].filter(Boolean)) {
            const i = hand.findIndex((t, j) => t === type && !marked.has(j));
            if (i >= 0) marked.add(i);
        }
        return marked;
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
