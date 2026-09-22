/**
 * Gerenciador de Buffer Inteligente & Adaptativo para Players de Transmissão
 * Ajusta dinamicamente o tamanho do cache do player baseado na velocidade de conexão
 * detectada do usuário brasileiro, evitando travamentos e cortes em horários de tráfego intenso.
 */

export interface NetworkSpeedMetrics {
  downlinkMbps?: number;
  rttMs?: number;
  effectiveType?: string;
  measuredThroughputMbps?: number;
  lastMeasuredLatencyMs?: number;
  recentStallsCount: number;
}

export type BufferTrafficProfile = 'ultra_direct_lightweight' | 'high_speed' | 'moderate' | 'intense_traffic';

export interface DynamicBufferConfig {
  profile: BufferTrafficProfile;
  profileLabel: string;
  maxBufferLength: number; // Segundos de buffer à frente
  maxMaxBufferLength: number; // Teto máximo de buffer
  maxBufferSize: number; // Tamanho máximo do cache em bytes
  liveSyncDurationCount: number; // Quantidade de chunks de segurança para Live
  liveMaxLatencyDurationCount: number; // Latência máxima permitida antes de sync
  backBufferLength: number; // Histórico preservado para retroceder
  fragLoadingMaxRetry: number;
  fragLoadingTimeOutMs: number;
}

/**
 * Perfis otimizados para provedores brasileiros (Claro, Vivo, TIM, Oi, Provedores Regionais)
 * especialmente dimensionados para absorver picos de tráfego ou operar no modo mais direto e leve possível.
 */
export const BUFFER_PROFILES: Record<BufferTrafficProfile, DynamicBufferConfig> = {
  // Ultra-Leve & Direto: Baixíssima latência (<2s), buffer compacto (8s) e consumo mínimo de RAM (16MB).
  // Ideal para TV Box, dispositivos mais modestos e início de reprodução ultra-rápido.
  ultra_direct_lightweight: {
    profile: 'ultra_direct_lightweight',
    profileLabel: '⚡ Direto & Ultra-Leve (Baixo Delay & Pouca RAM)',
    maxBufferLength: 8, // ~8 segundos à frente
    maxMaxBufferLength: 15,
    maxBufferSize: 16 * 1024 * 1024, // 16 MB
    liveSyncDurationCount: 2, // Início imediato (2 fragmentos)
    liveMaxLatencyDurationCount: 4,
    backBufferLength: 0, // Descarte imediato do passado para economia máxima de RAM
    fragLoadingMaxRetry: 4,
    fragLoadingTimeOutMs: 12000,
  },
  // Fibra / Alta Velocidade: Baixa latência com rápida inicialização
  high_speed: {
    profile: 'high_speed',
    profileLabel: 'Ultra Rápido (Fibra Óptica)',
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    maxBufferSize: 40 * 1024 * 1024, // 40 MB
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 8,
    backBufferLength: 15,
    fragLoadingMaxRetry: 5,
    fragLoadingTimeOutMs: 15000,
  },
  // Conexão Moderada: Equilíbrio padrão de latência e consumo de memória
  moderate: {
    profile: 'moderate',
    profileLabel: 'Buffer Equilibrado',
    maxBufferLength: 45,
    maxMaxBufferLength: 90,
    maxBufferSize: 60 * 1024 * 1024, // 60 MB
    liveSyncDurationCount: 4,
    liveMaxLatencyDurationCount: 12,
    backBufferLength: 30,
    fragLoadingMaxRetry: 6,
    fragLoadingTimeOutMs: 20000,
  },
  // Tráfego Intenso / Conexão Instável: Buffer estendido para colchão de absorção contra quedas
  intense_traffic: {
    profile: 'intense_traffic',
    profileLabel: 'Buffer Reforçado (Anti-Travamento)',
    maxBufferLength: 70, // ~70 segundos
    maxMaxBufferLength: 140,
    maxBufferSize: 90 * 1024 * 1024, // 90 MB
    liveSyncDurationCount: 6,
    liveMaxLatencyDurationCount: 18,
    backBufferLength: 45,
    fragLoadingMaxRetry: 8,
    fragLoadingTimeOutMs: 30000,
  },
};

