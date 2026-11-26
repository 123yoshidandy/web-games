# オンライン対戦のサーバーを1つにまとめる計画

今は、オンライン対戦のある7本（dominion・katan・lucky-numbers・mine-blocks・panel-de-pon・pokemon-card-game・wordle）が、それぞれ別の AWS のスタックを持っている。これを web-games の1つのスタック（`web-games-online`）にまとめる手順。オンライン対戦を新しく入れるゲーム（azul・seven-wonders から順に、ほぼ全ゲーム）は、はじめからこのスタックだけを使う。

AWS の操作（デプロイ、IAM のスタックの作成・削除）と GitHub の Secret の登録は、ユーザーが行う。

## 今の形

ゲームごとに、次の組を持っている（`<g>` はゲームの名前）。

| もの | 名前・場所 |
|---|---|
| サーバーのスタック | `<g>-online`（`games/<g>/server/template.yaml`・`samconfig.toml`） |
| 中身 | DynamoDB のテーブル1つ（`pk` だけのキー。`ROOM#部屋番号`・`CONN#接続ID`、pokemon-card-game は `SHARED_DECK#ID` も）、Lambda 1つ、WebSocket の API 1つ（ステージ `prod`） |
| 受け付けの上限（ステージ） | 毎秒10・瞬間20。panel-de-pon だけ毎秒50・瞬間100 |
| デプロイ | 元のリポジトリの `.github/workflows/deploy-server.yml`（main への push で `npm test` → `npm run build:server` → `sam deploy`） |
| IAM | ロールのスタック `<g>-github-deploy`（netplay-kit の `template/github-deploy.yaml` に `GameName=<g>`）。中身は `<g>-github-deploy`（GitHub Actions が使う）と `<g>-cfn-deploy`（CloudFormation が使う）の2つのロール。Secret `AWS_DEPLOY_ROLE_ARN` は元のリポジトリにある |
| OIDC のプロバイダ | アカウントに1つ（`github-oidc.yaml`）。まとめた後もそのまま使う |
| 画面の接続先 | 各ゲームに書いた定数（下の表） |

画面の接続先の定数:

| ゲーム | ファイル | 定数 |
|---|---|---|
| dominion | `games/dominion/public/js/online-config.js` | `DEPLOYED_SERVER_URL` |
| katan | `games/katan/public/js/online-config.js` | `DEPLOYED_SERVER_URL` |
| lucky-numbers | `games/lucky-numbers/public/js/online-config.js` | `DEPLOYED_SERVER_URL` |
| mine-blocks | `games/mine-blocks/js/online-config.js` | `ONLINE_DEPLOYED_SERVER_URL` |
| panel-de-pon | `games/panel-de-pon/js/online-config.js` | `DEPLOYED_SERVER_URL` |
| pokemon-card-game | `games/pokemon-card-game/public/js/online-controller.js` | `DEPLOYED_SERVER_URL` |
| wordle | `games/wordle/js/online-config.js` | `ONLINE_DEPLOYED_SERVER_URL` |

サーバー側の部屋の処理は、web-games に移したときに、各ゲームの写し（`server/netplay/`）をやめて `packages/netplay-kit/server/` を import する形にした（1.9.0）。画面側（`js/netplay/`）は写しのまま。

## まとめた後の形

- スタックは `web-games-online` の1つ。テーブル1つ・Lambda 1つ・WebSocket の API 1つ（ステージ `prod`）
- **ゲームの種類は、つなぐときの URL で選ぶ**：`wss://<API>.execute-api.ap-northeast-1.amazonaws.com/prod?game=dominion`
  - `$connect` で `game` を確かめ（知らない名前なら 400 で断る）、接続ごとに「どのゲームか」を記録する
  - それ以降のメッセージは、記録したゲームの部屋の処理（今の各ゲームの `handler`）に渡す
  - 部屋はゲームの中で作るので、「部屋を作るときに、そのゲームの部屋になる」。ほかのゲームの部屋番号では入れない（キーが分かれているので見つからない）
- 画面側
  - 前からの7本は、接続先の定数に `?game=<名前>` を付けるだけ。NetplayClient は URL をそのまま `new WebSocket()` に渡すので、画面側の netplay の写しは直さなくてよい
  - 新しく入れるゲームは、`public/js/online-config.js` の `DEPLOYED_SERVER_URL` に API の URL（`wss://<API>/prod`）を書くだけ。`?game=<名前>` は netplay-kit の `resolveOnlineServerUrl`（`netplay-lobby.js`）が付ける。空のあいだは、公開したページで「オンラインで遊ぶ」を出さず、ゲーム一覧の「オンライン」の印も付かない（`scripts/portal/metadata.mjs` の `hasDeployedOnline`）

