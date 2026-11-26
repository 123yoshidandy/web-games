# ゲームの標準

web-games のゲームは、作った時期と作りがまちまちで、同じ「完成」でも備えているものが違う。この文書は、どのゲームも備えるものを1か所で決める。項目の定義の元はこの文書で、判定は `scripts/standards.mjs`、今の達成状況は [standards-status.md](standards-status.md)（スクリプトが作る）にある。

## 段階

| 段階 | 意味 | 扱い |
|---|---|---|
| 必須 | どのゲームも備える | `node scripts/standards.mjs --check` で落とす。`scripts/check-games.mjs` からも呼ぶので、CI（test.yml）でも落ちる（公開の pages.yml は `--skip-standards` で省き、止めない）。当てはまらないときは、理由を書いて宣言する |
| 推奨 | 備えるのがよい | 表に出して、順に直していく。落とさない |
| ゲームによる | 当てはまるゲームだけが備える | 表に出す。当てはまらないゲームは宣言で n/a にする（宣言がなければ ✗ のまま表に出る）。落とさない |

項目を足したり段階を変えたりするときは、この文書の表と `scripts/standards.mjs` の `ITEMS` を一緒に直す（`scripts/standards.test.mjs` が、id・名前・段階の食い違いを見つける）。

## 当てはまらない項目の宣言

ゲームの `package.json` に `standards` の欄を書く。入口のページの情報（`portal`）とは分ける。

```json
"standards": {
  "skip": { "resume": "リアルタイムの落ち物パズルで、途中で止めて後から続ける遊び方をしない" },
  "orientation": "any"
}
```

- `skip`：当てはまらない項目の id と、その理由。理由の文字列は必ず書く（空や文字列でないものは誤りとして `--check` で落とす）
- `orientation`：縦横どちらでも遊べるゲームが、`"any"` と書く。manifest の `orientation`（portrait / landscape）の代わりになる。縦か横に決まるなら manifest に書き、ここには書かない
- 決めた欄（`skip`・`orientation`）以外や、標準にない項目の id は誤りとして落とす
- 足りないものを隠すために宣言しない。「作っていない」は ✗ のままにして直す
- `requires` のある項目（下の表の「判定の方法」に「◯◯ が n/a なら n/a」と書いたもの）は、もとの項目を宣言すれば自動で n/a になる。たとえば `cpu` を宣言すれば、`cpu-level`・`cpu-rng`・`cpu-match` も n/a になる
- 宣言がなくても、判定の条件で n/a になる項目がある（Google Fonts を使わないゲームの `offline-font`、landscape でないゲームの `rotate` など。表に書いた）

今の宣言の一覧は [standards-status.md](standards-status.md) の「宣言」の節にある。宣言と一緒に、宣言がなかったときの判定も出すので、✓ になっている宣言は外せる。

例外として決めているもの：

- **独自の音**：lucky-numbers・mine-blocks・panel-de-pon は、自前の BGM と効果音（`js/sound.js`）を持ち、共通の音のエンジン（`packages/sound`）は使わない（`packages/sound/README.md`）。`bgm` を宣言で n/a にする。音の ON/OFF（`sound-toggle`）は自前の作りでも備え、判定もそれを認める
- **リアルタイム**：panel-de-pon は、`resume`・`replay`（と `replay-test`）・`undo` を n/a にする
- **CPU のいないパズル**：mine-blocks・wordle は、1人で解くパズルで、競う相手はオンラインの人だけ。`cpu`（と CPU の項目）と、問題と入力がそのまま局面になるので `replay`（と `replay-test`）を n/a にする

## 項目

「判定の方法」は `scripts/standards.mjs` がしていること。判定はファイルの文字列を見るだけなので、誤ることがある。**要統一** は、書き方がゲームによって揺れていて判定が確かでない項目で、そろえる書き方を下の「要統一の決まり」に書いた。今はまだ各ゲームをそろえていないので、判定は今ある書き方を広く認めている。そろえ終えたら、判定を決まりの書き方だけに絞る。

公開するフォルダ（`<公開>`）は、`public/` があればそこ、なければゲームのフォルダ（mine-blocks・panel-de-pon・wordle）。

