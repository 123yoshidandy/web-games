/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（山の並びを隠す役目もここで持つ）
 * - 文明カードの山は枚数だけ。建物の山は、表の1枚と枚数だけ
 * - 追加のカード（山の上を伏せて取る）で取ったカードは、本人にだけ見せる。ほかの人には枚数だけ
 * - 置いた人・資源・食料・道具・得点・取った文明カード（伏せたもの以外）と建物は全員に見せる
 * - シードは入れない（サイコロの目が分かってしまう）
 * CPU もこのビューだけを見て決める（cpu-player.js）
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか（CPU には要らない）
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const actors = game.actors();
    const myTurn = seat !== null && actors.includes(seat);
    return {
        you: seat,
        round: game.round,
        phase: game.phase,
        startPlayer: game.startPlayer,
        current: game.current,
        actors,
        players: game.players.map(p => {
            const mine = p.id === seat || game.phase === 'end';
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                people: p.people,
                available: p.available,
                food: p.food,
                res: { ...p.res },
                agri: p.agri,
                tools: [...p.tools],
                toolsUsed: [...p.toolsUsed],
                score: p.score,
                cards: mine ? [...p.cards] : p.cards.filter(id => !p.hidden.includes(id)),
                hiddenCount: mine ? 0 : p.hidden.length,
                hidden: mine ? [...p.hidden] : [],
                oneUse: [...p.oneUse],
                choice2: [...p.choice2],
                buildings: [...p.buildings],
                starved: p.starved,
                final: p.final ? { ...p.final } : null
            };
        }),
        placed: game.placed.map(m => ({ ...m })),
        civSlots: [...game.civSlots],
        civDeckCount: game.civDeck.length,
        stacks: game.stacks.map(stack => ({ top: stack[0] ?? null, count: stack.length })),
        pending: game.pending ? structuredClone(game.pending) : null,
        // 自分が操作する番のときだけ、置ける場所と使える場所を入れる
        placements: myTurn && game.phase === 'place' && !game.pending ? game.legalPlacements(seat) : [],
        resolvable: myTurn && game.phase === 'action' && !game.pending ? Object.keys(game.placed[seat]) : [],
        winners: [...game.winners],
        endReason: game.endReason,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
