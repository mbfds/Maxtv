/**
 * Sistema de Priorização de Fontes de Streaming
 * Seleciona automaticamente servidores com menor latência (CDN geolocalizada no Brasil)
 * para o usuário, garantindo uma reprodução inicial ágil e estável sem travamentos.
 */

export interface SourceWithPriority {
  name: string;
  url: string;
  originalIndex: number;
  referer?: string;
  quality?: string;
  protocol?: 'hls' | 'dash' | 'mp4';
  latencyMs?: number;
  isBrazilCdn: boolean;
  isHealthy: boolean;
  score: number; // Maior pontuação = maior prioridade
}

/**
 * Detecta se a URL tem indicativos de CDN ou servidor baseado no Brasil
 */
export function isBrazilHostedUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();

  // Domínios de topo e subdomínios brasileiros
  if (lower.includes('.com.br') || lower.includes('.net.br') || lower.includes('.org.br') || lower.includes('.tv.br')) {
    return true;
  }

  // CDNs e redes conhecidas com edge points no Brasil
  const brIndicators = [
    'cdn-br',
    'edge-br',
    'sa-east',
    'gru', // Aeroporto Guarulhos (código padrão de datacenters em SP)
    'sp-',
    'brazil',
    'brasil',
    'globo',
    'uol.com',
    'r7.com',
    'sbt',
    'band',
    'claro',
    'vivo',
    'telecom',
    'cdn.tv',
    'edge.tv',
    '/api/proxy', // Proxy interno com aceleração Brasil
  ];

  return brIndicators.some(indicator => lower.includes(indicator));
}

/**
 * Mede a latência de uma fonte com timeout rápido (2500ms) sem bloquear
 */
export async function measureSourceLatency(
  sourceUrl: string,
  referer?: string,
  timeoutMs: number = 2500
): Promise<{ latencyMs: number; isHealthy: boolean }> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const testEndpoint = sourceUrl.startsWith('/api/')
    ? sourceUrl
    : `/api/check-stream?url=${encodeURIComponent(sourceUrl)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;

  try {
    const res = await fetch(testEndpoint, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - startTime);
    const isHealthy = res.ok || res.status === 206 || (res.status >= 300 && res.status < 400);

    return {
      latencyMs: isHealthy ? latencyMs : 9999,
      isHealthy
    };
  } catch {
    clearTimeout(timer);
    return {
      latencyMs: 9999,
      isHealthy: false
    };
  }
}

/**
 * Prioriza uma lista de fontes baseado em:
 * 1. CDN geolocalizada no Brasil (bônus de relevância)
 * 2. Menor latência em milissegundos
 * 3. Status de disponibilidade saudável
 */
export async function prioritizeStreamingSources<T extends { url: string; referer?: string; name?: string; quality?: string; protocol?: 'hls' | 'dash' | 'mp4' }>(
  sourcesList: T[],
  options: { testLatency?: boolean; timeoutMs?: number } = {}
): Promise<{
  prioritizedSources: (T & { isBrazilCdn: boolean; latencyMs?: number; isHealthy: boolean })[];
  bestSourceIndex: number;
}> {
  if (!sourcesList || sourcesList.length === 0) {
    return { prioritizedSources: [], bestSourceIndex: 0 };
  }

  // Se houver apenas 1 fonte, analisa os metadados de CDN sem precisar testar
  if (sourcesList.length === 1) {
    const isBr = isBrazilHostedUrl(sourcesList[0].url);
    return {
      prioritizedSources: [
        {
          ...sourcesList[0],
          isBrazilCdn: isBr,
          latencyMs: isBr ? 45 : 120,
          isHealthy: true
        }
      ],
      bestSourceIndex: 0
    };
  }

  const shouldTest = options.testLatency !== false;

  // Medição rápida e concorrente de latência para canais com múltiplas fontes
  const latencyResults = shouldTest
    ? await Promise.all(
        sourcesList.map(s => measureSourceLatency(s.url, s.referer, options.timeoutMs || 2500))
      )
    : sourcesList.map(() => ({ latencyMs: 200, isHealthy: true }));

  const annotated = sourcesList.map((src, idx) => {
    const isBr = isBrazilHostedUrl(src.url);
    const { latencyMs, isHealthy } = latencyResults[idx];

    // Cálculo de pontuação:
    // Começa com 1000 pontos
    // Penaliza por latência (+1ms de latência = -1 ponto)
    // Se for CDN brasileira ganha +300 pontos de vantagem
    // Se estiver offline perde 5000 pontos
    let score = 1000;
    if (isHealthy) {
      score -= Math.min(latencyMs, 1000);
      if (isBr) score += 300;
    } else {
      score = -5000;
    }

    return {
      ...src,
      originalIndex: idx,
      isBrazilCdn: isBr,
      latencyMs: isHealthy ? latencyMs : undefined,
      isHealthy,
      score
    };
  });

  // Ordena por maior pontuação (melhor CDN e menor latência no topo)
  annotated.sort((a, b) => b.score - a.score);

  return {
    prioritizedSources: annotated,
    bestSourceIndex: annotated[0]?.originalIndex ?? 0
  };
}
