/**
 * 画面（タイトル・ゲーム・持ち物・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 道は横に長いので、全員がいる区間（宿場から次の宿場まで。だれも宿場を追い越さないので、全員が必ず1つの区間にいる）だけを
 * 5列×3段の折り返しで描く。道の全体は、上の細い帯に示す
 */

import {
    BOARD, EDO, INN_NAMES, INN_POSITIONS, nextInn, segmentStart, SPACE_TYPES, PANORAMAS, PANORAMA_KINDS, TRAVELERS,
    ACHIEVEMENTS, COLORS, NEUTRAL_COLOR
} from './data.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { souvenirCost, mealCost, mealPriceTotal } from './scoring.js';
import { music } from './music.js';
import {
    symbolsSvg, icon, SPACE_COLORS, spaceBadge, souvenirCard, mealCard, encounterCard, panoramaCard, springCard, travelerCard, titleArtSvg
} from './art.js';

const SETTINGS_KEY = 'tokaido.settings';
const CPU_NAMES = ['オハル', 'ゲンタ', 'オミツ', 'ヘイジ'];
const RESULT_DELAY_MS = 900;
const COLS = 5;
const STEP_X = 78;
const STEP_Y = 72;
const PAD_X = 44;
const PAD_Y = 38;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

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

const tokenColor = (token) => (token.player === null ? NEUTRAL_COLOR : COLORS[token.player]);
const spaceName = (pos) => (BOARD[pos].type === 'inn' ? INN_NAMES[BOARD[pos].inn] : SPACE_TYPES[BOARD[pos].type].name);

