// オンライン対戦の結果を、サーバーが記録できるゲームを数える（docs/user-stats.md）
// 各ゲームの定義で、全員 CPU の対戦を作って CPU だけで終わりまで進め、サーバーと同じく保存の形（persist → JSON → restore）を
// 通したゲームから、netplay-kit の stats.js の resultOf で勝ち負けを取り出せるかを試す
//   取れる        … 定義の result か、game の決まった形の項目から、席ごとの順位（か協力の結果）が取れた
//   取れない      … 終わりまで進んだが、勝ち負けが取れない（回数だけを数える。定義に result を足す）
//   試せない      … CPU だけでは終わらない・作れない（リアルタイムのゲームなど。手で確かめる）
// 使い方: node scripts/user-stats-coverage.mjs [ゲーム…] [--json]
//   ゲームごとに別のプロセスで、20秒までで流す（止まらない CPU があっても全体は止まらない）
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resultOf } from 'netplay-kit/server/stats.js';
import { createSeededRandom } from 'netplay-kit/server/testing.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');
const MAX_STEPS = 20000;
const TIMEOUT_MS = 20000;

const definitionFile = (game) => join(gamesDir, game, 'server', 'src', 'game-definition.js');
export const onlineGames = () => readdirSync(gamesDir).filter((game) => existsSync(definitionFile(game))).sort();

// 1つのゲームを試す（子のプロセスで動く）
export async function measure(game) {
    const loaded = await import(pathToFileURL(definitionFile(game)).href);
    const definition = loaded.default ?? loaded;
    const hook = typeof definition.result === 'function';
    const count = Math.max(2, Math.min(definition.minPlayers ?? 2, definition.maxPlayers ?? 4));
    const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `CPU${i + 1}`, isCPU: true }));
    const settings = definition.settings?.defaults?.() ?? {};
    const room = { code: '0000', matchId: 1, createdAt: 0, status: 'playing', settings, players, carry: null };
    const random = createSeededRandom(7);
    let game_;
    try {
        game_ = definition.create({ players, settings: definition.settings?.forStart ? definition.settings.forStart(settings) : settings, carry: null, matchId: 1, random, now: Date.now() });
    } catch (error) {
        return { game, status: 'untestable', hook, reason: `作れない: ${error.message}` };
    }
    const cpu = definition.cpu;
    if (!cpu) return { game, status: 'untestable', hook, reason: '定義に CPU がない' };
    let steps = 0;
    for (; steps < MAX_STEPS && !definition.isOver?.(game_); steps++) {
        if (cpu.needsStep && !cpu.needsStep(game_, room)) return { game, status: 'untestable', hook, reason: `CPU が止まった（${steps} 手）` };
        const before = cpu.progress?.(game_);
        let moved;
        try {
            moved = cpu.step(game_, { random, now: Date.now() + steps * 1000, room });
        } catch (error) {
            return { game, status: 'untestable', hook, reason: `CPU の失敗: ${error.message}` };
        }
        if (moved === false || (cpu.progress && cpu.progress(game_) === before)) return { game, status: 'untestable', hook, reason: `CPU が進まない（${steps} 手）` };
    }
    if (!definition.isOver?.(game_)) return { game, status: 'untestable', hook, reason: `${MAX_STEPS} 手で終わらない` };
    // サーバーと同じく、保存の形を通してから取り出す（DynamoDB を通すとクラスのメソッドはなくなる）
    const stored = JSON.parse(JSON.stringify(definition.persist ? definition.persist(game_) : game_));
    const restored = definition.restore ? definition.restore(stored, room) : stored;
    const result = resultOf(definition, restored, room);
    return { game, status: result ? 'derived' : 'missing', hook, steps, result };
}

const LABEL = { derived: '取れる', missing: '取れない', untestable: '試せない' };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args[0] === '--one') {
        const report = await measure(args[1]).catch((error) => ({ game: args[1], status: 'untestable', reason: `読み込めない: ${error.message}` }));
        process.stdout.write(JSON.stringify(report));
        process.exit(0);
    }
    const asJson = args.includes('--json');
    const games = args.filter((arg) => !arg.startsWith('--'));
    const reports = (games.length ? games : onlineGames()).map((game) => {
        const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--one', game], { cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 1 << 24 });
        try {
            return JSON.parse(run.stdout);
        } catch {
            return { game, status: 'untestable', reason: run.error?.code === 'ETIMEDOUT' ? `${TIMEOUT_MS / 1000}秒で終わらない` : `失敗: ${(run.stderr || '').trim().split('\n').at(-1)}` };
        }
    });
    if (asJson) {
        console.log(JSON.stringify(reports, null, 2));
    } else {
        for (const status of ['derived', 'missing', 'untestable']) {
            const list = reports.filter((r) => r.status === status);
            console.log(`${LABEL[status]}: ${list.length} 本`);
            for (const r of list) console.log(`  ${r.game}${r.hook ? '（定義の result）' : ''}${r.reason ? ` … ${r.reason}` : ''}`);
        }
    }
}
