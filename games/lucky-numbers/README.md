# lucky-numbers

ボードゲーム「ラッキーナンバー」をブラウザで遊べるようにしたものです。CPU との対戦と、友人とのオンライン対戦ができます。

**遊ぶ:** https://123yoshidandy.github.io/lucky-numbers/

スマホでは、ブラウザのメニューから「ホーム画面に追加」すると、アプリのように全画面で開けます。一度開いたあとは、オフラインでも CPU と対戦できます。

## web-games での扱い

このゲームは、ゲームの作品集 web-games の `games/lucky-numbers/` にあります（もとは単独のリポジトリ）。

- コマンドは web-games の直下で実行する：`npm install`（直下で1回）、`npm test -w games/lucky-numbers`、`npm run dev:server -w games/lucky-numbers`、`npm run build:server -w games/lucky-numbers`、`npm run deploy:server -w games/lucky-numbers`
- 部屋の仕組みのサーバー側は、web-games の `packages/netplay-kit/server/` を `netplay-kit/server/*.js` として import する（写しは持たない。esbuild で Lambda 用に1つにまとめる）
- 画面側の `public/js/netplay/` は netplay-kit の写し（ビルドの仕組みがないため）。直すときは netplay-kit で直し、直下で `node packages/netplay-kit/scripts/sync.mjs games/lucky-numbers` を実行する（`check` を付けると、手で直されていないかを確かめる）。版は `netplay-kit.lock.json`
- 公開先は https://123yoshidandy.github.io/web-games/lucky-numbers/ になる予定。サーバーの自動デプロイ（GitHub Actions）は、web-games の直下にまとめる予定で、今はない。サーバーを1つにまとめる計画は `docs/server-merge.md`
- 下の説明のうち、リポジトリ単体のときの手順（`.github/workflows/`・GitHub Pages への公開など）は、もとのリポジトリでの話

## ルール

- 1〜20 の数字タイルを人数分使う。各自 4×4 の庭を持つ
- 最初に4枚引き、小さい順に左上から右下への斜めに置く
- 手番では「山札から1枚引く」か「場（表向き）から1枚取る」
  - 引いたタイルは庭に置くか、場に出す。場から取ったタイルは必ず庭に置く
  - すでに 1・20 を置いている人は、山札から 1・20 を引かない（引いても場に出すしかないので、飛ばして次のタイルを引く）
  - 空いたマスに置くか、置いてあるタイルと入れ替える（入れ替えたタイルは場に出る）
  - 庭の各行は左から右へ、各列は上から下へ、数字が大きくなるように置く（斜めは関係ない）
- 庭の16マスを最初に埋めた人の勝ち。山札がなくなったら、庭のタイルが一番多い人の勝ち

## 遊び方

### CPU 対戦
1. 開始画面で人数（2〜4人）・名前・CPUかどうか・CPUの強さを選び、「ゲーム開始」を押す（同じ端末で人間どうしが交代で遊ぶこともできる）
2. 途中のゲームは自動で保存される。開き直したり、ホームに戻ったりしても、開始画面の「続きから」で再開できる（オンライン対戦は保存しない。部屋への戻り方は下のとおり）

### オンライン対戦
1. 開始画面で「オンラインで遊ぶ」を押し、名前を入れて「部屋を作る」を押す
2. 「招待URLを共有」で友人にURLを送る（友人は開くとそのまま部屋に入る。初めて遊ぶ人は名前を入れて「参加する」を押す）
   - 部屋はすべて公開で、ほかの人の入口の「参加できる部屋」の一覧（作った人の名前・人数）に出て、押すだけで入れる。一覧に出るのは、始まる前で満員でない部屋だけ。一覧は入口を開いたときと「更新」を押したときに取る。部屋番号は画面に出さない（招待URLの中にだけある）
3. 部屋を作った人（ホスト）が、必要ならCPUを追加して「ゲーム開始」を押す
4. ゲームが終わったら、ホストの「もう一度」で同じメンバーと再戦できる。「部屋に戻る」は誰でも押せる

接続が切れても、同じ端末で開き直せば同じ席に戻れます。対戦中に「部屋を出る」と、その人の番は CPU が代わりに打ちます。ホストが抜けたら、残った人がホストを引き継ぎます。

### 音
効果音と BGM があります（どちらも初めはオン）。開始画面の「遊び方を見る」の横と、ゲーム中の上部のバーにあるサウンドのボタンで、まとめて切り替えられ、設定はブラウザに保存されます。BGM は「四つ葉の野原」（約100秒のループ）、効果音は web-games 共通のものです。音は音声ファイルを使わず、共通の音のエンジン（packages/sound の写しの `public/js/sound/`。曲は `public/js/sound/bgm.js`）でブラウザの中で合成しています（`public/js/music.js`）。ブラウザの制限で、最初に画面を触るまでは鳴りません。

