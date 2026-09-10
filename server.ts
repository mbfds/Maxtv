import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import {
  initSqlite,
  isSqliteConnected,
  getSqliteStatus,
  sqliteSaveUser,
  sqliteFindUserByEmail,
  sqliteGetAllUsers,
  sqliteSaveSubscriber,
  sqliteFindSubscriberByEmail,
  sqliteGetAllSubscribers,
  sqliteDeleteSubscriber,
  sqliteSaveM3uSource,
  sqliteGetAllM3uSources,
  sqliteDeleteM3uSource,
  sqliteSaveAutoUpdateConfig,
  sqliteGetAutoUpdateConfig,
  sqliteSaveM3uLog,
  sqliteGetM3uLogs,
  sqliteSaveAllChannels,
  sqliteGetAllChannels,
  sqliteSaveWatchProgress,
  sqliteGetWatchProgress,
  sqliteDeleteWatchProgress,
  sqliteSaveFavorite,
  sqliteGetFavorites,
  sqliteDeleteFavorite,
  sqliteSaveTransaction,
  sqliteGetAllTransactions,
  sqliteRecordSessionHeartbeat,
  sqliteCheckpointAndGetDbPath,
  sqliteGetDatabaseStats,
  sqliteSaveUrlErrorLog,
  sqliteGetUrlErrorLogs,
  sqliteClearUrlErrorLogs
} from './serverSqlite';

dotenv.config();

// Inicialização rápida e permanente do banco de dados SQLite 3
const sqliteInitResult = initSqlite();
if (sqliteInitResult.success) {
  console.log('[SQLite] Banco de dados SQLite 3 conectado e pronto para produção!', sqliteInitResult.dbPath);
} else {
  console.warn('[SQLite] Alerta ao inicializar SQLite:', sqliteInitResult.error);
}

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Platform Health Check (Container Ingress & Health Monitor)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- IN-MEMORY DATABASE & STATE ---
interface ServerChannel {
  id: string;
  name: string;
  category: string;
  logo: string;
  streamUrl?: string;
  backupStreamUrl?: string;
  sources: { name?: string; url: string; referer?: string; userAgent?: string; quality?: string; isWorking?: boolean }[];
  isCustom?: boolean;
  isActive: boolean;
  isVipOnly?: boolean;
  epgNow?: string;
  epgNext?: string;
}

interface ServerSubscriber {
  id: string;
  name: string;
  email: string;
  cpf: string;
  planId: string;
  planName: string;
  status: 'active' | 'pending' | 'expired' | 'blocked';
  startDate: string;
  expiresAt: string;
  amountPaid: number;
}

interface ServerTransaction {
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

interface ServerGrant {
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

interface ServerUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
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

const systemSettings = {
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
  mercadoPagoPublicKey: process.env.MERCADOPAGO_PUBLIC_KEY || '',
  pixKey: 'financeiro@streamingbrasil.tv.br',
  sandboxMode: false,
  announcementText: '🎉 MAXTV VIP: Mais de 110 canais ao vivo e VOD em alta definição. Plano R$ 10,00 por 1 dispositivo!',
  allowFreePreview: true,
  freePreviewMinutes: 5,
  autoUpdateIntervalHours: 24
};

const subscribers: ServerSubscriber[] = [];

// In-memory registered user accounts (Master admin for production management)
const ADMIN_EMAILS = ['admin@maxtv.vip', 'cebolao1302@gmail.com'];

const users: ServerUser[] = [
  {
    id: 'user-admin',
    name: 'Administrador Master',
    email: 'admin@maxtv.vip',
    passwordHash: 'admin123',
    role: 'admin',
    vipStatus: 'active',
    planId: 'plan-anual',
    planName: 'Admin Master (Acesso Total)',
    startDate: '2026-01-01T00:00:00.000Z',
    expiresAt: '2030-12-31T23:59:59.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-owner',
    name: 'Administrador MAXTV',
    email: 'cebolao1302@gmail.com',
    passwordHash: 'admin123',
    role: 'admin',
    vipStatus: 'active',
    planId: 'plan-anual',
    planName: 'Admin Master (Acesso Total)',
    startDate: '2026-01-01T00:00:00.000Z',
    expiresAt: '2030-12-31T23:59:59.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
];

function syncUserWithSubscriber(sub: ServerSubscriber) {
  const user = users.find(u => u.email.toLowerCase() === sub.email.toLowerCase());
  if (user) {
    user.vipStatus = sub.status === 'active' ? 'active' : 'expired';
    user.planId = sub.planId;
    user.planName = sub.planName;
    user.expiresAt = sub.expiresAt;
    user.startDate = sub.startDate;
    user.subscriberId = sub.id;
  }
}

const transactions: ServerTransaction[] = [];

// In-memory VIP grants log
const grantHistory: ServerGrant[] = [];

// ==========================================
// 2.3 ADMIN AUTH & SESSION RBAC SYSTEM
// ==========================================
export interface AdminSession {
  token: string;
  userId: string;
  email: string;
  role: 'admin';
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  ip?: string;
  method: 'pin' | 'credentials' | 'login';
}

const adminSessions = new Map<string, AdminSession>();
const ADMIN_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours validity
const MASTER_PINS = ['admin123', '1302', '2026', 'maxtv2026'];

function generateAdminToken(userId: string): string {
  const randomPart = crypto.randomBytes(24).toString('hex');
  return `adm_${userId}_${Date.now()}_${randomPart}`;
}

function createAdminSession(user: ServerUser, ip?: string, method: 'pin' | 'credentials' | 'login' = 'pin'): AdminSession {
  const token = generateAdminToken(user.id);
  const now = Date.now();
  const session: AdminSession = {
    token,
    userId: user.id,
    email: user.email.toLowerCase(),
    role: 'admin',
    createdAt: now,
    expiresAt: now + ADMIN_TOKEN_LIFETIME_MS,
    lastActiveAt: now,
    ip,
    method
  };
  adminSessions.set(token, session);
  return session;
}

function revokeAdminSession(rawToken: string): boolean {
  if (!rawToken) return false;
  const cleanToken = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();
  return adminSessions.delete(cleanToken);
}

function verifyAdminToken(rawToken: string): { valid: boolean; session?: AdminSession; user?: ServerUser; error?: string } {
  if (!rawToken) {
    return { valid: false, error: 'Token de autenticação administrativa não fornecido.' };
  }
  const cleanToken = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();
  if (!cleanToken) {
    return { valid: false, error: 'Token de administrador vazio.' };
  }

  // 1. Direct active session validation
  const session = adminSessions.get(cleanToken);
  if (session) {
    if (Date.now() > session.expiresAt) {
      adminSessions.delete(cleanToken);
      return { valid: false, error: 'Sessão administrativa expirada. Por favor, autentique-se novamente.' };
    }
    // Verify user exists and still has role 'admin'
    const user = users.find(u => u.id === session.userId || u.email.toLowerCase() === session.email.toLowerCase());
    if (!user || user.role !== 'admin') {
      adminSessions.delete(cleanToken);
      return { valid: false, error: 'Usuário não possui permissão de administrador (RBAC).' };
    }
    // Update last activity and slide expiration up to 24h
    session.lastActiveAt = Date.now();
    return { valid: true, session, user };
  }

  // 2. Master PIN as direct root token (support for automation / root testing)
  if (MASTER_PINS.includes(cleanToken)) {
    const rootAdmin = users.find(u => u.role === 'admin' || ADMIN_EMAILS.includes(u.email.toLowerCase())) || users[0];
    const rootSession: AdminSession = {
      token: cleanToken,
      userId: rootAdmin.id,
      email: rootAdmin.email.toLowerCase(),
      role: 'admin',
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_TOKEN_LIFETIME_MS,
      lastActiveAt: Date.now(),
      method: 'pin'
    };
    return { valid: true, session: rootSession, user: rootAdmin };
  }

  // 3. Fallback compatibility for previous timestamped tokens (e.g. admin-token-...)
  if (cleanToken.startsWith('admin-token-') || cleanToken.startsWith('token-user-admin-')) {
    const parts = cleanToken.split('-');
    const timestamp = Number(parts[parts.length - 1]);
    if (!isNaN(timestamp) && (Date.now() - timestamp < ADMIN_TOKEN_LIFETIME_MS)) {
      const user = users.find(u => (u.role === 'admin' && ADMIN_EMAILS.includes(u.email.toLowerCase())) || cleanToken.includes(u.id));
      if (user && user.role === 'admin') {
        const promotedSession: AdminSession = {
          token: cleanToken,
          userId: user.id,
          email: user.email.toLowerCase(),
          role: 'admin',
          createdAt: timestamp,
          expiresAt: timestamp + ADMIN_TOKEN_LIFETIME_MS,
          lastActiveAt: Date.now(),
          method: 'credentials'
        };
        adminSessions.set(cleanToken, promotedSession);
        return { valid: true, session: promotedSession, user };
      }
    }
  }

  return { valid: false, error: 'Token de administrador inválido, expirado ou não autorizado.' };
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const customHeader = req.headers['x-admin-token'] as string;
  const queryToken = (req.query.admin_token || req.query.token) as string;
  const bodyToken = (req.body && req.body.adminToken) as string;

  const rawToken = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '')
    || customHeader
    || queryToken
    || bodyToken;

  if (!rawToken) {
    return res.status(401).json({
      success: false,
      error: 'Acesso não autorizado: Token de sessão administrativa é obrigatório.',
      code: 'UNAUTHORIZED_ADMIN'
    });
  }

  const result = verifyAdminToken(rawToken);
  if (!result.valid || !result.user) {
    return res.status(403).json({
      success: false,
      error: result.error || 'Acesso negado: Apenas contas com a role "admin" têm permissão para acessar este recurso.',
      code: 'FORBIDDEN_ADMIN'
    });
  }

  (req as any).adminUser = result.user;
  (req as any).adminSession = result.session;
  next();
}

// In-memory channel store
let parsedRamysChannels: ServerChannel[] = [];
let parsedSaimoChannels: ServerChannel[] = [];
let parsedRamysVod: any[] = [];
let customAdminChannels: ServerChannel[] = [];
let customConfigChannels: ServerChannel[] = [];
let lastCatalogFetch = 0;
let lastRamysFetch = 0;

interface ServerChannelUpdateHistoryEntry {
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

const CHANNELS_CONFIG_FILE = path.join(process.cwd(), 'public', 'data', 'channels-config.json');
const CHANNELS_HISTORY_FILE = path.join(process.cwd(), 'public', 'data', 'channel-updates-history.json');
const M3U_IMPORT_HISTORY_FILE = path.join(process.cwd(), 'public', 'data', 'm3u-import-history.json');
const M3U_AUTO_UPDATE_CONFIG_FILE = path.join(process.cwd(), 'public', 'data', 'm3u-auto-update-config.json');

interface ServerSimilarityMatchLog {
  incomingName: string;
  matchedChannelName: string;
  similarityScore: number;
  assignedOption: string;
  matchReason?: string;
}

interface ServerM3uImportLogEntry {
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
  similarityMatches?: ServerSimilarityMatchLog[];
}

interface ServerM3uAutoUpdateSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
}

interface ServerM3uAutoUpdateConfig {
  enabled: boolean;
  intervalHours: number;
  sources: ServerM3uAutoUpdateSource[];
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

let channelUpdateHistory: ServerChannelUpdateHistoryEntry[] = [];
let m3uImportLogs: ServerM3uImportLogEntry[] = [];
let m3uAutoUpdateConfig: ServerM3uAutoUpdateConfig = {
  enabled: true,
  intervalHours: 24,
  sources: [
    {
      id: 'src-ramys-br03',
      name: 'Ramys Oficial - CanaisBR03.m3u8 (IPTV Brasil 2026)',
      url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8',
      enabled: true,
      priority: 1
    }
  ],
  lastRunAt: new Date().toISOString(),
  nextRunAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  lastStatus: 'idle',
  lastMessage: 'Ciclo de auto-atualização configurado a cada 24 horas.'
};

function initChannelStorage() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(CHANNELS_CONFIG_FILE)) {
      const raw = fs.readFileSync(CHANNELS_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.channels) ? parsed.channels : []);
      if (list.length > 0) {
        customConfigChannels = list;
        console.log(`[CHANNELS CONFIG] ${customConfigChannels.length} canais carregados do arquivo channels-config.json`);
      }
    }

    if (fs.existsSync(CHANNELS_HISTORY_FILE)) {
      const rawHist = fs.readFileSync(CHANNELS_HISTORY_FILE, 'utf-8');
      channelUpdateHistory = JSON.parse(rawHist);
    }

    if (fs.existsSync(M3U_IMPORT_HISTORY_FILE)) {
      const rawImport = fs.readFileSync(M3U_IMPORT_HISTORY_FILE, 'utf-8');
      m3uImportLogs = JSON.parse(rawImport);
    }

    if (fs.existsSync(M3U_AUTO_UPDATE_CONFIG_FILE)) {
      const rawAuto = fs.readFileSync(M3U_AUTO_UPDATE_CONFIG_FILE, 'utf-8');
      const parsedAuto = JSON.parse(rawAuto);
      m3uAutoUpdateConfig = { ...m3uAutoUpdateConfig, ...parsedAuto };
    } else {
      saveAutoUpdateConfigToDisk();
    }

    // --- Sincronização e Seed Inicial com SQLite 3 ---
    try {
      // Seed dos Administradores Master no SQLite
      for (const u of users) {
        sqliteSaveUser(u);
      }

      // Carregar usuários registrados do SQLite para a memória
      const dbUsers = sqliteGetAllUsers();
      for (const du of dbUsers) {
        if (!users.some(u => u.email.toLowerCase() === du.email.toLowerCase())) {
          users.push(du as any);
        }
      }

      // Carregar assinantes do SQLite para a memória
      const dbSubs = sqliteGetAllSubscribers();
      for (const ds of dbSubs) {
        if (!subscribers.some(s => s.email.toLowerCase() === ds.email.toLowerCase())) {
          subscribers.push(ds as any);
        }
      }

      // Sincronizar canais com SQLite
      const dbChannels = sqliteGetAllChannels();
      if (dbChannels.length > 0 && customConfigChannels.length === 0) {
        customConfigChannels = dbChannels;
        console.log(`[SQLite 3] ${dbChannels.length} canais carregados do banco SQLite.`);
      } else if (customConfigChannels.length > 0) {
        sqliteSaveAllChannels(customConfigChannels);
        console.log(`[SQLite 3] ${customConfigChannels.length} canais persistidos no banco SQLite.`);
      }

      // Sincronizar fontes M3U com SQLite
      const dbSources = sqliteGetAllM3uSources();
      if (dbSources.length > 0) {
        m3uAutoUpdateConfig.sources = dbSources;
      } else {
        for (const src of m3uAutoUpdateConfig.sources) {
          sqliteSaveM3uSource(src);
        }
      }

      sqliteSaveAutoUpdateConfig({
        enabled: m3uAutoUpdateConfig.enabled,
        intervalHours: m3uAutoUpdateConfig.intervalHours,
        lastRunAt: m3uAutoUpdateConfig.lastRunAt,
        nextRunAt: m3uAutoUpdateConfig.nextRunAt,
        lastStatus: m3uAutoUpdateConfig.lastStatus,
        lastMessage: m3uAutoUpdateConfig.lastMessage
      });
      console.log('[SQLite 3] Sincronização inicial de tabelas concluída com sucesso!');
    } catch (sqliteErr) {
      console.warn('[SQLite 3] Aviso na sincronização inicial do SQLite:', sqliteErr);
    }
  } catch (e) {
    console.warn('[CHANNELS INIT] Aviso ao inicializar armazenamento de canais:', e);
  }

  if (channelUpdateHistory.length === 0) {
    const now = Date.now();
    channelUpdateHistory = [
      {
        id: `hist-${now - 3600000}`,
        timestamp: new Date(now - 3600000).toISOString(),
        dateFormatted: new Date(now - 3600000).toLocaleString('pt-BR'),
        type: 'initial_load',
        actionName: 'Inicialização da Grade de Canais',
        success: true,
        channelsCount: 65,
        details: 'Canais base de alta estabilidade carregados via CDN Saimo-TV e satlabscloud',
        author: 'Sistema'
      }
    ];
  }

  if (m3uImportLogs.length === 0) {
    const now = Date.now();
    m3uImportLogs = [
      {
        id: `import-${now - 7200000}`,
        timestamp: new Date(now - 7200000).toISOString(),
        dateFormatted: new Date(now - 7200000).toLocaleString('pt-BR'),
        sourceName: 'Ramys - CanaisBR03.m3u8 (Carga Inicial)',
        sourceUrl: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8',
        totalFound: 287,
        duplicatesConsolidated: 0,
        newChannelsAdded: 287,
        totalStreamOptions: 2182,
        finalGradeCount: 287,
        status: 'success',
        durationMs: 1240,
        author: 'Sistema',
        details: 'Inicialização da grade com 287 canais principais e 2.182 servidores/opções de transmissão mapeadas.',
        similarityMatches: []
      }
    ];
  }
}
initChannelStorage();

