#!/usr/bin/env node
// The code half of the /mathpost command. Claude writes the draft; this script
// tells it what the site already has, turns the worksheet into a PDF, checks
// the draft, and publishes it. No dependencies beyond Node itself.
//
//   node scripts/mathpost.mjs brief
//   node scripts/mathpost.mjs render
//   node scripts/mathpost.mjs publish --model <model id> [--check-only] [--no-wait]
//
// The draft lives in .run/ (not committed):
//   .run/post.md          front matter and the write-up shown on the site
//   .run/worksheet.html   the worksheet, as the contents of <body>
//   .run/worksheet.pdf    made from worksheet.html by `render`, or put there by hand

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN = join(ROOT, '.run');
const DRAFT = join(RUN, 'post.md');
const WORKSHEET = join(RUN, 'worksheet.html');
const PDF = join(RUN, 'worksheet.pdf');
const POSTS = join(ROOT, 'src', 'content', 'posts');
const FILES = join(ROOT, 'public', 'worksheets');
const SITE_URL = 'https://math.brianrosenthal.org';
const TIME_ZONE = 'America/New_York';
const MAX_PDF_BYTES = 10 * 1024 * 1024;

class Problems extends Error {
  constructor(list) {
    super(list.join('\n'));
    this.list = list;
  }
}

const log = (message) => console.error(`[${new Date().toTimeString().slice(0, 8)}] ${message}`);

// ---- Front matter ----
// Every value is JSON on one line (`title: "..."`, `topics: ["a", "b"]`), which
// is also valid YAML, so Astro reads the same files with its own parser.

function splitFrontMatter(text, name) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') throw new Problems([`${name} must start with a line containing only ---`]);
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end < 0) throw new Problems([`${name}: the front matter has no closing --- line`]);
  const data = {};
  const problems = [];
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^([a-z_]+):\s*(.+)$/.exec(line);
    if (!match) {
      problems.push(`front matter line not understood: ${line}`);
      continue;
    }
    try {
      data[match[1]] = JSON.parse(match[2]);
    } catch {
      problems.push(`${match[1]}: the value must be JSON on one line, such as "text in double quotes" or ["a", "b"]`);
    }
  }
  if (problems.length) throw new Problems(problems);
  return { data, body: lines.slice(end + 1).join('\n').trim() + '\n' };
}

const joinFrontMatter = (data, body) =>
  `---\n${Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n\n${body.trim()}\n`;

function loadPosts() {
  if (!existsSync(POSTS)) return [];
  return readdirSync(POSTS)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ slug: name.replace(/\.md$/, ''), ...splitFrontMatter(readFileSync(join(POSTS, name), 'utf8'), name) }))
    .sort((a, b) => b.data.published_at.localeCompare(a.data.published_at));
}

// ---- Small helpers ----

function slugify(title) {
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length > 70) slug = slug.slice(0, 70).replace(/-[^-]*$/, '');
  return slug || 'worksheet';
}

const countWords = (text) => (text.match(/\b[\w'’-]+\b/g) ?? []).length;

/** The date and time in the site's own time zone, as '2026-11-26' and an ISO timestamp with its offset. */
function now() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZoneName: 'longOffset',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return { date, timestamp: `${date}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}${offset}` };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
}

function git(...args) {
  const result = run('git', args);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const hasRemote = () => run('git', ['remote']).stdout.trim() !== '';

// ---- The PDF ----

function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('No Chrome found to make the PDF. Install Google Chrome, or set CHROME to a Chromium-based browser.');
  return found;
}

function render() {
  if (!existsSync(WORKSHEET)) throw new Problems([`${WORKSHEET} does not exist`]);
  const body = readFileSync(WORKSHEET, 'utf8');
  if (/<\s*(script|iframe|object|embed)\b/i.test(body)) {
    throw new Problems(['worksheet.html contains a script, iframe, object or embed tag, which is not allowed']);
  }
  const css = readFileSync(join(ROOT, 'scripts', 'worksheet.css'), 'utf8');
  const page = join(RUN, 'worksheet.page.html');
  writeFileSync(page, `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Worksheet</title>\n<style>\n${css}\n</style></head>\n<body>\n${body}\n</body></html>\n`);
  rmSync(PDF, { force: true });
  const result = run(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=5000',
    `--print-to-pdf=${PDF}`, pathToFileURL(page).href,
  ]);
  if (!existsSync(PDF)) throw new Error(`Chrome did not produce a PDF:\n${result.stderr}`);
  const pages = countPages(PDF);
  console.log(`Made ${PDF}${pages ? ` (${pages} ${pages === 1 ? 'page' : 'pages'})` : ''}. Open it and look at every page before publishing.`);
}

/** Pages in a PDF, or undefined when it cannot be told. */
function countPages(file) {
  const spotlight = run('mdls', ['-raw', '-name', 'kMDItemNumberOfPages', file]);
  if (spotlight.status === 0 && /^\d+$/.test(spotlight.stdout.trim())) return Number(spotlight.stdout.trim());
  const marks = readFileSync(file, 'latin1').match(/\/Type\s*\/Page(?![s\w])/g);
  return marks ? marks.length : undefined;
}

/** A JPEG of page 1 beside the PDF, or undefined where the tool for it is missing. */
function makeThumbnail(pdf, thumb) {
  const result = run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '--resampleWidth', '600', pdf, '--out', thumb]);
  return result.status === 0 && existsSync(thumb);
}

