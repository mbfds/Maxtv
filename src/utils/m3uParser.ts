import { Channel, ChannelCategory } from '../types';

export interface ParsedM3uItem {
  id: string;
  name: string;
  logo: string;
  category: ChannelCategory;
  url: string;
  groupTitle?: string;
  tvgId?: string;
  isVipOnly?: boolean;
}

export interface M3uParseSummary {
  totalChannels: number;
  categories: Record<string, number>;
  sampleChannels: ParsedM3uItem[];
}

export function categorizeM3uChannel(name: string, groupTitle?: string): ChannelCategory {
  const text = `${name} ${groupTitle || ''}`.toLowerCase();

  if (
    text.includes('esporte') ||
    text.includes('sport') ||
    text.includes('premiere') ||
    text.includes('espn') ||
    text.includes('combate') ||
    text.includes('nba') ||
    text.includes('dazn') ||
    text.includes('futebol') ||
    text.includes('conmebol')
  ) {
    return 'Esportes';
  }

  if (
    text.includes('globo') ||
    text.includes('sbt') ||
    text.includes('record') ||
    text.includes('band') ||
    text.includes('cultura') ||
    text.includes('rede tv') ||
    text.includes('redetv') ||
    text.includes('aberto') ||
    text.includes('aberta') ||
    text.includes('tv brasil')
  ) {
    return 'Abertos';
  }

  if (
    text.includes('notícia') ||
    text.includes('noticia') ||
    text.includes('news') ||
    text.includes('cnn') ||
    text.includes('jovem pan') ||
    text.includes('globonews') ||
    text.includes('bandnews')
  ) {
    return 'Notícias';
  }

  if (
    text.includes('filme') ||
    text.includes('série') ||
    text.includes('serie') ||
    text.includes('telecine') ||
    text.includes('hbo') ||
    text.includes('max') ||
    text.includes('cinema') ||
    text.includes('warner') ||
    text.includes('paramount') ||
    text.includes('universal') ||
    text.includes('megapix') ||
    text.includes('tnt') ||
    text.includes('space')
  ) {
    return 'Filmes & Séries';
  }

  if (
    text.includes('infantil') ||
    text.includes('kids') ||
    text.includes('cartoon') ||
    text.includes('desenho') ||
    text.includes('nickelodeon') ||
    text.includes('disney') ||
    text.includes('gloob') ||
    text.includes('discovery kids')
  ) {
    return 'Infantis';
  }

  if (
    text.includes('documentário') ||
    text.includes('documentario') ||
    text.includes('doc') ||
    text.includes('discovery') ||
    text.includes('history') ||
    text.includes('nat geo') ||
    text.includes('animal planet')
  ) {
    return 'Documentários';
  }

  return 'Variedades & Música';
}

export function parseM3uText(content: string, maxItems: number = 5000): ParsedM3uItem[] {
  const lines = content.split(/\r?\n/);
  const items: ParsedM3uItem[] = [];
  let currentMeta: { name: string; logo: string; group: string; tvgId: string } | null = null;

  for (let i = 0; i < lines.length && items.length < maxItems; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Extract tvg attributes
      const nameMatch = line.match(/tvg-name="([^"]+)"/) || line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const idMatch = line.match(/tvg-id="([^"]+)"/);

      const rawName = nameMatch ? nameMatch[1].trim() : 'Canal';
      const logo = logoMatch ? logoMatch[1].trim() : '';
      const group = groupMatch ? groupMatch[1].trim() : '';
      const tvgId = idMatch ? idMatch[1].trim() : '';

      currentMeta = { name: rawName, logo, group, tvgId };
    } else if (!line.startsWith('#') && currentMeta) {
      if (line.startsWith('http://') || line.startsWith('https://')) {
        const cat = categorizeM3uChannel(currentMeta.name, currentMeta.group);
        const isFree = ['globo', 'sbt', 'band', 'record', 'cultura', 'tv brasil', 'caze', 'cnn brasil'].some(k =>
          currentMeta!.name.toLowerCase().includes(k)
        );

        items.push({
          id: `m3u-${Date.now()}-${items.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
          name: currentMeta.name,
          logo: currentMeta.logo || 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=200&auto=format&fit=crop&q=80',
          category: cat,
          url: line,
          groupTitle: currentMeta.group,
          tvgId: currentMeta.tvgId,
          isVipOnly: !isFree
        });
      }
      currentMeta = null;
    }
  }

  return items;
}

export function convertParsedToChannels(parsed: ParsedM3uItem[]): Channel[] {
  return parsed.map((item, idx) => ({
    id: item.id || `ch-imp-${idx + 1}`,
    name: item.name,
    category: item.category,
    logo: item.logo,
    sources: [{ url: item.url }],
    isVipOnly: item.isVipOnly ?? false,
    isActive: true,
    epgNow: 'Transmissão ao Vivo (Lista Importada)',
    epgNext: 'Programação Contínua',
    healthStatus: 'online'
  }));
}
