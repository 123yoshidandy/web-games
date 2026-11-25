/**
 * 部品のデータ（基本ゲーム）
 * 地形タイル85枚：キーストーン（1地形）25枚と2地形60枚。最初のタイル5組（3枚ずつ）は id 85〜99
 * 内訳は、有志の2つの実装（davidxmoody/cascadia-ai と exp111/Cascadia）で照らし合わせ、1枚の違いもなく一致した（README を参照）
 * 各地形29枚（キーストーン5枚＋2地形24枚）、各動物の印32個、キーストーンは各動物5枚
 */

export const HABITATS = ['mountain', 'forest', 'prairie', 'wetland', 'river'];
export const ANIMALS = ['bear', 'elk', 'salmon', 'hawk', 'fox'];

const t = (id, habitats, wildlife, starter = false) => Object.freeze({
    id, habitats: Object.freeze(habitats), wildlife: Object.freeze(wildlife), keystone: habitats.length === 1, starter
});

export const TILES = Object.freeze([
    t(0, ['forest'], ['bear']),
    t(1, ['forest'], ['bear']),
    t(2, ['forest'], ['elk']),
    t(3, ['forest'], ['fox']),
    t(4, ['forest'], ['fox']),
    t(5, ['forest', 'prairie'], ['bear', 'elk']),
    t(6, ['forest', 'prairie'], ['bear', 'fox']),
    t(7, ['forest', 'prairie'], ['elk', 'fox']),
    t(8, ['forest', 'prairie'], ['elk', 'salmon']),
    t(9, ['forest', 'prairie'], ['salmon', 'fox']),
    t(10, ['forest', 'prairie'], ['elk', 'salmon', 'fox']),
    t(11, ['forest', 'river'], ['bear', 'salmon']),
    t(12, ['forest', 'river'], ['bear', 'elk']),
    t(13, ['forest', 'river'], ['elk', 'hawk']),
    t(14, ['forest', 'river'], ['bear', 'fox']),
    t(15, ['forest', 'river'], ['salmon', 'fox']),
    t(16, ['forest', 'river'], ['elk', 'hawk', 'fox']),
    t(17, ['forest', 'wetland'], ['bear', 'fox']),
    t(18, ['forest', 'wetland'], ['bear', 'salmon']),
    t(19, ['forest', 'wetland'], ['elk', 'hawk']),
    t(20, ['forest', 'wetland'], ['elk', 'salmon']),
    t(21, ['forest', 'wetland'], ['hawk', 'fox']),
    t(22, ['forest', 'wetland'], ['elk', 'salmon', 'hawk']),
    t(23, ['mountain', 'forest'], ['bear', 'fox']),
    t(24, ['mountain', 'forest'], ['elk', 'fox']),
    t(25, ['mountain', 'forest'], ['bear', 'elk', 'fox']),
    t(26, ['mountain', 'forest'], ['bear', 'hawk']),
    t(27, ['mountain', 'forest'], ['elk', 'hawk']),
    t(28, ['mountain', 'forest'], ['bear', 'elk', 'hawk']),
    t(29, ['mountain'], ['bear']),
    t(30, ['mountain'], ['elk']),
    t(31, ['mountain'], ['elk']),
    t(32, ['mountain'], ['hawk']),
    t(33, ['mountain'], ['hawk']),
    t(34, ['mountain', 'prairie'], ['bear', 'salmon']),
    t(35, ['mountain', 'prairie'], ['elk', 'salmon']),
    t(36, ['mountain', 'prairie'], ['bear', 'elk', 'fox']),
    t(37, ['mountain', 'prairie'], ['elk', 'hawk']),
    t(38, ['mountain', 'prairie'], ['hawk', 'fox']),
    t(39, ['mountain', 'prairie'], ['bear', 'salmon', 'fox']),
    t(40, ['mountain', 'wetland'], ['bear', 'salmon']),
    t(41, ['mountain', 'wetland'], ['elk', 'fox']),
    t(42, ['mountain', 'wetland'], ['elk', 'hawk']),
    t(43, ['mountain', 'wetland'], ['bear', 'hawk', 'fox']),
    t(44, ['mountain', 'wetland'], ['salmon', 'hawk']),
    t(45, ['mountain', 'wetland'], ['bear', 'elk', 'salmon']),
    t(46, ['prairie'], ['elk']),
    t(47, ['prairie'], ['elk']),
    t(48, ['prairie'], ['fox']),
    t(49, ['prairie'], ['salmon']),
    t(50, ['prairie'], ['salmon']),
    t(51, ['prairie', 'river'], ['elk', 'hawk']),
    t(52, ['prairie', 'river'], ['elk', 'salmon']),
    t(53, ['prairie', 'river'], ['bear', 'fox']),
    t(54, ['prairie', 'river'], ['bear', 'hawk', 'fox']),
    t(55, ['prairie', 'river'], ['hawk', 'fox']),
    t(56, ['prairie', 'river'], ['bear', 'salmon', 'fox']),
    t(57, ['prairie', 'wetland'], ['elk', 'fox']),
    t(58, ['prairie', 'wetland'], ['elk', 'salmon']),
    t(59, ['prairie', 'wetland'], ['hawk', 'fox']),
    t(60, ['prairie', 'wetland'], ['elk', 'salmon', 'fox']),
    t(61, ['prairie', 'wetland'], ['salmon', 'hawk']),
    t(62, ['prairie', 'wetland'], ['salmon', 'hawk', 'fox']),
    t(63, ['river', 'mountain'], ['bear', 'elk']),
    t(64, ['river', 'mountain'], ['bear', 'hawk']),
    t(65, ['river', 'mountain'], ['elk', 'hawk']),
    t(66, ['river', 'mountain'], ['bear', 'salmon']),
    t(67, ['river', 'mountain'], ['bear', 'salmon', 'hawk']),
    t(68, ['river', 'mountain'], ['salmon', 'hawk']),
    t(69, ['river'], ['bear']),
    t(70, ['river'], ['bear']),
    t(71, ['river'], ['hawk']),
    t(72, ['river'], ['hawk']),
    t(73, ['river'], ['salmon']),
    t(74, ['wetland', 'river'], ['hawk', 'fox']),
    t(75, ['wetland', 'river'], ['salmon', 'fox']),
    t(76, ['wetland', 'river'], ['bear', 'hawk']),
    t(77, ['wetland', 'river'], ['bear', 'salmon']),
    t(78, ['wetland', 'river'], ['bear', 'salmon', 'hawk']),
    t(79, ['wetland', 'river'], ['salmon', 'hawk']),
    t(80, ['wetland'], ['fox']),
    t(81, ['wetland'], ['fox']),
    t(82, ['wetland'], ['hawk']),
    t(83, ['wetland'], ['salmon']),
    t(84, ['wetland'], ['salmon']),
    t(85, ['mountain'], ['bear'], true),
    t(86, ['forest', 'wetland'], ['elk', 'hawk', 'fox'], true),
    t(87, ['river', 'prairie'], ['bear', 'salmon'], true),
    t(88, ['river'], ['salmon'], true),
    t(89, ['prairie', 'forest'], ['bear', 'elk', 'salmon'], true),
    t(90, ['mountain', 'wetland'], ['hawk', 'fox'], true),
    t(91, ['prairie'], ['fox'], true),
    t(92, ['wetland', 'river'], ['salmon', 'hawk', 'fox'], true),
    t(93, ['forest', 'mountain'], ['bear', 'elk'], true),
    t(94, ['forest'], ['elk'], true),
    t(95, ['mountain', 'river'], ['bear', 'elk', 'hawk'], true),
    t(96, ['wetland', 'prairie'], ['salmon', 'fox'], true),
    t(97, ['wetland'], ['hawk'], true),
    t(98, ['river', 'forest'], ['elk', 'salmon', 'hawk'], true),
    t(99, ['prairie', 'mountain'], ['bear', 'fox'], true),
]);

