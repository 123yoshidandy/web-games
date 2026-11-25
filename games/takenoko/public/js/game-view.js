/**
 * ビュー：あるプレイヤーから見てよい情報だけを JSON にしたもの
 * ほかの人の手札の目標は種類（カードの裏）と枚数だけ。山は枚数だけ。引いた区画は引いた本人にだけ見せる。
 * 動く本人には、置ける場所・動ける先・達成できる目標などの候補も入れる（画面が光らせるため）
 */

import { CARD_TYPES, CARDS, PLOTS } from './data.js';

export function createGameView(game, viewer = null) {
    const turn = game.turnState;
    const mine = viewer !== null && viewer === game.current && game.phase === 'play';
    const view = {
        viewer,
        phase: game.phase,
        current: game.current,
        round: game.round,
        tiles: Object.values(game.tiles).map(t => ({
            q: t.q, r: t.r, color: t.color, improvement: t.improvement, fixed: t.fixed, bamboo: t.bamboo,
            irrigated: t.color !== 'pond' && game.isIrrigated(t.q, t.r)
        })),
        channels: Object.keys(game.channels).map(k => k.split('|').map(p => p.split(',').map(Number))),
        gardener: [...game.gardener],
        panda: [...game.panda],
        tokens: { ...game.tokens },
        irrigationLeft: game.irrigationLeft,
        plotDeckCount: game.plotDeck.length,
        deckCounts: Object.fromEntries(CARD_TYPES.map(t => [t, game.decks[t].length])),
        players: game.players.map(p => ({
            seat: p.seat,
            name: p.name,
            isCPU: p.isCPU,
            handTypes: p.hand.map(id => CARDS[id].type),
            hand: p.seat === viewer ? [...p.hand] : null,
            done: [...p.done],
            eaten: { ...p.eaten },
            emperor: p.emperor,
            score: game.scoreOf(p.seat)
        })),
        turn: {
            weather: turn.weather,
            pending: turn.pending,
            actions: [...turn.actions],
            max: turn.max,
            repeat: turn.repeat,
            drawn: turn.drawn && mine ? turn.drawn.map(id => ({ ...PLOTS[id] })) : null
        },
        finalRound: game.finalRound ? { ...game.finalRound } : null,
        options: null,
        commandCount: game.commands.length,
        lastMove: game.lastMove ? structuredClone(game.lastMove) : null,
        result: game.result ? structuredClone(game.result) : null,
        logs: game.logs.slice(-40)
    };
    if (mine) {
        view.options = {
            actions: game.availableActions(),
            plotSpots: turn.drawn ? game.plotSpots() : [],
            irrigationSpots: game.actionAvailable('irrigation') ? game.irrigationSpots() : [],
            gardener: game.actionAvailable('gardener') ? game.reachable(game.gardener) : [],
            panda: game.actionAvailable('panda') ? game.reachable(game.panda) : [],
            rain: turn.pending === 'rain' ? game.rainSpots() : [],
            improvable: turn.pending === 'clouds' ? game.improvableSpots() : [],
            completable: game.players[viewer].hand.filter(id => game.canComplete(viewer, id)),
            canEndTurn: game.canEndTurn()
        };
    }
    return view;
}
