/**
 * 見る人ごとの見え方（秘密の情報を隠したもの）
 * - ほかの人の山は、伏せた枚数と、めくられた札だけ。持っている札は枚数だけ
 * - 自分の山の中身と手札は見える
 * - 取り除かれた札の種類は、取り除かれた本人にだけ見える
 * seat が null なら観戦者
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const me = seat !== null && game.players[seat] ? seat : null;
    return {
        seat: me,
        phase: game.phase,
        round: game.round,
        current: game.current,
        start: game.start,
        bid: game.bid,
        bidder: game.bidder,
        passed: [...game.passed],
        challenger: game.challenger,
        flipped: game.flipped,
        total: game.totalOnMats(),
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            discCount: p.discs.F + p.discs.S,
            handCount: game.handCount(p.id),
            stackCount: p.stack.length,
            // めくられた札（上から順）
            revealed: p.stack.slice(p.stack.length - p.revealed).reverse(),
            wins: p.wins,
            out: p.out,
            lost: p.lost,
            placed: p.stack.length > 0
        })),
        hand: me !== null ? game.hand(me) : null,
        myStack: me !== null ? [...game.players[me].stack] : null,
        myDiscs: me !== null ? { ...game.players[me].discs } : null,
        winner: game.winner,
        logs: [...game.logs],
        events: game.events.filter(e => e.seq > since).map(e => (e.type === 'lost' && e.seat !== me ? { ...e, disc: null } : { ...e })),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}
