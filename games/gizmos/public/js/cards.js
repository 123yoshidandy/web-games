/**
 * ギズモのカード（基本セット 112枚：最初のギズモ4枚・レベル1〜3 各36枚）とエネルギーの色
 *
 * データは次の2つを1枚ずつ照らし合わせ、色・費用・点・種類・効果がすべて一致したものを使っている
 * - Board Game Arena 版の実装（github.com/Fletcheese/gizmos の material.inc.php）
 * - 実物のカードの写真からの書き起こし（github.com/guoruihan/BoardGameBench の gizmos.json。写真は tck.mn/blog/gizmos-boardgame）
 * 効果の意味は、公式の「効果の一覧」（CMON の GIZ_ListOfEffects）に合わせた
 *
 * カードの形
 * - color：建てるのに払うエネルギーの色。'any' は何色でも払える（建てたときの条件では全色として数える）。最初のギズモは null
 * - points：点。null は終わりに数える（upgrade.score）
 * - type：upgrade（強化）・converter（変換）・file（保管したら）・pick（取ったら）・build（建てたら）
 * - trigger：{ action, colors?（その色を取った／その色のギズモを建てた）, fromArchive?（保管庫から建てた）, level?（そのレベルを建てた） }
 * - effect：draw（ディスペンサーからランダムに引く）・pick（列から取る行動）・vp（得点チップ）・file（保管する行動）・research（研究する行動）・freeBuild（レベル1を払わずに建てる行動）
 * - upgrade：storage・archive・research（上限を増やす）／discount（level2・archive・research を建てるとき1個安い）／block（file・research をもうできない）／score（energy：残りのエネルギーの数・tokens：得点チップの点が、このカードの点）
 * - convert：建てるときの変換の手順。{ from: 色（null は何色でも）, to: 'any'（1個を好きな色として扱う）| 'double'（1個を同じ色2個として扱う） }。手順が2つあるカードは、両方使える
 */

export const COLORS = ['red', 'yellow', 'blue', 'black'];
export const COLOR_NAMES = { red: '赤', yellow: '黄', blue: '青', black: '黒', any: '全色' };
export const TYPES = ['upgrade', 'converter', 'file', 'pick', 'build'];
export const TYPE_NAMES = { upgrade: '強化', converter: '変換', file: '保管', pick: '取る', build: '建てる' };
export const ENERGY_PER_COLOR = 13;

