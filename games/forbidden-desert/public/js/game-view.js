/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、水・装備・部品は全員に見せる。隠すのは、まだ掘り出していないタイルの中身（地中鏡でのぞいたものは見せる）と、
 * 嵐のカード・装備のカードの山の並び（枚数だけ見せる）。シードや乱数の状態は入れない
 * タイルは、最初に置いたマス（home）で見分ける。タイルの番号は中身の種類と結びついているので、ビューには入れない
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { CELLS, SAND_TOTAL, ROLE_BY_KEY, GEAR_CARDS, STORM_CARDS, LEVELS } from './data.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const cells = [];
    for (let pos = 0; pos < CELLS; pos++) {
        const tile = game.tileAt(pos);
        if (!tile) {
            cells.push(null);
            continue;
        }
        const open = tile.revealed || game.peeked.includes(tile.id);
        cells.push({
            home: tile.home,
            sand: tile.sand,
            revealed: tile.revealed,
            peeked: !tile.revealed && open,
            back: tile.back,
            kind: open ? tile.kind : null,
            ...(open && tile.kind === 'clue' ? { part: tile.part, axis: tile.axis } : {})
        });
    }
    return {
        you: seat,
        level: game.options.level,
        levelName: LEVELS[game.options.level].name,
        turnNo: game.turnNo,
        current: game.current,
        phase: game.phase,
        actors: game.actors(),
        actionsLeft: game.actionsLeft,
        calmed: game.calmed,
        stormLeft: game.stormLeft,
        stormDraws: game.stormDraws(),
        meter: game.meter,
        ladder: [...game.ladder],
        sand: game.sandOnBoard(),
        sandTotal: SAND_TOTAL,
        storm: game.storm,
        cells,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            role: p.role,
            pos: game.posOf(p.tile),
            water: p.water,
            maxWater: ROLE_BY_KEY[p.role].water,
            gear: p.gear.map(card => ({ card, kind: GEAR_CARDS[card] }))
        })),
        parts: game.parts.map(p => ({
            key: p.key,
            state: p.state,
            pos: p.state === 'placed' ? (p.tile === null ? game.storm : game.posOf(p.tile)) : null
        })),
        shields: game.shields.map(s => ({ pos: game.posOf(s.tile), owner: s.owner })),
        stormDeckCount: game.stormDeck.length,
        stormDiscardCount: game.stormDiscard.length,
        gearDeckCount: game.gearDeck.length,
        lastStorm: game.lastStorm ? { ...STORM_CARDS[game.lastStorm.id], at: game.lastStorm.seq } : null,
        canUndo: game.canUndo(),
        launchReady: !game.isOver() && game.launchReady(),
        result: game.result ? { ...game.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => ({ ...e })) : []
    };
}
