/**
 * MAXTV Channel & Stream URL Mismatch Detector
 * Verifica se os URLs M3U correspondem fielmente aos nomes dos canais cadastrados,
 * prevenindo o clássico problema de "troca de grade" (ex: Canal Band apontando para Band News,
 * Globo apontando para afiliada regional errada ou canal trocado por emissora concorrente).
 */

export interface ChannelUrlMismatch {
  channelId?: string;
  channelName: string;
  streamUrl: string;
  category?: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  detectedBrandInName?: string;
  detectedBrandInUrl?: string;
  suggestedAction?: string;
}

export interface ChannelMismatchSummary {
  totalTested: number;
  mismatchesCount: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  hasHighSeverity: boolean;
  mismatches: ChannelUrlMismatch[];
}

interface NetworkBrandRule {
  id: string;
  primaryName: string;
  nameTokens: string[];
  urlTokens: string[];
  // Subcanais ou marcas derivadas que NÃO devem ser confundidas com o canal principal aberto
  subchannels?: Array<{
    id: string;
    label: string;
    tokens: string[];
    isNews?: boolean;
    isSports?: boolean;
  }>;
  // Afiliadas regionais que merecem aviso caso estejam vinculadas a outro estado
  affiliates?: Array<{
    id: string;
    label: string;
    tokens: string[];
    region?: string;
  }>;
}

