/**
 * ロード・オブ・ウォーターディープのデータ（場所・建物・クエスト・陰謀カード・ロード）
 * 基本セットに沿って揃えた。要求と報酬は原作を参考にした近似で、名前は日本語に訳している
 *
 * 資源の記号：f 戦士・r 盗賊・w 魔法使い・c 僧侶・g 金貨・vp 得点
 * 得るもの（gain）の項目：
 *   f/r/w/c/g/vp … その数を得る
 *   intrigue     … 陰謀カードを引く枚数
 *   quest        … 崖見の宿の表のクエストから選んで取る枚数
 *   pick         … { n, types } 種類の中から好きに選んで n 体取る
 *   pay          … 先に払う金貨（払えないと置けない）
 *   building     … 建築家の会館の建物を1つ、ただで建てる
 */

export const CUBES = ['f', 'r', 'w', 'c'];
export const RESOURCES = ['f', 'r', 'w', 'c', 'g'];
export const RESOURCE_NAME = { f: '戦士', r: '盗賊', w: '魔法使い', c: '僧侶', g: '金貨', vp: '点' };
export const ROUNDS = 8;

// クエストの種類（ロードの目標と、プロットの効果で使う）
export const QUEST_TYPES = ['arcana', 'piety', 'skull', 'war', 'commerce'];
export const QUEST_TYPE_NAME = { arcana: '魔術', piety: '信仰', skull: '謀略', war: '戦争', commerce: '交易', mandatory: '義務' };

// ---- 最初からある場所 ----
// inn0〜2 は崖見の宿の3つの場所、harbor0〜2 は港の3つの場所
export const BASIC_SPACES = [
    { id: 'castle', name: 'ウォーターディープ城', short: '城', gain: { intrigue: 1 }, text: '先手番の印を取り、陰謀カードを1枚引く' },
    { id: 'shop', name: 'オーロラの店', short: 'オーロラの店', gain: { g: 4 }, text: '金貨4を得る' },
    { id: 'tower', name: '黒杖の塔', short: '黒杖の塔', gain: { w: 1 }, text: '魔法使い1を得る' },
    { id: 'field', name: '凱旋の野', short: '凱旋の野', gain: { f: 2 }, text: '戦士2を得る' },
    { id: 'tavern', name: '笑う獅子亭', short: '笑う獅子亭', gain: { r: 2 }, text: '盗賊2を得る' },
    { id: 'plinth', name: '台座の神殿', short: '台座の神殿', gain: { c: 1 }, text: '僧侶1を得る' },
    { id: 'builders', name: '建築家の会館', short: '建築家の会館', gain: {}, text: '金貨を払って建物を1つ建てる。建物に積まれた点も得る' },
    { id: 'inn0', name: '崖見の宿', short: '宿', gain: { quest: 1, g: 2 }, text: '表のクエストを1枚取り、金貨2を得る' },
    { id: 'inn1', name: '崖見の宿', short: '宿', gain: { quest: 1, intrigue: 1 }, text: '表のクエストを1枚取り、陰謀カードを1枚引く' },
    { id: 'inn2', name: '崖見の宿', short: '宿', gain: { quest: 1 }, text: '表のクエストを全部入れ替えてから、1枚取る' },
    { id: 'harbor0', name: 'ウォーターディープ港', short: '港', gain: {}, text: '陰謀カードを1枚使う。ラウンドの終わりに、空いている場所へ置き直す' },
    { id: 'harbor1', name: 'ウォーターディープ港', short: '港', gain: {}, text: '陰謀カードを1枚使う。ラウンドの終わりに、空いている場所へ置き直す' },
    { id: 'harbor2', name: 'ウォーターディープ港', short: '港', gain: {}, text: '陰謀カードを1枚使う。ラウンドの終わりに、空いている場所へ置き直す' }
];
export const SPACE_BY_ID = Object.fromEntries(BASIC_SPACES.map(s => [s.id, s]));
export const HARBORS = ['harbor0', 'harbor1', 'harbor2'];
export const INNS = ['inn0', 'inn1', 'inn2'];

const ANY = ['f', 'r', 'w', 'c'];

