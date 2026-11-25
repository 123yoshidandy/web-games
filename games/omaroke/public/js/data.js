/**
 * ルールのデータ：役割、ポケモン、プレイカード、特殊状態、おてんき
 * 資料（公式 FAQ・紹介記事）で分かった名前と効果はそのまま使い、分からない数値は README の「資料で分からない点の決め方」のとおりに決めた
 */

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 6;
export const HAND_LIMIT = 4;
export const START_HAND = 4;
export const DRAW_PER_TURN = 2;
// ジムリーダーの特典（資料にないので決めた値）：挑戦者が増えるほど大きくする
//   基本ルール：ポケモンの HP に 4 人は +0、5 人は +1、6 人は +2。玄人ルール：5 人以上なら各ポケモンの HP +1
export function leaderBonus(mode, n) {
    return mode === 'basic' ? n - 4 : (n >= 5 ? 1 : 0);
}
// キズぐすりの回復量（公式 FAQ）
export const POTION_HEAL = 2;
// イベントのダメージ（ライバルからの挑戦は 2 ダメージ。ほかのイベントもこれに合わせた）
export const EVENT_DAMAGE = 2;

export const ROLES = {
    leader: { name: 'ジムリーダー', short: 'リーダー', team: 'gym' },
    trainer: { name: 'ジムトレーナー', short: 'トレーナー', team: 'gym' },
    challenger: { name: '挑戦者', short: '挑戦者', team: 'challenger' },
    rocket: { name: 'ロケット団員', short: 'ロケット団', team: 'rocket' }
};

// 人数ごとの役割（4 人は 1 人ずつ。5〜6 人は挑戦者が増える）
export function rolesFor(n) {
    return ['leader', 'trainer', 'rocket', ...Array(n - 3).fill('challenger')];
}

// ルール：基本（Lv3 を 2 枚から 1 匹）・玄人（Lv1 を 4 枚から 2 匹。交代と進化がある）
export const MODES = {
    basic: { name: '基本ルール', deal: 2, pick: 1, level: 3 },
    expert: { name: '玄人ルール', deal: 4, pick: 2, level: 1 }
};

// おてんきマーク（プレイカードの左上。おてんきチェックで山札の上をめくって使う）
export const WEATHERS = {
    sun: { name: 'はれ' },
    rain: { name: 'あめ' },
    sand: { name: 'すなあらし' },
    snow: { name: 'ゆき' }
};
export const WEATHER_KEYS = Object.keys(WEATHERS);

// 特殊状態（ポケモンがなれるのは 1 つだけ。なっている間は、ほかの特殊状態にならない）
export const STATUSES = {
    burn: { name: 'やけど', text: 'わざのダメージが 1 になる' },
    poison: { name: 'どく', text: '自分の番の初めに 1 ダメージ' },
    paralysis: { name: 'まひ', text: '番の初めのおてんきチェックが「あめ」「ゆき」なら、その番は「くらえ！」を使えない' },
    sleep: { name: 'ねむり', text: '「くらえ！」「よけて！」を使えない。番の初めのおてんきチェックが「はれ」「すなあらし」なら起きる' },
    confusion: { name: 'こんらん', text: '「くらえ！」のとき、おてんきチェックが「あめ」なら失敗して自分に 1 ダメージ' },
    flinch: { name: 'ひるみ', text: '次の自分の番に山札から引くのが 1 枚になる（引いたら治る）' }
};

// ポケモンの型（公式の 5 つ）
export const TYPES = {
    attack: 'アタック', defense: 'ディフェンス', balance: 'バランス', support: 'サポート', jam: 'ぼうがい'
};

// 属性（絵の色だけに使う）
export const ELEMENTS = {
    grass: { name: 'くさ', color: '#4f9a4a' }, fire: { name: 'ほのお', color: '#e0612f' }, water: { name: 'みず', color: '#3a83cf' },
    flying: { name: 'ひこう', color: '#8f9fd6' }, poison: { name: 'どく', color: '#9a58b6' }, fighting: { name: 'かくとう', color: '#b5523a' },
    ghost: { name: 'ゴースト', color: '#5d4f9a' }, electric: { name: 'でんき', color: '#e2b72b' }, ground: { name: 'じめん', color: '#c08f4a' },
    normal: { name: 'ノーマル', color: '#9a957f' }, ice: { name: 'こおり', color: '#5fb8c9' }, psychic: { name: 'エスパー', color: '#d15a8e' },
    rock: { name: 'いわ', color: '#8f7c52' }
};

