/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、精霊の手札や存在は全員に見せる。隠すのは、山（侵略者・恐怖・力のカード）の並びと、得たけれどまだ明かしていない恐怖カードの中身だけ（枚数は見せる）
 * 使える力と、その対象の土地も入れる（画面はビューだけを見て、選べる土地を光らせる）
 */

import { SPIRITS, INVADER_CARD, LEVELS } from './data.js';
import {
    availablePowers, powerTargets, powerInfo, landsInRange, presenceSources, elementsOf, energyValue, cardPlays,
    hasReclaimOne, innateLevel, isSacred, terrorLevel, onIsland
} from './rules.js';

function spiritView(s, sp) {
    const seat = sp.seat;
    const powers = availablePowers(s, seat).map(p => {
        const info = powerInfo(s, seat, p.power);
        return { power: p.power, swift: p.swift, name: info.name, target: info.target, push: info.push, targets: powerTargets(s, seat, p.power) };
    });
    return {
        seat,
        key: sp.key,
        energy: sp.energy,
        hand: [...sp.hand],
        discard: [...sp.discard],
        played: [...sp.played],
        used: [...sp.used],
        forgotten: [...sp.forgotten],
        energyIdx: sp.energyIdx,
        cardIdx: sp.cardIdx,
        destroyed: sp.destroyed,
        onIsland: onIsland(s, seat),
        step: sp.step,
        growthChoice: sp.growthChoice,
        prompt: sp.prompt ? JSON.parse(JSON.stringify(sp.prompt)) : null,
        presenceLands: sp.prompt?.kind === 'presence' ? landsInRange(s, seat, sp.prompt.range) : [],
        presenceSources: presenceSources(s, seat),
        done: sp.done,
        repeat: sp.repeat ? { ...sp.repeat } : null,
        swift: sp.swift,
        elements: elementsOf(s, seat),
        energyValue: energyValue(s, seat),
        cardPlays: cardPlays(s, seat),
        reclaimOne: hasReclaimOne(s, seat),
        innateLevel: innateLevel(s, seat),
        sacred: s.lands.filter(L => isSacred(s, seat, L)).map(L => L.id),
        powers
    };
}

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const s = game.s;
    const next = s.invader.deck[0];
    return {
        you: seat,
        n: s.n,
        level: s.level,
        levelName: LEVELS[s.level].name,
        turn: s.turn,
        phase: s.phase,
        actors: game.actors(),
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU, spirit: s.spirits[p.id].key })),
        spirits: s.spirits.map(sp => spiritView(s, sp)),
        lands: s.lands.map(L => ({
            id: L.id, board: L.board, num: L.num, terrain: L.terrain, coastal: L.coastal, adj: [...L.adj],
            inv: L.inv.map(p => ({ k: p.k, hp: p.hp })),
            dahan: [...L.dahan],
            blight: L.blight,
            presence: [...L.presence],
            defend: L.defend,
            flags: { ...L.flags }
        })),
        invader: {
            ravage: s.invader.ravage,
            build: s.invader.build,
            explored: s.invader.explored,
            deckCount: s.invader.deck.length,
            nextStage: next ? INVADER_CARD[next].stage : null,
            discard: [...s.invader.discard]
        },
        fear: {
            pool: s.fear.pool,
            gen: s.fear.gen,
            pending: s.fear.earned.length,
            earnedCount: s.fear.earnedCount,
            total: s.fear.total,
            tl: terrorLevel(s),
            resolved: [...s.fear.resolved]
        },
        blight: { pool: s.blight.pool, flipped: s.blight.flipped },
        minorCount: s.minor.deck.length,
        majorCount: s.major.deck.length,
        turnFlags: { ...s.turnFlags },
        result: s.result ? { ...s.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => ({ ...e })) : []
    };
}

export { SPIRITS };