ほかの選び方と、選ばなかった理由:

- 部屋を作るメッセージ（`create`）に `game` を足す：画面側の netplay の写し7つと、join・listRooms・再接続の全部に手が入る。接続で決めれば、それより後の処理は今のまま
- ゲームごとにステージを分ける（`/dominion` など）：Lambda で `requestContext.stage` を見るだけで済むが、ステージの数に上限（既定で1つの API に10）があり、オンライン対戦を足すたびにステージが増える

## 変えるファイル

### 1. netplay-kit（`packages/netplay-kit/`）… 1.10.0 で済み

- `server/dynamo-store.js`・`server/memory-store.js`：キーの頭（`keyPrefix`）。部屋は `ROOM#<game>#部屋番号`、公開の部屋の一覧の Scan も `begins_with(pk, 'ROOM#<game>#')`。接続 `CONN#接続ID` は頭を付けない。`keyPrefix` を渡さなければ今と同じ（今の各スタックのテーブルとも合う）
- `server/handler.js`：`createHandler(game, { tableName, keyPrefix })`
- `server/router.js`：`createRouter({ load, tableName })`
  - `load(name)` は、ゲームの名前からそのゲームの handler（か、handler を export するモジュール）を返す関数。決め打ちの一覧は持たない（ゲームが増えても router を直さない）。読み込むのは、つながったゲームだけ
  - `$connect`：`event.queryStringParameters?.game` が `server/game-name.js` の形（`games/` のフォルダ名と同じ形）で、`load` が handler を返すときだけ受け付ける。ほかは `{ statusCode: 400 }`。受け付けたら `GAME#接続ID` に `{ game, expiresAt }` を書く
    - `CONN#接続ID` とは別の項目にする。`CONN#` は部屋を出る（leave）と消えるが、接続はつながったままで、次の部屋を作れるようにするため
  - `$default`・`$disconnect`：Lambda の中のキャッシュ（接続ID → ゲーム）か、なければ `GAME#接続ID` を読み、そのゲームの handler に渡す。`$disconnect` のあとで `GAME#接続ID` を消す。ゲームの分からない接続のメッセージは 400
- `server/dev-server.js`：`startMultiDevServer({ load })`。手元のテスト用サーバーを1つのポートで全ゲーム分動かす（`?game=` で選ぶ。保存先は1つの MemoryStore を共有し、ゲームごとに `keyPrefix` を付ける。AWS と同じ形）
- `client/netplay-lobby.js`：入口とロビーの共通の画面と、接続先の `resolveOnlineServerUrl`（各ゲームに同期する）
- テスト：`test/router.test.js`（知らないゲームを断る、ゲームごとに1回だけ読み込む、Lambda が入れ替わっても保存先から読む、別のゲームの部屋番号では入れない、公開の部屋の一覧はそのゲームだけ）、`test/dynamo-store.test.js`（キーの形）、`test/multi-dev-server.test.js`（実際の WebSocket で2つのゲーム）

### 2. 各ゲーム（`games/<g>/server/src/handler.js`）

- `createHandler(game, { keyPrefix: '<g>' })` にする。新しく入れるゲームは、はじめからこの形（azul・seven-wonders で済み）。前からの7本は、切り替えのときに直す
- pokemon-card-game は、共有デッキ（`SHARED_DECK#`）を同じテーブルに置いている。キーがほかのゲームと重ならないので、そのままでよい
- 前からの7本の `server/template.yaml`・`samconfig.toml`・`package.json` の `deploy:server` は、切り替えが済むまで残す（元のスタックを直すときのため）。消すのは「元のスタックを消す」の段階

### 3. web-games の直下に、まとめたサーバーを置く

```
server/
  src/handler.js    … createRouter に、ゲームの handler を読み込む関数を渡す
  template.yaml     … netplay-kit の template/template.yaml の写し（AppName と上限は samconfig.toml で渡す）
  samconfig.toml
```

- `server/src/handler.js`

  ```js
  import { createRouter } from 'netplay-kit/server/router.js';

  // ゲームの一覧は書かない。esbuild は、この形の import() を games/*/server/src/handler.js の全部としてまとめる
  export const handler = createRouter({
      load: (name) => import(`../../games/${name}/server/src/handler.js`)
  });
  ```

  - オンライン対戦を入れたゲーム（`server/src/handler.js` があるゲーム）は、ビルドし直すだけで加わる。`load` に渡る名前は router が形を確かめてから使う
  - ビルドしたあとで、`server/dist/` にゲームごとの chunk ができていることを確かめる（esbuild が import() の形をまとめられないと、実行時に読み込みで失敗し、そのゲームの接続が 400 になる）

