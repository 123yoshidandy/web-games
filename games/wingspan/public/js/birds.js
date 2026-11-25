/**
 * ウイングスパンのデータ（鳥のカード・ボーナスカード・ラウンドの目標）
 * 鳥は基本セット（北アメリカの鳥）から、ピンクの能力（ほかの人の番に働く）を持たないものを選んだ
 * 数値（点・餌・巣・卵・翼開長）と能力は、基本セットのカードに合わせている
 */

export const FOODS = ['inv', 'seed', 'fish', 'fruit', 'rodent'];
export const FOOD_NAMES = { inv: '虫', seed: '種', fish: '魚', fruit: '実', rodent: '鼠' };
export const FOOD_LONG = { inv: '無脊椎動物', seed: '種子', fish: '魚', fruit: '果実', rodent: '齧歯類' };
export const HABITATS = ['forest', 'grassland', 'wetland'];
export const HABITAT_NAMES = { forest: '森林', grassland: '草原', wetland: '湿地' };
export const NESTS = ['bowl', 'cavity', 'ground', 'platform', 'star'];
export const NEST_NAMES = { bowl: 'お椀形', cavity: '樹洞', ground: '地面', platform: '皿形', star: 'どれでも' };
// 餌箱のサイコロの面（invseed は虫か種のどちらか）
export const DIE_FACES = ['inv', 'seed', 'fish', 'fruit', 'rodent', 'invseed'];

// 生息地ごとの行動の量（その列の鳥の数で決まる）と、ボーナスの交換ができる列
export const ACTION_AMOUNTS = {
    forest: [1, 1, 2, 2, 3, 3],
    grassland: [2, 2, 3, 3, 4, 4],
    wetland: [1, 1, 2, 2, 3, 3]
};
export const BONUS_COLUMNS = [1, 3, 5];
// 鳥を出すときの卵の数（その列に、すでにいる鳥の数で決まる）
export const EGG_COST = [0, 1, 1, 2, 2];
export const ROW_SIZE = 5;
export const TURNS_PER_ROUND = [8, 7, 6, 5];
export const ROUNDS = 4;
// ラウンドの目標（緑の面）の順位ごとの点
export const GOAL_POINTS = [[4, 1, 0], [5, 2, 1], [6, 3, 2], [7, 4, 3]];

// 能力の色：brown は行動のときに働く、white は出したときに1回だけ働く
export const POWER_COLORS = {
    gainFeeder: 'brown', cacheFeeder: 'brown', cacheSupply: 'brown', hunt: 'brown', predator: 'brown',
    tuckDraw: 'brown', tuckFood: 'brown', tuckEgg: 'brown', layThis: 'brown', layAny: 'brown', drawCard: 'brown',
    allFood: 'brown', allDraw: 'brown', fewestDraw: 'brown', discardEggFood: 'brown', discardEggCards: 'brown',
    discardFoodTuck: 'brown', tradeFood: 'brown',
    gainSupply: 'white', gainAllFeeder: 'white', laySameNest: 'white', drawCards: 'white', bonusDraw: 'white', playAnother: 'white'
};

const H = { F: 'forest', G: 'grassland', W: 'wetland' };

// 餌の書き方：'inv+seed' は全部、'inv/fruit' はどれか1つ、'any' はどれでも1つ
function parseCost(text) {
    if (text.includes('/')) return { or: true, items: text.split('/') };
    return { or: false, items: text.split('+') };
}

