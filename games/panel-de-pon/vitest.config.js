import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // CPU 同士の試合を何本も回すテストは、GitHub Actions では既定の5秒を超える
        testTimeout: 60000
    }
});
