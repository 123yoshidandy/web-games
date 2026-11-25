/**
 * パワーカード（基本ゲーム・第2版の 66 枚）とモンスター
 * 費用と種類は、BGA の実装（thoun/kingoftokyo）と、第1版のカード表（maltize/KingOfTokyo-CardList）で照らし合わせた
 * 名前は日本語の一般的な訳（日本語版の名前は確かめていない）。効果の文は、ルールの意味を自分の言葉で書いた
 *
 * kind：'keep' 持ち続ける / 'discard' 使い捨て（買ったらすぐ効果を使って捨てる）
 */

const keep = (key, name, cost, text) => ({ key, name, cost, kind: 'keep', text });
const discard = (key, name, cost, text) => ({ key, name, cost, kind: 'discard', text });

export const CARDS = [
    keep('acidAttack', '酸攻撃', 6, '毎回、出目に攻撃を1つ足す'),
    keep('alienOrigin', '異星の生まれ', 3, 'カードを1エネルギー安く買える'),
    keep('alphaMonster', 'アルファモンスター', 5, '攻撃の目を1つ以上出したら、1勝利点'),
    keep('armorPlating', '装甲', 4, 'ちょうど1体力を失うときは、失わない'),
    keep('backgroundDweller', '背景の住人', 4, '3の目は、いつでも振り直せる'),
    keep('burrowing', '地中もぐり', 5, '東京にいる間、出目に攻撃を1つ足す。東京を明け渡すと、入ってきたモンスターは1体力を失う'),
    keep('camouflage', '擬態', 3, '体力を失うとき、失う数だけダイスを振り、ハートの目1つにつき失う体力を1減らす'),
    keep('completeDestruction', '完全破壊', 3, '1・2・3・ハート・攻撃・エネルギーをすべて出したら、9勝利点'),
    keep('mediaFriendly', 'メディアの人気者', 3, 'パワーカードを買うたびに、1勝利点'),
    keep('eaterOfTheDead', '死肉喰らい', 4, 'モンスターの体力が0になるたびに、3勝利点'),
    keep('energyHoarder', 'エネルギーの蓄え', 3, '自分の番の終わりに、6エネルギーにつき1勝利点'),
    keep('evenBigger', 'もっと大きく', 4, '買ったとき体力+2。体力の上限が12になる'),
    keep('extraHead', 'もう1つの頭', 7, 'ダイスが1つ増える'),
    keep('extraHead', 'もう1つの頭', 7, 'ダイスが1つ増える'),
    keep('fireBreathing', '火炎の息', 4, '攻撃の目を1つ以上出したら、席の両隣は1体力を失う'),
    keep('freezeTime', '時間停止', 5, '1・1・1以上を出した番のあと、ダイスを1つ減らしてもう1回手番'),
    keep('friendOfChildren', '子どもの味方', 3, 'エネルギーを得るたびに、さらに1エネルギー'),
    keep('giantBrain', '巨大な脳', 5, '毎番、振り直しが1回増える'),
    keep('gourmet', '美食家', 4, '1・1・1以上を出したら、さらに2勝利点'),
    keep('healingRay', '癒しの光線', 4, '自分のハートの目で、ほかのモンスターを回復できる。相手は1体力につき2エネルギー（最後の1つなら1エネルギー）を払う'),
    keep('herbivore', '草食', 5, '自分の番に誰の体力も減らさなければ、番の終わりに1勝利点'),
    keep('herdCuller', '群れの間引き', 3, '毎番1回、ダイスを1つ1の目にできる'),
    keep('itHasAChild', '子どもがいる', 7, '体力が0になったら、カードをすべて捨て、勝利点をすべて失い、体力10で東京の外から続ける'),
    keep('jets', 'ジェット', 5, '東京を明け渡すことにしたら、その攻撃で体力を失わない'),
    keep('madeInALab', '研究所生まれ', 2, 'カードを買うとき、山札の一番上を見て、買うか戻すかできる'),
    keep('metamorph', '変態', 3, '自分の番の終わりに、持っているカードを捨てて、その費用のエネルギーを得られる'),
    keep('mimic', 'ものまね', 8, '誰かが持つカードを1枚選び、同じカードとして扱う。番の初めに1エネルギーで選び直せる'),
    keep('batteryMonster', 'バッテリーモンスター', 3, '買ったとき6エネルギーを載せる。番の初めに2エネルギーずつ取り、なくなったら捨てる'),
    keep('novaBreath', '新星の息', 7, '攻撃が、ほかのすべてのモンスターに当たる'),
    keep('detritivore', '雑食', 4, '1・2・3を出したら、さらに2勝利点'),
    keep('opportunist', '機会主義', 3, '新しいカードが場に出たら、すぐに買える'),
    keep('parasiticTentacles', '寄生触手', 4, 'ほかのモンスターのカードを、その持ち主に費用を払って買える'),
    keep('plotTwist', 'どんでん返し', 3, '出目を決める前に、ダイスを1つ好きな目にできる。使ったら捨てる'),
    keep('poisonQuills', '毒針', 3, '2・2・2以上を出したら、出目に攻撃を2つ足す'),
    keep('poisonSpit', '毒の唾', 4, '攻撃したモンスターに毒を1つ。毒のあるモンスターは番の終わりに毒1つにつき1体力を失う（ハートの目1つで毒を1つ消せる）'),
    keep('psychicProbe', '念力探査', 3, 'ほかのモンスターの最後の振り直しのあと、ダイスを1つ振り直させられる。ハートが出たらこのカードを捨てる'),
    keep('rapidHealing', '急速回復', 3, 'いつでも2エネルギーで1体力回復（体力が0になるのを防ぐのにも使える）'),
    keep('regeneration', '再生', 4, '体力を回復するとき、さらに1回復'),
    keep('rootingForTheUnderdog', '判官びいき', 3, '自分の番の終わりに、勝利点が一番少なければ1勝利点'),
    keep('shrinkRay', '縮小光線', 6, '攻撃したモンスターに縮小を1つ。縮小1つにつき振るダイスが1つ減る（ハートの目1つで縮小を1つ消せる）'),
    keep('smokeCloud', '煙幕', 4, '煙を3つ載せる。煙1つで振り直しが1回増える。煙がなくなったら捨てる'),
    keep('solarPowered', '太陽光発電', 2, '自分の番の終わりにエネルギーが0なら、1エネルギー'),
    keep('spikedTail', 'とげの尾', 5, '攻撃の目を1つ以上出したら、出目に攻撃を1つ足す'),
    keep('stretchy', '伸縮自在', 3, '出目を決める前に、2エネルギーでダイスを1つ好きな目にできる'),
    keep('energyDrink', 'エナジードリンク', 4, '1エネルギーで、振り直しが1回増える'),
    keep('urbavore', '都市喰らい', 4, '東京で番を始めたら、さらに1勝利点。東京で攻撃の目を出したら、攻撃を1つ足す'),
    keep('weReOnlyMakingItStronger', '逆境に強い', 3, '一度に2体力以上失ったら、1エネルギー'),
    keep('wings', '翼', 6, '2エネルギーで、この番の間は体力を失わない'),
    discard('apartmentBuilding', '集合住宅', 5, '+3勝利点'),
    discard('commuterTrain', '通勤電車', 4, '+2勝利点'),
    discard('cornerStore', '街角の店', 3, '+1勝利点'),
    discard('deathFromAbove', '空からの襲撃', 5, '+2勝利点。東京に入り、ほかのモンスターは東京を明け渡す'),
    discard('energize', '充電', 8, '+9エネルギー'),
    discard('evacuationOrders', '避難命令', 7, 'ほかのモンスターは5勝利点を失う'),
    discard('evacuationOrders', '避難命令', 7, 'ほかのモンスターは5勝利点を失う'),
    discard('flameThrower', '火炎放射器', 3, 'ほかのモンスターは2体力を失う'),
    discard('frenzy', '狂乱', 7, 'この番のあと、もう1回手番'),
    discard('gasRefinery', 'ガス精製所', 6, '+2勝利点。ほかのモンスターは3体力を失う'),
    discard('heal', '治療', 3, '+2体力'),
    discard('highAltitudeBombing', '高高度爆撃', 4, '自分を含むすべてのモンスターは3体力を失う'),
    discard('jetFighters', '戦闘機', 5, '+5勝利点、-4体力'),
    discard('nationalGuard', '州兵', 3, '+2勝利点、-2体力'),
    discard('nuclearPowerPlant', '原子力発電所', 6, '+2勝利点、+3体力'),
    discard('skyscraper', '超高層ビル', 6, '+4勝利点'),
    discard('tank', '戦車', 4, '+4勝利点、-3体力'),
    discard('vastStorm', '大嵐', 6, '+2勝利点。ほかのモンスターは2エネルギーにつき1エネルギーを失う')
];

