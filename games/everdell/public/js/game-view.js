/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手札は本人だけ（ほかの人は枚数だけ）。山札の並びは見せない（枚数だけ）
 * - 選択待ちの中身（めくったカードなど）は、選ぶ本人だけに見せる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { BASIC_LOCATIONS, BASIC_EVENTS, JOURNEY_SPOTS } from './cards.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const over = game.isOver();
    const me = seat === null || seat === undefined ? null : game.players[seat];
    const myTurn = !!me && game.phase === 'play' && !game.prompt && game.turn === seat;
    const locs = [
        ...BASIC_LOCATIONS.map(l => l.id), ...game.forest, 'haven', ...JOURNEY_SPOTS.map(n => `journey-${n}`),
        ...BASIC_EVENTS.map(e => e.id), ...game.specials
    ];
    const cardSpots = game.players.flatMap(o => o.city.map(c => `card-${c.uid}`));
    const reasons = {};
    if (me) {
        [...locs, ...cardSpots].forEach(loc => {
            reasons[loc] = myTurn ? game.checkPlace(me, loc) : 'あなたの番ではありません';
        });
    }
    const prompt = game.prompt
        ? (game.prompt.player === seat ? structuredClone(game.prompt) : { player: game.prompt.player, waiting: true })
        : null;
    return {
        you: seat ?? null,
        turn: game.phase === 'play' ? game.turn : null,
        actor: game.actors()[0] ?? null,
        phase: game.phase,
        first: game.first,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            season: p.season,
            workers: p.workers,
            available: game.available(p),
            placed: [...p.placed],
            res: { ...p.res },
            points: p.points,
            journey: p.journey,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            city: structuredClone(p.city),
            slots: game.slotsUsed(p),
            passed: p.passed,
            events: structuredClone(p.events),
            score: game.scoreOf(p.id)
        })),
        meadow: [...game.meadow],
        deckCount: game.deck.length,
        discardCount: game.discard.length,
        forest: [...game.forest],
        specials: [...game.specials],
        claimed: { ...game.claimed },
        occupancy: Object.fromEntries([...locs, ...cardSpots].map(loc => [loc, game.workersAt(loc)])),
        reasons,
        plays: myTurn ? game.playOptions(seat) : [],
        canPrepare: myTurn && game.canPrepare(me),
        canPass: myTurn && me.season === 3,
        prompt,
        winners: [...game.winners],
        results: over ? game.results() : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
