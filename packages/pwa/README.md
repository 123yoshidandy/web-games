# pwa

web-games の PWA（ホーム画面に置いて、オフラインでも開ける）の共通の部品です。

- `src/sw-core.js`：service worker の本体（ネットワークを先に使い、つながらないときだけキャッシュ。字体はキャッシュを先に使う）
- `src/pwa.js`・`src/pwa.mjs`：画面の側の手伝い（`registerServiceWorker()`・`preventZoom()`）。普通の `<script>` で読むと `window.Pwa`、ES モジュールからは `pwa.mjs`
- 配り方は packages/clock・packages/random と同じ「コピーして同期」です。元はここの `src/` だけで、ゲームごとの違いは sw.js の設定（キャッシュの名前と、先に読むファイルの一覧）だけです

## ゲームの中のファイル

```
games/<ゲーム>/
  pwa.lock.json              同期の記録（版・場所・写しの sha256）
  public/
    sw.js                    このゲームの設定だけ（下）
    js/sw-core.js            service worker の本体の写し（手で直さない）
    js/pwa.js・js/pwa.mjs    画面の側の手伝いの写し（手で直さない）
```

sw.js は、設定を書いてから本体を読みます。`CACHE_PREFIX`・`FONT_HOSTS` は本体が決めるので、sw.js には書きません（同じ名前を2度宣言すると、本体の読み込みが失敗します）。

```js
// オフラインでも開けるようにする service worker（中身は packages/pwa の js/sw-core.js。ここにはこのゲームの設定だけを書く）
const CACHE = 'azul-v1';
const PRECACHE = [
    './', 'index.html', 'manifest.webmanifest', ..., 'js/main.js',
    'js/pwa.js', 'js/pwa.mjs', 'js/sw-core.js'
];
importScripts('js/sw-core.js');
```

画面の側（ES モジュールのゲームの main.js）:

```js
import { preventZoom, registerServiceWorker } from './pwa.mjs';
preventZoom();
registerServiceWorker();
```

普通の `<script>` で読むゲーム（mine-blocks）は、`<script src="js/pwa.js"></script>` を読んでから `Pwa.preventZoom()`・`Pwa.registerServiceWorker()`。

## 前の sw.js から移すとき（キャッシュの名前は変えない）

- `CACHE` は前のまま（`<ゲーム>-v1`）にします。名前を変えると、activate で前の版のキャッシュが消え、前の版がページから受け取って入れた分（字体など）がなくなって、かえってオフラインに弱くなります
- 今ホーム画面から使っている人は、次のように切り替わります
  1. 次にページを開いたとき、ブラウザが sw.js を取り直し、中身が変わったので新しい service worker を入れる（このとき js/sw-core.js も読み、登録に一緒にしまう）
  2. install で PRECACHE を同じ名前のキャッシュに入れ直す（前の分は上書きか、そのまま残る）。`skipWaiting` で待たずに動き出す
  3. activate で `clients.claim` し、開いているページも新しい service worker が受け持つ。同じ名前のキャッシュは消さない
- 写しの js/sw-core.js だけを直したとき：`registerServiceWorker()` は `updateViaCache: 'none'` で登録するので、ブラウザは sw.js と一緒に sw-core.js も HTTP のキャッシュを通さずに確かめ、変わっていれば入れ替えます。前の登録の仕方（`updateViaCache` なし）のままのゲームでも、importScripts のファイルは HTTP のキャッシュの期限（GitHub Pages は10分）が過ぎれば確かめ直されます
- ヘッドレス Chrome で、前の sw.js が受け持っていたページが新しい sw.js に切り替わり、読み直しとオフラインでも開けることを確かめた（pilot の4本）

## 同期

```bash
node packages/pwa/scripts/sync.mjs <ゲーム>          # games/<ゲーム>/public/js に写し、pwa.lock.json を置く
node packages/pwa/scripts/sync.mjs check <ゲーム>    # 写しが手で直されていないか、本体と同じかを確かめる
node packages/pwa/scripts/sync.mjs check --all       # pwa.lock.json を持つゲームをすべて確かめる（CI の test.yml でも流す）
```

- 写しが手で直されていたら、同期は止まります（`--force` で上書き）。直しは packages/pwa に移してから同期します
- 写しの先頭には「packages/pwa <版> からコピーしたファイル」の1行が入ります。版を上げたら、写しを持つゲームを同期し直します
- packages/pwa を変えると、写しを持つゲームのテストも流れます（`scripts/changed-games.mjs` の `COPIED_PACKAGES`）
- 判定（`scripts/standards.mjs`・`scripts/check-games.mjs`）は、sw.js が importScripts で読む本体も合わせて読みます。写しはゲームのコードに数えないので、sw-register・no-zoom はゲームの `registerServiceWorker(`・`preventZoom(` の呼び出しで見ます

## 開発

```bash
npm test -w packages/pwa      # 同期のスクリプトと、sw-core.js の振る舞い（偽の caches・fetch で動かす）
```