// [id, 名前, 生息地, 餌, 点, 巣, 卵の上限, 翼開長(cm), 能力, 能力の値]
const RAW = [
    // 森林
    ['blue_jay', 'アオカケス', 'F', 'seed+fruit', 3, 'bowl', 2, 41, 'cacheFeeder', 'seed'],
    ['black_capped_chickadee', 'アメリカコガラ', 'F', 'inv+seed', 2, 'cavity', 6, 20, 'cacheSupply', 'seed'],
    ['carolina_chickadee', 'カロライナコガラ', 'F', 'inv+seed', 2, 'cavity', 4, 18, 'cacheFeeder', 'seed'],
    ['tufted_titmouse', 'エボシガラ', 'F', 'inv+seed', 1, 'cavity', 5, 25, 'gainFeeder', 'seed'],
    ['white_breasted_nuthatch', 'ムナジロゴジュウカラ', 'F', 'inv+seed', 4, 'cavity', 4, 28, 'cacheFeeder', 'seed'],
    ['red_breasted_nuthatch', 'ムネアカゴジュウカラ', 'F', 'inv+seed', 2, 'cavity', 4, 20, 'cacheSupply', 'seed'],
    ['downy_woodpecker', 'セジロコゲラ', 'F', 'inv+seed', 3, 'cavity', 2, 30, 'playAnother', 'forest'],
    ['hairy_woodpecker', 'セジロアカゲラ', 'F', 'inv+fruit', 3, 'cavity', 3, 38, 'gainFeeder', 'inv'],
    ['red_bellied_woodpecker', 'シマセゲラ', 'F', 'inv+seed', 1, 'cavity', 4, 41, 'cacheFeeder', 'seed'],
    ['pileated_woodpecker', 'エボシクマゲラ', 'F', 'inv+inv+fruit', 6, 'cavity', 2, 74, null],
    ['red_headed_woodpecker', 'ズアカキツツキ', 'FG', 'inv+seed+fruit', 4, 'cavity', 3, 43, 'cacheFeeder', 'seed'],
    ['northern_flicker', 'ハシボソキツツキ', 'FG', 'inv+inv', 2, 'cavity', 5, 51, 'laySameNest', 'cavity'],
    ['american_robin', 'コマツグミ', 'FG', 'inv+fruit', 1, 'bowl', 4, 43, 'tuckDraw'],
    ['cedar_waxwing', 'ヒメレンジャク', 'FG', 'fruit+fruit', 3, 'bowl', 3, 30, 'tuckFood', 'fruit'],
    ['northern_cardinal', 'ショウジョウコウカンチョウ', 'FG', 'seed+fruit', 3, 'bowl', 5, 30, 'gainFeeder', 'fruit'],
    ['gray_catbird', 'ネコマネドリ', 'FG', 'inv+fruit', 3, 'bowl', 3, 28, 'layAny'],
    ['northern_mockingbird', 'マネシツグミ', 'FG', 'inv/fruit', 1, 'bowl', 4, 36, 'gainFeeder', 'fruit'],
    ['baltimore_oriole', 'ボルチモアムクドリモドキ', 'F', 'inv+fruit+fruit', 9, 'bowl', 2, 30, 'allFood', 'fruit'],
    ['scarlet_tanager', 'アカフウキンチョウ', 'F', 'inv+fruit', 4, 'bowl', 3, 30, null],
    ['rose_breasted_grosbeak', 'ムネアカイカル', 'FG', 'seed+fruit', 6, 'bowl', 2, 33, null],
    ['indigo_bunting', 'ルリノジコ', 'FG', 'inv+seed', 4, 'bowl', 3, 20, 'tuckFood', 'inv'],
    ['eastern_phoebe', 'ツキヒメハエトリ', 'FGW', 'inv', 1, 'bowl', 4, 28, 'gainFeeder', 'inv'],
    ['eastern_kingbird', 'トウブタイランチョウ', 'FGW', 'inv+fruit', 2, 'bowl', 3, 38, 'gainFeeder', 'inv'],
    ['willow_flycatcher', 'ヤナギヒタキモドキ', 'FG', 'inv', 1, 'bowl', 3, 23, 'gainFeeder', 'inv'],
    ['blue_gray_gnatcatcher', 'ブユムシクイ', 'F', 'inv', 1, 'bowl', 3, 15, 'gainFeeder', 'inv'],
    ['yellow_billed_cuckoo', 'キバシカッコウ', 'F', 'inv+inv', 2, 'bowl', 2, 41, 'drawCard'],
    ['ruby_throated_hummingbird', 'ノドアカハチドリ', 'FGW', 'fruit', 3, 'bowl', 2, 10, null],
    ['american_redstart', 'ハゴロモムシクイ', 'F', 'inv+fruit', 4, 'bowl', 2, 20, null],
    ['ovenbird', 'カマドムシクイ', 'F', 'inv+seed', 2, 'ground', 4, 25, 'layThis'],
    ['wood_thrush', 'モリツグミ', 'F', 'inv+fruit', 5, 'bowl', 3, 33, null],
    ['hermit_thrush', 'チャイロコツグミ', 'F', 'inv+fruit', 2, 'bowl', 2, 28, 'gainFeeder', 'fruit'],
    ['american_woodcock', 'アメリカヤマシギ', 'FG', 'inv+inv+seed', 6, 'ground', 2, 46, null],
    ['wild_turkey', 'シチメンチョウ', 'FG', 'seed+seed+fruit', 8, 'ground', 5, 135, null],
    ['ruffed_grouse', 'エリマキライチョウ', 'F', 'seed+fruit', 5, 'ground', 3, 56, null],
    ['great_horned_owl', 'アメリカワシミミズク', 'FG', 'rodent+rodent+rodent', 8, 'platform', 2, 112, 'predator', 100],
    ['barred_owl', 'アメリカフクロウ', 'F', 'rodent+rodent', 3, 'cavity', 2, 107, 'predator', 75],
    ['eastern_screech_owl', 'ヒガシアメリカオオコノハズク', 'F', 'rodent', 2, 'cavity', 4, 51, 'predator', 50],
    ['coopers_hawk', 'クーパーハイタカ', 'F', 'rodent', 3, 'platform', 2, 71, 'predator', 50],
    ['red_shouldered_hawk', 'カタアカノスリ', 'F', 'rodent+rodent', 3, 'platform', 2, 99, 'predator', 75],
    ['broad_winged_hawk', 'ハネビロノスリ', 'F', 'rodent', 2, 'platform', 2, 86, 'predator', 75],
    ['red_tailed_hawk', 'アカオノスリ', 'FG', 'rodent+rodent', 5, 'platform', 2, 124, 'predator', 75],
    ['barn_owl', 'メンフクロウ', 'FGW', 'rodent+rodent', 5, 'cavity', 4, 107, 'hunt', 'rodent'],
    ['american_crow', 'アメリカガラス', 'FGW', 'any', 4, 'platform', 2, 99, 'discardEggFood', 1],
    ['common_raven', 'ワタリガラス', 'FGW', 'any+any', 5, 'platform', 2, 135, 'discardEggFood', 2],
    ['wood_duck', 'アメリカオシ', 'FW', 'seed+seed', 4, 'cavity', 3, 76, 'drawCard'],
    ['chimney_swift', 'エントツアマツバメ', 'FGW', 'inv+inv', 3, 'cavity', 2, 36, 'tuckDraw'],
    ['carolina_wren', 'チャバラマユミソサザイ', 'F', 'inv', 1, 'cavity', 3, 20, 'layThis'],
    ['house_wren', 'イエミソサザイ', 'FG', 'inv', 1, 'cavity', 5, 15, 'layAny'],
    ['eastern_towhee', 'トウヒチョウ', 'FG', 'inv+seed', 3, 'ground', 3, 28, 'gainFeeder', 'seed'],
    ['dark_eyed_junco', 'ユキヒメドリ', 'FG', 'seed', 1, 'ground', 3, 23, 'tuckFood', 'seed'],
    ['chipping_sparrow', 'チャガシラヒメドリ', 'FG', 'inv+seed', 1, 'bowl', 3, 23, 'tuckDraw'],
    ['song_sparrow', 'ウタスズメ', 'FGW', 'inv/seed', 0, 'bowl', 5, 23, 'layThis'],
    ['white_throated_sparrow', 'ノドジロシトド', 'FGW', 'inv+seed', 2, 'ground', 2, 23, 'tuckDraw'],
    ['pine_siskin', 'マツノキヒワ', 'FG', 'seed', 1, 'bowl', 2, 23, 'tuckFood', 'seed'],
    ['bushtit', 'ヤブガラ', 'FG', 'inv', 1, 'bowl', 5, 15, 'tuckDraw'],
    ['mourning_dove', 'ナゲキバト', 'FGW', 'seed', 0, 'platform', 5, 46, 'layThis'],
    ['common_nighthawk', 'アメリカヨタカ', 'FGW', 'inv+inv', 3, 'ground', 2, 56, 'gainFeeder', 'inv'],
    // 草原
    ['american_kestrel', 'アメリカチョウゲンボウ', 'G', 'inv+rodent', 5, 'cavity', 3, 56, 'hunt', 'rodent'],
    ['burrowing_owl', 'アナホリフクロウ', 'G', 'inv+rodent', 4, 'star', 4, 53, 'hunt', 'rodent'],
    ['northern_harrier', 'ハイイロチュウヒ', 'GW', 'rodent+rodent', 3, 'ground', 4, 109, 'predator', 75],
    ['swainsons_hawk', 'アレチノスリ', 'G', 'inv+rodent', 4, 'platform', 2, 132, 'predator', 75],
    ['ferruginous_hawk', 'アカケアシノスリ', 'G', 'rodent+rodent', 6, 'platform', 2, 140, 'predator', 75],
    ['prairie_falcon', 'ソウゲンハヤブサ', 'G', 'rodent+rodent', 5, 'platform', 2, 102, 'predator', 75],
    ['peregrine_falcon', 'ハヤブサ', 'GW', 'rodent+rodent', 5, 'platform', 2, 104, 'predator', 100],
    ['golden_eagle', 'イヌワシ', 'GW', 'rodent+rodent+rodent', 8, 'platform', 1, 201, 'predator', 100],
    ['loggerhead_shrike', 'アメリカオオモズ', 'G', 'inv+rodent', 3, 'bowl', 4, 33, 'predator', 50],
    ['eastern_meadowlark', 'ヒガシマキバドリ', 'G', 'inv+seed', 2, 'ground', 4, 38, 'layAny'],
    ['western_meadowlark', 'ニシマキバドリ', 'G', 'inv+seed', 4, 'ground', 5, 38, null],
    ['bobolink', 'コメクイドリ', 'G', 'inv+seed', 5, 'ground', 3, 30, null],
    ['dickcissel', 'ムナグロノジコ', 'G', 'inv+seed', 3, 'ground', 3, 25, 'tuckEgg'],
    ['grasshopper_sparrow', 'バッタドリ', 'G', 'inv', 1, 'ground', 2, 20, 'gainFeeder', 'inv'],
    ['savannah_sparrow', 'サバンナシトド', 'G', 'seed', 1, 'ground', 3, 20, 'layThis'],
    ['horned_lark', 'ハマヒバリ', 'G', 'seed+seed', 4, 'ground', 3, 33, null],
    ['american_goldfinch', 'オウゴンヒワ', 'G', 'seed+seed', 3, 'bowl', 3, 23, 'gainSupply', 'seed'],
    ['house_finch', 'メキシコマシコ', 'G', 'seed+fruit', 3, 'bowl', 6, 25, 'gainFeeder', 'seed'],
    ['eurasian_collared_dove', 'シラコバト', 'G', 'seed', 0, 'platform', 3, 51, 'tuckFood', 'seed'],
    ['inca_dove', 'インカバト', 'G', 'seed', 2, 'platform', 4, 28, 'layThis'],
    ['northern_bobwhite', 'コリンウズラ', 'G', 'seed+seed', 1, 'ground', 6, 33, 'layThis'],
    ['california_quail', 'カンムリウズラ', 'G', 'seed+seed', 3, 'ground', 6, 36, null],
    ['greater_prairie_chicken', 'ソウゲンライチョウ', 'G', 'seed+seed', 5, 'ground', 4, 71, null],
    ['sharp_tailed_grouse', 'ホソオライチョウ', 'G', 'seed+fruit', 4, 'ground', 4, 69, 'laySameNest', 'ground'],
    ['eastern_bluebird', 'ルリツグミ', 'G', 'inv+fruit', 4, 'cavity', 5, 33, 'playAnother', 'grassland'],
    ['mountain_bluebird', 'ムジルリツグミ', 'G', 'inv+fruit', 5, 'cavity', 5, 36, null],
    ['brewers_blackbird', 'テリクロムクドリモドキ', 'G', 'inv+seed', 3, 'bowl', 3, 38, 'tuckFood', 'seed'],
    ['common_grackle', 'オオクロムクドリモドキ', 'G', 'inv+seed', 3, 'bowl', 3, 43, 'tuckDraw'],
    ['scissor_tailed_flycatcher', 'エンビタイランチョウ', 'G', 'inv+inv', 3, 'bowl', 2, 38, 'gainFeeder', 'inv'],
    ['blue_grosbeak', 'ルリイカル', 'G', 'inv+seed', 4, 'bowl', 3, 28, null],
    ['mississippi_kite', 'ミシシッピートビ', 'G', 'inv+inv', 4, 'platform', 1, 79, null],
    ['killdeer', 'フタオビチドリ', 'GW', 'inv+seed', 1, 'ground', 3, 46, 'discardEggCards', 2],
    ['sandhill_crane', 'カナダヅル', 'GW', 'seed+seed+fruit', 6, 'ground', 1, 196, null],
    ['canada_goose', 'カナダガン', 'GW', 'seed+seed', 3, 'ground', 5, 137, null],
    ['barn_swallow', 'ツバメ', 'GW', 'inv', 1, 'bowl', 3, 38, 'tuckDraw'],
    ['cliff_swallow', 'サンショクツバメ', 'GW', 'inv+inv', 3, 'bowl', 3, 33, 'tuckDraw'],
    ['tree_swallow', 'ミドリツバメ', 'GW', 'inv+seed', 3, 'cavity', 4, 36, 'tuckEgg'],
    ['purple_martin', 'ムラサキツバメ', 'GW', 'inv+inv', 3, 'cavity', 3, 46, 'tuckFood', 'inv'],
    ['red_winged_blackbird', 'ハゴロモガラス', 'GW', 'inv+seed', 2, 'bowl', 4, 33, 'tuckDraw'],
    // 湿地
    ['yellow_headed_blackbird', 'キガシラムクドリモドキ', 'W', 'inv+seed', 4, 'bowl', 3, 38, 'tuckEgg'],
    ['bald_eagle', 'ハクトウワシ', 'W', 'fish+fish+rodent', 9, 'platform', 1, 203, 'gainAllFeeder', 'fish'],
    ['osprey', 'ミサゴ', 'W', 'fish', 5, 'platform', 2, 160, 'allFood', 'fish'],
    ['belted_kingfisher', 'アメリカヤマセミ', 'W', 'fish+inv', 4, 'cavity', 5, 51, 'hunt', 'fish'],
    ['great_blue_heron', 'オオアオサギ', 'W', 'fish+fish', 5, 'platform', 2, 183, 'predator', 75],
    ['great_egret', 'ダイサギ', 'W', 'fish+fish+inv', 7, 'platform', 3, 130, 'predator', 100],
    ['snowy_egret', 'ユキコサギ', 'W', 'inv+fish', 2, 'platform', 3, 104, 'drawCard'],
    ['green_heron', 'ササゴイ', 'W', 'inv+fish', 4, 'platform', 3, 66, 'tradeFood'],
    ['black_crowned_night_heron', 'ゴイサギ', 'W', 'fish+inv+rodent', 7, 'platform', 3, 112, null],
    ['american_bittern', 'サンカノゴイ', 'W', 'inv+fish+rodent', 7, 'ground', 2, 107, 'fewestDraw', 'wetland'],
    ['least_bittern', 'ヒメヨシゴイ', 'W', 'inv+fish', 4, 'platform', 3, 41, null],
    ['american_white_pelican', 'アメリカシロペリカン', 'W', 'fish+fish+fish', 5, 'ground', 1, 274, 'discardFoodTuck', 'fish'],
    ['brown_pelican', 'カッショクペリカン', 'W', 'fish+fish+fish', 4, 'platform', 2, 201, 'gainSupply', 'fish'],
    ['double_crested_cormorant', 'ミミヒメウ', 'W', 'fish+fish', 3, 'platform', 3, 132, 'discardFoodTuck', 'fish'],
    ['anhinga', 'アメリカヘビウ', 'W', 'fish+fish', 6, 'platform', 3, 114, 'hunt', 'fish'],
    ['common_loon', 'ハシグロアビ', 'W', 'fish+inv', 6, 'ground', 1, 117, null],
    ['pied_billed_grebe', 'オビハシカイツブリ', 'W', 'inv+fish', 1, 'ground', 3, 41, 'drawCard'],
    ['mallard', 'マガモ', 'W', 'seed', 0, 'ground', 4, 89, 'drawCard'],
    ['northern_pintail', 'オナガガモ', 'W', 'seed+inv', 1, 'ground', 4, 86, 'drawCard'],
    ['canvasback', 'オオホシハジロ', 'W', 'seed+inv', 5, 'ground', 2, 79, 'allDraw'],
    ['blue_winged_teal', 'ミカヅキシマアジ', 'GW', 'inv+seed', 2, 'ground', 4, 58, 'drawCard'],
    ['hooded_merganser', 'オウギアイサ', 'W', 'fish+inv', 3, 'cavity', 2, 61, 'hunt', 'fish'],
    ['common_merganser', 'カワアイサ', 'W', 'fish+inv', 2, 'cavity', 4, 86, 'hunt', 'fish'],
    ['trumpeter_swan', 'ナキハクチョウ', 'W', 'seed+seed+seed', 9, 'platform', 1, 203, null],
    ['mute_swan', 'コブハクチョウ', 'W', 'seed+seed', 3, 'platform', 3, 203, 'drawCards', 2],
    ['whooping_crane', 'アメリカシロヅル', 'W', 'seed+inv+fish', 8, 'ground', 1, 221, null],
    ['american_coot', 'アメリカオオバン', 'W', 'seed+inv', 3, 'platform', 5, 61, 'tuckDraw'],
    ['american_avocet', 'アメリカソリハシセイタカシギ', 'W', 'inv+inv+seed', 6, 'ground', 4, 79, null],
    ['black_necked_stilt', 'クロエリセイタカシギ', 'W', 'inv+inv', 4, 'ground', 4, 74, null],
    ['wilsons_snipe', 'アメリカタシギ', 'W', 'inv+inv', 5, 'ground', 2, 46, null],
    ['black_tern', 'ハシグロクロハラアジサシ', 'W', 'inv+fish', 4, 'ground', 2, 61, 'drawCard'],
    ['ring_billed_gull', 'クロワカモメ', 'GW', 'any', 3, 'ground', 3, 122, null],
    ['black_skimmer', 'クロハサミアジサシ', 'W', 'fish+fish', 6, 'ground', 2, 112, null],
    ['roseate_spoonbill', 'ベニヘラサギ', 'W', 'inv+fish+seed', 6, 'platform', 2, 127, 'bonusDraw', 2],
    ['wood_stork', 'アメリカトキコウ', 'W', 'fish+fish+rodent', 6, 'platform', 2, 155, null],
    ['white_ibis', 'シロトキ', 'W', 'inv+inv', 3, 'platform', 3, 97, null],
    ['common_yellowthroat', 'カオグロアメリカムシクイ', 'W', 'inv', 1, 'bowl', 4, 18, 'gainFeeder', 'inv'],
    ['prothonotary_warbler', 'オウゴンアメリカムシクイ', 'FW', 'inv+seed', 3, 'cavity', 4, 23, 'bonusDraw', 2],
    ['marsh_wren', 'ハシナガヌマミソサザイ', 'W', 'inv', 1, 'cavity', 4, 15, 'layThis']
];

