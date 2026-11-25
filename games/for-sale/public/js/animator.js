/**
 * 要素の複製を、元の位置から行き先へ飛ばす
 * 動きを減らす設定のときは動かさない
 */

const DURATION_MS = 480;

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

// html を from から to へ飛ばす。to の大きさに合わせて縮める。hide を渡すと、着くまでその要素を隠す
export function fly(html, from, to, { delay = 0, hide = null, size = null } = {}) {
    if (!from || !to || reducedMotion()) return;
    const width = size?.width ?? from.width;
    const height = size?.height ?? from.height;
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = html;
    Object.assign(el.style, {
        left: `${from.left + (from.width - width) / 2}px`, top: `${from.top + (from.height - height) / 2}px`,
        width: `${width}px`, height: `${height}px`
    });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.3, Math.min(1.2, to.width / width, to.height / height));
    // 遠いほど高い弧を描く
    const lift = -Math.min(60, 10 + Math.hypot(dx, dy) * 0.12);
    if (hide) hide.style.visibility = 'hidden';
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(1 + scale) / 2})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }
    ], { duration: DURATION_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
    const done = () => {
        el.remove();
        if (hide) hide.style.visibility = '';
    };
    animation.finished.then(done, done);
    // 裏のタブなどで終わりが来なくても、必ず消す
    setTimeout(done, DURATION_MS + delay + 400);
}
