/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 上に相手、その下に遠征と山・捨て札、中央に港、下に自分の人物とコイン、操作のボタン
 */

import { CARDS, ROLES, ROLE_ORDER, SHIP_COLORS, SHIP_NAMES, WIN_POINTS } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, cardHtml, icon, coinHtml, vpHtml, roleText } from './art.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';

// 自分の操作の音（取るカードは、船ならコインを得る・人物なら払う）
const COMMAND_SOUND = { draw: 'draw', stop: 'select', repel: 'capture', keep: 'place', claim: 'gain', pass: 'select' };

const SETTINGS_KEY = 'port-royal.settings';
const CPU_NAMES = ['アンナ', 'ジャック', 'マリー', 'ルイ'];
const RESULT_DELAY_MS = 1000;
const FLOAT_MS = 1100;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5].includes(saved.count) ? saved.count : 3,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 3, level: 'easy' };
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
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）。足りない席は CPU
        this.online = new NetplayLobby({
            title: 'ポートロイヤル',
            game: 'port-royal',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 750,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.onControllerUpdate(),
            onError: (message) => this.onControllerError(message),
            onExit: () => {
                this.stopGame();
                this.showTitle();
            }
        });
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
        $('#online-button').hidden = !this.online.available;
        this.renderSetup();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => this.onControllerUpdate(),
                onError: (message) => this.onControllerError(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.beginGame(controller);
        controller.scheduleCpu();
    }

    onControllerUpdate() {
        this.render();
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
        document.querySelectorAll('.float').forEach(el => el.remove());
        this.controller = controller;
        this.view = null;
        this.shownResult = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
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
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        document.querySelectorAll('.float').forEach(el => el.remove());
    }

    bindStatic() {
        const segment = (id, key, parse) => $(id).addEventListener('click', (event) => {
            const button = event.target.closest('button[role=radio]');
            if (!button) return;
            this.settings[key] = parse(button.dataset[key]);
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'count', Number);
        segment('#cpu-level', 'level', String);
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#again').addEventListener('click', () => {
            if (this.controller?.isOnline) {
                $('#result').close();
                this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
                return;
            }
            this.newGame();
        });
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#status').addEventListener('click', () => this.openLog());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
            });
        });
        $('#buttons').addEventListener('click', (event) => {
            if (event.target.closest('#hint')) return this.showHint();
            const button = event.target.closest('button[data-command]');
            if (button && !button.disabled) this.send({ type: button.dataset.command });
        });
        // 港のカード：取れるなら取る（押すと説明が出て、そこで取る）
        $('#harbor').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.openCard(Number(card.dataset.card));
        });
        $('#table').addEventListener('click', (event) => {
            const card = event.target.closest('[data-card]');
            if (card) this.openCard(Number(card.dataset.card));
        });
        $('#opponents').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-seat]');
            if (chip) this.openPlayer(Number(chip.dataset.seat));
        });
        $('#me').addEventListener('click', () => this.openPlayer(this.view.you));
        $('#card-detail-buttons').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button || button.disabled) return;
            $('#card-detail').close();
            const card = Number(button.dataset.card);
            if (button.dataset.action === 'take') this.send({ type: 'take', card });
            if (button.dataset.action === 'claim') this.send({ type: 'claim', card });
        });
    }

    send(command) {
        this.sending = true;
        const ok = this.controller.send(command);
        this.sending = false;
        if (ok && this.view.phase !== 'end') {
            music.play(command.type === 'take' ? (CARDS[command.card].kind === 'ship' ? 'gain' : 'pay') : COMMAND_SOUND[command.type] ?? 'place');
        }
        return ok;
    }

    // 1回の更新に1つの音。自分の操作の音は send で鳴らす。CPU の手は知らせ、自分の番になったらチャイム
    playUpdateSound(previous) {
        const v = this.view;
        if (!previous) return;
        if (v.phase === 'end') {
            if (previous.phase !== 'end') music.play(!v.winners.includes(v.you) ? 'lose' : v.winners.length > 1 ? 'notify' : 'win');
            return;
        }
        if (this.sending) return;
        const mine = v.actors.includes(v.you);
        music.play(mine && !previous.actors.includes(v.you) ? 'turn' : 'notify');
    }

    renderSetup() {
        const mark = (id, key) => document.querySelectorAll(`${id} button`).forEach(b => b.setAttribute('aria-checked', String(String(this.settings[key]) === b.dataset[key])));
        mark('#player-count', 'count');
        mark('#cpu-level', 'level');
    }

    renderTitleArt() {
        const sample = ['ship:yellow', 'person:governor', 'ship:red', 'person:pirate', 'ship:blue'];
        const pick = (spec) => {
            const [kind, what] = spec.split(':');
            return CARDS.find(c => c.kind === kind && (c.color === what || c.role === what) && (c.kind !== 'ship' || c.swords !== null)).id;
        };
        $('#title-art').innerHTML = sample.map((spec, i) => `<div class="title-card" style="--i:${i - 2}">${cardHtml(pick(spec))}</div>`).join('');
    }

    renderHelp() {
        $('#help-persons').innerHTML = ROLE_ORDER.map(role => {
            const examples = CARDS.filter(c => c.role === role);
            const variants = [...new Set(examples.map(c => `${c.cost}コインで${c.vp}点`))].join('・');
            return `<li><span class="help-icon">${icon(`r-${role}`)}</span><span><strong>${ROLES[role].name}</strong>（${examples.length}枚：${variants}）<br>${roleText(role)}</span></li>`;
        }).join('');
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const previous = this.view;
        this.view = this.controller.getView();
        this.renderOpponents();
        this.renderTable();
        this.renderHarbor();
        this.renderMe();
        this.renderActions();
        this.playEvents(previous);
        this.playUpdateSound(previous);
        if ($('#card-detail').open) $('#card-detail').close();
        if ($('#player-detail').open) this.openPlayer(Number($('#player-detail').dataset.seat));
        this.maybeResult();
    }

    others() {
        const v = this.view;
        const n = v.players.length;
        return Array.from({ length: n - 1 }, (_, k) => (v.you + 1 + k) % n);
    }

    renderOpponents() {
        const v = this.view;
        $('#opponents').innerHTML = this.others().map(seat => {
            const p = v.players[seat];
            const active = v.actors.includes(seat);
            return `<button class="opp ${active ? 'active' : ''} ${v.current === seat ? 'turn' : ''}" data-seat="${seat}">
                <span class="oname">${escapeHtml(p.name)}</span>
                <span class="ostats">${coinHtml(p.coins)}${vpHtml(p.points)}<span class="sw">${icon('i-sword')}<b>${p.swords}</b></span></span>
            </button>`;
        }).join('');
    }

    renderTable() {
        const v = this.view;
        const exps = v.expeditions.map(id => {
            const claimable = v.claimable.includes(id);
            return `<button class="exp ${claimable ? 'glow' : ''}" data-card="${id}">${cardHtml(id, { small: true })}</button>`;
        }).join('');
        const top = v.discardTop !== null ? `<div class="pile discard" data-card="${v.discardTop}">${cardHtml(v.discardTop, { small: true })}<b>${v.discardCount}</b></div>` : '<div class="pile empty">捨て札</div>';
        $('#table').innerHTML = `<div class="pile deck"><span class="back">${icon('i-coin')}</span><b>${v.deckCount}</b></div>${top}<div class="exps">${exps}</div>`;
    }

    renderHarbor() {
        const v = this.view;
        const takable = new Set(v.takable);
        const colors = new Set(v.harbor.map(id => CARDS[id]).filter(c => c.kind === 'ship').map(c => c.color));
        const fresh = new Set(v.events.filter(e => e.seq > this.lastSeq && e.type === 'draw').map(e => e.card));
        const cards = v.harbor.map(id => `<button class="hcard ${takable.has(id) ? 'glow' : ''} ${fresh.has(id) && !reduceMotion() ? 'drop' : ''}" data-card="${id}">${cardHtml(id, { price: v.prices[id] ?? null })}</button>`).join('');
        const pending = v.pendingShip !== null ? `<div class="hcard pending ${fresh.has(v.pendingShip) ? 'drop' : ''}">${cardHtml(v.pendingShip)}</div>` : '';
        const dots = SHIP_COLORS.map(c => `<span class="cdot s-${c} ${colors.has(c) ? 'on' : ''}" title="${SHIP_NAMES[c]}"></span>`).join('');
        const risk = v.risk === null ? '' : `<span class="risk">失敗 ${Math.round(v.risk * 100)}%</span>`;
        $('#harbor').innerHTML = `<div class="harbor-head"><span class="colors">${dots}</span><span class="takes">${v.phase === 'trade' ? `残り${v.takesLeft}枚` : `取れる ${v.baseTakes}枚`}</span>${risk}</div>
            <div class="harbor-cards">${cards}${pending}${!cards && !pending ? '<p class="note">港は空です</p>' : ''}</div>`;
    }

    renderMe() {
        const v = this.view;
        const p = v.players[v.you];
        const counts = ROLE_ORDER.map(role => [role, p.display.filter(id => CARDS[id].role === role)]).filter(([, list]) => list.length);
        $('#me').classList.toggle('active', v.actors.includes(v.you));
        $('#me').innerHTML = `<div class="me-row"><span class="mname">あなた</span>${coinHtml(p.coins, 'big')}${vpHtml(p.points, 'big')}<span class="goal">/ ${WIN_POINTS}</span><span class="sw big">${icon('i-sword')}<b>${p.swords}</b></span>${p.expeditions.length ? `<span class="expn">遠征${p.expeditions.length}</span>` : ''}</div>
            <div class="me-row roles">${counts.map(([role, list]) => `<span class="role-chip" title="${ROLES[role].name}">${icon(`r-${role}`)}${role === 'trader' ? list.map(id => `<i class="s-${CARDS[id].color}"></i>`).join('') : ''}<b>${list.length}</b></span>`).join('') || '<span class="note">人物はまだいません</span>'}</div>`;
    }

    statusText() {
        const v = this.view;
        const name = (seat) => v.players[seat].name;
        if (v.phase === 'end') return '終わり';
        const actor = v.actors[0];
        const mine = actor === v.you;
        if (v.phase === 'discover') return mine ? (v.drawn ? 'めくるか、止めるか' : 'めくる') : `${name(actor)}がめくっています`;
        if (v.phase === 'repel') return mine ? '撃退できます' : `${name(actor)}が撃退を考えています`;
        if (mine) return v.current === v.you ? `港から取る（残り${v.takesLeft}枚）` : '1コインで1枚取れます';
        return `${name(actor)}が取っています`;
    }

    renderActions() {
        const v = this.view;
        const mine = v.actors.includes(v.you);
        const last = v.logs.at(-1) ?? '';
        $('#status').className = `status ${mine && v.phase !== 'end' ? 'mine' : ''}`;
        $('#status').innerHTML = `<strong>${escapeHtml(this.statusText())}</strong><span class="last">${escapeHtml(last)}</span>`;
        let buttons = '';
        if (mine && v.phase === 'discover') {
            buttons = `<button class="btn primary" data-command="draw">めくる</button><button class="btn secondary" data-command="stop" ${v.drawn ? '' : 'disabled'}>止める</button>`;
        } else if (mine && v.phase === 'repel') {
            buttons = '<button class="btn red" data-command="repel">撃退</button><button class="btn secondary" data-command="keep">港に置く</button>';
        } else if (mine && v.phase === 'trade') {
            buttons = `<button class="btn secondary wide" data-command="pass">${v.current === v.you ? '取り終える' : '取らない'}</button>`;
        }
        // ヒントのボタン（自分の番だけ）
        // ヒントはローカル対戦だけ
        if (mine && v.phase !== 'end' && !this.controller?.isOnline) buttons = `<button type="button" id="hint" class="icon-btn" aria-label="ヒント" title="おすすめの手"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg></button>${buttons}`;
        $('#buttons').innerHTML = buttons;
        this.renderHint();
    }

    hintKey() {
        const v = this.view;
        return `${v.phase}:${v.actors.join(',')}:${v.events.at(-1)?.seq ?? 0}`;
    }

    // おすすめの手を光らせる（ボタンか、取る港のカード・果たす遠征のカード）
    showHint() {
        const v = this.view;
        if (!v?.actors.includes(v.you)) return;
        const command = this.controller?.suggest();
        if (!command) return;
        this.hint = { at: this.hintKey(), command };
        music.play('select');
        this.renderHint();
    }

    renderHint() {
        const c = this.hint?.at === this.hintKey() ? this.hint.command : null;
        if (!c) {
            this.hint = null;
            return;
        }
        if (c.type === 'take') $(`#harbor [data-card="${c.card}"]`)?.classList.add('suggested');
        else if (c.type === 'claim') $(`#table [data-card="${c.card}"]`)?.classList.add('suggested');
        else $(`#buttons [data-command="${c.type}"]`)?.classList.add('suggested');
    }

    // コインの増減を浮かべる
    playEvents(previous) {
        const v = this.view;
        const fresh = v.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = v.events.at(-1)?.seq ?? this.lastSeq;
        if (!previous || reduceMotion()) return;
        const sums = v.players.map(() => 0);
        fresh.filter(e => e.type === 'coins').forEach(e => { sums[e.seat] += e.delta; });
        sums.forEach((delta, seat) => {
            if (!delta) return;
            const target = seat === v.you ? $('#me .coin') : $(`#opponents [data-seat="${seat}"] .coin`);
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
        if (fresh.some(e => e.type === 'bust')) this.toast('同じ色の船が来て、失敗');
    }

    // ---- ダイアログ ----

    openCard(id) {
        const v = this.view;
        const c = CARDS[id];
        const lines = [];
        if (c.kind === 'ship') {
            lines.push(`${c.coins}コイン`);
            lines.push(c.swords === null ? 'ドクロ：撃退できない' : `剣${c.swords}以上で撃退できる`);
        } else if (c.kind === 'person') {
            lines.push(roleText(c.role, c));
            lines.push(`雇う費用 ${c.cost}コイン・${c.vp}点`);
        } else if (c.kind === 'expedition') {
            lines.push(`条件：${c.needs.map(s => ROLES[{ cross: 'priest', anchor: 'captain', house: 'settler' }[s]].name).join('・')}を捨てる（何でも屋で代えられる）`);
            lines.push(`${c.vp}点と${c.coins}コイン`);
        } else {
            lines.push(c.bonus === 'swords' ? '12コイン以上の人は半分を捨てる。そのあと剣が最も多い人に1コイン' : '12コイン以上の人は半分を捨てる。そのあと点が最も少ない人に1コイン');
        }
        $('#card-detail-body').innerHTML = `<h2 tabindex="-1" autofocus>${escapeHtml(c.name)}</h2>
            <div class="detail-row"><div class="big-card">${cardHtml(id)}</div><ul class="detail-text">${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul></div>`;
        let buttons = '';
        if (v.takable.includes(id)) {
            const fee = v.current === v.you ? '' : '（手番の人に1コイン）';
            buttons += `<button class="btn primary" data-action="take" data-card="${id}">${c.kind === 'ship' ? `取って${v.income[id]}コイン${fee}` : `${v.prices[id]}コインで雇う${fee}`}</button>`;
        }
        if (v.claimable.includes(id)) buttons += `<button class="btn primary" data-action="claim" data-card="${id}">遠征を果たす</button>`;
        buttons += '<button class="btn secondary" data-close>閉じる</button>';
        $('#card-detail-buttons').innerHTML = buttons;
        $('#card-detail').showModal();
    }

    openPlayer(seat) {
        const v = this.view;
        const p = v.players[seat];
        $('#player-detail').dataset.seat = String(seat);
        $('#player-detail-name').textContent = p.name;
        $('#player-detail-body').innerHTML = `<p class="score-line">${coinHtml(p.coins)}${vpHtml(p.points)}<span class="sw">${icon('i-sword')}<b>${p.swords}</b></span></p>
            ${p.expeditions.length ? `<h3>遠征</h3><div class="card-grid">${p.expeditions.map(id => `<div class="mini">${cardHtml(id)}</div>`).join('')}</div>` : ''}
            <h3>人物</h3>${p.display.length ? `<div class="card-grid">${p.display.map(id => `<div class="mini">${cardHtml(id)}</div>`).join('')}</div>` : '<p class="note">まだいません</p>'}`;
        if (!$('#player-detail').open) $('#player-detail').showModal();
    }

    openLog() {
        const v = this.controller?.getView();
        if (!v) return;
        $('#log-list').innerHTML = v.logs.map(l => `<li>${escapeHtml(l)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    maybeResult() {
        const v = this.view;
        clearTimeout(this.resultTimer);
        if (v.phase !== 'end' || this.shownResult === v.logCount) return;
        this.resultTimer = setTimeout(() => {
            this.shownResult = v.logCount;
            this.showResult();
        }, RESULT_DELAY_MS);
    }

    showResult() {
        const v = this.view;
        const winners = v.winners;
        $('#result-title').textContent = winners.includes(v.you) ? (winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${winners.map(i => v.players[i].name).join('と')}の勝ち`;
        const order = v.players.map((_, i) => i).sort((a, b) => v.players[b].points - v.players[a].points || v.players[b].coins - v.players[a].coins);
        $('#result-table').innerHTML = '<tr><th></th><th>点</th><th>コイン</th><th>人物</th><th>遠征</th></tr>' + order.map(seat => {
            const p = v.players[seat];
            return `<tr class="${winners.includes(seat) ? 'win' : ''}"><td>${escapeHtml(p.name)}</td><td>${p.points}</td><td>${p.coins}</td><td>${p.display.length}</td><td>${p.expeditions.length}</td></tr>`;
        }).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
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
