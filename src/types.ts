export type ChannelCategory = 
  | 'Todos'
  | 'Abertos'
  | 'Esportes'
  | 'Notícias'
  | 'Filmes & Séries'
  | 'Infantis'
  | 'Documentários'
  | 'Variedades & Música';

export interface ChannelSource {
  url: string;
  referer?: string;
  userAgent?: string;
  chave?: string;
  quality?: string;
}

export interface Channel {
  id: string;
  name: string;
  category: ChannelCategory;
  logo: string;
  sources: ChannelSource[];
  isCustom?: boolean;
  isActive: boolean;
  isVipOnly?: boolean;
  epgNow?: string;
  epgNext?: string;
}

export interface VodItem {
  id: string;
  title: string;
  type: 'movie' | 'series';
  year: number;
  duration?: string;
  rating?: string;
  genre: string[];
  bannerUrl: string;
  posterUrl: string;
  synopsis: string;
  streamUrl: string;
  featured?: boolean;
  isVipOnly?: boolean;
  seasons?: {
    seasonNumber: number;
    episodes: {
      episodeNumber: number;
      title: string;
      duration: string;
      streamUrl: string;
    }[];
  }[];
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  period: 'monthly' | 'quarterly' | 'annual';
  price: number;
  originalPrice?: number;
  badge?: string;
  isPopular?: boolean;
  features: string[];
  durationDays: number;
}

export interface Subscriber {
  id: string;
  name: string;
  email: string;
  cpf: string;
  planId: string;
  planName: string;
  status: 'active' | 'pending' | 'expired' | 'blocked';
  startDate: string;
  expiresAt: string;
  lastPaymentId?: string;
  amountPaid: number;
}

export interface PixTransaction {
  id: string;
  orderId: string;
  mpPaymentId?: string;
  subscriberName: string;
  subscriberEmail: string;
  cpf: string;
  planId: string;
  planName: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  qrCodeText: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
}

export interface AdminMetrics {
  totalSubscribers: number;
  activeSubscribers: number;
  pendingPix: number;
  monthlyRevenue: number;
  todayRevenue: number;
  totalChannels: number;
  onlineChannels: number;
  vodCount: number;
}

export interface SystemSettings {
  mercadoPagoAccessToken: string;
  mercadoPagoPublicKey: string;
  pixKey: string;
  sandboxMode: boolean;
  announcementText: string;
  allowFreePreview: boolean;
  freePreviewMinutes: number;
}

export interface VipGrant {
  id: string;
  subscriberId: string;
  subscriberName: string;
  subscriberEmail: string;
  monthsGranted: number;
  daysGranted: number;
  reason: string;
  previousExpiresAt: string;
  newExpiresAt: string;
  grantedAt: string;
  grantedBy: string;
}
