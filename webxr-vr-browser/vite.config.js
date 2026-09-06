import { defineConfig } from 'vite';

// GitLab Pages serves project sites from /<project-name>/ unless the project
// is named <namespace>.gitlab.io or a custom domain is set. Override with
// `VITE_BASE=/` at build time (the CI job below does this automatically
// using $CI_PROJECT_NAME) if you deploy under a different path.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  server: {
    host: true,
    https: false // for local network HTTPS testing on a headset, see README
  }
});
