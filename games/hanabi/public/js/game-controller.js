/**
 * ローカル対戦（人間1人と CPU）のコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーも同じ形にする）
 * 操作のたびに { players, seed, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn } from './cpu-player.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';

export const CPU_STEP_DELAY_MS = 1100; // CPU の手は、何をしたか読める間を置いて1手ずつ見せる
const SAVE_KEY = 'save';

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], seed?, commands? } / listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.setup = { players: setup.players, seed: setup.seed ?? createSeed() };
        this.game = setup.commands
            ? Game.replay(this.setup.players, { seed: this.setup.seed }, setup.commands)
            : new Game(this.setup.players, { seed: this.setup.seed });
        this.humanSeat = this.setup.players.findIndex(player => !player.isCPU);
        this.cpuTimer = null;
        this.paused = false;
        this.stalls = 0;
        this.persist();
        this.scheduleCpu(CPU_STEP_DELAY_MS);
    }

    static loadSaved() {
        const saved = storage.load(SAVE_KEY);
        if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.commands)) return null;
        try {
            Game.replay(saved.players, { seed: saved.seed }, saved.commands);
            return saved;
        } catch {
            storage.remove(SAVE_KEY);
            return null;
        }
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    send(command) {
        if (this.game.current !== this.humanSeat) return false;
        if (!this.game.applyCommand(this.humanSeat, command)) {
            this.listeners.onError?.(this.game.lastError);
            return false;
        }
        this.afterMove();
        return true;
    }

    afterMove() {
        this.persist();
        this.listeners.onUpdate?.();
        this.scheduleCpu();
    }

    scheduleCpu(delay = CPU_STEP_DELAY_MS) {
        clearTimeout(this.cpuTimer);
        if (this.paused || !isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => this.cpuStep(), delay);
    }

    cpuStep() {
        if (this.paused || !isCpuTurn(this.game)) return;
        const count = this.game.commands.length;
        try {
            runCpuStep(this.game);
        } catch (error) {
            console.warn('CPU の手で例外', error);
        }
        if (this.game.commands.length === count && ++this.stalls >= 3) {
            // 進まなければ、いちばん単純な答えで抜ける
            const seat = this.game.current;
            const first = this.game.hands[seat][0];
            this.game.applyCommand(seat, this.game.clues < 8 ? { type: 'discard', order: first } : { type: 'play', order: first });
        }
        if (this.game.commands.length !== count) this.stalls = 0;
        this.afterMove();
    }

    pause() {
        this.paused = true;
        clearTimeout(this.cpuTimer);
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        this.scheduleCpu();
    }

    persist() {
        if (this.game.isOver) storage.remove(SAVE_KEY);
        else storage.save(SAVE_KEY, { ...this.setup, commands: this.game.commands });
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
