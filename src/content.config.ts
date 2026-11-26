// What a post's front matter looks like. Astro checks every post against this
// at build time. scripts/mathpost.mjs writes these files: change both together.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const Post = z.object({
  title: z.string(),
  summary: z.string(),
  /** Who it is for: 'Grade 4', 'Algebra 1'. */
  level: z.string(),
  topics: z.array(z.string()).min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published_at: z.string(),
  /** File names inside public/worksheets/. */
  pdf: z.string().regex(/^[a-z0-9-]+\.pdf$/),
  thumb: z.string().optional(),
  pages: z.number().int().positive().optional(),
  // Recorded, not shown.
  model: z.string().optional(),
  requested: z.string().optional(),
});

export const collections = {
  // The file name without .md is the post's id and its address: /posts/<id>/.
  posts: defineCollection({
    loader: glob({ pattern: '*.md', base: 'src/content/posts' }),
    schema: Post,
  }),
};
