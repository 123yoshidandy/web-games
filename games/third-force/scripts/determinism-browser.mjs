// ブラウザ（ヘッドレス Chrome）でも、決めた組の対戦が node と同じになるかを確かめる
// test/golden.json の組を、ブラウザの中で battle.js から流し、最後の状態のハッシュと勝者を比べる
// 画面を配るサーバーと Chrome は、空いているポートで立てて、終わったら止める（8080 は使わない）
// 使い方: npm run check:browser -w games/third-force
import http from 'node:http';
import net from 'node:net';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from 'netplay-kit/tools/chrome.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const golden = JSON.parse(readFileSync(join(root, 'test', 'golden.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        server.close(() => (port === 8080 ? freePort().then(resolve) : resolve(port)));
    });
});

const webPort = await freePort();
const chromePort = await freePort();
const web = http.createServer((request, response) => {
    let file = join(publicDir, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(publicDir) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
});
await new Promise((resolve) => web.listen(webPort, '127.0.0.1', resolve));

let chrome;
let failed = 0;
try {
    chrome = await launchChrome({ port: chromePort });
    const page = await chrome.openPage(`http://127.0.0.1:${webPort}/`, { ready: '!!window.__app' });
    const results = JSON.parse(await page.eval(`(async () => {
        const { runBattle, hashBattle, ENGINE_VERSION } = await import('./js/battle.js');
        const { BUILTIN } = await import('./js/cpu-tactics.js');
        const cases = ${JSON.stringify(golden.cases)};
        return JSON.stringify({ engine: ENGINE_VERSION, cases: cases.map(({ seed, a, b }) => {
            const battle = runBattle({ seed, tactics: [BUILTIN[a], BUILTIN[b]] });
            return { hash: hashBattle(battle), winner: battle.winner };
        }) });
    })()`));
    if (results.engine !== golden.engine) { console.log(`NG エンジンの版が違う（ブラウザ ${results.engine}・記録 ${golden.engine}）`); failed++; }
    golden.cases.forEach((c, i) => {
        const r = results.cases[i];
        const ok = r.hash === c.hash && r.winner === c.winner;
        if (!ok) failed++;
        console.log(`${ok ? 'OK' : 'NG'} ${c.a} 対 ${c.b}（シード ${c.seed}）：ブラウザ ${r.hash}・node ${c.hash}`);
    });
} catch (error) {
    console.log(`NG ブラウザで流せない：${error.message}`);
    failed++;
} finally {
    await chrome?.close();
    await new Promise((resolve) => web.close(resolve));
}
process.exit(failed > 0 ? 1 : 0);
