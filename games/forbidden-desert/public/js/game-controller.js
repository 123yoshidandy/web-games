/**
 * ローカルで遊ぶときのゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send(seat, command) で受け取る（オンライン対戦のコントローラーと同じ形）
 * 遊び方は2つ
 * - team：自分の役割だけを動かし、ほかの役割は CPU が受け持つ（CPU は手番でなくても水を分ける）
 * - all：1人で全員の駒を動かす
 * 操作のたびに { players, options, commands, mode } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { suggest, runCpuStep, isCpuTurn } from './cpu-player.js';
import * as Motion from './motion/motion.js';

export const CPU_STEP_DELAY_MS = 600;
export const STORM_DELAY_MS = 750;     // 嵐のカードを自動で引くまでの間
const SAVE_KEY = 'forbidden-desert.save';

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
        this.mode = setup.mode === 'all' ? 'all' : 'team';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = Math.max(0, this.game.players.findIndex(p => !p.isCPU));
        this.cancelCpu = null;
        this.cancelStorm = null;
        this.save();
    }

    getView() {
        return createGameView(this.game, this.mode === 'all' ? this.game.current : this.humanSeat);
    }

    // 画面から動かせる席か
    canControl(seat) {
        return this.mode === 'all' || seat === this.humanSeat;
    }

    send(seat, command) {
        if (!this.canControl(seat) || this.game.isOver()) return false;
        return this.apply(() => this.game.applyCommand(seat, command));
    }

    // ヒント：手番の人を動かせるなら、そのおすすめ { seat, command }。状態は変えない
    suggest() {
        const seat = this.game.current;
        if (!this.canControl(seat)) return null;
        const command = suggest(this.game, seat);
        return command ? { seat, command } : null;
    }

    canUndo() {
        return this.canControl(this.game.current) && this.game.canUndo();
    }

    // 待った：最後の操作を取り消す
    undo() {
        if (!this.canUndo()) return false;
        this.game = this.game.undo();
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
        this.scheduleStorm();
    }

    // CPU の番（か、手番でない CPU の仲間が水を分けるとき）なら、間を置いて1手打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        this.cancelCpu?.();
        if (this.mode !== 'team' || !isCpuTurn(this.game)) return;
        this.cancelCpu = Motion.afterIdle(() => {
            try {
                if (!runCpuStep(this.game)) this.game.applyCommand(this.game.current, { type: this.game.phase === 'storm' ? 'storm' : 'pass' });
            } catch (error) {
                console.error(error);
            } finally {
                this.save();
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                    this.scheduleStorm();
                }
            }
        }, CPU_STEP_DELAY_MS);
    }

    // 自分が動かす人の嵐のカードは、間を置いて自動で引く
    scheduleStorm() {
        this.cancelStorm?.();
        const g = this.game;
        if (g.isOver() || g.phase !== 'storm' || !this.canControl(g.current) || g.players[g.current].isCPU) return;
        this.cancelStorm = Motion.afterIdle(() => {
            if (this.game.phase === 'storm' && !this.game.isOver()) this.send(this.game.current, { type: 'storm' });
        }, STORM_DELAY_MS);
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), mode: this.mode }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        this.cancelCpu?.();
        this.cancelStorm?.();
    }
}
