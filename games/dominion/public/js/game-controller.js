/**
 * ドミニオンのゲームコントローラー（ローカル対戦）
 * 画面には getView() でプレイヤーから見た状態だけを渡し、操作は send() で受け取る
 * オンライン対戦のコントローラーも同じ形にして、画面からは区別なく使えるようにする
 * 状態が変わるたびに { players, options, commands } を保存し、「続きから」で記録から再現する
 * （オンライン対戦は online-controller.js を使うので、ここには保存されない）
 */

import Game from './game.js';
import { createGameView, hydrateGameView } from './game-view.js';
import { runCpuStep, isCpuToMove, suggest } from './cpu-player.js';
import { createSeed } from './random.js';

const SAVE_KEY = 'dominion.save';

// 保存したローカル対戦の途中経過。なければ null
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

class GameController {
    constructor() {
        this.game = null;
        this.uiController = null;
        this.viewerId = null; // 画面に表示しているプレイヤー
    }

    // ゲームを初期化（シードを決めておき、記録と一緒に保存する）
    initGame(playerNames, options = {}) {
        this.setup = { players: playerNames, options: { ...options, seed: options.seed ?? createSeed() } };
        this.game = new Game(this.setup.players, this.setup.options);
        this.game.setup();
        this.attach();
        this.save();
        return this.game;
    }

    // 保存した途中経過を、操作の記録から再現して続ける。再現できなければ保存を消して false を返す
    resumeGame(saved) {
        try {
            this.game = Game.replay(saved.players, saved.options, saved.commands);
        } catch (error) {
            console.error(error);
            clearSavedGame();
            return false;
        }
        this.setup = { players: saved.players, options: saved.options };
        this.attach();
        return true;
    }

    // ゲーム状態が変わったら画面を描き直す
    // （状態が変わったと知らせるのは、操作を記録に積む前なので、保存は send・runCpuStep の後で行う）
    attach() {
        this.viewerId = null;
        this.game.setCallback('onStateChanged', () => {
            if (this.uiController) {
                this.uiController.updateGameView();
            }
        });
    }

    // 終わったゲームは「続きから」に出さない
    save() {
        if (!this.game) return;
        try {
            if (this.game.phase === 'end') localStorage.removeItem(SAVE_KEY);
            else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.setup, commands: this.game.commands }));
        } catch { /* 保存できない環境でも遊べるようにする */ }
    }

    // ゲームをやめる（ホームに戻るとき）
    quit() {
        this.game = null;
        this.viewerId = null;
    }

    // UIコントローラーを設定
    setUIController(uiController) {
        this.uiController = uiController;
    }

    // 画面に表示するプレイヤー。人間の選択待ちならその人、人間の手番ならその人
    // CPUの手番中は、直前に表示していた人間のままにする（同じ端末で人間が交代で遊ぶときにも使える）
    // リアルタイムモードは人間が1人のときだけ使うので、いつもその人を表示する
    getViewerId() {
        const game = this.game;
        if (game.isRealtime()) {
            this.viewerId = (game.players.find(player => !player.isCPU) ?? game.players[0]).id;
            return this.viewerId;
        }
        const prompt = game.pendingPrompt;
        const current = game.getCurrentPlayer();

        // 支配のターン中は、支配したプレイヤーが手番のプレイヤーを操作する
        const promptController = prompt ? game.getController(prompt.player) : null;
        const currentController = game.getController(current);
        if (promptController && !promptController.isCPU) {
            this.viewerId = promptController.id;
        } else if (!currentController.isCPU) {
            this.viewerId = currentController.id;
        } else if (this.viewerId === null) {
            this.viewerId = (game.players.find(player => !player.isCPU) ?? game.players[0]).id;
        }
        return this.viewerId;
    }

    // ヒント：画面に表示している人の番に、CPU が選ぶ操作。手は打たず、記録にも入れない
    hint() {
        return this.game ? suggest(this.game, this.getViewerId()) : null;
    }

    // 画面に表示するプレイヤーから見たゲームの状態
    getView() {
        if (!this.game) return null;
        return hydrateGameView(createGameView(this.game, this.getViewerId()));
    }

    // 画面に表示しているプレイヤーの操作を送る。受け付けられたかを返す
    send(command) {
        if (!this.game) return false;
        const accepted = this.game.applyCommand(this.getViewerId(), command);
        if (accepted) this.save();
        return accepted;
    }

    // CPUがやることがあるか（CPUの手番、または人間の手番中にCPUが答える選択待ちがある）
    // 人間の選択待ちのあいだは、答えが出るまでCPUは待つ
    hasCpuWork() {
        return Boolean(this.game) && isCpuToMove(this.game);
    }

    // CPUが1手進めるまでの待ち時間（リアルタイムモードは人間と同時に進めるので短くする。null なら画面の既定）
    cpuStepDelayMs() {
        return this.game?.isRealtime() ? 150 : null;
    }

    // CPUの手番を1手進める
    runCpuStep() {
        if (!this.game) return;
        runCpuStep(this.game);
        this.save();
    }
}

export default GameController;
