// packages/puzzle-kit 0.1.0 からコピーしたファイル。ここでは直さず、packages/puzzle-kit で直してから同期する
/**
 * パズルの種類の画面（render）で使う道具
 * どれも呼んだときに DOM に触れる。モジュールを読み込むだけでは触れない（サーバーとテストが同じファイルを読むため）
 */

// 種類ごとの CSS を、最初に描くときに1回だけ <head> に入れる（種類のフォルダの外の CSS を直さなくて済むように）
export function injectStyle(id, css) {
    if (document.getElementById(`style-${id}`)) return;
    const style = document.createElement('style');
    style.id = `style-${id}`;
    style.textContent = css;
    document.head.append(style);
}

// 要素を作る。attrs の class・text・data-* などを付ける
export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children);
    return node;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value !== null && value !== undefined) node.setAttribute(key, value);
    }
    return node;
}

// 入れ物の大きさが変わるたびに呼ぶ（最初にも1回）。止める関数を返す
export function observeSize(element, callback) {
    let last = '';
    const run = () => {
        const { width, height } = element.getBoundingClientRect();
        const key = `${Math.round(width)}x${Math.round(height)}`;
        if (key === last || width === 0 || height === 0) return;
        last = key;
        callback({ width, height });
    };
    const observer = new ResizeObserver(run);
    observer.observe(element);
    run();
    return () => observer.disconnect();
}

// 指で押した位置にあるマス（盤面の矩形と、列・行の数から求める。範囲の外は -1）
export function cellAt(rect, columns, rows, x, y) {
    const c = Math.floor((x - rect.left) / (rect.width / columns));
    const r = Math.floor((y - rect.top) / (rect.height / rows));
    if (c < 0 || r < 0 || c >= columns || r >= rows) return -1;
    return r * columns + c;
}
