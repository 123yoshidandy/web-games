/**
 * 画面（タイトル・ゲーム・最後の結果・遊び方と、ジョーカーなどの色と数・新兵募集のダイアログ）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 操作：手札を選ぶと、出せる石が光る。石を押すと出す（ジョーカー・スパイ・盾持ちは、色と数を選んでから）
 * バンシー・裏切り者・策士は、場のカードを押して選ぶ。主張できる石には「主張」の札が光り、押すと取る
 * 主張できる石がなく、引く山札も選ばなくてよいときは、自動で番を終える
 */

import { isClan, isTactic, isJoker, WILDS, MODES, TACTICS, TACTIC_NAMES, COLOR_NAMES, wildChoices, cardLabel } from './game.js';
import { KIND_NAMES, kindOf, COLORS } from './formation.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, chipHtml, cardBackHtml, shape, TACTIC_MARKS } from './art.js';
import { captureAnchors, playEvents } from './animator.js';

const CPU_NAME = 'マクレガー';
const AUTO_END_MS = 500;
const RESULT_DELAY_MS = 1000;
// 石の下に出す、そろった組の短い呼び名（列の幅に収める）
const KIND_SHORT = { 5: '色連番', 4: '同数', 3: '同色', 2: '連番', 1: '合計' };
const LEVEL_KEY = 'schotten-totten.level';
const TACTICS_KEY = 'schotten-totten.tactics';
const TACTIC_HELP = {
    joker1: '色と数を選んで出す（1人1枚まで）', joker2: '色と数を選んで出す（1人1枚まで）',
    spy: '色を選んで、7として出す', shield: '色と数（1〜3）を選んで出す',
    blind: 'その石は、合計だけで比べる', mud: 'その石は、4枚ずつ出す',
    recruiter: '3枚引いて、2枚を山札の下に戻す', strategist: '自分の氏族カードを動かすか捨てる',
    banshee: '相手の氏族カードを1枚捨てさせる', traitor: '相手の氏族カードを、自分の石に動かす'
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function load(key, allowed, fallback) {
    try {
        const value = localStorage.getItem(key);
        return allowed.includes(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

export default class UI {
    constructor() {
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.level = load(LEVEL_KEY, LEVELS, 'normal');
        this.tactics = load(TACTICS_KEY, ['on', 'off'], 'off');
        this.resetSelection();
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderSettings();
        this.renderTitleArt();
        this.renderHelpPictures();
    }

    resetSelection() {
        this.selCard = null;        // 選んだ手札の位置
        this.target = null;         // 裏切り者・策士で選んだ場のカード { stone, index }
        this.returnSel = [];        // 新兵募集で戻す手札の位置
        this.wild = null;           // 色と数を選んでいるジョーカーなど { card, stone, as }
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
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
        this.resetSelection();
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        this.startGame({
            players: [{ name: 'あなた', isCPU: false }, { name: CPU_NAME, isCPU: true }],
            options: { tactics: this.tactics === 'on' },
            level: this.level
        });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.autoTimer);
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('[data-level]');
            if (!button) return;
            this.level = button.dataset.level;
            save(LEVEL_KEY, this.level);
            this.renderSettings();
        });
        $('#tactics').addEventListener('click', (event) => {
            const button = event.target.closest('[data-tactics]');
            if (!button) return;
            this.tactics = button.dataset.tactics;
            save(TACTICS_KEY, this.tactics);
            this.renderSettings();
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#wild').addEventListener('close', () => { this.wild = null; });

        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-hand]');
            if (card) this.pickHand(Number(card.dataset.hand));
        });
        $('#board').addEventListener('click', (event) => this.pickBoard(event));
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.act(button.dataset.act, button.dataset);
        });
        $('#wild-colors').addEventListener('click', (event) => {
            const button = event.target.closest('[data-c]');
            if (button && this.wild) { this.wild.as.c = Number(button.dataset.c); this.renderWild(); }
        });
        $('#wild-values').addEventListener('click', (event) => {
            const button = event.target.closest('[data-v]');
            if (button && this.wild) { this.wild.as.v = Number(button.dataset.v); this.renderWild(); }
        });
        $('#wild-go').addEventListener('click', () => {
            const wild = this.wild;
            $('#wild').close();
            if (wild) this.send({ type: 'play', card: wild.card, stone: wild.stone, as: { ...wild.as } });
        });
        $('#recruit-options').addEventListener('click', (event) => {
            const button = event.target.closest('[data-draws]');
            if (!button) return;
            $('#recruit').close();
            this.send({ type: 'play', card: 'recruiter', draws: button.dataset.draws.split(',') });
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    send(command) {
        this.resetSelection();
        this.controller?.send(command);
    }

    renderSettings() {
        document.querySelectorAll('#level [data-level]').forEach(button => {
            const on = button.dataset.level === this.level;
            button.classList.toggle('on', on);
            button.setAttribute('aria-checked', String(on));
        });
        document.querySelectorAll('#tactics [data-tactics]').forEach(button => {
            const on = button.dataset.tactics === this.tactics;
            button.classList.toggle('on', on);
            button.setAttribute('aria-checked', String(on));
        });
    }

    renderTitleArt() {
        // 9の5枚を扇に広げ、手前に境界石を置く
        $('#title-art').innerHTML = [0, 1, 2, 3, 4].map((c, i) => cardHtml(c * 9 + 8, { cls: `fan fan-${i}` })).join('')
            + '<div class="stone title-stone"><span>5</span></div>';
    }

    renderHelpPictures() {
        const examples = [[[0, 4], [0, 5], [0, 6]], [[1, 8], [3, 8], [5, 8]], [[4, 2], [4, 6], [4, 9]], [[2, 3], [5, 4], [1, 5]], [[0, 9], [3, 7], [2, 2]]];
        $('#help-ranks').innerHTML = examples.map((cards, i) => `<div class="rank-row"><span class="rank-name">${KIND_NAMES[5 - i]}</span>
            ${cards.map(([c, v]) => chipHtml({ card: c * 9 + v - 1, c, v })).join('')}</div>`).join('');
        const once = TACTICS.filter(t => t !== 'joker2');
        $('#help-tactics').innerHTML = once.map(t => `<li><strong>${TACTIC_NAMES[t]}</strong>${t === 'joker1' ? '（2枚）' : ''}：${TACTIC_HELP[t]}</li>`).join('');
    }

    // ---- 選ぶ ----

    myTurn(phase) {
        const view = this.view;
        return !!view && view.phase === phase && view.actor === view.you;
    }

    me() {
        return this.view.players[this.view.you];
    }

    rival() {
        return this.view.players[1 - this.view.you];
    }

    selectedCard() {
        return this.selCard === null ? null : this.me().hand[this.selCard];
    }

    // 戦術カードを出せない理由（出せるなら空）
    tacticBlock(card) {
        const me = this.me();
        if (isJoker(card) && me.jokerPlayed) return 'ジョーカーは1人1枚まで';
        if (me.tacticsPlayed > this.rival().tacticsPlayed) return '相手が戦術カードを出すまで出せない';
        return '';
    }

    pickHand(index) {
        if (this.myTurn('recruit')) {
            this.returnSel = this.returnSel.includes(index) ? this.returnSel.filter(i => i !== index)
                : [...this.returnSel, index].slice(-2);
            this.render();
            return;
        }
        if (!this.myTurn('play')) return;
        this.selCard = this.selCard === index ? null : index;
        this.target = null;
        this.render();
        const card = this.selectedCard();
        if (card === 'recruiter' && !this.tacticBlock(card)) this.openRecruit();
    }

    // 石の自分の側に出せるか
    canPlace(index) {
        const stone = this.view.stones[index];
        return stone.owner === null && stone.sides[this.view.you].length < stone.size;
    }

    // 選んだカードで、どの石・どの場のカードを選べるか
    targets() {
        const card = this.selectedCard();
        const view = this.view;
        const you = view.you;
        const none = { stones: [], cards: [] };
        if (card === null || (isTactic(card) && this.tacticBlock(card))) return none;
        const open = view.stones.map((s, i) => i).filter(i => view.stones[i].owner === null);
        const clanOf = (owner) => open.flatMap(stone => view.stones[stone].sides[owner].map((x, index) => (isClan(x.card) ? { owner, stone, index } : null)).filter(Boolean));
        if (isClan(card) || WILDS.includes(card)) return { stones: open.filter(i => this.canPlace(i)), cards: [] };
        if (MODES.includes(card)) return { stones: open.filter(i => !view.stones[i].modes.includes(card)), cards: [] };
        if (card === 'banshee') return { stones: [], cards: clanOf(1 - you) };
        if (card === 'traitor' || card === 'strategist') {
            const owner = card === 'traitor' ? 1 - you : you;
            if (!this.target) return { stones: [], cards: clanOf(owner) };
            return { stones: open.filter(i => this.canPlace(i) && !(card === 'strategist' && i === this.target.stone)), cards: [] };
        }
        return none;
    }

    pickBoard(event) {
        const claim = event.target.closest('[data-claim]');
        if (claim && this.myTurn('claim')) {
            this.send({ type: 'claim', stone: Number(claim.dataset.claim) });
            return;
        }
        if (!this.myTurn('play') || this.selCard === null) return;
        const card = this.selectedCard();
        const { stones, cards } = this.targets();
        const chip = event.target.closest('[data-owner]');
        if (chip) {
            const ref = { stone: Number(chip.dataset.stone), index: Number(chip.dataset.index) };
            const owner = chip.dataset.owner === 'me' ? this.view.you : 1 - this.view.you;
            if (cards.some(x => x.owner === owner && x.stone === ref.stone && x.index === ref.index)) {
                if (card === 'banshee') this.send({ type: 'play', card, target: ref });
                else { this.target = ref; this.render(); }
                return;
            }
        }
        const col = event.target.closest('[data-stone]');
        if (!col) return;
        const stone = Number(col.dataset.stone);
        if (!stones.includes(stone)) return;
        if (isClan(card) || MODES.includes(card)) this.send({ type: 'play', card, stone });
        else if (WILDS.includes(card)) this.openWild(card, stone);
        else if (card === 'traitor') this.send({ type: 'play', card, target: this.target, to: stone });
        else if (card === 'strategist') this.send({ type: 'play', card, from: this.target, to: stone });
    }

    act(action) {
        if (action === 'cancel') {
            this.resetSelection();
            this.render();
        } else if (action === 'pass') {
            this.send({ type: 'pass' });
        } else if (action === 'discard' && this.target) {
            this.send({ type: 'play', card: 'strategist', from: this.target, to: null });
        } else if (action === 'recruit') {
            this.openRecruit();
        } else if (action === 'return' && this.returnSel.length === 2) {
            const hand = this.me().hand;
            this.send({ type: 'return', cards: this.returnSel.map(i => hand[i]) });
        } else if (action === 'end-clan' || action === 'end-tactic') {
            this.send({ type: 'end', draw: action === 'end-tactic' ? 'tactic' : 'clan' });
        }
    }

    openWild(card, stone) {
        const choices = wildChoices(card);
        this.wild = { card, stone, as: { ...choices.at(-1) } };
        $('#wild-title').textContent = `${TACTIC_NAMES[card]}の色${choices.length > COLORS ? 'と数' : ''}`;
        this.renderWild();
        $('#wild').showModal();
    }

    renderWild() {
        const wild = this.wild;
        const values = [...new Set(wildChoices(wild.card).map(x => x.v))];
        $('#wild-colors').innerHTML = COLOR_NAMES.map((name, c) => `<button class="choice c${c} ${wild.as.c === c ? 'on' : ''}" data-c="${c}" aria-label="${name}">${shape(c, 'choice-shape')}</button>`).join('');
        $('#wild-values').hidden = values.length === 1;
        $('#wild-values').innerHTML = values.map(v => `<button class="choice value ${wild.as.v === v ? 'on' : ''}" data-v="${v}">${v}</button>`).join('');
    }

    openRecruit() {
        const view = this.view;
        const total = Math.min(3, view.deckCount + view.tacticDeckCount);
        const options = [];
        for (let t = 0; t <= total; t++) {
            const clan = total - t;
            if (clan > view.deckCount || t > view.tacticDeckCount) continue;
            const label = [clan ? `氏族${clan}枚` : '', t ? `戦術${t}枚` : ''].filter(Boolean).join('・');
            options.push(`<button class="btn small secondary" data-draws="${[...Array(clan).fill('clan'), ...Array(t).fill('tactic')].join(',')}">${label}</button>`);
        }
        $('#recruit-options').innerHTML = options.join('');
        $('#recruit').showModal();
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!this.myTurn('play')) { this.selCard = null; this.target = null; }
        if (!this.myTurn('recruit')) this.returnSel = [];
        if (this.selCard !== null && this.selCard >= this.me().hand.length) this.selCard = null;

        this.renderTop();
        this.renderStrip('#rival', this.rival());
        this.renderBoard(fresh);
        this.renderStrip('#me', this.me());
        this.renderHand();
        this.renderActions();
        playEvents(fresh, before, { you: view.you });
        this.scheduleAutoEnd();
        if (view.phase === 'end' && fresh.some(e => e.type === 'end')) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    // 主張できる石がなく、引く山札を選ばなくてよければ、自動で番を終える
    needsDrawChoice() {
        const view = this.view;
        return view.tactics && this.me().handCount < view.handSize && view.deckCount > 0 && view.tacticDeckCount > 0;
    }

    scheduleAutoEnd() {
        clearTimeout(this.autoTimer);
        if (!this.myTurn('claim') || this.view.claimable.length > 0 || this.needsDrawChoice()) return;
        const turn = this.view.turn;
        this.autoTimer = setTimeout(() => {
            if (this.myTurn('claim') && this.view.turn === turn && this.view.claimable.length === 0) this.send({ type: 'end', draw: 'clan' });
        }, AUTO_END_MS);
    }

    renderTop() {
        const view = this.view;
        const tactic = view.tactics ? `<span class="deck" id="tactic-deck" title="戦術の山札">${cardBackHtml('tactic', 'mini')}<b>${view.tacticDeckCount}</b></span>` : '';
        $('#decks').innerHTML = `<span class="deck" id="clan-deck" title="氏族の山札">${cardBackHtml('clan', 'mini')}<b>${view.deckCount}</b></span>${tactic}`;
    }

    renderStrip(selector, player) {
        const view = this.view;
        const mine = player.id === view.you;
        const active = view.actor === player.id;
        const hand = mine ? '' : `<span id="rival-hand" class="rival-hand" title="手札">${cardBackHtml('clan', 'mini')}<b>${player.handCount}</b>${player.tacticsInHand ? `<span class="t-count">戦${player.tacticsInHand}</span>` : ''}</span>`;
        const tactics = view.tactics ? `<span class="played" title="出した戦術カード">戦術 <b>${player.tacticsPlayed}</b></span>` : '';
        $(selector).className = `strip ${mine ? 'me' : 'rival'} ${active ? 'active' : ''}`;
        $(selector).innerHTML = `<span class="s-name">${escapeHtml(player.name)}</span>${hand}${tactics}
            <span class="taken" title="取った境界石"><span class="stone-icon"></span><b>${player.stones}</b></span>`;
    }

    renderBoard(fresh) {
        const view = this.view;
        const you = view.you;
        const { stones: targetStones, cards: targetCards } = this.myTurn('play') ? this.targets() : { stones: [], cards: [] };
        const claimNow = this.myTurn('claim') ? view.claimable : [];
        const justClaimed = new Set(fresh.filter(e => e.type === 'claim').map(e => e.stone));
        const card = this.selectedCard();
        const forMine = card !== null && (isClan(card) || WILDS.includes(card) || card === 'traitor' || card === 'strategist');
        $('#board').innerHTML = view.stones.map((stone, i) => {
            const side = (seat, who) => {
                const chips = stone.sides[seat].map((entry, index) => {
                    const targetable = targetCards.some(x => x.owner === seat && x.stone === i && x.index === index);
                    const picked = this.target && seat === (card === 'traitor' ? 1 - you : you) && this.target.stone === i && this.target.index === index;
                    return chipHtml(entry, { cls: `${targetable ? 'targetable' : ''} ${picked ? 'picked' : ''}`, attrs: `data-owner="${who}" data-stone="${i}" data-index="${index}"` });
                });
                const slot = who === 'me' && forMine && targetStones.includes(i) ? '<div class="slot"></div>' : '';
                const strength = stone.strengths[seat] >= 0 ? `<span class="kind" title="${KIND_NAMES[kindOf(stone.strengths[seat])]}">${KIND_SHORT[kindOf(stone.strengths[seat])]}</span>` : '';
                return `<div class="side ${who}" data-side="${who}" data-stone-side="${i}">${chips.join('')}${slot}${strength}</div>`;
            };
            const owner = stone.owner === you ? 'mine' : stone.owner === 1 - you ? 'theirs' : '';
            const modes = stone.modes.map(m => `<span class="mode" title="${TACTIC_NAMES[m]}">${TACTIC_MARKS[m]}</span>`).join('');
            const claimable = claimNow.includes(i);
            const target = targetStones.includes(i) && !forMine ? 'mode-target' : '';
            const claim = claimable ? `<button class="claim" data-claim="${i}">主張</button>` : '';
            return `<div class="col ${targetStones.includes(i) ? 'placeable' : ''}" data-stone="${i}">
                ${side(1 - you, 'op')}
                <div class="stone ${owner} ${target} ${claimable ? 'claimable' : ''} ${justClaimed.has(i) ? 'just' : ''}" id="stone-${i}"><span>${i + 1}</span>${modes ? `<span class="modes">${modes}</span>` : ''}${claim}</div>
                ${side(you, 'me')}
            </div>`;
        }).join('');
    }

    renderHand() {
        const me = this.me();
        const play = this.myTurn('play');
        const recruit = this.myTurn('recruit');
        $('#hand').innerHTML = me.hand.map((card, i) => {
            const picked = this.selCard === i || this.returnSel.includes(i);
            const blocked = play && isTactic(card) && this.tacticBlock(card) ? 'blocked' : '';
            return cardHtml(card, { cls: `${picked ? 'picked' : ''} ${play || recruit ? 'tappable' : ''} ${blocked}`, attrs: `data-hand="${i}" ${play || recruit ? 'role="button"' : ''}` });
        }).join('');
    }

    renderActions() {
        const view = this.view;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        const log = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        let html = log;
        if (this.myTurn('play')) {
            const card = this.selectedCard();
            if (card === null) {
                html = view.canPlaceClan ? log : `<span class="act-note">置ける石がありません</span><button class="btn small secondary" data-act="pass">パス</button>`;
            } else if (isTactic(card)) {
                const block = this.tacticBlock(card);
                const note = block || (this.target ? (card === 'traitor' ? '動かす先の石を選ぶ' : '動かす先の石か、捨てる') : TACTIC_HELP[card]);
                const extra = !block && card === 'strategist' && this.target ? '<button class="btn small secondary" data-act="discard">捨てる</button>'
                    : !block && card === 'recruiter' ? '<button class="btn small primary" data-act="recruit">使う</button>' : '';
                html = `<span class="act-note">${note}</span>${extra}${cancel}`;
            } else {
                html = `<span class="act-note">${cardLabel(card)}</span>${cancel}`;
            }
        } else if (this.myTurn('recruit')) {
            html = `<span class="act-note">山札の下に戻す2枚</span><button class="btn small primary" data-act="return" ${this.returnSel.length === 2 ? '' : 'disabled'}>戻す</button>`;
        } else if (this.myTurn('claim') && (view.claimable.length > 0 || this.needsDrawChoice())) {
            html = this.needsDrawChoice()
                ? '<button class="btn small primary" data-act="end-clan">氏族を引く</button><button class="btn small secondary" data-act="end-tactic">戦術を引く</button>'
                : '<button class="btn small primary" data-act="end-clan">番を終える</button>';
        }
        $('#actions').innerHTML = html;
    }

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end') return;
        $('#result-title').textContent = view.winner === null ? '引き分け' : view.winner === view.you ? 'あなたの勝ち' : `${view.players[view.winner].name}の勝ち`;
        const counts = `（${view.players[view.you].stones} 対 ${view.players[1 - view.you].stones}）`;
        $('#result-note').textContent = view.winReason === 'adjacent' ? '隣り合う3つの石を取りました'
            : view.winReason === 'count' ? `5つの石を取りました${counts}` : `これ以上進まないので、取った石の数で決めました${counts}`;
        if (!$('#result').open) $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
