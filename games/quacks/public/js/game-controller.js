/**
 * ローカル対戦（人間1人と CPU）のゲームコントローラー
 * 画面には getView() でビューを渡し、操作は send() で受け取る（のちのオンライン対戦のコントローラーと同じ形）
 * 操作のたびに { players, options, commands, level } を保存し、「続きから」で記録から再現する
 *
 * 調合は全員が同時に行うルールだが、画面では「あなた → CPU」の順に見せる
 * あなたが止めるまで CPU は引かず、止めたら CPU が一斉に1つずつ引く
 */

import Game from './game.js';
import { createGameView } from './game-view.js';
import { runCpuStep, cpuActors, PROFILES, suggest } from './cpu-player.js';

const CPU_BREW_MS = 330;     // CPU が1つ引く間隔
const CPU_CHOICE_MS = 160;   // 占い・買い物などの選択
const SAVE_KEY = 'quacks.save';

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
    // setup: { players, options, level } か、保存した { players, options, commands, level }。listeners: onUpdate()・onError(message)
    constructor(setup, listeners = {}) {
        this.listeners = listeners;
        this.level = PROFILES[setup.level] && !PROFILES[setup.level].random ? setup.level : 'normal';
        this.game = setup.commands
            ? Game.replay(setup.players, setup.options, setup.commands)
            : new Game(setup.players, setup.options);
        this.humanSeat = this.game.players.findIndex(p => !p.isCPU);
        this.cpuTimer = null;
        this.stuck = 0;
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
        const before = this.game.persist();
        let ok;
        try {
            ok = this.game.applyCommand(this.humanSeat, command);
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

    // 今動かす CPU（調合では、あなたが止めるまで待つ）
    readyCpus() {
        const cpus = cpuActors(this.game);
        if (this.game.phase !== 'brew') return cpus.slice(0, 1);
        const me = this.game.players[this.humanSeat];
        return me.brew && !me.brew.done ? [] : cpus;
    }

    // CPU を、間を置いて動かす。例外が出ても必ず次を予約する
    scheduleCpu() {
        clearTimeout(this.cpuTimer);
        if (this.readyCpus().length === 0) return;
        const delay = this.game.phase === 'brew' ? CPU_BREW_MS : CPU_CHOICE_MS;
        this.cpuTimer = setTimeout(() => {
            try {
                const progress = this.game.commands.length;
                // 調合では、まだ引いている CPU が1つずつ同時に引く
                this.readyCpus().forEach(seat => {
                    if (this.game.actors().includes(seat)) runCpuStep(this.game, seat, PROFILES[this.level]);
                });
                this.stuck = this.game.commands.length === progress ? this.stuck + 1 : 0;
                if (this.stuck >= 3) {
                    // 3回続けて進まなければ、いちばん単純な答えで抜ける
                    cpuActors(this.game).forEach(seat => runCpuStep(this.game, seat, PROFILES.random));
                    this.stuck = 0;
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
        }, delay);
    }

    save() {
        try {
            if (this.game.isOver()) localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.game.persist(), level: this.level }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    stop() {
        clearTimeout(this.cpuTimer);
    }
}
