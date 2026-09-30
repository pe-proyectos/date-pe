import Link from 'next/link';
import { ChevronDown, FileText } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

const PROSE =
  'text-[16px] leading-[1.7] text-ink-2 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h3]:mt-6 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-ink';

export function LegalPage({
  title,
  intro,
  updated,
  sections,
  related,
}: {
  title: string;
  intro: React.ReactNode;
  updated: string;
  sections: LegalSection[];
  related: { href: string; label: string }[];
}) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 md:px-8 md:pt-14">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav aria-label="Contenido" className="sticky top-24">
              <div className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-soft">Contenido</div>
              <ol className="space-y-1 border-l border-line text-[14px]">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-mute transition-colors hover:border-ink hover:text-ink">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
              <div className="mt-8 space-y-2 text-[14px]">
                {related.map((r) => (
                  <Link key={r.href} href={r.href} className="flex items-center gap-2 text-mute hover:text-ink">
                    <FileText size={15} strokeWidth={1.75} /> {r.label}
                  </Link>
                ))}
              </div>
            </nav>
          </aside>

          <article className="min-w-0 max-w-[720px]">
            <h1 className="text-[clamp(2rem,6vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{title}</h1>
            <p className="mt-3 text-[14px] text-soft">Última actualización: {updated}</p>
            <div className="mt-6 rounded-xl border border-dashed border-line-2 bg-field px-4 py-3 text-[14px] text-mute">
              Razón social y RUC de date.pe: [completar]
            </div>
            <div className={`mt-6 ${PROSE}`}>{intro}</div>

            <details className="group mt-8 rounded-xl border border-line lg:hidden">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium">
                Contenido
                <ChevronDown size={18} strokeWidth={1.75} className="transition-transform group-open:rotate-180" />
              </summary>
              <ol className="border-t border-line px-4 py-2 text-[15px]">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="block py-2.5 text-mute">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>

            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-line pt-8 mt-10 first-of-type:mt-10">
                <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                  {i + 1}. {s.title}
                </h2>
                <div className={PROSE}>{s.body}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
