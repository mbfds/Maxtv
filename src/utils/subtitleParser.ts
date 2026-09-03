/**
 * Parser e utilitários para legendas WebVTT (.vtt) e SRT (.srt)
 * Suporta carregamento por arquivo local, URL remota, sincronização de tempo e estilização.
 */

export interface SubtitleCue {
  id?: string;
  start: number; // segundos
  end: number;   // segundos
  text: string;
}

export interface SubtitleStyleConfig {
  fontSize: 'small' | 'medium' | 'large' | 'extralarge';
  fontColor: 'white' | 'yellow' | 'cyan';
  backgroundMode: 'translucent' | 'solid' | 'outline';
  offsetSeconds: number; // sincronização: atrasar (-) ou adiantar (+)
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyleConfig = {
  fontSize: 'medium',
  fontColor: 'white',
  backgroundMode: 'translucent',
  offsetSeconds: 0,
};

const SUBTITLE_CONFIG_STORAGE_KEY = 'maxtv_subtitle_config';

export function getStoredSubtitleConfig(): SubtitleStyleConfig {
  try {
    const raw = localStorage.getItem(SUBTITLE_CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SUBTITLE_STYLE, ...JSON.parse(raw) };
    }
  } catch (e) {}
  return DEFAULT_SUBTITLE_STYLE;
}

export function saveStoredSubtitleConfig(config: SubtitleStyleConfig): void {
  try {
    localStorage.setItem(SUBTITLE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {}
}

/**
 * Converte timestamp WebVTT ou SRT (hh:mm:ss.mmm ou mm:ss.mmm) em segundos
 */
function parseTimestamp(timeStr: string): number | null {
  if (!timeStr) return null;
  // Substitui vírgula de SRT por ponto de VTT
  const normalized = timeStr.trim().replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 2) {
    // mm:ss.mmm
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  } else if (parts.length === 3) {
    // hh:mm:ss.mmm
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    return h * 3600 + m * 60 + s;
  }

  return null;
}

/**
 * Faz parse de texto WebVTT ou SRT para lista de SubtitleCue
 */
export function parseSubtitleText(rawText: string): SubtitleCue[] {
  if (!rawText || typeof rawText !== 'string') return [];

  const cues: SubtitleCue[] = [];
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let i = 0;
  // Avança além do cabeçalho WEBVTT e metadados iniciais
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    let timeLine = line;
    let cueId = '';

    // Verifica se a linha atual é identificador numérico e a próxima tem '-->'
    if (!line.includes('-->') && i + 1 < lines.length && lines[i + 1].includes('-->')) {
      cueId = line;
      i++;
      timeLine = lines[i].trim();
    }

    if (timeLine.includes('-->')) {
      const parts = timeLine.split('-->');
      const startSec = parseTimestamp(parts[0]);
      // Remove configurações WebVTT adicionais após o timestamp final (ex: align:center line:90%)
      const endPart = parts[1] ? parts[1].trim().split(/\s+/)[0] : '';
      const endSec = parseTimestamp(endPart);

      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
        // Se a próxima linha contiver '-->', a linha atual é o ID da próxima cue
        if (i + 1 < lines.length && lines[i + 1].includes('-->')) {
          break;
        }
        textLines.push(lines[i]);
        i++;
      }

      if (startSec !== null && endSec !== null && endSec > startSec) {
        const rawContent = textLines.join('\n');
        // Limpa tags HTML como <b>, <i>, <font>, <c>, <v> mantendo o texto legível
        const cleanContent = rawContent
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lrm;|&rlm;/g, '')
          .trim();

        if (cleanContent) {
          cues.push({
            id: cueId || `cue-${cues.length + 1}`,
            start: startSec,
            end: endSec,
            text: cleanContent
          });
        }
      }
    } else {
      i++;
    }
  }

  // Ordena cues por tempo de início para performance na busca
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/**
 * Encontra as legendas ativas para o tempo atual do vídeo, aplicando o offset de sincronização
 */
export function getActiveCues(
  cues: SubtitleCue[],
  currentTime: number,
  offsetSeconds: number = 0
): SubtitleCue[] {
  if (!cues || cues.length === 0) return [];
  const targetTime = currentTime + offsetSeconds;
  return cues.filter(cue => targetTime >= cue.start && targetTime <= cue.end);
}

/**
 * Cria um Blob URL WebVTT a partir do texto ou lista de cues
 */
export function createVttBlobUrl(textOrCues: string | SubtitleCue[]): string {
  let vttString: string;
  if (typeof textOrCues === 'string') {
    // Garante cabeçalho WEBVTT
    if (!textOrCues.trim().startsWith('WEBVTT')) {
      vttString = `WEBVTT\n\n${textOrCues}`;
    } else {
      vttString = textOrCues;
    }
  } else {
    vttString = 'WEBVTT\n\n' + textOrCues.map((c, idx) => {
      const formatTime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        const ms = Math.floor((secs % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
      };
      return `${idx + 1}\n${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text}\n`;
    }).join('\n');
  }

  const blob = new Blob([vttString], { type: 'text/vtt;charset=utf-8' });
  return URL.createObjectURL(blob);
}

/**
 * Carrega e faz parse de arquivo local selecionado pelo usuário
 */
export async function loadSubtitleFromFile(file: File): Promise<{
  label: string;
  content: string;
  cues: SubtitleCue[];
  blobUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = (e.target?.result as string) || '';
        const cues = parseSubtitleText(content);
        const blobUrl = createVttBlobUrl(content);
        // Gera um nome limpo sem extensão
        const cleanName = file.name.replace(/\.(vtt|srt)$/i, '');
        resolve({
          label: cleanName,
          content,
          cues,
          blobUrl
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo de legenda'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Carrega legenda a partir de uma URL remota (.vtt ou .srt)
 */
export async function loadSubtitleFromUrl(url: string, label?: string): Promise<{
  label: string;
  content: string;
  cues: SubtitleCue[];
  blobUrl: string;
}> {
  let finalUrl = url;
  try {
    // Tenta fetch direto
    let res = await fetch(finalUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      // Fallback via proxy interno caso ocorra bloqueio de CORS
      finalUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      res = await fetch(finalUrl, { signal: AbortSignal.timeout(10000) });
    }
    const content = await res.text();
    const cues = parseSubtitleText(content);
    const blobUrl = createVttBlobUrl(content);
    const derivedLabel = label || url.split('/').pop()?.replace(/\.(vtt|srt).*$/i, '') || 'Legenda Web';
    return {
      label: derivedLabel,
      content,
      cues,
      blobUrl
    };
  } catch (err: any) {
    // Tenta via proxy
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Falha ao baixar legenda (HTTP ${res.status})`);
    const content = await res.text();
    const cues = parseSubtitleText(content);
    const blobUrl = createVttBlobUrl(content);
    const derivedLabel = label || url.split('/').pop()?.replace(/\.(vtt|srt).*$/i, '') || 'Legenda Web';
    return {
      label: derivedLabel,
      content,
      cues,
      blobUrl
    };
  }
}
