# 利用者ごとの記録（名前だけのログイン）

ゲームごとに、遊んだ回数・勝ち・負け・引き分けを、利用者ごとに残す。オンライン対戦は、相手ごと（人か CPU か）の勝ち負けも残す。遊んだ時間は残さない。

## 決めたこと

- **ログインは名前だけ**（PIN なし）。個人で使う前提で、なりすましは受け入れる。同じ名前なら、ほかのスマホからも同じ記録になる（記録はサーバーに置く）
- **名前はロビーと同じ場所**（localStorage の `netplay.name`）に入れる。全ゲームの共通のロビーには、ログインの名前が最初から入る（ロビーで名前を変えると、ログインも変わる）
- 名前は NFKC で揃え、前後の空白・制御文字・`|` を除き、12文字まで。英字の大文字・小文字は同じ人として扱う。ロビーの仮の名前（「プレイヤー」）は数えない
- **オンライン対戦の結果はサーバーが記録する**（netplay-kit の `RoomService` の `onMatchEnd`）。人の席だけを数え、CPU の席は相手としてだけ残す
  - 結果は、ゲームの定義の任意の `result(game, room)` があればそれ。なければ `game.result.standings`・`game.result.winners`・`ranking`・`winners`・`winner` の順に取り出す（netplay-kit の `stats.js` の `resultOf`）。取れなければ回数だけを数える
  - 順位から：全員が同じなら引き分け、いちばん上なら勝ち（同点の勝ちも勝ち）、ほかは負け。相手ごとは順位の上下で決める
  - 協力のゲーム（`{ coop: true, won }`）は全員が同じ結果で、相手ごとの記録は残さない
  - 対戦の終わりを保存できたときに、対戦ごとに1回だけ記録する（どの対戦まで記録したかを部屋に残す。保存がぶつかったやり直しでも二重にならない）。記録の失敗は対戦を止めない
- **ローカル対戦（CPU・ひとり）の結果は画面が送る**（`netplay/user-stats.js` の `recordResult`）。端末の待ち行列に入れてから送り、送れなければ残して、次の読み込み・通信の回復・次の結果のときに送り直す。id は同じ対戦なら同じ（シードから作る）なので、サーバーは二重に数えない
  - 1台で複数の人が交代で遊ぶ対戦は、誰の記録か分からないので送らない（人の席が1つのときだけ送る）
- 入口のページ：ログインの欄、「自分の記録」（ゲームごとの回数・勝ち・負け・引分と、オンラインの相手ごとの勝ち負け）、カードに小さく「3回・2勝1敗」
- **お気に入り**（入口のページ。カードの右上の ☆ で付け外しし、「★ お気に入り」で絞る。URL は `?fav=1`）
  - ログインしていなければ端末（localStorage の `portal.favorites`）だけに置く
  - ログインしていればサーバー（`USER#<名前>` の `favorites`）に置き、ほかのスマホでも同じになる。端末には写し（`portal.favorites.account`）を持ち、送れなかった変更は次に合わせるときに送る
  - ログインしているときに合わせると、ログインしていないあいだに付けたお気に入りをサーバーの分に足して送り、送れたら端末の分を空にする（ログアウトすると、端末の分だけが出る）

## 作り

| 場所 | 中身 |
|---|---|
| `packages/netplay-kit/server/stats.js` | 名前の揃え方・結果の取り出し（`resultOf`）・記録の組み立て・保存の形・メモリの保存先 |
| `packages/netplay-kit/server/dynamo-stats-store.js` | DynamoDB の保存先。`USER#<名前>` に平らな数（`p|azul` など）を ADD で足し、`RESULT#<id>`（90日で消える）の印と1つのトランザクションにする |
| `packages/netplay-kit/server/stats-handler.js` | HTTP API：`GET /stats?name=`・`POST /results`（本文 `{ id, name, game, outcome }`）・`GET /favorites?name=`・`PUT /favorites`（本文 `{ name, games }`） |
| `packages/netplay-kit/server/room-service.js` | `onMatchEnd`（任意）。`handler.js` は `STATS_TABLE_NAME` と `keyPrefix` があればつなぐ（全ゲームでゲーム側の変更は要らない） |
| `packages/netplay-kit/server/dev-server.js` | `startMultiDevServer`（`npm run dev:online`）が、同じポートの HTTP で記録の API を受け持つ（メモリ） |
| `packages/netplay-kit/client/user-stats.js` | 画面側：ログイン・待ち行列・送り直し・記録の読み込み。各ゲームの `public/js/netplay/` に同期する |
| `server/src/stats-handler.js`・`server/template.yaml` | `StatsTable`（消さずに残す）・`StatsFunction`・HTTP API の `StatsApi`。対戦の `GameFunction` にも記録のテーブルの権限 |
| `scripts/portal/stats.js`・`stats-view.js` | 入口のページのログインと「自分の記録」 |
| `scripts/portal/favorites.js` | 入口のページのお気に入り（端末とサーバーの持ち方。画面のつなぎは `page.js`） |
| `scripts/user-stats-coverage.mjs` | オンラインの結果を取り出せるゲームを数える（全員 CPU で終わりまで進めて試す） |