// 1 枚ごとの id（同じカードが 2 枚あるものは #2）
export const CARD_IDS = (() => {
    const seen = {};
    return CARDS.map(c => {
        seen[c.key] = (seen[c.key] ?? 0) + 1;
        return seen[c.key] > 1 ? `${c.key}#${seen[c.key]}` : c.key;
    });
})();
export const CARD_BY_KEY = Object.fromEntries(CARDS.map(c => [c.key, c]));
export const keyOf = id => id.split('#')[0];
export const cardOf = id => CARD_BY_KEY[keyOf(id)];

// ダイスの目
export const FACES = ['1', '2', '3', 'heart', 'energy', 'claw'];
export const FACE_NAMES = { 1: '1', 2: '2', 3: '3', heart: 'ハート', energy: 'エネルギー', claw: '攻撃' };

// モンスター（第2版の 6 体）。名前は一般的な読み
export const MONSTERS = [
    { key: 'king', name: 'キング', color: '#c0392b' },
    { key: 'gigazaur', name: 'ギガザウルス', color: '#27ae60' },
    { key: 'mekaDragon', name: 'メカドラゴン', color: '#7f8c8d' },
    { key: 'cyberKitty', name: 'サイバーキティ', color: '#e84393' },
    { key: 'spacePenguin', name: 'スペースペンギン', color: '#2980b9' },
    { key: 'alienoid', name: 'エイリアノイド', color: '#e67e22' }
];

export const MAX_HEALTH = 10;
export const WIN_POINTS = 20;
