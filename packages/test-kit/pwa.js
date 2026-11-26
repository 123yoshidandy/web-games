// PWA のファイルがそろっているかのテスト（ゲームの public/ の場所を渡して使う）
// 使い方（ゲームの test/pwa.test.js）:
//   import path from 'node:path';
//   import { describePwa } from 'test-kit/pwa.js';
//   describePwa(path.join(import.meta.dirname, '..', 'public'));
// 置き方がほかと違うゲームは、2つ目の引数で伝える:
//   css     … 先に読んでおくはずの CSS（既定は css/style.css）。例: { css: ['style.css'] }
//   pending … まだそろっていない検査の名前（下の CHECKS のキー）。その検査は「未対応」の todo として出す。直したら外す
//             例: { pending: ['precache'] }
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

export const CHECKS = ['precache', 'precache-exists', 'manifest', 'html-links', 'icon-sizes'];

export function describePwa(publicDir, { css = ['css/style.css'], pending = [] } = {}) {
    const read = (file) => fs.readFileSync(path.join(publicDir, file), 'utf8');
    const cssFiles = [css].flat();
    pending.forEach(key => {
        if (!CHECKS.includes(key)) throw new Error(`describePwa: pending の ${key} という検査はありません（${CHECKS.join('・')}）`);
    });
    const check = (key, name, fn) => (pending.includes(key) ? it.todo(`${name}（未対応）`) : it(name, fn));

    describe('PWA', () => {
        check('precache', 'service worker が、画面の JS と CSS を全部先に読んでおく', () => {
            const sw = read('sw.js');
            const files = fs.readdirSync(path.join(publicDir, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`);
            [...files, ...cssFiles, 'index.html', 'manifest.webmanifest'].forEach(f => expect(sw, f).toContain(`'${f}'`));
        });

        check('precache-exists', 'service worker が先に読むファイルが、すべてある', () => {
            const list = read('sw.js').match(/const PRECACHE = \[([\s\S]*?)\]/)[1];
            const files = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
            files.forEach(f => expect(fs.existsSync(path.join(publicDir, f)), f).toBe(true));
        });

        check('manifest', 'manifest に、ホーム画面に置くための項目とアイコンがある', () => {
            const manifest = JSON.parse(read('manifest.webmanifest'));
            ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color'].forEach(key => expect(manifest[key], key).toBeTruthy());
            expect(manifest.icons.some(icon => icon.sizes === '192x192')).toBe(true);
            expect(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true);
            expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
            manifest.icons.forEach(icon => expect(fs.existsSync(path.join(publicDir, icon.src)), icon.src).toBe(true));
        });

        check('html-links', 'index.html が読むアイコンと manifest がある', () => {
            const html = read('index.html');
            const links = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)" href="([^"]+)"/g)].map(m => m[1]);
            expect(links).toEqual(expect.arrayContaining(['favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'manifest.webmanifest']));
            links.forEach(f => expect(fs.existsSync(path.join(publicDir, f)), f).toBe(true));
        });

        check('icon-sizes', 'PNG のアイコンが、書いてある大きさになっている', () => {
            const size = (file) => {
                const buf = fs.readFileSync(path.join(publicDir, file));
                return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
            };
            expect(size('icon-192.png')).toEqual([192, 192]);
            expect(size('icon-512.png')).toEqual([512, 512]);
            expect(size('icon-maskable-512.png')).toEqual([512, 512]);
            expect(size('apple-touch-icon.png')).toEqual([180, 180]);
            expect(size('favicon.png')).toEqual([64, 64]);
        });
    });
}
