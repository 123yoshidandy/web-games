// 全ゲームのオンライン対戦を、手元の1つのテスト用サーバーで受け持つ（保存先はメモリ。AWS は使わない）
// 使い方: npm run dev:online   （ポートは PORT で変えられる。既定 8787）
//   画面は ws://localhost:<PORT>?game=<ゲームの名前> につなぐ（各ゲームの online-config.js が、localhost で開いたときにそうする）
//   ゲームの定義（games/<名前>/server/src/game-definition.js）は、そのゲームが最初につながったときに読み込む
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMultiDevServer } from 'netplay-kit/server/dev-server.js';

const gamesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'games');

export const loadDefinition = async (name) => {
    const file = join(gamesDir, name, 'server', 'src', 'game-definition.js');
    if (!existsSync(file)) return null;
    return (await import(pathToFileURL(file).href)).default;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    startMultiDevServer({ load: loadDefinition });
}
