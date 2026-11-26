/**
 * ローカル対戦（人間 1 人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形にする）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, suggest } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 1000; // CPU の手は、引いたタイルが見える間を置いてから打つ
const STALL_LIMIT = 3; // CPU の手が進まないことがこの回数続いたら、コマを置かずに最初の場所へ置く

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], options: { seed }, commands?, level } / listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.setup = setup;
        this.listeners = listeners;
        this.level = setup.level ?? 'normal';
        this.cpuDelay = setup.cpuDelay ?? CPU_STEP_DELAY_MS;
        this.game = setup.commands?.length
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cpuTimer = null;
        this.stalls = 0;
        this.scheduleCpu();
    }

    // ヒント：人の番に、CPU（ふつう）が選ぶ置き方。手は打たず、記録にも入れない
    hint() {
        return suggest(this.game, this.humanSeat);
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    // 保存する形（続きから遊ぶときに replay する）
    saveData() {
        return {
            players: this.game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: this.game.options,
            commands: this.game.commands,
            level: this.level
        };
    }

    send(command) {
        if (!this.game.applyCommand(this.humanSeat, command)) {
            this.listeners.onError?.(this.game.lastError);
            return false;
        }
        this.listeners.onUpdate?.();
        this.scheduleCpu();
        return true;
    }

    // 遊び方などを開いている間は、CPU を止める
    pause() {
        this.paused = true;
        clearTimeout(this.cpuTimer);
    }

    resume() {
        this.paused = false;
        this.scheduleCpu();
    }

    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.paused || !isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            // どこで例外が出ても、必ず次の手を予約する（対戦が止まらないように）
            try {
                this.stepCpu();
            } catch (error) {
                console.error(error);
            } finally {
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                }
            }
        }, this.cpuDelay);
    }

    stepCpu() {
        const before = this.game.commands.length;
        try {
            runCpuStep(this.game, () => this.level);
        } catch (error) {
            console.error(error);
        }
        this.stalls = this.game.commands.length === before ? this.stalls + 1 : 0;
        if (this.stalls < STALL_LIMIT) return;
        this.stalls = 0;
        const p = this.game.board.placements(this.game.tile)[0];
        if (p) this.game.applyCommand(this.game.current, { type: 'play', ...p, meeple: null });
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
