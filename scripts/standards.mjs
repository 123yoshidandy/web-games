// 全ゲームの完成度をそろえるための標準（docs/standards.md）を、各ゲームが満たしているかをファイルから調べる
// - 判定は静的な文字列の検査（ブラウザで動かして確かめるものではない）。項目の定義と判定の方法は docs/standards.md が元
// - 当てはまらない項目は、ゲームの package.json に理由付きで宣言する（"standards": { "skip": { "<id>": "理由" } }）
// 使い方:
//   node scripts/standards.mjs                     docs/standards-status.md（全ゲーム × 項目の表）を作り直す
//   node scripts/standards.mjs --check [ゲーム…]    必須の項目が欠けていれば一覧を出し、終了コード1（ゲームを省くと全部）
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameMetadata, hasOnlinePlay } from './portal/metadata.mjs';

export const OK = '✓';
export const NG = '✗';
export const NA = 'n/a';

// 段階：必須は --check で落とす。推奨は表で追う。ゲームによるは、当てはまるゲームだけで追う（当てはまらなければ宣言で n/a）
export const LEVELS = ['必須', '推奨', 'ゲームによる'];

// 調べないフォルダ（netplay/ は netplay-kit の写し。サーバー・テスト・道具は公開しない）
const SKIP_DIRS = new Set(['node_modules', 'netplay', 'server', 'test', 'tests', 'scripts', 'tools']);

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const listFiles = (dir, pattern, skip = SKIP_DIRS) => (!existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true })
    .sort(byName)
    .flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return skip.has(entry.name) ? [] : listFiles(path, pattern, skip);
        return pattern.test(entry.name) ? [path] : [];
    }));

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