const NETWORK_RULES: NetworkBrandRule[] = [
  {
    id: 'globo',
    primaryName: 'Globo',
    nameTokens: ['globo', 'tv globo', 'tvglobo'],
    urlTokens: ['globo', 'tvglobo', 'redeglobo'],
    subchannels: [
      { id: 'globonews', label: 'GloboNews', tokens: ['globonews', 'globo_news', 'globo-news', 'gnews'], isNews: true },
      { id: 'sportv', label: 'SporTV', tokens: ['sportv', 'spor_tv', 'sportv1', 'sportv2', 'sportv3'], isSports: true },
      { id: 'multishow', label: 'Multishow', tokens: ['multishow', 'multi_show'] },
      { id: 'gnt', label: 'GNT', tokens: ['gnt'] },
      { id: 'viva', label: 'Canal Viva', tokens: ['viva', 'canalviva'] },
      { id: 'combate', label: 'Combate', tokens: ['combate'], isSports: true },
      { id: 'premiere', label: 'Premiere', tokens: ['premiere', 'pfc'], isSports: true },
      { id: 'megapix', label: 'Megapix', tokens: ['megapix'] },
      { id: 'globoplay', label: 'Globoplay Novelas/Gplay', tokens: ['globoplay', 'gplay'] }
    ],
    affiliates: [
      { id: 'morena', label: 'TV Morena (MS)', tokens: ['tv_morena', 'tvmorena', 'dorados', 'dourados', 'campo_grande'] },
      { id: 'rbs', label: 'RBS TV (RS/SC)', tokens: ['rbs', 'rbstv', 'portoalegre'] },
      { id: 'rpc', label: 'RPC (PR)', tokens: ['rpc', 'rpctv', 'curitiba'] },
      { id: 'eptv', label: 'EPTV (SP/MG)', tokens: ['eptv', 'campinas', 'ribeirao'] },
      { id: 'anhanguera', label: 'TV Anhanguera (GO/TO)', tokens: ['anhanguera', 'goiania'] },
      { id: 'gazeta', label: 'TV Gazeta (ES/AL)', tokens: ['gazeta_es', 'gazeta_al'] }
    ]
  },
  {
    id: 'sbt',
    primaryName: 'SBT',
    nameTokens: ['sbt', 'sistema brasileiro de televisao'],
    urlTokens: ['sbt', 'tvsbt', 'redesbt'],
    subchannels: [
      { id: 'sbtnews', label: 'SBT News', tokens: ['sbtnews', 'sbt_news', 'sbt-news'], isNews: true }
    ],
    affiliates: [
      { id: 'alterosa', label: 'TV Alterosa (MG)', tokens: ['alterosa'] },
      { id: 'sbt_interior', label: 'SBT Interior (SP)', tokens: ['sbtinterior', 'sbt_interior'] },
      { id: 'jangadeiro', label: 'TV Jangadeiro (CE)', tokens: ['jangadeiro'] },
      { id: 'sbt_rs', label: 'SBT RS', tokens: ['sbtrs', 'sbt_rs'] }
    ]
  },
  {
    id: 'band',
    primaryName: 'Band',
    nameTokens: ['band', 'bandeirantes', 'rede bandeirantes'],
    urlTokens: ['band', 'bandeirantes', 'redeband'],
    subchannels: [
      { id: 'bandnews', label: 'Band News', tokens: ['bandnews', 'band_news', 'band-news'], isNews: true },
      { id: 'bandsports', label: 'BandSports', tokens: ['bandsports', 'band_sports', 'band-sports'], isSports: true },
      { id: 'terraviva', label: 'Terra Viva', tokens: ['terraviva', 'terra_viva'] },
      { id: 'agromais', label: 'AgroMais', tokens: ['agromais', 'agro_mais'] }
    ]
  },
  {
    id: 'record',
    primaryName: 'Record',
    nameTokens: ['record', 'recordtv', 'tv record', 'rede record'],
    urlTokens: ['record', 'recordtv', 'tvrecord'],
    subchannels: [
      { id: 'recordnews', label: 'Record News', tokens: ['recordnews', 'record_news', 'record-news'], isNews: true }
    ],
    affiliates: [
      { id: 'record_litoral', label: 'Record Litoral/Interior', tokens: ['recordlitoral', 'record_litoral', 'record_interior'] },
      { id: 'record_goias', label: 'Record Goiás', tokens: ['recordgoias', 'record_goias'] },
      { id: 'correio', label: 'TV Correio (PB)', tokens: ['tvcorreio'] }
    ]
  },
  {
    id: 'cultura',
    primaryName: 'TV Cultura',
    nameTokens: ['cultura', 'tv cultura', 'tvcultura'],
    urlTokens: ['cultura', 'tvcultura']
  },
  {
    id: 'redetv',
    primaryName: 'RedeTV!',
    nameTokens: ['redetv', 'rede tv'],
    urlTokens: ['redetv', 'rede_tv', 'rede-tv']
  },
  {
    id: 'cnn',
    primaryName: 'CNN Brasil',
    nameTokens: ['cnn brasil', 'cnn'],
    urlTokens: ['cnn', 'cnnbrasil', 'cnn_brasil']
  },
  {
    id: 'jovempan',
    primaryName: 'Jovem Pan News',
    nameTokens: ['jovem pan', 'jp news', 'jovempan'],
    urlTokens: ['jovempan', 'jovem_pan', 'jpnews', 'jpan']
  },
  {
    id: 'espn',
    primaryName: 'ESPN',
    nameTokens: ['espn'],
    urlTokens: ['espn']
  },
  {
    id: 'sportv',
    primaryName: 'SporTV',
    nameTokens: ['sportv', 'spor tv'],
    urlTokens: ['sportv', 'spor_tv']
  },
  {
    id: 'premiere',
    primaryName: 'Premiere',
    nameTokens: ['premiere', 'pfc'],
    urlTokens: ['premiere', 'pfc']
  },
  {
    id: 'telecine',
    primaryName: 'Telecine',
    nameTokens: ['telecine'],
    urlTokens: ['telecine']
  },
  {
    id: 'hbo',
    primaryName: 'HBO',
    nameTokens: ['hbo'],
    urlTokens: ['hbo']
  },
  {
    id: 'cartoon',
    primaryName: 'Cartoon Network',
    nameTokens: ['cartoon network', 'cartoon'],
    urlTokens: ['cartoon', 'cartoon_network', 'cn_live']
  },
  {
    id: 'disney',
    primaryName: 'Disney Channel',
    nameTokens: ['disney', 'disney channel', 'disney junior'],
    urlTokens: ['disney', 'disneychannel']
  },
  {
    id: 'nickelodeon',
    primaryName: 'Nickelodeon',
    nameTokens: ['nickelodeon', 'nick jr', 'nick'],
    urlTokens: ['nickelodeon', 'nickjr', 'nick']
  }
];

function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[_\-\/\.:#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCompact(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractUrlKeywords(url: string): { normalized: string; compact: string } {
  try {
    const parsed = new URL(url);
    const fullPath = `${parsed.pathname} ${parsed.search}`.toLowerCase();
    return {
      normalized: normalizeText(fullPath),
      compact: toCompact(fullPath)
    };
  } catch {
    return {
      normalized: normalizeText(url),
      compact: toCompact(url)
    };
  }
}

function matchTokenInString(token: string, textNorm: string, textCompact: string): boolean {
  const normToken = normalizeText(token);
  const compactToken = toCompact(token);

  if (textNorm.includes(normToken)) return true;
  if (compactToken.length >= 3 && textCompact.includes(compactToken)) return true;
  return false;
}

