import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { blogSchema, projectSchema } from "./content.schemas";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: blogSchema,
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: projectSchema,
});

export const collections = { blog, projects };
