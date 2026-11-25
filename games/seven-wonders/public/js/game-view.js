/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * 自分の手札と、自分が選んだ中身だけを入れる。ほかの人の手札・選んだ中身・捨て札の中身は入れない（枚数だけ）
 * ハリカルナッソスで捨て札から選ぶ人にだけ、捨て札の中身を入れる。CPU もこのビューだけを見て判断する
 */

import { cardOf } from './cards.js';
import { leftOf, rightOf, shieldsOf, hasSameName, stagesOf, scoreOf } from './city.js';

export function createGameView(game, seat, { since = null } = {}) {
    const n = game.n;
    const choosing = game.phase === 'choose' && seat !== null && game.waiting.includes(seat) && !game.pending[seat];
    const discardChooser = game.phase === 'discardBuild' && seat === game.special;
    return {
        seat,
        phase: game.phase,
        age: game.age,
        turn: game.turn,
        direction: game.age === 2 ? 'right' : 'left',
        players: game.players.map(p => {
            const city = game.cities[p.id];
            return {
                id: p.id, name: p.name, isCPU: p.isCPU,
                left: leftOf(p.id, n), right: rightOf(p.id, n),
                city: { ...city, built: [...city.built], tokens: [...city.tokens] },
                shields: shieldsOf(city),
                stagesTotal: stagesOf(city).length,
                handCount: game.hands[p.id]?.length ?? 0,
                waiting: game.waiting.includes(p.id),
                ready: game.phase === 'choose' && game.waiting.includes(p.id) && !!game.pending[p.id],
                // 今の時点で終わったときの点（途中の目安。誰でも計算できる公開の情報）
                score: scoreOf(game.cities, p.id)
            };
        }),
        hand: seat !== null ? [...game.hands[seat]] : null,
        myChoice: seat !== null && game.pending[seat] ? { ...game.pending[seat] } : null,
        // 手札ごとの、建てる方法と不思議の段階の払い方（自分が選ぶ番のときだけ）
        handOptions: choosing ? game.hands[seat].map(card => ({
            card,
            build: game.buildOptions(seat, card),
            wonder: game.wonderOptions(seat)
        })) : null,
        discardCount: game.discardPile.length,
        discardPile: discardChooser ? [...game.discardPile] : null,
        discardBuildable: discardChooser ? game.discardPile.filter(id => !hasSameName(game.cities[seat], id)) : null,
        scores: game.scores ? game.scores.map(s => ({ ...s })) : null,
        ranking: game.isOver() ? game.ranking() : null,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => redact(e, seat))
    };
}

// 公開の前の「選んだ」イベントには中身がない。公開のイベントは全員に見せる
function redact(event) {
    return structuredClone(event);
}

export const cardName = id => cardOf(id).name;
