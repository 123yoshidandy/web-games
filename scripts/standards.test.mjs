// 標準の判定（scripts/standards.mjs）のテスト
// 使い方: node --test scripts/standards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ITEMS, LEVELS, OK, NG, NA, readDeclarations, evaluateGame, requiredProblems, checkRequired, renderStatus, hasHintButton, exportsSuggest } from './standards.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('docs/standards.md の項目の表が、ITEMS と同じ順・id・名前・分類・段階になっている', () => {
    const doc = readFileSync(join(root, 'docs', 'standards.md'), 'utf8');
    const rows = doc.split('\n')
        .filter((line) => /^\| \d+ \| /.test(line))
        .map((line) => line.split('|').slice(1, 6).map((cell) => cell.trim()));
    assert.deepEqual(rows, ITEMS.map((item, i) => [String(i + 1), item.id, item.name, item.category, item.level]));
    for (const item of ITEMS) {
        assert.ok(LEVELS.includes(item.level), `${item.id} の段階`);
        if (item.requires) assert.ok(ITEMS.findIndex((i) => i.id === item.requires) < ITEMS.indexOf(item), `${item.id} の requires は前にある`);
    }
});

test('宣言は理由付きの skip と orientation: "any" だけを受け付け、ほかは誤りにする', () => {
    assert.deepEqual(readDeclarations({}), { skip: {}, orientation: null, errors: [] });
    assert.deepEqual(readDeclarations({ standards: { skip: { cpu: ' 1人用 ' }, orientation: 'any' } }),
        { skip: { cpu: '1人用' }, orientation: 'any', errors: [] });
    const bad = readDeclarations({ standards: { skip: { cpu: '', nothing: '理由', resume: 1 }, orientation: 'portrait', extra: true } });
    assert.deepEqual(bad.skip, {});
    assert.equal(bad.orientation, null);
    assert.equal(bad.errors.length, 5, bad.errors.join('\n'));
    assert.equal(readDeclarations({ standards: [] }).errors.length, 1);
    assert.equal(readDeclarations({ standards: { skip: ['cpu'] } }).errors.length, 1);
});

