/**
 * ローカル対戦（人間1人と CPU）のコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーも同じ形にする）
 * 操作のたびに { players, seed, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, suggest, CPU_STYLES } from './cpu-player.js';
import * as Motion from './motion/motion.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';

export const CPU_STEP_DELAY_MS = 650;      // CPU の手は1手ずつ間を置いて見せる
export const ROUND_END_DELAY_MS = 2600;    // ラウンドの得点を見せる間
const SAVE_KEY = 'save';

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], level, seed?, commands? } / listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.setup = { players: setup.players, level: setup.level ?? 'normal', seed: setup.seed ?? createSeed() };
        this.style = CPU_STYLES[this.setup.level] ?? CPU_STYLES.normal;
        this.game = setup.commands
            ? Game.replay(this.setup.players, { seed: this.setup.seed }, setup.commands)
            : new Game(this.setup.players, { seed: this.setup.seed });
        this.humanSeat = this.setup.players.findIndex(player => !player.isCPU);
        this.cancelCpu = null;
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

    // ヒント：人の番に、CPU（ふつう）が選ぶ手。手は打たず、記録にも入れない
    hint() {
        return suggest(this.game, this.humanSeat);
    }

    send(command) {
        if (this.game.current !== this.humanSeat) return false;
        const round = this.game.round;
        if (!this.game.applyCommand(this.humanSeat, command)) {
            this.listeners.onError?.(this.game.lastError);
            return false;
        }
        this.afterMove(round);
        return true;
    }

    afterMove(round) {
        this.persist();
        this.listeners.onUpdate?.();
        const roundEnded = this.game.round !== round || this.game.isOver;
        this.scheduleCpu(roundEnded ? ROUND_END_DELAY_MS : CPU_STEP_DELAY_MS);
    }

    scheduleCpu(delay = CPU_STEP_DELAY_MS) {
        this.cancelCpu?.();
        this.cancelCpu = null;
        if (this.paused || !isCpuTurn(this.game)) return;
        this.cancelCpu = Motion.afterIdle(() => this.cpuStep(), delay);
    }

    cpuStep() {
        if (this.paused || !isCpuTurn(this.game)) return;
        const round = this.game.round;
        const count = this.game.commands.length;
        try {
            runCpuStep(this.game, this.style);
        } catch (error) {
            console.warn('CPU の手で例外', error);
        }
        if (this.game.commands.length === count) {
            // 進まなければ、取れる最初のタイルを床へ置いて抜ける
            if (++this.stalls >= 3) {
                const [first] = this.game.getSources();
                if (first) this.game.applyCommand(this.game.current, { type: 'take', source: first.source, color: first.color, line: 'floor' });
                this.stalls = 0;
            }
        } else {
            this.stalls = 0;
        }
        this.afterMove(round);
    }

    // 遊び方などを開いている間は CPU を止める
    pause() {
        this.paused = true;
        this.cancelCpu?.();
        this.cancelCpu = null;
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
        this.cancelCpu?.();
        this.cancelCpu = null;
    }
}
