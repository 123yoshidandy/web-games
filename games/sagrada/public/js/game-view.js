/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（伏せた情報を隠す役目もここで持つ）
 * - 袋の中は、色ごとの数だけ（場に出たダイスから数えられる）。次に引く色と目は、シードから決まるので入れない
 * - 個人の目標は本人にだけ。ゲームが終わったら全員に見せる
 * - 配られた窓枠は本人にだけ。選んだ窓は、全員が選び終えるまで本人にだけ見せる
 * - 窓のダイス・プール・ラウンドトラック・道具・公共の目標・好意トークンは全員に見せる
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.phase === 'end';
    const revealed = game.phase !== 'choose';
    const pending = game.pending;
    return {
        you: seat,
        solo: game.solo,
        phase: game.phase,
        round: game.round,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            pattern: revealed || p.id === seat ? p.pattern : null,
            chosen: p.pattern !== null,
            offers: p.id === seat ? [...p.offers] : null,
            privates: over || p.id === seat ? [...p.privates] : null,
            window: p.window.map(d => (d ? { ...d } : null)),
            tokens: p.tokens,
            result: p.result ? structuredClone(p.result) : null
        })),
        pool: game.pool.map(d => ({ ...d })),
        roundTrack: game.roundTrack.map(list => list.map(d => ({ ...d }))),
        bag: { ...game.bag },
        tools: game.tools.map(t => ({ ...t, cost: game.solo ? null : game.toolCost(t) })),
        objectives: [...game.objectives],
        turn: game.turn ? { ...game.turn } : null,
        order: [...game.order],
        turnIndex: game.turnIndex,
        skip: [...game.skip],
        actors: game.actors(),
        pending: pending ? { ...pending } : null,
        target: game.target,
        ranking: game.ranking ? [...game.ranking] : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
