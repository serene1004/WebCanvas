import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({ base: '/WebCanvas/', plugins: [vue()], server: { port: 4080 } });
