import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

export interface SqliteUserDoc {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  cpf?: string;
  role: 'admin' | 'user';
  vipStatus: 'active' | 'pending' | 'expired' | 'none' | 'free';
  planId?: string;
  planName?: string;
  startDate?: string;
  expiresAt?: string;
  createdAt: string;
  subscriberId?: string;
  deviceLimit?: number;
  activeDeviceId?: string;
  updatedAt?: string;
}

export interface SqliteSubscriberDoc {
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
  deviceLimit?: number;
  updatedAt?: string;
}

export interface SqliteM3uSourceDoc {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SqliteWatchProgressDoc {
  id?: string;
  userId?: string;
  email: string;
  vodId: string;
  title: string;
  currentTime: number;
  duration: number;
  percent: number;
  completed: boolean;
  updatedAt: string;
}

export interface SqliteTransactionDoc {
  id: string;
  txid?: string;
  customerName: string;
  customerEmail: string;
  customerCpf: string;
  planId: string;
  planName: string;
  amount: number;
  status: string;
  pixCopyPaste?: string;
  qrCodeBase64?: string;
  createdAt: string;
  paidAt?: string;
  updatedAt?: string;
}

export interface SqliteSessionHeartbeatDoc {
  sessionId: string;
  ip?: string;
  userAgent?: string;
  isVip: boolean;
  userEmail?: string;
  mediaId?: string;
  mediaType?: string;
  totalWatchSeconds: number;
  lastHeartbeat: string;
  isBlocked: boolean;
  adblockDetected: boolean;
}

let dbInstance: DatabaseSync | null = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'maxtv.db');

export function initSqlite(): { success: boolean; dbPath: string; error?: string } {
  try {
    if (dbInstance) {
      return { success: true, dbPath: DB_FILE };
    }

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    dbInstance = new DatabaseSync(DB_FILE);

    // Performance and concurrency optimizations (WAL mode, fast sync)
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');

    // 1. Users Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        cpf TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        vip_status TEXT NOT NULL DEFAULT 'free',
        plan_id TEXT,
        plan_name TEXT,
        start_date TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        subscriber_id TEXT,
        device_limit INTEGER DEFAULT 1,
        active_device_id TEXT,
        updated_at TEXT
      );
    `);

    // 2. Subscribers Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        cpf TEXT,
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        start_date TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        amount_paid REAL DEFAULT 0,
        device_limit INTEGER DEFAULT 1,
        updated_at TEXT
      );
    `);

    // 3. Channels Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        logo TEXT,
        stream_url TEXT NOT NULL,
        backup_stream_url TEXT,
        quality TEXT,
        epg_id TEXT,
        is_vip INTEGER DEFAULT 0,
        is_adult INTEGER DEFAULT 0,
        sources_json TEXT,
        last_checked TEXT,
        is_working INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    // 4. M3U Auto-Update Sources Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS m3u_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    // 5. M3U Auto-Update Settings (Singleton key='main')
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS m3u_config (
        key TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        interval_hours INTEGER DEFAULT 24,
        last_run_at TEXT,
        next_run_at TEXT,
        last_status TEXT,
        last_message TEXT,
        updated_at TEXT
      );
    `);

    // 6. M3U Import Logs Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS m3u_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        channels_found INTEGER DEFAULT 0,
        new_added INTEGER DEFAULT 0,
        merged_backups INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        message TEXT,
        duration_ms INTEGER DEFAULT 0,
        details_json TEXT
      );
    `);

    // 7. Watch Progress Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS watch_progress (
        id TEXT PRIMARY KEY,
        user_key TEXT NOT NULL,
        vod_id TEXT NOT NULL,
        title TEXT NOT NULL,
        current_time REAL DEFAULT 0,
        duration REAL DEFAULT 0,
        percent REAL DEFAULT 0,
        completed INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_watch_user ON watch_progress(user_key);
    `);

    // 8. User Favorites Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id TEXT PRIMARY KEY,
        user_key TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fav_user ON user_favorites(user_key);
    `);

    // 9. Transactions Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        txid TEXT,
        customer_name TEXT,
        customer_email TEXT,
        customer_cpf TEXT,
        plan_id TEXT,
        plan_name TEXT,
        amount REAL,
        status TEXT,
        pix_copy_paste TEXT,
        qr_code_base64 TEXT,
        created_at TEXT,
        paid_at TEXT,
        updated_at TEXT
      );
    `);

    // 10. Device Sessions Table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS device_sessions (
        session_id TEXT PRIMARY KEY,
        ip TEXT,
        user_agent TEXT,
        is_vip INTEGER DEFAULT 0,
        user_email TEXT,
        media_id TEXT,
        media_type TEXT,
        total_watch_seconds INTEGER DEFAULT 0,
        last_heartbeat TEXT,
        is_blocked INTEGER DEFAULT 0,
        adblock_detected INTEGER DEFAULT 0
      );
    `);

    console.log('[SQLite] Banco de dados SQLite 3 inicializado com sucesso em:', DB_FILE);
    return { success: true, dbPath: DB_FILE };
  } catch (err: any) {
    console.error('[SQLite] Erro crítico ao inicializar banco de dados SQLite:', err);
    return { success: false, dbPath: DB_FILE, error: err.message };
  }
}

