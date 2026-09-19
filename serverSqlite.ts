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

export interface SqliteUrlSaveErrorDoc {
  id: string;
  timestamp: string;
  url: string;
  sourceName?: string;
  errorType: string;
  errorMessage: string;
  statusCode?: number;
  details?: any;
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

    // 11. URL Save Error Logs Table (Monitoramento de Falhas e Diagnóstico de Persistência)
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS url_save_errors (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        url TEXT NOT NULL,
        source_name TEXT,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        status_code INTEGER,
        details_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_url_err_time ON url_save_errors(timestamp);
    `);

    // 12. Audit Logs Table (Logs de Auditoria de Ações Administrativas)
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_name TEXT NOT NULL,
        description TEXT NOT NULL,
        admin_email TEXT NOT NULL,
        admin_name TEXT NOT NULL,
        target_id TEXT,
        details_json TEXT,
        ip TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(action_type);
      CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_email);
    `);

    // 13. EPG Sources Table (Fontes de Guia de Programação XMLTV)
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS epg_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 1,
        channels_count INTEGER DEFAULT 0,
        programmes_count INTEGER DEFAULT 0,
        last_validated_at TEXT,
        last_status TEXT DEFAULT 'unknown',
        last_error TEXT,
        time_range TEXT,
        sample_channels TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS epg_ai_descriptions (
        id TEXT PRIMARY KEY,
        program_title TEXT NOT NULL,
        channel_name TEXT,
        category TEXT,
        description TEXT NOT NULL,
        tags TEXT,
        highlights TEXT,
        rating TEXT,
        created_at TEXT
      );

