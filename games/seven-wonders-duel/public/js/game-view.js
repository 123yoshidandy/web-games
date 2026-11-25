/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - 並びの裏のカードは、何のカードかを入れない（時代IIIの裏は、ギルドかどうかだけ。カードの裏の色で分かるため）
 * - 見ずに抜いたカード、これからの時代の山の並び、使わない七不思議と進歩トークンは入れない（枚数だけ）
 * - ドラフトの2回目の4枚は、1回目が終わるまで入れない
 * - 大図書館で引いた3枚は、引いた人にだけ見せる
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない（シードから並びが分かるため）
 * 都市（建てたカード・七不思議・コイン・進歩トークン）と捨て札、軍事の駒は全員に見える
 */

import { CARDS } from './cards.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const actors = game.actors();
    const mine = seat !== null && actors.includes(seat);
    const pending = game.pending[0] ?? null;
    return {
        you: seat,
        players: game.players.map((p, i) => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            coins: p.coins,
            cards: [...p.cards],
            wonders: p.wonders.map(w => ({ key: w.key, built: w.built, age: w.age ?? null })),
            tokens: [...p.tokens],
            score: game.score(i)
        })),
        age: game.age,
        structure: game.structure.map((s, i) => ({
            row: s.row,
            x: s.x,
            taken: s.taken,
            faceUp: s.faceUp,
            key: s.faceUp && !s.taken ? s.key : null,
            back: !s.faceUp && CARDS[s.key].color === 'purple' ? 'guild' : 'age',
            accessible: game.isAccessible(i)
        })),
        discard: [...game.discardPile],
        tokensBoard: [...game.tokensBoard],
        tokensOutCount: game.tokensOut.length,
        military: game.military,
        militaryTokens: game.militaryTokens.map(t => ({ ...t })),
        phase: game.phase,
        current: game.current,
        first: game.first,
        turn: game.turn,
        actors,
        draft: game.phase === 'draft' ? {
            round: game.draft.round,
            offer: [...game.draft.offer],
            picker: game.draft.order[game.draft.step]
        } : null,
        pending: pending ? { type: pending.type, seat: pending.seat, color: pending.color ?? null } : null,
        libraryDraw: pending?.type === 'library' && pending.seat === seat ? [...game.libraryDraw] : null,
        chooser: game.chooser,
        wondersLeft: 7 - game.wondersBuiltTotal(),
        // 自分の番でできること（値段は相手の都市でも変わるので、ここで計算して渡す）
        options: mine && game.phase === 'play' ? playOptions(game, seat) : null,
        winner: game.winner,
        victory: game.victory,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        // 出来事には、取ったカード（表だったもの）と表になった番号しか入らない
        events: game.events.map(event => structuredClone(event))
    };
}

// 取れるカードごとの「建てる」「捨てる」の値と、七不思議ごとの値段
function playOptions(game, seat) {
    const player = game.players[seat];
    const cards = {};
    game.accessibleSlots().forEach(i => {
        const key = game.structure[i].key;
        const price = game.cardPrice(seat, key);
        cards[i] = { price: price.coins, chain: price.chain, canBuild: price.coins <= player.coins };
    });
    const wonders = {};
    player.wonders.filter(w => !w.built).forEach(w => {
        const price = game.wonderPrice(seat, w.key);
        wonders[w.key] = { price: price.coins, canBuild: game.canBuildWonder(seat, w.key) };
    });
    return { cards, wonders, discard: game.discardValue(seat) };
}