- `server/samconfig.toml`

  ```toml
  version = 0.1

  [default.deploy.parameters]
  stack_name = "web-games-online"
  region = "ap-northeast-1"
  capabilities = "CAPABILITY_IAM"
  resolve_s3 = true
  s3_prefix = "web-games-online"
  confirm_changeset = true
  parameter_overrides = "AppName=web-games ThrottlingRateLimit=100 ThrottlingBurstLimit=200"
  ```

  - ステージの上限は全ゲームの合計になるので、いちばん多い panel-de-pon（毎秒50・瞬間100）の倍にしておく。1人あたりの上限は、今までどおり各ゲームの定義（`messagesPerSecond`）と RateLimiter が受け持つ
- `template.yaml`：netplay-kit の見本のまま。Lambda の `MemorySize` は 256 → 512 にする（dominion・pokemon-card-game のカードのデータが大きく、まとめると読み込みが重くなるため）
- 直下の `package.json` の scripts に足す

  ```json
  "build:server": "esbuild server/src/handler.js --bundle --splitting --platform=node --format=esm --target=node22 --external:@aws-sdk/* --outdir=server/dist --out-extension:.js=.mjs",
  "deploy:server": "npm run build:server && cd server && sam deploy"
  ```

  - `--splitting` でゲームごとに別のファイル（chunk）になり、`import()` したゲームだけが読み込まれる。入口は `server/dist/handler.mjs` のまま（template の `Handler: handler.handler` を変えなくてよい）
- 手元で試すサーバーは、直下の `npm run dev:online`（`scripts/dev-online.mjs`。全ゲームを1つのポートで。`startMultiDevServer`）。前からの7本の `npm run dev:server -w games/<g>` も、切り替えまでは残る
- 2人の画面での通し試験は `node scripts/online-e2e.mjs <g>`（ヘッドレス Chrome。AWS は使わない）

### 4. GitHub Actions（`web-games/.github/workflows/deploy-server.yml`）

netplay-kit の `template/deploy-server.yml` をもとに、次を変える。

- `env.GAME` は `web-games`（リポジトリの名前なので、そのままでも `web-games` になる）
- 動く条件：ほぼ全ゲームがサーバーに入るので、ゲームは丸ごと見る（サーバーは画面側の `js/` のロジックも読み込むため）

  ```yaml
  on:
    push:
      branches: [main]
      paths:
        - 'server/**'
        - 'packages/netplay-kit/server/**'
        - 'games/*/server/**'
        - 'games/*/public/js/**'
        - 'games/*/js/**'
    workflow_dispatch:
  ```

- テストは、変わったゲームと netplay-kit を流す（`scripts/changed-games.mjs` の選び方）。全ゲームのサーバーが1つの Lambda に入るので、netplay-kit のサーバー側が変わったときは全ゲームを流す（`npm run test:all`）
- ビルドとデプロイは、直下の `npm run build:server` と、`working-directory: server` の `sam deploy --role-arn ...web-games-cfn-deploy --s3-prefix web-games-online ...`（今と同じ形）

### 5. IAM

既存のロールは変えない。新しいロールのスタックを1つ作る。

- netplay-kit の `template/github-deploy.yaml` はゲームの名前を受け取る作りなので、そのまま `GameName=web-games` で作れる
  - できるもの：スタック `web-games-github-deploy`、ロール `web-games-github-deploy`（信頼するのは `repo:123yoshidandy/web-games:ref:refs/heads/main` だけ）と `web-games-cfn-deploy`
  - `web-games-cfn-deploy` が作れるのは、`web-games-online-*` の Lambda・テーブル・ロググループ・実行ロールと、成果物の `web-games-online/` の下だけ。スタック `web-games-online` のリソースの名前は、この形になる
- 実行（ユーザー）：`packages/netplay-kit/scripts/setup-github-deploy.sh <プロフィール> web-games`
  - ロールのスタックを作り、ロールの ARN を web-games の Secret `AWS_DEPLOY_ROLE_ARN` に入れる（GitHub に web-games のリポジトリができてから）
- OIDC のプロバイダは、今のものをそのまま使う

## 切り替えの順番

