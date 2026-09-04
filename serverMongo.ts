import { MongoClient, Db, Collection } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;
let isConnecting = false;
let lastError: string | null = null;

export interface MongoUserDoc {
  _id?: any;
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

export interface MongoSubscriberDoc {
  _id?: any;
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

export interface MongoWatchProgressDoc {
  _id?: any;
  userId?: string;
  email?: string;
  vodId: string;
  title: string;
  currentTime: number;
  duration: number;
  percent: number;
  completed: boolean;
  updatedAt: string;
}

export interface MongoTransactionDoc {
  _id?: any;
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
  createdAt: string;
  approvedAt?: string;
  deviceLimit?: number;
}

export interface MongoSessionDoc {
  _id?: any;
  sessionId: string;
  ip: string;
  userAgent?: string;
  isVip: boolean;
  userEmail?: string;
  mediaId: string;
  mediaType: 'channel' | 'vod';
  totalWatchSeconds: number;
  lastHeartbeat: string;
  isBlocked?: boolean;
  adblockDetected?: boolean;
}

export async function initMongo(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[MongoDB] MONGODB_URI não configurada. Operando com armazenamento em memória com persistência local de fallback.');
    return false;
  }

  if (isConnected && db) return true;
  if (isConnecting) return false;

  isConnecting = true;
  lastError = null;

  try {
    const dbName = process.env.MONGODB_DB_NAME || 'maxtv_production';
    console.log(`[MongoDB] Conectando ao MongoDB Database: ${dbName}...`);

    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(dbName);
    isConnected = true;
    isConnecting = false;
    console.log(`[MongoDB] Conexão com MongoDB "${dbName}" estabelecida com sucesso!`);

    // Create unique indexes
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('users').createIndex({ id: 1 }, { unique: true });
      await db.collection('subscribers').createIndex({ email: 1 });
      await db.collection('subscribers').createIndex({ id: 1 }, { unique: true });
      await db.collection('transactions').createIndex({ id: 1 }, { unique: true });
      await db.collection('transactions').createIndex({ orderId: 1 });
      await db.collection('watchProgress').createIndex({ email: 1, vodId: 1 });
      await db.collection('sessions').createIndex({ sessionId: 1 }, { unique: true });
    } catch (idxErr) {
      console.warn('[MongoDB] Aviso ao criar índices:', idxErr);
    }

    return true;
  } catch (err: any) {
    isConnecting = false;
    isConnected = false;
    lastError = err.message || 'Erro desconhecido ao conectar ao MongoDB';
    console.warn('[MongoDB] Falha na conexão:', lastError);
    return false;
  }
}

export function isMongoConnected(): boolean {
  return isConnected && db !== null;
}

export function getMongoStatus() {
  return {
    configured: Boolean(process.env.MONGODB_URI),
    connected: isConnected,
    dbName: process.env.MONGODB_DB_NAME || 'maxtv_production',
    error: lastError
  };
}

export function getDb(): Db | null {
  return db;
}

