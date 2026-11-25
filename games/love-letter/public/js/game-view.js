/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * 自分の手札、自分が知っている相手の手札（道化で見た・騎士で比べた・将軍で渡した）、関係者だけのイベントの中身だけを入れる
 * 山札の並び・伏せて除外したカード・ほかの人の手札は入れない。CPU もこのビューだけを見て判断する
 */

import { TARGETS_OTHER, PRINCE, GUARD } from './cards.js';

export function createGameView(game, seat, { since = null } = {}) {
    const me = seat ?? -1;
    const playing = game.phase !== 'end';
    const myTurn = playing && seat === game.current;
    return {
        seat,
        phase: game.phase,
        round: game.round,
        current: playing ? game.current : null,
        tokensToWin: game.tokensToWin,
        deckCount: game.deck.length,
        faceUp: [...game.faceUp],
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, tokens: p.tokens,
            out: game.out[p.id], protected: game.protected[p.id],
            discards: [...game.discards[p.id]],
            handCount: game.hands[p.id].length,
            // 自分が知っている、その人の手札（知らなければ null）
            known: seat !== null && p.id !== seat ? game.knowledge[seat][p.id] : null
        })),
        hand: seat !== null ? [...game.hands[seat]] : null,
        // 自分の手札を知っている人（道化で見られた、など。誰が見たかは全員に分かる）
        exposedTo: seat !== null ? game.players.filter(p => p.id !== seat && !game.out[p.id] && game.knowledge[p.id][seat] !== null).map(p => p.id) : [],
        // 手番の人にだけ、出せるカードと選べる人
        legal: myTurn && game.phase === 'play' ? legalPlays(game, seat) : null,
        winner: game.winner,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => redact(e, me))
    };
}

// 出せるカードごとに、選べる人（大臣を出さなければならないときは大臣だけ）
export function legalPlays(game, seat) {
    const hand = game.hands[seat];
    const cards = [...new Set(hand)].filter(card => !game.mustPlayCountess(seat) || card === 8);
    return cards.map(card => ({
        card,
        targets: game.targetsFor(seat, card),
        needsTarget: TARGETS_OTHER.includes(card) || card === PRINCE,
        needsGuess: card === GUARD
    }));
}

function redact(event, seat) {
    const { secret, ...rest } = event;
    const copy = structuredClone(rest);
    if (secret && secret.to.includes(seat)) {
        const { to, ...data } = secret;
        copy.secret = structuredClone(data);
    }
    return copy;
}
