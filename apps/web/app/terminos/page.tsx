import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: 'Términos y condiciones de uso de date.pe, el software de reservas, agenda, caja y fila virtual para barberías en el Perú.',
  alternates: { canonical: 'https://date.pe/terminos' },
};

const sections: LegalSection[] = [
  {
    id: 'servicio',
    title: 'Qué es date.pe',
    body: (
      <>
        <p>
          date.pe es un software que ofrece a las barberías herramientas de reservas en línea, agenda, caja, fila virtual, pantalla de TV,
          recordatorios, opiniones y fidelización. Cada barbería tiene su propia página en date.pe, donde sus clientes reservan y pagan adelantos.
        </p>
        <p>
          date.pe no presta servicios de barbería. La relación de consumo por el corte, la barba o cualquier otro servicio o producto es entre el
          cliente y la barbería.
        </p>
      </>
    ),
  },
  {
    id: 'aceptacion',
    title: 'Aceptación',
    body: (
      <p>
        Al usar date.pe, ya sea para reservar en una barbería o para administrar una, aceptas estos términos y nuestra{' '}
        <Link href="/privacidad">Política de privacidad</Link>. Si no estás de acuerdo, no uses el servicio.
      </p>
    ),
  },
  {
    id: 'cuentas',
    title: 'Cuentas de barberías',
    body: (
      <>
        <p>
          Las cuentas de barbería se crean por solicitud y aprobación. No existe registro automático: la barbería envía una solicitud desde{' '}
          <Link href="/join">date.pe/join</Link>, la revisamos y, si la aprobamos, activamos su cuenta. Podemos rechazar una solicitud sin expresar
          causa.
        </p>
        <p>
          La barbería es responsable de que la información de su cuenta sea verdadera, de mantener seguras sus contraseñas y de los accesos que
          otorgue a su equipo. Las condiciones comerciales del servicio se acuerdan directamente con cada barbería.
        </p>
      </>
    ),
  },
  {
    id: 'barberia',
    title: 'Responsabilidades de la barbería',
    body: (
      <>
        <p>Cada barbería es la única responsable de:</p>
        <ul>
          <li>Sus precios, servicios, horarios, promociones y la calidad de la atención.</li>
          <li>
            Emitir sus comprobantes de pago, como boletas o facturas, ante la SUNAT. <strong>date.pe no emite comprobantes de pago</strong> a
            nombre de las barberías.
          </li>
          <li>Sus políticas de adelantos, cancelaciones, inasistencias y devoluciones, que debe informar con claridad antes de la reserva.</li>
          <li>
            Atender y responder su propio Libro de Reclamaciones dentro del plazo legal. date.pe le proporciona la herramienta, pero la respuesta al
            consumidor corresponde a la barbería.
          </li>
          <li>Tratar los datos de sus clientes conforme a la Ley 29733, como titular de su banco de datos.</li>
          <li>Cumplir con las normas tributarias, laborales, municipales y de protección al consumidor que le apliquen.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'clientes',
    title: 'Reservas y adelantos para clientes',
    body: (
      <>
        <p>
          Cuando reservas, la cita queda registrada con la barbería que elegiste. Si la barbería pide un adelanto, se lo pagas directo por Yape
          o Plin y subes la captura; la reserva queda confirmada cuando la barbería verifica el pago. date.pe no recibe ni administra ese dinero:
          cualquier devolución se coordina con la barbería, según su política de adelantos, que se muestra al reservar.
        </p>
        <p>
          Para cambios, cancelaciones, devoluciones o reclamos sobre la atención, comunícate con la barbería o usa su Libro de Reclamaciones, que
          encuentras al pie de su página.
        </p>
      </>
    ),
  },
  {
    id: 'uso',
    title: 'Uso aceptable',
    body: (
      <>
        <p>No está permitido:</p>
        <ul>
          <li>Hacer reservas falsas, suplantar a otra persona o dar datos de terceros sin su permiso.</li>
          <li>Enviar mensajes no solicitados o usar los datos de clientes para fines distintos a la atención de la barbería.</li>
          <li>Publicar opiniones falsas, ofensivas o que no correspondan a una atención real.</li>
          <li>Intentar acceder a cuentas o datos ajenos, interferir con el servicio o hacer ingeniería inversa.</li>
          <li>Usar date.pe para actividades ilegales.</li>
        </ul>
        <p>Podemos suspender o cerrar cuentas que incumplan estas reglas, y retirar contenido que las infrinja.</p>
      </>
    ),
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad del servicio',
    body: (
      <p>
        Trabajamos para que date.pe esté disponible en todo momento, con copias de seguridad diarias y monitoreo continuo. Aun así, el servicio
        puede tener interrupciones por mantenimiento, fallas de proveedores o causas fuera de nuestro control. Cuando planifiquemos un
        mantenimiento importante, lo avisaremos con anticipación a las barberías.
      </p>
    ),
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    body: (
      <p>
        El software, la marca y el diseño de date.pe nos pertenecen. Cada barbería conserva los derechos sobre su marca, fotos y contenidos, y nos
        autoriza a mostrarlos en su página y en el buscador de date.pe mientras use el servicio.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Limitación de responsabilidad',
    body: (
      <>
        <p>
          date.pe no es responsable por la calidad de los servicios o productos de las barberías, por sus precios, por el cumplimiento de sus
          políticas ni por los comprobantes que emitan. Tampoco respondemos por fallas de los proveedores de pago, mensajería o conectividad.
        </p>
        <p>
          En la medida que lo permita la ley, nuestra responsabilidad frente a una barbería se limita a los montos que esta nos haya pagado en los
          tres meses anteriores al hecho que origine el reclamo. Nada en estos términos limita los derechos que la ley peruana reconoce a los
          consumidores.
        </p>
      </>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a estos términos',
    body: (
      <p>
        Podemos modificar estos términos. Publicaremos la nueva versión en esta página con su fecha y, si el cambio es importante, lo avisaremos a
        las barberías por correo o en el panel. Seguir usando date.pe después del cambio implica que lo aceptas.
      </p>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable y jurisdicción',
    body: (
      <p>
        Estos términos se rigen por las leyes de la República del Perú. Cualquier controversia se someterá a los jueces y tribunales de Lima,
        sin perjuicio del derecho de los consumidores de acudir al INDECOPI u otras vías que la ley les reconozca.
      </p>
    ),
  },
  {
    id: 'contacto',
    title: 'Contacto y reclamos',
    body: (
      <p>
        Escríbenos a <a href="mailto:hola@date.pe">hola@date.pe</a>. Para reclamos o quejas sobre date.pe usa nuestro{' '}
        <Link href="/reclamaciones">Libro de Reclamaciones</Link>. Para reclamos sobre una barbería, usa el Libro de Reclamaciones de esa barbería.
      </p>
    ),
  },
];

export default function TerminosPage() {
  return (
    <LegalPage
      title="Términos y condiciones"
      updated="30 de septiembre de 2026"
      intro={<p>Estos son los términos y condiciones de uso de date.pe, para las barberías que usan el software y para las personas que reservan a través de él.</p>}
      sections={sections}
      related={[
        { href: '/privacidad', label: 'Política de privacidad' },
        { href: '/reclamaciones', label: 'Libro de Reclamaciones' },
      ]}
    />
  );
}
