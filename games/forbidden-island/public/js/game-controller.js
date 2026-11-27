/**
 * ローカルで遊ぶときのゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send(seat, command) で受け取る（オンライン対戦のコントローラーと同じ形）
 * 遊び方は2つ
 * - all：1人で全員の駒を動かす
 * - team：自分の役割だけを動かし、ほかの役割は CPU が受け持つ
 * 操作のたびに { players, options, commands, mode } を保存し、「続きから」で記録から再現する
 * 待った：今の手番のアクション（山を引く前）だけを戻せる。引いたあとは、次に出るカードを知ってしまうので戻せない
 */

import Game, { ACTION_TYPES } from './game.js';
import { createGameView } from './game-view.js';
import { suggest, runCpuStep, isCpuTurn } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 650;
const SAVE_KEY = 'forbidden-island.save';

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
    // setup: { players, options, mode } か、保存した { players, options, commands, mode }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.mode = setup.mode === 'team' ? 'team' : 'all';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = Math.max(0, this.game.players.findIndex(p => !p.isCPU));
        this.cpuTimer = null;
        this.save();
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    // 画面から動かせる席か
    canControl(seat) {
        return this.mode === 'all' || seat === this.humanSeat;
    }

    send(seat, command) {
        if (!this.canControl(seat) || this.game.isOver()) return false;
        return this.apply(() => this.game.applyCommand(seat, command));
    }

    // ヒント：画面から動かせる席のうち、手のある席のおすすめ { seat, command }。状態は変えない
    suggest() {
        for (const seat of this.game.actors()) {
            if (!this.canControl(seat)) continue;
            const command = suggest(this.game, seat);
            if (command) return { seat, command };
        }
        return null;
    }

    // 待ったができるか：最後の操作が、今の手番の人のアクション（または「終える」）で、まだ山を引いていない
    canUndo() {
        const last = this.game.commands.at(-1);
        const g = this.game;
        if (!last || g.isOver() || !['actions', 'draw'].includes(g.phase)) return false;
        if (last.playerId !== g.current || !this.canControl(last.playerId)) return false;
        return [...ACTION_TYPES, 'pass'].includes(last.command.type);
    }

    undo() {
        if (!this.canUndo()) return false;
        const saved = this.game.persist();
        saved.commands.pop();
        this.game = Game.replay(saved.players, saved.options, saved.commands);
        this.afterChange();
        return true;
    }

    apply(action) {
        const before = this.game.persist();
        let ok;
        try {
            ok = action();
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
        clearTimeout(this.cpuTimer);
        if (this.mode !== 'team' || !isCpuTurn(this.game)) return;
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
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), mode: this.mode }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