// ---- 建築家の会館で建てる建物 ----
// owner：ほかの人がこの建物を使ったときに、持ち主が得るもの
// special：palace（大使を取る）・zoar（相手が置いた場所を使う）・stone（建物の数だけ金貨）・garden（取ったクエストをすぐ達成すると4点）
export const BUILDINGS = [
    { id: 'caravan', name: '隊商の中庭', cost: 4, gain: { f: 2 }, owner: { f: 1 } },
    { id: 'horn', name: '金の角笛亭', cost: 4, gain: { g: 4 }, owner: { g: 2 } },
    { id: 'helmstar', name: 'ヘルムスター倉庫', cost: 3, gain: { r: 2, g: 2 }, owner: { r: 1 } },
    { id: 'skulkway', name: '忍び小路', cost: 4, gain: { f: 1, r: 1, g: 2 }, owner: { pick: { n: 1, types: ['f', 'r'] } } },
    { id: 'smuggler', name: '密輸人の波止場', cost: 4, gain: { pay: 2, pick: { n: 4, types: ['f', 'r'] } }, owner: { g: 2 } },
    { id: 'wonder', name: '驚異の館', cost: 4, gain: { pay: 2, pick: { n: 2, types: ['w', 'c'] } }, owner: { g: 2 } },
    { id: 'moon', name: '月の館', cost: 3, gain: { c: 1, quest: 1 }, owner: { g: 2 } },
    { id: 'heroes', name: '英雄の館', cost: 8, gain: { c: 1, f: 2 }, owner: { pick: { n: 1, types: ['c', 'f'] } } },
    { id: 'fetlock', name: '蹄鉄の中庭', cost: 8, gain: { f: 2, w: 1 }, owner: { pick: { n: 1, types: ['f', 'w'] } } },
    { id: 'spirits', name: '善き霊の館', cost: 3, gain: { f: 1, pick: { n: 1, types: ANY } }, owner: { f: 1 } },
    { id: 'northgate', name: '北の門', cost: 3, gain: { g: 2, pick: { n: 1, types: ANY } }, owner: { vp: 2 } },
    { id: 'dragon', name: '竜の塔', cost: 3, gain: { w: 1, intrigue: 1 }, owner: { intrigue: 1 } },
    { id: 'stone', name: '石の家', cost: 4, gain: {}, special: 'stone', owner: { g: 1 } },
    { id: 'portal', name: '大口亭', cost: 4, gain: { pick: { n: 2, types: ANY } }, owner: { pick: { n: 1, types: ANY } } },
    { id: 'olamn', name: '新オラムン', cost: 8, gain: { w: 2 }, owner: { w: 1 } },
    { id: 'spires', name: '朝の尖塔', cost: 8, gain: { c: 2 }, owner: { c: 1 } },
    { id: 'palace', name: 'ウォーターディープ宮殿', cost: 4, gain: {}, special: 'palace', owner: { vp: 2 } },
    { id: 'zoar', name: 'ゾアスター', cost: 8, gain: {}, special: 'zoar', owner: { vp: 2 } },
    { id: 'voice', name: '声の館', cost: 8, gain: { g: 5, pick: { n: 1, types: ANY } }, owner: { g: 2 } },
    { id: 'garden', name: '英雄の庭', cost: 4, gain: { quest: 1 }, special: 'garden', owner: { vp: 2 } },
    { id: 'waymoot', name: '道の集い', cost: 4, gain: { vp: 3, intrigue: 1 }, owner: { vp: 1 } },
    { id: 'pearls', name: '三つの真珠', cost: 4, gain: { pick: { n: 1, types: ['w', 'c'] }, g: 2 }, owner: { g: 2 } }
];
export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
const SPECIAL_TEXT = {
    stone: '場にある建物1つにつき金貨1を得る',
    palace: '大使を取る。次のラウンドの初めに、だれよりも先に大使を置ける',
    zoar: 'ほかの人が置いた場所を1つ選び、そこに置いたものとして使う',
    garden: '表のクエストを1枚取る。この番にそのクエストを達成すると4点'
};

