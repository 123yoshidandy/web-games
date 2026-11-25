/**
 * カード（基本セット：交易デッキ80枚、エクスプローラー10枚、最初のデッキのスカウトとバイパー）
 * 効果はデータで書き、game.js が読む
 *   trade・combat・authority・draw：数を足す／引く
 *   or：[効果の列, 効果の列] のどちらかを選ぶ
 *   oppDiscard：相手は次の手番の始めに1枚捨てる
 *   scrapRow：交易の列の1枚を廃棄してよい
 *   scrapHandOrDiscard：手札か捨て札の n 枚まで廃棄してよい
 *   destroyBase：相手の基地1つを破壊してよい（前哨があっても選べる）
 *   topdeckNext：この手番に次に獲得する艦を山札の上に置く
 *   drawIfBases：基地が n 個以上あれば draw 枚引く
 *   copyShip：この手番に出したほかの艦の効果を写す（勢力も写す）
 *   allyAll：すべての勢力の同盟として数える
 *   freeShipTop：交易の列の艦1枚をただで獲得し、山札の上に置く
 *   drawPerBlob：この手番に出したブロブのカード1枚につき1枚引く
 *   fleetHq：この手番に出す艦それぞれに戦闘+1
 *   drawThenScrapHand：1枚引いてから、手札1枚を廃棄する
 *   brainWorld：手札か捨て札の2枚まで廃棄し、廃棄した数だけ引く
 *   recycle：手札を2枚まで捨て、捨てた数だけ引く
 */

export const FACTIONS = {
    federation: { name: '交易連合', color: '#3d8fd6' },
    blob: { name: 'ブロブ', color: '#3fa34d' },
    machine: { name: '機械教団', color: '#d2453b' },
    empire: { name: '星の帝国', color: '#d9a92c' },
    none: { name: '無所属', color: '#8a93a3' }
};

// type: ship（艦）・base（基地）・outpost（前哨）
const C = (key, name, faction, cost, count, type, defense, primary = [], ally = [], scrap = []) => ({ key, name, faction, cost, count, type, defense, primary, ally, scrap });

