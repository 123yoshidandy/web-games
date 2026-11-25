/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - 袋は枚数だけ。並びは入れない
 * - ほかの人の裏向きの太陽駒は、枚数だけ（自分の分と、ゲームの終わりには全部見せる）
 * - 手元のタイル・表の太陽駒・中央の太陽駒・トラック・点は公開なので、全員に見せる
 * - CPU の迷いに使う値（cpuSalt）とシードは入れない
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const a = game.auction;
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, score: p.score, tiles: { ...p.tiles },
            suns: p.suns.filter(s => s.up).map(s => s.value).sort((x, y) => y - x),
            downSuns: p.id === seat || over ? p.suns.filter(s => !s.up).map(s => s.value).sort((x, y) => y - x) : null,
            downCount: p.suns.filter(s => !s.up).length
        })),
        bagCount: game.bag.length,
        center: game.center,
        epoch: game.epoch,
        raTrack: game.raTrack,
        raLimit: game.raLimit,
        auctionTrack: [...game.auctionTrack],
        current: game.current,
        phase: game.phase,
        auction: a ? { raPlayer: a.raPlayer, voluntary: a.voluntary, full: a.full, order: [...a.order], index: a.index, high: a.high ? { ...a.high } : null, bids: { ...a.bids } } : null,
        mustBid: a && game.phase === 'auction' ? game.mustBid(a.order[a.index]) : false,
        disaster: game.phase === 'disaster' ? { ...game.disasters[0], ...game.disasterChoices(game.disasters[0].seat, game.disasters[0].kind) } : null,
        answering: game.actors(),
        epochScores: structuredClone(game.epochScores),
        ranking: game.ranking ? [...game.ranking] : null,
        winner: game.winner,
        over,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
