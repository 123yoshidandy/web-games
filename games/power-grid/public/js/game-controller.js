/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * hold が true の間（回の結果を見ている間）は、CPU を待たせる
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, suggest } from './cpu-player.js';
import * as Motion from './motion/motion.js';

const CPU_DELAY_MS = 450;       // CPU は1手ずつ、間を置いて打つ
const SAVE_KEY = 'power-grid.save';

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
        this.cancelCpu = null;
        this.stalls = 0;
        this.hold = false;
        this.save();
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    // ヒント：人の番なら、おすすめの手を返す（記録は変えない）。人の番でなければ null
    hint() {
        if (this.game.isOver() || !this.game.actors().includes(this.humanSeat)) return null;
        return suggest(this.getView());
    }

    setHold(hold) {
        this.hold = hold;
        this.scheduleCpu();
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

    // CPU の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        this.cancelCpu?.();
        if (this.hold || !isCpuTurn(this.game)) return;
        const delay = CPU_DELAY_MS;
        // 画面の動きが終わってから間をおく（CPU の手が動きを追い越さない）
        this.cancelCpu = Motion.afterIdle(() => {
            try {
                const before = this.game.commands.length;
                runCpuStep(this.game);
                this.stalls = this.game.commands.length === before ? this.stalls + 1 : 0;
                if (this.stalls >= 3) {
                    // 3回続けて進まなければ知らせる（runCpuStep がいちばん単純な手まで試すので、ふつうは起きない）。finally で次も予約する
                    this.stalls = 0;
                    this.listeners.onError?.('CPU が進めませんでした');
                    return;
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
        this.cancelCpu?.();
    }
}