export const TRADE_CARDS = [
    // 交易連合
    C('federationShuttle', '連邦シャトル', 'federation', 1, 3, 'ship', 0, [{ trade: 2 }], [{ authority: 4 }]),
    C('cutter', 'カッター', 'federation', 2, 3, 'ship', 0, [{ trade: 2 }, { authority: 4 }], [{ combat: 4 }]),
    C('embassyYacht', '大使館ヨット', 'federation', 3, 2, 'ship', 0, [{ authority: 3 }, { trade: 2 }, { drawIfBases: { bases: 2, draw: 2 } }]),
    C('freighter', '貨物船', 'federation', 4, 2, 'ship', 0, [{ trade: 4 }], [{ topdeckNext: true }]),
    C('tradeEscort', '交易護衛艦', 'federation', 5, 1, 'ship', 0, [{ authority: 4 }, { combat: 4 }], [{ draw: 1 }]),
    C('flagship', '旗艦', 'federation', 6, 1, 'ship', 0, [{ combat: 5 }, { draw: 1 }], [{ authority: 5 }]),
    C('commandShip', '指揮艦', 'federation', 8, 1, 'ship', 0, [{ authority: 4 }, { combat: 5 }, { draw: 2 }], [{ destroyBase: true }]),
    C('tradingPost', '交易所', 'federation', 3, 2, 'outpost', 4, [{ or: [[{ authority: 1 }], [{ trade: 1 }]] }], [], [{ combat: 3 }]),
    C('barterWorld', '交換の星', 'federation', 4, 2, 'base', 4, [{ or: [[{ authority: 2 }], [{ trade: 2 }]] }], [], [{ combat: 5 }]),
    C('defenseCenter', '防衛センター', 'federation', 5, 1, 'outpost', 5, [{ or: [[{ authority: 3 }], [{ combat: 2 }]] }], [{ combat: 2 }]),
    C('portOfCall', '寄港地', 'federation', 6, 1, 'outpost', 6, [{ trade: 3 }], [], [{ draw: 1 }, { destroyBase: true }]),
    C('centralOffice', '中央局', 'federation', 7, 1, 'base', 6, [{ trade: 2 }, { topdeckNext: true }], [{ draw: 1 }]),
    // ブロブ
    C('blobFighter', 'ブロブ戦闘機', 'blob', 1, 3, 'ship', 0, [{ combat: 3 }], [{ draw: 1 }]),
    C('battlePod', 'バトルポッド', 'blob', 2, 2, 'ship', 0, [{ combat: 4 }, { scrapRow: 1 }], [{ combat: 2 }]),
    C('tradePod', '交易ポッド', 'blob', 2, 3, 'ship', 0, [{ trade: 3 }], [{ combat: 2 }]),
    C('ram', 'ラム', 'blob', 3, 2, 'ship', 0, [{ combat: 5 }], [{ combat: 2 }], [{ trade: 3 }]),
    C('blobDestroyer', 'ブロブ駆逐艦', 'blob', 4, 2, 'ship', 0, [{ combat: 6 }], [{ destroyBase: true }, { scrapRow: 1 }]),
    C('battleBlob', 'バトルブロブ', 'blob', 6, 1, 'ship', 0, [{ combat: 8 }], [{ draw: 1 }], [{ combat: 4 }]),
    C('blobCarrier', 'ブロブ空母', 'blob', 6, 1, 'ship', 0, [{ combat: 7 }], [{ freeShipTop: true }]),
    C('mothership', 'マザーシップ', 'blob', 7, 1, 'ship', 0, [{ combat: 6 }, { draw: 1 }], [{ draw: 1 }]),
    C('blobWheel', 'ブロブの輪', 'blob', 3, 3, 'base', 5, [{ combat: 1 }], [], [{ trade: 3 }]),
    C('theHive', 'ハイヴ', 'blob', 5, 1, 'base', 5, [{ combat: 3 }], [{ draw: 1 }]),
    C('blobWorld', 'ブロブの星', 'blob', 8, 1, 'base', 7, [{ or: [[{ combat: 5 }], [{ drawPerBlob: true }]] }]),
    // 機械教団
    C('tradeBot', '交易ボット', 'machine', 1, 3, 'ship', 0, [{ trade: 1 }, { scrapHandOrDiscard: 1 }], [{ combat: 2 }]),
    C('missileBot', 'ミサイルボット', 'machine', 2, 3, 'ship', 0, [{ combat: 2 }, { scrapHandOrDiscard: 1 }], [{ combat: 2 }]),
    C('supplyBot', '補給ボット', 'machine', 3, 3, 'ship', 0, [{ trade: 2 }, { scrapHandOrDiscard: 1 }], [{ combat: 2 }]),
    C('patrolMech', '哨戒メック', 'machine', 4, 2, 'ship', 0, [{ or: [[{ trade: 3 }], [{ combat: 5 }]] }], [{ scrapHandOrDiscard: 1 }]),
    C('stealthNeedle', 'ステルスニードル', 'machine', 4, 1, 'ship', 0, [{ copyShip: true }]),
    C('battleMech', 'バトルメック', 'machine', 5, 1, 'ship', 0, [{ combat: 4 }, { scrapHandOrDiscard: 1 }], [{ draw: 1 }]),
    C('missileMech', 'ミサイルメック', 'machine', 6, 1, 'ship', 0, [{ combat: 6 }, { destroyBase: true }], [{ draw: 1 }]),
    C('battleStation', 'バトルステーション', 'machine', 3, 2, 'outpost', 5, [], [], [{ combat: 5 }]),
    C('mechWorld', 'メックの星', 'machine', 5, 1, 'outpost', 6, [{ allyAll: true }]),
    C('junkyard', 'ジャンクヤード', 'machine', 6, 1, 'outpost', 5, [{ scrapHandOrDiscard: 1 }]),
    C('machineBase', '機械基地', 'machine', 7, 1, 'outpost', 6, [{ drawThenScrapHand: true }]),
    C('brainWorld', '頭脳の星', 'machine', 8, 1, 'outpost', 6, [{ brainWorld: true }]),
    // 星の帝国
    C('imperialFighter', '帝国戦闘機', 'empire', 1, 3, 'ship', 0, [{ combat: 2 }, { oppDiscard: 1 }], [{ combat: 2 }]),
    C('corvette', 'コルベット', 'empire', 2, 2, 'ship', 0, [{ combat: 1 }, { draw: 1 }], [{ combat: 2 }]),
    C('imperialFrigate', '帝国フリゲート', 'empire', 3, 3, 'ship', 0, [{ combat: 4 }, { oppDiscard: 1 }], [{ combat: 2 }], [{ draw: 1 }]),
    C('surveyShip', '調査船', 'empire', 3, 3, 'ship', 0, [{ trade: 1 }, { draw: 1 }], [], [{ oppDiscard: 1 }]),
    C('battlecruiser', '巡洋戦艦', 'empire', 6, 1, 'ship', 0, [{ combat: 5 }, { draw: 1 }], [{ oppDiscard: 1 }], [{ draw: 1 }, { destroyBase: true }]),
    C('dreadnaught', 'ドレッドノート', 'empire', 7, 1, 'ship', 0, [{ combat: 7 }, { draw: 1 }], [], [{ combat: 5 }]),
    C('spaceStation', '宇宙ステーション', 'empire', 4, 2, 'outpost', 4, [{ combat: 2 }], [{ combat: 2 }], [{ trade: 4 }]),
    C('recyclingStation', 'リサイクルステーション', 'empire', 4, 2, 'outpost', 4, [{ or: [[{ trade: 1 }], [{ recycle: 2 }]] }]),
    C('warWorld', '戦争の星', 'empire', 5, 1, 'outpost', 4, [{ combat: 3 }], [{ combat: 4 }]),
    C('royalRedoubt', '王の砦', 'empire', 6, 1, 'outpost', 6, [{ combat: 3 }], [{ oppDiscard: 1 }]),
    C('fleetHq', '艦隊司令部', 'empire', 8, 1, 'base', 8, [{ fleetHq: true }])
];

export const EXPLORER = C('explorer', 'エクスプローラー', 'none', 2, 10, 'ship', 0, [{ trade: 2 }], [], [{ combat: 2 }]);
export const SCOUT = C('scout', 'スカウト', 'none', 0, 8, 'ship', 0, [{ trade: 1 }]);
export const VIPER = C('viper', 'バイパー', 'none', 0, 2, 'ship', 0, [{ combat: 1 }]);

export const CARDS = Object.fromEntries([...TRADE_CARDS, EXPLORER, SCOUT, VIPER].map(c => [c.key, c]));

export const STARTING_AUTHORITY = 50;
export const HAND_SIZE = 5;
export const FIRST_HAND = 3;
export const ROW_SIZE = 5;

export const isBase = (key) => CARDS[key].type !== 'ship';