| # | id | 名前 | 分類 | 段階 | 定義 | 判定の方法 |
|--:|---|---|---|---|---|---|
| 1 | manifest | manifest の必須項目 | PWA | 必須 | `manifest.webmanifest` に name・short_name・start_url・scope・display・background_color・theme_color・lang と、192・512（any）・maskable のアイコンがある | manifest を JSON で読む |
| 2 | orientation | 向きの宣言 | スマホ | 必須 | 縦向き・横向き・どちらでもよい、のどれかを宣言している | manifest の `orientation` が portrait・landscape・any か、`standards.orientation` が `"any"` |
| 3 | icons | アイコン一式 | PWA | 必須 | `favicon.svg`・`favicon.png`・`apple-touch-icon.png`・`icon-192.png`・`icon-512.png`・`icon-maskable-512.png` が `<公開>` の直下にあり、index.html が読む | ファイルの有無と `rel="apple-touch-icon"`・`rel="manifest"`。大きさは describePwa が見る |
| 4 | sw | service worker の先読み | PWA | 必須 | `sw.js` に `const CACHE` と `const PRECACHE` があり、先読みのファイルがすべてあり、`js/` の下の JS（netplay-kit の写しを除く。音のエンジンと曲は含む）をすべて先読みする | `sw.js` の正規表現とファイルの有無。キャッシュの名前の重なりと、ほかのゲームのキャッシュを消さないことは check-games.mjs が見る |
| 5 | sw-register | service worker の登録 | PWA | 必須 | 起動のときに service worker を登録する | JS・HTML の `serviceWorker.register` |
| 6 | pwa-test | PWA のテスト | 品質 | 必須 | テストで `describePwa`（packages/test-kit）を呼び、すべての検査を通す | テストの `describePwa` があり、`pending: [...]`（まだ満たさない検査を it.todo にする）が空。**要統一** |
| 7 | offline-font | 字体のオフライン | PWA | 推奨 | Google Fonts を読むなら、`sw.js` がその字体をキャッシュする | index.html の `fonts.googleapis` と、sw.js の `FONT_HOSTS`・`fonts.gstatic`。Google Fonts を読まなければ n/a |
| 8 | portal-link | ゲーム一覧へのリンク | 画面の流れ | 必須 | タイトル画面に `<a class="portal-link" href="../">← ゲーム一覧</a>` がある（JS で作ってもよい） | HTML と JS の `class="…portal-link…"` と `href="../"`。タイトル画面の中にあるかまでは見ない |
| 9 | title | タイトル画面 | 画面の流れ | 必須 | 設定（人数・強さなど）を選んで始める画面がある | `id="screen-title"`、前からの書き方の `id="title-screen"`・`id="screen-setup"`・`id="topScreen"`・`class="title-screen"`・`function showTitle`（HTML と JS）。**要統一** |
| 10 | help | 遊び方 | 画面の流れ | 必須 | 遊び方を、タイトル画面とプレイ中の両方から開ける | `id="open-help-title"` と `id="open-help-game"` の両方か、「遊び方」「ルール」を含む button・a が2つ以上（HTML と JS）。**要統一** |
| 11 | home | タイトルへ戻る | 画面の流れ | 必須 | プレイ中からタイトル画面へ戻れる | `id="home…"`・aria-label の「ホーム」「タイトル」「メニュー」・「ホームに戻る」「タイトルへ」など。**要統一** |
| 12 | result | 結果と「もう一度」 | 画面の流れ | 推奨 | 終局で結果を出し、同じ設定で再戦できる | 「もう一度」「再戦」「新しい対局」などの文言 |
| 13 | resume | 続きから | 遊び | 必須 | 途中経過を保存し、タイトル画面から「続きから」で再開できる | 「続きから」の文言 |
| 14 | bgm | BGM と効果音 | 音 | 必須 | 共通の音のエンジンの写し（`js/sound/engine.js`・`engine.mjs`）と、ゲームの曲（`js/sound/bgm.js`）があり、`Sound.createPlayer` で鳴らす | `<公開>/js/sound/` の `engine.(m)js` と `bgm.js`、ゲームのコード（`js/sound/` の外）の `createPlayer(`。写しが元と同じかは check-games.mjs が見る |
| 15 | sound-toggle | 音の ON/OFF | 音 | 必須 | 画面に BGM（と効果音）の ON/OFF のボタンがあり、設定を保存する | `class="bgm-toggle"`（HTML と JS）。独自の音（`js/sound.js`）のゲームは、「BGM」「効果音」の切り替え（`aria-pressed` など）。**要統一** |
| 16 | cpu | CPU 対戦 | 遊び | ゲームによる | 人が足りなくても CPU と遊べる | `js/` の下の `cpu*.js` の有無 |
| 17 | cpu-level | CPU の強さ | 遊び | 推奨 | タイトル画面で CPU の強さを選べる | `data-level`・`level-select`・「やさしい」「強さ」など。`cpu` が n/a なら n/a |
| 18 | seeded-rng | シード付きの乱数 | 遊び | 必須 | ロジック（ルール・状態の更新）は、シード付きの乱数だけを使う。`Math.random` はシードを決めるときだけ | ロジックのファイル（名前に ui・main・view・render・sound・online・storage・cpu などを含まないもの）で、`seed` を含まない行に `Math.random` がない（コメントは除く）。ファイルの名前で決めるので外れうる |
| 19 | cpu-rng | CPU の乱数も決定的 | 遊び | 推奨 | CPU の迷い（`rand = Math.random` の既定）にも、シード付きの乱数を渡す | `cpu*.js` に `= Math.random`・`Math.random()` がない（コメントは除く）。`cpu` が n/a なら n/a |
| 20 | replay | 記録と再現 | 遊び | 必須 | 操作を `applyCommand` に通して記録し、記録から同じ局面を再現できる | JS の `applyCommand`（か `dispatch(`）と `replay` |
| 21 | replay-test | 再現のテスト | 品質 | 必須 | 記録から同じ局面になることを、テストで確かめる | テストの `replay`・「再現」。`replay` が n/a なら n/a。**要統一** |
| 22 | log | 履歴 | 遊び | 推奨 | 何が起きたかを見られる（ログ・棋譜） | `id="log"`・`id="history"`・「履歴」「ログ」「棋譜」 |
| 23 | undo | 待った | 遊び | ゲームによる | 1手戻せる。隠れた情報や乱数で、戻すと有利になるゲームには当てはまらない | 「待った」「1手戻」・`undo(` |
| 24 | hint | アシスト | 遊び | 推奨 | おすすめの手・ヒントを出せる | ボタンの `id="hint"`（HTML と JS。katan の `class="assist-toggle"` も認める）と、CPU のファイル（`cpu*.js`）の `suggest` の export か `test/hint.test.js` の両方。CSS の `.hint` や「ヒント」の文言は数えない。**要統一** |
| 25 | debug-hook | 確かめる口 | 品質 | 推奨 | `window.__app` から状態を見られる（ヘッドレス Chrome での確認に使う） | JS の `window.__app` |
| 26 | game-definition | オンラインの定義 | オンライン | 推奨 | netplay-kit の「ゲームの定義」（`server/src/game-definition.js`）がある | ファイルの有無 |
| 27 | game-definition-test | 定義のテスト | オンライン | 推奨 | 定義を通して遊べることを、テストで確かめる | テストのファイル名か中身の `game-definition`。`game-definition` が n/a か、定義がなければ n/a |
| 28 | online | オンライン対戦 | オンライン | ゲームによる | 画面からオンライン対戦ができる（画面側の netplay-kit の写しとサーバーがある） | `<公開>/js/netplay/` と `server/src/handler.js` の両方（入口のページの「オンライン」の絞り込みと同じ。`scripts/portal/metadata.mjs` の `hasOnlinePlay`） |
| 29 | no-zoom | ズームの無効化 | スマホ | 必須 | ピンチやダブルタップで画面が拡大しない | viewport の `user-scalable=no` と、`gesturestart` の処理 |
| 30 | touch-css | タッチの CSS | スマホ | 必須 | `touch-action`・`overscroll-behavior`・`dvh` の高さ・`safe-area-inset` の余白を使う | CSS と HTML に4つすべてがあるか（当たる要素までは見ない） |
| 31 | reduced-motion | 動きを減らす | スマホ | 推奨 | `prefers-reduced-motion` のとき、動きを止める・減らす | CSS・JS の `prefers-reduced-motion` |
| 32 | rotate | 縦持ちで横のゲーム | スマホ | ゲームによる | 横向きのゲームを縦持ちのスマホで開いたとき、回して描くか、回転を促す | CSS の `orientation: portrait` か JS の `orientation.lock`。manifest が landscape でなければ n/a |
| 33 | tests | テスト | 品質 | 必須 | `npm test` が `vitest run` で、テストがある | package.json の `scripts.test` と `test/`・`tests/` のファイル |
| 34 | cpu-match | CPU 同士の対戦 | 品質 | 推奨 | CPU の強さを勝率で測るスクリプトがある | `scripts/cpu-match.mjs`・`scripts/cpu-sim.mjs`・`tools/cpu-bench.mjs` のどれか。`cpu` が n/a なら n/a。**要統一** |
| 35 | readme | README の節 | 品質 | 推奨 | README に、遊び方（ルール）・CPU・開発の節がある | `## ` の見出しに「遊び方」「ルール」、「CPU」（`cpu` を宣言したゲームはいらない）、「開発」「テスト」「構成」のどれか。**要統一** |
| 36 | portal-meta | 入口のページの情報 | 情報 | 必須 | package.json の `portal`（原題・ジャンル・人数）がそろっている | `scripts/portal/metadata.mjs` の errors がない（check-games.mjs でも落とす） |
| 37 | storage-prefix | 保存の名前 | 情報 | 必須 | localStorage のキーが「<頭>.<種類>」の形で、頭が1つ | `'<頭>.save'` などの文字列と `PREFIX = '<頭>.'` から頭を集め、1つか。localStorage を使わなければ n/a。ほかのゲームとの重なりは check-games.mjs が見る |
| 38 | names-match | 名前と色の一致 | 情報 | 推奨 | index.html の title・apple-mobile-web-app-title・theme-color が、manifest の name・short_name・theme_color とそろう | index.html と manifest を比べる（title は name と同じか short_name を含む） |