export function getSqliteDb(): DatabaseSync {
  if (!dbInstance) {
    initSqlite();
  }
  if (!dbInstance) {
    throw new Error('Falha ao instanciar banco de dados SQLite.');
  }
  return dbInstance;
}

export function isSqliteConnected(): boolean {
  return dbInstance !== null;
}

// -------------------------------------------------------------
// STATUS & METRICS
// -------------------------------------------------------------
export function getSqliteStatus() {
  try {
    const db = getSqliteDb();
    let sizeBytes = 0;
    try {
      const stats = fs.statSync(DB_FILE);
      sizeBytes = stats.size;
    } catch {}

    const countUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
    const countSubscribers = (db.prepare('SELECT COUNT(*) as count FROM subscribers').get() as any)?.count || 0;
    const countChannels = (db.prepare('SELECT COUNT(*) as count FROM channels').get() as any)?.count || 0;
    const countSources = (db.prepare('SELECT COUNT(*) as count FROM m3u_sources').get() as any)?.count || 0;
    const countLogs = (db.prepare('SELECT COUNT(*) as count FROM m3u_logs').get() as any)?.count || 0;
    const countProgress = (db.prepare('SELECT COUNT(*) as count FROM watch_progress').get() as any)?.count || 0;
    const countFavorites = (db.prepare('SELECT COUNT(*) as count FROM user_favorites').get() as any)?.count || 0;
    const countTransactions = (db.prepare('SELECT COUNT(*) as count FROM transactions').get() as any)?.count || 0;

    return {
      database: 'SQLite 3 (Embutido / Persistência Local Permanente)',
      driver: 'node:sqlite (DatabaseSync / Zero Dependências Externas)',
      connected: true,
      file: DB_FILE,
      sizeBytes,
      sizeFormatted: `${(sizeBytes / 1024).toFixed(1)} KB`,
      journalMode: 'WAL (Write-Ahead Logging)',
      tables: {
        users: countUsers,
        subscribers: countSubscribers,
        channels: countChannels,
        m3uSources: countSources,
        m3uLogs: countLogs,
        watchProgress: countProgress,
        favorites: countFavorites,
        transactions: countTransactions
      }
    };
  } catch (err: any) {
    return {
      database: 'SQLite 3',
      connected: false,
      error: err.message
    };
  }
}

// -------------------------------------------------------------
// USERS CRUD
// -------------------------------------------------------------
export function sqliteSaveUser(user: SqliteUserDoc): SqliteUserDoc {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, cpf, role, vip_status, plan_id, plan_name,
      start_date, expires_at, created_at, subscriber_id, device_limit, active_device_id, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      cpf = excluded.cpf,
      role = excluded.role,
      vip_status = excluded.vip_status,
      plan_id = excluded.plan_id,
      plan_name = excluded.plan_name,
      start_date = excluded.start_date,
      expires_at = excluded.expires_at,
      subscriber_id = excluded.subscriber_id,
      device_limit = excluded.device_limit,
      active_device_id = excluded.active_device_id,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    user.id,
    user.name,
    user.email.toLowerCase().trim(),
    user.passwordHash,
    user.cpf || '000.000.000-00',
    user.role || 'user',
    user.vipStatus || 'free',
    user.planId || null,
    user.planName || null,
    user.startDate || null,
    user.expiresAt || null,
    user.createdAt || now,
    user.subscriberId || null,
    user.deviceLimit || 1,
    user.activeDeviceId || null,
    now
  );

  return user;
}

export function sqliteFindUserByEmail(email: string): SqliteUserDoc | null {
  const db = getSqliteDb();
  const cleanEmail = email.toLowerCase().trim();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    cpf: row.cpf,
    role: row.role,
    vipStatus: row.vip_status,
    planId: row.plan_id,
    planName: row.plan_name,
    startDate: row.start_date,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    subscriberId: row.subscriber_id,
    deviceLimit: row.device_limit,
    activeDeviceId: row.active_device_id,
    updatedAt: row.updated_at
  };
}

