# random

web-games のシード付きの乱数です。ロジック（ルール・状態の更新）と CPU は、この乱数だけを使います（docs/standards.md の seeded-rng）。

- 同じシードからは同じ順で同じ値が出るので、操作の記録からゲームを再現でき、オンライン対戦ではサーバーが配るシードで全員が同じ局面を作れます
- 配り方は packages/clock と同じ「コピーして同期」です。ゲームはビルドせずに配るので、各ゲームに写しを置きます。元はここの `src/random.js` だけです
- 計算（mulberry32）は変えません。変えると、保存した途中経過・記録・CPU の手が、前と同じに再現できなくなります

## フォルダ構成

- `src/random.js`：本体
- `scripts/sync.mjs`：各ゲームへ本体をコピーし、写しが元と同じかを確かめる
- `test/`：テスト（Vitest）。本体の計算と、同期のスクリプト

## ゲームの中のファイル

```
games/<ゲーム>/
  random.lock.json           同期の記録（版・場所・写しの sha256）
  public/js/
    random.js                本体の写し（同期で置く。手で直さない）
```

ゲームは `import { createRandom, createSeed, shuffle } from './random.js'` で読みます。service worker（`sw.js`）のキャッシュの一覧には `js/random.js` を書いておきます。

## 使い方

| 関数 | 中身 |
|---|---|
| `createSeed()` | 0 以上 2^32 未満のランダムなシード（`Math.random` を使うのはここだけ） |
| `createRandom(seed)` | [0, 1) の乱数を返す関数（mulberry32）。シードは 32 ビットに丸める |
| `shuffle(array, random)` | 配列をその場でシャッフルして、同じ配列を返す（Fisher-Yates） |

## 写しを持たないゲーム

（chess・dominion は前は関数の一部だけを持ち、panel-de-pon は書き方だけが違う同じ計算だったので、写しに置き換えた。使っている関数の結果は変わらない）

- puzzle-kit を使う10本：puzzle-kit が自分の `random.js` を配っている（中身は同じ）。puzzle-kit の写しのまま
- everdell（状態を数値1つで持つ `nextRandom` を足している）・ricochet-robots（`mixSeed` を足している）：ゲームの中で足した関数があるので、自前のまま
- mine-blocks：普通の `<script>` で読み、グローバルの関数で持つ作りなので、自前のまま

## 同期

```bash
node packages/random/scripts/sync.mjs <ゲーム>          # games/<ゲーム>/public/js/random.js に写し、random.lock.json を置く
node packages/random/scripts/sync.mjs check <ゲーム>    # 写しが手で直されていないか、本体と同じかを確かめる
node packages/random/scripts/sync.mjs check --all       # random.lock.json を持つゲームをすべて確かめる（CI の test.yml でも流す）
```

- 写しが手で直されていたら、同期は止まります（`--force` で上書き）。直しは packages/random に移してから同期します
- 写しの先頭には「packages/random <版> からコピーしたファイル」の1行が入ります。版を上げたら全ゲームを同期し直します
- packages/random を変えると、写しを持つゲームのテストも流れます（`scripts/changed-games.mjs` の `COPIED_PACKAGES`）

## 開発

```bash
npm test -w packages/random
```
