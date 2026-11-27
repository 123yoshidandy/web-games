/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands, level } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuActors, PROFILES, LEVELS, suggest } from './cpu-player.js';
import * as Motion from './motion/motion.js';

const CPU_MOVE_MS = [600, 900];  // CPU が行き先を決めるまでの間（毎回少しずつ違う）
const CPU_STEP_MS = 420;         // 行動や支払いなど、番の中の続きの間
const SAVE_KEY = 'istanbul.save';

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
        this.level = Object.hasOwn(LEVELS, setup.level) ? setup.level : 'hard';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cancelCpu = null;
        this.save();
    }

    // ヒント：人の番なら、おすすめの手（操作）を返す。状態は変えない
    suggest() {
        return suggest(this.game, this.humanSeat);
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    send(command) {
        const seat = this.humanSeat;
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

    // 手番の CPU を、間を置いて1手ずつ動かす。例外が出ても必ず次を予約する
    scheduleCpu() {
        this.cancelCpu?.();
        if (cpuActors(this.game).length === 0) return;
        const [min, max] = CPU_MOVE_MS;
        const delay = this.game.step.stage === 'move' ? min + Math.random() * (max - min) : CPU_STEP_MS;
        // 盤やカードの動きが終わってから間をおく（CPU の手が動きを追い越さない）
        this.cancelCpu = Motion.afterIdle(() => {
            try {
                const seat = cpuActors(this.game)[0];
                if (seat !== undefined) runCpuStep(this.game, seat, PROFILES[this.level]);
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
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), level: this.level }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        this.cancelCpu?.();
    }
}
