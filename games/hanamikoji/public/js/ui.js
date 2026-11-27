/**
 * 画面（タイトル・ゲーム・ラウンドの結果・最後の結果・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 選び方：手札を選んだ枚数で行動が決まる（1枚 秘密・2枚 放棄・3枚 贈り物・4枚 競争）
 * 競争は、選んだ順に前の2枚と後の2枚が組になる
 * 相手が贈り物・競争を出したら、手札の欄が差し出されたカードの欄に替わる。選ぶと、置いたあとの数を芸者の列に点線で見せる
 */

import { GEISHA, ACTIONS, ACTION_NAMES, POINTS_TO_WIN, GEISHAS_TO_WIN } from './game.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { LEVELS, suggest } from './cpu-player.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl, GAME } from './online-config.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { symbolsSvg, cardHtml, cardBackHtml, geishaHtml, chipHtml, actionTokenHtml, markerHtml } from './art.js';
import * as Motion from './motion/motion.js';
import { captureAnchors, playEvents } from './animator.js';

const CPU_NAME = '千代';
const ROUND_DIALOG_DELAY_MS = 1100;
const LEVEL_KEY = 'hanamikoji.level';
// 選んだ枚数ごとの行動と、ボタンの文言
const BY_COUNT = { 1: 'secret', 2: 'discard', 3: 'gift', 4: 'compete' };
const GO_LABELS = { secret: '秘密にする', discard: '放棄する', gift: '贈り物に出す', compete: '競争に出す' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadLevel() {
    try {
        const level = localStorage.getItem(LEVEL_KEY);
        return LEVELS.includes(level) ? level : 'normal';
    } catch {
        return 'normal';
    }
}

export default class UI {
    constructor() {
        this.controller = null;
        this.view = null;
        this.sel = [];          // 選んだ手札の位置（選んだ順）
        this.pickSel = null;    // 差し出されたものから選んだもの
        this.frozen = null;     // 結果を見ている間の、ラウンドの終わりのイベント
        this.lastSeq = 0;
        this.cancelDialog = null;
        this.level = loadLevel();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: '花見小路',
            game: 'hanamikoji',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 800,
            minPlayers: 2,
            maxPlayers: 2,
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
        this.renderLevel();
        this.renderTitleArt();
        this.renderHelpPictures();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
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
        this.hint = null;
        this.sel = [];
        this.pickSel = null;
        this.frozen = null;
        this.view = null;
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
    }

    newGame() {
        this.startGame({ players: [{ name: 'あなた', isCPU: false }, { name: CPU_NAME, isCPU: true }], options: {}, level: this.level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        this.frozen = null;
        this.cancelDialog?.();
        ['#round-result', '#result'].forEach(id => { if ($(id).open) $(id).close(); });
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('[data-level]');
            if (!button) return;
            this.level = button.dataset.level;
            try {
                localStorage.setItem(LEVEL_KEY, this.level);
            } catch { /* 保存できない環境でも遊べるようにする */ }
            this.renderLevel();
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#next-round').addEventListener('click', () => {
            $('#round-result').close();
            this.frozen = null;
            this.render(); // 閉じたら、新しいラウンドを描いて操作を受け付ける
            this.controller?.resume();
        });

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result' || dialog.id === 'round-result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        $('#hint').addEventListener('click', () => this.showHint());
        $('#hand').addEventListener('click', (event) => {
            const card = event.target.closest('[data-hand]');
            if (card) this.pickHand(Number(card.dataset.hand));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            if (button.dataset.act === 'cancel') {
                music.play('cancel');
                this.sel = [];
                this.render();
            } else if (button.dataset.act === 'go') {
                const action = this.analyze();
                if (action?.ok) this.send(action.command);
            }
        });
        $('#offer').addEventListener('click', (event) => {
            if (!this.choosing()) return;
            const option = event.target.closest('[data-option]');
            if (option) {
                const index = Number(option.dataset.option);
                music.play(this.pickSel === index ? 'cancel' : 'select');
                this.pickSel = this.pickSel === index ? null : index;
                this.render();
                return;
            }
            const go = event.target.closest('button[data-act="pick"]');
            if (go && !go.disabled && this.pickSel !== null) this.send({ type: 'pick', index: this.pickSel });
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    send(command) {
        this.sel = [];
        this.pickSel = null;
        this.controller?.send(command);
    }

    renderLevel() {
        document.querySelectorAll('#level [data-level]').forEach(button => {
            const on = button.dataset.level === this.level;
            button.classList.toggle('on', on);
            button.setAttribute('aria-checked', String(on));
        });
    }

    renderTitleArt() {
        $('#title-art').innerHTML = [0, 3, 6, 5, 1].map((g, i) => cardHtml(g, { cls: `fan fan-${i}` })).join('');
    }

    renderHelpPictures() {
        $('#help-geisha').innerHTML = GEISHA.map((_, g) => geishaHtml(g, 'tiny')).join('');
    }

    // ---- 選ぶ ----

    myTurn() {
        const view = this.view;
        return !!view && !this.frozen && view.phase === 'play' && view.actor === view.you;
    }

    choosing() {
        const view = this.view;
        return !!view && !this.frozen && view.phase === 'choose' && view.actor === view.you;
    }

    me() {
        return this.view.players[this.view.you];
    }

    rival() {
        return this.view.players[1 - this.view.you];
    }

    pickHand(index) {
        if (!this.myTurn()) return;
        music.play(this.sel.includes(index) ? 'cancel' : 'select');
        this.sel = this.sel.includes(index) ? this.sel.filter(i => i !== index) : [...this.sel, index];
        this.render();
    }

    // 今の選び方でできる行動。{ action, ok, command, reason }
    analyze() {
        const me = this.me();
        const cards = this.sel.map(i => me.hand[i]);
        if (cards.length === 0) return null;
        if (cards.length > 4) return { action: null, ok: false, reason: '選べるのは4枚まで' };
        const action = BY_COUNT[cards.length];
        if (me.used.includes(action)) return { action, ok: false, reason: `${ACTION_NAMES[action]}は使用済み` };
        const command = action === 'secret' ? { type: 'secret', card: cards[0] }
            : action === 'compete' ? { type: 'compete', groups: [cards.slice(0, 2), cards.slice(2, 4)] }
                : { type: action, cards };
        return { action, ok: true, command };
    }

    // ---- 描く ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const before = captureAnchors();
        this.view = view;
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        const roundEnd = fresh.find(e => e.type === 'roundEnd');
        if (roundEnd) {
            // ラウンドが終わったら、新しいラウンドは配られている。結果を見ている間は、終わったときの列を描き、CPU を止める
            this.frozen = { ...roundEnd, gameOver: fresh.some(e => e.type === 'end') };
            if (this.frozen.gameOver) this.recordLocalResult(this.frozen);
            this.controller.pause();
            this.cancelDialog?.();
            this.cancelDialog = Motion.afterIdle(() => this.showRoundResult(), Motion.ms(ROUND_DIALOG_DELAY_MS));
        }
        if (!this.myTurn()) this.sel = [];
        this.sel = this.sel.filter(i => i < this.me().hand.length);
        if (!this.choosing()) this.pickSel = null;

        this.renderTop();
        this.renderStrip('#rival', this.rival());
        this.renderBoard();
        this.renderStrip('#me', this.me());
        this.renderTray();

        const played = roundEnd ? fresh.filter(e => e.seq < roundEnd.seq) : fresh;
        playEvents(played, before, { you: view.you });
        this.playSound(fresh);
        this.markHint();
    }

    // 1つの更新に1つの音。自分の行動は置く・取る、相手の行動は notify、自分の番になったら turn
    playSound(fresh) {
        const view = this.view;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winner === view.you ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'roundEnd')) return music.play('notify');
        const acts = fresh.filter(e => ['secret', 'discard', 'offer', 'pick'].includes(e.type));
        const last = acts.at(-1);
        if (!last) return;
        if (last.seat === view.you) return music.play(last.type === 'pick' ? 'gain' : 'place');
        music.play(this.myTurn() || this.choosing() ? 'turn' : 'notify');
    }

    // ---- ヒント ----

    showHint() {
        if ((!this.myTurn() && !this.choosing()) || this.controller?.isOnline) return;
        const command = suggest(this.controller.game, this.view.you);
        if (!command) return;
        music.play('select');
        this.hint = { at: this.controller.game.commands.length, command };
        if (command.type === 'pick') {
            this.pickSel = command.index;
        } else {
            // 出す札（同じ芸者の札もあるので、手札の位置を1枚ずつ割り当てる）
            const cards = command.type === 'secret' ? [command.card] : command.type === 'compete' ? command.groups.flat() : command.cards;
            const hand = this.me().hand;
            const used = new Set();
            this.sel = cards.map(card => {
                const index = hand.findIndex((c, i) => c === card && !used.has(i));
                used.add(index);
                return index;
            });
        }
        this.render();
    }

    // おすすめの操作のボタンに .recommended を付ける。盤面が進んだら消す
    markHint() {
        const can = this.myTurn() || this.choosing();
        $('#hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        $('#hint').disabled = !can;
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const hint = this.hint;
        if (!hint || this.controller?.isOnline || hint.at !== this.controller?.game.commands.length || !can) {
            this.hint = null;
            return;
        }
        $(hint.command.type === 'pick' ? '#offer [data-act="pick"]' : '#actions [data-act="go"]')?.classList.add('recommended');
    }

    renderTop() {
        const view = this.view;
        $('#round-info').textContent = `第${this.frozen?.round ?? view.round}ラウンド`;
        $('#deck').innerHTML = `${cardBackHtml('mini')}<b>${this.frozen ? 0 : view.deckCount}</b>`;
    }

    renderStrip(selector, player) {
        const view = this.view;
        const mine = player.id === view.you;
        const active = !this.frozen && view.actor === player.id;
        const points = this.frozen ? this.frozen.points[player.id] : player.points;
        const geishas = this.frozen ? this.frozen.geishas[player.id] : player.geishas;
        const used = this.frozen ? ACTIONS : player.used;
        const pending = this.myTurn() && mine ? this.analyze()?.action : null;
        const tokens = ACTIONS.map(a => actionTokenHtml(a, { used: used.includes(a), cls: a === pending ? 'pending' : '' })).join('');
        const name = `<span class="s-name">${escapeHtml(player.name)}</span>`;
        const hand = mine ? '' : `<span id="rival-hand" class="rival-hand" title="手札">${cardBackHtml('mini')}<b>${this.frozen ? 0 : player.handCount}</b></span>`;
        const discards = mine && player.discards?.length && !this.frozen
            ? `<span id="my-discards" class="discards" title="放棄したカード">${player.discards.map(g => cardHtml(g, { cls: 'mini' })).join('')}</span>` : '';
        $(selector).className = `strip ${mine ? 'me' : 'rival'} ${active ? 'active' : ''}`;
        $(selector).innerHTML = `${name}${hand}<span class="tokens" id="${mine ? 'my-tokens' : 'rival-tokens'}">${tokens}</span>${discards}
            <span class="score" title="好意を得た芸者の点数と人数"><b>${points}</b>点<b>${geishas}</b>人</span>`;
    }

    // 芸者の列。各列は、上が相手・中央が芸者・下が自分の置いたカード
    renderBoard() {
        const view = this.view;
        const you = view.you;
        const frozen = this.frozen;
        const favor = frozen ? frozen.favor : view.favor;
        let mine, theirs;
        const ghostMine = Array(7).fill(0);
        const ghostTheirs = Array(7).fill(0);
        const secretAt = { me: null, op: null };
        if (frozen) {
            mine = frozen.counts[you];
            theirs = frozen.counts[1 - you];
            secretAt.me = frozen.secrets[you];
            secretAt.op = frozen.secrets[1 - you];
        } else {
            mine = [...this.me().placed];
            theirs = [...this.rival().placed];
            // 自分の秘密は、自分の側に伏せた札として見せる
            const secret = this.me().secret;
            if (secret !== null) {
                mine[secret]++;
                secretAt.me = secret;
            }
            // 選んでいる途中なら、置いたあとの数を点線で見せる
            if (this.choosing() && this.pickSel !== null) {
                this.offerOptions().forEach((option, i) => option.forEach(g => { (i === this.pickSel ? ghostMine : ghostTheirs)[g]++; }));
            }
        }
        const side = (counts, ghosts, who, g) => {
            const chips = [];
            for (let i = 0; i < counts[g]; i++) {
                const isSecret = secretAt[who] === g && i === counts[g] - 1;
                chips.push(chipHtml(g, isSecret ? (frozen ? 'revealed' : 'secret') : ''));
            }
            for (let i = 0; i < ghosts[g]; i++) chips.push(chipHtml(g, 'ghost'));
            const total = counts[g] + ghosts[g];
            return `<div class="side ${who}" data-side="${who}" data-g="${g}">${chips.join('')}${total ? `<span class="count">${total}</span>` : ''}</div>`;
        };
        $('#board').innerHTML = GEISHA.map((_, g) => {
            const owner = favor[g] === you ? 'favor-me' : favor[g] === 1 - you ? 'favor-op' : '';
            const moved = frozen && frozen.favorBefore[g] !== frozen.favor[g] ? 'moved' : '';
            return `<div class="col">${side(theirs, ghostTheirs, 'op', g)}${geishaHtml(g, `${owner} ${moved}`)}${side(mine, ghostMine, 'me', g)}</div>`;
        }).join('');
    }

    offerOptions() {
        const pending = this.view.pending;
        if (!pending) return [];
        return pending.type === 'gift' ? pending.cards.map(c => [c]) : pending.groups;
    }

    renderTray() {
        const view = this.view;
        const offer = $('#offer');
        const showOffer = !this.frozen && view.phase === 'choose';
        offer.hidden = !showOffer;
        $('#hand').hidden = showOffer;
        $('#actions').hidden = showOffer;
        if (showOffer) {
            this.renderOffer();
            return;
        }
        this.renderHand();
        this.renderActions();
    }

    renderHand() {
        const me = this.me();
        const mine = this.myTurn();
        const hand = this.frozen ? [] : me.hand;
        const showGroups = this.sel.length === 4;
        $('#hand').innerHTML = hand.map((card, i) => {
            const order = this.sel.indexOf(i);
            const badge = showGroups && order >= 0 ? `<span class="group-badge grp${order < 2 ? 1 : 2}">${order < 2 ? 1 : 2}</span>` : '';
            const cls = `${order >= 0 ? 'picked' : ''} ${showGroups && order >= 0 ? `grp${order < 2 ? 1 : 2}` : ''} ${mine ? 'tappable' : ''}`;
            return cardHtml(card, { cls, attrs: `data-hand="${i}" ${mine ? 'role="button"' : ''}` }).replace('</div>', `${badge}</div>`);
        }).join('');
    }

    renderActions() {
        const view = this.view;
        const cancel = '<button class="btn small ghost" data-act="cancel" aria-label="やめる">×</button>';
        const log = `<span class="act-log">${escapeHtml(this.frozen ? `第${this.frozen.round}ラウンドの終わり` : view.logs.at(-1) ?? '')}</span>`;
        if (!this.myTurn() || this.sel.length === 0) {
            $('#actions').innerHTML = log;
            return;
        }
        const action = this.analyze();
        const name = action.action ? `<span class="act-name">${ACTION_NAMES[action.action]}</span>` : '';
        const reason = action.ok ? '' : `<span class="act-reason">${action.reason}</span>`;
        const button = action.ok ? `<button class="btn small primary" data-act="go">${GO_LABELS[action.action]}</button>` : '';
        $('#actions').innerHTML = `${action.ok ? '' : name}${reason}${button}${cancel}`;
    }

    renderOffer() {
        const view = this.view;
        const pending = view.pending;
        const offerer = view.players[pending.from];
        const chooser = this.choosing();
        const kind = ACTION_NAMES[pending.type];
        const title = chooser
            ? `${escapeHtml(offerer.name)}の${kind}から${pending.type === 'gift' ? '1枚' : '1組'}取る`
            : `${escapeHtml(view.players[1 - pending.from].name)}が選んでいます`;
        const options = this.offerOptions().map((option, i) => {
            const picked = this.pickSel === i ? 'picked' : '';
            const inner = option.map(g => cardHtml(g, { attrs: `data-offer-card="${g}"` })).join('');
            return `<div class="option ${pending.type} ${picked} ${chooser ? 'tappable' : ''}" data-option="${i}" ${chooser ? 'role="button"' : ''}>${inner}</div>`;
        }).join('');
        const go = chooser ? `<button class="btn small primary" data-act="pick" ${this.pickSel === null ? 'disabled' : ''}>取る</button>` : '';
        const hand = chooser ? `<div class="offer-hand" title="あなたの手札">${this.me().hand.map(g => cardHtml(g, { cls: 'mini' })).join('')}</div>` : '';
        $('#offer').className = `offer ${chooser ? 'chooser' : 'waiting'}`;
        $('#offer').innerHTML = `<div class="offer-title">${title}</div>
            <div class="offer-row"><div class="options">${options}</div>${go}</div>${hand}`;
    }

    // ---- ダイアログ ----

    // 芸者ごとの枚数と、好意の印の行き先の表
    roundTable(event) {
        const view = this.view;
        const you = view.you;
        const rival = view.players[1 - you];
        const rows = GEISHA.map((geisha, g) => {
            const owner = event.favor[g] === you ? 'me' : event.favor[g] === 1 - you ? 'op' : '';
            return `<tr class="${owner ? `own-${owner}` : ''}">
                <td class="n op">${owner === 'op' ? markerHtml('op') : ''}${event.counts[1 - you][g]}</td>
                <th>${geishaHtml(g, 'row')}</th>
                <td class="n me">${event.counts[you][g]}${owner === 'me' ? markerHtml('me') : ''}</td></tr>`;
        }).join('');
        const secret = (seat) => (event.secrets[seat] === null ? '−' : cardHtml(event.secrets[seat], { cls: 'mini' }));
        return `<table class="score-table">
            <thead><tr><th>${escapeHtml(rival.name)}</th><th></th><th>あなた</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td class="total">${event.points[1 - you]}点・${event.geishas[1 - you]}人</td><th>合計</th><td class="total">${event.points[you]}点・${event.geishas[you]}人</td></tr></tfoot>
        </table>
        <div class="secrets"><span>${escapeHtml(rival.name)}の秘密</span>${secret(1 - you)}<span class="sep"></span><span>あなたの秘密</span>${secret(you)}</div>`;
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(event) {
        const controller = this.controller;
        if (!controller || controller.isOnline || event.winner === undefined || event.winner === null) return;
        recordResult({ game: GAME, id: `${GAME}-${controller.game.options.seed}`, outcome: outcomeFromWinners([event.winner], this.view.you, this.view.players.length) });
    }

    showRoundResult() {
        const event = this.frozen;
        if (!event || !this.controller) return;
        if (event.gameOver) {
            this.showResult(event);
            return;
        }
        $('#round-title').textContent = `第${event.round}ラウンドの結果`;
        $('#round-body').innerHTML = this.roundTable(event);
        if (!$('#round-result').open) $('#round-result').showModal();
    }

    showResult(event) {
        const view = this.view;
        const youWon = event.winner === view.you;
        $('#result-title').textContent = youWon ? 'あなたの勝ち' : `${view.players[event.winner].name}の勝ち`;
        $('#result-note').textContent = `第${event.round}ラウンドで、${event.reason === 'points' ? `${POINTS_TO_WIN}点に届きました` : `芸者${GEISHAS_TO_WIN}人の好意を得ました`}`;
        $('#result-body').innerHTML = this.roundTable(event);
        if (!$('#result').open) $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
