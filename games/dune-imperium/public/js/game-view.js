/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る
 * - 山札は枚数だけ。シードと乱数の状態は入れない
 * - 手札と陰謀カードは本人にだけ見せる（ほかの人には枚数だけ。終わったら陰謀カードは全員に見せる）
 * - 自分の山札は、並びを隠して名前の順に並べたものだけ（ポール・アトレイデスは一番上も見える）
 * - 出したカード・公開したカード・捨て札は、表向きなので全員に見せる
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const actors = game.actors();
    const over = game.isOver();
    const me = seat === null ? null : game.players[seat];
    const myTurn = me && game.phase === 'turns' && !game.pending && game.current === seat;
    return {
        you: seat,
        round: game.round,
        phase: game.phase,
        stage: game.stage,
        current: game.current,
        firstPlayer: game.firstPlayer,
        actors,
        conflict: game.conflict,
        conflictLeft: game.conflictDeck.length,
        players: game.players.map(p => {
            const mine = p.id === seat;
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                leader: p.leader,
                solari: p.solari,
                spice: p.spice,
                water: p.water,
                vp: p.vp,
                garrison: p.garrison,
                troopsIn: p.troopsIn,
                strength: game.strength(p.id),
                agents: p.agents,
                agentsLeft: p.agentsLeft,
                mentat: p.mentat,
                council: p.council,
                swordmaster: p.swordmaster,
                influence: { ...p.influence },
                hand: mine ? [...p.hand] : [],
                handCount: p.hand.length,
                deckCount: p.deck.length,
                deckList: mine ? [...p.deck].sort() : [],
                deckTop: mine && p.leader === 'paul' ? (p.deck[0] ?? null) : null,
                discard: [...p.discard],
                played: [...p.played],
                revealed: [...p.revealed],
                trashedCount: p.trashed.length,
                intrigue: mine || over ? [...p.intrigue] : [],
                intrigueCount: p.intrigue.length,
                hasRevealed: p.hasRevealed,
                persuasion: p.persuasion,
                swords: p.swords
            };
        }),
        occupied: structuredClone(game.occupied),
        bonusSpice: { ...game.bonusSpice },
        control: { ...game.control },
        alliance: { ...game.alliance },
        mentatHolder: game.mentatHolder,
        row: [...game.row],
        reserve: { ...game.reserve },
        foldspaceLeft: game.foldspace,
        imperiumCount: game.imperiumDeck.length,
        intrigueDeckCount: game.intrigueDeck.length,
        // 決めることは、答える本人にだけ中身を見せる
        pending: game.pending ? (game.pending.seat === seat ? structuredClone(game.pending) : { kind: game.pending.kind, seat: game.pending.seat }) : null,
        legal: myTurn && game.stage === 'act' ? game.legalPlacements(seat) : [],
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length
    };
}
