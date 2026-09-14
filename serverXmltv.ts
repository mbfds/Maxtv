import zlib from 'zlib';

export interface XmltvChannelSample {
  id: string;
  name: string;
  icon?: string;
}

export interface XmltvProgrammeSample {
  channelId: string;
  title: string;
  start: string;
  stop: string;
  desc?: string;
  category?: string;
}

export interface XmltvValidationResult {
  valid: boolean;
  url: string;
  channelsCount: number;
  programmesCount: number;
  timeRange?: {
    earliestStartIso?: string;
    latestStopIso?: string;
    formattedRange?: string;
    durationHours?: number;
  };
  sampleChannels: XmltvChannelSample[];
  sampleProgrammes: XmltvProgrammeSample[];
  fileSizeBytes: number;
  fileSizeFormatted: string;
  isGzip: boolean;
  latencyMs: number;
  contentType?: string;
  statusCode?: number;
  statusText?: string;
  error?: string;
  errorType?:
    | 'protocol_error'
    | 'timeout'
    | 'http_error'
    | 'empty_content'
    | 'html_not_xml'
    | 'missing_tv_root'
    | 'missing_channels'
    | 'missing_programmes'
    | 'corrupted_gzip'
    | 'invalid_xml'
    | 'network_error';
  details?: any;
}

/**
 * Converte data no padrão XMLTV (ex: "20260913200000 -0300" ou "20260913200000") para objeto Date
 */