// 区間のマスの位置（折り返し）
function nodePoint(k) {
    const row = Math.floor(k / COLS);
    const col = row % 2 === 0 ? k % COLS : COLS - 1 - (k % COLS);
    return { x: PAD_X + col * STEP_X, y: PAD_Y + row * STEP_Y };
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.sel = null;            // 選んでいるもの（マス・札・旅人）
        this.selKey = null;         // 選ぶ場面が変わったら、選択を消す
        this.segment = null;        // 描いている区間の始まり
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtSvg();
        this.bindStatic();
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
        this.sel = null;
        this.segment = null;
        this.hintCommand = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は鳴らさない
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

        $('#board').addEventListener('click', (event) => {
            const node = event.target.closest('[data-pos]');
            if (node) this.tapSpace(Number(node.dataset.pos));
        });
        $('#players').addEventListener('click', (event) => {
            const row = event.target.closest('[data-seat]');
            if (row) this.showDetail(Number(row.dataset.seat));
        });
        $('#panel').addEventListener('click', (event) => {
            const pick = event.target.closest('[data-pick]');
            if (pick && !pick.classList.contains('disabled')) {
                this.tapPick(pick.dataset.pick);
                return;
            }
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act, button.dataset.value);
        });
    }

    // ---- 操作 ----

    tapSpace(pos) {
        const v = this.view;
        if (!v?.moves.includes(pos)) return;
        // 同じマスを2回押したら進む
        if (this.sel === pos) {
            this.send({ type: 'move', to: pos });
            return;
        }
        this.sel = pos;
        music.play('select');
        this.render();
    }

    tapPick(value) {
        const pending = this.view?.pending;
        if (pending?.kind === 'buy') {
            const list = Array.isArray(this.sel) ? this.sel : [];
            this.sel = list.includes(value) ? list.filter(c => c !== value) : [...list, value];
        } else {
            this.sel = this.sel === value ? null : value;
        }
        music.play(this.sel === value || (Array.isArray(this.sel) && this.sel.includes(value)) ? 'select' : 'cancel');
        this.render();
    }

    act(action, value) {
        const v = this.view;
        switch (action) {
            case 'choose': return this.send({ type: 'choose', traveler: this.sel });
            case 'move': return this.send({ type: 'move', to: this.sel });
            case 'buy': return this.send({ type: 'buy', cards: Array.isArray(this.sel) ? this.sel : [] });
            case 'skip-buy': return this.send({ type: 'buy', cards: [] });
            case 'donate': return this.send({ type: 'donate', amount: Number(value) });
            case 'encounter': return this.send({ type: 'encounter', card: this.sel });
            case 'panorama': return this.send({ type: 'panorama', kind: this.sel });
            case 'meal': return this.send({ type: 'meal', card: this.sel });
            case 'skip-meal': return this.send({ type: 'meal', card: null });
            case 'result': return this.showResult();
            default: return v;
        }
    }

    send(command) {
        if (!this.controller) return;
        this.sel = null;
        this.hintCommand = null;
        this.sending = true;
        let ok = false;
        try {
            ok = this.controller.send(command);
        } finally {
            this.sending = false;
        }
        if (ok) this.playSent(command);
    }

    // ---- 効果音 ----

    freshEvents() {
        const events = this.controller.getView().events;
        const fresh = events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = events.at(-1)?.seq ?? this.lastSeq;
        return fresh;
    }

    endSound(fresh) {
        const end = fresh.find(e => e.type === 'end');
        if (end) music.play(end.winners.includes(this.view.you) ? 'win' : 'lose');
        return !!end;
    }

    // 自分が送った操作の音（1つの操作に1つ）
    playSent(command) {
        if (this.endSound(this.freshEvents())) return;
        const sound = {
            choose: 'select', move: 'place', donate: 'pay', encounter: 'gain', panorama: 'gain',
            buy: command.cards?.length ? 'pay' : 'cancel', meal: command.card ? 'pay' : 'cancel'
        }[command.type];
        if (sound) music.play(sound);
    }

    // ほかの人が動いたときの音。自分が操作する番になったら turn、終わりは勝ち負け（CPU の手ごとには鳴らさない）
    playUpdate(prev) {
        const fresh = this.freshEvents();
        if (fresh.length) this.hintCommand = null;
        if (this.endSound(fresh)) return;
        const view = this.view;
        if (view.actors.includes(view.you) && !prev.actors.includes(prev.you)) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        // 選ぶものは選んだ状態にする（決めるボタンで決められる）
        const sel = { choose: command.traveler, move: command.to, buy: command.cards, encounter: command.card, panorama: command.kind, meal: command.card }[command.type];
        if (sel !== undefined && sel !== null && !(Array.isArray(sel) && sel.length === 0)) this.sel = sel;
        this.render();
        const text = {
            choose: '選んだ旅人にする', move: '光っているマスへ進む', buy: command.cards?.length ? '選んだ土産を買う' : '買わない',
            donate: `${command.amount}文寄付する`, encounter: '選んだ出会い', panorama: '選んだ景色', meal: command.card ? '選んだ食事を買う' : '食べない'
        }[command.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    // おすすめの手のボタンに印を付ける
    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        let selector = `[data-act="${c.type}"]`;
        if (c.type === 'buy' && !c.cards.length) selector = '[data-act="skip-buy"]';
        if (c.type === 'meal' && !c.card) selector = '[data-act="skip-meal"]';
        if (c.type === 'donate') selector = `[data-act="donate"][data-value="${c.amount}"]`;
        document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderHelp() {
        const spaces = ['village', 'farm', 'temple', 'encounter', 'spring', 'paddy', 'mountain', 'sea'];
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>京都から江戸まで東海道を旅し、景色・土産・食事・温泉・出会いで旅の思い出（点）を集めます。江戸に着いたとき、点の多い人の勝ち。</p>
            <h3>旅の進め方</h3>
            <p>道のいちばん後ろにいる旅人が、先の空いたマスへ好きなだけ進みます（光るマスを2回押す）。進んだあともいちばん後ろなら、続けて進みます。先へ急ぐほど、止まれるマスは減ります。</p>
            <p>宿場は追い越せず、全員がそろうまで待ちます。宿場では最後に着いた人から出発します。2マス（小さな丸の付いたマス）は、4・5人のときだけ2人目が止まれます（2人目は後ろ）。</p>
            <h3>マス</h3>
            <ul class="help-spaces">${spaces.map(t => `<li>${spaceBadge(t)}<div><strong>${SPACE_TYPES[t].name}</strong><br>${SPACE_TYPES[t].text}</div></li>`).join('')}</ul>
            <p>土産は種類（小物・食べ物・着物・美術）の違うもので組を作り、組の1枚目1点・2枚目3点・3枚目5点・4枚目7点。景色は1枚目から順に取り、点は札の番号。完成させた景色には、もう止まれません。最初に完成させた人は3点。</p>
            <p>出会い：職人（土産1枚）・案内人（景色1枚）・侍（3点）・公家（3文）・巫女（場の1文を寺に寄付して1点）。</p>
            <h3>宿場</h3>
            <p>最初に着いた人が、旅人の数＋1枚の食事の札を引きます。着いた順に1つずつ買えます（1〜3文、どれも6点）。同じ料理は旅の間に2度食べられません。</p>
            <h3>旅の終わり</h3>
            <p>寺の寄付の多い順に10・7・4点、ほかに寄付した人は2点（同じ額は同じ点）。食通（食事の札の値段の合計）・収集家（土産の数）・湯治客（温泉の数）・話し好き（出会いの数）が最も多い人に3点（同点は全員）。点が同じなら、称号の多い人の勝ち。</p>
            <h3>2人のとき</h3>
            <p>灰色の中立の旅人が加わります。中立の旅人がいちばん後ろなら、先頭の人が動かします。中立の旅人は寺で場の1文を寄付し（寄付の順位に入る）、宿場では食事の札を1枚ランダムに捨てます。</p>
            <h3>旅人</h3>
            <div class="help-travelers">${Object.keys(TRAVELERS).map(id => travelerCard(id, { cls: 'small' })).join('')}</div>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        if (prev && !this.sending) this.playUpdate(prev);
        // 選ぶ場面が変わったら、選択を消す
        const key = `${view.phase}:${view.logCount}:${view.pending?.kind ?? ''}:${view.actors.join(',')}`;
        if (key !== this.selKey) {
            this.selKey = key;
            if (!(view.phase === 'choose' && this.sel && view.players[view.you].offers?.includes(this.sel) && !view.players[view.you].chosen)) this.sel = null;
        }
        this.renderStage(view);
        this.renderRoute(view);
        this.renderBoard(view);
        this.renderPlayers(view);
        this.renderPanel(view);
        this.markHint();
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.resultShown = true;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
        if (view.phase !== 'end') this.resultShown = false;
    }

    currentSegment(view) {
        const min = Math.min(...view.tokens.map(t => t.pos));
        const start = segmentStart(min);
        return start === EDO ? INN_POSITIONS.at(-2) : start;
    }

    renderStage(view) {
        const s = this.currentSegment(view);
        $('#stage').textContent = view.phase === 'choose' ? '旅人を選ぶ' : `${INN_NAMES[BOARD[s].inn]} → ${INN_NAMES[BOARD[nextInn(s)].inn]}`;
    }

    // 道の全体（細い帯）
    renderRoute(view) {
        const w = 10;
        const s = this.currentSegment(view);
        const e = nextInn(s);
        const dots = BOARD.map((space, i) => (space.type === 'inn'
            ? `<rect x="${i * w + 2}" y="6" width="6" height="6" fill="${SPACE_COLORS.inn}"/>`
            : `<circle cx="${i * w + 5}" cy="9" r="2" fill="${SPACE_COLORS[space.type]}"/>`)).join('');
        const tokens = view.tokens.map((t, i) => `<circle cx="${t.pos * w + 5}" cy="${3 + (i % 2) * 0}" r="2.6" fill="${tokenColor(t)}"/>`).join('');
        $('#route').setAttribute('viewBox', `0 0 ${BOARD.length * w} 14`);
        $('#route').setAttribute('preserveAspectRatio', 'none');
        $('#route').innerHTML = `<rect x="${s * w}" y="0" width="${(e - s + 1) * w}" height="14" rx="3" fill="#a8774c" opacity="0.16"/>${dots}${tokens}`;
    }

    renderBoard(view) {
        const start = this.currentSegment(view);
        const end = nextInn(start);
        const count = end - start + 1;
        const rows = Math.ceil(count / COLS);
        const width = PAD_X * 2 + STEP_X * (COLS - 1);
        const height = PAD_Y * 2 + STEP_Y * (rows - 1) + 8;
        const moves = new Set(view.moves);
        const neutralTurn = view.moves.length && view.tokens[view.mover]?.player === null;
        const points = Array.from({ length: count }, (_, k) => nodePoint(k));
        const road = `<path class="road" d="M${points.map(p => `${p.x} ${p.y}`).join(' L')}"/>
            <path class="road-line" d="M${points.map(p => `${p.x} ${p.y}`).join(' L')}"/>`;
        const nodes = points.map((p, k) => {
            const pos = start + k;
            const space = BOARD[pos];
            const color = SPACE_COLORS[space.type];
            const cls = `node${moves.has(pos) ? ' can' : ''}${this.sel === pos ? ' sel' : ''}${neutralTurn && moves.has(pos) ? ' neutral' : ''}`;
            if (space.type === 'inn') {
                return `<g class="${cls}" data-pos="${pos}" transform="translate(${p.x} ${p.y})">
                    <rect class="hit" x="-30" y="-26" width="60" height="52" rx="10"/>
                    ${moves.has(pos) ? '<rect class="ring" x="-31" y="-27" width="62" height="54" rx="12"/>' : ''}
                    <rect x="-26" y="-22" width="52" height="44" rx="8" fill="${color}"/>
                    <use href="#i-inn" x="-10" y="-19" width="20" height="20" class="glyph"/>
                    <text x="0" y="15" class="inn-label">${INN_NAMES[space.inn]}</text>
                </g>`;
            }
            const double = space.double ? `<circle class="slot2 ${view.capacity[pos] > 1 ? '' : 'off'}" cx="18" cy="-18" r="8.5"/>` : '';
            return `<g class="${cls}" data-pos="${pos}" transform="translate(${p.x} ${p.y})">
                <circle class="hit" r="30"/>
                ${moves.has(pos) ? '<circle class="ring" r="27"/>' : ''}
                ${double}
                <circle r="21" fill="${color}"/>
                <use href="#i-${space.type}" x="-12" y="-12" width="24" height="24" class="glyph"/>
            </g>`;
        }).join('');
        const svg = $('#board svg');
        const rebuild = !svg || this.segment !== start;
        if (rebuild) {
            $('#board').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="道">
                <g class="nodes"></g><g class="tokens"></g></svg>`;
            this.segment = start;
        }
        $('#board .nodes').innerHTML = road + nodes;
        this.renderTokens(view, start, rebuild);
    }

    // こまの位置。宿場では着いた順に横へ並べ、2マスの2人目は小さな丸に置く
    tokenPoint(view, index, start) {
        const t = view.tokens[index];
        const p = nodePoint(t.pos - start);
        const here = view.tokens.map((u, i) => ({ u, i })).filter(({ u }) => u.pos === t.pos).sort((a, b) => a.u.seq - b.u.seq);
        const order = here.findIndex(h => h.i === index);
        if (BOARD[t.pos].type === 'inn') {
            const n = here.length;
            return { x: p.x + (order - (n - 1) / 2) * 13, y: p.y + 31 };
        }
        if (order === 1) return { x: p.x + 18, y: p.y - 18 };
        return { x: p.x, y: p.y + 19 };
    }

    renderTokens(view, start, instant) {
        const layer = $('#board .tokens');
        view.tokens.forEach((t, i) => {
            let el = layer.querySelector(`[data-token="${i}"]`);
            if (!el) {
                el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                el.setAttribute('data-token', String(i));
                el.classList.add('token');
                el.innerHTML = `<circle r="8" fill="${tokenColor(t)}"/>${t.player === view.you ? '<circle r="3" class="you-dot"/>' : ''}`;
                layer.appendChild(el);
                instant = true;
            }
            const p = this.tokenPoint(view, i, start);
            el.classList.toggle('instant', instant);
            el.classList.toggle('mover', view.mover === i && view.phase === 'travel');
            el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        });
    }

    // 旅人ごとの小さな枠（名前・旅人・点・お金・景色の進み）。押すと持ち物を開く
    renderPlayers(view) {
        const list = $('#players');
        list.dataset.n = String(view.players.length);
        list.innerHTML = view.players.map(p => {
            const t = p.traveler ? TRAVELERS[p.traveler] : null;
            const actor = view.actors.includes(p.id) && view.phase !== 'end';
            const pan = PANORAMA_KINDS.map(k => `<span class="pan" style="--c:${SPACE_COLORS[k]}">${PANORAMAS[k].name}${p.panoramas[k]}</span>`).join('');
            return `<div class="pcell${actor ? ' actor' : ''}${p.id === view.you ? ' you' : ''}" data-seat="${p.id}" style="--pc:${COLORS[p.id]}">
                <div class="pname"><span class="dot"></span>${escapeHtml(p.name)}</div>
                <div class="ptrav">${t ? t.name : (p.chosen ? '選んだ' : '選んでいる')}</div>
                <div class="pnums"><span class="pscore">${p.score}<small>点</small></span><span class="pcoins">${p.coins}<small>文</small></span></div>
                <div class="pmini">${pan}</div>
            </div>`;
        }).join('') + (view.neutral ? `<div class="pcell neutral" style="--pc:${NEUTRAL_COLOR}">
                <div class="pname"><span class="dot"></span>中立</div><div class="ptrav">旅人</div>
                <div class="pnums"><span class="pmini-inline">${icon('temple')}${view.tokens.find(t => t.player === null).donations}</span></div></div>` : '');
    }

    renderPanel(view) {
        const me = view.players[view.you];
        const panel = $('#panel');
        // 旅人を選ぶ間だけ、欄を高くする（盤はまだ動かない）
        panel.classList.toggle('tall', view.phase === 'choose');
        if (view.phase === 'end') {
            panel.innerHTML = `<div class="actions"><button class="btn primary" data-act="result">結果</button></div>`;
            return;
        }
        if (view.phase === 'choose') {
            if (me.chosen) {
                panel.innerHTML = `<div class="choice-row one">${travelerCard(me.traveler, { color: COLORS[view.you] })}</div>`;
                return;
            }
            panel.innerHTML = `<div class="choice-row">${me.offers.map(id => travelerCard(id, { cls: `pickable${this.sel === id ? ' selected' : ''}`, attrs: `data-pick="${id}"` })).join('')}</div>
                <div class="actions"><button class="btn primary" data-act="choose" ${this.sel ? '' : 'disabled'}>この旅人で旅立つ</button></div>`;
            return;
        }
        const pending = view.pending;
        if (pending && pending.seat === view.you) {
            panel.innerHTML = this.pendingHtml(view, me, pending);
            return;
        }
        if (view.moves.length) {
            const neutral = view.tokens[view.mover].player === null;
            if (this.sel !== null && view.moves.includes(this.sel)) {
                const space = BOARD[this.sel];
                const text = space.type === 'inn' ? '食事の札を見て、1つ買える（全員がそろうまで待つ）' : SPACE_TYPES[space.type].text;
                panel.innerHTML = `<div class="space-info">${spaceBadge(space.type)}<div><strong>${neutral ? '中立の旅人を' : ''}${spaceName(this.sel)}へ</strong><br><span class="muted">${neutral ? '寺なら場の1文を寄付、宿場なら食事の札を1枚捨てる' : text}</span></div></div>
                    <div class="actions"><button class="btn primary" data-act="move">進む</button></div>`;
            } else {
                panel.innerHTML = `${neutral ? '<p class="hint">中立の旅人を動かす</p>' : ''}${travelerCard(me.traveler, { cls: 'mine', color: COLORS[view.you] })}`;
            }
            return;
        }
        // ほかの人の番
        const last = view.logs.at(-1) ?? '';
        panel.innerHTML = `${travelerCard(me.traveler, { cls: 'mine', color: COLORS[view.you] })}<p class="last-log">${escapeHtml(last)}</p>`;
    }

    pendingHtml(view, me, pending) {
        switch (pending.kind) {
            case 'buy': {
                const picked = Array.isArray(this.sel) ? this.sel : [];
                const { pay, need } = souvenirCost(me.traveler, picked);
                const ok = need <= me.coins;
                return `<div class="cards-row">${pending.cards.map(c => souvenirCard(c, { cls: `pickable${picked.includes(c) ? ' selected' : ''}`, attrs: `data-pick="${c}"` })).join('')}</div>
                    <div class="actions"><button class="btn secondary" data-act="skip-buy">買わない</button>
                    <button class="btn primary" data-act="buy" ${picked.length && ok ? '' : 'disabled'}>${picked.length ? `${pay}文で買う` : '買う'}</button></div>`;
            }
            case 'donate':
                return `<div class="space-info">${spaceBadge('temple')}<div><strong>寺に寄付</strong><br><span class="muted">1文につき1点${me.traveler === 'hirotada' ? '（場の1文を足す）' : ''}</span></div></div>
                    <div class="actions">${[1, 2, 3].map(n => `<button class="btn primary" data-act="donate" data-value="${n}" ${n <= pending.max ? '' : 'disabled'}>${n}文</button>`).join('')}</div>`;
            case 'encounter':
                return `<div class="cards-row">${pending.cards.map(c => encounterCard(c, { cls: `pickable wide${this.sel === c ? ' selected' : ''}`, attrs: `data-pick="${c}"` })).join('')}</div>
                    <div class="actions"><button class="btn primary" data-act="encounter" ${this.sel ? '' : 'disabled'}>この人に会う</button></div>`;
            case 'panorama':
                return `<div class="cards-row">${pending.options.map(k => panoramaCard(k, me.panoramas[k] + 1, { cls: `pickable${this.sel === k ? ' selected' : ''}`, attrs: `data-pick="${k}"` })).join('')}</div>
                    <div class="actions"><button class="btn primary" data-act="panorama" ${this.sel ? '' : 'disabled'}>この景色</button></div>`;
            case 'meal': {
                const meals = view.inn?.meals ?? pending.options;
                return `<div class="cards-row">${meals.map(c => {
                    const allowed = pending.options.includes(c);
                    const free = c === pending.offer;
                    return mealCard(c, { cls: `${allowed ? 'pickable' : 'disabled'}${this.sel === c ? ' selected' : ''}${free ? ' free' : ''}`, attrs: allowed ? `data-pick="${c}"` : '', price: free ? 0 : mealCost(me.traveler, c), free });
                }).join('')}</div>
                    <div class="actions"><button class="btn secondary" data-act="skip-meal">食べない</button>
                    <button class="btn primary" data-act="meal" ${this.sel ? '' : 'disabled'}>食べる</button></div>`;
            }
            default:
                return '';
        }
    }

    // ---- 持ち物 ----

    showDetail(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        const t = p.traveler ? TRAVELERS[p.traveler] : null;
        $('#detail-title').textContent = `${p.name}${t ? `（${t.role}・${t.name}）` : ''}`;
        const section = (title, body) => `<h3>${title}</h3><div class="cards-wrap">${body || '<span class="muted">なし</span>'}</div>`;
        const pans = PANORAMA_KINDS.filter(k => p.panoramas[k]).map(k => panoramaCard(k, `${p.panoramas[k]}/${PANORAMAS[k].size}`)).join('');
        $('#detail-body').innerHTML = `
            ${p.traveler ? travelerCard(p.traveler, { color: COLORS[seat] }) : ''}
            <p class="detail-stats">${icon('coin')}${p.coins}文　${p.score}点　寺に${p.donations}文${p.achievements.length ? `　称号：${p.achievements.map(a => ACHIEVEMENTS[a].name).join('・')}` : ''}</p>
            ${section('景色', pans)}
            ${section(`土産（${p.points.souvenir}点）`, p.souvenirs.map(c => souvenirCard(c)).join(''))}
            ${section(`食事（${mealPriceTotal(p.meals)}文分）`, p.meals.map(c => mealCard(c)).join(''))}
            ${section('温泉', p.springs.map(c => springCard(c)).join(''))}
            ${section('出会い', p.encounters.map(c => encounterCard(c)).join(''))}`;
        $('#detail').showModal();
    }

    // ---- 終わり ----

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const names = v.winners.map(id => v.players[id].name);
        $('#result-title').textContent = v.winners.includes(v.you)
            ? (v.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち')
            : `${names.join('と')}の勝ち`;
        const cols = [['panorama', '景色'], ['souvenir', '土産'], ['meal', '食事'], ['spring', '温泉'], ['encounter', '出会'], ['temple', '寺'], ['achievement', '称号']];
        const ranked = [...v.players].sort((a, b) => (b.score - a.score) || (b.achievements.length - a.achievements.length));
        $('#result-table').innerHTML = `<table><thead><tr><th></th>${cols.map(([, h]) => `<th>${h}</th>`).join('')}<th>計</th></tr></thead><tbody>
            ${ranked.map(p => `<tr class="${p.id === v.you ? 'you' : ''} ${v.winners.includes(p.id) ? 'win' : ''}"><th><span class="dot" style="--pc:${COLORS[p.id]}"></span>${escapeHtml(p.name)}</th>
                ${cols.map(([k]) => `<td>${p.points[k] || ''}</td>`).join('')}<td class="total">${p.score}</td></tr>`).join('')}
        </tbody></table>
        <p class="awards">${Object.entries(v.result.awards).map(([id, seats]) => `${ACHIEVEMENTS[id].name}：${seats.length ? seats.map(s => escapeHtml(v.players[s].name)).join('・') : 'なし'}`).join('　')}</p>`;
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

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

