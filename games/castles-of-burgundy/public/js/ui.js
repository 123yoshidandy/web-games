/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 対象（区域のタイル・公国のマス・商品）を押すと、使えるダイスのうち、労働者が一番少なくて済むものを使う
 * 先にダイスを押せば、そのダイスに決める。対象には、要る労働者の数を札で出す
 */

import { CELLS, TILES, KINDS, KIND_ORDER, BUILDINGS, BUILDING_ORDER, KNOWLEDGE, GOODS, PHASES, ROUNDS, REGION_POINTS, PHASE_BONUS, SELL_POINTS, COLOR_BONUS, STORAGE } from './data.js';
import { workersNeeded, placeProblem, knowledgeOf } from './rules.js';
import { tileName } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, icon, resIcon, artKey, tileTag, hexHtml, dieSvg, goodsHtml } from './art.js';

const SETTINGS_KEY = 'burgundy.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 1200;
const AUTO_END_MS = 700;
const FLOAT_MS = 1100;
const PENDING_TEXT = {
    castle: '城：好きな目で、もう1つ行動',
    ship: '船：商品を取る区域を選ぶ',
    warehouse: '倉庫：売る商品を選ぶ',
    cityHall: '市庁舎：保管場所のタイルをもう1枚置く（目は自由）',
    pick: '取るタイルを選ぶ（どの区域からでも）'
};
const PICK_TEXT = { building: '大工作業場：建物を1枚取る', mine: '教会：鉱山・知識・城を1枚取る', ship: '市場：船か家畜を1枚取る' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [2, 3, 4].includes(saved.count) ? saved.count : 2, level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy' };
    } catch {
        return { count: 2, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// タイルの説明
export function tileText(id) {
    const t = TILES[id];
    if (t.building) return `${BUILDINGS[t.building].name}：${BUILDINGS[t.building].text}`;
    if (t.knowledge) return `知識${t.knowledge}：${KNOWLEDGE[t.knowledge].text}`;
    if (t.animal) return `${tileName(id)}：置いたら、頭数の点。同じ牧草地の同じ家畜も、もう一度数える`;
    return {
        castle: '城：置いたらすぐ、好きな目でもう1つ行動',
        mine: '鉱山：フェーズの終わりごとに、銀貨1枚',
        ship: '船：置いたらすぐ、区域の商品をすべて取り、手番の順が1つ前へ'
    }[t.kind];
}

// 公国の盤（SVG）。targets：マス → 要る労働者の数
const R = 30;
const cellCenter = (c) => [Math.sqrt(3) * R * (c.q + c.r / 2), 1.5 * R * c.r];
const hexPoints = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

export function estateSvg(player, { targets = new Map() } = {}) {
    const w = Math.sqrt(3) * R;
    const minX = -3.5 * w;
    const minY = -3 * 1.5 * R - R;
    const width = 7 * w;
    const height = 6 * 1.5 * R + 2 * R;
    const cells = CELLS.map(c => {
        const [x, y] = cellCenter(c);
        const tile = player.estate[c.id];
        const color = KINDS[c.kind].hex;
        const target = targets.has(c.id);
        if (tile !== null) {
            const tag = tileTag(tile);
            return `<g class="cell filled"><polygon points="${hexPoints(x, y, R - 1)}" fill="${KINDS[TILES[tile].kind].hex}" stroke="#4a3a28" stroke-width="1.2"/>
                <use href="#t-${artKey(tile)}" x="${x - R * 0.78}" y="${y - R * 0.66}" width="${R * 1.56}" height="${R * 1.35}"/>
                ${tag ? `<circle cx="${x + R * 0.5}" cy="${y + R * 0.5}" r="8" fill="${TILES[tile].knowledge ? '#3a2a10' : '#fff'}"/><text x="${x + R * 0.5}" y="${y + R * 0.5 + 3.5}" class="${TILES[tile].knowledge ? 'tg k' : 'tg'}">${tag}</text>` : ''}</g>`;
        }
        const cost = targets.get(c.id);
        return `<g class="cell ${target ? 'target' : ''}" data-cell="${c.id}"><polygon points="${hexPoints(x, y, R - 1)}" fill="${color}" fill-opacity=".38" stroke="${target ? '#f5d47f' : color}" stroke-width="${target ? 3 : 1.4}"/>
            <text x="${x}" y="${y + 5}" class="pip">${c.die}</text>
            ${target && cost ? `<circle cx="${x + R * 0.5}" cy="${y - R * 0.45}" r="8" fill="#c8433a"/><text x="${x + R * 0.5}" y="${y - R * 0.45 + 3.5}" class="tg w">${cost}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="estate-svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}" preserveAspectRatio="xMidYMid meet">${cells}</svg>`;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.sel = { die: null, storage: null, buy: false };
        this.tab = 'board';
        this.resultTimer = null;
        this.autoTimer = null;
        this.choose = null;
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
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.sel = { die: null, storage: null, buy: false };
        this.tab = 'board';
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
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
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#choose').addEventListener('close', () => { this.choose = null; });
        $('#tabs').addEventListener('click', (event) => {
            const button = event.target.closest('[data-tab]');
            if (!button) return;
            this.tab = button.dataset.tab;
            this.render();
        });
        $('#players').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-player]');
            if (chip) this.showCity(Number(chip.dataset.player));
        });
        $('#board').addEventListener('click', (event) => this.onBoard(event));
        $('#estate').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-cell]');
            if (cell) this.onCell(Number(cell.dataset.cell));
        });
        $('#me').addEventListener('click', (event) => this.onMe(event));
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            this.onAction(button.dataset);
        });
        $('#choose-body').addEventListener('click', (event) => {
            const el = event.target.closest('[data-choice]');
            if (!el || !this.choose) return;
            const { resolve } = this.choose;
            const value = JSON.parse(el.dataset.choice);
            $('#choose').close();
            resolve(value);
        });
    }

    send(command) {
        const ok = this.controller?.send(command);
        if (ok) this.sel = { die: null, storage: null, buy: false };
        return ok;
    }

    // ---- 判定 ----

    // ヒント：CPU（ふつう）が選ぶ操作。使うダイスなどを選んだ状態にし、押すものに印を付ける
    showHint() {
        const command = this.myTurn() ? this.controller?.hint() : null;
        if (!command) return this.toast('自分の番になったら、おすすめを出せます');
        const view = this.view;
        this.sel = { die: Number.isInteger(command.die) ? command.die : null, storage: null, buy: command.type === 'buy' };
        if (command.type === 'place') this.sel.storage = command.tile;
        if (['take', 'buy', 'ship'].includes(command.type)) this.tab = 'board';
        if (command.type === 'place') this.tab = 'estate';
        this.hint = { key: view.events.at(-1)?.seq ?? 0, command };
        this.render();
        const area = (d) => (d < 0 ? '黒の倉庫' : `区域${d + 1}`);
        const text = {
            take: () => {
                const t = view.depots?.[command.depot]?.[command.slot]?.tile;
                return `ダイス${command.die + 1}で${area(command.depot)}の${t === null || t === undefined ? 'タイル' : tileName(t)}を取る`;
            },
            place: () => `倉庫の${tileName(command.tile)}を光るマスに置く`,
            sell: () => `${GOODS[command.goods].name}を売る`,
            ship: () => `${command.depots.map(area).join('と')}の商品を取る`,
            workers: () => '労働者をもらう',
            buy: () => `銀貨で${area(command.depot)}のタイルを買う`,
            skip: () => '使わない',
            end: () => '手番を終える'
        }[command.type]?.() ?? '光るところを押す';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const h = this.hint;
        if (!h || !this.myTurn() || h.key !== (this.view.events.at(-1)?.seq ?? 0)) return;
        const c = h.command;
        const mark = (selector) => document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
        if (c.type === 'take' || c.type === 'buy') mark(`[data-depot="${c.depot}"][data-slot="${c.slot}"]`);
        if (c.type === 'place') mark(`[data-cell="${c.cell}"]`);
        if (c.type === 'sell') mark(`[data-goods="${c.goods}"]`);
        if (c.type === 'ship') c.depots.forEach(d => mark(`.depot [data-depot-goods="${d}"]`));
        if (['workers', 'skip', 'end', 'buy'].includes(c.type)) mark(`#actions [data-act="${c.type}"]`);
    }

    myTurn() {
        const v = this.view;
        return !!v && !v.over && v.answering.includes(v.you);
    }

    me() {
        return this.view.players[this.view.you];
    }

    top() {
        return this.view.pending.at(-1) ?? null;
    }

    // その行動に使えるダイスと、要る労働者 [{ die, cost }]（安い順）
    dieOptions(type, target, kind) {
        if (!this.myTurn()) return [];
        const me = this.me();
        const top = this.top();
        if (top) {
            const allowed = { castle: ['take', 'place', 'sell', 'workers'], cityHall: ['place'], warehouse: ['sell'], pick: ['take'] }[top.kind] ?? [];
            return allowed.includes(type) ? [{ die: 'bonus', cost: 0 }] : [];
        }
        return [0, 1].filter(i => !me.used[i] && (this.sel.die === null || this.sel.die === i)).map(i => ({
            die: i, cost: type === 'workers' ? 0 : workersNeeded(me, me.dice[i], target, type, kind)
        })).filter(o => o.cost <= me.workers).sort((a, b) => a.cost - b.cost);
    }

    canBuy() {
        const v = this.view;
        const me = this.me();
        return this.myTurn() && !this.top() && !v.turn.bought && me.silver >= 2;
    }

    // ---- 操作 ----

    onBoard(event) {
        const v = this.view;
        if (!v) return;
        const goodsEl = event.target.closest('[data-depot-goods]');
        if (goodsEl && this.top()?.kind === 'ship') return this.chooseShip(Number(goodsEl.dataset.depotGoods));
        const tileEl = event.target.closest('[data-slot]');
        if (!tileEl) return;
        const depot = Number(tileEl.dataset.depot);
        const slot = Number(tileEl.dataset.slot);
        const tile = depot === -1 ? v.black[slot] : v.depots[depot][slot].tile;
        if (tile === null || tile === undefined) return;
        if (this.sel.buy) {
            if (depot !== -1 && !knowledgeOf(this.me()).has(6)) return this.toast(tileText(tile));
            return this.withDiscard(discard => this.send({ type: 'buy', depot, slot, ...discard }));
        }
        if (depot === -1) return this.toast(tileText(tile));
        const top = this.top();
        if (top?.kind === 'pick' && !top.kinds.includes(TILES[tile].kind)) return this.toast(tileText(tile));
        const options = this.dieOptions('take', depot + 1);
        if (!options.length) return this.toast(tileText(tile));
        this.withDiscard(discard => this.send({ type: 'take', die: options[0].die, depot, slot, ...discard }));
    }

    // 保管場所がいっぱいなら、捨てるタイルを選んでから送る
    withDiscard(done) {
        const me = this.me();
        if (me.storage.length < STORAGE) return done({});
        this.ask('捨てるタイルを選ぶ', me.storage.map((t, i) => ({ html: hexHtml(t, { cls: 'big' }), value: i })), (i) => done({ discard: i }));
    }

    chooseShip(depot) {
        const v = this.view;
        if (!knowledgeOf(this.me()).has(5)) return this.send({ type: 'ship', depots: [depot] });
        const prev = (depot + 5) % 6;
        const next = (depot + 1) % 6;
        const choices = [[depot], [depot, next], [prev, depot]].filter(list => list.some(d => v.depotGoods[d].length));
        this.ask('商品を取る区域', choices.map(list => ({ html: `<span class="ship-choice">${list.map(d => `区域${d + 1}`).join('と')}</span>`, value: list })), (list) => this.send({ type: 'ship', depots: list }));
    }

    onCell(cell) {
        if (!this.myTurn() || this.sel.storage === null) return;
        const tile = this.sel.storage;
        const me = this.me();
        const why = placeProblem(me, tile, cell);
        if (why) return this.toast(why);
        const options = this.dieOptions('place', CELLS[cell].die, TILES[tile].kind);
        if (!options.length) return this.toast('使えるダイスがありません');
        this.send({ type: 'place', die: options[0].die, tile, cell });
    }

    onMe(event) {
        const storageEl = event.target.closest('[data-storage]');
        if (storageEl) {
            const tile = Number(storageEl.dataset.storage);
            if (!this.myTurn()) return this.toast(tileText(tile));
            this.sel.storage = this.sel.storage === tile ? null : tile;
            this.sel.buy = false;
            if (this.sel.storage !== null) {
                this.tab = 'estate';
                this.toast(tileText(tile));
            }
            return this.render();
        }
        const goodsEl = event.target.closest('[data-goods]');
        if (goodsEl && this.myTurn()) {
            const goods = Number(goodsEl.dataset.goods);
            const options = this.dieOptions('sell', goods);
            if (!options.length) return this.toast(`${GOODS[goods].name}を売るには、${goods}の目が要ります`);
            this.send({ type: 'sell', die: options[0].die, goods });
        }
    }

    onAction({ act, die }) {
        if (die !== undefined) {
            const i = Number(die);
            this.sel.die = this.sel.die === i ? null : i;
            return this.render();
        }
        switch (act) {
            case 'workers': {
                const options = this.dieOptions('workers', 0);
                const me = this.me();
                const unused = [0, 1].filter(i => !me.used[i]);
                if (!this.top() && this.sel.die === null && unused.length > 1) return this.toast('使うダイスを選んでください');
                if (options.length) this.send({ type: 'workers', die: options[0].die });
                return;
            }
            case 'buy':
                this.sel.buy = !this.sel.buy;
                this.sel.storage = null;
                if (this.sel.buy) this.tab = 'board';
                return this.render();
            case 'skip': return this.send({ type: 'skip' });
            case 'end': return this.send({ type: 'end' });
        }
    }

    ask(title, choices, resolve) {
        this.choose = { resolve };
        $('#choose-title').textContent = title;
        $('#choose-body').innerHTML = choices.map(c => `<button class="choice" data-choice='${JSON.stringify(c.value)}'>${c.html}</button>`).join('');
        $('#choose').showModal();
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    renderTitleArt() {
        const pick = (pred) => TILES.find(pred).id;
        const ids = [pick(t => t.kind === 'castle'), pick(t => t.building === 'church'), pick(t => t.kind === 'ship'), pick(t => t.animal === 'sheep'), pick(t => t.kind === 'mine'), pick(t => t.knowledge === 7), pick(t => t.building === 'watchtower')];
        $('#title-art').innerHTML = ids.map((id, i) => `<div class="t-hex" style="--i:${i}">${hexHtml(id)}</div>`).join('');
    }

    renderHelp() {
        const buildings = BUILDING_ORDER.map(b => `<li><strong>${BUILDINGS[b].name}</strong><span>${BUILDINGS[b].text}</span></li>`).join('');
        const knowledge = Object.entries(KNOWLEDGE).map(([k, info]) => `<li><strong>${k}</strong><span>${info.text}</span></li>`).join('');
        const kinds = KIND_ORDER.map(k => `<span class="kind-chip" style="--c:${KINDS[k].hex}"></span>${KINDS[k].name}`).join('　');
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>ダイスを使って中央の盤からタイルを取り、自分の公国に置いて点を集めます。5フェーズ（A〜E）×5ラウンドで終わり、点の多い人の勝ちです。</p>
            <h3>公国</h3>
            <p>37マスの六角形。色は6種類：${kinds}。マスの数（1〜6）は、置くときに要るダイスの目です。最初は中央に城が1つあります。</p>
            <h3>手番</h3>
            <p>ダイス2つで、行動を2回。</p>
            <ul class="help-list">
                <li><strong>取る</strong><span>目と同じ番号の区域から、タイルを1枚取って保管場所（3マス）へ。いっぱいなら1枚捨てる</span></li>
                <li><strong>置く</strong><span>保管場所のタイルを、色が同じで、目と同じ数のマスに置く。置いたタイルのとなりだけ。同じ都市（建物の地域）に同じ建物は置けない</span></li>
                <li><strong>売る</strong><span>目と同じ色の商品をすべて売る。1枚につき${SELL_POINTS[2]}〜${SELL_POINTS[4]}点（2〜4人）と、銀貨1枚</span></li>
                <li><strong>労働者</strong><span>目に関係なく、労働者を2つ得る</span></li>
            </ul>
            <p>労働者1つで、ダイスの目を1つ上げ下げできます（6と1はつながる）。手番に1回、銀貨2枚で黒の区域からタイルを買えます。</p>
            <h3>タイル</h3>
            <ul class="help-list">
                <li><strong>城</strong><span>好きな目で、もう1つ行動</span></li>
                <li><strong>鉱山</strong><span>フェーズの終わりごとに銀貨1枚</span></li>
                <li><strong>船</strong><span>区域を1つ選んで商品をすべて取り（3種類まで）、手番の順が1つ前へ</span></li>
                <li><strong>家畜</strong><span>頭数の点。同じ牧草地の同じ家畜も、もう一度数える</span></li>
                <li><strong>知識</strong><span>下の26種の効果</span></li>
                <li><strong>建物</strong><span>下の8種の効果（置いたときに1回）</span></li>
            </ul>
            <h3>点</h3>
            <p>地域を埋めると、大きさの点（1マス${REGION_POINTS[1]}・2マス${REGION_POINTS[2]}・3マス${REGION_POINTS[3]}・4マス${REGION_POINTS[4]}・5マス${REGION_POINTS[5]}・6マス${REGION_POINTS[6]}…）と、フェーズの点（A${PHASE_BONUS[0]}・B${PHASE_BONUS[1]}・C${PHASE_BONUS[2]}・D${PHASE_BONUS[3]}・E${PHASE_BONUS[4]}）。ある色のマスをすべて埋めると、1番目と2番目の人にボーナス（2人${COLOR_BONUS[2].join('・')}、3人${COLOR_BONUS[3].join('・')}、4人${COLOR_BONUS[4].join('・')}）。</p>
            <p>終わりに、残った商品・銀貨1つにつき1点、労働者2つにつき1点、知識の点。同点なら、空いたマスの多い人、次に手番の順の後ろの人が上です。</p>
            <h3>建物</h3>
            <ul class="help-list">${buildings}</ul>
            <h3>知識</h3>
            <ul class="help-list k">${knowledge}</ul>
            <h3>ヒント</h3>
            <p>上の電球のボタンを押すと、おすすめの操作（使うダイスと、取るタイル・置くマスなど）を選んで光らせます。</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const prev = this.view;
        const view = this.controller.getView();
        this.view = view;
        const me = this.me();
        if (!this.myTurn()) this.sel = { die: null, storage: null, buy: false };
        if (this.sel.storage !== null && !me.storage.includes(this.sel.storage)) this.sel.storage = null;
        if (this.sel.die !== null && me.used[this.sel.die]) this.sel.die = null;
        if (this.sel.buy && !this.canBuy()) this.sel.buy = false;
        const top = this.myTurn() ? this.top() : null;
        if (top && (top.kind === 'ship' || top.kind === 'pick') && (!prev || prev.pending.length < view.pending.length)) this.tab = 'board';
        if (top?.kind === 'cityHall' && this.sel.storage === null && me.storage.length === 1) this.sel.storage = me.storage[0];
        this.renderStatus(view);
        this.renderPlayers(view);
        this.renderTabs();
        this.renderBanner(view);
        if (this.tab === 'board') this.renderBoard(view);
        else this.renderEstate(view);
        this.renderMe(view);
        this.renderActions(view);
        this.markHint();
        this.playEvents(view, prev);
        this.scheduleAutoEnd(view);
        if ($('#log').open) this.renderLog();
        if (view.over && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    renderStatus(view) {
        const round = Math.min(view.round + 1, ROUNDS);
        $('#status').innerHTML = `<span class="phase">${PHASES[view.phase]}</span><span>ラウンド ${round}/${ROUNDS}</span><span class="white">${dieSvg(view.white, 'white-die')}</span>`;
    }

    renderPlayers(view) {
        $('#players').dataset.count = String(view.players.length);
        $('#players').innerHTML = view.nextOrder.map((seat, i) => {
            const p = view.players[seat];
            const cls = [view.turn?.seat === seat && !view.over ? 'current' : '', seat === view.you ? 'mine' : ''].join(' ');
            return `<button class="pchip ${cls}" data-player="${seat}"><span class="order">${i + 1}</span><span class="pname">${escapeHtml(p.name)}</span><span class="vp" data-vp="${seat}">${p.vp}</span></button>`;
        }).join('');
    }

    renderTabs() {
        document.querySelectorAll('#tabs [data-tab]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tab === this.tab)));
        $('#board').hidden = this.tab !== 'board';
        $('#estate').hidden = this.tab !== 'estate';
    }

    renderBanner(view) {
        const el = $('#banner');
        let text = '';
        if (view.over) text = '';
        else if (!this.myTurn()) text = `${escapeHtml(view.players[view.turn.seat].name)}の手番`;
        else {
            const top = this.top();
            if (top) text = top.kind === 'pick' ? PICK_TEXT[top.kinds[0]] : PENDING_TEXT[top.kind];
            else if (this.sel.buy) text = '買うタイルを選ぶ（銀貨2枚）';
            else if (this.sel.storage !== null) text = '置くマスを選ぶ';
        }
        el.innerHTML = text;
    }

    renderBoard(view) {
        const me = this.me();
        const top = this.myTurn() ? this.top() : null;
        const k = knowledgeOf(me);
        const shipping = top?.kind === 'ship';
        const depots = view.depots.map((slots, d) => {
            const options = this.myTurn() && !this.sel.buy ? this.dieOptions('take', d + 1) : [];
            const tiles = slots.map((s, slot) => {
                if (s.tile === null) return `<div class="hex slot" style="--c:${KINDS[s.kind].hex}"></div>`;
                let target = false;
                let badge = '';
                if (this.sel.buy) target = k.has(6);
                else if (options.length && (!top || top.kind !== 'pick' || top.kinds.includes(TILES[s.tile].kind)) && top?.kind !== 'ship') {
                    target = true;
                    badge = options[0].cost ? String(options[0].cost) : '';
                }
                return hexHtml(s.tile, { cls: target ? 'target' : '', attrs: `data-depot="${d}" data-slot="${slot}"`, badge });
            }).join('');
            const goods = view.depotGoods[d];
            return `<div class="depot ${shipping && goods.length ? 'ship-target' : ''}" ${shipping && goods.length ? `data-depot-goods="${d}"` : ''}>
                <div class="dep-head">${dieSvg(d + 1, 'dep-die')}<span class="dep-goods" data-depot-goods="${d}">${goods.map(g => `<span class="g-sq" style="--g:${GOODS[g].hex}"></span>`).join('')}</span></div>
                <div class="dep-tiles n${slots.length}">${tiles}</div></div>`;
        }).join('');
        const black = view.black.map((t, slot) => (t === null ? '<div class="hex slot black-slot"></div>' : hexHtml(t, { cls: this.sel.buy ? 'target' : '', attrs: `data-depot="-1" data-slot="${slot}"` }))).join('');
        const goodsLeft = view.roundGoods.map(g => `<span class="g-sq" style="--g:${GOODS[g].hex}"></span>`).join('');
        $('#board').innerHTML = `<div class="depots">${depots}</div>
            <div class="black-depot"><div class="bd-head"><span>黒の区域</span><span class="rg">${goodsLeft ? `次の商品 ${goodsLeft}` : ''}</span></div><div class="bd-tiles">${black}</div></div>`;
    }

    renderEstate(view) {
        const me = this.me();
        const targets = new Map();
        if (this.myTurn() && this.sel.storage !== null) {
            const tile = this.sel.storage;
            CELLS.forEach(c => {
                if (placeProblem(me, tile, c.id)) return;
                const options = this.dieOptions('place', c.die, TILES[tile].kind);
                if (options.length) targets.set(c.id, options[0].cost);
            });
        }
        $('#estate').innerHTML = estateSvg(me, { targets });
    }

    renderMe(view) {
        const me = this.me();
        const storage = Array.from({ length: STORAGE }, (_, i) => {
            const t = me.storage[i];
            return t === undefined ? '<div class="hex slot store-slot"></div>' : hexHtml(t, { cls: this.sel.storage === t ? 'selected' : '', attrs: `data-storage="${t}"` });
        }).join('');
        const goods = Object.keys(me.goods).map(Number).filter(g => me.goods[g] > 0).map(g => {
            const options = this.dieOptions('sell', g);
            const sellable = options.length > 0;
            return goodsHtml(g, me.goods[g], { cls: sellable ? 'target' : '', attrs: `data-goods="${g}"${sellable && options[0].cost ? ` data-cost="${options[0].cost}"` : ''}` });
        }).join('');
        $('#me').innerHTML = `<div class="storage">${storage}</div>
            <div class="my-goods">${goods || '<span class="empty">商品なし</span>'}</div>
            <div class="res"><span title="銀貨">${resIcon('silver')}<b data-silver="${me.id}">${me.silver}</b></span><span title="労働者">${resIcon('worker')}<b>${me.workers}</b></span></div>`;
    }

    renderActions(view) {
        if (view.over) {
            $('#actions').innerHTML = '';
            return;
        }
        const me = this.me();
        const mine = this.myTurn();
        const dice = [0, 1].map(i => `<button class="die-btn ${me.used[i] ? 'used' : ''} ${this.sel.die === i ? 'selected' : ''}" data-die="${i}" ${mine && !me.used[i] && !this.top() ? '' : 'disabled'}>${dieSvg(me.dice[i])}</button>`).join('');
        let buttons = '';
        if (mine) {
            const top = this.top();
            if (top) {
                if (top.kind === 'castle') buttons += '<button class="act" data-act="workers">労働者</button>';
                buttons += '<button class="act end" data-act="skip">使わない</button>';
            } else {
                const unused = me.used.filter(u => !u).length;
                if (unused) buttons += '<button class="act" data-act="workers">労働者</button>';
                if (this.canBuy()) buttons += `<button class="act buy ${this.sel.buy ? 'on' : ''}" data-act="buy">買う</button>`;
                if (!unused) buttons += '<button class="act end" data-act="end">終える</button>';
            }
        }
        $('#actions').innerHTML = `<div class="dice">${dice}</div><div class="act-row">${buttons}</div>`;
    }

    // ダイスを使い切り、買い物もできなければ、少し待って自動で終える
    scheduleAutoEnd(view) {
        clearTimeout(this.autoTimer);
        if (!this.myTurn() || this.top() || !this.me().used.every(Boolean) || this.canBuy()) return;
        this.autoTimer = setTimeout(() => {
            const now = this.controller?.getView();
            if (now && now.answering.includes(now.you) && !now.pending.length && now.players[now.you].used.every(Boolean)) this.send({ type: 'end' });
        }, AUTO_END_MS);
    }

    // ---- 公国・記録・終わり ----

    showCity(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        $('#city-title').textContent = seat === v.you ? 'あなたの公国' : `${p.name}の公国`;
        const goods = Object.keys(p.goods).map(Number).filter(g => p.goods[g] > 0).map(g => goodsHtml(g, p.goods[g])).join('');
        const knowledge = p.estate.filter(t => t !== null && TILES[t].knowledge).map(t => `<li><strong>${TILES[t].knowledge}</strong>${KNOWLEDGE[TILES[t].knowledge].text}</li>`).join('');
        $('#city-body').innerHTML = `<div class="city-head"><span>${p.vp}点</span><span>${resIcon('silver')}${p.silver}</span><span>${resIcon('worker')}${p.workers}</span>${goods}</div>
            ${estateSvg(p)}
            <div class="city-store">${p.storage.map(t => hexHtml(t)).join('') || '<span class="empty">保管場所は空</span>'}</div>
            ${knowledge ? `<ul class="help-list k">${knowledge}</ul>` : ''}`;
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
        if (!v || !v.over) return;
        $('#result-title').textContent = v.winner === v.you ? 'あなたの勝ち' : `${v.players[v.winner].name}の勝ち`;
        $('#result-list').innerHTML = v.ranking.map((seat, i) => {
            const s = v.finalScores[seat];
            const parts = [`盤 ${s.before}`, s.goods ? `商品 ${s.goods}` : '', s.silver ? `銀貨 ${s.silver}` : '', s.workers ? `労働者 ${s.workers}` : '', s.knowledge ? `知識 ${s.knowledge}` : ''].filter(Boolean).join('・');
            return `<li><span class="rank-no">${i + 1}</span><span class="name">${escapeHtml(v.players[seat].name)}<small>${parts}・空き${s.empty}</small></span><span class="total">${s.total}点</span></li>`;
        }).join('');
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        const vp = new Map();
        fresh.forEach(e => {
            if (e.type === 'vp') vp.set(e.seat, (vp.get(e.seat) ?? 0) + e.amount);
            if (e.type === 'phase') this.toast(`フェーズ ${PHASES[e.phase]}`);
        });
        vp.forEach((amount, seat) => this.floatText(`[data-vp="${seat}"]`, amount));
    }

    floatText(selector, amount) {
        const target = $(selector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'float plus';
        el.textContent = `+${amount}`;
        el.style.left = `${rect.left + rect.width / 2}px`;
        el.style.top = `${rect.top + rect.height}px`;
        $('#fx').appendChild(el);
        setTimeout(() => el.remove(), reduceMotion() ? 600 : FLOAT_MS);
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }
}
