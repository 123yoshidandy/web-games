# clock

web-games の対局時計（持ち時間）の計算です。chess・shogi・go・gomoku が使います。

- DOM に依存せず、時刻も読みません（経過はミリ秒で受け取る）。ブラウザ・テスト・オンライン対戦のサーバーのどこでも同じ結果になります
- 配り方は packages/sound と同じ「コピーして同期」です。ゲームはビルドせずに配るので、各ゲームに写しを置きます。元はここの `src/clock.js` だけです
- ゲームごとの違いは、すべて設定で表します（下の「設定」）

## フォルダ構成

- `src/clock.js`：本体
- `scripts/sync.mjs`：各ゲームへ本体をコピーし、写しが元と同じかを確かめる
- `test/`：テスト（Vitest）。本体の計算と、同期のスクリプト

## ゲームの中のファイル

```
games/<ゲーム>/
  clock.lock.json            同期の記録（版・場所・写しの sha256）
  public/js/
    clock.js                 本体の写し（同期で置く。手で直さない）
```

ゲームは `import { ... } from './clock.js'` で読みます。service worker（`sw.js`）のキャッシュの一覧には `js/clock.js` を書いておきます。

## 設定

`{ main, byoyomi, periods, increment }`（時間はミリ秒、`periods` は秒読みの回数）。`normalizeClock` でそろえます。

| 方式 | 設定 | 使うゲーム（各ゲームの game.js の選択肢） |
| --- | --- | --- |
| 切れ負け | `main` だけ | 4本すべて（3分・5分・10分） |
| 秒読み（日本式） | `main` + `byoyomi` + `periods` | shogi（1回）・go（3回） |
| フィッシャー | `main` + `increment` | chess・gomoku（指し手だけに足す。`spend` の `increment: false` で足さない） |

## 使い方

- `normalizeClock(value)`：設定をそろえる。時計なしは `null`
- `createClockSides(config)`：両者の残り `[{ main, periods }, ...]`
- `limitOf(config, side)`：手番を始めてから、負けになるまでの時間
- `spend(config, side, elapsed, { increment })`：1手に `elapsed` かけた後の残りと、時間切れか
- `reading(config, side, elapsed)`：表示（`shown`・`byoyomi`・`periods`・`total`）。`isLow(read)` で残りわずかか
- `formatClock(ms)`：「4:59」、10秒を切ったら「9.8」
- `clockLabel(config)`：「3分+2秒」「10分+秒読み30秒×3」
- `cpuBudget(config, side, { moves })`：CPU が1手に使ってよい時間

## 同期

web-games の直下で次を流します。

```bash
# 同期する（clock.lock.json を置く）
node packages/clock/scripts/sync.mjs chess

# 写しが手で直されていないか、本体と同じかを確かめる
node packages/clock/scripts/sync.mjs check chess

# clock.lock.json を持つゲームを、すべて確かめる（CI の Test でも流す）
node packages/clock/scripts/sync.mjs check --all
```

- 写しの先頭には、版を書いた1行が付きます。写しが手で直されていたら、同期は止まります（`--force` で上書きする）
- 本体を直したら、ここでテストしてから、同期したすべてのゲームに同期します。`check` は、写しが今の `src/` と違えば失敗します
- packages/clock が変わると、CI は clock.lock.json を持つゲームのテストも流します（scripts/changed-games.mjs）

## 開発

```bash
npm test -w packages/clock
```
