/**
 * ローカルのゲーム（1人で遊ぶか、人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands, level } を保存し、「続きから」で記録から再現する
 * 終わったら、あなたの点数をハイスコアの記録に足す（終わった時点で途中経過を消すので、二重には数えない）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuActors, suggest, PROFILES } from './cpu-player.js';
import { addRecord } from './records.js';

const CPU_DELAY_MS = [750, 1000];   // CPU が振る・書くまでの間（毎回少しずつ違う）
const CPU_AFTER_TURN_MS = 500;      // 手番が CPU に移ったときは、前の人の記入を見せる分だけ長く待つ
const SAVE_KEY = 'yahtzee.save';

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
    // setup: { players, options, level } か、保存した { players, options, commands, level }。listeners: onUpdate()・onError(message)・onRecord(record)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.level = PROFILES[setup.level] && !PROFILES[setup.level].random ? setup.level : 'normal';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cpuTimer = null;
        this.recorded = this.game.isOver();
        this.save();
    }

    // ヒント：人のおすすめの手（人の番でなければ null）
    hint() {
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

    // 手番の CPU を、間を置いて1手ずつ動かす。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (cpuActors(this.game).length === 0) return;
        const [min, max] = CPU_DELAY_MS;
        const last = this.game.events.at(-1);
        const delay = min + Math.random() * (max - min) + (last?.type === 'turn' && this.game.commands.length > 0 ? CPU_AFTER_TURN_MS : 0);
        this.cpuTimer = setTimeout(() => {
            try {
                const seat = cpuActors(this.game)[0];
                if (seat !== undefined) runCpuStep(this.game, seat, PROFILES[this.level]);
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
        }, delay);
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), level: this.level }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
        if (this.game.isOver() && !this.recorded) {
            this.recorded = true;
            const me = this.game.results()[this.humanSeat];
            const record = addRecord({
                score: me.total,
                opponents: this.game.players.length - 1,
                level: this.level,
                won: this.game.players.length > 1 && this.game.winners.includes(this.humanSeat)
            });
            this.listeners.onRecord?.(record);
        }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
