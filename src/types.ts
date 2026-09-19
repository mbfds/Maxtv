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
  name?: string;
  url: string;
  referer?: string;
  userAgent?: string;
  chave?: string;
  quality?: string;
  isWorking?: boolean;
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
  isRecentlyAdded?: boolean;
  addedAt?: string;
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
  autoUpdateIntervalHours?: number; // 0 = disabled, 6, 12, 24, 48, 72 hours
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

export type NavigationTab = 'live' | 'movies' | 'series' | 'favorites' | 'plans' | 'admin' | 'epg' | 'profile';

export interface EpgReminder {
  id: string;
  programId: string;
  programTitle: string;
  channelId: string;
  channelName: string;
  channelLogo?: string;
  startTime: string; // ISO 8601 string
  formattedTime: string;
  durationMinutes?: number;
  userEmail: string;
  createdAt: string;
  notified?: boolean;
}

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
  type: 'json_edit' | 'sync_ramys' | 'sync_saimo' | 'repo_sync' | 'unify_grade' | 'm3u_import' | 'manual_add' | 'manual_edit' | 'manual_delete' | 'vod_sync' | 'initial_load';
  actionName: string;
  success: boolean;
  channelsCount: number;
  details: string;
  author: string;
  durationMs?: number;
  errorMessage?: string;
}

export interface RepoFileMeta {
  name: string;
  description: string;
  url: string;
  type: 'channels' | 'vod';
  approxItems: number;
  primaryServer: string;
}

export interface RepoLinksInfo {
  storage?: string;
  repoUrl?: string;
  branch?: string;
  files: RepoFileMeta[];
  currentStats: {
    channels: number;
    vod: number;
    sourcesCount?: number;
    ramysChannels?: number;
    ramysVod?: number;
    saimoChannels?: number;
    lastRamysFetch?: number;
    lastCatalogFetch?: number;
  };
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

export interface UnifyGradeStats {
  totalChannels: number;
  totalSources: number;
  multiSourceChannels: number;
  singleSourceChannels: number;
  avgSourcesPerChannel: number;
  ramysCount: number;
  saimoCount: number;
  lastUnifiedAt?: string;
}

export interface SimilarityMatchLog {
  incomingName: string;
  matchedChannelName: string;
  similarityScore: number;
  assignedOption: string;
  matchReason?: string;
  unifiedName?: string;
  assignedOptionLabel?: string;
}

export interface FuzzyDuplicateCandidate {
  id: string;
  primaryChannel: {
    id: string;
    name: string;
    category: string;
    logo?: string;
    sourcesCount: number;
    streamUrl?: string;
  };
  duplicateChannel: {
    id: string;
    name: string;
    category: string;
    logo?: string;
    sourcesCount: number;
    streamUrl?: string;
  };
  similarityScore: number; // 0 to 100 percentage
  matchReason: string;
  algorithmDetails?: {
    levenshteinRatio?: number;
    tokenSortRatio?: number;
    tokenSetRatio?: number;
    diceRatio?: number;
  };
}

export interface FuzzyScanResult {
  success: boolean;
  totalChannelsScanned: number;
  duplicatesFound: number;
  threshold: number;
  candidates: FuzzyDuplicateCandidate[];
  scanDurationMs: number;
}

export interface M3uImportLogEntry {
  id: string;
  timestamp: string;
  dateFormatted: string;
  sourceName: string;
  sourceUrl?: string;
  totalFound: number;
  duplicatesConsolidated: number;
  newChannelsAdded: number;
  totalStreamOptions: number;
  finalGradeCount: number;
  status: 'success' | 'warning' | 'error';
  durationMs: number;
  author: string;
  details: string;
  similarityMatches?: SimilarityMatchLog[];
}

export interface M3uAutoUpdateSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
  dateFormatted?: string;
  updatedDateFormatted?: string;
  type?: 'channels' | 'vod' | 'all';
  author?: string;
  channelsCount?: number;
  lastTestedAt?: string;
  lastLatencyMs?: number;
}

