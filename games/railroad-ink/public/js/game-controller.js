/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 40;    // 全員が同時に描くので、CPU は裏で短い間をはさんで進める（画面を止めないため）
const SAVE_KEY = 'railroad-ink.save';

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
        this.paused = false;
        this.save();
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

    // CPU の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する（決めた手が通らなければ、単純な手で進める）
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.paused || !isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            try {
                runCpuStep(this.game);
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
        }, CPU_STEP_DELAY_MS);
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

    // ダイアログ（遊び方・ほかの人のボード）を開いている間は、CPU を止める
    pause() {
        this.paused = true;
        this.stop();
    }

    resume() {
        this.paused = false;
        this.scheduleCpu();
    }
}
