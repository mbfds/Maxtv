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
  healthStatus?: 'online' | 'offline' | 'unstable' | 'untested';
  latencyMs?: number;
  lastChecked?: string;
}

export interface VodSource {
  name: string;
  url: string;
  quality?: string;
  type?: 'hls' | 'mp4';
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
  backupStreamUrl?: string;
  sources?: VodSource[];
  trailerUrl?: string;
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

export interface User {
  id: string;
  name: string;
  email: string;
  cpf?: string;
  role: 'user' | 'admin';
  vipStatus: 'active' | 'pending' | 'expired' | 'free';
  planId?: string;
  planName?: string;
  expiresAt?: string;
  startDate?: string;
  createdAt: string;
  subscriberId?: string;
}

export interface AuthResponse {
  success: boolean;
  user: User;
  token: string;
  message?: string;
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

export interface ChannelHealthResult {
  channelId: string;
  channelName: string;
  category?: string;
  sourceIndex: number;
  url: string;
  status: 'online' | 'offline' | 'unstable';
  statusCode?: number;
  statusText?: string;
  latencyMs: number;
  contentType?: string;
  lastChecked: string;
  error?: string;
}

export interface ChannelHealthSummary {
  total: number;
  tested: number;
  online: number;
  offline: number;
  unstable: number;
  untested: number;
  lastChecked?: string;
}

