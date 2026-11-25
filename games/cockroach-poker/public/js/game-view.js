/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（手札と伏せたカードを隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。前に置いたカード（表）は全員に見せる
 * - 渡している途中のカードの中身は、見た人（親と、見てから回した人）にだけ入れる。だれが見たかは全員に見せる
 * - 2人のときに除いた10枚は、だれにも見せない（枚数だけ）
 * - 終わった回（history）は表になったので、全員に見せる
 * - CPU の迷いに使う値（cpuSalt）とシードは入れない（シードから配り方が分かるため）
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const r = game.round;
    const sees = r && seat !== null && r.seen.includes(seat);
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            table: [...p.table]
        })),
        removedCount: game.removed.length,
        limit: game.limit,
        current: game.current,
        roundNumber: game.roundNumber,
        phase: game.phase,
        round: r ? {
            starter: r.starter, from: r.from, to: r.to, claim: r.claim,
            seen: [...r.seen], chain: r.chain.map(c => ({ ...c })),
            card: sees ? r.card : null
        } : null,
        passTargets: game.passTargets(), // 見ていない人（だれが見たかは公開なので、全員に見せてよい）
        answering: game.actors(),
        loser: game.loser,
        reason: game.reason,
        history: game.history.map(h => ({ ...h, chain: h.chain.map(c => ({ ...c })) })),
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => sanitizeEvent(event, seat))
    };
}

function sanitizeEvent(event, seat) {
    const { visibleTo, ...rest } = event;
    if (visibleTo && !visibleTo.includes(seat)) delete rest.card;
    return structuredClone(rest);
}
