/**
 * Sharing (architecture §6.6): every published recipe has a stable public URL
 * `${PUBLIC_BASE_URL}/r/:slug`. This route returns a lightweight SSR HTML
 * fragment with Open Graph + Twitter Card meta tags so links shared to social
 * media render rich previews. A real SPA deployment would hydrate from here; for
 * Phase 1 this satisfies the "share via link / social media" requirement.
 *
 * NOTE: mounted at the ROOT (not under /api) and also exposed as a JSON variant
 * under /api/recipes/:idOrSlug/share for the SPA to consume.
 */

import type { FastifyInstance } from "fastify";

import { env } from "../../env.js";
import { ApiError } from "../../platform/errors.js";
import { getPublishedRow } from "./recipe.service.js";
import { buildDetail } from "./recipe.view.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ogMeta(recipe: {
  title: string;
  description: string;
  shareUrl: string;
  thumbnailUrl: string | null;
  authorName: string;
}): { title: string; description: string; image: string | null; url: string } {
  return {
    title: recipe.title,
    description:
      recipe.description.length > 200
        ? `${recipe.description.slice(0, 197)}...`
        : recipe.description || `A recipe by ${recipe.authorName}`,
    image: recipe.thumbnailUrl,
    url: recipe.shareUrl,
  };
}

/** Root-mounted share routes (NOT under /api). */
export async function shareRootRoutes(app: FastifyInstance): Promise<void> {
  app.get("/r/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    let detail;
    try {
      const row = await getPublishedRow(slug);
      detail = await buildDetail(row, env.PUBLIC_BASE_URL);
    } catch {
      return reply.code(404).type("text/html").send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Recipe not found</title></head><body><h1>Recipe not found</h1></body></html>`,
      );
    }
    const og = ogMeta(detail);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(og.title)}</title>
  <meta name="description" content="${escapeHtml(og.description)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(og.title)}">
  <meta property="og:description" content="${escapeHtml(og.description)}">
  <meta property="og:url" content="${escapeHtml(og.url)}">
  ${og.image ? `<meta property="og:image" content="${escapeHtml(og.image)}">` : ""}
  <meta name="twitter:card" content="${og.image ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(og.title)}">
  <meta name="twitter:description" content="${escapeHtml(og.description)}">
  ${og.image ? `<meta name="twitter:image" content="${escapeHtml(og.image)}">` : ""}
</head>
<body>
  <article>
    <h1>${escapeHtml(detail.title)}</h1>
    <p>by ${escapeHtml(detail.authorName)}</p>
    <p>${escapeHtml(detail.description)}</p>
  </article>
</body>
</html>`;
    return reply.type("text/html").send(html);
  });
}

/** JSON share metadata under /api (for the SPA share dialog). */
export async function shareApiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/recipes/:idOrSlug/share", async (request) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const numeric = /^\d+$/.test(idOrSlug);
    let detail;
    try {
      const row = await getPublishedRow(numeric ? Number(idOrSlug) : idOrSlug);
      detail = await buildDetail(row, env.PUBLIC_BASE_URL);
    } catch {
      throw ApiError.notFound("Recipe not found.");
    }
    const og = ogMeta(detail);
    return {
      share: {
        url: og.url,
        title: og.title,
        description: og.description,
        image: og.image,
        openGraph: {
          "og:type": "article",
          "og:title": og.title,
          "og:description": og.description,
          "og:url": og.url,
          ...(og.image ? { "og:image": og.image } : {}),
        },
      },
    };
  });
}
