import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Guías de barbería, tendencias y las mejores barberías por distrito en Lima.',
};

interface Post {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  published_at: string;
}

export const revalidate = 300;

export default async function BlogPage() {
  let posts: Post[] = [];
  try {
    const data = await apiFetch<{ posts: Post[] }>('/api/blog', { revalidate: 300 });
    posts = data.posts;
  } catch {
    posts = [];
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← date.pe
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Blog</h1>
      {posts.length === 0 && <p className="mt-6 text-slate-500">Aún no hay artículos publicados.</p>}
      <div className="mt-8 space-y-8">
        {posts.map((post) => (
          <article key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="group block">
              <h2 className="text-xl font-semibold group-hover:underline">{post.title}</h2>
              {post.excerpt && <p className="mt-1 text-slate-600">{post.excerpt}</p>}
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
