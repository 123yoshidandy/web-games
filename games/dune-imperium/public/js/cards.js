/**
 * デューン 砂の惑星：インペリウムのデータ（場所・カード・紛争・陰謀・リーダー）
 * カードの名前は原作の登場人物などに合わせ、効果は言い換えて数を整えている（原作の文をそのまま写していない）
 *
 * 効果は「効果の部品」の配列で書く（game.js の resolve が1つずつ処理する）
 *   { solari: n } { spice: n } { water: n }  資源を得る
 *   { troops: n }   部隊を駐屯地に加える      { draw: n }  カードを引く      { intrigue: n }  陰謀カードを引く
 *   { vp: n }       勝利点                   { persuasion: n } 説得力         { swords: n }  剣（戦力）
 *   { influence: 'emperor' | … | 'any' | 'space' }  影響力 +1（any は好きな勢力、space は置いた場所の勢力）
 *   { trash: 1 }    手札・捨て札・出したカードから1枚を除外してよい        { trashSelf: 1 }  このカードを除外する
 *   { pay: { spice: 2 }, then: [...] }  払ってもよい。払えば then を得る
 *   { choice: [[...], [...]] }  どれか1つ        { bond: 'fremen', then: [...] }  ほかのフレメンのカードも出ていれば
 *   { needInfluence: { fremen: 2 }, then: [...] }  影響力が足りていれば
 *   場所だけの部品：council（評議会の席）・swordmaster（3人目のエージェント）・mentat・foldspace・steal・harvest・sell・control
 */

export const FACTIONS = ['emperor', 'guild', 'bg', 'fremen'];
export const FACTION_NAME = { emperor: '皇帝', guild: 'スペーシングギルド', bg: 'ベネ・ゲセリット', fremen: 'フレメン' };
export const FACTION_SHORT = { emperor: '皇帝', guild: 'ギルド', bg: 'ベネ', fremen: 'フレメン' };
// 影響力が4に届いたとき1度だけ得るもの
export const FACTION_BONUS = { emperor: { troops: 2 }, guild: { solari: 3 }, bg: { intrigue: 1 }, fremen: { water: 1 } };

// エージェントの印（カードの印と同じ印の場所に置ける）
export const ICONS = ['emperor', 'guild', 'bg', 'fremen', 'landsraad', 'city', 'spice'];
export const ICON_NAME = {
    emperor: '皇帝', guild: 'ギルド', bg: 'ベネ・ゲセリット', fremen: 'フレメン',
    landsraad: 'ランドスラード', city: '都市', spice: 'スパイス交易'
};
export const ICON_SHORT = { emperor: '皇', guild: 'ギ', bg: 'ベ', fremen: 'フ', landsraad: 'ラ', city: '都', spice: 'ス' };
export const RES_NAME = { solari: 'ソラリ', spice: 'スパイス', water: '水' };

export const WIN_VP = 10;
export const HAND_SIZE = 5;
export const ROW_SIZE = 5;
export const TROOP_SUPPLY = 12;     // 駐屯地と紛争にいる部隊の合計の上限
export const MAX_INFLUENCE = 6;