// 特性（実装したもの）。資料で名前が分かったもの（もうか・すながくれ・ダウンロード・スキルリンク・まけんき・しゅうかく・するどいめ・
// せいでんき・ひでり・ものひろい・すいすい・こんじょう・どくしゅ・カブトアーマー・くいしんぼう・どんかん）は、本家のゲームでその特性を持つ
// ポケモンに割り当て、効果は分かった範囲と本家の意味から決めた
export const ABILITIES = {
    blaze: { name: 'もうか', text: 'HP が最大の半分以下なら、わざのダメージ +1' },
    overgrow: { name: 'しんりょく', text: 'HP が最大の半分以下なら、わざのダメージ +1' },
    torrent: { name: 'げきりゅう', text: 'HP が最大の半分以下なら、わざのダメージ +1' },
    sandVeil: { name: 'すながくれ', text: '攻撃を受けるとき、おてんきチェックが「すなあらし」ならよける' },
    skillLink: { name: 'スキルリンク', text: '「くらえ！」を番に何回でも使える' },
    defiant: { name: 'まけんき', text: '手札の上限が 6 枚になる' },
    harvest: { name: 'しゅうかく', text: '手札を捨てたあと、1 枚引く' },
    sereneGrace: { name: 'てんのめぐみ', text: '自分が使うキズぐすりの回復 +1' },
    download: { name: 'ダウンロード', text: '相手の手札が自分より多いなら、わざのダメージ +1' },
    staticAb: { name: 'せいでんき', text: 'わざでダメージを受けたとき、おてんきチェックが「はれ」なら、攻撃した相手をまひにする' },
    levitate: { name: 'ふゆう', text: 'イベントのダメージを受けない' },
    poisonPoint: { name: 'どくのトゲ', text: 'わざでダメージを受けたとき、おてんきチェックが「はれ」なら、攻撃した相手をどくにする' },
    pickup: { name: 'ものひろい', text: 'ほかの人が退場したら、その人の手札をもらう' },
    intimidate: { name: 'いかく', text: '受けるわざのダメージ -1（最低 1）' },
    oblivious: { name: 'どんかん', text: 'こんらん・ねむりにならない' },
    keenEye: { name: 'するどいめ', text: '相手のすながくれ・ひかりのこなでよけられない' },
    drought: { name: 'ひでり', text: '自分のためのおてんきチェックは、すべて「はれ」になる' },
    poisonTouch: { name: 'どくしゅ', text: 'わざでダメージを与えたとき、おてんきチェックが「はれ」なら相手をどくにする' },
    gluttony: { name: 'くいしんぼう', text: '自分のポケモンに使うキズぐすりの回復 +1' },
    guts: { name: 'こんじょう', text: '特殊状態のとき、わざのダメージ +1（やけどでもダメージは減らない）' },
    swiftSwim: { name: 'すいすい', text: '番の初めにおてんきチェック。「あめ」なら 1 枚多く引く' },
    battleArmor: { name: 'カブトアーマー', text: '受けるわざのダメージが 3 以上なら -1' },
    sturdy: { name: 'がんじょう', text: 'HP が最大のとき、ひんしになるダメージを受けても HP 1 で残る' },
    rockHead: { name: 'いしあたま', text: 'いのちのたまの反動を受けない' },
    naturalCure: { name: 'しぜんかいふく', text: '自分の番の終わりに、特殊状態が治る' },
    moxie: { name: 'じしんかじょう', text: 'わざで相手を退場させたら、HP 2 回復' },
    innerFocus: { name: 'せいしんりょく', text: 'ひるみにならない' }
};

/**
 * ポケモン（30 系統・61 枚）
 * 列：id, 名前, 系統, Lv, 属性, 型, 基本の HP, 玄人の HP, わざの名前, ダメージ, 回数, わざの追加効果, 特性, もう 1 回
 *   もう 1 回：当たったあと、おてんきチェックがこのマークなら、もう 1 回攻撃する（ホネブーメラン）
 *   回数：わざの攻撃の回数（にどげり など。1 回ごとに「よけて！」でよけられる）
 *   追加効果：'burn' など（ダメージを与えたら、その特殊状態にする）。'sun:paralysis' は、おてんきチェックが「はれ」のときだけ
 * Lv3 は最終進化と 1 段だけのポケモン。Lv1 は進化する系統の最初、Lv2 は 3 段の系統の真ん中
 */
