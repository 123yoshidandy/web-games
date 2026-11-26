# sound

web-games のゲームの BGM と効果音の再生エンジンと、作曲の道具です。

- 音は Web Audio API でその場で合成します（音声ファイルも鳴らせます）
- 曲はデータで書き、**各ゲームが自分で持ちます**（`games/<ゲーム>/public/js/sound/bgm.js`。public/ がないゲームは `js/sound/bgm.js`）。そのファイルが元で、ここには曲を置きません
- 効果音は、**すべてのゲームで同じ共通の効果音**（`src/effects.js`）を使います。エンジンと一緒に各ゲームへ同期します（下の「共通の効果音」）
- エンジンの配り方は netplay-kit と同じ「コピーして同期」です。ゲームはビルドせずに配るので、各ゲームにエンジンの写しを置きます。元はここの `src/` だけです
- lucky-numbers・mine-blocks・panel-de-pon は、自前の BGM（`sound.js`）を持ち、このエンジンは使いません

## フォルダ構成

- `src/engine.js`：エンジン（普通の `<script>` で読むと `window.Sound` になる）
- `src/engine.mjs`：ES モジュールから使うための入口
- `src/effects.js`：共通の効果音（`Sound.register('common', { effects, targets })`）
- `scripts/sync.mjs`：各ゲームへエンジンと共通の効果音をコピーし、写しが元と同じかを確かめる
- `tools/songs.mjs`：ゲームの曲のファイルを探す（下の道具とテストが使う）
- `tools/lint-songs.mjs`：和声の書き間違い（避けたい音・半音のぶつかり）と、パートの音域を調べる。ゲームごとの曲の一覧も出す。共通の効果音の書き間違いと長さも調べる
- `tools/measure.mjs`：曲と効果音を書き出して、音量と音割れを数値で確かめる（ヘッドレス Chrome）。共通の効果音は、音量の目安との差も確かめる
- `tools/effects.mjs`：共通の効果音の決まり（音量の目安との差・長さ・ピーク）
- `docs/composing.md`：作曲の作法（音域・パートの役割・ループのつなぎ方・音量の目安・記法）
- `test/`：テスト（Vitest）。曲を持つすべてのゲームの曲を読み、組み立てと和声の検査を通るか確かめる

## ゲームの中のファイル

```
games/<ゲーム>/
  sound.lock.json            同期の記録（版・場所・写しの sha256）
  public/js/sound/
    engine.js                エンジンの写し（同期で置く。手で直さない）
    engine.mjs               〃
    effects.js               共通の効果音の写し（〃）
    bgm.js                   ゲームの曲と効果音（ゲームが持つ元のファイル）
```

`bgm.js` は `Sound.register('<ゲームのフォルダ名>', { songs, effects })` を呼びます。登録の名前はフォルダ名にそろえます（テストで確かめます）。ファイルの先頭のコメントに、曲名とその曲を選んだわけを書いています。

ゲームと曲の対応は、各ゲームの `bgm.js` が元です。一覧は次で出せます。

```bash
node packages/sound/tools/lint-songs.mjs --list
```

## ゲームへの組み込み方

97 本のゲームは、どれも同じ形で組み込んでいます。

- `js/music.js`（ゲームのファイル）：プレイヤーを作り（`library` はフォルダ名、`storageKey` はそのゲームの保存の名前の頭に `.sound`）、`setup()` と `playBgm('<曲>')` を呼ぶ。`index.html` で `js/main.js` の前に `<script type="module">` で読む
- ボタン：`class="bgm-toggle"` を付けた要素を置くだけで、`music.js` が押されたときの切り替えと、表示（`aria-pressed`。チェックボックスなら `checked`）を合わせる。あとから JS で描いたボタンにも合わせる
  - タイトル画面：遊び方・ゲーム一覧の並び（`.title-links`）の、遊び方の次に「BGM」の文字のボタン。並びがないゲームは、右上の遊び方のアイコンの左など
  - 遊ぶ画面：上の帯の遊び方のアイコンの前に、音符のアイコン（OFF のときは斜線が入り、薄くなる）
  - katan：タイトルは効果音のアイコンの隣、遊ぶ画面では設定のダイアログのチェックボックス
