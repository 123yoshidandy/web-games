/**
 * キャラクター16人（基本ゲーム）と、役割・ダイスのデータ
 * 能力の説明文は自分で書いたもの（公式の文を写していない）
 */

// 体力は保安官なら +2 する
export const CHARACTERS = [
    { id: 'bart', short: 'バート', name: 'バート・キャシディ', life: 8, ability: '撃たれて体力を失う代わりに、矢を取ってよい' },
    { id: 'blackjack', short: 'ジャック', name: 'ブラック・ジャック', life: 8, ability: 'ダイナマイトも振り直せる（3つ以上出たときを除く）' },
    { id: 'calamity', short: 'カラミティ', name: 'カラミティ・ジャネット', life: 8, ability: '1と2を入れ替えて使える' },
    { id: 'gringo', short: 'グリンゴ', name: 'エル・グリンゴ', life: 7, ability: '自分の体力を減らした人は、矢を1本取る' },
    { id: 'jesse', short: 'ジェシー', name: 'ジェシー・ジョーンズ', life: 9, ability: '体力4以下で自分にビールを使うと、2回復する' },
    { id: 'jourdonnais', short: 'ジョルドネ', name: 'ジョルドネ', life: 7, ability: 'インディアンの襲撃では、1しか失わない' },
    { id: 'kit', short: 'キット', name: 'キット・カールソン', life: 7, ability: 'ガトリング1つごとに、だれかの矢を1本捨てられる' },
    { id: 'lucky', short: 'ラッキー', name: 'ラッキー・デューク', life: 8, ability: '振り直しが1回多い' },
    { id: 'paul', short: 'ポール', name: 'ポール・レグレット', life: 9, ability: 'ガトリングで体力を失わない' },
    { id: 'pedro', short: 'ペドロ', name: 'ペドロ・ラミレス', life: 8, ability: '失った1点ごとに、自分の矢を1本捨ててよい' },
    { id: 'rose', short: 'ローズ', name: 'ローズ・ドゥーラン', life: 9, ability: '1と2で、1つ遠い席も撃てる' },
    { id: 'sid', short: 'シド', name: 'シド・ケッチャム', life: 8, ability: '手番のはじめに、だれか1人を1回復させる' },
    { id: 'slab', short: 'スラブ', name: 'スラブ・ザ・キラー', life: 8, ability: '手番に1回、ビールを足して1か2を2点にできる' },
    { id: 'suzy', short: 'スージー', name: 'スージー・ラファイエット', life: 8, ability: '振り終えて1も2もなければ、2回復する' },
    { id: 'vulture', short: 'ヴァルチャー', name: 'ヴァルチャー・サム', life: 9, ability: 'ほかの人が脱落するたびに、2回復する' },
    { id: 'willy', short: 'ウィリー', name: 'ウィリー・ザ・キッド', life: 8, ability: 'ガトリングは2つで撃てる' }
];
export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

export const ROLE_NAMES = { sheriff: '保安官', deputy: '副保安官', outlaw: '無法者', renegade: '裏切り者' };

// 人数ごとの役割（3人は保安官なしの特別な決まり）
export const ROLES_BY_PLAYERS = {
    3: ['deputy', 'outlaw', 'renegade'],
    4: ['sheriff', 'renegade', 'outlaw', 'outlaw'],
    5: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'deputy'],
    6: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy'],
    7: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy'],
    8: ['sheriff', 'renegade', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy']
};

// ダイスの6つの面
export const FACES = ['arrow', 'dynamite', '1', '2', 'beer', 'gatling'];
export const FACE_NAMES = { arrow: '矢', dynamite: 'ダイナマイト', 1: '1', 2: '2', beer: 'ビール', gatling: 'ガトリング' };

export const DICE_COUNT = 5;
export const ARROWS = 9;
export const ROLLS = 3;          // 最初の1回と振り直し2回
export const SHERIFF_BONUS = 2;
export const VULTURE_HEAL = 2;
