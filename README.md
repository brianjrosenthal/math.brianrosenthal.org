# math.brianrosenthal.org

Printable math practice. Each post is one worksheet as a PDF with an answer key, plus a short write-up. Posts are made by Claude from the `/mathpost` command in Claude Code. The site is built and published by GitHub Actions on every push.

| Part | Where |
|---|---|
| The site (Astro) | `src/` |
| Posts | `src/content/posts/<slug>.md` |
| PDFs and their first-page images | `public/worksheets/` |
| The script behind `/mathpost` | `scripts/mathpost.mjs` |
| What the writer is told | `scripts/prompt.md` |
| How a worksheet looks in print | `scripts/worksheet.css` |
| The `/mathpost` command | `.claude/skills/mathpost/SKILL.md` |
| The build and deploy | `.github/workflows/deploy.yml` |

## Making a post

Open Claude Code in this folder and type one of:

```
/mathpost
/mathpost multiplying fractions practice
/mathpost long division grade 4
```

With no subject it makes something the site does not have yet. The command runs four steps:

1. `node scripts/mathpost.mjs brief` pulls from GitHub and prints the instructions and the earlier posts.
2. Claude writes the worksheet (`.run/worksheet.html`) and the write-up (`.run/post.md`), and computes every answer in the key with code.
3. `node scripts/mathpost.mjs render` turns the worksheet into `.run/worksheet.pdf` using Chrome, and Claude looks at every page.
4. `node scripts/mathpost.mjs publish --model <model id>` checks the draft, saves the post and PDF, builds the site locally, commits, pushes, and waits for GitHub Actions to deploy.

`publish --check-only` runs the checks and publishes nothing. `publish --no-wait` does not wait for GitHub Actions.

### Posting a PDF you already have

Put the PDF at `.run/worksheet.pdf`, write `.run/post.md` (format in `scripts/prompt.md`), make sure there is no `.run/worksheet.html`, and run the publish command.

## How it gets to the web

Pushing to `main` starts `.github/workflows/deploy.yml`. GitHub checks out the repository, runs `npm ci` and `npm run build`, and publishes the resulting `dist/` folder to GitHub Pages. Nothing is built or uploaded from this machine, and `dist/` is never committed. A failed build leaves the previous version of the site in place.

The workflow asks GitHub where the site is served and passes that to the build, so the site works both at `https://math.brianrosenthal.org` and at the `github.io` address it has before the domain is connected.

One-time setup on GitHub: **Settings → Pages → Source → GitHub Actions**, and the custom domain on the same page.

## Setting up a machine

Needs Node 22.12 or newer, Google Chrome (for making PDFs), git with push access, and the GitHub CLI (`gh`) if the publish step is to watch the deploy.

```sh
npm install
```

## Working on the site

```sh
npm run dev       # http://localhost:4321
npm run build     # into dist/
```

The post format is defined twice, and the two must change together: `src/content.config.ts` and `scripts/mathpost.mjs`. The worksheet classes are likewise described in `scripts/prompt.md` and defined in `scripts/worksheet.css`.