## 要統一の決まり

これから作るゲームと、直すゲームはこの書き方にそろえる。そろえ終えたら、判定（`scripts/standards.mjs`）を決まりの書き方だけに絞り、この節の「今認めている書き方」を消す。

| 項目 | そろえる書き方 | 今認めている書き方 |
|---|---|---|
| title | タイトル画面の要素は `id="screen-title"`（87本がこれ） | `#title-screen`（server なしの6本）・`#screen-setup`（lucky-numbers）・`#topScreen`（mine-blocks）・JS で作る `.title-screen`（dominion）・`showTitle()`（panel-de-pon） |
| help | 遊び方を開くボタンは、タイトル画面に `id="open-help-title"`、プレイ中に `id="open-help-game"`。遊び方の中身は `id="help"` | 「遊び方」「ルール」の button・a が2つ以上 |
| home | プレイ中からタイトルへ戻るボタンは `id="home"`（結果の画面からは `id="result-home"`） | aria-label の「ホーム」など |
| sound-toggle | BGM の ON/OFF のボタンは `<button type="button" class="bgm-toggle" aria-pressed="true">`（タイトル画面とプレイ中に置く。保存は `<頭>.sound`） | 独自の音の3本の、自前の切り替え |
| pwa-test | `test/pwa.test.js` で `describePwa(公開するフォルダ, { css })` を呼ぶ。CSS の場所が `css/style.css` でなければ `css` で渡す | 同じ（自前の PWA のテストは認めない。`pending` は直すまでの印で、残っている間は ✗） |
| replay-test | 再現のテストは `describe('記録からの再現', …)` にまとめる | テストの中の `replay`・「再現」 |
| hint | ヒントのボタンは `id="hint"`。おすすめの手は、CPU のファイル（`cpu*.js`）から export する `suggest(…)` で選び、画面ではおすすめの手の要素に `class="recommended"` を付ける。テストは `test/hint.test.js` | katan の `class="assist-toggle"`（アシストの ON/OFF。`suggest` は `cpu-player.js`、テストは `test/assist.test.js`） |
| cpu-match | `scripts/cpu-match.mjs` と npm の `cpu-match`（78本がこれ） | `scripts/cpu-sim.mjs`（npm `sim`、8本）・`tools/cpu-bench.mjs`（npm `bench:cpu`、6本） |
| readme | 見出しは `## 遊び方`・`## CPU`・`## 開発`（任意で `## 決めたこと`・`## オンライン対戦`） | 「ルール」「遊ぶ」「テスト」「構成」「ファイルの構成」など |

