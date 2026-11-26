# カートグラファー

形を選んで地図を描き、王の勅令（得点カード）で点を集めるボードゲーム「カートグラファー（Cartographers）」の基本ゲームを、ブラウザで遊べるようにしたもの。ソロか、CPU 1〜3人と遊べる。スマホの縦持ち向け（横向きでも遊べる）。ホーム画面に置くと、オフラインでも遊べる。

絵（地形・形・アイコン）は、すべて SVG で自作している。カードの名前と文も自分で訳した。

## 遊び方

- 人数はソロ・2〜4人（あなた＋CPU）。CPU の強さは「やさしい」「ふつう」から選ぶ
- 全員が同じ探索カードを、それぞれの地図（11×11、A 面：山5つ・廃墟6つ）に描く
  - カードの「形と地形の組」を1つ選び、回転・裏返しして空いたマスに描く。山や描いたマスには重ねられない
  - コインのついた形を描くとコインを1枚得る
  - どの組も描けないときは、山以外の好きな地形を 1×1 で描く
- 廃墟のカードが出たら、次の探索カードの形は空いた廃墟のマスにかけて描く。かけられない（空いた廃墟がない場合も）ときは 1×1。間に襲撃カードが出ても、この条件は続く
- 襲撃カードが出たら、多人数では矢印の向きに地図を渡し、隣の人の地図に異形を描く（回転・裏返ししてよい）。ソロでは、カードに示された角から矢印の向きに、回さずに描ける最初の場所に自動で描く。どこにも描けなければ無視する
- 山の上下左右の4マスがすべて埋まると、コインを1枚得る
- 季節は春（8）・夏（8）・秋（7）・冬（6）。めくったカードの時間の合計が季節の長さに達したら、季節の得点を数える
  - 得点＝その季節の勅令2つ（春 A・B、夏 B・C、秋 C・D、冬 D・A）＋コインの数−異形に接する空きマスの数
- 季節ごとに、探索カード13枚と襲撃カード1枚（前の季節に出なかった襲撃カードも）を混ぜて山札にする。使った襲撃カードは取り除く
- 得点カードは、4つの組（森・村・畑と水・配置）から1枚ずつ引き、勅令 A〜D にランダムに置く
- 冬の得点のあと、合計の多い人の勝ち。同点なら異形の減点の合計が少ない人。それも同じなら全員の勝ち

### ルールに書かれていないので決めたこと

- 席は時計回りに並ぶとし、時計回りの矢印では右隣の人の地図に描く（地図を左へ渡すため）
- 襲撃で、隣の地図のどこにも異形を描けない人は描かずに済ます
- ソロの最終の評価（得点から得点カードの角の数を引いた称号）は入れていない。角の数の出典が1つしか見つからなかったため

### 画面の操作

- カードの欄で形と地形の組を選び、地図のマスを押すと、そのマスを中心に置いたときの姿が出る。はみ出す分は内側へずらす
- 回転・裏返しのボタンで向きを変え、「描く」で描く。描けない位置なら理由を、描ける位置なら今の季節の見込み点の増え方を出す
- 廃墟の条件があるときは、空いた廃墟のマスが光る
- 襲撃では、地図の欄に相手の地図が紫の縁で出る。置いたときの相手の減点の増え方を出す
- 上の勅令を押すと、得点の数え方と全員の今の点が、季節を押すと季節ごとの得点の表が、名前を押すとその人の地図が見られる。まだ描いていない人は、名前の右上に点が出る
- 途中でホームに戻っても、「続きから」で再開できる

## データの出典

公開されている実装を照らし合わせて作った（`public/js/cards.js`）。

