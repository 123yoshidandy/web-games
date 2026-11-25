/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - タイルの山（袋）は枚数だけ。並びは入れない
 * - 先のフェーズの商品の山（伏せてある）は入れない。今のフェーズのラウンドの商品（表）は見せる
 * - 公国・保管場所・商品・銀貨・労働者・ダイスは、ルールブックでも公開なので全員に見せる
 * - CPU の迷いに使う値（cpuSalt）とシードは入れない
 */

import { TILES } from './data.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const order = game.turnOrder();
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, vp: p.vp, silver: p.silver, workers: p.workers,
            storage: [...p.storage], goods: { ...p.goods }, sold: { ...p.sold }, bonuses: [...p.bonuses],
            estate: [...p.estate], dice: [...p.dice], used: [...p.used], track: p.track, stamp: p.stamp
        })),
        phase: game.phase,
        round: game.round,
        white: game.white,
        roundGoods: [...game.roundGoods],
        depots: game.depots.map(d => d.map(s => ({ ...s }))),
        depotGoods: game.depotGoods.map(g => [...g]),
        black: [...game.black],
        bonusClaims: structuredClone(game.bonusClaims),
        supplyCounts: Object.fromEntries(Object.entries(game.supply).map(([k, v]) => [k, v.length])),
        order: [...game.order],
        nextOrder: order,
        turn: game.turn ? { ...game.turn } : null,
        pending: game.pending.map(p => structuredClone(p)),
        answering: game.actors(),
        finalScores: game.finalScores ? game.finalScores.map(s => ({ ...s })) : null,
        ranking: game.ranking ? [...game.ranking] : null,
        winner: game.winner,
        over: game.isOver(),
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}

export const tileOf = (id) => TILES[id];
