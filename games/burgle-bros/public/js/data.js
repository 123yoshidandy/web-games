/**
 * バーグルブロスのデータ（部屋・泥棒・道具・お宝・階数）
 * 建物は1〜3階。各階は 4×4 の部屋で、部屋の番号（セル）は 0〜15（上の行から左→右）。
 * 部屋全体の番号（id）は「階 × 16 + セル」
 */

export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const ACTIONS_PER_TURN = 4;
export const START_STEALTH = 3;
export const MAX_DICE = 6;
export const MAX_HACK = 6;
export const MAX_SPEED = 6;
export const LAVATORY_TOKENS = 3;
// 階ごとの見張りの始まりの速さ（1階・2階・3階）
export const BASE_SPEED = [2, 3, 4];
// 階ごとの内壁の数
export const WALLS_PER_FLOOR = 6;

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;

// 難しさ＝建物の階数
export const FLOOR_LEVELS = {
    1: { name: '1階建て', short: '1階' },
    2: { name: '2階建て', short: '2階' },
    3: { name: '3階建て', short: '3階' }
};

// 部屋の種類。count は建物全体の枚数（金庫と階段は各階に1つずつ）
// alarm：警報の種類（fingerprint・laser・motion は対応するコンピュータのハックで止められる。thermo は止められない）
export const ROOMS = {
    safe: { name: '金庫室', short: '金庫', text: 'ダイスを足して（2アクション）振る（1アクション）。同じ列と行の部屋の数字が出たら解錠の印。6部屋すべてそろえば開く' },
    stairs: { name: '階段', short: '階段', text: '1アクションで真上の階へ。最上階の階段からは、金庫がすべて開いていれば屋上へ脱出できる' },
    atrium: { name: '吹き抜け', short: '吹抜', count: 3, text: '真上・真下の部屋をのぞける。真上か真下に見張りがいると見つかる' },
    camera: { name: '監視カメラ', short: 'カメラ', count: 4, text: '見張りがほかのカメラの部屋にいると、カメラの部屋にいる泥棒が見つかる（階をまたいでも）' },
    fpComputer: { name: '指紋の端末', short: '指紋PC', count: 1, hack: 'fingerprint', text: '1アクションでハックを1つ置く。指紋認証の警報を1回止められる' },
    laserComputer: { name: 'レーザーの端末', short: '光PC', count: 1, hack: 'laser', text: '1アクションでハックを1つ置く。レーザーの警報を1回止められる' },
    motionComputer: { name: '動体の端末', short: '動体PC', count: 1, hack: 'motion', text: '1アクションでハックを1つ置く。動体センサーの警報を1回止められる' },
    deadbolt: { name: 'かんぬき扉', short: '閂', count: 3, text: '誰もいなければ、入るのに3アクションかかる' },
    fingerprint: { name: '指紋認証', short: '指紋', count: 3, alarm: 'fingerprint', text: '入ると警報（ハックがあれば1つ使って止める）' },
    foyer: { name: 'ロビー', short: 'ロビー', count: 3, text: 'となり（壁のない方）に見張りがいると見つかる' },
    keypad: { name: '暗証番号の扉', short: '暗証', count: 3, text: '入るにはダイスで6を出す。同じ手番の2回目は2個、3回目は3個振る。開けば開いたまま' },
    lab: { name: '研究室', short: '研究', count: 3, text: '最初に入った人が道具を1つ引く' },
    laser: { name: 'レーザー', short: '光線', count: 3, alarm: 'laser', text: '入ると警報。アクションを1つ余分に使えば避けられる（ハックが先）' },
    lavatory: { name: '洗面所', short: '洗面', count: 1, text: 'ここで見つかったときは、隠れ札（3枚）を代わりに使う' },
    motion: { name: '動体センサー', short: '動体', count: 3, alarm: 'motion', text: '入った手番のうちに出ると警報（ハックがあれば止める）' },
    secret: { name: '隠し扉', short: '隠扉', count: 2, text: 'この部屋の壁は、泥棒なら通り抜けられる' },
    duct: { name: '通気ダクト', short: 'ダクト', count: 2, text: '同じ階のもう1つのダクトへ、1アクションで移れる' },
    thermo: { name: '熱センサー', short: '熱', count: 3, alarm: 'thermo', text: '手番の終わりにここにいると警報（止められない）' },
    walkway: { name: '吊り通路', short: '通路', count: 3, text: '2階より上で、入ってめくると下の階へ落ちる' }
};

