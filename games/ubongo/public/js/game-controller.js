/**
 * ローカル対戦のコントローラー（オンラインの OnlineGameController と同じ getView()・send() の形）
 * ラウンドの時計を持ち、操作にラウンドの始まりからの時刻 t を入れて、ルール（game.js）に通す
 * CPU が解く時刻と時間切れは、時計がその時刻を過ぎたときに tick・timeUp の操作として記録する（記録から同じ展開に戻せる）
 * 遊び方などを開いている間と、ほかのタブを見ている間は、時計を止める
 */

import { createGame, applyCommand, viewFor, replay, nextEventTime } from './game.js';
import { cpuCommand } from './cpu-player.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';
import * as Motion from './motion/motion.js';

export const COUNTDOWN_MS = 3000;  // ラウンドの前に数える時間
const CPU_PICK_DELAY_MS = 900;     // CPU が宝石を取るまでの間（人に見える速さで。動きが終わってから数える）
const LOOP_MS = 100;
const SAVE_EVERY_MS = 1000;

export default class LocalGameController {
    // setup：{ options }（新しいゲーム）か、保存した記録 { options, commands, traces, elapsed }
    constructor(setup, { onUpdate = () => {}, onError = () => {}, onEvents = () => {} } = {}) {
        this.isOnline = false;
        this.options = { ...setup.options, seed: setup.options.seed ?? createSeed() };
        this.commands = setup.commands ? setup.commands.slice() : [];
        this.traces = setup.traces ? structuredClone(setup.traces) : {};
        this.state = this.commands.length > 0 ? replay(this.options, this.commands) : createGame(this.options);
        this.handlers = { onUpdate, onError, onEvents };
        this.pauses = new Set();
        this.pausedAt = null;
        this.cpuTimer = null;
        this.savedAt = 0;
        this.stopped = false;
        this.startClock(setup.elapsed ?? 0);
        this.loopTimer = setInterval(() => this.loop(), LOOP_MS);
        this.save();
    }

    get setup() {
        return { options: { ...this.options, seed: undefined } };
    }

    // 記録（記録を見る・続きから）
    get record() {
        return { options: this.options, commands: this.commands, traces: this.traces };
    }

    // ラウンドの時計：elapsed() が 0 になった時がラウンドの始まり（それまでは数えている）
    startClock(elapsed = 0) {
        const now = performance.now();
        this.zero = now + COUNTDOWN_MS - elapsed;
        if (this.pausedAt !== null) this.pausedAt = now;
    }

    elapsed() {
        const now = this.pausedAt ?? performance.now();
        return now - this.zero;
    }

    // 画面の時計の表示用
    clock() {
        const elapsed = this.elapsed();
        return { elapsed, countdown: elapsed < 0, paused: this.pausedAt !== null };
    }

    pause(reason = 'dialog') {
        this.pauses.add(reason);
        if (this.pausedAt === null) this.pausedAt = performance.now();
    }

    resume(reason = 'dialog') {
        this.pauses.delete(reason);
        if (this.pauses.size > 0 || this.pausedAt === null) return;
        this.zero += performance.now() - this.pausedAt;
        this.pausedAt = null;
    }

    stop() {
        this.stopped = true;
        clearInterval(this.loopTimer);
        this.cpuTimer?.();
        this.cpuTimer = null;
    }

    getView() {
        return viewFor(this.state, 0);
    }

    // 人（席0）の操作。受け付けたら true
    send(command) {
        if (this.stopped || this.state.phase === 'end') return false;
        const t = Math.round(this.elapsed());
        if (['submit', 'giveUp', 'hint'].includes(command.type) && t < 0) return false;
        const withTime = command.type === 'pick' ? { type: 'pick', row: command.row }
            : command.type === 'hint' ? { type: 'hint' }
                : { ...command, t };
        return this.apply(0, withTime);
    }

    // ピースの動き（記録を見るとき、時刻どおりに動かす）。entry：[id, rot, flip, x, y] か、トレイに戻したら [id]
    trace(entry) {
        const t = Math.max(0, Math.round(this.elapsed()));
        (this.traces[this.state.round] ??= []).push([t, ...entry]);
    }

    apply(seat, command) {
        const round = this.state.round;
        const result = applyCommand(this.state, seat, command);
        if (!result.ok) {
            this.handlers.onError(result.error);
            return false;
        }
        this.commands.push({ seat, command });
        if (this.state.round !== round) this.startClock(0);
        this.save(true);
        this.handlers.onEvents(result.events);
        this.handlers.onUpdate();
        this.scheduleCpu();
        return true;
    }

    loop() {
        if (this.stopped || this.pausedAt !== null) return;
        if (this.state.phase === 'play') {
            const t = this.elapsed();
            if (t < 0) return;
            const next = nextEventTime(this.state);
            if (next !== null && t >= next) {
                this.apply(null, t >= this.state.timeLimit ? { type: 'timeUp' } : { type: 'tick', t: Math.round(t) });
            } else if (performance.now() - this.savedAt > SAVE_EVERY_MS) this.save();
        }
        this.scheduleCpu();
    }

    // CPU が宝石を取る番なら、少し間を置いて取る
    scheduleCpu() {
        if (this.cpuTimer || this.stopped || this.state.phase !== 'collect') return;
        if (!cpuCommand(this.state)) return;
        this.cpuTimer = Motion.afterIdle(() => {
            this.cpuTimer = null;
            if (this.pausedAt !== null) return this.scheduleCpu();
            const next = cpuCommand(this.state);
            if (next) this.apply(next.seat, next.command);
        }, CPU_PICK_DELAY_MS);
    }

    // 途中経過の保存（終わったら消す）
    save() {
        this.savedAt = performance.now();
        if (this.state.phase === 'end') {
            storage.remove('save');
            return;
        }
        storage.save('save', { ...this.record, elapsed: Math.max(0, this.elapsed()) });
    }

    static loadSaved() {
        const saved = storage.load('save');
        if (!saved?.options || !Array.isArray(saved.commands)) return null;
        try {
            replay(saved.options, saved.commands);
            return saved;
        } catch {
            storage.remove('save');
            return null;
        }
    }
}
