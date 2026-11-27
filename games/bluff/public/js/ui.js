/**
 * 画面（タイトル・ゲーム・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 宣言：盤のマスを押して数（星のマスなら星）を選び、数のマスなら目を選んで「宣言する」
 * 振り直し：宣言を選んだあと、宣言に合う自分のダイスを押すと、見せて残りを振り直す宣言になる
 */

import { STAR, FACES, FIELDS, position, isRaise, matches, bidText } from './bids.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { symbolsSvg, dieHtml, hiddenDie, faceSvg, cupSvg, titleArtSvg } from './art.js';

const GAME = 'bluff';
const SETTINGS_KEY = 'bluff.settings';
const CPU_NAMES = ['ハンス', 'グレタ', 'カール', 'リーナ', 'オットー'];
const RESULT_DELAY_MS = 1400;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const bidHtml = (bid) => `<span class="bid">${dieHtml(bid.face, { cls: 'tiny' })}<span class="x">×</span><b>${bid.qty}</b></span>`;

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4, 5, 6].includes(saved.count) ? saved.count : 4,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy',
            reroll: saved.reroll !== false,
            lossOne: saved.lossOne === true
        };
    } catch {
        return { count: 4, level: 'easy', reroll: true, lossOne: false };
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
        this.pick = null;           // 選んでいる宣言 { qty, face }
        this.reveal = new Set();    // 振り直しで見せるダイス
        this.selKey = null;
        this.resultTimer = null;
        this.resultShown = false;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtSvg();
        this.bindStatic();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ブラフ',
            game: 'bluff',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 900,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
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
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.stopGame();
        this.controller = controller;
        this.view = null;
        this.pick = null;
        this.reveal = new Set();
        this.resultShown = false;
        this.soundSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    newGame() {
        const { count, level, reroll, lossOne } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: { reroll, lossOne } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    bindStatic() {
        const segment = (id, attr, apply) => $(id).addEventListener('click', (event) => {
            const button = event.target.closest(`button[${attr}]`);
            if (!button) return;
            apply(button.getAttribute(attr));
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'data-count', v => { this.settings.count = Number(v); });
        segment('#cpu-level', 'data-level', v => { this.settings.level = v; });
        segment('#opt-reroll', 'data-reroll', v => { this.settings.reroll = v === 'on'; });
        segment('#opt-loss', 'data-loss', v => { this.settings.lossOne = v === 'one'; });
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle())); // オンラインは確かめてから部屋を出る
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        $('#board').addEventListener('click', (event) => {
            const f = event.target.closest('[data-pos]');
            if (f) this.tapField(Number(f.dataset.pos));
        });
        $('#faces').addEventListener('click', (event) => {
            const b = event.target.closest('button[data-face]');
            if (b && !b.disabled && this.pick) {
                music.play('select');
                this.pick = { ...this.pick, face: Number(b.dataset.face) };
                this.reveal = new Set();
                this.render();
            }
        });
        $('#me').addEventListener('click', (event) => {
            const d = event.target.closest('[data-die]');
            if (d) this.tapDie(Number(d.dataset.die));
        });
        $('#hint').addEventListener('click', () => this.showHint());
        $('#actions').addEventListener('click', (event) => {
            const b = event.target.closest('button[data-act]');
            if (!b || b.disabled) return;
            if (b.dataset.act === 'bid') {
                const command = { type: 'bid', qty: this.pick.qty, face: this.pick.face };
                if (this.reveal.size) command.reveal = [...this.reveal];
                this.send(command);
            } else if (b.dataset.act === 'challenge') this.send({ type: 'challenge' });
            else if (b.dataset.act === 'next') this.send({ type: 'next' });
            else if (b.dataset.act === 'result') this.showResult();
        });
    }

    // ヒント：CPU（ふつう）が選ぶ操作。宣言なら数と目（見せるダイスも）を選んだ状態にし、押すボタンに印を付ける
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('自分の番になったら、おすすめを出せます');
        if (command.type === 'bid') {
            this.pick = { qty: command.qty, face: command.face };
            this.reveal = new Set(command.reveal ?? []);
            this.render();
            $('#actions [data-act="bid"]')?.classList.add('recommended');
            return this.toast(`おすすめ：${command.face === STAR ? '★' : command.face}の目が${command.qty}個と宣言${this.reveal.size ? '（選んだダイスを見せて振り直す）' : ''}`);
        }
        $(`#actions [data-act="${command.type}"]`)?.classList.add('recommended');
        this.toast(command.type === 'challenge' ? 'おすすめ：ブラフ！と言う' : 'おすすめ：次へ進む');
    }

    send(command) {
        if (!this.controller) return;
        this.pick = null;
        this.reveal = new Set();
        this.controller.send(command);
    }

    // 効果音：前の描画からのできごとを見て、1回の更新に1つだけ鳴らす
    // 勝負（ブラフ！）は自分が失えば払う音、自分の指摘が当たれば取った音。自分の宣言は置く音、振り直しはさいころ
    playSounds(v) {
        const fresh = v.events.filter(e => e.seq > this.soundSeq);
        if (!fresh.length) return;
        this.soundSeq = fresh.at(-1).seq;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(v.you) ? 'win' : 'lose');
        const challenge = fresh.find(e => e.type === 'challenge');
        if (challenge) {
            if (challenge.losses[v.you]) return music.play('pay');
            return music.play(challenge.seat === v.you ? 'capture' : 'notify');
        }
        const mine = fresh.filter(e => e.seat === v.you);
        if (mine.length && mine.length === fresh.filter(e => e.seat !== undefined).length) {
            return music.play(mine.some(e => e.type === 'reroll') ? 'dice' : 'place');
        }
        if (fresh.some(e => e.type === 'round')) return music.play('dice');
        music.play(this.myTurn() ? 'turn' : 'notify');
    }

    myTurn() {
        const v = this.view;
        return !!v && v.phase === 'bid' && v.turn === v.you;
    }

    // 盤のマスを押した：数を選ぶ（目は、上げられる一番低い目。星のマスは星）
    tapField(pos) {
        if (!this.myTurn()) return;
        const field = FIELDS[pos - 1];
        const current = this.view.bid;
        let bid;
        if (field.star) bid = { qty: field.qty, face: STAR };
        else {
            const keep = this.pick && !field.star && this.pick.face !== STAR ? this.pick.face : null;
            const faces = FACES.filter(face => isRaise(current, { qty: field.qty, face }));
            if (!faces.length) return;
            bid = { qty: field.qty, face: keep && faces.includes(keep) ? keep : faces[0] };
        }
        if (!isRaise(current, bid)) return;
        music.play('select');
        this.pick = bid;
        this.reveal = new Set();
        this.render();
    }

    // 自分のダイスを押した：振り直しで見せるダイスを選ぶ
    tapDie(i) {
        const v = this.view;
        if (!this.myTurn() || !this.pick || !v.options.reroll) return;
        const dice = v.players[v.you].dice;
        const d = dice[i];
        if (!d || d.shown || !matches(d.value, this.pick.face)) return;
        if (this.reveal.has(i)) this.reveal.delete(i);
        else {
            // 1個はカップに残す
            const inCup = dice.filter(x => !x.shown).length;
            if (inCup - this.reveal.size - 1 < 1) {
                music.play('error');
                this.toast('1個はカップに残します');
                return;
            }
            this.reveal.add(i);
        }
        this.render();
    }

    // ---- タイトル ----

    renderSetup() {
        const s = this.settings;
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === s.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === s.level)));
        document.querySelectorAll('#opt-reroll button').forEach(b => b.setAttribute('aria-checked', String((b.dataset.reroll === 'on') === s.reroll)));
        document.querySelectorAll('#opt-loss button').forEach(b => b.setAttribute('aria-checked', String((b.dataset.loss === 'one') === s.lossOne)));
    }

    renderHelp() {
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>全員のカップの中に、ある目がいくつあるかを宣言し合います。外れた人はダイスを失い、最後までダイスが残った人の勝ち。</p>
            <h3>ダイス</h3>
            <p>各人5個。目は1〜5と星（${dieHtml(STAR, { cls: 'tiny inline' })}）。星は何の目にもなります。</p>
            <h3>宣言</h3>
            <p>「全員のダイスの中に、この目が少なくともこの数ある」と宣言します。数の宣言はその目と星を合わせて数え、星の宣言は星だけを数えます。</p>
            <p>次の人は、宣言を上げるか「ブラフ！」と疑います（パスはできません）。上げるときは、盤のより先のマスへ（目は自由）、または同じ数のまま目を上げます。星のマスは、数のマスの間にあります（星1つは、数2つくらいの重み）。</p>
            <p>盤のマスを押して数を選び、目を選んで「宣言する」。</p>
            <h3>振り直し</h3>
            <p>宣言したあと、宣言に合うダイスを見せて（カップの外に出して）、残りを振り直せます。1個はカップに残します。見せたダイスはラウンドの終わりまでそのまま。宣言を選んでから、自分のダイスを押すと選べます。</p>
            <h3>ブラフ！</h3>
            <p>全員のダイスを見せて数えます。</p>
            <ul>
                <li>宣言より少ない：宣言した人が、差の数だけダイスを失う</li>
                <li>宣言より多い：疑った人が、差の数だけダイスを失う</li>
                <li>ぴったり：宣言した人以外の全員が、1個ずつ失う</li>
            </ul>
            <p>正しかった側が、次のラウンドを始めます。</p>
            <h3>設定</h3>
            <p>「失う数：1個」は Perudo（Dudo）風で、負けた側が1個だけ失います（ぴったりなら疑った人が1個）。「振り直し：なし」で、振り直しをなくせます。</p>
            <h3>ヒント</h3>
            <p>上の電球のボタンを押すと、おすすめの宣言（数と目）を選び、押すボタンを光らせます。</p>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        const key = `${view.phase}:${view.round}:${view.turn}:${view.history.length}`;
        if (key !== this.selKey) {
            this.selKey = key;
            this.pick = null;
            this.reveal = new Set();
        }
        $('#round').textContent = view.phase === 'end' ? '終わり' : `ラウンド ${view.round}`;
        this.renderSeats(view);
        this.renderStatus(view);
        this.renderBoard(view);
        this.renderMe(view);
        this.renderFaces(view);
        this.renderActions(view);
        this.playSounds(view);
        if ($('#log').open) this.renderLog();
        if (view.phase === 'end' && !this.resultShown && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.resultShown = true;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // ダイスの並び（結果のときは、そのラウンドの全部の目。合うダイスに印）
    diceRow(view, seat, cls) {
        const r = view.reveal;
        if (r && view.phase !== 'bid') {
            return r.dice[seat].map(d => dieHtml(d.value, { cls: `${cls}${matches(d.value, r.bid.face) ? ' hit' : ' miss'}` })).join('');
        }
        const p = view.players[seat];
        if (p.dice) return p.dice.map((d, i) => dieHtml(d.value, { cls: `${cls}${d.shown ? ' shown' : ''}`, attrs: `data-die="${i}"` })).join('');
        return `${p.shown.map(v => dieHtml(v, { cls: `${cls} shown` })).join('')}${Array.from({ length: p.hidden }, () => hiddenDie(cls)).join('')}`;
    }

    renderSeats(view) {
        const others = view.players.filter(p => p.id !== view.you);
        $('#seats').dataset.n = String(others.length);
        $('#seats').innerHTML = others.map(p => {
            const last = [...view.history].reverse().find(h => h.seat === p.id);
            const turn = view.phase === 'bid' && view.turn === p.id;
            const out = p.count === 0 && !(view.reveal && view.reveal.dice[p.id].length);
            const loss = view.phase !== 'bid' && view.reveal?.losses[p.id];
            // 1行目：名前と、このラウンドの最新の宣言（結果のときは失った数）。2行目：カップとダイス
            return `<div class="seat${turn ? ' turn' : ''}${out ? ' out' : ''}">
                <div class="seat-head"><span class="name">${escapeHtml(p.name)}</span>${loss ? `<span class="loss">−${loss}</span>` : (last && view.phase === 'bid' ? bidHtml(last) : '')}</div>
                <div class="seat-body">${out ? '<span class="muted">脱落</span>' : `${cupSvg(p.count)}<div class="seat-dice">${this.diceRow(view, p.id, 'mini')}</div>`}</div>
            </div>`;
        }).join('');
    }

    renderStatus(view) {
        const el = $('#status');
        const name = (s) => escapeHtml(view.players[s].name);
        if (view.phase !== 'bid' && view.reveal) {
            const r = view.reveal;
            const losses = Object.entries(r.losses).map(([s, n]) => `${name(s)} −${n}`).join('・');
            el.innerHTML = `<div class="reveal-line">${bidHtml(r.bid)}<span>に対して</span><b class="count">${r.count}</b><span>個</span></div>
                <div class="reveal-sub">${name(r.challenger)}のブラフ！　→ ${losses}</div>`;
            return;
        }
        const total = view.players.reduce((s, p) => s + p.count, 0);
        const bid = view.bid;
        el.innerHTML = `<div class="bid-line">${bid ? `${bidHtml(bid)}<span class="by">${name(bid.seat)}</span>` : '<span class="muted">最初の宣言</span>'}</div>
            <div class="reveal-sub">${view.turn === view.you ? 'あなたの番' : `${name(view.turn)}の番`}　ダイス ${total}個</div>`;
    }

    renderBoard(view) {
        const my = this.myTurn();
        const current = view.bid;
        const pickPos = this.pick ? position(this.pick) : null;
        const curPos = current ? position(current) : null;
        $('#board').innerHTML = FIELDS.map(f => {
            const can = my && (f.star ? isRaise(current, { qty: f.qty, face: STAR }) : FACES.some(face => isRaise(current, { qty: f.qty, face })));
            let cls = `field${f.star ? ' star' : ''}${can ? ' can' : ''}${pickPos === f.pos ? ' sel' : ''}${curPos !== null && f.pos < curPos ? ' past' : ''}`;
            const marker = curPos === f.pos ? dieHtml(current.face, { cls: 'marker' }) : (pickPos === f.pos ? dieHtml(this.pick.face, { cls: 'marker pick' }) : '');
            if (marker) cls += ' has';
            return `<button class="${cls}" data-pos="${f.pos}" ${can ? '' : 'tabindex="-1"'}>${f.star ? `<span class="s">${faceSvg(STAR)}</span>` : ''}<span class="q">${f.qty}</span>${marker}</button>`;
        }).join('');
    }

    renderMe(view) {
        const me = view.players[view.you];
        const out = me.count === 0 && !(view.reveal && view.reveal.dice[view.you].length);
        const loss = view.phase !== 'bid' && view.reveal?.losses[view.you];
        let row = out ? '<span class="muted">脱落（観戦中）</span>' : this.diceRow(view, view.you, 'big');
        if (!out && view.phase === 'bid' && this.pick && view.options.reroll && this.myTurn()) {
            // 振り直しで見せられるダイスに印、選んだダイスを持ち上げる
            row = me.dice.map((d, i) => {
                const can = !d.shown && matches(d.value, this.pick.face);
                return dieHtml(d.value, { cls: `big${d.shown ? ' shown' : ''}${can ? ' can' : ''}${this.reveal.has(i) ? ' sel' : ''}`, attrs: `data-die="${i}"` });
            }).join('');
        }
        $('#me').innerHTML = `<div class="me-dice">${row}${loss ? `<span class="loss big-loss">−${loss}</span>` : ''}</div>`;
    }

    renderFaces(view) {
        const el = $('#faces');
        if (!this.myTurn()) {
            el.innerHTML = '';
            return;
        }
        if (!this.pick) {
            el.innerHTML = '<span class="muted">盤のマスを選ぶ</span>';
            return;
        }
        if (this.pick.face === STAR) {
            el.innerHTML = `<span class="pick-text">${bidText(this.pick)}${this.reveal.size ? `　${this.reveal.size}個を見せて振り直す` : ''}</span>`;
            return;
        }
        el.innerHTML = FACES.map(face => {
            const ok = isRaise(view.bid, { qty: this.pick.qty, face });
            return `<button class="face-btn${this.pick.face === face ? ' sel' : ''}" data-face="${face}" ${ok ? '' : 'disabled'} aria-label="${face}">${faceSvg(face)}</button>`;
        }).join('');
    }

    renderActions(view) {
        const a = $('#actions');
        if (view.phase === 'end') {
            a.innerHTML = '<button class="btn primary" data-act="result">結果</button>';
            return;
        }
        if (view.phase === 'reveal') {
            a.innerHTML = view.starter === view.you
                ? '<button class="btn primary" data-act="next">次のラウンド</button>'
                : `<span class="muted">${escapeHtml(view.players[view.starter].name)}が次のラウンドを始めます</span>`;
            return;
        }
        const my = this.myTurn();
        const label = this.reveal.size ? '宣言して振り直す' : '宣言する';
        a.innerHTML = `<button class="btn secondary" data-act="challenge" ${my && view.bid ? '' : 'disabled'}>ブラフ！</button>
            <button class="btn primary" data-act="bid" ${my && this.pick ? '' : 'disabled'}>${label}</button>`;
    }

    // ---- ダイアログ ----

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view || !(view.phase === 'end')) return;
        const id = `${GAME}-${controller.game.options.seed}`;
        if (this.recordedId === id) return;
        this.recordedId = id;
        recordResult({ game: GAME, id, outcome: outcomeFromWinners(view.winners, view.you, view.players.length) });
    }

    showResult() {
        this.recordLocalResult(this.view);
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const w = v.winners[0];
        $('#result-title').textContent = w === v.you ? 'あなたの勝ち' : `${v.players[w].name}の勝ち`;
        $('#result-body').innerHTML = `<p class="center">ラウンド ${v.round} で決着　残りのダイス ${v.players[w].count}個</p>`;
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