export function sqliteGetAllUsers(): SqliteUserDoc[] {
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    cpf: row.cpf,
    role: row.role,
    vipStatus: row.vip_status,
    planId: row.plan_id,
    planName: row.plan_name,
    startDate: row.start_date,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    subscriberId: row.subscriber_id,
    deviceLimit: row.device_limit,
    activeDeviceId: row.active_device_id,
    updatedAt: row.updated_at
  }));
}

// -------------------------------------------------------------
// SUBSCRIBERS CRUD
// -------------------------------------------------------------
export function sqliteSaveSubscriber(sub: SqliteSubscriberDoc): SqliteSubscriberDoc {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO subscribers (
      id, name, email, cpf, plan_id, plan_name, status,
      start_date, expires_at, amount_paid, device_limit, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      cpf = excluded.cpf,
      plan_id = excluded.plan_id,
      plan_name = excluded.plan_name,
      status = excluded.status,
      start_date = excluded.start_date,
      expires_at = excluded.expires_at,
      amount_paid = excluded.amount_paid,
      device_limit = excluded.device_limit,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    sub.id,
    sub.name,
    sub.email.toLowerCase().trim(),
    sub.cpf || '000.000.000-00',
    sub.planId,
    sub.planName,
    sub.status || 'active',
    sub.startDate,
    sub.expiresAt,
    sub.amountPaid || 0,
    sub.deviceLimit || 1,
    now
  );

  return sub;
}

export function sqliteFindSubscriberByEmail(email: string): SqliteSubscriberDoc | null {
  const db = getSqliteDb();
  const cleanEmail = email.toLowerCase().trim();
  const row = db.prepare('SELECT * FROM subscribers WHERE email = ?').get(cleanEmail) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    cpf: row.cpf,
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    startDate: row.start_date,
    expiresAt: row.expires_at,
    amountPaid: row.amount_paid,
    deviceLimit: row.device_limit,
    updatedAt: row.updated_at
  };
}

export function sqliteGetAllSubscribers(): SqliteSubscriberDoc[] {
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM subscribers ORDER BY start_date DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    cpf: row.cpf,
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    startDate: row.start_date,
    expiresAt: row.expires_at,
    amountPaid: row.amount_paid,
    deviceLimit: row.device_limit,
    updatedAt: row.updated_at
  }));
}

export function sqliteDeleteSubscriber(id: string): boolean {
  const db = getSqliteDb();
  const stmt = db.prepare('DELETE FROM subscribers WHERE id = ?');
  stmt.run(id);
  return true;
}

// -------------------------------------------------------------
// M3U SOURCES CRUD
// -------------------------------------------------------------
export function sqliteSaveM3uSource(source: SqliteM3uSourceDoc): SqliteM3uSourceDoc {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO m3u_sources (id, name, url, enabled, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      priority = excluded.priority,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    source.id,
    source.name,
    source.url.trim(),
    source.enabled ? 1 : 0,
    source.priority || 1,
    source.createdAt || now,
    now
  );

  return source;
}

