import type { FastifyPluginAsync } from 'fastify';
import { admin } from '../db.js';

// Blog global de date.pe (SEO). Contenido servido a date.pe/blog.
export const blogRoutes: FastifyPluginAsync = async (app) => {
  app.get('/blog', async () => {
    const { rows } = await admin(
      `SELECT slug, title, excerpt, cover_url, published_at
         FROM blog_posts WHERE published_at IS NOT NULL AND published_at <= now()
        ORDER BY published_at DESC LIMIT 50`,
    );
    return { posts: rows };
  });

  app.get('/blog/:slug', async (request, reply) => {
    const slug = (request.params as { slug: string }).slug;
    const { rows } = await admin(
      'SELECT slug, title, excerpt, body_md, cover_url, published_at FROM blog_posts WHERE slug = $1',
      [slug],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'no_encontrado' });
    return rows[0];
  });
};
