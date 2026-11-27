#!/usr/bin/env node
/**
 * パズルのゲームのアイコン一式を、絵の SVG 1つから作る（ヘッドレス Chrome で PNG に描く）
 *
 *   node packages/puzzle-kit/tools/icons.mjs <ゲーム> <絵.svg> [--background '#f4efe4']
 *     <絵.svg> は viewBox="0 0 64 64" の SVG（背景は描かない。端から 6 くらいは空ける）
 *     ゲームの public/ に favicon.svg（角の丸い背景つき）・favicon.png（64）・apple-touch-icon.png（180）・
 *     icon-192.png・icon-512.png（角のない背景）・icon-maskable-512.png（周りに余白）を書く
 *   Chrome の場所は CHROME_PATH か、macOS の決まった場所
 *   Chrome は、一時フォルダ（TMPDIR の下）に作った空のプロフィールで動かし、終わったら消す（ふだんのプロフィールを使わない）
 *   成否は PNG が書けたかで決める（Chrome の終了コードは、書けていても 0 でないことがある）。書けたら終了コード 0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../games');
const CHROME_PATHS = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);

export const ICON_FILES = ['favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

export const findChrome = () => CHROME_PATHS.find(p => fs.existsSync(p)) ?? null;

// SVG の中身（<svg> の内側）から、アイコン一式を publicDir に書く。書いたファイルの一覧を返す（書けなければ投げる）
export function makeIcons({ publicDir, art, background = '#f4efe4', chrome = findChrome() }) {
    if (!chrome) throw new Error('Chrome が見つかりません。CHROME_PATH で場所を指定してください');
    const body = art.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
    const svgs = {
        favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  <rect width="64" height="64" rx="14" fill="${background}"/>\n  ${body}\n</svg>\n`,
        square: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  <rect width="64" height="64" fill="${background}"/>\n  ${body}\n</svg>\n`,
        // maskable は、中央の 80% が安全域（周りは切られることがある）
        maskable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 88 88">\n  <rect x="-12" y="-12" width="88" height="88" fill="${background}"/>\n  ${body}\n</svg>\n`
    };

    // os.tmpdir() は TMPDIR に従う。プロフィールもこの中に作り、最後にまとめて消す
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-kit-icons-'));
    const profile = path.join(work, 'profile');
    fs.mkdirSync(profile);
    try {
        for (const [name, svg] of Object.entries(svgs)) fs.writeFileSync(path.join(work, `${name}.svg`), svg);
        const render = (svgName, size, out) => {
            const html = path.join(work, 'render.html');
            const target = path.join(publicDir, out);
            fs.writeFileSync(html, `<html><body style="margin:0;background:transparent"><img src="file://${path.join(work, `${svgName}.svg`)}" width="${size}" height="${size}" style="display:block"></body></html>`);
            fs.rmSync(target, { force: true });
            const result = spawnSync(chrome, [
                '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
                `--user-data-dir=${profile}`, '--default-background-color=00000000',
                `--window-size=${size},${size}`, `--screenshot=${target}`, `file://${html}`
            ], { stdio: 'ignore', env: { ...process.env, TMPDIR: work }, timeout: 60000 });
            if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
                throw new Error(`${out} を描けませんでした（Chrome の終了コード ${result.status}${result.error ? `、${result.error.message}` : ''}）`);
            }
        };
        fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgs.favicon);
        render('favicon', 64, 'favicon.png');
        render('square', 180, 'apple-touch-icon.png');
        render('square', 192, 'icon-192.png');
        render('square', 512, 'icon-512.png');
        render('maskable', 512, 'icon-maskable-512.png');
        return ICON_FILES;
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const background = args.includes('--background') ? args[args.indexOf('--background') + 1] : '#f4efe4';
    const [game, artFile] = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--background');
    if (!game || !artFile) {
        console.error('使い方: node packages/puzzle-kit/tools/icons.mjs <ゲーム> <絵.svg> [--background 色]');
        process.exit(2);
    }
    const publicDir = path.join(game.includes('/') ? path.resolve(game) : path.join(GAMES_ROOT, game), 'public');
    try {
        const files = makeIcons({ publicDir, art: fs.readFileSync(artFile, 'utf8'), background });
        console.log(`${publicDir} にアイコンを書きました（${files.join('・')}）`);
        process.exitCode = 0;
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
