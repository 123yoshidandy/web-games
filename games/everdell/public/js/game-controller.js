/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands, level } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuActors, PROFILES } from './cpu-player.js';
import * as Motion from './motion/motion.js';

// 以下の間は、動きが終わってから数える
const CPU_DELAY_MS = [700, 1000];   // CPU が手番の行動を選ぶまでの間
const CPU_PROMPT_MS = 450;          // 効果の途中で選ぶまでの間
const SAVE_KEY = 'everdell.save';

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
        this.level = PROFILES[setup.level] && !PROFILES[setup.level].random ? setup.level : 'normal';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cancelCpu = null;
        this.save();
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

    // CPU の番なら、間を置いて動かす。例外が出ても必ず次を予約する。3回続けて進まなければ、最小の手で進める
    scheduleCpu() {
        this.cancelCpu?.();
        this.cancelCpu = null;
        if (cpuActors(this.game).length === 0) return;
        const [min, max] = CPU_DELAY_MS;
        const delay = this.game.prompt ? CPU_PROMPT_MS : min + Math.random() * (max - min);
        this.cancelCpu = Motion.afterIdle(() => {
            // 待っている間に新しい動きが始まっていたら、また動き終わるのを待つ
            if (!Motion.isIdle()) return this.scheduleCpu();
            const before = this.game.commands.length;
            try {
                const seat = cpuActors(this.game)[0];
                if (seat !== undefined) runCpuStep(this.game, seat, PROFILES[this.level]);
            } catch (error) {
                console.error(error);
            } finally {
                this.stalls = this.game.commands.length === before ? (this.stalls ?? 0) + 1 : 0;
                if (this.stalls >= 3) this.unstick();
                this.save();
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                }
            }
        }, delay);
    }

    unstick() {
        this.stalls = 0;
        const seat = cpuActors(this.game)[0];
        if (seat === undefined) return;
        const prompt = this.game.prompt;
        if (prompt) {
            this.game.applyCommand(seat, { type: 'answer', id: prompt.id, values: prompt.options.slice(0, prompt.min).map(o => o.value) });
            return;
        }
        ['prepare', 'pass'].some(type => this.game.applyCommand(seat, { type }))
            || this.game.applyCommand(seat, { type: 'place', loc: 'b-berry' });
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), level: this.level }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        this.cancelCpu?.();
        this.cancelCpu = null;
    }
}
