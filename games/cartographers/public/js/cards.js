/**
 * カートグラファー（基本ゲーム）のデータ：地図（A 面）・探索カード13枚・襲撃カード4枚・得点カード16枚・季節
 *
 * 公開されている実装を照らし合わせて作った
 * - 地図 A 面の山と廃墟：b34nst4lk/cartographer（maps.gleam）と murtll/cartographers（wildlands.json）が一致
 * - 探索カードの形・地形・時間・コイン：b34nst4lk/cartographer（cards.gleam）、koraytugay/cartographers-deck-engine
 *   （explore-cards-data.js）、Iamtazy/cartographers-online（gameObjectMappings.js）の3つ。
 *   12枚は3つとも一致。小村のコインつきの形だけ、2つ（L 字の3マス）と1つ（横2マス）に分かれ、多数に従った
 * - 襲撃カードの形・始める角・向き：b34nst4lk・koraytugay・Iamtazy で形と角と向きの組は一致。
 *   名前と形の組は b34nst4lk と Iamtazy が一致したので、それに従った（向きは、時計回り＝地図を左へ渡す）
 * - 得点カード：b34nst4lk（cards.gleam）と JorenC/cartographers（scoringCards.ts）の文と点が一致
 * - 季節の長さ：b34nst4lk（deck.gleam）と Iamtazy で一致（8・8・7・6）
 * カードの名前と文は、自分で訳した
 */

export const SIZE = 11;
export const TERRAINS = ['forest', 'village', 'farm', 'water', 'monster'];   // 描ける地形（山は描けない）
export const TERRAIN_NAMES = { forest: '森', village: '村', farm: '畑', water: '水', monster: '異形', mountain: '山' };

// 形は文字の行で書く（# が描くマス）
const shape = (...rows) => rows.flatMap((row, r) => [...row].map((ch, c) => (ch === '#' ? [r, c] : null)).filter(Boolean));

// 地図 A 面。行・列は 0 から
export const MOUNTAINS = [[1, 3], [2, 8], [5, 5], [8, 2], [9, 7]];
export const RUINS = [[1, 5], [2, 1], [2, 9], [8, 1], [8, 9], [9, 5]];

// 探索カード。variants：選べる「形と地形」の組（coin：描くとコインを1枚得る）
const v = (cells, terrain, coin = false) => ({ cells, terrain, coin });
export const EXPLORE_CARDS = [
    { id: 'hinterland', name: '奥地の小川', time: 2, variants: [v(shape('###', '#..', '#..'), 'farm'), v(shape('###', '#..', '#..'), 'water')] },
    { id: 'homestead', name: '開拓地', time: 2, variants: [v(shape('#.', '##', '#.'), 'village'), v(shape('#.', '##', '#.'), 'farm')] },
    { id: 'orchard', name: '果樹園', time: 2, variants: [v(shape('###', '..#'), 'forest'), v(shape('###', '..#'), 'farm')] },
    { id: 'treetop', name: '樹上の村', time: 2, variants: [v(shape('..##', '###.'), 'forest'), v(shape('..##', '###.'), 'village')] },
    { id: 'marshlands', name: '沼地', time: 2, variants: [v(shape('#..', '###', '#..'), 'forest'), v(shape('#..', '###', '#..'), 'water')] },
    { id: 'fishing', name: '漁村', time: 2, variants: [v(shape('####'), 'village'), v(shape('####'), 'water')] },
    { id: 'river', name: '大河', time: 1, variants: [v(shape('#', '#', '#'), 'water', true), v(shape('..#', '.##', '##.'), 'water')] },
    { id: 'farmland', name: '農地', time: 1, variants: [v(shape('#', '#'), 'farm', true), v(shape('.#.', '###', '.#.'), 'farm')] },
    { id: 'forgotten', name: '忘れられた森', time: 1, variants: [v(shape('#.', '.#'), 'forest', true), v(shape('#.', '##', '.#'), 'forest')] },
    { id: 'hamlet', name: '小村', time: 1, variants: [v(shape('#.', '##'), 'village', true), v(shape('###', '##.'), 'village')] },
    { id: 'rift', name: '裂け目の地', time: 0, variants: TERRAINS.map(t => v(shape('#'), t)) }
];
export const RUINS_CARDS = [
    { id: 'temple', name: '神殿の廃墟' },
    { id: 'outpost', name: '砦の廃墟' }
];

