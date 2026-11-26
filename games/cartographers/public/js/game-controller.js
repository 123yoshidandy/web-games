/**
 * ローカル対戦（人間1人と CPU 0〜3人）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuSeats, suggest } from './cpu-player.js';

const CPU_DELAY_MS = 350;   // CPU は同じカードを同時に描くので、間を短めにして1人ずつ
const SAVE_KEY = 'cartographers.save';

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
        this.cpuTimer = null;
        this.save();
    }

    // ヒント：人が描く番に、CPU（ふつう）が選ぶ描き方。手は打たず、記録にも入れない
    hint() {
        return suggest(this.game, this.humanSeat);
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    send(command) {
        const seat = this.humanSeat;
        if (!this.game.pending.includes(seat)) return false;
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

    // 描く必要のある CPU がいれば、間を置いて1人ずつ描かせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (cpuSeats(this.game).length === 0) return;
        this.cpuTimer = setTimeout(() => {
            try {
                const seat = cpuSeats(this.game)[0];
                if (seat !== undefined && !runCpuStep(this.game, seat)) {
                    // 進まなければ、例の手のどれかで抜ける（ふつうは起きない）
                    this.game.sampleCommands(seat).some(c => this.game.applyCommand(seat, c));
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
        clearTimeout(this.cpuTimer);
    }
}