export function parseXmltvDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (!match) {
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
  }
  const [_, year, month, day, hour, min, sec, tz] = match;
  let iso = `${year}-${month}-${day}T${hour}:${min}:${sec}`;
  if (tz) {
    iso += `${tz.slice(0, 3)}:${tz.slice(3)}`;
  } else {
    iso += 'Z';
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDateBr(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Utilitário completo para validar links de XMLTV (EPG) antes de salvar no sistema.
 * Verifica conectividade, status HTTP, descompressão gzip transparente e estrutura XMLTV válida.
 */
export async function validateXmltvUrl(
  url: string,
  timeoutMs: number = 20000
): Promise<XmltvValidationResult> {
  const startTime = Date.now();
  const cleanUrl = (url || '').trim();

  // 1. Verificação sintática básica e protocolo
  if (!cleanUrl) {
    return {
      valid: false,
      url: cleanUrl,
      channelsCount: 0,
      programmesCount: 0,
      sampleChannels: [],
      sampleProgrammes: [],
      fileSizeBytes: 0,
      fileSizeFormatted: '0 B',
      isGzip: false,
      latencyMs: 0,
      errorType: 'protocol_error',
      error: 'URL do arquivo XMLTV (EPG) não fornecida ou vazia.'
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        valid: false,
        url: cleanUrl,
        channelsCount: 0,
        programmesCount: 0,
        sampleChannels: [],
        sampleProgrammes: [],
        fileSizeBytes: 0,
        fileSizeFormatted: '0 B',
        isGzip: false,
        latencyMs: 0,
        errorType: 'protocol_error',
        error: `Protocolo "${parsedUrl.protocol}" não suportado. Utilize apenas links com http:// ou https://.`
      };
    }
  } catch (err: any) {
    return {
      valid: false,
      url: cleanUrl,
      channelsCount: 0,
      programmesCount: 0,
      sampleChannels: [],
      sampleProgrammes: [],
      fileSizeBytes: 0,
      fileSizeFormatted: '0 B',
      isGzip: false,
      latencyMs: 0,
      errorType: 'protocol_error',
      error: `Formato de URL inválido: ${err.message}`
    };
  }

  // 2. Requisição de rede para baixar cabeçalhos e conteúdo
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (MAXTV-XMLTV-Validator/1.0)',
        'Accept':
          'application/xml, text/xml, application/x-gzip, application/gzip, */*'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';

    // Verifica status code HTTP
    if (!response.ok) {
      let friendlyError = `O servidor remoto retornou status HTTP ${response.status} (${response.statusText || 'Erro'}).`;
      if (response.status === 404) {
        friendlyError = 'A URL retornou status 404 (Não Encontrado). O arquivo XMLTV não existe no endereço informado.';
      } else if (response.status === 403) {
        friendlyError = 'A URL retornou status 403 (Proibido). Acesso bloqueado pelo servidor de origem (pode requerer autorização ou IP permitido).';
      } else if (response.status >= 500) {
        friendlyError = `O servidor remoto do EPG está indisponível ou enfrentando instabilidade interna (HTTP ${response.status}).`;
      }

      return {
        valid: false,
        url: cleanUrl,
        channelsCount: 0,
        programmesCount: 0,
        sampleChannels: [],
        sampleProgrammes: [],
        fileSizeBytes: 0,
        fileSizeFormatted: '0 B',
        isGzip: false,
        latencyMs,
        statusCode: response.status,
        statusText: response.statusText,
        contentType,
        errorType: 'http_error',
        error: friendlyError
      };
    }

    const rawBuffer = Buffer.from(await response.arrayBuffer());
    const fileSizeBytes = rawBuffer.length;

    if (fileSizeBytes === 0) {
      return {
        valid: false,
        url: cleanUrl,
        channelsCount: 0,
        programmesCount: 0,
        sampleChannels: [],
        sampleProgrammes: [],
        fileSizeBytes: 0,
        fileSizeFormatted: '0 Bytes',
        isGzip: false,
        latencyMs,
        statusCode: response.status,
        contentType,
        errorType: 'empty_content',
        error: 'O servidor remoto respondeu com sucesso (HTTP 200), mas o arquivo XMLTV está vazio (0 bytes).'
      };
    }

    // 3. Descompressão transparente de GZIP (caso seja .xml.gz ou tenha magic number 0x1f, 0x8b)
    let isGzip = false;
    let xmlText = '';

    const isGzipMagic = rawBuffer.length >= 2 && rawBuffer[0] === 0x1f && rawBuffer[1] === 0x8b;
    const isGzipUrl = cleanUrl.toLowerCase().includes('.gz');

    if (isGzipMagic || isGzipUrl) {
      isGzip = true;
      try {
        const decompressed = zlib.gunzipSync(rawBuffer);
        xmlText = decompressed.toString('utf-8');
      } catch (gzErr: any) {
        return {
          valid: false,
          url: cleanUrl,
          channelsCount: 0,
          programmesCount: 0,
          sampleChannels: [],
          sampleProgrammes: [],
          fileSizeBytes,
          fileSizeFormatted: formatBytes(fileSizeBytes),
          isGzip: true,
          latencyMs,
          statusCode: response.status,
          contentType,
          errorType: 'corrupted_gzip',
          error: `O arquivo está compactado em gzip mas falhou na descompressão: ${gzErr.message}`
        };
      }
    } else {
      xmlText = rawBuffer.toString('utf-8');
    }

    // 4. Detecção de HTML de erro (ex: página de erro de CDN/Cloudflare)
    const lowerHead = xmlText.slice(0, 1500).toLowerCase();
    const isHtml =
      lowerHead.includes('<!doctype html') ||
      lowerHead.includes('<html') ||
      (lowerHead.includes('<head') && lowerHead.includes('<body'));

    const hasTvTag = /<tv[\s>]/i.test(xmlText);

    if (isHtml && !hasTvTag) {
      return {
        valid: false,
        url: cleanUrl,
        channelsCount: 0,
        programmesCount: 0,
        sampleChannels: [],
        sampleProgrammes: [],
        fileSizeBytes,
        fileSizeFormatted: formatBytes(fileSizeBytes),
        isGzip,
        latencyMs,
        statusCode: response.status,
        contentType,
        errorType: 'html_not_xml',
        error: 'A URL retornou uma página web em HTML em vez de um arquivo XMLTV estruturado (EPG).'
      };
    }

    // 5. Validação da tag raiz <tv> (obrigatória na especificação XMLTV)
    if (!hasTvTag) {
      return {
        valid: false,
        url: cleanUrl,
        channelsCount: 0,
        programmesCount: 0,
        sampleChannels: [],
        sampleProgrammes: [],
        fileSizeBytes,
        fileSizeFormatted: formatBytes(fileSizeBytes),
        isGzip,
        latencyMs,
        statusCode: response.status,
        contentType,
        errorType: 'missing_tv_root',
        error: 'O arquivo não possui o elemento raiz <tv>, obrigatório no formato padrão XMLTV.'
      };
    }

    // 6. Extração e contagem de canais (<channel id="...">)
    const channelRegex = /<channel\s+[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/channel>/gi;
    const sampleChannels: XmltvChannelSample[] = [];
    const channelIdSet = new Set<string>();

    let channelMatch: RegExpExecArray | null;
    let chCount = 0;

    while ((channelMatch = channelRegex.exec(xmlText)) !== null) {
      chCount++;
      const chId = channelMatch[1].trim();
      channelIdSet.add(chId);

      if (sampleChannels.length < 10) {
        const body = channelMatch[2];
        const nameMatch = body.match(/<display-name[^>]*>([^<]+)<\/display-name>/i);
        const iconMatch = body.match(/<icon[^>]*src=["']([^"']+)["']/i);

        sampleChannels.push({
          id: chId,
          name: nameMatch ? nameMatch[1].trim() : chId,
          icon: iconMatch ? iconMatch[1].trim() : undefined
        });
      }
    }

    // Fallback para contagem de canais se a regex completa não bater em tags auto-fechadas
    if (chCount === 0) {
      const simpleChannelMatches = xmlText.match(/<channel\s+[^>]*id=["']([^"']+)["']/gi);
      if (simpleChannelMatches) {
        chCount = simpleChannelMatches.length;
        for (const item of simpleChannelMatches.slice(0, 10)) {
          const idM = item.match(/id=["']([^"']+)["']/i);
          if (idM) {
            sampleChannels.push({ id: idM[1], name: idM[1] });
          }
        }
      }
    }

    // 7. Extração e contagem de programações (<programme channel="..." start="..." stop="...">)
    const programmeRegex = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
    const sampleProgrammes: XmltvProgrammeSample[] = [];

    let progCount = 0;
    let earliestStart: Date | null = null;
    let latestStop: Date | null = null;

    let progMatch: RegExpExecArray | null;
    while ((progMatch = programmeRegex.exec(xmlText)) !== null) {
      progCount++;
      const attrs = progMatch[1];
      const body = progMatch[2];

      const startMatch = attrs.match(/start=["']([^"']+)["']/i);
      const stopMatch = attrs.match(/stop=["']([^"']+)["']/i);
      const chMatch = attrs.match(/channel=["']([^"']+)["']/i);

      const startStr = startMatch ? startMatch[1] : '';
      const stopStr = stopMatch ? stopMatch[1] : '';
      const channelId = chMatch ? chMatch[1] : '';

      if (startStr) {
        const startDate = parseXmltvDate(startStr);
        if (startDate) {
          if (!earliestStart || startDate < earliestStart) earliestStart = startDate;
        }
      }

      if (stopStr) {
        const stopDate = parseXmltvDate(stopStr);
        if (stopDate) {
          if (!latestStop || stopDate > latestStop) latestStop = stopDate;
        }
      }

      if (sampleProgrammes.length < 10) {
        const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = body.match(/<desc[^>]*>([^<]+)<\/desc>/i);
        const catMatch = body.match(/<category[^>]*>([^<]+)<\/category>/i);

        sampleProgrammes.push({
          channelId,
          title: titleMatch ? titleMatch[1].trim() : 'Sem título',
          start: startStr,
          stop: stopStr,
          desc: descMatch ? descMatch[1].trim().slice(0, 150) : undefined,
          category: catMatch ? catMatch[1].trim() : undefined
        });
      }
    }

    // Fallback para contagem simples de programas
    if (progCount === 0) {
      const simpleProgMatches = xmlText.match(/<programme\s+/gi);
      if (simpleProgMatches) {
        progCount = simpleProgMatches.length;
      }
    }

    // 8. Verificação de Estrutura Obrigatória para Grade de Horários
    if (chCount === 0 && progCount === 0) {
      return {
        valid: false,
        url: cleanUrl,
        channelsCount: 0,
        programmesCount: 0,
        sampleChannels: [],
        sampleProgrammes: [],
        fileSizeBytes,
        fileSizeFormatted: formatBytes(fileSizeBytes),
        isGzip,
        latencyMs,
        statusCode: response.status,
        contentType,
        errorType: 'missing_channels',
        error: 'O arquivo XMLTV foi carregado, mas não contém canais (<channel>) nem programações (<programme>).'
      };
    }

    if (progCount === 0) {
      return {
        valid: false,
        url: cleanUrl,
        channelsCount: chCount,
        programmesCount: 0,
        sampleChannels,
        sampleProgrammes: [],
        fileSizeBytes,
        fileSizeFormatted: formatBytes(fileSizeBytes),
        isGzip,
        latencyMs,
        statusCode: response.status,
        contentType,
        errorType: 'missing_programmes',
        error: `O arquivo XMLTV possui ${chCount} canais declarados, mas nenhuma programação (<programme>) para montar a grade de horários.`
      };
    }

    // 9. Cálculo de faixa de horário
    let timeRange: XmltvValidationResult['timeRange'] = undefined;
    if (earliestStart && latestStop) {
      const durationMs = latestStop.getTime() - earliestStart.getTime();
      const durationHours = Math.max(0, Math.round(durationMs / (1000 * 60 * 60)));
      timeRange = {
        earliestStartIso: earliestStart.toISOString(),
        latestStopIso: latestStop.toISOString(),
        formattedRange: `${formatDateBr(earliestStart)} até ${formatDateBr(latestStop)}`,
        durationHours
      };
    }

    return {
      valid: true,
      url: cleanUrl,
      channelsCount: chCount,
      programmesCount: progCount,
      timeRange,
      sampleChannels,
      sampleProgrammes,
      fileSizeBytes,
      fileSizeFormatted: formatBytes(fileSizeBytes),
      isGzip,
      latencyMs,
      statusCode: response.status,
      contentType
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    if (
      err.name === 'AbortError' ||
      err.name === 'TimeoutError' ||
      (err.message && err.message.toLowerCase().includes('timeout'))
    ) {
      return {
        valid: false,
        url: cleanUrl,
        channelsCount: 0,
        programmesCount: 0,
        sampleChannels: [],
        sampleProgrammes: [],
        fileSizeBytes: 0,
        fileSizeFormatted: '0 B',
        isGzip: false,
        latencyMs,
        errorType: 'timeout',
        error: `Tempo limite esgotado (${timeoutMs / 1000}s). O servidor remoto do XMLTV demorou demais para responder.`
      };
    }

    return {
      valid: false,
      url: cleanUrl,
      channelsCount: 0,
      programmesCount: 0,
      sampleChannels: [],
      sampleProgrammes: [],
      fileSizeBytes: 0,
      fileSizeFormatted: '0 B',
      isGzip: false,
      latencyMs,
      errorType: 'network_error',
      error: `Falha de conexão com a URL de XMLTV: ${err.message}`
    };
  }
}

/**
 * Baixa e decodifica o texto completo de um XMLTV (suporta gzip).
 */
export async function fetchXmltvText(url: string, timeoutMs: number = 30000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(url.trim(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MAXTV-XMLTV-Fetcher/1.0',
      'Accept': 'application/xml, text/xml, application/x-gzip, application/gzip, */*'
    },
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao baixar EPG (${url})`);
  }

  const rawBuffer = Buffer.from(await response.arrayBuffer());
  const isGzipMagic = rawBuffer.length >= 2 && rawBuffer[0] === 0x1f && rawBuffer[1] === 0x8b;
  const isGzipUrl = url.toLowerCase().includes('.gz');

  if (isGzipMagic || isGzipUrl) {
    return zlib.gunzipSync(rawBuffer).toString('utf-8');
  }
  return rawBuffer.toString('utf-8');
}

export interface EpgProgramItem {
  channelId: string;
  title: string;
  start: Date;
  stop: Date;
  desc?: string;
  category?: string;
}

export function parseXmltvProgrammes(xmlText: string): Map<string, EpgProgramItem[]> {
  const map = new Map<string, EpgProgramItem[]>();
  const programmeRegex = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
  let match: RegExpExecArray | null;

  while ((match = programmeRegex.exec(xmlText)) !== null) {
    const attrs = match[1];
    const body = match[2];

    const startMatch = attrs.match(/start=["']([^"']+)["']/i);
    const stopMatch = attrs.match(/stop=["']([^"']+)["']/i);
    const chMatch = attrs.match(/channel=["']([^"']+)["']/i);

    if (!startMatch || !chMatch) continue;

    const channelId = chMatch[1].trim().toLowerCase();
    const startDate = parseXmltvDate(startMatch[1]);
    const stopDate = stopMatch ? parseXmltvDate(stopMatch[1]) : (startDate ? new Date(startDate.getTime() + 3600000) : null);

    if (!startDate || !stopDate) continue;

    const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = body.match(/<desc[^>]*>([^<]+)<\/desc>/i);
    const catMatch = body.match(/<category[^>]*>([^<]+)<\/category>/i);

    const item: EpgProgramItem = {
      channelId,
      title: titleMatch ? titleMatch[1].trim() : 'Programação ao Vivo',
      start: startDate,
      stop: stopDate,
      desc: descMatch ? descMatch[1].trim() : undefined,
      category: catMatch ? catMatch[1].trim() : undefined
    };

    const list = map.get(channelId) || [];
    list.push(item);
    map.set(channelId, list);
  }

  for (const [, list] of map.entries()) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return map;
}

export function findCurrentAndNextProgram(
  channelName: string,
  epgId: string | undefined,
  programmesMap: Map<string, EpgProgramItem[]>,
  now: Date = new Date()
): { nowTitle?: string; nextTitle?: string } {
  let progs: EpgProgramItem[] | undefined;
  if (epgId) {
    progs = programmesMap.get(epgId.toLowerCase());
  }

  if (!progs) {
    const normName = channelName.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, list] of programmesMap.entries()) {
      const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normKey === normName || normKey.includes(normName) || normName.includes(normKey)) {
        progs = list;
        break;
      }
    }
  }

  if (!progs || progs.length === 0) return {};

  const nowMs = now.getTime();
  let currentProg: EpgProgramItem | undefined;
  let nextProg: EpgProgramItem | undefined;

  for (let i = 0; i < progs.length; i++) {
    const p = progs[i];
    const startMs = p.start.getTime();
    const stopMs = p.stop.getTime();

    if (nowMs >= startMs && nowMs < stopMs) {
      currentProg = p;
      nextProg = progs[i + 1];
      break;
    } else if (startMs > nowMs) {
      nextProg = p;
      break;
    }
  }

  return {
    nowTitle: currentProg ? currentProg.title : undefined,
    nextTitle: nextProg ? nextProg.title : undefined
  };
}

