# web-games

ブラウザで遊ぶゲームの作品集です。

## 構成

- `games/<名前>/` … ゲームごとのフォルダ。それぞれに `package.json`・`public/`（公開するファイル）・`test/` があります
- `packages/` … 複数のゲームで使う共通の部品。画面で動くコードは、ビルドの仕組みがないので、ゲームごとに写しを持っています
  - `netplay-kit` … オンライン対戦（サーバー側と、画面側の写しの元）
  - `sound` … BGM の再生エンジン（各ゲームの写しの元）と、曲の検査
  - `test-kit` … テストの道具（PWA の検査 `describePwa`。全ゲームのテストが使う）
- `scripts/` … テストや公開、決まりと画面の検査の道具
- `docs/` … ゲームの標準（[standards.md](docs/standards.md)・[standards-status.md](docs/standards-status.md)）や計画などの文書

## 使い方

```sh
npm install                          # 直下で1回だけ
npm test -w games/no-thanks          # 1つのゲームのテスト
npm run test:game -- no-thanks katan # 名前を挙げたゲームのテスト
npm run test:all                     # 全ゲームのテスト
node --test "scripts/**/*.test.mjs"  # 直下のスクリプトのテスト（一覧のページの検索・決まりの表・画面の検査の判定など）
```

テストはゲームごとに流します。共通の部品（`packages/`）を変えたときだけ、それを使う全ゲームのテストを流します。

`node scripts/check-games.mjs` で、ゲームをまたいだ決まり（キャッシュの名前・保存の名前の頭が重ならない、service worker がほかのゲームのキャッシュを消さない、一覧のページの検索・絞り込みの情報がそろっている、BGM のエンジンの写しが packages/sound と同じ、[ゲームの標準](docs/standards.md)の必須の項目を満たす）を確かめます。`--skip-standards` を付けると、標準の確認だけを省きます（公開の前の確認で使う）。

## ゲームの標準

全ゲームの完成度をそろえるための項目（タイトル画面・遊び方・BGM の ON/OFF・PWA のテストなど）を [docs/standards.md](docs/standards.md) に、各ゲームの達成状況の表を [docs/standards-status.md](docs/standards-status.md) にまとめています。ゲームを足したり直したりしたら、標準を満たすようにします。

```sh
node scripts/standards.mjs                  # docs/standards-status.md を作り直す（手で直さない）
node scripts/standards.mjs --check katan    # 必須の項目が欠けていれば一覧を出し、終了コード1（ゲームを省くと全部）
```

当てはまらない項目は、ゲームの package.json に理由付きで宣言します（`"standards": { "skip": { "<id>": "理由" } }`）。

### 画面の検査

ヘッドレス Chrome でゲームを開き、はみ出し・主要なボタン（「← ゲーム一覧」・BGM の切り替え・開始・遊び方）・開始・BGM・エラーを確かめます（`scripts/layout-check.mjs`。決まりと閾値は standards.md の「ブラウザでの画面の検査」）。

```sh
node scripts/layout-check.mjs abalone azul   # 手元：指定したゲームを、ゲームの向きのスマホの大きさだけで
node scripts/layout-check.mjs --sizes all    # 全ゲームを、スマホ縦・スマホ横・PC で（CI と同じ）
```

CI（`layout-check.yml`）は、main へのプッシュで全ゲームを4つに分けて流し、結果の表をジョブの概要に出します。失敗した画面の PNG は artifact に残ります。

## 公開

```sh
node scripts/build-site.mjs   # _site/ に集める（_site/<名前>/ と、ゲームの一覧の _site/index.html）
```

- 各ゲームの `public/` の中身を `_site/<名前>/` に写します。`public/` がないゲームは、サーバー・テスト・設定などのファイルを除いて写します
- ゲームの一覧のページは、各ゲームの manifest（名前・アイコン・色）から作ります
- 一覧のページでは、名前で探し、人数・オンライン対戦・ジャンルで絞り込めます。状態は URL（`?q=...&players=2&online=yes&genre=協力`）に入るので、絞り込んだ一覧をそのまま共有できます
  - 人数は、公開するコードの `export const MIN_PLAYERS`・`MAX_PLAYERS`・`PLAYERS`・`PLAYER_COUNT`・`PLAYER_COUNTS` から取ります。オンライン対戦は、ゲームのフォルダに `server/` があるかで決まります
  - 原題とジャンルは、ゲームの package.json に書きます（例：`"portal": { "original": "Azul", "genres": ["タイル配置"] }`）。ジャンルは `scripts/portal/metadata.mjs` の `GENRES` から選びます。人数の定数がないゲームは `"players": [2]` のように遊べる人数を、名前が漢字や英字だけのゲームは `"aliases": ["しょうぎ"]` のように読みを足します
  - 検索・絞り込みの JS は `scripts/portal/` にあり、`_site/portal/` に写します。テストは `node --test scripts/portal/portal.test.mjs`