// 山に入れる85枚
export const MAIN_TILE_COUNT = 85;

// 最初のタイル：上にキーストーン、左下に動物3種、右下に動物2種の2地形のタイルの三角形
// 2地形のタイルは、キーストーンに接する辺が1つ目の地形、下の2枚が接し合う辺が2つ目の地形（有志の実装2つで一致）
export const STARTERS = Object.freeze([
    [{ tile: 85, q: 0, r: 0, rot: 0 }, { tile: 86, q: -1, r: 1, rot: 1 }, { tile: 87, q: 0, r: 1, rot: 0 }],
    [{ tile: 88, q: 0, r: 0, rot: 0 }, { tile: 89, q: -1, r: 1, rot: 1 }, { tile: 90, q: 0, r: 1, rot: 0 }],
    [{ tile: 91, q: 0, r: 0, rot: 0 }, { tile: 92, q: -1, r: 1, rot: 1 }, { tile: 93, q: 0, r: 1, rot: 0 }],
    [{ tile: 94, q: 0, r: 0, rot: 0 }, { tile: 95, q: -1, r: 1, rot: 1 }, { tile: 96, q: 0, r: 1, rot: 0 }],
    [{ tile: 97, q: 0, r: 0, rot: 0 }, { tile: 98, q: -1, r: 1, rot: 1 }, { tile: 99, q: 0, r: 1, rot: 0 }],
]);

// 人数ごとの山の枚数（1人は2人と同じ）
export const tilesFor = (n) => 20 * Math.max(2, n) + 3;

