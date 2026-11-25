/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * 自分の手と、自分が選んだ中身だけを入れる。ほかの人の手・選んだ中身・袋の中身は入れない（数だけ）
 * 公園は全員に公開されている。CPU もこのビューだけを見て判断する
 */

import { clonePark, scorePark, zoneScores, placementGain } from './park.js';
import { PER_SPECIES } from './dinos.js';
export function createGameView(game, seat, { since = null } = {}) {
    const myTurn = seat !== null && game.waiting.includes(seat) && !game.pending[seat];
    const choosing = game.phase === 'choose' && myTurn;
    const parks = game.parks;
    const hand = seat !== null ? [...game.hands[seat]] : null;
    return {
        seat,
        phase: game.phase,
        round: game.round,
        rounds: game.rules.rounds,
        turn: game.turn,
        turns: game.rules.turns,
        // 2 人のとき：置いたあと、もう 1 匹を箱に戻し、残りの手を交換する
        discardRule: game.rules.discard,
        direction: game.direction,
        die: game.die,
        roller: game.roller,
        exempt: seat !== null && seat === game.roller,
        bagCount: game.bag.length,
        // 袋に入れた、1 種類あたりの数（人数で変わる）
        perSpecies: PER_SPECIES - game.rules.boxed,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            park: clonePark(parks[p.id]),
            handCount: game.hands[p.id]?.length ?? 0,
            ready: (game.phase === 'choose' || game.phase === 'discard') && !!game.pending[p.id],
            // 今の時点で終わったときの点（途中の目安。誰でも計算できる公開の情報）
            score: scorePark(parks, p.id),
            zoneScores: zoneScores(parks, p.id)
        })),
        hand,
        myChoice: seat !== null && game.pending[seat] ? { ...game.pending[seat] } : null,
        // 手の種類ごとの、置ける場所と、置いたときに今の点が何点増えるか（自分が選ぶ番のときだけ）
        handOptions: choosing ? [...new Set(hand)].map(dino => ({
            dino,
            zones: game.zonesFor(seat, dino).map(zone => ({ zone, gain: placementGain(parks, seat, dino, zone) }))
        })) : null,
        // 箱に戻す恐竜を選ぶ番か（2 人のとき）
        discarding: game.phase === 'discard' && myTurn,
        scores: game.scores ? game.scores.map(s => ({ ...s })) : null,
        ranking: game.isOver() ? game.ranking() : null,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => structuredClone(e))
    };
}
