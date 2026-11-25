/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * 山札の並びは入れず、枚数だけ。伏せて予約したカードは、本人にだけ見せる（相手には段だけ）
 * 袋の中身は、盤と持ち物から数えられる公開の情報なので、色ごとの数を入れる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import {
    CARDS, LEVELS, TOKEN_LIMIT, pointsOf, crownsOf, bonusesOf, colorPointsOf, countTokens, canAfford
} from './game.js';

// seat：見る人の席（null なら観戦者。伏せたカードはだれのものも見えない）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const players = game.players.map(p => ({
        id: p.id,
        name: p.name,
        isCPU: p.isCPU,
        tokens: { ...p.tokens },
        cards: p.cards.map(owned => ({ ...owned })),
        reserved: p.reserved.map(r => (r.hidden && p.id !== seat
            ? { id: null, hidden: true, level: CARDS[r.id].level }
            : { id: r.id, hidden: r.hidden, level: CARDS[r.id].level })),
        royals: [...p.royals],
        privileges: p.privileges,
        points: pointsOf(p),
        crowns: crownsOf(p),
        bonuses: bonusesOf(p),
        colorPoints: colorPointsOf(p)
    }));
    const me = seat === null ? null : game.players[seat];
    const myTurn = seat !== null && seat === game.current && game.phase !== 'end';
    const pending = myTurn && game.phase === 'choose' ? game.pending[0] : null;
    return {
        you: seat,
        players,
        board: [...game.board],
        bag: { ...game.bag },
        pyramid: Object.fromEntries(LEVELS.map(level => [level, [...game.pyramid[level]]])),
        deckCounts: Object.fromEntries(LEVELS.map(level => [level, game.decks[level].length])),
        royals: [...game.royals],
        privileges: game.privileges,
        current: game.current,
        startPlayer: game.startPlayer,
        turn: game.turn,
        phase: game.phase,
        replenished: game.replenished,
        extraTurns: game.extraTurns,
        winners: [...game.winners],
        endReason: game.endReason,
        // 自分の番の選択：能力の選択（種類と選べるもの）、返すトークンの数
        choice: pending ? { type: pending.type, color: pending.color ?? null, card: pending.card ?? null, options: game.optionsFor(seat, pending) } : null,
        discardCount: myTurn && game.phase === 'discard' ? countTokens(me.tokens) - TOKEN_LIMIT : 0,
        // 自分の番の main で、できること（画面の案内用）
        canPass: myTurn && game.phase === 'main' && !game.hasMandatoryAction(seat) && !(countTokens(game.bag) > 0 && game.board.includes(null)),
        affordable: myTurn && game.phase === 'main'
            ? [...game.pyramidCards(), ...me.reserved.map(r => r.id)].filter(id => canAfford(me, CARDS[id]))
            : [],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => hideEvent(event, seat))
    };
}

// 伏せて予約したカードの中身は、本人以外には見せない
function hideEvent(event, seat) {
    if (event.type === 'reserve' && event.hidden && event.seat !== seat) return { ...event, card: null };
    return structuredClone(event);
}