// sw.js と、sw.js が importScripts で読むファイル（packages/pwa の js/sw-core.js など）をつないだ中身
export const readServiceWorker = (pub) => {
    const sw = readText(join(pub, 'sw.js'));
    const imported = [...sw.matchAll(/importScripts\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => readText(join(pub, m[1])));
    return [sw, ...imported].join('\n');
};

// packages/pwa の写し。ゲームのコードの判定には含めない（ゲームが呼んでいるかは registerServiceWorker( などで見る）
const PWA_COPIES = /\/js\/(pwa\.m?js|sw-core\.js)$/;
const readJson = (path) => {
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
};
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const yes = (ok) => (ok ? OK : NG);
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// ロジックのファイル（画面・起動・絵・演出・保存・CPU 以外）。名前で決めるので、外れることがある
const NOT_LOGIC = /(ui|main|art|motion|view|screen|render|dom|sound|online|controller|storage|anim|effect|cpu|deck-store|shared-deck)/i;

// アシスト（hint）：CSS の .hint や「ヒント」の文言では判定しない（説明の文に多く、誤って ✓ になる）
// id="hint"・id: 'hint'・.id = 'hint' か、katan の class="assist-toggle"
export const hasHintButton = (code) => /\bid\s*[=:]\s*["'`]hint["'`]/.test(code) || /class=["'][^"']*\bassist-toggle\b/.test(code);
export const exportsSuggest = (code) => /export\s+(?:async\s+)?function\s+suggest\s*\(|export\s+(?:const|let)\s+suggest\s*=|export\s*\{[^}]*\bsuggest\b[^}]*\}/.test(stripComments(code));

// 1本のゲームの、判定に使うファイルの中身をまとめて読む
export const gameContext = (gamesDir, game) => {
    const dir = join(gamesDir, game);
    const pub = existsSync(join(dir, 'public')) ? join(dir, 'public') : dir;
    const jsFiles = listFiles(join(pub, 'js'), /\.m?js$/);
    // js/sound/ は共通の音のエンジンの写しと曲のデータ。ゲームのコードの判定には含めない
    const ownJsFiles = jsFiles.filter((file) => !file.includes('/js/sound/') && !PWA_COPIES.test(file));
    const testFiles = ['test', 'tests'].flatMap((name) => listFiles(join(dir, name), /\.m?js$/, new Set(['node_modules'])));
    const pkg = readJson(join(dir, 'package.json')) ?? {};
    const soundDir = join(pub, 'js', 'sound');
    return {
        game,
        dir,
        pub,
        pkg,
        declarations: readDeclarations(pkg),
        jsFiles,
        ownJsFiles,
        js: ownJsFiles.map(readText).join('\n'),
        html: readText(join(pub, 'index.html')),
        css: listFiles(pub, /\.css$/).map(readText).join('\n'),
        manifest: readJson(join(pub, 'manifest.webmanifest')),
        sw: readServiceWorker(pub),
        readme: readText(join(dir, 'README.md')),
        testFiles,
        tests: testFiles.map(readText).join('\n'),
        cpuFiles: ownJsFiles.filter((file) => /^cpu[^/]*\.m?js$/.test(basename(file))),
        logicFiles: ownJsFiles.filter((file) => !NOT_LOGIC.test(basename(file))),
        soundFiles: existsSync(soundDir) ? readdirSync(soundDir).sort() : [],
        meta: gameMetadata(gamesDir, game)
    };
};

// 項目。並びは docs/standards.md の表と同じ。requires の項目が n/a なら、この項目も n/a にする
export const ITEMS = [
    // ---- PWA
    {
        id: 'manifest', name: 'manifest の必須項目', category: 'PWA', level: '必須',
        check: (c) => {
            const m = c.manifest;
            if (!m) return NG;
            const icons = Array.isArray(m.icons) ? m.icons : [];
            return yes(['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'lang'].every((key) => m[key])
                && icons.some((i) => i.sizes === '192x192')
                && icons.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any').includes('any'))
                && icons.some((i) => (i.purpose ?? '').includes('maskable')));
        }
    },
    {
        id: 'orientation', name: '向きの宣言', category: 'スマホ', level: '必須',
        check: (c) => yes(['portrait', 'landscape', 'any'].includes(c.manifest?.orientation) || c.declarations.orientation === 'any')
    },
    {
        id: 'icons', name: 'アイコン一式', category: 'PWA', level: '必須',
        check: (c) => yes(['favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
            .every((file) => existsSync(join(c.pub, file)))
            && /rel="apple-touch-icon"/.test(c.html) && /rel="manifest"/.test(c.html))
    },
    {
        id: 'sw', name: 'service worker の先読み', category: 'PWA', level: '必須',
        check: (c) => {
            const precache = c.sw.match(/const PRECACHE = \[([\s\S]*?)\]/)?.[1];
            if (!precache || !/const CACHE = '/.test(c.sw)) return NG;
            const listed = new Set([...precache.matchAll(/'([^']+)'/g)].map((m) => m[1]));
            const missing = [...listed].some((file) => file !== './' && !existsSync(join(c.pub, file)));
            const jsListed = c.jsFiles.every((file) => listed.has(file.slice(c.pub.length + 1)));
            return yes(!missing && jsListed);
        }
    },
    {
        id: 'sw-register', name: 'service worker の登録', category: 'PWA', level: '必須',
        check: (c) => yes(/serviceWorker\.register|registerServiceWorker\(/.test(c.js + c.html))
    },
    {
        id: 'pwa-test', name: 'PWA のテスト', category: '品質', level: '必須',
        // pending（まだ満たさない検査を it.todo にする）が空でなければ、PWA のテストを通しきっていない
        check: (c) => yes(/describePwa/.test(c.tests) && !/pending\s*:\s*\[\s*['"]/.test(c.tests))
    },
    {
        id: 'offline-font', name: '字体のオフライン', category: 'PWA', level: '推奨',
        check: (c) => (/fonts\.googleapis/.test(c.html) ? yes(/FONT_HOSTS|fonts\.gstatic/.test(c.sw)) : NA)
    },
    // ---- 画面の流れ
    {
        id: 'portal-link', name: 'ゲーム一覧へのリンク', category: '画面の流れ', level: '必須',
        check: (c) => yes(/class="[^"]*\bportal-link\b[^"]*"[^>]*href="\.\.\/"|href="\.\.\/"[^>]*class="[^"]*\bportal-link\b/.test(c.html + c.js))
    },
    {
        id: 'title', name: 'タイトル画面', category: '画面の流れ', level: '必須',
        check: (c) => yes(/id="(screen-title|title-screen|screen-setup|topScreen)"|class="[^"]*\btitle-screen\b|function showTitle\b/.test(c.html + c.js))
    },
    {
        id: 'help', name: '遊び方', category: '画面の流れ', level: '必須',
        check: (c) => {
            if (/id="open-help-title"/.test(c.html) && /id="open-help-game"/.test(c.html)) return OK;
            const triggers = [...(c.html + c.js).matchAll(/<(button|a)\b[^>]*>[\s\S]*?<\/\1>/g)]
                .filter(([tag]) => /遊び方|ルール/.test(tag) && !/class="[^"]*close/.test(tag));
            return yes(triggers.length >= 2);
        }
    },
    {
        id: 'home', name: 'タイトルへ戻る', category: '画面の流れ', level: '必須',
        check: (c) => yes(/id="home|aria-label="[^"]*(ホーム|タイトル|メニュー)|data-action="(home|title|menu)"|>ホーム|ホームに戻る|タイトルへ|タイトルに戻る/.test(c.html + c.js))
    },
    {
        id: 'result', name: '結果と「もう一度」', category: '画面の流れ', level: '推奨',
        check: (c) => yes(/もう一度|もう1回|もういちど|再戦|同じ設定で|新しい対局|次の対局|新しいゲーム/.test(c.html + c.js))
    },
    {
        id: 'resume', name: '続きから', category: '遊び', level: '必須',
        check: (c) => yes(/続きから/.test(c.html + c.js))
    },
    // ---- 音
    {
        id: 'bgm', name: 'BGM と効果音', category: '音', level: '必須',
        check: (c) => yes(c.soundFiles.some((file) => /^engine\.m?js$/.test(file)) && c.soundFiles.includes('bgm.js')
            && /createPlayer\(/.test(c.js))
    },
    {
        id: 'sound-toggle', name: '音の ON/OFF', category: '音', level: '必須',
        check: (c) => {
            // sound-toggle（BGM と効果音をまとめて切り替える）が今の名前。移す途中は、前の bgm-toggle も認める
            if (/class="[^"]*\b(sound|bgm)-toggle\b/.test(c.html + c.js)) return OK;
            // 独自の音（js/sound.js）のゲームは、BGM と効果音の切り替えを自前の作りで持つ
            const ownSound = c.ownJsFiles.some((file) => basename(file) === 'sound.js');
            return yes(ownSound && /BGM/.test(c.html + c.js) && /効果音/.test(c.html + c.js)
                && /aria-pressed|sound-toggle|label: 'BGM'/.test(c.html + c.js));
        }
    },
    // ---- 遊び
    {
        id: 'cpu', name: 'CPU 対戦', category: '遊び', level: 'ゲームによる',
        check: (c) => yes(c.cpuFiles.length > 0)
    },
    {
        id: 'cpu-level', name: 'CPU の強さ', category: '遊び', level: '推奨', requires: 'cpu',
        check: (c) => yes(/data-level|level-select|id="level|name="level|やさしい|つよい|強さ/.test(c.html + c.js))
    },
    {
        id: 'seeded-rng', name: 'シード付きの乱数', category: '遊び', level: '必須',
        check: (c) => yes(!c.logicFiles.some((file) => stripComments(readText(file)).split('\n')
            .some((line) => /Math\.random/.test(line) && !/seed/i.test(line))))
    },
    {
        id: 'cpu-rng', name: 'CPU の乱数も決定的', category: '遊び', level: '推奨', requires: 'cpu',
        check: (c) => (c.cpuFiles.length === 0 ? NA
            : yes(!c.cpuFiles.some((file) => /=\s*Math\.random\b|Math\.random\(\)/.test(stripComments(readText(file))))))
    },
    {
        id: 'replay', name: '記録と再現', category: '遊び', level: '必須',
        check: (c) => yes(/applyCommand|dispatch\(/.test(c.js) && /replay/i.test(c.js))
    },
    {
        id: 'replay-test', name: '再現のテスト', category: '品質', level: '必須', requires: 'replay',
        check: (c) => yes(/replay|再現/i.test(c.tests))
    },
    {
        id: 'log', name: '履歴', category: '遊び', level: '推奨',
        check: (c) => yes(/id="log|id="history|履歴|ログ|棋譜/.test(c.html + c.js))
    },
    {
        id: 'undo', name: '待った', category: '遊び', level: 'ゲームによる',
        check: (c) => yes(/待った|一手戻|1手戻|undo\(/i.test(c.html + c.js))
    },
    {
        id: 'hint', name: 'アシスト', category: '遊び', level: '推奨',
        // ボタン（id="hint"。katan の前からの assist-toggle も認める）と、おすすめを出す中身（CPU のファイルの suggest か、test/hint.test.js）の両方
        check: (c) => yes(hasHintButton(c.html + '\n' + c.js)
            && (c.cpuFiles.some((file) => exportsSuggest(readText(file))) || c.testFiles.some((file) => /[/\\]hint\.test\.m?js$/.test(file))))
    },
    {
        id: 'debug-hook', name: '確かめる口', category: '品質', level: '推奨',
        check: (c) => yes(/window\.__app/.test(c.js))
    },
    // ---- オンライン
    {
        id: 'game-definition', name: 'オンラインの定義', category: 'オンライン', level: '推奨',
        check: (c) => yes(existsSync(join(c.dir, 'server', 'src', 'game-definition.js')))
    },
    {
        id: 'game-definition-test', name: '定義のテスト', category: 'オンライン', level: '推奨', requires: 'game-definition',
        check: (c) => (!existsSync(join(c.dir, 'server', 'src', 'game-definition.js')) ? NA
            : yes(c.testFiles.some((file) => /game-definition/.test(file)) || /game-definition/.test(c.tests)))
    },
    {
        id: 'online', name: 'オンライン対戦', category: 'オンライン', level: 'ゲームによる',
        check: (c) => yes(hasOnlinePlay(c.dir, c.pub))
    },
    // ---- スマホ
    {
        id: 'no-zoom', name: 'ズームの無効化', category: 'スマホ', level: '必須',
        check: (c) => yes(/user-scalable=no/.test(c.html) && /gesturestart|preventZoom\(/.test(c.js + c.html))
    },
    {
        id: 'touch-css', name: 'タッチの CSS', category: 'スマホ', level: '必須',
        check: (c) => yes([/touch-action/, /overscroll-behavior/, /\d+dvh/, /safe-area-inset/].every((re) => re.test(c.css + c.html)) && /viewport-fit=cover/.test(c.html))
    },
    {
        id: 'reduced-motion', name: '動きを減らす', category: 'スマホ', level: '推奨',
        check: (c) => yes(/prefers-reduced-motion/.test(c.css + c.js))
    },
    {
        id: 'rotate', name: '縦持ちで横のゲーム', category: 'スマホ', level: 'ゲームによる',
        check: (c) => (c.manifest?.orientation !== 'landscape' ? NA : yes(/orientation:\s*portrait/.test(c.css) || /orientation\.lock/.test(c.js)))
    },
    // ---- 品質
    {
        id: 'tests', name: 'テスト', category: '品質', level: '必須',
        check: (c) => yes(/vitest/.test(c.pkg.scripts?.test ?? '') && c.testFiles.length > 0)
    },
    {
        id: 'cpu-match', name: 'CPU 同士の対戦', category: '品質', level: '推奨', requires: 'cpu',
        check: (c) => yes([['scripts', 'cpu-match.mjs'], ['scripts', 'cpu-sim.mjs'], ['tools', 'cpu-bench.mjs']]
            .some((path) => existsSync(join(c.dir, ...path))))
    },
    {
        id: 'readme', name: 'README の節', category: '品質', level: '推奨',
        check: (c) => {
            const headings = [...c.readme.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
            const rules = headings.some((h) => /遊び方|ルール|遊ぶ/.test(h));
            const cpu = 'cpu' in c.declarations.skip || headings.some((h) => /CPU/.test(h));
            const dev = headings.some((h) => /開発|テスト|構成|ファイル/.test(h));
            return yes(rules && cpu && dev);
        }
    },
    // ---- 情報
    {
        id: 'portal-meta', name: '入口のページの情報', category: '情報', level: '必須',
        check: (c) => yes(c.meta.errors.length === 0)
    },
    {
        id: 'storage-prefix', name: '保存の名前', category: '情報', level: '必須',
        check: (c) => {
            const text = c.jsFiles.map(readText).join('\n') + c.html;
            if (!/localStorage/.test(text)) return NA;
            const prefixes = new Set([...text.matchAll(/['"`]([A-Za-z][\w-]*)[.:](?:save|settings|level|online|sound|bgm|setup|name|progress|decks)\b/g)].map((m) => m[1]));
            const constPrefix = text.match(/PREFIX\s*=\s*['"]([A-Za-z][\w-]*)[.:]['"]/)?.[1];
            if (constPrefix) prefixes.add(constPrefix);
            return yes(prefixes.size === 1);
        }
    },
    {
        id: 'names-match', name: '名前と色の一致', category: '情報', level: '推奨',
        check: (c) => {
            const m = c.manifest;
            if (!m) return NG;
            const theme = c.html.match(/<meta name="theme-color" content="([^"]+)"/)?.[1];
            const appTitle = c.html.match(/<meta name="apple-mobile-web-app-title" content="([^"]+)"/)?.[1];
            const title = c.html.match(/<title>([^<]*)<\/title>/)?.[1];
            return yes(theme?.toLowerCase() === m.theme_color?.toLowerCase()
                && (appTitle ?? m.short_name) === m.short_name
                && Boolean(title) && (title === m.name || title.includes(m.short_name)));
        }
    },
    {
        id: 'effects', name: '効果音', category: '音', level: '推奨',
        check: (c) => {
            // 独自の音（js/sound.js）のゲームは、効果音も自前で持つ
            if (c.ownJsFiles.some((file) => basename(file) === 'sound.js')) return OK;
            return yes(/\.play\(\s*['"](select|place|capture|cancel|error|turn|notify|dice|draw|shuffle|gain|pay|win|lose)['"]/.test(c.js));
        }
    }
];

const ITEM_IDS = new Set(ITEMS.map((item) => item.id));

// package.json の "standards" を読む。形の誤りは errors に入れる（--check で落とす）
// 例: "standards": { "skip": { "resume": "リアルタイムで、途中で止めない" }, "orientation": "any" }
export const readDeclarations = (pkg) => {
    const declared = pkg?.standards;
    const result = { skip: {}, orientation: null, errors: [] };
    if (declared === undefined) return result;
    if (!isObject(declared)) {
        result.errors.push('package.json の standards は { "skip": { "<項目の id>": "理由" }, "orientation": "any" } の形で書く');
        return result;
    }
    for (const key of Object.keys(declared)) {
        if (!['skip', 'orientation'].includes(key)) result.errors.push(`standards.${key} は決めた欄にない（skip・orientation だけ）`);
    }
    if (declared.skip !== undefined && !isObject(declared.skip)) {
        result.errors.push('standards.skip は { "<項目の id>": "理由" } の形で書く');
    } else {
        for (const [id, reason] of Object.entries(declared.skip ?? {})) {
            if (!ITEM_IDS.has(id)) result.errors.push(`standards.skip の「${id}」は標準の項目にない（docs/standards.md）`);
            else if (typeof reason !== 'string' || !reason.trim()) result.errors.push(`standards.skip の「${id}」に理由がない（理由を文字列で書く）`);
            else result.skip[id] = reason.trim();
        }
    }
    if (declared.orientation !== undefined) {
        if (declared.orientation === 'any') result.orientation = 'any';
        else result.errors.push('standards.orientation に書けるのは "any"（縦横どちらでも遊べる）だけ。縦か横に決めるなら manifest の orientation に書く');
    }
    return result;
};

// 1本のゲームを判定する。results は宣言を反映した値、detected は宣言を除いた判定そのもの
export const evaluateGame = (gamesDir, game) => {
    const c = gameContext(gamesDir, game);
    const results = {};
    const detected = {};
    for (const item of ITEMS) {
        let value;
        try {
            value = item.check(c);
        } catch {
            value = NG;
        }
        detected[item.id] = value;
        if (item.id in c.declarations.skip || (item.requires && results[item.requires] === NA)) results[item.id] = NA;
        else results[item.id] = value;
    }
    const { skip, orientation, errors } = c.declarations;
    return { game, results, detected, skip, orientation, errors };
};

export const listGames = (gamesDir) => readdirSync(gamesDir)
    .filter((name) => existsSync(join(gamesDir, name, 'package.json')))
    .sort();

export const evaluateGames = (gamesDir, games = listGames(gamesDir)) => games.map((game) => evaluateGame(gamesDir, game));

// 必須の項目が欠けている点と、宣言の誤りを、1行ずつの文で返す（空なら問題なし）
export const requiredProblems = (evaluations) => evaluations.flatMap(({ game, results, errors }) => [
    ...errors.map((error) => `${game}: ${error}`),
    ...ITEMS.filter((item) => item.level === '必須' && results[item.id] === NG)
        .map((item) => `${game}: 必須の「${item.name}」（${item.id}）を満たしていない`)
]);

export const checkRequired = (gamesDir, games) => requiredProblems(evaluateGames(gamesDir, games));

// ---- docs/standards-status.md の組み立て

const gapsOf = (evaluation, level) => ITEMS.filter((item) => item.level === level && evaluation.results[item.id] === NG).map((item) => item.id);
const countOf = (evaluations, id, value) => evaluations.filter((e) => e.results[id] === value).length;

export const renderStatus = (evaluations) => {
    const total = evaluations.length;
    const lines = [];
    const push = (...rows) => lines.push(...rows);
    const fullRequired = evaluations.filter((e) => gapsOf(e, '必須').length === 0 && e.errors.length === 0).length;

    push(
        '# 標準の達成状況',
        '',
        '`node scripts/standards.mjs` で作る表です（手で直さない）。項目の定義・判定の方法・宣言の書き方は [standards.md](standards.md) にあります。',
        '',
        `- ✓：満たしている／✗：満たしていない／n/a：当てはまらない（ゲームの package.json の宣言か、判定の条件で決まる）`,
        '- 判定はファイルの文字列を見るだけなので、誤ることがあります。誤りに気づいたら、判定（scripts/standards.mjs）か宣言を直します',
        '',
        '## 要約',
        '',
        `- ゲーム：${total} 本、項目：${ITEMS.length}（${LEVELS.map((level) => `${level} ${ITEMS.filter((i) => i.level === level).length}`).join('・')}）`,
        `- 必須をすべて満たすゲーム：${fullRequired} 本`,
        `- 必須の ✗：${evaluations.reduce((n, e) => n + gapsOf(e, '必須').length, 0)} 件／推奨の ✗：${evaluations.reduce((n, e) => n + gapsOf(e, '推奨').length, 0)} 件／ゲームによるの ✗：${evaluations.reduce((n, e) => n + gapsOf(e, 'ゲームによる').length, 0)} 件`
    );
    const declarationErrors = evaluations.flatMap((e) => e.errors.map((error) => `${e.game}: ${error}`));
    if (declarationErrors.length > 0) push(`- 宣言の誤り：${declarationErrors.length} 件（下の「宣言」の節）`);

    push('', '## 項目ごと', '', '段階の順、同じ段階では ✗ の多い順。✗ が半分を超える項目は、✗ でないゲームを書きます。', '',
        '| # | id | 項目 | 段階 | ✓ | ✗ | n/a | ✗ のゲーム |', '|--:|---|---|---|--:|--:|--:|---|');
    const numbered = ITEMS.map((item, index) => ({ item, number: index + 1 }));
    const ordered = [...numbered].sort((a, b) => LEVELS.indexOf(a.item.level) - LEVELS.indexOf(b.item.level)
        || countOf(evaluations, b.item.id, NG) - countOf(evaluations, a.item.id, NG) || a.number - b.number);
    for (const { item, number } of ordered) {
        const failing = evaluations.filter((e) => e.results[item.id] === NG).map((e) => e.game);
        const others = evaluations.filter((e) => e.results[item.id] !== NG).map((e) => e.game);
        const list = failing.length === 0 ? '—'
            : failing.length > total / 2 ? `次の ${others.length} 本以外すべて：${others.join(', ') || '—'}`
                : failing.join(', ');
        push(`| ${number} | ${item.id} | ${item.name} | ${item.level} | ${countOf(evaluations, item.id, OK)} | ${failing.length} | ${countOf(evaluations, item.id, NA)} | ${list} |`);
    }

    push('', '## ゲームごと', '', '必須の ✗ の多い順。✗ がないゲームは載せません。', '',
        '| ゲーム | 必須の ✗ | 推奨の ✗ | ゲームによるの ✗ |', '|---|---|---|---|');
    const ranked = evaluations
        .map((e) => ({ game: e.game, gaps: LEVELS.map((level) => gapsOf(e, level)) }))
        .filter(({ gaps }) => gaps.some((g) => g.length > 0))
        .sort((a, b) => b.gaps[0].length - a.gaps[0].length || b.gaps[1].length - a.gaps[1].length
            || (a.game < b.game ? -1 : 1));
    for (const { game, gaps } of ranked) {
        push(`| ${game} | ${gaps.map((g) => (g.length ? `${g.length}：${g.join('・')}` : '—')).join(' | ')} |`);
    }

    push('', '## 宣言', '', '各ゲームの package.json の `standards` に書いた、当てはまらない項目と理由。「判定」は、宣言がなかったときの判定です（✓ なら宣言はいらないかもしれない）。', '');
    const declared = evaluations.flatMap((e) => Object.entries(e.skip).map(([id, reason]) => ({ game: e.game, id, reason, detected: e.detected[id] })));
    if (declared.length === 0) push('（宣言はない）');
    else {
        push('| ゲーム | id | 理由 | 判定 |', '|---|---|---|:-:|');
        for (const d of declared) push(`| ${d.game} | ${d.id} | ${d.reason} | ${d.detected} |`);
    }
    const anyOrientation = evaluations.filter((e) => e.orientation === 'any').map((e) => e.game);
    if (anyOrientation.length > 0) push('', `縦横どちらでも遊べる（standards.orientation: "any"）：${anyOrientation.join(', ')}`);
    if (declarationErrors.length > 0) push('', '宣言の誤り：', '', ...declarationErrors.map((error) => `- ${error}`));

    push('', '## 全体の表', '', '列の番号は「項目ごと」の # と同じ。', '',
        `| ゲーム | ${numbered.map(({ number }) => number).join(' | ')} |`,
        `|---|${numbered.map(() => ':-:').join('|')}|`);
    for (const e of evaluations) push(`| ${e.game} | ${ITEMS.map((item) => e.results[item.id]).join(' | ')} |`);
    push('');
    return lines.join('\n');
};

const main = () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const gamesDir = join(root, 'games');
    const args = process.argv.slice(2);
    if (args[0] === '--check') {
        const games = args.slice(1);
        const unknown = games.filter((game) => !existsSync(join(gamesDir, game, 'package.json')));
        if (unknown.length > 0) {
            console.error(`ゲームがない：${unknown.join(', ')}`);
            process.exit(1);
        }
        const targets = games.length > 0 ? games : listGames(gamesDir);
        const problems = checkRequired(gamesDir, targets);
        if (problems.length > 0) {
            console.error(problems.join('\n'));
            console.error(`必須の項目に ${problems.length} 件の問題がある（docs/standards.md）`);
            process.exit(1);
        }
        console.log(`${targets.length} 本とも、標準の必須の項目を満たしています`);
        return;
    }
    if (args.length > 0) {
        console.error('使い方: node scripts/standards.mjs [--check [ゲーム…]]');
        process.exit(1);
    }
    const evaluations = evaluateGames(gamesDir);
    writeFileSync(join(root, 'docs', 'standards-status.md'), renderStatus(evaluations));
    console.log(`docs/standards-status.md を作りました（${evaluations.length} 本 × ${ITEMS.length} 項目）`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