// ---- クエスト ----
// plot：達成すると、その後ずっと効く効果
//   typeVp（その種類のクエストを達成するたびに2点）・extra（その資源を決まった数得る場所で、もう1つ。金貨なら2）
//   lieutenant（エージェントが1人増える）・roundPick（ラウンドの初めに好きな冒険者1）・buildVp（建物を建てるたびに4点）
const Q = (id, type, name, req, reward, plot) => ({ id, type, name, req, reward, ...(plot ? { plot } : {}) });
export const QUESTS = [
    // 戦争
    Q('w01', 'war', '都市の衛兵の増強', { f: 9, r: 2 }, { vp: 25 }),
    Q('w02', 'war', 'アルトール・モーリンの待ち伏せ', { f: 3, c: 1, r: 1 }, { vp: 8, g: 4 }),
    Q('w03', 'war', '剣歌いの訓練', { f: 3, w: 1 }, { vp: 4, f: 1, w: 1 }),
    Q('w04', 'war', 'ザナサーとの対決', { f: 4, r: 2, w: 1 }, { vp: 20 }),
    Q('w05', 'war', '月の女神の神殿への武器輸送', { f: 4, r: 1, w: 1, g: 2 }, { vp: 9, c: 2 }),
    Q('w06', 'war', 'オークの砦の襲撃', { f: 4, r: 2 }, { vp: 8, g: 4 }),
    Q('w07', 'war', '傭兵の反乱の鎮圧', { f: 4, c: 1 }, { vp: 10 }),
    Q('w08', 'war', '地底からの反乱の撃退', { f: 3, c: 1, r: 1, g: 2 }, { vp: 11, f: 2 }),
    Q('w09', 'war', '副官の登用', { f: 5, c: 1, r: 1, w: 1 }, { vp: 0 }, { kind: 'lieutenant' }),
    Q('w10', 'war', 'グリフォン騎兵の増強', { f: 4, g: 4 }, { vp: 6 }, { kind: 'extra', res: 'f' }),
    Q('w11', 'war', '大口亭の防衛', { f: 3, c: 1 }, { vp: 4 }, { kind: 'typeVp', qtype: 'war' }),
    // 魔術
    Q('a01', 'arcana', '狂魔導師の結社への潜入', { w: 5, g: 2 }, { vp: 25 }),
    Q('a02', 'arcana', '異形の巣の調査', { c: 1, f: 1, w: 2 }, { vp: 13, intrigue: 1 }),
    Q('a03', 'arcana', '古の大魔導師の塔の探索', { f: 1, w: 2, g: 2 }, { vp: 6, intrigue: 2 }),
    Q('a04', 'arcana', '黒杖学院の生徒募集', { f: 1, r: 1, w: 2, g: 4 }, { vp: 6, w: 3 }),
    Q('a05', 'arcana', 'フクロウグマの飼いならし', { c: 1, w: 2 }, { vp: 8, f: 1, g: 2 }),
    Q('a06', 'arcana', '赤の魔術師の間者を暴く', { c: 1, f: 1, r: 2, w: 2, g: 2 }, { vp: 20, intrigue: 1 }),
    Q('a07', 'arcana', '時間魔術の研究', { w: 2, r: 1 }, { vp: 4, w: 1, g: 4 }),
    Q('a08', 'arcana', '古代の門の研究', { c: 1, w: 2 }, { vp: 8 }, { kind: 'typeVp', qtype: 'arcana' }),
    Q('a09', 'arcana', '幸運の塔の防衛', { c: 1, f: 1, r: 1, w: 2 }, { vp: 0 }, { kind: 'roundPick' }),
    Q('a10', 'arcana', '魔導師の宝珠の奪還', { r: 2, w: 2 }, { vp: 6 }, { kind: 'extra', res: 'w' }),
    // 信仰
    Q('p01', 'piety', '知識の神の祠の建立', { c: 5, g: 2 }, { vp: 25 }),
    Q('p02', 'piety', '貴族を夜明けの神へ改宗させる', { c: 2, f: 1 }, { vp: 8, quest: 1 }),
    Q('p03', 'piety', '悪霊払い', { c: 2, f: 2 }, { vp: 8, w: 1 }),
    Q('p04', 'piety', '傷ついた兵士の治療', { c: 2, w: 1, g: 4 }, { vp: 6, f: 4 }),
    Q('p05', 'piety', '闇の女神の隠れ神殿の発見', { c: 2, f: 1, r: 1 }, { vp: 10, quest: 1 }),
    Q('p06', 'piety', '正義の神の聖騎士の募集', { c: 2, f: 4, g: 4 }, { vp: 10, c: 3 }),
    Q('p07', 'piety', '冥界への門の封印', { c: 2, r: 2, g: 4 }, { vp: 13 }),
    Q('p08', 'piety', '吸血鬼の巣の殲滅', { c: 2, f: 2, r: 1 }, { vp: 11, g: 4 }),
    Q('p09', 'piety', '愛の女神の祭りの開催', { c: 2, g: 4 }, { vp: 4 }, { kind: 'typeVp', qtype: 'piety' }),
    Q('p10', 'piety', '民衆への奇跡', { c: 2, f: 1, g: 4 }, { vp: 5 }, { kind: 'extra', res: 'c' }),
    // 謀略
    Q('s01', 'skull', '闇の公爵への盗品の横流し', { r: 3, f: 1 }, { vp: 6, g: 4 }),
    Q('s02', 'skull', '監獄からの脱獄', { r: 4, f: 2, w: 1 }, { vp: 14, f: 2 }),
    Q('s03', 'skull', '対抗する組織の乗っ取り', { r: 4, f: 1, c: 1 }, { vp: 10, g: 4 }),
    Q('s04', 'skull', '地下港での名声', { r: 3, f: 1, w: 1, g: 4 }, { vp: 10, intrigue: 1 }),
    Q('s05', 'skull', '盗品の調達', { r: 3, g: 6 }, { vp: 8, intrigue: 2 }),
    Q('s06', 'skull', '夜警の数を減らす', { r: 4, f: 1, c: 1, g: 4 }, { vp: 9, r: 4 }),
    Q('s07', 'skull', '銀の手の呪文書を盗む', { r: 4, w: 2 }, { vp: 7, g: 4, intrigue: 2 }),
    Q('s08', 'skull', '城への密偵の配置', { r: 4, g: 4 }, { vp: 8 }, { kind: 'typeVp', qtype: 'skull' }),
    Q('s09', 'skull', '建築家の会館への潜入', { r: 4, g: 4 }, { vp: 6 }, { kind: 'buildVp' }),
    Q('s10', 'skull', '船大工の買収', { r: 4, w: 1, g: 4 }, { vp: 10 }, { kind: 'extra', res: 'r' }),
    // 交易
    Q('c01', 'commerce', '新しい商人ギルドの設立', { c: 1, f: 2, g: 4 }, { vp: 8, intrigue: 2 }),
    Q('c02', 'commerce', '豊穣の神の地下墓所の盗掘', { c: 1, r: 3, g: 2 }, { vp: 7, intrigue: 1 }),
    Q('c03', 'commerce', '北の都の職人を招く', { f: 1, c: 1, r: 1, g: 2 }, { vp: 4, building: 1 }),
    Q('c04', 'commerce', '建築家の設計図の入手', { f: 1, r: 1, w: 1, g: 4 }, { vp: 10 }),
    Q('c05', 'commerce', '名家の貴族への成りすまし', { c: 1, f: 2, r: 2, w: 1, g: 4 }, { vp: 18 }),
    Q('c06', 'commerce', '歩く像をなだめる', { c: 2, r: 2, w: 1, g: 4 }, { vp: 14 }),
    Q('c07', 'commerce', '北の魔女たちとの同盟', { c: 2, w: 1, g: 6 }, { vp: 12 }),
    Q('c08', 'commerce', '隊商の護衛', { f: 2, r: 1, g: 4 }, { vp: 7 }),
    Q('c09', 'commerce', '商家との同盟', { r: 2, w: 1, g: 4 }, { vp: 6 }, { kind: 'typeVp', qtype: 'commerce' }),
    Q('c10', 'commerce', '月の海の航路の開拓', { f: 1, r: 1, g: 4 }, { vp: 4 }, { kind: 'extra', res: 'g' })
];

