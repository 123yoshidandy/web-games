/**
 * カードの定義（2019年の改訂版。21枚、0〜9）
 * カードは値（0〜9）で表す。値ごとに種類が1つなので、値がそのまま種類になる
 * 名前は日本語版（アークライト）の名前に合わせ、改訂版で増えたスパイ・宰相は一般的な訳にした
 */

export const CARDS = [
    { value: 0, name: 'スパイ', en: 'Spy', count: 2, text: '効果なし。ラウンドの終わりに、残っている人のうち自分だけがスパイを捨てていれば、好意の印を1つもらう' },
    { value: 1, name: '兵士', en: 'Guard', count: 6, text: 'ほかの人を1人選び、兵士以外のカードを言い当てる。当たればその人は脱落' },
    { value: 2, name: '道化', en: 'Priest', count: 2, text: 'ほかの人を1人選び、その人の手札をこっそり見る' },
    { value: 3, name: '騎士', en: 'Baron', count: 2, text: 'ほかの人を1人選び、手札をこっそり比べる。小さい方が脱落（同じなら何もない）' },
    { value: 4, name: '僧侶', en: 'Handmaid', count: 2, text: '次の自分の番まで、ほかの人のカードの効果を受けない' },
    { value: 5, name: '魔術師', en: 'Prince', count: 2, text: '自分を含めて1人選び、その人は手札を捨てて1枚引く（姫を捨てたら脱落）' },
    { value: 6, name: '宰相', en: 'Chancellor', count: 2, text: '山札から2枚引き、手札と合わせた3枚から1枚を残して、2枚を山札の下に戻す' },
    { value: 7, name: '将軍', en: 'King', count: 1, text: 'ほかの人を1人選び、手札を交換する' },
    { value: 8, name: '大臣', en: 'Countess', count: 1, text: '将軍か魔術師と一緒に持っていたら、大臣を出さなければならない' },
    { value: 9, name: '姫', en: 'Princess', count: 1, text: '出したり捨てたりしたら脱落' }
];

export const SPY = 0, GUARD = 1, PRIEST = 2, BARON = 3, HANDMAID = 4, PRINCE = 5, CHANCELLOR = 6, KING = 7, COUNTESS = 8, PRINCESS = 9;
export const VALUES = CARDS.map(c => c.value);
export const cardName = value => CARDS[value].name;
export const TOTAL_CARDS = CARDS.reduce((sum, c) => sum + c.count, 0);

// 人数ごとの、勝つのに要る好意の印の数（2019年版）
export const TOKENS_TO_WIN = { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 };

export function fullDeck() {
    return CARDS.flatMap(c => Array(c.count).fill(c.value));
}

// 相手を選ぶカード（自分は選べない）
export const TARGETS_OTHER = [GUARD, PRIEST, BARON, KING];
