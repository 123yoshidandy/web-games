/**
 * ローカル対戦（人間 1 人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形にする）
 * 判断が CPU のものなら、一定の間を置いて CPU に打たせる。人間の判断（ほかの人の番での「東京を明け渡すか」なども）は待つ
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuToAct } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 750;     // ダイスや結果が読める間
const AFTER_ATTACK_DELAY_MS = 1300;       // 攻撃・体力が 0・番の替わり目のあとは、長めに見せる
const STALL_LIMIT = 3;

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], options: { seed }, commands?, level, cpuDelay? } / listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.level = setup.level ?? 'normal';
        this.cpuDelay = setup.cpuDelay ?? CPU_STEP_DELAY_MS;
        this.game = setup.commands?.length
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cpuTimer = null;
        this.stalls = 0;
        this.scheduleCpu();
    }

    getView() {
        return createGameView(this.game, this.humanSeat);
    }

    saveData() {
        return {
            players: this.game.players.map(p => ({ name: p.name, isCPU: p.isCPU })),
            options: this.game.options,
            commands: this.game.commands,
            level: this.level
        };
    }

    send(command) {
        if (!this.game.applyCommand(this.humanSeat, command)) {
            this.listeners.onError?.(this.game.lastError);
            return false;
        }
        this.listeners.onUpdate?.();
        this.scheduleCpu();
        return true;
    }

    pause() {
        this.paused = true;
        clearTimeout(this.cpuTimer);
    }

    resume() {
        this.paused = false;
        this.scheduleCpu();
    }

    delay() {
        if (this.cpuDelay !== CPU_STEP_DELAY_MS) return this.cpuDelay; // 確かめるときに縮めた間は、そのまま使う
        const recent = this.game.events.slice(-4).map(e => e.type);
        return recent.some(t => t === 'attack' || t === 'knockOut' || t === 'turn') ? AFTER_ATTACK_DELAY_MS : this.cpuDelay;
    }

    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.paused || !isCpuToAct(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            try {
                this.stepCpu();
            } catch (error) {
                console.error(error);
            } finally {
                try {
                    this.listeners.onUpdate?.();
                } finally {
                    this.scheduleCpu();
                }
            }
        }, this.delay());
    }

    stepCpu() {
        const before = this.game.commands.length;
        try {
            runCpuStep(this.game, () => this.level);
        } catch (error) {
            console.error(error);
        }
        this.stalls = this.game.commands.length === before ? this.stalls + 1 : 0;
        if (this.stalls < STALL_LIMIT) return;
        this.stalls = 0;
        const d = this.game.decision;
        if (!d) return;
        const fallback = { roll: { type: 'resolve' }, buy: { type: 'endBuy' }, yield: { type: 'yield', yes: false }, wings: { type: 'wings', yes: false }, psychicProbe: { type: 'probe', index: null }, healingRay: { type: 'healingRay', give: {} }, opportunist: { type: 'opportunist', card: null }, mimic: { type: 'mimic', target: null }, metamorph: { type: 'metamorph', cards: [] } }[d.kind];
        if (fallback) this.game.applyCommand(d.seat, fallback);
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
