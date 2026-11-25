/**
 * パッチ33枚（ボタンの値段・時間・ボタンの収入・形）
 * 形は '#' がマス。0番は2×1の最初のパッチ（並べるとき、中立の駒の真後ろに置く）
 */

export const PATCHES = [
    { id: 0, cost: 2, time: 1, income: 0, shape: ['##'] },
    { id: 1, cost: 2, time: 2, income: 0, shape: ['###'] },
    { id: 2, cost: 3, time: 3, income: 1, shape: ['####'] },
    { id: 3, cost: 7, time: 1, income: 1, shape: ['#####'] },
    { id: 4, cost: 6, time: 5, income: 2, shape: ['##', '##'] },
    { id: 5, cost: 2, time: 2, income: 0, shape: ['##.', '###'] },
    { id: 6, cost: 10, time: 5, income: 3, shape: ['##..', '####'] },
    { id: 7, cost: 7, time: 4, income: 2, shape: ['.##.', '####'] },
    { id: 8, cost: 4, time: 2, income: 0, shape: ['###.', '.###'] },
    { id: 9, cost: 8, time: 6, income: 3, shape: ['.##', '.##', '##.'] },
    { id: 10, cost: 1, time: 2, income: 0, shape: ['#.#', '###'] },
    { id: 11, cost: 1, time: 5, income: 1, shape: ['#..#', '####'] },
    { id: 12, cost: 3, time: 6, income: 2, shape: ['#.#', '###', '.#.'] },
    { id: 13, cost: 2, time: 2, income: 0, shape: ['###', '.#.'] },
    { id: 14, cost: 5, time: 5, income: 2, shape: ['###', '.#.', '.#.'] },
    { id: 15, cost: 7, time: 2, income: 2, shape: ['###', '.#.', '.#.', '.#.'] },
    { id: 16, cost: 0, time: 3, income: 1, shape: ['.#.', '###', '.#.', '.#.'] },
    { id: 17, cost: 4, time: 2, income: 1, shape: ['#.', '#.', '##'] },
    { id: 18, cost: 4, time: 6, income: 2, shape: ['#.', '#.', '##'] },
    { id: 19, cost: 10, time: 3, income: 2, shape: ['#.', '#.', '#.', '##'] },
    { id: 20, cost: 3, time: 4, income: 1, shape: ['#.', '#.', '##', '#.'] },
    { id: 21, cost: 5, time: 4, income: 2, shape: ['.#.', '###', '.#.'] },
    { id: 22, cost: 1, time: 4, income: 1, shape: ['.#.', '.#.', '###', '.#.', '.#.'] },
    { id: 23, cost: 5, time: 3, income: 1, shape: ['.##.', '####', '.##.'] },
    { id: 24, cost: 2, time: 3, income: 0, shape: ['#.#', '###', '#.#'] },
    { id: 25, cost: 3, time: 1, income: 0, shape: ['.#', '##'] },
    { id: 26, cost: 1, time: 3, income: 0, shape: ['.#', '##'] },
    { id: 27, cost: 3, time: 2, income: 1, shape: ['.#', '##', '#.'] },
    { id: 28, cost: 7, time: 6, income: 3, shape: ['.#', '##', '#.'] },
    { id: 29, cost: 2, time: 3, income: 1, shape: ['.#', '.#', '##', '#.'] },
    { id: 30, cost: 1, time: 2, income: 0, shape: ['...#', '####', '#...'] },
    { id: 31, cost: 2, time: 1, income: 0, shape: ['..#.', '####', '.#..'] },
    { id: 32, cost: 10, time: 4, income: 3, shape: ['..#', '.##', '##.'] }
];
