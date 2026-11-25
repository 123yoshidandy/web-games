# web-games

ブラウザで遊ぶボードゲーム・パズルゲームの作品集です。

## 構成

- `games/<名前>/` … ゲームごとのフォルダ。それぞれに `package.json`・`public/`（公開するファイル）・`test/` があります
- `packages/` … 複数のゲームで使う共通の部品（netplay-kit のサーバー側、テストの道具）。画面で動くコードは、ビルドの仕組みがないので、ゲームごとに持っています
- `scripts/` … テストや公開の道具
- `docs/` … 計画などの文書

## 使い方

```sh
npm install                          # 直下で1回だけ
npm test -w games/no-thanks          # 1つのゲームのテスト
npm run test:game -- no-thanks katan # 名前を挙げたゲームのテスト
npm run test:all                     # 全ゲームのテスト
```

テストはゲームごとに流します。共通の部品（`packages/`）を変えたときだけ、それを使う全ゲームのテストを流します。

`node scripts/check-games.mjs` で、ゲームをまたいだ決まり（キャッシュの名前・保存の名前の頭が重ならない、service worker がほかのゲームのキャッシュを消さない）を確かめます。

## 公開

```sh
node scripts/build-site.mjs   # _site/ に集める（_site/<名前>/ と、ゲームの一覧の _site/index.html）
```

- 各ゲームの `public/` の中身を `_site/<名前>/` に写します。`public/` がないゲームは、サーバー・テスト・設定などのファイルを除いて写します
- ゲームの一覧のページは、各ゲームの manifest（名前・アイコン・色）から作ります
- 公開の URL は `https://123yoshidandy.github.io/web-games/<名前>/` です
- 同じサイトに並ぶので、service worker は自分のゲームの古いキャッシュだけを消します（`CACHE_PREFIX`）。保存の名前（localStorage）も、ゲームごとに頭を変えています

## GitHub Actions

- `test.yml`：プルリクエストと main へのプッシュで動きます。ゲームをまたいだ確認を流し、ゲームのテストは変わったものだけ流します（`scripts/changed-games.mjs`。共通の部品を変えたら、それを使うゲームも流し、直下の設定や `scripts/` を変えたら全部流します）
- `pages.yml`：main へのプッシュで、`_site/` を集めて GitHub Pages に載せます（リポジトリの設定で、Pages の公開元を GitHub Actions にしておく）

## 前からの7本（オンライン対戦あり）

もとは単独のリポジトリで公開していた7本も、ここに入っています：dominion・katan・lucky-numbers・mine-blocks・panel-de-pon・pokemon-card-game・wordle。

- mine-blocks・panel-de-pon・wordle は `public/` がなく、ゲームのフォルダが公開するファイルです（`index.html` が直下にある。公開するときは、サーバー・テスト・設定などのファイルを除きます）
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
