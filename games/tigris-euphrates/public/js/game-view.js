/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。袋は枚数だけ（並びは入れない）
 * - 点と取った宝物は、原作では衝立の裏に伏せるので、本人にだけ入れる（終わったら全員に見せる）
 * - 盤・指導者・記念碑・残りの大災害・争いの強さと出した枚数は全員に見せる
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const c = game.conflict;
    return {
        you: seat,
        board: game.board.map(x => (x ? { ...x } : null)),
        treasures: [...game.treasures],
        monuments: game.monuments.map(m => ({ colors: [...m.colors], cell: m.cell })),
        players: game.players.map(p => {
            const open = over || p.id === seat;
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                handCount: p.hand.length,
                hand: p.id === seat ? [...p.hand] : null,
                leaders: { ...p.leaders },
                catastrophes: p.catastrophes,
                scores: open ? { ...p.scores } : null,
                treasures: open ? p.treasures : null
            };
        }),
        bagCount: game.bag.length,
        current: game.current,
        actionsLeft: game.actionsLeft,
        turnNumber: game.turnNumber,
        phase: game.phase,
        answering: game.actors(),
        conflict: c ? {
            kind: c.kind, color: c.color, leaderColor: c.leaderColor,
            attacker: { ...c.attacker }, defender: { ...c.defender }
        } : null,
        war: game.war ? { cell: game.war.cell, color: game.war.color, seat: game.war.seat, pending: game.war.pending.map(f => ({ color: f.color, cells: [...f.cells] })) } : null,
        monumentChoice: game.monumentChoice ? { color: game.monumentChoice.color, squares: [...game.monumentChoice.squares] } : null,
        winners: [...game.winners],
        endReason: game.endReason,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
