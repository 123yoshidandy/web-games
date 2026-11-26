/**
 * 画面（タイトル・ゲーム・昇格・引き分けの提案・投了・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * - 自分の駒を押すと、動ける升が光る。光る升を押すと動かす。ポーンが最後の段に着くときは、成る駒を4つから選ぶ
 * - 直前の手の升に色を付け、チェックされたキングを赤く光らせる。動いた駒は元の升から滑らせて見せる（CPU の手も同じ）
 * - 上に相手、下に自分の帯を置き、取った駒と駒得を出す。下に棋譜（代数式表記）を出す
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, decide, suggest } from './cpu-player.js';
import { REASONS } from './game.js';
import { symbolsSvg, pieceSvg, PIECE_NAME, COLOR_NAME } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'chess.settings';
const RESULT_DELAY_MS = 900;
const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい', expert: 'とてもつよい' };
const PIECE_VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const FILES = 'abcdefgh';

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// 升の名前（e4）と、ビューの盤の添え字（0 が a8、63 が h1）
const indexOf = (name) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
const nameOf = (index) => FILES[index % 8] + (8 - Math.floor(index / 8));
const colorOfCode = (code) => (code === code.toUpperCase() ? 0 : 1);

function loadSettings() {
    const defaults = { mode: 'cpu', level: 'normal', color: 'w' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            mode: ['cpu', 'two'].includes(saved.mode) ? saved.mode : defaults.mode,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : defaults.level,
            color: ['w', 'b'].includes(saved.color) ? saved.color : defaults.color
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

// CPU を Web Worker で考えさせる。Worker が使えない・壊れたときは、その場で計算する
function createWorkerDecider() {
    let worker = null;
    try {
        worker = new Worker(new URL('./cpu-worker.js', import.meta.url), { type: 'module' });
    } catch {
        worker = null;
    }
    let seq = 0;
    const pending = new Map();
    const fallback = (job) => {
        try {
            job.resolve(decide(job.view, job.level));
        } catch (error) {
            job.reject(error);
        }
    };
    if (worker) {
        worker.addEventListener('message', (event) => {
            const { id, command, error } = event.data ?? {};
            const job = pending.get(id);
            if (!job) return;
            pending.delete(id);
            if (error) fallback(job);
            else job.resolve(command);
        });
        worker.addEventListener('error', (event) => {
            event.preventDefault?.();
            worker = null;
            const jobs = [...pending.values()];
            pending.clear();
            jobs.forEach(fallback);
        });
    }
    return (view, level) => new Promise((resolve, reject) => {
        const job = { view, level, resolve, reject };
        if (!worker) {
            // 考え中の表示を描いてから計算する
            setTimeout(() => fallback(job), 30);
            return;
        }
        const id = ++seq;
        pending.set(id, job);
        worker.postMessage({ id, view, level });
    });
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.lastSeq = 0;
        this.selected = null;     // 選んでいる駒の升（'e2'）
        this.flipped = false;     // 黒を下にして描く
        this.anim = null;         // 動いた駒の演出
        this.pendingPromo = null; // 成る駒を選んでいる手 { from, to }
        this.resultTimer = null;
        this.resultShown = false;
        this.decider = createWorkerDecider();
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
            }, { decider: this.decider });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.anim = null;
        this.selected = null;
        this.resultShown = false;
        // CPU 戦で黒を持つときは、黒を下にする
        const humans = this.controller.humanSeats;
        this.flipped = humans.length === 1 && humans[0] === 1;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { mode, level, color } = this.settings;
        const players = mode === 'two'
            ? [{ name: '白', isCPU: false }, { name: '黒', isCPU: false }]
            : [{ name: 'あなた', isCPU: false }, { name: 'CPU', isCPU: true, cpuLevel: level }];
        if (mode === 'cpu' && color === 'b') players.reverse();
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
        const pick = (selector, key) => $(selector).addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (!button) return;
            this.settings[key] = button.dataset.value;
            saveSettings(this.settings);
            this.renderSetup();
        });
        pick('#mode', 'mode');
        pick('#cpu-level', 'level');
        pick('#color', 'color');
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#undo').addEventListener('click', () => this.undo());
        $('#flip').addEventListener('click', () => {
            this.flipped = !this.flipped;
            this.render();
        });
        $('#offer-draw').addEventListener('click', () => this.offerDraw());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#resign').addEventListener('click', () => {
            if (this.view && !this.view.over) $('#confirm-resign').showModal();
        });
        $('#resign-yes').addEventListener('click', () => {
            $('#confirm-resign').close();
            this.controller?.send({ type: 'resign' });
        });
        $('#draw-accept').addEventListener('click', () => this.answerDraw(true));
        $('#draw-decline').addEventListener('click', () => this.answerDraw(false));
        $('#promo-choices').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-promo]');
            if (!button || !this.pendingPromo) return;
            const { from, to } = this.pendingPromo;
            this.pendingPromo = null;
            $('#promo').close();
            this.sendMove(from, to, button.dataset.promo);
        });
        $('#promo').addEventListener('close', () => { this.pendingPromo = null; });
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            // 引き分けの提案は、外を押しても閉じない（答えるまで待つ）
            if (dialog.id !== 'draw-offer') dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#draw-offer').addEventListener('cancel', event => event.preventDefault());
        $('#board').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-sq]');
            if (cell) this.onCell(cell.dataset.sq);
        });
    }

    // ---- 操作 ----

    // ヒント：CPU（ふつう）が選ぶ手の駒を選び、動かす先の升を光らせる
    showHint() {
        const v = this.view;
        const command = v && !v.over && v.myTurn ? suggest(v) : null;
        if (!command) return this.toast('自分の番になったら、おすすめを出せます');
        if (command.type !== 'move') return this.toast(command.type === 'acceptDraw' ? 'おすすめ：引き分けを受ける' : 'おすすめ：引き分けを断る');
        this.selected = command.from;
        this.hint = { ply: v.ply, to: command.to };
        this.renderBoard(v);
        this.toast(`おすすめ：${command.from} → ${command.to}`);
    }

    canMove() {
        const v = this.view;
        return !!v && !v.over && v.moving && !v.thinking;
    }

    movesFrom(sq) {
        return this.view.moves.filter(m => m.from === sq);
    }

    onCell(sq) {
        if (!this.canMove()) return;
        const code = this.view.board[indexOf(sq)];
        const own = code && colorOfCode(code) === this.view.current;
        if (this.selected) {
            const targets = this.movesFrom(this.selected).filter(m => m.to === sq);
            if (targets.length) {
                if (targets.some(m => m.promo)) this.askPromotion(this.selected, sq);
                else this.sendMove(this.selected, sq);
                return;
            }
        }
        if (own && sq !== this.selected) {
            this.selected = sq;
            if (!this.movesFrom(sq).length) {
                music.play('error');
                this.toast(this.view.check ? 'チェックを外す手を指してください' : 'その駒は動かせません');
            } else music.play('select');
        } else {
            if (this.selected) music.play('cancel');
            this.selected = null;
        }
        this.renderBoard(this.view);
    }

    sendMove(from, to, promo = null) {
        this.selected = null;
        const command = promo ? { type: 'move', from, to, promo } : { type: 'move', from, to };
        if (!this.controller?.send(command)) this.renderBoard(this.view);
    }

    askPromotion(from, to) {
        this.pendingPromo = { from, to };
        const color = this.view.current === 0 ? 'Q' : 'q';
        const codes = ['q', 'r', 'b', 'n'];
        $('#promo-choices').innerHTML = codes.map(c => {
            const code = color === 'Q' ? c.toUpperCase() : c;
            return `<button type="button" data-promo="${c}" aria-label="${PIECE_NAME[c]}">${pieceSvg(code)}<span>${PIECE_NAME[c]}</span></button>`;
        }).join('');
        $('#promo').showModal();
    }

    offerDraw() {
        const v = this.view;
        if (!v || v.over) return;
        if (!v.canOfferDraw) {
            this.toast(v.moving ? 'この手番では、もう提案しました' : '自分の番に提案できます');
            return;
        }
        if (this.controller?.send({ type: 'offerDraw' }) && !v.twoPlayers) this.toast('引き分けを提案しました');
    }

    answerDraw(accept) {
        $('#draw-offer').close();
        this.controller?.send({ type: accept ? 'acceptDraw' : 'declineDraw' });
    }

    undo() {
        if (!this.controller?.undo()) return;
        music.play('cancel');
        this.selected = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    // ---- タイトル・遊び方 ----

    renderSetup() {
        const { mode, level, color } = this.settings;
        const mark = (selector, value) => document.querySelectorAll(`${selector} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
        mark('#mode', mode);
        mark('#cpu-level', level);
        mark('#color', color);
        document.querySelectorAll('.cpu-only').forEach(el => el.classList.toggle('off', mode !== 'cpu'));
    }

    // 盤の一角を切り取った絵
    renderTitleArt() {
        const art = ['', 'n', '', 'k', 'p', '', 'Q', '', '', 'B', '', '', 'R', '', '', 'K'];
        $('#title-art').innerHTML = art.map((code, i) => {
            const dark = (Math.floor(i / 4) + i) % 2 === 1;
            return `<span class="cell ${dark ? 'dark' : 'light'}">${code ? pieceSvg(code) : ''}</span>`;
        }).join('');
    }

    renderHelp() {
        const p = (code) => `<span class="help-piece">${pieceSvg(code)}</span>`;
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>相手のキングを、どこへ逃げても取られる形（<strong>チェックメイト</strong>）にした方が勝ちです。白が先手で、交互に1手ずつ指します。</p>
            <h3>駒の動き</h3>
            <ul class="help-pieces">
                <li>${p('K')}<span><strong>キング</strong>：まわり1マス。取られる升へは動けません</span></li>
                <li>${p('Q')}<span><strong>クイーン</strong>：縦・横・斜めにどこまでも</span></li>
                <li>${p('R')}<span><strong>ルーク</strong>：縦・横にどこまでも</span></li>
                <li>${p('B')}<span><strong>ビショップ</strong>：斜めにどこまでも</span></li>
                <li>${p('N')}<span><strong>ナイト</strong>：縦横に2マス進んで横に1マス（L字）。駒を飛び越えます</span></li>
                <li>${p('P')}<span><strong>ポーン</strong>：前に1マス（最初だけ2マスも可）。取るときは斜め前に1マス</span></li>
            </ul>
            <p>相手の駒がいる升へ動くと、その駒を取ります。駒を飛び越えられるのはナイトだけです。</p>
            <h3>特別な手</h3>
            <p><strong>キャスリング</strong>：キングを2マス横へ動かし、その側のルークをキングの反対側へ移します。キングとそのルークがまだ動いておらず、間に駒がなく、キングがチェックされておらず、キングが通る升と着く升が攻撃されていないときだけできます。キングを2マス動かすと指せます。</p>
            <p><strong>アンパッサン</strong>：相手のポーンが2マス進んで自分のポーンの真横に来たら、その直後の1手だけ、通り過ぎた升へ斜めに進んで取れます。</p>
            <p><strong>プロモーション</strong>：ポーンが最後の段に着いたら、クイーン・ルーク・ビショップ・ナイトのどれかに必ず成ります。</p>
            <h3>チェックと引き分け</h3>
            <p>キングが攻撃されている状態をチェックといい、すぐに外さなければなりません。指せる手がなく、チェックもされていないときは<strong>ステイルメイト</strong>で引き分けです。</p>
            <p>ほかに、同じ局面が3回現れたとき、50手ずつポーンを動かさず駒も取らなかったとき、どちらもメイトできない駒しか残っていないとき（キング同士など）、引き分けの提案を受けたときも引き分けです。投了するとその場で負けです。</p>
            <h3>操作</h3>
            <p>自分の駒を押すと動ける升が光ります。光る升を押すと動かします。上のボタンは左から、ホーム・盤の向きを変える・待った（CPU 戦では自分の手と CPU の手をまとめて戻す）・引き分けの提案・投了・遊び方です。電球のボタンを押すと、おすすめの手の駒を選び、動かす先の升を光らせます。</p>
            <h3>CPU の強さ</h3>
            <p>やさしい・ふつう・つよい・とてもつよい の4つ。強いほど先の手まで読みます。引き分けの提案は、CPU が形勢を読んで受けるか決めます。</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        if (!view.moving || (this.selected && !view.moves.some(m => m.from === this.selected))) this.selected = null;
        this.playEvents(view, prev);
        this.renderSides(view);
        this.renderBoard(view);
        this.renderMoves(view);
        $('#undo').disabled = !view.canUndo;
        $('#offer-draw').disabled = view.over || view.thinking || !view.canOfferDraw;
        $('#resign').disabled = view.over;
        // 2人で遊ぶとき、引き分けの提案に答える
        const answering = !view.over && view.drawOffer !== null && view.myTurn;
        if (answering && !$('#draw-offer').open) {
            $('#draw-offer-text').textContent = `${COLOR_NAME[view.drawOffer]}が引き分けを提案しています。`;
            $('#draw-offer').showModal();
        } else if (!answering && $('#draw-offer').open) {
            $('#draw-offer').close();
        }
        if (!view.over) this.resultShown = false;
        if (view.over && !$('#result').open && !this.resultTimer && !this.resultShown) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    bottomSeat() {
        return this.flipped ? 1 : 0;
    }

    // 席の呼び名（CPU 戦は「あなた」「CPU（強さ）」、2人で遊ぶときは「白」「黒」）
    seatLabel(view, seat) {
        const p = view.players[seat];
        if (p.isCPU) return `CPU（${LEVEL_NAMES[p.cpuLevel] ?? 'ふつう'}）`;
        return view.players.some(q => q.isCPU) ? 'あなた' : COLOR_NAME[seat];
    }

    renderSides(view) {
        const material = [0, 1].map(seat => view.captured[seat].reduce((s, c) => s + PIECE_VALUE[c], 0));
        const side = (seat) => {
            const active = !view.over && view.actor === seat;
            const thinking = active && view.players[seat].isCPU;
            const won = view.over && view.winner === seat;
            // 取った駒（相手の色）を、価値の高い順に
            const caps = [...view.captured[seat]].sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a])
                .map(c => pieceSvg(seat === 0 ? c : c.toUpperCase(), 'cap')).join('');
            const lead = material[seat] - material[1 - seat];
            const king = pieceSvg(seat === 0 ? 'K' : 'k', 'who');
            return `<div class="side ${active ? 'active' : ''} ${thinking ? 'thinking' : ''} ${won ? 'won' : ''}" data-seat="${seat}">
                ${king}<span class="name">${escapeHtml(this.seatLabel(view, seat))}</span>
                <span class="caps">${caps}</span>${lead > 0 ? `<span class="lead">+${lead}</span>` : ''}</div>`;
        };
        const bottom = this.bottomSeat();
        $('#side-top').innerHTML = side(1 - bottom);
        $('#side-bottom').innerHTML = side(bottom);
    }

    // 画面の上から i 段目・左から j 列目の升の名前
    squareAt(row, col) {
        return this.flipped ? FILES[7 - col] + (row + 1) : FILES[col] + (8 - row);
    }

    // 升の画面上の位置（行, 列）
    displayPos(name) {
        const file = FILES.indexOf(name[0]);
        const rank = Number(name[1]);
        return this.flipped ? [rank - 1, 7 - file] : [8 - rank, file];
    }

    renderBoard(view) {
        const targets = new Map();
        if (this.selected && this.canMove()) {
            this.movesFrom(this.selected).forEach(m => targets.set(m.to, true));
        }
        const movable = new Set(this.canMove() ? view.moves.map(m => m.from) : []);
        const last = view.lastMove;
        const anim = this.anim;
        const slides = new Map();
        if (anim) {
            slides.set(anim.to, anim.from);
            if (anim.rookTo) slides.set(anim.rookTo, anim.rookFrom);
        }
        const cells = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const sq = this.squareAt(row, col);
                const code = view.board[indexOf(sq)];
                const dark = (row + col) % 2 === 1;
                const cls = ['cell', dark ? 'dark' : 'light'];
                if (last && (last.from === sq || last.to === sq)) cls.push('last');
                if (sq === this.selected) cls.push('selected');
                if (this.hint?.ply === view.ply && this.hint.to === sq) cls.push('recommended');
                if (view.check === sq) cls.push('check');
                if (movable.has(sq)) cls.push('movable');
                let piece = '';
                if (code) {
                    const from = slides.get(sq);
                    let style = '';
                    let pcls = '';
                    if (from) {
                        const [r0, c0] = this.displayPos(from);
                        style = ` style="--dx:${c0 - col};--dy:${r0 - row}"`;
                        pcls = 'slide';
                    }
                    piece = `<span class="pc ${pcls}"${style}>${pieceSvg(code)}</span>`;
                }
                // 取れる升は輪、空いた升は点（アンパッサンは空いた升でも取る手なので輪）
                const takes = code || (this.selected && view.board[indexOf(this.selected)].toLowerCase() === 'p' && this.selected[0] !== sq[0]);
                const hint = targets.has(sq) ? `<span class="${takes ? 'ring' : 'dot'}"></span>` : '';
                const coordFile = row === 7 ? `<span class="coord file">${sq[0]}</span>` : '';
                const coordRank = col === 0 ? `<span class="coord rank">${sq[1]}</span>` : '';
                const label = code ? `${sq}（${COLOR_NAME[colorOfCode(code)]}の${PIECE_NAME[code.toLowerCase()]}）` : sq;
                cells.push(`<button class="${cls.join(' ')}" data-sq="${sq}" aria-label="${label}">${coordFile}${coordRank}${piece}${hint}</button>`);
            }
        }
        $('#board').innerHTML = cells.join('');
        $('#board').classList.toggle('mine', this.canMove());
        this.anim = null;
    }

    renderMoves(view) {
        const el = $('#moves');
        if (!view.sans.length) {
            el.innerHTML = '<span class="moves-empty">棋譜</span>';
            return;
        }
        // 開始の局面が黒番なら、1手目は「1... 」から
        const blackFirst = view.startFen.split(' ')[1] === 'b';
        const parts = [];
        view.sans.forEach((san, i) => {
            const ply = i + (blackFirst ? 1 : 0);
            if (ply % 2 === 0 || i === 0) parts.push(`<span class="no">${Math.floor(ply / 2) + 1}.${ply % 2 ? '..' : ''}</span>`);
            parts.push(`<span class="san ${i === view.sans.length - 1 ? 'now' : ''}">${escapeHtml(san)}</span>`);
        });
        el.innerHTML = parts.join('');
        el.scrollLeft = el.scrollWidth;
    }

    // ---- 出来事の演出 ----

    // 効果音：新しいできごとを見て、1回の更新に1つだけ鳴らす
    // 自分の手（2人で遊ぶときは両方の手）は置く音、取ったら取る音。CPU の手のあとは自分の番の音。
    // 終局は引き分けなら知らせ、2人で遊ぶときは勝ちの音、CPU 戦は勝ち・負け
    playSounds(view, fresh) {
        const end = fresh.find(e => e.type === 'end');
        if (end) {
            if (end.winner === null) return music.play('notify');
            return music.play(view.twoPlayers || end.winner === view.you ? 'win' : 'lose');
        }
        const move = fresh.filter(e => e.type === 'move').at(-1);
        if (move) {
            if (view.twoPlayers || move.seat === view.you) return music.play(move.captured ? 'capture' : 'place');
            return music.play(view.myTurn ? 'turn' : 'notify');
        }
        if (fresh.some(e => (e.type === 'drawOffer' || e.type === 'drawDeclined') && e.seat !== view.you)) music.play('notify');
    }

    playEvents(view, prev) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        if (!prev || !fresh.length) return;
        this.playSounds(view, fresh);
        const move = [...fresh].reverse().find(e => e.type === 'move');
        if (move && !reduceMotion()) this.anim = { from: move.from, to: move.to, rookFrom: move.rookFrom, rookTo: move.rookTo };
        const declined = fresh.filter(e => e.type === 'drawDeclined').at(-1);
        if (declined && !view.over) this.toast(`${this.seatLabel(view, declined.seat)}は引き分けを断りました`);
        else if (move?.check && !view.over) this.toast('チェック');
    }

    // ---- ダイアログ ----

    showResult() {
        const v = this.view;
        if (!v || !v.over || !v.result) return;
        this.resultShown = true;
        const { winner, reason } = v.result;
        const title = winner === null ? '引き分け'
            : v.twoPlayers ? `${COLOR_NAME[winner]}の勝ち`
                : winner === v.you ? 'あなたの勝ち' : 'CPU の勝ち';
        $('#result-title').textContent = title;
        const moves = Math.ceil(v.sans.length / 2);
        $('#result-text').textContent = `${REASONS[reason]}${reason === 'resign' && winner !== null ? `（${this.seatLabel(v, 1 - winner)}）` : ''}・${moves}手`;
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
    }
}