- `sw.js`：先に読むファイルの一覧（`PRECACHE`）に `js/music.js`・`js/sound/engine.js`・`js/sound/engine.mjs`・`js/sound/bgm.js` を足す（キャッシュの名前は変えない）
- 保存の名前：katan と pokemon-card-game は、自前の効果音の ON/OFF が `.sound`（`:sound`）を使っているので、`katan.bgm`・`pokemon-card-game.bgm` にしている

## 使い方

```js
// ES Modules のゲーム
import Sound from './sound/engine.mjs';
import './sound/effects.js';
import './sound/bgm.js';
```

```html
<!-- 普通の <script> のゲーム -->
<script src="js/sound/engine.js"></script>
<script src="js/sound/effects.js"></script>
<script src="js/sound/bgm.js"></script>
```

```js
const sound = Sound.createPlayer({ library: '<ゲーム>', storageKey: '<保存の名前の頭>.sound' });
sound.setup();                 // 最初のタップ・クリック・キー入力まで鳴らさない。別のタブを見ている間は止める
sound.playBgm('<曲>');         // BGM を流す（BGM が OFF なら、ON にしたときに流れる）
sound.stopBgm();
sound.play('select');          // 効果音（共通の効果音と bgm.js の効果音。{ delay: 秒, volume: 倍率 } も渡せる）
sound.toggle('bgm');           // 'effects'・'bgm' の ON/OFF（storageKey の localStorage に保存する）
sound.toggleAll();             // どちらかが鳴っていれば両方消し、両方消えていれば両方つける（ゲームの「サウンド」のボタン）
sound.getSettings();           // { effects: true, bgm: true }
sound.onChange((settings) => updateButtons(settings));
sound.setVolume({ bgm: 0.8 }); // 音量（master・bgm・effects。既定は 0.8・1・1）
sound.setOverrides('<曲>', { lead: { instrument: 'flute', volume: 0.5 } }); // パートの楽器を差し替える（{} で元に戻す）
```

`createPlayer` の `volume` で、最初の音量も決められます。音声ファイルの曲は `{ file: 'sounds/bgm.m4a', gain, loopStart, loopEnd }`、効果音は `{ file: 'sounds/pop.mp3', volume, rate }` と書きます（`sound.preload()` で前もって読み込めます）。

### 共通の作法

- **自動再生の制限**：ブラウザは、ユーザーが操作するまで音を出させません。`setup()` は最初のタップ・クリック・キー入力で音を使えるようにします。それまでの `play()` は鳴らずに捨てられます
- **別のタブ**：見ていない間は止め、戻ったら BGM を続きから鳴らします
- **ON/OFF の保存**：効果音と BGM の ON/OFF を `storageKey` の localStorage に保存します（初めは両方 ON。ゲームでは1つのボタンでまとめて切り替える。上の「音の ON/OFF」）
- **保存の名前**：`scripts/check-games.mjs` の決まり（「頭.残り」の頭がゲームどうしで重ならない）に合わせ、そのゲームが今使っている頭に `.sound` を付けます。同じキーをゲームがほかの用途で使っているときは、`<頭>.bgm` などぶつからない名前にします
- **iPhone の消音モード**：Web Audio の音は、iPhone の消音モード（横のスイッチ）では鳴りません。ゲームではこれに従います。曲を聞き比べるページを作るときは、対応するブラウザでは消音モードでも鳴らせます（`ignoreSilentSwitch: true`。iOS 17 以降の `navigator.audioSession`）

## 共通の効果音

すべてのゲームで、同じ効果音を使います（ゲームごとに変えない）。`src/effects.js` が `common` の名前で登録し、どのゲームのプレイヤーからも `sound.play('<名前>')` で鳴らせます。ゲームの `bgm.js` の `effects` に同じ名前を書くと、そのゲームだけ差し替えられます（共通の効果音で足りるなら、書かない）。

### 一覧

ゲームのできごとには、次の表で当てます。目安は最大の瞬間ラウドネス（LUFS）で、BGM（-39 LUFS）と一緒に聞いて釣り合う大きさです。よく鳴る音ほど小さくしています。

