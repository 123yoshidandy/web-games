/**
 * 画面（タイトル・ゲーム・ラウンドの結果・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 選び方：市場の商品と、返す手札・ラクダをタップで選ぶと、操作の欄に今できる操作が1つだけ出る
 * - 市場の商品1枚 → 取る / 市場のラクダ → ラクダを全部取る
 * - 市場の商品2枚以上＋返す手札・ラクダ → 交換（通らないときは理由を短く出す）
 * - 手札だけ（1種類） → 売る。市場で何も選んでいないときに手札を押すと、その種類をまとめて選ぶ
 */

import { GOODS, CAMEL, PRECIOUS, NAMES, HAND_LIMIT, SEALS_TO_WIN, CAMEL_BONUS, GOODS_TOKENS, bonusSize } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { symbolsSvg, icon, cardHtml, cardBackHtml, tokenHtml, sealHtml } from './art.js';
import { captureAnchors, playEvents } from './animator.js';

const CPU_NAME = 'ラジャ';
const ROUND_DIALOG_DELAY_MS = 700;

const $ = (selector) => document.querySelector(selector);
const sum = (list) => list.reduce((s, v) => s + v, 0);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const emptySelection = () => ({ market: [], camels: false, hand: [], giveCamels: 0 });

export default class UI {
    constructor() {
        this.controller = null;
        this.view = null;
        this.sel = emptySelection();
        this.lastSeq = 0;
        this.dialogTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelpPictures();
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
        this.sel = emptySelection();
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        this.startGame({ players: [{ name: 'あなた', isCPU: false }, { name: CPU_NAME, isCPU: true }], options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.dialogTimer);
        ['#round-result', '#result'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
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
        $('#next-round').addEventListener('click', () => {
            $('#round-result').close();
            this.render(); // 閉じたら、自分の番の操作を受け付ける
            this.controller?.resume();
        });

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'round-result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#market').addEventListener('click', (event) => {
            const card = event.target.closest('[data-market]');
            if (card) this.pickMarket(Number(card.dataset.market));
        });
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-hand]');
            if (card) this.pickHand(Number(card.dataset.hand));
        });
        $('#herd').addEventListener('click', () => this.pickHerd());
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'cancel') {
                this.sel = emptySelection();
                this.render();
            } else if (button.dataset.act === 'camels') {
                this.send({ type: 'camels' });
            } else if (button.dataset.act === 'go') {
                const action = this.analyze();
                if (action?.ok) this.send(action.command);
            }
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    send(command) {
        this.sel = emptySelection();
        this.controller?.send(command);
    }

    renderTitleArt() {
        $('#title-art').innerHTML = ['leather', 'spice', 'diamond', 'gold', 'camel'].map((type, i) => cardHtml(type, { cls: `fan fan-${i}` })).join('');
    }

    renderHelpPictures() {
        $('#help-goods').innerHTML = GOODS.map(g => `<div class="help-good">${cardHtml(g, { cls: 'tiny' })}<span class="help-tokens">${
            this.tokenRow(g)}</span></div>`).join('');
        $('#help-exchange').innerHTML = `${cardHtml('diamond', { cls: 'tiny' })}${cardHtml('gold', { cls: 'tiny' })}<span class="arrow">⇄</span>${cardHtml('leather', { cls: 'tiny' })}${cardHtml('camel', { cls: 'tiny' })}`;
    }

    tokenRow(good) {
        return GOODS_TOKENS[good].join('・');
    }

    // ---- 選ぶ ----

    myTurn() {
        const view = this.view;
        return !!view && view.phase === 'play' && view.current === view.you && !$('#round-result').open;
    }

    me() {
        return this.view.players[this.view.you];
    }

    pickMarket(index) {
        if (!this.myTurn()) return;
        const card = this.view.market[index];
        if (card === CAMEL) {
            // ラクダは全部まとめて取るので、ラクダを押したら「ラクダを全部取る」だけにする
            this.sel = this.sel.camels ? emptySelection() : { ...emptySelection(), camels: true };
        } else {
            const market = this.sel.market.includes(index) ? this.sel.market.filter(i => i !== index) : [...this.sel.market, index];
            this.sel = { ...this.sel, camels: false, market };
            if (market.length === 0) this.sel.giveCamels = 0;
        }
        this.render();
    }

    pickHand(index) {
        if (!this.myTurn()) return;
        const hand = this.me().hand;
        const sel = this.sel;
        sel.camels = false;
        if (sel.hand.includes(index)) {
            sel.hand = sel.hand.filter(i => i !== index);
        } else if (sel.market.length === 0 && sel.giveCamels === 0) {
            // 売るつもり：その種類をまとめて選ぶ（ほかの種類を選んでいたら入れ替える）
            const type = hand[index];
            const sameType = sel.hand.length > 0 && hand[sel.hand[0]] === type;
            sel.hand = sameType ? [...sel.hand, index] : hand.map((t, i) => (t === type ? i : -1)).filter(i => i >= 0);
        } else {
            sel.hand = [...sel.hand, index];
        }
        this.render();
    }

    pickHerd() {
        if (!this.myTurn() || this.sel.market.length === 0) return;
        // 押すたびに返すラクダを1頭ずつ増やし、群れの数を超えたら0に戻す
        const herd = this.me().herd;
        this.sel.giveCamels = this.sel.giveCamels >= herd ? 0 : this.sel.giveCamels + 1;
        this.render();
    }

    // 今の選び方でできる操作。{ kind, ok, command, label, reason }
    analyze() {
        const view = this.view;
        const me = this.me();
        const sel = this.sel;
        if (sel.camels) {
            const n = view.market.filter(c => c === CAMEL).length;
            return { kind: 'camels', ok: true, command: { type: 'camels' }, label: `ラクダを全部取る（${n}）` };
        }
        const k = sel.market.length;
        const handTypes = sel.hand.map(i => me.hand[i]);
        const give = sel.hand.length + sel.giveCamels;
        if (k === 0 && sel.giveCamels === 0 && sel.hand.length > 0) {
            const types = [...new Set(handTypes)];
            if (types.length > 1) return { kind: 'sell', ok: false, label: '売る', reason: '1種類ずつ' };
            const good = types[0];
            const n = sel.hand.length;
            const points = sum(view.goodsTokens[good].slice(0, n));
            const bonus = bonusSize(n) && view.bonusCounts[bonusSize(n)] > 0 ? '＋ボーナス' : '';
            if (PRECIOUS.includes(good) && n < 2) return { kind: 'sell', ok: false, label: `売る ${n}枚`, reason: `${NAMES[good]}は2枚から` };
            return { kind: 'sell', ok: true, command: { type: 'sell', good, count: n }, label: `売る ${n}枚`, note: `${points}点${bonus}` };
        }
        if (k === 1 && give === 0) {
            const ok = me.hand.length < HAND_LIMIT;
            return { kind: 'take', ok, command: { type: 'take', index: sel.market[0] }, label: '取る', reason: ok ? '' : `手札は${HAND_LIMIT}枚まで` };
        }
        if (k >= 1) {
            const counts = {};
            handTypes.forEach(t => { counts[t] = (counts[t] ?? 0) + 1; });
            if (sel.giveCamels > 0) counts[CAMEL] = sel.giveCamels;
            const taken = sel.market.map(i => view.market[i]);
            const label = `交換 ${k}⇄${give}`;
            const command = { type: 'exchange', take: [...sel.market], give: counts };
            let reason = '';
            if (k < 2) reason = '2枚以上取る';
            else if (give < k) reason = `あと${k - give}枚返す`;
            else if (give > k) reason = `返すのは${k}枚`;
            else if (handTypes.some(t => taken.includes(t))) reason = '同じ種類は返せない';
            else if (me.hand.length - sel.hand.length + k > HAND_LIMIT) reason = `手札が${HAND_LIMIT}枚を超える`;
            return { kind: 'exchange', ok: reason === '', command, label, reason };
        }
        return null;
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        if (!this.myTurn()) this.sel = emptySelection();
        this.validateSelection();

        this.renderTop();
        this.renderRival();
        this.renderStacks();
        this.renderMarket();
        this.renderMe();
        this.renderHand();
        this.renderActions();

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        const roundEnd = fresh.find(e => e.type === 'roundEnd');
        if (roundEnd) {
            // ラウンドが終わったときは、新しいラウンドが配られているので動かさず、結果を出す。見ている間は CPU を止める
            this.controller.pause();
            clearTimeout(this.dialogTimer);
            this.dialogTimer = setTimeout(() => this.showRoundResult(roundEnd, fresh.some(e => e.type === 'end')), ROUND_DIALOG_DELAY_MS);
        } else {
            playEvents(fresh, before, { you: view.you });
        }
    }

    // 選んでいたものが、場の変化で選べなくなったら外す
    validateSelection() {
        const sel = this.sel;
        const me = this.view.players[this.view.you];
        sel.market = sel.market.filter(i => this.view.market[i] && this.view.market[i] !== CAMEL);
        sel.hand = sel.hand.filter(i => i < me.hand.length);
        sel.giveCamels = Math.min(sel.giveCamels, me.herd);
        if (sel.camels && !this.view.market.includes(CAMEL)) sel.camels = false;
    }

    renderTop() {
        const view = this.view;
        const seals = (p) => Array.from({ length: SEALS_TO_WIN }, (_, i) => sealHtml(i < p.seals)).join('');
        const me = this.me();
        const rival = view.players[1 - view.you];
        $('#round-info').textContent = `第${view.round}ラウンド`;
        $('#seals').innerHTML = `<span class="seal-group" title="あなたの印">${seals(me)}</span><span class="vs">対</span><span class="seal-group" title="${escapeHtml(rival.name)}の印">${seals(rival)}</span>`;
    }

    renderRival() {
        const view = this.view;
        const rival = view.players[1 - view.you];
        const active = view.current === rival.id && view.phase === 'play';
        $('#rival').className = `rival ${active ? 'active' : ''}`;
        $('#rival').innerHTML = `
            <span class="r-name">${escapeHtml(rival.name)}</span>
            <span id="rival-hand" class="rival-hand" title="手札">${cardBackHtml('mini')}<b>${rival.handCount}</b></span>
            <span id="rival-herd" class="herd-count" title="ラクダ">${icon('camel')}<b>${rival.herd}</b></span>
            <span id="rival-score" class="score" title="点数（ボーナスは伏せたまま）"><b>${rival.tokenPoints}</b>点${rival.bonus.length ? `<span class="bonus-count">＋${tokenHtml('bonus', null, 'small')}×${rival.bonus.length}</span>` : ''}</span>`;
    }

    renderStacks() {
        const view = this.view;
        const goods = GOODS.map(g => {
            const tokens = view.goodsTokens[g];
            return `<div class="stack" data-stack="${g}" title="${NAMES[g]}">
                ${tokens.length ? tokenHtml(g, tokens[0]) : `<span class="token empty">×</span>`}<span class="stack-left">${tokens.length}</span></div>`;
        }).join('');
        const bonus = [3, 4, 5].map(size => `<div class="stack" data-stack="b${size}" title="${size}枚売りのボーナス">
            ${tokenHtml(`bonus b${size}`, `×${size}`, view.bonusCounts[size] ? '' : 'used')}<span class="stack-left">${view.bonusCounts[size]}</span></div>`).join('');
        $('#stacks').innerHTML = `<div class="stack-row">${goods}</div>
            <div class="stack-row second">${bonus}<div class="stack camel-token" title="ラクダの多い人に${CAMEL_BONUS}点">${tokenHtml('camel', CAMEL_BONUS)}</div>
            <div id="deck" class="deck" title="山札">${cardBackHtml('mini')}<b>${view.deckCount}</b></div></div>`;
    }

    renderMarket() {
        const view = this.view;
        const sel = this.sel;
        const mine = this.myTurn();
        $('#market').innerHTML = view.market.map((card, i) => {
            if (card === null) return '<div class="slot-empty"></div>';
            const picked = card === CAMEL ? sel.camels : sel.market.includes(i);
            return cardHtml(card, { cls: `${picked ? 'picked' : ''} ${mine ? 'tappable' : ''}`, attrs: `data-market="${i}" ${mine ? 'role="button"' : ''}` });
        }).join('');
    }

    renderMe() {
        const view = this.view;
        const me = this.me();
        const active = view.current === me.id && view.phase === 'play';
        const give = this.sel.giveCamels;
        const canGive = this.myTurn() && this.sel.market.length > 0 && me.herd > 0;
        $('#me').className = `me ${active ? 'active' : ''}`;
        $('#herd').className = `herd ${canGive ? 'tappable' : ''} ${give ? 'picked' : ''}`;
        $('#herd').innerHTML = `${icon('camel')}<b>${me.herd}</b>${give ? `<span class="give-badge">返す${give}</span>` : ''}`;
        const bonus = me.bonus.length ? `<span class="bonus-list">${me.bonus.map(b => tokenHtml(`bonus b${b.size}`, b.value, 'small')).join('')}</span>` : '';
        $('#my-score').innerHTML = `<b>${me.tokenPoints + (me.bonusPoints ?? 0)}</b>点${bonus}`;
        $('#hand-count').textContent = `${me.hand.length}/${HAND_LIMIT}`;
    }

    renderHand() {
        const me = this.me();
        const mine = this.myTurn();
        $('#hand').innerHTML = me.hand.map((card, i) => cardHtml(card, {
            cls: `${this.sel.hand.includes(i) ? 'picked' : ''} ${mine ? 'tappable' : ''}`,
            attrs: `data-hand="${i}" ${mine ? 'role="button"' : ''}`
        })).join('');
    }

    renderActions() {
        const view = this.view;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        let html;
        if (!this.myTurn()) {
            html = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        } else {
            const action = this.analyze();
            if (!action) {
                const camels = view.market.filter(c => c === CAMEL).length;
                html = camels > 0
                    ? `<button class="btn small secondary" data-act="camels">${icon('camel', 'btn-icon')}ラクダを全部取る（${camels}）</button>`
                    : `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
            } else {
                const note = action.ok ? (action.note ? `<span class="act-note">${action.note}</span>` : '') : (action.reason ? `<span class="act-reason">${action.reason}</span>` : '');
                html = `${note}<button class="btn small primary" data-act="go" ${action.ok ? '' : 'disabled'}>${action.label}</button>${cancel}`;
            }
        }
        $('#actions').innerHTML = html;
    }

    // ---- ダイアログ ----

    showRoundResult(event, gameOver) {
        const view = this.view;
        const order = [view.you, 1 - view.you];
        const rows = order.map(seat => {
            const r = event.results.find(x => x.seat === seat);
            const p = view.players[seat];
            const goodsPoints = r.score - sum(r.bonusValues) - (r.camelToken ? CAMEL_BONUS : 0);
            return `<tr class="${event.winner === seat ? 'winner' : ''}">
                <th>${escapeHtml(p.name)}</th><td>${goodsPoints}</td>
                <td>${r.bonusValues.length ? r.bonusValues.join('+') : '−'}</td>
                <td>${r.camelToken ? CAMEL_BONUS : '−'}</td><td class="total">${r.score}</td></tr>`;
        }).join('');
        const title = event.winner === null ? `第${event.round}ラウンドは引き分け` : `第${event.round}ラウンドは${escapeHtml(view.players[event.winner].name)}の勝ち`;
        $('#round-title').innerHTML = title;
        $('#round-table').innerHTML = `<thead><tr><th></th><th>商品</th><th>ボーナス</th><th>${icon('camel', 'th-icon')}</th><th>合計</th></tr></thead><tbody>${rows}</tbody>`;
        $('#round-seals').innerHTML = order.map(seat => `<span class="seal-line">${escapeHtml(view.players[seat].name)} ${
            Array.from({ length: SEALS_TO_WIN }, (_, i) => sealHtml(i < event.seals[seat])).join('')}</span>`).join('');
        if (gameOver) {
            this.showResult(event);
            return;
        }
        if (!$('#round-result').open) $('#round-result').showModal();
        this.render();
    }

    showResult(event) {
        const view = this.view;
        const youWon = view.winner === view.you;
        $('#result-title').textContent = youWon ? 'あなたの勝ち' : `${view.players[view.winner].name}の勝ち`;
        $('#result-round').textContent = event.winner === null ? `第${event.round}ラウンドは引き分け` : `第${event.round}ラウンドは${view.players[event.winner].name}の勝ち`;
        $('#result-table').innerHTML = $('#round-table').innerHTML;
        $('#result-seals').innerHTML = $('#round-seals').innerHTML;
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