## 表を作り直す

```bash
node scripts/standards.mjs                  # docs/standards-status.md を作り直す（判定日は入れない。同じファイルなら同じ表になる）
node scripts/standards.mjs --check          # 必須の項目が欠けているゲームと、宣言の誤りを出す（あれば終了コード1）
node scripts/standards.mjs --check abalone  # ゲームを指定して確かめる
node --test scripts/standards.test.mjs      # 判定と宣言の読み方のテスト
```

ゲームを直したら、表も作り直してコミットする。ほかのスクリプトからは `checkRequired(gamesDir, games)`（必須の問題を1行ずつの文の配列で返す）と `evaluateGames(gamesDir, games)` を import して使える。

## 自動では確かめられないもの

人か、ブラウザでの確認が要る。標準の項目にはしていないが、ゲームを仕上げるときに見る。

- 一番小さいスマホ（縦持ちなら 360×640 前後、横なら 640×360）で、スクロールなしに収まり、文字が重ならない（`screens.mjs` で数値と画像は取れるが、通すかどうかの判断は人）
- 横向きのゲームを縦持ちで、縦向きのゲームを横で開いたときの見え方
- 遊び方の中身がルールとして正しく、足りていて、短く控えめな文体になっている
- CPU の強さの段階が、実際に強さの差になっている
- 「続きから」で本当に同じ局面に戻る（リロード・タブの切り替え・オフライン）
- 音の音量・鳴るタイミング・最初の操作まで鳴らないこと・別のタブを見ている間は止まること
- タッチの操作（ダブルタップのズームが起きない、ドラッグとスクロールがぶつからない、押す場所が 44px 前後）
- 結果の画面と「もう一度」の流れ、終局で操作が止まること
- 「← ゲーム一覧」のリンクがタイトル画面の中にあり、プレイ中に誤って押されない位置にある

