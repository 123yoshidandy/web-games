/**
 * 見る人ごとの状態。ほかの人の手札、JARVIS の裏のカード、まだめくっていない課題を隠す
 * 見る人が操作できるときは、選べるものを options に入れる
 */

import { commPosition } from './game.js';

export function createGameView(game, viewer) {
    const step = game.phase === 'prep' ? game.step : null;
    const current = game.current;
    const view = {
        mission: game.missionNumber,
        commandCount: game.commands.length,
        viewer,
        phase: game.phase,
        commander: game.commander,
        current,
        turnSeat: game.phase === 'play' && !game.passing ? game.turnSeat() : null,
        trickNumber: game.trickNumber,
        totalTricks: game.totalTricks,
        players: game.players.map(p => ({
            seat: p.seat,
            name: p.name,
            isCPU: p.isCPU,
            jarvis: p.jarvis,
            handCount: p.jarvis ? null : game.hands[p.seat].length,
            tricksWon: game.tricksWon[p.seat]
        })),
        hand: game.players[viewer]?.jarvis ? [] : [...(game.hands[viewer] ?? [])],
        jarvis: game.jarvisPiles ? game.jarvisPiles.map(p => ({ up: p.up, down: !!p.down })) : null,
        tasks: game.tasks.map((t, i) => ({
            index: i,
            card: taskVisible(game, i) ? t.card : null,
            token: t.token,
            owner: t.owner,
            done: t.done,
            order: t.order
        })),
        comms: game.comms.map(c => (c ? { card: c.card, position: c.hidden ? null : c.position, played: c.played } : null)),
        trick: { leader: game.trick.leader, plays: [...game.trick.plays] },
        lastTrick: game.lastTrick ?? null,
        silenced: game.silenced,
        chosen: game.chosen,
        roles: game.roles,
        answers: [...game.answers],
        lastAnswers: game.lastAnswers,
        step: step ? { ...publicStep(step), purpose: step.purpose ?? (step.kind === 'ask' ? game.steps[0]?.purpose ?? null : null) } : null,
        assignable: step?.kind === 'assignTask' ? game.players.map(p => p.seat).filter(seat => game.canAssign(seat)) : null,
        passing: game.passing ? { direction: game.passing.direction, chosen: game.passOrder().filter(s => game.passing.cards[s] !== undefined) } : null,
        distressUsed: game.distressUsed,
        result: game.result,
        logs: game.logs.slice(-30),
        lastMove: game.lastMove,
        options: null
    };
    // 観戦者（viewer が null）にはできることがない
    view.options = viewer === null || viewer === undefined ? null : optionsFor(game, viewer);
    return view;
}

// 課題のカードが見えるか：指揮官の決定は受け持つ人が決まるまで裏、指揮官の配分はめくった分だけ
function taskVisible(game, i) {
    const assign = game.mission.assign;
    if (game.phase !== 'prep' || game.tasks[i].owner !== null) return true;
    if (assign === 'decision') return false;
    if (assign === 'distribution') return game.step?.task !== undefined && i <= game.step.task;
    return true;
}

function publicStep(step) {
    const { kind, question, task, purpose, actor, order, turn } = step;
    return { kind, question, task, purpose, actor, order, turn };
}

function optionsFor(game, viewer) {
    if (game.phase === 'end') return null;
    const options = {};
    if (game.commAllowed(viewer)) {
        const cards = game.hands[viewer].map(card => ({ card, position: commPosition(game.hands[viewer], card) })).filter(c => c.position);
        if (cards.length) options.communicate = cards;
    }
    if (game.distressAvailable() && !game.players[viewer].jarvis) options.distress = true;
    if (game.current === viewer) {
        if (game.passing) {
            options.pass = game.hands[viewer].filter(c => !c.startsWith('rocket'));
        } else if (game.phase === 'play') {
            const seat = game.turnSeat();
            options.play = { seat, cards: game.playable(seat) };
        } else {
            options.prep = game.step.kind;
        }
    }
    return Object.keys(options).length ? options : null;
}
