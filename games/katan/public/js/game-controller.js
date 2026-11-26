/**
 * ローカル対戦（同じ端末で、人間とCPUが交代で遊ぶ）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形）
 * 手番の人だけでなく、手札を捨てる人・交渉に答える人も操作するので、今操作が必要な人間から見たビューを渡す
 * 操作のたびに { players, options, commands } を保存し、「続きから」で記録から再現する（オンライン対戦は保存しない）
 */

import Game, { RESOURCES } from './game.js';
import { GEOMETRY } from './board.js';
import { createGameView, hydrateGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, cpuActor, setupCpuSeats, setupCpuDelay } from './cpu-player.js';

const CPU_STEP_DELAY_MS = 700; // CPUの手は1手ずつ間を置いて見せる
const REALTIME_CPU_STEP_DELAY_MS = 350; // リアルタイムモードでは、CPU が並んで動くので間を短くする
const STALL_LIMIT = 3; // CPU の手が進まないことがこの回数続いたら、いちばん単純な答えか「番を終える」で抜ける
const SAVE_KEY = 'katan.save';

// 途中のローカル対戦（なければ null）
export function loadSavedGame() {
    try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
        if (!Array.isArray(saved?.players) || !saved.options || !Array.isArray(saved.commands)) return null;
        return saved;
    } catch {
        return null;
    }
}

export function clearSavedGame() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch {
        // 保存できない環境では何もしない
    }
}

export default class LocalGameController {
    // players: [{ name, isCPU }] / listeners: onUpdate() / onError(message) / options: { mode, saved, level }
    // saved（loadSavedGame の中身）を渡すと、記録から再現して続きから遊ぶ
    constructor(players, listeners = {}, { mode = 'classic', saved = null, level = 'normal' } = {}) {
        this.listeners = listeners;
        this.level = level;     // CPU の強さ（normal / strong）。CPU は乱数を使わないので、記録の再現には関わらない
        this.game = saved ? Game.replay(saved.players, saved.options, saved.commands) : new Game(players, { mode });
        this.cpuTimer = null;
        this.setupDueAt = {};   // リアルタイムモードの初期配置で、CPU ごとに次に置く時刻
        this.lastHumanId = null;
        this.save();
        this.scheduleCpu();
    }

    // 終わったゲームは消し、途中なら保存する
    save() {
        try {
            if (this.game.phase === 'end') {
                clearSavedGame();
                return;
            }
            const players = this.game.players.map(({ name, isCPU }) => ({ name, isCPU }));
            const options = { seed: this.game.seed, mode: this.game.mode };
            localStorage.setItem(SAVE_KEY, JSON.stringify({ players, options, commands: this.game.commands }));
        } catch {
            // 保存できない環境（プライベートブラウズなど）でも遊べるようにする
        }
    }

    // 操作が必要な人間（いなければ、最後に操作した人間。全員CPUなら観戦）
    viewerId() {
        const humans = this.game.players.filter(p => !p.isCPU).map(p => p.id);
        const actor = this.game.actors().find(id => humans.includes(id) && !(this.game.trade && id === this.game.trade.from && this.waitingTradeHumans().length > 0));
        if (actor !== undefined) this.lastHumanId = actor;
        return this.lastHumanId ?? humans[0] ?? null;
    }

    // 交渉に答えていない人間（手番の人の前に答えてもらう）
    waitingTradeHumans() {
        const { trade } = this.game;
        if (!trade) return [];
        return this.game.players.filter(p => !p.isCPU && p.id !== trade.from && !trade.responses[p.id]).map(p => p.id);
    }

    getView() {
        return hydrateGameView(createGameView(this.game, this.viewerId()));
    }

    send(command) {
        const id = this.viewerId();
        if (id === null) return false;
        if (!this.game.applyCommand(id, command)) {
            this.listeners.onError?.(this.game.lastError);
            return false;
        }
        this.save();
        this.listeners.onUpdate?.();
        this.scheduleCpu();
        return true;
    }

    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.game.isRealtimeSetup()) {
            this.scheduleSetupCpu();
            return;
        }
        if (!isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            // どこで例外が出ても、必ず次の手を予約する（対戦が止まらないように）
            try {
                this.stepCpu();
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
        }, this.game.isRealtimePlay() ? REALTIME_CPU_STEP_DELAY_MS : CPU_STEP_DELAY_MS);
    }

    // リアルタイムモードの初期配置：CPU ごとに、人間が場所を選ぶくらいの間を置いて1つずつ置く（早い者勝ちなので）
    scheduleSetupCpu() {
        const seats = setupCpuSeats(this.game);
        if (seats.length === 0) return;
        const now = Date.now();
        seats.forEach(seat => { this.setupDueAt[seat] ??= now + setupCpuDelay(this.game, seat); });
        const next = Math.min(...seats.map(seat => this.setupDueAt[seat]));
        this.cpuTimer = setTimeout(() => {
            const time = Date.now();
            try {
                seats.filter(seat => this.setupDueAt[seat] <= time && this.game.isRealtimeSetup()).forEach(seat => {
                    try {
                        runCpuStep(this.game, seat, this.level);
                    } catch (error) {
                        console.error(error);
                    }
                    this.setupDueAt[seat] = time + setupCpuDelay(this.game, seat);
                });
            } finally {
                this.save();
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                }
            }
        }, Math.max(0, next - now));
    }

    stepCpu() {
        const before = this.game.commands.length;
        try {
            runCpuStep(this.game, undefined, this.level);
        } catch (error) {
            console.error(error);
        }
        this.stalls = this.game.commands.length === before ? (this.stalls ?? 0) + 1 : 0;
        if (this.stalls < STALL_LIMIT) return;
        this.stalls = 0;
        const seat = cpuActor(this.game);
        if (seat !== null) simpleCommands(this.game, seat).some(command => this.game.applyCommand(seat, command));
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}

// CPU の手が進まないときに試す、いちばん単純な手（通るものを順に試す）
export function simpleCommands(game, seat) {
    const commands = [];
    if (game.trade && seat !== game.trade.from && !game.trade.responses[seat]) {
        commands.push({ type: 'respondTrade', id: game.trade.id, accept: false });
    }
    const pending = game.pendingOf(seat);
    if (pending?.type === 'discard') {
        // 手札の先頭の資源から順に捨てる
        let count = pending.remaining[seat];
        const cards = Object.fromEntries(RESOURCES.map(r => {
            const n = Math.min(count, game.players[seat].hand[r]);
            count -= n;
            return [r, n];
        }));
        commands.push({ type: 'discard', cards });
    }
    if (pending?.type === 'robber') {
        GEOMETRY.hexes.filter(h => h.id !== game.robber).forEach(h => {
            commands.push({ type: 'moveRobber', hex: h.id, victim: null });
            game.players.forEach(p => commands.push({ type: 'moveRobber', hex: h.id, victim: p.id }));
        });
    }
    commands.push({ type: 'endTurn' });
    return commands;
}