export const ALARM_ROOMS = ['fingerprint', 'laser', 'motion', 'thermo'];
export const HACK_TYPES = ['fingerprint', 'laser', 'motion'];
export const HACK_NAMES = { fingerprint: '指紋', laser: 'レーザー', motion: '動体' };

// 泥棒（それぞれの得意）
export const CHARACTERS = {
    peterman: { name: '金庫破り', color: '#e0b04a', text: '金庫のダイスを振るとき、1個多く振る' },
    hacker: { name: 'ハッカー', color: '#58c4a8', text: '指紋・レーザー・動体の警報を鳴らさない' },
    hawk: { name: 'ホーク', color: '#7fa6ec', text: '壁ごしにのぞける。手番の最初ののぞきはアクションを使わない' },
    acrobat: { name: '軽業師', color: '#e57aa8', text: '見張りのいる部屋に入っても見つからない' },
    juicer: { name: '仕掛け屋', color: '#ef8350', text: '1アクションで、となりの部屋の警報を鳴らす（見張りをおびき寄せる）' },
    spotter: { name: '見張り役', color: '#b693e8', text: '1アクションで、自分の階の巡回の山の上を見て、山の下に回せる' }
};
export const CHARACTER_KEYS = Object.keys(CHARACTERS);

// 道具（1枚ずつ。使うのにアクションはいらない）
export const TOOLS = {
    blueprints: { name: '設計図', short: '設計図', text: '自分の階の、めくっていない部屋を1つめくる' },
    rollerskates: { name: 'ローラースケート', short: 'スケート', text: 'この手番のアクションが2つ増える' },
    invisible: { name: '透明スーツ', short: '透明', text: '次の自分の手番まで、見つからない' },
    smoke: { name: '煙幕', short: '煙幕', text: 'この手番の終わりに、自分の階の見張りが動かない' },
    crowbar: { name: 'バール', short: 'バール', text: 'となりの暗証番号の扉を開ける' },
    stethoscope: { name: '聴診器', short: '聴診器', text: '自分の階の金庫にダイスを1個足す' },
    virus: { name: 'ウイルス', short: 'ウイルス', text: '3種類のハックを2つずつ足す' },
    dynamite: { name: 'ダイナマイト', short: '爆薬', text: 'となりとの壁を壊す。自分の部屋で警報が鳴る' }
};
export const TOOL_KEYS = Object.keys(TOOLS);

// お宝（金庫を開けた人が持つ。飾り）
export const LOOT = ['黄金の猫の像', '古い冠', '青い宝石', '名画の切れ端', '金の延べ棒', '王家の印章'];

// セルの行と列
export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;
export const floorOf = (id) => Math.floor(id / CELLS);
export const cellOf = (id) => id % CELLS;
export const idOf = (floor, cell) => floor * CELLS + cell;

// となり（上・右・下・左の順。見張りの道の選び方もこの順）
export function neighbors(cell) {
    const r = rowOf(cell);
    const c = colOf(cell);
    const list = [];
    if (r > 0) list.push(cell - SIZE);
    if (c < SIZE - 1) list.push(cell + 1);
    if (r < SIZE - 1) list.push(cell + SIZE);
    if (c > 0) list.push(cell - 1);
    return list;
}

export const wallKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// 金庫と同じ行・列の部屋（金庫を除く6部屋）
export function safeLine(safeCell) {
    const r = rowOf(safeCell);
    const c = colOf(safeCell);
    return Array.from({ length: CELLS }, (_, i) => i).filter(i => i !== safeCell && (rowOf(i) === r || colOf(i) === c));
}

export const roomName = (type) => ROOMS[type]?.name ?? '？';
export const cellLabel = (cell) => `${'ABCD'[colOf(cell)]}${rowOf(cell) + 1}`;
