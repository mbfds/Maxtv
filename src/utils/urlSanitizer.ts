/**
 * Utilitário de limpeza e higienização profunda de URLs de stream.
 * Remove espaços em branco acidentais, caracteres de controle invisíveis ASCII/Unicode,
 * quebras de linha e aspas de cópia acidental, garantindo que o player receba sempre
 * uma URL válida e pronta para reprodução HLS / DASH / MP4.
 */

// Regex para caracteres de controle ASCII (0x00 - 0x1F e 0x7F)
// Exemplos: \0 (null), \r (CR), \n (LF), \t (TAB), \f, \b, etc.
const ASCII_CONTROL_REGEX = /[\x00-\x1F\x7F]/g;

// Regex para caracteres invisíveis e de controle Unicode:
// \u00A0 (Non-breaking space)
// \u200B (Zero-width space)
// \u200C (Zero-width non-joiner)
// \u200D (Zero-width joiner)
// \uFEFF (Byte order mark / Zero-width no-break space)
// \u2028 (Line separator)
// \u2029 (Paragraph separator)
// \u200E / \u200F (LTR / RTL marks)
// \u00AD (Soft hyphen)
// \u2060 (Word joiner)
// \u180E (Mongolian vowel separator)
// \u2000-\u200A (Espaços tipográficos Unicode)
const UNICODE_CONTROL_AND_INVISIBLE_SPACES_REGEX = /[\u0000-\u001F\u007F-\u009F\u00AD\u1680\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/g;

export interface CleanUrlResult {
  cleanedUrl: string;
  originalUrl: string;
  wasModified: boolean;
  hasControlChars: boolean;
  hasLeadingTrailingSpaces: boolean;
  hasInternalSpaces: boolean;
  isValid: boolean;
  reason?: string;
}

/**
 * Higieniza uma URL de stream removendo:
 * - Caracteres de controle ASCII e Unicode invisíveis
 * - Espaços no início e no fim (.trim())
 * - Aspas acidentais ou marcadores copiados de chats ou planilhas (" ' < > ` “ ”)
 * - Espaços no protocolo ou entre host e caminhos
 * - Espaços acidentais em torno de barras, ? e &
 * - Converte espaços de títulos no path para %20
 */
export function cleanStreamUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  return sanitizeStreamUrl(rawUrl);
}

export function sanitizeStreamUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  let str = rawUrl;

  // 1. Substitui espaços especiais (non-breaking space \u00A0, ideográficos, etc.) por espaço comum
  str = str.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

  // 2. Remove caracteres de controle invisíveis Unicode e ASCII (null bytes, zero-width, quebras de linha)
  str = str.replace(UNICODE_CONTROL_AND_INVISIBLE_SPACES_REGEX, '');
  str = str.replace(ASCII_CONTROL_REGEX, '');

  // 3. Remove espaços em branco nas extremidades
  str = str.trim();

  // 4. Remove aspas ou delimitadores envolventes acidentais (ex: "http...", 'http...', <http...>, [http...])
  str = str.replace(/^["'`«“‘<(\[]+|["'`»”’>)\]]+$/g, '').trim();

  // 5. Remove prefixos comuns colados por engano (ex: "url:", "link:", "stream:", "hls:")
  str = str.replace(/^(url|link|stream|hls|src)\s*:\s*/i, '').trim();

  // 6. Corrige espaços ao redor do protocolo (ex: "http : //" -> "http://", "https ://" -> "https://")
  str = str.replace(/^(https?)\s*:\s*\/+\s*/i, '$1://');

  // 7. Normaliza protocolo e partes de host e path
  if (/^https?:\/\//i.test(str)) {
    const protoMatch = str.match(/^(https?:\/\/)(.*)$/i);
    if (protoMatch) {
      const proto = protoMatch[1].toLowerCase();
      let rest = protoMatch[2].trim();

      const firstSlashIdx = rest.indexOf('/');
      if (firstSlashIdx === -1) {
        // Apenas domínio e porta: sem espaços
        rest = rest.replace(/\s+/g, '');
        str = proto + rest;
      } else {
        let hostPart = rest.slice(0, firstSlashIdx).replace(/\s+/g, '');
        let pathPart = rest.slice(firstSlashIdx);

        // Remove espaços acidentais antes e depois de barras no path
        pathPart = pathPart.replace(/\s*\/\s*/g, '/');
        // Remove espaços acidentais antes ou depois de ? e &
        pathPart = pathPart.replace(/\s*\?\s*/g, '?').replace(/\s*&\s*/g, '&').replace(/\s*=\s*/g, '=');
        // Remove espaços acidentais antes de extensões (ex: "live .m3u8" -> "live.m3u8")
        pathPart = pathPart.replace(/\s+\.(\w+)(\?|$)/, '.$1$2');

        // Se houver espaços remanescentes no path, substitui por %20 para garantir sintaxe válida de URI
        pathPart = pathPart.replace(/ +/g, '%20');

        str = proto + hostPart + pathPart;
      }
    }
  } else {
    // Caso não comece com http/https, limpa espaços em branco gerais
    str = str.replace(/\s+/g, '');
  }

  // Remove qualquer caractere ilegal de URL remanescente
  str = str.replace(/["'<>]/g, '');

  return str.trim();
}

/**
 * Inspeciona minuciosamente a URL original e retorna a versão higienizada
 * juntamente com um relatório do que foi corrigido (espaços, caracteres de controle, etc.).
 */
export function inspectAndCleanUrl(rawUrl: string): CleanUrlResult {
  const originalUrl = rawUrl || '';
  const hasControlChars =
    ASCII_CONTROL_REGEX.test(originalUrl) || UNICODE_CONTROL_AND_INVISIBLE_SPACES_REGEX.test(originalUrl);
  const hasLeadingTrailingSpaces = originalUrl !== originalUrl.trim();
  const hasInternalSpaces = /\s/.test(originalUrl.trim());

  const cleanedUrl = sanitizeStreamUrl(originalUrl);
  const wasModified = cleanedUrl !== originalUrl;

  let isValid = false;
  let reason: string | undefined;

  if (!cleanedUrl) {
    reason = 'A URL está vazia.';
  } else if (!/^https?:\/\//i.test(cleanedUrl)) {
    reason = 'A URL precisa iniciar com http:// ou https://';
  } else {
    try {
      new URL(cleanedUrl);
      isValid = true;
    } catch {
      reason = 'Formato de URL sintaticamente inválido pelo padrão WHATWG.';
    }
  }

  return {
    cleanedUrl,
    originalUrl,
    wasModified,
    hasControlChars,
    hasLeadingTrailingSpaces,
    hasInternalSpaces,
    isValid,
    reason
  };
}
