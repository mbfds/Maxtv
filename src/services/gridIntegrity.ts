import { Channel } from '../types';
import { INITIAL_CHANNELS } from '../data/channelsData';

export interface ChannelsGridResult {
  success: boolean;
  channels: Channel[];
  count: number;
  source: string;
  totalSources?: number;
  multiSourceCount?: number;
  lastUpdated?: number;
}

/**
 * Objeto de grade de canais padrão (Fallback com grade pré-configurada de TV ao vivo).
 * Utilizado sempre que a resposta da API for vazia, inválida ou corrompida.
 */
export const DEFAULT_CHANNELS_GRID: ChannelsGridResult = {
  success: true,
  channels: INITIAL_CHANNELS,
  count: INITIAL_CHANNELS.length,
  source: 'Grade Padrão Local (MAXTV Fallback Seguro)'
};

/**
 * Verificação de integridade na resposta da API antes de chamar .json().
 * Previne o erro "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
 * inspecionando o status HTTP, headers e o corpo da resposta (via clone/texto) antes do parse.
 * Se a resposta for vazia ou inválida, retorna o objeto de grade padrão.
 */
export async function verifyAndParseChannelsGridResponse(
  res: Response | null | undefined
): Promise<ChannelsGridResult> {
  // 1. Verificação de integridade básica do objeto de resposta
  if (!res) {
    console.warn('[Grade] Resposta da API nula ou indefinida. Retornando grade padrão.');
    return DEFAULT_CHANNELS_GRID;
  }

  if (!res.ok || res.status === 204) {
    console.warn(`[Grade] Resposta HTTP sem sucesso ou sem conteúdo (Status: ${res.status}). Retornando grade padrão.`);
    return DEFAULT_CHANNELS_GRID;
  }

  // 2. Verificação de Content-Length
  const contentLength = res.headers?.get('content-length');
  if (contentLength === '0') {
    console.warn('[Grade] Resposta HTTP com Content-Length 0. Retornando grade padrão.');
    return DEFAULT_CHANNELS_GRID;
  }

  // 3. Verificação do corpo antes de chamar .json()
  let rawBody = '';
  try {
    // Clona a resposta para inspecionar o conteúdo sem consumir o stream principal
    const cloned = res.clone();
    rawBody = await cloned.text();
  } catch (cloneErr) {
    console.warn('[Grade] Aviso ao clonar stream da resposta:', cloneErr);
    try {
      rawBody = await res.text();
    } catch {
      console.warn('[Grade] Falha ao ler corpo da resposta. Retornando grade padrão.');
      return DEFAULT_CHANNELS_GRID;
    }
  }

  const trimmed = rawBody ? rawBody.trim() : '';

  // 4. Se a resposta for vazia ou não iniciar com estrutura JSON ({ ou [)
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    console.warn('[Grade] Resposta da API vazia ou formato não-JSON detectado antes de .json(). Retornando grade padrão.');
    return DEFAULT_CHANNELS_GRID;
  }

  // 5. Chamada de .json() / JSON.parse com integridade estrutural validada
  try {
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = JSON.parse(trimmed);
    }

    // Se possui a propriedade channels contendo array com elementos
    if (data && Array.isArray(data.channels) && data.channels.length > 0) {
      return {
        success: true,
        channels: data.channels,
        count: typeof data.count === 'number' ? data.count : data.channels.length,
        source: data.source || 'Grade Unificada Multi-Fontes',
        totalSources: data.totalSources,
        multiSourceCount: data.multiSourceCount,
        lastUpdated: data.lastUpdated
      };
    }

    // Se o próprio retorno é um array direto de canais
    if (Array.isArray(data) && data.length > 0) {
      return {
        success: true,
        channels: data,
        count: data.length,
        source: 'Grade Direta'
      };
    }

    console.warn('[Grade] Resposta JSON não contém canais válidos. Retornando grade padrão.');
    return DEFAULT_CHANNELS_GRID;
  } catch (err) {
    console.error('[Grade] Erro ao parsear JSON da grade:', err);
    return DEFAULT_CHANNELS_GRID;
  }
}