// ---- 盤面の場所 ----
// cost：置くときに払う。combat：紛争の場所（部隊を送れる）。desert：スパイスのたまる砂漠。control：支配した人が、だれかが置くたびに得る
export const SPACES = [
    { id: 'conspire', name: '陰謀', icon: 'emperor', cost: { spice: 4 }, effects: [{ solari: 5 }, { troops: 2 }, { intrigue: 1 }] },
    { id: 'wealth', name: '富', icon: 'emperor', effects: [{ solari: 2 }] },
    { id: 'heighliner', name: 'ハイライナー', icon: 'guild', cost: { spice: 6 }, effects: [{ troops: 5 }, { water: 2 }], combat: true },
    { id: 'foldspace', name: '空間の折り畳み', icon: 'guild', effects: [{ foldspace: 1 }] },
    { id: 'breeding', name: '選択交配', icon: 'bg', cost: { spice: 2 }, effects: [{ trash: 1 }, { draw: 2 }] },
    { id: 'secrets', name: '秘密', icon: 'bg', effects: [{ intrigue: 1 }, { steal: 1 }] },
    { id: 'hardy', name: '屈強な戦士', icon: 'fremen', cost: { water: 1 }, effects: [{ troops: 2 }], combat: true },
    { id: 'stillsuits', name: '保水スーツ', icon: 'fremen', effects: [{ water: 1 }], combat: true },
    { id: 'council', name: '最高評議会', icon: 'landsraad', cost: { solari: 5 }, effects: [{ council: 1 }] },
    { id: 'mentat', name: 'メンタート', icon: 'landsraad', cost: { solari: 2 }, effects: [{ draw: 1 }, { mentat: 1 }] },
    { id: 'swordmaster', name: 'ソードマスター', icon: 'landsraad', cost: { solari: 8 }, effects: [{ swordmaster: 1 }] },
    { id: 'rally', name: '部隊の召集', icon: 'landsraad', cost: { solari: 4 }, effects: [{ troops: 4 }] },
    { id: 'oratory', name: '弁論の間', icon: 'landsraad', effects: [{ troops: 1 }, { persuasion: 1 }] },
    { id: 'arrakeen', name: 'アラキーン', icon: 'city', effects: [{ troops: 1 }, { draw: 1 }], combat: true, control: { solari: 1 } },
    { id: 'carthag', name: 'カーセグ', icon: 'city', effects: [{ troops: 1 }, { intrigue: 1 }], combat: true, control: { solari: 1 } },
    { id: 'research', name: '研究所', icon: 'city', cost: { water: 2 }, effects: [{ draw: 3 }], combat: true },
    { id: 'sietch', name: 'シエチ・タブル', icon: 'city', need: { fremen: 2 }, effects: [{ troops: 1 }, { water: 1 }], combat: true },
    { id: 'imperialBasin', name: '帝国盆地', icon: 'spice', effects: [{ harvest: 1 }], combat: true, desert: true, control: { spice: 1 } },
    { id: 'hagga', name: 'ハッガ盆地', icon: 'spice', cost: { water: 1 }, effects: [{ harvest: 2 }], combat: true, desert: true },
    { id: 'greatFlat', name: '大平原', icon: 'spice', cost: { water: 2 }, effects: [{ harvest: 3 }], combat: true, desert: true },
    { id: 'sell', name: 'メランジ売却', icon: 'spice', effects: [{ sell: 1 }] },
    { id: 'contract', name: '交易の契約', icon: 'spice', effects: [{ solari: 3 }] }
];
export const SPACE_BY_ID = Object.fromEntries(SPACES.map(s => [s.id, s]));
export const DESERTS = SPACES.filter(s => s.desert).map(s => s.id);
export const CONTROLLED = SPACES.filter(s => s.control).map(s => s.id);
// メランジの売却：払うスパイス → 得るソラリ
export const SELL_RATES = { 2: 6, 3: 8, 4: 10, 5: 12 };

// ---- カード ----
// icons：エージェントを置ける場所の印。agent：置いたときの効果。reveal：公開したときの効果。acquire：買ったときの効果
const E = 'emperor', G = 'guild', B = 'bg', F = 'fremen', L = 'landsraad', C = 'city', S = 'spice';
const ALL = [E, G, B, F, L, C, S];

const card = (id, name, cost, faction, icons, agent, reveal, copies = 1, extra = {}) => ({ id, name, cost, faction, icons, agent, reveal, copies, ...extra });

// 最初の山札（10枚）
export const STARTER = [
    card('convincing', '説得の言葉', 0, null, [], [], [{ persuasion: 2 }], 2),
    card('dagger', '短剣', 0, null, [L], [], [{ swords: 1 }], 2),
    card('diplomacy', '外交', 0, null, [E, G, B, F], [], [{ persuasion: 1 }], 1),
    card('dunePlanet', '砂の惑星', 0, null, [S], [], [{ persuasion: 1 }], 2),
    card('recon', '偵察', 0, null, [C], [], [{ persuasion: 1 }], 1),
    card('seekAllies', '同盟を求めて', 0, null, [E, G, B, F], [{ trashSelf: 1 }], [], 1),
    card('signet', '印章の指輪', 0, null, [L, C, S], [{ signet: 1 }], [{ persuasion: 1 }], 1)
];

