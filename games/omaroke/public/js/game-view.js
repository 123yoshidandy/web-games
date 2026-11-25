/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 役割は、自分・ジムリーダー・退場した人の分だけ（ゲームの終わりは全員の分）
 * - 手札は自分の分だけ（ほかの人は枚数だけ）。選ぶ前に配られたポケモンも自分の分だけ
 * - 「よけて！」・救助・フリーザーの守りの答え待ちは、聞かれていること自体が手札を明かすので、ほかの人には誰に聞いているかを伏せる
 * 画面と CPU はビューだけを見て判断する。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { CARDS, rolesFor, MODES } from './data.js';

const SECRET_PROMPTS = ['dodge', 'discardAttack', 'shield', 'rescue'];

export function isRoleVisible(game, seat, target) {
    const p = game.players[target];
    return target === seat || p.role === 'leader' || !p.alive || game.phase === 'end';
}

// seat：見る人の席（null なら観戦者）。since：このログの番号より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const me = seat !== null ? game.players[seat] : null;
    const actors = game.actors();
    const pr = game.prompt;
    const promptMine = !!pr && pr.seat === seat;
    return {
        you: seat,
        mode: game.mode,
        phase: game.phase,
        leader: game.leader,
        roleList: rolesFor(game.n),
        turn: game.turn ? { ...game.turn } : null,
        deckCount: game.deck.length,
        discardCount: game.discard.length,
        lastWeather: game.lastWeather ? { ...game.lastWeather } : null,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            alive: p.alive,
            role: isRoleVisible(game, seat, p.id) ? p.role : null,
            handCount: p.hand.length,
            ready: game.phase === 'choose' ? !!p.picked : null,
            battle: p.battle,
            pokemon: p.pokemon.map(m => ({
                id: m.id, hp: m.hp, maxHp: m.maxHp, status: m.status, fainted: m.fainted,
                item: m.item !== null ? game.cards[m.item].key : null
            }))
        })),
        hand: me ? me.hand.map(id => ({ ...game.cards[id] })) : null,
        offers: me && game.phase === 'choose' && !me.picked ? [...me.offers] : null,
        pick: MODES[game.mode].pick,
        // 今、自分が操作する番か
        myAction: seat !== null && actors.includes(seat),
        // 誰を待っているか（伏せる答え待ちは null）
        waitingOn: game.phase === 'play' ? (pr && SECRET_PROMPTS.includes(pr.kind) && !promptMine ? null : actors[0] ?? null) : null,
        prompt: pr ? (promptMine ? structuredClone(pr) : { kind: SECRET_PROMPTS.includes(pr.kind) ? 'secret' : pr.kind, seat: SECRET_PROMPTS.includes(pr.kind) ? null : pr.seat, cards: pr.cards ? [...pr.cards] : undefined }) : null,
        // 自分の番にできること（画面と CPU が使う）
        options: seat !== null && game.phase === 'play' && !pr && game.turn?.seat === seat ? optionsFor(game, seat) : null,
        acts: game.acts.map(a => ({ ...a })),
        winners: [...game.winners],
        winnerSide: game.winnerSide,
        logs: game.logs.filter(l => l.n > since).map(l => ({
            n: l.n, kind: l.kind,
            text: l.seats === null || l.seats.includes(seat) ? l.text : l.others
        })),
        logTotal: game.logTotal,
        cardRefs: game.phase === 'play' && pr?.kind === 'pick' ? pr.cards.map(id => ({ ...game.cards[id] })) : null
    };
}

// 手札のカードごとに、使える相手（または使えるか）。ほかに、交代・ちからのハチマキ・進化
function optionsFor(game, seat) {
    const p = game.players[seat];
    const alive = game.alivePlayers();
    const ok = command => game.validate(seat, command) === null;
    const cards = {};
    p.hand.forEach(id => {
        const key = game.cards[id].key;
        const def = CARDS[key];
        if (def.target === 'other' || def.target === 'any') {
            cards[id] = { targets: alive.filter(t => ok({ type: 'play', card: id, target: t })) };
            if (game.mode === 'expert' && (key === 'potion' || key === 'revive')) {
                cards[id].slots = Object.fromEntries(alive.map(t => [t, [0, 1].filter(s => ok({ type: 'play', card: id, target: t, slot: s }))]));
            }
        } else if (def.target === 'two') {
            cards[id] = { targets: alive.filter(t => ok({ type: 'play', card: id, targets: [t] })), max: 2 };
        } else if (key === 'rareCandy' && game.mode === 'expert') {
            const slots = [0, 1].filter(s => ok({ type: 'play', card: id, slot: s }));
            cards[id] = { usable: slots.length > 0, slots };
        } else {
            cards[id] = { usable: ok({ type: 'play', card: id }) };
        }
    });
    const bandTargets = game.hasItem(seat, 'choiceBand') && p.hand.length >= 2 ? alive.filter(t => t !== seat && game.attackBlocked(seat) === null) : [];
    return {
        cards,
        attackBlocked: game.attackBlocked(seat),
        bandTargets,
        canSwitch: ok({ type: 'switch' }),
        evolveSlots: game.mode === 'expert' ? [0, 1].filter(s => ok({ type: 'end', evolve: s })) : [],
        handLimit: game.handLimit(seat)
    };
}
