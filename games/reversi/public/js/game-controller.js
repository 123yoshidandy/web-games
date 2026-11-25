/**
 * ローカル対戦（CPU 戦と、2人で1台を使う対戦）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * 待った（undo）は、記録を縮めて再現し直す。CPU 戦では、自分の直前の手とそのあとの CPU の手をまとめて戻す
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn } from './cpu-player.js';

const CPU_MOVE_MS = 700;    // 前の手で石が返る動きが見えるように待つ
const SAVE_KEY = 'reversi.save';

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

export default class LocalGameController {
    // setup: { players, options } か、保存した { players, options, commands }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options ?? {}, setup.commands)
            : new Game(setup.players, setup.options ?? {});
        // 人が1人なら CPU 戦。2人なら、手番の人の席から見る
        const humans = this.game.players.filter(p => !p.isCPU).map(p => p.id);
        this.humanSeats = humans;
        this.cpuTimer = null;
        this.stalls = 0;
        this.save();
    }

    get twoPlayers() {
        return this.humanSeats.length === 2;
    }

    viewSeat() {
        return this.twoPlayers ? this.game.current : this.humanSeats[0];
    }

    getView() {
        const view = createGameView(this.game, this.viewSeat());
        view.canUndo = this.undoLength() !== null;
        return view;
    }

    send(command) {
        const seat = this.game.current;
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

    // 待ったで残す記録の長さ。戻せないなら null
    undoLength() {
        const commands = this.game.commands;
        for (let i = commands.length - 1; i >= 0; i--) {
            if (this.humanSeats.includes(commands[i].playerId)) return i;
        }
        return null;
    }

    undo() {
        const keep = this.undoLength();
        if (keep === null) return false;
        clearTimeout(this.cpuTimer);
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

    // CPU の番なら、間を置いて1手打たせる。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (!isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            try {
                const before = this.game.commands.length;
                runCpuStep(this.game);
                this.stalls = this.game.commands.length === before ? this.stalls + 1 : 0;
                if (this.stalls >= 3) {
                    // 3回続けて進まなければ知らせる（runCpuStep が置けるマスの先頭まで試すので、ふつうは起きない）
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
        }, CPU_MOVE_MS);
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
