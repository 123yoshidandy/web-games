/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * テラミスティカには隠す情報がない（山札もない）ので、状態をそのまま写し、見る人の席とログの差分を足す
 * 画面はビューだけを見て描く。画面の試し打ち（できる操作の一覧）は、Game.fromState(view.state) で行う
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const { logs, events: allEvents, ...state } = game.state;
    return {
        you: seat,
        options: structuredClone(game.options),
        state: structuredClone({ ...state, logs: [], events: [] }),
        actors: game.actors(),
        waiting: game.waiting(),
        logs: logs.slice(Math.max(0, since)),
        logCount: logs.length,
        commandCount: game.commands.length,
        events: events ? structuredClone(allEvents) : []
    };
}
