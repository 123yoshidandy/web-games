/**
 * 遊び方（シートに出す HTML）
 */

import { MONSTERS, HEROES, PERKS, TERROR_MAX } from './data.js';
import { monsterBadge } from './map.js';

const badge = (key) => `<svg class="help-badge" viewBox="-11 -11 22 22" aria-hidden="true">${monsterBadge(key, 0, 0, 10)}</svg>`;

export const HELP_HTML = `
<h3>目的</h3>
<p>村に現れた怪物たちを、英雄が力を合わせてすべて退治します。怪物ごとに決まった「目的」を果たすと、退治できるようになります。</p>
<p>恐怖が${TERROR_MAX}に達するか、怪物カード（30枚）が尽きると負けです。怪物の数（2〜4体）が難易度です。</p>

<h3>英雄の手番</h3>
<p>英雄ごとの回数（4か5）までアクションをします。</p>
<ul>
<li><b>移動</b>：隣の地点へ。同じ地点の村人を連れて行ける（地図の光る地点を押す）</li>
<li><b>案内</b>：同じ地点の村人を隣へ、または隣の村人を自分の地点へ</li>
<li><b>拾う</b>：その地点のアイテムを全部持つ</li>
<li><b>共有</b>：同じ地点の英雄とアイテムを渡し合う</li>
<li><b>前進</b>：怪物の目的を1つ進める（アイテムを使う）</li>
<li><b>退治</b>：目的を果たした怪物のいる地点で、アイテムを使って退治する</li>
</ul>
<p>アイテムは赤・青・黄の3色で、数字が強さです。前進と退治では、決まった色の強さの合計を使います。</p>

<h3>怪物の番</h3>
<p>英雄の手番のたびに、怪物カードを1枚めくります。</p>
<ul>
<li>アイテムが袋から出て、それぞれの地点に置かれる</li>
<li>できごと（村人が現れる、怪物が動く、など）</li>
<li>カードに描かれた怪物が、いちばん近い人（英雄・村人）へ近づき、同じ地点なら襲う。<b>狂乱</b>の怪物は、狂乱の印でも動く</li>
</ul>
<p>ダイスの命中1つごとに、英雄はアイテムを1つ捨てて防げます。防がなければ病院へ運ばれ、恐怖が1つ上がります。村人は命中で倒れ、恐怖が1つ上がります。ダイスの力の目では、怪物ごとの力が起きます。</p>

<h3>村人</h3>
<p>村人を家（地点の名前は記録に出ます）まで送り届けると、送った英雄が特典を1枚もらいます。</p>

<h3>怪物</h3>
<dl class="help-list">
${MONSTERS.map(m => `<dt>${badge(m.key)}${m.name}</dt><dd>目的：${m.task}<br>退治：怪物のいる地点で、${{ red: '赤', blue: '青', yellow: '黄' }[m.defeat.color]}の合計${m.defeat.total}以上<br>力：${m.power}</dd>`).join('')}
</dl>

<h3>英雄</h3>
<dl class="help-list">
${HEROES.map(h => `<dt><span class="help-dot" style="background:${h.color}"></span>${h.name}（${h.actions}アクション）</dt><dd>${h.ability}</dd>`).join('')}
</dl>

<h3>特典</h3>
<p>自分の手番に、アクションを使わずに使えます。</p>
<dl class="help-list">
${PERKS.map(p => `<dt>${p.name}</dt><dd>${p.text}</dd>`).join('')}
</dl>

<h3>操作</h3>
<ul>
<li>地図の光る地点を押すと移動。ほかの地点を押すと、その地点の様子を見られる</li>
<li>電球はおすすめの手、ロボットは CPU に1手任せる</li>
<li>操作のたびに途中経過を保存し、タイトルの「続きから」で再開できる</li>
</ul>
`;
