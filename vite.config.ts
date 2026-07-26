import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [vue()],
    server: {
      host: env.VITE_DEV_HOST === 'true',
      port: Number(env.VITE_DEV_PORT || 4080),
    },
  };
});
