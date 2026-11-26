// Data access and formatting shared by the pages.
import { getCollection, type CollectionEntry } from 'astro:content';

export const SITE_NAME = 'math.brianrosenthal.org';
export const TAGLINE = 'Printable math practice: one worksheet per post, each with an answer key.';

export type PostEntry = CollectionEntry<'posts'>;

/** Newest first. */
export async function loadPosts(): Promise<PostEntry[]> {
  return (await getCollection('posts')).sort((a, b) => b.data.published_at.localeCompare(a.data.published_at));
}

// The site may be served from a sub-path (see astro.config.mjs), so every
// internal address is built here.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const url = (path: string) => `${base}${path}`;
export const postUrl = (post: PostEntry) => url(`/posts/${post.id}/`);
export const fileUrl = (name: string) => url(`/worksheets/${name}`);

export const longDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00Z`),
  );

export const pageCount = (pages?: number) => (pages ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : 'PDF');
