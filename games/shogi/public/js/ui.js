/**
 * 画面（タイトル・対局・成りの確認・投了・終わり・棋譜・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 自分の駒を押すと、動ける升に点が付く。点の升を押すと指す。成れるときは「成る／成らない」を聞く（行き所がなくなるなら聞かずに成る）
 * - 持ち駒を押すと、打てる升に点が付く
 * - 直前の手の升を色で示す。王手のときは玉の升を赤くする
 * - 自分の側を盤の下に描く（CPU 戦で後手を選ぶと、盤を回して描く）。2人で遊ぶときは先手が下
 */

import { SIZE, SENTE, GOTE, HAND_TYPES, PROMOTE, sideOf, typeOf } from './rules.js';
import { SIDE_MARK, SIDE_NAME, KAN, PIECE_NAME, squareName } from './notation.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { symbolsSvg, pieceHtml } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'shogi.settings';
const RESULT_DELAY_MS = 900;
const REASON_TEXT = { checkmate: '詰み', resign: '投了', repetition: '千日手', 'perpetual-check': '連続王手の千日手' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    const defaults = { mode: 'cpu', level: 'normal', side: 0 };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            mode: ['cpu', 'two'].includes(saved.mode) ? saved.mode : defaults.mode,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : defaults.level,
            side: [0, 1].includes(saved.side) ? saved.side : defaults.side
        };
    } catch {
        return defaults;
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
        this.selected = null;   // { from: 升 } か { drop: 駒の種類 }
        this.pending = null;    // 成るかどうかを聞いている手 { from, to }
        this.placed = null;     // 置いたばかりの升（動きを付ける）
        this.lastSeq = 0;
        this.resultTimer = null;
        this.resultShown = false;
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
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.selected = null;
        this.pending = null;
        this.resultShown = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { mode, level, side } = this.settings;
        const players = mode === 'two'
            ? [{ name: '先手', isCPU: false }, { name: '後手', isCPU: false }]
            : [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true, cpuLevel: level }];
        if (mode === 'cpu' && side === 1) players.reverse();
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
        const pick = (selector, key, parse = (v) => v) => $(selector).addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (!button) return;
            this.settings[key] = parse(button.dataset.value);
            saveSettings(this.settings);
            this.renderSetup();
        });
        pick('#mode', 'mode');
        pick('#cpu-level', 'level');
        pick('#side', 'side', Number);
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#undo').addEventListener('click', () => this.undo());
        $('#resign').addEventListener('click', () => this.askResign());
        $('#resign-yes').addEventListener('click', () => {
            $('#confirm-resign').close();
            this.selected = null;
            this.controller?.send({ type: 'resign' });
        });
        $('#open-kifu').addEventListener('click', () => {
            $('#kifu').showModal();
            this.scrollKifu();
        });
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#promote-yes').addEventListener('click', () => this.answerPromote(true));
        $('#promote-no').addEventListener('click', () => this.answerPromote(false));
        $('#promote').addEventListener('close', () => {
            // 外を押して閉じたら、選び直す
            if (!this.pending) return;
            this.pending = null;
            this.render();
        });
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#board').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-sq]');
            if (cell) this.onCell(Number(cell.dataset.sq));
        });
        for (const id of ['#hand-top', '#hand-bottom']) {
            $(id).addEventListener('click', (event) => {
                const chip = event.target.closest('[data-drop]');
                if (chip) this.onHand(Number(chip.dataset.drop));
            });
        }
    }

    // ---- 操作 ----

    myTurn() {
        const v = this.view;
        return !!v && !v.over && v.myTurn;
    }

    movesFor(selected) {
        if (!selected || !this.view) return [];
        return this.view.moves.filter(m => (selected.drop ? m.drop === selected.drop : m.from === selected.from));
    }

    onCell(sq) {
        if (!this.myTurn()) return;
        const v = this.view;
        const p = v.board[sq];
        if (this.selected) {
            const targets = this.movesFor(this.selected).filter(m => m.to === sq);
            if (targets.length) {
                if (targets.length === 2) this.askPromote(targets[0]);
                else this.play(targets[0]);
                return;
            }
            const same = this.selected.from === sq;
            this.selected = !same && p && sideOf(p) === v.current ? { from: sq } : null;
            music.play(this.selected ? 'select' : 'cancel');
        } else if (p && sideOf(p) === v.current) {
            this.selected = { from: sq };
            music.play('select');
        }
        this.render();
    }

    onHand(type) {
        if (!this.myTurn()) return;
        this.selected = this.selected?.drop === type ? null : { drop: type };
        music.play(this.selected ? 'select' : 'cancel');
        this.render();
    }

    play(m) {
        this.selected = null;
        this.hintCommand = null;
        this.controller?.send(m.drop
            ? { type: 'drop', piece: m.drop, to: m.to }
            : { type: 'move', from: m.from, to: m.to, promote: m.promote });
    }

    askPromote(m) {
        const type = typeOf(this.view.board[m.from]);
        const side = this.view.current;
        const flipped = side !== this.bottomSide();
        this.pending = { from: m.from, to: m.to };
        $('#promote-yes').innerHTML = `${pieceHtml(side, type + PROMOTE, { flipped })}成る`;
        $('#promote-no').innerHTML = `${pieceHtml(side, type, { flipped })}成らない`;
        $('#promote').showModal();
    }

    answerPromote(promote) {
        const pending = this.pending;
        this.pending = null;
        $('#promote').close();
        if (pending) this.play({ from: pending.from, to: pending.to, drop: null, promote });
    }

    askResign() {
        const v = this.view;
        if (!v || v.over) return;
        const seat = v.twoPlayers ? v.current : v.you;
        $('#resign-text').textContent = v.twoPlayers ? `${SIDE_MARK[seat]}${SIDE_NAME[seat]}が投了します。` : 'この対局を負けにします。';
        $('#confirm-resign').showModal();
    }

    undo() {
        if (!this.controller?.undo()) return;
        music.play('cancel');
        this.selected = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        $('#result').close();
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        const { mode, level, side } = this.settings;
        const mark = (selector, value) => document.querySelectorAll(`${selector} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
        mark('#mode', mode);
        mark('#cpu-level', level);
        mark('#side', side);
        document.querySelectorAll('.cpu-only').forEach(el => el.classList.toggle('off', mode !== 'cpu'));
    }

    // 最下段の駒（香・桂・銀・金・玉）
    renderTitleArt() {
        $('#title-art').innerHTML = [2, 3, 4, 5, 8].map(t => `<span class="cell">${pieceHtml(SENTE, t)}</span>`).join('');
    }

    renderHelp() {
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>相手の玉（王）を詰ませた方が勝ちです。詰みとは、玉が取られるのを、どう指しても防げない状態です。先手（▲）から交互に1手ずつ指します。</p>
            <h3>駒の動き</h3>
            <p>歩：前に1升。香：前にどこまでも。桂：前に2升・横に1升の所へ跳ぶ（ほかの駒を飛び越える）。銀：前3方向と斜め後ろ。金：前3方向・横・真後ろ。角：斜めにどこまでも。飛：縦横にどこまでも。玉：周りの8升。</p>
            <h3>成り</h3>
            <p>相手の陣地（奥の3段）に入るとき、その中で動くとき、そこから出るときに、駒を裏返して「成る」ことができます。歩・香・桂・銀は金と同じ動き（と・杏・圭・全）に、角は馬（角＋縦横に1升）、飛は龍（飛＋斜めに1升）になります。金と玉は成りません。行き所がなくなる駒（一番奥の歩・香、奥の2段の桂）は必ず成ります。</p>
            <h3>持ち駒</h3>
            <p>取った相手の駒は自分の持ち駒になり、手番に空いた升へ打てます（成った駒も元に戻して打ちます）。</p>
            <h3>禁じ手</h3>
            <p>二歩（成っていない歩が同じ筋に2枚）、打ち歩詰め（歩を打って詰ませる）、行き所のない所へ打つ・動かす、王手を放置する手は指せません。この画面では、指せない手は選べないようになっています。</p>
            <h3>千日手・投了</h3>
            <p>同じ局面が4回現れると千日手で、引き分けです。ただし王手をかけ続けた千日手は、王手をかけた側の負けです。勝てないと思ったら、旗のボタンで投了できます。</p>
            <h3>操作</h3>
            <p>自分の駒を押すと、動ける升に点が付きます。点の升を押すと指します。持ち駒は、押してから打つ升を押します。成れるときは「成る／成らない」を選びます。上のボタンで、棋譜を見る・待った（CPU 戦ではあなたの手と CPU の手をまとめて戻す）・投了ができます。</p>
            <h3>CPU の強さ</h3>
            <p>やさしい・ふつう・つよい・とてもつよい の4つ。強いほど先の手まで読みます。</p>`;
    }

    // ---- 対局の画面 ----

    // 盤の下に描く側
    bottomSide() {
        const v = this.view;
        return !v || v.twoPlayers || v.you === null ? SENTE : v.you;
    }

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        if (!this.myTurn()) this.selected = null;
        this.playEvents(view, prev);
        this.renderStatus(view);
        this.renderHands(view);
        this.renderBoard(view);
        this.renderKifu(view);
        $('#undo').disabled = !view.canUndo;
        $('#resign').disabled = view.over;
        if (!view.over) this.resultShown = false;
        if (view.over && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    sideLabel(side) {
        const v = this.view;
        if (v.twoPlayers) return `${SIDE_MARK[side]}${SIDE_NAME[side]}`;
        return `${SIDE_MARK[side]}${escapeHtml(v.players[side].name)}`;
    }

    renderStatus(view) {
        let turn;
        let cls = '';
        if (view.over) {
            turn = this.resultTitle(view);
        } else if (view.players[view.current].isCPU) {
            turn = 'CPU 考え中…';
            cls = 'thinking';
        } else {
            turn = view.twoPlayers ? `${SIDE_MARK[view.current]}${SIDE_NAME[view.current]}の番` : 'あなたの番';
        }
        const check = view.check ? '<span class="check">王手</span>' : '';
        const last = view.logCount ? `<span class="last">${view.logCount}手目 ${escapeHtml(view.logs.at(-1))}</span>` : '<span class="last">開始</span>';
        $('#status').innerHTML = `<span class="turn ${cls}">${turn}</span>${check}${last}`;
    }

    renderHands(view) {
        const bottom = this.bottomSide();
        const draw = (side, el) => {
            const mine = this.myTurn() && view.current === side;
            const active = !view.over && view.current === side;
            const chips = HAND_TYPES.filter(t => view.hands[side][t]).map(t => {
                const n = view.hands[side][t];
                const sel = mine && this.selected?.drop === t ? ' sel' : '';
                return `<button class="chip${sel}" data-drop="${t}" ${mine ? '' : 'disabled'} aria-label="${PIECE_NAME[t]}${n > 1 ? ` ${n}枚` : ''}">${pieceHtml(side, t, { flipped: side !== bottom })}${n > 1 ? `<span class="n">${n}</span>` : ''}</button>`;
            }).join('');
            el.innerHTML = `<span class="who${active ? ' active' : ''}">${this.sideLabel(side)}</span><span class="chips">${chips || '<span class="none">持ち駒なし</span>'}</span>`;
        };
        draw(1 - bottom, $('#hand-top'));
        draw(bottom, $('#hand-bottom'));
    }

    renderBoard(view) {
        const flip = this.bottomSide() === GOTE;
        const targets = new Map();
        const hinted = this.hintTarget();
        this.movesFor(this.myTurn() ? this.selected : null).forEach(m => targets.set(m.to, m));
        const last = view.lastMove;
        const checkSq = view.check ? view.kings[view.current] : -1;
        const parts = [];
        // 上の段：筋の数字（9〜1。盤を回したら 1〜9）
        for (let i = 0; i < SIZE; i++) parts.push(`<span class="coord file">${flip ? i + 1 : SIZE - i}</span>`);
        parts.push('<span class="coord corner"></span>');
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const sq = flip ? 80 - (r * SIZE + c) : r * SIZE + c;
                const p = view.board[sq];
                const cls = ['cell'];
                if (last && last.to === sq) cls.push('last');
                if (last && last.from === sq) cls.push('from');
                if (this.selected?.from === sq) cls.push('sel');
                if (sq === checkSq) cls.push('check');
                const target = targets.get(sq);
                if (target) cls.push(p ? 'target capture' : 'target');
                if (hinted === sq) cls.push('recommended');
                const piece = p ? pieceHtml(sideOf(p), typeOf(p), { flipped: sideOf(p) !== this.bottomSide(), cls: this.placed === sq ? 'placed' : '' }) : '';
                parts.push(`<button class="${cls.join(' ')}" data-sq="${sq}" aria-label="${this.squareLabel(sq, p)}">${piece}</button>`);
            }
            parts.push(`<span class="coord rank">${KAN[flip ? SIZE - r : r + 1]}</span>`);
        }
        const dots = [[3, 3], [6, 3], [3, 6], [6, 6]].map(([x, y]) => `<span style="left:calc(${x} * var(--cw));top:calc(${y} * var(--ch))"></span>`).join('');
        $('#board').innerHTML = `${parts.join('')}<span class="stars" aria-hidden="true">${dots}</span>`;
        $('#board').classList.toggle('mine', this.myTurn());
        this.placed = null;
    }

    squareLabel(sq, p) {
        const name = `${SIZE - (sq % SIZE)}${KAN[Math.floor(sq / SIZE) + 1]}`;
        return p ? `${name} ${SIDE_NAME[sideOf(p)]}の${PIECE_NAME[typeOf(p)]}` : name;
    }

    renderKifu(view) {
        // ビューの logs は全部の手（since 0）
        const items = view.logs.map((text, i) => `<li><span class="no">${i + 1}</span>${escapeHtml(text)}</li>`);
        const end = view.events.findLast?.(e => e.type === 'end');
        if (view.over && end) items.push(`<li class="end">${escapeHtml(end.text)}</li>`);
        const html = items.join('') || '<li class="empty">まだ指していません</li>';
        for (const id of ['#kifu-side', '#kifu-dialog']) $(id).innerHTML = html;
        this.scrollKifu();
    }

    scrollKifu() {
        for (const id of ['#kifu-side', '#kifu-dialog']) {
            const el = $(id);
            el.scrollTop = el.scrollHeight;
        }
    }

    // ---- 出来事の演出 ----

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        this.playSound(view, fresh);
        const move = [...fresh].reverse().find(e => e.type === 'move');
        if (move && !reduceMotion()) this.placed = move.to;
        if (move?.check && !view.over && !view.players[view.current].isCPU) this.toast('王手');
    }

    // 新しい出来事から効果音を1つ鳴らす。人の手は置く・取る音、CPU が指して自分の番になったら turn、終わりは勝ち負け
    playSound(view, fresh) {
        const end = fresh.find(e => e.type === 'end');
        if (end) {
            if (end.winner === null) return music.play('notify');
            return music.play(view.twoPlayers || end.winner === view.you ? 'win' : 'lose');
        }
        const move = fresh.findLast(e => e.type === 'move');
        if (!move) return;
        if (view.players[move.seat].isCPU) return music.play('turn');
        music.play(move.captured ? 'capture' : 'place');
    }

    // ---- ダイアログ ----

    resultTitle(v) {
        if (v.winner === null) return '千日手（引き分け）';
        if (v.twoPlayers) return `${SIDE_MARK[v.winner]}${SIDE_NAME[v.winner]}の勝ち`;
        return v.winner === v.you ? 'あなたの勝ち' : 'CPU の勝ち';
    }

    showResult() {
        const v = this.view;
        if (!v || !v.over) return;
        this.resultShown = true;
        $('#result-title').textContent = this.resultTitle(v);
        const reason = REASON_TEXT[v.reason] ?? '';
        const loser = v.winner === null ? null : 1 - v.winner;
        const detail = v.reason === 'resign' ? `${SIDE_NAME[loser]}の投了`
            : v.reason === 'perpetual-check' ? `${SIDE_NAME[loser]}の${reason}`
                : reason;
        $('#result-text').innerHTML = `${escapeHtml(detail)}<small>まで${v.ply}手</small>`;
        $('#result').showModal();
    }

    // ---- ヒント ----

    // おすすめの手の駒を選んだ状態にし、行き先に印を付ける（画面だけ。記録には入れず、指したら消す）
    showHint() {
        const command = this.myTurn() ? this.controller?.hint() : null;
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        this.selected = command.type === 'drop' ? { drop: command.piece } : { from: command.from };
        this.render();
        const name = command.type === 'drop' ? `${PIECE_NAME[command.piece]}打` : `${PIECE_NAME[typeOf(this.view.board[command.from])]}${command.promote ? '成' : ''}`;
        this.toast(`おすすめ：${squareName(command.to)}${name}`);
    }

    // 選んでいる駒がおすすめと同じときの、おすすめの行き先
    hintTarget() {
        const c = this.hintCommand;
        if (!c || !this.myTurn() || !this.selected) return null;
        const same = c.type === 'drop' ? this.selected.drop === c.piece : this.selected.from === c.from;
        return same ? c.to : null;
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
    }
}
