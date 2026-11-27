/**
 * ビュー：その席から見てよい情報だけの JSON
 * 自分のダイスの目は入れるが、相手のまだ置いていないダイスは数だけ（置いたダイスは盤の上で全員に見える）
 * シードや乱数の状態は入れない（入れると、端末でこれから振る目を計算できてしまう）
 * CPU もこのビューだけを見て判断する
 */

import {
    blueOf, orangeOf, brakeValueOf, altitudeOf, trackEnd, gearCount, planesLeft, isFinalRound, ROLE_NAMES, AIRPORTS
} from './rules.js';

export function createGameView(game, seat, { since = null } = {}) {
    const b = game.board;
    const mine = seat === 0 || seat === 1;
    return {
        seat: mine ? seat : null,
        phase: game.phase,
        turn: game.turn,
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU, role: ROLE_NAMES[p.id], diceLeft: game.diceLeft(p.id) })),
        airport: { key: b.airport, name: AIRPORTS[b.airport].name, level: AIRPORTS[b.airport].level },
        board: {
            round: b.round,
            rounds: b.rounds,
            final: isFinalRound(b),
            altitude: altitudeOf(b),
            pos: b.pos,
            end: trackEnd(b),
            planes: [...b.planes],
            planesLeft: planesLeft(b),
            axis: b.axis,
            gear: [...b.gear],
            gearCount: gearCount(b),
            flaps: b.flaps,
            brakes: b.brakes,
            coffee: b.coffee,
            rerolls: b.rerolls,
            slots: structuredClone(b.slots),
            speed: b.speed,
            advance: b.advance,
            blue: blueOf(b),
            orange: orangeOf(b),
            brake: brakeValueOf(b)
        },
        // 自分のダイス（置いたものは used）。観戦者には null
        dice: mine ? game.dice[seat].map(d => ({ value: d.value, used: d.used })) : null,
        result: b.result ? { win: b.result.win, reasons: [...b.result.reasons] } : null,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => ({ ...e }))
    };
}
