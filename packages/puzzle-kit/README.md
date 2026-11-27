# puzzle-kit

論理パズルのゲーム（1つのゲームに1種類のパズル）の共通部品。画面（タイトル・遊ぶ画面・結果・遊び方・記録・オンライン）、1人用の遊び（フリー・今日のパズル・タイムアタック）、オンラインの早解きレースの定義、CPU、テストの道具をまとめている。

ゲームはビルドしないので、画面の部品は各ゲームにコピーして使う（packages/sound・netplay-kit と同じ「コピーして同期」）。ゲームは、パズルの種類1つ（`js/puzzles/<id>/`）と、名前・色・曲などの小さなファイルだけを持つ。

最初のゲームは `games/nonogram`（お絵かきロジック）。新しいゲームは、これを型にして作る（下の「種類をゲームにする」）。

## 構成

| 場所 | 中身 |
|---|---|
| `client/js/main.js` | 画面（タイトル・遊ぶ画面・結果・遊び方・記録・オンライン）。`window.__app` で確かめられる |
| `client/js/session.js` | 1人用の遊びのロジック（`applyCommand`・`replay`・時間とヒントの加算） |
| `client/js/puzzle-set.js` | 問題の組（シードから難しさと問題のシードを決める）と、今日のパズル（日付で決まる、やさしい・ふつう・むずかしいの3問） |
| `client/js/race.js` | オンラインの早解きのロジック |
| `client/js/race-definition.js` | オンライン対戦の定義（netplay-kit）を作る `createRaceDefinition({ GameError })` |
| `client/js/cpu-player.js` | CPU（解き終わる時間）とヒント（`suggest`） |
| `client/js/result-hook.js` | 遊びが終わったときの知らせの入口 `onGameResult(info)`（1問・組・レースが終わるたびに1回）。サイト全体の利用者ごとの記録は、ここだけでつなぐ |
| `client/js/stats.js` | 端末の記録（フリーの最短・タイムアタックの自己ベスト・今日のパズルの連続・オンラインの回数） |
| `client/js/storage.js`・`music.js`・`help.js`・`random.js` | 保存・音・遊び方の中身・シード付きの乱数 |
| `client/js/puzzles/registry.js` | ゲームの種類（`js/game.js` の `type`）を引く。**種類の形の決まりは、このファイルの先頭のコメント** |
| `client/js/puzzles/common/dom.js` | 種類の画面で使う道具（`injectStyle`・`el`・`svg`・`observeSize`・`cellAt`） |
| `client/css/style.css` | 共通の見た目。色は変数で、ゲームの `css/theme.css` が上書きする。種類の画面の道具のボタンは `class="tool"` と `aria-pressed` |
| `scripts/sync.mjs` | 同期（下） |
| `testing.js` | テストの道具（下） |
| `tools/precache.mjs` | sw.js の先読みの一覧を作り直す（ゲームの `npm run sw`） |
| `tools/cpu-match.mjs` | CPU の確かめ（ゲームの `npm run cpu-match`） |
| `tools/icons.mjs` | 絵の SVG 1つから、アイコン一式を作る |

`client/` の下は、同じ並びでゲームの `public/` にコピーされる（`client/js/main.js` → `public/js/main.js`）。

ゲームが持つファイル（コピーしない・同期で確かめない）：

| ファイル | 中身 |
|---|---|
| `public/js/game.js` | `id`（フォルダ名）・`title`・`type`（種類）・`bgm`（曲の名前）と、`STORAGE_PREFIX`（保存の名前の頭） |
| `public/js/puzzles/<id>/` | 種類（`index.js`・`logic.js`・`render.js`） |
| `public/js/online-config.js` | オンラインの接続先（`GAME` と `DEPLOYED_SERVER_URL`） |
| `public/js/sound/bgm.js` | ゲームの曲 |
| `public/css/theme.css` | ゲームの色 |
| `public/index.html`・`manifest.webmanifest`・`sw.js`・アイコン | ページと PWA |
| `server/src/handler.js`・`game-definition.js` | サーバーの入口と定義（`createRaceDefinition` を呼ぶだけ） |

## 同期

```bash
node packages/puzzle-kit/scripts/sync.mjs <ゲーム>            # client/ を public/ にコピーし、puzzle-kit.lock.json を置く
node packages/puzzle-kit/scripts/sync.mjs check <ゲーム>      # 手で直されていないか、今の本体と同じか（違えば終了コード1）
node packages/puzzle-kit/scripts/sync.mjs check --all         # puzzle-kit.lock.json を持つゲームをすべて
```

