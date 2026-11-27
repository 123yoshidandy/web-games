/**
 * ローカル対戦（人 1 人と CPU の相棒）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形にする）
 * CPU は、人に見える速さで1手ずつ置く
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuSeatsToAct, suggest } from './cpu-player.js';
import * as Motion from './motion/motion.js';

export const CPU_STEP_DELAY_MS = 700;   // 動きが終わってから数える
const STALL_LIMIT = 3;

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], options: { seed, airport, cpuLevel }, commands?, cpuDelay? } / listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.cpuDelay = setup.cpuDelay ?? CPU_STEP_DELAY_MS;
        this.game = setup.commands?.length
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cancelCpu = null;
        this.stalls = 0;
        this.scheduleCpu();
    }

    get level() {
        return this.game.options.cpuLevel;
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    saveData() {
        return {
            players: this.game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: this.game.options,
            commands: this.game.commands
        };
    }

    // ヒント：人のおすすめの手（人の番でなければ null）
    hint() {
        return suggest(this.game, this.humanSeat);
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

    // 待った：人が最後に置いた手の前まで戻す（同じ回の中だけ。振り直したあとと、新しい目を振ったあとは戻せない）
    undoTarget() {
        const commands = this.game.commands;
        let index = commands.length - 1;
        while (index >= 0 && commands[index].seat !== this.humanSeat) index--;
        if (index < 0 || commands[index].command.type === 'reroll') return null;
        const before = Game.replay(this.game.players, this.game.options, commands.slice(0, index));
        if (before.board.round !== this.game.board.round || this.game.isOver()) return null;
        if (commands.slice(index).some(c => c.command.type === 'reroll')) return null;
        return index;
    }

    canUndo() {
        return this.undoTarget() !== null;
    }

    undo() {
        const index = this.undoTarget();
        if (index === null) return false;
        this.cancelCpu?.();
        this.cancelCpu = null;
        this.game = Game.replay(this.game.players, this.game.options, this.game.commands.slice(0, index));
        this.listeners.onUpdate?.();
        this.scheduleCpu();
        return true;
    }

    // 遊び方などを開いている間は、CPU を止める
    pause() {
        this.paused = true;
        this.cancelCpu?.();
        this.cancelCpu = null;
    }

    resume() {
        this.paused = false;
        this.scheduleCpu();
    }

    scheduleCpu() {
        this.cancelCpu?.();
        this.cancelCpu = null;
        if (this.paused || cpuSeatsToAct(this.game).length === 0) return;
        this.cancelCpu = Motion.afterIdle(() => {
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
        const seat = cpuSeatsToAct(this.game)[0];
        if (seat === undefined) return;
        const before = this.game.commands.length;
        try {
            runCpuStep(this.game, seat, () => this.level);
        } catch (error) {
            console.error(error);
        }
        this.stalls = this.game.commands.length === before ? this.stalls + 1 : 0;
        if (this.stalls < STALL_LIMIT) return;
        // 3回続けて進まなければ、残りのダイスを外して先へ進める
        this.stalls = 0;
        const die = this.game.dice[seat].findIndex(d => !d.used);
        this.game.applyCommand(seat, { type: 'discard', die });
    }

    stop() {
        this.cancelCpu?.();
        this.cancelCpu = null;
    }
}