| 名前 | 意味（いつ鳴らす） | 当てる例 | 音 | 目安 |
|---|---|---|---|---|
| `select` | 選ぶ・押す（まだ決めていない） | 駒・カード・マスを選ぶ、メニューやボタンを押す、選んでいる物を変える | 短い高い木の音 | -47 |
| `place` | 置く・動かす（決めた） | 駒・タイル・石を置く、駒を動かす、カードを場に出す、労働者を置く | 低めの木の音 | -44 |
| `capture` | 取る・ひっくり返す | 相手の駒を取る、石をひっくり返す、相手のカードを取る | 2つ下がる木琴 | -42 |
| `cancel` | 取り消す・戻す | 選ぶのをやめる、一手戻す、ダイアログを閉じる | そっと下がる2音 | -47 |
| `error` | できない操作 | 置けないマスを押した、条件が足りない、ルールで禁じられた手 | 低い2回の音 | -38 |
| `turn` | 自分の番になった | 相手（CPU・ネットの相手）の番が終わって、自分の番になった | 明るい2音のチャイム | -37 |
| `notify` | 知らせ | 相手が動いた、メッセージが来た、ラウンド・時代が変わった、相手が入室した | 控えめな2音 | -41 |
| `dice` | さいころを振る | さいころ・ルーレットを振る | 転がって止まる音 | -42 |
| `draw` | カードを引く・めくる | 山札から引く、カードをめくる・配る（1枚ずつ） | こすれる音 | -45 |
| `shuffle` | カードを切る | 山札を切る、まとめて配り直す | 何度もこする音 | -43 |
| `gain` | 点・資源を得る | 得点する、資源・お金・カードを得る、役ができる、列をそろえて消す | 上がる3音とベル | -40 |
| `pay` | 払う・失う | お金・資源を払う、点を失う、手札を捨てる | 下がる3音 | -43 |
| `win` | 勝ち・クリア | ゲームに勝つ、パズルを解く、1位で終わる | 上がる分散和音と和音（約1.5秒） | -24 |
| `lose` | 負け | ゲームに負ける、時間切れ、詰み | 短調で下がる（約1.5秒） | -28 |

当て方の決まり：

- **1つの操作に1つの音**。駒を選んで置くなら、選ぶときに `select`、置いたときに `place`。置いた結果で取れたら、`place` のかわりに `capture`
- **自分の操作の結果だけを鳴らす**のが基本。相手（CPU・ネットの相手）の手は `notify` にまとめ、自分の番になったら `turn`。CPU が速く何手も指すときは、毎手鳴らさず最後に1回
- 同時に起きたことは、大事な方を1つだけ鳴らす（例：点を得てゲームが終わったら `win` だけ）。続けて鳴らしたいときは `{ delay: 0.15 }` でずらす
- 引き分けは `notify`。対戦でほかの人が勝ったときは `lose`、自分が1位なら `win`
- 表にないできごとは、いちばん近い意味の名前に当てる。どれにも当たらなければ鳴らさない

### 音の ON/OFF（1つのボタン）

BGM と効果音は、**1つの「サウンド」のボタンでまとめて ON/OFF** します。効果音だけの切り替えは置きません。

- ボタン：`<button type="button" class="sound-toggle" aria-pressed="true">`。押すと `toggleAll()`（どちらかが鳴っていれば両方消し、両方消えていれば両方つける）
- 表示：`aria-pressed` は「BGM か効果音のどちらかが ON」（`settings.bgm || settings.effects`）。チェックボックスなら `checked`
- 文言：タイトル画面の文字のボタンは「サウンド」。遊ぶ画面のアイコンのボタンは、スピーカーのアイコン（OFF のときは斜線を入れて薄くする）に `aria-label="サウンド"`。ON/OFF は `aria-pressed` で伝えるので、文言は変えない
- 置き場所：今の BGM のボタンと同じ（タイトル画面は `.title-links` の遊び方の次、遊ぶ画面は上の帯の遊び方のアイコンの前）。設定のダイアログを持つゲーム（katan）は、そのチェックボックスを「サウンド」にする
- 保存：今までどおり `storageKey` の localStorage に `{ effects, bgm, version: 2 }` で保存する（保存の名前は変えない）。初めは両方 ON
- 前の版の保存（`version` がない。BGM の ON/OFF だけを選べた）は、読むときに効果音を BGM に合わせる。BGM を消していた人は、効果音も消えたまま始まる。移したらすぐに `version: 2` を付けて書き戻すので、移すのは1回だけ（エンジンがする。ゲームの作業はない）

