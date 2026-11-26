/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, fallbackCommands, suggest } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 1100;  // CPU がカードを使う前は、何をしたか追えるように間を置く
const CPU_QUICK_DELAY_MS = 450;          // 建築家の移動と建築の続き
const SAVE_KEY = 'concordia.save';

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
    // setup: { players, options } か、保存した { players, options, commands }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cpuTimer = null;
        this.stalls = 0;
        this.paused = false;
        this.save();
    }

    // ヒント：人の番に、CPU（ふつう）が選ぶ操作。手は打たず、記録にも入れない
    hint() {
        return suggest(this.game, this.humanSeat);
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    send(command) {
        const seat = this.humanSeat;
        if (!this.game.actors().includes(seat)) return false;
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

    // 遊び方などを開いている間は、CPU を止める
    setPaused(paused) {
        this.paused = paused;
        if (paused) clearTimeout(this.cpuTimer);
        else this.scheduleCpu();
    }

    // CPU の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.paused || !isCpuTurn(this.game)) return;
        const delay = this.game.phase === 'architect' ? CPU_QUICK_DELAY_MS : CPU_STEP_DELAY_MS;
        this.cpuTimer = setTimeout(() => {
            try {
                const before = this.game.commands.length;
                runCpuStep(this.game);
                this.stalls = this.game.commands.length === before ? this.stalls + 1 : 0;
                if (this.stalls >= 3) {
                    // 3回続けて進まなければ、いちばん単純な手で抜ける（ふつうは起きない）
                    this.stalls = 0;
                    const seat = this.game.current;
                    fallbackCommands(this.game, seat).some(command => this.game.applyCommand(seat, command));
                }
            } catch (error) {
                console.error(error);
            } finally {
                this.save();
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                }
            }
        }, delay);
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.persist()));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
