import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import readline from 'readline';
import { sqliteGetAllM3uSources } from '../serverSqlite';

/**
 * ==============================================================================
 * SCRIPT DE ATUALIZAÇÃO AUTOMATIZADA DE FILMES E SÉRIES (MAXTV)
 * ==============================================================================
 * Utiliza EXCLUSIVAMENTE as listas M3U/M3U8 cadastradas manualmente pelo
 * administrador no banco de dados local SQLite (ou URL customizada informada).
 * ==============================================================================
 */

export interface ExtractedVodItem {
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
  sources: { name: string; url: string; quality?: string }[];
  featured?: boolean;
  isVipOnly?: boolean;
}

export function cleanTitle(rawName: string): { title: string; year: number } {
  let name = rawName.trim();

  // Extrair ano como (2024), [2023], ou 2022
  let year = new Date().getFullYear();
  const yearMatch = name.match(/[\(\[\s](19\d{2}|20\d{2})[\)\]\s]?/);
  if (yearMatch && yearMatch[1]) {
    year = parseInt(yearMatch[1], 10);
    name = name.replace(yearMatch[0], ' ');
  }

  // Limpar tags comuns de IPTV
  name = name
    .replace(/^FILMES?\s*\|\s*/i, '')
    .replace(/^S[ÉE]RIES?\s*\|\s*/i, '')
    .replace(/^FHD\s*\|\s*/i, '')
    .replace(/^HD\s*\|\s*/i, '')
    .replace(/^4K\s*\|\s*/i, '')
    .replace(/\s*\(?(DUBLADO|LEGENDADO|NACIONAL|DUAL|MULTI)\)?/gi, '')
    .replace(/\s*\(?(FHD|HD|4K|1080p|720p)\)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { title: name || rawName, year };
}

export function detectGenre(group: string, title: string): string[] {
  const text = `${group} ${title}`.toLowerCase();
  const genres: string[] = [];

  if (text.includes('aç') || text.includes('ac')) genres.push('Ação');
  if (text.includes('aventura')) genres.push('Aventura');
  if (text.includes('coméd') || text.includes('comed')) genres.push('Comédia');
  if (text.includes('drama')) genres.push('Drama');
  if (text.includes('terror') || text.includes('horror')) genres.push('Terror');
  if (text.includes('suspense') || text.includes('thriller')) genres.push('Suspense');
  if (text.includes('ficç') || text.includes('ficc') || text.includes('sci-fi')) genres.push('Ficção Científica');
  if (text.includes('anim') || text.includes('desenho')) genres.push('Animação');
  if (text.includes('romance')) genres.push('Romance');
  if (text.includes('docum')) genres.push('Documentário');
  if (text.includes('polic') || text.includes('crime')) genres.push('Policial');
  if (text.includes('guerra')) genres.push('Guerra');
  if (text.includes('fantasia')) genres.push('Fantasia');
  if (text.includes('famíl') || text.includes('famil')) genres.push('Família');
  if (text.includes('lançam') || text.includes('lancam') || text.includes('cinema') || text.includes('2024') || text.includes('2025') || text.includes('2026')) {
    genres.unshift('Lançamentos');
  }

  if (genres.length === 0) {
    genres.push(group ? group.replace(/^Filmes\s*\|\s*/i, '').trim() : 'Geral');
  }

  return Array.from(new Set(genres));
}

/**
 * Baixa e analisa lista M3U / M3U8 de forma ultra-rápida via Streaming
 */
export async function fetchM3UVod(url: string, limit: number = 300): Promise<ExtractedVodItem[]> {
  console.log(`[M3U VOD] Baixando lista M3U/M3U8 via streaming: ${url}...`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao carregar lista M3U: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('Corpo de resposta vazio');
    }

    const nodeStream = Readable.fromWeb(res.body as any);
    const rl = readline.createInterface({
      input: nodeStream,
      crlfDelay: Infinity
    });

    const items: ExtractedVodItem[] = [];
    let currentMetadata: { rawName: string; logo: string; group: string } | null = null;

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#EXTINF:')) {
        const nameMatch = trimmed.match(/tvg-name="([^"]+)"/) || trimmed.match(/,(.+)$/);
        const logoMatch = trimmed.match(/tvg-logo="([^"]+)"/);
        const groupMatch = trimmed.match(/group-title="([^"]+)"/);

        const rawName = nameMatch ? nameMatch[1].trim() : 'Vídeo';
        const logo = logoMatch ? logoMatch[1].trim() : '';
        const group = groupMatch ? groupMatch[1].trim() : '';

        currentMetadata = { rawName, logo, group };
      } else if (!trimmed.startsWith('#') && currentMetadata) {
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          const { title, year } = cleanTitle(currentMetadata.rawName);
          const isSeries = currentMetadata.group.toLowerCase().includes('serie') || 
                           currentMetadata.group.toLowerCase().includes('novela') ||
                           /S\d{1,2}E\d{1,2}/i.test(currentMetadata.rawName);

          const genres = detectGenre(currentMetadata.group, title);
          const poster = currentMetadata.logo || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80';
          const realStreamUrl = trimmed;
          const proxyStreamUrl = `/api/proxy?url=${encodeURIComponent(realStreamUrl)}`;

          const id = `vod-${items.length + 1}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          items.push({
            id,
            title,
            type: isSeries ? 'series' : 'movie',
            year,
            duration: isSeries ? 'Temporada Completa' : '1h 50m',
            rating: year >= 2024 ? '14+' : '12+',
            genre: genres,
            bannerUrl: poster,
            posterUrl: poster,
            synopsis: `Disponível no catálogo MAXTV (${currentMetadata.group || 'Geral'}). Áudio em alta resolução e múltiplos servidores espelho para reprodução contínua.`,
            streamUrl: proxyStreamUrl,
            backupStreamUrl: realStreamUrl,
            sources: [
              { name: 'Servidor 1 - Stream HD Proxy (Anti-Bloqueio)', url: proxyStreamUrl, quality: '1080p' },
              { name: 'Servidor 2 - Direto HLS', url: realStreamUrl, quality: '1080p' }
            ],
            featured: items.length < 10,
            isVipOnly: items.length > 30
          });

          if (items.length >= limit) {
            rl.close();
            break;
          }
        }
        currentMetadata = null;
      }
    }

    console.log(`[M3U VOD] Extraídos ${items.length} títulos com sucesso.`);
    return items;
  } catch (err: any) {
    console.warn(`[M3U VOD] Erro ao carregar:`, err.message);
    return [];
  }
}

/**
 * Mescla e deduplica títulos de diferentes fontes M3U
 */
export function mergeCatalogs(sourcesList: ExtractedVodItem[][]): ExtractedVodItem[] {
  const map = new Map<string, ExtractedVodItem>();

  for (const list of sourcesList) {
    for (const it of list) {
      const key = `${it.title.toLowerCase().trim()}_${it.type}_${it.year}`;
      if (!map.has(key)) {
        map.set(key, { ...it, sources: [...it.sources] });
      } else {
        const existing = map.get(key)!;
        for (const src of it.sources) {
          if (!existing.sources.some(s => s.url === src.url)) {
            existing.sources.push(src);
          }
        }
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Função principal de atualização de catálogo
 */
export async function updateCatalogFromM3U(options?: { targetUrl?: string; source?: 'local_db' | 'custom' | string }) {
  const customUrl = options?.targetUrl;

  console.log(`\n======================================================`);
  console.log(`[TV MAXTV] Atualizador de Catálogo VOD Baseado em Banco Local`);
  console.log(`======================================================\n`);

  try {
    let items: ExtractedVodItem[] = [];

    if (customUrl && customUrl.startsWith('http')) {
      // Lista personalizada informada pelo administrador
      items = await fetchM3UVod(customUrl, 300);
    } else {
      // Carregar exclusivamente do banco de dados local SQLite
      const localSources = sqliteGetAllM3uSources().filter(s => s.enabled);
      if (localSources.length === 0) {
        console.warn('Nenhuma lista M3U cadastrada e habilitada no banco local pelo administrador.');
        return { 
          success: false, 
          count: 0, 
          error: 'Nenhuma lista M3U cadastrada manualmente pelo administrador no banco local SQLite.' 
        };
      }

      console.log(`Carregando ${localSources.length} fontes M3U do banco SQLite...`);
      const extractedBatches: ExtractedVodItem[][] = [];

      for (const src of localSources) {
        const batch = await fetchM3UVod(src.url, 200);
        if (batch.length > 0) {
          extractedBatches.push(batch);
        }
      }

      items = mergeCatalogs(extractedBatches);
      console.log(`Total consolidado a partir das listas locais: ${items.length} títulos.`);
    }

    if (items.length === 0) {
      console.warn('Nenhum item válido encontrado nas listas processadas.');
      return { success: false, count: 0, error: 'Nenhum título encontrado nas listas fornecidas.' };
    }

    // Diretório de saída
    const outputDir = path.join(process.cwd(), 'public', 'data', 'enriched');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const movies = items.filter(i => i.type === 'movie');
    const series = items.filter(i => i.type === 'series');

    // Salvar arquivos JSON
    const vodFilePath = path.join(outputDir, 'vod.json');
    const moviesFilePath = path.join(outputDir, 'movies.json');
    const seriesFilePath = path.join(outputDir, 'series.json');

    fs.writeFileSync(vodFilePath, JSON.stringify({
      updatedAt: new Date().toISOString(),
      sources: ['Banco de Dados Local (SQLite)'],
      count: items.length,
      items
    }, null, 2), 'utf-8');

    fs.writeFileSync(moviesFilePath, JSON.stringify({
      updatedAt: new Date().toISOString(),
      count: movies.length,
      items: movies
    }, null, 2), 'utf-8');

    fs.writeFileSync(seriesFilePath, JSON.stringify({
      updatedAt: new Date().toISOString(),
      count: series.length,
      items: series
    }, null, 2), 'utf-8');

    console.log(`\nArquivos JSON gerados com sucesso:`);
    console.log(`- ${vodFilePath} (${items.length} itens)`);
    console.log(`- ${moviesFilePath} (${movies.length} filmes)`);
    console.log(`- ${seriesFilePath} (${series.length} séries)`);

    return {
      success: true,
      count: items.length,
      moviesCount: movies.length,
      seriesCount: series.length,
      outputDir,
      items
    };
  } catch (error: any) {
    console.error(`Erro ao atualizar catálogo:`, error.message || error);
    return { success: false, error: error.message };
  }
}

// Execução direta via terminal: npx tsx scripts/updateContent.ts
if (process.argv[1] && (process.argv[1].includes('updateContent.ts') || process.argv[1].includes('updateContent.js'))) {
  const args = process.argv.slice(2);
  const customUrlArg = args.find(a => a.startsWith('http://') || a.startsWith('https://'));

  updateCatalogFromM3U({
    targetUrl: customUrlArg
  }).then((res) => {
    if (res.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
}
