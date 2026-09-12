import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Core React framework
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
              return 'vendor-react';
            }
            // Heavy UI animations (motion / framer-motion)
            if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) {
              return 'vendor-ui-motion';
            }
            // UI Calendar / Datepickers
            if (
              id.includes('node_modules/react-calendar') ||
              id.includes('node_modules/react-datepicker') ||
              id.includes('node_modules/@fullcalendar') ||
              id.includes('node_modules/date-fns') ||
              id.includes('node_modules/dayjs')
            ) {
              return 'vendor-ui-calendar';
            }
            // UI Virtualized lists (react-virtuoso)
            if (id.includes('node_modules/react-virtuoso')) {
              return 'vendor-ui-virtuoso';
            }
            // UI visual effects & feedback (canvas-confetti, qrcode)
            if (id.includes('node_modules/canvas-confetti')) {
              return 'vendor-ui-effects';
            }
            if (id.includes('node_modules/qrcode')) {
              return 'vendor-qrcode';
            }
            // Charts and data visualization (recharts, d3, victory)
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor')) {
              return 'vendor-recharts';
            }
            // UI Icons
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-lucide-icons';
            }
            // Dedicated media streaming players (split individually to prevent bloated chunks)
            if (id.includes('node_modules/dashjs')) {
              return 'vendor-dashjs';
            }
            if (id.includes('node_modules/hls.js')) {
              return 'vendor-hls';
            }
            if (id.includes('node_modules/mpegts.js')) {
              return 'vendor-mpegts';
            }
            // Web Vitals performance telemetry
            if (id.includes('node_modules/web-vitals')) {
              return 'vendor-web-vitals';
            }
          },
        },
      },
    },
  };
});