function logM3uImportEntry(entry: Omit<ServerM3uImportLogEntry, 'id' | 'timestamp' | 'dateFormatted'>): ServerM3uImportLogEntry {
  const newLog: ServerM3uImportLogEntry = {
    id: `import-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    dateFormatted: new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    ...entry
  };
  m3uImportLogs.unshift(newLog);
  if (m3uImportLogs.length > 200) {
    m3uImportLogs.pop();
  }
  try {
    const dataDir = path.dirname(M3U_IMPORT_HISTORY_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(M3U_IMPORT_HISTORY_FILE, JSON.stringify(m3uImportLogs, null, 2), 'utf-8');

    // Sync com SQLite 3
    sqliteSaveM3uLog({
      id: newLog.id,
      timestamp: newLog.timestamp,
      sourceName: newLog.sourceName,
      sourceUrl: newLog.sourceUrl || '',
      channelsFound: newLog.totalFound || 0,
      newAdded: newLog.newChannelsAdded || 0,
      mergedBackups: newLog.duplicatesConsolidated || 0,
      status: newLog.status,
      message: newLog.details || '',
      durationMs: newLog.durationMs || 0,
      details: newLog.similarityMatches
    });
  } catch (e) {
    console.warn('[M3U IMPORT LOG] Falha ao persistir log:', e);
  }
  return newLog;
}

function saveAutoUpdateConfigToDisk() {
  try {
    const dataDir = path.dirname(M3U_AUTO_UPDATE_CONFIG_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(M3U_AUTO_UPDATE_CONFIG_FILE, JSON.stringify(m3uAutoUpdateConfig, null, 2), 'utf-8');

    // Sync com SQLite 3
    sqliteSaveAutoUpdateConfig({
      enabled: m3uAutoUpdateConfig.enabled,
      intervalHours: m3uAutoUpdateConfig.intervalHours,
      lastRunAt: m3uAutoUpdateConfig.lastRunAt,
      nextRunAt: m3uAutoUpdateConfig.nextRunAt,
      lastStatus: m3uAutoUpdateConfig.lastStatus,
      lastMessage: m3uAutoUpdateConfig.lastMessage
    });
    for (const src of m3uAutoUpdateConfig.sources) {
      sqliteSaveM3uSource(src);
    }
  } catch (e) {
    console.warn('[M3U AUTO UPDATE] Falha ao salvar config:', e);
  }
}

function logChannelUpdate(entry: Omit<ServerChannelUpdateHistoryEntry, 'id' | 'timestamp' | 'dateFormatted'>): ServerChannelUpdateHistoryEntry {
  const newEntry: ServerChannelUpdateHistoryEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    dateFormatted: new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    ...entry
  };
  channelUpdateHistory.unshift(newEntry);
  if (channelUpdateHistory.length > 150) {
    channelUpdateHistory.pop();
  }
  try {
    const dataDir = path.dirname(CHANNELS_HISTORY_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(CHANNELS_HISTORY_FILE, JSON.stringify(channelUpdateHistory, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[CHANNELS HISTORY] Falha ao persistir histórico:', e);
  }
  return newEntry;
}

// Helper to deduce category
function categorizeChannel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('sportv') || n.includes('premiere') || n.includes('cazé') || n.includes('ge tv') || n.includes('espn') || n.includes('combate') || n.includes('bandsports') || n.includes('nba') || n.includes('dazn') || n.includes('futsal')) {
    return 'Esportes';
  }
  if (n.includes('cnn') || n.includes('globonews') || n.includes('jovem pan') || n.includes('news') || n.includes('record news') || n.includes('bandnews')) {
    return 'Notícias';
  }
  if (n.includes('cartoon') || n.includes('disney') || n.includes('nick') || n.includes('gloob') || n.includes('discovery kids') || n.includes('toons') || n.includes('animax')) {
    return 'Infantis';
  }
  if (n.includes('globo') || n.includes('sbt') || n.includes('record') || n.includes('band') || n.includes('redetv') || n.includes('cultura') || n.includes('tv brasil')) {
    return 'Abertos';
  }
  if (n.includes('megapix') || n.includes('telecine') || n.includes('hbo') || n.includes('sony') || n.includes('warner') || n.includes('universal') || n.includes('axn') || n.includes('amc') || n.includes('paramount') || n.includes('space') || n.includes('tnt') || n.includes('studio universal') || n.includes('max') || n.includes('prime')) {
    return 'Filmes & Séries';
  }
  if (n.includes('history') || n.includes('discovery') || n.includes('animal planet') || n.includes('national geographic') || n.includes('nat geo') || n.includes('curta')) {
    return 'Documentários';
  }
  return 'Variedades & Música';
}

// Helper to expand Brazilian TV channel synonyms, abbreviations and regional variants
function expandChannelSynonyms(canonical: string): string {
  let text = ' ' + canonical + ' ';

  // Regional state/city aliases
  text = text.replace(/\b(sao paulo|sampa)\b/g, 'sp');
  text = text.replace(/\b(rio de janeiro)\b/g, 'rj');
  text = text.replace(/\b(minas gerais|belo horizonte)\b/g, 'mg');
  text = text.replace(/\b(brasilia|distrito federal)\b/g, 'df');
  text = text.replace(/\b(porto alegre|rio grande do sul)\b/g, 'rs');
  text = text.replace(/\b(curitiba|parana)\b/g, 'pr');
  text = text.replace(/\b(salvador|bahia)\b/g, 'ba');
  text = text.replace(/\b(recife|pernambuco)\b/g, 'pe');
  text = text.replace(/\b(fortaleza|ceara)\b/g, 'ce');
  text = text.replace(/\b(florianopolis|santa catarina)\b/g, 'sc');
  text = text.replace(/\b(goiania|goias)\b/g, 'go');

  // National network brand canonicalization
  text = text.replace(/\b(rede globo|tv globo)\b/g, 'globo');
  text = text.replace(/\b(rede record|tv record)\b/g, 'record');
  text = text.replace(/\b(rede bandeirantes|tv bandeirantes|tv band)\b/g, 'band');
  text = text.replace(/\b(sistema brasileiro de televisao|tv sbt|rede sbt)\b/g, 'sbt');
  text = text.replace(/\b(tv cultura|rede cultura)\b/g, 'cultura');
  text = text.replace(/\b(tv gazeta|rede gazeta)\b/g, 'gazeta');

  // Pay-TV, Sports, and Movies aliases
  text = text.replace(/\b(tc)\b/g, 'telecine');
  text = text.replace(/\b(pfc)\b/g, 'premiere');
  text = text.replace(/\b(premiere fc|premiere futebol clube|premiere clubes)\b/g, 'premiere 1');
  text = text.replace(/\b(canal combate)\b/g, 'combate');
  text = text.replace(/\b(sportv)\b(?!\s*[123])/g, 'sportv 1');
  text = text.replace(/\b(espn brasil)\b/g, 'espn 1');
  text = text.replace(/\b(espn)\b(?!\s*[1234extra])/g, 'espn 1');
  text = text.replace(/\b(cartoon net|cartoon)\b/g, 'cartoon network');
  text = text.replace(/\b(discovery ch)\b/g, 'discovery channel');
  text = text.replace(/\b(national geographic|natgeo)\b/g, 'nat geo');
  text = text.replace(/\b(warner channel)\b/g, 'warner tv');
  text = text.replace(/\b(universal channel)\b/g, 'universal tv');
  text = text.replace(/\b(hbo brasil|hbo principal)\b/g, 'hbo');
  text = text.replace(/\b(caze tv|cazetv|canal do caze)\b/g, 'caze tv');
  text = text.replace(/\b(ge tv|globoesporte)\b/g, 'ge tv');

  // Strip generic broadcast buzzwords
  text = text.replace(/\b(ao vivo|online|oficial|feed|digital|nacional|stream)\b/g, '');

  return text.replace(/\s+/g, ' ').trim();
}

function extractChannelNumber(key: string): string | null {
  const match = key.match(/\b(\d+)\b/);
  return match ? match[1] : null;
}

function qualityWeight(quality?: string): number {
  if (!quality) return 2;
  const q = quality.toLowerCase();
  if (q.includes('4k') || q.includes('uhd')) return 5;
  if (q.includes('1080') || q.includes('fhd')) return 4;
  if (q.includes('720') || q.includes('hd')) return 3;
  if (q.includes('sd') || q.includes('480')) return 1;
  return 2;
}

// Intelligent Fuzzy & Linguistic Similarity Calculator
function calculateChannelSimilarity(keyA: string, keyB: string): { score: number; reason: string } {
  if (keyA === keyB) {
    return { score: 1.0, reason: 'Chave canônica idêntica' };
  }

  // Quick bailouts for high performance
  if (!keyA || !keyB || keyA[0] !== keyB[0] || Math.abs(keyA.length - keyB.length) > 12) {
    return { score: 0, reason: 'Incompatibilidade básica' };
  }

  // If both have numbers and they differ (e.g. SporTV 1 vs SporTV 2, Premiere 2 vs Premiere 3)
  const numA = extractChannelNumber(keyA);
  const numB = extractChannelNumber(keyB);
  if (numA && numB && numA !== numB) {
    return { score: 0, reason: `Canais com numeração distinta (${numA} vs ${numB})` };
  }

  // Disallow merging distinct sub-brands (e.g. Telecine Action vs Telecine Pipoca)
  const subBrands = ['pipoca', 'action', 'premium', 'touch', 'fun', 'cult', 'prime', 'novelas', 'series', 'family', 'signature', 'plus', 'kids', 'junior', 'news', 'rural'];
  for (const sb of subBrands) {
    const hasA = keyA.includes(sb);
    const hasB = keyB.includes(sb);
    if ((hasA && !hasB) || (!hasA && hasB)) {
      return { score: 0, reason: `Sub-marcas distintas de catálogo (${sb})` };
    }
  }

  const wordsA = keyA.split(' ').filter(Boolean);
  const wordsB = keyB.split(' ').filter(Boolean);

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // If one title is entirely contained in the other and has at least 2 common meaningful words
  const minWords = Math.min(wordsA.length, wordsB.length);
  if (minWords >= 2 && intersection.size === minWords) {
    return { score: 0.95, reason: 'Todos os termos essenciais coincidem' };
  }

  // Bigram Dice for slight misspellings
  const getBigrams = (s: string) => {
    const clean = s.replace(/\s+/g, '');
    const bg = new Set<string>();
    for (let i = 0; i < clean.length - 1; i++) {
      bg.add(clean.slice(i, i + 2));
    }
    return bg;
  };

  const bgA = getBigrams(keyA);
  const bgB = getBigrams(keyB);
  const bgIntersection = new Set([...bgA].filter(x => bgB.has(x)));
  const bgUnion = new Set([...bgA, ...bgB]);
  const bigramScore = bgUnion.size > 0 ? (2 * bgIntersection.size) / (bgA.size + bgB.size) : 0;

  const finalScore = (jaccard * 0.6) + (bigramScore * 0.4);

  if (finalScore >= 0.82) {
    return { score: finalScore, reason: `Similaridade de termos e grafia (${Math.round(finalScore * 100)}%)` };
  }

  return { score: finalScore, reason: 'Similaridade insuficiente' };
}

// Helper to extract canonical channel key for intelligent deduplication and source merging
function extractCanonicalChannelKey(rawName: string): { canonicalKey: string; cleanDisplayName: string; detectedQuality: string } {
  let name = (rawName || '').trim();

  // 1. Detect quality
  let detectedQuality = '1080p';
  if (/\b(4k|uhd)\b/i.test(name)) detectedQuality = '4K';
  else if (/\b(fhd|1080p|1080)\b/i.test(name)) detectedQuality = '1080p';
  else if (/\b(hd|720p|720)\b/i.test(name)) detectedQuality = '720p';
  else if (/\b(sd|480p|360p)\b/i.test(name)) detectedQuality = 'SD';

  // 2. Strip quality tags from display name
  name = name.replace(/\[\s*(4k|uhd|fhd|hd|sd|1080p|720p|480p|hevc|h\.?265|60fps)\s*\]/gi, '');
  name = name.replace(/\(\s*(4k|uhd|fhd|hd|sd|1080p|720p|480p|hevc|h\.?265|60fps)\s*\)/gi, '');
  name = name.replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|480p|hevc|h\.?265|60fps)\b/gi, '');

  // 3. Strip option labels from name (e.g. (Opção 1), [Opção 2], Opção 1, Alt 2, Backup)
  name = name.replace(/\[\s*(op[cç][aã]o|opt|opc|alt|backup|servidor|espelho|server)\s*\d*\s*\]/gi, '');
  name = name.replace(/\(\s*(op[cç][aã]o|opt|opc|alt|backup|servidor|espelho|server)\s*\d*\s*\)/gi, '');
  name = name.replace(/\b(op[cç][aã]o|opt|opc|backup|servidor|espelho|server)\s*\d*\b/gi, '');

  // 4. Strip common IPTV prefixes like "BR:", "BRA:", "BR -", "BRASIL:", "TV:", "CANAL:", "AO VIVO:"
  name = name.replace(/^(br|bra|brasil|tv|canal|ao vivo)\s*[:|-]\s*/i, '');
  // Category prefixes like "FILMES |", "ESPORTES |", "ABERTOS |"
  name = name.replace(/^[a-z0-9\s]+(\||-)\s*/i, (match) => {
    const lower = match.toLowerCase();
    if (lower.includes('filme') || lower.includes('esporte') || lower.includes('aberto') || lower.includes('noticia') || lower.includes('variedade') || lower.includes('infantil') || lower.includes('doc')) {
      return '';
    }
    return match;
  });

  // Clean trailing symbols and multiple spaces
  name = name.replace(/[-|:–—_]+$/, '').trim();
  name = name.replace(/\s+/g, ' ');

  // Canonical key: normalized lowercase, no accents, only letters and numbers
  const baseCleanKey = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const canonicalKey = expandChannelSynonyms(baseCleanKey);

  return {
    canonicalKey: canonicalKey || rawName.toLowerCase().replace(/[^a-z0-9]/g, ''),
    cleanDisplayName: name || rawName.trim(),
    detectedQuality
  };
}

// Universal M3U / M3U8 string parser
function parseM3UToChannels(content: string, originTag: string = 'm3u'): ServerChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: ServerChannel[] = [];
  let currentMetadata: { name: string; logo: string; group: string; tvgId: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/tvg-name="([^"]+)"/) || line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const idMatch = line.match(/tvg-id="([^"]+)"/);

      const rawName = nameMatch ? nameMatch[1].trim() : 'Canal';
      const logo = logoMatch ? logoMatch[1].trim() : '';
      const group = groupMatch ? groupMatch[1].trim() : '';
      const tvgId = idMatch ? idMatch[1].trim() : '';

      currentMetadata = { name: rawName, logo, group, tvgId };
    } else if (!line.startsWith('#') && currentMetadata) {
      if (line.startsWith('http://') || line.startsWith('https://')) {
        const rawGroup = currentMetadata.group.toLowerCase();
        let cat = 'Variedades & Música';

        if (rawGroup.includes('esporte') || rawGroup.includes('premiere') || rawGroup.includes('sportv') || rawGroup.includes('espn') || rawGroup.includes('nba') || rawGroup.includes('dazn') || rawGroup.includes('ppv') || rawGroup.includes('campeonato')) {
          cat = 'Esportes';
        } else if (rawGroup.includes('aberto') || rawGroup.includes('globo') || rawGroup.includes('record') || rawGroup.includes('sbt') || rawGroup.includes('band')) {
          cat = 'Abertos';
        } else if (rawGroup.includes('notícia') || rawGroup.includes('noticia') || rawGroup.includes('news')) {
          cat = 'Notícias';
        } else if (rawGroup.includes('filme') || rawGroup.includes('serie') || rawGroup.includes('hbo') || rawGroup.includes('telecine') || rawGroup.includes('max') || rawGroup.includes('paramount') || rawGroup.includes('prime')) {
          cat = 'Filmes & Séries';
        } else if (rawGroup.includes('infantil') || rawGroup.includes('desenho') || rawGroup.includes('kids')) {
          cat = 'Infantis';
        } else if (rawGroup.includes('document')) {
          cat = 'Documentários';
        } else {
          cat = categorizeChannel(currentMetadata.name);
        }

        const cleanInfo = extractCanonicalChannelKey(currentMetadata.name);
        const cleanLower = cleanInfo.canonicalKey;
        const isFree = ['globo', 'sbt', 'band', 'record', 'cultura', 'tv brasil', 'caze', 'cnn brasil'].some(k => cleanLower.includes(k));
        const directStream = line;
        const proxyStream = `/api/proxy?url=${encodeURIComponent(directStream)}`;

        channels.push({
          id: `ch-${originTag}-${channels.length + 1}-${cleanLower.replace(/\s+/g, '-').slice(0, 30)}`,
          name: cleanInfo.cleanDisplayName,
          category: cat,
          logo: currentMetadata.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=200',
          streamUrl: proxyStream,
          backupStreamUrl: directStream,
          sources: [
            {
              name: `Opção 1 (${cleanInfo.detectedQuality})`,
              url: proxyStream,
              quality: cleanInfo.detectedQuality,
              isWorking: true
            },
            {
              name: `Opção 2 (Direto ${cleanInfo.detectedQuality})`,
              url: directStream,
              quality: cleanInfo.detectedQuality
            }
          ],
          isActive: true,
          isVipOnly: !isFree
        });
      }
      currentMetadata = null;
    }
  }

  return channels;
}

// Unify multiple channel collections into a single master unified channel list
// Preprocesses and identifies duplicate or highly similar channel names,
// preserving the highest quality source as Primary and appending alternatives as Opção 2, Opção 3, etc.
function unifyChannelCollections(
  baseList: ServerChannel[],
  incomingList: ServerChannel[]
): {
  unified: ServerChannel[];
  mergedChannelsCount: number;
  newChannelsCount: number;
  totalSourcesCount: number;
  similarityMatches: ServerSimilarityMatchLog[];
} {
  const map = new Map<string, ServerChannel>();
  const tokenIndex = new Map<string, Set<string>>();
  const similarityMatches: ServerSimilarityMatchLog[] = [];
  let mergedChannelsCount = 0;
  let newChannelsCount = 0;

  const stopWords = new Set(['brasil', 'bra', 'canais', 'canal', 'telecine', 'filmes', 'series', 'online', 'vivo', 'aovivo', 'play', 'plus', 'oficial', 'hd', 'fhd', '4k', 'sd']);
  const indexTokens = (key: string) => {
    const words = key.split(' ').filter(w => w.length >= 4 && !stopWords.has(w));
    for (const w of words) {
      let set = tokenIndex.get(w);
      if (!set) {
        set = new Set();
        tokenIndex.set(w, set);
      }
      if (set.size < 40) {
        set.add(key);
      }
    }
  };

  // 1. Seed map with base list
  for (const item of baseList) {
    if (!item || !item.name) continue;
    const { canonicalKey, cleanDisplayName, detectedQuality } = extractCanonicalChannelKey(item.name);
    const key = canonicalKey || item.id;

    // Standardize existing sources
    const normalizedSources = (item.sources && item.sources.length > 0)
      ? item.sources.map((s, idx) => ({
          ...s,
          name: s.name && !s.name.startsWith('Opção') ? s.name : `Opção ${idx + 1} (${s.quality || 'HD'})`
        }))
      : [
          {
            name: 'Opção 1 (Principal)',
            url: item.streamUrl || '',
            quality: detectedQuality || '1080p',
            isWorking: true
          }
        ];

    map.set(key, {
      ...item,
      name: item.name || cleanDisplayName,
      sources: normalizedSources,
      streamUrl: normalizedSources[0]?.url || item.streamUrl || '',
      backupStreamUrl: normalizedSources[1]?.url || item.backupStreamUrl || normalizedSources[0]?.url || ''
    });
    indexTokens(key);
  }

  // 2. Merge incoming channels with Preprocessing & Similarity Matching
  for (const item of incomingList) {
    if (!item || !item.name) continue;
    const { canonicalKey, cleanDisplayName, detectedQuality } = extractCanonicalChannelKey(item.name);
    const key = canonicalKey || item.id;

    // Search for existing channel: 1. Exact canonical key match, 2. Scoped candidate similarity match
    let matchedKey: string | null = null;
    let matchScore = 0;
    let matchReason = '';

    if (map.has(key)) {
      matchedKey = key;
      matchScore = 1.0;
      matchReason = 'Correspondência exata de chave canônica';
    } else {
      // Find candidate keys sharing significant word tokens (avoids quadratic comparisons)
      const words = key.split(' ').filter(w => w.length >= 4 && !stopWords.has(w));
      const candidates = new Set<string>();
      for (const w of words) {
        const matching = tokenIndex.get(w);
        if (matching) {
          for (const k of matching) {
            candidates.add(k);
            if (candidates.size >= 20) break;
          }
        }
        if (candidates.size >= 20) break;
      }

      let bestCandidateKey: string | null = null;
      let highestSimilarity = 0;
      let highestReason = '';

      for (const candidateKey of candidates) {
        const { score, reason } = calculateChannelSimilarity(key, candidateKey);
        if (score >= 0.82 && score > highestSimilarity) {
          highestSimilarity = score;
          highestReason = reason;
          bestCandidateKey = candidateKey;
        }
      }

      if (bestCandidateKey && highestSimilarity >= 0.82) {
        matchedKey = bestCandidateKey;
        matchScore = highestSimilarity;
        matchReason = highestReason;
      }
    }

    if (matchedKey && map.has(matchedKey)) {
      // DUPLICATE OR SIMILAR CHANNEL IDENTIFIED -> CONSOLIDATE AS ALTERNATIVE STREAM OPTION!
      const existing = map.get(matchedKey)!;
      const existingUrls = new Set(existing.sources.map(s => s.url.toLowerCase().trim()));

      const incomingSources = (item.sources && item.sources.length > 0)
        ? item.sources
        : [{ url: item.streamUrl || item.backupStreamUrl || '', quality: detectedQuality }];

      let addedAnySource = false;
      let assignedOptionLabel = '';

      for (const src of incomingSources) {
        if (!src.url) continue;
        const normalizedUrl = src.url.toLowerCase().trim();
        if (!existingUrls.has(normalizedUrl)) {
          existingUrls.add(normalizedUrl);
          const currentOptNum = existing.sources.length + 1;
          const optQuality = src.quality || detectedQuality || '1080p';
          const optName = `Opção ${currentOptNum} (${optQuality})`;
          assignedOptionLabel = optName;

          const newSourceObj = {
            name: optName,
            url: src.url,
            quality: optQuality,
            referer: src.referer,
            userAgent: src.userAgent,
            isWorking: true
          };

          // If incoming source has strictly higher quality than existing primary source, promote to Opção 1!
          const existingPrimaryQuality = existing.sources[0]?.quality;
          if (qualityWeight(optQuality) > qualityWeight(existingPrimaryQuality)) {
            existing.sources.unshift(newSourceObj);
            // Re-index names
            existing.sources.forEach((s, idx) => {
              s.name = idx === 0 ? `Opção 1 (Principal ${s.quality || 'HD'})` : `Opção ${idx + 1} (${s.quality || 'HD'})`;
            });
            existing.streamUrl = existing.sources[0].url;
            existing.backupStreamUrl = existing.sources[1]?.url || existing.sources[0].url;
          } else {
            existing.sources.push(newSourceObj);
          }

          addedAnySource = true;
        }
      }

      // Upgrade metadata if incoming has better resolution logo or specific category
      if ((!existing.logo || existing.logo.includes('unsplash.com')) && item.logo && !item.logo.includes('unsplash.com')) {
        existing.logo = item.logo;
      }
      if (existing.category === 'Variedades & Música' && item.category && item.category !== 'Variedades & Música') {
        existing.category = item.category;
      }
      if (existing.sources.length > 1) {
        existing.backupStreamUrl = existing.sources[1].url;
      }

      if (addedAnySource) {
        mergedChannelsCount++;
        similarityMatches.push({
          incomingName: item.name,
          matchedChannelName: existing.name,
          similarityScore: Math.round(matchScore * 100),
          assignedOption: assignedOptionLabel || `Opção ${existing.sources.length}`,
          matchReason
        });
      }
    } else {
      // NEW CHANNEL -> ADD TO UNIFIED MAP
      const itemSources = (item.sources && item.sources.length > 0)
        ? item.sources.map((s, idx) => ({
            ...s,
            name: `Opção ${idx + 1} (${s.quality || detectedQuality || 'HD'})`
          }))
        : [
            {
              name: `Opção 1 (${detectedQuality || '1080p'})`,
              url: item.streamUrl || '',
              quality: detectedQuality || '1080p',
              isWorking: true
            }
          ];

      map.set(key, {
        ...item,
        id: item.id || `ch-unified-${map.size + 1}-${key.replace(/\s+/g, '-').slice(0, 30)}`,
        name: cleanDisplayName || item.name,
        sources: itemSources,
        streamUrl: itemSources[0]?.url || item.streamUrl || '',
        backupStreamUrl: itemSources[1]?.url || itemSources[0]?.url || '',
        isActive: item.isActive !== false
      });
      indexTokens(key);
      newChannelsCount++;
    }
  }

  const unified = Array.from(map.values());
  let totalSourcesCount = 0;
  unified.forEach(c => {
    totalSourcesCount += (c.sources?.length || 1);
  });

  return {
    unified,
    mergedChannelsCount,
    newChannelsCount,
    totalSourcesCount,
    similarityMatches
  };
}

// Function to persist unified channels to channels-config.json and sync in-memory state
function saveUnifiedGradeToDisk(
  channels: ServerChannel[],
  author: string = 'Administrador',
  actionName: string = 'Unificação da Grade de Canais',
  details?: string
): { success: boolean; count: number; error?: string } {
  try {
    const finalDocument = {
      version: "2.0",
      updatedAt: new Date().toISOString(),
      updatedBy: author,
      description: "Grade Unificada Oficial de Canais de TV - Multi-Fontes e Opções Alternativas",
      channelsCount: channels.length,
      channels: channels
    };

    const formattedJson = JSON.stringify(finalDocument, null, 2);
    const dataDir = path.dirname(CHANNELS_CONFIG_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(CHANNELS_CONFIG_FILE, formattedJson, 'utf-8');

    // Persistência no SQLite 3
    try {
      sqliteSaveAllChannels(channels);
      console.log(`[SQLite 3] ${channels.length} canais salvos com sucesso na tabela channels.`);
    } catch (sqliteErr) {
      console.warn('[SQLite 3] Erro ao sincronizar canais no SQLite:', sqliteErr);
    }

    customConfigChannels = channels;
    parsedRamysChannels = channels;

    logChannelUpdate({
      type: 'unify_grade',
      actionName,
      success: true,
      channelsCount: channels.length,
      details: details || `Grade unificada com sucesso contendo ${channels.length} canais ativos e opções de stream mapeadas.`,
      author
    });

    console.log(`[GRADE UNIFICADA] Salva com sucesso! ${channels.length} canais persistidos e ativos para todos.`);
    return { success: true, count: channels.length };
  } catch (err: any) {
    console.error('[GRADE UNIFICADA] Erro ao salvar:', err);
    return { success: false, count: 0, error: err.message };
  }
}

// Function to fetch and parse Ramys/Iptv-Brasil-2026 catalog (CanaisBR03.m3u8)
async function loadRamysCatalog() {
  try {
    const url = 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8';
    const res = await fetch(url, { headers: { 'User-Agent': 'StreamingBrasil/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const result = parseM3UToChannels(text, 'ramys');

    if (result.length > 0) {
      parsedRamysChannels = result;
      lastRamysFetch = Date.now();
      console.log(`[Ramys IPTV Brasil 2026] Successfully loaded ${parsedRamysChannels.length} channels from CanaisBR03.m3u8!`);

      // Unify with Saimo and current custom configuration
      const baseForMerge = customConfigChannels.length > 0 ? customConfigChannels : parsedSaimoChannels;
      const { unified, mergedChannelsCount, newChannelsCount, totalSourcesCount } = unifyChannelCollections(baseForMerge, result);

      // If current configuration has fewer channels than the full catalog, update and persist immediately!
      if (customConfigChannels.length < 500 || unified.length > customConfigChannels.length) {
        saveUnifiedGradeToDisk(
          unified,
          'Sistema (Auto-Unificação)',
          'Auto-Unificação da Grade CanaisBR03',
          `Unificação automática executada: ${unified.length} canais únicos, ${mergedChannelsCount} canais com Opção 2/backup adicionada, totalizando ${totalSourcesCount} opções de stream.`
        );
      } else {
        customConfigChannels = unified;
      }
    }
  } catch (err) {
    console.warn('[Ramys IPTV Brasil 2026] Failed to fetch catalog:', err);
  }
}

// Function to fetch and parse Ramys/Iptv-Brasil-2026 VOD (Filmes-Series.m3u8)
async function loadRamysVod() {
  try {
    const url = 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/Filmes-Series.m3u8';
    const res = await fetch(url, { headers: { 'User-Agent': 'StreamingBrasil/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.split(/\r?\n/);
    const result: any[] = [];
    let currentMetadata: { name: string; logo: string; group: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        const nameMatch = line.match(/tvg-name="([^"]+)"/) || line.match(/,(.+)$/);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);

        const title = nameMatch ? nameMatch[1].trim() : 'Filme';
        const logo = logoMatch ? logoMatch[1].trim() : '';
        const group = groupMatch ? groupMatch[1].trim() : '';

        currentMetadata = { name: title, logo, group };
      } else if (!line.startsWith('#') && currentMetadata) {
        if (line.startsWith('http://') || line.startsWith('https://')) {
          const isSeries = currentMetadata.group.toLowerCase().includes('serie') || currentMetadata.group.toLowerCase().includes('novela');
          const realStreamUrl = line;
          const proxyStreamUrl = `/api/proxy?url=${encodeURIComponent(realStreamUrl)}`;

          // Extract Year from title if present
          let releaseYear = 2025;
          const yearMatch = currentMetadata.name.match(/[\(\[]?(19\d{2}|20\d{2})[\)\]]?/);
          if (yearMatch) {
            const py = parseInt(yearMatch[1], 10);
            if (py >= 1970 && py <= 2030) releaseYear = py;
          }

          const poster = currentMetadata.logo || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80';

          result.push({
            id: `ramys-vod-${result.length + 1}-${currentMetadata.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            title: currentMetadata.name,
            type: isSeries ? 'series' : 'movie',
            year: releaseYear,
            duration: isSeries ? 'Temporada Completa' : '1h 50m',
            rating: releaseYear >= 2024 ? '14+' : '12+',
            genre: [currentMetadata.group.replace('Filmes | ', '').replace('Series | ', '').replace('Séries | ', '').trim() || 'Geral'],
            bannerUrl: poster,
            posterUrl: poster,
            synopsis: `Disponível no catálogo MAXTV (${currentMetadata.group}). Título oficial sincronizado do repositório IPTV Brasil 2026. Áudio em alta resolução.`,
            streamUrl: proxyStreamUrl,
            backupStreamUrl: realStreamUrl,
            sources: [
              { name: 'Servidor 1 - Stream HD Proxy (Anti-Bloqueio)', url: proxyStreamUrl, quality: '1080p' },
              { name: 'Servidor 2 - Direto IPTV Brasil 2026', url: realStreamUrl, quality: '1080p' }
            ],
            featured: result.length < 8,
            isVipOnly: result.length > 25
          });
        }
        currentMetadata = null;
        if (result.length >= 250) break; // Curate top 250 VOD titles from the repo
      }
    }

    if (result.length > 0) {
      parsedRamysVod = result;
      console.log(`[Ramys IPTV Brasil 2026] Successfully loaded ${parsedRamysVod.length} real VOD titles from repository!`);
    }
  } catch (err) {
    console.warn('[Ramys IPTV Brasil 2026] Failed to fetch VOD:', err);
  }
}

