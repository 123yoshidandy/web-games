import { describe, it, expect } from 'vitest';
import { createTestServer } from '../server/testing.js';
import { createViewHistory } from '../client/netplay-lobby.js';

// 作り物の手番制のゲーム：操作のたびに記録が1行増える。CPU も1手ごとに1行
// slice: true なら、ビューの logs を since で切る（多くのゲームの定義と同じ）。false なら最後の2行だけを毎回送る
function logGame({ slice }) {
    return {
        allowCpu: true,
        create: ({ players }) => ({ players: players.map(p => ({ isCPU: p.isCPU })), turn: 0, logs: ['開始'], events: [] }),
        view: (game, seat, { since } = {}) => ({
            turn: game.turn,
            logs: slice ? game.logs.slice(since ?? 0) : game.logs.slice(-2),
            events: game.events.filter(e => e.seq > (since ?? 0))
        }),
        mark: (game) => game.logs.length,
        actions: {
            command({ game, seat, reject }) {
                if (game.turn % game.players.length !== seat) return reject('あなたの番ではありません');
                game.logs.push(`席${seat}の手`);
                game.turn++;
            }
        },
        cpu: {
            needsStep: (game) => game.players[game.turn % game.players.length].isCPU,
            step: (game) => {
                game.logs.push(`CPU（席${game.turn % game.players.length}）の手`);
                game.turn++;
                return true;
            },
            progress: (game) => game.turn
        }
    };
}

const replay = (client) => {
    const history = createViewHistory();
    let view = null;
    client.all('state').forEach(message => { view = history.apply(message); });
    return view;
};

describe('state の since と history（サーバー）', () => {
    it('since で切る定義では、state に since と history: [logs] が載り、画面側でためると初めからの記録になる', async () => {
        const server = createTestServer(logGame({ slice: true }));
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('addCpu');
        await a.send('start');
        await a.send('command', { command: {} });   // 席0 → 席1
        await b.send('command', { command: {} });   // 席1 → CPU（席2）が打って席0
        const last = a.last('state');
        expect(last.since).toBeGreaterThan(0);
        expect(last.history).toEqual(['logs']);
        expect(last.view.logs.length).toBeLessThan(4);
        expect(replay(a).logs).toEqual(['開始', '席0の手', '席1の手', 'CPU（席2）の手']);
        expect(replay(b).logs).toEqual(['開始', '席0の手', '席1の手', 'CPU（席2）の手']);
    });

    it('since で切らない定義（最後の数行だけを毎回送る）には history を載せず、画面側も届いたまま使う', async () => {
        const server = createTestServer(logGame({ slice: false }));
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        await a.send('command', { command: {} });
        await b.send('command', { command: {} });
        expect(a.last('state').history).toBeUndefined();
        expect(replay(a).logs).toEqual(['席0の手', '席1の手']);
    });
});

describe('createViewHistory（画面側で記録をためる）', () => {
    const state = (fields, view) => ({ type: 'state', matchId: 'm1', ...fields, view });

    it('番号のない記録は since の位置で重ねる（同じ位置から送り直されても増えない）', () => {
        const history = createViewHistory();
        history.apply(state({ since: null }, { logs: ['a', 'b'] }));
        expect(history.apply(state({ since: 2, history: ['logs'] }, { logs: ['c'] })).logs).toEqual(['a', 'b', 'c']);
        expect(history.apply(state({ since: 2, history: ['logs'] }, { logs: ['c', 'd'] })).logs).toEqual(['a', 'b', 'c', 'd']);
        expect(history.apply(state({ since: 4, history: ['logs'] }, { logs: [] })).logs).toEqual(['a', 'b', 'c', 'd']);
    });

    it('seq・n の番号を持つ記録は番号で重ね、何度届いても増えない', () => {
        const history = createViewHistory();
        history.apply(state({ since: 1, history: ['events'] }, { events: [{ seq: 1 }, { seq: 2 }] }));
        const view = history.apply(state({ since: 2, history: ['events'] }, { events: [{ seq: 2, x: 1 }, { seq: 3 }] }));
        expect(view.events).toEqual([{ seq: 1 }, { seq: 2, x: 1 }, { seq: 3 }]);
        const logs = history.apply(state({ since: 0, history: ['logs'] }, { logs: [{ n: 2, t: 'b' }, { n: 1, t: 'a' }] })).logs;
        expect(logs.map(l => l.n)).toEqual([1, 2]);
    });

    it('since が null のビューは丸ごと入れ替え、別の対戦（matchId）が届いたら、ためた記録を捨てる', () => {
        const history = createViewHistory();
        history.apply(state({ since: null }, { logs: ['a'] }));
        history.apply(state({ since: 1, history: ['logs'] }, { logs: ['b'] }));
        expect(history.apply(state({ since: null, history: ['logs'] }, { logs: ['x', 'y'] })).logs).toEqual(['x', 'y']);
        expect(history.apply({ type: 'state', matchId: 'm2', since: 3, history: ['logs'], view: { logs: ['新'] } }).logs).toEqual(['新']);
    });

    it('history に挙がっていない配列は、届いたまま使う（ためない）', () => {
        const history = createViewHistory();
        history.apply(state({ since: 1 }, { logs: ['a', 'b'], events: [{ type: 'move' }] }));
        const view = history.apply(state({ since: 2 }, { logs: ['b', 'c'], events: [{ type: 'flip' }] }));
        expect(view.logs).toEqual(['b', 'c']);
        expect(view.events).toEqual([{ type: 'flip' }]);
    });

    it('前の記録とつながらない範囲（再接続の送り直しなど）は、その範囲から始め直す', () => {
        const history = createViewHistory();
        history.apply(state({ since: null }, { logs: ['a'] }));
        expect(history.apply(state({ since: 10, history: ['logs'] }, { logs: ['k', 'l'] })).logs).toEqual(['k', 'l']);
        expect(history.apply(state({ since: 12, history: ['logs'] }, { logs: ['m'] })).logs).toEqual(['k', 'l', 'm']);
    });

    it('届いたビューは書き換えない', () => {
        const history = createViewHistory();
        const message = state({ since: null }, { logs: ['a'] });
        history.apply(message);
        const next = state({ since: 1, history: ['logs'] }, { logs: ['b'] });
        history.apply(next);
        expect(next.view.logs).toEqual(['b']);
    });
});