## CPU

- 庭の良さを点数にして、点数が一番上がる手を選ぶ（`public/js/cpu-player.js`）。山札の中身は見ない
- 強さは「やさしい」「ふつう」の2段階（`public/js/cpu-level.js`）。「やさしい」は4回に1回くらい、良い手を考えずに打つ（場を見ずに山札を引く・置ける所へ適当に置く）。乱数はゲームのシードと手数から作るので、同じ局面では同じ手になる
- オンライン対戦の CPU（と部屋を出た人の代行）は「ふつう」
- 強さの差は、CPU 同士の対戦で測る。2人で「ふつう」対「やさしい」は、勝率がおよそ 82% 対 18%

```bash
node games/lucky-numbers/scripts/cpu-match.mjs 1000 normal,easy   # 試合数と、席ごとの強さ
```

## 開発

必要なもの：Node.js 22 以上、Python 3（画面を手元で配信するため）

```bash
npm install

# 画面を手元で配信して http://localhost:8080 を開く
python3 -m http.server -d public 8080

# テスト
npm test
```

### オンライン対戦を手元で試す

AWS を使わずに、同じ処理のテスト用サーバーを手元で動かせます。画面を `localhost` で開くと、自動でこのサーバーにつながります。

```bash
npm run dev:server   # ws://localhost:8787（PORT=8788 などで変えられる）
```

URLに `?server=wss://...` を付けると、接続先のサーバーを変えられます。

## 構成

```
index.html         public/ へ移動するだけのページ（GitHub Pages ではリポジトリのルートが公開されるため）
public/            画面（GitHub Pages でそのまま公開する）
  sw.js              オフラインで開くためのキャッシュ（自分のファイルはネットワークを先に使う）
  manifest.webmanifest ホーム画面に追加したときの名前・アイコン・全画面と縦向きの設定
  js/
    game.js          ゲームの進行（DOMに依存しない。サーバーでも使う）
    cpu-player.js    CPUの戦略
    cpu-level.js     CPUの強さ（やさしい・ふつう）
    game-view.js     プレイヤーごとに見える状態（山札の並びは含まない）
    random.js        シード付きの乱数（同じ操作の記録から同じゲームを再現する）
    game-controller.js   ローカル対戦のコントローラー（途中経過の保存と「続きから」）
    online-controller.js オンライン対戦のコントローラー
    online-config.js     オンライン対戦のサーバーの URL
    ui.js            画面の描画と操作
    netplay/         オンライン対戦の共通部品（画面側。netplay-kit からのコピー）
server/            オンライン対戦のサーバー（部屋の処理は packages/netplay-kit を import する）
  src/game-definition.js  共通部品に差し込むゲームの定義（開始・操作・ビュー・CPU・退出した人の代行）
  src/handler.js       Lambda の入口
  dev-server.js        手元で試すためのテスト用サーバー
  template.yaml        AWS SAM のテンプレート
netplay-kit.lock.json  コピーした共通部品（画面側）の版
scripts/cpu-match.mjs  CPU 同士の対戦で、強さごとの勝率を測る
test/              テスト（Vitest）
```

### オンライン対戦のしくみ

- 部屋の処理（作成・参加・再接続・退出・ホストの引き継ぎ・再戦・CPUの進行）は、ほかのゲームと共通の部品 [netplay-kit](https://github.com/123yoshidandy/netplay-kit) を使う。サーバー側は web-games の `packages/netplay-kit` を import し、画面側の `public/js/netplay/` はコピーなので、手で直さずに netplay-kit 側で直して同期する
- サーバーがゲームを進め、各プレイヤーにはその人から見える状態だけを送る（山札の並びは送らない）
- 部屋には参加者・乱数のシード・操作の記録だけを保存し、操作を受けるたびに記録からゲームを再現する
- CPU はサーバーで動かし、1手ずつ届ける

## サーバー（AWS）

API Gateway（WebSocket）・Lambda・DynamoDB を AWS SAM で作ります（東京リージョン、スタック名 `lucky-numbers-online`）。

- 部屋は最後の操作から2日、ログは7日で自動的に消える
- 想定外のアクセスに備えて、受け付けるリクエストの数に上限を設けている

### デプロイ

AWS SAM CLI と AWS CLI が必要です。プロフィールは環境変数で渡します。変更内容を表示し、確認してから反映します。

```bash
AWS_PROFILE=<プロフィール名> npm run deploy:server
```

デプロイ後に出力される `WebSocketUrl` を、`public/js/online-config.js` の `DEPLOYED_SERVER_URL` に書きます。

画面（`public/`）は main ブランチに push すると GitHub Pages に反映されます。
