/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、持ち物は全員に見せる。隠すのは、アイテムの袋・特典の山・怪物カードの山の並び（枚数は見せる）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import Game from './game.js';
import { LEVELS } from './data.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        level: game.options.level,
        levelName: LEVELS[game.options.level].name,
        turnNo: game.turnNo,
        current: game.current,
        phase: game.phase,
        actors: game.actors(),
        actionsLeft: game.actionsLeft,
        bonusUsed: game.bonusUsed,
        guideUsed: game.guideUsed,
        skipMonster: game.skipMonster,
        terror: game.terror,
        frenzy: game.frenzy,
        monsters: game.monsters.map(m => ({
            key: m.key,
            loc: m.loc,
            defeated: m.defeated,
            task: Array.isArray(m.task) ? [...m.task] : m.task,
            progress: Game.taskProgress(m),
            total: Game.taskTotal(m.key),
            done: game.taskDone(m)
        })),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            hero: p.hero,
            loc: p.loc,
            items: [...p.items],
            perks: [...p.perks]
        })),
        board: game.board.map(list => [...list]),
        villagers: [...game.villagers],
        bagCount: game.bag.length,
        usedCount: game.used.length,
        deckCount: game.deck.length,
        card: game.card,
        lastStrike: game.lastStrike.map(s => ({ ...s, target: s.target ? { ...s.target } : null, faces: s.faces ? [...s.faces] : undefined })),
        prompt: game.prompt ? structuredClone(game.prompt) : null,
        result: game.result ? { ...game.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => ({ ...e })) : []
    };
}
