# motion

駒やカードが動くときのアニメーションの共通の部品。動きの速さの設定（普通・速い・なし）と、よく使う動き（飛ばす・FLIP・現れる・裏返す）と、「動き終わってから CPU を進める」ための待ちをまとめた。

ゲームは静的なサイトなので、sound と同じく、本体（`src/motion.js`）を各ゲームにコピーして使う。

```bash
node packages/motion/scripts/sync.mjs <ゲーム>          # public/js/motion/motion.js にコピーし、motion.lock.json を置く
node packages/motion/scripts/sync.mjs check <ゲーム>    # 写しが手で直されていないか、本体と同じか
node packages/motion/scripts/sync.mjs check --all       # 同期したゲームをすべて
```

写しは直さず、ここで直してから同期する。同期したら、ゲームの `sw.js` の先読み（PRECACHE）に `./js/motion/motion.js` を足す（標準の `sw` の項目）。

## 決めたこと

- **速さは端末ごと**：`localStorage` の `web-games.motion-speed`（`normal`・`fast`・`off`）。同じサイトのゲームで共通なので、1つのゲームで選べばほかのゲームにも効く。保存の名前の決まり（`<頭>.save` など）の判定には当たらない名前にした
- **動きを減らす設定**：選んでいなければ、`prefers-reduced-motion: reduce` のとき「なし」。選べば、選んだ速さが勝つ
- **速さの倍率**：普通 1・速い 0.5・なし 0。部品の動きの長さ（`duration`・`delay`）はすべて普通の速さで書き、部品が倍率を掛ける。CSS の動きの長さを合わせるときは `ms(400)` を使う
- **CPU は動き終わってから**：部品の動きは終わるまで数える。CPU の手番は `afterIdle(手を打つ, 間)` で予約し、動き終わってから、さらに決まった間をおいて打つ（人の手の動きを CPU の手が追い越さない）。`finished` が来ない（裏のタブなど）ときに止まらないよう、1つの動きは長さ＋0.4 秒、待ちは最長 4 秒で打ち切る
- **画面のないところでは何もしない**：node のテストで controller を読み込んでも動かず、`afterIdle` はすぐ（`setTimeout` で）呼ぶ

## 使い方

```js
import * as Motion from './motion/motion.js';

// 設定：タイトル画面やメニューに「動き：普通・速い・なし」を出す
Motion.mountSpeedSetting(document.querySelector('#motion-setting'));

// FLIP：描き直す前に位置を測り、描いたあとで前の位置から動かす（要素に data-key="…" を付ける）
const before = Motion.captureRects(board, '.piece', 'key');
render();
Motion.flipFrom(before, board, '.piece', 'key', { duration: 260, enter: 'pop' });

// 飛ばす：手札から場へ（行き先は描いたあとの要素。飛んでいる間は隠す）
const from = Motion.rectOf(handCard);       // 描く前に測る
render();
const to = board.querySelector('[data-cell="3-4"] .tile');
Motion.fly(from, to, { content: to, hide: to });

// 裏返す・現れる・目立たせる
Motion.flipCard(card, { onHalf: () => card.classList.add('face-up') });
Motion.popIn(newTile);
Motion.pulse(scoreEl);

// CSS の @keyframes など、部品の外の動きも待たせる
Motion.hold(400);

// CPU：動き終わってから間をおいて打つ
this.cancelCpu = Motion.afterIdle(() => runCpuStep(this.game), CPU_DELAY_MS);
// 止めるとき
this.cancelCpu?.();
```

| 関数 | すること |
|---|---|
| `getSpeed()`・`setSpeed(id)`・`onSpeedChange(fn)` | 速さの id を読む・保存する・変わったら知らせる |
| `speedScale()`・`ms(base)`・`enabled()` | 倍率・今の速さでの長さ・動かすかどうか |
| `mountSpeedSetting(container, { label, onChange })` | 「動き：普通・速い・なし」の切り替え（`.motion-speed`、押したものは `aria-pressed="true"`）を作る。見た目は `:where()` の弱い既定なので、ゲームの CSS で上書きできる |
| `rectOf(el)`・`captureRects(root, selector, key)` | 位置を測る（大きさのない要素は null・外す） |
| `flipFrom(before, root, selector, key, { duration, stagger, enter, exclude })` | 前の位置から今の位置へ動かす。新しい要素は `enter`（`'fade'`・`'pop'`・`null`） |
| `fly(from, to, { content, delay, duration, hide, size, lift })` | 複製を飛ばす。`from`・`to` は位置か要素。`content` は要素か HTML |
| `fadeIn`・`popIn`・`pulse`・`flipCard(el, { onHalf })` | 現れる・はねて現れる・目立たせる・裏返す（半分で中身を替える） |
| `track(animation, longest)`・`hold(base)` | 部品の外の動きを数える |
| `whenIdle(fn)`・`idle()`・`afterIdle(fn, delay)`・`isIdle()` | 動き終わるのを待つ。`whenIdle`・`afterIdle` は取り消す関数を返す |
| `cancelAll()` | 動いているものを止める（「なし」にしたときは自動で） |

## ゲームに入れる手順

1. `node packages/motion/scripts/sync.mjs <ゲーム>` で写し、`sw.js` の PRECACHE に `./js/motion/motion.js` を足す
2. タイトル画面の設定の並びに `<div id="motion-setting"></div>` を置き、`Motion.mountSpeedSetting(...)` で作る。プレイ中のメニュー（設定のダイアログ）があれば、そこにも置く
3. 描き直す前後で、動いたものを動かす（駒の移動は FLIP、手札から場・山札から手札は fly、めくるものは flipCard）
4. CPU の手番の `setTimeout` を `Motion.afterIdle` に替え、止める処理で取り消す
5. テスト（`npm test -w games/<ゲーム>`）と `node scripts/layout-check.mjs <ゲーム>` を流す。ヘッドレス Chrome で、動きの前後の画面を撮って確かめる
