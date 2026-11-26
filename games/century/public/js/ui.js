/**
 * 画面（タイトル・ゲーム・結果・記録・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 上から：ほかの人 → 得点カードの並び → 商人カードの並び → 自分の香辛料 → 自分の手札 → 操作
 * - カードを押して選ぶと、下の操作の欄に、そのカードでできることが出る
 *   香辛料・交換：「使う」（交換は −／＋ で回数を選ぶ）。格上げ：自分の香辛料を押して1段ずつ上げ、「決定」
 *   商人カードを取る：左のカードに置く香辛料は、安い色から自動で選ぶ。自分の香辛料を押すと、その色を置く
 *   得点カード：払えるなら「買う」、払えないなら足りない香辛料を出す
 * - 自分の香辛料の数は、選んでいる操作のあとの数（変わる色は光らせる）
 * - 10個を超えたときは、自分の香辛料を押して戻す数を選ぶ
 */

import { MERCHANTS, POINT_CARDS, CARAVAN_LIMIT, GOLD_POINTS, SILVER_POINTS, maxTrades, applyUpgrades, total } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { merchantHtml, pointHtml, coinHtml, cubeHtml, cubesHtml, countChipsHtml, spiceWords } from './art.js';
import { captureAnchors, playEvents } from './animator.js';
import { music } from './music.js';