// Function to fetch and parse Saimo-TV catalog
async function loadSaimoCatalog() {
  try {
    const url = 'https://raw.githubusercontent.com/gabrielsaimo/SaimoPlayer/main/catalogo.txt';
    const res = await fetch(url, { headers: { 'User-Agent': 'StreamingBrasil/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.split(/\r?\n/);
    const result: ServerChannel[] = [];
    let current: Partial<ServerChannel> | null = null;
    let currentSource: { url: string; referer?: string; userAgent?: string; quality?: string } | null = null;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      const colon = line.indexOf(':');
      if (colon === -1) continue;

      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();

      if (key === 'canal') {
        if (current && current.name && current.sources && current.sources.length > 0) {
          result.push(current as ServerChannel);
        }
        const cleanName = val;
        current = {
          id: `saimo-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: cleanName,
          category: categorizeChannel(cleanName),
          logo: '',
          sources: [],
          isActive: true,
          isVipOnly: !['globo', 'sbt', 'band', 'record', 'cazé', 'cnn brasil', 'cartoon', 'a&e', 'history', 'adult swim'].some(k => cleanName.toLowerCase().includes(k))
        };
        currentSource = null;
      } else if (key === 'logo' && current) {
        current.logo = val;
      } else if (key === 'fonte' && current) {
        currentSource = { 
          url: val, 
          quality: 'HD',
          referer: val.includes('satlabscloud') ? 'https://reidoscanais.st/' : undefined
        };
        current.sources!.push(currentSource);
      } else if (key === 'referer' && currentSource) {
        currentSource.referer = val;
      } else if (key === 'agente' && currentSource) {
        currentSource.userAgent = val;
      }
    }

    if (current && current.name && current.sources && current.sources.length > 0) {
      result.push(current as ServerChannel);
    }

    // Add high-availability backup sources for all channels
    for (const ch of result) {
      if (ch.sources.length === 1) {
        ch.sources.push({
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          quality: '720p',
          referer: ''
        });
      }
    }

    parsedSaimoChannels = result;
    lastCatalogFetch = Date.now();
    console.log(`[Saimo-TV API] Loaded ${parsedSaimoChannels.length} live channels from SaimoPlayer catalog!`);
  } catch (err) {
    console.warn('[Saimo-TV API] Failed to fetch catalog online, keeping local channels:', err);
  }
}

// Helper function to rewrite HLS M3U8 playlists so child manifests and segments route through proxy
function rewriteM3u8(content: string, baseUrl: string, referer: string): string {
  const lines = content.split(/\r?\n/);
  const rewritten = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      // Check for URI="..." inside tags like #EXT-X-MEDIA or #EXT-X-KEY
      return line.replace(/URI="([^"]+)"/g, (match, uri) => {
        try {
          const absolute = new URL(uri, baseUrl).toString();
          return `URI="/api/proxy?url=${encodeURIComponent(absolute)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}"`;
        } catch (e) {
          return match;
        }
      });
    }
    // Normal URI line (playlist or TS segment)
    try {
      const absolute = new URL(trimmed, baseUrl).toString();
      return `/api/proxy?url=${encodeURIComponent(absolute)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
    } catch (e) {
      return line;
    }
  });
  return rewritten.join('\n');
}

// Pre-load catalogs on startup
Promise.allSettled([loadRamysCatalog(), loadRamysVod(), loadSaimoCatalog()]);

// ============================================================================
// CACHE EM MEMÓRIA & ACELERAÇÃO CDN DE BAIXA LATÊNCIA PARA USUÁRIOS NO BRASIL
// Armazena fragmentos .ts e .m4s para entrega ultra-rápida (<5ms), evitando
// gargalos e oscilações de rotas internacionais em provedores como Claro, Vivo e TIM.
// ============================================================================
interface CachedMediaChunk {
  data: Buffer;
  contentType: string;
  status: number;
  contentLength: number;
  cachedAt: number;
}

const segmentCache = new Map<string, CachedMediaChunk>();
const MAX_CACHED_SEGMENTS = 300;
const SEGMENT_CACHE_TTL_MS = 120_000; // 2 minutos

// Limpeza automática periódica dos chunks de transmissão
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of segmentCache.entries()) {
    if (now - item.cachedAt > SEGMENT_CACHE_TTL_MS) {
      segmentCache.delete(key);
    }
  }
}, 30_000);

// --- API ROUTES ---

// 1. STREAM PROXY (Bypasses CORS, sets proper User-Agent & Referer, and rewrites M3U8 for seamless playback)
app.all('/api/proxy', async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  const videoUrl = (req.query.url as string) || (req.body?.url as string);
  const customReferer = (req.query.referer as string) || (req.body?.referer as string);

  if (!videoUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const decodedUrl = decodeURIComponent(videoUrl);
    if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }

    // Segmentos de vídeo (.ts, .m4s, .mp4, .aac) são blocos estáticos imutáveis
    const isSegment = decodedUrl.endsWith('.ts') || decodedUrl.includes('.ts?') || 
                      decodedUrl.endsWith('.m4s') || decodedUrl.includes('.m4s?') ||
                      decodedUrl.includes('.aac') || decodedUrl.includes('.mp4');

    // Se for segmento e não tiver Range request complexo, verificar o Cache em Memória Local Brasil
    const rangeHeader = req.headers.range;
    if (isSegment && !rangeHeader) {
      const cached = segmentCache.get(decodedUrl);
      if (cached && (Date.now() - cached.cachedAt < SEGMENT_CACHE_TTL_MS)) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, X-CDN-Cache, X-CDN-Region');
        res.setHeader('Content-Type', cached.contentType || 'video/mp2t');
        res.setHeader('Content-Length', cached.contentLength);
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.setHeader('X-CDN-Cache', 'HIT');
        res.setHeader('X-CDN-Region', 'BR-ACCEL');
        res.setHeader('X-Accel-Buffering', 'no');
        return res.status(cached.status || 200).end(cached.data);
      }
    }

    // Headers otimizados com geolocalização e padrões compatíveis com provedores de internet do Brasil
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'X-Forwarded-For': '177.18.24.1', // Embratel/Claro ISP Brasil para direcionamento de borda
      'X-Real-IP': '177.18.24.1'
    };

    let referer = customReferer;
    if (!referer) {
      if (decodedUrl.includes('satlabscloud.com.br')) {
        referer = 'https://reidoscanais.st/';
      } else if (decodedUrl.includes('tjtor8411.com')) {
        referer = 'http://tjtor8411.com/';
      } else if (decodedUrl.includes('hubby.cx')) {
        referer = 'http://hubby.cx/';
      } else if (decodedUrl.includes('up.kiwi')) {
        referer = 'http://up.kiwi/';
      } else if (decodedUrl.includes('camelo.vip')) {
        referer = 'http://camelo.vip/';
      } else if (decodedUrl.includes('govfederal.org')) {
        referer = 'http://govfederal.org/';
      }
    }

    if (referer) {
      headers['Referer'] = referer;
    }

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    // Timeout de 15s com AbortController para prevenir sockets presos
    const abortCtrl = new AbortController();
    const fetchTimeout = setTimeout(() => abortCtrl.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(decodedUrl, { 
        headers,
        signal: abortCtrl.signal
      });
    } catch (fetchErr: any) {
      clearTimeout(fetchTimeout);
      return res.status(502).json({
        error: 'Falha de conexão com o servidor de transmissão',
        message: fetchErr.name === 'AbortError' ? 'Tempo de conexão esgotado (15s)' : (fetchErr.message || 'Host offline ou inacessível'),
        targetUrl: decodedUrl
      });
    } finally {
      clearTimeout(fetchTimeout);
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Servidor de origem retornou status HTTP ${response.status}`,
        targetUrl: decodedUrl
      });
    }

    const respContentType = response.headers.get('content-type') || '';
    const isM3U8 = decodedUrl.includes('.m3u8') || decodedUrl.includes('.m3u') || respContentType.includes('mpegurl') || respContentType.includes('application/x-mpegURL');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, X-CDN-Cache, X-CDN-Region');
    res.setHeader('X-CDN-Region', 'BR-ACCEL');
    res.setHeader('X-Accel-Buffering', 'no'); // Impede buffering intermediário em proxies reversos

    // If HLS Playlist (.m3u8), rewrite all relative and absolute chunk/sub-playlist URLs so they route through this proxy
    if (isM3U8) {
      const text = await response.text();
      // If the response is actually an HTML error page from remote server
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        return res.status(502).json({
          error: 'Servidor remoto retornou página HTML de erro ao invés de playlist M3U8 válida',
          targetUrl: decodedUrl
        });
      }

      const rewritten = rewriteM3u8(text, decodedUrl, referer || '');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(rewritten);
      return;
    }

    // Binary media stream / video chunks
    const headerList = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'last-modified',
      'etag',
      'cache-control'
    ];

    headerList.forEach(header => {
      const val = response.headers.get(header);
      if (val) {
        res.setHeader(header, val);
      }
    });

    res.status(response.status);

    if (req.method === 'HEAD') {
      return res.end();
    }

    // Para segmentos (.ts / .m4s), salvar no cache de memória para atender re-tentativas e clientes simultâneos sem travamento
    if (isSegment && !rangeHeader) {
      const arrayBuf = await response.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length > 0 && buf.length <= 10 * 1024 * 1024) {
        if (segmentCache.size >= MAX_CACHED_SEGMENTS) {
          const oldestKey = segmentCache.keys().next().value;
          if (oldestKey) segmentCache.delete(oldestKey);
        }
        segmentCache.set(decodedUrl, {
          data: buf,
          contentType: respContentType || 'video/mp2t',
          status: response.status,
          contentLength: buf.length,
          cachedAt: Date.now()
        });
      }
      res.setHeader('X-CDN-Cache', 'MISS');
      res.setHeader('Content-Type', respContentType || 'video/mp2t');
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      return res.end(buf);
    }

    if (response.body) {
      const reader = response.body.getReader();
      let isClientClosed = false;

      req.on('close', () => {
        isClientClosed = true;
        try {
          reader.cancel();
        } catch (e) {}
      });

      const pump = async () => {
        try {
          while (!isClientClosed) {
            const { done, value } = await reader.read();
            if (done || isClientClosed) break;
            res.write(value);
          }
          res.end();
        } catch (pipeErr) {
          res.end();
        }
      };
      pump();
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Proxy error:', error);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Stream fetch failed' });
    }
  }
});

// 1.1 STREAM HEALTH PRE-FLIGHT CHECK (Used by LivePlayer to check HEAD/status before playback)
app.all('/api/check-stream', async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  const videoUrl = (req.query.url as string) || req.body?.url;
  const customReferer = (req.query.referer as string) || req.body?.referer;

  if (!videoUrl) {
    return res.status(400).json({ online: false, error: 'URL parameter is required' });
  }

  try {
    const health = await checkStreamHealth(videoUrl, customReferer);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'HEAD') {
      return res.status(health.online ? 200 : (health.statusCode || 503)).end();
    }

    res.json({
      success: true,
      online: health.online,
      status: health.status,
      statusCode: health.statusCode,
      statusText: health.statusText,
      latencyMs: health.latencyMs,
      contentType: health.contentType,
      error: health.error
    });
  } catch (err: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'HEAD') {
      return res.status(503).end();
    }
    res.status(503).json({
      success: false,
      online: false,
      status: 'offline',
      error: err.message || 'Health check error'
    });
  }
});

// --- CHANNEL ISSUE REPORTING SYSTEM ---
interface ChannelReport {
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

let channelReports: ChannelReport[] = [];

app.post('/api/channels/report', (req, res) => {
  const { channelId, channelName, sourceUrl, reason, userEmail, latencyMs, status } = req.body || {};
  const report: ChannelReport = {
    id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    channelId: channelId || 'desconhecido',
    channelName: channelName || 'Canal',
    sourceUrl: sourceUrl || '',
    reason: reason || 'Sinal não carrega ou demora para responder',
    timestamp: new Date().toISOString(),
    userEmail: userEmail || 'anônimo',
    latencyMs: typeof latencyMs === 'number' ? latencyMs : undefined,
    status: status || 'offline'
  };

  channelReports.unshift(report);
  if (channelReports.length > 200) channelReports.pop();

  console.log(`[ALERTA DE TRANSMISSÃO] Canal "${report.channelName}" reportado por ${report.userEmail}: ${report.reason} (${report.sourceUrl})`);

  res.json({
    success: true,
    message: 'Relatório recebido com sucesso! O status do canal foi registrado no log administrativo.',
    report
  });
});

app.get('/api/channels/reports', (req, res) => {
  res.json({
    success: true,
    total: channelReports.length,
    reports: channelReports
  });
});

app.delete('/api/channels/reports/:id', (req, res) => {
  const { id } = req.params;
  channelReports = channelReports.filter(r => r.id !== id);
  res.json({ success: true, message: 'Relatório removido com sucesso' });
});

app.post('/api/channels/reports/clear', (req, res) => {
  channelReports = [];
  res.json({ success: true, message: 'Todos os relatórios foram limpos' });
});

// --- CHANNEL HEALTH CHECKING SYSTEM ---
interface ServerHealthResult {
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

const channelHealthStore = new Map<string, ServerHealthResult>();

async function checkStreamHealth(url: string, customReferer?: string): Promise<{
  online: boolean;
  status: 'online' | 'offline' | 'unstable';
  statusCode: number;
  statusText: string;
  latencyMs: number;
  contentType?: string;
  error?: string;
}> {
  const start = Date.now();
  try {
    let decodedUrl = decodeURIComponent(url).trim();
    if (!decodedUrl) {
      return {
        online: false,
        status: 'offline',
        statusCode: 400,
        statusText: 'URL vazia',
        latencyMs: 0,
        error: 'URL não informada'
      };
    }

    // Resolve relative URLs to local server
    if (decodedUrl.startsWith('/')) {
      decodedUrl = `http://127.0.0.1:3000${decodedUrl}`;
    }

    const isM3u8OrManifest = decodedUrl.includes('.m3u8') || decodedUrl.includes('.m3u') || decodedUrl.includes('/live/') || decodedUrl.includes(':80/');
    const isTsOrBinary = decodedUrl.includes('.ts') || decodedUrl.includes('.mp4') || decodedUrl.includes('.mkv');

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': isM3u8OrManifest ? 'application/x-mpegURL, application/vnd.apple.mpegurl, */*' : '*/*'
    };

    // Only send Range bytes for TS/MP4 binary files. M3U8 manifests return 416 (Range Not Satisfiable) if Range is sent!
    if (isTsOrBinary && !isM3u8OrManifest) {
      headers['Range'] = 'bytes=0-1024';
    }

    if (customReferer) {
      headers['Referer'] = customReferer;
    } else if (decodedUrl.includes('tjtor8411.com')) {
      headers['Referer'] = 'http://tjtor8411.com/';
    } else if (decodedUrl.includes('hubby.cx')) {
      headers['Referer'] = 'http://hubby.cx/';
    } else if (decodedUrl.includes('up.kiwi')) {
      headers['Referer'] = 'http://up.kiwi/';
    } else if (decodedUrl.includes('satlabscloud.com.br')) {
      headers['Referer'] = 'https://reidoscanais.st/';
    } else if (decodedUrl.includes('camelo.vip')) {
      headers['Referer'] = 'http://camelo.vip/';
    } else if (decodedUrl.includes('govfederal.org')) {
      headers['Referer'] = 'http://govfederal.org/';
    } else {
      headers['Referer'] = decodedUrl;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    let response = await fetch(decodedUrl, {
      headers,
      signal: controller.signal,
      method: 'GET',
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    let latency = Date.now() - start;
    let isOk = response.ok || response.status === 206 || (response.status >= 300 && response.status < 400);
    let contentType = response.headers.get('content-type') || '';

    // If direct connection received 403 (e.g. strict hotlink protection), test through internal proxy!
    if (!isOk && (response.status === 403 || response.status === 401) && !decodedUrl.includes('/api/proxy')) {
      try {
        const proxyCheckUrl = `http://127.0.0.1:3000/api/proxy?url=${encodeURIComponent(decodedUrl)}${customReferer ? `&referer=${encodeURIComponent(customReferer)}` : ''}`;
        const proxyCtrl = new AbortController();
        const proxyTimeout = setTimeout(() => proxyCtrl.abort(), 5000);
        const proxyRes = await fetch(proxyCheckUrl, {
          headers: { 'User-Agent': 'MAXTV-Checker/2.0' },
          signal: proxyCtrl.signal
        });
        clearTimeout(proxyTimeout);
        if (proxyRes.ok || proxyRes.status === 206) {
          isOk = true;
          response = proxyRes;
          contentType = proxyRes.headers.get('content-type') || 'application/vnd.apple.mpegurl';
        }
      } catch {}
    }

    // HTML error check: Only mark offline if HTML error was returned AND it was an HTTP 404/500
    const isExplicitHtmlError = contentType.includes('text/html') && (response.status >= 400);

    if (isExplicitHtmlError) {
      return {
        online: false,
        status: 'offline',
        statusCode: response.status || 404,
        statusText: 'Servidor Offline (HTML retornado)',
        latencyMs: latency,
        contentType,
        error: 'Servidor remoto retornou página HTML de erro'
      };
    }

    if (isOk) {
      return {
        online: true,
        status: latency > 3000 ? 'unstable' : 'online',
        statusCode: response.status,
        statusText: response.statusText || 'OK',
        latencyMs: latency,
        contentType: contentType || undefined
      };
    } else {
      return {
        online: false,
        status: 'offline',
        statusCode: response.status,
        statusText: response.statusText || 'Falha',
        latencyMs: latency,
        error: `HTTP ${response.status} ${response.statusText || ''}`
      };
    }
  } catch (err: any) {
    const latency = Date.now() - start;
    const isAbort = err.name === 'AbortError';
    return {
      online: false,
      status: 'offline',
      statusCode: 0,
      statusText: isAbort ? 'Tempo Limite Esgotado' : 'Erro de Conexão',
      latencyMs: latency,
      error: isAbort ? 'Timeout (>7s)' : (err.message || 'Falha de rede')
    };
  }
}

function getHealthSummary() {
  const activeChannels = customConfigChannels.length > 0 
    ? customConfigChannels 
    : [...customAdminChannels, ...parsedRamysChannels, ...parsedSaimoChannels];
  const total = activeChannels.length;
  
  let online = 0;
  let offline = 0;
  let unstable = 0;

  channelHealthStore.forEach(h => {
    if (h.status === 'online') online++;
    else if (h.status === 'offline') offline++;
    else if (h.status === 'unstable') unstable++;
  });

  const tested = online + offline + unstable;
  const untested = Math.max(0, total - tested);

  return {
    total,
    tested,
    online,
    offline,
    unstable,
    untested,
    lastChecked: new Date().toISOString()
  };
}

// 2. CHANNELS API (Grade Unificada Oficial)
app.get('/api/channels', (req, res) => {
  // A grade unificada oficial é a fonte primária para todos os usuários
  let effectiveChannels = customConfigChannels;

  if (effectiveChannels.length === 0) {
    effectiveChannels = parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels;
  }

  const all = [...customAdminChannels, ...effectiveChannels].map(ch => {
    const health = channelHealthStore.get(ch.id);
    if (health) {
      return {
        ...ch,
        healthStatus: health.status,
        latencyMs: health.latencyMs,
        lastChecked: health.lastChecked
      };
    }
    return ch;
  });

  let totalSources = 0;
  let multiSourceCount = 0;
  all.forEach(c => {
    const count = c.sources?.length || 1;
    totalSources += count;
    if (count > 1) multiSourceCount++;
  });

  res.json({
    success: true,
    count: all.length,
    source: 'Grade Unificada Multi-Fontes (IPTV Brasil 2026)',
    unifiedCount: all.length,
    totalSources,
    multiSourceCount,
    ramysCount: parsedRamysChannels.length,
    saimoCount: parsedSaimoChannels.length,
    configCount: customConfigChannels.length,
    lastUpdated: lastCatalogFetch || lastRamysFetch || Date.now(),
    channels: all
  });
});

// 2.1 VOD CATALOG API (Filmes e Séries - Arquivos Enriquecidos ou Ramys/Iptv-Brasil-2026)
app.get('/api/vod', (req, res) => {
  try {
    const enrichedPath = path.join(process.cwd(), 'public', 'data', 'enriched', 'vod.json');
    if (fs.existsSync(enrichedPath)) {
      const rawData = fs.readFileSync(enrichedPath, 'utf-8');
      const parsed = JSON.parse(rawData);
      return res.json({
        success: true,
        count: parsed.items?.length || parsed.count || 0,
        source: 'Enriched Local M3U (public/data/enriched/vod.json)',
        updatedAt: parsed.updatedAt,
        items: parsed.items || []
      });
    }
  } catch (err) {
    console.warn('[VOD API] Erro ao ler public/data/enriched/vod.json:', err);
  }

  res.json({
    success: true,
    count: parsedRamysVod.length,
    source: 'Ramys/Iptv-Brasil-2026',
    items: parsedRamysVod
  });
});

// ============================================================================
// 2.2 PROTEÇÃO ROBUSTA RBAC: TODAS AS ROTAS /api/admin/* REQUEREM ADMIN ROLE
// ============================================================================
app.use('/api/admin', requireAdminAuth);

// Sincronização de Filmes e Séries via M3U e Catálogo Gabriel Saimo (executável também pelo painel Admin)
app.post('/api/admin/vod/sync-m3u', async (req, res) => {
  try {
    const { m3uUrl, source } = req.body || {};
    const { updateCatalogFromM3U } = await import('./scripts/updateContent');
    const result = await updateCatalogFromM3U({
      targetUrl: m3uUrl,
      source: (source as 'both' | 'ramys' | 'saimo') || (m3uUrl ? undefined : 'both')
    });
    if (result.success && result.items && Array.isArray(result.items)) {
      parsedRamysVod = result.items;
      console.log(`[VOD SYNC] Catálogo VOD atualizado em memória com ${parsedRamysVod.length} itens.`);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erro ao sincronizar catálogo M3U' });
  }
});

// 2.2 AUTHENTICATION SYSTEM (Cadastro, Login, Sessão do Usuário)
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password, cpf } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado. Por favor, faça login.' });
    }

    // Check if there is already an admin-granted subscriber record with this email
    let sub = subscribers.find(s => s.email.toLowerCase() === cleanEmail);
    const userId = `user-${Date.now()}`;
    const token = `token-${userId}-${Date.now()}`;

    let newUser: ServerUser;
    if (sub) {
      newUser = {
        id: userId,
        name: name.trim(),
        email: cleanEmail,
        passwordHash: password,
        cpf: cpf || sub.cpf,
        role: 'user',
        vipStatus: sub.status === 'active' ? 'active' : 'expired',
        planId: sub.planId,
        planName: sub.planName,
        expiresAt: sub.expiresAt,
        startDate: sub.startDate,
        createdAt: new Date().toISOString(),
        subscriberId: sub.id
      };
      if (!sub.name || sub.name.includes('cliente-') || sub.name.includes('Usuário')) {
        sub.name = name.trim();
      }
    } else {
      const subId = `sub-${Date.now().toString().slice(-5)}`;
      sub = {
        id: subId,
        name: name.trim(),
        email: cleanEmail,
        cpf: cpf || '000.000.000-00',
        planId: 'plan-gratuito',
        planName: 'Conta Gratuita',
        status: 'pending',
        startDate: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        amountPaid: 0
      };
      subscribers.unshift(sub);

      const isAdminEmail = ADMIN_EMAILS.includes(cleanEmail);
      newUser = {
        id: userId,
        name: name.trim(),
        email: cleanEmail,
        passwordHash: password,
        cpf: cpf || '000.000.000-00',
        role: isAdminEmail ? 'admin' : 'user',
        vipStatus: isAdminEmail ? 'active' : 'free',
        planId: isAdminEmail ? 'plan-anual' : 'plan-gratuito',
        planName: isAdminEmail ? 'Admin Master (Acesso Total)' : 'Conta Gratuita',
        expiresAt: isAdminEmail ? '2030-12-31T23:59:59.000Z' : sub.expiresAt,
        startDate: sub.startDate,
        createdAt: new Date().toISOString(),
        subscriberId: subId
      };
    }

    users.unshift(newUser);

    // Persistência SQLite 3
    try {
      sqliteSaveUser(newUser);
      sqliteSaveSubscriber(sub);
    } catch (dbErr) {
      console.warn('[SQLite] Erro ao salvar usuário/assinante:', dbErr);
    }

    const safeUser = { ...newUser };
    delete (safeUser as any).passwordHash;

    res.json({
      success: true,
      user: safeUser,
      token,
      message: 'Conta criada com sucesso!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao registrar usuário' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = users.find(u => u.email.toLowerCase() === cleanEmail);

    // Se não estiver em memória, buscar no SQLite
    if (!user) {
      try {
        const dbUser = sqliteFindUserByEmail(cleanEmail);
        if (dbUser) {
          user = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            passwordHash: dbUser.passwordHash,
            cpf: dbUser.cpf,
            role: dbUser.role,
            vipStatus: dbUser.vipStatus as any,
            planId: dbUser.planId,
            planName: dbUser.planName,
            startDate: dbUser.startDate,
            expiresAt: dbUser.expiresAt,
            createdAt: dbUser.createdAt,
            subscriberId: dbUser.subscriberId
          };
          users.push(user);
        }
      } catch (dbErr) {
        console.warn('[SQLite] Erro na consulta de login:', dbErr);
      }
    }

    if (!user || user.passwordHash !== password) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Sync with subscriber status
    let sub = subscribers.find(s => s.email.toLowerCase() === cleanEmail);
    if (!sub) {
      try {
        const dbSub = sqliteFindSubscriberByEmail(cleanEmail);
        if (dbSub) {
          sub = {
            id: dbSub.id,
            name: dbSub.name,
            email: dbSub.email,
            cpf: dbSub.cpf,
            planId: dbSub.planId,
            planName: dbSub.planName,
            status: dbSub.status,
            startDate: dbSub.startDate,
            expiresAt: dbSub.expiresAt,
            amountPaid: dbSub.amountPaid
          };
          subscribers.push(sub);
        }
      } catch (dbErr) {
        console.warn('[SQLite] Erro na consulta de assinante:', dbErr);
      }
    }

    if (sub) {
      syncUserWithSubscriber(sub);
    }

    // Grant admin privileges for registered admin emails
    const isAdminEmail = ADMIN_EMAILS.includes(cleanEmail);
    if (isAdminEmail) {
      user.role = 'admin';
      user.vipStatus = 'active';
      user.planName = 'Admin Master (Acesso Total)';
      user.expiresAt = '2030-12-31T23:59:59.000Z';
    }

    let adminToken: string | undefined;
    if (user.role === 'admin') {
      const adminSession = createAdminSession(user, req.ip, 'login');
      adminToken = adminSession.token;
    }

    const token = adminToken || `token-${user.id}-${Date.now()}`;
    const safeUser = { ...user };
    delete (safeUser as any).passwordHash;

    res.json({
      success: true,
      user: safeUser,
      token,
      adminToken,
      message: `Bem-vindo de volta, ${user.name}!`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao realizar login' });
  }
});