export const BIRDS = RAW.map(([id, name, hab, cost, points, nest, eggs, wingspan, power, arg]) => ({
    id, name,
    habitats: [...hab].map(c => H[c]),
    cost: parseCost(cost),
    points, nest, eggs, wingspan,
    power: power ? { kind: power, arg: arg ?? null, color: POWER_COLORS[power] } : null
}));

const BIRD_MAP = new Map(BIRDS.map(b => [b.id, b]));
export const birdOf = (id) => BIRD_MAP.get(id);

// ---- 鳥の性質（ボーナスカードと目標で使う） ----

export const eatsFood = (bird, food) => bird.cost.items.includes(food);
export const onlyHabitat = (bird, h) => bird.habitats.length === 1 && bird.habitats[0] === h;
export const nestMatches = (bird, nest) => bird.nest === nest || bird.nest === 'star';
export const isPredator = (bird) => ['predator', 'hunt'].includes(bird.power?.kind);
export const isFlocking = (bird) => ['tuckDraw', 'tuckFood', 'tuckEgg', 'discardFoodTuck'].includes(bird.power?.kind);
export const foodCount = (bird) => (bird.cost.or ? 1 : bird.cost.items.length);

// プレイヤーの場の鳥を [{ bird, slot, habitat }] にする
export const boardBirds = (player) => HABITATS.flatMap(h => player.board[h].map(slot => ({ bird: birdOf(slot.bird), slot, habitat: h })));

