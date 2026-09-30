import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Cómo date.pe y las barberías que lo usan tratan tus datos personales, conforme a la Ley 29733 de Protección de Datos Personales y su reglamento.',
  alternates: { canonical: 'https://date.pe/privacidad' },
};

const sections: LegalSection[] = [
  {
    id: 'quienes',
    title: 'Quiénes somos y a quién aplica',
    body: (
      <>
        <p>
          date.pe es un software para barberías en el Perú. Les permite recibir reservas en línea, llevar su agenda, cobrar en caja, manejar una
          fila virtual y comunicarse con sus clientes. Cada barbería tiene su propia página, por ejemplo <strong>nombre.date.pe</strong>.
        </p>
        <p>Esta política aplica a:</p>
        <ul>
          <li>Las personas que reservan, hacen fila, compran o dejan una opinión en la página de una barbería que usa date.pe (los clientes).</li>
          <li>Las personas que visitan date.pe, buscan barberías o envían una solicitud de acceso.</li>
          <li>Los dueños, administradores y barberos que usan el panel de date.pe.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'roles',
    title: 'Titular del banco de datos y encargado del tratamiento',
    body: (
      <>
        <p>
          Cuando reservas o te atiendes en una barbería, <strong>la barbería es la titular del banco de datos</strong> de sus clientes: ella decide
          para qué usa tus datos y es responsable frente a ti. <strong>date.pe actúa como encargado del tratamiento</strong>: guardamos y procesamos
          esos datos por cuenta de la barbería, solo para prestarle el servicio y según sus instrucciones. No vendemos tus datos ni los usamos para
          publicidad propia.
        </p>
        <p>
          date.pe es titular de los datos de las personas que visitan date.pe, envían una solicitud de acceso o usan el panel como parte de una
          barbería.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Datos que tratamos',
    body: (
      <>
        <ul>
          <li><strong>Identificación y contacto:</strong> nombre, celular y correo electrónico.</li>
          <li><strong>Historial de citas:</strong> servicios, barbero, fecha y hora, asistencias, cancelaciones, turnos en la fila y notas de atención que registre la barbería.</li>
          <li><strong>Cumpleaños</strong>, solo si decides darlo, para saludos o beneficios.</li>
          <li>
            <strong>Pagos:</strong> monto y estado de los adelantos y cobros. Los pagos con tarjeta, Yape u otros medios los procesan proveedores
            de pago como Culqi, MercadoPago o PayPal. <strong>date.pe nunca guarda los datos completos de tu tarjeta.</strong>
          </li>
          <li><strong>Opiniones</strong> que publiques sobre una barbería.</li>
          <li><strong>Libro de Reclamaciones:</strong> los datos que consignes en una hoja de reclamación, incluido tu documento de identidad.</li>
          <li><strong>Datos técnicos:</strong> dirección IP, tipo de navegador y registros de seguridad, necesarios para operar y proteger el servicio.</li>
          <li><strong>Equipo de la barbería:</strong> nombre, correo, rol, horarios, comisiones y actividad en el panel.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para qué usamos tus datos',
    body: (
      <>
        <ul>
          <li>Registrar y gestionar tus reservas, turnos en la fila, cobros y adelantos.</li>
          <li>Enviarte confirmaciones y recordatorios por correo, notificaciones push y WhatsApp cuando la barbería los tenga activos.</li>
          <li>Pedirte una opinión después de tu cita y mostrar las opiniones publicadas.</li>
          <li>Administrar programas de puntos, paquetes, gift cards y referidos de la barbería.</li>
          <li>Atender reclamos y quejas registrados en el Libro de Reclamaciones.</li>
          <li>Prevenir fraudes y abusos, y mantener la seguridad del servicio.</li>
          <li>
            <strong>Marketing opcional:</strong> la barbería puede enviarte novedades o promociones solo si diste tu consentimiento. Cada correo de
            este tipo incluye un enlace para darte de baja cuando quieras, sin afectar los avisos de tus reservas.
          </li>
        </ul>
        <p>
          La base para tratar tus datos es la ejecución de la reserva o el servicio que pides, el cumplimiento de obligaciones legales y, para el
          marketing, tu consentimiento libre, previo, expreso e informado.
        </p>
      </>
    ),
  },
  {
    id: 'proveedores',
    title: 'Con quién compartimos datos',
    body: (
      <>
        <p>Compartimos solo lo necesario con proveedores que nos ayudan a prestar el servicio, bajo acuerdos de confidencialidad:</p>
        <ul>
          <li><strong>Alojamiento:</strong> servidores privados virtuales (VPS) donde funciona la aplicación y la base de datos.</li>
          <li><strong>Cloudflare R2:</strong> almacenamiento de archivos como fotos, logos y copias de seguridad cifradas.</li>
          <li><strong>Resend:</strong> envío de correos electrónicos.</li>
          <li><strong>Procesadores de pago:</strong> Culqi, MercadoPago y PayPal, según el medio que elijas.</li>
          <li><strong>Meta (WhatsApp):</strong> solo cuando la barbería tiene activos los mensajes por WhatsApp.</li>
        </ul>
        <p>
          Algunos de estos proveedores tratan datos fuera del Perú. En esos casos se trata de un flujo transfronterizo realizado para prestar el
          servicio que pediste, con proveedores que ofrecen niveles de protección adecuados. También podemos entregar datos a autoridades cuando
          una ley o una orden judicial lo exija.
        </p>
      </>
    ),
  },
  {
    id: 'conservacion',
    title: 'Cuánto tiempo guardamos los datos',
    body: (
      <>
        <p>
          Guardamos los datos mientras la barbería mantenga su cuenta y los necesite para atenderte. Si pides la cancelación de tus datos, los
          eliminamos o anonimizamos salvo lo que debamos conservar por ley, por ejemplo registros de pagos y hojas del Libro de Reclamaciones, que
          se conservan al menos por el plazo que exige la normativa de protección al consumidor.
        </p>
        <p>
          Si una barbería deja date.pe, puede pedir una exportación de sus datos. Después de un plazo razonable los eliminamos de la aplicación, y
          las copias de seguridad cifradas se borran al cumplirse su ciclo de rotación.
        </p>
      </>
    ),
  },
  {
    id: 'arco',
    title: 'Tus derechos ARCO',
    body: (
      <>
        <p>Conforme a la Ley 29733, puedes ejercer en cualquier momento tus derechos de:</p>
        <ul>
          <li><strong>Acceso:</strong> saber qué datos tuyos tratamos y cómo.</li>
          <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong>Cancelación:</strong> pedir que eliminemos tus datos cuando ya no sean necesarios.</li>
          <li><strong>Oposición:</strong> oponerte a un tratamiento, por ejemplo al envío de promociones.</li>
        </ul>
        <p>
          Escríbenos a <a href="mailto:hola@date.pe">hola@date.pe</a> o directamente a la barbería, indicando tu nombre, el derecho que quieres
          ejercer y un medio de contacto. Podemos pedirte una copia de tu documento para verificar tu identidad. Si tu pedido es sobre datos de una
          barbería, lo coordinamos con ella. Responderemos dentro de los plazos que establece el reglamento.
        </p>
        <p>
          Si consideras que no atendimos tu pedido, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de
          Justicia y Derechos Humanos.
        </p>
      </>
    ),
  },
  {
    id: 'seguridad',
    title: 'Seguridad',
    body: (
      <>
        <ul>
          <li>Cifrado en tránsito: todas las conexiones usan HTTPS.</li>
          <li>Copias de seguridad diarias y cifradas.</li>
          <li>Acceso por roles: cada persona del equipo de una barbería ve solo lo que su rol permite, y los datos de cada barbería están separados de los de las demás.</li>
          <li>Registros de actividad y acceso restringido del personal de date.pe, solo cuando es necesario para soporte o seguridad.</li>
        </ul>
        <p>Ningún sistema es infalible. Si ocurriera un incidente que afecte tus datos, lo comunicaremos a la barbería y a las autoridades según corresponda.</p>
      </>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    body: (
      <p>
        date.pe no está dirigido a menores de edad. Si un menor de 14 años necesita reservar, debe hacerlo su padre, madre o apoderado con sus
        propios datos. Si detectamos datos de un menor sin ese consentimiento, los eliminaremos.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a esta política',
    body: (
      <p>
        Podemos actualizar esta política cuando cambie el servicio o la normativa. Publicaremos la nueva versión en esta página con su fecha, y si
        el cambio es importante lo avisaremos por correo o en el panel.
      </p>
    ),
  },
  {
    id: 'contacto',
    title: 'Contacto',
    body: (
      <p>
        Para cualquier consulta sobre privacidad escríbenos a <a href="mailto:hola@date.pe">hola@date.pe</a>. Para reclamos sobre date.pe usa
        nuestro <Link href="/reclamaciones">Libro de Reclamaciones</Link>.
      </p>
    ),
  },
];

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      updated="30 de septiembre de 2026"
      intro={
        <p>
          Esta política explica cómo se tratan tus datos personales en date.pe, conforme a la Ley 29733, Ley de Protección de Datos Personales, y su
          reglamento aprobado por Decreto Supremo 016-2024-JUS.
        </p>
      }
      sections={sections}
      related={[
        { href: '/terminos', label: 'Términos y condiciones' },
        { href: '/reclamaciones', label: 'Libro de Reclamaciones' },
      ]}
    />
  );
}