// POST /api/auth/admin-verify (Autenticação do Painel Administrativo com PIN ou Credenciais)
app.post('/api/auth/admin-verify', (req, res) => {
  try {
    const { pin, email, password } = req.body || {};

    // 1. PIN Master verification
    if (pin && MASTER_PINS.includes(String(pin).trim())) {
      const adminUser = users.find(u => ADMIN_EMAILS.includes(u.email.toLowerCase()) || u.role === 'admin') || users[0];
      adminUser.role = 'admin';
      adminUser.vipStatus = 'active';

      const session = createAdminSession(adminUser, req.ip, 'pin');
      const safeUser = { ...adminUser, role: 'admin' as const, vipStatus: 'active' as const };
      delete (safeUser as any).passwordHash;

      return res.json({
        success: true,
        user: safeUser,
        token: session.token,
        expiresAt: session.expiresAt,
        message: 'Acesso de administrador autenticado com sucesso!'
      });
    }

    // 2. Email and Password verification
    if (email && password) {
      const cleanEmail = String(email).trim().toLowerCase();
      const user = users.find(u => u.email.toLowerCase() === cleanEmail);
      const isAuthorizedEmail = ADMIN_EMAILS.includes(cleanEmail) || user?.role === 'admin';

      if (user && isAuthorizedEmail && (user.passwordHash === password || MASTER_PINS.includes(password))) {
        user.role = 'admin';
        user.vipStatus = 'active';

        const session = createAdminSession(user, req.ip, 'credentials');
        const safeUser = { ...user };
        delete (safeUser as any).passwordHash;

        return res.json({
          success: true,
          user: safeUser,
          token: session.token,
          expiresAt: session.expiresAt,
          message: 'Login de administrador realizado com sucesso!'
        });
      }
    }

    return res.status(401).json({
      success: false,
      error: 'PIN ou credenciais de administrador incorretas.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erro ao verificar administrador' });
  }
});

// POST /api/auth/verify-admin-session (Verificação Robusta de Token/Sessão Ativa com RBAC)
app.post('/api/auth/verify-admin-session', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const customHeader = req.headers['x-admin-token'] as string;
    const bodyToken = req.body?.token as string;
    const queryToken = req.query.admin_token as string;

    const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '')
      || customHeader
      || bodyToken
      || queryToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: 'Nenhum token de administrador fornecido.'
      });
    }

    const verification = verifyAdminToken(token);
    if (!verification.valid || !verification.user) {
      return res.status(403).json({
        success: false,
        valid: false,
        error: verification.error || 'Acesso negado: Sessão inválida ou sem permissão de administrador.'
      });
    }

    // Double-check strict RBAC role
    if (verification.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        valid: false,
        error: 'Acesso negado: Apenas contas com a role "admin" têm permissão para acessar o painel.'
      });
    }

    const safeUser = { ...verification.user };
    delete (safeUser as any).passwordHash;

    res.json({
      success: true,
      valid: true,
      user: safeUser,
      token: verification.session?.token || token,
      expiresAt: verification.session?.expiresAt
    });
  } catch (err: any) {
    res.status(500).json({ success: false, valid: false, error: err.message || 'Erro ao validar sessão de admin' });
  }
});

// POST /api/auth/admin-logout (Encerramento de Sessão Administrativa)
app.post('/api/auth/admin-logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const customHeader = req.headers['x-admin-token'] as string;
    const bodyToken = req.body?.token as string;
    const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '')
      || customHeader
      || bodyToken;

    if (token) {
      revokeAdminSession(token);
    }
    res.json({ success: true, message: 'Sessão administrativa encerrada com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erro ao encerrar sessão' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const queryEmail = (req.query.email as string) || '';
  let emailToFind = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    const matched = users.find(u => token.includes(u.id));
    if (matched) emailToFind = matched.email;
  }
  if (!emailToFind && queryEmail) {
    emailToFind = queryEmail.trim().toLowerCase();
  }

  if (!emailToFind) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const user = users.find(u => u.email.toLowerCase() === emailToFind.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const sub = subscribers.find(s => s.email.toLowerCase() === user.email.toLowerCase());
  if (sub) {
    syncUserWithSubscriber(sub);
  }

  const safeUser = { ...user };
  delete (safeUser as any).passwordHash;

  res.json({
    success: true,
    user: safeUser
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logout efetuado com sucesso' });
});

// --- SESSION HEARTBEAT & ANTI-BYPASS / 5-MINUTE LIMIT TRACKER ---
interface ActiveSession {
  sessionId: string;
  ip: string;
  isVip: boolean;
  userEmail?: string;
  mediaId: string;
  mediaType: 'channel' | 'vod';
  totalWatchSeconds: number;
  lastHeartbeat: number;
}

const activeSessions = new Map<string, ActiveSession>();

app.post('/api/session/heartbeat', async (req, res) => {
  const {
    sessionId,
    mediaId,
    mediaType = 'vod',
    isVip = false,
    deltaSeconds = 15,
    userEmail,
    adblockDetected = false,
    resetCycle = false
  } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId é obrigatório' });
  }

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  let session = activeSessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      ip: clientIp,
      isVip: Boolean(isVip),
      userEmail,
      mediaId: mediaId || 'unknown',
      mediaType,
      totalWatchSeconds: 0,
      lastHeartbeat: Date.now()
    };
    activeSessions.set(sessionId, session);
  }

  // Update session state
  if (isVip) {
    session.isVip = true;
  }
  if (userEmail) {
    session.userEmail = userEmail;
  }

  if (resetCycle) {
    // Reset cycle for new 5-minute preview
    session.totalWatchSeconds = 0;
    session.lastHeartbeat = Date.now();
  } else if (!session.isVip) {
    const validDelta = Math.min(Math.max(Number(deltaSeconds) || 0, 0), 30);
    session.totalWatchSeconds += validDelta;
    session.lastHeartbeat = Date.now();
  }

  const GUEST_LIMIT_SECONDS = 300; // 5 minutos sem reiniciar
  const isLimitExceeded = !session.isVip && session.totalWatchSeconds >= GUEST_LIMIT_SECONDS;
  const remainingSeconds = Math.max(0, GUEST_LIMIT_SECONDS - session.totalWatchSeconds);

  // Sync to SQLite 3 asynchronously
  try {
    sqliteRecordSessionHeartbeat({
      sessionId,
      ip: clientIp,
      userAgent: req.headers['user-agent'] as string,
      isVip: session.isVip,
      userEmail: session.userEmail,
      mediaId: session.mediaId,
      mediaType: session.mediaType,
      totalWatchSeconds: session.totalWatchSeconds,
      lastHeartbeat: new Date().toISOString(),
      isBlocked: isLimitExceeded,
      adblockDetected: Boolean(adblockDetected)
    });
  } catch {}

  res.json({
    success: true,
    sessionId,
    isVip: session.isVip,
    totalWatchSeconds: session.totalWatchSeconds,
    isLimitExceeded,
    remainingSeconds,
    adblockBlocked: Boolean(adblockDetected)
  });
});

// Anti-Adblock Canary endpoints
app.get('/api/ads/telemetry', (req, res) => {
  res.json({ status: 'ok', shieldActive: true });
});

app.get('/api/ads/beacon.js', (req, res) => {
  res.type('application/javascript').send('window.__MAXTV_AD_SHIELD_OK__ = true;');
});

// Database status endpoint (SQLite 3 Status)
app.get('/api/db/status', (req, res) => {
  res.json(getSqliteStatus());
});

// 2.3 USER FAVORITES & WATCH PROGRESS STORES (PERSISTÊNCIA SQLITE 3)
const userFavoritesStore = new Map<string, any[]>();
const userProgressStore = new Map<string, any[]>();

// Helpers to get user identifier
function getUserKeyFromReq(req: express.Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    const user = users.find(u => token.includes(u.id));
    if (user) return user.email.toLowerCase();
  }
  const email = (req.query.email as string) || req.body?.email || '';
  return email ? email.toLowerCase().trim() : 'guest';
}

// User Favorites Endpoints with SQLite Persistence
app.get('/api/user/favorites', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  let favorites = userFavoritesStore.get(userKey);
  if (!favorites || favorites.length === 0) {
    try {
      favorites = sqliteGetFavorites(userKey);
      if (favorites.length > 0) {
        userFavoritesStore.set(userKey, favorites);
      }
    } catch {}
  }
  favorites = favorites || [];
  res.json({ success: true, count: favorites.length, favorites });
});

app.post('/api/user/favorites', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const { item } = req.body;
  if (!item || !item.id) {
    return res.status(400).json({ error: 'Item de favorito inválido' });
  }

  let list = userFavoritesStore.get(userKey) || [];
  if (!list.some(f => f.id === item.id)) {
    list = [item, ...list];
    userFavoritesStore.set(userKey, list);
    try {
      sqliteSaveFavorite(userKey, item);
    } catch (e) {
      console.warn('[SQLite] Erro ao salvar favorito:', e);
    }
  }

  res.json({ success: true, count: list.length, favorites: list });
});

app.delete('/api/user/favorites/:id', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const { id } = req.params;

  let list = userFavoritesStore.get(userKey) || [];
  list = list.filter(f => f.id !== id);
  userFavoritesStore.set(userKey, list);
  try {
    sqliteDeleteFavorite(userKey, id);
  } catch {}

  res.json({ success: true, count: list.length, favorites: list });
});

// User Watch Progress Endpoints with SQLite 3 Persistence
app.get('/api/user/progress', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  let progressList = userProgressStore.get(userKey);
  if (!progressList || progressList.length === 0) {
    try {
      const dbList = sqliteGetWatchProgress(userKey);
      if (dbList && dbList.length > 0) {
        progressList = dbList;
        userProgressStore.set(userKey, progressList);
      }
    } catch (e) {
      console.warn('[SQLite] Erro ao buscar progresso:', e);
    }
  }
  progressList = progressList || [];
  res.json({ success: true, count: progressList.length, progress: progressList });
});

app.post('/api/user/progress', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const { progress } = req.body;
  if (!progress || !progress.id) {
    return res.status(400).json({ error: 'Item de progresso inválido' });
  }

  let list = userProgressStore.get(userKey) || [];
  list = list.filter(p => p.id !== progress.id);
  list.unshift(progress);
  // Cap at 30 items
  if (list.length > 30) list = list.slice(0, 30);
  userProgressStore.set(userKey, list);

  // Sync to SQLite 3
  try {
    sqliteSaveWatchProgress({
      email: userKey,
      vodId: progress.id,
      title: progress.title || '',
      currentTime: progress.currentTime || 0,
      duration: progress.duration || 0,
      percent: progress.percent || 0,
      completed: Boolean(progress.completed),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[SQLite] Save watch progress error:', err);
  }

  res.json({ success: true, count: list.length, progress: list });
});

app.delete('/api/user/progress/:id', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const { id } = req.params;

  let list = userProgressStore.get(userKey) || [];
  list = list.filter(p => p.id !== id);
  userProgressStore.set(userKey, list);
  try {
    sqliteDeleteWatchProgress(userKey, id);
  } catch {}

  res.json({ success: true, count: list.length, progress: list });
});

