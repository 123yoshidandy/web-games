/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 自分の都市を下、相手の都市を上に置き、間に軍事の駒とカードの並びを置く
 */

import { CARDS, WONDERS, TOKENS, TOKEN_ORDER, WONDER_ORDER, RESOURCES, COLORS, COLOR_NAMES, militaryPoints } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame, CPU_PLAY_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { PLAYERS } from './game.js';
import { CPU_LEVELS } from './cpu-player.js';
import { music } from './music.js';
import {
    symbolsSvg, icon, resourceIcon, scienceIcon, coinHtml, vpHtml, cardHtml, cardBackHtml, wonderHtml,
    tokenHtml, cardText, wonderText, costHtml
} from './art.js';

const SETTINGS_KEY = 'seven-wonders-duel.settings';
const CPU_NAME = 'クレオ';
const RESULT_DELAY_MS = 900;
const FLOAT_MS = 1100;
const CARD_RATIO = 1.25;   // カードの高さ ÷ 幅
const ROW_STEP = 0.5;      // 行の間隔（カードの高さに対して）。下の行が上のカードの下半分を覆う
const GAP = 4;
const ROMAN = ['', 'I', 'II', 'III'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

// 都市で生む資源（茶と灰）と、「どれか1つ」
function production(player) {
    const fixed = Object.fromEntries(RESOURCES.map(r => [r, 0]));
    const choices = [];
    player.cards.forEach(k => {
        const c = CARDS[k];
        if (c.produce) Object.entries(c.produce).forEach(([r, n]) => { fixed[r] += n; });
        if (c.choice) choices.push(c.choice);
    });
    player.wonders.filter(w => w.built && WONDERS[w.key].choice).forEach(w => choices.push(WONDERS[w.key].choice));
    return { fixed, choices };
}

const scienceOf = (player) => {
    const list = player.cards.map(k => CARDS[k].science).filter(Boolean);
    if (player.tokens.includes('law')) list.push('law');
    return list;
};

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.openedPrompt = null;   // 自動で開いた選択。閉じても同じ選択では開き直さない
        this.detailSlot = null;
        this.resultTimer = null;
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: '七不思議デュエル',
            game: 'seven-wonders-duel',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_PLAY_DELAY_MS,
            minPlayers: PLAYERS,
            maxPlayers: PLAYERS,
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
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        this.renderTitleArt();
        this.renderHelp();
        window.addEventListener('resize', () => {
            if (this.controller) this.renderStructure();
        });
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
                onUpdate: () => {
                    // ヒントを出している間は、自分の番が続くなら今の場面のおすすめに出し直し、相手の番になれば消す
                    if (this.hintCommand) this.hintCommand = this.controller.hint();
                    this.render();
                },
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
        this.hintCommand = null;
        this.view = null;
        this.openedPrompt = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        const players = [{ name: 'あなた', isCPU: false }, { name: CPU_NAME, isCPU: true, cpuLevel: this.settings.level }];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        document.querySelectorAll('.float').forEach(el => el.remove());
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
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#home').addEventListener('click', () => this.goHome());
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => this.openLog());
        $('#status').addEventListener('click', () => this.reopenPrompt() || this.openLog());
        document.querySelectorAll('dialog').forEach(dialog => {
            // 外側を押したら閉じる（選択は消さず、「盤を見る」扱い）
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
            });
        });
        $('#structure').addEventListener('click', (event) => {
            const wonder = event.target.closest('[data-pick-wonder]');
            if (wonder) {
                music.play('select');
                this.openDraftWonder(wonder.dataset.pickWonder);
                return;
            }
            const slot = event.target.closest('[data-slot]');
            if (slot) {
                music.play('select');
                this.openCard(Number(slot.dataset.slot));
            }
        });
        ['#city-0', '#city-1'].forEach(id => $(id).addEventListener('click', (event) => {
            const token = event.target.closest('[data-token]');
            if (token) {
                this.toast(`${TOKENS[token.dataset.token].name}：${TOKENS[token.dataset.token].text}`);
                return;
            }
            this.openCity(Number($(id).dataset.seat));
        }));
        $('#board-info').addEventListener('click', (event) => {
            const token = event.target.closest('[data-token]');
            if (token) this.toast(`${TOKENS[token.dataset.token].name}：${TOKENS[token.dataset.token].text}`);
            if (event.target.closest('#open-discard')) this.openDiscard();
        });
        $('#card-detail-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button || button.disabled) return;
            const { action, wonder } = button.dataset;
            if (action === 'close') {
                $('#card-detail').close();
                return;
            }
            if (action === 'pickWonder') {
                $('#card-detail').close();
                this.controller.send({ type: 'pickWonder', wonder });
                return;
            }
            const slot = this.detailSlot;
            $('#card-detail').close();
            if (action === 'wonder') this.controller.send({ type: 'wonder', slot, wonder });
            else this.controller.send({ type: action, slot });
        });
        $('#pick-list').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-command]');
            if (!button) return;
            $('#pick').close();
            this.controller.send(JSON.parse(button.dataset.command));
        });
    }

    renderSetup() {
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        const cards = ['palace', 'library', 'tavern', 'arsenal', 'sawmill'];
        $('#title-art').innerHTML = cards.map((k, i) => `<div class="title-card" style="--i:${i - 2}">${cardHtml(k)}</div>`).join('');
    }

    renderHelp() {
        $('#help-wonders').innerHTML = WONDER_ORDER.map(k => `<li><div class="help-wonder">${wonderHtml(k)}</div><span><strong>${WONDERS[k].name}</strong>　${wonderText(k).join('・')}</span></li>`).join('');
        $('#help-tokens').innerHTML = TOKEN_ORDER.map(k => `<li>${tokenHtml(k)}<span><strong>${TOKENS[k].name}</strong>　${TOKENS[k].text}</span></li>`).join('');
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const previous = this.view;
        this.view = this.controller.getView();
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        const v = this.view;
        const me = v.you;
        $('#city-0').dataset.seat = String(me);
        $('#city-1').dataset.seat = String(1 - me);
        this.renderBoardInfo();
        this.renderCity($('#city-0'), me);
        this.renderCity($('#city-1'), 1 - me);
        this.renderMilitary();
        this.renderStructure();
        this.markHint();
        this.renderStatus();
        this.playEvents(previous);
        this.refreshOpenDialogs();
        this.maybePrompt();
        this.maybeResult();
    }

    renderBoardInfo() {
        const v = this.view;
        const age = v.phase === 'draft' ? '' : `${ROMAN[v.age]}`;
        $('#board-info').innerHTML = `${age ? `<span class="age" aria-label="時代${age}">${age}</span>` : ''}
            <span class="board-tokens">${v.tokensBoard.map(t => `<button class="tok-btn" data-token="${t}" aria-label="${TOKENS[t].name}">${tokenHtml(t)}</button>`).join('')}</span>
            <button id="open-discard" class="discard-btn" aria-label="捨て札">${icon('i-discard')}<b>${v.discard.length}</b></button>`;
    }

    renderCity(el, seat) {
        const v = this.view;
        const p = v.players[seat];
        const { fixed, choices } = production(p);
        const active = v.actors.includes(seat);
        const science = scienceOf(p);
        const counts = COLORS.map(c => [c, p.cards.filter(k => CARDS[k].color === c).length]).filter(([, n]) => n > 0);
        el.classList.toggle('active', active);
        el.innerHTML = `
            <div class="city-row">
                <span class="pname">${escapeHtml(p.name)}</span>
                ${coinHtml(p.coins, 'big')}
                ${vpHtml(p.score.total, 'big')}
                <span class="sci-list">${science.map(s => scienceIcon(s)).join('')}</span>
                <span class="tok-list">${p.tokens.map(t => `<button class="tok-btn" data-token="${t}" aria-label="${TOKENS[t].name}">${tokenHtml(t, 'small')}</button>`).join('')}</span>
            </div>
            <div class="city-row">
                <span class="res-list">${RESOURCES.map(r => `<span class="res ${fixed[r] ? '' : 'none'}">${resourceIcon(r)}<b>${fixed[r]}</b></span>`).join('')}${choices.length ? `<span class="res choice">${icon('i-wonder', 'tiny')}<b>+${choices.length}</b></span>` : ''}</span>
                <span class="color-counts">${counts.map(([c, n]) => `<span class="cc c-${c}">${n}</span>`).join('')}</span>
            </div>
            <div class="city-row wonders">${p.wonders.map(w => `<span class="mini-wonder ${w.built ? 'built' : ''}">${WONDERS[w.key].name}</span>`).join('')}</div>`;
    }

    renderMilitary() {
        const v = this.view;
        const me = v.you;
        // 自分から見た位置（右が相手の都）
        const pos = me === 0 ? v.military : -v.military;
        const cells = [];
        for (let i = -9; i <= 9; i++) {
            const token = v.militaryTokens.find(t => !t.taken && ((t.loser !== me && i === t.at) || (t.loser === me && i === -t.at)));
            const zone = Math.abs(i) >= 6 ? 'z3' : Math.abs(i) >= 3 ? 'z2' : Math.abs(i) >= 1 ? 'z1' : 'z0';
            const side = i < 0 ? 'mine' : i > 0 ? 'theirs' : '';
            cells.push(`<span class="mcell ${zone} ${side} ${Math.abs(i) === 9 ? 'capital' : ''}">${token ? `<span class="mtoken">${token.coins}</span>` : ''}${i === pos ? '<span class="pawn"></span>' : ''}</span>`);
        }
        const points = militaryPoints(Math.abs(pos));
        $('#military').innerHTML = `<div class="track">${cells.join('')}</div>`;
        $('#military').setAttribute('aria-label', pos === 0 ? '軍事は互角' : `${pos > 0 ? 'あなた' : '相手'}が${Math.abs(pos)}マス優勢（${points}点）`);
    }

    renderStructure() {
        const v = this.view;
        if (!v) return;
        const el = $('#structure');
        if (v.phase === 'draft') {
            this.renderDraft(el);
            return;
        }
        el.classList.remove('draft');
        const slots = v.structure;
        const maxX = Math.max(...slots.map(s => s.x)) + 2;
        const rows = Math.max(...slots.map(s => s.row)) + 1;
        const cols = maxX / 2;
        const width = el.clientWidth - 8;
        const height = el.clientHeight - 6;
        const w = Math.floor(Math.min((width - GAP * (cols - 1)) / cols, height / ((1 + ROW_STEP * (rows - 1)) * CARD_RATIO)));
        const h = Math.floor(w * CARD_RATIO);
        const totalW = cols * w + (cols - 1) * GAP;
        const totalH = h * (1 + ROW_STEP * (rows - 1));
        const left0 = (el.clientWidth - totalW) / 2;
        const top0 = (el.clientHeight - totalH) / 2;
        const mine = v.options !== null;
        el.style.setProperty('--cw', `${w}px`);
        el.style.setProperty('--ch', `${h}px`);
        el.innerHTML = slots.map((s, i) => {
            if (s.taken) return '';
            const left = left0 + (s.x / 2) * (w + GAP);
            const top = top0 + s.row * h * ROW_STEP;
            const o = v.options?.cards[i];
            const inner = s.faceUp ? cardHtml(s.key, o ? { price: o.chain ? null : o.price, chain: o.chain, canBuild: o.canBuild, name: false } : { name: false }) : cardBackHtml(v.age, s.back);
            const cls = ['slot', s.accessible ? 'open' : '', mine && s.accessible ? 'glow' : ''].join(' ');
            return `<button class="${cls}" data-slot="${i}" style="left:${left}px;top:${top}px;z-index:${s.row + 1}" aria-label="${s.faceUp ? CARDS[s.key].name : '裏のカード'}" ${s.faceUp ? '' : 'disabled'}>${inner}</button>`;
        }).join('');
    }

    renderDraft(el) {
        const v = this.view;
        el.classList.add('draft');
        const mine = v.draft.picker === v.you;
        el.innerHTML = `<div class="draft-grid">${v.draft.offer.map(k => `<button class="draft-wonder ${mine ? 'glow' : ''}" data-pick-wonder="${k}">${wonderHtml(k)}</button>`).join('')}</div>`;
    }

    statusText() {
        const v = this.view;
        const me = v.you;
        const name = (seat) => v.players[seat].name;
        if (v.phase === 'end') return '終わり';
        if (v.phase === 'draft') return v.draft.picker === me ? '七不思議を選ぶ' : `${name(v.draft.picker)}が七不思議を選んでいます`;
        const actor = v.actors[0];
        if (actor !== me) return `${name(actor)}の番`;
        switch (v.phase) {
            case 'progress': return '進歩トークンを選ぶ';
            case 'library': return '大図書館：進歩トークンを選ぶ';
            case 'destroy': return `${COLOR_NAMES[v.pending.color]}のカードを1枚捨てさせる`;
            case 'revive': return '霊廟：捨て札から建てる';
            case 'starter': return `時代${ROMAN[v.age + 1]}の先手を選ぶ`;
            default: return 'あなたの番';
        }
    }

    renderStatus() {
        const v = this.view;
        const last = v.logs.at(-1) ?? '';
        const mine = v.actors.includes(v.you);
        $('#status').classList.toggle('mine', mine);
        $('#status').innerHTML = `<strong>${escapeHtml(this.statusText())}</strong><span class="last">${escapeHtml(last)}</span>`;
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、相手の手は notify、自分の番になったら turn、終わりは勝ち負け
    playSound(fresh, previous) {
        const v = this.view;
        const me = v.you;
        if (fresh.length === 0) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winner === null ? 'notify' : end.winner === me ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'age')) return music.play('shuffle');
        const mine = fresh.filter(e => e.seat === me && e.type !== 'turn' && e.type !== 'coins');
        const took = fresh.find(e => e.type === 'take' && e.seat === me);
        if (fresh.some(e => e.type === 'destroy' && e.seat !== me) || fresh.some(e => e.type === 'militaryToken' && e.loser !== me && previous.current === me)) return music.play('capture');
        if (mine.some(e => e.type === 'token')) return music.play('gain');
        if (took?.action === 'discard') return music.play('gain');
        if (mine.length > 0) return music.play('place');
        const turn = fresh.findLast(e => e.type === 'turn');
        if (turn?.seat === me && previous.current !== me) return music.play('turn');
        if (previous.current !== me) music.play('notify');
    }

    // コインの増減を、都市の上に浮かべる
    playEvents(previous) {
        const v = this.view;
        const fresh = v.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = v.events.at(-1)?.seq ?? this.lastSeq;
        if (previous) this.playSound(fresh, previous);
        if (!previous || reduceMotion()) return;
        const sums = [0, 0];
        fresh.filter(e => e.type === 'coins').forEach(e => { sums[e.seat] += e.delta; });
        sums.forEach((delta, seat) => {
            if (!delta) return;
            const target = seat === v.you ? $('#city-0 .coin') : $('#city-1 .coin');
            if (!target) return;
            const r = target.getBoundingClientRect();
            const el = document.createElement('div');
            el.className = `float ${delta > 0 ? 'plus' : 'minus'}`;
            el.textContent = delta > 0 ? `+${delta}` : `−${-delta}`;
            el.style.left = `${r.left + r.width / 2}px`;
            el.style.top = `${r.top}px`;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), FLOAT_MS);
        });
    }

    // ---- 選ぶ ----

    promptKey() {
        const v = this.view;
        return `${v.phase}:${v.logCount}:${v.turn}`;
    }

    maybePrompt() {
        const v = this.view;
        const mine = v.actors.includes(v.you) && ['progress', 'library', 'destroy', 'revive', 'starter'].includes(v.phase);
        if (!mine) {
            if ($('#pick').open) $('#pick').close();
            return;
        }
        const key = this.promptKey();
        if (this.openedPrompt === key) return;
        this.openedPrompt = key;
        this.openPick();
    }

    reopenPrompt() {
        const v = this.view;
        if (!v || !v.actors.includes(v.you) || !['progress', 'library', 'destroy', 'revive', 'starter'].includes(v.phase)) return false;
        this.openPick();
        return true;
    }

    openPick() {
        const v = this.view;
        const me = v.you;
        const button = (command, html, cls = '') => `<button class="pick-item ${cls}" data-command='${escapeHtml(JSON.stringify(command))}'>${html}</button>`;
        const tokenItem = (t) => button({ type: 'progress', token: t }, `${tokenHtml(t)}<span><strong>${TOKENS[t].name}</strong><small>${TOKENS[t].text}</small></span>`);
        const cardItem = (type, k) => button({ type, card: k }, `<div class="mini-card">${cardHtml(k)}</div><span><strong>${CARDS[k].name}</strong><small>${cardText(k).join('・')}</small></span>`);
        let title = '';
        let items = '';
        switch (v.phase) {
            case 'progress':
                title = '科学の印がそろった。進歩トークンを1枚';
                items = v.tokensBoard.map(tokenItem).join('');
                break;
            case 'library':
                title = '大図書館：進歩トークンを1枚';
                items = (v.libraryDraw ?? []).map(tokenItem).join('');
                break;
            case 'destroy': {
                const opp = v.players[1 - me];
                title = `${opp.name}の${COLOR_NAMES[v.pending.color]}のカードを1枚捨てさせる`;
                items = opp.cards.filter(k => CARDS[k].color === v.pending.color).map(k => cardItem('destroy', k)).join('');
                break;
            }
            case 'revive':
                title = '霊廟：捨て札から1枚を無料で建てる';
                items = v.discard.map(k => cardItem('revive', k)).join('');
                break;
            case 'starter':
                title = `時代${ROMAN[v.age + 1]}の先手`;
                items = button({ type: 'starter', seat: me }, '<span><strong>あなたが先手</strong></span>', 'center')
                    + button({ type: 'starter', seat: 1 - me }, `<span><strong>${escapeHtml(v.players[1 - me].name)}が先手</strong></span>`, 'center');
                break;
            default:
                return;
        }
        $('#pick-title').textContent = title;
        $('#pick-list').innerHTML = items;
        if (!$('#pick').open) $('#pick').showModal();
    }

    // ---- カードの説明と使い方 ----

    openCard(slot) {
        const v = this.view;
        const s = v.structure[slot];
        if (!s?.faceUp || s.taken) return;
        this.detailSlot = slot;
        const key = s.key;
        const c = CARDS[key];
        const o = v.options?.cards[slot];
        const lines = cardText(key);
        if (c.free) {
            const from = Object.values(CARDS).find(x => x.chain === c.free);
            lines.push(`${from.name}があれば無料（連鎖）`);
        }
        if (c.chain) {
            const to = Object.values(CARDS).find(x => x.free === c.chain);
            if (to) lines.push(`持っていると、${to.name}が無料`);
        }
        $('#card-detail-body').innerHTML = `
            <h2 tabindex="-1" autofocus><span class="swatch c-${c.color}"></span>${c.name}</h2>
            <div class="detail-row"><div class="big-card">${cardHtml(key)}</div><ul class="detail-text">${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul></div>`;
        let buttons = '';
        if (o) {
            const priceText = o.chain ? '連鎖で無料' : o.price ? `${o.price}コイン` : '無料';
            buttons += `<button class="btn primary" data-action="build" ${o.canBuild ? '' : 'disabled'}>建てる（${priceText}）</button>`;
            buttons += `<button class="btn gold" data-action="discard">捨てて${v.options.discard}コイン</button>`;
            const wonders = Object.entries(v.options.wonders);
            if (wonders.length && v.wondersLeft > 0) {
                buttons += `<div class="wonder-choices">${wonders.map(([w, wo]) => `<button class="btn wonder-btn" data-action="wonder" data-wonder="${w}" ${wo.canBuild ? '' : 'disabled'}>
                    <span class="wb-name">${WONDERS[w].name}</span><span class="wb-cost">${costHtml(WONDERS[w].cost)}</span><span class="wb-price">${wo.price ? `${wo.price}コイン` : '無料'}</span></button>`).join('')}</div>`;
            }
        } else {
            buttons += '<button class="btn secondary" data-action="close">閉じる</button>';
        }
        $('#card-detail-buttons').innerHTML = buttons;
        this.markDetailHint();
        $('#card-detail').showModal();
    }

    openDraftWonder(key) {
        const v = this.view;
        const mine = v.draft?.picker === v.you;
        this.detailSlot = null;
        $('#card-detail-body').innerHTML = `
            <h2 tabindex="-1" autofocus>${WONDERS[key].name}</h2>
            <div class="detail-row"><div class="big-wonder">${wonderHtml(key)}</div><ul class="detail-text">${wonderText(key).map(l => `<li>${l}</li>`).join('')}</ul></div>`;
        $('#card-detail-buttons').innerHTML = mine
            ? `<button class="btn primary" data-action="pickWonder" data-wonder="${key}">これを選ぶ</button><button class="btn secondary" data-action="close">閉じる</button>`
            : '<button class="btn secondary" data-action="close">閉じる</button>';
        this.markDetailHint();
        $('#card-detail').showModal();
    }

    // 状態が変わったら、開いている説明を閉じる（取れなくなったカードで操作しないように）
    refreshOpenDialogs() {
        if ($('#card-detail').open) $('#card-detail').close();
        if ($('#city-detail').open) this.openCity(Number($('#city-detail').dataset.seat));
    }

    openCity(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        const s = p.score;
        $('#city-detail').dataset.seat = String(seat);
        $('#city-detail-name').textContent = p.name;
        const groups = COLORS.map(color => {
            const cards = p.cards.filter(k => CARDS[k].color === color);
            if (!cards.length) return '';
            return `<h3><span class="swatch c-${color}"></span>${COLOR_NAMES[color]}（${cards.length}）</h3><div class="card-grid">${cards.map(k => `<div class="mini-card">${cardHtml(k)}</div>`).join('')}</div>`;
        }).join('');
        $('#city-detail-body').innerHTML = `
            <p class="score-line">${coinHtml(p.coins)} ${vpHtml(s.total)}<small>青${s.blue}・緑${s.green}・黄${s.yellow}・紫${s.purple}・七不思議${s.wonders}・進歩${s.tokens}・軍事${s.military}・コイン${s.coins}</small></p>
            <h3>七不思議</h3>
            <div class="wonder-grid">${p.wonders.map(w => `<div class="wonder-cell">${wonderHtml(w.key, { built: w.built })}<small>${wonderText(w.key).join('・')}</small></div>`).join('')}</div>
            ${p.tokens.length ? `<h3>進歩トークン</h3><ul class="help-list">${p.tokens.map(t => `<li>${tokenHtml(t)}<span><strong>${TOKENS[t].name}</strong>　${TOKENS[t].text}</span></li>`).join('')}</ul>` : ''}
            ${groups || '<p class="note">まだカードはありません</p>'}`;
        if (!$('#city-detail').open) $('#city-detail').showModal();
    }

    openDiscard() {
        const v = this.view;
        $('#discard-list').innerHTML = v.discard.length ? v.discard.map(k => `<div class="mini-card">${cardHtml(k)}</div>`).join('') : '<p class="note">まだありません</p>';
        $('#discard-pile').showModal();
    }

    openLog() {
        const v = this.controller?.getView();
        if (!v) return;
        $('#log-list').innerHTML = v.logs.map(l => `<li>${escapeHtml(l)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    // ---- 終わり ----

    maybeResult() {
        const v = this.view;
        clearTimeout(this.resultTimer);
        if (v.phase !== 'end') return;
        this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
    }

    showResult() {
        const v = this.view;
        const me = v.you;
        const title = v.winner === null ? '引き分け' : v.winner === me ? 'あなたの勝ち' : `${v.players[v.winner].name}の勝ち`;
        const sub = { military: '軍事の勝利', science: '科学の勝利', civil: '点の勝利', draw: '点も青の点も同じ' }[v.victory];
        const order = [me, 1 - me];
        const rows = [['blue', '青'], ['green', '緑'], ['yellow', '黄'], ['purple', '紫'], ['wonders', '七不思議'], ['tokens', '進歩'], ['military', '軍事'], ['coins', 'コイン'], ['total', '合計']];
        $('#result-title').textContent = title;
        $('#result-sub').textContent = sub;
        $('#result-table').innerHTML = `<tr><th></th>${order.map(s => `<th>${escapeHtml(v.players[s].name)}</th>`).join('')}</tr>`
            + rows.map(([k, label]) => `<tr class="${k}"><td>${label}</td>${order.map(s => `<td>${v.players[s].score[k]}</td>`).join('')}</tr>`).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    // ---- ヒント ----

    // おすすめの手を、札・驚異に印を付けて知らせる（画面だけ。記録には入れない）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        this.render();
        const card = command.slot !== undefined ? `「${CARDS[this.view.structure[command.slot].key].name}」` : '';
        const text = {
            pickWonder: () => `驚異「${WONDERS[command.wonder].name}」を選ぶ`,
            build: () => `${card}を建てる`,
            discard: () => `${card}を捨ててコインにする`,
            wonder: () => `${card}で驚異「${WONDERS[command.wonder].name}」を建てる`,
            progress: () => `進歩トークン「${TOKENS[command.token].name}」を取る`,
            destroy: () => `相手の「${CARDS[command.card].name}」を壊す`,
            revive: () => `捨て札の「${CARDS[command.card].name}」を建てる`,
            starter: () => '自分が先手になる'
        }[command.type]?.() ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const selector = c.type === 'pickWonder' ? `[data-pick-wonder="${c.wonder}"]`
            : c.slot !== undefined ? `#structure [data-slot="${c.slot}"]`
            : c.token ? `#board-info [data-token="${c.token}"]` : null;
        if (selector) document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    // 開いた札の詳しい画面で、おすすめのボタンに印を付ける
    markDetailHint() {
        const c = this.hintCommand;
        if (!c || !['pickWonder', 'build', 'discard', 'wonder'].includes(c.type)) return;
        if (c.slot !== undefined && c.slot !== this.detailSlot) return;
        const wonder = c.wonder ? `[data-wonder="${c.wonder}"]` : '';
        document.querySelector(`#card-detail-buttons [data-action="${c.type}"]${wonder}`)?.classList.add('recommended');
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
