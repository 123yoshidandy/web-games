/**
 * 画面（タイトル・ゲーム・ダイアログ）
 * 画面はビューだけを見て描く。操作はコントローラーの send() に渡す
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import {
    SIZE, ROUNDS, MAX_SPECIALS, TILES, SPECIALS, index, placementError, legalPlacements, canPlaceAnywhere
} from './tiles.js';
import { tileSvg, boardSvg, LINE_ICONS } from './art.js';
import { HELP_HTML } from './help.js';

const SETTINGS_KEY = 'railroad-ink.settings';
const CPU_NAMES = ['ジョー', 'ハンク', 'ケイト', 'ビリー', 'モリー'];

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 3,
            level: s.level === 'easy' ? 'easy' : 'normal'
        };
    } catch {
        return { count: 3, level: 'normal' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 得点の内訳（短い表記）
export function scoreParts(s) {
    return [['出口', s.network], ['道', s.road], ['線路', s.rail], ['中央', s.center]]
        .map(([k, v]) => `<span class="sp">${k}<b>${v}</b></span>`).join('')
        + `<span class="sp minus">減点<b>${s.errors > 0 ? '−' : ''}${s.errors}</b></span>`;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.sel = { source: null, o: 0, cell: null };   // 選んだダイス・向き・マス
        this.round = 0;
        this.resultShown = false;
        $('home').innerHTML = LINE_ICONS.home;
        $('open-help-game').innerHTML = LINE_ICONS.help;
        $('hint').innerHTML = LINE_ICONS.hint;
        $('open-others').innerHTML = LINE_ICONS.people;
        $('rotate').innerHTML = LINE_ICONS.rotate;
        $('flip').innerHTML = LINE_ICONS.flip;
        $('undo').innerHTML = LINE_ICONS.undo;
        $('help-body').innerHTML = HELP_HTML;
        $('title-art').innerHTML = this.titleArt();
        this.bindTitle();
        this.bindGame();
        document.addEventListener('contextmenu', event => event.preventDefault());
    }

    // タイトルの絵：出口どうしを道と線路でつないだ小さな盤
    titleArt() {
        const cells = Array(SIZE * SIZE).fill(null);
        const put = (x, y, kind, o) => { cells[index(x, y)] = { kind, o }; };
        for (let y = 0; y < SIZE; y++) put(1, y, y === 3 ? 'road-t' : 'road-straight', y === 3 ? 3 : 0);
        put(2, 3, 'road-straight', 1);
        put(3, 3, 's1', 1);
        for (let x = 4; x < SIZE; x++) put(x, 3, 'rail-straight', 1);
        for (let y = 0; y < 3; y++) put(3, y, 'road-straight', 0);
        put(3, 0, 'station-straight', 0);
        for (let y = 5; y < SIZE; y++) put(5, y, 'road-straight', 0);
        put(5, 4, 'station-curve', 6);
        return boardSvg(cells, { small: true });
    }

    // ---- タイトル ----

    bindTitle() {
        $('count-down').addEventListener('click', () => this.changeCount(-1));
        $('count-up').addEventListener('click', () => this.changeCount(1));
        $('level').addEventListener('click', event => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderTitle();
        });
        $('start').addEventListener('click', () => this.start());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startWith(saved);
        });
        $('open-help-title').addEventListener('click', () => this.openDialog('help'));
    }

    changeCount(delta) {
        this.settings.count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, this.settings.count + delta));
        saveSettings(this.settings);
        this.renderTitle();
    }

    renderTitle() {
        $('count-value').textContent = this.settings.count === 1 ? '1人' : `${this.settings.count}人`;
        $('count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('count-up').disabled = this.settings.count >= MAX_PLAYERS;
        $('level').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === this.settings.level));
        $('level').closest('.setup-row').classList.toggle('off', this.settings.count === 1);
        $('resume').hidden = !loadSavedGame();
    }

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('screen-game').hidden = true;
        this.renderTitle();
        $('screen-title').hidden = false;
    }

    start() {
        clearSavedGame();
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, this.settings.count - 1).map(name => ({ name, isCPU: true }))];
        this.startWith({ players, options: { level: this.settings.level } });
    }

    startWith(setup) {
        this.controller?.stop();
        this.sel = { source: null, o: 0, cell: null };
        this.round = 0;
        this.resultShown = false;
        this.controller = new LocalGameController(setup, {
            onUpdate: () => this.render(),
            onError: (message) => this.toast(message)
        });
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    // ---- ゲーム ----

    bindGame() {
        $('home').addEventListener('click', () => this.showTitle());
        $('open-help-game').addEventListener('click', () => this.openDialog('help'));
        $('open-others').addEventListener('click', () => this.showOthers());
        $('hint').addEventListener('click', () => this.showHint());
        $('tray').addEventListener('click', event => {
            const b = event.target.closest('[data-source]');
            if (b && !b.disabled) this.selectSource(b.dataset.source);
        });
        $('specials').addEventListener('click', event => {
            const b = event.target.closest('[data-source]');
            if (!b) return;
            if (b.classList.contains('locked')) return this.toast(b.dataset.reason);
            this.selectSource(b.dataset.source);
        });
        $('board').addEventListener('click', event => {
            const cell = event.target.closest('[data-cell]');
            if (cell) this.tapCell(Number(cell.dataset.cell));
        });
        $('rotate').addEventListener('click', () => this.turn(o => (o % 4 + 1) % 4 + (o >= 4 ? 4 : 0)));
        $('flip').addEventListener('click', () => this.turn(o => (o + 4) % 8));
        $('undo').addEventListener('click', () => {
            this.sel.cell = null;
            this.send({ type: 'undo' });
        });
        $('place').addEventListener('click', () => this.place());
        $('end').addEventListener('click', () => {
            this.sel = { source: null, o: 0, cell: null };
            this.send({ type: 'end' });
        });
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('.close').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => {
                if (event.target === dialog && dialog.id !== 'result') dialog.close();
            });
        });
        $('again').addEventListener('click', () => {
            $('result').close();
            this.start();
        });
        $('result-home').addEventListener('click', () => this.showTitle());
    }

    openDialog(id) {
        const dialog = $(id);
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.help-body, .others-list')?.scrollTo?.(0, 0);
    }

    me() {
        return this.view.players[this.view.you];
    }

    // 選んだもの（ダイス・特別なタイル）の形の名前
    kindOf(source) {
        if (!source) return null;
        return source.startsWith('d') ? this.view.dice[Number(source[1])] : source;
    }

    selectSource(source) {
        if (!this.view.actors.includes(this.view.you)) return;
        if (this.sel.source === source) {
            this.sel = { source: null, o: 0, cell: null };
        } else {
            this.sel = { source, o: 0, cell: this.sel.cell };
            this.fitOrientation();
        }
        this.render();
    }

    tapCell(i) {
        if (!this.view.actors.includes(this.view.you)) return;
        if (!this.sel.source) return this.toast('先に、上のダイスを選んでください');
        if (this.sel.cell === i && this.previewOk()) return this.place();
        this.sel.cell = i;
        this.fitOrientation();
        this.render();
    }

    // 今の向きで描けなければ、そのマスで描ける向きに合わせる
    fitOrientation() {
        const { source, cell } = this.sel;
        if (!source || cell === null) return;
        const kind = this.kindOf(source);
        const cells = this.me().cells;
        const x = cell % SIZE;
        const y = Math.floor(cell / SIZE);
        if (!placementError(cells, kind, x, y, this.sel.o)) return;
        for (let k = 1; k < 8; k++) {
            const o = (this.sel.o + k) % 8;
            if (!placementError(cells, kind, x, y, o)) {
                this.sel.o = o;
                return;
            }
        }
    }

    turn(next) {
        if (!this.sel.source) return;
        this.sel.o = next(this.sel.o);
        this.render();
    }

    previewOk() {
        const { source, cell, o } = this.sel;
        if (!source || cell === null) return false;
        return !placementError(this.me().cells, this.kindOf(source), cell % SIZE, Math.floor(cell / SIZE), o);
    }

    place() {
        const { source, cell, o } = this.sel;
        if (!source || cell === null) return;
        const ok = this.send({ type: 'place', source, x: cell % SIZE, y: Math.floor(cell / SIZE), o });
        if (ok) {
            // 次のダイス（まだ描いていない、描けるもの）を選んでおく
            const me = this.me();
            const next = [0, 1, 2, 3].map(i => `d${i}`).find(s => !me.placed.some(p => p.source === s) && canPlaceAnywhere(me.cells, this.kindOf(s)));
            this.sel = { source: next ?? null, o: 0, cell: null };
            this.render();
        }
    }

    // ヒント：おすすめの手を、選んだ状態（ダイス・マス・向き）にして見せる。決めるのは人（記録には入れない）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまは描く番ではありません');
        if (command.type === 'end') {
            this.sel = { source: null, o: 0, cell: null };
            this.hintEnd = true;
            this.render();
            return this.toast('おすすめ：このラウンドは終える（次へ）');
        }
        this.sel = { source: command.source, o: command.o, cell: command.y * SIZE + command.x };
        this.hintEnd = false;
        this.render();
        this.toast('おすすめ：この形をここに描く');
    }

    send(command) {
        if (!this.controller) return false;
        this.hintEnd = false;
        return this.controller.send(command);
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        if (view.round !== this.round) {
            // 新しいラウンド：最初のダイスを選んでおく
            this.round = view.round;
            this.sel = { source: 'd0', o: 0, cell: null };
        }
        const me = this.me();
        const mine = view.actors.includes(view.you);
        if (this.sel.source && !this.sourceUsable(this.sel.source)) this.sel = { source: null, o: 0, cell: null };
        if (!mine) this.sel = { source: null, o: 0, cell: null };

        $('round').innerHTML = view.phase === 'end' ? '終了' : `ラウンド <b>${view.round}</b>/${ROUNDS}`;
        const others = view.players.filter(p => p.id !== view.you);
        $('others').textContent = others.length === 0 ? '' : view.phase === 'end' ? '' : `描き終えた人 ${others.filter(p => p.done).length}/${others.length}`;
        $('open-others').hidden = others.length === 0;

        this.renderTray(view, me, mine);
        this.renderBoard(view, me);
        const s = me.score;
        $('score').innerHTML = `${scoreParts(s)}<span class="sp total">見込み<b>${s.total}</b>点</span>`;
        this.renderActions(view, me, mine);

        if (view.phase === 'end' && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 600);
        }
    }

    sourceUsable(source) {
        const me = this.me();
        if (source.startsWith('d')) return !me.placed.some(p => p.source === source);
        return !this.specialLock(source);
    }

    // 特別なタイルを使えない理由（使えるなら null）
    specialLock(source) {
        const me = this.me();
        if (me.specialsUsed.includes(source)) return 'その特別なタイルはもう使いました';
        if (me.specialsUsed.length >= MAX_SPECIALS) return '特別なタイルは3つまでです';
        if (me.placed.some(p => SPECIALS.includes(p.source))) return '特別なタイルは1ラウンドに1つまでです';
        return null;
    }

    renderTray(view, me, mine) {
        $('tray').innerHTML = view.dice.map((kind, i) => {
            const source = `d${i}`;
            const used = me.placed.some(p => p.source === source);
            const stuck = !used && !canPlaceAnywhere(me.cells, kind);
            const classes = ['die'];
            if (used) classes.push('used');
            if (stuck) classes.push('stuck');
            if (this.sel.source === source) classes.push('selected');
            return `<button class="${classes.join(' ')}" data-source="${source}" ${used || stuck || !mine ? 'disabled' : ''} aria-label="${TILES[kind].name}${used ? '（描いた）' : stuck ? '（描ける場所がない）' : ''}" title="${TILES[kind].name}">${tileSvg(kind)}</button>`;
        }).join('');
        const left = MAX_SPECIALS - me.specialsUsed.length;
        $('specials').innerHTML = `<span class="sp-label">特別<b>${left}</b></span>` + SPECIALS.map(s => {
            const used = me.specialsUsed.includes(s);
            const lock = this.specialLock(s);
            const classes = ['special'];
            if (used) classes.push('used');
            else if (lock || !mine) classes.push('locked');
            if (this.sel.source === s) classes.push('selected');
            return `<button class="${classes.join(' ')}" data-source="${s}" data-reason="${escapeHtml(lock ?? '')}" aria-label="${TILES[s].name}" title="${TILES[s].name}">${tileSvg(s)}</button>`;
        }).join('');
    }

    renderBoard(view, me) {
        const { source, cell, o } = this.sel;
        const kind = this.kindOf(source);
        let legal = null;
        if (kind) legal = new Set(legalPlacements(me.cells, kind).map(p => index(p.x, p.y)));
        let preview = null;
        if (kind && cell !== null) {
            preview = { x: cell % SIZE, y: Math.floor(cell / SIZE), kind, o, ok: this.previewOk() };
            if (me.cells[cell]) preview.kind = null;
        }
        const fresh = new Set(me.placed.map(p => p.cell));
        $('board').innerHTML = boardSvg(me.cells, { legal, preview, fresh });
        this.legalCount = legal?.size ?? 0;
    }

    renderActions(view, me, mine) {
        const { source, cell } = this.sel;
        const kind = this.kindOf(source);
        const pending = [0, 1, 2, 3].filter(i => !me.placed.some(p => p.source === `d${i}`) && canPlaceAnywhere(me.cells, view.dice[i]));
        let prompt = '';
        let bad = false;
        if (view.phase === 'end') prompt = 'ゲーム終了';
        else if (!mine) prompt = 'ほかの人が描き終えるのを待っています';
        else if (!kind) prompt = pending.length > 0 ? `あと${pending.length}つ。上のダイスを選んでください` : '描き終えました。「次へ」でラウンドを終えます';
        else if (this.legalCount === 0) {
            prompt = 'この形は、描ける場所がありません';
            bad = true;
        } else if (cell === null) prompt = `${TILES[kind].name}：緑のマスを押してください`;
        else {
            const error = me.cells[cell] ? 'もう描いてあるマスです' : placementError(me.cells, kind, cell % SIZE, Math.floor(cell / SIZE), this.sel.o);
            if (error) {
                prompt = error;
                bad = true;
            } else prompt = '「描く」か、同じマスをもう一度押して描きます';
        }
        $('prompt').textContent = prompt;
        $('prompt').classList.toggle('bad', bad);
        $('rotate').disabled = !mine || !kind;
        $('flip').disabled = !mine || !kind;
        $('undo').disabled = !mine || me.placed.length === 0;
        $('place').disabled = !mine || !this.previewOk();
        $('end').disabled = !mine || pending.length > 0;
        $('end').textContent = view.round >= ROUNDS ? '終える' : '次へ';
        $('end').classList.toggle('recommended', Boolean(this.hintEnd) && mine);
    }

    showOthers() {
        const view = this.controller.getView();
        $('others-list').innerHTML = view.players.map(p => `<div class="other${p.id === view.you ? ' self' : ''}">
            <div class="other-head"><b>${escapeHtml(p.name)}</b>${view.phase !== 'end' && p.done && p.id !== view.you ? '<i class="done-mark" title="描き終えた">済</i>' : ''}<span>${p.score.total}点</span></div>
            ${boardSvg(p.cells, { small: true })}
            <div class="other-score">${scoreParts(p.score)}</div></div>`).join('');
        this.openDialog('others-dialog');
    }

    showResult() {
        const view = this.controller?.getView();
        if (!view || view.phase !== 'end') return;
        const won = view.winners.includes(view.you);
        const solo = view.players.length === 1;
        $('result-title').textContent = solo ? `${view.players[0].score.total}点` : won ? 'あなたの勝ち！' : 'あなたの負け';
        $('result-board').innerHTML = boardSvg(this.me().cells, { small: true });
        const ranked = [...view.players].sort((a, b) => b.score.total - a.score.total || a.score.errors - b.score.errors);
        $('result-table').innerHTML = ranked.map(p => `<tr class="${view.winners.includes(p.id) && !solo ? 'win' : ''}${p.id === view.you ? ' self' : ''}">
            <td class="name">${escapeHtml(p.name)}</td><td class="total">${p.score.total}</td><td class="parts">${scoreParts(p.score)}</td></tr>`).join('');
        this.openDialog('result');
    }

    toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }
}
