// オンライン対戦の通し試験：ヘッドレス Chrome で2人分のページを開き、共通のロビーから部屋を作って数手打つ（AWS は使わない）
// 使い方: node scripts/online-e2e.mjs <ゲーム> [--moves 6] [--shots <フォルダ>]
// - 全ゲーム用のテスト用サーバー（dev-online.mjs と同じ）と画面の配信を、このプロセスの中で空いているポートに立て、終わったら止める（8080 は使わない）
// - A は localhost、B は 127.0.0.1 で開く（参加情報の保存が混ざらない）。A が部屋を作り、B が招待URLから入り、A が始める
// - 手は、サーバーの部屋の状態から選び（定義の CPU、だめならゲームの suggest）、その席のページの
//   window.__app.online.controller.send() で送る。両方のページに届いたかを、部屋の版で確かめる
// - 最後に、B の再読み込みで同じ席に戻ること、A が部屋を出ると B に届くこと、ページにエラーがないことを確かめる
// - 結果は「OK／NG 項目」で出し、NG があれば終了コード1。画面の PNG は --shots のフォルダ（省くと一時フォルダ）に置く
import http from 'node:http';
import net from 'node:net';
import { existsSync, statSync, createReadStream, readdirSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, createChecklist } from 'netplay-kit/tools/chrome.mjs';
import { startMultiDevServer } from 'netplay-kit/server/dev-server.js';
import { createMovePicker } from 'test-kit/picker.js';
import { loadDefinition } from './dev-online.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AVOID_PORTS = [8080]; // ユーザーが自分で使う
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};

export function parseArgs(argv) {
    const args = { game: null, moves: 6, shots: null };
    const rest = [...argv];
    while (rest.length > 0) {
        const arg = rest.shift();
        if (arg === '--moves') args.moves = Number(rest.shift());
        else if (arg === '--shots') args.shots = rest.shift();
        else if (!arg.startsWith('--')) args.game = arg;
    }
    return args;
}

// 空いているポートを n 個（OS に選ばせる。使わないポートは避ける）
export async function freePorts(n) {
    const ports = [];
    while (ports.length < n) {
        const port = await new Promise((resolve, reject) => {
            const server = net.createServer();
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const { port: chosen } = server.address();
                server.close(() => resolve(chosen));
            });
        });
        if (!AVOID_PORTS.includes(port) && !ports.includes(port)) ports.push(port);
    }
    return ports;
}

export const publicDirOf = (game) => (existsSync(join(root, 'games', game, 'public')) ? join(root, 'games', game, 'public') : join(root, 'games', game));

// 席の一手を選ぶ。まず定義の CPU（どのゲームでも同じ形で動く）、選べなければゲームの suggest（形が違えば使わない）
export async function createE2EPicker(definition, publicDir) {
    const cpu = createMovePicker({ definition });
    let viaSuggest = null;
    const jsDir = join(publicDir, 'js');
    for (const file of existsSync(jsDir) ? readdirSync(jsDir).filter((name) => name.endsWith('.js')) : []) {
        if (!/export (function|const) suggest/.test(readFileSync(join(jsDir, file), 'utf8'))) continue;
        const { suggest } = await import(pathToFileURL(join(jsDir, file)).href);
        viaSuggest = createMovePicker({ definition, suggest });
    }
    return (room, seat) => {
        try {
            const move = cpu.moveFor(room, seat);
            if (move) return move;
        } catch {
            // CPU で選べない形なら suggest を試す
        }
        try {
            return viaSuggest?.moveFor(room, seat) ?? null;
        } catch {
            return null;
        }
    };
}