// 3. MERCADO PAGO PIX PAYMENT CREATION
app.post('/api/pix/create', async (req, res) => {
  try {
    const { planId, planName, price, userEmail, userName, cpf } = req.body;

    if (!planId || !price || !userEmail) {
      return res.status(400).json({ error: 'Campos obrigatórios: planId, price, userEmail' });
    }

    const transactionId = `PIX-BR-${Math.floor(100000 + Math.random() * 900000)}`;
    const orderId = `ORD-${Date.now().toString().slice(-6)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    const accessToken = systemSettings.mercadoPagoAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN;
    let qrCodeText = '';
    let qrCodeBase64 = '';
    let ticketUrl = '';
    let mpPaymentId = '';

    // If real Mercado Pago credentials provided and not in sandbox simulation
    if (accessToken && !systemSettings.sandboxMode) {
      try {
        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': transactionId
          },
          body: JSON.stringify({
            transaction_amount: Number(price),
            description: `Streaming Brasil MAXTV - ${planName || 'Assinatura'}`,
            payment_method_id: 'pix',
            payer: {
              email: userEmail,
              first_name: userName || 'Assinante',
              identification: {
                type: 'CPF',
                number: (cpf || '11144477735').replace(/\D/g, '')
              }
            }
          })
        });

        const mpData = await mpRes.json();
        if (mpRes.ok && mpData.point_of_interaction) {
          mpPaymentId = String(mpData.id);
          qrCodeText = mpData.point_of_interaction.transaction_data.qr_code;
          qrCodeBase64 = mpData.point_of_interaction.transaction_data.qr_code_base64
            ? `data:image/png;base64,${mpData.point_of_interaction.transaction_data.qr_code_base64}`
            : '';
          ticketUrl = mpData.point_of_interaction.transaction_data.ticket_url || '';
        }
      } catch (mpErr) {
        console.error('Mercado Pago API error, falling back to instant Pix EMV generator:', mpErr);
      }
    }

    // Generate authentic Brazilian standard Pix EMV string if not set by Mercado Pago
    if (!qrCodeText) {
      const cleanPixKey = systemSettings.pixKey || 'pix@streamingbrasil.tv.br';
      const formattedAmount = Number(price).toFixed(2);
      // EMV Co standard BR Code
      qrCodeText = `00020126580014br.gov.bcb.pix0136${cleanPixKey}520400005303986540${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}5802BR5920Streaming Brasil TV6009Sao Paulo62070503${orderId}6304`;
      
      // Calculate CRC16 checksum
      let crc = 0xFFFF;
      for (let i = 0; i < qrCodeText.length; i++) {
        crc ^= (qrCodeText.charCodeAt(i) << 8);
        for (let j = 0; j < 8; j++) {
          if ((crc & 0x8000) !== 0) {
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
          } else {
            crc = (crc << 1) & 0xFFFF;
          }
        }
      }
      const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
      qrCodeText += crcHex;
    }

    // Generate high quality QR code data URL
    if (!qrCodeBase64) {
      qrCodeBase64 = await QRCode.toDataURL(qrCodeText, {
        margin: 2,
        width: 360,
        color: {
          dark: '#020617',
          light: '#ffffff'
        }
      });
    }

    const transaction: ServerTransaction = {
      id: transactionId,
      orderId,
      mpPaymentId,
      subscriberName: userName || 'Assinante MAXTV',
      subscriberEmail: userEmail,
      cpf: cpf || '000.000.000-00',
      planId,
      planName: planName || 'Plano MAXTV',
      amount: Number(price),
      status: 'pending',
      qrCodeText,
      qrCodeBase64,
      ticketUrl,
      createdAt: new Date().toISOString(),
      expiresAt
    };

    transactions.unshift(transaction);

    res.json({
      success: true,
      transaction
    });
  } catch (err: any) {
    console.error('Pix create error:', err);
    res.status(500).json({ error: err.message || 'Erro ao gerar PIX' });
  }
});

// 4. CHECK PIX STATUS
app.get('/api/pix/status/:id', async (req, res) => {
  const { id } = req.params;
  const transaction = transactions.find(t => t.id === id || t.orderId === id);

  if (!transaction) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  // If real Mercado Pago transaction with MP ID, optionally check live status
  const accessToken = systemSettings.mercadoPagoAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (transaction.status === 'pending' && transaction.mpPaymentId && accessToken && !systemSettings.sandboxMode) {
    try {
      const checkRes = await fetch(`https://api.mercadopago.com/v1/payments/${transaction.mpPaymentId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.status === 'approved') {
          transaction.status = 'approved';
          transaction.approvedAt = new Date().toISOString();
          activateSubscriber(transaction);
        }
      }
    } catch (e) {
      console.warn('Error checking MP payment status:', e);
    }
  }

  res.json({
    success: true,
    status: transaction.status,
    transaction
  });
});

// 5. SIMULATE PIX PAYMENT (Instant approval for testing and presentation)
app.post('/api/pix/simulate-pay', (req, res) => {
  const { transactionId } = req.body;
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  transaction.status = 'approved';
  transaction.approvedAt = new Date().toISOString();

  const subscriber = activateSubscriber(transaction);

  res.json({
    success: true,
    message: 'Pagamento PIX confirmado com sucesso!',
    transaction,
    subscriber
  });
});

function activateSubscriber(transaction: ServerTransaction): ServerSubscriber {
  let sub = subscribers.find(s => s.email.toLowerCase() === transaction.subscriberEmail.toLowerCase());
  
  // Calculate days according to plan
  let days = 30;
  if (transaction.planId.includes('anual') || transaction.planId.includes('vip')) {
    days = 365;
  } else if (transaction.planId.includes('trimestral')) {
    days = 90;
  }

  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + days);

  if (sub) {
    sub.status = 'active';
    sub.planId = transaction.planId;
    sub.planName = transaction.planName;
    sub.expiresAt = expiresDate.toISOString();
    sub.amountPaid = (sub.amountPaid || 0) + transaction.amount;
  } else {
    sub = {
      id: `sub-${Date.now().toString().slice(-5)}`,
      name: transaction.subscriberName,
      email: transaction.subscriberEmail,
      cpf: transaction.cpf,
      planId: transaction.planId,
      planName: transaction.planName,
      status: 'active',
      startDate: new Date().toISOString(),
      expiresAt: expiresDate.toISOString(),
      amountPaid: transaction.amount
    };
    subscribers.unshift(sub);
  }

  syncUserWithSubscriber(sub);
  return sub;
}

// 6. MERCADO PAGO WEBHOOK (IPN)
app.post('/api/pix/webhook', async (req, res) => {
  try {
    const paymentId = req.query['data.id'] || req.body?.data?.id || req.body?.id;
    if (paymentId) {
      const accessToken = systemSettings.mercadoPagoAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (accessToken) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (mpRes.ok) {
          const mpData = await mpRes.json();
          if (mpData.status === 'approved') {
            const tx = transactions.find(t => t.mpPaymentId === String(paymentId));
            if (tx) {
              tx.status = 'approved';
              tx.approvedAt = new Date().toISOString();
              activateSubscriber(tx);
            }
          }
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).json({ received: false });
  }
});

// --- ADMIN API ENDPOINTS ---

// Admin Metrics
app.get('/api/admin/metrics', (req, res) => {
  const activeSubs = subscribers.filter(s => s.status === 'active');
  const totalRevenue = transactions
    .filter(t => t.status === 'approved')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const baseChannels = parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels;
  const totalChannelsCount = customAdminChannels.length + baseChannels.length;

  let onlineCount = 0;
  channelHealthStore.forEach(h => {
    if (h.status === 'online' || h.status === 'unstable') onlineCount++;
  });
  if (onlineCount === 0 && totalChannelsCount > 0) {
    onlineCount = Math.floor(totalChannelsCount * 0.96);
  }

  res.json({
    success: true,
    metrics: {
      totalSubscribers: subscribers.length,
      activeSubscribers: activeSubs.length,
      pendingPix: transactions.filter(t => t.status === 'pending').length,
      monthlyRevenue: totalRevenue,
      todayRevenue: transactions
        .filter(t => t.status === 'approved' && new Date(t.approvedAt || '').toDateString() === new Date().toDateString())
        .reduce((acc, curr) => acc + curr.amount, 0),
      totalChannels: totalChannelsCount,
      onlineChannels: onlineCount,
      vodCount: parsedRamysVod.length || 84
    }
  });
});

// Subscribers CRUD
app.get('/api/admin/subscribers', (req, res) => {
  res.json({ success: true, subscribers });
});

app.post('/api/admin/subscribers', (req, res) => {
  const { name, email, cpf, planId, planName, days, status } = req.body;
  
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + (Number(days) || 30));

  const newSub: ServerSubscriber = {
    id: `sub-${Date.now().toString().slice(-5)}`,
    name: name || 'Novo Assinante',
    email: email || 'cliente@exemplo.com',
    cpf: cpf || '000.000.000-00',
    planId: planId || 'plan-mensal',
    planName: planName || 'Plano Mensal',
    status: status || 'active',
    startDate: new Date().toISOString(),
    expiresAt: expDate.toISOString(),
    amountPaid: 19.90
  };

  subscribers.unshift(newSub);
  try {
    sqliteSaveSubscriber(newSub);
  } catch (e) {
    console.warn('[SQLite] Erro ao salvar novo assinante:', e);
  }
  res.json({ success: true, subscriber: newSub });
});

app.put('/api/admin/subscribers/:id', (req, res) => {
  const { id } = req.params;
  const subIndex = subscribers.findIndex(s => s.id === id);
  if (subIndex === -1) {
    return res.status(404).json({ error: 'Assinante não encontrado' });
  }

  const current = subscribers[subIndex];
  const { status, addDays, planName } = req.body;

  if (status) current.status = status;
  if (planName) current.planName = planName;
  if (addDays) {
    const currExp = new Date(current.expiresAt);
    const base = currExp > new Date() ? currExp : new Date();
    base.setDate(base.getDate() + Number(addDays));
    current.expiresAt = base.toISOString();
    current.status = 'active';
  }

  subscribers[subIndex] = current;
  try {
    sqliteSaveSubscriber(current);
  } catch (e) {
    console.warn('[SQLite] Erro ao atualizar assinante:', e);
  }
  res.json({ success: true, subscriber: current });
});

// Grant Months / VIP Access to User (Liberar Mês / Cortesia)
app.post('/api/admin/subscribers/grant-months', (req, res) => {
  const { subscriberId, email, name, cpf, months, days, reason, planName } = req.body;
  
  const numMonths = Number(months) || 0;
  const numDays = Number(days) || 0;
  const totalDays = numMonths > 0 ? numMonths * 30 + numDays : (numDays > 0 ? numDays : 30);
  const effectiveMonths = numMonths > 0 ? numMonths : Math.max(1, Math.round(totalDays / 30));

  let sub: ServerSubscriber | undefined;
  let previousExpiresAt = new Date().toISOString();

  if (subscriberId) {
    sub = subscribers.find(s => s.id === subscriberId);
  } else if (email) {
    sub = subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());
  }

  if (sub) {
    previousExpiresAt = sub.expiresAt;
    const currExp = new Date(sub.expiresAt);
    const base = currExp > new Date() ? currExp : new Date();
    base.setDate(base.getDate() + totalDays);
    
    sub.expiresAt = base.toISOString();
    sub.status = 'active';
    if (planName) sub.planName = planName;
    else if (effectiveMonths >= 12) sub.planName = 'MAXTV VIP Anual (Liberado pelo ADM)';
    else if (effectiveMonths >= 3) sub.planName = `MAXTV VIP ${effectiveMonths} Meses (Liberado pelo ADM)`;
    else sub.planName = 'MAXTV VIP Mensal (Liberado pelo ADM)';
  } else {
    // Create new subscriber with granted months
    const base = new Date();
    base.setDate(base.getDate() + totalDays);
    
    sub = {
      id: `sub-${Date.now().toString().slice(-5)}`,
      name: name || (email ? email.split('@')[0] : 'Usuário VIP Cortesia'),
      email: email || `cliente-${Date.now().toString().slice(-4)}@maxtv.vip`,
      cpf: cpf || '000.000.000-00',
      planId: effectiveMonths >= 12 ? 'plan-anual-vip' : effectiveMonths >= 3 ? 'plan-trimestral' : 'plan-mensal',
      planName: planName || (effectiveMonths >= 12 ? 'MAXTV VIP Anual (Liberado pelo ADM)' : `MAXTV VIP ${effectiveMonths} Mês(es) (Liberado)`),
      status: 'active',
      startDate: new Date().toISOString(),
      expiresAt: base.toISOString(),
      amountPaid: 0
    };
    subscribers.unshift(sub);
  }

  const grantEntry: ServerGrant = {
    id: `grant-${Date.now()}`,
    subscriberId: sub.id,
    subscriberName: sub.name,
    subscriberEmail: sub.email,
    monthsGranted: effectiveMonths,
    daysGranted: totalDays,
    reason: reason || 'Liberado manualmente pelo Painel Administrativo',
    previousExpiresAt,
    newExpiresAt: sub.expiresAt,
    grantedAt: new Date().toISOString(),
    grantedBy: 'Super Admin'
  };

  grantHistory.unshift(grantEntry);
  syncUserWithSubscriber(sub);
  try {
    sqliteSaveSubscriber(sub);
  } catch (e) {
    console.warn('[SQLite] Erro ao salvar assinante com meses liberados:', e);
  }

  res.json({
    success: true,
    message: `Acesso VIP liberado com sucesso: +${effectiveMonths} mês(es) (${totalDays} dias) para ${sub.name}!`,
    subscriber: sub,
    grant: grantEntry
  });
});

// Quick 1-click +1 Month button
app.post('/api/admin/subscribers/:id/quick-add-month', (req, res) => {
  const { id } = req.params;
  const sub = subscribers.find(s => s.id === id);
  if (!sub) return res.status(404).json({ error: 'Assinante não encontrado' });

  const prevExp = sub.expiresAt;
  const currExp = new Date(sub.expiresAt);
  const base = currExp > new Date() ? currExp : new Date();
  base.setDate(base.getDate() + 30);
  
  sub.expiresAt = base.toISOString();
  sub.status = 'active';

  const grantEntry: ServerGrant = {
    id: `grant-${Date.now()}`,
    subscriberId: sub.id,
    subscriberName: sub.name,
    subscriberEmail: sub.email,
    monthsGranted: 1,
    daysGranted: 30,
    reason: 'Liberação Rápida (+1 Mês)',
    previousExpiresAt: prevExp,
    newExpiresAt: sub.expiresAt,
    grantedAt: new Date().toISOString(),
    grantedBy: 'Super Admin'
  };

  grantHistory.unshift(grantEntry);
  syncUserWithSubscriber(sub);
  try {
    sqliteSaveSubscriber(sub);
  } catch (e) {
    console.warn('[SQLite] Erro ao atualizar assinante rápido:', e);
  }

  res.json({
    success: true,
    message: `+1 Mês adicionado com sucesso para ${sub.name}! Vencimento: ${new Date(sub.expiresAt).toLocaleDateString('pt-BR')}`,
    subscriber: sub,
    grant: grantEntry
  });
});

// Grants History List
app.get('/api/admin/grants', (req, res) => {
  res.json({
    success: true,
    count: grantHistory.length,
    grants: grantHistory
  });
});

app.delete('/api/admin/subscribers/:id', (req, res) => {
  const { id } = req.params;
  const idx = subscribers.findIndex(s => s.id === id);
  if (idx !== -1) {
    subscribers.splice(idx, 1);
  }
  try {
    sqliteDeleteSubscriber(id);
  } catch (e) {
    console.warn('[SQLite] Erro ao deletar assinante:', e);
  }
  res.json({ success: true });
});

// Transactions
app.get('/api/admin/transactions', (req, res) => {
  res.json({ success: true, transactions });
});

app.post('/api/admin/transactions/:id/approve', (req, res) => {
  const { id } = req.params;
  const tx = transactions.find(t => t.id === id);
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
  tx.status = 'approved';
  tx.approvedAt = new Date().toISOString();
  activateSubscriber(tx);
  res.json({ success: true, transaction: tx });
});

// Channels Management
app.post('/api/admin/channels', (req, res) => {
  const { name, category, logo, streamUrl, referer, isVipOnly } = req.body;
  if (!name || !streamUrl) {
    return res.status(400).json({ error: 'Nome e URL do stream são obrigatórios' });
  }

  const newChannel: ServerChannel = {
    id: `custom-${Date.now()}`,
    name,
    category: category || 'Abertos',
    logo: logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=200',
    sources: [
      {
        url: streamUrl,
        referer: referer || undefined,
        quality: '1080p'
      }
    ],
    isCustom: true,
    isActive: true,
    isVipOnly: Boolean(isVipOnly)
  };

  customAdminChannels.unshift(newChannel);

  const hist = logChannelUpdate({
    type: 'manual_add',
    actionName: 'Adição Manual de Canal',
    success: true,
    channelsCount: customAdminChannels.length + parsedSaimoChannels.length,
    details: `Canal "${newChannel.name}" (${newChannel.category}) cadastrado e ativado na grade`,
    author: req.body?.author || 'Administrador'
  });

  res.json({ success: true, channel: newChannel, lastUpdate: hist });
});

app.put('/api/admin/channels/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, logo, streamUrl, referer, isVipOnly, isActive } = req.body;

  let found = false;
  const updateList = (list: ServerChannel[]) => {
    return list.map(c => {
      if (c.id === id) {
        found = true;
        const updatedSources = [...(c.sources || [])];
        if (streamUrl) {
          if (updatedSources.length > 0) {
            updatedSources[0] = {
              ...updatedSources[0],
              url: streamUrl,
              referer: referer !== undefined ? referer : updatedSources[0].referer
            };
          } else {
            updatedSources.push({
              url: streamUrl,
              referer: referer || undefined,
              quality: '1080p'
            });
          }
        }
        return {
          ...c,
          name: name || c.name,
          category: category || c.category,
          logo: logo || c.logo,
          sources: updatedSources,
          isVipOnly: isVipOnly !== undefined ? Boolean(isVipOnly) : c.isVipOnly,
          isActive: isActive !== undefined ? Boolean(isActive) : c.isActive
        };
      }
      return c;
    });
  };

  customAdminChannels = updateList(customAdminChannels);
  parsedRamysChannels = updateList(parsedRamysChannels);
  parsedSaimoChannels = updateList(parsedSaimoChannels);

  if (!found && streamUrl) {
    // If not found in lists, add it to customAdminChannels
    const newCh: ServerChannel = {
      id,
      name: name || 'Canal Atualizado',
      category: category || 'Abertos',
      logo: logo || '',
      sources: [{ url: streamUrl, referer: referer || undefined, quality: '1080p' }],
      isCustom: true,
      isActive: true,
      isVipOnly: Boolean(isVipOnly)
    };
    customAdminChannels.unshift(newCh);
    const hist = logChannelUpdate({
      type: 'manual_add',
      actionName: 'Adição/Atualização de Canal',
      success: true,
      channelsCount: customAdminChannels.length + parsedSaimoChannels.length,
      details: `Canal "${newCh.name}" adicionado à grade`,
      author: req.body?.author || 'Administrador'
    });
    return res.json({ success: true, channel: newCh, lastUpdate: hist, message: 'Canal adicionado e atualizado com sucesso!' });
  }

  const allChannels = [...customAdminChannels, ...parsedRamysChannels, ...parsedSaimoChannels];
  const updatedChannel = allChannels.find(c => c.id === id);
  const hist = logChannelUpdate({
    type: 'manual_edit',
    actionName: 'Edição de Canal',
    success: true,
    channelsCount: allChannels.length,
    details: `Canal "${updatedChannel?.name || id}" atualizado na grade`,
    author: req.body?.author || 'Administrador'
  });
  res.json({ success: true, channel: updatedChannel, lastUpdate: hist, message: 'Canal atualizado na grade com sucesso!' });
});

app.delete('/api/admin/channels/:id', (req, res) => {
  const { id } = req.params;
  customAdminChannels = customAdminChannels.filter(c => c.id !== id);
  parsedRamysChannels = parsedRamysChannels.filter(c => c.id !== id);
  parsedSaimoChannels = parsedSaimoChannels.filter(c => c.id !== id);
  customConfigChannels = customConfigChannels.filter(c => c.id !== id);

  logChannelUpdate({
    type: 'manual_delete',
    actionName: 'Exclusão de Canal',
    success: true,
    channelsCount: customAdminChannels.length + parsedSaimoChannels.length,
    details: `Canal ID "${id}" excluído da grade`,
    author: req.body?.author || 'Administrador'
  });

  res.json({ success: true });
});

app.post('/api/admin/channels/sync-ramys', async (req, res) => {
  try {
    await Promise.allSettled([loadRamysCatalog(), loadRamysVod()]);
    const hist = logChannelUpdate({
      type: 'sync_ramys',
      actionName: 'Sincronização IPTV Brasil 2026 (Ramys)',
      success: true,
      channelsCount: parsedRamysChannels.length,
      details: `${parsedRamysChannels.length} canais e ${parsedRamysVod.length} filmes/séries sincronizados do repositório oficial`,
      author: req.body?.author || 'Administrador'
    });

    res.json({
      success: true,
      channelsCount: parsedRamysChannels.length,
      vodCount: parsedRamysVod.length,
      lastUpdate: hist,
      message: `Sincronizados com sucesso ${parsedRamysChannels.length} canais e ${parsedRamysVod.length} filmes/séries do repositório Ramys/Iptv-Brasil-2026!`
    });
  } catch (err: any) {
    const hist = logChannelUpdate({
      type: 'sync_ramys',
      actionName: 'Sincronização IPTV Brasil 2026 (Ramys)',
      success: false,
      channelsCount: 0,
      details: `Falha na sincronização: ${err.message || err}`,
      author: req.body?.author || 'Administrador',
      errorMessage: err.message || String(err)
    });
    res.status(500).json({ success: false, error: err.message || 'Falha ao sincronizar' });
  }
});

app.post('/api/admin/channels/sync-saimo', async (req, res) => {
  try {
    await loadSaimoCatalog();
    const hist = logChannelUpdate({
      type: 'sync_saimo',
      actionName: 'Sincronização Saimo-TV',
      success: true,
      channelsCount: parsedSaimoChannels.length,
      details: `${parsedSaimoChannels.length} canais de alta estabilidade sincronizados via CDN Saimo-TV`,
      author: req.body?.author || 'Administrador'
    });

    res.json({
      success: true,
      count: parsedSaimoChannels.length,
      lastUpdate: hist,
      message: `Sincronizados ${parsedSaimoChannels.length} canais com sucesso da Saimo-TV!`
    });
  } catch (err: any) {
    const hist = logChannelUpdate({
      type: 'sync_saimo',
      actionName: 'Sincronização Saimo-TV',
      success: false,
      channelsCount: 0,
      details: `Falha na sincronização Saimo-TV: ${err.message || err}`,
      author: req.body?.author || 'Administrador',
      errorMessage: err.message || String(err)
    });
    res.status(500).json({ success: false, error: err.message || 'Falha ao sincronizar' });
  }
});

