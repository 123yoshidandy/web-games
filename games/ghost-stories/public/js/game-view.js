/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、僧の気と札は全員に見せる。隠すのは幽霊の山の並びだけ（枚数と、魔王の化身まで何枚かは見せる。原作でも数えられる）
 * シードと乱数の状態は入れない。画面はビューだけを見て描く
 */

import { LEVELS, ghostOf } from './data.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const incInDeck = game.deck.indexOf(game.incarnation);
    const pending = game.phase === 'place' ? game.queue[0] : null;
    return {
        you: seat,
        level: game.options.level,
        levelName: LEVELS[game.options.level].name,
        turnNo: game.turnNo,
        current: game.current,
        phase: game.phase,
        moved: game.moved,
        actors: game.actors(),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            qi: p.qi,
            tao: [...p.tao],
            tile: p.tile,
            alive: p.alive,
            buddhas: p.buddhas,
            power: game.powerActive(p.id)
        })),
        tiles: game.tiles.map(t => ({ ...t })),
        slots: game.slots.map((s, i) => (s ? { card: s.card, haunter: s.haunter, res: game.resistance(i) } : null)),
        buddhaAt: [...game.buddhaAt],
        temple: game.temple,
        prayer: game.prayer,
        mantraAt: game.mantraAt,
        deckCount: game.deck.length,
        // 魔王の化身が出るまでに引く枚数（山にいなければ null）
        untilIncarnation: incInDeck >= 0 ? game.deck.length - incInDeck : null,
        incarnation: game.incarnation,
        incarnationOut: incInDeck < 0,
        discardCount: game.discard.length,
        pending,
        placeOptions: pending !== null ? game.placeOptions(pending) : [],
        pendingCount: game.phase === 'place' ? game.queue.length : 0,
        dice: game.dice ? [...game.dice] : null,
        diceCount: game.diceCount(game.current),
        lastRoll: game.lastRoll ? { ...game.lastRoll, faces: [...game.lastRoll.faces] } : null,
        hauntedCount: game.hauntedCount(),
        result: game.result ? { ...game.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => ({ ...e })) : [],
        pendingGhost: pending !== null ? { ...ghostOf(pending) } : null
    };
}