- 公開の URL は `https://123yoshidandy.github.io/web-games/<名前>/` です
- 同じサイトに並ぶので、service worker は自分のゲームの古いキャッシュだけを消します（`CACHE_PREFIX`）。保存の名前（localStorage）も、ゲームごとに頭を変えています

## GitHub Actions

- `test.yml`：プルリクエストと main へのプッシュで動きます。ゲームをまたいだ確認・直下のスクリプトのテスト・BGM のエンジンの写しの確認を流し、ゲームと共通の部品のテストは変わったものだけ流します（`scripts/changed-games.mjs`。共通の部品を変えたら、それを依存に書くかテストで import しているゲームも流し、直下の設定や `scripts/` を変えたら全部流します）
- `layout-check.yml`：main へのプッシュで、全ゲームの画面の検査を流します（上の「画面の検査」）
- `pages.yml`：main へのプッシュで、`_site/` を集めて GitHub Pages に載せます（リポジトリの設定で、Pages の公開元を GitHub Actions にしておく）。集める前に `check-games.mjs --skip-standards` を流し、キャッシュや保存の名前が重なるなど、サイトが壊れる問題があれば止めます
- 3つは別々に流れます。テスト・標準の必須の項目・画面の検査が失敗しても、公開は止まりません

## 前からの7本（オンライン対戦あり）

もとは単独のリポジトリで公開していた7本も、ここに入っています：dominion・katan・lucky-numbers・mine-blocks・panel-de-pon・pokemon-card-game・wordle。

- オンライン対戦のサーバー（AWS SAM。API Gateway の WebSocket・Lambda・DynamoDB）を、今はゲームごとに持っています（`games/<名前>/server/`）
- 保存の名前（localStorage）は、もとの公開先と同じです（新しい公開先には、もとのデータは引き継がれません）

### サーバーのスクリプト

直下で、`-w games/<名前>` を付けて実行します。

```sh
npm run dev:server -w games/katan      # 手元のテスト用サーバー（ws://localhost:8787。PORT=8788 などで変えられる）
npm run build:server -w games/katan    # Lambda 用に esbuild でまとめる（games/katan/server/dist/handler.mjs）
AWS_PROFILE=<プロフィール> npm run deploy:server -w games/katan   # まとめて sam deploy（スタック katan-online）
```

- `deploy:server` は、ゲームのフォルダで `cd server && sam deploy` します（`samconfig.toml` はゲームごと）
- サーバーの自動デプロイ（GitHub Actions）は、まだ置いていません。もとのリポジトリのワークフローが動いています
- 7本のサーバーを1つのスタックにまとめる計画は `docs/server-merge.md`

### netplay-kit（オンライン対戦の共通部品）

- サーバー側は、各ゲームが `packages/netplay-kit/server/` を `netplay-kit/server/*.js` として import します（写しは持ちません）。netplay-kit を直すと、7本のサーバーがすぐ新しい版になるので、7本のテストを流します
- 画面側は、ビルドの仕組みがないので、各ゲームに写しを持たせています（`public/js/netplay/` か `js/netplay/`）。写しを新しくするときは `node packages/netplay-kit/scripts/sync.mjs games/<名前>`、手で直されていないかは `node packages/netplay-kit/scripts/sync.mjs check games/<名前>` で確かめます（版は各ゲームの `netplay-kit.lock.json`）

### sound（BGM の再生エンジン）

- 曲は各ゲームが持ちます（`public/js/sound/bgm.js`。wordle は `js/sound/bgm.js`）。ゲームの `js/music.js` が曲を流し、タイトル画面と遊ぶ画面の BGM のボタンで ON/OFF を切り替えます
- 再生エンジン（`engine.js`・`engine.mjs`）は、ビルドの仕組みがないので、各ゲームに写しを持たせています。元は `packages/sound/src/` で、写しを新しくするときは `node packages/sound/scripts/sync.mjs <名前>` で同期します（記録は各ゲームの `sound.lock.json`）
- 曲の検査（`npm test -w packages/sound`・`node packages/sound/tools/lint-songs.mjs`）は、曲を持つすべてのゲームの曲を読みます。曲を直したときも packages/sound のテストを流します
- panel-de-pon は、自前の BGM（`sound.js`）を持ち、このエンジンは使いません（lucky-numbers・mine-blocks は 2026-11-28 にこのエンジンへ移した）
- 詳しくは `packages/sound/README.md`
