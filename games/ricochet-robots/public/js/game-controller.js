/**
 * ローカルの対戦（1人の練習・CPU との早解き）のコントローラーと、記録のリプレイ
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーも同じ形）
 *
 * 時計：ゲームの時刻は、止められる時計（遊び方を開いている間・アプリを閉じている間は進まない）で数える
 * 操作のたびに { 設定, seed, commands, clock } を保存し、「続きから」で記録から再現して、時計も続きから動かす
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { nextEvent, nextEventTime, stepDue, runDue } from './cpu-player.js';
import { solve } from './solver.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';

const SAVE_KEY = 'save';
const RECORD_KEY = 'record';
const FAST_STEP_MS = 650;  // 人が全員パスしたあと、CPU の宣言を1つずつ見せる間
const MAX_TIMER_MS = 2 ** 30;

export class LocalGameController {
    // setup: { mode, players: [{ name, isCPU }], level, targets, silver, seed?, commands?, clock? }
    // listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.isOnline = false;
        this.setup = {
            mode: setup.mode ?? 'race',
            players: setup.players,
            level: setup.level ?? 'normal',
            targets: setup.targets,
            silver: Boolean(setup.silver),
            seed: setup.seed ?? createSeed()
        };
        const options = this.options();
        this.game = setup.commands ? Game.replay(this.setup.players, options, setup.commands) : new Game(this.setup.players, options);
        this.humanSeat = this.setup.players.findIndex(player => !player.isCPU);
        this.clockBase = setup.commands ? Math.max(setup.clock ?? 0, this.game.clock) : 0;
        this.wallAt = performance.now();
        this.paused = false;
        this.timer = null;
        this.persist();
        this.schedule();
    }

    options() {
        const { mode, level, targets, silver, seed } = this.setup;
        return { seed, mode, level, targets, silver, startAt: 0 };
    }

    // 保存された途中経過（なければ null）
    static loadSaved() {
        const saved = storage.load(SAVE_KEY);
        if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.commands)) return null;
        try {
            const game = Game.replay(saved.players, { seed: saved.seed, mode: saved.mode, level: saved.level, targets: saved.targets, silver: saved.silver, startAt: 0 }, saved.commands);
            if (game.isOver()) throw new Error('終わっています');
            return saved;
        } catch {
            storage.remove(SAVE_KEY);
            return null;
        }
    }

    // 最後に終えたゲームの記録（リプレイ用）
    static loadRecord() {
        const record = storage.load(RECORD_KEY);
        return record && Array.isArray(record.commands) ? record : null;
    }

    now() {
        return this.paused ? this.clockBase : this.clockBase + (performance.now() - this.wallAt);
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    // 送れたら true。時間で起きる出来事（CPU の宣言・時間切れ）を今の時刻まで進めてから、操作を入れる
    send(command) {
        if (this.game.isOver()) return false;
        const caught = runDue(this.game, this.now());
        const ok = this.game.applyCommand(this.humanSeat, { ...command, at: this.now() });
        if (!ok) {
            const message = this.game.lastError;
            if (caught) this.afterChange();
            this.listeners.onError?.(message);
            return false;
        }
        this.afterChange();
        return true;
    }

    // ヒント：kind は 'first'（最初の1手）か 'count'（最短の手数）。1点引かれる。{ kind, solution } を返す
    hint(kind = 'first') {
        const round = this.game.round;
        if (!round) return null;
        const robots = this.game.mode === 'solo' ? this.game.robots : round.startRobots;
        const solution = solve(this.game.board.walls, robots, round.target, round.cell);
        if (!solution) return { kind, solution: null };
        const used = round.hints[this.humanSeat]?.includes(kind);
        if (!used && !this.send({ type: 'hint', kind })) return null;
        return { kind, solution };
    }

    afterChange() {
        this.persist();
        this.listeners.onUpdate?.();
        this.schedule();
    }

    schedule() {
        clearTimeout(this.timer);
        if (this.paused || this.game.isOver()) return;
        const at = nextEventTime(this.game);
        if (at === null) return;
        const event = nextEvent(this.game);
        const delay = event.fastForward ? FAST_STEP_MS : Math.max(0, at - this.now());
        this.timer = setTimeout(() => this.tick(), Math.min(delay, MAX_TIMER_MS));
    }

    tick() {
        if (this.paused || this.game.isOver()) return;
        let moved = false;
        try {
            moved = stepDue(this.game, this.now());
        } catch (error) {
            console.warn('時間で進む処理で例外', error);
        }
        if (moved) this.afterChange();
        else this.schedule();
    }

    // 遊び方などを開いている間は、時計と CPU を止める
    pause() {
        if (this.paused) return;
        this.clockBase = this.now();
        this.paused = true;
        clearTimeout(this.timer);
        this.persist();
    }

    resume() {
        if (!this.paused) return;
        this.wallAt = performance.now();
        this.paused = false;
        this.schedule();
    }

    persist() {
        if (this.game.isOver()) {
            storage.remove(SAVE_KEY);
            storage.save(RECORD_KEY, { ...this.setup, commands: this.game.commands });
        } else {
            storage.save(SAVE_KEY, { ...this.setup, commands: this.game.commands, clock: this.now() });
        }
    }

    stop() {
        clearTimeout(this.timer);
        if (!this.game.isOver()) this.persist();
    }
}

// 記録のリプレイ：記録した時刻どおりに操作を入れ直す（速さを変えられ、長い待ちは詰める）
export class ReplayController {
    static SPEEDS = [1, 4, 16];
    static MAX_GAP_MS = 3000; // これより長い待ちは詰める（ゲームの時刻で）

    constructor(record, listeners = {}) {
        this.listeners = listeners;
        this.isOnline = false;
        this.isReplay = true;
        this.record = record;
        this.setup = record;
        this.game = new Game(record.players, { seed: record.seed, mode: record.mode, level: record.level, targets: record.targets, silver: record.silver, startAt: 0 });
        this.index = 0;
        this.humanSeat = Math.max(0, record.players.findIndex(player => !player.isCPU));
        this.speed = 1;
        this.clockBase = 0;
        this.wallAt = performance.now();
        this.paused = false;
        this.userPaused = false;
        this.timer = null;
        this.schedule();
    }

    now() {
        return this.paused ? this.clockBase : this.clockBase + (performance.now() - this.wallAt) * this.speed;
    }

    get finished() {
        return this.index >= this.record.commands.length;
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    send() {
        return false;
    }

    setSpeed(speed) {
        this.clockBase = this.now();
        this.wallAt = performance.now();
        this.speed = speed;
        this.schedule();
    }

    // 再生・一時停止のボタン（遊び方などのダイアログを閉じても、自分で止めたら止めたまま）
    togglePause() {
        this.userPaused = !this.userPaused;
        if (this.userPaused) this.pause();
        else this.resume();
    }

    schedule() {
        clearTimeout(this.timer);
        if (this.paused || this.finished) return;
        const next = this.record.commands[this.index];
        const at = Math.max(next.command.at, this.game.clock);
        // 長い待ちは詰める（時計を、次の操作の少し前まで進める）
        if (at - this.now() > ReplayController.MAX_GAP_MS) {
            this.clockBase = at - ReplayController.MAX_GAP_MS / 3;
            this.wallAt = performance.now();
        }
        const delay = Math.max(0, (at - this.now()) / this.speed);
        this.timer = setTimeout(() => this.tick(), delay);
    }

    tick() {
        if (this.paused || this.finished) return;
        const { seat, command } = this.record.commands[this.index++];
        this.game.applyCommand(seat, command);
        this.listeners.onUpdate?.();
        this.schedule();
    }

    pause() {
        if (this.paused) return;
        this.clockBase = this.now();
        this.paused = true;
        clearTimeout(this.timer);
    }

    resume() {
        if (!this.paused || this.userPaused) return;
        this.wallAt = performance.now();
        this.paused = false;
        this.schedule();
    }

    hint() { return null; }

    stop() {
        clearTimeout(this.timer);
    }
}

export default LocalGameController;
