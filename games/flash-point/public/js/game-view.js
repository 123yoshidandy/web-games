/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、盤面は全員に同じものを見せる。隠すのは、正体の分からない要救助者の印の中身と、残りの印の並びだけ
 * シードや乱数の状態は入れない（入れると、これから出るダイスの目を計算し直せてしまう）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    return {
        you: seat,
        mode: game.options.mode,
        level: game.options.level,
        turnNo: game.turnNo,
        current: game.current,
        phase: game.phase,
        actors: game.actors(),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            role: p.role,
            cell: p.cell,
            ap: p.ap,
            ext: p.ext,
            mv: p.mv,
            cp: p.cp,
            carry: p.carry
        })),
        fire: [...game.fire],
        edges: structuredClone(game.edges),
        damage: game.damage,
        rescued: game.rescued,
        lost: game.lost,
        pois: game.pois.map(x => ({
            id: x.id,
            cell: x.cell,
            revealed: x.revealed,
            victim: x.revealed ? x.victim : null,
            treated: x.treated
        })),
        poiLeft: game.poiPool.length,
        hazmats: game.hazmats.map(h => ({ ...h })),
        hotspots: [...game.hotspots],
        vehicles: game.vehicles ? { ...game.vehicles } : null,
        lastRoll: game.lastRoll ? { ...game.lastRoll } : null,
        unusedRoles: game.unusedRoles(),
        result: game.result ? { ...game.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: game.events.map(e => ({ ...e }))
    };
}