// 義務クエスト（陰謀カードで相手に渡す。持っている間は、ほかのクエストを達成できない）
export const MANDATORY = [
    Q('m1', 'mandatory', '山賊の撃退', { f: 2, w: 1 }, { vp: 2 }),
    Q('m2', 'mandatory', '闇の結社の阻止', { f: 1, r: 1, w: 1 }, { vp: 2 }),
    Q('m3', 'mandatory', '怒れる商人をなだめる', { f: 1, c: 1, w: 1 }, { vp: 4 }),
    Q('m4', 'mandatory', '暴動の鎮圧', { c: 2, f: 1 }, { vp: 4 }),
    Q('m5', 'mandatory', '地底の民の侵入の撃退', { c: 1, r: 2 }, { vp: 2 }),
    Q('m6', 'mandatory', '狂信者の掃討', { c: 1, f: 1, r: 1 }, { vp: 2 })
];
export const QUEST_BY_ID = Object.fromEntries([...QUESTS, ...MANDATORY].map(q => [q.id, q]));

// ---- 陰謀カード ----
// kind：self（自分が得る）と other（相手1人を選んで渡す）・everyone（ほかの全員が好きな冒険者1）
//       attack（ほかの全員がその冒険者1を返す。返せなかった人1人ごとに bonus）・favor（5つから1つ）・mandatory（義務クエストを渡す）
export const INTRIGUES = [
    { id: 'wealth', name: '富の分配', count: 3, kind: 'gift', self: { g: 4 }, other: { g: 2 }, text: '金貨4を得る。相手を1人選び、その人は金貨2を得る' },
    { id: 'call', name: '冒険者の募集', count: 2, kind: 'everyone', self: { pick: { n: 2, types: ANY } }, text: '好きな冒険者2を得る。ほかの全員は、好きな冒険者1を得る' },
    { id: 'favor', name: '頼みごと', count: 3, kind: 'favor', text: '金貨4・戦士2・盗賊2・魔法使い1・僧侶1から1つを得る' },
    { id: 'conscript', name: '徴兵', count: 2, kind: 'gift', self: { f: 2 }, other: { f: 1 }, text: '戦士2を得る。相手を1人選び、その人は戦士1を得る' },
    { id: 'crime', name: '犯罪の波', count: 2, kind: 'gift', self: { r: 2 }, other: { r: 1 }, text: '盗賊2を得る。相手を1人選び、その人は盗賊1を得る' },
    { id: 'faith', name: '善意の寄進', count: 2, kind: 'gift', self: { c: 2 }, other: { c: 1 }, text: '僧侶2を得る。相手を1人選び、その人は僧侶1を得る' },
    { id: 'research', name: '研究協定', count: 2, kind: 'gift', self: { w: 2 }, other: { w: 1 }, text: '魔法使い2を得る。相手を1人選び、その人は魔法使い1を得る' },
    { id: 'ambush', name: '待ち伏せ', count: 2, kind: 'attack', res: 'f', bonus: { f: 1 }, text: 'ほかの全員は戦士1を返す。返せなかった人1人につき、戦士1を得る' },
    { id: 'assassin', name: '暗殺', count: 2, kind: 'attack', res: 'r', bonus: { g: 2 }, text: 'ほかの全員は盗賊1を返す。返せなかった人1人につき、金貨2を得る' },
    { id: 'faithless', name: '信仰の喪失', count: 2, kind: 'attack', res: 'c', bonus: { vp: 2 }, text: 'ほかの全員は僧侶1を返す。返せなかった人1人につき、2点を得る' },
    { id: 'mishap', name: '魔術の失敗', count: 2, kind: 'attack', res: 'w', bonus: { intrigue: 1 }, text: 'ほかの全員は魔法使い1を返す。返せなかった人1人につき、陰謀カードを1枚引く' },
    ...MANDATORY.map(q => ({ id: `mq-${q.id}`, name: `義務：${q.name}`, count: 2, kind: 'mandatory', quest: q.id, text: `相手1人に義務クエスト（${gainText(q.req)}で${q.reward.vp}点）を渡す。渡された人は、これを達成するまでほかのクエストを達成できない` }))
];
export const INTRIGUE_BY_ID = Object.fromEntries(INTRIGUES.map(c => [c.id, c]));
export const FAVOR_OPTIONS = [{ g: 4 }, { f: 2 }, { r: 2 }, { w: 1 }, { c: 1 }];