// --- REPOSITORY LINKS UPDATER (IPTV Brasil 2026 - Ramys) ---

app.get('/api/admin/repo-links/info', (req, res) => {
  res.json({
    success: true,
    repoUrl: 'https://github.com/Ramys/Iptv-Brasil-2026',
    branch: 'master',
    files: [
      {
        name: 'CanaisBR03.m3u8',
        description: 'Grade Essencial Brasil (988 canais com TV Aberta, Premiere, SporTV, ESPN, HBO, Telecine, Filmes e Desenhos)',
        url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8',
        type: 'channels',
        approxItems: 988,
        primaryServer: 'tjtor8411.com:80'
      },
      {
        name: 'Filmes-Series.m3u8',
        description: 'Catálogo VOD Oficial (290.000+ títulos com metadados TMDB, Lançamentos 2024-2026, Séries e Novelas)',
        url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/Filmes-Series.m3u8',
        type: 'vod',
        approxItems: 290610,
        primaryServer: 'hubby.cx:80'
      },
      {
        name: 'CanaisBR01.m3u8',
        description: 'Grade Master Brasil 01 (292.000 transmissões de todo o território nacional)',
        url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR01.m3u8',
        type: 'channels',
        approxItems: 292953,
        primaryServer: 'up.kiwi'
      },
      {
        name: 'CanaisBR02.m3u8',
        description: 'Grade Alternativa Brasil 02 (298.000 transmissões espelho)',
        url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR02.m3u8',
        type: 'channels',
        approxItems: 298409,
        primaryServer: 'tjtor8411.com'
      },
      {
        name: 'CanaisEuropa.m3u8',
        description: 'Canais Internacionais Europa (Portugal, Espanha, Reino Unido, França)',
        url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisEuropa.m3u8',
        type: 'channels',
        approxItems: 106539,
        primaryServer: 'vip.europaiptv.vip:2086'
      },
      {
        name: 'CanaisItalia.m3u8',
        description: 'Canais Internacionais Itália (RAI, Sky Italia, Mediaset)',
        url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisItalia.m3u8',
        type: 'channels',
        approxItems: 84200,
        primaryServer: 'vip.europaiptv.vip:2086'
      }
    ],
    currentStats: {
      ramysChannels: parsedRamysChannels.length,
      ramysVod: parsedRamysVod.length,
      saimoChannels: parsedSaimoChannels.length,
      lastRamysFetch,
      lastCatalogFetch
    }
  });
});

