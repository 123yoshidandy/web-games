#!/usr/bin/env node
/**
 * sw.js の先に読むファイルの一覧（PRECACHE）を、ゲームの public/ の中のファイルから作り直す
 *
 *   node packages/puzzle-kit/tools/precache.mjs <ゲームのフォルダ> [--check]
 *     ゲームの package.json の "sw" から `node ../../packages/puzzle-kit/tools/precache.mjs .` で呼ぶ（npm run sw）
 *     --check なら書き換えず、食い違えば終了コード1
 *   一覧：ページ・manifest・アイコン、css/ の下の CSS、js/ の下の JS すべて（netplay-kit・音・puzzle-kit の写しを含む）
 *   種類のファイルを足したり、puzzle-kit を同期したりしたら作り直す（test の testPrecache が食い違いを見つける）
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXED = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png'];

function filesIn(publicDir, dir, pattern) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return filesIn(publicDir, path, pattern);
        return pattern.test(name) ? [relative(publicDir, path).split('\\').join('/')] : [];
    });
}

export function precacheList(publicDir) {
    return [
        ...FIXED,
        ...filesIn(publicDir, join(publicDir, 'css'), /\.css$/).sort(),
        ...filesIn(publicDir, join(publicDir, 'js'), /\.m?js$/).sort()
    ];
}

export function renderPrecache(sw, list) {
    const lines = [];
    let line = '   ';
    for (const file of list) {
        const item = ` '${file}',`;
        if (line.length + item.length > 120) {
            lines.push(line);
            line = '   ';
        }
        line += item;
    }
    lines.push(line.replace(/,$/, ''));
    return sw.replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = [\n${lines.join('\n')}\n];`);
}

// ゲームのフォルダの sw.js を作り直す（check なら書き換えない）。最新なら true
export function updatePrecache(gameDir, { check = false } = {}) {
    const publicDir = join(gameDir, 'public');
    const file = join(publicDir, 'sw.js');
    const sw = readFileSync(file, 'utf8');
    const next = renderPrecache(sw, precacheList(publicDir));
    if (next === sw) return true;
    if (!check) writeFileSync(file, next);
    return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const gameDir = resolve(args.find(arg => !arg.startsWith('--')) ?? '.');
    const check = args.includes('--check');
    const fresh = updatePrecache(gameDir, { check });
    if (check) {
        console.log(fresh ? 'sw.js の PRECACHE は最新' : 'sw.js の PRECACHE が古い。npm run sw で作り直す');
        process.exitCode = fresh ? 0 : 1;
    } else {
        console.log(fresh ? 'sw.js の PRECACHE は最新' : `sw.js の PRECACHE を作り直した（${precacheList(join(gameDir, 'public')).length} 件）`);
    }
}
