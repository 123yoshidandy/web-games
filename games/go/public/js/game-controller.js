/**
 * ローカル対戦（CPU 戦と、2人で1台を使う対戦）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * 待った（undo）は、記録を縮めて再現し直す。人の最後の着手（打つ・パス）と、そのあとの CPU の手や死に石の指定をまとめて戻す
 *
 * CPU の読みは重い（19路で1秒ほど）ので、ブラウザでは Web Worker（cpu-worker.js）で考えさせ、画面を止めない
 * Worker が使えない環境（テスト）では、その場で考える
 *
 * 持ち時間：手番が始まった時刻（端末の時刻）を game.turnStartedAt に入れ、操作のたびにかかった時間を渡す
 * 時間を使い切ったら、タイマーで時間切れにする。CPU 戦では、アプリが隠れている間（pause〜resume）時計を止める（2人で遊ぶときは止めない）
 * 「続きから」と待ったでは、その手番の時計は0から数え直す
 */

import Game from './game.js';
import { createGameView, clockView } from './game-view.js';
import { runCpuStep, applyDecision, isCpuTurn, cpuSeat, clockBudget } from './cpu-player.js';

const CPU_MOVE_MS = 450;      // 前の手が見えるように、少し待ってから考え始める（持ち時間が少ないときは縮める）
const CPU_CONFIRM_MS = 250;
const FLAG_SLACK_MS = 5;      // 時間切れのタイマーを、ちょうどの時刻より少しあとにする
const SAVE_KEY = 'go.save';

export function loadSavedGame() {
    try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
        if (!Array.isArray(saved?.players) || saved.players.length !== 2 || !Array.isArray(saved.commands)) return null;
        return saved;
    } catch {
        return null;
    }
}

export function clearSavedGame() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

function createWorker() {
    if (typeof Worker === 'undefined') return null;
    try {
        return new Worker(new URL('./cpu-worker.js', import.meta.url), { type: 'module' });
    } catch {
        return null;
    }
}

