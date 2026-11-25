/**
 * 地図のデータ（基本の地図「Imperium」に近づけて自作したもの）
 *
 * 確かめたこと
 * - 都市と州：PD-Verlag の年鑑（Concordia Almanach）の「Imperium の都市（州の順に I ブリタンニア〜XII アエギュプトゥス）」の30都市と12州。
 *   ルールブックの「サトゥルヌスは Imperium で最大12」とも合う
 * - 都市の文字（A〜D）と道（陸路44・海路35）：BGG にある公式の盤面のスキャンを目で読み取ったもの（文章の資料は見つからなかった）。
 *   文字の数（A7・B8・C10・D5）は Pianeer の戦略ガイドと一致し、道はルールブックの建築家の例
 *   （陸路 コロニア〜ノウァリア、ローマ〜アクィレイア〜ウィンドボナ、海路 ローマ〜マッシリア）と矛盾しない
 * - 文字ごとの品のトークン：GitHub の yav/concordia（実装）の値。品ごとの合計（れんが8・食料7・道具6・ワイン5・布4）は Pianeer と一致
 *
 * 決めたこと（README の「資料で分からない点の決め方」にも書く）
 * - 位置：盤の絵は使わず、実際の都市の経度・緯度に置いた（海路は陸にかからないよう、通る点を決めた）
 */

export const ROME = 'roma';

export const PROVINCES = [
    { id: 'britannia', ja: 'ブリタンニア', no: 'I', label: [-6.6, 51.3] },
    { id: 'gallia', ja: 'ガリア', no: 'II', label: [2.2, 46.3] },
    { id: 'hispania', ja: 'ヒスパニア', no: 'III', label: [-4.6, 40.4] },
    { id: 'germania', ja: 'ゲルマニア', no: 'IV', label: [11.0, 50.0] },
    { id: 'italia', ja: 'イタリア', no: 'V', label: [14.3, 39.4] },
    { id: 'mauretania', ja: 'マウレタニア', no: 'VI', label: [4.0, 34.4] },
    { id: 'dacia', ja: 'ダキア', no: 'VII', label: [26.3, 47.9] },
    { id: 'hellas', ja: 'ヘラス', no: 'VIII', label: [21.3, 38.9] },
    { id: 'lybia', ja: 'リビア', no: 'IX', label: [17.8, 29.8] },
    { id: 'asia', ja: 'アシア', no: 'X', label: [33.4, 39.5] },
    { id: 'syria', ja: 'シリア', no: 'XI', label: [38.2, 32.1] },
    { id: 'aegyptus', ja: 'アエギュプトゥス', no: 'XII', label: [25.4, 28.95] }
];