// ---- ボーナスカード ----
// count：数えるもの。tiers：[最小の数, 点] を大きい方から。per：1つあたりの点

const countBirds = (pred) => (player) => boardBirds(player).filter(({ bird, slot }) => pred(bird, slot)).length;

export const BONUS_CARDS = [
    { id: 'falconer', name: '鷹匠', text: '捕食者の鳥（カードをめくる・サイコロを振る能力）', per: 2, count: countBirds(isPredator) },
    { id: 'fishery', name: '漁業管理者', text: '魚を食べる鳥', tiers: [[4, 8], [2, 3]], count: countBirds(b => eatsFood(b, 'fish')) },
    { id: 'rodentologist', name: '齧歯類学者', text: '齧歯類を食べる鳥', per: 2, count: countBirds(b => eatsFood(b, 'rodent')) },
    { id: 'foodweb', name: '食物網の専門家', text: '無脊椎動物だけを食べる鳥', per: 2, count: countBirds(b => b.cost.items.every(f => f === 'inv')) },
    { id: 'viticulturalist', name: 'ぶどう園主', text: '果実を食べる鳥', tiers: [[4, 7], [2, 3]], count: countBirds(b => eatsFood(b, 'fruit')) },
    { id: 'birdfeeder', name: '餌台の世話人', text: '種子を食べる鳥', tiers: [[8, 7], [5, 3]], count: countBirds(b => eatsFood(b, 'seed')) },
    { id: 'forester', name: '森林官', text: '森林だけに住む鳥', tiers: [[5, 8], [3, 4]], count: countBirds(b => onlyHabitat(b, 'forest')) },
    { id: 'prairie', name: '草原の管理人', text: '草原だけに住む鳥', tiers: [[4, 8], [2, 3]], count: countBirds(b => onlyHabitat(b, 'grassland')) },
    { id: 'wetland', name: '湿地の研究者', text: '湿地だけに住む鳥', tiers: [[5, 7], [3, 3]], count: countBirds(b => onlyHabitat(b, 'wetland')) },
    { id: 'nestbox', name: '巣箱づくり', text: '卵のある樹洞の巣の鳥', tiers: [[5, 7], [4, 4]], count: countBirds((b, s) => nestMatches(b, 'cavity') && s.eggs > 0) },
    { id: 'platform', name: '巣台づくり', text: '卵のある皿形の巣の鳥', tiers: [[5, 7], [4, 4]], count: countBirds((b, s) => nestMatches(b, 'platform') && s.eggs > 0) },
    { id: 'gardener', name: '庭師', text: '卵のあるお椀形の巣の鳥', tiers: [[5, 7], [4, 4]], count: countBirds((b, s) => nestMatches(b, 'bowl') && s.eggs > 0) },
    { id: 'enclosure', name: '囲いづくり', text: '卵のある地面の巣の鳥', tiers: [[5, 7], [4, 4]], count: countBirds((b, s) => nestMatches(b, 'ground') && s.eggs > 0) },
    { id: 'large', name: '大きな鳥の専門家', text: '翼開長が 65cm を超える鳥', tiers: [[6, 6], [4, 3]], count: countBirds(b => b.wingspan > 65) },
    { id: 'passerine', name: 'スズメ目の専門家', text: '翼開長が 30cm 以下の鳥', tiers: [[6, 6], [4, 3]], count: countBirds(b => b.wingspan <= 30) },
    { id: 'counter', name: '群れの観察者', text: '群れの鳥（カードを差し込む能力）', per: 2, count: countBirds(isFlocking) },
    { id: 'breeding', name: '繁殖の管理人', text: '卵が4個以上ある鳥', per: 1, count: countBirds((b, s) => s.eggs >= 4) },
    { id: 'oologist', name: '卵の研究者', text: '卵が1個以上ある鳥', tiers: [[9, 6], [7, 3]], count: countBirds((b, s) => s.eggs >= 1) },
    { id: 'citizen', name: '市民科学者', text: '差し込んだカードがある鳥', tiers: [[6, 6], [4, 3]], count: countBirds((b, s) => s.tucked >= 1) },
    { id: 'visionary', name: '先見の指導者', text: '終了時の手札の鳥', tiers: [[8, 7], [5, 4]], count: (player) => player.hand.length },
    { id: 'ecologist', name: '生態学者', text: '鳥がいちばん少ない生息地の鳥', per: 2, count: (player) => Math.min(...HABITATS.map(h => player.board[h].length)) },
    { id: 'backyard', name: '裏庭の観察者', text: '4点未満の鳥', tiers: [[7, 6], [5, 3]], count: countBirds(b => b.points < 4) },
    { id: 'bander', name: '足環つけの名人', text: '2つ以上の生息地に住める鳥', per: 1, count: countBirds(b => b.habitats.length >= 2) }
];

