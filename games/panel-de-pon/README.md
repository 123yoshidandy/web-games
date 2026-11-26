# panel-de-pon

落ち物パズル「パネルでポン」をブラウザで遊べるようにしたものです。スマホの縦画面向けに作っていて、CPU 対戦と、友人とのオンライン対戦ができます。

**遊ぶ:** https://123yoshidandy.github.io/panel-de-pon/

スマホでは、ブラウザのメニューから「ホーム画面に追加」すると、アプリのように全画面で開けます。一度開いたあとは、オフラインでも CPU 対戦ができます。

## web-games での扱い

このゲームは、ゲームの作品集 web-games の `games/panel-de-pon/` にあります（もとは単独のリポジトリ）。

- コマンドは web-games の直下で実行する：`npm install`（直下で1回）、`npm test -w games/panel-de-pon`、`npm run dev:server -w games/panel-de-pon`、`npm run build:server -w games/panel-de-pon`、`npm run deploy:server -w games/panel-de-pon`
- 部屋の仕組みのサーバー側は、web-games の `packages/netplay-kit/server/` を `netplay-kit/server/*.js` として import する（写しは持たない。esbuild で Lambda 用に1つにまとめる）
- 画面側の `js/netplay/` は netplay-kit の写し（ビルドの仕組みがないため）。直すときは netplay-kit で直し、直下で `node packages/netplay-kit/scripts/sync.mjs games/panel-de-pon` を実行する（`check` を付けると、手で直されていないかを確かめる）。版は `netplay-kit.lock.json`
- 公開先は https://123yoshidandy.github.io/web-games/panel-de-pon/ になる予定。サーバーの自動デプロイ（GitHub Actions）は、web-games の直下にまとめる予定で、今はない。サーバーを1つにまとめる計画は `docs/server-merge.md`
- 下の説明のうち、リポジトリ単体のときの手順（`.github/workflows/`・GitHub Pages への公開など）は、もとのリポジトリでの話

## できること

- **CPU 対戦**：CPU が隣の盤面で遊び、オンライン対戦と同じように、連鎖・同時消しでお邪魔ブロックを送り合う。先に上まで積み上がった方が負け。CPU の強さは難易度で変わる
- **オンライン対戦（2人）**：連鎖・同時消しで相手にお邪魔ブロックを送る。送られてきたお邪魔ブロックは自分の攻撃で打ち消せる
- **操作**（スマホ・PC 共通）
  - パネルを左右にドラッグ：移動
  - フィールドの外を長押し：せり上げ
  - フィールドの外をダブルタップ（ダブルクリック）：段差をならす（台を揺らして、高い列のパネルを隣の低い列へずらす）
- **遊び方**：タイトル画面とプレイ中の画面から、ルールと操作方法を表示できる。プレイ中は「ホーム」でタイトルに戻れる（CPU 対戦では、遊び方や確認の表示中はゲームが止まる）
- **設定**：難易度（練習／ノーマル／ハード。せり上がりの速さと CPU の強さが変わる。パネルは5色で、ハードだけ1色増えて6色）、効果音、BGM。設定と名前はブラウザに保存する

## 遊び方

### CPU 対戦
1. タイトル画面で難易度を選び、「CPU対戦」を押す
2. 勝敗がついたら「リトライ」で次の試合を始める（盤面の並びは毎回変わる）。「タイトルへ」で戻る

### オンライン対戦
1. タイトル画面で「オンライン対戦」を押し、名前を入れて「部屋を作る」を押す
2. 「招待URLを送る」で友人にURLを送る（友人は開いて「オンライン対戦」→「参加する」を押す。部屋番号（数字4桁）でも参加できる）
   - 「公開」にして作った部屋は、ほかの人の「公開の部屋を探す」の一覧に出て、押すだけで入れる。一覧に出るのは、相手を待っている部屋だけ
3. 部屋を作った人が「対戦スタート」を押す
4. 勝敗がついたら、2人とも「再戦」を押すと次の対戦が始まる。「部屋に戻る」で部屋の画面に戻る

## CPU

- 隣の盤面で、人と同じ操作（パネルをつかむ・ドラッグ・離す）で遊ぶ。入れ替えで消せる手を探し、ときどき、いちばん良い手ではない手を選ぶ
- 強さはタイトル画面の難易度で決まる（練習／ノーマル／ハード）。手を決めるまでの間・カーソルの速さ・手を探す範囲・誤る割合・連鎖を見込むか・せり上げるかが変わる（`js/cpu.js` の `CPU_LEVELS`）
- 先の連鎖を組む手は探さない（強すぎないように）
- 乱数はゲームと分け、シードから作った CPU 専用のものを使う。同じシードなら同じ試合になる