      -- 14. Stream Telemetry & Link Ranking (Top Funcionando)
      CREATE TABLE IF NOT EXISTS stream_telemetry (
        url TEXT PRIMARY KEY,
        channel_id TEXT,
        channel_name TEXT,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        total_play_seconds REAL DEFAULT 0,
        avg_latency_ms REAL DEFAULT 0,
        last_status TEXT DEFAULT 'online',
        last_error TEXT,
        last_tested TEXT,
        score REAL DEFAULT 100.0,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_score ON stream_telemetry(score DESC);
      CREATE INDEX IF NOT EXISTS idx_telemetry_status ON stream_telemetry(last_status);
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
function isBannedTestStream(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('test-streams.mux.dev') || url.includes('x36xhzz');
}

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
      let sources = Array.isArray(ch.sources)
        ? ch.sources.filter((s: any) => s && s.url && !isBannedTestStream(s.url))
        : [];
      let streamUrl = ch.streamUrl || '';
      let backupStreamUrl = ch.backupStreamUrl || null;

      if (isBannedTestStream(streamUrl)) {
        streamUrl = sources.length > 0 ? sources[0].url : '';
      }
      if (isBannedTestStream(backupStreamUrl)) {
        backupStreamUrl = sources.length > 1 ? sources[1].url : null;
      }
      if (!streamUrl && sources.length > 0) {
        streamUrl = sources[0].url;
      }

      stmt.run(
        ch.id,
        ch.name,
        ch.category || 'Geral',
        ch.logo || '',
        streamUrl,
        backupStreamUrl,
        ch.quality || 'HD',
        ch.epgId || null,
        ch.isVip ? 1 : 0,
        ch.isAdult ? 1 : 0,
        sources.length > 0 ? JSON.stringify(sources) : null,
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

export function sqliteGetChannelsCount(): number {
  try {
    const db = getSqliteDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM channels').get() as { count: number };
    return row ? row.count : 0;
  } catch {
    return 0;
  }
}

export function sqliteGetAllChannels(): any[] {
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM channels ORDER BY sort_order ASC, name ASC').all() as any[];
  return rows.map(r => {
    let sources = r.sources_json ? JSON.parse(r.sources_json) : undefined;
    if (Array.isArray(sources)) {
      sources = sources.filter((s: any) => s && s.url && !isBannedTestStream(s.url));
    }
    let streamUrl = r.stream_url || '';
    let backupStreamUrl = r.backup_stream_url || undefined;
    if (isBannedTestStream(streamUrl)) {
      streamUrl = (sources && sources.length > 0) ? sources[0].url : '';
    }
    if (isBannedTestStream(backupStreamUrl)) {
      backupStreamUrl = (sources && sources.length > 1) ? sources[1].url : undefined;
    }
    if (!streamUrl && sources && sources.length > 0) {
      streamUrl = sources[0].url;
    }

    return {
      id: r.id,
      name: r.name,
      category: r.category,
      logo: r.logo,
      streamUrl: streamUrl,
      backupStreamUrl: backupStreamUrl,
      quality: r.quality || 'HD',
      epgId: r.epg_id || undefined,
      isVip: Boolean(r.is_vip),
      isVipOnly: Boolean(r.is_vip),
      isActive: r.is_working !== 0,
      isAdult: Boolean(r.is_adult),
      sources: sources && sources.length > 0 ? sources : undefined,
      lastChecked: r.last_checked || undefined,
      isWorking: Boolean(r.is_working),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  });
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

// -------------------------------------------------------------
// BACKUP MANUAL E CHECKPOINT DO BANCO SQLITE (maxtv.db)
// -------------------------------------------------------------
export function sqliteCheckpointAndGetDbPath(): string {
  const db = getSqliteDb();
  try {
    // Força o checkpoint completo do WAL para garantir que todas as transações
    // estejam gravadas diretamente dentro do arquivo principal 'maxtv.db'
    db.exec('PRAGMA wal_checkpoint(FULL);');
    console.log('[SQLite 3] Checkpoint WAL executado com sucesso antes do backup.');
  } catch (e) {
    console.warn('[SQLite 3] Aviso ao executar wal_checkpoint:', e);
  }
  return DB_FILE;
}

/**
 * Importa e substitui com segurança o banco de dados SQLite principal (maxtv.db).
 * Realiza verificação de integridade do cabeçalho SQLite 3,
 * fecha a conexão atual, remove arquivos WAL/SHM obsoletos, grava o novo banco e reinicia a conexão.
 */
export function sqliteImportDatabase(buffer: Buffer): { success: boolean; error?: string; channelsCount?: number; stats?: any } {
  if (!buffer || buffer.length < 100) {
    return { success: false, error: 'Arquivo do banco de dados vazio ou corrompido.' };
  }

  // Verifica magic bytes do SQLite 3 ("SQLite format 3\0")
  const header = buffer.subarray(0, 16).toString('ascii');
  if (!header.startsWith('SQLite format 3')) {
    return { success: false, error: 'O arquivo enviado não possui cabeçalho válido do SQLite 3 (esperado "SQLite format 3").' };
  }

  try {
    // 1. Fecha conexão atual se aberta
    if (dbInstance) {
      try {
        dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        dbInstance.close();
      } catch (closeErr) {
        console.warn('[SQLite IMPORT] Aviso ao fechar banco atual:', closeErr);
      }
      dbInstance = null;
    }

    // 2. Remove arquivos WAL e SHM temporários antigos para evitar dessincronização
    const walFile = `${DB_FILE}-wal`;
    const shmFile = `${DB_FILE}-shm`;
    if (fs.existsSync(walFile)) {
      try { fs.unlinkSync(walFile); } catch {}
    }
    if (fs.existsSync(shmFile)) {
      try { fs.unlinkSync(shmFile); } catch {}
    }

    // 3. Grava o novo arquivo do banco de dados
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, buffer);
    console.log(`[SQLite IMPORT] Novo banco de dados salvo em ${DB_FILE} (${buffer.length} bytes).`);

    // 4. Reinicializa a conexão SQLite
    const initRes = initSqlite();
    if (!initRes.success) {
      return { success: false, error: `Falha ao reinicializar conexão com o banco importado: ${initRes.error}` };
    }

    // 5. Lê canais e estatísticas do novo banco
    const channels = sqliteGetAllChannels();
    const stats = sqliteGetDatabaseStats();

    return {
      success: true,
      channelsCount: channels.length,
      stats
    };
  } catch (err: any) {
    console.error('[SQLite IMPORT] Erro crítico ao importar banco:', err);
    // Tenta restabelecer conexão
    try {
      initSqlite();
    } catch {}
    return { success: false, error: `Erro ao importar banco de dados: ${err.message}` };
  }
}

export function sqliteGetDatabaseStats() {
  const db = getSqliteDb();
  let dbSizeBytes = 0;
  let walSizeBytes = 0;
  try {
    if (fs.existsSync(DB_FILE)) {
      dbSizeBytes = fs.statSync(DB_FILE).size;
    }
    const walFile = `${DB_FILE}-wal`;
    if (fs.existsSync(walFile)) {
      walSizeBytes = fs.statSync(walFile).size;
    }
  } catch (e) {}

  const counts: Record<string, number> = {};
  const tables = [
    'channels',
    'm3u_sources',
    'm3u_logs',
    'url_save_errors',
    'audit_logs',
    'device_sessions',
    'users',
    'subscribers',
    'transactions',
    'watch_progress',
    'user_favorites'
  ];
  for (const t of tables) {
    try {
      const res = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any;
      counts[t] = res?.c || 0;
    } catch {
      counts[t] = 0;
    }
  }

  return {
    dbFile: DB_FILE,
    dbSizeBytes,
    dbSizeFormatted: `${(dbSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
    walSizeBytes,
    walSizeFormatted: `${(walSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
    counts,
    timestamp: new Date().toISOString()
  };
}

// -------------------------------------------------------------
// URL SAVE ERROR LOGS (DIAGNÓSTICO DE FALHAS E PERSISTÊNCIA)
// -------------------------------------------------------------
export function sqliteSaveUrlErrorLog(entry: SqliteUrlSaveErrorDoc): void {
  const db = getSqliteDb();
  try {
    const stmt = db.prepare(`
      INSERT INTO url_save_errors (
        id, timestamp, url, source_name, error_type, error_message, status_code, details_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      entry.id,
      entry.timestamp,
      entry.url,
      entry.sourceName || null,
      entry.errorType,
      entry.errorMessage,
      entry.statusCode || null,
      entry.details ? JSON.stringify(entry.details) : null
    );

    // Mantém os 250 erros mais recentes para não inflar o banco
    db.exec(`
      DELETE FROM url_save_errors WHERE id NOT IN (
        SELECT id FROM url_save_errors ORDER BY timestamp DESC LIMIT 250
      );
    `);
  } catch (err) {
    console.error('[SQLite 3] Erro ao gravar log de falha de URL:', err);
  }
}

export function sqliteGetUrlErrorLogs(limit = 100): SqliteUrlSaveErrorDoc[] {
  const db = getSqliteDb();
  try {
    const rows = db.prepare('SELECT * FROM url_save_errors ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      url: r.url,
      sourceName: r.source_name || undefined,
      errorType: r.error_type,
      errorMessage: r.error_message,
      statusCode: r.status_code || undefined,
      details: r.details_json ? JSON.parse(r.details_json) : undefined
    }));
  } catch (err) {
    console.warn('[SQLite 3] Erro ao ler logs de erros de URL:', err);
    return [];
  }
}

export function sqliteClearUrlErrorLogs(): boolean {
  const db = getSqliteDb();
  try {
    db.exec('DELETE FROM url_save_errors;');
    return true;
  } catch (err) {
    console.error('[SQLite 3] Erro ao limpar logs de erros de URL:', err);
    return false;
  }
}

// -------------------------------------------------------------
// AUDIT LOGS (AÇÕES CRÍTICAS ADMINISTRATIVAS)
// -------------------------------------------------------------
export interface SqliteAuditLogDoc {
  id?: string;
  timestamp?: string;
  actionType: 'LINKS' | 'PAYMENTS' | 'USERS' | 'CHANNELS' | 'SETTINGS' | 'SYSTEM' | string;
  actionName: string;
  description: string;
  adminEmail: string;
  adminName?: string;
  targetId?: string;
  details?: Record<string, any>;
  ip?: string;
}

export function sqliteRecordAuditLog(entry: SqliteAuditLogDoc): void {
  const db = getSqliteDb();
  try {
    const id = entry.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = entry.timestamp || new Date().toISOString();
    const adminEmail = (entry.adminEmail || 'admin@sistema.local').toLowerCase().trim();
    const adminName = entry.adminName || (adminEmail.includes('@') ? adminEmail.split('@')[0] : 'Administrador');

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        id, timestamp, action_type, action_name, description, admin_email, admin_name, target_id, details_json, ip
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      timestamp,
      entry.actionType,
      entry.actionName,
      entry.description,
      adminEmail,
      adminName,
      entry.targetId || null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ip || null
    );

    // Mantém os 500 registros mais recentes para controle e auditoria duradoura
    db.exec(`
      DELETE FROM audit_logs WHERE id NOT IN (
        SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT 500
      );
    `);
  } catch (err) {
    console.error('[SQLite 3] Erro ao gravar log de auditoria:', err);
  }
}

export function sqliteGetAuditLogs(limit = 100, actionType?: string, search?: string): any[] {
  const db = getSqliteDb();
  try {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (actionType && actionType !== 'ALL') {
      sql += ' AND action_type = ?';
      params.push(actionType);
    }

    if (search && search.trim()) {
      sql += ' AND (description LIKE ? OR admin_email LIKE ? OR admin_name LIKE ? OR action_name LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      actionType: r.action_type,
      actionName: r.action_name,
      description: r.description,
      adminEmail: r.admin_email,
      adminName: r.admin_name,
      targetId: r.target_id || undefined,
      details: r.details_json ? JSON.parse(r.details_json) : undefined,
      ip: r.ip || undefined
    }));
  } catch (err) {
    console.warn('[SQLite 3] Erro ao buscar logs de auditoria:', err);
    return [];
  }
}

export function sqliteClearAuditLogs(): boolean {
  const db = getSqliteDb();
  try {
    db.exec('DELETE FROM audit_logs;');
    return true;
  } catch (err) {
    console.error('[SQLite 3] Erro ao limpar logs de auditoria:', err);
    return false;
  }
}

// -------------------------------------------------------------
// SESSÕES ATIVAS E MÉTRICAS EM TEMPO REAL
// -------------------------------------------------------------
export function sqliteGetRecentActiveSessions(secondsThreshold = 60): any[] {
  const db = getSqliteDb();
  try {
    // Retorna sessões cujo último heartbeat ocorreu há menos de secondsThreshold segundos
    const now = Date.now();
    const rows = db.prepare('SELECT * FROM device_sessions ORDER BY last_heartbeat DESC LIMIT 200').all() as any[];
    
    return rows
      .map(r => {
        const hbTime = new Date(r.last_heartbeat).getTime();
        const secondsAgo = Math.max(0, Math.round((now - hbTime) / 1000));
        
        let deviceType: 'TV' | 'Mobile' | 'Desktop' | 'Other' = 'Desktop';
        const ua = (r.user_agent || '').toLowerCase();
        if (ua.includes('smart-tv') || ua.includes('tizen') || ua.includes('webos') || ua.includes('androidtv') || ua.includes('googletv') || ua.includes('crkey') || ua.includes('apple tv') || ua.includes('rokutv')) {
          deviceType = 'TV';
        } else if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
          deviceType = 'Mobile';
        }

        return {
          sessionId: r.session_id,
          ip: r.ip || '127.0.0.1',
          userAgent: r.user_agent,
          isVip: Boolean(r.is_vip),
          userEmail: r.user_email || undefined,
          mediaId: r.media_id || undefined,
          mediaType: r.media_type || undefined,
          totalWatchSeconds: r.total_watch_seconds || 0,
          lastHeartbeat: r.last_heartbeat,
          secondsAgo,
          isBlocked: Boolean(r.is_blocked),
          adblockDetected: Boolean(r.adblock_detected),
          deviceType
        };
      })
      .filter(s => s.secondsAgo <= secondsThreshold);
  } catch (err) {
    console.warn('[SQLite 3] Erro ao buscar sessões ativas:', err);
    return [];
  }
}

export function sqliteGetTopWatchedChannelsFromSessions(limit = 10): any[] {
  const db = getSqliteDb();
  try {
    const rows = db.prepare(`
      SELECT 
        media_id,
        media_type,
        COUNT(session_id) as total_viewers,
        SUM(total_watch_seconds) as total_seconds
      FROM device_sessions
      WHERE media_id IS NOT NULL AND media_id != ''
      GROUP BY media_id, media_type
      ORDER BY total_viewers DESC, total_seconds DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows;
  } catch (err) {
    console.warn('[SQLite 3] Erro ao buscar top canais de sessões:', err);
    return [];
  }
}

// -------------------------------------------------------------
// EPG (XMLTV) SOURCES REPOSITORY
// -------------------------------------------------------------
export interface SqliteEpgSourceDoc {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority?: number;
  channelsCount?: number;
  programmesCount?: number;
  lastValidatedAt?: string;
  lastStatus?: 'valid' | 'invalid' | 'unknown';
  lastError?: string;
  timeRange?: string;
  sampleChannels?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export function sqliteSaveEpgSource(source: SqliteEpgSourceDoc): SqliteEpgSourceDoc {
  const db = getSqliteDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO epg_sources (
      id, name, url, enabled, priority, channels_count, programmes_count,
      last_validated_at, last_status, last_error, time_range, sample_channels, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(url) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      priority = excluded.priority,
      channels_count = excluded.channels_count,
      programmes_count = excluded.programmes_count,
      last_validated_at = excluded.last_validated_at,
      last_status = excluded.last_status,
      last_error = excluded.last_error,
      time_range = excluded.time_range,
      sample_channels = excluded.sample_channels,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    source.id,
    source.name,
    source.url.trim(),
    source.enabled ? 1 : 0,
    source.priority || 1,
    source.channelsCount || 0,
    source.programmesCount || 0,
    source.lastValidatedAt || now,
    source.lastStatus || 'valid',
    source.lastError || null,
    source.timeRange || null,
    source.sampleChannels ? JSON.stringify(source.sampleChannels) : null,
    source.createdAt || now,
    now
  );

  return source;
}

export function sqliteGetAllEpgSources(): SqliteEpgSourceDoc[] {
  const db = getSqliteDb();
  try {
    const rows = db.prepare('SELECT * FROM epg_sources ORDER BY priority ASC, created_at ASC').all() as any[];
    return rows.map(r => {
      let sampleChannels: string[] = [];
      try {
        if (r.sample_channels) sampleChannels = JSON.parse(r.sample_channels);
      } catch {}

      return {
        id: r.id,
        name: r.name,
        url: r.url,
        enabled: Boolean(r.enabled),
        priority: r.priority,
        channelsCount: r.channels_count || 0,
        programmesCount: r.programmes_count || 0,
        lastValidatedAt: r.last_validated_at || undefined,
        lastStatus: (r.last_status as any) || 'unknown',
        lastError: r.last_error || undefined,
        timeRange: r.time_range || undefined,
        sampleChannels,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    });
  } catch (err) {
    console.warn('[SQLite] Erro ao carregar fontes EPG:', err);
    return [];
  }
}

export function sqliteGetEpgSourceById(idOrUrl: string): SqliteEpgSourceDoc | null {
  const db = getSqliteDb();
  try {
    const r = db.prepare('SELECT * FROM epg_sources WHERE id = ? OR url = ?').get(idOrUrl, idOrUrl) as any;
    if (!r) return null;
    let sampleChannels: string[] = [];
    try {
      if (r.sample_channels) sampleChannels = JSON.parse(r.sample_channels);
    } catch {}

    return {
      id: r.id,
      name: r.name,
      url: r.url,
      enabled: Boolean(r.enabled),
      priority: r.priority,
      channelsCount: r.channels_count || 0,
      programmesCount: r.programmes_count || 0,
      lastValidatedAt: r.last_validated_at || undefined,
      lastStatus: (r.last_status as any) || 'unknown',
      lastError: r.last_error || undefined,
      timeRange: r.time_range || undefined,
      sampleChannels,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  } catch {
    return null;
  }
}

export function sqliteDeleteEpgSource(idOrUrl: string): boolean {
  const db = getSqliteDb();
  try {
    const stmt = db.prepare('DELETE FROM epg_sources WHERE id = ? OR url = ?');
    stmt.run(idOrUrl, idOrUrl);
    return true;
  } catch {
    return false;
  }
}

export function sqliteUpdateEpgSource(id: string, updates: Partial<SqliteEpgSourceDoc>): boolean {
  const db = getSqliteDb();
  try {
    const current = sqliteGetEpgSourceById(id);
    if (!current) return false;
    const merged = { ...current, ...updates };
    sqliteSaveEpgSource(merged);
    return true;
  } catch {
    return false;
  }
}

export interface SqliteEpgAiDescriptionDoc {
  id: string;
  programTitle: string;
  channelName?: string;
  category?: string;
  description: string;
  tags?: string[];
  highlights?: string[];
  rating?: string;
  createdAt?: string;
}

export function sqliteSaveEpgAiDescription(data: SqliteEpgAiDescriptionDoc): void {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    INSERT INTO epg_ai_descriptions (
      id, program_title, channel_name, category, description, tags, highlights, rating, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      tags = excluded.tags,
      highlights = excluded.highlights,
      rating = excluded.rating,
      created_at = excluded.created_at
  `);
  stmt.run(
    data.id,
    data.programTitle,
    data.channelName || '',
    data.category || '',
    data.description,
    JSON.stringify(data.tags || []),
    JSON.stringify(data.highlights || []),
    data.rating || 'Livre',
    data.createdAt || new Date().toISOString()
  );
}

export function sqliteGetEpgAiDescription(programTitle: string, channelName?: string): SqliteEpgAiDescriptionDoc | null {
  const db = getSqliteDb();
  if (!programTitle) return null;

  if (channelName) {
    const idWithChan = `${channelName.toLowerCase().trim()}::${programTitle.toLowerCase().trim()}`;
    const stmt = db.prepare('SELECT * FROM epg_ai_descriptions WHERE id = ? LIMIT 1');
    const row = stmt.get(idWithChan) as any;
    if (row) {
      return {
        id: row.id,
        programTitle: row.program_title,
        channelName: row.channel_name,
        category: row.category,
        description: row.description,
        tags: row.tags ? JSON.parse(row.tags) : [],
        highlights: row.highlights ? JSON.parse(row.highlights) : [],
        rating: row.rating,
        createdAt: row.created_at
      };
    }
  }

  const stmt = db.prepare('SELECT * FROM epg_ai_descriptions WHERE LOWER(program_title) = ? LIMIT 1');
  const row = stmt.get(programTitle.toLowerCase().trim()) as any;
  if (!row) return null;
  return {
    id: row.id,
    programTitle: row.program_title,
    channelName: row.channel_name,
    category: row.category,
    description: row.description,
    tags: row.tags ? JSON.parse(row.tags) : [],
    highlights: row.highlights ? JSON.parse(row.highlights) : [],
    rating: row.rating,
    createdAt: row.created_at
  };
}

export interface SqliteStreamTelemetryDoc {
  url: string;
  channelId?: string;
  channelName?: string;
  successCount: number;
  failureCount: number;
  totalPlaySeconds: number;
  avgLatencyMs: number;
  lastStatus: 'online' | 'unstable' | 'offline';
  lastError?: string;
  lastTested: string;
  score: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Salva ou atualiza telemetria de um link de stream.
 * Calcula a pontuação (score 0-100) baseada em taxa de sucesso e latência.
 * Links com score alto sobem para Opção 1 (Principal).
 */
export function sqliteRecordStreamTelemetry(data: {
  url: string;
  success: boolean;
  latencyMs?: number;
  playSeconds?: number;
  error?: string;
  channelId?: string;
  channelName?: string;
}): SqliteStreamTelemetryDoc {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const cleanUrl = (data.url || '').trim();

  const getStmt = db.prepare('SELECT * FROM stream_telemetry WHERE url = ? LIMIT 1');
  const existing = getStmt.get(cleanUrl) as any;

  let successCount = existing ? Number(existing.success_count || 0) : 0;
  let failureCount = existing ? Number(existing.failure_count || 0) : 0;
  let totalPlaySec = existing ? Number(existing.total_play_seconds || 0) : 0;
  let avgLatency = existing ? Number(existing.avg_latency_ms || 0) : 0;
  let createdAt = existing ? existing.created_at : now;

  if (data.success) {
    successCount++;
    if (typeof data.playSeconds === 'number' && data.playSeconds > 0) {
      totalPlaySec += data.playSeconds;
    }
  } else {
    failureCount++;
  }

  if (typeof data.latencyMs === 'number' && data.latencyMs > 0) {
    if (avgLatency === 0) {
      avgLatency = data.latencyMs;
    } else {
      avgLatency = Math.round((avgLatency * 0.7) + (data.latencyMs * 0.3));
    }
  }

  const totalAttempts = successCount + failureCount;
  let successRate = totalAttempts > 0 ? (successCount / totalAttempts) : 1;
  let latencyPenalty = avgLatency > 3500 ? 15 : (avgLatency > 2000 ? 5 : 0);
  let computedScore = Math.max(0, Math.min(100, Math.round((successRate * 100) - latencyPenalty)));

  let lastStatus: 'online' | 'unstable' | 'offline' = 'online';
  if (!data.success) {
    lastStatus = failureCount >= 3 ? 'offline' : 'unstable';
  } else if (avgLatency > 4500) {
    lastStatus = 'unstable';
  }

  const insertStmt = db.prepare(`
    INSERT INTO stream_telemetry (
      url, channel_id, channel_name, success_count, failure_count,
      total_play_seconds, avg_latency_ms, last_status, last_error,
      last_tested, score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      channel_id = COALESCE(excluded.channel_id, stream_telemetry.channel_id),
      channel_name = COALESCE(excluded.channel_name, stream_telemetry.channel_name),
      success_count = excluded.success_count,
      failure_count = excluded.failure_count,
      total_play_seconds = excluded.total_play_seconds,
      avg_latency_ms = excluded.avg_latency_ms,
      last_status = excluded.last_status,
      last_error = excluded.last_error,
      last_tested = excluded.last_tested,
      score = excluded.score,
      updated_at = excluded.updated_at
  `);

  insertStmt.run(
    cleanUrl,
    data.channelId || existing?.channel_id || null,
    data.channelName || existing?.channel_name || null,
    successCount,
    failureCount,
    totalPlaySec,
    avgLatency,
    lastStatus,
    data.error || null,
    now,
    computedScore,
    createdAt,
    now
  );

  return {
    url: cleanUrl,
    channelId: data.channelId || existing?.channel_id,
    channelName: data.channelName || existing?.channel_name,
    successCount,
    failureCount,
    totalPlaySeconds: totalPlaySec,
    avgLatencyMs: avgLatency,
    lastStatus,
    lastError: data.error,
    lastTested: now,
    score: computedScore,
    createdAt,
    updatedAt: now
  };
}

export function sqliteGetStreamRanking(url: string): SqliteStreamTelemetryDoc | null {
  const db = getSqliteDb();
  const stmt = db.prepare('SELECT * FROM stream_telemetry WHERE url = ? LIMIT 1');
  const row = stmt.get(url) as any;
  if (!row) return null;
  return {
    url: row.url,
    channelId: row.channel_id,
    channelName: row.channel_name,
    successCount: row.success_count,
    failureCount: row.failure_count,
    totalPlaySeconds: row.total_play_seconds,
    avgLatencyMs: row.avg_latency_ms,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastTested: row.last_tested,
    score: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function sqliteGetTopRankedStreams(limit = 100): SqliteStreamTelemetryDoc[] {
  const db = getSqliteDb();
  const stmt = db.prepare('SELECT * FROM stream_telemetry ORDER BY score DESC, success_count DESC, avg_latency_ms ASC LIMIT ?');
  const rows = stmt.all(limit) as any[];
  return rows.map(row => ({
    url: row.url,
    channelId: row.channel_id,
    channelName: row.channel_name,
    successCount: row.success_count,
    failureCount: row.failure_count,
    totalPlaySeconds: row.total_play_seconds,
    avgLatencyMs: row.avg_latency_ms,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastTested: row.last_tested,
    score: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function sqliteGetAllStreamTelemetryMap(): Map<string, { score: number; lastStatus: 'online' | 'unstable' | 'offline'; avgLatencyMs: number }> {
  const db = getSqliteDb();
  const map = new Map<string, { score: number; lastStatus: 'online' | 'unstable' | 'offline'; avgLatencyMs: number }>();
  try {
    const stmt = db.prepare('SELECT url, score, last_status, avg_latency_ms FROM stream_telemetry');
    const rows = stmt.all() as any[];
    for (const r of rows) {
      if (r.url) {
        map.set(r.url.trim().toLowerCase(), {
          score: typeof r.score === 'number' ? r.score : 100,
          lastStatus: r.last_status || 'online',
          avgLatencyMs: r.avg_latency_ms || 0
        });
      }
    }
  } catch {}
  return map;
}