const POKEMON_ROWS = [
    // 3 段の系統
    ['bulbasaur', 'フシギダネ', 'bulba', 1, 'grass', 'balance', 0, 3, 'つるのムチ', 1, 1, '', ''],
    ['ivysaur', 'フシギソウ', 'bulba', 2, 'grass', 'balance', 0, 4, 'はっぱカッター', 1, 1, 'sun:sleep', ''],
    ['venusaur', 'フシギバナ', 'bulba', 3, 'grass', 'balance', 8, 5, 'ソーラービーム', 2, 1, '', 'overgrow'],
    ['charmander', 'ヒトカゲ', 'char', 1, 'fire', 'attack', 0, 3, 'ひのこ', 1, 1, '', ''],
    ['charmeleon', 'リザード', 'char', 2, 'fire', 'attack', 0, 4, 'きりさく', 2, 1, '', ''],
    ['charizard', 'リザードン', 'char', 3, 'fire', 'attack', 8, 4, 'かえんほうしゃ', 2, 1, 'sun:burn', 'blaze'],
    ['squirtle', 'ゼニガメ', 'squirt', 1, 'water', 'defense', 0, 3, 'みずでっぽう', 1, 1, '', ''],
    ['wartortle', 'カメール', 'squirt', 2, 'water', 'defense', 0, 4, 'かみつく', 1, 1, 'sun:flinch', ''],
    ['blastoise', 'カメックス', 'squirt', 3, 'water', 'defense', 9, 5, 'ハイドロポンプ', 2, 1, '', 'torrent'],
    ['pidgey', 'ポッポ', 'pidgey', 1, 'flying', 'attack', 0, 3, 'かぜおこし', 1, 1, '', ''],
    ['pidgeotto', 'ピジョン', 'pidgey', 2, 'flying', 'attack', 0, 4, 'つばさでうつ', 2, 1, '', ''],
    ['pidgeot', 'ピジョット', 'pidgey', 3, 'flying', 'attack', 6, 4, 'エアスラッシュ', 3, 1, '', 'keenEye'],
    ['nidoranM', 'ニドラン♂', 'nido', 1, 'poison', 'jam', 0, 3, 'どくばり', 1, 1, 'sun:poison', ''],
    ['nidorino', 'ニドリーノ', 'nido', 2, 'poison', 'jam', 0, 4, 'つのでつく', 1, 1, 'poison', ''],
    ['nidoking', 'ニドキング', 'nido', 3, 'poison', 'attack', 8, 5, 'にどげり', 1, 2, '', 'poisonPoint'],
    ['machop', 'ワンリキー', 'machop', 1, 'fighting', 'attack', 0, 3, 'からてチョップ', 1, 1, '', ''],
    ['machoke', 'ゴーリキー', 'machop', 2, 'fighting', 'attack', 0, 4, 'けたぐり', 2, 1, '', ''],
    ['machamp', 'カイリキー', 'machop', 3, 'fighting', 'attack', 8, 5, 'ばくれつパンチ', 2, 1, 'sun:confusion', 'guts'],
    ['gastly', 'ゴース', 'gastly', 1, 'ghost', 'jam', 0, 3, 'したでなめる', 1, 1, 'sun:paralysis', ''],
    ['haunter', 'ゴースト', 'gastly', 2, 'ghost', 'jam', 0, 4, 'さいみんじゅつ', 1, 1, 'sleep', ''],
    ['gengar', 'ゲンガー', 'gastly', 3, 'ghost', 'jam', 7, 4, 'シャドーボール', 2, 1, '', 'levitate'],
    // 2 段の系統
    ['pikachu', 'ピカチュウ', 'pika', 1, 'electric', 'balance', 0, 3, 'でんきショック', 1, 1, 'sun:paralysis', ''],
    ['raichu', 'ライチュウ', 'pika', 3, 'electric', 'balance', 7, 4, '10まんボルト', 2, 1, 'sun:paralysis', 'staticAb'],
    ['sandshrew', 'サンド', 'sand', 1, 'ground', 'defense', 0, 3, 'ひっかく', 1, 1, '', ''],
    ['sandslash', 'サンドパン', 'sand', 3, 'ground', 'defense', 8, 5, 'きりさく', 2, 1, '', 'sandVeil'],
    ['vulpix', 'ロコン', 'vulpix', 1, 'fire', 'jam', 0, 3, 'ひのこ', 1, 1, '', ''],
    ['ninetales', 'キュウコン', 'vulpix', 3, 'fire', 'jam', 7, 4, 'ねっぷう', 2, 1, 'sun:burn', 'drought'],
    ['meowth', 'ニャース', 'meowth', 1, 'normal', 'support', 0, 3, 'ひっかく', 1, 1, '', ''],
    ['persian', 'ペルシアン', 'meowth', 3, 'normal', 'support', 7, 4, 'みだれひっかき', 1, 2, '', 'pickup'],
    ['mankey', 'マンキー', 'mankey', 1, 'fighting', 'attack', 0, 3, 'けたぐり', 1, 1, '', ''],
    ['primeape', 'オコリザル', 'mankey', 3, 'fighting', 'attack', 7, 4, 'からてチョップ', 2, 1, '', 'defiant'],
    ['psyduck', 'コダック', 'psyduck', 1, 'water', 'jam', 0, 3, 'ねんりき', 1, 1, 'sun:confusion', ''],
    ['golduck', 'ゴルダック', 'psyduck', 3, 'water', 'jam', 8, 5, 'みずのはどう', 2, 1, 'confusion', 'swiftSwim'],
    ['growlithe', 'ガーディ', 'growl', 1, 'fire', 'balance', 0, 3, 'かみつく', 1, 1, '', ''],
    ['arcanine', 'ウインディ', 'growl', 3, 'fire', 'balance', 8, 5, 'しんそく', 2, 1, '', 'intimidate'],
    ['slowpoke', 'ヤドン', 'slow', 1, 'psychic', 'defense', 0, 4, 'ずつき', 1, 1, '', ''],
    ['slowbro', 'ヤドラン', 'slow', 3, 'psychic', 'defense', 9, 5, 'サイコキネシス', 2, 1, '', 'oblivious'],
    ['magnemite', 'コイル', 'magnet', 1, 'electric', 'defense', 0, 3, 'でんきショック', 1, 1, '', ''],
    ['magneton', 'レアコイル', 'magnet', 3, 'electric', 'defense', 8, 5, 'ラスターカノン', 2, 1, '', 'sturdy'],
    ['grimer', 'ベトベター', 'grimer', 1, 'poison', 'jam', 0, 3, 'ヘドロこうげき', 1, 1, 'sun:poison', ''],
    ['muk', 'ベトベトン', 'grimer', 3, 'poison', 'jam', 8, 5, 'ヘドロばくだん', 2, 1, '', 'poisonTouch'],
    ['shellder', 'シェルダー', 'shell', 1, 'ice', 'attack', 0, 3, 'つららばり', 1, 1, '', ''],
    ['cloyster', 'パルシェン', 'shell', 3, 'ice', 'attack', 7, 4, 'つららばり', 2, 1, '', 'skillLink'],
    ['exeggcute', 'タマタマ', 'egg', 1, 'grass', 'support', 0, 3, 'ねむりごな', 1, 1, 'sun:sleep', ''],
    ['exeggutor', 'ナッシー', 'egg', 3, 'grass', 'support', 8, 5, 'タマゴばくだん', 2, 1, '', 'harvest'],
    ['cubone', 'カラカラ', 'cubone', 1, 'ground', 'attack', 0, 3, 'ホネこんぼう', 1, 1, 'sun:flinch', ''],
    ['marowak', 'ガラガラ', 'cubone', 3, 'ground', 'attack', 7, 4, 'ホネブーメラン', 2, 1, '', 'battleArmor', 'sun'],
    ['koffing', 'ドガース', 'koffing', 1, 'poison', 'jam', 0, 3, 'スモッグ', 1, 1, 'sun:poison', ''],
    ['weezing', 'マタドガス', 'koffing', 3, 'poison', 'jam', 8, 5, 'ヘドロこうげき', 1, 1, 'poison', 'levitate'],
    ['rhyhorn', 'サイホーン', 'rhy', 1, 'ground', 'defense', 0, 4, 'つのでつく', 1, 1, '', ''],
    ['rhydon', 'サイドン', 'rhy', 3, 'ground', 'defense', 9, 5, 'つのドリル', 2, 1, '', 'rockHead'],
    ['staryu', 'ヒトデマン', 'star', 1, 'water', 'support', 0, 3, 'みずでっぽう', 1, 1, '', ''],
    ['starmie', 'スターミー', 'star', 3, 'water', 'support', 7, 4, 'バブルこうせん', 2, 1, '', 'naturalCure'],
    ['magikarp', 'コイキング', 'karp', 1, 'water', 'defense', 0, 4, 'はねる', 0, 1, '', ''],
    ['gyarados', 'ギャラドス', 'karp', 3, 'water', 'attack', 8, 5, 'たきのぼり', 2, 1, 'sun:flinch', 'moxie'],
    // 1 段だけ
    ['chansey', 'ラッキー', 'chansey', 3, 'normal', 'support', 9, 5, 'はたく', 1, 1, '', 'sereneGrace'],
    ['kangaskhan', 'ガルーラ', 'kanga', 3, 'normal', 'balance', 8, 5, 'れんぞくパンチ', 1, 2, '', 'innerFocus'],
    ['electabuzz', 'エレブー', 'buzz', 3, 'electric', 'balance', 7, 4, 'かみなりパンチ', 2, 1, 'sun:paralysis', 'staticAb'],
    ['porygon', 'ポリゴン', 'pory', 3, 'normal', 'support', 7, 4, 'トライアタック', 2, 1, '', 'download'],
    ['aerodactyl', 'プテラ', 'aero', 3, 'rock', 'attack', 7, 4, 'はかいこうせん', 3, 1, '', ''],
    ['snorlax', 'カビゴン', 'lax', 3, 'normal', 'defense', 10, 6, 'のしかかり', 2, 1, 'sun:paralysis', 'gluttony']
];