## 開発

必要なもの：Node.js 22 以上、Python 3（画面を手元で配信するため）

```bash
npm install

# 画面を手元で配信して http://localhost:8000 を開く
python3 -m http.server 8000

# テスト
npm test

# CPU 同士の試合を回して、決着することと、試合時間・勝率を集計する（試合数・難易度・自分の側の CPU の強さ）
npm run cpu-match -- 200 normal normal
```

### オンライン対戦を手元で試す

AWS を使わずに、同じ処理のテスト用サーバーを手元で動かせます。画面を `localhost` で開くと、自動でこのサーバーにつながります。ブラウザのタブを2つ開けば、ひとりで対戦を試せます。

```bash
npm run dev:server   # ws://localhost:8787（PORT=8797 のように環境変数でポートを変えられる）
```

URLに `?server=wss://...` を付けると、接続先のサーバーを変えられます。

## 構成

```
index.html css/ sounds/   画面（GitHub Pages でそのまま公開する）
favicon.svg favicon.png apple-touch-icon.png icon-*.png  アイコン（ほかのゲームと同じ置き場所）
icons/             manifest が読むアイコン（直下と同じもの）
sw.js              オフラインで開くためのキャッシュ（自分のファイルはネットワークを先に使う）
manifest.webmanifest ホーム画面に追加したときの名前・アイコン・全画面と縦向きの設定
js/
  game.js          ゲームの進行（DOMに依存しない。対戦用のルールも含む。withGame で盤面を切り替えて、2つ同時に進められる）
  cpu.js           CPU（盤面を見て消せる手を探し、人と同じ操作で動かす。乱数はゲームと分ける）
  cpu-match.js     CPU 対戦の進行（自分と CPU の盤面を同じシードで作り、攻撃を届け合う）
  panel-art.js     パネルとお邪魔ブロックの絵
  constants.js settings.js random.js
  renderer.js layout.js input.js sound.js title.js
  help.js          遊び方の画面と、確認のダイアログ
  netplay/         サーバーとの通信（netplay-kit からコピーしたもの。ここでは直さない）
  online-config.js 接続先のサーバーの URL
  lobby.js         オンライン対戦の画面（部屋の作成・参加）
  main.js          画面の切り替えとゲームループ
server/            オンライン対戦のサーバー
  netplay/             部屋の処理・Lambda の入口・保存（netplay-kit からコピーしたもの。ここでは直さない）
  src/game-definition.js  対戦の中身（シードの配布・中継・勝敗・勝ち数）
  src/handler.js       Lambda の入口
  dev-server.js        手元で試すためのテスト用サーバー
  template.yaml        AWS SAM のテンプレート
test/              テスト（Vitest）
scripts/cpu-match.mjs  CPU 同士の試合の集計
```

### オンライン対戦のしくみ

- 部屋の仕組み（作成・参加・再接続・開始・再戦）は、ほかのゲームと共通の netplay-kit を使う。サーバー側は web-games の `packages/netplay-kit` を import する。画面側の `js/netplay/`・`netplay-kit.lock.json` は netplay-kit の `scripts/sync.mjs` でコピーしたもので、直すときは netplay-kit で直して同期し直す
- ゲームはそれぞれの端末で進め、サーバーは部屋の管理と、相手へのメッセージの中継だけを行う
- 中継するのは、攻撃（送るお邪魔ブロック）と、相手の画面に表示する自分のフィールドの様子（約0.2秒ごと）
- 対戦の開始時に2人に同じシードを配り、パネルの並びをそろえる
- ゲームオーバーになった端末が負けをサーバーに伝え、サーバーが2人に勝敗を知らせる

## サーバー（AWS）

API Gateway（WebSocket）・Lambda・DynamoDB を AWS SAM で作ります（東京リージョン、スタック名 `panel-de-pon-online`）。

- 部屋は最後の操作から2日で自動的に消える。ログは7日で消える
- 想定外のアクセスに備えて、受け付けるリクエストの数に上限を設けている

### デプロイ

AWS SAM CLI と AWS CLI が必要です。プロフィールは環境変数で渡します。変更内容を表示し、確認してから反映します。

```bash
AWS_PROFILE=<プロフィール名> npm run deploy:server
```

デプロイ後に出力される `WebSocketUrl` を、`js/online-config.js` の `DEPLOYED_SERVER_URL` に書きます。画面は main ブランチに push すると GitHub Pages に反映されます。