const BONUS_MAP = new Map(BONUS_CARDS.map(c => [c.id, c]));
export const bonusOf = (id) => BONUS_MAP.get(id);

export function bonusPoints(card, player) {
    const n = card.count(player);
    if (card.per) return n * card.per;
    return card.tiers.find(([min]) => n >= min)?.[1] ?? 0;
}

export const bonusRule = (card) => (card.per ? `1羽 ${card.per}点` : [...card.tiers].reverse().map(([min, pts], i, list) => {
    const next = list[i + 1];
    return next ? `${min}〜${next[0] - 1}羽 ${pts}点` : `${min}羽以上 ${pts}点`;
}).join('・'));

// ---- ラウンドの目標 ----

const sum = (list) => list.reduce((s, v) => s + v, 0);

export const GOALS = [
    ...HABITATS.map(h => ({ id: `birds_${h}`, name: `${HABITAT_NAMES[h]}の鳥`, unit: '羽', measure: (p) => p.board[h].length })),
    ...HABITATS.map(h => ({ id: `eggs_${h}`, name: `${HABITAT_NAMES[h]}の卵`, unit: '個', measure: (p) => sum(p.board[h].map(s => s.eggs)) })),
    ...['bowl', 'cavity', 'ground', 'platform'].map(n => ({
        id: `nesteggs_${n}`, name: `${NEST_NAMES[n]}の巣の卵`, unit: '個',
        measure: (p) => sum(boardBirds(p).filter(({ bird }) => nestMatches(bird, n)).map(({ slot }) => slot.eggs))
    })),
    ...['bowl', 'cavity', 'ground', 'platform'].map(n => ({
        id: `nestbirds_${n}`, name: `卵のある${NEST_NAMES[n]}の巣の鳥`, unit: '羽',
        measure: (p) => boardBirds(p).filter(({ bird, slot }) => nestMatches(bird, n) && slot.eggs > 0).length
    })),
    { id: 'birds_total', name: '鳥の数', unit: '羽', measure: (p) => boardBirds(p).length }
];

const GOAL_MAP = new Map(GOALS.map(g => [g.id, g]));
export const goalOf = (id) => GOAL_MAP.get(id);