// 都市：id・ラテン語の名前・日本語の名前・州・文字・経度・緯度
export const CITIES = [
    ['isca', 'Isca Dumnoniorum', 'イスカ', 'britannia', 'A', -3.53, 50.72],
    ['londinium', 'Londinium', 'ロンディニウム', 'britannia', 'A', -0.12, 51.51],
    ['lutetia', 'Lutetia', 'ルテティア', 'gallia', 'B', 2.35, 48.86],
    ['burdigala', 'Burdigala', 'ブルディガラ', 'gallia', 'B', -0.58, 44.84],
    ['massilia', 'Massilia', 'マッシリア', 'gallia', 'B', 5.37, 43.30],
    ['brigantium', 'Brigantium', 'ブリガンティウム', 'hispania', 'B', -8.40, 43.37],
    ['olisipo', 'Olisipo', 'オリシポ', 'hispania', 'B', -9.14, 38.72],
    ['valentia', 'Valentia', 'ウァレンティア', 'hispania', 'B', -0.38, 39.47],
    ['colonia', 'Colonia Agrippina', 'コロニア', 'germania', 'A', 6.95, 50.94],
    ['vindobona', 'Vindobona', 'ウィンドボナ', 'germania', 'A', 16.37, 48.21],
    ['novaria', 'Novaria', 'ノウァリア', 'italia', 'D', 8.62, 45.45],
    ['aquileia', 'Aquileia', 'アクィレイア', 'italia', 'D', 13.37, 45.77],
    ['syracusae', 'Syracusae', 'シュラクサイ', 'italia', 'D', 15.29, 37.07],
    ['rusadir', 'Rusadir', 'ルサディル', 'mauretania', 'B', -2.94, 35.29],
    ['carthago', 'Carthago', 'カルタゴ', 'mauretania', 'B', 10.32, 36.85],
    ['napoca', 'Napoca', 'ナポカ', 'dacia', 'A', 23.60, 46.77],
    ['sirmium', 'Sirmium', 'シルミウム', 'dacia', 'A', 19.61, 44.97],
    ['tomis', 'Tomis', 'トミス', 'dacia', 'A', 28.65, 44.17],
    ['dyrrhachium', 'Dyrrhachium', 'デュッラキウム', 'hellas', 'D', 19.45, 41.32],
    ['athenae', 'Athenae', 'アテナイ', 'hellas', 'D', 23.73, 37.98],
    ['leptis', 'Leptis Magna', 'レプティス・マグナ', 'lybia', 'C', 14.29, 32.64],
    ['cyrene', 'Cyrene', 'キュレネ', 'lybia', 'C', 21.86, 32.82],
    ['bycantium', 'Bycantium', 'ビュザンティウム', 'asia', 'C', 28.98, 41.01],
    ['sinope', 'Sinope', 'シノペ', 'asia', 'C', 35.15, 42.03],
    ['attalia', 'Attalia', 'アッタリア', 'asia', 'C', 30.70, 36.89],
    ['antiochia', 'Antiochia', 'アンティオキア', 'syria', 'C', 36.16, 36.20],
    ['tyros', 'Tyros', 'テュロス', 'syria', 'C', 35.20, 33.27],
    ['alexandria', 'Alexandria', 'アレクサンドリア', 'aegyptus', 'C', 29.92, 31.20],
    ['memphis', 'Memphis', 'メンフィス', 'aegyptus', 'C', 31.25, 29.85],
    ['petra', 'Petra', 'ペトラ', 'aegyptus', 'C', 35.44, 30.33]
].map(([id, name, ja, province, letter, lon, lat]) => ({ id, name, ja, province, letter, lon, lat }));

export const ROMA = { id: ROME, name: 'Roma', ja: 'ローマ', province: null, letter: null, lon: 12.50, lat: 41.90 };

// 文字ごとの品のトークン（その文字の都市の数と同じ6枚ずつ。決めたもの）
export const TOKENS = {
    A: ['brick', 'brick', 'food', 'food', 'tool', 'wine', 'cloth'],
    B: ['brick', 'brick', 'food', 'food', 'tool', 'tool', 'wine', 'cloth'],
    C: ['brick', 'brick', 'brick', 'food', 'food', 'tool', 'tool', 'wine', 'wine', 'cloth'],
    D: ['brick', 'food', 'tool', 'wine', 'cloth']
};