// ---- ロード（秘密の目標）----
// types の種類のクエストを1枚達成するごとに4点。buildings なら持っている建物1つにつき6点
export const LORDS = [
    { id: 'brianne', name: '吟遊詩人ブリアン', types: ['arcana', 'skull'] },
    { id: 'caladorn', name: '騎士カラドーン', types: ['skull', 'war'] },
    { id: 'durnan', name: '放浪者ダーナン', types: ['commerce', 'war'] },
    { id: 'khelben', name: '大魔導師ケルベン', types: ['arcana', 'war'] },
    { id: 'mirt', name: '金貸しミルト', types: ['commerce', 'piety'] },
    { id: 'nindil', name: '司祭ニンディル', types: ['piety', 'skull'] },
    { id: 'nymara', name: '商人ナイマラ', types: ['commerce', 'skull'] },
    { id: 'piergeiron', name: '聖騎士ピアジェイロン', types: ['piety', 'war'] },
    { id: 'sammereza', name: '豪商サメレザ', types: ['arcana', 'commerce'] },
    { id: 'danilo', name: '魔術師ダニロ', types: ['arcana', 'piety'] },
    { id: 'larissa', name: '踊り子ラリッサ', types: [], buildings: true }
];
export const LORD_BY_ID = Object.fromEntries(LORDS.map(l => [l.id, l]));

