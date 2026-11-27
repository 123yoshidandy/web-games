// まとめたサーバー（server/src/handler.js）を、Lambda に載せる形に束ねる（docs/server-merge.md）
// - --splitting で、ゲームごとに別のファイル（chunk）にする。Lambda は import() したゲームだけを読み込む
// - 入口は server/dist/handler.mjs（template.yaml の Handler: handler.handler）と、
//   利用者ごとの記録の HTTP API の server/dist/stats-handler.mjs（Handler: stats-handler.handler。docs/user-stats.md）
// - @aws-sdk/* は Lambda の実行環境にあるので束ねない
// - 束ねた後で、server/src/handler.js のあるゲームが全部 chunk になったかを確かめ、欠けていれば失敗する
//   （esbuild が import() の形をまとめられないと、実行時に読み込みで失敗し、そのゲームの接続が 400 になるため）
// 使い方: npm run build:server   （node scripts/build-server.mjs [出力先のフォルダ]）
import { build } from 'esbuild';
import { readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// server/src/handler.js のあるゲーム（オンライン対戦を入れたゲーム）
export const onlineGames = () => readdirSync(join(root, 'games'))
    .filter((name) => existsSync(join(root, 'games', name, 'server', 'src', 'handler.js')))
    .sort();

export async function buildServer({ outdir = join(root, 'server', 'dist') } = {}) {
    rmSync(outdir, { recursive: true, force: true });
    const result = await build({
        absWorkingDir: root,
        entryPoints: ['server/src/handler.js', 'server/src/stats-handler.js'],
        bundle: true,
        splitting: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        external: ['@aws-sdk/*'],
        outdir,
        outExtension: { '.js': '.mjs' },
        chunkNames: 'chunks/[name]-[hash]',
        metafile: true,
        logLevel: 'warning'
    });

    // ゲームの handler.js を入口に持つ chunk を、ゲームごとに探す
    const chunkOf = new Map();
    for (const [file, output] of Object.entries(result.metafile.outputs)) {
        const match = output.entryPoint?.match(/^games\/([^/]+)\/server\/src\/handler\.js$/);
        if (match) chunkOf.set(match[1], relative(outdir, resolve(root, file)));
    }
    const games = onlineGames();
    const missing = games.filter((name) => !chunkOf.has(name));
    return { outdir, games, chunkOf, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const outdir = process.argv[2] ? resolve(process.argv[2]) : undefined;
    const { outdir: dir, games, chunkOf, missing } = await buildServer({ outdir });
    console.log(`${relative(root, dir) || dir}/handler.mjs・stats-handler.mjs と、ゲームごとの chunk ${chunkOf.size} 個（オンライン対戦のあるゲーム ${games.length} 本）`);
    if (missing.length > 0) {
        console.error(`chunk にならなかったゲーム: ${missing.join(', ')}`);
        process.exit(1);
    }
}