// インペリウムの山札
export const IMPERIUM = [
    // 皇帝
    card('sardaukarInfantry', 'サルダウカーの歩兵', 1, E, [], [], [{ persuasion: 1 }, { swords: 2 }], 2),
    card('imperialSpy', '帝国の密偵', 2, E, [E, L], [{ intrigue: 1 }], [{ persuasion: 1 }, { swords: 1 }], 2),
    card('courtier', '宮廷の侍従', 3, E, [E, L], [{ solari: 2 }], [{ persuasion: 2 }], 2),
    card('sardaukarLegion', 'サルダウカーの軍団', 5, E, [E, L], [{ troops: 2 }], [{ persuasion: 1 }, { swords: 2 }], 1),
    card('fenring', 'フェンリング伯爵', 6, E, [E, L, C], [{ draw: 1 }, { intrigue: 1 }], [{ persuasion: 2 }, { swords: 1 }], 1),
    // スペーシングギルド
    card('guildClerk', 'ギルドの事務官', 2, G, [G, S], [{ trash: 1 }], [{ persuasion: 1 }], 2),
    card('guildBanker', 'ギルドの銀行家', 3, G, [E, G, L], [{ pay: { spice: 2 }, then: [{ solari: 6 }] }], [{ persuasion: 2 }], 1),
    card('guildEnvoy', 'ギルドの使節', 4, G, [G, L], [{ pay: { spice: 3 }, then: [{ influence: 'any' }, { influence: 'any' }] }], [{ persuasion: 2 }], 1),
    card('navigator', 'ギルドの航宙士', 6, G, [G, S], [{ draw: 1 }, { spice: 1 }], [{ persuasion: 3 }], 1),
    card('smugglers', '密輸業者', 3, null, [S], [{ spice: 1 }], [{ persuasion: 1 }, { swords: 1 }], 2),
    // ベネ・ゲセリット
    card('bgInitiate', 'ベネ・ゲセリットの修練者', 3, B, [B, L, C], [{ draw: 1 }], [{ persuasion: 1 }], 2),
    card('otherMemory', '他者の記憶', 4, B, [B], [{ draw: 2 }], [{ persuasion: 1 }], 1),
    card('truthsayer', '真実を語る者', 3, B, [E, B], [{ intrigue: 1 }], [{ persuasion: 2 }], 1),
    card('reverendMother', '教母', 6, B, [B, E], [{ intrigue: 1 }, { draw: 1 }], [{ persuasion: 2 }, { spice: 2 }], 1),
    card('jessica', 'レディ・ジェシカ', 7, B, [B, L, C, S], [{ influence: 'any' }, { draw: 1 }], [{ persuasion: 3 }, { swords: 1 }], 1),
    card('kwisatz', 'クウィサッツ・ハデラック', 8, B, ALL, [{ draw: 2 }], [{ persuasion: 2 }], 1, { anySpace: true }),
    // フレメン
    card('fremenWarrior', 'フレメンの戦士', 2, F, [F], [{ troops: 1 }], [{ swords: 2 }, { bond: F, then: [{ swords: 1 }] }], 2),
    card('crysknife', 'クリスナイフ', 3, F, [F, S], [], [{ swords: 3 }, { bond: F, then: [{ influence: F }] }], 1),
    card('spiceHunter', 'スパイスハンター', 4, F, [F, S], [{ spice: 1 }], [{ persuasion: 1 }, { swords: 1 }, { bond: F, then: [{ spice: 1 }] }], 1),
    card('fremenCamp', 'フレメンの野営地', 4, F, [S], [], [{ persuasion: 2 }, { swords: 1 }], 2),
    card('stilgar', 'スティルガー', 5, F, [F, C], [{ water: 1 }], [{ persuasion: 2 }, { swords: 3 }], 1),
    card('chani', 'チャニ', 5, F, [F, C, S], [{ water: 1 }, { draw: 1 }], [{ persuasion: 2 }, { swords: 2 }], 1),
    card('liet', 'リエト・カインズ', 5, F, [E, F], [{ influence: F }], [{ persuasion: 2 }], 1),
    card('wormRiders', '砂虫乗り', 6, F, [F, S], [], [{ swords: 4 }, { needInfluence: { fremen: 2 }, then: [{ swords: 2 }] }], 1),
    // どこにも属さない
    card('recruiter', 'アラキスの徴募官', 2, null, [C], [{ troops: 1 }], [{ persuasion: 1 }, { swords: 1 }], 2),
    card('duncan', 'ダンカン・アイダホ', 4, null, [C], [{ water: 1 }], [{ persuasion: 2 }, { swords: 1 }], 1),
    card('gurney', 'ガーニイ・ハレック', 6, null, [C, L], [{ troops: 2 }], [{ persuasion: 2 }, { swords: 3 }], 1),
    card('thufir', 'スフィル・ハワト', 5, null, [E, G, B, F, L], [{ intrigue: 1 }], [{ persuasion: 2 }], 1),
    card('piter', 'パイター・ド・フリース', 5, null, [L, C], [{ intrigue: 1 }], [{ persuasion: 2 }, { swords: 1 }], 1),
    card('carryall', 'キャリオール', 5, null, [S], [{ spice: 1 }], [{ persuasion: 1 }, { spice: 1 }], 1),
    card('ornithopter', 'オーニソプター', 3, null, [C, S], [{ draw: 1 }], [{ swords: 1 }], 2),
    card('powerPlay', '権力の駆け引き', 5, null, [E, G, B, F], [{ influence: 'space' }], [], 1),
    card('choamTrade', 'CHOAM の取引', 4, null, [L, S], [{ solari: 2 }], [{ persuasion: 1 }, { solari: 1 }], 1)
];