| データ | 出典 | 結果 |
|---|---|---|
| 地図 A 面の山と廃墟 | [b34nst4lk/cartographer](https://github.com/b34nst4lk/cartographer) の `maps.gleam`、[murtll/cartographers](https://github.com/murtll/cartographers) の `wildlands.json` | 一致 |
| 探索カードの形・地形・時間・コイン | b34nst4lk の `cards.gleam`、[koraytugay/cartographers-deck-engine](https://github.com/koraytugay/cartographers-deck-engine) の `explore-cards-data.js`、[Iamtazy/cartographers-online](https://github.com/Iamtazy/cartographers-online) の `gameObjectMappings.js` | 12枚は一致。小村のコインつきの形だけ、L 字の3マス（2つ）と横2マス（1つ）に分かれ、多数に従った |
| 襲撃カードの形・始める角・向き | b34nst4lk・koraytugay・Iamtazy | 形と角と向きの組は一致。名前と形の組は b34nst4lk と Iamtazy に従った |
| 得点カードの文と点 | b34nst4lk の `cards.gleam`、[JorenC/cartographers](https://github.com/JorenC/cartographers) の `scoringCards.ts` | 一致 |
| 季節の長さ | b34nst4lk の `deck.gleam`、Iamtazy | 一致（8・8・7・6） |

細かいルール（廃墟に描けないときと、残っていないとき、襲撃のあとも廃墟の条件が続くこと、同点の扱い、襲撃カードの扱い）は、公式ルールの解説（officialgamerules.org）で確かめた。

## CPU

公開の情報（地図・得点カード・季節）だけを見て、描ける置き方を並べ、描いたあとの地図を「これから得点する回数で重みづけた得点カードの点＋コイン−異形の減点」と、地図を細切れにしない形かどうかで評価し、いちばん良いものを選ぶ。襲撃で隣の地図に描くときは、その人の評価がいちばん下がる場所を選ぶ（「やさしい」は無作為に置く）。

強すぎないように、置き方の一部の見落とし・評価の揺れ・先の季節の軽視を混ぜている。「やさしい」は「ふつう」より誤りが多い。

CPU 同士の対戦で、勝率と得点を測れる（strong は見落としのない比較用で、画面では選べない）。

```bash
# 試合数・席ごとの強さ（1人ならソロの得点だけ）
node scripts/cpu-match.mjs 200 easy,normal
```

測った結果：ソロの平均は やさしい 78点・ふつう 84点。対戦では やさしい 対 ふつう が 14%：86%。人数を変えた試合も、すべて最後まで終わる。

## 開発

素の HTML / CSS / JavaScript（ES Modules）で、ビルドはない。

```bash
# 画面（http://localhost:8000/）
python3 -m http.server 8000 --directory public

# テスト（Vitest）
npm install
npm test
```

| ファイル | 役割 |
|---|---|
| `public/js/cards.js` | 地図・探索カード・襲撃カード・得点カード・季節のデータ |
| `public/js/scoring.js` | 得点カード16枚の採点と、異形の減点・山のコイン |
| `public/js/shapes.js` | 形の回転・裏返しと、置ける場所 |
| `public/js/game.js` | ルール。操作は `applyCommand` に通して記録し、`Game.replay` で再現できる |
| `public/js/game-view.js` | プレイヤーから見てよい情報だけのビュー |
| `public/js/cpu-player.js` | CPU |
| `public/js/game-controller.js` | ローカル対戦の進行と、途中経過の保存 |
| `public/js/ui.js`・`art.js` | 画面・絵 |
| `server/src/game-definition.js` | オンライン対戦（netplay-kit）用のゲームの定義 |
| `server/src/handler.js` | オンライン対戦のサーバーの入口（AWS Lambda） |
| `public/js/online-config.js` | オンライン対戦の接続先 |
| `public/js/netplay/` | netplay-kit のクライアントとロビーの画面の写し（同期で置く。手で直さない） |
| `scripts/cpu-match.mjs` | CPU 同士の対戦 |

### オンライン対戦

netplay-kit の「サーバーがゲームを進める型」。2〜4人で、足りない席は CPU で埋められる。全員が同じカードを同時に描く。対戦中に部屋を出た人の席は CPU が引き継ぐ。オンラインではヒントを出さない。

- 手元で遊ぶ：web-games の直下で `npm run dev:online`（全ゲームのテスト用サーバー。ws://localhost:8787）を起動し、`public/` を localhost で開いて「オンラインで遊ぶ」
- 入口とロビーの画面は、netplay-kit の `netplay-lobby.js`（`public/js/netplay/` の写し。ここでは直さない）
- 接続先は `public/js/online-config.js`。`DEPLOYED_SERVER_URL` が空のあいだは、公開したページで「オンラインで遊ぶ」を出さない（web-games のサーバーをデプロイしたら書く）
- サーバーの入口は `server/src/handler.js`（`createHandler(定義, { keyPrefix: 'cartographers' })`。web-games の1つのスタックから `?game=cartographers` で呼ばれる）
- ゲームの定義は `server/src/game-definition.js`（記録だけを保存して再現する。各席には、その席から見えるビューだけを送る）
- テストは `test/online.test.js`（test-kit の `testOnline` で、部屋の作成・開始・終局まで・再接続・退出を確かめる）
