/**
 * ゲームの部品（容疑者・行動タイル・アリバイカード）
 */

// 容疑者9人。color は原作の色（レストレード青・ステルシー緑・バート橙・パイザー白・スミス黄・レーン灰・マダムピンク・グッドリー黒・ガル紫）
// hourglasses はアリバイカードの砂時計の数。CROSS_SUSPECT は、無実と分かって裏返したときに十字路（壁なし）になるタイル
export const SUSPECTS = [
    { key: 'lestrade', name: 'レストレード', hourglasses: 0, color: '#3d64a8' },
    { key: 'stealthy', name: 'ミス・ステルシー', hourglasses: 1, color: '#3f8a52' },
    { key: 'bert', name: 'ジェレミー・バート', hourglasses: 1, color: '#d9822b' },
    { key: 'pizer', name: 'ジョン・パイザー', hourglasses: 1, color: '#e8e4da' },
    { key: 'smith', name: 'ジョン・スミス', hourglasses: 1, color: '#d8b62e' },
    { key: 'lane', name: 'ジョセフ・レーン', hourglasses: 1, color: '#8a8f96' },
    { key: 'madame', name: 'マダム', hourglasses: 2, color: '#d06a9a' },
    { key: 'goodley', name: 'グッドリー', hourglasses: 0, color: '#26292d' },
    { key: 'gull', name: 'ウィリアム・ガル', hourglasses: 1, color: '#7a55a8' }
];
export const CROSS_SUSPECT = 'lane';

export const DETECTIVES = [
    { key: 'holmes', name: 'ホームズ', start: 11 },
    { key: 'watson', name: 'ワトソン', start: 3 },
    { key: 'toby', name: 'トビー', start: 7 }
];

// 行動タイル4枚（表と裏）
export const TOKENS = [
    ['holmes', 'alibi'],
    ['watson', 'toby'],
    ['rotate', 'exchange'],
    ['rotate', 'joker']
];

export const ACTION_NAMES = {
    holmes: 'ホームズ', watson: 'ワトソン', toby: 'トビー',
    joker: 'ジョーカー', rotate: '回転', exchange: '入れ替え', alibi: 'アリバイ'
};

export const ROUNDS = 8;
export const HOURGLASSES_TO_WIN = 6;
