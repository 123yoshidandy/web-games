/**
 * ローカルで遊ぶときのゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send(seat, command) で受け取る（オンライン対戦のコントローラーと同じ形）
 * 遊び方は2つ
 * - team：自分の僧（赤）だけを動かし、ほかの3人は CPU が受け持つ
 * - all：1人で4人の僧を動かす
 * 操作のたびに { players, options, commands, mode } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { suggest, runCpuStep, isCpuTurn } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 650;
const SAVE_KEY = 'ghost-stories.save';

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
        this.setup = { seed: this.game.options.seed };
        this.humanSeat = Math.max(0, this.game.players.findIndex(p => !p.isCPU));
        this.cpuTimer = null;
        this.save();
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    // 画面から動かせる席か
    canControl(seat) {
        return this.mode === 'all' ? !this.game.players[seat].isCPU : seat === this.humanSeat;
    }

    send(seat, command) {
        if (!this.canControl(seat) || this.game.isOver()) return false;
        return this.apply(() => this.game.applyCommand(seat, command));
    }

    // ヒント：画面から動かせる、手のある席のおすすめ { seat, command }。状態は変えない
    suggest() {
        const seat = this.game.actors().find(s => this.canControl(s));
        if (seat === undefined) return null;
        const command = suggest(this.game, seat);
        return command ? { seat, command } : null;
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

    // CPU の僧の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する（3回続けて進まなければ番を終える）
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (!isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            const count = this.game.commands.length;
            try {
                runCpuStep(this.game);
            } catch (error) {
                console.error(error);
            }
            if (this.game.commands.length === count) {
                this.stalls = (this.stalls ?? 0) + 1;
                if (this.stalls >= 3) {
                    this.stalls = 0;
                    const seat = this.game.current;
                    if (!this.game.applyCommand(seat, { type: 'pass' })) this.game.applyCommand(seat, { type: 'assign', targets: [] });
                }
            } else this.stalls = 0;
            this.save();
            try {
                this.listeners.onUpdate?.();
            } finally {
                this.scheduleCpu();
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
