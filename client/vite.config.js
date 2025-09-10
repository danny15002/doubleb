import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Generate version based on timestamp for cache busting
const version = new Date().getTime();
const buildTimestamp = new Date().toLocaleString();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    // Force re-bundling on every start
    force: true,
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  // Disable caching completely
  cacheDir: false,
  server: {
    host: '0.0.0.0', // Allow access from any IP address
    port: 3000,
    // Disable caching for development
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    proxy: {
      '/api': {
        // target: 'http://192.168.1.136:3001', // TEMPORARY: Use local IP
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        // target: 'http://192.168.1.136:3001', // TEMPORARY: Use local IP
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'build',
    // Add version to filenames for cache busting
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${version}.js`,
        chunkFileNames: `assets/[name]-${version}.js`,
        assetFileNames: `assets/[name]-${version}.[ext]`
      }
    },
    // Ensure proper PWA build
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  // Additional development settings to prevent caching
  clearScreen: false,
  logLevel: 'info',
})
