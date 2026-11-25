/**
 * ローカルのゲーム（人間1人と CPU）のコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーも同じ形にする）
 * 操作のたびに { players, seed, mission, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, hasCpuWork, legalCommands } from './cpu.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';

export const CPU_STEP_DELAY_MS = 900; // CPU の手は、何をしたか読める間を置いて1手ずつ見せる
const TRICK_PAUSE_MS = 1400;          // トリックが終わったら、取った人が分かるまで待つ
const SAVE_KEY = 'save';

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], mission, seed?, commands? } / listeners: onUpdate() / onError(message) / onEnd(result)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.setup = { players: setup.players, mission: setup.mission ?? 1, seed: setup.seed ?? createSeed(), style: setup.style ?? 'normal' };
        const options = { seed: this.setup.seed, mission: this.setup.mission };
        this.game = setup.commands ? Game.replay(this.setup.players, options, setup.commands) : new Game(this.setup.players, options);
        this.humanSeat = this.setup.players.findIndex(player => !player.isCPU);
        this.cpuTimer = null;
        this.paused = false;
        this.stalls = 0;
        this.ended = this.game.isOver;
        this.persist();
        this.scheduleCpu(CPU_STEP_DELAY_MS);
    }

    static loadSaved() {
        const saved = storage.load(SAVE_KEY);
        if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.commands)) return null;
        try {
            Game.replay(saved.players, { seed: saved.seed, mission: saved.mission }, saved.commands);
            return saved;
        } catch {
            storage.remove(SAVE_KEY);
            return null;
        }
    }

    static clearSaved() {
        storage.remove(SAVE_KEY);
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    send(command) {
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
        if (this.game.isOver && !this.ended) {
            this.ended = true;
            this.listeners.onEnd?.(this.game.result);
        }
        // トリックが終わった直後は、少し長く待つ
        const justFinished = this.game.trick.plays.length === 0 && this.game.lastMove?.type === 'play';
        this.scheduleCpu(justFinished ? TRICK_PAUSE_MS : CPU_STEP_DELAY_MS);
    }

    scheduleCpu(delay = CPU_STEP_DELAY_MS) {
        clearTimeout(this.cpuTimer);
        if (this.paused || !hasCpuWork(this.game)) return;
        this.cpuTimer = setTimeout(() => this.cpuStep(), delay);
    }

    cpuStep() {
        if (this.paused || !hasCpuWork(this.game)) return;
        const count = this.game.commands.length;
        try {
            runCpuStep(this.game, this.setup.style);
        } catch (error) {
            console.warn('CPU の手で例外', error);
        }
        if (this.game.commands.length === count && ++this.stalls >= 3) {
            // 進まなければ、できる操作の最初のもので抜ける
            const seat = this.game.current;
            const command = seat === null || !this.game.players[seat].isCPU ? null : legalCommands(this.game, seat)[0];
            if (command) this.game.applyCommand(seat, command);
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
