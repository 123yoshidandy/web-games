/**
 * ローカルのゲーム（人1人と CPU の仲間）のコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーも同じ形）
 * 操作のたびに { players, seed, commands } を保存し、「続きから」で記録から再現する
 * 待った：今の番に出したカードを1枚ずつ戻せる（番を終えて引いたあとは戻せない）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, hasCpuWork, chooseMove, suggest } from './cpu.js';
import { createSeed } from './random.js';
import * as storage from './storage.js';

export const CPU_STEP_DELAY_MS = 750;  // CPU がカードを出す間（何を出したか読めるように）
const SIGNAL_DELAY_MS = 350;           // 合図の置き直しは短く
const SAVE_KEY = 'save';

export default class LocalGameController {
    // setup: { players: [{ name, isCPU, level }], seed?, commands? } / listeners: onUpdate() / onError(message) / onEnd(result)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.setup = { players: setup.players, seed: setup.seed ?? createSeed() };
        this.game = Game.replay(this.setup.players, { seed: this.setup.seed }, setup.commands ?? []);
        this.humanSeat = this.setup.players.findIndex(player => !player.isCPU);
        this.cpuTimer = null;
        this.paused = false;
        this.stalls = 0;
        this.ended = this.game.isOver;
        this.persist();
        this.scheduleCpu(CPU_STEP_DELAY_MS);
    }

    static loadSaved() {
        const saved = storage.load(SAVE_KEY);
        if (!saved || !Array.isArray(saved.players) || !Array.isArray(saved.commands)) return null;
        try {
            const game = Game.replay(saved.players, { seed: saved.seed }, saved.commands);
            if (game.isOver) throw new Error('終わったゲーム');
            return saved;
        } catch {
            storage.remove(SAVE_KEY);
            return null;
        }
    }

    static clearSaved() {
        storage.remove(SAVE_KEY);
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    // ヒント：人のおすすめの手（番でなければ null）
    hint() {
        return suggest(this.game, this.humanSeat);
    }

    send(command) {
        if (!this.game.applyCommand(this.humanSeat, command)) {
            this.listeners.onError?.(this.game.lastError);
            return false;
        }
        this.afterMove();
        return true;
    }

    // 待った：今の番に人が出した最後のカードがあれば戻せる
    canUndo() {
        return this.undoIndex() >= 0;
    }

    undoIndex() {
        const game = this.game;
        if (game.isOver || game.current !== this.humanSeat || game.played === 0) return -1;
        for (let i = game.commands.length - 1; i >= 0; i--) {
            const { seat, command } = game.commands[i];
            if (command.type === 'end') return -1;
            if (seat === this.humanSeat && command.type === 'play') return i;
        }
        return -1;
    }

    // そのカードを出す前に戻す（あとに続いた CPU の合図の置き直しも消え、やり直される）
    undo() {
        const index = this.undoIndex();
        if (index < 0) return false;
        this.game = Game.replay(this.setup.players, { seed: this.setup.seed }, this.game.commands.slice(0, index));
        this.afterMove();
        return true;
    }

    afterMove() {
        this.persist();
        this.listeners.onUpdate?.();
        if (this.game.isOver && !this.ended) {
            this.ended = true;
            this.listeners.onEnd?.(this.game.result);
        }
        this.scheduleCpu();
    }

    // 番の CPU がカードを出すときは間を置き、合図の置き直しだけなら短く
    scheduleCpu(delay) {
        clearTimeout(this.cpuTimer);
        if (this.paused || !hasCpuWork(this.game)) return;
        const wait = delay ?? (this.game.players[this.game.current].isCPU ? CPU_STEP_DELAY_MS : SIGNAL_DELAY_MS);
        this.cpuTimer = setTimeout(() => this.cpuStep(), wait);
    }

    cpuStep() {
        if (this.paused || !hasCpuWork(this.game)) return;
        const count = this.game.commands.length;
        try {
            runCpuStep(this.game);
        } catch (error) {
            console.warn('CPU の手で例外', error);
        }
        if (this.game.commands.length === count && ++this.stalls >= 3) {
            // 進まなければ、番の CPU の手をやさしい考えで選んで抜ける
            const seat = this.game.current;
            const move = this.game.players[seat].isCPU ? chooseMove(this.game, seat, 'easy') : null;
            if (move) this.game.applyCommand(seat, move);
        }
        if (this.game.commands.length !== count) this.stalls = 0;
        this.afterMove();
    }

    pause() {
        this.paused = true;
        clearTimeout(this.cpuTimer);
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        this.scheduleCpu();
    }

    persist() {
        if (this.game.isOver) storage.remove(SAVE_KEY);
        else storage.save(SAVE_KEY, { ...this.setup, commands: this.game.commands });
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
