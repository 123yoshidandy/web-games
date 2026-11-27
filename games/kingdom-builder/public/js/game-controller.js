/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * 自分の番の中なら、undo() で1手戻せる（記録の最後の操作を除いて作り直す）
 */

import * as Motion from './motion/motion.js';
import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, suggest } from './cpu-player.js';

const CPU_DELAY_MS = 550;       // CPU は1軒ずつ、間を置いて建てる
const SAVE_KEY = 'kingdom-builder.save';

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

    // 今の手番が始まったときの記録の数
    findTurnStart() {
        const commands = this.game.commands;
        let i = commands.length;
        while (i > 0 && commands[i - 1].command.type !== 'end') i--;
        return i;
    }

    // 自分の番の中で、戻せる操作があるか。戻すとカードを引き直した事実まで消える操作は戻せない
    canUndo() {
        return this.game.active === this.humanSeat && this.game.phase === 'play' && this.game.commands.length > this.findTurnStart() && this.undoTarget() !== null;
    }

    undoTarget() {
        const saved = this.game.persist();
        const previous = Game.replay(saved.players, saved.options, saved.commands.slice(0, -1));
        if (previous.deck.length !== this.game.deck.length || previous.removed.length !== this.game.removed.length) return null;
        return previous;
    }

    undo() {
        if (!this.canUndo()) return false;
        this.game = this.undoTarget();
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
        if (!isCpuTurn(this.game)) return;
        // 盤の動きが終わってから間をおく（CPU の手が動きを追い越さない）
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
        }, CPU_DELAY_MS);
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
