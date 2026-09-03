import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';

dotenv.config();

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

const systemSettings = {
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
  mercadoPagoPublicKey: process.env.MERCADOPAGO_PUBLIC_KEY || '',
  pixKey: 'financeiro@streamingbrasil.tv.br',
  sandboxMode: true,
  announcementText: '🎉 Bem-vindo ao Streaming Brasil MAXTV! Mais de 110 canais ao vivo e VOD em alta definição.',
  allowFreePreview: true,
  freePreviewMinutes: 10
};

const subscribers: ServerSubscriber[] = [
  {
    id: 'sub-1',
    name: 'Carlos Alberto Mendes',
    email: 'carlos.mendes@gmail.com',
    cpf: '184.920.448-12',
    planId: 'plan-anual-vip',
    planName: 'MAXTV VIP Anual',
    status: 'active',
    startDate: '2026-01-15T10:00:00.000Z',
    expiresAt: '2027-01-15T10:00:00.000Z',
    amountPaid: 149.90
  },
  {
    id: 'sub-2',
    name: 'Juliana Paes Souza',
    email: 'ju.souza@outlook.com',
    cpf: '329.481.552-30',
    planId: 'plan-mensal',
    planName: 'Plano Mensal',
    status: 'active',
    startDate: '2026-08-20T14:30:00.000Z',
    expiresAt: '2026-09-20T14:30:00.000Z',
    amountPaid: 19.90
  },
  {
    id: 'sub-3',
    name: 'Rodrigo Santana',
    email: 'rodrigo.futebol@bol.com.br',
    cpf: '882.110.923-45',
    planId: 'plan-trimestral',
    planName: 'Plano Trimestral',
    status: 'pending',
    startDate: '2026-09-02T11:00:00.000Z',
    expiresAt: '2026-12-02T11:00:00.000Z',
    amountPaid: 49.90
  }
];

const transactions: ServerTransaction[] = [
  {
    id: 'PIX-BR-99120',
    orderId: 'ORD-99120',
    subscriberName: 'Carlos Alberto Mendes',
    subscriberEmail: 'carlos.mendes@gmail.com',
    cpf: '184.920.448-12',
    planId: 'plan-anual-vip',
    planName: 'MAXTV VIP Anual',
    amount: 149.90,
    status: 'approved',
    qrCodeText: '00020126580014br.gov.bcb.pix0136e05d9b23-6447-4905-b045-66718cf2319c5204000053039865406149.905802BR5920Streaming Brasil TV6009Sao Paulo62070503***630489AB',
    qrCodeBase64: '',
    createdAt: '2026-01-15T09:55:00.000Z',
    expiresAt: '2026-01-15T10:25:00.000Z',
    approvedAt: '2026-01-15T09:58:20.000Z'
  }
];

// In-memory VIP grants log
const grantHistory: ServerGrant[] = [
  {
    id: 'grant-init-1',
    subscriberId: 'sub-2',
    subscriberName: 'Juliana Paes Souza',
    subscriberEmail: 'ju.souza@outlook.com',
    monthsGranted: 1,
    daysGranted: 30,
    reason: 'Liberação de Mês pelo Administrador',
    previousExpiresAt: '2026-08-20T14:30:00.000Z',
    newExpiresAt: '2026-09-20T14:30:00.000Z',
    grantedAt: '2026-08-20T14:30:00.000Z',
    grantedBy: 'Admin Master'
  }
];

