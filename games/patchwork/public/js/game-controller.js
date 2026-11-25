/**
 * ローカル対戦（人間1人と CPU）のコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーも同じ形にする）
 * 操作のたびに { players, seed, level, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, CPU_STYLES } from './cpu-player.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';

export const CPU_STEP_DELAY_MS = 900; // CPU の手は1手ずつ間を置いて見せる
const SAVE_KEY = 'save';

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], level, seed?, commands? }
    // listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.setup = {
            players: setup.players,
            level: setup.level ?? 'normal',
            seed: setup.seed ?? createSeed()
        };
        this.style = CPU_STYLES[this.setup.level] ?? CPU_STYLES.normal;
        const options = { seed: this.setup.seed };
        this.game = setup.commands
            ? Game.replay(this.setup.players, options, setup.commands)
            : new Game(this.setup.players, options);
        this.humanSeat = this.setup.players.findIndex(player => !player.isCPU);
        this.cpuTimer = null;
        this.paused = false;
        this.stalls = 0;
        this.persist();
        this.scheduleCpu(CPU_STEP_DELAY_MS + 300);
    }

    // 保存された途中経過（なければ null）
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
            runCpuStep(this.game, this.style);
        } catch (error) {
            console.warn('CPU の手で例外', error);
        }
        if (this.game.commands.length === count && ++this.stalls >= 3) {
            // 進まなければ、いちばん単純な答えで抜ける
            const seat = this.game.current;
            if (this.game.pendingLeather) {
                const quilt = this.game.players[seat].quilt;
                const y = quilt.findIndex(row => row.includes(null));
                this.game.applyCommand(seat, { type: 'leather', x: quilt[y].indexOf(null), y });
            } else {
                this.game.applyCommand(seat, { type: 'advance' });
            }
        }
        if (this.game.commands.length !== count) this.stalls = 0;
        this.afterMove();
    }

    // 遊び方などを開いている間は CPU を止める
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
        if (this.game.isOver) {
            storage.remove(SAVE_KEY);
        } else {
            storage.save(SAVE_KEY, { ...this.setup, commands: this.game.commands });
        }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