- 写しは直さない。直すときは `client/` を直して、全ゲームに同期する（`check --all` で確かめる）。同期したら、各ゲームで `npm run sw` を流す
- コピー先が手で直されていたら、同期は止まる（`--force` で上書き）
- 版（package.json の version）は、写しの先頭の1行と lock に入る

## テストの道具

ゲームの `test/` から呼ぶ（`games/nonogram/test/` が見本）。

| 関数 | 確かめること |
|---|---|
| `testPuzzleType(type)` | 種類の共通の決まり：同じシードなら同じ問題・作る時間（この PC で、やさしい 200ms・ふつう 400ms・むずかしい 800ms）・シードと答えを含まない・解は1つ・何も書いていない状態とでたらめに書いた状態から、ヒントで解ける・入力が状態を書き換えない・おかしな状態と入力で投げない |
| `testReplay({ session, puzzleSet })` | 記録から同じ局面・同じ時間になる。`describe('記録からの再現', …)` の中で呼ぶ |
| `testRace({ definition, type, race, session })` | オンラインの早解き。test-kit の `testOnline({ definition })` と一緒に呼ぶ |
| `testPrecache(gameDir)` | sw.js の PRECACHE が public/ のファイルと合っている |

## 種類をゲームにする

`games/puzzle-collection/public/js/puzzles/<id>/` の種類を、`games/<id>/` の1本のゲームにする手順。`<id>` は種類の id（`lightup` など）で、ゲームのフォルダ名・保存の名前の頭・オンラインの名前・音のライブラリの名前に、そのまま使う。web-games の直下で作業する。

**守ること**：直してよいのは `games/<id>/` だけ。puzzle-kit（`packages/puzzle-kit`）・ほかのゲーム・`games/puzzle-collection` は直さない。共通の部分に直しが要るときは、puzzle-kit の担当に伝える。画面の文と注釈は日本語。git の状態を変えるコマンド（add・commit・stash など）は使わない。

### 1. 型からコピーする

```bash
G=<id>
mkdir -p games/$G
rsync -a --exclude node_modules --exclude public/js/puzzles/nonogram --exclude test/logic.test.js games/nonogram/ games/$G/
cp -R games/puzzle-collection/public/js/puzzles/$G games/$G/public/js/puzzles/
```

- 種類のフォルダの import（`../../random.js`・`../common/dom.js`）は、そのまま使える。書き換えない
- 種類が途中（`index.js` か `render.js` がない、契約テストが通らない）なら、`client/js/puzzles/registry.js` の先頭のコメントの形で仕上げる。見本は `games/nonogram/public/js/puzzles/nonogram/`。ないもの（ぬりかべ）は、同じ形で作る

### 2. 名前を差し替える（nonogram・お絵かきロジック → このゲーム）

| ファイル | 直すところ |
|---|---|
| `public/js/game.js` | 種類の import、`id`、`title`、`bgm`（曲の名前）、`STORAGE_PREFIX = '<id>.'` |
| `public/js/online-config.js` | `GAME = '<id>'`、注釈の `?game=` |
| `server/src/handler.js` | `keyPrefix: '<id>'`、注釈の `?game=` |
| `server/src/game-definition.js` | 注釈のゲームの名前 |
| `public/index.html` | `<title>`・`apple-mobile-web-app-title`・`<h1 class="logo">`、タイトルの絵（`#title-art` の SVG。その種類の小さな問題を描く。`var(--accent)` などの変数を使う） |
| `public/manifest.webmanifest` | `name`・`short_name`・`description` |
| `public/sw.js` | `const CACHE = '<id>-v1'`（先読みの一覧は、4 の `npm run sw` で作り直す） |
| `public/css/theme.css` | `--accent`・`--accent-strong`・`--accent-soft`（ほかのパズルのゲームと違う色にする）と注釈 |
| `scripts/cpu-match.mjs` | 注釈の `games/nonogram` |
| `package.json` | `name`、`portal.original`（英語名。例 Light Up）・`portal.aliases`（ひらがなの読みと別名）。`genres: ["パズル"]`・`players: [1, 2, 3, 4]` はそのまま |
| `README.md` | ゲームに合わせて書き直す（`## 遊び方`・`## CPU`・`## オンライン対戦`・`## 開発`・`## 決めたこと`） |
| `test/logic.test.js` | その種類のロジックのテストを書く（生成の大きさ・解き方の要の関数など、数個でよい） |

