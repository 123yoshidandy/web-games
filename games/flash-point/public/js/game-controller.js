/**
 * ローカルで遊ぶときのゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send(seat, command) で受け取る（オンライン対戦のコントローラーと同じ形）
 * 遊び方は2つ
 * - all：1人で全員の消防士を動かす
 * - team：自分の消防士だけを動かし、ほかは CPU が受け持つ
 * 操作のたびに { players, options, commands, mode } を保存し、「続きから」で記録から再現する
 * 待った：同じ手番の中の、正体を見ず乱数も使わない手だけを戻せる（戻すと有利になる手は戻さない）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { suggest, runCpuStep, isCpuTurn } from './cpu-player.js';
import * as Motion from './motion/motion.js';

export const CPU_STEP_DELAY_MS = 600;
export const AUTO_END_DELAY_MS = 900;
const SAVE_KEY = 'flash-point.save';
const NO_UNDO = ['end', 'role', 'place', 'gun', 'identify'];

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
        this.cancelCpu = null;
        this.cancelAuto = null;
        this.save();
    }

    getView() {
        const seat = this.mode === 'all' ? this.game.current : this.humanSeat;
        return createGameView(this.game, seat);
    }

    // 画面から動かせる席か
    canControl(seat) {
        if (this.mode === 'all') return !this.game.players[seat]?.isCPU;
        return seat === this.humanSeat;
    }

    send(seat, command) {
        if (!this.canControl(seat) || this.game.isOver()) return false;
        return this.apply(() => this.game.applyCommand(seat, command));
    }

    // ヒント：今の番の人が動かせる人なら、おすすめの手 { seat, command }。状態は変えない
    suggest() {
        const seat = this.game.actors()[0];
        if (seat === undefined || !this.canControl(seat)) return null;
        const command = suggest(this.game, seat);
        return command ? { seat, command } : null;
    }

    // 今の番を、CPU に1手打たせる
    assist() {
        const seat = this.game.actors()[0];
        if (seat === undefined || !this.canControl(seat)) return false;
        return this.apply(() => runCpuStep(this.game, seat));
    }

    // 1手戻せるか：同じ手番の自分の手で、正体を見ず乱数も使っていない
    canUndo() {
        const last = this.game.commands.at(-1);
        if (!last || this.game.isOver() || NO_UNDO.includes(last.command.type)) return false;
        if (last.playerId !== this.game.current || !this.canControl(last.playerId)) return false;
        const before = this.replayWithout();
        const revealed = (g) => g.pois.filter(x => x.revealed).map(x => x.id).join(',');
        return revealed(before) === revealed(this.game) && before.pois.length === this.game.pois.length;
    }

    undo() {
        if (!this.canUndo()) return false;
        this.game = this.replayWithout();
        this.afterChange();
        return true;
    }

    replayWithout() {
        const saved = this.game.persist();
        return Game.replay(saved.players, saved.options, saved.commands.slice(0, -1));
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
        this.scheduleAuto();
    }

    // CPU の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        this.cancelCpu?.();
        if (!isCpuTurn(this.game)) return;
        // 盤やカードの動きが終わってから間をおく（CPU の手が動きを追い越さない）
        this.cancelCpu = Motion.afterIdle(() => {
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
                    this.scheduleAuto();
                }
            }
        }, CPU_STEP_DELAY_MS);
    }

    // AP を使い切り、持つ・降ろすもなければ、手番を自動で終える
    autoCommand() {
        const g = this.game;
        if (g.isOver() || g.phase !== 'turn' || !this.canControl(g.current)) return null;
        const p = g.players[g.current];
        if (p.ap + p.ext + p.mv + p.cp > 0) return null;
        const canCarry = !p.carry && (g.pois.some(x => x.cell === p.cell && x.revealed && !g.carrierOf(`p${x.id}`))
            || g.hazmats.some(h => h.cell === p.cell && !g.carrierOf(`h${h.id}`)));
        return canCarry ? null : { type: 'end' };
    }

    scheduleAuto() {
        this.cancelAuto?.();
        if (!this.autoCommand()) return;
        this.cancelAuto = Motion.afterIdle(() => {
            const command = this.autoCommand();
            if (command) this.send(this.game.current, command);
        }, AUTO_END_DELAY_MS);
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), mode: this.mode }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        this.cancelCpu?.();
        this.cancelAuto?.();
    }
}