// 道：[都市, 都市, 陸 'land' か 海 'sea', 描くときに通る点（海路が陸にかからないように）]
const ROAD_LIST = [
    // 陸路（44本）
    ['isca', 'londinium', 'land'], ['londinium', 'lutetia', 'land'], ['lutetia', 'colonia', 'land'], ['lutetia', 'burdigala', 'land'],
    ['lutetia', 'massilia', 'land'], ['burdigala', 'massilia', 'land'], ['burdigala', 'brigantium', 'land'], ['brigantium', 'olisipo', 'land'],
    ['brigantium', 'valentia', 'land'], ['olisipo', 'valentia', 'land'], ['olisipo', 'rusadir', 'land'], ['valentia', 'rusadir', 'land'],
    ['valentia', 'massilia', 'land'], ['massilia', 'novaria', 'land'], ['colonia', 'novaria', 'land'], ['colonia', 'vindobona', 'land'],
    ['vindobona', 'aquileia', 'land'], ['vindobona', 'sirmium', 'land'], ['novaria', 'aquileia', 'land'], ['novaria', 'roma', 'land'],
    ['aquileia', 'roma', 'land'], ['aquileia', 'sirmium', 'land'], ['roma', 'syracusae', 'land'], ['sirmium', 'napoca', 'land'],
    ['sirmium', 'tomis', 'land'], ['napoca', 'tomis', 'land'], ['sirmium', 'dyrrhachium', 'land'], ['tomis', 'bycantium', 'land'],
    ['dyrrhachium', 'bycantium', 'land'], ['dyrrhachium', 'athenae', 'land'], ['bycantium', 'sinope', 'land'], ['bycantium', 'attalia', 'land'],
    ['sinope', 'antiochia', 'land'], ['attalia', 'antiochia', 'land'], ['antiochia', 'tyros', 'land'], ['tyros', 'alexandria', 'land'],
    ['tyros', 'petra', 'land'], ['alexandria', 'memphis', 'land'], ['memphis', 'petra', 'land'], ['cyrene', 'alexandria', 'land'],
    ['cyrene', 'memphis', 'land'], ['leptis', 'cyrene', 'land'], ['carthago', 'leptis', 'land'], ['rusadir', 'carthago', 'land'],
    // 海路（35本）
    ['isca', 'londinium', 'sea', [-1.6, 50.35]], ['londinium', 'colonia', 'sea', [3.0, 51.9]], ['isca', 'burdigala', 'sea', [-4.6, 48.0]],
    ['isca', 'brigantium', 'sea', [-7.2, 47.4]], ['brigantium', 'burdigala', 'sea', [-4.0, 45.2]], ['brigantium', 'olisipo', 'sea', [-10.0, 41.0]],
    ['olisipo', 'rusadir', 'sea', [-6.6, 35.9]], ['valentia', 'rusadir', 'sea', [-0.6, 37.2]], ['valentia', 'massilia', 'sea', [3.0, 41.3]],
    ['valentia', 'carthago', 'sea'], ['rusadir', 'carthago', 'sea', [4.0, 37.6]], ['massilia', 'roma', 'sea', [9.0, 42.4]],
    ['massilia', 'carthago', 'sea', [7.0, 40.0]], ['roma', 'carthago', 'sea'], ['roma', 'syracusae', 'sea', [13.4, 39.2]],
    ['carthago', 'syracusae', 'sea'], ['carthago', 'leptis', 'sea', [12.4, 34.6]], ['syracusae', 'leptis', 'sea'],
    ['syracusae', 'cyrene', 'sea'], ['syracusae', 'athenae', 'sea', [20.8, 36.6]], ['syracusae', 'dyrrhachium', 'sea', [18.6, 39.3]],
    ['aquileia', 'dyrrhachium', 'sea', [16.0, 43.0]], ['leptis', 'cyrene', 'sea', [18.0, 33.4]], ['athenae', 'cyrene', 'sea', [23.0, 35.0]],
    ['athenae', 'bycantium', 'sea', [25.2, 39.6]], ['athenae', 'attalia', 'sea', [27.0, 36.2]], ['athenae', 'alexandria', 'sea', [26.6, 33.8]],
    ['cyrene', 'alexandria', 'sea', [25.6, 33.3]], ['tomis', 'bycantium', 'sea', [29.6, 42.6]], ['tomis', 'sinope', 'sea', [32.4, 43.6]],
    ['bycantium', 'sinope', 'sea', [32.0, 42.3]], ['attalia', 'alexandria', 'sea', [30.5, 34.0]], ['attalia', 'antiochia', 'sea', [33.8, 36.1]],
    ['antiochia', 'tyros', 'sea', [35.3, 34.7]], ['tyros', 'alexandria', 'sea', [32.4, 32.0]]
];

export const ROADS = ROAD_LIST.map(([a, b, kind, via], id) => ({ id, a, b, kind, via: via ?? null }));
export const ROAD = Object.fromEntries(ROADS.map(r => [r.id, r]));
export const CITY = Object.fromEntries([ROMA, ...CITIES].map(c => [c.id, c]));

// その都市から出る、その種類の道
const AT = {};
ROADS.forEach(r => {
    [r.a, r.b].forEach(city => {
        AT[city] = AT[city] ?? { land: [], sea: [] };
        AT[city][r.kind].push(r.id);
    });
});
export const roadsAt = (city, kind) => AT[city]?.[kind] ?? [];
