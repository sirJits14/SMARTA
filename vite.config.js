import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'shared/**/*.test.js'],
    exclude: ['node_modules/**', 'parent/**', 'functions/**', 'tests/**', '.claude/**', 'dist/**'],
  },
});
