/**
 * 遊び方（自分で書いた説明。公式のルールブックの文は写していない）
 */

import { tileSvg } from './art.js';

const t = (kind, o = 0) => `<span class="help-tile">${tileSvg(kind, o)}</span>`;

export const HELP_HTML = `
<h2 tabindex="-1" autofocus>遊び方</h2>
<h3>目的</h3>
<p>自分のボードに道と線路を描き、まわりの<strong>出口</strong>どうしをつなぎます。同じつながりに入った出口が多いほど、大きな点になります。</p>
<h3>ラウンド</h3>
<p>全部で7ラウンド。毎ラウンド、ダイス4つの目を全員が自分のボードに描きます。目は回しても裏返してもかまいません。</p>
<div class="help-tiles">${t('road-straight')}${t('road-curve')}${t('road-t')}${t('rail-straight')}${t('rail-curve')}${t('rail-t')}</div>
<div class="help-tiles">${t('overpass')}${t('station-straight')}${t('station-curve')}</div>
<ul class="help-list">
    <li>4つの目は全部描きます（どこにも描けない目だけ飛ばせます）</li>
    <li>描くマスは、出口か、描いてある道・線路に、少なくとも1辺でつながること</li>
    <li>道と線路は直接つなげません。<strong>駅</strong>（黒い四角）でつなぎます。<strong>高架</strong>は交わるだけで、つながりません</li>
    <li><strong>特別なタイル</strong>6つは、ダイスの目に加えて描けます。1ラウンドに1つまで、ゲーム全体で3つまで、それぞれ1回だけ</li>
</ul>
<h3>得点</h3>
<ul class="help-list">
    <li><strong>出口</strong>：同じつながりの出口の数で 2→4・3→8・4→12・5→16・6→20・7→24・8→28・9→32・10→36・11→40・12→45点</li>
    <li><strong>一番長い道・線路</strong>：枝分かれを含まない一本の流れのマスの数（駅では途切れない）</li>
    <li><strong>中央の9マス</strong>：描いたマス1つにつき1点</li>
    <li><strong>減点</strong>：どこにもつながっていない端1つにつき −1（外周に向いた端は減点しません）</li>
</ul>
<p>同点なら、減点の少ない人の勝ちです。</p>
<h3>操作</h3>
<p>上のダイスか特別なタイルを押し、ボードのマスを押すと、置いたときの姿が出ます。回す・裏返すで向きを変え、「描く」で描きます。描けるマスは緑に光ります。描けない向きのときは、下に理由が出ます。描き終えたら「次へ」。そのラウンドに描いたものは、取り消せます。</p>`;