export function sqliteGetAllM3uSources(): SqliteM3uSourceDoc[] {
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM m3u_sources ORDER BY priority ASC, created_at ASC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: Boolean(row.enabled),
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function sqliteDeleteM3uSource(idOrUrl: string): boolean {
  const db = getSqliteDb();
  const stmt = db.prepare('DELETE FROM m3u_sources WHERE id = ? OR url = ?');
  stmt.run(idOrUrl, idOrUrl);
  return true;
}

// -------------------------------------------------------------
// M3U AUTO-UPDATE CONFIG (SINGLETON)
// -------------------------------------------------------------
export interface SqliteM3uAutoUpdateConfig {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string;
  lastMessage: string;
}

export function sqliteSaveAutoUpdateConfig(config: Partial<SqliteM3uAutoUpdateConfig>): SqliteM3uAutoUpdateConfig {
  const db = getSqliteDb();
  const current = sqliteGetAutoUpdateConfig();
  const merged = { ...current, ...config };
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO m3u_config (key, enabled, interval_hours, last_run_at, next_run_at, last_status, last_message, updated_at)
    VALUES ('main', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      enabled = excluded.enabled,
      interval_hours = excluded.interval_hours,
      last_run_at = excluded.last_run_at,
      next_run_at = excluded.next_run_at,
      last_status = excluded.last_status,
      last_message = excluded.last_message,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    merged.enabled ? 1 : 0,
    merged.intervalHours,
    merged.lastRunAt || null,
    merged.nextRunAt || null,
    merged.lastStatus || 'idle',
    merged.lastMessage || '',
    now
  );

  return merged;
}

export function sqliteGetAutoUpdateConfig(): SqliteM3uAutoUpdateConfig {
  const db = getSqliteDb();
  const row = db.prepare('SELECT * FROM m3u_config WHERE key = \'main\'').get() as any;
  if (!row) {
    return {
      enabled: true,
      intervalHours: 24,
      lastRunAt: null,
      nextRunAt: null,
      lastStatus: 'idle',
      lastMessage: 'Configuração padrão inicializada via SQLite.'
    };
  }

  return {
    enabled: Boolean(row.enabled),
    intervalHours: row.interval_hours,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastStatus: row.last_status,
    lastMessage: row.last_message
  };
}

// -------------------------------------------------------------
// M3U IMPORT LOGS
// -------------------------------------------------------------
export function sqliteSaveM3uLog(log: {
  id: string;
  timestamp: string;
  sourceName: string;
  sourceUrl: string;
  channelsFound: number;
  newAdded: number;
  mergedBackups: number;
  status: 'success' | 'warning' | 'error';
  message: string;
  durationMs: number;
  details?: any;
}) {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    INSERT INTO m3u_logs (
      id, timestamp, source_name, source_url, channels_found,
      new_added, merged_backups, status, message, duration_ms, details_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  stmt.run(
    log.id,
    log.timestamp,
    log.sourceName,
    log.sourceUrl,
    log.channelsFound || 0,
    log.newAdded || 0,
    log.mergedBackups || 0,
    log.status,
    log.message || '',
    log.durationMs || 0,
    log.details ? JSON.stringify(log.details) : null
  );

  // Keep latest 200 logs
  db.exec(`
    DELETE FROM m3u_logs WHERE id NOT IN (
      SELECT id FROM m3u_logs ORDER BY timestamp DESC LIMIT 200
    );
  `);
}

export function sqliteGetM3uLogs(limit = 100): any[] {
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM m3u_logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    timestamp: r.timestamp,
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    channelsFound: r.channels_found,
    newAdded: r.new_added,
    mergedBackups: r.merged_backups,
    status: r.status,
    message: r.message,
    durationMs: r.duration_ms,
    details: r.details_json ? JSON.parse(r.details_json) : undefined
  }));
}

// -------------------------------------------------------------
// CHANNELS CRUD (PERSISTÊNCIA SQLITE PARA A GRADE DE CANAIS)
// -------------------------------------------------------------
export function sqliteSaveAllChannels(channels: any[]): void {
  const db = getSqliteDb();
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT INTO channels (
        id, name, category, logo, stream_url, backup_stream_url,
        quality, epg_id, is_vip, is_adult, sources_json,
        last_checked, is_working, sort_order, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        logo = excluded.logo,
        stream_url = excluded.stream_url,
        backup_stream_url = excluded.backup_stream_url,
        quality = excluded.quality,
        epg_id = excluded.epg_id,
        is_vip = excluded.is_vip,
        is_adult = excluded.is_adult,
        sources_json = excluded.sources_json,
        last_checked = excluded.last_checked,
        is_working = excluded.is_working,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `);

    let index = 0;
    for (const ch of channels) {
      stmt.run(
        ch.id,
        ch.name,
        ch.category || 'Geral',
        ch.logo || '',
        ch.streamUrl || '',
        ch.backupStreamUrl || null,
        ch.quality || 'HD',
        ch.epgId || null,
        ch.isVip ? 1 : 0,
        ch.isAdult ? 1 : 0,
        ch.sources ? JSON.stringify(ch.sources) : null,
        ch.lastChecked || now,
        ch.isWorking === false ? 0 : 1,
        index++,
        ch.createdAt || now,
        now
      );
    }
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
}

export function sqliteGetAllChannels(): any[] {
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM channels ORDER BY sort_order ASC, name ASC').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    logo: r.logo,
    streamUrl: r.stream_url,
    backupStreamUrl: r.backup_stream_url || undefined,
    quality: r.quality || 'HD',
    epgId: r.epg_id || undefined,
    isVip: Boolean(r.is_vip),
    isAdult: Boolean(r.is_adult),
    sources: r.sources_json ? JSON.parse(r.sources_json) : undefined,
    lastChecked: r.last_checked || undefined,
    isWorking: Boolean(r.is_working),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

// -------------------------------------------------------------
// WATCH PROGRESS & FAVORITES
// -------------------------------------------------------------
export function sqliteSaveWatchProgress(doc: SqliteWatchProgressDoc): void {
  const db = getSqliteDb();
  const id = `${doc.email}_${doc.vodId}`;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO watch_progress (
      id, user_key, vod_id, title, current_time, duration, percent, completed, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      current_time = excluded.current_time,
      duration = excluded.duration,
      percent = excluded.percent,
      completed = excluded.completed,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    id,
    doc.email.toLowerCase().trim(),
    doc.vodId,
    doc.title,
    doc.currentTime || 0,
    doc.duration || 0,
    doc.percent || 0,
    doc.completed ? 1 : 0,
    doc.updatedAt || now
  );
}

export function sqliteGetWatchProgress(userKey: string): any[] {
  const db = getSqliteDb();
  const rows = db.prepare(`
    SELECT * FROM watch_progress
    WHERE user_key = ?
    ORDER BY updated_at DESC
    LIMIT 50
  `).all(userKey.toLowerCase().trim()) as any[];

  return rows.map(r => ({
    id: r.vod_id,
    vodId: r.vod_id,
    title: r.title,
    currentTime: r.current_time,
    duration: r.duration,
    percent: r.percent,
    completed: Boolean(r.completed),
    updatedAt: r.updated_at
  }));
}

export function sqliteDeleteWatchProgress(userKey: string, vodId: string): void {
  const db = getSqliteDb();
  const id = `${userKey.toLowerCase().trim()}_${vodId}`;
  db.prepare('DELETE FROM watch_progress WHERE id = ?').run(id);
}

// Favorites
export function sqliteSaveFavorite(userKey: string, item: any): void {
  const db = getSqliteDb();
  const id = `${userKey.toLowerCase().trim()}_${item.id}`;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO user_favorites (id, user_key, item_id, item_json, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_json = excluded.item_json
  `);

  stmt.run(id, userKey.toLowerCase().trim(), item.id, JSON.stringify(item), now);
}

