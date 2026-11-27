/**
 * ローカルで遊ぶときのゲームコントローラー（あなた＝席0、CPU＝席1）
 * 画面には getView() でビューを渡し、操作は send(seat, command) で受け取る（オンライン対戦のコントローラーと同じ形）
 * 始めるときに、あなたの編成と CPU の編成を送ってから対戦に入る
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * 待ったはない（命中と乱数の幅を見たあとに戻すと、有利になるため）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { suggest, runCpuStep, isCpuTurn } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 650;
const SAVE_KEY = 'pokemon-battle.save';

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
    // setup: { players, options, team }（新しい対戦）か、保存した { players, options, commands }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.humanSeat = 0;
        this.cpuTimer = null;
        if (setup.commands) {
            this.game = Game.replay(setup.players, setup.options, setup.commands);
        } else {
            this.game = new Game(setup.players, setup.options);
            if (!this.game.applyCommand(this.humanSeat, { type: 'team', team: setup.team })) throw new Error(this.game.lastError);
        }
        // 編成の段階は CPU もすぐに済ませる
        while (this.game.phase === 'setup' && runCpuStep(this.game));
        this.save();
    }

    // 対戦の印（結果を二重に数えないため）
    get seed() {
        return this.game.options.seed;
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    canControl(seat) {
        return seat === this.humanSeat;
    }

    send(seat, command) {
        if (!this.canControl(seat) || this.game.isOver()) return false;
        return this.apply(() => this.game.applyCommand(seat, command));
    }

    // ヒント：おすすめの手 { seat, command }。状態は変えない
    suggest() {
        const seat = this.humanSeat;
        if (!this.game.actors().includes(seat)) return null;
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

    // CPU の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (!isCpuTurn(this.game)) return;
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
}
