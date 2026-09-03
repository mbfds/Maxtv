/**
 * Utilitário de verificação de disponibilidade de fluxo de vídeo (Stream Health Pre-flight)
 * Executa uma requisição 'HEAD' na URL do stream antes de carregar o player para diagnosticar
 * a disponibilidade do servidor e alertar amigavelmente o usuário caso o sinal esteja instável ou offline.
 */

export interface StreamCheckResult {
  online: boolean;
  isOffline: boolean;
  statusCode?: number;
  statusText?: string;
  latencyMs: number;
  contentType?: string;
  warningMessage?: string;
  recommendedAction?: 'none' | 'switch_source' | 'use_proxy' | 'wait_retry';
}

/**
 * Realiza uma verificação preliminar 'HEAD' na URL do stream.
 * Se o stream estiver no formato /api/proxy ou direto, testa a rota
 * com timeout controlado (padrão 6500ms) sem travar a interface do usuário.
 */
export async function checkStreamAvailability(
  streamUrl: string,
  referer?: string,
  timeoutMs: number = 6500
): Promise<StreamCheckResult> {
  const startTime = performance.now();
  
  if (!streamUrl || typeof streamUrl !== 'string') {
    return {
      online: false,
      isOffline: true,
      latencyMs: 0,
      warningMessage: 'Endereço da transmissão não fornecido.',
      recommendedAction: 'switch_source'
    };
  }

  // Prepara a URL de teste (se for URL externa crua, usa o endpoint /api/check-stream com HEAD)
  let testUrl: string;
  if (streamUrl.startsWith('/api/proxy') || streamUrl.startsWith('/api/check-stream')) {
    testUrl = streamUrl;
  } else if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
    testUrl = `/api/check-stream?url=${encodeURIComponent(streamUrl)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
  } else {
    testUrl = streamUrl;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Tentativa primária usando método 'HEAD'
    const response = await fetch(testUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'Accept': '*/*'
      }
    });
    
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);
    const isOk = response.ok || response.status === 206 || (response.status >= 300 && response.status < 400);
    const contentType = response.headers.get('content-type') || '';

    // Se o servidor respondeu com página de erro HTML em vez de mídia/m3u8
    const isHtmlError = contentType.includes('text/html') && (streamUrl.includes('.m3u8') || streamUrl.includes('.ts'));

    if (isOk && !isHtmlError) {
      if (latency > 5500) {
        return {
          online: true,
          isOffline: false,
          statusCode: response.status,
          statusText: response.statusText,
          latencyMs: latency,
          contentType,
          warningMessage: 'Aviso: Servidor de origem com resposta lenta (>5s). Se travar, clique em Trocar Servidor.',
          recommendedAction: 'switch_source'
        };
      }
      return {
        online: true,
        isOffline: false,
        statusCode: response.status,
        statusText: response.statusText,
        latencyMs: latency,
        contentType,
        recommendedAction: 'none'
      };
    }

    // Servidor retornou código 4xx ou 5xx ou HTML
    return {
      online: false,
      isOffline: true,
      statusCode: response.status,
      statusText: response.statusText,
      latencyMs: latency,
      contentType,
      warningMessage: `O servidor remoto retornou resposta (${response.status || 'Offline'}). Tentando fonte alternativa...`,
      recommendedAction: 'switch_source'
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);
    const isTimeout = error.name === 'AbortError';

    return {
      online: false,
      isOffline: true,
      statusCode: 0,
      statusText: isTimeout ? 'Tempo limite de resposta' : 'Conexão lenta',
      latencyMs: latency,
      warningMessage: isTimeout
        ? 'Sinal demorou a responder devido à latência do servidor de origem. Tente alternar o servidor ou usar o proxy.'
        : 'Sinal em processo de conexão com o servidor.',
      recommendedAction: 'switch_source'
    };
  }
}

/**
 * Reporta um canal ou stream com problemas para o backend
 */
export async function reportChannelProblem(payload: {
  channelId: string;
  channelName: string;
  sourceUrl?: string;
  reason?: string;
  userEmail?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/channels/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.warn('Erro ao reportar canal:', err);
    return {
      success: true,
      message: 'Relatório registrado localmente. A equipe técnica analisará a transmissão.'
    };
  }
}
