/**
 * ビュー：あるプレイヤーから見てよい情報だけを JSON にしたもの
 * 自分の手札は中身を入れず、ヒントで分かっていること（色・数字の候補）だけを入れる。
 * 相手の手札は中身と、その人が分かっていることの両方を入れる。山札は枚数だけ
 */

export function createGameView(game, viewer = null) {
    const cardView = (order, hidden) => {
        const card = game.cards[order];
        const k = game.knowledge[order];
        return {
            order,
            color: hidden ? null : card.color,
            rank: hidden ? null : card.rank,
            colors: k.colors,
            ranks: k.ranks,
            clued: k.clued
        };
    };
    return {
        viewer,
        phase: game.phase,
        endReason: game.endReason,
        current: game.current,
        turn: game.turn,
        turnsLeft: game.turnsLeft,
        clues: game.clues,
        mistakes: game.mistakes,
        score: game.score,
        fireworks: [...game.fireworks],
        deckCount: game.deck.length,
        handSize: game.handSize,
        discards: game.discards.map(order => ({ order, color: game.cards[order].color, rank: game.cards[order].rank })),
        players: game.players.map(player => ({
            seat: player.seat,
            name: player.name,
            isCPU: player.isCPU,
            hand: game.hands[player.seat].map(order => cardView(order, player.seat === viewer))
        })),
        clueLog: game.clueLog.map(entry => ({ ...entry, touched: [...entry.touched], newly: [...entry.newly], fireworks: [...entry.fireworks] })),
        commandCount: game.commands.length,
        lastMove: game.lastMove ? { ...game.lastMove } : null,
        logs: game.logs.slice(-40)
    };
}
