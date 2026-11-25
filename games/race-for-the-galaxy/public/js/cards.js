/**
 * レース・フォー・ザ・ギャラクシー（基本ゲーム）のカード 95 種・114 枚
 * Keldon Jones の RFTG（cards.txt）を元にし、BGA の実装と別のカード一覧で費用・勝利点・種類・商品を照らし合わせた
 * powers は Keldon の書き方のまま：phase（1 探索・2 開発・3 入植・4 消費・5 生産）、code（効果の組み合わせ）、value、times（消費の回数）
 * bonus は 6 コストの開発の得点（場のカード 1 枚ごとに、最初に当てはまった条件の点を足す）
 * 名前の日本語は自分で付けた訳。en は元の名前
 */

export const CARDS = [
    {key: "oldEarth", name: "旧地球", en: "Old Earth", type: "world", cost: 3, vp: 2, count: 1, flags: ["start"], powers: [{phase: 4, code: ["TRADE_ANY"], value: 1},{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 1, times: 2}]},
    {key: "epsilonEridani", name: "エプシロン・エリダニ", en: "Epsilon Eridani", type: "world", cost: 2, vp: 1, count: 1, flags: ["start"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 1},{phase: 4, code: ["CONSUME_ANY","GET_CARD","GET_VP"], value: 1, times: 1}]},
    {key: "alphaCentauri", name: "アルファ・ケンタウリ", en: "Alpha Centauri", type: "world", cost: 2, vp: 0, count: 1, good: "rare", flags: ["start","windfall"], powers: [{phase: 3, code: ["REDUCE","RARE"], value: 1},{phase: 3, code: ["EXTRA_MILITARY","RARE"], value: 1}]},
    {key: "newSparta", name: "ニュー・スパルタ", en: "New Sparta", type: "world", cost: 2, vp: 1, count: 1, flags: ["start","military"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 2}]},
    {key: "earthsLostColony", name: "地球の失われた植民地", en: "Earth's Lost Colony", type: "world", cost: 2, vp: 1, count: 1, good: "novelty", flags: ["start"], powers: [{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 1, times: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "rebelFuelCache", name: "反乱軍の燃料庫", en: "Rebel Fuel Cache", type: "world", cost: 1, vp: 1, count: 1, good: "rare", flags: ["windfall","military","rebel"]},
    {key: "publicWorks", name: "公共事業", en: "Public Works", type: "dev", cost: 1, vp: 1, count: 2, powers: [{phase: 2, code: ["DRAW_AFTER"], value: 1},{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 1, times: 1}]},
    {key: "gemWorld", name: "宝石の世界", en: "Gem World", type: "world", cost: 2, vp: 1, count: 1, good: "novelty", powers: [{phase: 5, code: ["PRODUCE"], value: 0},{phase: 5, code: ["DRAW_IF"], value: 1}]},
    {key: "colonyShip", name: "植民船", en: "Colony Ship", type: "dev", cost: 2, vp: 1, count: 2, powers: [{phase: 3, code: ["DISCARD","REDUCE_ZERO"], value: 0}]},
    {key: "cometZone", name: "彗星帯", en: "Comet Zone", type: "world", cost: 3, vp: 2, count: 1, good: "rare", powers: [{phase: 5, code: ["PRODUCE"], value: 0},{phase: 5, code: ["DRAW_IF"], value: 1}]},
    {key: "expeditionForce", name: "遠征軍", en: "Expedition Force", type: "dev", cost: 1, vp: 1, count: 2, powers: [{phase: 1, code: ["DRAW"], value: 1},{phase: 3, code: ["EXTRA_MILITARY"], value: 1}]},
    {key: "miningRobots", name: "採掘ロボット", en: "Mining Robots", type: "dev", cost: 2, vp: 1, count: 2, powers: [{phase: 3, code: ["REDUCE","RARE"], value: 1},{phase: 5, code: ["WINDFALL_RARE"], value: 0}]},
    {key: "rebelMiners", name: "反乱軍の鉱夫", en: "Rebel Miners", type: "world", cost: 2, vp: 1, count: 1, good: "rare", flags: ["military","rebel"], powers: [{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "exportDuties", name: "輸出関税", en: "Export Duties", type: "dev", cost: 1, vp: 1, count: 2, powers: [{phase: 4, code: ["TRADE_ANY"], value: 1}]},
    {key: "formerPenalColony", name: "元流刑地", en: "Former Penal Colony", type: "world", cost: 2, vp: 1, count: 1, good: "novelty", flags: ["windfall","military"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 1}]},
    {key: "malevolentLifeforms", name: "悪意ある生命体", en: "Malevolent Lifeforms", type: "world", cost: 4, vp: 2, count: 1, good: "gene", flags: ["military"], powers: [{phase: 1, code: ["DRAW"], value: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "newMilitaryTactics", name: "新戦術", en: "New Military Tactics", type: "dev", cost: 1, vp: 1, count: 2, powers: [{phase: 3, code: ["DISCARD","EXTRA_MILITARY"], value: 3}]},
    {key: "spaceMarines", name: "宇宙海兵隊", en: "Space Marines", type: "dev", cost: 2, vp: 1, count: 2, powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 2}]},
    {key: "contactSpecialist", name: "接触の専門家", en: "Contact Specialist", type: "dev", cost: 1, vp: 1, count: 2, powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: -1},{phase: 3, code: ["PAY_MILITARY"], value: 1}]},
    {key: "avianUpliftRace", name: "鳥類の知性化種族", en: "Avian Uplift Race", type: "world", cost: 2, vp: 2, count: 1, good: "gene", flags: ["windfall","military","uplift"]},
    {key: "spiceWorld", name: "香料の世界", en: "Spice World", type: "world", cost: 2, vp: 1, count: 1, good: "novelty", powers: [{phase: 4, code: ["TRADE_NOVELTY"], value: 2},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "lostSpeciesArkWorld", name: "失われた種の箱舟", en: "Lost Species Ark World", type: "world", cost: 5, vp: 3, count: 1, good: "gene", powers: [{phase: 5, code: ["PRODUCE"], value: 0},{phase: 5, code: ["DRAW_IF"], value: 2}]},
    {key: "newVinland", name: "ニュー・ヴィンランド", en: "New Vinland", type: "world", cost: 2, vp: 1, count: 1, good: "novelty", powers: [{phase: 4, code: ["CONSUME_ANY","GET_2_CARD"], value: 1, times: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "artistColony", name: "芸術家の植民地", en: "Artist Colony", type: "world", cost: 1, vp: 1, count: 1, good: "novelty", powers: [{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "alienRoboticFactory", name: "異星のロボット工場", en: "Alien Robotic Factory", type: "world", cost: 6, vp: 5, count: 1, good: "alien", flags: ["alien"], powers: [{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "plagueWorld", name: "疫病の世界", en: "Plague World", type: "world", cost: 3, vp: 0, count: 1, good: "gene", powers: [{phase: 4, code: ["CONSUME_GENE","GET_CARD","GET_VP"], value: 1, times: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "distantWorld", name: "遠い世界", en: "Distant World", type: "world", cost: 4, vp: 2, count: 1, good: "gene", powers: [{phase: 4, code: ["TRADE_NOVELTY"], value: 3},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "rebelOutpost", name: "反乱軍の前哨基地", en: "Rebel Outpost", type: "world", cost: 5, vp: 5, count: 1, flags: ["rebel","military"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 1}]},
    {key: "rebelWarriorRace", name: "反乱軍の戦士種族", en: "Rebel Warrior Race", type: "world", cost: 3, vp: 2, count: 1, good: "gene", flags: ["rebel","windfall","military"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 1}]},
    {key: "rebelUnderground", name: "反乱軍の地下組織", en: "Rebel Underground", type: "world", cost: 3, vp: 4, count: 1, flags: ["rebel","military"], powers: [{phase: 5, code: ["DRAW"], value: 1}]},
    {key: "newSurvivalists", name: "新サバイバリスト", en: "New Survivalists", type: "world", cost: 1, vp: 1, count: 1, good: "novelty", flags: ["military"], powers: [{phase: 4, code: ["CONSUME_NOVELTY","GET_CARD"], value: 1, times: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "outlawWorld", name: "無法の世界", en: "Outlaw World", type: "world", cost: 1, vp: 1, count: 1, flags: ["military"], powers: [{phase: 4, code: ["CONSUME_ANY","GET_CARD","GET_VP"], value: 1, times: 1}]},
    {key: "lostAlienBattleFleet", name: "失われた異星の艦隊", en: "Lost Alien Battle Fleet", type: "world", cost: 6, vp: 4, count: 1, good: "alien", flags: ["alien","military"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 3},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "diversifiedEconomy", name: "多角経済", en: "Diversified Economy", type: "dev", cost: 4, vp: 2, count: 2, powers: [{phase: 4, code: ["CONSUME_3_DIFF","GET_VP"], value: 3, times: 1},{phase: 5, code: ["DRAW_DIFFERENT"], value: 1}]},
    {key: "consumerMarkets", name: "消費市場", en: "Consumer Markets", type: "dev", cost: 5, vp: 3, count: 2, powers: [{phase: 4, code: ["CONSUME_NOVELTY","GET_VP"], value: 1, times: 3},{phase: 5, code: ["DRAW_EACH_NOVELTY"], value: 1}]},
    {key: "miningConglomerate", name: "鉱業複合企業", en: "Mining Conglomerate", type: "dev", cost: 3, vp: 2, count: 2, powers: [{phase: 4, code: ["TRADE_RARE"], value: 1},{phase: 4, code: ["CONSUME_RARE","GET_VP"], value: 1, times: 2},{phase: 5, code: ["DRAW_MOST_RARE"], value: 2}]},
    {key: "researchLabs", name: "研究所", en: "Research Labs", type: "dev", cost: 4, vp: 2, count: 2, powers: [{phase: 1, code: ["KEEP"], value: 1},{phase: 4, code: ["CONSUME_GENE","GET_VP"], value: 1, times: 1},{phase: 5, code: ["DRAW_EACH_ALIEN"], value: 1}]},
    {key: "deficitSpending", name: "赤字財政", en: "Deficit Spending", type: "dev", cost: 2, vp: 1, count: 2, powers: [{phase: 4, code: ["DISCARD_HAND","GET_VP"], value: 1, times: 2}]},
    {key: "investmentCredits", name: "投資信用", en: "Investment Credits", type: "dev", cost: 1, vp: 1, count: 2, powers: [{phase: 2, code: ["REDUCE"], value: 1}]},
    {key: "panGalacticLeague", name: "汎銀河連盟", en: "Pan-Galactic League", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: -1},{phase: 5, code: ["DRAW_WORLD_GENE"], value: 1}], bonus: [{type: "GENE_PRODUCTION", value: 2},{type: "GENE_WINDFALL", value: 2},{type: "MILITARY", value: 1},{type: "NAME", value: 3, name: "contactSpecialist"}]},
    {key: "miningLeague", name: "鉱業連盟", en: "Mining League", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 4, code: ["CONSUME_RARE","CONSUME_TWO","GET_VP"], value: 3, times: 1},{phase: 5, code: ["WINDFALL_RARE"], value: 0}], bonus: [{type: "RARE_PRODUCTION", value: 2},{type: "RARE_WINDFALL", value: 1},{type: "NAME", value: 2, name: "miningRobots"},{type: "NAME", value: 2, name: "miningConglomerate"}]},
    {key: "freeTradeAssociation", name: "自由貿易協会", en: "Free Trade Association", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 4, code: ["CONSUME_NOVELTY","GET_CARD","GET_VP"], value: 1, times: 3},{phase: 5, code: ["WINDFALL_NOVELTY"], value: 0}], bonus: [{type: "NOVELTY_PRODUCTION", value: 2},{type: "NOVELTY_WINDFALL", value: 1},{type: "NAME", value: 2, name: "consumerMarkets"},{type: "NAME", value: 2, name: "expandingColony"}]},
    {key: "alienTechInstitute", name: "異星技術研究所", en: "Alien Tech Institute", type: "dev", cost: 6, vp: 0, count: 1, flags: ["alien"], powers: [{phase: 3, code: ["REDUCE","ALIEN"], value: 2},{phase: 3, code: ["EXTRA_MILITARY","ALIEN"], value: 2}], bonus: [{type: "ALIEN_PRODUCTION", value: 3},{type: "ALIEN_WINDFALL", value: 2},{type: "ALIEN_FLAG", value: 2}]},
    {key: "galacticSurveySETI", name: "銀河調査：SETI", en: "Galactic Survey: SETI", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 1, code: ["DRAW"], value: 2}], bonus: [{type: "DEVEL_EXPLORE", value: 1},{type: "WORLD_EXPLORE", value: 2},{type: "WORLD", value: 1}]},
    {key: "galacticFederation", name: "銀河連邦", en: "Galactic Federation", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 2, code: ["REDUCE"], value: 2}], bonus: [{type: "SIX_DEVEL", value: 2},{type: "DEVEL", value: 1}]},
    {key: "refugeeWorld", name: "難民の世界", en: "Refugee World", type: "world", cost: 0, vp: 1, count: 1, good: "novelty", flags: ["windfall"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: -1}]},
    {key: "empathWorld", name: "共感能力者の世界", en: "Empath World", type: "world", cost: 1, vp: 1, count: 1, good: "gene", flags: ["windfall"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: -1}]},
    {key: "galacticResort", name: "銀河リゾート", en: "Galactic Resort", type: "world", cost: 3, vp: 2, count: 1, good: "novelty", flags: ["windfall"], powers: [{phase: 4, code: ["CONSUME_ANY","GET_CARD","GET_VP"], value: 1, times: 1}]},
    {key: "preSentientRace", name: "知性化前の種族", en: "Pre-Sentient Race", type: "world", cost: 2, vp: 1, count: 1, good: "gene", flags: ["windfall"]},
    {key: "desertedAlienOutpost", name: "無人の異星の前哨基地", en: "Deserted Alien Outpost", type: "world", cost: 4, vp: 3, count: 1, good: "alien", flags: ["alien","windfall"]},
    {key: "desertedAlienColony", name: "無人の異星の植民地", en: "Deserted Alien Colony", type: "world", cost: 5, vp: 4, count: 1, good: "alien", flags: ["alien","windfall"]},
    {key: "galacticEngineers", name: "銀河技術者", en: "Galactic Engineers", type: "world", cost: 2, vp: 1, count: 1, powers: [{phase: 4, code: ["TRADE_ANY"], value: 1},{phase: 5, code: ["WINDFALL_ANY"], value: 0}]},
    {key: "blackMarketTradingWorld", name: "闇市場の世界", en: "Black Market Trading World", type: "world", cost: 3, vp: 2, count: 1, powers: [{phase: 4, code: ["TRADE_ACTION","TRADE_NO_BONUS"], value: 0}]},
    {key: "merchantWorld", name: "商人の世界", en: "Merchant World", type: "world", cost: 4, vp: 2, count: 1, powers: [{phase: 4, code: ["TRADE_ANY"], value: 2},{phase: 4, code: ["DISCARD_HAND","GET_VP"], value: 1, times: 2}]},
    {key: "touristWorld", name: "観光の世界", en: "Tourist World", type: "world", cost: 4, vp: 2, count: 1, powers: [{phase: 4, code: ["CONSUME_ANY","CONSUME_TWO","GET_VP"], value: 3, times: 1}]},
    {key: "galacticTrendsetters", name: "銀河の流行仕掛け人", en: "Galactic Trendsetters", type: "world", cost: 5, vp: 3, count: 1, powers: [{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 2, times: 1}]},
    {key: "alienRosettaStoneWorld", name: "異星のロゼッタ・ストーン", en: "Alien Rosetta Stone World", type: "world", cost: 3, vp: 3, count: 1, flags: ["alien"], powers: [{phase: 3, code: ["REDUCE","ALIEN"], value: 2},{phase: 3, code: ["EXTRA_MILITARY","ALIEN"], value: 2},{phase: 5, code: ["WINDFALL_ALIEN"], value: 0}]},
    {key: "starNomadLair", name: "星の遊牧民の隠れ家", en: "Star Nomad Lair", type: "world", cost: 1, vp: 1, count: 1, good: "novelty", flags: ["windfall","military"], powers: [{phase: 1, code: ["DRAW"], value: 1},{phase: 4, code: ["TRADE_THIS"], value: 1}]},
    {key: "theLastOfTheUpliftGnarssh", name: "最後の知性化ナーシュ", en: "The Last of the Uplift Gnarssh", type: "world", cost: 1, vp: 0, count: 1, good: "gene", flags: ["windfall","military","uplift"]},
    {key: "alienRobotSentry", name: "異星のロボット歩哨", en: "Alien Robot Sentry", type: "world", cost: 2, vp: 2, count: 1, good: "alien", flags: ["windfall","military","alien"]},
    {key: "pirateWorld", name: "海賊の世界", en: "Pirate World", type: "world", cost: 3, vp: 2, count: 1, good: "novelty", flags: ["windfall","military"], powers: [{phase: 4, code: ["TRADE_THIS"], value: 3}]},
    {key: "reptilianUpliftRace", name: "爬虫類の知性化種族", en: "Reptilian Uplift Race", type: "world", cost: 2, vp: 2, count: 1, good: "gene", flags: ["windfall","military","uplift"]},
    {key: "lostAlienWarship", name: "失われた異星の戦艦", en: "Lost Alien Warship", type: "world", cost: 5, vp: 3, count: 1, good: "alien", flags: ["windfall","military","alien"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 2}]},
    {key: "alienRobotScoutShip", name: "異星のロボット偵察艦", en: "Alien Robot Scout Ship", type: "world", cost: 4, vp: 2, count: 1, good: "alien", flags: ["windfall","military","alien"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 1}]},
    {key: "runawayRobots", name: "逃亡ロボット", en: "Runaway Robots", type: "world", cost: 1, vp: 1, count: 1, good: "rare", flags: ["windfall","military"], powers: [{phase: 5, code: ["DRAW_IF"], value: 1}]},
    {key: "interstellarBank", name: "星間銀行", en: "Interstellar Bank", type: "dev", cost: 2, vp: 1, count: 2, powers: [{phase: 2, code: ["DRAW"], value: 1}]},
    {key: "terraformingRobots", name: "テラフォーミング・ロボット", en: "Terraforming Robots", type: "dev", cost: 3, vp: 2, count: 2, powers: [{phase: 3, code: ["DRAW_AFTER"], value: 1},{phase: 4, code: ["CONSUME_RARE","GET_CARD","GET_VP"], value: 1, times: 1}]},
    {key: "dropShips", name: "降下艇", en: "Drop Ships", type: "dev", cost: 4, vp: 2, count: 2, powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 3}]},
    {key: "newGalacticOrder", name: "銀河新秩序", en: "New Galactic Order", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 2}], bonus: [{type: "TOTAL_MILITARY", value: 1}]},
    {key: "asteroidBelt", name: "小惑星帯", en: "Asteroid Belt", type: "world", cost: 2, vp: 1, count: 1, good: "rare", flags: ["windfall"]},
    {key: "merchantGuild", name: "商人ギルド", en: "Merchant Guild", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 5, code: ["DRAW"], value: 2}], bonus: [{type: "NOVELTY_PRODUCTION", value: 2},{type: "RARE_PRODUCTION", value: 2},{type: "GENE_PRODUCTION", value: 2},{type: "ALIEN_PRODUCTION", value: 2}]},
    {key: "secludedWorld", name: "隔絶された世界", en: "Secluded World", type: "world", cost: 1, vp: 1, count: 1, good: "novelty", powers: [{phase: 4, code: ["CONSUME_ANY","GET_CARD"], value: 1, times: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "imperiumArmamentsWorld", name: "帝国の兵器工場", en: "Imperium Armaments World", type: "world", cost: 4, vp: 2, count: 1, good: "rare", flags: ["imperium"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "terraformedWorld", name: "テラフォーム済みの世界", en: "Terraformed World", type: "world", cost: 5, vp: 5, count: 1, powers: [{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 1, times: 1}]},
    {key: "replicantRobots", name: "レプリカント・ロボット", en: "Replicant Robots", type: "dev", cost: 4, vp: 2, count: 2, powers: [{phase: 3, code: ["REDUCE"], value: 2}]},
    {key: "pilgrimageWorld", name: "巡礼の世界", en: "Pilgrimage World", type: "world", cost: 0, vp: 2, count: 1, powers: [{phase: 4, code: ["CONSUME_ALL","GET_VP"], value: 1, times: 1}]},
    {key: "rebelHomeworld", name: "反乱軍の本拠地", en: "Rebel Homeworld", type: "world", cost: 7, vp: 7, count: 1, flags: ["military","rebel"]},
    {key: "newEconomy", name: "新経済", en: "New Economy", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 4, code: ["DRAW"], value: 1}], bonus: [{type: "DEVEL_CONSUME", value: 2},{type: "WORLD_CONSUME", value: 1}]},
    {key: "radioactiveWorld", name: "放射能の世界", en: "Radioactive World", type: "world", cost: 2, vp: 1, count: 1, good: "rare", flags: ["windfall"]},
    {key: "aquaticUpliftRace", name: "水生の知性化種族", en: "Aquatic Uplift Race", type: "world", cost: 2, vp: 2, count: 1, good: "gene", flags: ["windfall","military","uplift"]},
    {key: "geneticsLab", name: "遺伝子研究所", en: "Genetics Lab", type: "dev", cost: 2, vp: 1, count: 2, powers: [{phase: 4, code: ["TRADE_GENE"], value: 1},{phase: 5, code: ["WINDFALL_GENE"], value: 0}]},
    {key: "bioHazardMiningWorld", name: "生物災害の鉱山", en: "Bio-Hazard Mining World", type: "world", cost: 3, vp: 2, count: 1, good: "rare", powers: [{phase: 4, code: ["TRADE_GENE"], value: 2},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "desertedAlienLibrary", name: "無人の異星の図書館", en: "Deserted Alien Library", type: "world", cost: 6, vp: 5, count: 1, good: "alien", flags: ["windfall","alien"]},
    {key: "destroyedWorld", name: "破壊された世界", en: "Destroyed World", type: "world", cost: 1, vp: 0, count: 1, good: "rare", flags: ["windfall"]},
    {key: "galacticRenaissance", name: "銀河ルネサンス", en: "Galactic Renaissance", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 1, code: ["DRAW"], value: 2},{phase: 1, code: ["KEEP"], value: 1}], bonus: [{type: "THREE_VP", value: 1},{type: "NAME", value: 3, name: "researchLabs"},{type: "NAME", value: 3, name: "galacticTrendsetters"},{type: "NAME", value: 3, name: "artistColony"}]},
    {key: "blasterGemMines", name: "ブラスター宝石鉱山", en: "Blaster Gem Mines", type: "world", cost: 3, vp: 2, count: 1, good: "rare", flags: ["windfall"], powers: [{phase: 3, code: ["EXTRA_MILITARY"], value: 1}]},
    {key: "gamblingWorld", name: "賭博の世界", en: "Gambling World", type: "world", cost: 1, vp: 1, count: 1, powers: [{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 1, times: 1},{phase: 4, code: ["DRAW_LUCKY"], value: 0}]},
    {key: "expandingColony", name: "拡大する植民地", en: "Expanding Colony", type: "world", cost: 1, vp: 1, count: 1, powers: [{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 1, times: 1},{phase: 5, code: ["WINDFALL_NOVELTY"], value: 0}]},
    {key: "spacePort", name: "宇宙港", en: "Space Port", type: "world", cost: 2, vp: 1, count: 1, good: "novelty", powers: [{phase: 4, code: ["TRADE_RARE"], value: 2},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "prosperousWorld", name: "繁栄する世界", en: "Prosperous World", type: "world", cost: 3, vp: 2, count: 1, good: "novelty", powers: [{phase: 4, code: ["CONSUME_ANY","GET_VP"], value: 1, times: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "newEarth", name: "新地球", en: "New Earth", type: "world", cost: 5, vp: 3, count: 1, good: "rare", powers: [{phase: 4, code: ["CONSUME_ANY","GET_CARD","GET_VP"], value: 1, times: 1},{phase: 5, code: ["PRODUCE"], value: 0}]},
    {key: "rebelBase", name: "反乱軍の基地", en: "Rebel Base", type: "world", cost: 6, vp: 6, count: 1, flags: ["military","rebel"]},
    {key: "galacticImperium", name: "銀河帝国", en: "Galactic Imperium", type: "dev", cost: 6, vp: 0, count: 1, flags: ["imperium"], powers: [{phase: 3, code: ["EXTRA_MILITARY","AGAINST_REBEL"], value: 4}], bonus: [{type: "REBEL_MILITARY", value: 2},{type: "MILITARY", value: 1}]},
    {key: "tradeLeague", name: "交易連盟", en: "Trade League", type: "dev", cost: 6, vp: 0, count: 1, powers: [{phase: 4, code: ["TRADE_ANY"], value: 1},{phase: 4, code: ["TRADE_ACTION"], value: 0}], bonus: [{type: "DEVEL_TRADE", value: 2},{type: "WORLD_TRADE", value: 1}]},
    {key: "miningWorld", name: "鉱山の世界", en: "Mining World", type: "world", cost: 3, vp: 2, count: 1, good: "rare", powers: [{phase: 5, code: ["PRODUCE"], value: 0},{phase: 5, code: ["DRAW_IF"], value: 1}]}
];

export const CARD_BY_KEY = Object.fromEntries(CARDS.map(c => [c.key, c]));

// 1 枚ずつの ID（2 枚目からは key#2 のように番号を付ける）
export const CARD_IDS = CARDS.flatMap(c => Array.from({ length: c.count }, (_, i) => (i ? `${c.key}#${i + 1}` : c.key)));
export const keyOf = id => id.split('#')[0];
export const cardOf = id => CARD_BY_KEY[keyOf(id)];

export const START_WORLDS = CARDS.filter(c => c.flags?.includes('start')).map(c => c.key);
export const GOODS = ['novelty', 'rare', 'gene', 'alien'];
export const GOOD_NAMES = { novelty: '新奇品', rare: '希少品', gene: '遺伝子', alien: '異星の品' };
// 交易で得るカードの枚数
export const TRADE_VALUE = { novelty: 2, rare: 3, gene: 4, alien: 5 };
export const PHASES = { 1: '探索', 2: '開発', 3: '入植', 4: '消費', 5: '生産' };