// ---- Checks ----

function checkDraft() {
  if (!existsSync(DRAFT)) throw new Problems([`${DRAFT} does not exist`]);
  const { data, body } = splitFrontMatter(readFileSync(DRAFT, 'utf8'), 'post.md');
  const problems = [];
  const text = (key, min, max) => {
    const value = data[key];
    if (typeof value !== 'string') problems.push(`${key}: missing, or not text in double quotes`);
    else if (value.trim().length < min || value.trim().length > max) {
      problems.push(`${key}: is ${value.trim().length} characters; it must be ${min} to ${max}`);
    }
  };
  text('title', 5, 90);
  text('summary', 40, 240);
  text('level', 2, 40);
  if (data.requested !== undefined) text('requested', 1, 300);
  if (!Array.isArray(data.topics) || data.topics.length < 1 || data.topics.length > 4 || data.topics.some((t) => typeof t !== 'string' || t.length < 2 || t.length > 30)) {
    problems.push('topics: must be a list of one to four short labels, such as ["fractions", "multiplication"]');
  }
  const unknown = Object.keys(data).filter((key) => !['title', 'summary', 'level', 'topics', 'requested'].includes(key));
  if (unknown.length) problems.push(`front matter has fields that are not allowed: ${unknown.join(', ')}`);

  const words = countWords(body);
  if (words < 40) problems.push(`the write-up is ${words} words; the minimum is 40`);
  if (words > 600) problems.push(`the write-up is ${words} words; the maximum is 600`);
  if (/^#\s/m.test(body)) problems.push("the write-up has a top-level '# ' heading; the title comes from the front matter");
  if (/<\s*(script|iframe|style|object|embed)\b/i.test(body)) problems.push('the write-up contains raw HTML that is not allowed');

  if (!existsSync(PDF)) {
    problems.push(`${PDF} does not exist; run the render command first`);
  } else {
    const bytes = readFileSync(PDF);
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') problems.push('worksheet.pdf is not a PDF file');
    if (bytes.length > MAX_PDF_BYTES) problems.push(`worksheet.pdf is ${(bytes.length / 1048576).toFixed(1)} MB; the limit is 10 MB`);
  }
  // A worksheet written for this post must carry its answers. A PDF supplied
  // by hand, with no worksheet.html beside it, is taken as it is.
  if (existsSync(WORKSHEET) && !/class="[^"]*\banswers\b/.test(readFileSync(WORKSHEET, 'utf8'))) {
    problems.push('worksheet.html has no answer key: add <section class="answers"> at the end');
  }

  let slug;
  if (typeof data.title === 'string') {
    slug = slugify(data.title);
    const earlier = loadPosts();
    if (earlier.some((post) => post.slug === slug || post.data.title.toLowerCase() === data.title.trim().toLowerCase())) {
      problems.push('an earlier post has this title; choose a different one');
    }
  }
  if (problems.length) throw new Problems(problems);
  return { data, body, slug };
}

// ---- Commands ----

function brief() {
  mkdirSync(RUN, { recursive: true });
  if (hasRemote()) {
    log('Pulling the latest posts.');
    git('pull', '--rebase', '--autostash');
  }
  const { date } = now();
  const posts = loadPosts();
  console.log(readFileSync(join(ROOT, 'scripts', 'prompt.md'), 'utf8').trim());
  console.log(`\n---\n\n## Now\n\nToday is ${date}. The site is ${SITE_URL}.\n`);
  if (posts.length === 0) {
    console.log('## Earlier posts\n\nNone yet. This will be the first.');
  } else {
    console.log('## Earlier posts, newest first\n');
    for (const { slug, data } of posts.slice(0, 40)) {
      console.log(`- ${data.date}: ${data.title} (${data.level}; ${data.topics.join(', ')}). ${data.summary}` +
        (data.requested ? ` Asked for as: "${data.requested}".` : '') + ` Address: /posts/${slug}/`);
    }
  }
  console.log(`\n---\n\nWrite these two files:\n\n    ${DRAFT}\n    ${WORKSHEET}\n\nThen render, look at the PDF, and publish, as the /mathpost instructions describe.`);
}

