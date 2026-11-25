/**
 * 盤面・地形・場所・王のカードのデータ
 *
 * 盤面8枚の地形は、Board Game Arena の実装（Syarwin/bga-kingdombuilder の KingdomBuilderBoard.class.php）の配置を写した。
 * ほかの有志の実装とも照らし合わせた（食い違いは README に書く）
 * 1文字が1マス：G 草原 / F 花畑 / T 森 / C 峡谷 / D 砂漠 / W 水 / M 山 / K 城 / L その盤面の場所
 * 行0が盤面の上、列0が左。奇数の行は半マス右にずれる（hex.js）
 */

import { SIZE, CELLS } from './hex.js';

export const BOARDS = {
    oracle: ['GGGTTWGTTT', 'GGGKTWGTTT', 'GFFGTTWGGT', 'FFCGTWFLTT', 'FFFCCWFFWW', 'MMCGGWWWDD', 'CCCMGFFFDD', 'CCKDMDFFCC', 'WWWDDDDMCC', 'WWWWDDDDDC'],
    farm: ['DDCWWTTTGG', 'DKCWTTTLGG', 'CCCFFFTCFF', 'CCFFWDDCCF', 'CGGWFFDDCC', 'GGLFWFWDDC', 'GGGTFFWWDD', 'GGTTMWWWDW', 'GMTTWWWWWW', 'TTTWWWWWWW'],
    harbor: ['GGTTTWGTTF', 'GFTTWGTTFF', 'GFFTWGGFFF', 'FFTTWGMFDD', 'CFKTWGDDDD', 'CCTWGGMMDD', 'CCWWWGDDDC', 'WWGGWWLCMC', 'WDKGWMWCCC', 'WDDWWWWCCC'],
    tower: ['TTTTMMGMCC', 'TMTTFGMMMC', 'FFTFFFGGWM', 'DFFFWLGWMM', 'DDDDFWGWCC', 'DCDDDWWCGC', 'DDCDDWFKGC', 'CCLDWFFFGG', 'DCWWWTTFGG', 'DCCWTTTGGG'],
    oasis: ['DDCWWTTGGG', 'DCWFFTTTGG', 'DDWFFTTLFG', 'WWWFGTFFFF', 'WWWWGGGGFF', 'WTTWGGCCDC', 'WTCTWGCCDC', 'WKCFWLDDCW', 'WWCFWWWDDW', 'WWWWWWWWWW'],
    tavern: ['FDDMMDDCCC', 'FFDDDMMCCC', 'FFFFFFFMMM', 'WWFKGGTTMM', 'FFWWGGGTTC', 'FCCWGTTCCC', 'DFLCWTTLCG', 'DDCWTTGGGG', 'DDDWTTTGGG', 'DDWWTTTGGG'],
    barn: ['CDDDDDDDDD', 'CCCDDDDDCD', 'MMMDMMLDDC', 'CMMMMMFFCC', 'CCCMMWFFFC', 'GCCCMFFWTC', 'GGLTFFWFFT', 'GGTTFFGKTT', 'GGGTTWGGTT', 'GGGTWGGTTT'],
    paddock: ['CCCDDWDDDD', 'MMCDDWDDDD', 'MMCMMWDDLF', 'MCMMWMDFFF', 'CCTTWMMCFF', 'CTTWCCCMFF', 'CLTTWFFFFF', 'GGTWGKGFGT', 'GGTTWGGGGT', 'GGTTWGGGTT']
};
export const BOARD_IDS = Object.keys(BOARDS);

// 家を建てられる地形（地形カードもこの5種類）
export const TERRAINS = {
    G: { name: '草原', color: '#9cc65a' },
    F: { name: '花畑', color: '#e6c54a' },
    T: { name: '森', color: '#3f7f46' },
    C: { name: '峡谷', color: '#c8794a' },
    D: { name: '砂漠', color: '#ecd9a0' },
    W: { name: '水', color: '#5aa6d6' },
    M: { name: '山', color: '#8d8a86' },
    K: { name: '城', color: '#b9a9d9' },
    L: { name: '場所', color: '#e9dfc6' }
};
export const BUILDABLE = ['G', 'F', 'T', 'C', 'D'];
export const CARDS_PER_TERRAIN = 5;

// 場所タイル。kind：build は家を1軒建てる、move は自分の家を1軒動かす
export const LOCATIONS = {
    oracle: { name: '神託所', kind: 'build', text: '手札の地形に1軒建てる。できれば自分の家の隣に' },
    farm: { name: '農場', kind: 'build', text: '草原に1軒建てる。できれば自分の家の隣に' },
    oasis: { name: 'オアシス', kind: 'build', text: '砂漠に1軒建てる。できれば自分の家の隣に' },
    tower: { name: '塔', kind: 'build', text: '盤の端に1軒建てる。できれば自分の家の隣に' },
    tavern: { name: '酒場', kind: 'build', text: '自分の家が3軒以上まっすぐ並んだ列の端に1軒建てる' },
    barn: { name: '納屋', kind: 'move', text: '自分の家を1軒、手札の地形へ動かす。できれば自分の家の隣に' },
    harbor: { name: '港', kind: 'move', text: '自分の家を1軒、水へ動かす。できれば自分の家の隣に' },
    paddock: { name: '馬小屋', kind: 'move', text: '自分の家を1軒、まっすぐ2マス先へ跳ばす（間は何でもよい）' }
};
export const TILES_PER_LOCATION = 2;

// 王のカード（得点の条件）
export const KING_CARDS = {
    fishermen: { name: '漁師', text: '水に隣接する自分の家1軒につき1点（水の上の家は数えない）' },
    merchants: { name: '商人', text: '自分の家でほかの場所・城とつながった場所・城1つにつき4点' },
    discoverers: { name: '発見者', text: '自分の家がある横の行1つにつき1点' },
    hermits: { name: '隠者', text: '自分の集落（隣り合う家のかたまり、1軒でもよい）1つにつき1点' },
    citizens: { name: '市民', text: '自分のいちばん大きな集落の家2軒につき1点' },
    knights: { name: '騎士', text: '自分の家がいちばん多い横の行の家1軒につき2点' },
    lords: { name: '領主', text: '盤面ごとに、家がいちばん多い人に12点、2番目に多い人に6点' },
    farmers: { name: '農夫', text: '自分の家がいちばん少ない盤面の家1軒につき3点' },
    workers: { name: '働き手', text: '場所か城に隣接する自分の家1軒につき1点' },
    miners: { name: '坑夫', text: '山に隣接する自分の家1軒につき1点' }
};
export const KING_CARD_IDS = Object.keys(KING_CARDS);
export const CASTLE_POINTS = 3;

/**
 * 選んだ4枚から、20×20 の地図を作る
 * choice：[{ id, rot }] を 左上・右上・左下・右下 の順に。rot が true なら 180度回して置く
 * 戻り値：terrain（400文字の文字列）と locations（[{ cell, type }]）
 */
export function buildMap(choice) {
    const terrain = Array(CELLS).fill('W');
    const locations = [];
    choice.forEach(({ id, rot }, k) => {
        const rows = BOARDS[id];
        const top = k >= 2 ? 10 : 0;
        const left = k % 2 ? 10 : 0;
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                const ch = rot ? rows[9 - r][9 - c] : rows[r][c];
                const cell = (top + r) * SIZE + left + c;
                terrain[cell] = ch;
                if (ch === 'L') locations.push({ cell, type: id });
            }
        }
    });
    return { terrain: terrain.join(''), locations: locations.sort((a, b) => a.cell - b.cell) };
}
