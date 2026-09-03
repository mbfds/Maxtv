import { SubscriptionPlan } from '../types';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan-mensal',
    name: 'Plano Mensal',
    period: 'monthly',
    price: 19.90,
    originalPrice: 29.90,
    badge: 'Popular',
    durationDays: 30,
    features: [
      'Acesso a 110+ canais de TV ao vivo em HD',
      'Catálogo completo de Filmes e Séries (VOD)',
      '1 Conexão simultânea',
      'Ativação imediata via PIX Mercado Pago',
      'Suporte prioritário 24/7'
    ]
  },
  {
    id: 'plan-trimestral',
    name: 'Plano Trimestral',
    period: 'quarterly',
    price: 49.90,
    originalPrice: 79.90,
    badge: 'Mais Econômico',
    durationDays: 90,
    features: [
      'Acesso ilimitado a todos os canais HD e Full HD',
      'Filmes e séries sem anúncios',
      '2 Conexões simultâneas',
      'Canais Premiere, SporTV e Premiere Clubes',
      '3 meses de acesso garantido'
    ]
  },
  {
    id: 'plan-anual-vip',
    name: 'MAXTV VIP Anual',
    period: 'annual',
    price: 149.90,
    originalPrice: 238.80,
    badge: 'Melhor Custo-Benefício',
    durationDays: 365,
    features: [
      'Acesso TOTAL VIP (Canais 4K + VOD Completo)',
      '4 Telas simultâneas para toda a família',
      'Canais adultos e Pay-Per-View inclusos',
      'Guia de programação EPG em tempo real',
      '1 Ano de streaming sem interrupções'
    ]
  }
];