export function lordText(lord) {
    if (lord.buildings) return '終わりに、持っている建物1つにつき6点';
    return `終わりに、${lord.types.map(t => QUEST_TYPE_NAME[t]).join('と')}のクエスト1枚につき4点`;
}

// ---- 文章 ----

export function gainText(gain) {
    const parts = [];
    if (gain.pay) parts.push(`金貨${gain.pay}を払い`);
    RESOURCES.forEach(r => { if (gain[r]) parts.push(`${RESOURCE_NAME[r]}${gain[r]}`); });
    if (gain.pick) {
        const { n, types } = gain.pick;
        const names = types.map(t => RESOURCE_NAME[t]).join('か');
        parts.push(types.length === 4 ? `好きな冒険者${n}` : n === 1 ? `${names}1` : `${names}を合わせて${n}`);
    }
    if (gain.vp) parts.push(`${gain.vp}点`);
    if (gain.intrigue) parts.push(`陰謀カード${gain.intrigue}枚`);
    if (gain.quest) parts.push(`表のクエスト${gain.quest}枚`);
    if (gain.building) parts.push('建物を1つただで建てる');
    return parts.join('・');
}

export function buildingText(b) {
    return SPECIAL_TEXT[b.special] ?? `${gainText(b.gain)}を得る`;
}

export const PLOT_TEXT = {
    typeVp: (p) => `${QUEST_TYPE_NAME[p.qtype]}のクエストを達成するたびに2点`,
    extra: (p) => (p.res === 'g' ? '場所で金貨を得るたびに、もう金貨2' : `場所で${RESOURCE_NAME[p.res]}を決まった数得るたびに、もう1体`),
    lieutenant: () => 'エージェントが1人増える',
    roundPick: () => 'ラウンドの初めに、好きな冒険者1を得る',
    buildVp: () => '建物を建てるたびに4点'
};

export const plotText = (plot) => PLOT_TEXT[plot.kind](plot);

// 冒険者の数を、資源の価値の目安（戦士・盗賊1、魔法使い・僧侶2、金貨2で1）に直す
export const UNIT = { f: 1, r: 1, w: 2, c: 2, g: 0.5 };
export const units = (req) => RESOURCES.reduce((s, r) => s + (req[r] ?? 0) * UNIT[r], 0);