export default class LocalGameController {
    // setup: { players, options } か、保存した { players, options, commands }。listeners: onUpdate()・onError(message)
    // now：時計の時刻（テストで差し替える）
    constructor(setup, listeners = {}, { now = () => Date.now() } = {}) {
        this.listeners = listeners;
        this.wallNow = now;
        this.pausedAt = null;     // 時計を止めた時刻（止めていなければ null）
        this.flagTimer = null;
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options ?? {}, setup.commands)
            : new Game(setup.players, setup.options ?? {});
        this.humanSeats = this.game.players.filter(p => !p.isCPU).map(p => p.id);
        this.cpuTimer = null;
        this.thinking = false;
        this.request = 0;
        this.worker = setup.useWorker === false ? null : createWorker();
        this.worker?.addEventListener('message', (event) => this.onWorkerMessage(event.data));
        this.worker?.addEventListener('error', (event) => {
            // Worker が動かない環境では、その場で考える
            console.error(event.message ?? event);
            this.worker?.terminate();
            this.worker = null;
            if (this.thinking) {
                this.thinking = false;
                this.scheduleCpu();
            }
        });
        this.game.turnStartedAt = this.clockNow();
        this.save();
        this.scheduleFlag();
    }

    // 時計の今の時刻（止めている間は、止めた時刻のまま）
    clockNow() {
        return this.pausedAt ?? this.wallNow();
    }

    // 時計が進んでいる席が、この手番にかけた時間
    elapsed() {
        return this.clockNow() - this.game.turnStartedAt;
    }

    get twoPlayers() {
        return this.humanSeats.length === 2;
    }

    viewSeat() {
        if (!this.twoPlayers) return this.humanSeats[0] ?? 0;
        return this.game.phase === 'play' ? this.game.current : this.game.actors()[0] ?? this.game.current;
    }

    getView() {
        const view = createGameView(this.game, this.viewSeat());
        view.canUndo = this.undoLength() !== null;
        view.thinking = this.thinking;
        view.twoPlayers = this.twoPlayers;
        view.clockPaused = this.pausedAt !== null;
        return view;
    }

    // 操作する席：打つ段階は手番の人。投了は手番の人（CPU 戦では人）。死に石の段階は人の席
    seatFor(command) {
        const game = this.game;
        if (game.phase === 'play' || command.type === 'resign') {
            if (this.twoPlayers) return game.current;
            return command.type === 'resign' ? this.humanSeats[0] : game.current;
        }
        return this.humanSeats.find(seat => !game.agreed[seat]) ?? this.humanSeats[0];
    }

    send(command) {
        if (this.game.isOver() || !command) return false;
        const seat = this.seatFor(command);
        if (!this.humanSeats.includes(seat)) return false;
        if (this.game.isFlagged(this.elapsed())) {
            this.flag();
            return false;
        }
        const before = this.game.persist();
        let ok;
        try {
            ok = this.game.applyCommand(seat, command, this.elapsed());
            // 2人で1台なら、確定は2人分まとめて行う（死に石を決める段階なので、時計は止まっている）
            if (ok && command.type === 'confirm' && this.twoPlayers) {
                this.humanSeats.filter(s => !this.game.agreed[s] && !this.game.isOver()).forEach(s => this.game.applyCommand(s, command));
            }
        } catch (error) {
            // 思わぬ例外で状態が半端になったら、操作の前の状態に戻す
            console.error(error);
            this.game = Game.replay(before.players, before.options, before.commands);
            ok = false;
        }
        if (!ok) {
            this.listeners.onError?.(this.game.lastError ?? 'その操作はできません');
            return false;
        }
        this.cancelThinking();
        this.afterChange();
        return true;
    }

    // 待ったで残す記録の長さ。戻せないなら null
    undoLength() {
        const commands = this.game.commands;
        for (let i = commands.length - 1; i >= 0; i--) {
            const { playerId, command } = commands[i];
            if (this.humanSeats.includes(playerId) && (command.type === 'move' || command.type === 'pass')) return i;
        }
        return null;
    }

    undo() {
        const keep = this.undoLength();
        if (keep === null) return false;
        this.cancelThinking();
        const { players, options, commands } = this.game.persist();
        this.game = Game.replay(players, options, commands.slice(0, keep));
        this.afterChange();
        return true;
    }

    afterChange() {
        this.game.turnStartedAt = this.clockNow();
        this.save();
        this.listeners.onUpdate?.();
        this.scheduleCpu();
        this.scheduleFlag();
    }

    // ---- 持ち時間 ----

    // 時計が進んでいれば、時間切れの時刻にタイマーを置く
    scheduleFlag() {
        clearTimeout(this.flagTimer);
        this.flagTimer = null;
        const limit = this.game.clockLimit();
        if (limit === null || this.pausedAt !== null) return;
        this.flagTimer = setTimeout(() => this.flag(), Math.max(0, limit - this.elapsed()) + FLAG_SLACK_MS);
    }

    // 時間を使い切っていたら、時間切れで終える
    flag() {
        const seat = this.game.clockSeat();
        if (seat === null) return false;
        const elapsed = this.elapsed();
        if (!this.game.isFlagged(elapsed)) {
            this.scheduleFlag();
            return false;
        }
        this.cancelThinking();
        this.game.timeout(seat, elapsed);
        this.afterChange();
        return true;
    }

    // アプリが隠れたら、CPU 戦の時計を止める（2人で遊ぶときと、時計なし・時計が止まっているときは止めない）
    pause() {
        if (this.pausedAt !== null || this.twoPlayers || this.game.clockSeat() === null) return;
        this.pausedAt = this.wallNow();
        clearTimeout(this.flagTimer);
        this.flagTimer = null;
        this.listeners.onUpdate?.();
    }

    resume() {
        if (this.pausedAt === null) return;
        this.game.turnStartedAt += this.wallNow() - this.pausedAt;
        this.pausedAt = null;
        this.scheduleFlag();
        this.listeners.onUpdate?.();
    }

    cancelThinking() {
        clearTimeout(this.cpuTimer);
        this.request++;
        this.thinking = false;
    }

    // CPU の番なら、間を置いて1つ進める。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.thinking || !isCpuTurn(this.game)) return;
        // 持ち時間が少ないときは、手を見せる間も縮める
        const budget = clockBudget({ clock: clockView(this.game), size: this.game.size, moveNumber: this.game.moveNumber });
        const delay = this.game.phase === 'scoring' ? CPU_CONFIRM_MS
            : budget === null ? CPU_MOVE_MS : Math.min(CPU_MOVE_MS, Math.floor(budget * 0.2));
        this.cpuTimer = setTimeout(() => this.stepCpu(), delay);
    }

    stepCpu() {
        const seat = cpuSeat(this.game);
        if (seat === undefined) return;
        if (this.worker && this.game.phase === 'play') {
            const view = createGameView(this.game, seat);
            view.events = [];
            view.logs = [];
            this.thinking = true;
            const id = ++this.request;
            this.pending = { id, length: this.game.commands.length, seat };
            this.worker.postMessage({ id, view, level: this.game.players[seat].cpuLevel ?? 'normal' });
            this.listeners.onUpdate?.();
            return;
        }
        try {
            runCpuStep(this.game, { elapsed: this.elapsed() });
        } catch (error) {
            console.error(error);
        } finally {
            this.afterCpu();
        }
    }

    onWorkerMessage({ id, command }) {
        const pending = this.pending;
        if (!pending || id !== this.request || id !== pending.id) return;     // 待ったなどで古くなった答え
        this.thinking = false;
        this.pending = null;
        if (this.game.commands.length !== pending.length || cpuSeat(this.game) !== pending.seat) {
            this.scheduleCpu();
            return;
        }
        try {
            // 考えている間に時間を使い切っていたら、時間切れで終える。断られたら、いちばん単純な答え（パス）で進める
            // 答えがなければ（Worker の中の例外）、その場で考え直す
            if (command) applyDecision(this.game, pending.seat, command, this.elapsed());
            else runCpuStep(this.game, { elapsed: this.elapsed() });
        } catch (error) {
            console.error(error);
        } finally {
            this.afterCpu();
        }
    }

    afterCpu() {
        this.game.turnStartedAt = this.clockNow();
        this.scheduleFlag();
        this.save();
        try {
            this.listeners.onUpdate?.();
        } finally {
            this.scheduleCpu();
        }
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.persist()));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        this.cancelThinking();
        clearTimeout(this.flagTimer);
        this.flagTimer = null;
        this.worker?.terminate();
        this.worker = null;
    }
}
