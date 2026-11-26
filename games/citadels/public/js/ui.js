/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 役割と地区のカードは、タップで選び、下の帯のボタンで決める（誤って建てたり選んだりしないように）
 */

import { CHARACTERS, CHARACTER_ORDER, DISTRICTS, DISTRICT_ORDER, COLORS, COLOR_ORDER, cardInfo, cardType, districtPoints } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, icon, coinHtml, characterCard, characterTag, districtCard, districtChip } from './art.js';

const SETTINGS_KEY = 'citadels.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン', 'ユイ', 'カイ'];
const RESULT_DELAY_MS = 1200;
const AUTO_END_MS = 700;
const FLOAT_MS = 1100;
const ABILITY_LABEL = { assassinate: '暗殺', steal: '盗む', magic: '魔術', destroy: '破壊' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5, 6, 7].includes(saved.count) ? saved.count : 4,
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

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.selected = null;       // { kind: 'card', card } か { kind: 'character', character }
        this.choose = null;         // 開いている選ぶ画面 { mode, picks }
        this.resultTimer = null;
        this.autoTimer = null;
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
        this.selected = null;
        this.choose = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
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
        clearTimeout(this.autoTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#fx').innerHTML = '';
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

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりと残す札は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => {
                if (event.target !== dialog) return;
                if (dialog.id === 'choose' && this.choose?.mode === 'keep') return;
                dialog.close();
            });
        });
        $('#choose').addEventListener('cancel', event => { if (this.choose?.mode === 'keep') event.preventDefault(); });
        $('#choose').addEventListener('close', () => { if (this.choose?.mode !== 'keep') this.choose = null; });

        $('#opponents').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-player]');
            if (tile) this.showCity(Number(tile.dataset.player));
        });
        $('#me').addEventListener('click', (event) => {
            if (event.target.closest('.my-city')) this.showCity(this.view.you);
        });
        $('#stage').addEventListener('click', (event) => {
            const card = event.target.closest('[data-character]');
            if (!card || !this.myDraft()) return;
            const character = card.dataset.character;
            this.selected = this.selected?.character === character ? null : { kind: 'character', character };
            this.render();
        });
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (!card) return;
            const id = Number(card.dataset.card);
            this.selected = this.selected?.card === id ? null : { kind: 'card', card: id };
            this.render();
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            this.onAction(button.dataset);
        });
        $('#choose-body').addEventListener('click', (event) => this.onChooseBody(event));
        $('#choose-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            this.onChooseButton(button.dataset);
        });
    }

    send(command) {
        this.controller?.send(command);
    }

    // 自分が答える番か
    myPrompt(phase) {
        const v = this.view;
        return !!v && v.phase === phase && v.winner === null && v.answering.includes(v.you);
    }

    myDraft() {
        return this.myPrompt('draft');
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        $('#title-art').innerHTML = CHARACTER_ORDER.map((c, i) => `<div class="fan" style="--i:${i - 3.5}">${characterCard(c)}</div>`).join('');
    }

    renderHelp() {
        const roles = CHARACTER_ORDER.map(c => `<li>${characterCard(c, { cls: 'small' })}<div><strong>${CHARACTERS[c].rank} ${CHARACTERS[c].name}</strong><br>${CHARACTERS[c].text}</div></li>`).join('');
        const specials = DISTRICT_ORDER.filter(t => DISTRICTS[t].color === 'purple').map(t => {
            const d = DISTRICTS[t];
            return `<li><span class="sp-name"><strong>${d.name}</strong> ${coinHtml(d.cost)}</span><span>${d.text}</span></li>`;
        }).join('');
        const colors = COLOR_ORDER.map(c => `<span class="chip" style="--dc:${COLORS[c].hex}"></span>${COLORS[c].name}`).join('　');
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>役割を選んで手番を行い、地区を建てて都市を育てます。だれかの都市が8地区になったら、その巡の終わりで終了。得点の一番多い人の勝ちです。</p>
            <h3>準備</h3>
            <p>各自2金と地区カード4枚。地区は5色：${colors}。</p>
            <h3>役割を選ぶ</h3>
            <p>王冠を持つ人から順に、8枚の役割から1枚ずつ選びます。1枚は伏せて捨て、4人なら2枚、5人なら1枚を表で捨てます（王様は表で捨てない）。7人のときは、最後の人が残りの1枚か伏せた1枚を選べます。</p>
            <p>2〜3人では1人が2役。2人のときは、2人目から、選んだあとに1枚を伏せて捨てます。</p>
            <h3>手番</h3>
            <p>役割を番号の順に呼び、その役割の人が手番を行います。</p>
            <p><strong>行動</strong>：2金を取るか、地区カードを2枚引いて1枚を残す。<br><strong>建てる</strong>：行動のあと、費用を払って地区を1つ（建築家は3つまで）。同じ名前の地区は建てられません。<br><strong>収入と能力</strong>：手番の中でいつでも1回。収入は、役割の色の地区1つにつき1金（取らずに終えると自動で受け取る）。</p>
            <p>上の電球のボタンを押すと、おすすめの操作を選んだ状態にし、押すボタンを光らせます。</p>
            <h3>終わりと得点</h3>
            <p>地区の費用の合計（大学と竜の門は8点）。5色そろえば+3。最初に8地区にした人は+4、ほかに8地区にした人は+2。同点なら、地区の費用の合計が多い人、それも同じなら金の多い人が上です。</p>
            <h3>役割</h3>
            <ul class="help-roles">${roles}</ul>
            <h3>紫の地区</h3>
            <ul class="help-specials">${specials}</ul>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const view = this.controller.getView();
        this.view = view;
        const me = view.players[view.you];
        // 手放した札や、選べなくなった役割の選択は外す
        if (this.selected?.kind === 'card' && !me.hand.includes(this.selected.card)) this.selected = null;
        if (this.selected?.kind === 'character' && !(this.myDraft() && this.draftList().includes(this.selected.character))) this.selected = null;
        this.renderStatus(view);
        this.renderOpponents(view);
        this.renderStage(view);
        this.renderMe(view);
        this.renderHand(view);
        this.renderActions(view);
        this.updateChoose(view);
        this.playEvents(view, prev);
        this.scheduleAutoEnd(view);
        if ($('#log').open) this.renderLog();
        if (view.winner !== null && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    renderStatus(view) {
        const last = view.finalRound && view.winner === null ? '<span class="final">最後の巡</span>' : '';
        $('#status').innerHTML = `<span>第${view.round}巡</span>${last}<span class="deck">${icon('cards')}${view.deckCount}</span>`;
    }

    // その人の役割の札（明かされた分は表、ほかは伏せた札）
    charactersHtml(view, p) {
        const shown = p.characters;
        const hidden = Math.max(0, p.characterCount - shown.length);
        return [...shown.map(c => characterTag(c, view.killed === c ? 'killed' : '')), ...Array.from({ length: hidden }, () => '<span class="char-tag unknown">?</span>')].join('');
    }

    renderOpponents(view) {
        const others = [...view.players.slice(view.you + 1), ...view.players.slice(0, view.you)];
        const current = view.turn?.seat ?? (view.phase === 'draft' ? view.draft.picker : null);
        $('#opponents').dataset.count = String(others.length);
        $('#opponents').innerHTML = others.map(p => {
            const cls = [
                p.id === current && view.winner === null ? 'current' : '',
                p.city.length >= view.completeCity ? 'complete' : ''
            ].join(' ');
            return `<button class="opponent ${cls}" data-player="${p.id}">
                <span class="op-head">${view.crown === p.id ? `<span class="crown">${icon('crown')}</span>` : ''}<span class="op-name">${escapeHtml(p.name)}</span>
                    <span class="op-chars">${this.charactersHtml(view, p)}</span>
                    <span class="op-hand">${icon('cards')}${p.handCount}</span><span data-gold="${p.id}">${coinHtml(p.gold)}</span></span>
                <span class="op-city">${p.city.map(id => districtChip(id)).join('')}</span>
            </button>`;
        }).join('');
    }

    draftList() {
        return this.view?.draft?.kind === 'discard' ? this.discardOptions() : (this.view?.draft?.options ?? []);
    }

    // 2人のとき、伏せて捨てられる役割（自分が最後に見た候補から、選んだ役割と伏せた役割を除く）
    discardOptions() {
        const v = this.view;
        const me = v.players[v.you];
        const last = v.draft.offers.at(-1)?.options ?? [];
        return last.filter(c => !me.characters.includes(c) && !v.draft.discarded.includes(c));
    }

    // 呼ぶ順の列（表で捨てた・殺された・狙われた・手番を終えた役割）
    trackHtml(view) {
        return `<div class="track">${CHARACTER_ORDER.map(c => {
            const rank = CHARACTERS[c].rank;
            const seat = view.revealed[c];
            const cls = [
                view.draft?.faceUp.includes(c) ? 'face-up' : '',
                view.phase !== 'draft' && view.calling > rank ? 'done' : '',
                view.phase !== 'draft' && view.calling === rank && view.winner === null ? 'now' : '',
                view.killed === c ? 'killed' : '',
                view.robbed === c ? 'robbed' : ''
            ].join(' ');
            const owner = seat !== undefined ? escapeHtml(view.players[seat].name) : (view.draft?.faceUp.includes(c) ? '表' : '');
            return `<span class="tr ${cls}" style="--rc:${CHARACTERS[c].color}"><b>${rank}</b><span class="tr-name">${CHARACTERS[c].name}</span><span class="tr-owner">${owner}</span></span>`;
        }).join('')}</div>`;
    }

    renderStage(view) {
        const name = (seat) => escapeHtml(view.players[seat].name);
        const last = escapeHtml(view.logs.at(-1) ?? '');
        let html = '';
        if (view.phase === 'draft' && this.myDraft()) {
            const discard = view.draft.kind === 'discard';
            const list = this.draftList();
            const cards = list.map(c => characterCard(c, { cls: `pickable ${this.selected?.character === c ? 'selected' : ''}` })).join('');
            const faceUp = view.draft.faceUp.length ? `<span class="faceup">表：${view.draft.faceUp.map(c => CHARACTERS[c].name).join('・')}</span>` : '';
            html = `<div class="st-title">${discard ? '伏せて捨てる役割' : '役割を選ぶ'}${faceUp}</div><div class="pick-row" style="--n:${list.length}">${cards}</div>`;
        } else {
            let note = '';
            if (view.winner !== null) note = '';
            else if (view.phase === 'draft') note = `${name(view.draft.picker)}が${view.draft.kind === 'discard' ? '役割を伏せています' : '役割を選んでいます'}`;
            else if (view.turn) {
                const mine = view.turn.seat === view.you;
                note = `${characterTag(view.turn.character)}<span>${mine ? 'あなたの手番' : `${name(view.turn.seat)}の手番`}</span>`;
            }
            if (view.phase === 'graveyard') note = view.grave.seat === view.you ? `墓地で${DISTRICTS[cardType(view.grave.card)].name}を拾う？` : `${name(view.grave.seat)}が墓地で拾うか考えています`;
            html = `${this.trackHtml(view)}<div class="st-note">${note}</div><div class="st-log">${last}</div>`;
        }
        $('#stage').innerHTML = html;
    }

    renderMe(view) {
        const me = view.players[view.you];
        const crown = view.crown === me.id ? `<span class="crown">${icon('crown')}</span>` : '';
        const city = me.city.length
            ? me.city.map(id => districtCard(id, { cls: 'mini' })).join('')
            : '<span class="empty">まだ地区がありません</span>';
        $('#me').innerHTML = `<div class="my-head">${crown}<span class="my-chars">${this.charactersHtml(view, me)}</span>
            <span class="my-count">${me.city.length}/${view.completeCity}</span><span data-gold="${me.id}">${coinHtml(me.gold, 'big')}</span></div>
            <div class="my-city">${city}</div>`;
    }

    renderHand(view) {
        const me = view.players[view.you];
        const buildable = new Set(view.choices?.build ?? []);
        $('#hand').innerHTML = me.hand.length
            ? me.hand.map(id => districtCard(id, { cls: `hand-card ${buildable.has(id) ? 'buildable' : ''} ${this.selected?.card === id ? 'selected' : ''}` })).join('')
            : '<span class="empty">手札はありません</span>';
    }

    renderActions(view) {
        const me = view.players[view.you];
        let html = '';
        const sel = this.selected;
        if (view.winner !== null) {
            html = '';
        } else if (this.myDraft()) {
            if (sel?.kind === 'character') {
                const discard = view.draft.kind === 'discard';
                html = `<div class="info">${characterTag(sel.character)}<span>${CHARACTERS[sel.character].text}</span></div>
                    <button class="btn primary" data-act="${discard ? 'discard' : 'pick'}">${discard ? '伏せる' : '選ぶ'}</button>`;
            }
        } else if (this.myPrompt('graveyard')) {
            html = `<div class="row-buttons"><button class="btn primary" data-act="grave-take">拾う（1金）</button><button class="btn secondary" data-act="grave-skip">拾わない</button></div>`;
        } else if (sel?.kind === 'card') {
            const d = cardInfo(sel.card);
            const canBuild = view.choices?.build.includes(sel.card);
            html = `<div class="info"><strong>${d.name}</strong>${coinHtml(d.cost)}<span>${COLORS[d.color].name}${d.text ? `：${d.text}` : ''}</span></div>
                ${canBuild ? '<button class="btn primary" data-act="build">建てる</button>' : ''}`;
        } else if (this.myPrompt('turn')) {
            const c = view.choices;
            const buttons = [];
            if (c.act) {
                buttons.push('<button class="act gold" data-act="gold">2金</button>');
                buttons.push(`<button class="act" data-act="draw" ${c.draw ? '' : 'disabled'}>${me.city.some(id => cardType(id) === 'observatory') ? '3枚引く' : '2枚引く'}</button>`);
            }
            if (c.ability) buttons.push(`<button class="act ability" style="--rc:${CHARACTERS[view.turn.character].color}" data-act="ability">${ABILITY_LABEL[c.ability.type]}</button>`);
            if (c.canIncome && c.income) buttons.push(`<button class="act gold" data-act="income">収入<small>+${c.income}</small></button>`);
            if (c.lab) buttons.push('<button class="act purple" data-act="lab">研究所</button>');
            if (c.smithy) buttons.push('<button class="act purple" data-act="smithy">鍛冶屋</button>');
            if (c.end) buttons.push('<button class="act end" data-act="end">終える</button>');
            html = `<div class="act-row">${buttons.join('')}</div>`;
        }
        $('#actions').innerHTML = html;
        if (this.hint && this.hint.key === this.lastSeq) $(`#actions [data-act="${this.hint.act}"]`)?.classList.add('recommended');
    }

    // ヒント：CPU（ふつう）が選ぶ操作。役割や地区を選んだ状態にし、押すボタンに印を付ける
    showHint() {
        const c = this.controller?.hint();
        if (!c) return this.toast('自分の番になったら、おすすめを出せます');
        const name = (ch) => CHARACTERS[ch]?.name ?? '';
        let act = c.type;
        let text;
        switch (c.type) {
            case 'pick': case 'discard':
                this.selected = { kind: 'character', character: c.character };
                text = `${name(c.character)}を${c.type === 'pick' ? '選ぶ' : '伏せる'}`;
                break;
            case 'build':
                this.selected = { kind: 'card', card: c.card };
                text = `${DISTRICTS[cardType(c.card)]?.name ?? '地区'}を建てる`;
                break;
            case 'graveyard':
                act = c.take ? 'grave-take' : 'grave-skip';
                text = c.take ? '墓場の地区を拾う' : '拾わない';
                break;
            case 'gold': text = '2金を取る'; break;
            case 'draw': text = 'カードを引く'; break;
            case 'income': text = '収入を受け取る'; break;
            case 'smithy': text = '鍛冶屋を使う'; break;
            case 'lab': text = '研究所を使う'; break;
            case 'end': text = '手番を終える'; break;
            case 'keep': text = '残すカードを選ぶ'; break;
            case 'assassinate': act = 'ability'; text = `${name(c.character)}を暗殺する`; break;
            case 'steal': act = 'ability'; text = `${name(c.character)}から盗む`; break;
            default: act = 'ability'; text = '能力を使う';
        }
        this.hint = { key: this.lastSeq, act };
        this.render();
        this.toast(`おすすめ：${text}`);
    }

    onAction({ act }) {
        const v = this.view;
        const sel = this.selected;
        switch (act) {
            case 'pick': case 'discard':
                if (sel?.kind === 'character') {
                    this.selected = null;
                    this.send({ type: act, character: sel.character });
                }
                break;
            case 'build':
                if (sel?.kind === 'card') {
                    this.selected = null;
                    this.send({ type: 'build', card: sel.card });
                }
                break;
            case 'grave-take': return this.send({ type: 'graveyard', take: true });
            case 'grave-skip': return this.send({ type: 'graveyard', take: false });
            case 'gold': case 'draw': case 'income': case 'smithy': case 'end':
                return this.send({ type: act });
            case 'lab': return this.openChoose('lab');
            case 'ability': return this.openChoose(v.choices.ability.type);
        }
    }

    // 手番でできることが「終える」だけになったら、少し待って自動で終える
    scheduleAutoEnd(view) {
        clearTimeout(this.autoTimer);
        const c = view.choices;
        if (!c || !this.myPrompt('turn') || $('#choose').open) return;
        const only = c.end && !c.build.length && !c.ability && !(c.canIncome && c.income) && !c.lab && !c.smithy;
        if (!only) return;
        this.autoTimer = setTimeout(() => {
            const now = this.controller?.getView();
            const again = now?.choices;
            if (again && again.end && !again.build.length && !again.ability && !(again.canIncome && again.income) && !again.lab && !again.smithy) this.send({ type: 'end' });
        }, AUTO_END_MS);
    }

    // ---- 選ぶ画面（能力・残す札・研究所） ----

    openChoose(mode) {
        this.choose = { mode, picks: [] };
        this.renderChoose();
        if (!$('#choose').open) $('#choose').showModal();
    }

    updateChoose(view) {
        const keep = this.myPrompt('keep');
        if (keep) {
            if (this.choose?.mode !== 'keep') this.openChoose('keep');
            else this.renderChoose();
            return;
        }
        if (this.choose?.mode === 'keep') {
            this.choose = null;
            if ($('#choose').open) $('#choose').close();
            return;
        }
        // 能力が使えなくなったら閉じる
        if (this.choose && $('#choose').open) {
            const c = view.choices;
            const still = this.choose.mode === 'lab' ? c?.lab : c?.ability?.type === this.choose.mode;
            if (!still) $('#choose').close();
            else this.renderChoose();
        }
    }

    renderChoose() {
        const v = this.view;
        const me = v.players[v.you];
        const ch = this.choose;
        const c = v.choices;
        let title = '';
        let body = '';
        let buttons = '';
        const cancel = '<button class="btn secondary" data-do="cancel">やめる</button>';
        switch (ch.mode) {
            case 'assassinate': case 'steal': {
                title = ch.mode === 'assassinate' ? '殺す役割' : '金を奪う役割';
                const allowed = c.ability.characters;
                body = `<div class="pick-grid">${CHARACTER_ORDER.map(x => {
                    const ok = allowed.includes(x) && !me.characters.includes(x);
                    const mark = v.draft.faceUp.includes(x) ? '<span class="mark">表</span>' : me.characters.includes(x) ? '<span class="mark">自分</span>' : '';
                    return `<div class="pick-cell ${ok ? '' : 'disabled'}" data-pick="${x}">${characterCard(x, { cls: 'small' })}${mark}</div>`;
                }).join('')}</div>`;
                buttons = cancel;
                break;
            }
            case 'magic': {
                title = '奇術師';
                const others = v.players.filter(p => p.id !== v.you);
                body = `<h3>手札をすべて交換</h3><div class="swap-list">${others.map(p => `<button class="btn swap" data-swap="${p.id}">${escapeHtml(p.name)}<span class="op-hand">${icon('cards')}${p.handCount}</span></button>`).join('')}</div>
                    <h3>選んだ札を山の下に戻して、同じ枚数を引く</h3>
                    <div class="pick-cards">${me.hand.map(id => districtCard(id, { cls: `hand-card ${ch.picks.includes(id) ? 'picked' : ''}`, attrs: `data-toggle="${id}"` })).join('') || '<span class="empty">手札はありません</span>'}</div>`;
                buttons = `<button class="btn primary" data-do="redraw" ${ch.picks.length ? '' : 'disabled'}>${ch.picks.length ? `${ch.picks.length}枚を` : ''}引き直す</button>${cancel}`;
                break;
            }
            case 'destroy': {
                title = '壊す地区';
                // 相手の都市を先に、自分の都市を最後に並べる
                const order = [...v.players.slice(v.you + 1), ...v.players.slice(0, v.you), v.players[v.you]];
                const groups = order.map(p => {
                    const list = c.ability.targets.filter(x => x.target === p.id);
                    if (!list.length) return '';
                    return `<h3>${escapeHtml(p.name)}</h3><div class="pick-cards">${list.map(x => `<div class="pick-cell ${x.cost <= me.gold ? '' : 'disabled'}" data-destroy="${x.target}:${x.card}">${districtCard(x.card, { cls: 'hand-card' })}<span class="cost-mark">${x.cost}金</span></div>`).join('')}</div>`;
                }).join('');
                body = groups || '<p class="empty">壊せる地区はありません</p>';
                buttons = cancel;
                break;
            }
            case 'lab': {
                title = '研究所：捨てて1金';
                body = `<div class="pick-cards">${me.hand.map(id => `<div class="pick-cell" data-lab="${id}">${districtCard(id, { cls: 'hand-card' })}</div>`).join('')}</div>`;
                buttons = cancel;
                break;
            }
            case 'keep': {
                title = `残す札を${v.keepCount}枚`;
                body = `<div class="pick-cards">${(v.drawn ?? []).map(id => districtCard(id, { cls: `big ${ch.picks.includes(id) ? 'picked' : ''}`, attrs: `data-keep="${id}"` })).join('')}</div>
                    <p class="keep-info">${ch.picks.length ? this.cardText(ch.picks.at(-1)) : ''}</p>`;
                buttons = `<button class="btn primary" data-do="keep" ${ch.picks.length === v.keepCount ? '' : 'disabled'}>残す</button>`;
                break;
            }
        }
        $('#choose-title').textContent = title;
        $('#choose-body').innerHTML = body;
        $('#choose-buttons').innerHTML = buttons;
    }

    cardText(id) {
        const d = cardInfo(id);
        const dup = this.view.players[this.view.you].city.some(x => cardType(x) === cardType(id)) ? '（もう建っている）' : '';
        return `${d.name}　${d.cost}金・${COLORS[d.color].name}${d.text ? `：${d.text}` : ''}${dup}`;
    }

    onChooseBody(event) {
        const ch = this.choose;
        if (!ch) return;
        const el = event.target.closest('[data-pick],[data-swap],[data-toggle],[data-destroy],[data-lab],[data-keep]');
        if (!el || el.classList.contains('disabled')) return;
        const d = el.dataset;
        if (d.pick) return this.finishChoose({ type: ch.mode, character: d.pick });
        if (d.swap) return this.finishChoose({ type: 'swap', target: Number(d.swap) });
        if (d.destroy) {
            const [target, card] = d.destroy.split(':').map(Number);
            return this.finishChoose({ type: 'destroy', target, card });
        }
        if (d.lab) return this.finishChoose({ type: 'lab', card: Number(d.lab) });
        if (d.toggle) {
            const id = Number(d.toggle);
            ch.picks = ch.picks.includes(id) ? ch.picks.filter(x => x !== id) : [...ch.picks, id];
            return this.renderChoose();
        }
        if (d.keep) {
            // 1枚なら選び直し、2枚なら押すたびに足し外しする
            const id = Number(d.keep);
            const n = this.view.keepCount;
            if (n === 1) ch.picks = [id];
            else if (ch.picks.includes(id)) ch.picks = ch.picks.filter(x => x !== id);
            else if (ch.picks.length < n) ch.picks = [...ch.picks, id];
            return this.renderChoose();
        }
    }

    onChooseButton({ do: action }) {
        const ch = this.choose;
        if (!ch) return;
        if (action === 'cancel') return $('#choose').close();
        if (action === 'redraw') return this.finishChoose({ type: 'redraw', cards: [...ch.picks] });
        if (action === 'keep' && ch.picks.length === this.view.keepCount) {
            this.choose = null;
            $('#choose').close();
            this.send({ type: 'keep', cards: [...ch.picks] });
        }
    }

    finishChoose(command) {
        this.choose = null;
        $('#choose').close();
        this.send(command);
    }

    // ---- 都市・記録・終わり ----

    showCity(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        const points = p.city.reduce((s, id) => s + districtPoints(cardType(id)), 0);
        $('#city-title').textContent = seat === v.you ? 'あなたの都市' : `${p.name}の都市`;
        $('#city-body').innerHTML = `<div class="city-head"><span class="op-chars">${this.charactersHtml(v, p)}</span>
                <span class="op-hand">${icon('cards')}${p.handCount}</span>${coinHtml(p.gold)}<span>地区 ${p.city.length}/${v.completeCity}・${points}点</span></div>
            <div class="pick-cards">${p.city.map(id => districtCard(id, { cls: 'hand-card' })).join('') || '<span class="empty">まだ地区がありません</span>'}</div>
            ${p.city.some(id => cardInfo(id).text) ? `<ul class="city-notes">${p.city.filter(id => cardInfo(id).text).map(id => `<li><strong>${cardInfo(id).name}</strong>：${cardInfo(id).text}</li>`).join('')}</ul>` : ''}`;
        $('#city').showModal();
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

    showResult() {
        const v = this.view;
        if (!v || v.winner === null) return;
        $('#result-title').textContent = v.winner === v.you ? 'あなたの勝ち' : `${v.players[v.winner].name}の勝ち`;
        $('#result-list').innerHTML = v.ranking.map((seat, i) => {
            const s = v.scores[seat];
            const p = v.players[seat];
            const parts = [`地区 ${s.districts}`, s.colors ? `5色 +${s.colors}` : '', s.complete ? `完成 +${s.complete}` : ''].filter(Boolean).join('・');
            return `<li><span class="rank-no">${i + 1}</span><span class="name">${escapeHtml(p.name)}<small>${parts}</small></span>
                <span class="op-city">${p.city.map(id => districtChip(id)).join('')}</span><span class="total">${s.total}点</span></li>`;
        }).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        const deltas = new Map();
        const add = (seat, amount) => deltas.set(seat, (deltas.get(seat) ?? 0) + amount);
        const me = view.players[view.you];
        fresh.forEach(e => {
            if (e.type === 'gold') {
                if (e.to !== null) add(e.to, e.amount);
                if (e.from !== null) add(e.from, -e.amount);
            }
            if (e.type === 'build') add(e.seat, -e.cost);
            if (e.type === 'destroy') add(e.seat, -e.cost);
            if (e.type === 'graveyard') add(e.seat, -1);
            if (e.type === 'call' && e.killed && me.characters.includes(e.character)) this.toast(`あなたの${CHARACTERS[e.character].name}は殺されていました`);
            if (e.type === 'gold' && e.from === view.you && e.to !== null) this.toast(`盗賊に${e.amount}金を奪われました`);
            if (e.type === 'destroy' && e.target === view.you) this.toast(`${cardInfo(e.card).name}を壊されました`);
            if (e.type === 'swap' && e.target === view.you) this.toast(`${view.players[e.seat].name}と手札を交換しました`);
        });
        deltas.forEach((amount, seat) => { if (amount) this.floatText(seat, amount); });
    }

    floatText(seat, amount) {
        const target = $(`[data-gold="${seat}"]`);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = `float ${amount > 0 ? 'plus' : 'minus'}`;
        el.textContent = amount > 0 ? `+${amount}` : `−${-amount}`;
        el.style.left = `${rect.left + rect.width / 2}px`;
        el.style.top = `${rect.top}px`;
        $('#fx').appendChild(el);
        setTimeout(() => el.remove(), reduceMotion() ? 600 : FLOAT_MS);
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}