function waitForDeploy(commit) {
  if (run('gh', ['--version']).status !== 0) {
    console.log('The GitHub CLI is not installed, so the build was not watched. See the Actions tab of the repository.');
    return true;
  }
  log('Waiting for GitHub Actions to build and deploy the site.');
  const deadline = Date.now() + 6 * 60 * 1000;
  let found;
  while (Date.now() < deadline) {
    const result = run('gh', ['run', 'list', '--commit', commit, '--json', 'databaseId,status,conclusion,url', '--limit', '1']);
    found = result.status === 0 ? JSON.parse(result.stdout || '[]')[0] : undefined;
    if (found?.status === 'completed') break;
    spawnSync('sleep', ['8']);
  }
  if (!found) {
    console.log('No GitHub Actions run appeared for this commit. Check the Actions tab of the repository.');
    return false;
  }
  if (found.status !== 'completed') {
    console.log(`GitHub Actions is still running after six minutes: ${found.url}`);
    return false;
  }
  if (found.conclusion !== 'success') {
    console.log(`GitHub Actions finished with "${found.conclusion}", so the site was not updated: ${found.url}`);
    return false;
  }
  log(`GitHub Actions built and deployed the site: ${found.url}`);
  return true;
}

function publish(args) {
  const option = (name) => args.includes(name);
  const model = args[args.indexOf('--model') + 1];
  if (!option('--model') || !model || model.startsWith('--')) throw new Error('publish needs --model <the model that wrote the post>');

  if (!option('--check-only') && hasRemote()) git('pull', '--rebase', '--autostash');
  log('Checking the draft.');
  const { data, body, slug } = checkDraft();
  const pages = countPages(PDF);
  if (option('--check-only')) {
    console.log(`The draft is valid (${pages ?? 'unknown number of'} pages). Nothing was published (--check-only).`);
    return 0;
  }

  const { date, timestamp } = now();
  mkdirSync(FILES, { recursive: true });
  mkdirSync(POSTS, { recursive: true });
  const pdf = `${slug}.pdf`;
  const thumb = `${slug}.jpg`;
  const postFile = join(POSTS, `${slug}.md`);
  copyFileSync(PDF, join(FILES, pdf));
  const hasThumb = makeThumbnail(join(FILES, pdf), join(FILES, thumb));
  const written = [postFile, join(FILES, pdf), ...(hasThumb ? [join(FILES, thumb)] : [])];
  writeFileSync(postFile, joinFrontMatter({
    title: data.title.trim(),
    summary: data.summary.trim(),
    level: data.level.trim(),
    topics: data.topics.map((topic) => topic.trim().toLowerCase()),
    date,
    published_at: timestamp,
    pdf,
    thumb: hasThumb ? thumb : undefined,
    pages,
    model,
    requested: data.requested?.trim(),
  }, body));

  // Build here first, so a post the site cannot build never reaches GitHub.
  log('Building the site locally to make sure the post is sound.');
  const build = run('npm', ['run', 'build']);
  if (build.status !== 0) {
    for (const file of written) rmSync(file, { force: true });
    console.log(`The site did not build with this post, so nothing was published:\n${(build.stdout + build.stderr).trim().split('\n').slice(-25).join('\n')}`);
    return 1;
  }

  git('add', '--', ...written);
  git('commit', '-m', `Post: ${data.title.trim()}`);
  log('Committed the post.');
  for (const file of [DRAFT, WORKSHEET, PDF, join(RUN, 'worksheet.page.html')]) rmSync(file, { force: true });

  if (!hasRemote()) {
    console.log('The post is committed. This checkout has no remote, so nothing was pushed or deployed.');
    return 0;
  }
  git('pull', '--rebase', '--autostash');
  git('push');
  log('Pushed to GitHub.');
  const deployed = option('--no-wait') ? true : waitForDeploy(git('rev-parse', 'HEAD'));
  console.log(`${deployed ? 'Published' : 'Pushed, but not confirmed live'}: ${SITE_URL}/posts/${slug}/`);
  return deployed ? 0 : 1;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'brief') brief();
    else if (command === 'render') render();
    else if (command === 'publish') return publish(args);
    else {
      console.error('usage: mathpost.mjs <brief|render|publish> [options]');
      return 64;
    }
    return 0;
  } catch (error) {
    if (error instanceof Problems) {
      console.log(`Problems:\n- ${error.list.join('\n- ')}\n\nFix these in ${RUN} and run the command again. Nothing was published.`);
      return 2;
    }
    console.error(error.message);
    return 1;
  }
}

process.exitCode = main();
