/**
 * カードのデータ（基本ゲーム。108枚）
 * label：札に書く短い名前（小さい札で切れないように。にぎりは右上の点で分かる）
 */

export const CARDS = {
    tempura: { name: '天ぷら', count: 14, color: '#8f6bb8', text: '2枚で5点' },
    sashimi: { name: '刺身', count: 14, color: '#5fa35a', text: '3枚で10点' },
    dumpling: { name: '餃子', count: 14, color: '#5b7fc4', text: '1・2・3・4・5枚以上で 1・3・6・10・15点' },
    maki1: { name: '巻き寿司', count: 6, color: '#d2463d', maki: 1, text: '巻き寿司の数が最多で6点、2番目で3点' },
    maki2: { name: '巻き寿司', count: 12, color: '#d2463d', maki: 2, text: '巻き寿司の数が最多で6点、2番目で3点' },
    maki3: { name: '巻き寿司', count: 8, color: '#d2463d', maki: 3, text: '巻き寿司の数が最多で6点、2番目で3点' },
    egg: { name: '玉子にぎり', label: '玉子', count: 5, color: '#e3a92b', nigiri: 1, text: '1点（わさびの上で3点）' },
    salmon: { name: 'サーモンにぎり', label: 'サーモン', count: 10, color: '#e3a92b', nigiri: 2, text: '2点（わさびの上で6点）' },
    squid: { name: 'イカにぎり', label: 'イカ', count: 5, color: '#e3a92b', nigiri: 3, text: '3点（わさびの上で9点）' },
    wasabi: { name: 'わさび', count: 6, color: '#c9b52c', text: '次のにぎりが3倍' },
    pudding: { name: 'プリン', count: 10, color: '#de7aa6', text: '最後に、最多で6点、最少で−6点' },
    chopsticks: { name: '箸', count: 4, color: '#4aa7b5', text: 'あとの番に、2枚を取れる（箸は手札に戻す）' }
};

export const CARD_ORDER = Object.keys(CARDS);
export const HAND_SIZE = { 2: 10, 3: 9, 4: 8, 5: 7 };
export const ROUNDS = 3;
export const isNigiri = (type) => !!CARDS[type]?.nigiri;
