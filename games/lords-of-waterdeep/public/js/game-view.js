/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る
 * - 山札は枚数だけ。シードと乱数の状態は入れない
 * - 陰謀カードの手札とロードは本人にだけ見せる（終わったら全員に見せる）
 * - 達成したクエストは、プロット以外は本人にだけ見せる（ロードの見当がつくため）。ほかの人には枚数だけ
 * - 受けているクエストと資源・点・建物は全員に見せる
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const actors = game.actors();
    const over = game.isOver();
    const head = game.queue[0] ?? null;
    const mine = (p) => p.id === seat || over;
    const myTurn = seat !== null && actors.includes(seat);
    return {
        you: seat,
        round: game.round,
        phase: game.phase,
        current: game.current,
        firstPlayer: game.firstPlayer,
        actors,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            res: { ...p.res },
            vp: p.vp,
            agents: p.agents,
            agentsLeft: p.agentsLeft,
            quests: [...p.quests],
            completed: mine(p) ? [...p.completed] : [],
            completedCount: p.completed.length,
            plots: [...p.plots],
            intrigue: mine(p) ? [...p.intrigue] : [],
            intrigueCount: p.intrigue.length,
            lord: mine(p) ? p.lord : null,
            final: p.final ? { ...p.final } : null
        })),
        occupied: structuredClone(game.occupied),
        buildings: game.buildings.map(b => ({ ...b })),
        hall: game.hall.map(h => (h ? { ...h } : null)),
        inn: [...game.inn],
        questDeckCount: game.questDeck.length,
        intrigueDeckCount: game.intrigueDeck.length,
        buildingDeckCount: game.buildingDeck.length,
        ambassador: { ...game.ambassador },
        // 決めることは、答える本人にだけ中身を見せる
        pending: head ? (head.seat === seat ? { ...structuredClone(head), ...pendingExtra(game, head) } : { type: head.type, seat: head.seat }) : null,
        legal: myTurn && !head ? game.legalSpaces(seat) : [],
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length
    };
}

function pendingExtra(game, head) {
    if (head.type === 'complete') return { quests: game.completable(head.seat) };
    if (head.type === 'target') return { spaces: game.zoarTargets(head.seat) };
    if (head.type === 'opponent') return { seats: game.opponents(head.seat) };
    return {};
}