export const CARDS = [
    { id: 0, level: 0, color: null, cost: 0, points: 0, type: 'file', trigger: { action: 'file' }, effect: { kind: 'draw', amount: 1 } },
    { id: 1, level: 0, color: null, cost: 0, points: 0, type: 'file', trigger: { action: 'file' }, effect: { kind: 'draw', amount: 1 } },
    { id: 2, level: 0, color: null, cost: 0, points: 0, type: 'file', trigger: { action: 'file' }, effect: { kind: 'draw', amount: 1 } },
    { id: 3, level: 0, color: null, cost: 0, points: 0, type: 'file', trigger: { action: 'file' }, effect: { kind: 'draw', amount: 1 } },
    { id: 4, level: 1, color: 'black', cost: 1, points: 1, type: 'converter', convert: [{ from: 'yellow', to: 'any' }] },
    { id: 5, level: 1, color: 'blue', cost: 1, points: 1, type: 'converter', convert: [{ from: 'red', to: 'any' }] },
    { id: 6, level: 1, color: 'red', cost: 1, points: 1, type: 'converter', convert: [{ from: 'black', to: 'any' }] },
    { id: 7, level: 1, color: 'yellow', cost: 1, points: 1, type: 'converter', convert: [{ from: 'blue', to: 'any' }] },
    { id: 8, level: 1, color: 'black', cost: 1, points: 1, type: 'converter', convert: [{ from: 'red', to: 'any' }] },
    { id: 9, level: 1, color: 'blue', cost: 1, points: 1, type: 'converter', convert: [{ from: 'yellow', to: 'any' }] },
    { id: 10, level: 1, color: 'red', cost: 1, points: 1, type: 'converter', convert: [{ from: 'blue', to: 'any' }] },
    { id: 11, level: 1, color: 'yellow', cost: 1, points: 1, type: 'converter', convert: [{ from: 'black', to: 'any' }] },
    { id: 12, level: 1, color: 'black', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['blue'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 13, level: 1, color: 'blue', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['red'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 14, level: 1, color: 'red', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['yellow'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 15, level: 1, color: 'yellow', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['black'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 16, level: 1, color: 'black', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['yellow'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 17, level: 1, color: 'blue', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['black'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 18, level: 1, color: 'red', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['blue'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 19, level: 1, color: 'yellow', cost: 1, points: 1, type: 'pick', trigger: { action: 'pick', colors: ['red'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 20, level: 1, color: 'black', cost: 1, points: 1, type: 'file', trigger: { action: 'file' }, effect: { kind: 'pick', amount: 1 } },
    { id: 21, level: 1, color: 'blue', cost: 1, points: 1, type: 'file', trigger: { action: 'file' }, effect: { kind: 'pick', amount: 1 } },
    { id: 22, level: 1, color: 'red', cost: 1, points: 1, type: 'file', trigger: { action: 'file' }, effect: { kind: 'pick', amount: 1 } },
    { id: 23, level: 1, color: 'yellow', cost: 1, points: 1, type: 'file', trigger: { action: 'file' }, effect: { kind: 'pick', amount: 1 } },
    { id: 24, level: 1, color: 'black', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 0, research: 1 } },
    { id: 25, level: 1, color: 'blue', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 0, research: 1 } },
    { id: 26, level: 1, color: 'red', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 0, research: 1 } },
    { id: 27, level: 1, color: 'yellow', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 0, research: 1 } },
    { id: 28, level: 1, color: 'black', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 1, research: 0 } },
    { id: 29, level: 1, color: 'blue', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 1, research: 0 } },
    { id: 30, level: 1, color: 'red', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 1, research: 0 } },
    { id: 31, level: 1, color: 'yellow', cost: 1, points: 1, type: 'upgrade', upgrade: { storage: 1, archive: 1, research: 0 } },
    { id: 32, level: 1, color: 'black', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['blue'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 33, level: 1, color: 'blue', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['yellow'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 34, level: 1, color: 'red', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['black'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 35, level: 1, color: 'yellow', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['red'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 36, level: 1, color: 'black', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['red'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 37, level: 1, color: 'blue', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['black'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 38, level: 1, color: 'red', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['yellow'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 39, level: 1, color: 'yellow', cost: 1, points: 1, type: 'build', trigger: { action: 'build', colors: ['blue'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 40, level: 2, color: 'black', cost: 3, points: 3, type: 'upgrade', upgrade: { storage: 2, archive: 1, research: 2 } },
    { id: 41, level: 2, color: 'blue', cost: 3, points: 3, type: 'upgrade', upgrade: { storage: 2, archive: 1, research: 2 } },
    { id: 42, level: 2, color: 'red', cost: 3, points: 3, type: 'upgrade', upgrade: { storage: 2, archive: 1, research: 2 } },
    { id: 43, level: 2, color: 'yellow', cost: 3, points: 3, type: 'upgrade', upgrade: { storage: 2, archive: 1, research: 2 } },
    { id: 44, level: 2, color: 'black', cost: 3, points: 3, type: 'build', trigger: { action: 'build', fromArchive: true }, effect: { kind: 'pick', amount: 2 } },
    { id: 45, level: 2, color: 'blue', cost: 3, points: 3, type: 'build', trigger: { action: 'build', fromArchive: true }, effect: { kind: 'pick', amount: 2 } },
    { id: 46, level: 2, color: 'red', cost: 3, points: 3, type: 'build', trigger: { action: 'build', fromArchive: true }, effect: { kind: 'pick', amount: 2 } },
    { id: 47, level: 2, color: 'yellow', cost: 3, points: 3, type: 'build', trigger: { action: 'build', fromArchive: true }, effect: { kind: 'pick', amount: 2 } },
    { id: 48, level: 2, color: 'black', cost: 2, points: 2, type: 'pick', trigger: { action: 'pick', colors: ['red', 'yellow'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 49, level: 2, color: 'blue', cost: 2, points: 2, type: 'pick', trigger: { action: 'pick', colors: ['yellow', 'black'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 50, level: 2, color: 'red', cost: 2, points: 2, type: 'pick', trigger: { action: 'pick', colors: ['blue', 'black'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 51, level: 2, color: 'yellow', cost: 2, points: 2, type: 'pick', trigger: { action: 'pick', colors: ['red', 'blue'] }, effect: { kind: 'draw', amount: 1 } },
    { id: 52, level: 2, color: 'black', cost: 2, points: 2, type: 'converter', convert: [{ from: 'blue', to: 'any' }, { from: 'blue', to: 'any' }] },
    { id: 53, level: 2, color: 'blue', cost: 2, points: 2, type: 'converter', convert: [{ from: 'black', to: 'any' }, { from: 'black', to: 'any' }] },
    { id: 54, level: 2, color: 'red', cost: 2, points: 2, type: 'converter', convert: [{ from: 'yellow', to: 'any' }, { from: 'yellow', to: 'any' }] },
    { id: 55, level: 2, color: 'yellow', cost: 2, points: 2, type: 'converter', convert: [{ from: 'red', to: 'any' }, { from: 'red', to: 'any' }] },
    { id: 56, level: 2, color: 'black', cost: 3, points: 3, type: 'converter', convert: [{ from: 'yellow', to: 'double' }] },
    { id: 57, level: 2, color: 'blue', cost: 3, points: 3, type: 'converter', convert: [{ from: 'red', to: 'double' }] },
    { id: 58, level: 2, color: 'red', cost: 3, points: 3, type: 'converter', convert: [{ from: 'blue', to: 'double' }] },
    { id: 59, level: 2, color: 'yellow', cost: 3, points: 3, type: 'converter', convert: [{ from: 'black', to: 'double' }] },
    { id: 60, level: 2, color: 'black', cost: 3, points: 3, type: 'converter', convert: [{ from: 'red', to: 'double' }] },
    { id: 61, level: 2, color: 'blue', cost: 3, points: 3, type: 'converter', convert: [{ from: 'yellow', to: 'double' }] },
    { id: 62, level: 2, color: 'red', cost: 3, points: 3, type: 'converter', convert: [{ from: 'black', to: 'double' }] },
    { id: 63, level: 2, color: 'yellow', cost: 3, points: 3, type: 'converter', convert: [{ from: 'blue', to: 'double' }] },
    { id: 64, level: 2, color: 'black', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['red', 'blue'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 65, level: 2, color: 'blue', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['yellow', 'black'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 66, level: 2, color: 'red', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['yellow', 'blue'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 67, level: 2, color: 'yellow', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['red', 'black'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 68, level: 2, color: 'black', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['red', 'yellow'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 69, level: 2, color: 'blue', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['red', 'yellow'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 70, level: 2, color: 'red', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['blue', 'black'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 71, level: 2, color: 'yellow', cost: 2, points: 2, type: 'build', trigger: { action: 'build', colors: ['blue', 'black'] }, effect: { kind: 'pick', amount: 1 } },
    { id: 72, level: 2, color: 'black', cost: 3, points: 3, type: 'build', trigger: { action: 'build', colors: ['yellow', 'blue'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 73, level: 2, color: 'blue', cost: 3, points: 3, type: 'build', trigger: { action: 'build', colors: ['red', 'black'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 74, level: 2, color: 'red', cost: 3, points: 3, type: 'build', trigger: { action: 'build', colors: ['yellow', 'black'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 75, level: 2, color: 'yellow', cost: 3, points: 3, type: 'build', trigger: { action: 'build', colors: ['red', 'blue'] }, effect: { kind: 'vp', amount: 1 } },
    { id: 76, level: 3, color: 'black', cost: 4, points: 4, type: 'upgrade', upgrade: { storage: 4, archive: 0, research: 0 } },
    { id: 77, level: 3, color: 'blue', cost: 4, points: 4, type: 'upgrade', upgrade: { storage: 4, archive: 0, research: 0 } },
    { id: 78, level: 3, color: 'red', cost: 4, points: 4, type: 'converter', convert: [{ from: null, to: 'any' }] },
    { id: 79, level: 3, color: 'yellow', cost: 4, points: 4, type: 'converter', convert: [{ from: null, to: 'any' }] },
    { id: 80, level: 3, color: 'black', cost: 5, points: 5, type: 'converter', convert: [{ from: 'yellow', to: 'double' }, { from: 'blue', to: 'double' }] },
    { id: 81, level: 3, color: 'blue', cost: 5, points: 5, type: 'converter', convert: [{ from: 'red', to: 'double' }, { from: 'black', to: 'double' }] },
    { id: 82, level: 3, color: 'red', cost: 5, points: 5, type: 'build', trigger: { action: 'build', fromArchive: true }, effect: { kind: 'vp', amount: 2 } },
    { id: 83, level: 3, color: 'yellow', cost: 5, points: 5, type: 'build', trigger: { action: 'build', fromArchive: true }, effect: { kind: 'vp', amount: 2 } },
    { id: 84, level: 3, color: 'black', cost: 4, points: 4, type: 'file', trigger: { action: 'file' }, effect: { kind: 'vp', amount: 1 } },
    { id: 85, level: 3, color: 'red', cost: 4, points: 4, type: 'file', trigger: { action: 'file' }, effect: { kind: 'vp', amount: 1 } },
    { id: 86, level: 3, color: 'blue', cost: 4, points: 4, type: 'file', trigger: { action: 'file' }, effect: { kind: 'draw', amount: 3 } },
    { id: 87, level: 3, color: 'yellow', cost: 4, points: 4, type: 'file', trigger: { action: 'file' }, effect: { kind: 'draw', amount: 3 } },
    { id: 88, level: 3, color: 'black', cost: 6, points: 6, type: 'build', trigger: { action: 'build', level: 2 }, effect: { kind: 'pick', amount: 2 } },
    { id: 89, level: 3, color: 'red', cost: 6, points: 6, type: 'build', trigger: { action: 'build', level: 2 }, effect: { kind: 'pick', amount: 2 } },
    { id: 90, level: 3, color: 'blue', cost: 5, points: 5, type: 'upgrade', upgrade: { discount: 'level2' } },
    { id: 91, level: 3, color: 'yellow', cost: 5, points: 5, type: 'upgrade', upgrade: { discount: 'level2' } },
    { id: 92, level: 3, color: 'black', cost: 5, points: 5, type: 'build', trigger: { action: 'build', colors: ['red', 'blue'] }, effect: { kind: 'vp', amount: 2 } },
    { id: 93, level: 3, color: 'red', cost: 5, points: 5, type: 'build', trigger: { action: 'build', colors: ['yellow', 'black'] }, effect: { kind: 'vp', amount: 2 } },
    { id: 94, level: 3, color: 'blue', cost: 6, points: 6, type: 'build', trigger: { action: 'build', colors: ['red', 'yellow'] }, effect: { kind: 'freeBuild' } },
    { id: 95, level: 3, color: 'yellow', cost: 6, points: 6, type: 'build', trigger: { action: 'build', colors: ['blue', 'black'] }, effect: { kind: 'freeBuild' } },
    { id: 96, level: 3, color: 'black', cost: 4, points: 8, type: 'upgrade', upgrade: { block: 'research' } },
    { id: 97, level: 3, color: 'yellow', cost: 4, points: 8, type: 'upgrade', upgrade: { block: 'research' } },
    { id: 98, level: 3, color: 'blue', cost: 4, points: 7, type: 'upgrade', upgrade: { block: 'file' } },
    { id: 99, level: 3, color: 'red', cost: 4, points: 7, type: 'upgrade', upgrade: { block: 'file' } },
    { id: 100, level: 3, color: 'black', cost: 5, points: 5, type: 'build', trigger: { action: 'build', colors: ['yellow', 'blue'] }, effect: { kind: 'file' } },
    { id: 101, level: 3, color: 'yellow', cost: 5, points: 5, type: 'build', trigger: { action: 'build', colors: ['red', 'black'] }, effect: { kind: 'file' } },
    { id: 102, level: 3, color: 'blue', cost: 5, points: 5, type: 'upgrade', upgrade: { discount: 'archive' } },
    { id: 103, level: 3, color: 'red', cost: 5, points: 5, type: 'upgrade', upgrade: { discount: 'archive' } },
    { id: 104, level: 3, color: 'black', cost: 6, points: 6, type: 'upgrade', upgrade: { discount: 'research' } },
    { id: 105, level: 3, color: 'yellow', cost: 6, points: 6, type: 'upgrade', upgrade: { discount: 'research' } },
    { id: 106, level: 3, color: 'blue', cost: 7, points: 7, type: 'build', trigger: { action: 'build', colors: ['red', 'yellow'] }, effect: { kind: 'research' } },
    { id: 107, level: 3, color: 'red', cost: 7, points: 7, type: 'build', trigger: { action: 'build', colors: ['blue', 'black'] }, effect: { kind: 'research' } },
    { id: 108, level: 3, color: 'any', cost: 7, points: null, type: 'upgrade', upgrade: { score: 'energy' } },
    { id: 109, level: 3, color: 'any', cost: 7, points: null, type: 'upgrade', upgrade: { score: 'energy' } },
    { id: 110, level: 3, color: 'any', cost: 7, points: null, type: 'upgrade', upgrade: { score: 'tokens' } },
    { id: 111, level: 3, color: 'any', cost: 7, points: null, type: 'upgrade', upgrade: { score: 'tokens' } },
];

export const STARTING_CARDS = CARDS.filter(card => card.level === 0).map(card => card.id);
