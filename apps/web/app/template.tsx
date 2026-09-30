/** Transición suave al cambiar de pantalla (solo opacidad: no rompe barras fijas). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
