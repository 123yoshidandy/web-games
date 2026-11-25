/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON（キャント・ストップは隠す情報がないので、ほぼ全部）
 * 乱数の状態は入れない。画面はビューだけを見て描く。オンライン対戦でも同じ形のものを送る
 */

import { COLUMNS, bustChance, pairSums } from './game.js';

export function createGameView(game, seat, { since = null } = {}) {
    const playing = game.phase !== 'end';
    const mine = playing && seat === game.current;
    return {
        seat,
        phase: game.phase,
        current: playing ? game.current : null,
        turn: game.turn,
        dice: game.dice ? [...game.dice] : null,
        sums: game.dice ? pairSums(game.dice) : null,
        runners: { ...game.runners },
        claimed: { ...game.claimed },
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, progress: { ...p.progress },
            claimedCount: COLUMNS.filter(c => game.claimed[c] === p.id).length
        })),
        // 進める・止めるの判断の材料：次に振ってバーストする確率（手番の人のランナーで計算。誰が見ても同じ）
        bustChance: playing && game.phase === 'decide' ? bustChance(game.ruleState()) : null,
        options: mine && game.phase === 'choose' ? game.legalMoves() : null,
        winner: game.winner,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => structuredClone(e))
    };
}
