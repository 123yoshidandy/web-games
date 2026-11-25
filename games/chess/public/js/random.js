/**
 * シード付きの乱数
 * チェスのルールに乱数はない。CPU の迷い（弱い CPU が、ほどほどに良い手から選ぶ）にだけ使う
 * 同じシードからは同じ順で同じ値が出るので、同じ局面なら CPU は同じ手を指す
 */

// [0, 1) の乱数を返す関数を作る（mulberry32）
export function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
