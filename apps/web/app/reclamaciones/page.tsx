import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { LibroReclamaciones } from '@/components/LibroReclamaciones';

export const metadata: Metadata = {
  title: 'Libro de Reclamaciones',
  description: 'Libro de Reclamaciones virtual de date.pe. Registra un reclamo o una queja sobre date.pe y recibe la constancia en tu correo.',
  alternates: { canonical: 'https://date.pe/reclamaciones' },
};

export default function ReclamacionesPage() {
  return (
    <>
      <div className="print:hidden">
        <Header />
      </div>
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-8 md:px-8 md:pt-12 print:max-w-none print:p-0">
        <div className="print:hidden">
          <h1 className="text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Libro de Reclamaciones</h1>
          <p className="mt-3 text-[17px] text-mute">
            Conforme al Código de Protección y Defensa del Consumidor, date.pe pone a tu disposición este Libro de Reclamaciones virtual.
          </p>
          <p className="mt-4 rounded-xl bg-field p-4 text-[14px] leading-relaxed text-mute">
            Este libro es para reclamos sobre date.pe. Si tu reclamo es sobre la atención, un servicio o un cobro de una barbería, usa el Libro de
            Reclamaciones de esa barbería: lo encuentras al pie de su página, en la dirección <span className="font-medium text-ink">nombre.date.pe/reclamaciones</span>.
            Más información en nuestros <Link href="/terminos" className="font-medium text-ink underline">Términos</Link>.
          </p>
        </div>
        <div className="mt-8 print:mt-0">
          <LibroReclamaciones />
        </div>
      </main>
      <Footer />
    </>
  );
}
