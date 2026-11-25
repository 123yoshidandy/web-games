/**
 * ローカル対戦（人間1人と CPU 1人か2人）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * CPU は番の初めに操作の列を決め、1つずつ間を置いて打つ（動く・建てるが目で追えるように）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { chooseCpuTurn, runCpuStep, isCpuTurn, PROFILES } from './cpu-player.js';
import { stepKey } from './rules.js';

export const CPU_STEP_DELAY_MS = 550;
const SAVE_KEY = 'santorini.save';

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
    // setup: { players, options, level } か、保存した { players, options, commands, level }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.level = PROFILES[setup.level] && setup.level !== 'random' ? setup.level : 'normal';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cpuTimer = null;
        this.plan = null;
        this.save();
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    send(command) {
        const seat = this.humanSeat;
        if (this.game.current !== seat) return false;
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

    // CPU の1つの操作を進める。決めた列が通らなければ決め直し、それでも通らなければ番を最後まで進める
    cpuStep() {
        const game = this.game;
        const seat = game.current;
        if (!this.plan || this.plan.seat !== seat || this.plan.at !== game.commands.length || this.plan.steps.length === 0) {
            this.plan = { seat, steps: chooseCpuTurn(game, seat, PROFILES[this.level]), at: game.commands.length };
        }
        const step = this.plan.steps.shift();
        const ok = step && game.legalSteps().some(a => stepKey(a) === stepKey(step)) && game.applyCommand(seat, step);
        if (ok) {
            this.plan.at = game.commands.length;
        } else {
            this.plan = null;
            runCpuStep(game, seat, PROFILES[this.level]);
        }
    }

    // CPU の番なら、間を置いて1つ打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.paused || !isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            try {
                this.cpuStep();
            } catch (error) {
                console.error(error);
                this.plan = null;
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
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), level: this.level }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }

    // 遊び方を開いている間は、CPU を止める
    pause() {
        this.paused = true;
        this.stop();
    }

    resume() {
        this.paused = false;
        this.scheduleCpu();
    }
}