// いつでも買える札（予備）と、ギルドの場所で得る札
export const RESERVE = [
    card('liaison', 'アラキスの連絡員', 2, F, [F, C], [], [{ persuasion: 2 }], 8),
    card('spiceFlow', 'スパイスは流れねばならない', 9, null, [], [], [{ spice: 1 }], 10, { acquire: [{ vp: 1 }] })
];
export const FOLDSPACE = card('foldspace', '空間の折り畳み', 0, null, ALL, [{ draw: 1 }], [], 6);

export const CARDS = [...STARTER, ...IMPERIUM, ...RESERVE, FOLDSPACE];
export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

// ---- 紛争（ラウンドの初めに1枚めくる。1位・2位・3位の褒美） ----
export const CONFLICTS = [
    { id: 'skirmishA', level: 1, name: '辺境の小競り合い', rewards: [[{ influence: 'any' }, { solari: 1 }], [{ solari: 2 }], [{ spice: 1 }]] },
    { id: 'skirmishB', level: 1, name: '密輸船の拿捕', rewards: [[{ intrigue: 1 }, { solari: 2 }], [{ water: 1 }], [{ solari: 1 }]] },
    { id: 'skirmishC', level: 1, name: '砂丘の待ち伏せ', rewards: [[{ spice: 2 }], [{ spice: 1 }], [{ water: 1 }]] },
    { id: 'skirmishD', level: 1, name: '偵察隊の衝突', rewards: [[{ water: 1 }, { intrigue: 1 }], [{ solari: 2 }], [{ solari: 1 }]] },
    { id: 'arrakeenFight', level: 2, name: 'アラキーンの攻防', rewards: [[{ vp: 1 }, { control: 'arrakeen' }], [{ intrigue: 1 }, { spice: 2 }], [{ spice: 1 }]] },
    { id: 'carthagFight', level: 2, name: 'カーセグの攻防', rewards: [[{ vp: 1 }, { control: 'carthag' }], [{ intrigue: 1 }, { spice: 2 }], [{ spice: 1 }]] },
    { id: 'basinFight', level: 2, name: '帝国盆地の争奪', rewards: [[{ vp: 1 }, { control: 'imperialBasin' }], [{ intrigue: 1 }, { spice: 2 }], [{ spice: 1 }]] },
    { id: 'escort', level: 2, name: '収穫機の護衛', rewards: [[{ vp: 1 }, { spice: 2 }], [{ spice: 2 }, { solari: 2 }], [{ spice: 1 }]] },
    { id: 'storm', level: 2, name: '砂嵐の中の戦い', rewards: [[{ vp: 1 }, { water: 1 }, { solari: 2 }], [{ water: 1 }, { intrigue: 1 }], [{ water: 1 }]] },
    { id: 'court', level: 2, name: '宮廷の暗闘', rewards: [[{ vp: 1 }, { intrigue: 1 }], [{ influence: 'any' }], [{ solari: 2 }]] },
    { id: 'blockade', level: 2, name: '交易路の封鎖', rewards: [[{ influence: 'any' }, { influence: 'any' }, { solari: 2 }], [{ solari: 4 }], [{ solari: 2 }]] },
    { id: 'raid', level: 2, name: '補給線の襲撃', rewards: [[{ vp: 1 }, { troops: 2 }], [{ spice: 1 }, { solari: 2 }], [{ troops: 1 }]] },
    { id: 'greatWar', level: 3, name: '砂漠の大戦', rewards: [[{ vp: 2 }], [{ intrigue: 1 }, { spice: 3 }], [{ spice: 2 }]] },
    { id: 'shieldWall', level: 3, name: '盾の壁の決戦', rewards: [[{ vp: 2 }, { spice: 1 }], [{ vp: 1 }], [{ spice: 2 }]] },
    { id: 'intervention', level: 3, name: '皇帝の介入', rewards: [[{ vp: 2 }, { influence: 'any' }], [{ solari: 5 }], [{ solari: 3 }]] },
    { id: 'lastStand', level: 3, name: '最後の抵抗', rewards: [[{ vp: 2 }, { water: 2 }], [{ intrigue: 1 }, { water: 1 }, { spice: 1 }], [{ water: 1 }]] }
];
export const CONFLICT_BY_ID = Object.fromEntries(CONFLICTS.map(c => [c.id, c]));
// 山の作り方：レベル1を1枚、レベル2を5枚、レベル3を4枚（最大10ラウンド）
export const CONFLICT_COUNTS = { 1: 1, 2: 5, 3: 4 };

