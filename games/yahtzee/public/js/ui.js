/**
 * 画面（タイトル・ゲーム・最後の結果・記録・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 届いたイベントのうち新しいもの（振る・記入）を、描いたあとに動きで見せる
 * 残すサイコロと選んだ欄は、画面だけが持つ（振る・記入するときに、まとめて送る）
 */

import { UPPER, LOWER, CATEGORY_NAMES, UPPER_BONUS_AT, UPPER_BONUS, faceOf } from './game.js';
import { LEVELS } from './cpu-player.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { loadRecords, bestOf } from './records.js';
import { dieSvg, miniDie, pipsSvg } from './art.js';
import { music } from './music.js';

const SETTINGS_KEY = 'yahtzee.settings';
const MAX_CPUS = 3;
const CPU_NAMES = ['ハンス', 'エマ', 'ルイ'];
const ROLL_MS = 560;            // サイコロが転がる時間
const RESULT_DELAY_MS = 1000;   // 最後の記入から、結果を出すまでの間
const MAX_ANIMATED_EVENTS = 4;  // 1回の更新で、動きを見せる出来事の数の上限（記入＋手番で2つ）
const NO_KEEP = [false, false, false, false, false];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings() {
    const fallback = { cpus: 0, level: 'normal' };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            cpus: Number.isInteger(saved.cpus) && saved.cpus >= 0 && saved.cpus <= MAX_CPUS ? saved.cpus : fallback.cpus,
            level: Object.hasOwn(LEVELS, saved.level) ? saved.level : fallback.level
        };
    } catch {
        return fallback;
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
        this.held = [...NO_KEEP];
        this.selected = null;
        this.lastRecord = null;
        this.resultTimer = null;
        this.rollTimers = [];
        this.bindStatic();
        this.renderTitleArt();
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
                onUpdate: () => this.onUpdate(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                },
                onRecord: (record) => { this.lastRecord = record; }
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.resetTurn();
        // 続きからのときは、最後に振ったときの残し方を引き継ぐ
        if (this.myTurn() && this.view.rolled && this.view.rollsLeft > 0) this.held = [...this.view.kept];
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.afterRender();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { cpus, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false }, ...CPU_NAMES.slice(0, cpus).map(name => ({ name, isCPU: true }))];
        this.startGame({ players, options: {}, level });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        this.lastRecord = null;
        clearTimeout(this.resultTimer);
        this.clearRollTimers();
        if ($('#result').open) $('#result').close();
    }

    resetTurn() {
        this.held = [...NO_KEEP];
        this.selected = null;
    }

    // ---- 固定の部品 ----

    bindStatic() {
        $('#cpus-down').addEventListener('click', () => this.changeSetting({ cpus: this.settings.cpus - 1 }));
        $('#cpus-up').addEventListener('click', () => this.changeSetting({ cpus: this.settings.cpus + 1 }));
        $('#level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (button) this.changeSetting({ level: button.dataset.level });
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
        $('#open-records').addEventListener('click', () => this.showRecords());

        // ダイアログは外側のタップと「閉じる」で閉じる（結果は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelector('.close')?.addEventListener('click', () => dialog.close());
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });

        // サイコロをタップして、残す・残さないを切り替える
        $('#dice').addEventListener('click', (event) => {
            const die = event.target.closest('[data-die]');
            if (!die || !this.canHold()) return;
            const i = Number(die.dataset.die);
            this.held[i] = !this.held[i];
            music.play(this.held[i] ? 'select' : 'cancel');
            this.renderDice();
            this.renderActions();
        });

        // 欄をタップして選ぶ。選んである欄をもう一度タップしたら記入する
        $('#sheet').addEventListener('click', (event) => {
            const row = event.target.closest('[data-cat]');
            if (!row || !this.myTurn() || !this.view.options[row.dataset.cat]) return;
            const category = row.dataset.cat;
            if (this.selected === category) {
                this.scoreSelected();
                return;
            }
            this.selected = category;
            music.play('select');
            this.renderSheet();
            this.renderActions();
        });

        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled || !this.myTurn()) return;
            if (button.dataset.act === 'roll') this.roll();
            else if (button.dataset.act === 'score') this.scoreSelected();
        });

        // 長押しでメニューが出ないようにする
        document.addEventListener('contextmenu', event => {
            if (!event.target.closest('input, textarea')) event.preventDefault();
        });
    }

    changeSetting(change) {
        const next = { ...this.settings, ...change };
        next.cpus = Math.min(MAX_CPUS, Math.max(0, next.cpus));
        this.settings = next;
        saveSettings(next);
        this.renderSetup();
    }

    renderSetup() {
        const { cpus, level } = this.settings;
        $('#cpus-value').textContent = cpus === 0 ? 'ひとりで' : `CPU ${cpus}人`;
        $('#cpus-down').disabled = cpus <= 0;
        $('#cpus-up').disabled = cpus >= MAX_CPUS;
        $('#level-row').classList.toggle('off', cpus === 0);
        $('#level').innerHTML = Object.entries(LEVELS).map(([key, label]) =>
            `<button data-level="${key}" role="radio" aria-checked="${key === level}" class="${key === level ? 'on' : ''}" ${cpus === 0 ? 'disabled' : ''}>${label}</button>`).join('');
        const best = bestOf(loadRecords());
        $('#best-line').textContent = best === null ? '' : `ハイスコア ${best}`;
    }

    renderTitleArt() {
        $('#title-art').innerHTML = [6, 6, 6, 6, 6].map((v, i) => `<span class="title-die d${i}">${dieSvg(v)}</span>`).join('');
    }

    // ---- 操作 ----

    myTurn() {
        const view = this.view;
        return !!view && view.phase === 'play' && view.turn === view.you;
    }

    canHold() {
        return this.myTurn() && this.view.rolled && this.view.rollsLeft > 0;
    }

    roll() {
        if (!this.myTurn() || this.view.rollsLeft <= 0) return;
        const keep = this.view.rolled ? [...this.held] : [...NO_KEEP];
        this.selected = null;
        this.controller?.send({ type: 'roll', keep });
    }

    scoreSelected() {
        if (!this.myTurn() || !this.selected || !this.view.options[this.selected]) return;
        this.controller?.send({ type: 'score', category: this.selected });
    }

    // ---- 更新 ----

    onUpdate() {
        if (!this.controller) return;
        const before = this.view;
        this.view = this.controller.getView();
        const fresh = this.view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = this.view.events.at(-1)?.seq ?? this.lastSeq;
        if (fresh.some(e => e.type === 'turn' || e.type === 'score')) this.resetTurn();
        this.hintCommand = null;
        this.playSound(fresh);
        this.render();
        this.animate(fresh, before);
        this.afterRender();
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、ほかの人が書いたら notify、自分の番になったら turn、終わりは勝ち負け
    playSound(fresh) {
        const view = this.view;
        if (fresh.length === 0) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(view.you) ? 'win' : 'lose');
        const score = fresh.find(e => e.type === 'score');
        if (score?.seat === view.you) return music.play(score.points > 0 ? 'gain' : 'pay');
        if (fresh.some(e => e.type === 'roll' && e.seat === view.you)) return music.play('dice');
        const turn = fresh.find(e => e.type === 'turn');
        if (turn?.seat === view.you) return music.play('turn');
        if (score) music.play('notify');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        // 残すサイコロ・書く欄を選んだ状態にする（下のボタンで決められる）
        if (command.type === 'roll' && this.view.rolled) this.held = [...command.keep];
        if (command.type === 'score') this.selected = command.category;
        this.render();
        const kept = command.keep?.filter(Boolean).length ?? 0;
        this.toast(command.type === 'score'
            ? `おすすめ：「${CATEGORY_NAMES[command.category]}」に書く`
            : this.view.rolled ? `おすすめ：印の${kept}個を残して振る` : 'おすすめ：振る');
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const selectors = c.type === 'score'
            ? [`[data-cat="${c.category}"]`, '[data-act="score"]']
            : ['[data-act="roll"]', ...(this.view.rolled ? c.keep.map((k, i) => (k ? `[data-die="${i}"]` : null)).filter(Boolean) : [])];
        selectors.forEach(s => document.querySelectorAll(s).forEach(el => el.classList.add('recommended')));
    }

    animate(events, before) {
        // 一度にたくさん届いたとき（裏のタブから戻ったときなど）は、動かさずに今の状態だけを見せる
        if (events.length > MAX_ANIMATED_EVENTS) return;
        events.forEach(event => {
            if (event.type === 'roll') {
                this.rollDice(event.keep);
            } else if (event.type === 'score') {
                this.flashCell(event.seat, event.category);
                const prevTotals = before?.players[event.seat]?.totals;
                const nowTotals = this.view.players[event.seat].totals;
                const who = event.seat === this.view.you ? '' : `${this.view.players[event.seat].name}：`;
                if (event.bonus > 0) this.banner(`${who}ヤッツィーボーナス +${event.bonus}`);
                else if (event.category === 'yahtzee' && event.points === 50) this.banner(`${who}ヤッツィー！`);
                else if (prevTotals && prevTotals.upperBonus === 0 && nowTotals.upperBonus > 0) this.banner(`${who}上段ボーナス +${UPPER_BONUS}`);
            }
        });
    }

    // 振ったサイコロを転がす。目を何度か入れ替えてから、本当の目で止める
    rollDice(keep) {
        this.clearRollTimers();
        if (reducedMotion()) return;
        const sheet = $('#sheet');
        sheet.classList.add('rolling');
        this.rollTimers.push(setTimeout(() => sheet.classList.remove('rolling'), ROLL_MS));
        document.querySelectorAll('#dice [data-die]').forEach((el, i) => {
            if (keep[i]) return;
            const pips = el.querySelector('.pips');
            const final = pips.innerHTML;
            const swap = setInterval(() => { pips.innerHTML = pipsSvg(1 + Math.floor(Math.random() * 6)); }, 75);
            this.rollTimers.push(swap, setTimeout(() => {
                clearInterval(swap);
                pips.innerHTML = final;
            }, ROLL_MS - 60 - i * 20));
            const spin = (i % 2 ? 1 : -1) * (300 + i * 40);
            el.querySelector('.die-face').animate([
                { transform: `translateY(-34px) rotate(${spin}deg) scale(.7)`, opacity: 0.4 },
                { transform: `translateY(4px) rotate(${spin * 0.15}deg) scale(1.04)`, offset: 0.65 },
                { transform: 'translateY(0) rotate(0) scale(1)', opacity: 1 }
            ], { duration: ROLL_MS - i * 20, delay: i * 20, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'backwards' });
        });
    }

    clearRollTimers() {
        this.rollTimers.forEach(timer => { clearTimeout(timer); clearInterval(timer); });
        this.rollTimers = [];
        $('#sheet')?.classList.remove('rolling');
    }

    flashCell(seat, category) {
        const cell = document.querySelector(`[data-cell="${seat}-${category}"]`);
        if (!cell || reducedMotion()) return;
        cell.animate([
            { backgroundColor: 'rgba(255, 196, 92, .75)', transform: 'scale(1.18)' },
            { backgroundColor: 'rgba(255, 196, 92, 0)', transform: 'scale(1)' }
        ], { duration: 900, easing: 'ease-out' });
    }

    // 描いたあと：終わったら結果を出す
    afterRender() {
        if (this.view.phase === 'end' && !$('#result').open) {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    // ---- 描く ----

    render() {
        if (!this.view) return;
        this.renderTop();
        this.renderSheet();
        this.renderDice();
        this.renderActions();
        this.markHint();
    }

    renderTop() {
        const view = this.view;
        const round = Math.min(view.round, view.rounds);
        $('#round-info').innerHTML = view.phase === 'end'
            ? '<b>終了</b>'
            : `<b>${round}</b><small>/ ${view.rounds}回目</small>`;
    }

    renderSheet() {
        const view = this.view;
        const multi = view.players.length > 1;
        const sheet = $('#sheet');
        sheet.style.setProperty('--players', view.players.length);
        sheet.classList.toggle('multi', multi);
        const head = multi
            ? `<div class="srow head"><span class="label"></span>${view.players.map(p =>
                `<span class="cell name ${view.turn === p.id ? 'cur' : ''} ${p.id === view.you ? 'mine' : ''}">${escapeHtml(p.name)}</span>`).join('')}</div>`
            : '';
        const catRow = (category) => {
            const legal = this.myTurn() && !!view.options[category];
            const label = UPPER.includes(category)
                ? `${miniDie(faceOf(category))}<span>${CATEGORY_NAMES[category]}</span>`
                : `<span>${CATEGORY_NAMES[category]}</span>`;
            return `<div class="srow cat ${legal ? 'legal' : ''} ${this.selected === category ? 'selected' : ''}" data-cat="${category}" ${legal ? 'role="button"' : ''}>
                <span class="label">${label}</span>${view.players.map(p => this.cellHtml(p, category)).join('')}</div>`;
        };
        const bonusRow = `<div class="srow sum bonus"><span class="label"><span>ボーナス</span><small>${UPPER_BONUS_AT}点で+${UPPER_BONUS}</small></span>${view.players.map(p => {
            const upperDone = UPPER.every(c => p.scores[c] !== null);
            const text = p.totals.upperBonus > 0 ? `<b class="got">+${UPPER_BONUS}</b>`
                : upperDone ? '<span class="muted">0</span>'
                    : `<span class="progress">${p.totals.upper}<small>/${UPPER_BONUS_AT}</small></span>`;
            return `<span class="cell ${view.turn === p.id ? 'cur' : ''}">${text}</span>`;
        }).join('')}</div>`;
        const totalRow = `<div class="srow sum total"><span class="label"><span>合計</span></span>${view.players.map(p =>
            `<span class="cell ${view.turn === p.id ? 'cur' : ''} ${view.winners.includes(p.id) ? 'win' : ''}"><b>${p.totals.total}</b></span>`).join('')}</div>`;
        sheet.innerHTML = head + UPPER.map(catRow).join('') + bonusRow + LOWER.map(catRow).join('') + totalRow;
    }

    cellHtml(player, category) {
        const view = this.view;
        const cur = view.turn === player.id ? 'cur' : '';
        const value = player.scores[category];
        const attrs = `data-cell="${player.id}-${category}"`;
        if (value !== null) {
            const extra = category === 'yahtzee' && player.yahtzeeBonus > 0 ? `<sup>+${player.yahtzeeBonus * 100}</sup>` : '';
            return `<span class="cell filled ${cur} ${value === 0 ? 'zero' : ''}" ${attrs}>${value}${extra}</span>`;
        }
        const option = player.id === view.you && view.turn === view.you ? view.options[category] : null;
        if (option) {
            const bonus = option.bonus > 0 ? `<sup>+${option.bonus}</sup>` : '';
            return `<span class="cell ${cur}" ${attrs}><span class="preview ${option.points === 0 ? 'zero' : ''}">${option.points}${bonus}</span></span>`;
        }
        return `<span class="cell ${cur}" ${attrs}></span>`;
    }

    renderDice() {
        const view = this.view;
        const mine = this.myTurn();
        const held = mine ? this.held : view.kept;
        const holdable = this.canHold();
        $('#dice').classList.toggle('holdable', holdable);
        $('#dice').innerHTML = view.dice.map((value, i) => {
            const isHeld = view.rolled && held[i];
            return `<button class="die ${isHeld ? 'held' : ''}" data-die="${i}" ${holdable ? '' : 'tabindex="-1"'}
                aria-label="${value === 0 ? 'まだ振っていません' : `${value}${isHeld ? '（残す）' : ''}`}" aria-pressed="${isHeld}">
                ${dieSvg(value)}<span class="keep-tag">残す</span></button>`;
        }).join('');
    }

    renderActions() {
        const view = this.view;
        let html = '';
        if (this.myTurn()) {
            const allHeld = view.rolled && this.held.every(Boolean);
            const canRoll = view.rollsLeft > 0 && !allHeld;
            const pips = Array.from({ length: view.rolls }, (_, i) => `<i class="${i < view.rollsLeft ? 'on' : ''}"></i>`).join('');
            const option = this.selected ? view.options[this.selected] : null;
            const rollLabel = !view.rolled ? '振る' : view.rollsLeft === 0 ? '振り終わり' : allHeld ? '全部残しています' : '振り直す';
            const scoreLabel = option
                ? `<span class="act-cat">${CATEGORY_NAMES[this.selected]}</span><b>${option.points}</b>${option.bonus ? `<small>+${option.bonus}</small>` : ''}`
                : `<span>${!view.rolled ? '記入' : view.joker ? 'ジョーカー：欄を選ぶ' : '欄を選んで記入'}</span>`;
            html = `<button class="btn roll ${view.rolled ? 'secondary' : 'primary'}" data-act="roll" ${canRoll ? '' : 'disabled'}>
                    <span>${rollLabel}</span><span class="roll-pips" aria-label="残り${view.rollsLeft}回">${pips}</span></button>
                <button class="btn score ${option ? 'primary' : 'secondary'}" data-act="score" ${option ? '' : 'disabled'}>${scoreLabel}</button>`;
        } else if (view.phase === 'play') {
            const name = escapeHtml(view.players[view.turn].name);
            html = `<span class="act-label">${name}の番<span class="thinking" aria-hidden="true"><i></i><i></i><i></i></span></span>`;
        }
        $('#actions').innerHTML = html;
    }

    // ---- 結果と記録 ----

    showResult() {
        const view = this.view;
        if (!view || view.phase !== 'end' || $('#result').open) return;
        const me = view.results[view.you];
        const multi = view.players.length > 1;
        const youWon = view.winners.includes(view.you);
        $('#result-title').textContent = !multi ? `${me.total}点`
            : youWon ? (view.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち')
                : `${view.winners.map(id => view.players[id].name).join('と')}の勝ち`;
        const record = this.lastRecord;
        $('#result-record').innerHTML = !record ? ''
            : record.best ? '<b class="new-best">自己ベスト更新</b>'
                : record.rank ? `記録の${record.rank}位に入りました（自己ベスト ${bestOf(record.records)}）`
                    : `自己ベスト ${bestOf(record.records)}`;
        const ranked = [...view.results].sort((a, b) => b.total - a.total);
        $('#result-list').innerHTML = ranked.map(r => `<li class="${multi && view.winners.includes(r.seat) ? 'winner' : ''} ${r.seat === view.you ? 'mine' : ''}">
            <span class="r-name">${escapeHtml(view.players[r.seat].name)}</span>
            <span class="r-calc">上段 ${r.upper}${r.upperBonus ? `+${r.upperBonus}` : ''}・下段 ${r.lower}${r.yahtzeeBonus ? `+${r.yahtzeeBonus}` : ''}</span>
            <b class="r-score">${r.total}</b></li>`).join('');
        $('#result').showModal();
    }

    showRecords() {
        const records = loadRecords();
        const average = records.plays > 0 ? Math.round(records.sum / records.plays) : null;
        $('#records-summary').textContent = records.plays === 0
            ? 'まだ記録はありません'
            : `${records.plays}回遊びました・平均 ${average}点`;
        $('#records-list').innerHTML = records.top.map((r, i) => {
            const mode = r.opponents > 0 ? `CPU ${r.opponents}人・${LEVELS[r.level] ?? ''}${r.won ? '・勝ち' : ''}` : 'ひとり';
            return `<li><span class="rank">${i + 1}</span><b>${r.score}</b><span class="muted">${escapeHtml(r.date ?? '')}</span><span class="muted mode">${mode}</span></li>`;
        }).join('');
        $('#records').showModal();
    }

    banner(text) {
        const el = $('#banner');
        el.textContent = text;
        el.classList.remove('show');
        void el.offsetWidth; // 続けて出すときも、動きを始めからにする
        el.classList.add('show');
        clearTimeout(this.bannerTimer);
        this.bannerTimer = setTimeout(() => el.classList.remove('show'), 1600);
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }
}
