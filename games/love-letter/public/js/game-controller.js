/**
 * ローカル対戦（人間 1 人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形にする）
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, isCpuTurn, suggest } from './cpu-player.js';

export const CPU_STEP_DELAY_MS = 1400; // CPU の手は、前に出されたカードと結果が読める間を置いてから打つ
const AFTER_TURN_DELAY_MS = 2200;      // 脱落やラウンドの終わりのあとは、何が起きたかを見る間を長めに取る
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

    // ヒント：人の番なら、おすすめの手（操作）を返す。状態は変えない
    suggest() {
        return suggest(this.game, this.humanSeat);
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

    // 遊び方などを開いている間は、CPU を止める
    pause() {
        this.paused = true;
        clearTimeout(this.cpuTimer);
    }

    resume() {
        this.paused = false;
        this.scheduleCpu();
    }

    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.paused || !isCpuTurn(this.game)) return;
        this.cpuTimer = setTimeout(() => {
            // どこで例外が出ても、必ず次の手を予約する（対戦が止まらないように）
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

    delay() {
        if (this.cpuDelay !== CPU_STEP_DELAY_MS) return this.cpuDelay; // 確かめるときに縮めた間は、そのまま使う
        // 直前の手番で、脱落やラウンドの終わりがあったら長めに待つ
        const recent = this.game.events.slice(-6).map(e => e.type);
        return recent.includes('out') || recent.includes('roundEnd') ? AFTER_TURN_DELAY_MS : this.cpuDelay;
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
        // 一番単純な手：宰相なら先頭を残す。出すなら、出せる最初のカードを最初に選べる人へ
        const seat = this.game.current;
        const view = createGameView(this.game, seat);
        if (this.game.phase === 'chancellor') {
            const [card, ...bottom] = view.hand;
            this.game.applyCommand(seat, { type: 'keep', card, bottom });
            return;
        }
        (view.legal ?? []).some(l => this.game.applyCommand(seat, { type: 'play', card: l.card, target: l.targets[0] ?? null, guess: l.needsGuess ? 2 : null }));
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