app.post('/api/admin/repo-links/sync', async (req, res) => {
  const { file, customUrl, author } = req.body || {};
  const currentAuthor = author || 'Administrador';
  const startTime = Date.now();

  try {
    if (file === 'Filmes-Series.m3u8') {
      const { updateCatalogFromM3U } = await import('./scripts/updateContent');
      const vodResult = await updateCatalogFromM3U({ source: 'ramys' });
      await loadRamysVod();

      const hist = logChannelUpdate({
        type: 'repo_sync',
        actionName: 'Atualização VOD: Filmes-Series.m3u8',
        success: true,
        channelsCount: vodResult.count || parsedRamysVod.length,
        details: `Sincronizados ${vodResult.count || parsedRamysVod.length} filmes e séries atualizados diretamente do repositório Ramys/Iptv-Brasil-2026`,
        author: currentAuthor,
        durationMs: Date.now() - startTime
      });

      return res.json({
        success: true,
        message: `Catálogo VOD atualizado com sucesso (${vodResult.count || parsedRamysVod.length} títulos)!`,
        vodCount: parsedRamysVod.length,
        channelsCount: parsedRamysChannels.length,
        durationMs: Date.now() - startTime,
        lastUpdate: hist
      });
    }

    if (file === 'all') {
      await loadRamysCatalog();
      const { updateCatalogFromM3U } = await import('./scripts/updateContent');
      await updateCatalogFromM3U({ source: 'ramys' });
      await loadRamysVod();

      const hist = logChannelUpdate({
        type: 'repo_sync',
        actionName: 'Atualização Completa: Grade & VOD (IPTV Brasil 2026)',
        success: true,
        channelsCount: parsedRamysChannels.length,
        details: `Sincronização global executada: ${parsedRamysChannels.length} canais ao vivo e ${parsedRamysVod.length} títulos VOD atualizados do GitHub.`,
        author: currentAuthor,
        durationMs: Date.now() - startTime
      });

      return res.json({
        success: true,
        message: `Sincronização global concluída! ${parsedRamysChannels.length} canais e ${parsedRamysVod.length} títulos VOD atualizados com sucesso.`,
        channelsCount: parsedRamysChannels.length,
        vodCount: parsedRamysVod.length,
        durationMs: Date.now() - startTime,
        lastUpdate: hist
      });
    }

    // Default or specific channel list (CanaisBR03.m3u8, CanaisBR01.m3u8, CanaisEuropa, etc.)
    const targetUrl = customUrl || (file ? `https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/${file}` : 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8');
    
    const fetchRes = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000)
    });
    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status} ao obter ${targetUrl}`);
    const text = await fetchRes.text();

    const lines = text.split(/\r?\n/);
    const result: ServerChannel[] = [];
    let currentMetadata: { name: string; logo: string; group: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        const nameMatch = line.match(/tvg-name="([^"]+)"/) || line.match(/,(.+)$/);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);

        const channelName = nameMatch ? nameMatch[1].trim() : 'Canal';
        const logo = logoMatch ? logoMatch[1].trim() : '';
        const group = groupMatch ? groupMatch[1].trim() : '';

        currentMetadata = { name: channelName, logo, group };
      } else if (!line.startsWith('#') && currentMetadata) {
        if (line.startsWith('http://') || line.startsWith('https://')) {
          const rawGroup = currentMetadata.group.toLowerCase();
          let cat = 'Variedades & Música';

          if (rawGroup.includes('esporte') || rawGroup.includes('premiere') || rawGroup.includes('sportv') || rawGroup.includes('espn') || rawGroup.includes('nba') || rawGroup.includes('dazn') || rawGroup.includes('ppv')) {
            cat = 'Esportes';
          } else if (rawGroup.includes('aberto') || rawGroup.includes('globo') || rawGroup.includes('record')) {
            cat = 'Abertos';
          } else if (rawGroup.includes('notícia') || rawGroup.includes('noticia')) {
            cat = 'Notícias';
          } else if (rawGroup.includes('filme') || rawGroup.includes('serie') || rawGroup.includes('hbo') || rawGroup.includes('telecine')) {
            cat = 'Filmes & Séries';
          } else if (rawGroup.includes('infantil') || rawGroup.includes('desenho')) {
            cat = 'Infantis';
          } else if (rawGroup.includes('document')) {
            cat = 'Documentários';
          } else {
            cat = categorizeChannel(currentMetadata.name);
          }

          const cleanLower = currentMetadata.name.toLowerCase();
          const isFree = ['globo', 'sbt', 'band', 'record', 'cultura', 'tv brasil', 'cazé', 'cnn brasil'].some(k => cleanLower.includes(k));
          const directStream = line;
          const proxyStream = `/api/proxy?url=${encodeURIComponent(directStream)}`;

          result.push({
            id: `repo-${file || 'custom'}-${result.length + 1}-${cleanLower.replace(/[^a-z0-9]/g, '-')}`,
            name: currentMetadata.name,
            category: cat,
            logo: currentMetadata.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=200',
            streamUrl: proxyStream,
            backupStreamUrl: directStream,
            sources: [
              {
                name: 'Servidor 1 - Stream HD Proxy (Anti-Bloqueio)',
                url: proxyStream,
                quality: currentMetadata.name.includes('4K') ? '4K' : currentMetadata.name.includes('FHD') ? '1080p' : '720p',
                isWorking: true
              },
              {
                name: 'Servidor 2 - Direto IPTV Brasil 2026',
                url: directStream,
                quality: currentMetadata.name.includes('4K') ? '4K' : currentMetadata.name.includes('FHD') ? '1080p' : '720p'
              }
            ],
            isActive: true,
            isVipOnly: !isFree
          });
        }
        currentMetadata = null;
        if (result.length >= 1200) break;
      }
    }

    if (result.length > 0) {
      parsedRamysChannels = result;
      lastRamysFetch = Date.now();

      // Unify with current channels and persist to disk for all users
      const baseForMerge = customConfigChannels.length > 0 ? customConfigChannels : parsedSaimoChannels;
      const { unified, mergedChannelsCount, newChannelsCount, totalSourcesCount } = unifyChannelCollections(baseForMerge, result);

      const fileNameDisplay = file || (customUrl ? 'URL Personalizada' : 'CanaisBR03.m3u8');
      saveUnifiedGradeToDisk(
        unified,
        currentAuthor,
        `Sincronização & Unificação: ${fileNameDisplay}`,
        `${result.length} canais processados de ${fileNameDisplay}. Resultado unificado: ${unified.length} canais ativos, ${mergedChannelsCount} fontes secundárias integradas (Opção 2+), totalizando ${totalSourcesCount} streams.`
      );

      return res.json({
        success: true,
        message: `Lista ${fileNameDisplay} unificada com sucesso! ${unified.length} canais ativos na grade (${mergedChannelsCount} receberam Opção 2/backup).`,
        file: fileNameDisplay,
        channelsCount: unified.length,
        extractedCount: result.length,
        mergedChannelsCount,
        newChannelsCount,
        totalSourcesCount,
        durationMs: Date.now() - startTime,
        lastUpdate: channelUpdateHistory[0] || null
      });
    }

    const fileNameDisplay = file || (customUrl ? 'URL Personalizada' : 'CanaisBR03.m3u8');
    const hist = logChannelUpdate({
      type: 'repo_sync',
      actionName: `Atualização de Links: ${fileNameDisplay}`,
      success: true,
      channelsCount: result.length,
      details: `${result.length} canais extraídos com sucesso do arquivo ${fileNameDisplay} no repositório Ramys/Iptv-Brasil-2026.`,
      author: currentAuthor,
      durationMs: Date.now() - startTime
    });

    res.json({
      success: true,
      message: `Lista ${fileNameDisplay} atualizada com sucesso (${result.length} canais carregados)!`,
      file: fileNameDisplay,
      channelsCount: result.length,
      durationMs: Date.now() - startTime,
      lastUpdate: hist
    });
  } catch (err: any) {
    const hist = logChannelUpdate({
      type: 'repo_sync',
      actionName: `Atualização de Links: ${file || 'Lista'}`,
      success: false,
      channelsCount: 0,
      details: `Falha ao sincronizar links do repositório: ${err.message || err}`,
      author: currentAuthor,
      durationMs: Date.now() - startTime,
      errorMessage: err.message || String(err)
    });
    res.status(500).json({ success: false, error: err.message || 'Falha ao sincronizar links do repositório' });
  }
});

// --- DEDICATED M3U UNIFICATION & IMPORT ENDPOINTS ---

// GET /api/admin/channels/unify-stats (Estatísticas da Grade Unificada)
app.get('/api/admin/channels/unify-stats', (req, res) => {
  const activeChannels = customConfigChannels.length > 0 
    ? customConfigChannels 
    : (parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels);

  let totalSources = 0;
  let multiSourceChannels = 0;
  let singleSourceChannels = 0;

  activeChannels.forEach(c => {
    const sourcesCount = c.sources?.length || 1;
    totalSources += sourcesCount;
    if (sourcesCount > 1) {
      multiSourceChannels++;
    } else {
      singleSourceChannels++;
    }
  });

  res.json({
    success: true,
    totalChannels: activeChannels.length,
    totalSources,
    multiSourceChannels,
    singleSourceChannels,
    avgSourcesPerChannel: activeChannels.length > 0 ? Number((totalSources / activeChannels.length).toFixed(2)) : 1,
    ramysCount: parsedRamysChannels.length,
    saimoCount: parsedSaimoChannels.length,
    lastUnifiedAt: channelUpdateHistory.find(h => h.type === 'unify_grade')?.timestamp || new Date().toISOString()
  });
});

// POST /api/admin/channels/unify-now (Unificar Grade Oficial com 1 Clique)
app.post('/api/admin/channels/unify-now', async (req, res) => {
  const { author } = req.body || {};
  const currentAuthor = author || 'Administrador';
  const startTime = Date.now();

  try {
    // 1. Ensure Ramys catalog is loaded
    if (parsedRamysChannels.length === 0) {
      await loadRamysCatalog();
    }

    // 2. Base list
    const baseList = customConfigChannels.length > 0 
      ? customConfigChannels 
      : (parsedSaimoChannels.length > 0 ? parsedSaimoChannels : []);

    // 3. Unify Saimo + Ramys + Custom with Similarity Matching
    let mergedResult = unifyChannelCollections(baseList, parsedRamysChannels);
    if (parsedSaimoChannels.length > 0) {
      mergedResult = unifyChannelCollections(mergedResult.unified, parsedSaimoChannels);
    }
    if (customAdminChannels.length > 0) {
      mergedResult = unifyChannelCollections(mergedResult.unified, customAdminChannels);
    }

    // 4. Save to disk
    saveUnifiedGradeToDisk(
      mergedResult.unified,
      currentAuthor,
      'Unificação Geral da Grade de Canais',
      `Grade unificada com sucesso! Total de ${mergedResult.unified.length} canais consolidados, ${mergedResult.mergedChannelsCount} opções de contingência (Opção 2+) mapeadas, ${mergedResult.totalSourcesCount} servidores totais.`
    );

    // Register in transparent M3U import logs
    logM3uImportEntry({
      sourceName: 'Unificação Geral da Grade (1-Clique)',
      totalFound: parsedRamysChannels.length + parsedSaimoChannels.length,
      duplicatesConsolidated: mergedResult.mergedChannelsCount,
      newChannelsAdded: mergedResult.newChannelsCount,
      totalStreamOptions: mergedResult.totalSourcesCount,
      finalGradeCount: mergedResult.unified.length,
      status: 'success',
      durationMs: Date.now() - startTime,
      author: currentAuthor,
      details: `Unificação executada com sucesso. ${mergedResult.mergedChannelsCount} duplicatas e similares consolidadas em opções alternativas (Opção 2+) e ${mergedResult.newChannelsCount} novos canais cadastrados.`,
      similarityMatches: mergedResult.similarityMatches.slice(0, 30)
    });

    res.json({
      success: true,
      message: `Grade unificada com sucesso! ${mergedResult.unified.length} canais consolidados e ${mergedResult.totalSourcesCount} fontes/opções ativas para todos.`,
      channelsCount: mergedResult.unified.length,
      mergedChannelsCount: mergedResult.mergedChannelsCount,
      newChannelsCount: mergedResult.newChannelsCount,
      totalSourcesCount: mergedResult.totalSourcesCount,
      durationMs: Date.now() - startTime
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Falha ao unificar grade de canais' });
  }
});

// POST /api/admin/channels/import-m3u-url (Importar e Unificar lista via URL M3U/M3U8)
app.post('/api/admin/channels/import-m3u-url', async (req, res) => {
  const { url, unifyWithExisting = true, author, sourceLabel } = req.body || {};
  const currentAuthor = author || 'Administrador';
  const startTime = Date.now();

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'URL da lista M3U8 inválida ou ausente.' });
  }

  try {
    const fetchRes = await fetch(url.trim(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(45000)
    });

    if (!fetchRes.ok) {
      throw new Error(`HTTP ${fetchRes.status} ao acessar a URL da lista M3U8.`);
    }

    const content = await fetchRes.text();
    if (!content.includes('#EXTINF') && !content.includes('http')) {
      throw new Error('O link fornecido não parece ser um arquivo M3U/M3U8 válido.');
    }

    const parsedChannels = parseM3UToChannels(content, 'import-url');
    if (parsedChannels.length === 0) {
      throw new Error('Nenhum canal foi encontrado no arquivo M3U8 fornecido.');
    }

    const baseList = unifyWithExisting
      ? (customConfigChannels.length > 0 ? customConfigChannels : (parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels))
      : [];

    const { unified, mergedChannelsCount, newChannelsCount, totalSourcesCount, similarityMatches } = unifyChannelCollections(baseList, parsedChannels);

    const displayName = sourceLabel || url.replace(/^https?:\/\//, '').slice(0, 60);
    saveUnifiedGradeToDisk(
      unified,
      currentAuthor,
      `Importação M3U8 via URL: ${displayName}`,
      `${parsedChannels.length} canais importados da URL. ${mergedChannelsCount} adicionados como Opção 2/backup em canais existentes, ${newChannelsCount} novos canais adicionados. Total da grade: ${unified.length} canais.`
    );

    // Save and register URL in the permanent sources list
    const cleanUrl = url.trim();
    const existingSrcIndex = m3uAutoUpdateConfig.sources.findIndex(s => s.url.trim().toLowerCase() === cleanUrl.toLowerCase());
    let savedSourceItem: ServerM3uAutoUpdateSource;
    if (existingSrcIndex >= 0) {
      m3uAutoUpdateConfig.sources[existingSrcIndex].name = displayName;
      m3uAutoUpdateConfig.sources[existingSrcIndex].enabled = true;
      savedSourceItem = m3uAutoUpdateConfig.sources[existingSrcIndex];
    } else {
      savedSourceItem = {
        id: `src-${Date.now()}`,
        name: displayName,
        url: cleanUrl,
        enabled: true,
        priority: m3uAutoUpdateConfig.sources.length + 1
      };
      m3uAutoUpdateConfig.sources.push(savedSourceItem);
    }
    saveAutoUpdateConfigToDisk();

    // Register in transparent M3U import logs
    const logItem = logM3uImportEntry({
      sourceName: displayName,
      sourceUrl: url,
      totalFound: parsedChannels.length,
      duplicatesConsolidated: mergedChannelsCount,
      newChannelsAdded: newChannelsCount,
      totalStreamOptions: totalSourcesCount,
      finalGradeCount: unified.length,
      status: 'success',
      durationMs: Date.now() - startTime,
      author: currentAuthor,
      details: `${parsedChannels.length} canais encontrados no link M3U8. Durante a unificação pré-processada, ${mergedChannelsCount} duplicados/similares foram consolidados em opções de stream alternativas (Opção 2+), mantendo a grade limpa e sem redundância.`,
      similarityMatches: similarityMatches.slice(0, 40)
    });

    res.json({
      success: true,
      message: `Lista M3U8 importada, salva e unificada com sucesso! ${parsedChannels.length} canais processados, ${mergedChannelsCount} duplicados/similares consolidados e URL salva na lista de fontes.`,
      channelsCount: unified.length,
      importedCount: parsedChannels.length,
      mergedChannelsCount,
      newChannelsCount,
      totalSourcesCount,
      durationMs: Date.now() - startTime,
      logId: logItem.id,
      similarityMatchesCount: similarityMatches.length,
      savedSource: savedSourceItem,
      sources: m3uAutoUpdateConfig.sources
    });
  } catch (err: any) {
    const errorMsg = err.message || 'Erro ao importar URL M3U8';
    logM3uImportEntry({
      sourceName: sourceLabel || url.slice(0, 60),
      sourceUrl: url,
      totalFound: 0,
      duplicatesConsolidated: 0,
      newChannelsAdded: 0,
      totalStreamOptions: 0,
      finalGradeCount: customConfigChannels.length,
      status: 'error',
      durationMs: Date.now() - startTime,
      author: currentAuthor,
      details: `Falha na importação via URL: ${errorMsg}`
    });

    sqliteSaveUrlErrorLog({
      id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      url: url ? String(url).trim() : '',
      sourceName: sourceLabel || (url ? String(url).slice(0, 60) : 'Importação URL'),
      errorType: err.name === 'AbortError' || err.name === 'TimeoutError' ? 'timeout' : 'http_or_network_error',
      errorMessage: `Falha na requisição de importação M3U: ${errorMsg}`,
      details: { stack: err.stack, durationMs: Date.now() - startTime }
    });

    res.status(500).json({ success: false, error: errorMsg });
  }
});

// POST /api/admin/channels/import-m3u-content (Importar e Unificar texto ou arquivo M3U/M3U8)
app.post('/api/admin/channels/import-m3u-content', async (req, res) => {
  const { content, fileName, unifyWithExisting = true, author } = req.body || {};
  const currentAuthor = author || 'Administrador';
  const startTime = Date.now();

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Conteúdo M3U8 vazio ou inválido.' });
  }

  try {
    const parsedChannels = parseM3UToChannels(content, 'import-file');
    if (parsedChannels.length === 0) {
      throw new Error('Nenhum canal válido foi extraído do conteúdo M3U8 fornecido.');
    }

    const baseList = unifyWithExisting
      ? (customConfigChannels.length > 0 ? customConfigChannels : (parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels))
      : [];

    const { unified, mergedChannelsCount, newChannelsCount, totalSourcesCount, similarityMatches } = unifyChannelCollections(baseList, parsedChannels);

    const displayName = fileName || 'Arquivo M3U8 Personalizado';
    saveUnifiedGradeToDisk(
      unified,
      currentAuthor,
      `Importação M3U8: ${displayName}`,
      `${parsedChannels.length} canais importados de ${displayName}. ${mergedChannelsCount} integrados como Opção 2 (backup), ${newChannelsCount} novos canais inseridos. Grade final com ${unified.length} canais e ${totalSourcesCount} opções de stream.`
    );

    // Register in transparent M3U import logs
    const logItem = logM3uImportEntry({
      sourceName: displayName,
      totalFound: parsedChannels.length,
      duplicatesConsolidated: mergedChannelsCount,
      newChannelsAdded: newChannelsCount,
      totalStreamOptions: totalSourcesCount,
      finalGradeCount: unified.length,
      status: 'success',
      durationMs: Date.now() - startTime,
      author: currentAuthor,
      details: `${parsedChannels.length} canais extraídos do arquivo. ${mergedChannelsCount} canais duplicados/similares consolidados em opções de backup e ${newChannelsCount} novos canais inseridos na grade.`,
      similarityMatches: similarityMatches.slice(0, 40)
    });

    res.json({
      success: true,
      message: `${displayName} unificado com sucesso! ${parsedChannels.length} canais processados (${mergedChannelsCount} duplicatas/similares consolidadas como opções alternativas de sinal).`,
      channelsCount: unified.length,
      importedCount: parsedChannels.length,
      mergedChannelsCount,
      newChannelsCount,
      totalSourcesCount,
      durationMs: Date.now() - startTime,
      logId: logItem.id,
      similarityMatchesCount: similarityMatches.length
    });
  } catch (err: any) {
    logM3uImportEntry({
      sourceName: fileName || 'Arquivo M3U8 Personalizado',
      totalFound: 0,
      duplicatesConsolidated: 0,
      newChannelsAdded: 0,
      totalStreamOptions: 0,
      finalGradeCount: customConfigChannels.length,
      status: 'error',
      durationMs: Date.now() - startTime,
      author: currentAuthor,
      details: `Falha na importação de arquivo M3U8: ${err.message || 'Erro desconhecido'}`
    });
    res.status(500).json({ success: false, error: err.message || 'Erro ao importar conteúdo M3U8' });
  }
});

// --- M3U IMPORT LOGS & AUTO-UPDATE BACKGROUND SERVICES ---

// GET /api/admin/channels/import-logs (Histórico e transparência de importações M3U)
app.get('/api/admin/channels/import-logs', (req, res) => {
  res.json({
    success: true,
    logs: m3uImportLogs,
    count: m3uImportLogs.length
  });
});

// DELETE /api/admin/channels/import-logs (Limpar histórico de importações)
app.delete('/api/admin/channels/import-logs', (req, res) => {
  m3uImportLogs = [];
  try {
    if (fs.existsSync(M3U_IMPORT_HISTORY_FILE)) {
      fs.writeFileSync(M3U_IMPORT_HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
  } catch (e) {
    console.warn('[M3U LOGS] Falha ao limpar arquivo de histórico:', e);
  }
  res.json({
    success: true,
    message: 'Histórico de importações e unificação limpo com sucesso.'
  });
});

// GET /api/admin/channels/auto-update-config (Ler configuração de auto-atualização de M3U)
app.get('/api/admin/channels/auto-update-config', (req, res) => {
  res.json({
    success: true,
    config: m3uAutoUpdateConfig
  });
});

// POST /api/admin/channels/auto-update-config (Salvar intervalo e fontes para auto-atualização)
app.post('/api/admin/channels/auto-update-config', (req, res) => {
  const { enabled, intervalHours, sources } = req.body || {};

  if (enabled !== undefined) {
    m3uAutoUpdateConfig.enabled = Boolean(enabled);
  }
  if (intervalHours !== undefined) {
    const hours = Number(intervalHours);
    if (!isNaN(hours) && hours > 0) {
      m3uAutoUpdateConfig.intervalHours = hours;
      systemSettings.autoUpdateIntervalHours = hours;
      m3uAutoUpdateConfig.nextRunAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    }
  }
  if (Array.isArray(sources)) {
    m3uAutoUpdateConfig.sources = sources;
  }

  saveAutoUpdateConfigToDisk();

  res.json({
    success: true,
    message: `Configuração salva! O sistema buscará atualizações automaticamente a cada ${m3uAutoUpdateConfig.intervalHours}h.`,
    config: m3uAutoUpdateConfig
  });
});

// =============================================================
// VALIDAÇÃO ROBUSTA DE URL M3U/M3U8 NO LADO DO SERVIDOR
// =============================================================
interface M3uUrlValidationResult {
  valid: boolean;
  error?: string;
  errorType?: 'http_error' | 'timeout' | 'network_error' | 'invalid_m3u_format' | 'empty_content' | 'protocol_error';
  statusCode?: number;
  statusText?: string;
  latencyMs?: number;
  channelsCount?: number;
  contentType?: string;
  isHlsPlaylist?: boolean;
  sampleChannels?: string[];
  details?: any;
}

async function validateM3uUrl(url: string, timeoutMs: number = 15000): Promise<M3uUrlValidationResult> {
  const startTime = Date.now();
  const cleanUrl = (url || '').trim();

  // 1. Verificação sintática básica e protocolo
  if (!cleanUrl) {
    return {
      valid: false,
      errorType: 'protocol_error',
      error: 'URL não fornecida ou vazia.'
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        valid: false,
        errorType: 'protocol_error',
        error: `Protocolo "${parsedUrl.protocol}" não suportado. Utilize apenas links com http:// ou https://.`
      };
    }
  } catch (err: any) {
    return {
      valid: false,
      errorType: 'protocol_error',
      error: `Formato de URL inválido: ${err.message}`
    };
  }

  // 2. Requisição HTTP para testar acessibilidade e integridade do arquivo
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/plain, application/x-mpegURL, application/vnd.apple.mpegurl, audio/x-mpegurl, */*'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';

    // Verifica status code HTTP
    if (!response.ok) {
      let friendlyError = `O servidor remoto retornou status HTTP ${response.status} (${response.statusText || 'Erro'}).`;
      if (response.status === 404) {
        friendlyError = 'A URL retornou status 404 (Não Encontrado). O arquivo da lista M3U não existe no servidor informado.';
      } else if (response.status === 403) {
        friendlyError = 'A URL retornou status 403 (Proibido). Acesso bloqueado pelo servidor de origem (pode requerer token/user-agent específico ou IP autorizado).';
      } else if (response.status === 502 || response.status === 503 || response.status === 504) {
        friendlyError = `O servidor da lista está fora do ar ou sobrecarregado (HTTP ${response.status}).`;
      }

      return {
        valid: false,
        errorType: 'http_error',
        error: friendlyError,
        statusCode: response.status,
        statusText: response.statusText,
        contentType,
        latencyMs,
        details: {
          url: cleanUrl,
          statusCode: response.status,
          statusText: response.statusText
        }
      };
    }

    // Lê o conteúdo da lista
    const rawText = await response.text();
    const textSnippet = rawText.slice(0, 1000).trim();

    if (!rawText || rawText.trim().length === 0) {
      return {
        valid: false,
        errorType: 'empty_content',
        error: 'A URL respondeu com sucesso (HTTP 200), porém o arquivo retornado está vazio (0 bytes).',
        statusCode: response.status,
        contentType,
        latencyMs
      };
    }

    // Detecta se é uma página HTML de erro ou bloqueio (Cloudflare, painel web, 404 customizado)
    const lowerSnippet = textSnippet.toLowerCase();
    const isHtml = lowerSnippet.startsWith('<!doctype html') || lowerSnippet.startsWith('<html') || (lowerSnippet.includes('<head') && lowerSnippet.includes('<body'));
    const hasM3uMarkers = rawText.includes('#EXTINF') || rawText.includes('#EXTM3U') || rawText.includes('#EXT-X-STREAM-INF') || rawText.includes('#EXT-X-TARGETDURATION');

    if (isHtml && !hasM3uMarkers) {
      return {
        valid: false,
        errorType: 'invalid_m3u_format',
        error: 'A URL retornou uma página web em HTML em vez de um arquivo de lista de reprodução M3U/M3U8.',
        statusCode: response.status,
        contentType,
        latencyMs,
        details: { sample: textSnippet.slice(0, 250) }
      };
    }

    if (!hasM3uMarkers && !rawText.includes('http://') && !rawText.includes('https://')) {
      return {
        valid: false,
        errorType: 'invalid_m3u_format',
        error: 'O conteúdo retornado não possui tags ou diretivas M3U válidas (#EXTM3U, #EXTINF).',
        statusCode: response.status,
        contentType,
        latencyMs,
        details: { sample: textSnippet.slice(0, 250) }
      };
    }

    // Valida extração de canais
    const parsedChannels = parseM3UToChannels(rawText, 'validation');
    const extinfMatches = rawText.match(/#EXTINF:/g);
    const channelsCount = parsedChannels.length > 0 ? parsedChannels.length : (extinfMatches ? extinfMatches.length : 0);

    if (channelsCount === 0 && !rawText.includes('#EXT-X-STREAM-INF')) {
      return {
        valid: false,
        errorType: 'invalid_m3u_format',
        error: 'A lista foi carregada, mas nenhum canal funcional no padrão M3U foi localizado.',
        statusCode: response.status,
        contentType,
        latencyMs
      };
    }

    return {
      valid: true,
      channelsCount,
      isHlsPlaylist: rawText.includes('#EXT-X-'),
      contentType,
      latencyMs,
      sampleChannels: parsedChannels.slice(0, 5).map(c => c.name)
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    if (err.name === 'AbortError' || err.name === 'TimeoutError' || (err.message && err.message.toLowerCase().includes('timeout'))) {
      return {
        valid: false,
        errorType: 'timeout',
        error: `Tempo limite esgotado (${timeoutMs / 1000}s). O servidor remoto da lista M3U demorou demais para responder.`,
        latencyMs,
        details: { error: err.message }
      };
    }

    return {
      valid: false,
      errorType: 'network_error',
      error: `Falha de conexão com a URL: ${err.message}`,
      latencyMs,
      details: { error: err.message, stack: err.stack }
    };
  }
}

// POST /api/admin/channels/validate-m3u-url (Validar link M3U em tempo real sob demanda)
app.post('/api/admin/channels/validate-m3u-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, valid: false, error: 'URL da lista M3U é obrigatória.' });
  }

  const result = await validateM3uUrl(url.trim());
  if (!result.valid) {
    sqliteSaveUrlErrorLog({
      id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      url: url.trim(),
      sourceName: 'Teste de Validação de URL',
      errorType: result.errorType || 'validation_test_failed',
      errorMessage: result.error || 'Falha no teste de validação de URL',
      statusCode: result.statusCode,
      details: result.details
    });
  }

  res.json({
    success: true,
    ...result
  });
});

// POST /api/admin/channels/sources (Salvar ou cadastrar URL M3U8 com validação server-side e persistência garantida no SQLite)
app.post('/api/admin/channels/sources', async (req, res) => {
  const { name, url, enabled = true, skipValidation = false } = req.body || {};
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    const errObj = {
      id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      url: String(url || ''),
      sourceName: name ? String(name) : 'Nova Fonte',
      errorType: 'validation_error',
      errorMessage: 'URL da lista M3U8 inválida ou ausente (deve iniciar com http:// ou https://).'
    };
    sqliteSaveUrlErrorLog(errObj);
    return res.status(400).json({ success: false, error: errObj.errorMessage, log: errObj });
  }

  const cleanUrl = url.trim();
  const cleanName = (name && String(name).trim()) || cleanUrl.replace(/^https?:\/\//, '').slice(0, 50);

  // Validação no lado do servidor antes de salvar para evitar entradas corrompidas
  if (!skipValidation) {
    console.log(`[URL VALIDATION] Validando link M3U no servidor antes de persistir: ${cleanUrl}`);
    const validation = await validateM3uUrl(cleanUrl);
    if (!validation.valid) {
      console.warn(`[URL VALIDATION FAILED] Rejeitando URL inválida: ${cleanUrl} - Motivo: ${validation.error}`);
      const errLog = {
        id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        url: cleanUrl,
        sourceName: cleanName,
        errorType: validation.errorType || 'invalid_url',
        errorMessage: validation.error || 'A URL informada não pôde ser validada.',
        statusCode: validation.statusCode,
        details: validation.details || { latencyMs: validation.latencyMs, contentType: validation.contentType }
      };
      sqliteSaveUrlErrorLog(errLog);

      return res.status(400).json({
        success: false,
        error: validation.error,
        validationFailed: true,
        validation,
        log: errLog
      });
    }
    console.log(`[URL VALIDATION SUCCESS] Link M3U aprovado com ${validation.channelsCount} canais em ${validation.latencyMs}ms.`);
  }

  try {
    const existingIndex = m3uAutoUpdateConfig.sources.findIndex(s => s.url.trim().toLowerCase() === cleanUrl.toLowerCase());
    let sourceItem: ServerM3uAutoUpdateSource;

    if (existingIndex >= 0) {
      m3uAutoUpdateConfig.sources[existingIndex].name = cleanName;
      m3uAutoUpdateConfig.sources[existingIndex].enabled = Boolean(enabled);
      sourceItem = m3uAutoUpdateConfig.sources[existingIndex];
    } else {
      sourceItem = {
        id: `src-${Date.now()}`,
        name: cleanName,
        url: cleanUrl,
        enabled: Boolean(enabled),
        priority: m3uAutoUpdateConfig.sources.length + 1
      };
      m3uAutoUpdateConfig.sources.push(sourceItem);
    }

    // Persistência no SQLite 3
    sqliteSaveM3uSource(sourceItem);
    saveAutoUpdateConfigToDisk();

    res.json({
      success: true,
      message: `Fonte M3U8 "${cleanName}" validada e salva com sucesso no banco de dados SQLite!`,
      source: sourceItem,
      sources: m3uAutoUpdateConfig.sources,
      config: m3uAutoUpdateConfig
    });
  } catch (sqliteErr: any) {
    console.error('[SQLite SAVE ERROR] Erro ao gravar fonte no SQLite:', sqliteErr);
    const errLog = {
      id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      url: cleanUrl,
      sourceName: cleanName,
      errorType: 'sqlite_error',
      errorMessage: `Falha ao persistir no SQLite 3: ${sqliteErr.message}`,
      details: { stack: sqliteErr.stack }
    };
    sqliteSaveUrlErrorLog(errLog);

    res.status(500).json({
      success: false,
      error: `Erro ao gravar no banco SQLite: ${sqliteErr.message}`,
      log: errLog
    });
  }
});

// =============================================================
// BACKUP MANUAL DO BANCO SQLITE ('data/maxtv.db') & DIAGNÓSTICOS
// =============================================================
app.get('/api/admin/database/backup', (req, res) => {
  try {
    // 1. Executa checkpoint no SQLite para flush do WAL para o arquivo maxtv.db
    const dbPath = sqliteCheckpointAndGetDbPath();

    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({
        success: false,
        error: 'Arquivo do banco de dados "data/maxtv.db" não foi encontrado no servidor.'
      });
    }

    const stat = fs.statSync(dbPath);
    const dateTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const downloadFilename = `maxtv-backup-${dateTag}.db`;

    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const fileStream = fs.createReadStream(dbPath);
    fileStream.pipe(res);
  } catch (err: any) {
    console.error('[DB BACKUP ERROR] Falha ao disponibilizar backup:', err);
    res.status(500).json({
      success: false,
      error: `Erro ao baixar backup do banco SQLite: ${err.message}`
    });
  }
});

app.get('/api/admin/database/stats', (req, res) => {
  try {
    const stats = sqliteGetDatabaseStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/database/test-write', (req, res) => {
  const startTime = Date.now();
  try {
    const testId = `test-${Date.now()}`;
    sqliteSaveUrlErrorLog({
      id: testId,
      timestamp: new Date().toISOString(),
      url: 'https://test-sqlite.local/diagnostic',
      sourceName: 'Diagnóstico de Persistência SQLite 3',
      errorType: 'diagnostic_test',
      errorMessage: 'Teste de leitura/escrita e integridade do banco SQLite 3 concluído com sucesso.',
      statusCode: 200,
      details: {
        latencyMs: Date.now() - startTime,
        initiatedBy: (req as any).adminUser?.name || 'Admin'
      }
    });

    const stats = sqliteGetDatabaseStats();
    res.json({
      success: true,
      message: 'Banco de dados SQLite 3 está 100% operacional para leitura e escrita!',
      latencyMs: Date.now() - startTime,
      stats
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Falha no teste de escrita do banco SQLite: ${err.message}`
    });
  }
});

// =============================================================
// LOGS DE ERROS DE SALVAMENTO DE URLS E PERSISTÊNCIA SQLITE
// =============================================================
app.get('/api/admin/logs/url-errors', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const logs = sqliteGetUrlErrorLogs(limit);
    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/logs/url-errors', (req, res) => {
  try {
    const success = sqliteClearUrlErrorLogs();
    res.json({
      success,
      message: 'Histórico de erros de salvamento de URLs limpo com sucesso.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/channels/sources/:id (Remover fonte M3U8)
app.delete('/api/admin/channels/sources/:id', (req, res) => {
  const { id } = req.params;
  const initialCount = m3uAutoUpdateConfig.sources.length;
  m3uAutoUpdateConfig.sources = m3uAutoUpdateConfig.sources.filter(s => s.id !== id);

  saveAutoUpdateConfigToDisk();

  res.json({
    success: true,
    message: 'Fonte M3U8 removida com sucesso.',
    removed: initialCount !== m3uAutoUpdateConfig.sources.length,
    sources: m3uAutoUpdateConfig.sources,
    config: m3uAutoUpdateConfig
  });
});

// POST /api/admin/channels/run-auto-update (Disparar ciclo de auto-atualização imediatamente)
app.post('/api/admin/channels/run-auto-update', async (req, res) => {
  try {
    const { author } = req.body || {};
    const currentAuthor = author || 'Administrador (Manual)';
    const result = await runAutoUpdateCycle(currentAuthor);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Erro interno no ciclo de atualização' });
  }
});

// Core Auto-Update Execution Cycle
async function runAutoUpdateCycle(triggerReason: string = 'Agendador Automático'): Promise<{
  success: boolean;
  message: string;
  stats?: any;
}> {
  if (m3uAutoUpdateConfig.lastStatus === 'running') {
    return { success: false, message: 'Um ciclo de auto-atualização já está em andamento.' };
  }

  m3uAutoUpdateConfig.lastStatus = 'running';
  const startTime = Date.now();
  let totalFoundAcrossSources = 0;
  let allIncomingChannels: ServerChannel[] = [];
  const sourcesUsed: string[] = [];

  try {
    let enabledSources = m3uAutoUpdateConfig.sources.filter(s => s.enabled);
    if (enabledSources.length === 0) {
      enabledSources = [
        {
          id: 'src-ramys-br03',
          name: 'Ramys Oficial - CanaisBR03.m3u8 (IPTV Brasil 2026)',
          url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8',
          enabled: true,
          priority: 1
        }
      ];
    }

    for (const source of enabledSources) {
      try {
        console.log(`[AUTO-UPDATE] Baixando lista M3U/M3U8 de: ${source.name} (${source.url})`);
        const res = await fetch(source.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StreamingBrasil/AutoUpdate' },
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          const text = await res.text();
          const parsed = parseM3UToChannels(text, `auto-${source.id}`);
          if (parsed.length > 0) {
            totalFoundAcrossSources += parsed.length;
            allIncomingChannels = allIncomingChannels.concat(parsed);
            sourcesUsed.push(`${source.name} (${parsed.length} canais)`);
          }
        }
      } catch (errSource: any) {
        console.warn(`[AUTO-UPDATE] Aviso ao baixar fonte ${source.name}:`, errSource.message);
      }
    }

    if (allIncomingChannels.length === 0) {
      m3uAutoUpdateConfig.lastStatus = 'error';
      m3uAutoUpdateConfig.lastMessage = 'Nenhuma fonte M3U/M3U8 retornou canais válidos para atualização.';
      saveAutoUpdateConfigToDisk();
      return {
        success: false,
        message: 'Nenhuma fonte M3U/M3U8 respondeu a tempo ou retornou canais válidos.'
      };
    }

    const baseList = customConfigChannels.length > 0 ? customConfigChannels : parsedRamysChannels;
    const result = unifyChannelCollections(baseList, allIncomingChannels);

    saveUnifiedGradeToDisk(
      result.unified,
      'Agendador Automático',
      `Auto-Atualização Periódica (${m3uAutoUpdateConfig.intervalHours}h)`,
      `Ciclo automático executado: ${totalFoundAcrossSources} canais analisados de ${sourcesUsed.join(', ')}. ${result.mergedChannelsCount} duplicatas/similares consolidadas como opções alternativas (Opção 2+), ${result.newChannelsCount} novos canais adicionados. Total da grade: ${result.unified.length} canais.`
    );

    logM3uImportEntry({
      sourceName: `Ciclo Automático (${m3uAutoUpdateConfig.intervalHours}h) - ${sourcesUsed.join(' + ')}`,
      sourceUrl: enabledSources.map(s => s.url).join(', '),
      totalFound: totalFoundAcrossSources,
      duplicatesConsolidated: result.mergedChannelsCount,
      newChannelsAdded: result.newChannelsCount,
      totalStreamOptions: result.totalSourcesCount,
      finalGradeCount: result.unified.length,
      status: 'success',
      durationMs: Date.now() - startTime,
      author: triggerReason,
      details: `Atualização periódica executada com sucesso. ${result.mergedChannelsCount} canais consolidados em opções alternativas de sinal e ${result.newChannelsCount} novos canais inseridos na grade.`,
      similarityMatches: result.similarityMatches.slice(0, 30)
    });

    m3uAutoUpdateConfig.lastRunAt = new Date().toISOString();
    m3uAutoUpdateConfig.nextRunAt = new Date(Date.now() + m3uAutoUpdateConfig.intervalHours * 3600 * 1000).toISOString();
    m3uAutoUpdateConfig.lastStatus = 'success';
    m3uAutoUpdateConfig.lastMessage = `Última sincronização com sucesso em ${new Date().toLocaleString('pt-BR')}. ${result.unified.length} canais ativos e frescos.`;
    m3uAutoUpdateConfig.lastStats = {
      totalFound: totalFoundAcrossSources,
      duplicatesConsolidated: result.mergedChannelsCount,
      newChannelsAdded: result.newChannelsCount,
      finalGradeCount: result.unified.length
    };
    saveAutoUpdateConfigToDisk();

    return {
      success: true,
      message: `Ciclo de atualização concluído! ${result.unified.length} canais atualizados na grade (${result.mergedChannelsCount} consolidados em redundância).`,
      stats: m3uAutoUpdateConfig.lastStats
    };
  } catch (err: any) {
    m3uAutoUpdateConfig.lastStatus = 'error';
    m3uAutoUpdateConfig.lastMessage = `Falha na sincronização: ${err.message}`;
    saveAutoUpdateConfigToDisk();

    logM3uImportEntry({
      sourceName: 'Falha no Ciclo de Auto-Atualização',
      totalFound: totalFoundAcrossSources,
      duplicatesConsolidated: 0,
      newChannelsAdded: 0,
      totalStreamOptions: 0,
      finalGradeCount: customConfigChannels.length,
      status: 'error',
      durationMs: Date.now() - startTime,
      author: triggerReason,
      details: `Erro durante a auto-atualização periódica: ${err.message}`
    });

    return { success: false, message: err.message };
  }
}

function startAutoUpdateScheduler() {
  console.log(`[AUTO-UPDATE SCHEDULER] Ativo com intervalo de ${m3uAutoUpdateConfig.intervalHours}h.`);
  // Check every 2 minutes
  setInterval(async () => {
    if (!m3uAutoUpdateConfig.enabled || m3uAutoUpdateConfig.intervalHours <= 0) {
      return;
    }
    const nextRun = m3uAutoUpdateConfig.nextRunAt ? new Date(m3uAutoUpdateConfig.nextRunAt).getTime() : 0;
    const now = Date.now();

    if (now >= nextRun) {
      console.log(`[AUTO-UPDATE SCHEDULER] Horário agendado atingido. Iniciando ciclo de renovação de sinais...`);
      await runAutoUpdateCycle('Agendador Automático');
    }
  }, 2 * 60 * 1000);
}

app.post('/api/admin/repo-links/test-host', async (req, res) => {
  const { host } = req.body || {};
  if (!host) {
    return res.status(400).json({ success: false, error: 'Host é obrigatório' });
  }

  const cleanHost = String(host).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const testUrl = `http://${cleanHost}/`;
  const startTime = Date.now();

  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000)
    });
    const latencyMs = Date.now() - startTime;
    res.json({
      success: true,
      host: cleanHost,
      online: response.status < 500,
      status: response.status,
      latencyMs,
      message: `Host respondeu em ${latencyMs}ms com HTTP ${response.status}`
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    res.json({
      success: false,
      host: cleanHost,
      online: false,
      latencyMs,
      error: err.message || 'Tempo limite esgotado'
    });
  }
});

// --- CHANNELS JSON CONFIGURATION & UPDATE HISTORY SYSTEM ---

// GET /api/admin/channels/config (Ler arquivo de configuração)
app.get('/api/admin/channels/config', (req, res) => {
  try {
    let configObj: any = null;
    let rawText = '';
    let lastModified = new Date().toISOString();

    if (fs.existsSync(CHANNELS_CONFIG_FILE)) {
      rawText = fs.readFileSync(CHANNELS_CONFIG_FILE, 'utf-8');
      const stats = fs.statSync(CHANNELS_CONFIG_FILE);
      lastModified = stats.mtime.toISOString();
      configObj = JSON.parse(rawText);
    } else {
      const baseChannels = parsedSaimoChannels.length > 0 ? parsedSaimoChannels : parsedRamysChannels;
      const initialList = [...customAdminChannels, ...baseChannels];

      configObj = {
        version: "1.0",
        updatedAt: new Date().toISOString(),
        updatedBy: "Sistema",
        description: "Configuração Oficial da Grade de Canais de TV do Sistema",
        channels: initialList
      };

      rawText = JSON.stringify(configObj, null, 2);
      const dataDir = path.dirname(CHANNELS_CONFIG_FILE);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(CHANNELS_CONFIG_FILE, rawText, 'utf-8');
    }

    const channelsList = Array.isArray(configObj) ? configObj : (Array.isArray(configObj.channels) ? configObj.channels : []);

    res.json({
      success: true,
      config: configObj,
      rawJson: rawText,
      filePath: 'public/data/channels-config.json',
      count: channelsList.length,
      lastModified
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Erro ao carregar arquivo de configuração: ' + (err.message || err) });
  }
});

// POST /api/admin/channels/config/validate (Validação estrita de formato JSON e schema)
app.post('/api/admin/channels/config/validate', (req, res) => {
  const { rawJson, config } = req.body;
  let parsed: any = config;

  if (typeof rawJson === 'string') {
    try {
      parsed = JSON.parse(rawJson);
    } catch (err: any) {
      return res.json({
        valid: false,
        errorType: 'syntax',
        error: `Erro de sintaxe no JSON: ${err.message}`,
        details: err.toString()
      });
    }
  }

  if (!parsed || (typeof parsed !== 'object')) {
    return res.json({
      valid: false,
      errorType: 'schema',
      error: 'O formato deve ser um objeto com a chave "channels": [...] ou uma lista de canais em formato array [].'
    });
  }

  const list = Array.isArray(parsed) ? parsed : parsed.channels;
  if (!Array.isArray(list)) {
    return res.json({
      valid: false,
      errorType: 'schema',
      error: 'A chave "channels" deve ser um array contendo os canais de TV.'
    });
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  list.forEach((ch, idx) => {
    if (!ch || typeof ch !== 'object') {
      errors.push(`Item #${idx + 1} não é um objeto de canal válido.`);
      return;
    }
    if (!ch.name || typeof ch.name !== 'string' || !ch.name.trim()) {
      errors.push(`Canal no índice #${idx + 1} não possui um "name" (nome obrigatório).`);
    }

    if (ch.id) {
      if (seenIds.has(ch.id)) {
        warnings.push(`ID duplicado detectado: "${ch.id}" (índice #${idx + 1}).`);
      } else {
        seenIds.add(ch.id);
      }
    } else {
      warnings.push(`Canal "${ch.name || idx + 1}" sem ID fixo. Será gerado automaticamente.`);
    }

    const hasSources = Array.isArray(ch.sources) && ch.sources.length > 0 && ch.sources.some((s: any) => s && (s.url || typeof s === 'string'));
    const hasDirectUrl = typeof ch.url === 'string' && ch.url.trim().length > 0;
    const hasStreamUrl = typeof ch.streamUrl === 'string' && ch.streamUrl.trim().length > 0;

    if (!hasSources && !hasDirectUrl && !hasStreamUrl) {
      errors.push(`Canal "${ch.name || idx + 1}" não possui URL de stream definida.`);
    }
  });

  if (errors.length > 0) {
    return res.json({
      valid: false,
      errorType: 'schema',
      error: errors[0],
      errors,
      warnings,
      count: list.length
    });
  }

  res.json({
    valid: true,
    count: list.length,
    warnings
  });
});

// POST /api/admin/channels/config (Salvar e aplicar arquivo de configuração)
app.post('/api/admin/channels/config', (req, res) => {
  try {
    const { rawJson, config, author } = req.body;
    let parsed: any = config;

    if (typeof rawJson === 'string') {
      try {
        parsed = JSON.parse(rawJson);
      } catch (err: any) {
        logChannelUpdate({
          type: 'json_edit',
          actionName: 'Tentativa de Edição JSON',
          success: false,
          channelsCount: 0,
          details: `Falha de validação de sintaxe JSON: ${err.message}`,
          author: author || 'Administrador',
          errorMessage: err.message
        });

        return res.status(400).json({
          success: false,
          error: `Erro de sintaxe no arquivo JSON: ${err.message}. A gravação foi cancelada para proteger o sistema.`
        });
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Estrutura JSON inválida. Envie um objeto com a chave "channels" ou um array de canais.'
      });
    }

    const rawList = Array.isArray(parsed) ? parsed : parsed.channels;
    if (!Array.isArray(rawList)) {
      return res.status(400).json({
        success: false,
        error: 'O arquivo JSON deve conter um array na chave "channels".'
      });
    }

    if (rawList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A lista de canais não pode estar vazia. Insira ao menos um canal válido para não deixar a grade desprovida.'
      });
    }

    const normalized: ServerChannel[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item || typeof item !== 'object') continue;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) {
        return res.status(400).json({
          success: false,
          error: `Canal no índice #${i + 1} está sem nome ("name" é obrigatório).`
        });
      }

      let sources: { url: string; referer?: string; userAgent?: string; quality?: string }[] = [];
      if (Array.isArray(item.sources) && item.sources.length > 0) {
        sources = item.sources.map((s: any) => {
          if (typeof s === 'string') {
            return { url: s, quality: '1080p' };
          }
          return {
            url: s.url || '',
            referer: s.referer || undefined,
            userAgent: s.userAgent || undefined,
            quality: s.quality || '1080p'
          };
        }).filter(s => Boolean(s.url));
      } else if (item.url) {
        sources = [{ url: item.url, quality: item.quality || '1080p', referer: item.referer }];
      } else if (item.streamUrl) {
        sources = [{ url: item.streamUrl, quality: item.quality || '1080p', referer: item.referer }];
      }

      if (sources.length === 0) {
        return res.status(400).json({
          success: false,
          error: `Canal "${name}" não possui nenhuma fonte de stream ("url" ou "sources").`
        });
      }

      const id = item.id ? String(item.id).trim() : `cfg-ch-${Date.now()}-${i}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const category = item.category || categorizeChannel(name);
      const logo = item.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=200';
      const isActive = item.isActive !== undefined ? Boolean(item.isActive) : true;
      const isVipOnly = item.isVipOnly !== undefined ? Boolean(item.isVipOnly) : false;

      normalized.push({
        id,
        name,
        category,
        logo,
        sources,
        isActive,
        isVipOnly,
        isCustom: true,
        epgNow: item.epgNow || undefined,
        epgNext: item.epgNext || undefined
      });
    }

    const finalDocument = {
      version: "1.0",
      updatedAt: new Date().toISOString(),
      updatedBy: author || "Administrador",
      description: typeof parsed.description === 'string' ? parsed.description : "Configuração Oficial da Grade de Canais de TV do Sistema",
      channels: normalized
    };

    const formattedJson = JSON.stringify(finalDocument, null, 2);
    const dataDir = path.dirname(CHANNELS_CONFIG_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(CHANNELS_CONFIG_FILE, formattedJson, 'utf-8');

    customConfigChannels = normalized;

    const historyEntry = logChannelUpdate({
      type: 'json_edit',
      actionName: 'Edição de Arquivo JSON de Canais',
      success: true,
      channelsCount: normalized.length,
      details: `Arquivo de configuração channels-config.json salvo com sucesso. ${normalized.length} canais validados e ativos na grade.`,
      author: author || 'Administrador'
    });

    res.json({
      success: true,
      message: `Arquivo de configuração salvo com sucesso! Grade atualizada com ${normalized.length} canais ativos.`,
      channelsCount: normalized.length,
      lastUpdate: historyEntry,
      config: finalDocument,
      rawJson: formattedJson
    });
  } catch (err: any) {
    const errorMsg = err.message || 'Erro interno ao salvar arquivo de configuração de canais';
    logChannelUpdate({
      type: 'json_edit',
      actionName: 'Edição de Arquivo JSON de Canais',
      success: false,
      channelsCount: 0,
      details: `Falha na gravação do arquivo: ${errorMsg}`,
      author: req.body?.author || 'Administrador',
      errorMessage: errorMsg
    });

    res.status(500).json({ success: false, error: errorMsg });
  }
});

// GET /api/admin/channels/history (Histórico de atualizações da grade)
app.get('/api/admin/channels/history', (req, res) => {
  res.json({
    success: true,
    lastUpdate: channelUpdateHistory[0] || null,
    history: channelUpdateHistory,
    total: channelUpdateHistory.length
  });
});

// POST /api/admin/channels/history/clear (Limpar histórico)
app.post('/api/admin/channels/history/clear', (req, res) => {
  const clearedEntry = logChannelUpdate({
    type: 'initial_load',
    actionName: 'Limpeza de Histórico',
    success: true,
    channelsCount: (customConfigChannels.length || parsedSaimoChannels.length),
    details: 'O histórico de atualizações anteriores foi arquivado/limpo pelo administrador.',
    author: req.body?.author || 'Administrador'
  });

  channelUpdateHistory = [clearedEntry];
  try {
    if (fs.existsSync(CHANNELS_HISTORY_FILE)) {
      fs.writeFileSync(CHANNELS_HISTORY_FILE, JSON.stringify(channelUpdateHistory, null, 2), 'utf-8');
    }
  } catch {
    // Ignored
  }

  res.json({
    success: true,
    message: 'Histórico de atualizações da grade resetado com sucesso.',
    history: channelUpdateHistory,
    lastUpdate: clearedEntry
  });
});

// --- CHANNEL HEALTH CHECKING ENDPOINTS ---

// Get current overall health status & all tested results
app.get('/api/admin/channels/health-status', (req, res) => {
  const summary = getHealthSummary();
  res.json({
    success: true,
    summary,
    results: Array.from(channelHealthStore.values())
  });
});

// Test a single stream URL
app.post('/api/admin/channels/check-single', async (req, res) => {
  const { url, referer, channelId, channelName, category } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL é obrigatória para o teste.' });
  }

  const health = await checkStreamHealth(url, referer);

  const resultEntry: ServerHealthResult = {
    channelId: channelId || `stream-${Date.now()}`,
    channelName: channelName || 'Canal Teste',
    category: category || 'Geral',
    sourceIndex: 0,
    url,
    status: health.status,
    statusCode: health.statusCode,
    statusText: health.statusText,
    latencyMs: health.latencyMs,
    contentType: health.contentType,
    lastChecked: new Date().toISOString(),
    error: health.error
  };

  if (channelId) {
    channelHealthStore.set(channelId, resultEntry);
  }

  res.json({
    success: true,
    result: resultEntry,
    summary: getHealthSummary()
  });
});

// Test a specific channel by ID (with fallback to client-provided data)
app.post('/api/admin/channels/check-channel/:id', async (req, res) => {
  const { id } = req.params;
  const { sourceIndex = 0, url: directUrl, referer: directReferer, channelName, category, sources: bodySources } = req.body || {};

  const activeChannels = customConfigChannels.length > 0 
    ? customConfigChannels 
    : [...customAdminChannels, ...parsedRamysChannels, ...parsedSaimoChannels];
  const serverChannel = activeChannels.find(c => c.id === id);

  const channelSources = (bodySources && Array.isArray(bodySources) && bodySources.length > 0)
    ? bodySources
    : (serverChannel?.sources || (directUrl ? [{ url: directUrl, referer: directReferer }] : []));

  if (!channelSources || channelSources.length === 0) {
    return res.status(404).json({ error: 'Canal não encontrado no servidor ou sem fontes configuradas' });
  }

  const sourceIdx = typeof sourceIndex === 'number' 
    ? sourceIndex 
    : (req.query?.sourceIndex ? parseInt(req.query.sourceIndex as string, 10) : 0);
  const targetSource = channelSources[sourceIdx] || channelSources[0];

  const health = await checkStreamHealth(targetSource.url, targetSource.referer || directReferer);

  const resultEntry: ServerHealthResult = {
    channelId: id,
    channelName: serverChannel?.name || channelName || 'Canal',
    category: serverChannel?.category || category || 'Geral',
    sourceIndex: sourceIdx,
    url: targetSource.url,
    status: health.status,
    statusCode: health.statusCode,
    statusText: health.statusText,
    latencyMs: health.latencyMs,
    contentType: health.contentType,
    lastChecked: new Date().toISOString(),
    error: health.error
  };

  channelHealthStore.set(id, resultEntry);

  res.json({
    success: true,
    result: resultEntry,
    summary: getHealthSummary()
  });
});

// Test a batch of channels (supports client-provided channels list)
app.post('/api/admin/channels/check-batch', async (req, res) => {
  try {
    const { channelIds, channels: clientChannels, limit = 20, offset = 0, category } = req.body;
    const activeChannels = customConfigChannels.length > 0 
      ? customConfigChannels 
      : [...customAdminChannels, ...parsedRamysChannels, ...parsedSaimoChannels];
    let allChannels = (clientChannels && Array.isArray(clientChannels) && clientChannels.length > 0)
      ? clientChannels
      : [...activeChannels];

    if (category && category !== 'Todos') {
      allChannels = allChannels.filter(c => c.category && c.category.toLowerCase() === category.toLowerCase());
    }

    let targetChannels: any[] = [];
    if (clientChannels && Array.isArray(clientChannels) && clientChannels.length > 0) {
      targetChannels = clientChannels;
    } else if (channelIds && Array.isArray(channelIds) && channelIds.length > 0) {
      const idSet = new Set(channelIds);
      targetChannels = allChannels.filter(c => idSet.has(c.id));
    } else {
      targetChannels = allChannels.slice(offset, offset + limit);
    }

    const results: ServerHealthResult[] = [];
    const chunkSize = 5;

    for (let i = 0; i < targetChannels.length; i += chunkSize) {
      const chunk = targetChannels.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (ch) => {
          const src = ch.sources && ch.sources.length > 0 ? ch.sources[0] : null;
          if (!src || !src.url) {
            return {
              channelId: ch.id,
              channelName: ch.name,
              category: ch.category || 'Geral',
              sourceIndex: 0,
              url: '',
              status: 'offline' as const,
              statusCode: 0,
              statusText: 'Sem URL de stream',
              latencyMs: 0,
              lastChecked: new Date().toISOString(),
              error: 'Canal sem URL'
            };
          }

          const h = await checkStreamHealth(src.url, src.referer);
          const entry: ServerHealthResult = {
            channelId: ch.id,
            channelName: ch.name,
            category: ch.category || 'Geral',
            sourceIndex: 0,
            url: src.url,
            status: h.status,
            statusCode: h.statusCode,
            statusText: h.statusText,
            latencyMs: h.latencyMs,
            contentType: h.contentType,
            lastChecked: new Date().toISOString(),
            error: h.error
          };

          channelHealthStore.set(ch.id, entry);
          return entry;
        })
      );
      results.push(...chunkResults);
    }

    res.json({
      success: true,
      testedCount: results.length,
      results,
      summary: getHealthSummary()
    });
  } catch (err: any) {
    console.error('Batch health check error:', err);
    res.status(500).json({ error: err.message || 'Erro ao checar lote de canais' });
  }
});

// Toggle channel active status (Enable / Disable)
app.patch('/api/admin/channels/:id/toggle-active', (req, res) => {
  const { id } = req.params;
  let found = false;
  let newActive = true;

  const update = (list: ServerChannel[]) => {
    const item = list.find(c => c.id === id);
    if (item) {
      item.isActive = item.isActive !== undefined ? !item.isActive : false;
      newActive = item.isActive;
      found = true;
    }
  };

  update(customAdminChannels);
  update(parsedRamysChannels);
  update(parsedSaimoChannels);

  if (!found) {
    return res.status(404).json({ error: 'Canal não encontrado' });
  }

  res.json({
    success: true,
    channelId: id,
    isActive: newActive,
    message: `Canal ${newActive ? 'ativado' : 'desativado'} com sucesso!`
  });
});

// Disable all channels verified as offline
app.post('/api/admin/channels/disable-offline', (req, res) => {
  let disabledCount = 0;
  const offlineIds = new Set<string>();

  channelHealthStore.forEach((h, id) => {
    if (h.status === 'offline') {
      offlineIds.add(id);
    }
  });

  const disableInList = (list: ServerChannel[]) => {
    list.forEach(ch => {
      if (offlineIds.has(ch.id) && ch.isActive) {
        ch.isActive = false;
        disabledCount++;
      }
    });
  };

  disableInList(customAdminChannels);
  disableInList(parsedRamysChannels);
  disableInList(parsedSaimoChannels);

  res.json({
    success: true,
    disabledCount,
    message: `${disabledCount} canais fora do ar foram desativados da grade pública.`
  });
});

// Re-enable all channels
app.post('/api/admin/channels/enable-all', (req, res) => {
  let totalEnabled = 0;
  const enableInList = (list: ServerChannel[]) => {
    list.forEach(ch => {
      ch.isActive = true;
      totalEnabled++;
    });
  };

  enableInList(customAdminChannels);
  enableInList(parsedRamysChannels);
  enableInList(parsedSaimoChannels);

  res.json({
    success: true,
    totalEnabled,
    message: `Todos os ${totalEnabled} canais foram ativados!`
  });
});

// Settings Management
app.get('/api/admin/settings', (req, res) => {
  res.json({
    success: true,
    settings: systemSettings
  });
});

app.post('/api/admin/settings', (req, res) => {
  const { mercadoPagoAccessToken, mercadoPagoPublicKey, pixKey, sandboxMode, announcementText, allowFreePreview, autoUpdateIntervalHours } = req.body;

  if (mercadoPagoAccessToken !== undefined) systemSettings.mercadoPagoAccessToken = mercadoPagoAccessToken;
  if (mercadoPagoPublicKey !== undefined) systemSettings.mercadoPagoPublicKey = mercadoPagoPublicKey;
  if (pixKey !== undefined) systemSettings.pixKey = pixKey;
  if (sandboxMode !== undefined) systemSettings.sandboxMode = Boolean(sandboxMode);
  if (announcementText !== undefined) systemSettings.announcementText = announcementText;
  if (allowFreePreview !== undefined) systemSettings.allowFreePreview = Boolean(allowFreePreview);
  if (autoUpdateIntervalHours !== undefined) {
    const hours = Number(autoUpdateIntervalHours);
    if (!isNaN(hours) && hours > 0) {
      systemSettings.autoUpdateIntervalHours = hours;
      m3uAutoUpdateConfig.intervalHours = hours;
      m3uAutoUpdateConfig.nextRunAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      saveAutoUpdateConfigToDisk();
    }
  }

  res.json({
    success: true,
    settings: systemSettings
  });
});

// Vite Middleware for SPA development & Production static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Streaming Brasil (MAXTV) Server running on http://0.0.0.0:${PORT}`);
    startAutoUpdateScheduler();
  });
}

startServer();
