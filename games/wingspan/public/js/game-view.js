/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手札・ボーナスカード・準備で配られたものは本人だけ。ほかの人は枚数だけ（ボーナスカードは終わったら見せる）
 * - 山札の並びは見せない（枚数だけ）
 * - 選択待ちは、本人の分だけ中身を入れる。ほかの人の分は、だれが何を選んでいるかだけ
 * 画面はビューだけを見て描く
 */

import { scoreOf } from './game.js';
import { bonusOf, bonusPoints, goalOf, FOODS } from './birds.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const over = game.isOver();
    const d = game.decision;
    return {
        you: seat,
        step: game.commands.length,
        phase: game.phase,
        round: game.round,
        turn: game.phase === 'play' ? game.turn : null,
        firstPlayer: game.firstPlayer,
        turnsThisRound: game.turnsThisRound(),
        feeder: [...game.feeder],
        tray: [...game.tray],
        deckCount: game.deck.length + game.discard.length,
        goals: game.goals.map(id => ({ id, name: goalOf(id).name, unit: goalOf(id).unit })),
        goalResults: structuredClone(game.goalResults),
        // 今のラウンドの目標の途中経過
        goalNow: game.phase === 'end' ? null : game.players.map(p => goalOf(game.goals[game.round - 1]).measure(p)),
        players: game.players.map(p => {
            const mine = p.id === seat;
            const score = scoreOf(p);
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                food: { ...p.food },
                foodTotal: FOODS.reduce((s, f) => s + p.food[f], 0),
                board: structuredClone(p.board),
                handCount: p.hand.length,
                hand: mine ? [...p.hand] : null,
                bonusCount: p.bonus.length,
                bonus: mine || over ? p.bonus.map(id => ({ id, points: bonusPoints(bonusOf(id), p) })) : null,
                offer: mine && p.offer ? structuredClone(p.offer) : null,
                setupDone: !p.offer,
                actions: p.actions,
                goalPoints: [...p.goalPoints],
                // ボーナスカードは伏せてあるので、ほかの人の点には入れない
                score: mine || over ? score.total : score.total - score.bonus,
                breakdown: over ? score : null
            };
        }),
        decision: d ? (d.seat === seat ? structuredClone(d) : { seat: d.seat, kind: d.kind, power: d.power ?? null, bird: d.bird ?? null }) : null,
        winners: [...game.winners],
        results: over ? game.results() : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