## ブラウザでの画面の検査

`scripts/layout-check.mjs` は、ゲームをヘッドレス Chrome で開き、画面の崩れを数値で確かめる。上の標準の表（ファイルの文字列の検査）とは別で、表には入れない。判定は `scripts/layout-check-rules.mjs`（テストは `node --test scripts/layout-check.test.mjs`）。

**手元では小さく、CI では全部。** 画面を直したら、直したゲームだけを、ゲームの向きのスマホの大きさで流してから報告する（数秒で終わる）。push のたびに GitHub Actions（`.github/workflows/layout-check.yml`）が、全ゲームを3つの大きさで流す。CI は知らせるだけで、公開（pages.yml）は止めない。

```bash
node scripts/layout-check.mjs azul kingdomino              # 指定したゲームを、ゲームの向きのスマホ（縦 390×664 か横 844×390）で
node scripts/layout-check.mjs azul --sizes all             # スマホ縦・スマホ横・PC（1280×800）で
node scripts/layout-check.mjs --sizes all                  # 全ゲーム（手元で約 2.5 分）
node scripts/layout-check.mjs azul --out /tmp/check        # 結果の置き場（省くと一時フォルダ）。results.md・results.json と、NG の画面の PNG
node scripts/layout-check.mjs --site _site --shard 1/4     # build-site.mjs で集めた _site/ を配り、4つに分けた1つ目だけ（CI）
node scripts/layout-check.mjs --report <フォルダ>           # 分けて流した results.json を集めて表を出す
```

NG があれば終了コード1。ゲームは本番と同じ `/<ゲーム>/` の形で配る（ポートは OS が選ぶ）。外への要求（Google Fonts など）は止め、代わりの字体で描く。動きを減らす設定（`prefers-reduced-motion`）にし、字体の読み込みと、ボタンの位置が動かなくなるのを待ってから測る。1つの組ごとに新しいブラウザのコンテキストで開くので、保存や service worker は混ざらない。