/**
 * Valida a correspondência entre o nome do canal e a URL M3U informada
 */
export function detectChannelUrlMismatch(
  channelName: string,
  streamUrl: string,
  category?: string,
  channelId?: string
): ChannelUrlMismatch | null {
  if (!channelName || !streamUrl) return null;

  const rawName = channelName.trim();
  const rawUrl = streamUrl.trim();
  const normName = normalizeText(rawName);
  const compactName = toCompact(rawName);
  const { normalized: normUrl, compact: compactUrl } = extractUrlKeywords(rawUrl);

  // 1. Identifica a marca/rede presente no Nome do Canal
  let matchedBrand: NetworkBrandRule | null = null;
  for (const rule of NETWORK_RULES) {
    if (rule.nameTokens.some(token => {
      const normToken = normalizeText(token);
      const regex = new RegExp(`(^|\\s)${normToken}(\\s|$)`, 'i');
      return regex.test(normName) || (normToken.length > 3 && compactName.includes(toCompact(normToken)));
    })) {
      matchedBrand = rule;
      break;
    }
  }

  // 2. Identifica se a URL contém explicitamente marca de uma OUTRA emissora concorrente (Troca de emissora grave)
  if (matchedBrand) {
    const competingBrands = NETWORK_RULES.filter(b => b.id !== matchedBrand!.id);
    for (const comp of competingBrands) {
      const urlHasComp = comp.urlTokens.some(token => matchTokenInString(token, normUrl, compactUrl));

      if (urlHasComp) {
        // Exceção: Família Globo
        const isGloboFamily = ['globo', 'sportv', 'premiere', 'telecine'].includes(matchedBrand.id) &&
                              ['globo', 'sportv', 'premiere', 'telecine'].includes(comp.id);

        if (!isGloboFamily) {
          return {
            channelId,
            channelName: rawName,
            streamUrl: rawUrl,
            category,
            severity: 'high',
            title: `Troca de Emissora: "${matchedBrand.primaryName}" vs "${comp.primaryName}"`,
            reason: `O canal está nomeado como "${rawName}", mas a URL aponta claramente para a rede concorrente "${comp.primaryName}".`,
            detectedBrandInName: matchedBrand.primaryName,
            detectedBrandInUrl: comp.primaryName,
            suggestedAction: `Verifique o link M3U antes de importar para evitar transmitir ${comp.primaryName} na vaga de ${rawName}.`
          };
        }
      }
    }
  }

  // 3. Verificação de Subcanais vs Canal Aberto Principal (Ex: Band Aberta vs Band News / Record vs Record News)
  if (matchedBrand && matchedBrand.subchannels && matchedBrand.subchannels.length > 0) {
    for (const sub of matchedBrand.subchannels) {
      const isSubchannelInUrl = sub.tokens.some(t => matchTokenInString(t, normUrl, compactUrl));
      const isSubchannelInName = sub.tokens.some(t => matchTokenInString(t, normName, compactName)) ||
                                 matchTokenInString(sub.label, normName, compactName);

      // Se a URL aponta para o subcanal (ex: BAND_NEWS, RECORD_NEWS, SBT_NEWS), mas o nome do canal é apenas o canal aberto principal
      if (isSubchannelInUrl && !isSubchannelInName) {
        return {
          channelId,
          channelName: rawName,
          streamUrl: rawUrl,
          category,
          severity: 'high',
          title: `Subcanal Incompatível: "${rawName}" vs "${sub.label}"`,
          reason: `O nome do canal é "${rawName}" (canal aberto geral), mas o endereço de transmissão (URL) aponta para o subcanal "${sub.label}".`,
          detectedBrandInName: rawName,
          detectedBrandInUrl: sub.label,
          suggestedAction: `Se este canal for o ${matchedBrand.primaryName} Aberto, substitua o URL por uma transmissão da programação geral aberta.`
        };
      }
    }
  }

  // 4. Verificação de Afiliadas Regionais Conflitantes (Ex: Globo RJ ou Globo SP apontando para TV Morena Dourados)
  if (matchedBrand && matchedBrand.affiliates && matchedBrand.affiliates.length > 0) {
    for (const aff of matchedBrand.affiliates) {
      const isAffiliateInUrl = aff.tokens.some(t => matchTokenInString(t, normUrl, compactUrl));
      const isAffiliateInName = aff.tokens.some(t => matchTokenInString(t, normName, compactName)) ||
                                matchTokenInString(aff.label, normName, compactName);

      if (isAffiliateInUrl && !isAffiliateInName) {
        const specifiesOtherRegion = normName.includes(' sp') ||
                                     normName.includes(' rj') ||
                                     normName.includes(' minas') ||
                                     normName.includes(' df') ||
                                     normName.includes(' bahia') ||
                                     normName.includes(' brasilia');

        return {
          channelId,
          channelName: rawName,
          streamUrl: rawUrl,
          category,
          severity: specifiesOtherRegion ? 'high' : 'medium',
          title: `Divergência de Afiliada Regional: "${rawName}" vs "${aff.label}"`,
          reason: `O canal está cadastrado como "${rawName}", porém a URL de transmissão pertence à afiliada regional "${aff.label}".`,
          detectedBrandInName: rawName,
          detectedBrandInUrl: aff.label,
          suggestedAction: `Os telejornais locais e comerciais exibidos serão da praça de ${aff.label}, e não de ${rawName}.`
        };
      }
    }
  }

  // 5. Verificação de Numeração de Canais (Ex: SporTV 1 com URL de sportv2 ou sportv3 / ESPN 2 com URL de espn4)
  const numberedChannels = [
    { base: 'sportv', label: 'SporTV' },
    { base: 'espn', label: 'ESPN' },
    { base: 'premiere', label: 'Premiere' }
  ];

  for (const nc of numberedChannels) {
    if (normName.includes(nc.base)) {
      const nameNumMatch = normName.match(new RegExp(`${nc.base}\\s*(\\d+)`, 'i'));
      const urlNumMatch = normUrl.match(new RegExp(`${nc.base}[_\\-]?(\\d+)`, 'i'));

      if (nameNumMatch && urlNumMatch && nameNumMatch[1] !== urlNumMatch[1]) {
        return {
          channelId,
          channelName: rawName,
          streamUrl: rawUrl,
          category,
          severity: 'high',
          title: `Numeração Invertida: ${nc.label} ${nameNumMatch[1]} vs ${nc.label} ${urlNumMatch[1]}`,
          reason: `O canal está identificado como "${nc.label} ${nameNumMatch[1]}", mas o link aponta para "${nc.label} ${urlNumMatch[1]}".`,
          detectedBrandInName: `${nc.label} ${nameNumMatch[1]}`,
          detectedBrandInUrl: `${nc.label} ${urlNumMatch[1]}`,
          suggestedAction: `Corrija a ordem dos canais no arquivo M3U para não inverter a transmissão.`
        };
      }
    }
  }

  // 6. Verificação de Incompatibilidade Categórica Grave
  const isKidsCategory = category === 'Infantis' || normName.includes('kids') || normName.includes('infantil') || normName.includes('desenho');
  const isAdultUrl = normUrl.includes('adult') || normUrl.includes('xxx') || normUrl.includes('sexy') || normUrl.includes('playboy');

  if (isKidsCategory && isAdultUrl) {
    return {
      channelId,
      channelName: rawName,
      streamUrl: rawUrl,
      category,
      severity: 'high',
      title: `Alerta Crítico de Categoria: Conteúdo Impróprio`,
      reason: `O canal está na categoria Infantil ("${rawName}"), mas a URL contém palavras-chave de conteúdo adulto.`,
      suggestedAction: `Bloqueie ou desmarque imediatamente este canal da grade.`
    };
  }

  return null;
}

/**
 * Analisa uma lista de canais em lote e retorna um resumo completo com todas as inconsistências
 */
export function analyzeChannelsMismatches(
  channels: Array<{ name: string; streamUrl: string; category?: string; id?: string }>
): ChannelMismatchSummary {
  const mismatches: ChannelUrlMismatch[] = [];
  let highSeverityCount = 0;
  let mediumSeverityCount = 0;
  let lowSeverityCount = 0;

  for (const ch of channels) {
    const mismatch = detectChannelUrlMismatch(ch.name, ch.streamUrl, ch.category, ch.id);
    if (mismatch) {
      mismatches.push(mismatch);
      if (mismatch.severity === 'high') highSeverityCount++;
      else if (mismatch.severity === 'medium') mediumSeverityCount++;
      else lowSeverityCount++;
    }
  }

  return {
    totalTested: channels.length,
    mismatchesCount: mismatches.length,
    highSeverityCount,
    mediumSeverityCount,
    lowSeverityCount,
    hasHighSeverity: highSeverityCount > 0,
    mismatches
  };
}
