/**
 * ローカル対戦（人間1人と CPU 3人）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuActors, suggest } from './cpu-player.js';
import * as Motion from './motion/motion.js';

const CPU_TURN_MS = [520, 820];  // CPU が打牌するまでの間（毎回少しずつ違う）
const CPU_CALL_MS = 380;         // 鳴くかどうかを答えるまでの間
const CPU_AFTER_CALL_MS = 900;   // 鳴き・立直・和了の声のあとは、見せる分だけ長く待つ
// 牌が動くときは、動き終わってから数える。動きが間の代わりになるので短くする
const MOTION_TURN_MS = [350, 600];
const MOTION_CALL_MS = 300;
const MOTION_AFTER_CALL_MS = 600;
const SAVE_KEY = 'mahjong.save';

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

    // 次に動く CPU を、間を置いて動かす。例外が出ても必ず次を予約する
    scheduleCpu() {
        this.cancelCpu?.();
        this.cancelCpu = null;
        const game = this.game;
        const moving = Motion.enabled();
        if (cpuActors(game).length === 0) return;
        let delay;
        if (game.phase === 'result') {
            delay = 0; // 局の結果は、人が「次へ」を押すまで出しておく。CPU はすぐ答える
        } else if (game.phase === 'call') {
            delay = moving ? MOTION_CALL_MS : CPU_CALL_MS;
        } else {
            const [min, max] = moving ? MOTION_TURN_MS : CPU_TURN_MS;
            delay = min + Math.random() * (max - min);
        }
        const last = game.events.at(-1);
        if (last?.type === 'call' && game.phase !== 'result') delay += moving ? MOTION_AFTER_CALL_MS : CPU_AFTER_CALL_MS;
        // 画面の動きが終わってから間をおいて打つ（動きを追い越さない）
        this.cancelCpu = Motion.afterIdle(() => {
            const progress = game.commands.length;
            try {
                const seat = cpuActors(this.game)[0];
                if (seat !== undefined) runCpuStep(this.game, seat);
            } catch (error) {
                console.error(error);
            } finally {
                // 3回続けて進まなければ、止まらないように見送り・ツモ切り・次へで抜ける
                this.stalls = this.game.commands.length === progress ? this.stalls + 1 : 0;
                if (this.stalls >= 3) this.forceStep();
                this.save();
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                }
            }
        }, delay);
    }

    forceStep() {
        this.stalls = 0;
        const seat = cpuActors(this.game)[0];
        if (seat === undefined) return;
        const tries = [{ type: 'pass' }, { type: 'next' }, { type: 'discard', tile: this.game.h.drawn }, { type: 'discard', tile: this.game.h.hands[seat]?.at(-1) }];
        tries.some(command => this.game.applyCommand(seat, command));
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
