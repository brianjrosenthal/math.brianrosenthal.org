// @ts-check
import { defineConfig } from 'astro/config';

// A fully static site, built by GitHub Actions on every push (see
// .github/workflows/deploy.yml) and served by GitHub Pages.
//
// SITE and BASE come from the workflow, which asks GitHub where the site is
// served: https://math.brianrosenthal.org at the root once the custom domain
// is set, or https://<user>.github.io/<repository>/ before that. Every
// internal link goes through url() in src/lib/site.ts, so both work.
export default defineConfig({
  site: process.env.SITE || 'https://math.brianrosenthal.org',
  base: process.env.BASE || '/',
  output: 'static',
});
