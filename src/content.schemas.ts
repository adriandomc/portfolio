import { z } from "astro/zod";

// Single source of truth for content frontmatter. Imported by
// `content.config.ts` (build-time collection validation) and by the admin
// save endpoint (validates before anything reaches the repo), so the two can
// never drift apart.

export const blogSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  image: z.string().optional(),
});

export const projectSchema = z.object({
  title: z.string(),
  description: z.string(),
  images: z
    .array(
      z.object({
        src: z.string(),
        alt: z.string(),
      }),
    )
    .default([]),
  href: z.string().optional(),
  // Card-level framing. Optional so existing projects keep rendering while
  // these get filled in: the card falls back to `description` when `summary`
  // is absent, and hides the meta line when role/year are absent.
  summary: z.string().optional(),
  role: z.string().optional(),
  year: z.string().optional(),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  order: z.number().optional(),
  draft: z.boolean().default(false),
});

export const contentSchemas = {
  blog: blogSchema,
  projects: projectSchema,
} as const;