// ---- 陰謀カード ----
// plot：自分の番に使う。combat：紛争の戦いのときに使う。end：ゲームの終わりに条件を満たせば点
export const INTRIGUES = [
    { id: 'bribe', name: '賄賂の工作', kind: 'plot', effects: [{ pay: { solari: 2 }, then: [{ influence: 'any' }] }], copies: 2 },
    { id: 'hiddenFunds', name: '隠し財産', kind: 'plot', effects: [{ solari: 3 }], copies: 2 },
    { id: 'smuggling', name: '密輸の手引き', kind: 'plot', effects: [{ spice: 1 }, { water: 1 }], copies: 2 },
    { id: 'levy', name: '兵の徴募', kind: 'plot', effects: [{ troops: 2 }], copies: 2 },
    { id: 'informant', name: '内通者', kind: 'plot', effects: [{ draw: 2 }], copies: 2 },
    { id: 'tribute', name: 'スパイスの献上', kind: 'plot', effects: [{ pay: { spice: 4 }, then: [{ vp: 1 }] }], copies: 1 },
    { id: 'ambush', name: '待ち伏せ', kind: 'combat', effects: [{ swords: 4 }], copies: 2 },
    { id: 'reinforce', name: '増援', kind: 'combat', effects: [{ swords: 3 }], copies: 3 },
    { id: 'surprise', name: '不意打ち', kind: 'combat', effects: [{ swords: 2 }], copies: 3 },
    { id: 'bladeDance', name: '剣の舞', kind: 'combat', effects: [{ pay: { spice: 2 }, then: [{ swords: 6 }] }], copies: 2 },
    { id: 'wealthEnd', name: '富の誇示', kind: 'end', cond: { solari: 8 }, copies: 1 },
    { id: 'hoardEnd', name: 'スパイスの蓄え', kind: 'end', cond: { spice: 5 }, copies: 1 },
    { id: 'loyaltyEnd', name: '揺るがぬ忠誠', kind: 'end', cond: { influence4: 2 }, copies: 1 },
    { id: 'controlEnd', name: '支配の証', kind: 'end', cond: { control: 1 }, copies: 1 }
];
export const INTRIGUE_BY_ID = Object.fromEntries(INTRIGUES.map(c => [c.id, c]));

// ---- リーダー（原作の8人。能力は遊びやすく言い換えて単純にした） ----
// signet：印章の指輪をエージェントに使ったときの効果
export const LEADERS = [
    { id: 'paul', short: 'ポール', name: 'ポール・アトレイデス', ability: '予知', text: '自分の山札の一番上のカードが見える', signet: [{ draw: 1 }] },
    { id: 'leto', short: 'レト公爵', name: 'レト・アトレイデス公爵', ability: '民の人望', text: 'ランドスラードの場所の費用が1ソラリ安い', signet: [{ pay: { solari: 2 }, then: [{ influence: 'any' }] }] },
    { id: 'baron', short: '男爵', name: 'ハルコンネン男爵', ability: '策謀', text: '紛争で1位になると、陰謀カードを1枚引く', signet: [{ pay: { solari: 1 }, then: [{ intrigue: 1 }] }] },
    { id: 'rabban', short: 'ラッバーン', name: 'グロッス・ラッバーン', ability: 'アラキスの封土', text: 'ゲームの初めにスパイス1とソラリ1を多く持つ', signet: [{ troops: 1 }, { ifCouncil: [{ troops: 1 }] }] },
    { id: 'ilban', short: 'イルバン', name: 'イルバン・リチェーゼ伯爵', ability: '手ごわい交渉人', text: '場所の費用にソラリを払うたび、カードを1枚引く', signet: [{ solari: 1 }] },
    { id: 'helena', short: 'ヘレナ', name: 'ヘレナ・リチェーゼ', ability: '至る所の目', text: 'ランドスラードと都市の場所に、ほかの人のエージェントがいても置ける（メンタートを除く）', signet: [{ pay: { solari: 1 }, then: [{ draw: 1 }] }] },
    { id: 'memnon', short: 'メムノン', name: 'メムノン・ソーヴァルド伯', ability: '交易の伝手', text: 'メランジの売却で得るソラリが2多い', signet: [{ spice: 1 }] },
    { id: 'ariana', short: 'アリアナ', name: 'アリアナ・ソーヴァルド伯爵夫人', ability: 'スパイス中毒', text: '砂漠でスパイスを得るとき、1少ないかわりにカードを1枚引く', signet: [{ water: 1 }] }
];
export const LEADER_BY_ID = Object.fromEntries(LEADERS.map(l => [l.id, l]));

