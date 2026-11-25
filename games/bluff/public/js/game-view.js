/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（ほかの人のカップの中を隠す役目もここで持つ）
 * - 自分のダイスは全部見える。ほかの人は、見せたダイス（振り直しでカップの外に出したもの）と、カップの中の数だけ
 * - 疑ったあとの結果（reveal）では、そのラウンドの全員のダイスを見せる
 * - シードと CPU の値（cpuSalt）は入れない
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    return {
        you: seat,
        phase: game.phase,
        round: game.round,
        options: { reroll: game.options.reroll, lossOne: game.options.lossOne },
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            count: p.dice.length,
            hidden: p.dice.filter(d => !d.shown).length,
            shown: p.dice.filter(d => d.shown).map(d => d.value),
            dice: p.id === seat ? p.dice.map(d => ({ ...d })) : null
        })),
        turn: game.turn,
        starter: game.starter,
        actors: game.actors(),
        bid: game.bid ? { ...game.bid } : null,
        history: game.history.map(h => ({ ...h })),
        reveal: game.reveal ? structuredClone(game.reveal) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