1. netplay-kit に `keyPrefix` と `router.js` を足し、テストを通す（「変えるファイル」の1。1.10.0 で済み）。各ゲームの `handler.js` に `keyPrefix` を渡す（2。新しく入れるゲームは済み、前からの7本はこれから）。この時点では、元のスタックには何も起きない
2. 直下に `server/` と scripts を足し、`npm run build:server` で `server/dist/` にゲームごとの chunk ができることを確かめる（3）
3. IAM のロールのスタックを作る（5、ユーザー）
4. 最初のデプロイは手元から行う（ユーザー）：`npm run deploy:server`。出力の `WebSocketUrl` を控える
5. 新しいスタックで遊べるかを確かめる。画面は今の接続先のまま、URL で接続先だけを変えて開く（`?server=` の値は、`?` と `=` を含むので URL エンコードする）
   - 例：`https://123yoshidandy.github.io/web-games/dominion/?server=wss%3A%2F%2F<API>.execute-api.ap-northeast-1.amazonaws.com%2Fprod%3Fgame%3Ddominion`
   - 7本と、新しく入れたゲームのいくつかで、部屋を作る・2人目が入る・CPU を足す・始める・再接続、を確かめる。別のゲームの部屋番号で入れないことも確かめる
6. pokemon-card-game の共有デッキを、古いテーブルから新しいテーブルへ写す（ユーザー。古いテーブルの `SHARED_DECK#` の項目を Scan して、新しいテーブルに BatchWrite する。部屋・接続は期限で消えるものなので写さない）
7. 接続先を書く。前からの7本は、定数（上の表）を `wss://<API>.execute-api.ap-northeast-1.amazonaws.com/prod?game=<g>` に書き換える。新しく入れたゲームは、各 `public/js/online-config.js` の `DEPLOYED_SERVER_URL` に `wss://<API>.execute-api.ap-northeast-1.amazonaws.com/prod` を書く（`?game=` は付けない。数が多いので、全部に書く小さなスクリプトを用意してから行う）。書いたゲームから、公開したページに「オンラインで遊ぶ」が出て、ゲーム一覧に「オンライン」の印が付く
8. web-games の `deploy-server.yml` を置き、以後は main への push でデプロイされるようにする（4）
9. web-games の GitHub Pages を公開する（別の作業）。ここで、新しい URL（`https://123yoshidandy.github.io/web-games/<g>/`）の画面が、新しいサーバーにつながる

## 元のスタックを消す時期

元のリポジトリの GitHub Pages（`https://123yoshidandy.github.io/<g>/`）は、元のサーバーにつながったまま動き続ける。すぐには消さない。

1. 元のリポジトリの Pages を、新しい URL へ移す（直下の `index.html` を `https://123yoshidandy.github.io/web-games/<g>/` への転送にする。招待の `?room=` も引き継ぐ。今の転送用の index.html と同じ書き方）。ただし、元のリポジトリの `public/` の中を開いている PWA（ホーム画面に置いたもの）は、転送を通らない。`public/index.html` も転送にするか、画面に「新しい場所に移りました」と出す
2. 元のリポジトリの `deploy-server.yml` を止める（ファイルを消すか、リポジトリをアーカイブする）。止めないと、元のリポジトリに push したときに、古いスタックが更新される
3. 転送を入れてから、少なくとも2週間あける（部屋の期限が切れ、PWA が新しい版を読み込むのを待つ。CloudWatch のログで、古い Lambda が呼ばれなくなったことを確かめる）
4. 古いスタックを消す（ユーザー）：`<g>-online` を7つ。テーブルもスタックと一緒に消えるので、共有デッキを写し終えてから
5. 古いロールのスタック `<g>-github-deploy` を7つ消す。元のリポジトリの Secret `AWS_DEPLOY_ROLE_ARN` も消す
6. SAM の共有のバケットに残る `<g>-online/` の下の成果物を消す（任意）
7. 各ゲームの `server/template.yaml`・`samconfig.toml` と、`package.json` の `deploy:server` を消す。README のサーバーの節を、直下のサーバーを指すように直す

## 気をつけること

- 1つの Lambda に全ゲームが入るので、1つのゲームのサーバーの不具合（例外で落ちる・重い処理）が、ほかのゲームに響きうる。ゲームの処理の例外は RoomService が受けて `error` を返す作りなので、落ちることはまずないが、デプロイの前にテストを必ず流す（ワークフローでそうする）
- CloudWatch のログが1つのロググループにまとまる。ログの1行に `game` を足すと、ゲームごとに絞りやすい（router で `console.log` するときに付ける）
- `GAME#接続ID` の書き込みが、接続ごとに1回増える（DynamoDB の課金は使った分だけなので、遊ぶ人の数からすれば無視できる）