test('宣言した項目と、requires の項目が n/a になる前の判定も残し、必須の ✗ と宣言の誤りを --check の問題にする', () => {
    const dir = mkdtempSync(join(tmpdir(), 'standards-'));
    try {
        const make = (name, standards) => {
            const pub = join(dir, name, 'public');
            mkdirSync(join(pub, 'js'), { recursive: true });
            writeFileSync(join(dir, name, 'package.json'), JSON.stringify({
                scripts: { test: 'vitest run' },
                portal: { original: 'A', genres: ['協力'], players: [1] },
                standards
            }));
            writeFileSync(join(pub, 'index.html'), '<section id="screen-title"><a class="portal-link" href="../">← ゲーム一覧</a></section>');
            writeFileSync(join(pub, 'manifest.webmanifest'), JSON.stringify({ name: 'A' }));
            writeFileSync(join(pub, 'js', 'game.js'), 'export const roll = () => Math.random();\nconst seed = Math.random();\n// Math.random は使わない\n');
        };
        make('a', { skip: { cpu: 'CPU の相手がいない', resume: '1回が短い' }, orientation: 'any' });
        make('b', { skip: { replay: '' } });
        mkdirSync(join(dir, 'a', 'test'));
        writeFileSync(join(dir, 'a', 'test', 'pwa.test.js'), "describePwa(dir, { css: ['style.css'] });");
        mkdirSync(join(dir, 'b', 'test'));
        writeFileSync(join(dir, 'b', 'test', 'pwa.test.js'), "describePwa(dir, { pending: ['precache'] });");

        const a = evaluateGame(dir, 'a');
        assert.equal(a.results.orientation, OK, 'standards.orientation: "any" で向きを宣言できる');
        assert.equal(a.results.title, OK);
        assert.equal(a.results['portal-link'], OK);
        assert.deepEqual([a.results.cpu, a.detected.cpu], [NA, NG], '宣言した項目は n/a、判定そのものは detected に残る');
        assert.deepEqual([a.results['cpu-level'], a.results['cpu-match']], [NA, NA], 'cpu が n/a なら CPU の項目も n/a');
        assert.equal(a.results.resume, NA);
        assert.equal(a.results['seeded-rng'], NG, 'seed の行とコメント以外に Math.random がある');
        assert.equal(a.results.rotate, NA, 'landscape でなければ n/a');
        assert.equal(a.results['pwa-test'], OK);
        assert.equal(evaluateGame(dir, 'b').results['pwa-test'], NG, 'pending が残っていれば ✗');

        const problems = requiredProblems([a]);
        assert.ok(problems.includes('a: 必須の「記録と再現」（replay）を満たしていない'));
        assert.ok(!problems.some((p) => /（(cpu|resume|orientation)）/.test(p)), '宣言した項目と満たした項目は出さない');
        assert.ok(!problems.some((p) => /（(hint|undo)）/.test(p)), '推奨とゲームによるは出さない');

        const b = checkRequired(dir, ['b']);
        assert.ok(b.includes('b: standards.skip の「replay」に理由がない（理由を文字列で書く）'));
        assert.ok(b.includes('b: 必須の「記録と再現」（replay）を満たしていない'), '理由のない宣言は効かない');

        const status = renderStatus([a, evaluateGame(dir, 'b')]);
        assert.match(status, /\| a \| cpu \| CPU の相手がいない \| ✗ \|/);
        assert.match(status, /縦横どちらでも遊べる（standards\.orientation: "any"）：a/);
        assert.equal(status, renderStatus([evaluateGame(dir, 'a'), evaluateGame(dir, 'b')]), '同じファイルなら同じ表');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('アシスト（hint）は、id="hint" のボタンと、suggest の export か test/hint.test.js の両方で ✓ にする', () => {
    assert.ok(hasHintButton('<button id="hint" class="icon">'));
    assert.ok(hasHintButton("el('button', { id: 'hint' })"));
    assert.ok(hasHintButton("button.id = 'hint';"));
    assert.ok(hasHintButton('<button class="small icon assist-toggle">'), 'katan の前からの書き方');
    assert.ok(!hasHintButton('<p class="hint">出す資源</p>'), 'CSS の .hint は数えない');
    assert.ok(!hasHintButton('<p>ヒント：おすすめの手</p>'), '文言は数えない');
    assert.ok(!hasHintButton('<div id="hint-text">'));
    assert.ok(exportsSuggest('export function suggest(game, seat) {}'));
    assert.ok(exportsSuggest('export const suggest = (state) => best(state);'));
    assert.ok(exportsSuggest('function suggest() {}\nexport { chooseMove, suggest };'));
    assert.ok(!exportsSuggest('function suggest() {}'));
    assert.ok(!exportsSuggest('// export function suggest() {}'));

    const dir = mkdtempSync(join(tmpdir(), 'standards-hint-'));
    try {
        const make = (name, { html, cpu, hintTest }) => {
            const pub = join(dir, name, 'public');
            mkdirSync(join(pub, 'js'), { recursive: true });
            writeFileSync(join(dir, name, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
            writeFileSync(join(pub, 'index.html'), html);
            if (cpu) writeFileSync(join(pub, 'js', 'cpu-player.js'), cpu);
            if (hintTest) {
                mkdirSync(join(dir, name, 'test'), { recursive: true });
                writeFileSync(join(dir, name, 'test', 'hint.test.js'), "import { suggest } from '../public/js/cpu-player.js';");
            }
        };
        make('button-and-suggest', { html: '<button id="hint">ヒント</button>', cpu: 'export function suggest() {}' });
        make('button-and-test', { html: '<button id="hint">ヒント</button>', hintTest: true });
        make('button-only', { html: '<button id="hint">ヒント</button>', cpu: 'export function chooseMove() {}' });
        make('css-class-only', { html: '<p class="hint">ヒント</p>', cpu: 'export function suggest() {}' });
        const hint = (name) => evaluateGame(dir, name).results.hint;
        assert.equal(hint('button-and-suggest'), OK);
        assert.equal(hint('button-and-test'), OK);
        assert.equal(hint('button-only'), NG);
        assert.equal(hint('css-class-only'), NG);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(evaluateGame(join(root, 'games'), 'katan').results.hint, OK, 'katan の前からのアシストは ✓ のまま');
});