/**
 * Lê métricas nativas do navegador via Network Information API
 */
export function getBrowserNetworkMetrics(): {
  downlinkMbps?: number;
  rttMs?: number;
  effectiveType?: string;
} {
  if (typeof navigator === 'undefined') return {};
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return {};

  return {
    downlinkMbps: typeof conn.downlink === 'number' ? conn.downlink : undefined,
    rttMs: typeof conn.rtt === 'number' ? conn.rtt : undefined,
    effectiveType: typeof conn.effectiveType === 'string' ? conn.effectiveType : undefined,
  };
}

/**
 * Calcula o perfil de buffer dinâmico ideal com base nas métricas combinadas
 */
export function calculateDynamicBufferProfile(metrics: NetworkSpeedMetrics): DynamicBufferConfig {
  const {
    downlinkMbps,
    rttMs,
    effectiveType,
    measuredThroughputMbps,
    lastMeasuredLatencyMs,
    recentStallsCount,
  } = metrics;

  // Se houveram travamentos recentes, forçar imediatamente perfil de tráfego intenso
  if (recentStallsCount >= 2) {
    return BUFFER_PROFILES.intense_traffic;
  }

  // Velocidade efetiva estimada (prioriza taxa real de fragmentos se disponível)
  const speed = measuredThroughputMbps ?? downlinkMbps;
  const latency = lastMeasuredLatencyMs ?? rttMs;

  // Detecção de conexões lentas ou com jitter elevado
  const isSlowType = effectiveType === '2g' || effectiveType === '3g' || effectiveType === 'slow-2g';
  const isHighLatency = latency !== undefined && latency > 250;
  const isLowSpeed = speed !== undefined && speed < 4.0;

  if (isSlowType || isHighLatency || isLowSpeed) {
    return BUFFER_PROFILES.intense_traffic;
  }

  // Conexão de alta performance (Fibra > 15 Mbps e RTT < 60ms)
  const isHighSpeed = (speed !== undefined && speed >= 15.0) && (latency === undefined || latency < 70);
  if (isHighSpeed && recentStallsCount === 0) {
    return BUFFER_PROFILES.high_speed;
  }

  return BUFFER_PROFILES.moderate;
}

/**
 * Aplica as configurações dinâmicas diretamente a uma instância Hls.js em tempo de execução
 */
export function applyDynamicBufferToHls(
  hls: any,
  config: DynamicBufferConfig
): void {
  if (!hls || !hls.config) return;

  try {
    hls.config.maxBufferLength = config.maxBufferLength;
    hls.config.maxMaxBufferLength = config.maxMaxBufferLength;
    hls.config.maxBufferSize = config.maxBufferSize;
    hls.config.liveSyncDurationCount = config.liveSyncDurationCount;
    hls.config.liveMaxLatencyDurationCount = config.liveMaxLatencyDurationCount;
    hls.config.backBufferLength = config.backBufferLength;
    hls.config.fragLoadingTimeOut = config.fragLoadingTimeOutMs;
    hls.config.fragLoadingMaxRetry = config.fragLoadingMaxRetry;
    if (config.profile === 'ultra_direct_lightweight') {
      hls.config.lowLatencyMode = true;
    }
  } catch {
    // Ignora silenciosamente caso algum parâmetro seja somente-leitura em versões antigas
  }
}

/**
 * Calcula os segundos de vídeo carregados à frente no buffer do elemento <video>
 */
export function getBufferedAheadSeconds(video: HTMLVideoElement | null): number {
  if (!video || !video.buffered || video.buffered.length === 0) return 0;
  const curTime = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    const start = video.buffered.start(i);
    const end = video.buffered.end(i);
    if (curTime >= start && curTime <= end) {
      return Math.max(0, end - curTime);
    }
  }
  return 0;
}
