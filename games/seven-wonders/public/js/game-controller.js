/**
 * ローカル対戦（人間 1 人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形にする）
 * 全員が同時に選ぶゲームなので、CPU は人間を待たずに、少しずつ間を置いて選ぶ（選んだ中身は公開まで見えない）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuSeatsToAct, suggest } from './cpu-player.js';
import * as Motion from './motion/motion.js';

export const CPU_STEP_DELAY_MS = 450;
const STALL_LIMIT = 3;

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], options: { seed, sides }, commands?, level, cpuDelay? } / listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.level = setup.level ?? 'normal';
        this.cpuDelay = setup.cpuDelay ?? CPU_STEP_DELAY_MS;
        this.game = setup.commands?.length
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cancelCpu = null;
        this.stalls = 0;
        this.scheduleCpu();
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    saveData() {
        return {
            players: this.game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: this.game.options,
            commands: this.game.commands,
            level: this.level
        };
    }

    // ヒント：人のおすすめの手（人が選ぶ番でなければ null）
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

    // 公開の一覧や遊び方を開いている間は、CPU を止める
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
        // 動きが終わってから、間を置いて選ぶ
        this.cancelCpu = Motion.afterIdle(() => {
            // 待っている間に新しい動きが始まっていたら（開始直後の手札など）、また動き終わるのを待つ
            if (!Motion.isIdle()) return this.scheduleCpu();
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

    // CPU を 1 人ずつ選ばせる（同時に選ぶゲームだが、選び終えた印が順に付くように）
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
        this.stalls = 0;
        if (this.game.phase === 'discardBuild') this.game.applyCommand(seat, { type: 'discardBuild', card: null });
        else this.game.applyCommand(seat, { type: 'play', card: this.game.hands[seat][0], action: 'discard' });
    }

    stop() {
        this.cancelCpu?.();
        this.cancelCpu = null;
    }
}
