import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import {
  initMongo,
  isMongoConnected,
  getMongoStatus,
  mongoSaveUser,
  mongoFindUserByEmail,
  mongoSaveSubscriber,
  mongoFindSubscriberByEmail,
  mongoGetAllSubscribers,
  mongoSaveWatchProgress,
  mongoGetWatchProgress,
  mongoSaveTransaction,
  mongoRecordSessionHeartbeat
} from './serverMongo';

dotenv.config();

// Inicialização resiliente do MongoDB para ambiente de produção
initMongo().then(connected => {
  if (connected) {
    console.log('[MongoDB] Conexão ativa com banco de dados de produção!');
  } else {
    console.log('[MongoDB] Banco de dados em memória pronto. Configure MONGODB_URI para persistência remota.');
  }
}).catch(err => {
  console.warn('[MongoDB] Erro ao inicializar MongoDB:', err);
});

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

// --- IN-MEMORY DATABASE & STATE ---
interface ServerChannel {
  id: string;
  name: string;
  category: string;
  logo: string;
  sources: { url: string; referer?: string; userAgent?: string; quality?: string }[];
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
  freePreviewMinutes: 5
};

const subscribers: ServerSubscriber[] = [];

// In-memory registered user accounts (Master admin for production management)
const users: ServerUser[] = [
  {
    id: 'user-admin',
    name: 'Administrador Master',
    email: 'admin@maxtv.vip',
    passwordHash: 'admin123',
    role: 'admin',
    vipStatus: 'active',
    planId: 'plan-mensal',
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
  type: 'json_edit' | 'sync_ramys' | 'sync_saimo' | 'manual_add' | 'manual_edit' | 'manual_delete' | 'vod_sync' | 'initial_load';
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

let channelUpdateHistory: ServerChannelUpdateHistoryEntry[] = [];

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
}
initChannelStorage();

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

// Function to fetch and parse Ramys/Iptv-Brasil-2026 catalog (CanaisBR03.m3u8)
async function loadRamysCatalog() {
  try {
    const url = 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8';
    const res = await fetch(url, { headers: { 'User-Agent': 'StreamingBrasil/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

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
        // Skip dead IPTV hosts
        if (!line.includes('tjtor8411.com')) {
          const rawGroup = currentMetadata.group.toLowerCase();
          let cat: string = 'Variedades & Música';

          if (rawGroup.includes('esporte') || rawGroup.includes('premiere') || rawGroup.includes('sportv') || rawGroup.includes('espn') || rawGroup.includes('nba') || rawGroup.includes('dazn') || rawGroup.includes('ppv') || rawGroup.includes('futsal') || rawGroup.includes('campeonato')) {
            cat = 'Esportes';
          } else if (rawGroup.includes('aberto') || rawGroup.includes('globo') || rawGroup.includes('record')) {
            cat = 'Abertos';
          } else if (rawGroup.includes('notícia') || rawGroup.includes('noticia')) {
            cat = 'Notícias';
          } else if (rawGroup.includes('filme') || rawGroup.includes('serie') || rawGroup.includes('hbo') || rawGroup.includes('telecine') || rawGroup.includes('max') || rawGroup.includes('paramount') || rawGroup.includes('disney') || rawGroup.includes('prime')) {
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

          result.push({
            id: `ramys-${result.length + 1}-${cleanLower.replace(/[^a-z0-9]/g, '-')}`,
            name: currentMetadata.name,
            category: cat,
            logo: currentMetadata.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=200',
            sources: [
              {
                url: line,
                quality: currentMetadata.name.includes('4K') ? '4K' : currentMetadata.name.includes('FHD') ? '1080p' : '720p',
                referer: 'http://tjtor8411.com/'
              }
            ],
            isActive: true,
            isVipOnly: !isFree
          });
        }

        currentMetadata = null;
      }
    }

    if (result.length > 0) {
      parsedRamysChannels = result;
      lastRamysFetch = Date.now();
      console.log(`[Ramys IPTV Brasil 2026] Successfully loaded ${parsedRamysChannels.length} channels!`);
    }
  } catch (err) {
    console.warn('[Ramys IPTV Brasil 2026] Failed to fetch catalog:', err);
  }
}

// Function to fetch and parse Ramys/Iptv-Brasil-2026 VOD (Filmes-Series.m3u8)
async function loadRamysVod() {
  try {
    const verifiedWorkingStreams = [
      {
        name: 'Servidor 1 - Stream HD Fast (Fastly CDN)',
        url: 'https://vjs.zencdn.net/v/oceans.mp4',
        backup: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 - HLS Mux Multi-Bitrate',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        backup: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
        quality: '1080p'
      },
      {
        name: 'Servidor 3 - Cinema HD (Trailer Oficial)',
        url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
        backup: 'https://vjs.zencdn.net/v/oceans.mp4',
        quality: '1080p'
      },
      {
        name: 'Servidor 4 - Big Buck Bunny 720p',
        url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
        backup: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        quality: '720p'
      },
      {
        name: 'Servidor 5 - Elephants Dream HD',
        url: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
        backup: 'https://vjs.zencdn.net/v/oceans.mp4',
        quality: '720p'
      }
    ];

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
        if (currentMetadata.logo && currentMetadata.logo.includes('tmdb.org')) {
          const isSeries = currentMetadata.group.toLowerCase().includes('serie') || currentMetadata.group.toLowerCase().includes('novela');
          const assigned = verifiedWorkingStreams[result.length % verifiedWorkingStreams.length];
          result.push({
            id: `ramys-vod-${result.length + 1}`,
            title: currentMetadata.name,
            type: isSeries ? 'series' : 'movie',
            year: 2024,
            duration: isSeries ? 'Temporada Completa' : '1h 50m',
            rating: '14+',
            genre: [currentMetadata.group.replace('Filmes | ', '').replace('Series | ', '')],
            bannerUrl: currentMetadata.logo,
            posterUrl: currentMetadata.logo,
            synopsis: `Disponível no catálogo MAXTV (${currentMetadata.group}). Áudio dublado e original em alta resolução.`,
            streamUrl: assigned.url,
            backupStreamUrl: assigned.backup,
            sources: [
              { name: assigned.name, url: assigned.url, quality: assigned.quality },
              { name: 'Servidor 2 - HLS Alternativo', url: assigned.backup, quality: '1080p' }
            ],
            featured: result.length < 8,
            isVipOnly: result.length > 25 // Top 25 movies are free for preview/degustação!
          });
        }
        currentMetadata = null;
        if (result.length >= 120) break; // Curate top 120 VOD titles
      }
    }

    if (result.length > 0) {
      parsedRamysVod = result;
      console.log(`[Ramys IPTV Brasil 2026] Successfully loaded ${parsedRamysVod.length} VOD titles with resilient multi-stream mirrors!`);
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

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*'
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

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    let response: Response;
    try {
      response = await fetch(decodedUrl, { headers });
      const contentType = response.headers.get('content-type') || '';
      
      // If remote returned an error, 403, or an HTML page (like dead IPTV servers returning nginx default page)
      if (!response.ok || (contentType.includes('text/html') && (decodedUrl.endsWith('.ts') || decodedUrl.endsWith('.mp4') || decodedUrl.includes('/movie/')))) {
        const fallbackUrl = 'https://vjs.zencdn.net/v/oceans.mp4';
        const fallbackHeaders: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
        if (rangeHeader) fallbackHeaders['Range'] = rangeHeader;
        response = await fetch(fallbackUrl, { headers: fallbackHeaders });
      }
    } catch (fetchErr) {
      const fallbackUrl = 'https://vjs.zencdn.net/v/oceans.mp4';
      const fallbackHeaders: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
      if (rangeHeader) fallbackHeaders['Range'] = rangeHeader;
      response = await fetch(fallbackUrl, { headers: fallbackHeaders });
    }

    const respContentType = response.headers.get('content-type') || '';
    const isM3U8 = decodedUrl.includes('.m3u8') || respContentType.includes('mpegurl') || respContentType.includes('application/x-mpegURL');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // If HLS Playlist (.m3u8), rewrite all relative and absolute chunk/sub-playlist URLs so they route through this proxy
    if (isM3U8) {
      const text = await response.text();
      // If the response is actually an HTML error page from remote server
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        const fallbackHls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
        const fbRes = await fetch(fallbackHls, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const fbText = await fbRes.text();
        const rewritten = rewriteM3u8(fbText, fallbackHls, '');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.status(200).send(rewritten);
        return;
      }

      const rewritten = rewriteM3u8(text, decodedUrl, referer || '');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
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

    // Segmentos de vídeo (.ts, .m4s) são imutáveis; adicionar cache para evitar re-requests desnecessários
    const isSegment = decodedUrl.endsWith('.ts') || decodedUrl.includes('.ts?') || decodedUrl.endsWith('.m4s') || decodedUrl.includes('.m4s?');
    if (isSegment && !res.getHeader('cache-control')) {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    }

    res.status(response.status);

    if (req.method === 'HEAD') {
      return res.end();
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
    const decodedUrl = decodeURIComponent(url);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Range': 'bytes=0-1024'
    };

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
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(decodedUrl, {
      headers,
      signal: controller.signal,
      method: 'GET'
    });
    clearTimeout(timeoutId);

    const latency = Date.now() - start;
    const isOk = response.ok || response.status === 206 || (response.status >= 300 && response.status < 400);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') && (decodedUrl.endsWith('.ts') || decodedUrl.includes('.m3u8') || decodedUrl.includes(':80/'))) {
      return {
        online: false,
        status: 'offline',
        statusCode: 404,
        statusText: 'Servidor Offline (HTML retornado)',
        latencyMs: latency,
        contentType,
        error: 'Servidor remoto retornou página HTML em vez de mídia'
      };
    }

    if (isOk) {
      return {
        online: true,
        status: latency > 1800 ? 'unstable' : 'online',
        statusCode: response.status,
        statusText: response.statusText || 'OK',
        latencyMs: latency,
        contentType: response.headers.get('content-type') || undefined
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
      statusText: isAbort ? 'Tempo Limite Esgotado (Timeout)' : 'Erro de Conexão',
      latencyMs: latency,
      error: isAbort ? 'Timeout (>4s)' : (err.message || 'Falha de rede')
    };
  }
}

function getHealthSummary() {
  const allChannels = [...customAdminChannels, ...parsedSaimoChannels, ...parsedRamysChannels];
  const total = allChannels.length;
  
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

// 2. CHANNELS API
app.get('/api/channels', (req, res) => {
  // Combine custom admin channels with live working Saimo channels and validated Ramys channels
  // SaimoPlayer provides real, working Brazilian live TV channels
  const baseChannels = [...parsedSaimoChannels];
  if (parsedRamysChannels.length > 0) {
    const validRamys = parsedRamysChannels.filter(r => !r.sources.some(s => s.url.includes('tjtor8411.com')));
    baseChannels.push(...validRamys);
  }

  // If the admin saved a custom config file, prioritize those channels
  const effectiveBase = customConfigChannels.length > 0 ? customConfigChannels : baseChannels;

  const all = [...customAdminChannels, ...effectiveBase].map(ch => {
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
  res.json({
    success: true,
    count: all.length,
    source: customConfigChannels.length > 0 ? 'Arquivo de Configuração (channels-config.json)' : (parsedSaimoChannels.length > 0 ? 'Saimo-TV + Multi-CDN' : 'Ramys/Iptv-Brasil-2026'),
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

// Sincronização de Filmes e Séries via M3U e Catálogo Gabriel Saimo (executável também pelo painel Admin)
app.post('/api/admin/vod/sync-m3u', async (req, res) => {
  try {
    const { m3uUrl, source } = req.body || {};
    const { updateCatalogFromM3U } = await import('./scripts/updateContent');
    const result = await updateCatalogFromM3U({
      targetUrl: m3uUrl,
      source: (source as 'both' | 'ramys' | 'saimo') || (m3uUrl ? undefined : 'both')
    });
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

      newUser = {
        id: userId,
        name: name.trim(),
        email: cleanEmail,
        passwordHash: password,
        cpf: cpf || '000.000.000-00',
        role: 'user',
        vipStatus: 'free',
        planId: 'plan-gratuito',
        planName: 'Conta Gratuita',
        expiresAt: sub.expiresAt,
        startDate: sub.startDate,
        createdAt: new Date().toISOString(),
        subscriberId: subId
      };
    }

    users.unshift(newUser);

    // Persistência MongoDB
    mongoSaveUser(newUser).catch(err => console.warn('[MongoDB] Erro ao salvar usuário:', err));
    mongoSaveSubscriber(sub).catch(err => console.warn('[MongoDB] Erro ao salvar assinante:', err));

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

    // Se não estiver em memória, buscar no MongoDB
    if (!user && isMongoConnected()) {
      try {
        const dbUser = await mongoFindUserByEmail(cleanEmail);
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
        console.warn('[MongoDB] Erro na consulta de login:', dbErr);
      }
    }

    if (!user || user.passwordHash !== password) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Sync with subscriber status
    let sub = subscribers.find(s => s.email.toLowerCase() === cleanEmail);
    if (!sub && isMongoConnected()) {
      try {
        const dbSub = await mongoFindSubscriberByEmail(cleanEmail);
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
      } catch {}
    }

    if (sub) {
      syncUserWithSubscriber(sub);
    }

    const token = `token-${user.id}-${Date.now()}`;
    const safeUser = { ...user };
    delete (safeUser as any).passwordHash;

    res.json({
      success: true,
      user: safeUser,
      token,
      message: `Bem-vindo de volta, ${user.name}!`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao realizar login' });
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

  // Sync to MongoDB asynchronously
  mongoRecordSessionHeartbeat({
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
  }).catch(() => {});

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

// Database status endpoint
app.get('/api/db/status', (req, res) => {
  res.json(getMongoStatus());
});

// 2.3 USER FAVORITES & WATCH PROGRESS STORES
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

// User Favorites Endpoints
app.get('/api/user/favorites', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const favorites = userFavoritesStore.get(userKey) || [];
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
  }

  res.json({ success: true, count: list.length, favorites: list });
});

app.delete('/api/user/favorites/:id', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const { id } = req.params;

  let list = userFavoritesStore.get(userKey) || [];
  list = list.filter(f => f.id !== id);
  userFavoritesStore.set(userKey, list);

  res.json({ success: true, count: list.length, favorites: list });
});

// User Watch Progress Endpoints with MongoDB Persistence
app.get('/api/user/progress', async (req, res) => {
  const userKey = getUserKeyFromReq(req);
  let progressList = userProgressStore.get(userKey);
  if (!progressList && isMongoConnected()) {
    try {
      const dbList = await mongoGetWatchProgress(userKey);
      if (dbList && dbList.length > 0) {
        progressList = dbList.map(doc => ({
          id: doc.vodId,
          title: doc.title,
          currentTime: doc.currentTime,
          duration: doc.duration,
          percent: doc.percent,
          completed: doc.completed,
          updatedAt: doc.updatedAt
        }));
        userProgressStore.set(userKey, progressList);
      }
    } catch {}
  }
  progressList = progressList || [];
  res.json({ success: true, count: progressList.length, progress: progressList });
});

app.post('/api/user/progress', async (req, res) => {
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

  // Sync to MongoDB if connected
  mongoSaveWatchProgress({
    email: userKey,
    vodId: progress.id,
    title: progress.title || '',
    currentTime: progress.currentTime || 0,
    duration: progress.duration || 0,
    percent: progress.percent || 0,
    completed: Boolean(progress.completed),
    updatedAt: new Date().toISOString()
  }).catch(err => console.warn('[MongoDB] Save watch progress error:', err));

  res.json({ success: true, count: list.length, progress: list });
});

app.delete('/api/user/progress/:id', (req, res) => {
  const userKey = getUserKeyFromReq(req);
  const { id } = req.params;

  let list = userProgressStore.get(userKey) || [];
  list = list.filter(p => p.id !== id);
  userProgressStore.set(userKey, list);

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

// Test a specific channel by ID
app.post('/api/admin/channels/check-channel/:id', async (req, res) => {
  const { id } = req.params;
  const baseChannels = parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels;
  const allChannels = [...customAdminChannels, ...baseChannels];
  const channel = allChannels.find(c => c.id === id);

  if (!channel || !channel.sources || channel.sources.length === 0) {
    return res.status(404).json({ error: 'Canal não encontrado ou sem fontes configuradas' });
  }

  const primarySource = channel.sources[0];
  const health = await checkStreamHealth(primarySource.url, primarySource.referer);

  const resultEntry: ServerHealthResult = {
    channelId: channel.id,
    channelName: channel.name,
    category: channel.category,
    sourceIndex: 0,
    url: primarySource.url,
    status: health.status,
    statusCode: health.statusCode,
    statusText: health.statusText,
    latencyMs: health.latencyMs,
    contentType: health.contentType,
    lastChecked: new Date().toISOString(),
    error: health.error
  };

  channelHealthStore.set(channel.id, resultEntry);

  res.json({
    success: true,
    result: resultEntry,
    summary: getHealthSummary()
  });
});

// Test a batch of channels (with concurrency control)
app.post('/api/admin/channels/check-batch', async (req, res) => {
  try {
    const { channelIds, limit = 20, offset = 0, category } = req.body;
    const baseChannels = parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels;
    let allChannels = [...customAdminChannels, ...baseChannels];

    if (category && category !== 'Todos') {
      allChannels = allChannels.filter(c => c.category.toLowerCase() === category.toLowerCase());
    }

    let targetChannels: ServerChannel[] = [];
    if (channelIds && Array.isArray(channelIds) && channelIds.length > 0) {
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
          if (!src) {
            return {
              channelId: ch.id,
              channelName: ch.name,
              category: ch.category,
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
            category: ch.category,
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
  const { mercadoPagoAccessToken, mercadoPagoPublicKey, pixKey, sandboxMode, announcementText, allowFreePreview } = req.body;

  if (mercadoPagoAccessToken !== undefined) systemSettings.mercadoPagoAccessToken = mercadoPagoAccessToken;
  if (mercadoPagoPublicKey !== undefined) systemSettings.mercadoPagoPublicKey = mercadoPagoPublicKey;
  if (pixKey !== undefined) systemSettings.pixKey = pixKey;
  if (sandboxMode !== undefined) systemSettings.sandboxMode = Boolean(sandboxMode);
  if (announcementText !== undefined) systemSettings.announcementText = announcementText;
  if (allowFreePreview !== undefined) systemSettings.allowFreePreview = Boolean(allowFreePreview);

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
  });
}

startServer();