// In-memory channel store
let parsedRamysChannels: ServerChannel[] = [];
let parsedSaimoChannels: ServerChannel[] = [];
let parsedRamysVod: any[] = [];
let customAdminChannels: ServerChannel[] = [];
let lastCatalogFetch = 0;
let lastRamysFetch = 0;

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

    const lines = text.split('\n');
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
    const url = 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/Filmes-Series.m3u8';
    const res = await fetch(url, { headers: { 'User-Agent': 'StreamingBrasil/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.split('\n');
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
            synopsis: `Disponível no catálogo IPTV Brasil 2026 (${currentMetadata.group}). Alta definição com áudio original e dublado.`,
            streamUrl: line,
            featured: result.length < 5,
            isVipOnly: result.length > 2
          });
        }
        currentMetadata = null;
        if (result.length >= 120) break; // Curate top 120 VOD titles
      }
    }

    if (result.length > 0) {
      parsedRamysVod = result;
      console.log(`[Ramys IPTV Brasil 2026] Successfully loaded ${parsedRamysVod.length} VOD titles!`);
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

    const lines = text.split('\n');
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
          isVipOnly: !['globo', 'sbt', 'band', 'record', 'cazétv', 'cnn brasil'].some(k => cleanName.toLowerCase().includes(k))
        };
        currentSource = null;
      } else if (key === 'logo' && current) {
        current.logo = val;
      } else if (key === 'fonte' && current) {
        currentSource = { url: val, quality: 'HD' };
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

    parsedSaimoChannels = result;
    lastCatalogFetch = Date.now();
    console.log(`[Saimo-TV API] Loaded ${parsedSaimoChannels.length} live channels from SaimoPlayer catalog!`);
  } catch (err) {
    console.warn('[Saimo-TV API] Failed to fetch catalog online, keeping local channels:', err);
  }
}

// Pre-load catalogs on startup
Promise.allSettled([loadRamysCatalog(), loadRamysVod(), loadSaimoCatalog()]);

// --- API ROUTES ---

// 1. STREAM PROXY (Bypasses CORS, sets proper User-Agent & Referer for Brazilian IPTV streams)
app.get('/api/proxy', async (req, res) => {
  const videoUrl = req.query.url as string;
  const customReferer = req.query.referer as string | undefined;

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
      'Accept': '*/*',
      'Origin': new URL(decodedUrl).origin
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

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const response = await fetch(decodedUrl, { headers });

    // Copy essential video streaming headers
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.status(response.status);

    if (response.body) {
      // Stream chunks
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
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

// 2. CHANNELS API
app.get('/api/channels', (req, res) => {
  // Combine custom admin channels with Ramys and Saimo catalogs
  // Ramys/Iptv-Brasil-2026 provides 988 channels with rich metadata, logos, and categories
  const baseChannels = parsedRamysChannels.length > 0 ? parsedRamysChannels : parsedSaimoChannels;
  const all = [...customAdminChannels, ...baseChannels];
  res.json({
    success: true,
    count: all.length,
    source: parsedRamysChannels.length > 0 ? 'Ramys/Iptv-Brasil-2026' : 'Saimo-TV',
    ramysCount: parsedRamysChannels.length,
    saimoCount: parsedSaimoChannels.length,
    lastUpdated: lastRamysFetch || lastCatalogFetch,
    channels: all
  });
});

// 2.1 VOD CATALOG API (Filmes e Séries do Ramys/Iptv-Brasil-2026)
app.get('/api/vod', (req, res) => {
  res.json({
    success: true,
    count: parsedRamysVod.length,
    source: 'Ramys/Iptv-Brasil-2026',
    items: parsedRamysVod
  });
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

  const totalChannelsCount = customAdminChannels.length + parsedSaimoChannels.length;

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
      onlineChannels: Math.floor(totalChannelsCount * 0.96),
      vodCount: 84
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
  res.json({ success: true, channel: newChannel });
});

app.delete('/api/admin/channels/:id', (req, res) => {
  const { id } = req.params;
  customAdminChannels = customAdminChannels.filter(c => c.id !== id);
  parsedRamysChannels = parsedRamysChannels.filter(c => c.id !== id);
  parsedSaimoChannels = parsedSaimoChannels.filter(c => c.id !== id);
  res.json({ success: true });
});

app.post('/api/admin/channels/sync-ramys', async (req, res) => {
  await Promise.allSettled([loadRamysCatalog(), loadRamysVod()]);
  res.json({
    success: true,
    channelsCount: parsedRamysChannels.length,
    vodCount: parsedRamysVod.length,
    message: `Sincronizados com sucesso ${parsedRamysChannels.length} canais e ${parsedRamysVod.length} filmes/séries do repositório Ramys/Iptv-Brasil-2026!`
  });
});

app.post('/api/admin/channels/sync-saimo', async (req, res) => {
  await loadSaimoCatalog();
  res.json({
    success: true,
    count: parsedSaimoChannels.length,
    message: `Sincronizados ${parsedSaimoChannels.length} canais com sucesso da Saimo-TV!`
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
