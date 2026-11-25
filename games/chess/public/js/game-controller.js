/**
 * ローカル対戦（CPU 戦と、2人で1台を使う対戦）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * 待った（undo）は、記録を縮めて再現し直す。CPU 戦では、自分の直前の手とそのあとの CPU の手をまとめて戻す
 *
 * CPU の判断は decider(view, level) → Promise<command> で受ける。ブラウザでは Web Worker で読み（画面を止めない）、
 * テストではその場で計算する。考えている間に待ったやホームで盤が変わったら、返ってきた答えは捨てる
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { decide, isCpuTurn, applyDecision } from './cpu-player.js';

const CPU_MOVE_MS = 450;    // 前の手で駒が動くのが見えるように待ってから考え始める
const SAVE_KEY = 'chess.save';

export function loadSavedGame() {
    try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
        if (!Array.isArray(saved?.players) || saved.players.length !== 2 || !Array.isArray(saved.commands)) return null;
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

const localDecider = (view, level) => Promise.resolve(decide(view, level));

export default class LocalGameController {
    // setup: { players, options } か、保存した { players, options, commands }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}, { decider = localDecider } = {}) {
        this.listeners = listeners;
        this.decider = decider;
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options ?? {}, setup.commands)
            : new Game(setup.players, setup.options ?? {});
        // 人が1人なら CPU 戦。2人なら、操作を待っている人の席から見る
        this.humanSeats = this.game.players.filter(p => !p.isCPU).map(p => p.id);
        this.cpuTimer = null;
        this.token = 0;
        this.thinking = false;
        this.stalls = 0;
        this.save();
    }

    get twoPlayers() {
        return this.humanSeats.length === 2;
    }

    viewSeat() {
        return this.twoPlayers ? (this.game.actors()[0] ?? this.game.current) : this.humanSeats[0];
    }

    getView() {
        const view = createGameView(this.game, this.viewSeat());
        view.canUndo = this.undoLength() !== null;
        view.thinking = this.thinking;
        view.twoPlayers = this.twoPlayers;
        return view;
    }

    // 人の操作。投了は手番に関係なくできる
    send(command) {
        const seat = command?.type === 'resign' ? this.viewSeat() : this.game.actors()[0];
        if (!this.humanSeats.includes(seat) || this.game.isOver()) return false;
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

    // 待ったで残す記録の長さ（人が最後に指した手か投了の前まで）。戻せないなら null
    undoLength() {
        const commands = this.game.commands;
        for (let i = commands.length - 1; i >= 0; i--) {
            const { playerId, command } = commands[i];
            if (this.humanSeats.includes(playerId) && (command.type === 'move' || command.type === 'resign')) return i;
        }
        return null;
    }

    undo() {
        const keep = this.undoLength();
        if (keep === null) return false;
        this.cancelCpu();
        const { players, options, commands } = this.game.persist();
        this.game = Game.replay(players, options, commands.slice(0, keep));
        this.afterChange();
        return true;
    }

    afterChange() {
        this.save();
        this.listeners.onUpdate?.();
        this.scheduleCpu();
    }

    cancelCpu() {
        clearTimeout(this.cpuTimer);
        this.cpuTimer = null;
        this.token++;
        this.thinking = false;
    }

    // CPU の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        this.cancelCpu();
        if (!isCpuTurn(this.game)) return;
        const token = this.token;
        this.cpuTimer = setTimeout(() => this.runCpu(token), CPU_MOVE_MS);
    }

    async runCpu(token) {
        const game = this.game;
        const seat = game.actors()[0];
        const view = createGameView(game, seat);
        this.thinking = true;
        this.listeners.onUpdate?.();
        let command = null;
        try {
            command = await this.decider(view, game.players[seat].cpuLevel ?? 'normal');
        } catch (error) {
            console.error(error);
        }
        // 考えている間に、待ったやホームで盤が変わった
        if (token !== this.token || game !== this.game) return;
        this.thinking = false;
        try {
            const before = game.commands.length;
            applyDecision(game, seat, view, command);
            this.stalls = game.commands.length === before ? this.stalls + 1 : 0;
            if (this.stalls >= 3) {
                // 3回続けて進まなければ知らせる（applyDecision が最初の合法手まで試すので、ふつうは起きない）
                this.stalls = 0;
                this.listeners.onError?.('CPU が進めませんでした');
                return;
            }
        } catch (error) {
            console.error(error);
        }
        this.save();
        try {
            this.listeners.onUpdate?.();
        } finally {
            this.scheduleCpu();
        }
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.persist()));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        this.cancelCpu();
    }
}
