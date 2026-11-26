# 日本語Wordle

## web-games での扱い

このゲームは、ゲームの作品集 web-games の `games/wordle/` にあります（もとは単独のリポジトリ）。

- コマンドは web-games の直下で実行する：`npm install`（直下で1回）、`npm test -w games/wordle`、`npm run dev:server -w games/wordle`、`npm run build:server -w games/wordle`、`npm run deploy:server -w games/wordle`
- 部屋の仕組みのサーバー側は、web-games の `packages/netplay-kit/server/` を `netplay-kit/server/*.js` として import する（写しは持たない。esbuild で Lambda 用に1つにまとめる）
- 画面側の `js/netplay/` は netplay-kit の写し（ビルドの仕組みがないため）。直すときは netplay-kit で直し、直下で `node packages/netplay-kit/scripts/sync.mjs games/wordle` を実行する（`check` を付けると、手で直されていないかを確かめる）。版は `netplay-kit.lock.json`
- 公開先は https://123yoshidandy.github.io/web-games/wordle/ になる予定。サーバーの自動デプロイ（GitHub Actions）は、web-games の直下にまとめる予定で、今はない。サーバーを1つにまとめる計画は `docs/server-merge.md`
- 下の説明のうち、リポジトリ単体のときの手順（`.github/workflows/`・GitHub Pages への公開など）は、もとのリポジトリでの話

## プロジェクト概要

日本語版Wordle風ゲームです。プレイヤーは5文字のひらがな単語を10回以内に当てることを目指します。1人プレイは画面だけで動き、オンライン対戦は AWS（API Gateway WebSocket + Lambda + DynamoDB）のサーバーを使います。

## 機能

- タイトル画面：モード（ことば／ポケモン）を選んで「はじめる」。前回のモードを覚えているので、ふだんは「はじめる」を1回押すだけで遊べる。遊び方・オンライン対戦・BGM の切り替え・ゲーム一覧へのリンク（ホーム画面に追加して開いたときは出さない）もここに置く
- 続きから：1人プレイの途中経過（モード・答えを決めるシード・入れた単語）を端末に保存し、タイトルの「続きから」で再開できる。答えはシード付きの乱数から作り直すので、答えそのものは保存しない。決着したら消える
- プレイ中は左上の家のボタンでタイトルへ戻る（オンライン対戦中は出さず、「部屋」から部屋を出るとタイトルに戻る）
- 5文字の日本語（ひらがな）単語を推測するゲーム
- ポケモンモード：全世代のポケモンの名前（カタカナ）を当てる。名前の文字数（2〜6文字）は伏せ、マスはいつも6つ。短い名前は後ろを空白で埋めた形が答えで、空白も1文字として判定する（空白のキーで入れる。物理キーボードではスペース）。図鑑にある名前＋後ろの空白だけ入力できる
  - 名前の一覧（`js/pokemon-names.js`）は PokeAPI の `pokemon_species_names.csv` から作成。記号や数字を含む名前（ニドラン♀、ポリゴン２、タイプ：ヌル、カプ・コケコなど）は除外している
- オンライン対戦（2〜4人）：全員が同じ答えを当てる。毎ラウンド全員が1つずつ答えを出し、そろったらいっせいに全員の結果（文字と色）を公開する。そのラウンドで当てた人の勝ち（同じラウンドなら同着）、10ラウンドで誰も当てられなければ引き分け
  - 答えの判定はサーバーで行い、答えは決着するまで端末に送らない
  - 部屋番号か招待URLで参加する。ことば／ポケモンはロビーでホストが選ぶ。対戦後は全員が「もう1回」を押すと再戦する
  - 対戦中に部屋を出た人は待たずに進める。通信が切れた人は戻るのを待ち、再読み込みすると同じ席に戻る
- 10回までの推測チャンス
- 文字の状態に応じたビジュアルフィードバック：
  - 緑色：正しい文字が正しい位置にある
  - 黄色：正しい文字だが位置が異なる
  - 灰色：単語に含まれない文字
- 画面上のキーボードでの入力対応
- 物理キーボードでの入力対応
- レスポンシブデザイン
- 新しいゲーム機能（プレイ中のヘッダーのボタン）
- スマホのブラウザのメニューから「ホーム画面に追加」すると、アプリのように全画面で開ける。一度開いたあとは、オフラインでも1人プレイができる

## 遊び方

1. タイトル画面でモードを選び、「はじめる」（途中のゲームがあれば「続きから」）を押す
2. キーボードまたは画面上のボタンを使って単語を入力（濁点・半濁点・小さい字は、入れた直後に「゛゜小」キーで切り替える）
3. 「決定」ボタンまたはEnterキーを押して回答を提出
4. 色付きのフィードバックを基に次の推測を行う
5. 迷ったら、ヘッダーのヒント（電球）のボタンで、これまでの色に合う候補の単語を入れられる（1人プレイだけ）
6. ヘッダーの「新しいゲーム」ボタンでいつでも新しい単語にチャレンジできます。タイトルの「対戦」ボタンからオンライン対戦の部屋を作る・参加する

## 技術スタック

- 画面：HTML / CSS / JavaScript（ES Modules、ビルドなし）
- オンライン対戦：[netplay-kit](../../packages/netplay-kit) の共通部品（サーバー側は web-games の `packages/netplay-kit` を import し、画面側は `js/netplay/` にコピー。版は `netplay-kit.lock.json`）
- テスト：Vitest（Node 22）

## フォルダ構成

- `index.html` / `styles.css`：画面
- `js/main.js`：タイトル画面・1人プレイ（途中経過の保存）と盤面の表示
- `js/logic.js`：判定とシード付きの乱数（画面とサーバーで共通）
- `js/online.js`：オンライン対戦の部屋と通信
- `js/online-config.js`：本番のサーバーの URL
- `js/words.js` / `js/pokemon-names.js`：答えの一覧
- `sw.js` / `manifest.webmanifest`：ホーム画面に追加したときの設定と、オフラインで開くためのキャッシュ（自分のファイルはネットワークを先に使う）
- `server/src/game-definition.js`：オンライン対戦の中身（netplay-kit のゲームの定義）
- `server/template.yaml` / `server/samconfig.toml`：AWS SAM の設定（スタック `wordle-online`、東京リージョン）
- `test/`：テスト

## 開発

ES Modules を使うので、`index.html` をファイルとして直接開くのではなく、HTTP サーバーで配信して開きます。

```bash
python3 -m http.server 8080   # http://localhost:8080/ を開く
```

オンライン対戦を手元で試すときは、テスト用サーバーも動かします（localhost で開くと ws://localhost:8787 につながる）。

```bash
npm install
npm run dev:server            # ポートを変えるときは PORT=8788 npm run dev:server と ?server=ws://localhost:8788
npm test
```

## オンライン対戦のサーバー（AWS）

```bash
npm run deploy:server         # esbuild でまとめて sam deploy（変更セットを確認してから反映）
```

デプロイしたら、出力された `WebSocketUrl` を `js/online-config.js` の `ONLINE_DEPLOYED_SERVER_URL` に書きます。書くまでは、公開ページに「対戦」ボタンは出ません。

netplay-kit を新しい版にするときは、web-games の直下で `node packages/netplay-kit/scripts/sync.mjs games/wordle` を実行します（画面側の写しが更新されます。サーバー側は import しているので、そのまま新しい版になります）。コピーしたファイルは直接直しません。