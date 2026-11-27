import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GameController from '../public/js/game-controller.js';
import { CARD_TYPES } from '../public/js/card-data.js';

// 画面の部品（アニメーション・音・画面の描画）は差し替え、操作の流れだけを確かめる
// アニメーションの完了は、テストから呼ぶまで待たせる
const pendingAnimations = [];
vi.mock('../public/js/card-animations.js', () => {
    const animate = (element, target, callback) => pendingAnimations.push(callback);
    return {
        default: { playCard: animate, purchaseCard: animate, discardCard: animate },
        STAGGER_MS: 0
    };
});
vi.mock('../public/js/ui-view.js', () => ({ hasNightCard: () => false }));
vi.mock('../public/js/music.js', () => ({ music: { play: () => {} } }));

const { default: UIEventHandler, unplayableReason } = await import('../public/js/ui-event-handler.js');

// 財宝はタイマーで少しずつずらして動かし始めるので、タイマーを進めてから終える
const finishAnimations = () => {
    vi.runAllTimers();
    while (pendingAnimations.length > 0) pendingAnimations.shift()();
};

// 手札の要素（data-card-index で手札と対応させる）と場札・捨て札の置き場を、最小限の形で作る
function createHandler(controller) {
    const cardElements = () => controller.getView().me.hand.map((card, index) => ({
        style: {},
        getAttribute: (name) => (name === 'data-card-index' ? String(index) : null)
    }));
    const rect = { left: 0, top: 0, right: 100, width: 100, height: 30 };
    const elements = {
        handCards: { querySelectorAll: () => cardElements(), querySelector: () => null },
        playedCards: { querySelectorAll: () => [], getBoundingClientRect: () => rect },
        discardCards: { getBoundingClientRect: () => rect }
    };
    const handler = new UIEventHandler({ elements, gameController: controller, showToast: vi.fn() });
    // 状態が変わって描き直されたときと同じく、返事待ちの操作をなくす
    controller.setUIController({ updateGameView: () => handler.clearPendingActions() });
    return handler;
}

describe('ターン終了の操作（#12）', () => {
    let controller;
    let handler;

    beforeEach(() => {
        vi.useFakeTimers();
        pendingAnimations.length = 0;
        controller = new GameController();
        controller.initGame([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], {
            seed: 1,
            kingdom: ['cellar', 'moat', 'chapel', 'village', 'merchant', 'smithy', 'festival', 'laboratory', 'market', 'witch']
        });
        // 人の番になるまでCPUを進める
        for (let step = 0; step < 100 && !controller.getView().isMyTurn; step++) controller.runCpuStep();
        handler = createHandler(controller);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('「購入へ」で財宝を場へ出している間にターン終了を押しても、購入フェーズに入らないままターンを終えない', () => {
        const view = controller.getView();
        expect(view.isMyTurn).toBe(true);
        expect(view.phase).toBe('action');
        expect(view.me.hand.some(card => card.isType(CARD_TYPES.TREASURE))).toBe(true);

        handler.handleEnterBuyPhase();
        // 財宝が場に着く前に、ターン終了を押す
        handler.handleEndTurn();
        finishAnimations();

        const after = controller.getView();
        expect(after.isMyTurn).toBe(true);
        expect(after.phase).toBe('buy');
        expect(after.me.coins).toBeGreaterThan(0);
        expect(controller.game.commands.map(command => command.type)).not.toContain('endTurn');
    });

    it('返事待ちの操作がなければ、ターン終了を押すとターンを終える', () => {
        handler.handleEnterBuyPhase();
        finishAnimations();
        expect(controller.getView().phase).toBe('buy');

        handler.handleEndTurn();
        finishAnimations();
        expect(controller.game.commands.at(-1).type).toBe('endTurn');
        expect(controller.getView().isMyTurn).toBe(false);
    });
});

describe('フェーズの流れの知らせ（#11）', () => {
    let controller;
    let handler;

    beforeEach(() => {
        vi.useFakeTimers();
        pendingAnimations.length = 0;
        controller = new GameController();
        controller.initGame([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed: 1 });
        for (let step = 0; step < 100 && !controller.getView().isMyTurn; step++) controller.runCpuStep();
        handler = createHandler(controller);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('アクションフェーズに財宝をタップすると、購入へ進めば自動で出ることを知らせる', () => {
        const hand = controller.getView().me.hand;
        const index = hand.findIndex(card => card.isType(CARD_TYPES.TREASURE));
        handler.handleCardPlay(index);
        expect(handler.uiController.showToast).toHaveBeenCalledWith(expect.stringContaining('「購入へ」'));
        expect(controller.getView().phase).toBe('action');
    });

    it('購入へ進むと、自動で出した財宝の枚数を知らせる', () => {
        const treasures = controller.getView().me.hand.filter(card => card.isType(CARD_TYPES.TREASURE)).length;
        handler.handleEnterBuyPhase();
        finishAnimations();
        expect(handler.uiController.showToast).toHaveBeenCalledWith(`手札の財宝${treasures}枚を自動で出しました`);
    });

    it('プレイできない理由を、フェーズとカードの種類に合わせて返す', () => {
        const view = controller.getView();
        const of = (type) => ({ isType: (t) => t === type });
        expect(unplayableReason({ ...view, isMyTurn: false }, of(CARD_TYPES.ACTION))).toContain('自分の番');
        expect(unplayableReason({ ...view, phase: 'action' }, of(CARD_TYPES.ACTION))).toContain('アクションが残っていません');
        expect(unplayableReason({ ...view, phase: 'action' }, of(CARD_TYPES.VICTORY))).toContain('長押し');
        expect(unplayableReason({ ...view, phase: 'buy' }, of(CARD_TYPES.TREASURE))).toContain('サプライ');
    });
});