// ---- 効果の文 ----

const yen = (k, n) => `${RES_NAME[k]}${n}`;

export function costText(cost) {
    return Object.entries(cost ?? {}).map(([k, n]) => yen(k, n)).join('・');
}

export function effectText(effects, { space = null } = {}) {
    return (effects ?? []).map(e => atomText(e, space)).filter(Boolean).join('、');
}

function atomText(e, space) {
    if (e.solari) return yen('solari', e.solari);
    if (e.spice) return yen('spice', e.spice);
    if (e.water) return yen('water', e.water);
    if (e.troops) return `部隊${e.troops}`;
    if (e.draw) return `カード${e.draw}枚を引く`;
    if (e.intrigue) return `陰謀カード${e.intrigue}枚`;
    if (e.vp) return `${e.vp}点`;
    if (e.persuasion) return `説得${e.persuasion}`;
    if (e.swords) return `剣${e.swords}`;
    if (e.influence) {
        if (e.influence === 'any') return '好きな勢力の影響力+1';
        if (e.influence === 'space') return '置いた場所の勢力の影響力+1';
        return `${FACTION_SHORT[e.influence]}の影響力+1`;
    }
    if (e.trash) return 'カード1枚を除外してよい';
    if (e.trashSelf) return 'このカードを除外する';
    if (e.pay) return `${costText(e.pay)}を払えば${effectText(e.then)}`;
    if (e.choice) return e.choice.map(c => effectText(c)).join(' か ');
    if (e.bond) return `ほかの${FACTION_SHORT[e.bond]}のカードも出ていれば${effectText(e.then)}`;
    if (e.needInfluence) return `${Object.entries(e.needInfluence).map(([f, n]) => `${FACTION_SHORT[f]}の影響力${n}以上`).join('')}なら${effectText(e.then)}`;
    if (e.ifCouncil) return `評議会の席があれば${effectText(e.ifCouncil)}`;
    if (e.council) return '最高評議会の席（公開のたびに説得+2）';
    if (e.swordmaster) return '3人目のエージェント';
    if (e.mentat) return 'このラウンドだけエージェント+1';
    if (e.foldspace) return '「空間の折り畳み」を1枚得る';
    if (e.steal) return '陰謀カードを4枚以上持つ相手から1枚ずつ奪う';
    if (e.harvest) return `スパイス${e.harvest}（たまった分も）`;
    if (e.sell) return 'スパイス2〜5をソラリ6〜12に換える';
    if (e.signet) return 'リーダーの印章の効果';
    if (e.control) return `${SPACE_BY_ID[e.control].name}の支配`;
    return '';
}

export function intrigueText(c) {
    if (c.kind === 'end') {
        const cond = c.cond;
        if (cond.solari) return `ゲームの終わりに、ソラリが${cond.solari}以上なら1点`;
        if (cond.spice) return `ゲームの終わりに、スパイスが${cond.spice}以上なら1点`;
        if (cond.influence4) return `ゲームの終わりに、影響力4以上の勢力が${cond.influence4}つ以上なら1点`;
        if (cond.control) return 'ゲームの終わりに、場所を1つ以上支配していれば1点';
    }
    return effectText(c.effects);
}

export const INTRIGUE_KIND_NAME = { plot: '策略', combat: '戦闘', end: '終局' };
