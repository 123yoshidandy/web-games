/**
 * ローカル対戦（同じ端末で、人間とCPUが交代で遊ぶ）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（オンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands, level } を保存し、「続きから」で記録から再現する
 * （オンライン対戦はこのコントローラーを使わないので、保存されない）
 */

import Game from './game.js';
import { createGameView, hydrateGameView } from './game-view.js';
import { runLeveledCpuStep, isLevel, DEFAULT_LEVEL } from './cpu-level.js';

const CPU_STEP_DELAY_MS = 600; // CPUの手は1手ずつ間を置いて見せる
const SAVE_KEY = 'lucky-numbers.save';

// 保存した途中のゲーム（なければ null）
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
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

export default class LocalGameController {
    // setup: { players: [{ name, isCPU }], level } か、保存した { players, options, commands, level }
    // listeners: onUpdate() / onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.level = isLevel(setup.level) ? setup.level : DEFAULT_LEVEL;
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.cpuTimer = null;
        this.save();
        this.scheduleCpu();
    }

    // 手番の人間から見たビュー。CPUの番は、最後に操作した人間（いなければ観戦）から見る
    getView() {
        const current = this.game.getCurrentPlayer();
        if (!current.isCPU) this.lastHumanId = current.id;
        const humans = this.game.players.filter(player => !player.isCPU);
        const viewerId = this.lastHumanId ?? humans[0]?.id ?? null;
        return hydrateGameView(createGameView(this.game, viewerId));
    }

    send(command) {
        const current = this.game.getCurrentPlayer();
        if (current.isCPU) return false;
        if (!this.game.applyCommand(current.id, command)) {
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
        if (this.game.phase !== 'play' || !this.game.getCurrentPlayer().isCPU) return;
        this.cpuTimer = setTimeout(() => {
            runLeveledCpuStep(this.game, this.level);
            this.save();
            this.listeners.onUpdate?.();
            this.scheduleCpu();
        }, CPU_STEP_DELAY_MS);
    }

    // 途中のゲームを保存する。終わったゲームは消す（「続きから」に出さない）
    save() {
        if (this.game.phase === 'end') {
            clearSavedGame();
            return;
        }
        try {
            const players = this.game.players.map(({ name, isCPU }) => ({ name, isCPU }));
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                players, options: { seed: this.game.seed }, commands: this.game.commands, level: this.level
            }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