### ゲームへの組み込み方

1. 同期する（web-games の直下で）。エンジンと一緒に `effects.js` がコピーされ、`sound.lock.json` に加わる

   ```bash
   node packages/sound/scripts/sync.mjs <ゲーム>
   ```

2. `js/music.js`：エンジンの次に `effects.js` を読み（`bgm.js` の前）、ボタンを `.sound-toggle` と `toggleAll()` にする

   ```js
   // 音（BGM は sound/bgm.js、効果音は共通の sound/effects.js、再生エンジンは packages/sound の写しの sound/engine.mjs）
   // 最初のタップ・クリック・キー入力のあとに鳴り始める。.sound-toggle のボタン1つで BGM と効果音をまとめて ON/OFF し、localStorage に保存する
   import Sound from './sound/engine.mjs';
   import './sound/effects.js';
   import './sound/bgm.js';

   export const music = Sound.createPlayer({ library: '<ゲーム>', storageKey: '<頭>.sound' });
   music.setup();
   music.playBgm('<曲>');

   // ボタンの表示（aria-pressed。チェックボックスなら checked）を ON/OFF に合わせる。あとから描かれたボタンにも合わせる
   function syncButtons(settings = music.getSettings()) {
       const on = settings.bgm || settings.effects;
       document.querySelectorAll('.sound-toggle').forEach(button => {
           if (button.type === 'checkbox') button.checked = on;
           else if (button.getAttribute('aria-pressed') !== String(on)) button.setAttribute('aria-pressed', String(on));
       });
   }

   document.addEventListener('click', event => {
       if (event.target.closest('.sound-toggle')) music.toggleAll();
   });
   music.onChange(syncButtons);
   syncButtons();
   new MutationObserver(() => syncButtons()).observe(document.body, { childList: true, subtree: true });
   ```

3. `index.html`・CSS・ボタンを描く JS：`bgm-toggle` を `sound-toggle` にし、文言を上の「音の ON/OFF」に合わせる（「BGM」→「サウンド」、アイコンは音符からスピーカーへ）

4. ゲームのできごとで鳴らす。`music.js` から書き出したプレイヤーを使う（BGM と同じプレイヤー）

   ```js
   import { music } from './music.js';

   function onCellClick(cell) {
       if (!canPlace(cell)) {
           music.play('error');
           return;
       }
       const captured = placePiece(cell);
       music.play(captured ? 'capture' : 'place');
   }
   ```

   最初のタップ・クリック・キー入力の前と、OFF のときは、`play` は何もしません（呼ぶ側で確かめなくてよい）。登録にない名前を渡すと投げるので、名前は上の表から選ぶ

5. `sw.js` の `PRECACHE` に `js/sound/effects.js` を足す（キャッシュの名前は変えない。`scripts/standards.mjs` の `sw` の検査は、`js/` の下の JS がすべて載っていることを求める）

## 曲と効果音の書き方

`docs/composing.md` にまとめています。短い例：

```js
const song = {
    title: 'ひだまりパズル',
    bpm: 110,
    reverb: { seconds: 2.2, tone: 0.5 },
    parts: {
        lead: { instrument: 'marimba', reverb: 0.2 },
        bass: { instrument: 'pluck', mode: 'bass', octave: 2 },
        drums: { instrument: 'drums', kit: 'soft', mode: 'drums' }
    },
    sections: {
        A: {
            chords: 'F | C/E | Dm7 | Am7',
            lead: 'A4:2 C5 F5:3 E5:1 F5:2 A5 r G5 | E5:2 G5 C5:4 r:2 C5 D5 E5 | ...',
            bass: 'R:4 r:2 R:2 5:2 r:2 R+:2 5:2',
            drums: { kick: 'x.....x...x.....', shaker: 'oxoxoxoxoxoxoxox' }
        }
    },
    intro: [],
    loop: ['A']
};
```

