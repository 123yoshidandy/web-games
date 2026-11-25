import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC = path.join(import.meta.dirname, '..', 'public');

describe('PWA', () => {
    it('service worker が、画面の JS と CSS を全部先に読んでおく', () => {
        const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
        const files = fs.readdirSync(path.join(PUBLIC, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`);
        [...files, 'css/style.css', 'index.html'].forEach(f => expect(sw, f).toContain(`'${f}'`));
    });

    it('manifest のアイコンがある', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
        manifest.icons.forEach(icon => expect(fs.existsSync(path.join(PUBLIC, icon.src)), icon.src).toBe(true));
        ['favicon.svg', 'favicon.png', 'apple-touch-icon.png'].forEach(f => expect(fs.existsSync(path.join(PUBLIC, f)), f).toBe(true));
    });
});
