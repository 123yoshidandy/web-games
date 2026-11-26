/**
 * 画面（タイトル・ゲーム・カードの詳細・効果で選ぶもの・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * タップで操作し、長押しでカードの詳細を出す
 */

import { CARDS, FACTIONS, TRADE_CARDS, EXPLORER, SCOUT, VIPER } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, icon, emblem } from './art.js';
import { cardLines, effectsText, typeName } from './card-text.js';
import { music } from './music.js';

const SETTINGS_KEY = 'star-realms.settings';
const CPU_NAMES = { easy: 'アルタイル', normal: 'ベガ' };
const RESULT_DELAY_MS = 800;
const LONG_PRESS_MS = 450;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy' };
    } catch {
        return { level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 効果で選ぶもの：題・説明・候補・選ぶ数
const PROMPTS = {
    discard: { title: '手札を捨てる', text: (pr) => `相手の効果で、手札を${pr.count}枚捨てます`, from: ['hand'], min: (pr) => pr.count, max: (pr) => pr.count },
    scrapCards: { title: '廃棄', text: () => '手札か捨て札の1枚を廃棄できます', from: ['hand', 'discard'], min: () => 0, max: (pr) => pr.max },
    brainWorld: { title: '廃棄して引く', text: () => '手札か捨て札の2枚まで廃棄し、その数だけ引きます', from: ['hand', 'discard'], min: () => 0, max: (pr) => pr.max },
    scrapHand: { title: '手札を廃棄', text: () => '手札1枚を廃棄します', from: ['hand'], min: () => 1, max: () => 1 },
    recycle: { title: '捨てて引く', text: (pr) => `手札を${pr.max}枚まで捨て、その数だけ引きます`, from: ['hand'], min: () => 0, max: (pr) => pr.max },
    scrapRow: { title: '交易の列を廃棄', text: () => '交易の列の1枚を廃棄できます', from: ['row'], min: () => 0, max: (pr) => pr.max },
    destroyBase: { title: '基地を破壊', text: () => '相手の基地1つを破壊できます（前哨でなくても選べます）', from: ['oppBases'], min: () => 0, max: () => 1 },
    copyShip: { title: '艦を写す', text: () => 'この手番に出したほかの艦1枚の効果を写します', from: ['ships'], min: () => 1, max: () => 1 },
    freeShip: { title: '艦を獲得', text: () => '交易の列の艦1枚をただで獲得し、山札の上に置きます', from: ['rowShips'], min: () => 0, max: () => 1 }
};
const FROM_LABEL = { hand: '手札', discard: '捨て札', row: '交易の列', oppBases: '相手の基地', ships: 'この手番に出した艦', rowShips: '交易の列の艦' };

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selected = [];        // 効果で選んでいるカード
        this.promptKey = null;     // 開いた選択（同じ選択を出し直さない）
        this.promptHidden = false; // 選択を閉じて盤面を見ている
        this.resultTimer = null;
        this.pressTimer = null;
        this.swallowClick = false;
        this.lastAuthority = null;
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
        this.view = null;
        this.lastSeq = null;
        this.selected = [];
        this.promptKey = null;
        this.promptHidden = false;
        this.lastAuthority = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, { name: CPU_NAMES[level], isCPU: true, cpuLevel: level }];
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
        $('#hint').addEventListener('click', () => this.showHint());
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
        // 選択を閉じたら、盤面を見る（選択は消さない。「選ぶ」で開き直す）
        $('#prompt').addEventListener('close', () => {
            // 答えて閉じたあとに次の選択を開いていれば、何もしない（close は後から届く）
            if (this.controller && this.myPrompt() && !$('#prompt').open) {
                this.promptHidden = true;
                this.renderActions(this.view);
            }
        });

        const game = $('#screen-game');
        // 長押しで詳細。指を離した直後の click は捨てる
        game.addEventListener('pointerdown', (event) => {
            const card = event.target.closest('.card[data-zone]');
            if (!card) return;
            clearTimeout(this.pressTimer);
            const start = { x: event.clientX, y: event.clientY };
            this.pressStart = start;
            this.pressTimer = setTimeout(() => {
                this.pressTimer = null;
                this.swallowClick = true;
                this.showDetail(card.dataset.zone, card.dataset.id);
            }, LONG_PRESS_MS);
        });
        const cancelPress = () => { clearTimeout(this.pressTimer); this.pressTimer = null; };
        game.addEventListener('pointerup', cancelPress);
        game.addEventListener('pointercancel', cancelPress);
        game.addEventListener('pointermove', (event) => {
            if (this.pressTimer && this.pressStart && Math.hypot(event.clientX - this.pressStart.x, event.clientY - this.pressStart.y) > 10) cancelPress();
        });
        document.addEventListener('click', (event) => {
            if (!this.swallowClick) return;
            this.swallowClick = false;
            event.stopPropagation();
            event.preventDefault();
        }, true);

        game.addEventListener('click', (event) => {
            const card = event.target.closest('.card[data-zone]');
            if (card) {
                this.tapCard(card.dataset.zone, card.dataset.id);
                return;
            }
            const pile = event.target.closest('[data-pile]');
            if (pile) this.showPile(Number(pile.dataset.pile));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'playAll') this.send({ type: 'playAll' });
            else if (act === 'attack') this.send({ type: 'attack', target: 'player' });
            else if (act === 'end') this.send({ type: 'end' });
            else if (act === 'prompt') this.openPrompt(true);
        });
        $('#detail-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button) return;
            $('#detail').close();
            if (button.dataset.act === 'close') return;
            const id = button.dataset.id === 'explorer' ? 'explorer' : Number(button.dataset.id);
            const command = { play: { type: 'play', card: id }, buy: { type: 'buy', card: id }, scrap: { type: 'scrap', card: id }, attack: { type: 'attack', target: id } }[button.dataset.act];
            this.send(command);
        });
        $('#prompt-body').addEventListener('click', (event) => {
            const option = event.target.closest('button[data-option]');
            if (option) {
                this.answer({ type: 'choose', option: Number(option.dataset.option) });
                return;
            }
            const card = event.target.closest('.card[data-pick]');
            if (!card) return;
            const id = Number(card.dataset.pick);
            const max = this.promptSpec().max(this.view.prompt);
            if (this.selected.includes(id)) this.selected = this.selected.filter(x => x !== id);
            else if (max === 1) this.selected = [id];
            else if (this.selected.length < max) this.selected.push(id);
            music.play(this.selected.includes(id) ? 'select' : 'cancel');
            this.renderPrompt();
        });
        $('#prompt-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act="choose"]');
            if (!button || button.disabled) return;
            this.answer({ type: 'choose', cards: [...this.selected] });
        });
    }

    send(command) {
        if (!this.controller) return false;
        this.hintCommand = null;
        return this.controller.send(command);
    }

    answer(command) {
        this.selected = [];
        $('#prompt').close();
        this.promptHidden = false;
        this.send(command);
    }

    // ---- 状態 ----

    myTurn() {
        const v = this.view;
        return !!v && v.phase !== 'end' && v.current === v.you && v.answering.includes(v.you);
    }

    myPrompt() {
        const v = this.view;
        return !!v && !!v.prompt && v.prompt.seat === v.you && v.answering.includes(v.you);
    }

    canAct() {
        return this.myTurn() && !this.view.prompt;
    }

    findCard(zone, id) {
        const v = this.view;
        const me = v.players[v.you];
        const opp = v.players[1 - v.you];
        if (id === 'explorer') return { id: 'explorer', key: 'explorer' };
        const n = Number(id);
        const lists = { hand: me.hand ?? [], row: v.tradeRow, mine: [...me.bases, ...me.inPlay], oppBase: opp.bases, oppShip: opp.inPlay, myDiscard: me.discard, oppDiscard: opp.discard };
        return (lists[zone] ?? []).find(c => c.id === n) ?? null;
    }

    // 写した艦なら、その種類で効果を見る
    effectiveKey(card) {
        return this.view.turn.used[card.id]?.as ?? card.key;
    }

    canBuy(card) {
        const v = this.view;
        if (!this.canAct()) return false;
        if (card.id === 'explorer') return v.explorers > 0 && v.turn.trade >= EXPLORER.cost;
        return v.turn.trade >= CARDS[card.key].cost;
    }

    canScrap(card) {
        const me = this.view.players[this.view.you];
        return this.canAct() && [...me.inPlay, ...me.bases].some(c => c.id === card.id) && CARDS[this.effectiveKey(card)].scrap.length > 0;
    }

    hasOutpost(p) {
        return p.bases.some(b => CARDS[b.key].type === 'outpost');
    }

    canAttackBase(card) {
        const v = this.view;
        const opp = v.players[1 - v.you];
        if (!this.canAct() || v.turn.combat <= 0) return false;
        const c = CARDS[card.key];
        if (c.type !== 'outpost' && this.hasOutpost(opp)) return false;
        return v.turn.combat >= c.defense;
    }

    canAttackPlayer() {
        const v = this.view;
        return this.canAct() && v.turn.combat > 0 && !this.hasOutpost(v.players[1 - v.you]);
    }

    tapCard(zone, rawId) {
        if (!this.view) return;
        const card = this.findCard(zone, rawId);
        if (!card) return;
        if (zone === 'hand' && this.canAct()) this.send({ type: 'play', card: card.id });
        else if (zone === 'row' && this.canBuy(card)) this.send({ type: 'buy', card: card.id });
        else if (zone === 'oppBase' && this.canAttackBase(card)) this.send({ type: 'attack', target: card.id });
        else this.showDetail(zone, rawId);
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        const cards = ['tradeEscort', 'battleBlob', 'explorer', 'missileMech', 'dreadnaught'];
        $('#title-art').innerHTML = cards.map((key, i) => `<div class="fan" style="--i:${i - 2}">${cardHtml(key)}</div>`).join('');
    }

    renderHelp() {
        const groups = ['federation', 'blob', 'machine', 'empire'].map(f => ({
            title: `${emblem(f)}${FACTIONS[f].name}`,
            cards: TRADE_CARDS.filter(c => c.faction === f)
        }));
        groups.push({ title: `${emblem('none')}はじめのデッキとエクスプローラー`, cards: [SCOUT, VIPER, EXPLORER] });
        $('#help-cards').innerHTML = groups.map(g => `<h4>${g.title}</h4><ul>${g.cards.map(c => `
            <li>${cardHtml(c.key, { cls: 'small' })}<div><strong>${c.name}</strong><span class="meta">${typeName(c.key)}${c.type === 'ship' ? '' : `・耐久${c.defense}`}・費用${c.cost}・${c.count}枚</span>
            ${cardLines(c.key).map(l => `<span class="line">${l.label ? `<em>${l.label}</em>` : ''}${l.text}</span>`).join('')}</div></li>`).join('')}</ul>`).join('');
    }

    // ---- ゲーム画面 ----

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、相手の攻撃は notify、自分の番になったら turn、終わりは勝ち負け
    playSound(view, fresh) {
        if (fresh.length === 0) return;
        const end = fresh.find(e => e.type === 'gameEnd');
        if (end) return music.play(end.winner === view.you ? 'win' : 'lose');
        const turn = fresh.findLast(e => e.type === 'turn');
        if (turn?.seat === view.you) return music.play('turn');
        const mine = fresh.filter(e => e.seat === view.you).map(e => e.type);
        if (mine.includes('attack')) return music.play('capture');
        if (mine.includes('buy')) return music.play('gain');
        if (mine.includes('shuffle')) return music.play('shuffle');
        if (mine.includes('play')) return music.play('place');
        if (mine.includes('scrap') || mine.includes('scrapCards') || mine.includes('discard')) return music.play('pay');
        if (fresh.some(e => e.type === 'attack' && e.seat !== view.you)) music.play('notify');
    }

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        // 始めた時点までの出来事は鳴らさない
        const lastSeq = this.lastSeq;
        this.lastSeq = view.events.at(-1)?.seq ?? 0;
        if (lastSeq !== null) this.playSound(view, view.events.filter(e => e.seq > lastSeq));
        this.renderStats(view);
        this.renderZones(view);
        this.renderRow(view);
        this.renderHand(view);
        const last = view.logs.at(-1) ?? '';
        $('#ticker').textContent = last;
        this.syncPrompt(view);
        this.renderActions(view);
        if (!this.canAct()) this.hintCommand = null;
        this.markHint();
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    statsHtml(p, view, mine) {
        const current = view.current === p.id && view.phase !== 'end';
        const hit = this.lastAuthority && this.lastAuthority[p.id] > p.authority ? 'hit' : '';
        const turn = current ? `<span class="pool"><b class="fx-t">${view.turn.trade}</b><b class="fx-c">${view.turn.combat}</b></span>` : '';
        return `<span class="who ${current ? 'current' : ''}">${escapeHtml(p.name)}</span>
            <span class="authority ${hit}" title="権威">${Math.max(0, p.authority)}</span>
            <span class="piles">${mine ? '' : `<span class="pile" title="手札">${icon('hand')}${p.handCount}</span>`}<span class="pile" title="山札">${icon('deck')}${p.deckCount}</span><button class="pile" data-pile="${p.id}" title="捨て札">${icon('discard')}${p.discard.length}</button></span>
            ${turn}`;
    }

    renderStats(view) {
        const me = view.players[view.you];
        const opp = view.players[1 - view.you];
        $('#opp-stats').innerHTML = this.statsHtml(opp, view, false);
        $('#my-stats').innerHTML = this.statsHtml(me, view, true);
        $('#opp-stats').classList.toggle('current', view.current === opp.id && view.phase !== 'end');
        $('#my-stats').classList.toggle('current', view.current === me.id && view.phase !== 'end');
        this.lastAuthority = view.players.map(p => p.authority);
    }

    zoneCards(list, zone, view, extra = () => '') {
        return list.map(c => cardHtml(c.key, { cls: extra(c), attrs: `data-zone="${zone}" data-id="${c.id}"` })).join('');
    }

    renderZones(view) {
        const me = view.players[view.you];
        const opp = view.players[1 - view.you];
        $('#opp-zone').innerHTML = this.zoneCards(opp.bases, 'oppBase', view, c => (this.canAttackBase(c) ? 'can' : ''))
            + this.zoneCards(opp.inPlay, 'oppShip', view);
        const mark = (c) => {
            let cls = this.canScrap(c) ? 'scrappable' : '';
            if (view.turn.used[c.id]?.as) cls += ' copied';
            return cls;
        };
        $('#my-zone').innerHTML = this.zoneCards(me.bases, 'mine', view, mark) + this.zoneCards(me.inPlay, 'mine', view, mark);
        $('#opp-zone').classList.toggle('empty', !opp.bases.length && !opp.inPlay.length);
        $('#my-zone').classList.toggle('empty', !me.bases.length && !me.inPlay.length);
    }

    renderRow(view) {
        const row = view.tradeRow.map(c => cardHtml(c.key, { cls: this.canBuy(c) ? 'can' : '', attrs: `data-zone="row" data-id="${c.id}"` })).join('');
        const explorer = { id: 'explorer', key: 'explorer' };
        const ex = view.explorers > 0
            ? cardHtml('explorer', { cls: `${this.canBuy(explorer) ? 'can' : ''} stack`, attrs: `data-zone="row" data-id="explorer" data-count="${view.explorers}"` })
            : '<div class="card empty-slot"></div>';
        $('#trade-row').innerHTML = row + ex;
    }

    renderHand(view) {
        const hand = view.players[view.you].hand ?? [];
        const can = this.canAct();
        $('#hand').style.setProperty('--n', String(Math.max(5, hand.length)));
        $('#hand').innerHTML = hand.map(c => cardHtml(c.key, { cls: can ? 'can' : '', attrs: `data-zone="hand" data-id="${c.id}"` })).join('');
    }

    renderActions(view) {
        const el = $('#actions');
        if (view.phase === 'end' || !this.controller) {
            el.innerHTML = '';
            return;
        }
        if (this.myPrompt()) {
            el.innerHTML = this.promptHidden ? '<button class="btn primary" data-act="prompt">選ぶ</button>' : '';
            return;
        }
        if (!this.canAct()) {
            el.innerHTML = '';
            return;
        }
        const me = view.players[view.you];
        const buttons = [];
        if ((me.hand ?? []).length) buttons.push('<button class="btn secondary" data-act="playAll">全部出す</button>');
        if (this.canAttackPlayer()) buttons.push(`<button class="btn attack" data-act="attack">攻撃 ${view.turn.combat}</button>`);
        buttons.push(`<button class="btn ${buttons.length ? 'end' : 'primary'}" data-act="end">手番を終える</button>`);
        el.innerHTML = buttons.join('');
    }

    // ---- 効果で選ぶもの ----

    promptSpec() {
        return PROMPTS[this.view.prompt.kind];
    }

    syncPrompt(view) {
        if (!this.myPrompt()) {
            this.promptKey = null;
            this.promptHidden = false;
            if ($('#prompt').open) $('#prompt').close();
            return;
        }
        const key = `${view.logCount}:${view.events.at(-1)?.seq}:${JSON.stringify(view.prompt)}`;
        if (key === this.promptKey) {
            if ($('#prompt').open) this.renderPrompt();
            return;
        }
        this.promptKey = key;
        this.selected = [];
        this.promptHidden = false;
        this.openPrompt(false);
    }

    openPrompt(fromButton) {
        if (!this.myPrompt()) return;
        this.promptHidden = false;
        this.renderPrompt();
        if (!$('#prompt').open) {
            // 詳細などのほかのダイアログは閉じる
            ['#detail', '#pile', '#log'].forEach(s => { if ($(s).open) $(s).close(); });
            $('#prompt').showModal();
        }
        if (fromButton) this.renderActions(this.view);
    }

    promptCandidates() {
        const v = this.view;
        const pr = v.prompt;
        const me = v.players[v.you];
        const opp = v.players[1 - v.you];
        const lists = {
            hand: me.hand ?? [],
            discard: me.discard,
            row: v.tradeRow,
            oppBases: opp.bases,
            ships: me.inPlay.filter(c => c.id !== pr.source && CARDS[c.key].type === 'ship'),
            rowShips: v.tradeRow.filter(c => CARDS[c.key].type === 'ship')
        };
        return this.promptSpec().from.map(from => ({ from, cards: lists[from] }));
    }

    renderPrompt() {
        const v = this.view;
        const pr = v.prompt;
        const sourceKey = pr.source !== undefined ? this.findCardAnywhere(pr.source) : null;
        const source = sourceKey ? `${CARDS[sourceKey].name}：` : '';
        if (pr.kind === 'or') {
            $('#prompt-title').textContent = 'どちらかを選ぶ';
            $('#prompt-text').textContent = sourceKey ? CARDS[sourceKey].name : '';
            $('#prompt-body').innerHTML = `<div class="options">${pr.options.map((o, i) => `<button class="btn option" data-option="${i}">${effectsText(o)}</button>`).join('')}</div>`;
            $('#prompt-buttons').innerHTML = '';
            return;
        }
        const spec = this.promptSpec();
        $('#prompt-title').textContent = spec.title;
        $('#prompt-text').textContent = `${source}${spec.text(pr)}`;
        $('#prompt-body').innerHTML = this.promptCandidates().filter(g => g.cards.length).map(g => `
            <h3>${FROM_LABEL[g.from]}</h3>
            <div class="pick-cards">${g.cards.map(c => cardHtml(c.key, { cls: this.selected.includes(c.id) ? 'selected' : '', attrs: `data-pick="${c.id}"` })).join('')}</div>`).join('');
        const min = spec.min(pr);
        const max = spec.max(pr);
        const n = this.selected.length;
        const ok = n >= min && n <= max;
        const label = n === 0 ? '選ばない' : `${n}枚に決める`;
        $('#prompt-buttons').innerHTML = `<button class="btn primary" data-act="choose" ${ok ? '' : 'disabled'}>${min > 0 && n === 0 ? '選んでください' : label}</button>`;
    }

    findCardAnywhere(id) {
        const v = this.view;
        for (const p of v.players) {
            const hit = [...(p.hand ?? []), ...p.inPlay, ...p.bases, ...p.discard].find(c => c.id === id);
            if (hit) return hit.key;
        }
        return null;
    }

    // ---- 詳細 ----

    showDetail(zone, rawId) {
        if (!this.view) return;
        const card = this.findCard(zone, rawId);
        if (!card) return;
        const c = CARDS[card.key];
        const as = zone === 'mine' ? this.view.turn.used[card.id]?.as : null;
        const meta = `${FACTIONS[c.faction].name}・${typeName(card.key)}${c.type === 'ship' ? '' : `・耐久${c.defense}`}${c.cost ? `・費用${c.cost}` : ''}`;
        const lines = cardLines(as ?? card.key).map(l => `<p>${l.label ? `<em>${l.label}</em>` : ''}${l.text}</p>`).join('');
        $('#detail-body').innerHTML = `${cardHtml(card.key, { detail: true })}
            <div class="detail-text"><h2>${c.name}</h2><span class="meta">${meta}</span>
            ${as ? `<p class="note">${CARDS[as].name}を写しています</p>` : ''}${lines}</div>`;
        const buttons = [];
        const idAttr = `data-id="${card.id}"`;
        if (zone === 'hand' && this.canAct()) buttons.push(`<button class="btn primary" data-act="play" ${idAttr}>出す</button>`);
        if (zone === 'row' && this.canBuy(card)) buttons.push(`<button class="btn primary" data-act="buy" ${idAttr}>獲得</button>`);
        if (zone === 'mine' && this.canScrap(card)) buttons.push(`<button class="btn attack" data-act="scrap" ${idAttr}>廃棄して使う</button>`);
        if (zone === 'oppBase' && this.canAttackBase(card)) buttons.push(`<button class="btn attack" data-act="attack" ${idAttr}>攻撃</button>`);
        buttons.push('<button class="btn secondary" data-act="close">閉じる</button>');
        $('#detail-buttons').innerHTML = buttons.join('');
        if (!$('#detail').open) $('#detail').showModal();
    }

    showPile(seat) {
        const p = this.view?.players[seat];
        if (!p) return;
        $('#pile-title').textContent = `${p.name}の捨て札（${p.discard.length}枚）`;
        $('#pile-body').innerHTML = p.discard.length
            ? `<div class="pick-cards">${p.discard.map(c => cardHtml(c.key)).join('')}</div>`
            : '<p class="prompt-text">まだありません</p>';
        $('#pile').showModal();
    }

    // ---- 終わり ----

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const me = v.players[v.you];
        const opp = v.players[1 - v.you];
        $('#result-title').textContent = v.winner === v.you ? 'あなたの勝ち' : `${opp.name}の勝ち`;
        $('#result-text').textContent = `権威 ${Math.max(0, me.authority)} 対 ${Math.max(0, opp.authority)}・${v.turnNumber}手番`;
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
        $('#log-list').innerHTML = this.view.logs.slice(-200).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    // ---- ヒント ----

    // おすすめの手を、カードやボタンに印を付けて知らせる（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        if (command.type === 'choose') return this.toast('いまは選ぶ画面で答えてください');
        this.hintCommand = command;
        this.render();
        const text = {
            play: '白い枠のカードを出す',
            buy: '白い枠のカードを獲得する',
            scrap: '白い枠のカードを廃棄して使う',
            attack: command.target === 'player' ? '相手を攻撃する' : '白い枠の基地を攻撃する',
            end: '手番を終える'
        }[command.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const selector = {
            play: `#hand [data-zone="hand"][data-id="${c.card}"]`,
            buy: `[data-zone="row"][data-id="${c.card}"]`,
            scrap: `[data-zone="mine"][data-id="${c.card}"]`,
            attack: c.target === 'player' ? '[data-act="attack"]' : `[data-zone="oppBase"][data-id="${c.target}"]`,
            end: '[data-act="end"]'
        }[c.type];
        if (selector) document.querySelector(selector)?.classList.add('recommended');
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