楽器は次のとおりです。

- 鍵盤：`piano`・`epiano`・`organ`
- たたく・はじく：`marimba`・`xylophone`・`vibes`・`bell`・`musicBox`（オルゴール）・`kalimba`・`steelpan`・`pluck`（`brightness` を上げるとハープ）・`guitar`（胴の響き付き。和音の刻みのパートに `strum: 0.012` などと書くと、かき鳴らすようにずらす）
- 伸ばす：`strings`（弦楽器のアンサンブル）・`brass`・`accordion`・`choir`（合唱）・`flute`（`breath: 0` で口笛）・`ocarina`・`clarinet`・`softLead`・`pad`
- そのほか：`synthBass`・`chip`（矩形波・三角波）・`drums`（組は `soft`・`brush`（ジャズ向き。こするスネアは `swish`）・`acoustic`（生ドラム風）・`chip`・`legacy`。`ride`・`crash` のシンバルと、高さの違うタム `tomHigh`・`tomMid`・`tomLow` は soft・brush・acoustic で使える）

## 同期

web-games の直下で実行します。ゲームは `games/` の下のフォルダ名で指定します（パスでもよい）。

```bash
# エンジンをゲームにコピーする（ゲームの直下に sound.lock.json を置く）
node packages/sound/scripts/sync.mjs abalone

# 写しが手で直されていないか、ここの src/ と同じかを確かめる（違えば終了コード1）
node packages/sound/scripts/sync.mjs check abalone

# sound.lock.json を持つゲームを、すべて確かめる
node packages/sound/scripts/sync.mjs check --all
```

- コピーするのはエンジン（`engine.js`・`engine.mjs`）と共通の効果音（`effects.js`）だけです。ゲームの `bgm.js` は同じフォルダに置きますが、コピーも確認もしません
- 前の版（エンジンだけ）で同期したゲームは、`check` が「コピーするファイルが変わりました」で失敗します。同期し直すと `effects.js` が加わります
- コピー先は、`public/js` があれば `public/js/sound/`、なければ `js/sound/`（`--dir` で変えられる。2回目からは lock の場所を使う）
- 写しの先頭には、版を書いた1行が付きます。写しが手で直されていたら、同期は止まります（`--force` で上書きする）
- エンジンを直したら、ここでテストしてから、同期したすべてのゲームに同期します。`check` は、写しが今の `src/` と違えば失敗します
- 新しく同期したファイルは、ゲームの service worker（`sw.js`）のキャッシュの一覧に、手で足します（足さないと、オフラインで BGM が鳴らない）
- エンジンの中に、ほかのゲームの保存の名前（`'xxx.sound'` のような文字列）を書かないでください。`scripts/check-games.mjs` は写しの中の文字列も保存の名前として数えるので、写したゲームどうしで重なりと判定されます

## 開発

必要なもの：Node.js 22 以上（計測には Google Chrome も）。web-games の直下で `npm install` してから使います。

```bash
npm test -w packages/sound                                   # テスト（曲を持つすべてのゲームの曲も検査する）
node packages/sound/tools/lint-songs.mjs                     # 和声の書き間違いと、パートの音域（すべてのゲーム）
node packages/sound/tools/lint-songs.mjs --games abalone     # 1本だけ
node packages/sound/tools/measure.mjs --games abalone,azul   # 書き出して、音量・音割れを数値で確かめる（--games を省くと全部。数分かかる）
node packages/sound/tools/measure.mjs --games abalone --parts --out /tmp/spec   # パートごとの音量と、スペクトログラムの画像
node packages/sound/tools/measure.mjs --extra <候補のファイル>                  # ゲームの外に置いた候補の曲
node packages/sound/tools/measure.mjs --common                                 # 共通の効果音（音量の目安との差・ピーク・響きの長さ。外れたら終了コード1）
node packages/sound/tools/lint-songs.mjs --common                              # 共通の効果音の書き間違いと長さ
```
