/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 役割は、自分・保安官・脱落した人の分だけ（3人の対戦と、ゲームの終わりは全員の分）
 * - ダイス・体力・矢・キャラクター・公開された行動（acts）は全員に見える
 * 画面と CPU はビューだけを見て判断する。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { DICE_COUNT } from './characters.js';

export function isRoleVisible(game, seat, target) {
    const p = game.players[target];
    return target === seat || p.role === 'sheriff' || !p.alive || game.threePlayer || game.phase === 'end';
}

// seat：見る人の席（null なら観戦者）。since：このログの番号より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const t = game.turn;
    return {
        you: seat,
        threePlayer: game.threePlayer,
        level: game.options.level,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            character: p.character,
            life: p.life,
            maxLife: p.maxLife,
            arrows: p.arrows,
            alive: p.alive,
            role: isRoleVisible(game, seat, p.id) ? p.role : null
        })),
        arrowPile: game.arrowPile,
        turn: t ? {
            seat: t.seat, stage: t.stage, dice: [...t.dice], rolls: t.rolls, maxRolls: t.maxRolls,
            used: [...t.used], kitDone: [...t.kitDone], slabUsed: t.slabUsed, dynamiteHit: t.dynamiteHit, number: t.number,
            seated: [...t.seated], shots: t.shots.map(s => ({ ...s }))
        } : null,
        pending: game.pending ? { ...game.pending } : null,
        actors: game.actors(),
        // 操作する人が選べるもの（画面と CPU が使う）
        options: optionsFor(game),
        phase: game.phase,
        winners: [...game.winners],
        winnerSide: game.winnerSide,
        acts: game.acts.map(a => ({ ...a })),
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(event => hideEvent(game, event, seat)) : []
    };
}

// 手番の人が今できること：撃てる相手（ダイスごと）、残っているダイス
function optionsFor(game) {
    const t = game.turn;
    if (!t || game.phase === 'end' || game.pending || t.stage !== 'resolve') return null;
    const targets = {};
    for (let i = 0; i < DICE_COUNT; i++) {
        const f = t.dice[i];
        if (!t.used[i] && (f === '1' || f === '2')) targets[i] = game.shotTargets(t.seat, f);
    }
    return {
        shots: game.remaining('shot'),   // まだ相手を決めていない1・2（決め終えたら、同時に撃つ）
        beers: game.remaining('beer'),
        kits: game.remaining('kit'),
        targets
    };
}

// 配った役割は、見てよい分だけ
function hideEvent(game, event, seat) {
    if (event.type === 'deal') {
        return { ...structuredClone(event), roles: event.roles.map((r, i) => (i === seat || r === 'sheriff' || game.threePlayer ? r : null)) };
    }
    return structuredClone(event);
}