// 襲撃カード。形は回さないときの向き。corner と clockwise はソロで描く場所を探す順（多人数では地図を渡す向き）
export const AMBUSH_CARDS = [
    { id: 'goblin', name: 'ゴブリンの襲撃', cells: shape('#..', '.#.', '..#'), corner: 'bottom-right', clockwise: false },
    { id: 'bugbear', name: 'バグベアの強襲', cells: shape('#.#', '#.#'), corner: 'top-right', clockwise: true },
    { id: 'gnoll', name: 'ノールの急襲', cells: shape('##', '#.', '##'), corner: 'top-left', clockwise: false },
    { id: 'kobold', name: 'コボルドの猛攻', cells: shape('#.', '##', '#.'), corner: 'bottom-left', clockwise: true }
];

// 得点カード（王の勅令の下に置く）。4つの組から1枚ずつ
export const EDICT_CARDS = [
    { id: 'sentinel-wood', group: 'forest', name: '見張りの森', text: '地図の端に接する森のマス1つにつき1点' },
    { id: 'greenbough', group: 'forest', name: '緑の枝', text: '森のマスが1つ以上ある行と列1つにつき1点（同じ森が行と列の両方で数えられる）' },
    { id: 'treetower', group: 'forest', name: '樹の塔', text: '上下左右がすべて、埋まったマスか地図の端である森のマス1つにつき1点' },
    { id: 'stoneside-forest', group: 'forest', name: '石の森', text: '森のかたまりで別の山とつながっている山1つにつき3点' },
    { id: 'wildholds', group: 'village', name: '荒野の砦', text: '6マス以上の村のかたまり1つにつき8点' },
    { id: 'great-city', group: 'village', name: '大都市', text: '山に接していない村のかたまりのうち、最も大きいものの村のマス1つにつき1点' },
    { id: 'shieldgate', group: 'village', name: '盾の門', text: '2番目に大きい村のかたまりの村のマス1つにつき2点（最も大きいものが複数あれば、その1つ）' },
    { id: 'greengold-plains', group: 'village', name: '緑金の平原', text: '3種類以上の地形に接している村のかたまり1つにつき3点' },
    { id: 'canal-lake', group: 'farm-water', name: '運河の湖', text: '畑に接する水のマス1つにつき1点。水に接する畑のマス1つにつき1点' },
    { id: 'golden-granary', group: 'farm-water', name: '黄金の穀倉', text: '廃墟のマスに接する水のマス1つにつき1点。廃墟のマスの上の畑1つにつき3点' },
    { id: 'mages-valley', group: 'farm-water', name: '魔術師の谷', text: '山に接する水のマス1つにつき2点。山に接する畑のマス1つにつき1点' },
    { id: 'shoreside-expanse', group: 'farm-water', name: '岸辺の広がり', text: '水にも地図の端にも接していない畑のかたまり1つにつき3点。畑にも地図の端にも接していない水のかたまり1つにつき3点' },
    { id: 'borderlands', group: 'arrangement', name: '境界の地', text: 'すべて埋まった行と列1つにつき6点' },
    { id: 'broken-road', group: 'arrangement', name: '途切れた道', text: '地図の左の端と下の端に接する斜めの列で、すべて埋まったもの1つにつき3点' },
    { id: 'lost-barony', group: 'arrangement', name: '失われた男爵領', text: '埋まったマスでできた最も大きい正方形の、1辺のマス1つにつき3点' },
    { id: 'cauldrons', group: 'arrangement', name: '大釜', text: '上下左右がすべて、埋まったマスか地図の端である空きマス1つにつき1点' }
];
export const EDICT_GROUPS = ['forest', 'village', 'farm-water', 'arrangement'];
export const EDICT_LETTERS = ['A', 'B', 'C', 'D'];

// 季節。time に達するまで探索カードをめくり、edicts の2つの勅令で得点する
export const SEASONS = [
    { name: '春', time: 8, edicts: [0, 1] },
    { name: '夏', time: 8, edicts: [1, 2] },
    { name: '秋', time: 7, edicts: [2, 3] },
    { name: '冬', time: 6, edicts: [3, 0] }
];

export const exploreCard = (id) => EXPLORE_CARDS.find(c => c.id === id);
export const ambushCard = (id) => AMBUSH_CARDS.find(c => c.id === id);
export const ruinsCard = (id) => RUINS_CARDS.find(c => c.id === id);
export const edictCard = (id) => EDICT_CARDS.find(c => c.id === id);
