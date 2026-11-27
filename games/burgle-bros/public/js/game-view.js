/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、泥棒の道具やお宝は全員に見せる。隠すのは、めくっていない部屋の種類と数字、
 * 巡回の山の並び（枚数と、今の行き先だけ見せる）、道具とお宝の山、シードと乱数
 * ビューは rules.js の判定にそのまま渡せる形にする（画面のヒントや光る場所に使う）
 */

import { FLOOR_LEVELS } from './data.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        floorCount: game.floors.length,
        levelName: FLOOR_LEVELS[game.floors.length].name,
        turnNo: game.turnNo,
        current: game.current,
        phase: game.phase,
        actors: game.actors(),
        actionsLeft: game.actionsLeft,
        turn: { hawkFree: game.turn.hawkFree, motion: [...game.turn.motion] },
        hacks: { ...game.hacks },
        invisible: [...game.invisible],
        spotted: game.spotted ? { ...game.spotted } : null,
        lastRoll: game.lastRoll ? { ...game.lastRoll, values: [...game.lastRoll.values], ...(game.lastRoll.hits ? { hits: [...game.lastRoll.hits] } : {}) } : null,
        toolDeckCount: game.toolDeck.length,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            char: p.char,
            floor: p.floor,
            cell: p.cell,
            stealth: p.stealth,
            tools: [...p.tools],
            loot: [...p.loot],
            escaped: p.escaped
        })),
        floors: game.floors.map(fl => ({
            walls: [...fl.walls],
            safe: { ...fl.safe },
            guard: {
                active: fl.guard.active,
                cell: fl.guard.active ? fl.guard.cell : null,
                dest: fl.guard.active ? fl.guard.dest : null,
                speed: fl.guard.speed,
                deckCount: fl.guard.deck.length,
                discard: fl.guard.active ? [...fl.guard.discard] : []
            },
            tiles: fl.tiles.map(t => (t.revealed
                ? { revealed: true, type: t.type, num: t.num, cracked: t.cracked, alarm: t.alarm, open: t.open, lav: t.lav, used: t.used }
                : { revealed: false, type: null, num: null, cracked: false, alarm: t.alarm, open: false, lav: 0, used: false }))
        })),
        result: game.result ? { ...game.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => ({ ...e, ...(e.values ? { values: [...e.values] } : {}), ...(e.path ? { path: [...e.path] } : {}) })) : []
    };
}