ほかのテスト（`contract`・`replay`・`online`・`pwa`・`stats`）は、そのまま使える。最後に `grep -rn "nonogram\|お絵かき\|Nonogram" games/$G --exclude-dir=node_modules` で、直し残しがないかを見る（残ってよいものはない）。

### 3. アイコンと曲

- アイコン：その種類の絵を `viewBox="0 0 64 64"` の SVG に描き（背景なし、端から 6 くらいあける）、`node packages/puzzle-kit/tools/icons.mjs $G <絵.svg>` で6つのファイルを作る。小さくしても何のパズルか分かる絵にする。Read で PNG を見る
- 曲：`packages/sound/docs/composing.md` のとおりに1曲書き、`Sound.register('<id>', { songs: { <曲名>: … } })` で登録して、`game.js` の `bgm` に曲名を書く。ほかのパズルのゲームと雰囲気を変える（調・テンポ・楽器）
  - `node packages/sound/tools/lint-songs.mjs games/$G/public/js/sound/bgm.js` で「ぶつかり」「避けたい音」をなくす
  - `node packages/sound/tools/measure.mjs --extra games/$G/public/js/sound/bgm.js --parts --out <作業用のフォルダ>` で、全体を -39 LUFS（±1dB）、パートの差を composing.md の目安に入れる

### 4. 同期する

```bash
node packages/puzzle-kit/scripts/sync.mjs $G
node packages/sound/scripts/sync.mjs $G
node packages/netplay-kit/scripts/sync.mjs games/$G --client-only --allow-dirty
npm run sw -w games/$G
```

### 5. CPU の速さを合わせる

種類の `cpuSecondsPerStep`（ヒント1つ分の手に、ふつうの人がかける秒数）を、`npm run cpu-match -w games/$G` を見て、ふつうの難しさで CPU（ふつう）が 1.5〜3 分になるように決める。ヒントで止まる問題があれば、種類の `hint` を直す。

### 6. 確かめる（すべて終了コード 0）

```bash
npm test -w games/$G
node scripts/standards.mjs --check $G
node packages/puzzle-kit/scripts/sync.mjs check $G
node scripts/layout-check.mjs $G --sizes all
node scripts/online-e2e.mjs $G
npm run cpu-match -w games/$G
```

- 推奨の項目も見る：`node -e "import('./scripts/standards.mjs').then(async m => console.log((await m.evaluateGames('games', ['$G']))[0].results))"` で ✗ がないこと
- 画面を自分の目で見る：`public/` を空いたポート（8080 は使わない。`lsof -nP -iTCP:<port> -sTCP:LISTEN` で確かめる）で配り、タイトル・遊ぶ画面（`?play&difficulty=hard&seed=7`）・結果を、375×548 と 390×664 で撮って Read で見る（web-game-dev の `scripts/screens.mjs`）。むずかしいの盤面が小さすぎないか、数字が重ならないか、ヒントで光るマスが見えるか。立てたサーバーは止める
- 報告：作ったファイル、上の終了コード、cpu-match の結果、画面の画像のパス、直した種類の不具合、決めたこと

## 決めたこと

- 1つのゲームに1種類（パズル集にはしない）。ゲームごとに入口のページのカード・名前・PWA・曲・オンライン・利用者ごとの記録を持つ
- 種類の形（`generate`・`solve`・`check`・`hint`・`applyInput`・`render` など）は、パズル集のときと同じにした。種類のフォルダは、そのまま移せる
- オンラインの解きかけの盤面は `<頭>.race` に保存する（共通のロビーの参加情報 `<ゲーム>.online` と重ならないように）
- 利用者ごとの記録：終わったときの知らせは `result-hook.js` の `onGameResult` の1か所に集める。今は netplay-kit の user-stats につなぎ、1人用は `recordResult`（ライバルがいれば勝ち負け、いなければ回数だけ。同じ問題の組は同じ id）を送る。オンラインは定義の `result` が順位を返し、サーバーが記録するので送らない。共通の記録の形が変わったら `result-hook.js` だけを直す
- 端末の「記録」のダイアログ（`stats.js`）は、このゲームだけの記録で、サイト全体の記録とは別
