/**
 * ローカルのコントローラー（れんしゅう・CPU 対戦）と、記録を見るリプレイのコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーも同じ形）
 *
 * 時計：始まりからの経過ミリ秒（now()）。遊び方などを開いている間と、別のタブを見ている間は止める
 * 一定の間隔で時計を見て、時刻が来たこと（自動でめくる・CPU のベル・時間切れ）を起こす（記録の時刻は、来た時刻そのもの）
 * 操作のたびに { mode, players, level, speed, timeLimit, seed, commands, elapsed } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runUntil, suggest } from './cpu-player.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';

export const TICK_MS = 50;
const SAVE_KEY = 'save';
const SAVE_EVERY_MS = 2000;
const systemClock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const optionsOf = setup => ({
    seed: setup.seed,
    mode: setup.mode,
    level: setup.level,
    speed: setup.speed,
    timeLimit: setup.timeLimit,
    stopWhenHumansOut: true
});

export default class LocalGameController {
    // setup: { mode, players: [{ name, isCPU, auto }], level, speed, timeLimit, seed?, commands?, elapsed? }
    // listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}, { clock = systemClock, autoStart = true } = {}) {
        this.listeners = listeners;
        this.clock = clock;
        this.setup = {
            mode: setup.mode ?? 'cpu',
            players: setup.players,
            level: setup.level ?? 'normal',
            speed: setup.speed ?? 'normal',
            timeLimit: setup.timeLimit ?? 'normal',
            seed: setup.seed ?? createSeed()
        };
        const options = optionsOf(this.setup);
        this.game = setup.commands ? Game.replay(this.setup.players, options, setup.commands) : new Game(this.setup.players, options);
        this.humanSeat = this.setup.players.findIndex(player => !player.isCPU);
        const elapsed = Math.max(setup.elapsed ?? 0, this.game.lastT);
        this.offset = this.clock() - elapsed;
        this.paused = false;
        this.pausedAt = 0;
        this.lastSave = elapsed;
        this.timer = null;
        this.persist();
        if (autoStart) this.start();
    }

    // 保存された途中経過（なければ null）
    static loadSaved() {
        const saved = storage.load(SAVE_KEY);
        if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.commands)) return null;
        try {
            const game = Game.replay(saved.players, optionsOf(saved), saved.commands);
            if (game.isOver) throw new Error('終わっている');
            return saved;
        } catch {
            storage.remove(SAVE_KEY);
            return null;
        }
    }

    static clearSaved() {
        storage.remove(SAVE_KEY);
    }

    get isOnline() { return false; }

    // 始まりからの経過ミリ秒
    now() {
        return this.paused ? this.pausedAt : this.clock() - this.offset;
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    start() {
        if (this.timer || typeof setInterval === 'undefined') return;
        this.timer = setInterval(() => this.tick(), TICK_MS);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (!this.game.isOver) this.persist();
    }

    // 時刻が来たことを起こす。ときどき経過時間を保存する
    tick() {
        if (this.paused || this.game.isOver) return;
        let moved = 0;
        try {
            moved = runUntil(this.game, this.now());
        } catch (error) {
            console.warn('時刻の処理で例外', error);
        }
        if (moved > 0) {
            this.persist();
            this.listeners.onUpdate?.();
        } else if (this.now() - this.lastSave >= SAVE_EVERY_MS) {
            this.persist();
        }
    }

    // 人の操作。時刻は今の時計で付ける（先に、その時刻までに来たことを起こす）
    send(command) {
        if (this.paused || this.game.isOver || !command) return false;
        const t = this.now();
        const moved = runUntil(this.game, t);
        const ok = this.game.applyCommand(this.humanSeat, { ...command, t });
        this.persist();
        if (!ok) {
            if (moved) this.listeners.onUpdate?.();
            this.listeners.onError?.(this.game.lastError);
            return false;
        }
        this.listeners.onUpdate?.();
        return true;
    }

    // 自動めくりの切り替え（記録に入る）
    setAuto(on) {
        const player = this.game.players[this.humanSeat];
        if (!player || player.auto === on) return true;
        return this.send({ type: 'auto', on });
    }

    // おすすめの手（れんしゅうのヒント。記録には入らない）
    hint() {
        if (this.game.isOver) return null;
        return suggest(this.game, this.humanSeat);
    }

    // 遊び方などを開いている間と、別のタブを見ている間は時計を止める
    pause() {
        if (this.paused) return;
        this.pausedAt = this.now();
        this.paused = true;
        this.persist();
    }

    resume() {
        if (!this.paused) return;
        this.offset = this.clock() - this.pausedAt;
        this.paused = false;
    }

    persist() {
        if (this.game.isOver) {
            storage.remove(SAVE_KEY);
            return;
        }
        this.lastSave = this.now();
        storage.save(SAVE_KEY, { ...this.setup, commands: this.game.commands, elapsed: Math.round(this.lastSave) });
    }

    // リプレイに渡す記録
    record() {
        return { ...this.setup, commands: structuredClone(this.game.commands) };
    }
}

// 記録を、操作の時刻どおりに見せ直す（speed 倍で進める）。画面からは同じ getView() で描く
export class ReplayController {
    constructor(record, listeners = {}, { clock = systemClock, speed = 1, autoStart = true } = {}) {
        this.listeners = listeners;
        this.clock = clock;
        this.record = record;
        this.humanSeat = Math.max(0, record.players.findIndex(player => !player.isCPU));
        this.game = new Game(record.players, optionsOf(record));
        this.index = 0;
        this.speed = speed;
        this.elapsed = 0;
        this.last = this.clock();
        this.paused = false;
        this.timer = null;
        if (autoStart) this.start();
    }

    get isOnline() { return false; }
    get isReplay() { return true; }
    get finished() { return this.index >= this.record.commands.length; }

    now() {
        return this.elapsed;
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    start() {
        if (this.timer || typeof setInterval === 'undefined') return;
        this.last = this.clock();
        this.timer = setInterval(() => this.tick(), TICK_MS);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    setSpeed(speed) {
        this.speed = speed;
    }

    tick() {
        const current = this.clock();
        if (!this.paused && !this.finished) this.elapsed += (current - this.last) * this.speed;
        this.last = current;
        this.advanceTo(this.elapsed);
    }

    // 時刻 t までの操作を打つ
    advanceTo(t) {
        let moved = 0;
        while (!this.finished && this.record.commands[this.index].t <= t) {
            const { seat, ...command } = this.record.commands[this.index];
            this.game.applyCommand(seat, command);
            this.index += 1;
            moved += 1;
        }
        if (this.finished) this.elapsed = Math.max(this.elapsed, this.game.lastT);
        if (moved) this.listeners.onUpdate?.();
        return moved;
    }

    send() { return false; }
    setAuto() { return false; }
    hint() { return null; }
    pause() { this.paused = true; }
    resume() { this.paused = false; this.last = this.clock(); }
}
