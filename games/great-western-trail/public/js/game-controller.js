/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands, level } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuActors, PROFILES } from './cpu-player.js';

const CPU_DELAY_MS = [420, 700];   // CPU が次の手を打つまでの間（毎回少しずつ違う）
const CPU_MOVE_EXTRA_MS = 250;     // 牧場主を進める手は、少し長めに見せる
const SAVE_KEY = 'great-western-trail.save';

export function loadSavedGame() {
    try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
        if (!saved?.players || !saved.options || !Array.isArray(saved.commands)) return null;
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
    // setup: { players, options, level } か、保存した { players, options, commands, level }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.level = PROFILES[setup.level] && !PROFILES[setup.level].random ? setup.level : 'normal';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cpuTimer = null;
        this.stalls = 0;
        this.save();
    }

    getView(since = 0) {
        return createGameView(this.game, this.humanSeat, { since });
    }

    send(command) {
        const seat = this.humanSeat;
        const before = this.game.persist();
        let ok;
        try {
            ok = this.game.applyCommand(seat, command);
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
        this.afterChange();
        return true;
    }

    afterChange() {
        this.save();
        this.listeners.onUpdate?.();
        this.scheduleCpu();
    }

    // 手番の CPU を、間を置いて動かす。例外が出ても必ず次を予約する。3回続けて進まなければ一番単純な手で抜ける
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (cpuActors(this.game).length === 0) return;
        const [min, max] = CPU_DELAY_MS;
        const moving = this.game.state.turn.stage === 'move' && this.game.state.turn.queue.length === 0;
        const delay = min + Math.random() * (max - min) + (moving ? CPU_MOVE_EXTRA_MS : 0);
        this.cpuTimer = setTimeout(() => {
            try {
                const seat = cpuActors(this.game)[0];
                const ok = seat !== undefined && runCpuStep(this.game, seat, PROFILES[this.level]);
                this.stalls = ok ? 0 : this.stalls + 1;
            } catch (error) {
                console.error(error);
                this.stalls++;
            } finally {
                this.save();
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    if (this.stalls < 3) this.scheduleCpu();
                }
            }
        }, delay);
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), level: this.level }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