const SETTINGS_KEY = 'century.settings';
const CPU_NAMES = ['ラシード', 'ミーナ', 'ハサン', 'ライラ'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const canPay = (have, cost) => cost.every((n, i) => have[i] >= n);
const shortage = (have, cost) => cost.map((n, i) => Math.max(0, n - have[i]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [2, 3, 4, 5].includes(saved.count) ? saved.count : 3 };
    } catch {
        return { count: 3 };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 置く香辛料：自分で選んだ色を左から使い、残りは安い色から埋める。足りなければ null
export function payFor(caravan, count, chosen = []) {
    const have = [...caravan];
    const pay = [];
    for (const c of chosen.slice(0, count)) {
        if (have[c] === 0) return null;
        have[c]--;
        pay.push(c);
    }
    while (pay.length < count) {
        const c = have.findIndex(n => n > 0);
        if (c < 0) return null;
        have[c]--;
        pay.push(c);
    }
    return pay;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.clearSelection();
        this.bindStatic();
        $('#title-art').innerHTML = [8, 22, 1, 36].map((card, i) => merchantHtml(card, { cls: `fan fan-${i}` })).join('');
        $('#help-cubes').innerHTML = [0, 1, 2, 3].map(c => cubeHtml(c)).join('<span class="lt">＜</span>');
        $('#help-cards').innerHTML = [0, 20, 1].map(card => merchantHtml(card)).join('');
    }

    // ヒント：CPU（ふつう）が選ぶ操作を、選んだ状態にして、押すボタンに印を付ける
    showHint() {
        const c = this.controller?.hint();
        if (!c) return this.toast('自分の番になったら、おすすめを出せます');
        this.clearSelection();
        const text = { play: '選んだカードを使う', acquire: '選んだカードを取る', claim: '選んだ得点カードを買う', rest: '休んでカードを戻す', discard: '選んだ香辛料を戻す' }[c.type];
        if (c.type === 'play') {
            this.sel = { kind: 'hand', card: c.card };
            this.times = c.times ?? 1;
            this.steps = [...(c.steps ?? [])];
        } else if (c.type === 'acquire') {
            this.sel = { kind: 'market', index: c.index };
            this.chosenPay = [...c.pay];
        } else if (c.type === 'claim') {
            this.sel = { kind: 'point', index: c.index };
        } else if (c.type === 'discard') {
            this.discard = [...c.spices];
        }
        this.hint = { key: this.lastSeq, act: c.type };
        this.render();
        this.toast(`おすすめ：${text ?? '光るボタンを押す'}`);
    }

    clearSelection() {
        this.sel = null;       // { kind: 'hand', card } / { kind: 'market', index } / { kind: 'point', index }
        this.times = 1;        // 交換の回数
        this.steps = [];       // 格上げの手順（上げる色を順に）
        this.chosenPay = [];   // 取るときに自分で選んだ、置く香辛料
        this.discard = [0, 0, 0, 0];
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        this.renderSettings();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
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
        this.clearSelection();
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.lastCaravans = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, this.settings.count - 1).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        if ($('#result').open) $('#result').close();
    }

    send(command) {
        this.clearSelection();
        if (!this.controller?.send(command)) this.render();
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSettings();
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
        // 遊び方・記録を開いている間は、CPU を止める
        $('#open-help-game').addEventListener('click', () => {
            this.controller?.pause();
            $('#help').showModal();
        });
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => {
            this.controller?.pause();
            this.renderLog();
            $('#log').showModal();
            const list = $('#log-list');
            list.scrollTop = list.scrollHeight;
        });
        $('#help').addEventListener('close', () => this.controller?.resume());
        $('#log').addEventListener('close', () => this.controller?.resume());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hand').addEventListener('click', (event) => {
            const el = event.target.closest('[data-card]');
            if (!el || !this.myTurn('play')) return;
            if (el.dataset.used) {
                this.toast('使用済みのカードです。休むと手札に戻ります');
                return;
            }
            this.select({ kind: 'hand', card: Number(el.dataset.card) });
        });
        $('#market').addEventListener('click', (event) => {
            const el = event.target.closest('[data-market]');
            if (el && this.myTurn('play')) this.select({ kind: 'market', index: Number(el.dataset.market) });
        });
        $('#point-row').addEventListener('click', (event) => {
            const el = event.target.closest('[data-point]');
            if (el && this.myTurn('play')) this.select({ kind: 'point', index: Number(el.dataset.point) });
        });
        $('#mine').addEventListener('click', (event) => {
            const chip = event.target.closest('.chip[data-color]');
            if (chip) this.tapSpice(Number(chip.dataset.color));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act);
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    renderSettings() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
    }

    // ---- 選ぶ・操作する ----

    select(sel) {
        const same = this.sel && this.sel.kind === sel.kind && this.sel.card === sel.card && this.sel.index === sel.index;
        music.play(same ? 'cancel' : 'select');
        this.clearSelection();
        if (!same) this.sel = sel;
        this.render();
    }

    selectedMerchant() {
        return this.sel?.kind === 'hand' ? MERCHANTS[this.sel.card] : null;
    }

    // 自分の香辛料を押したとき：格上げ・置く香辛料・戻す香辛料を選ぶ
    tapSpice(color) {
        if (!this.view) return;
        const me = this.me();
        if (this.myTurn('discard')) {
            const need = total(me.caravan) - CARAVAN_LIMIT;
            if (this.discard[color] < me.caravan[color] && total(this.discard) < need) this.discard[color]++;
            else if (this.discard[color] > 0) this.discard[color] = 0; // 押し直すと、その色を戻さない形に
            this.render();
            return;
        }
        if (!this.myTurn('play')) return;
        const merchant = this.selectedMerchant();
        if (merchant?.kind === 'upgrade') {
            if (this.steps.length >= merchant.upgrades) return this.toast(`格上げは${merchant.upgrades}回までです`);
            if (color === 3) return this.toast('茶はいちばん上なので、上げられません');
            const next = applyUpgrades(me.caravan, [...this.steps, color], merchant.upgrades);
            if (!next) return this.toast('その香辛料はありません');
            this.steps.push(color);
            this.render();
        } else if (this.sel?.kind === 'market' && this.sel.index > 0) {
            const chosen = this.chosenPay.length >= this.sel.index ? [color] : [...this.chosenPay, color];
            if (!payFor(me.caravan, this.sel.index, chosen)) return this.toast('その香辛料はもうありません');
            this.chosenPay = chosen;
            this.render();
        }
    }

    act(act) {
        const me = this.me();
        if (act === 'cancel') {
            this.clearSelection();
            this.render();
        } else if (act === 'rest') {
            this.send({ type: 'rest' });
        } else if (act === 'minus' || act === 'plus') {
            const max = maxTrades(me.caravan, this.selectedMerchant());
            this.times = Math.max(1, Math.min(max, this.times + (act === 'plus' ? 1 : -1)));
            this.render();
        } else if (act === 'max') {
            this.times = Math.max(1, maxTrades(me.caravan, this.selectedMerchant()));
            this.render();
        } else if (act === 'reset') {
            this.steps = [];
            this.chosenPay = [];
            this.discard = [0, 0, 0, 0];
            this.render();
        } else if (act === 'play') {
            const m = this.selectedMerchant();
            if (m.kind === 'produce') this.send({ type: 'play', card: m.id });
            else if (m.kind === 'trade') this.send({ type: 'play', card: m.id, times: this.times });
            else this.send({ type: 'play', card: m.id, steps: [...this.steps] });
        } else if (act === 'acquire') {
            const pay = payFor(me.caravan, this.sel.index, this.chosenPay);
            if (pay) this.send({ type: 'acquire', index: this.sel.index, pay });
        } else if (act === 'claim') {
            this.send({ type: 'claim', index: this.sel.index });
        } else if (act === 'discard') {
            this.send({ type: 'discard', spices: [...this.discard] });
        }
    }

    // 選んでいる操作のあとの、自分の香辛料
    previewCaravan() {
        const me = this.me();
        const caravan = [...me.caravan];
        if (this.myTurn('discard')) return caravan.map((n, i) => n - this.discard[i]);
        if (!this.sel || !this.myTurn('play')) return caravan;
        const m = this.selectedMerchant();
        if (m?.kind === 'produce') return caravan.map((n, i) => n + m.out[i]);
        if (m?.kind === 'trade') {
            const times = Math.min(this.times, maxTrades(caravan, m));
            return caravan.map((n, i) => n + (m.out[i] - m.in[i]) * times);
        }
        if (m?.kind === 'upgrade') return applyUpgrades(caravan, this.steps, m.upgrades) ?? caravan;
        if (this.sel.kind === 'market') {
            const pay = payFor(caravan, this.sel.index, this.chosenPay);
            if (!pay) return caravan;
            pay.forEach(c => { caravan[c]--; });
            this.view.market[this.sel.index].spices.forEach((n, i) => { caravan[i] += n; });
            return caravan;
        }
        if (this.sel.kind === 'point') {
            const cost = POINT_CARDS[this.view.pointRow[this.sel.index]].cost;
            return canPay(caravan, cost) ? caravan.map((n, i) => n - cost[i]) : caravan;
        }
        return caravan;
    }

    // ---- 状態 ----

    // 効果音：新しいできごとを見て、1回の更新に1つだけ鳴らす
    // 自分の手は得点カード（得る）・商人カードを使う（置く）・カードを取る／休む（引く）・捨てる（払う）、
    // ほかの人の手のあとは自分の番か知らせ、終局は勝ち・負け
    playSounds(view, fresh) {
        if (!fresh.length) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winner === view.seat ? 'win' : 'lose');
        const last = fresh.at(-1);
        if (last.seat === view.seat) {
            const sound = { claim: 'gain', play: 'place', acquire: 'draw', rest: 'draw', discard: 'pay' }[last.type];
            if (sound) music.play(sound);
            return;
        }
        music.play(view.current === view.seat && view.phase !== 'end' ? 'turn' : 'notify');
    }

    myTurn(phase) {
        const view = this.view;
        return !!view && view.current === view.seat && view.phase === phase;
    }

    me() {
        return this.view.players[this.view.seat];
    }

    // 選んでいるものが、今もあるか
    selectionValid() {
        const view = this.view;
        if (!this.sel || !this.myTurn('play')) return false;
        if (this.sel.kind === 'hand') return this.me().hand.includes(this.sel.card);
        if (this.sel.kind === 'market') return this.sel.index < view.market.length;
        return this.sel.index < view.pointRow.length;
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        if (this.sel && !this.selectionValid()) this.clearSelection();
        if (!this.myTurn('discard')) this.discard = [0, 0, 0, 0];

        this.renderTop();
        this.renderPlayers();
        this.renderPointRow();
        this.renderMarket();
        this.renderMine();
        this.renderHand();
        this.renderActions();
        this.lastCaravans = view.players.map(p => [...p.caravan]);

        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        playEvents(fresh, before, { you: view.seat });
        this.playSounds(view, fresh);
        if (fresh.some(e => e.type === 'claim') && view.lastRound && !this.lastRoundShown && view.phase !== 'end') {
            this.lastRoundShown = true;
            this.toast(`得点カードが${view.endCount}枚に届きました。この巡で終わりです`);
        }
        if (!view.lastRound) this.lastRoundShown = false;
        if (view.phase === 'end' && !$('#result').open) setTimeout(() => this.showResult(), 900);
    }

    renderTop() {
        const view = this.view;
        let text;
        if (view.phase === 'end') text = '終わり';
        else if (view.current === view.seat) text = view.phase === 'discard' ? '香辛料を戻す' : 'あなたの番';
        else text = `${escapeHtml(view.players[view.current].name)}の番`;
        $('#turn-info').innerHTML = `${text}${view.lastRound && view.phase !== 'end' ? '<span class="last-badge">最後の巡</span>' : ''}`;
        $('#point-deck').textContent = `残り${view.pointDeckCount}枚`;
        $('#merchant-deck').textContent = `残り${view.deckCount}枚`;
    }

    // 香辛料の数が前に描いたときから変わった色
    changedColors(seat, caravan) {
        const last = this.lastCaravans?.[seat];
        return last ? caravan.map((n, i) => n !== last[i]) : [false, false, false, false];
    }

    coinsHtml(p) {
        return `${p.gold ? `<span class="coins">${coinHtml('gold')}${p.gold > 1 ? `<b>${p.gold}</b>` : ''}</span>` : ''}${p.silver ? `<span class="coins">${coinHtml('silver')}${p.silver > 1 ? `<b>${p.silver}</b>` : ''}</span>` : ''}`;
    }

    renderPlayers() {
        const view = this.view;
        const n = view.players.length;
        const order = view.players.map((_, i) => (view.seat + 1 + i) % n).filter(i => i !== view.seat);
        $('#players').innerHTML = order.map(seat => {
            const p = view.players[seat];
            const active = view.current === seat && view.phase !== 'end';
            const changed = this.changedColors(seat, p.caravan);
            const chips = p.caravan.map((count, c) => `<span class="chip s${c} ${count === 0 ? 'zero' : ''} ${changed[c] ? 'bump' : ''}">${count}</span>`).join('');
            return `<div class="player ${active ? 'active' : ''}" data-player="${seat}">
                <span class="p-name">${escapeHtml(p.name)}${seat === view.first ? '<i class="first" title="最初の手番">1</i>' : ''}</span>
                <span class="chips">${chips}</span>
                <span class="p-cards" title="手札と使用済み">手${p.handCount}<small>/済${p.played.length}</small></span>
                <span class="p-points" title="得点カード">${p.points.length}<small>枚</small></span>${this.coinsHtml(p)}
                <span class="p-score">${p.score}</span></div>`;
        }).join('');
    }

    renderPointRow() {
        const view = this.view;
        const me = this.me();
        const playing = this.myTurn('play');
        $('#point-row').innerHTML = view.pointRow.map((id, i) => {
            const can = playing && canPay(me.caravan, POINT_CARDS[id].cost);
            const selected = this.sel?.kind === 'point' && this.sel.index === i;
            return `<div class="slot" data-point="${i}" ${playing ? 'role="button"' : ''}>${pointHtml(id, { coin: view.coinSlots[i], cls: `${can ? 'can' : ''} ${selected ? 'selected' : ''}` })}</div>`;
        }).join('');
    }

    renderMarket() {
        const view = this.view;
        const playing = this.myTurn('play');
        const preview = this.sel?.kind === 'market' ? payFor(this.me().caravan, this.sel.index, this.chosenPay) : null;
        $('#market').innerHTML = view.market.map((m, i) => {
            const selected = this.sel?.kind === 'market' && this.sel.index === i;
            // 取るときに置く香辛料の見込みを、左のカードの上に薄く出す
            const placing = preview && i < this.sel.index ? cubeHtml(preview[i], 'ghost') : '';
            // 4個を超えたら、粒を並べる代わりに色ごとの数で見せる（1行に収める）
            const spices = total(m.spices) + (placing ? 1 : 0) > 4 ? countChipsHtml(m.spices, { cls: 'mini', zero: false }) : cubesHtml(m.spices);
            return `<div class="slot" data-market="${i}" ${playing ? 'role="button"' : ''}>
                <span class="m-cost">${i === 0 ? '無料' : `${i}個`}</span>
                ${merchantHtml(m.card, { cls: selected ? 'selected' : '' })}
                <span class="m-spices">${spices}${placing}</span></div>`;
        }).join('');
    }

    renderMine() {
        const view = this.view;
        const me = this.me();
        const active = view.current === me.id && view.phase !== 'end';
        const preview = this.previewCaravan();
        const changedNow = this.changedColors(me.id, me.caravan);
        const tappable = this.myTurn('discard')
            || (this.selectedMerchant()?.kind === 'upgrade')
            || (this.sel?.kind === 'market' && this.sel.index > 0);
        const chips = preview.map((n, c) => {
            const diff = n - me.caravan[c];
            const mark = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
            const out = this.myTurn('discard') && this.discard[c] > 0 ? `<i class="minus">−${this.discard[c]}</i>` : '';
            return `<button type="button" class="chip big s${c} ${n === 0 ? 'zero' : ''} ${mark} ${changedNow[c] ? 'bump' : ''}" data-color="${c}" ${tappable ? '' : 'tabindex="-1"'}>${n}${out}</button>`;
        }).join('');
        const count = total(preview);
        $('#mine').className = `mine ${active ? 'active' : ''} ${tappable ? 'tappable' : ''}`;
        $('#mine').innerHTML = `<span class="chips">${chips}</span>
            <span class="load ${count > CARAVAN_LIMIT ? 'over' : ''}">${count}<small>/${CARAVAN_LIMIT}</small></span>
            <span class="p-points" title="得点カード">${me.points.length}<small>枚</small></span>${this.coinsHtml(me)}
            <span class="p-score big">${me.score}<small>点</small></span>`;
    }

    renderHand() {
        const me = this.me();
        const playing = this.myTurn('play');
        const cards = [
            ...me.hand.map(card => {
                const selected = this.sel?.kind === 'hand' && this.sel.card === card;
                return `<div class="slot" data-card="${card}" ${playing ? 'role="button"' : ''}>${merchantHtml(card, { cls: selected ? 'selected' : '' })}</div>`;
            }),
            ...me.played.map(card => `<div class="slot used" data-card="${card}" data-used="1">${merchantHtml(card)}<span class="used-mark">済</span></div>`)
        ];
        const hand = $('#hand');
        hand.innerHTML = cards.join('');
        this.fitHand(cards.length);
    }

    // 手札がすべて入る、いちばん大きいカードの大きさ（何段かに折り返す）
    fitHand(count) {
        const hand = $('#hand');
        const width = hand.clientWidth;
        const height = hand.clientHeight;
        if (!width || !height || count === 0) return;
        const gap = 4;
        const ratio = 1.28; // 高さ÷幅
        let best = 0;
        for (let rows = 1; rows <= 4; rows++) {
            const perRow = Math.ceil(count / rows);
            const w = Math.min((width - gap * (perRow - 1)) / perRow, ((height - gap * (rows - 1)) / rows) / ratio, 80);
            best = Math.max(best, w);
        }
        hand.style.setProperty('--hw', `${Math.floor(best)}px`);
    }

    renderActions() {
        const view = this.view;
        const me = this.me();
        let html;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        if (this.myTurn('discard')) {
            const need = total(me.caravan) - CARAVAN_LIMIT;
            const left = need - total(this.discard);
            html = `<span class="act-label stack">${left > 0 ? `戻す色を押す<small>あと${left}個</small>` : `<span>${cubesHtml(this.discard)}</span><small>を戻す</small>`}</span>
                <button class="btn small ghost" data-act="reset">やり直す</button>
                <button class="btn small primary" data-act="discard" ${left === 0 ? '' : 'disabled'}>戻す</button>`;
        } else if (this.myTurn('play') && this.sel) {
            html = this.selectionActions(me) + cancel;
        } else if (this.myTurn('play')) {
            html = `<span class="act-label muted">カードを選ぶ</span>
                <button class="btn small secondary" data-act="rest" ${me.played.length ? '' : 'disabled'}>休む${me.played.length ? `（${me.played.length}枚戻す）` : ''}</button>`;
        } else {
            html = `<span class="act-log">${escapeHtml(view.logs.at(-1) ?? '')}</span>`;
        }
        $('#actions').innerHTML = html;
        if (this.hint && this.hint.key === this.lastSeq) $(`#actions [data-act="${this.hint.act}"]`)?.classList.add('recommended');
    }

    selectionActions(me) {
        const view = this.view;
        const m = this.selectedMerchant();
        if (m?.kind === 'produce') {
            return `<span class="act-label">${cubesHtml(m.out)}をもらう</span><button class="btn small primary" data-act="play">使う</button>`;
        }
        if (m?.kind === 'trade') {
            const max = maxTrades(me.caravan, m);
            if (max === 0) return `<span class="act-reason">${spiceWords(shortage(me.caravan, m.in))}が足りません</span>`;
            return `<span class="stepper">
                    <button class="step" data-act="minus" ${this.times <= 1 ? 'disabled' : ''} aria-label="1回減らす">−</button>
                    <button class="step times" data-act="max" title="できるだけ">×${this.times}<small>/${max}</small></button>
                    <button class="step" data-act="plus" ${this.times >= max ? 'disabled' : ''} aria-label="1回増やす">＋</button>
                </span><button class="btn small primary" data-act="play">交換する</button>`;
        }
        if (m?.kind === 'upgrade') {
            const left = m.upgrades - this.steps.length;
            return `<span class="act-label stack">${left > 0 ? `上げる色を押す<small>あと${left}回</small>` : '回数を使い切りました'}</span>
                <button class="btn small ghost" data-act="reset" ${this.steps.length ? '' : 'disabled'}>やり直す</button>
                <button class="btn small primary" data-act="play" ${this.steps.length ? '' : 'disabled'}>決定</button>`;
        }
        if (this.sel.kind === 'market') {
            const index = this.sel.index;
            const pay = payFor(me.caravan, index, this.chosenPay);
            if (!pay) return `<span class="act-reason">左の${index}枚に置く香辛料が足りません</span>`;
            const gained = view.market[index].spices;
            const label = index === 0 ? '無料' : `${cubesHtml([0, 1, 2, 3].map(c => pay.filter(x => x === c).length))}を置く`;
            return `<span class="act-label">${label}${total(gained) ? `<small>（${cubesHtml(gained)}も）</small>` : ''}</span>
                <button class="btn small primary" data-act="acquire">取る</button>`;
        }
        const id = view.pointRow[this.sel.index];
        const card = POINT_CARDS[id];
        const coin = view.coinSlots[this.sel.index];
        if (!canPay(me.caravan, card.cost)) {
            return `<span class="act-reason">あと ${cubesHtml(shortage(me.caravan, card.cost))} が足りません</span>`;
        }
        const bonus = coin ? `＋${coin === 'gold' ? `金貨${GOLD_POINTS}` : `銀貨${SILVER_POINTS}`}` : '';
        return `<span class="act-label">${card.points}点${bonus}</span><button class="btn small primary" data-act="claim">買う</button>`;
    }

    renderLog() {
        $('#log-list').innerHTML = (this.view?.logs ?? []).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    // ---- 結果 ----

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open || !view.results) return;
        // 同点なら手番の順が後の人が上（勝ち）
        const ranked = [...view.results].sort((a, b) => b.score - a.score || b.order - a.order);
        $('#result-title').textContent = view.winner === view.seat ? 'あなたの勝ち' : `${view.players[view.winner].name}の勝ち`;
        $('#result-list').innerHTML = ranked.map(r => {
            const p = view.players[r.seat];
            const cards = p.points.reduce((s, id) => s + POINT_CARDS[id].points, 0);
            const coins = p.gold * GOLD_POINTS + p.silver * SILVER_POINTS;
            const cubes = p.caravan[1] + p.caravan[2] + p.caravan[3];
            return `<li class="${r.seat === view.winner ? 'winner' : ''} ${r.seat === view.seat ? 'mine' : ''}">
                <span class="r-name">${escapeHtml(p.name)}</span>
                <span class="r-detail">カード${p.points.length}枚 ${cards}・硬貨 ${coins}・香辛料 ${cubes}</span>
                <span class="r-score">${r.score}</span></li>`;
        }).join('');
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
