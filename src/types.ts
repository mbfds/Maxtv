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

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  url?: string;
  content?: string;
  isDefault?: boolean;
  kind?: 'subtitles' | 'captions';
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
  subtitles?: SubtitleTrack[];
  trailerUrl?: string;
  featured?: boolean;
  isVipOnly?: boolean;
  activeSeasonNumber?: number;
  activeEpisodeNumber?: number;
  activeEpisodeTitle?: string;
  autoPilotEnabled?: boolean;
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

export type NavigationTab = 'live' | 'movies' | 'series' | 'favorites' | 'plans' | 'admin';

export interface WatchProgress {
  id: string; // vod id
  title: string;
  type: 'movie' | 'series';
  posterUrl: string;
  bannerUrl?: string;
  currentTime: number; // in seconds
  duration: number; // in seconds
  percent: number; // 0 to 100
  lastWatchedAt: string; // ISO string
  streamUrl: string;
  year?: number;
  rating?: string;
  genre?: string[];
  episodeTitle?: string;
  episodeNumber?: number;
  seasonNumber?: number;
}

export interface FavoriteItem {
  id: string; // channel id or vod id
  type: 'channel' | 'vod';
  addedAt: string; // ISO string
  name?: string;
  title?: string;
  logo?: string;
  posterUrl?: string;
  bannerUrl?: string;
  category?: string;
  year?: number;
  rating?: string;
  duration?: string;
  genre?: string[];
  synopsis?: string;
  isVipOnly?: boolean;
  streamUrl?: string;
}

export interface ChannelReport {
  id: string;
  channelId: string;
  channelName: string;
  sourceUrl: string;
  reason: string;
  timestamp: string;
  userEmail: string;
  latencyMs?: number;
  status?: string;
}

export interface ChannelUpdateHistoryEntry {
  id: string;
  timestamp: string;
  dateFormatted: string;
  type: 'json_edit' | 'sync_ramys' | 'sync_saimo' | 'manual_add' | 'manual_edit' | 'manual_delete' | 'vod_sync' | 'initial_load';
  actionName: string;
  success: boolean;
  channelsCount: number;
  details: string;
  author: string;
  durationMs?: number;
  errorMessage?: string;
}

export interface ChannelsConfigFile {
  version: string;
  updatedAt: string;
  updatedBy?: string;
  description?: string;
  channels: Channel[];
}

export interface ChannelsConfigResponse {
  success: boolean;
  config?: ChannelsConfigFile;
  rawJson?: string;
  filePath?: string;
  count?: number;
  lastModified?: string;
  error?: string;
}