export function sqliteGetFavorites(userKey: string): any[] {
  const db = getSqliteDb();
  const rows = db.prepare(`
    SELECT item_json FROM user_favorites
    WHERE user_key = ?
    ORDER BY created_at DESC
  `).all(userKey.toLowerCase().trim()) as any[];

  return rows.map(r => JSON.parse(r.item_json));
}

export function sqliteDeleteFavorite(userKey: string, itemId: string): void {
  const db = getSqliteDb();
  const id = `${userKey.toLowerCase().trim()}_${itemId}`;
  db.prepare('DELETE FROM user_favorites WHERE id = ?').run(id);
}

// -------------------------------------------------------------
// TRANSACTIONS & SESSIONS
// -------------------------------------------------------------
export function sqliteSaveTransaction(tx: SqliteTransactionDoc): void {
  const db = getSqliteDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO transactions (
      id, txid, customer_name, customer_email, customer_cpf, plan_id, plan_name,
      amount, status, pix_copy_paste, qr_code_base64, created_at, paid_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      paid_at = excluded.paid_at,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    tx.id,
    tx.txid || null,
    tx.customerName,
    tx.customerEmail.toLowerCase().trim(),
    tx.customerCpf,
    tx.planId,
    tx.planName,
    tx.amount || 0,
    tx.status || 'pending',
    tx.pixCopyPaste || null,
    tx.qrCodeBase64 || null,
    tx.createdAt || now,
    tx.paidAt || null,
    now
  );
}

export function sqliteGetAllTransactions(): any[] {
  const db = getSqliteDb();
  return db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
}

export function sqliteRecordSessionHeartbeat(hb: SqliteSessionHeartbeatDoc): void {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    INSERT INTO device_sessions (
      session_id, ip, user_agent, is_vip, user_email, media_id, media_type,
      total_watch_seconds, last_heartbeat, is_blocked, adblock_detected
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(session_id) DO UPDATE SET
      total_watch_seconds = excluded.total_watch_seconds,
      last_heartbeat = excluded.last_heartbeat,
      is_blocked = excluded.is_blocked,
      adblock_detected = excluded.adblock_detected
  `);

  stmt.run(
    hb.sessionId,
    hb.ip || null,
    hb.userAgent || null,
    hb.isVip ? 1 : 0,
    hb.userEmail ? hb.userEmail.toLowerCase().trim() : null,
    hb.mediaId || null,
    hb.mediaType || null,
    hb.totalWatchSeconds || 0,
    hb.lastHeartbeat,
    hb.isBlocked ? 1 : 0,
    hb.adblockDetected ? 1 : 0
  );
}
