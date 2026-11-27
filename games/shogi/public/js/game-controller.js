/**
 * ローカル対局（CPU 戦と、2人で1台を使う対局）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * 待った（undo）は、記録を縮めて再現し直す。CPU 戦では、自分の直前の手とそのあとの CPU の手をまとめて戻す
 * CPU は Web Worker（cpu-worker.js）で考え、考えている間も画面が動く。Worker が使えない環境では、その場で考える
 *
 * 持ち時間：手番が始まった時刻（端末の時刻）を game.turnStartedAt に入れ、操作のたびにかかった時間を渡す
 * 時間を使い切ったら、タイマーで時間切れにする。CPU 戦では、アプリが隠れている間（pause〜resume）時計を止める（2人で遊ぶときは止めない）
 * 「続きから」と待ったでは、その手番の時計は0から数え直す
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, suggest, clockBudget } from './cpu-player.js';

export const CPU_MOVE_MS = 450;    // 前の手が見えるように、少し待ってから考える（持ち時間が少ないときは縮める）
const FLAG_SLACK_MS = 5;    // 時間切れのタイマーを、ちょうどの時刻より少しあとにする
const SAVE_KEY = 'shogi.save';

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
        // 人が1人なら CPU 戦。2人なら、手番の人の席から見る
        this.humanSeats = this.game.players.filter(p => !p.isCPU).map(p => p.id);
        this.cpuTimer = null;
        this.stalls = 0;
        this.worker = null;         // CPU が考える Web Worker（使えるときだけ作る）
        this.workerBroken = false;
        this.pending = null;        // Worker に頼んでいる依頼 { id, seat, length }
        this.requestId = 0;
        this.stopped = false;
        this.game.turnStartedAt = this.clockNow();
        this.save();
        this.scheduleFlag();
    }

    // 時計の今の時刻（止めている間は、止めた時刻のまま）
    clockNow() {
        return this.pausedAt ?? this.wallNow();
    }

    // 手番の側が、この手番にかけた時間
    elapsed() {
        return this.clockNow() - this.game.turnStartedAt;
    }

    get twoPlayers() {
        return this.humanSeats.length === 2;
    }

    viewSeat() {
        return this.twoPlayers ? this.game.current : this.humanSeats[0];
    }

    getView() {
        const view = createGameView(this.game, this.viewSeat());
        view.canUndo = this.undoLength() !== null;
        view.twoPlayers = this.twoPlayers;
        view.clockPaused = this.pausedAt !== null;
        return view;
    }

    // ヒント：手番の人のおすすめの手（CPU の番なら null）
    hint() {
        const seat = this.game.current;
        return this.humanSeats.includes(seat) ? suggest(this.game, seat) : null;
    }

    send(command) {
        // 投了は、CPU 戦なら人の席、2人なら手番の人
        const seat = command?.type === 'resign' ? this.viewSeat() : this.game.current;
        if (!this.humanSeats.includes(seat) || this.game.isOver()) return false;
        if (this.game.isFlagged(this.elapsed())) {
            this.flag();
            return false;
        }
        const before = this.game.persist();
        let ok;
        try {
            ok = this.game.applyCommand(seat, command, this.elapsed());
        } catch (error) {
            // 思わぬ例外で状態が半端になったら、操作の前の状態に戻す
            console.error(error);
            const startedAt = this.game.turnStartedAt;
            this.game = Game.replay(before.players, before.options, before.commands);
            this.game.turnStartedAt = startedAt;
            ok = false;
        }
        if (!ok) {
            this.listeners.onError?.(this.game.lastError ?? 'その操作はできません');
            return false;
        }
        this.afterChange();
        return true;
    }

    // 待ったで残す記録の長さ。戻せないなら null
    undoLength() {
        const commands = this.game.commands;
        for (let i = commands.length - 1; i >= 0; i--) {
            if (this.humanSeats.includes(commands[i].playerId)) return i;
        }
        return null;
    }

    undo() {
        const keep = this.undoLength();
        if (keep === null) return false;
        clearTimeout(this.cpuTimer);
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
        if (limit === null || this.pausedAt !== null || this.stopped) return;
        this.flagTimer = setTimeout(() => this.flag(), Math.max(0, limit - this.elapsed()) + FLAG_SLACK_MS);
    }

    // 時間を使い切っていたら、時間切れで終える
    flag() {
        const seat = this.game.clockSeat();
        if (seat === null || this.stopped) return false;
        const elapsed = this.elapsed();
        if (!this.game.isFlagged(elapsed)) {
            this.scheduleFlag();
            return false;
        }
        clearTimeout(this.cpuTimer);
        this.cancelThinking();
        this.game.timeout(seat, elapsed);
        this.afterChange();
        return true;
    }

    // アプリが隠れたら、CPU 戦の時計を止める（2人で遊ぶときと、時計なし・終わったあとは止めない）
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

    // CPU の番なら、間を置いて1手指させる。例外が出ても必ず次を予約する
    // Web Worker が使えるときは、別のスレッドで考える（考えている間も画面が動く）。使えないとき（テスト・Node）は、その場で考える
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        this.cancelThinking();
        if (!isCpuTurn(this.game)) return;
        // 持ち時間が少ないときは、手を見せる間も縮める
        const budget = clockBudget(this.game);
        const delay = budget === null ? CPU_MOVE_MS : Math.min(CPU_MOVE_MS, Math.floor(budget * 0.2));
        this.cpuTimer = setTimeout(() => {
            if (this.useWorker()) this.thinkInWorker();
            else this.stepCpu(() => runCpuStep(this.game, { elapsed: this.elapsed() }));
        }, delay);
    }

    // CPU の1手を進め、画面に知らせて次を予約する
    stepCpu(step) {
        const before = this.game.commands.length;
        try {
            step();
            this.stalls = this.game.commands.length === before ? this.stalls + 1 : 0;
            if (this.stalls >= 3) {
                // 3回続けて進まなければ知らせる（runCpuStep が指せる手の先頭まで試すので、ふつうは起きない）
                this.stalls = 0;
                this.listeners.onError?.('CPU が進めませんでした');
                return;
            }
        } catch (error) {
            console.error(error);
        } finally {
            if (!this.stopped) {
                // 指したら、次の手番の時計を数え始める
                if (this.game.commands.length !== before) this.game.turnStartedAt = this.clockNow();
                this.scheduleFlag();
                this.save();
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                }
            }
        }
    }

    useWorker() {
        if (this.workerBroken || typeof Worker === 'undefined') return false;
        if (!this.worker) {
            try {
                this.worker = new Worker(new URL('./cpu-worker.js', import.meta.url), { type: 'module' });
            } catch (error) {
                console.error(error);
                this.workerBroken = true;
                return false;
            }
            this.worker.addEventListener('message', ({ data }) => this.onWorkerMessage(data));
            this.worker.addEventListener('error', (event) => {
                // Worker が動かなければ、その場で考える
                console.error(event.message ?? event);
                event.preventDefault?.();
                this.workerBroken = true;
                this.dropWorker();
                if (this.pending) {
                    this.pending = null;
                    this.stepCpu(() => runCpuStep(this.game, { elapsed: this.elapsed() }));
                }
            });
        }
        return true;
    }

    thinkInWorker() {
        const id = ++this.requestId;
        const seat = this.game.current;
        this.pending = { id, seat, length: this.game.commands.length };
        this.worker.postMessage({ id, saved: this.game.persist(), level: this.game.players[seat].cpuLevel ?? 'normal' });
    }

    onWorkerMessage({ id, command, error }) {
        const pending = this.pending;
        // 待った・投了などで取り消した依頼の返事は捨てる
        if (!pending || pending.id !== id || this.game.commands.length !== pending.length || this.game.current !== pending.seat || this.game.isOver()) return;
        this.pending = null;
        if (error) console.error(error);
        this.stepCpu(() => {
            // 考えている間に時間を使い切っていたら、時間切れ
            const elapsed = this.elapsed();
            if (this.game.isFlagged(elapsed)) return this.game.timeout(pending.seat, elapsed);
            if (command && this.game.applyCommand(pending.seat, command, elapsed)) return;
            runCpuStep(this.game, { elapsed });   // 返事が使えなければ、その場で考える
        });
    }

    // 考えている途中の依頼を取り消す。考え中の Worker は止めて、次に作り直す（古い読みを待たない）
    cancelThinking() {
        if (!this.pending) return;
        this.pending = null;
        this.dropWorker();
    }

    dropWorker() {
        this.worker?.terminate();
        this.worker = null;
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.persist()));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        this.stopped = true;
        clearTimeout(this.cpuTimer);
        clearTimeout(this.flagTimer);
        this.flagTimer = null;
        this.cancelThinking();
        this.dropWorker();
    }
}
