import { SubscriptionPlan } from '../types';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan-mensal',
    name: 'Plano Mensal VIP',
    period: 'monthly',
    price: 10.00,
    originalPrice: 20.00,
    badge: 'Mais Vendido',
    durationDays: 30,
    features: [
      '1 Dispositivo conectado',
      'Todos os canais de TV ao vivo em Full HD/4K',
      'Catálogo completo de Filmes e Séries liberado',
      'Sem propagandas e sem limite de 5 minutos',
      'Ativação imediata via PIX Oficial Mercado Pago',
      'Suporte prioritário 24/7'
    ]
  },
  {
    id: 'plan-trimestral',
    name: 'Plano Trimestral',
    period: 'quarterly',
    price: 27.00,
    originalPrice: 30.00,
    badge: 'Desconto 10%',
    durationDays: 90,
    features: [
      '1 Dispositivo conectado',
      'Acesso ilimitado 90 dias a todos os canais',
      'Filmes e séries sem anúncios',
      'Canais Premiere, Esportes e Notícias',
      'Economize com 3 meses de acesso garantido'
    ]
  },
  {
    id: 'plan-anual-vip',
    name: 'Plano Anual VIP',
    period: 'annual',
    price: 99.00,
    originalPrice: 120.00,
    badge: 'Melhor Custo-Benefício',
    durationDays: 365,
    features: [
      '1 Dispositivo conectado',
      'Acesso TOTAL VIP por 1 ano completo',
      'Todos os canais, filmes e séries sem limites',
      'Guia de programação EPG em tempo real',
      'Streaming em alta velocidade sem travamentos'
    ]
  }
];