// 画面を配る（publicDir の中だけ）
function serveStatic(publicDir, port) {
    const server = http.createServer((request, response) => {
        let file = join(publicDir, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        if (!file.startsWith(publicDir) || !existsSync(file)) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
        createReadStream(file).pipe(response);
    });
    return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ページの中の、捕まえられなかった例外を集める（コンソールに出ない分）
const COLLECT_ERRORS = 'window.__errs=[];addEventListener("error",e=>__errs.push(String(e.message)));'
    + 'addEventListener("unhandledrejection",e=>__errs.push(String(e.reason&&e.reason.message||e.reason)));';
const READY = 'window.__app && window.__app.online';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runE2E({ game, moves = 6, shots = null }) {
    const definition = await loadDefinition(game);
    if (!definition) throw new Error(`${game} にゲームの定義（server/src/game-definition.js）がありません`);
    const publicDir = publicDirOf(game);
    const moveFor = await createE2EPicker(definition, publicDir);
    const shotDir = shots ?? mkdtempSync(join(tmpdir(), 'online-e2e-'));
    mkdirSync(shotDir, { recursive: true });

    const [wsPort, webPort, chromePort] = await freePorts(3);
    const web = await serveStatic(publicDir, webPort);
    const dev = startMultiDevServer({ load: loadDefinition, port: wsPort, log: () => {} });
    await new Promise((resolve) => dev.server.once('listening', resolve));

    const check = createChecklist();
    const consoleErrors = [];
    let chrome;
    const server = encodeURIComponent(`ws://localhost:${wsPort}`);
    const click = (page, selector) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
    const type = (page, selector, value) => page.eval(`(() => { document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(value)}; return true; })()`);
    const lobbyOf = async (page) => JSON.parse(await page.eval('JSON.stringify(window.__app.online.controller?.lobby ?? null)'));
    const openPage = async (url, label) => {
        const page = await chrome.openPage('about:blank', { onConsole: (text) => { if (text.startsWith('error')) consoleErrors.push(`${label}: ${text}`); } });
        await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: COLLECT_ERRORS });
        await page.goto(url, { ready: READY });
        return page;
    };
    const onlineButton = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'オンラインで遊ぶ')`;

    try {
        chrome = await launchChrome({ port: chromePort });
        const a = await openPage(`http://localhost:${webPort}/?server=${server}`, 'A');
        const b = await openPage(`http://127.0.0.1:${webPort}/?server=${server}`, 'B');

        // A：タイトルの「オンラインで遊ぶ」→ 名前 → 部屋を作る
        check.ok('A: タイトルに「オンラインで遊ぶ」が見える', await a.eval(`(() => { const b = ${onlineButton}; return Boolean(b && !b.hidden && b.offsetParent !== null); })()`));
        await a.eval(`${onlineButton}.click(); true`);
        await a.waitFor(`!document.querySelector('.netplay-lobby').hidden`);
        await type(a, '.netplay-lobby [data-ref=name]', 'あお');
        await click(a, '.netplay-lobby [data-act=create]');
        await a.waitFor(`window.__app.online.controller?.lobby?.status === 'lobby'`);
        const code = (await lobbyOf(a)).roomCode;
        check.ok('A: 部屋ができ、ロビーが出る', /^\d{4}$/.test(code), code);
        await a.shot(join(shotDir, `${game}-lobby-A.png`));

        // B：招待URL（接続先の ?server= も残る）→ 名前 → 参加
        const invite = (await a.eval('window.__app.online.controller.net.inviteUrl()')).replace('//localhost:', '//127.0.0.1:');
        check.ok('招待URLに部屋番号と接続先が入る', invite.includes(`room=${code}`) && invite.includes('server='), invite);
        await b.goto(invite, { ready: READY });
        await b.waitFor(`!document.querySelector('.netplay-lobby')?.hidden`);
        await type(b, '.netplay-lobby [data-ref=name]', 'みどり');
        await click(b, '.netplay-lobby [data-act=join]');
        await a.waitFor('window.__app.online.controller.lobby.players.filter(p => !p.left).length === 2');
        check.ok('B: 招待URLから参加し、席1になる', await b.eval('window.__app.online.controller.seat') === 1);

        // 人数が足りなければ A が CPU を足し、始める
        for (let count = 2; count < (definition.minPlayers ?? 2); count++) {
            await click(a, '.netplay-lobby [data-act=add-cpu]');
            await a.waitFor(`window.__app.online.controller.lobby.players.length === ${count + 1}`);
        }
        await click(a, '.netplay-lobby [data-act=start]');
        for (const [page, label] of [[a, 'A'], [b, 'B']]) {
            await page.waitFor(`window.__app.online.mode === 'playing' && !!window.__app.online.controller.view && document.querySelector('.netplay-lobby').hidden`);
            check.ok(`${label}: 開始すると盤面に切り替わる`, true);
        }

        // 手番の席のページから打つ。部屋の版が進み、両方のページに届くまで待つ
        const roomKey = `${game}#${code}`;
        let played = 0;
        for (let tries = 0; tries < moves * 4 && played < moves; tries++) {
            const room = dev.store.rooms.get(roomKey);
            if (room.status !== 'playing') break;
            const seat = [0, 1].find((s) => moveFor(room, s));
            if (seat === undefined) {
                await wait(300); // CPU の番など
                continue;
            }
            const page = seat === 0 ? a : b;
            const command = moveFor(room, seat);
            await page.waitFor('!window.__app.online.controller.awaitingResponse');
            if (!await page.eval(`window.__app.online.controller.send(${JSON.stringify(command)})`)) {
                await wait(200);
                continue;
            }
            await page.waitFor('!window.__app.online.controller.awaitingResponse');
            const version = dev.store.rooms.get(roomKey).version;
            if (version === room.version) {
                check.ok(`手 ${played + 1}: 席${seat} の操作が通る`, false, JSON.stringify(command));
                break;
            }
            await a.waitFor(`window.__app.online.controller.net.lastVersion >= ${version}`);
            await b.waitFor(`window.__app.online.controller.net.lastVersion >= ${version}`);
            played++;
        }
        check.ok(`${moves} 手を打ち、両方の画面に届く`, played >= moves || (played > 0 && dev.store.rooms.get(roomKey).status !== 'playing'), `${played} 手`);
        check.ok('A・B: 盤面に何か描かれている', await a.eval('document.body.innerText.length > 20') && await b.eval('document.body.innerText.length > 20'));
        await a.shot(join(shotDir, `${game}-game-A.png`));
        await b.shot(join(shotDir, `${game}-game-B.png`));

        // B を読み込み直すと、同じ席に戻る
        await b.goto(`http://127.0.0.1:${webPort}/?server=${server}&room=${code}`, { ready: READY });
        await b.waitFor(`window.__app.online.mode === 'playing' && !!window.__app.online.controller?.view`, 15000);
        check.ok('B: 再読み込みしても同じ席に戻り、盤面が出る', await b.eval('window.__app.online.controller.seat') === 1);

        // A がホームから部屋を出る → B に A が抜けたと届く
        await a.eval('window.__app.online.confirmLeave(); true');
        await click(a, '.netplay-lobby [data-panel=leave] [data-act=leave]');
        await a.waitFor(`window.__app.online.mode === 'closed'`);
        await b.waitFor('window.__app.online.controller.lobby.players[0].left === true');
        check.ok('A: 部屋を出るとタイトルに戻り、B には A が抜けたと届く', true);

        const errors = [...await a.eval('window.__errs'), ...await b.eval('window.__errs'), ...consoleErrors];
        check.ok('画面のエラーがない', errors.length === 0, errors.slice(0, 3).join(' | '));
    } catch (error) {
        check.ok('通し試験が最後まで進む', false, String(error.message).slice(0, 400));
    } finally {
        await chrome?.close();
        await dev.close();
        await new Promise((resolve) => web.close(resolve));
    }
    console.log(`画面：${shotDir}`);
    return check.report();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = parseArgs(process.argv.slice(2));
    if (!args.game || !Number.isFinite(args.moves)) {
        console.error('使い方: node scripts/online-e2e.mjs <ゲーム> [--moves 6] [--shots <フォルダ>]');
        process.exit(2);
    }
    runE2E(args).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
