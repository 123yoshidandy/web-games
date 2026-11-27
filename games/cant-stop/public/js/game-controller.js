/**
 * ローカル対戦（人間 1 人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形にする）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, suggest } from './cpu-player.js';
import * as Motion from './motion/motion.js';

export const CPU_STEP_DELAY_MS = 850; // CPU の手は、ダイスの目が見える間を置いてから打つ
const AFTER_TURN_DELAY_MS = 1700;     // バーストや止めたあと（手番が替わった直後）は、何が起きたかを見る間を取る
const STALL_LIMIT = 3;

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], options: { seed }, commands?, level, cpuDelay? } / listeners: onUpdate() / onError(message)
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

    // ヒント：人の番に、CPU（ふつう）が選ぶ操作。手は打たず、記録にも入れない
    hint() {
        return suggest(this.game, this.humanSeat);
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
        if (this.paused || !isCpuTurn(this.game)) return;
        this.cancelCpu = Motion.afterIdle(() => {
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
        }, this.delay());
    }

    delay() {
        const last = this.game.events.at(-1)?.type;
        if (this.cpuDelay !== CPU_STEP_DELAY_MS) return this.cpuDelay; // 確かめるときに縮めた間は、そのまま使う
        return last === 'bust' || last === 'stop' ? AFTER_TURN_DELAY_MS : this.cpuDelay;
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
        const seat = this.game.current;
        [{ type: 'stop' }, { type: 'roll' }, ...this.game.legalMoves().map(o => ({ type: 'move', ...o }))].some(c => this.game.applyCommand(seat, c));
    }

    stop() {
        this.cancelCpu?.();
        this.cancelCpu = null;
    }
}