記録の API の場所は、`user-stats.js` の `DEPLOYED_STATS_URL`（公開したページ）、手元では `http://localhost:8787`（`?server=ws://localhost:<ポート>` ならそのポート、`?stats=` で変えられる）。

## デプロイ

1. netplay-kit（1.13.0）の変更をコミットし、azul・seven-wonders を同期し直す（`node packages/netplay-kit/scripts/sync.mjs games/azul`。今の写しのヘッダーは `-dirty`）
2. `npm run build:server`
3. 変更セットを作って中身を見る：`cd server && sam deploy --no-execute-changeset`
   - 足されるもの：`StatsTable`・`StatsFunction`・`StatsFunctionRole`・`StatsFunctionLogGroup`・`StatsApi`・`StatsIntegration`・`StatsGetRoute`・`StatsPostRoute`・`StatsStage`・`StatsInvokePermission`
   - 変わるもの：`GameFunction`（環境変数 `STATS_TABLE_NAME`）・`GameFunctionRole`（記録のテーブルの権限）。置き換え（Replacement）は出ないはず
4. 問題なければ実行する（`sam deploy`。`confirm_changeset = true` なので確かめてから実行される）
5. 出力の `StatsApiUrl` を、`packages/netplay-kit/client/user-stats.js` の `DEPLOYED_STATS_URL` に書き、コミットして、記録を入れたゲームに同期し直す。入口のページは `build-site.mjs` が写すので、公開し直せば入る

IAM：`web-games-cfn-deploy` は、`web-games-online-*` の Lambda・テーブル・ロググループ・実行ロールと、API Gateway の `/apis/*` を扱えるので、足すリソース（HTTP API も `/apis/*`）は今の権限で作れる。変更は要らない。

## 残りのゲームへの展開

オンライン対戦の結果は、デプロイすれば全ゲーム（112 本）で記録が始まる。`node scripts/user-stats-coverage.mjs` で数えた結果（2026-11-27）：

- **取れる：88 本**（ゲーム側の作業なし）
  abalone, agricola, alhambra, azul, backgammon, bang-dice, blokus, bluff, bohnanza, brass-birmingham, calico, cant-stop, carcassonne, cartographers, cascadia, castles-of-burgundy, century, chess, citadels, coloretto, concordia, coup, draftosaurus, dune-imperium, everdell, for-sale, gizmos, go, great-western-trail, hanamikoji, hearts, hey-thats-my-fish, hive, ingenious, istanbul, jaipur, king-of-tokyo, kingdom-builder, kingdomino, lords-of-waterdeep, lost-cities, love-letter, machi-koro, modern-art, mr-jack-pocket, nimmt, no-thanks, omaroke, onitama, pokemon-card-game, port-royal, power-grid, puerto-rico, quacks, quoridor, qwirkle, ra, race-for-the-galaxy, railroad-ink, reversi, root, saboteur, sagrada, santorini, schotten-totten, scythe, sea-salt-paper, seven-wonders, seven-wonders-duel, shogi, skull, small-world, splendor, splendor-duel, star-realms, stone-age, sushi-go, takenoko, terraforming-mars, tichu, ticket-to-ride, tigris-euphrates, tokaido, tsuro, viticulture, welcome-to, wingspan, yahtzee
  - チームや役割で勝つゲーム（tichu・saboteur・bang-dice・root など）は、取れた `winners` がチームの全員を含むかを見て、違えば `result` を足す
- **取れない：19 本**（定義に `result` を足す）
  - 協力（`{ coop: true, won }`）：flash-point, forbidden-desert, forbidden-island, hanabi, pandemic, sky-team, spirit-island, the-crew, the-game
  - 勝ち負けの持ち方が違う：cockroach-poker（負けた人）, dominion, katan, lucky-numbers, mahjong, patchwork, terra-mystica, third-force, ricochet-robots, ubongo
- **試せない：5 本**（CPU だけでは終わらない。`result` が要るかを手で確かめる）：mine-blocks, panel-de-pon, set, wordle（定義に CPU がない）, puzzle-collection（作業中）

ローカル対戦の結果は、ゲームごとに次を行う（azul・seven-wonders が見本。1本ずつ独立なので、エージェントに分けられる）：

1. netplay-kit の画面側を同期する：`node packages/netplay-kit/scripts/sync.mjs games/<名前>`（`netplay/user-stats.js` が入る）
2. `sw.js` の `PRECACHE` に `'js/netplay/user-stats.js'` を足す
3. 画面（`main.js` など）で、ローカル対戦が終わったとき（オンラインでないとき、終わりに切り替わった1回）に送る
   ```js
   import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
   recordResult({ game: GAME, id: `${GAME}-${seed}`, outcome: outcomeFromWinners(winners, humanSeat, players.length) });
   ```
   - 協力・ひとり用は、クリアなら `'win'`、失敗なら `'loss'`。勝ち負けのないものは `null`（回数だけ）
   - 人の席が2つ以上（1台で交代）なら送らない
   - id は同じ対戦なら同じになるもの（シード、なければ始めた時刻を保存に持たせる）
4. 確かめる：`npm run dev:online` と画面で、ログインして最後まで遊び、入口のページに回数が出ること。オンラインは `node scripts/online-e2e.mjs <名前> --finish`（終わりまで打てるゲーム）で、両方の記録が入ること