export const POKEMON = Object.fromEntries(POKEMON_ROWS.map(([id, name, line, level, element, type, hp, hpX, move, damage, hits, effect, ability, again]) => [id, {
    id, name, line, level, element, type, hp, hpX,
    move: { name: move, damage, hits, effect: effect || null, again: again || null },
    ability: ability || null
}]));
export const POKEMON_IDS = Object.keys(POKEMON);

// 進化の次の段（玄人ルール）。なければ null
export function nextStage(id) {
    const p = POKEMON[id];
    const line = POKEMON_IDS.filter(k => POKEMON[k].line === p.line).sort((a, b) => POKEMON[a].level - POKEMON[b].level);
    return line[line.indexOf(id) + 1] ?? null;
}

/**
 * プレイカード（108 枚）
 *   kind：'attack'（くらえ！）'dodge'（よけて！）'tool'（どうぐ）'item'（もちもの）'event'（イベント）
 *   target：使うときに選ぶもの。'other'（ほかの人 1 人）'any'（だれか 1 人。自分も可）'self'（自分）'two'（ほかの人を 2 人まで）'none'
 * 枚数は資料にないので決めた（README）
 */
export const CARDS = {
    kurae: { name: 'くらえ！', kind: 'attack', count: 37, target: 'other', text: '相手 1 人のバトルポケモンに、自分のバトルポケモンのわざで攻撃する（番に 1 回）' },
    yokete: { name: 'よけて！', kind: 'dodge', count: 15, target: 'none', text: '攻撃を受けたときに出して、よける（1 回の攻撃に 1 枚）' },
    potion: { name: 'キズぐすり', kind: 'tool', count: 8, target: 'any', text: 'HP 2 回復。ほかの人の番は、HP が 0 になったポケモンにだけ使える。残りが 2 人のときは使えない' },
    revive: { name: 'げんきのかけら', kind: 'tool', count: 2, target: 'any', text: 'ポケモン 1 匹の HP を最大まで回復。ほかの人の番は、HP が 0 になったポケモンにだけ使える。残りが 2 人のときは使えない' },
    nugget: { name: 'きんのたま', kind: 'tool', count: 2, target: 'any', text: '選んだ人が 2 枚引く' },
    fullHeal: { name: 'なんでもなおし', kind: 'tool', count: 3, target: 'any', text: '選んだ人のバトルポケモンの特殊状態を治す' },
    rareCandy: { name: 'ふしぎなアメ', kind: 'tool', count: 3, target: 'self', text: '玄人ルール：自分のポケモン 1 匹を進化させる。基本ルール：バトルポケモンの最大 HP +1、HP 1 回復' },
    lifeOrb: { name: 'いのちのたま', kind: 'item', count: 2, target: 'self', text: 'わざのダメージ +1。ダメージを与えたら、自分も 1 ダメージ' },
    choiceBand: { name: 'ちからのハチマキ', kind: 'item', count: 2, target: 'self', text: '手札を 2 枚捨てて、「くらえ！」の代わりにできる' },
    rockyHelmet: { name: 'ゴツゴツメット', kind: 'item', count: 2, target: 'self', text: 'ほかの人のわざでダメージを受けたら、攻撃した相手のバトルポケモンに 1 ダメージ' },
    poisonBarb: { name: 'どくバリ', kind: 'item', count: 2, target: 'self', text: 'ほかの人のわざでダメージを受けたら、攻撃した相手のバトルポケモンをどくにする' },
    flameOrb: { name: 'かえんだま', kind: 'item', count: 1, target: 'self', text: 'わざでダメージを与えたら、相手をやけどにする' },
    lightBall: { name: 'でんきだま', kind: 'item', count: 1, target: 'self', text: 'でんきのポケモンなら、わざのダメージ +1' },
    leftovers: { name: 'たべのこし', kind: 'item', count: 2, target: 'self', text: '自分の番の初めに、HP が最大の半分以下なら 1 回復' },
    kingsRock: { name: 'おうじゃのしるし', kind: 'item', count: 1, target: 'self', text: 'わざでダメージを与えたとき、おてんきチェックが「はれ」なら相手をひるみにする' },
    brightPowder: { name: 'ひかりのこな', kind: 'item', count: 2, target: 'self', text: '攻撃を受けるとき、おてんきチェックが「ゆき」ならよける' },
    blunderPolicy: { name: 'からぶりほけん', kind: 'item', count: 1, target: 'self', text: '自分の攻撃がよけられたら、1 枚引く' },
    stealthCloak: { name: 'おんみつマント', kind: 'item', count: 1, target: 'self', text: 'ほかの人のイベントの効果を受けない' },
    mewtwo: { name: 'ミュウツーのプレッシャー', kind: 'event', count: 2, target: 'none', text: 'ほかの全員は「よけて！」を出す。出せなければ 2 ダメージ' },
    moltres: { name: 'ファイヤーからの試練', kind: 'event', count: 2, target: 'none', text: 'ほかの全員は「くらえ！」を捨てる。捨てられなければ 2 ダメージ' },
    zapdos: { name: 'サンダーのペナルティ', kind: 'event', count: 2, target: 'two', text: 'ほかの人を 2 人まで選ぶ。選ばれた人は「よけて！」を出す。出せなければ 2 ダメージ' },
    mew: { name: 'ミュウの祝福', kind: 'event', count: 2, target: 'self', text: 'バトルポケモンの HP が最大なら、レベルアップ（ふしぎなアメと同じ）。最大でなければ HP 2 回復' },
    berries: { name: 'きのみ大豊作', kind: 'event', count: 2, target: 'none', text: '山札から残っている人数分をめくり、自分から順に 1 枚ずつ取る' },
    mrMime: { name: 'バリヤードのトリック', kind: 'event', count: 3, target: 'other', text: '相手 1 人の手札から、1 枚を見ずに取る' },
    farfetchd: { name: 'カモネギのいたずら', kind: 'event', count: 3, target: 'other', text: '相手 1 人の手札から、1 枚を見ずに捨てさせる' },
    jigglypuff: { name: 'プリンのライブ', kind: 'event', count: 1, target: 'none', text: 'ほかの全員はおてんきチェック。「あめ」「ゆき」ならねむりになる' },
    rival: { name: 'ライバルからの挑戦', kind: 'event', count: 2, target: 'other', text: '相手 1 人と、相手から順に「くらえ！」を捨て合う。先に捨てられなかった人が 2 ダメージ' },
    articuno: { name: 'フリーザーの守り', kind: 'event', count: 2, target: 'none', text: 'ほかの人のイベントを受けたときに出して、自分への効果を打ち消す' }
};
export const CARD_KEYS = Object.keys(CARDS);

// 山札の全カード（id は 0 から。おてんきマークは順に割り振る）
export function buildDeck() {
    const deck = [];
    CARD_KEYS.forEach(key => {
        for (let i = 0; i < CARDS[key].count; i++) deck.push({ id: deck.length, key, weather: WEATHER_KEYS[deck.length % WEATHER_KEYS.length] });
    });
    return deck;
}
