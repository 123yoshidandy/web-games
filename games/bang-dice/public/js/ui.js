/**
 * 画面（タイトル・ゲーム・ダイアログ）
 * 画面はビューだけを見て描く。操作はコントローラーの send() に渡す
 */

import { suggest } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CHARACTER_BY_ID, ROLE_NAMES, FACE_NAMES, MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import { installSymbols, faceSvg, icon, LINE_ICONS } from './art.js';
import { HELP_HTML } from './help.js';
import { music } from './music.js';

const SETTINGS_KEY = 'bang-dice.settings';
const CPU_NAMES = ['ジョー', 'ハンク', 'ケイト', 'ビリー', 'モリー', 'ネッド', 'エラ'];
const SIDE_NAMES = { law: '保安官と副保安官', outlaw: '無法者', renegade: '裏切り者', deputy: '副保安官' };

// 席の置き場（席の中心の位置。% で、席の枠の半分だけ内側に寄せた範囲の中）
const BOTTOM = { x: 50, y: 100 };
const LEFT = (y) => ({ x: 0, y });
const RIGHT = (y) => ({ x: 100, y });
const TOP = (x) => ({ x, y: 0 });
const SEAT_SLOTS = {
    3: [BOTTOM, { x: 12, y: 18 }, { x: 88, y: 18 }],
    4: [BOTTOM, LEFT(45), TOP(50), RIGHT(45)],
    5: [BOTTOM, LEFT(58), TOP(20), TOP(80), RIGHT(58)],
    6: [BOTTOM, LEFT(68), LEFT(24), TOP(50), RIGHT(24), RIGHT(68)],
    7: [BOTTOM, LEFT(70), LEFT(34), TOP(20), TOP(80), RIGHT(34), RIGHT(70)],
    8: [BOTTOM, LEFT(72), LEFT(38), TOP(0), TOP(50), TOP(100), RIGHT(38), RIGHT(72)]
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: Number.isInteger(s.count) && s.count >= MIN_PLAYERS && s.count <= MAX_PLAYERS ? s.count : 5,
            level: s.level === 'easy' ? 'easy' : 'normal'
        };
    } catch {
        return { count: 5, level: 'normal' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

export const roleBadge = (role, { small = false } = {}) => {
    if (!role) return `<span class="role-badge unknown${small ? ' small' : ''}" title="役割は分かりません">?</span>`;
    return `<span class="role-badge ${role}${small ? ' small' : ''}" title="${ROLE_NAMES[role]}">${role === 'sheriff' ? icon('i-star') : ROLE_NAMES[role].slice(0, 1)}</span>`;
};

export default class UI {
    constructor() {
        installSymbols($('symbols'));
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.reroll = new Set();      // 振り直すダイス
        this.selectedDie = null;      // 使うダイス（1・2）
        this.double = false;          // スラブ・ザ・キラーの2倍
        this.lastSeq = 0;             // 演出を済ませたイベントの番号
        this.resultShown = false;
        $('home').innerHTML = LINE_ICONS.home;
        $('open-log').innerHTML = LINE_ICONS.log;
        $('open-help-game').innerHTML = LINE_ICONS.help;
        $('pile-icon').innerHTML = icon('i-arrow');
        $('help-body').innerHTML = HELP_HTML;
        $('title-art').innerHTML = ['1', 'dynamite', 'beer', 'gatling', 'arrow'].map(f => `<span class="die big">${faceSvg(f)}</span>`).join('');
        this.bindTitle();
        this.bindGame();
        // 長押しのメニューを出さない
        document.addEventListener('contextmenu', event => event.preventDefault());
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
        $('count-value').textContent = `${this.settings.count}人`;
        $('count-down').disabled = this.settings.count <= MIN_PLAYERS;
        $('count-up').disabled = this.settings.count >= MAX_PLAYERS;
        $('level').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === this.settings.level));
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
        this.reroll.clear();
        this.selectedDie = null;
        this.double = false;
        this.resultShown = false;
        this.controller = new LocalGameController(setup, {
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            }
        });
        this.lastSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    // ---- ゲーム ----

    bindGame() {
        $('home').addEventListener('click', () => this.showTitle());
        $('open-log').addEventListener('click', () => this.openLog());
        $('open-help-game').addEventListener('click', () => this.openDialog('help'));
        $('seats').addEventListener('click', event => {
            const seat = event.target.closest('.seat');
            if (seat) this.tapSeat(Number(seat.dataset.seat));
        });
        $('hint').addEventListener('click', () => this.showHint());
        $('dice').addEventListener('click', event => {
            const die = event.target.closest('.die');
            if (die) this.tapDie(Number(die.dataset.die));
        });
        $('actions').addEventListener('click', event => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act, button.dataset.value);
        });
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('.close').forEach(b => b.addEventListener('click', () => dialog.close()));
            // 外側を押したら閉じる
            dialog.addEventListener('click', event => {
                if (event.target === dialog && dialog.id !== 'result') dialog.close();
            });
            dialog.addEventListener('close', () => {
                if (!document.querySelector('dialog[open]')) this.controller?.resume();
            });
        });
        $('again').addEventListener('click', () => {
            $('result').close();
            this.start();
        });
        $('result-home').addEventListener('click', () => this.showTitle());
    }

    openDialog(id) {
        this.controller?.pause();
        const dialog = $(id);
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.help-body, .log-list')?.scrollTo?.(0, 0);
    }

    openLog() {
        const view = this.controller.getView();
        $('log-list').innerHTML = view.logs.map(l => `<li class="${l.turn !== null ? 'turn-head' : l.minor ? 'minor' : ''}">${escapeHtml(l.text)}</li>`).join('');
        this.openDialog('log-dialog');
        const list = $('log-list');
        list.scrollTop = list.scrollHeight;
    }

    // 今の自分の選び方（null なら選ぶものがない）
    // { kind: 'sid'|'shoot'|'beer'|'kit', targets: [席], die }
    choice(view) {
        const me = view.you;
        if (view.phase === 'end' || view.pending || !view.actors.includes(me)) return null;
        const t = view.turn;
        const alive = view.players.filter(p => p.alive).map(p => p.id);
        if (t.stage === 'sid') return { kind: 'sid', targets: alive };
        if (t.stage !== 'resolve' || !view.options) return null;
        const o = view.options;
        if (o.shots.length > 0) {
            const die = o.shots.includes(this.selectedDie) ? this.selectedDie : o.shots[0];
            return { kind: 'shoot', die, targets: o.targets[die] };
        }
        if (o.beers.length > 0) return { kind: 'beer', die: o.beers[0], targets: alive };
        if (o.kits.length > 0) return { kind: 'kit', die: o.kits[0], targets: view.players.filter(p => p.alive && p.arrows > 0).map(p => p.id) };
        return null;
    }

    tapSeat(seat) {
        const view = this.view;
        const choice = this.choice(view);
        if (choice && choice.targets.includes(seat)) {
            if (choice.kind === 'sid') return this.send({ type: 'sid', target: seat });
            if (choice.kind === 'shoot') {
                const beers = view.options.beers;
                const double = this.double && beers.length > 0 ? beers[0] : null;
                this.double = false;
                return this.send({ type: 'shoot', die: choice.die, target: seat, double });
            }
            if (choice.kind === 'beer') return this.send({ type: 'beer', die: choice.die, target: seat });
            if (choice.kind === 'kit') return this.send({ type: 'kit', die: choice.die, target: seat });
        }
        this.showPlayer(seat);
    }

    tapDie(index) {
        const view = this.view;
        const t = view.turn;
        if (!view.actors.includes(view.you) || view.pending) return;
        if (t.stage === 'roll' && t.rolls > 0) {
            const blackjack = view.players[view.you].character === 'blackjack';
            if (t.dice[index] === 'dynamite' && !blackjack) {
                music.play('error');
                return this.toast('ダイナマイトは振り直せません');
            }
            music.play(this.reroll.has(index) ? 'cancel' : 'select');
            if (this.reroll.has(index)) this.reroll.delete(index);
            else this.reroll.add(index);
            return this.render();
        }
        if (t.stage === 'resolve' && view.options?.shots.includes(index)) {
            this.selectedDie = index;
            this.render();
        }
    }

    act(action, value) {
        if (action === 'roll') {
            const t = this.view.turn;
            const command = t.rolls === 0 ? { type: 'roll' } : { type: 'roll', dice: [...this.reroll].sort() };
            this.reroll.clear();
            return this.send(command);
        }
        if (action === 'stop') {
            this.reroll.clear();
            return this.send({ type: 'stop' });
        }
        if (action === 'double') {
            this.double = !this.double;
            return this.render();
        }
        if (action === 'kit-skip') return this.send({ type: 'kit', die: this.choice(this.view).die, target: null });
        if (action === 'bart' || action === 'pedro') return this.send({ type: action, arrows: Number(value) });
    }

    // ヒント：CPU（ふつう）が選ぶ操作を、選んだ状態にするか、押すものに印を付けて見せる
    showHint() {
        const view = this.view;
        const command = view && suggest(view);
        if (!command) return this.toast('自分の番になったら、おすすめを出せます');
        const nameOf = (seat) => (seat === view.you ? 'あなた' : view.players[seat].name);
        const mark = (selector) => document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
        let text = '';
        if (command.type === 'roll' && view.turn.rolls > 0) {
            this.reroll = new Set(command.dice);
            this.render();
            mark('#actions [data-act="roll"]');
            text = '選んだダイスを振り直す';
        } else if (command.type === 'roll') {
            mark('#actions [data-act="roll"]');
            text = '振る';
        } else if (command.type === 'stop') {
            this.reroll.clear();
            this.render();
            mark('#actions [data-act="stop"]');
            text = 'このまま決定';
        } else if (command.type === 'shoot') {
            this.selectedDie = command.die;
            this.double = command.double !== null && command.double !== undefined;
            this.render();
            mark(`#seats [data-seat="${command.target}"]`);
            text = `${nameOf(command.target)}を撃つ${this.double ? '（ビールで2倍）' : ''}`;
        } else if (command.type === 'bart' || command.type === 'pedro') {
            mark(`#actions [data-act="${command.type}"][data-value="${command.arrows}"]`);
            text = '光るボタンを押す';
        } else if (command.target === null || command.target === undefined) {
            mark('#actions [data-act="kit-skip"]');
            text = '使わない';
        } else {
            mark(`#seats [data-seat="${command.target}"]`);
            const verb = { beer: 'にビール', kit: 'に救急箱', sid: 'を回復' }[command.type] ?? 'を選ぶ';
            text = `${nameOf(command.target)}${verb}`;
        }
        this.toast(`おすすめ：${text}`);
    }

    send(command) {
        if (!this.controller) return;
        this.controller.send(command);
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        this.view = view;
        const me = view.players[view.you];
        if (view.turn.stage !== 'roll' || !view.actors.includes(view.you)) this.reroll.clear();
        if (view.turn.stage !== 'resolve') this.selectedDie = null;
        $('my-role').innerHTML = `${roleBadge(me.role)}<span>${ROLE_NAMES[me.role]}</span>`;
        $('pile-count').textContent = view.arrowPile;
        this.renderSeats(view);
        this.renderTicker(view);
        this.renderMe(view);
        this.renderTurn(view);
        this.playEvents(view);
        if (view.phase === 'end' && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 900);
        }
    }

    // 自分を下の中央に置き、手番の順（時計回り）に左の列 → 上の行 → 右の列へ並べる
    seatPosition(view, seat) {
        const n = view.players.length;
        const r = (seat - view.you + n) % n;
        return SEAT_SLOTS[n][r];
    }

    renderSeats(view) {
        const choice = this.choice(view);
        const t = view.turn;
        const shooter = t.seat;
        $('seats').innerHTML = view.players.map(p => {
            const pos = this.seatPosition(view, p.id);
            const ch = CHARACTER_BY_ID[p.character];
            const dist = p.alive && p.id !== shooter && view.players[shooter].alive ? distanceOf(view, shooter, p.id) : null;
            const classes = ['seat'];
            if (p.id === view.you) classes.push('self');
            if (!p.alive) classes.push('dead');
            if (p.id === t.seat && view.phase !== 'end') classes.push('current');
            if (choice?.targets.includes(p.id)) classes.push('target');
            if (view.pending?.seat === p.id) classes.push('waiting');
            if (view.phase === 'end' && view.winners.includes(p.id)) classes.push('winner');
            const lifePct = Math.round(p.life / p.maxLife * 100);
            // 1・2 の相手を決めた途中（まだ撃っていない）なら、狙った数を出す
            const aimed = t.shots.filter(s => s.target === p.id).reduce((sum, s) => sum + s.amount, 0);
            return `<button class="${classes.join(' ')}" data-seat="${p.id}" style="left:${pos.x}%;top:${pos.y}%" aria-label="${escapeHtml(p.name)}">
                <span class="seat-head">${roleBadge(p.role, { small: true })}<span class="seat-name">${escapeHtml(p.name)}</span>${dist !== null ? `<span class="dist" title="${escapeHtml(view.players[shooter].name)}からの距離">${dist}</span>` : ''}</span>
                <span class="seat-char">${ch.short}</span>${aimed > 0 ? `<b class="aim">狙い${aimed}</b>` : ''}
                <span class="seat-stats">${p.alive
                    ? `<span class="life${lifePct <= 34 ? ' low' : ''}">${icon('i-heart')}${p.life}<small>/${p.maxLife}</small></span><span class="arrows${p.arrows > 0 ? '' : ' none'}">${icon('i-arrow')}${p.arrows}</span>`
                    : '<span class="out">脱落</span>'}</span>
            </button>`;
        }).join('');
    }

    renderTicker(view) {
        const lines = view.logs.filter(l => l.turn === null && !l.minor).slice(-3);
        $('ticker').innerHTML = lines.map(l => `<li>${escapeHtml(l.text)}</li>`).join('');
    }

    renderMe(view) {
        const me = view.players[view.you];
        const ch = CHARACTER_BY_ID[me.character];
        $('me').innerHTML = `<span class="me-name">${ch.name}</span><span class="me-ability">${ch.ability}</span>`;
    }

    renderTurn(view) {
        const t = view.turn;
        const me = view.you;
        const mine = view.actors.includes(me) && view.phase !== 'end';
        const turnName = t.seat === me ? 'あなた' : view.players[t.seat].name;
        const choice = this.choice(view);
        let prompt = '';
        let actions = '';

        if (view.phase === 'end') {
            prompt = 'ゲーム終了';
            actions = '<button class="btn primary" data-act="result">結果を見る</button>';
        } else if (view.pending?.type === 'pedro' && view.pending.seat === me) {
            const n = view.pending.max;
            prompt = '体力を失った。矢を捨てる？';
            actions = Array.from({ length: n + 1 }, (_, k) => n - k)
                .map(k => `<button class="btn ${k > 0 ? 'primary' : 'secondary'} small" data-act="pedro" data-value="${k}">${k > 0 ? `矢を${k}本捨てる` : '捨てない'}</button>`).join('');
        } else if (view.pending && view.pending.seat === me) {
            const n = view.pending.max;
            prompt = `${view.pending.amount}点のダメージ。矢を取って体力を守る？`;
            actions = Array.from({ length: n + 1 }, (_, k) => n - k)
                .map(k => `<button class="btn ${k > 0 ? 'primary' : 'secondary'} small" data-act="bart" data-value="${k}">${k > 0 ? `矢を${k}本取る` : '体力で受ける'}</button>`).join('');
        } else if (view.pending) {
            prompt = `${view.players[view.pending.seat].name}の判断を待っています`;
        } else if (!mine) {
            prompt = `${turnName}の番`;
        } else if (t.stage === 'sid') {
            prompt = 'シド：回復させる人を選ぶ';
        } else if (t.stage === 'roll' && t.rolls === 0) {
            prompt = 'あなたの番';
            actions = '<button class="btn primary" data-act="roll">振る</button>';
        } else if (t.stage === 'roll') {
            const left = t.maxRolls - t.rolls;
            prompt = `振り直すダイスを選ぶ（あと${left}回）`;
            actions = `<button class="btn secondary" data-act="roll" ${this.reroll.size === 0 ? 'disabled' : ''}>振り直す</button><button class="btn primary" data-act="stop">決定</button>`;
        } else if (choice?.kind === 'shoot') {
            const face = t.dice[choice.die];
            prompt = `${face}：撃つ相手を選ぶ`;
            if (view.players[me].character === 'slab' && !t.slabUsed && view.options.beers.length > 0) {
                actions = `<button class="btn ${this.double ? 'primary' : 'secondary'} small" data-act="double">ビールで2倍${this.double ? '（ON）' : ''}</button>`;
            }
        } else if (choice?.kind === 'beer') {
            prompt = 'ビール：回復させる人を選ぶ';
        } else if (choice?.kind === 'kit') {
            prompt = 'ガトリング：矢を1本捨てさせる人を選ぶ';
            actions = '<button class="btn secondary small" data-act="kit-skip">使わない</button>';
        }
        $('prompt').textContent = prompt;
        $('prompt').classList.toggle('mine', mine);
        $('actions').innerHTML = actions;
        if (view.phase === 'end') $('actions').querySelector('[data-act="result"]').addEventListener('click', () => this.showResult());

        const used = t.used;
        const blackjack = view.players[t.seat].character === 'blackjack';
        $('dice').classList.toggle('others', t.seat !== me);
        $('dice').innerHTML = t.dice.map((face, i) => {
            const classes = ['die'];
            if (!face) classes.push('blank');
            if (used[i] || (face === 'gatling' && t.kitDone[i])) classes.push('used');
            if (face === 'dynamite' && !blackjack) classes.push('locked');
            if (this.reroll.has(i)) classes.push('reroll');
            if (choice?.kind === 'shoot' && choice.die === i) classes.push('selected');
            if (choice?.kind === 'beer' && choice.die === i) classes.push('selected');
            if (choice?.kind === 'kit' && choice.die === i) classes.push('selected');
            if (this.double && choice?.kind === 'shoot' && view.options.beers[0] === i) classes.push('selected');
            return `<button class="${classes.join(' ')}" data-die="${i}" aria-label="${face ? FACE_NAMES[face] : '未'}">${faceSvg(face)}</button>`;
        }).join('');
    }

    // 新しいイベントの演出（体力の増減・矢・襲撃・脱落）
    playEvents(view) {
        const fresh = view.events.filter(e => e.seq > this.lastSeq);
        if (fresh.length === 0) return;
        this.lastSeq = fresh.at(-1).seq;
        this.playSound(view, fresh);
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        fresh.forEach(e => {
            if (e.type === 'damage') this.float(e.target, `−${e.amount}`, 'hurt');
            if (e.type === 'heal' && e.amount > 0) this.float(e.target, `+${e.amount}`, 'heal');
            if (e.type === 'arrow') this.float(e.seat, '+矢', 'arrow');
            if (e.type === 'indians') this.toast('インディアンの襲撃！');
            if (e.type === 'gatling') this.toast(`${view.players[e.seat].name}のガトリング！`);
            if (e.type === 'eliminate') this.toast(`${view.players[e.seat].name}が脱落（${ROLE_NAMES[e.role]}）`);
            if (e.type === 'roll' && !reduce && e.seq === fresh.filter(x => x.type === 'roll').at(-1)?.seq) {
                e.rolled.forEach(i => $('dice').querySelector(`[data-die="${i}"]`)?.classList.add('rolling'));
            }
        });
    }

    // 効果音：1回の更新に1つだけ、大事な順に選んで鳴らす。CPU の細かい手（ロールなど）は鳴らさない
    playSound(view, fresh) {
        const me = view.you;
        const mine = (type) => fresh.some(e => e.type === type && e.seat === me);
        if (fresh.some(e => e.type === 'end')) return music.play(view.winners.includes(me) ? 'win' : 'lose');
        if (fresh.some(e => e.type === 'turn' && e.seat === me)) return music.play('turn');
        if (fresh.some(e => e.type === 'damage' && e.target === me)) return music.play('pay');
        if (mine('roll')) return music.play('dice');
        if (mine('shot') || mine('gatling')) return music.play('capture');
        if (fresh.some(e => e.type === 'heal' && e.target === me && e.amount > 0)) return music.play('gain');
        if (fresh.some(e => e.seat === me)) return music.play('place');
        if (fresh.some(e => ['eliminate', 'indians', 'gatling'].includes(e.type))) music.play('notify');
    }

    float(seat, text, kind) {
        const el = $('seats').querySelector(`[data-seat="${seat}"]`);
        if (!el) return;
        const f = document.createElement('span');
        f.className = `float ${kind}`;
        f.textContent = text;
        el.appendChild(f);
        if (kind === 'hurt') el.classList.add('hit');
        setTimeout(() => f.remove(), 1200);
    }

    showPlayer(seat) {
        const view = this.view;
        const p = view.players[seat];
        const ch = CHARACTER_BY_ID[p.character];
        const dist = seat === view.you ? null : distanceOf(view, view.you, seat);
        $('player-body').innerHTML = `
            <h2 tabindex="-1" autofocus>${escapeHtml(p.name)}</h2>
            <p class="pd-role">${roleBadge(p.role)}<span>${p.role ? ROLE_NAMES[p.role] : '役割は分かりません'}${p.alive ? '' : '（脱落）'}</span></p>
            <p class="pd-char"><b>${ch.name}</b>（体力${ch.life}${p.role === 'sheriff' ? '＋保安官2' : ''}）</p>
            <p class="pd-ability">${ch.ability}</p>
            <p class="pd-stats">${icon('i-heart')}${p.life}/${p.maxLife}　${icon('i-arrow')}${p.arrows}${dist !== null && p.alive && view.players[view.you].alive ? `　あなたからの距離 ${dist}` : ''}</p>`;
        this.openDialog('player-dialog');
    }

    showResult() {
        const view = this.controller?.getView();
        if (!view || view.phase !== 'end') return;
        const won = view.winners.includes(view.you);
        $('result-title').textContent = won ? 'あなたの勝ち！' : 'あなたの負け';
        $('result-sub').textContent = view.winnerSide ? `${SIDE_NAMES[view.winnerSide]}の勝ちです` : '勝った人はいません';
        $('result-table').innerHTML = view.players.map(p => `<tr class="${view.winners.includes(p.id) ? 'win' : ''}">
            <td>${roleBadge(p.role, { small: true })}${escapeHtml(p.name)}</td><td>${ROLE_NAMES[p.role]}</td><td>${CHARACTER_BY_ID[p.character].short}</td><td>${p.alive ? `${icon('i-heart')}${p.life}` : '脱落'}</td></tr>`).join('');
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

// 左右の近いほうの距離。前の手番までに脱落した人は飛ばす（ゲームの distance と同じ）
function distanceOf(view, from, to) {
    const order = view.turn?.seated ?? view.players.filter(p => p.alive).map(p => p.id);
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0) return null;
    const d = Math.abs(a - b);
    return Math.min(d, order.length - d);
}
