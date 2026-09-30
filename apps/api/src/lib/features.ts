import type { Sql } from '../db.js';

// Cada barbería prende o apaga cada función desde su panel.
export const FEATURE_DEFAULTS = {
  booking: true,
  queue: true,
  tv: true,
  pos: true,
  tips: true,
  products: true,
  expenses: true,
  payroll: true,
  packages: true,
  rewards: true,
  giftcards_online: true,
  memberships_sale: true,
  marketing: true,
  client_photos: true,
  push: true,
  daily_summary: true,
  whatsapp: false,
} as const;
export type FeatureKey = keyof typeof FEATURE_DEFAULTS;
export type Features = Record<FeatureKey, boolean>;

export const TV_DEFAULTS = {
  theme: 'dark' as 'dark' | 'light' | 'brand',
  layout: 'split' as 'split' | 'queue' | 'minimal',
  showQueue: true,
  showAppointments: true,
  showQr: true,
  showClock: true,
  showPromos: true,
  announceVoice: true, // "Turno 12, Carlos te espera" con voz
  chime: true,
  message: '',
  promos: [] as Array<{ title: string; text?: string; image?: string }>,
  backgroundUrl: '',
  scale: 1,
};

export const QUEUE_DEFAULTS = {
  maxWaiting: 40,
  askPhone: false,
  allowStaffChoice: true,
  noShowMinutes: 10,
  autoNoShow: true, // si no se presenta: segundo llamado a la mitad y luego pasa al siguiente
  earlyMinutes: 60, // se puede sacar turno hasta 60 min antes de abrir
  fallbackMinutes: 30,
  welcome: '',
  closedMessage: 'La fila virtual abre en el horario de atención.',
};

export const POS_DEFAULTS = {
  tipPresets: [0, 10, 15, 20],
  methods: ['cash', 'yape', 'plin', 'card', 'transfer'] as string[],
  requireSession: true,
  askReceipt: true,
};

export const MARKETING_DEFAULTS = {
  birthdayEnabled: true,
  birthdayDiscountPercent: 20,
  winbackEnabled: true,
  winbackDays: 45,
  winbackDiscountPercent: 15,
  membershipRenewReminder: true,
};

export interface TenantConfig {
  features: Features;
  tv: typeof TV_DEFAULTS;
  queue: typeof QUEUE_DEFAULTS;
  pos: typeof POS_DEFAULTS;
  marketing: typeof MARKETING_DEFAULTS;
}

/** Lee funciones y configuración del tenant en sesión, con valores por defecto. */
export async function tenantConfig(sql: Sql): Promise<TenantConfig> {
  const r = await sql<{ features: object; tv_config: object; queue_config: object; pos_config: object; marketing_config: object }>(
    'SELECT features, tv_config, queue_config, pos_config, marketing_config FROM tenant_settings',
  );
  const row = r.rows[0] ?? { features: {}, tv_config: {}, queue_config: {}, pos_config: {}, marketing_config: {} };
  return {
    features: { ...FEATURE_DEFAULTS, ...(row.features as Partial<Features>) },
    tv: { ...TV_DEFAULTS, ...(row.tv_config as object) },
    queue: { ...QUEUE_DEFAULTS, ...(row.queue_config as object) },
    pos: { ...POS_DEFAULTS, ...(row.pos_config as object) },
    marketing: { ...MARKETING_DEFAULTS, ...(row.marketing_config as object) },
  };
}

export class FeatureOff extends Error {
  constructor(public feature: string) {
    super('funcion_desactivada');
  }
}

export async function requireFeature(sql: Sql, key: FeatureKey): Promise<TenantConfig> {
  const cfg = await tenantConfig(sql);
  if (!cfg.features[key]) throw new FeatureOff(key);
  return cfg;
}
