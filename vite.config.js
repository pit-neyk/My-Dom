import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('@supabase/supabase-js')) {
            return 'supabase';
          }

          if (id.includes('xlsx')) {
            return 'xlsx';
          }

          if (id.includes('jspdf-autotable')) {
            return 'jspdf-autotable';
          }

          if (id.includes('html2canvas')) {
            return 'html2canvas';
          }

          if (id.includes('dompurify')) {
            return 'dompurify';
          }

          if (id.includes('jspdf')) {
            return 'jspdf';
          }

          if (id.includes('bootstrap')) {
            return 'bootstrap';
          }

          return 'vendor';
        }
      }
    }
  },
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'jsdom',
    setupFiles: ['tests/setup/vitest.setup.js'],
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true
  }
});