export interface M3uAutoUpdateConfig {
  enabled: boolean;
  intervalHours: number;
  sources: M3uAutoUpdateSource[];
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: 'success' | 'error' | 'running' | 'idle';
  lastMessage?: string;
  lastStats?: {
    totalFound: number;
    duplicatesConsolidated: number;
    newChannelsAdded: number;
    finalGradeCount: number;
  };
}

export interface UrlSaveErrorEntry {
  id: string;
  timestamp: string;
  url: string;
  sourceName?: string;
  errorType: 'http_error' | 'timeout' | 'network_error' | 'invalid_m3u_format' | 'empty_content' | 'protocol_error' | 'sqlite_error' | 'validation_error' | string;
  errorMessage: string;
  statusCode?: number;
  details?: {
    latencyMs?: number;
    contentType?: string;
    sampleContent?: string;
    stack?: string;
    sample?: string;
    initiatedBy?: string;
    [key: string]: any;
  };
}

export interface DatabaseStats {
  dbFile: string;
  dbSizeBytes: number;
  dbSizeFormatted: string;
  walSizeBytes: number;
  walSizeFormatted: string;
  counts: Record<string, number>;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actionType: 'LINKS' | 'PAYMENTS' | 'USERS' | 'CHANNELS' | 'SETTINGS' | 'SYSTEM';
  actionName: string;
  description: string;
  adminEmail: string;
  adminName: string;
  targetId?: string;
  details?: Record<string, any>;
  ip?: string;
}

export interface ActiveUserSession {
  sessionId: string;
  ip?: string;
  userAgent?: string;
  isVip: boolean;
  userEmail?: string;
  mediaId?: string;
  mediaType?: string;
  mediaName?: string;
  totalWatchSeconds: number;
  lastHeartbeat: string;
  secondsAgo: number;
  isBlocked: boolean;
  adblockDetected: boolean;
  deviceType: 'TV' | 'Mobile' | 'Desktop' | 'Other';
}

export interface TopChannelMetric {
  mediaId: string;
  name: string;
  category?: string;
  activeViewers: number;
  totalWatchSeconds: number;
  isVipOnly?: boolean;
}

export interface ServerPerformanceMetrics {
  uptimeSeconds: number;
  uptimeFormatted: string;
  nodeVersion: string;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    heapPercentage: number;
  };
  cpu: {
    userTimeMs: number;
    systemTimeMs: number;
  };
  sqlite: {
    connected: boolean;
    dbSizeFormatted: string;
    walSizeFormatted: string;
    totalChannels: number;
    totalSubscribers: number;
    totalSessions: number;
    totalAuditLogs: number;
  };
  network: {
    activeConnections: number;
    totalRequestsHandled: number;
  };
  timestamp: string;
}

export interface RealtimeDashboardData {
  performance: ServerPerformanceMetrics;
  activeUsers: {
    totalActiveNow: number;
    vipCount: number;
    guestCount: number;
    sessions: ActiveUserSession[];
  };
  topChannels: TopChannelMetric[];
  recentAudits: AuditLogEntry[];
}

export interface EpgProgram {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  description?: string;
  category?: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  startFormatted: string; // "14:00"
  endFormatted: string; // "15:30"
  durationMinutes: number;
  rating?: string; // "Livre", "10", "12", "14", "16", "18"
  isLiveNow: boolean;
  progressPercent: number;
  aiEnriched?: boolean;
  aiTags?: string[];
  aiHighlights?: string[];
  source?: 'xmltv' | 'gemini' | 'system';
}

export interface ChannelEpgSchedule {
  channel: Channel;
  programs: EpgProgram[];
  currentProgram?: EpgProgram;
  nextProgram?: EpgProgram;
}

export interface EpgEnrichResponse {
  success: boolean;
  description: string;
  rating?: string;
  tags?: string[];
  highlights?: string[];
  source?: string;
  cached?: boolean;
}