// User methods
export async function mongoSaveUser(user: MongoUserDoc): Promise<void> {
  if (!db || !isConnected) return;
  try {
    const col = db.collection<MongoUserDoc>('users');
    await col.updateOne(
      { email: user.email.toLowerCase() },
      { $set: { ...user, email: user.email.toLowerCase(), updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[MongoDB] Erro ao salvar usuário:', err);
  }
}

export async function mongoFindUserByEmail(email: string): Promise<MongoUserDoc | null> {
  if (!db || !isConnected) return null;
  try {
    const col = db.collection<MongoUserDoc>('users');
    return await col.findOne({ email: email.toLowerCase() });
  } catch (err) {
    console.warn('[MongoDB] Erro ao buscar usuário por email:', err);
    return null;
  }
}

export async function mongoFindUserById(id: string): Promise<MongoUserDoc | null> {
  if (!db || !isConnected) return null;
  try {
    const col = db.collection<MongoUserDoc>('users');
    return await col.findOne({ id });
  } catch (err) {
    console.warn('[MongoDB] Erro ao buscar usuário por id:', err);
    return null;
  }
}

export async function mongoGetAllUsers(): Promise<MongoUserDoc[]> {
  if (!db || !isConnected) return [];
  try {
    const col = db.collection<MongoUserDoc>('users');
    return await col.find({}).toArray();
  } catch (err) {
    console.warn('[MongoDB] Erro ao listar usuários:', err);
    return [];
  }
}

// Subscriber methods
export async function mongoSaveSubscriber(sub: MongoSubscriberDoc): Promise<void> {
  if (!db || !isConnected) return;
  try {
    const col = db.collection<MongoSubscriberDoc>('subscribers');
    await col.updateOne(
      { email: sub.email.toLowerCase() },
      { $set: { ...sub, email: sub.email.toLowerCase(), updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[MongoDB] Erro ao salvar assinante:', err);
  }
}

export async function mongoGetAllSubscribers(): Promise<MongoSubscriberDoc[]> {
  if (!db || !isConnected) return [];
  try {
    const col = db.collection<MongoSubscriberDoc>('subscribers');
    return await col.find({}).toArray();
  } catch (err) {
    console.warn('[MongoDB] Erro ao listar assinantes:', err);
    return [];
  }
}

export async function mongoFindSubscriberByEmail(email: string): Promise<MongoSubscriberDoc | null> {
  if (!db || !isConnected) return null;
  try {
    const col = db.collection<MongoSubscriberDoc>('subscribers');
    return await col.findOne({ email: email.toLowerCase() });
  } catch (err) {
    console.warn('[MongoDB] Erro ao buscar assinante por email:', err);
    return null;
  }
}

// Watch Progress methods
export async function mongoSaveWatchProgress(prog: MongoWatchProgressDoc): Promise<void> {
  if (!db || !isConnected) return;
  try {
    const col = db.collection<MongoWatchProgressDoc>('watchProgress');
    const filter = prog.email 
      ? { email: prog.email.toLowerCase(), vodId: prog.vodId }
      : { userId: prog.userId, vodId: prog.vodId };
    await col.updateOne(
      filter,
      { $set: { ...prog, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[MongoDB] Erro ao salvar progresso de vídeo:', err);
  }
}

export async function mongoGetWatchProgress(email?: string, userId?: string): Promise<MongoWatchProgressDoc[]> {
  if (!db || !isConnected) return [];
  try {
    const col = db.collection<MongoWatchProgressDoc>('watchProgress');
    const filter = email 
      ? { email: email.toLowerCase() } 
      : userId 
        ? { userId } 
        : {};
    return await col.find(filter).sort({ updatedAt: -1 }).toArray();
  } catch (err) {
    console.warn('[MongoDB] Erro ao buscar progresso:', err);
    return [];
  }
}

// Transaction methods
export async function mongoSaveTransaction(tx: MongoTransactionDoc): Promise<void> {
  if (!db || !isConnected) return;
  try {
    const col = db.collection<MongoTransactionDoc>('transactions');
    await col.updateOne(
      { id: tx.id },
      { $set: tx },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[MongoDB] Erro ao salvar transação:', err);
  }
}

export async function mongoGetAllTransactions(): Promise<MongoTransactionDoc[]> {
  if (!db || !isConnected) return [];
  try {
    const col = db.collection<MongoTransactionDoc>('transactions');
    return await col.find({}).sort({ createdAt: -1 }).toArray();
  } catch (err) {
    console.warn('[MongoDB] Erro ao buscar transações:', err);
    return [];
  }
}

export interface MongoSessionParams {
  sessionId: string;
  ip: string;
  userAgent?: string;
  isVip: boolean;
  userEmail?: string;
  mediaId: string;
  mediaType: 'channel' | 'vod';
  totalWatchSeconds: number;
  lastHeartbeat?: string;
  isBlocked?: boolean;
  adblockDetected?: boolean;
}

// Session Heartbeat & Anti-Bypass methods
export async function mongoRecordSessionHeartbeat(
  paramsOrSessionId: MongoSessionParams | string,
  ip?: string,
  mediaId?: string,
  mediaType?: 'channel' | 'vod',
  isVip?: boolean,
  deltaSeconds?: number,
  userEmail?: string,
  adblockDetected?: boolean
): Promise<{ totalWatchSeconds: number; isLimitExceeded: boolean }> {
  if (!db || !isConnected) {
    return { totalWatchSeconds: 0, isLimitExceeded: false };
  }

  try {
    const col = db.collection<any>('sessions');
    const now = new Date().toISOString();

    if (typeof paramsOrSessionId === 'object') {
      const params = paramsOrSessionId;
      await col.updateOne(
        { sessionId: params.sessionId },
        { $set: { ...params, lastHeartbeat: params.lastHeartbeat || now } },
        { upsert: true }
      );
      return { totalWatchSeconds: params.totalWatchSeconds, isLimitExceeded: Boolean(params.isBlocked) };
    } else {
      const sessionId = paramsOrSessionId;
      const existing = await col.findOne({ sessionId });
      const currentTotal = (existing?.totalWatchSeconds || 0) + (isVip ? 0 : (deltaSeconds || 0));
      const isLimitExceeded = !isVip && currentTotal >= 300;

      await col.updateOne(
        { sessionId },
        {
          $set: {
            ip,
            mediaId,
            mediaType,
            isVip,
            userEmail,
            totalWatchSeconds: currentTotal,
            lastHeartbeat: now,
            isBlocked: isLimitExceeded,
            adblockDetected: Boolean(adblockDetected)
          }
        },
        { upsert: true }
      );

      return { totalWatchSeconds: currentTotal, isLimitExceeded };
    }
  } catch (err) {
    console.warn('[MongoDB] Erro ao registrar heartbeat de sessão:', err);
    return { totalWatchSeconds: 0, isLimitExceeded: false };
  }
}
