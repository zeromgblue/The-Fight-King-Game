import { defineConfig } from 'vite';
// GitHub Pages serves the site under /<repo>/ ; relative base works there and locally.
export default defineConfig({ base: './' });