見るもの：

| 場面 | 確かめること | NG にする条件 |
|---|---|---|
| タイトル画面 | 横のはみ出し | ページの幅が画面の幅より広い |
| | 縦のスクロール | NG にしない（注意）。主要な要素がスクロールで届くかで判定する |
| | 主要な要素：「← ゲーム一覧」（`.portal-link`）・BGM の切り替え（`.bgm-toggle`）・開始（`#start`・`#start-button`・`#start-local`・`#start-cpu`、なければ「開始」「スタート」「はじめる」の文言）・遊び方（`#open-help-title`、なければ「遊び方」「ルール」の文言） | 見えない。画面の外にあり、スクロールでも届かない（`overflow: hidden` で切れている）。真ん中がほかの要素に覆われている。高さ 24px 未満（44px 未満は注意）。ほかの操作の要素（ボタン・リンク・入力）と 2px より大きく重なる |
| 開始のボタンを押したあと | タイトルのまま | 押した開始のボタンがまだ見えている |
| | 「← ゲーム一覧」 | 見えている |
| | BGM の切り替え | 見えず、閉じたダイアログ（katan の設定）の中にもない。開始の直後に出る、選ぶまで閉じないダイアログに覆われるのは注意 |
| | 横のはみ出し | ページの幅が画面の幅より広い |
| 通して | コンソールのエラー・読み込みの失敗 | 例外・`console.error`・同じサーバーへの 400 以上か失敗した要求 |
| 音 | 開始のボタン（最初の操作）を押したあと BGM が流れ、BGM の切り替えを押すと止まる | 共通の音のエンジンのプレイヤーがあるのに流れない・止まらない。プレイヤーがない（独自の音）ときは AudioContext が動いていれば OK、止まったかは n/a。切り替えに届かないときも n/a |

- 押す場所の高さは、24px（WCAG 2.2 の最小）未満を NG、44px（iOS の指針）未満を注意にした。今のゲームの多くが 30〜42px のアイコンのボタンで、それは作りとして認める
- 一覧へのリンクと BGM の切り替えは、タイトルとプレイ画面に1つずつ置くことが多い。押せるものが1つあれば、ダイアログの裏に隠れたほうは判定しない。重なりも、真ん中が手前に出ている要素とだけ比べる
- manifest の orientation が portrait のゲームのスマホ横と、landscape のゲームのスマホ縦は「参考」にし、NG に数えない（`--sizes all` のときだけ流れる）
- 音は、読み込む前に `globalThis.Sound` への代入を捕まえて `createPlayer` を包み、プレイヤーの `position()`（流れている曲）を読む。ゲームのコードには何も足さなくてよい
- 結果の表には NG と参考の組だけを出す（注意は種類ごとの件数）。すべては results.json にある

### 標準の id で見つからないゲームの手がかり

開始や BGM の切り替えが標準の id・文言で見つからないゲームだけ、package.json の最上位に `layoutCheck` を書く（`standards` の欄は決めた欄以外を誤りにするので分けた）。書ける欄は次の4つで、ほかの欄は検査で NG になる。

```json
"layoutCheck": {
  "start": ".start-button[data-mode=\"solo\"]",
  "bgmToggle": ".setting label:has(input[name=\"bgm\"])"
}
```

- `start`：開始のボタンの CSS セレクタ。タイトル画面がない（開いてすぐ遊ぶ）ゲームは `null` にし、開始のあとの検査と音を n/a にする
- `help`：遊び方のボタンの CSS セレクタ
- `bgmToggle`：BGM の切り替えの CSS セレクタ。独自の音（`bgm` を宣言で n/a にしたゲーム）は、これを書かないと BGM の切り替えを確かめない
- `portalOpen`：「← ゲーム一覧」が遊び方などのダイアログの中にあるとき、開くボタンの CSS セレクタ

今書いているのは、独自の音の3本だけ：lucky-numbers（BGM の切り替え）・mine-blocks と panel-de-pon（開始と BGM の切り替え）。`start: null` と `portalOpen` を使うゲームは、今はない。
