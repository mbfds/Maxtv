import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { Channel, EpgProgram, ChannelEpgSchedule, EpgEnrichResponse } from './src/types';
import { sqliteSaveEpgAiDescription, sqliteGetEpgAiDescription } from './serverSqlite';
import { parseXmltvProgrammes, EpgProgramItem } from './serverXmltv';

let geminiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// Carga sob demanda do XMLTV de amostra para enriquecimento inicial
let cachedXmltvMap: Map<string, EpgProgramItem[]> | null = null;
function getSampleXmltvMap(): Map<string, EpgProgramItem[]> {
  if (cachedXmltvMap) return cachedXmltvMap;
  try {
    const xmlPath = path.join(process.cwd(), 'public', 'sample-epg.xml');
    if (fs.existsSync(xmlPath)) {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      cachedXmltvMap = parseXmltvProgrammes(xmlContent);
    } else {
      cachedXmltvMap = new Map();
    }
  } catch (e) {
    cachedXmltvMap = new Map();
  }
  return cachedXmltvMap;
}

// Modelos de programação brasileira por categoria
interface ProgramTemplate {
  title: string;
  durationMinutes: number;
  category: string;
  rating: string;
  description: string;
  tags: string[];
  highlights: string[];
}

const TEMPLATES_ABERTOS: ProgramTemplate[] = [
  {
    title: 'Hora Um & Notícias da Manhã',
    durationMinutes: 120,
    category: 'Jornalismo',
    rating: 'Livre',
    description: 'Primeiras notícias do dia, trânsito nas grandes capitais, previsão do tempo e os fatos que vão marcar a jornada no Brasil e no exterior.',
    tags: ['Notícias', 'Trânsito', 'Previsão do Tempo', 'Ao Vivo'],
    highlights: ['Balanço da Madrugada', 'Giro pelas Capitais', 'Mobilidade Urbana']
  },
  {
    title: 'Bom Dia Brasil',
    durationMinutes: 90,
    category: 'Jornalismo',
    rating: 'Livre',
    description: 'Cobertura aprofundada dos assuntos políticos, econômicos e de interesse público com links ao vivo e correspondentes internacionais.',
    tags: ['Economia', 'Política', 'Brasília', 'Internacional'],
    highlights: ['Análise de Especialistas', 'Impacto no Bolso', 'Boletim Econômico']
  },
  {
    title: 'Encontro & Revista da Manhã',
    durationMinutes: 80,
    category: 'Variedades & Música',
    rating: 'Livre',
    description: 'Música, debates com convidados especiais, temas comportamentais, prestação de serviços e interação em tempo real.',
    tags: ['Entretenimento', 'Música', 'Entrevistas', 'Debates'],
    highlights: ['Atração Musical ao Vivo', 'Histórias Inspiradoras', 'Pauta Social']
  },
  {
    title: 'Mais Você & Culinária Brasileira',
    durationMinutes: 70,
    category: 'Variedades & Música',
    rating: 'Livre',
    description: 'Receitas práticas e saborosas, reportagens sobre estilo de vida, artesanato, curiosidades e o clássico pensamento do dia.',
    tags: ['Gastronomia', 'Culinária', 'Dicas', 'Estilo de Vida'],
    highlights: ['Receita do Dia', 'Dicas dos Chefs', 'Desafios Culinários']
  },
  {
    title: 'Telejornal do Meio-Dia',
    durationMinutes: 60,
    category: 'Notícias',
    rating: 'Livre',
    description: 'As notícias da sua região com foco nos serviços essenciais, transporte público, saúde, educação e denúncias da comunidade.',
    tags: ['Jornalismo Local', 'Comunidade', 'Serviço Público'],
    highlights: ['Fiscalização', 'Denúncia ao Vivo', 'Painel da Saúde']
  },
  {
    title: 'Globo Esporte & Giro dos Clubes',
    durationMinutes: 40,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Tudo sobre os preparativos dos times, bastidores dos treinos, gols da rodada, escalações e entrevistas exclusivas com craques.',
    tags: ['Futebol', 'Gols', 'Brasileirão', 'Bastidores'],
    highlights: ['Tabela Atualizada', 'Entrevista Exclusiva', 'Top 5 Gols']
  },
  {
    title: 'Jornal Hoje',
    durationMinutes: 70,
    category: 'Jornalismo',
    rating: 'Livre',
    description: 'O resumo completo dos acontecimentos mais importantes do início da tarde no Brasil e no mundo, com análise e checagem de fatos.',
    tags: ['Plantão', 'Notícias', 'Fatos Relevantes'],
    highlights: ['Última Hora', 'Radar de Notícias', 'Investigações']
  },
  {
    title: 'Edição Especial de Novela',
    durationMinutes: 60,
    category: 'Filmes & Séries',
    rating: '10',
    description: 'Os capítulos emocionantes de grandes sucessos da teledramaturgia nacional em edição especial vespertina.',
    tags: ['Novela', 'Teledramaturgia', 'Drama', 'Romance'],
    highlights: ['Revelação Inédita', 'Confronto Decisivo', 'Cenas Fortes']
  },
  {
    title: 'Sessão da Tarde - Cinema',
    durationMinutes: 100,
    category: 'Filmes & Séries',
    rating: '10',
    description: 'Filmes clássicos e aventuras para reunir toda a família com comédias leves, histórias emocionantes e grandes astros do cinema.',
    tags: ['Cinema', 'Família', 'Aventura', 'Comédia'],
    highlights: ['Dublagem Clássica', 'Aventura Inesquecível', 'Elenco Estrelado']
  },
  {
    title: 'Vale a Pena Ver de Novo',
    durationMinutes: 60,
    category: 'Filmes & Séries',
    rating: '12',
    description: 'Reexibição dos maiores clássicos da teledramaturgia brasileira que marcaram época e emocionaram milhões de telespectadores.',
    tags: ['Sucesso de Audiência', 'Drama', 'Conflito Familiar'],
    highlights: ['Reviravolta na Trama', 'Segredos do Passado']
  },
  {
    title: 'Novela das Seis',
    durationMinutes: 50,
    category: 'Filmes & Séries',
    rating: '10',
    description: 'Trama de época e romance com cenários deslumbrantes, intrigas, amores proibidos e fortes lições de superação.',
    tags: ['Novela das Seis', 'Romance', 'Época'],
    highlights: ['Desfecho de Romance', 'Cena Dramática']
  },
  {
    title: 'Segunda Edição Local & Notícias',
    durationMinutes: 40,
    category: 'Notícias',
    rating: 'Livre',
    description: 'Balanço das principais ocorrências do final de tarde na sua cidade e os preparativos para a noite.',
    tags: ['Cidades', 'Trânsito', 'Segurança'],
    highlights: ['Giro Policial', 'Condições do Tráfego']
  },
  {
    title: 'Novela das Sete',
    durationMinutes: 50,
    category: 'Filmes & Séries',
    rating: '12',
    description: 'Comédia romântica vibrante com ação, investigações divertidas e personagens carismáticos que conquistam o público.',
    tags: ['Comédia Romântica', 'Ação', 'Teledramaturgia'],
    highlights: ['Confusão Generalizada', 'Declaração Apaixonada']
  },
  {
    title: 'Jornal Nacional',
    durationMinutes: 50,
    category: 'Jornalismo',
    rating: 'Livre',
    description: 'O principal telejornal brasileiro com as grandes reportagens do dia, apuração rigorosa dos fatos políticos e cobertura global ao vivo.',
    tags: ['Jornal Nacional', 'Horário Nobre', 'Exclusivo', 'Ao Vivo'],
    highlights: ['Editorial Especial', 'Reportagem Investigativa', 'Giro Internacional']
  },
  {
    title: 'Novela das Nove - Horário Nobre',
    durationMinutes: 60,
    category: 'Filmes & Séries',
    rating: '14',
    description: 'A principal produção da teledramaturgia brasileira. Suspense eletrizante, paixões avassaladoras e reviravoltas no horário nobre.',
    tags: ['Horário Nobre', 'Grande Novela', 'Suspense', 'Drama'],
    highlights: ['Capítulo Decisivo', 'Confronto de Vilões', 'Revelação do Segredo']
  },
  {
    title: 'Futebol Ao Vivo / Sessão Noturna',
    durationMinutes: 130,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Transmissão ao vivo dos grandes clássicos do futebol nacional e internacional, com narração vibrante e comentários táticos.',
    tags: ['Futebol Ao Vivo', 'Brasileirão', 'Libertadores', 'Clássico'],
    highlights: ['Escalações Oficiais', 'Gols em Tempo Real', 'Pós-Jogo com Craques']
  },
  {
    title: 'Linha Direta / Jornal da Madrugada',
    durationMinutes: 60,
    category: 'Jornalismo',
    rating: '14',
    description: 'Debates sobre grandes casos, análises do fechamento de mercado e resumo do que será notícia no dia seguinte.',
    tags: ['Investigação', 'Debate', 'Fechamento'],
    highlights: ['Entrevista com Advogados', 'Documentos Exclusivos']
  },
  {
    title: 'Corujão - Cinema da Madrugada',
    durationMinutes: 110,
    category: 'Filmes & Séries',
    rating: '14',
    description: 'Grandes sucessos do cinema internacional com muita ação, suspense e aventura para os cinéfilos noturnos.',
    tags: ['Cinema Noturno', 'Ação', 'Suspense'],
    highlights: ['Filme Vencedor de Prêmios', 'Cenas Eletrizantes']
  }
];

const TEMPLATES_ESPORTES: ProgramTemplate[] = [
  {
    title: 'Giro Esportivo & Melhores Momentos',
    durationMinutes: 120,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Os melhores lances do futebol mundial, gols da rodada, jogadas incríveis e o resumo das principais ligas do planeta.',
    tags: ['Futebol', 'Gols', 'Melhores Momentos', 'Ligas Europeias'],
    highlights: ['Golaços do Fim de Semana', 'Tabelas Atualizadas']
  },
  {
    title: 'Redação Esportiva - Análise Matinal',
    durationMinutes: 120,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Debate ao vivo sobre as notícias que movimentam os clubes, bastidores do mercado da bola e análises da imprensa esportiva.',
    tags: ['Debate', 'Mercado da Bola', 'Ao Vivo'],
    highlights: ['Opinião dos Colunistas', 'Conexão com os Centros de Treinamento']
  },
  {
    title: 'Seleção Esporte & Debates',
    durationMinutes: 120,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Mesa redonda comandada pelos melhores comentaristas, abordando polêmicas de arbitragem, esquemas táticos e expectativas de títulos.',
    tags: ['Mesa Redonda', 'Tática', 'Arbitragem', 'Polêmicas'],
    highlights: ['Prancheta Tática', 'Áudio do VAR', 'Voz da Torcida']
  },
  {
    title: 'Tá na Área - Esquenta dos Jogos',
    durationMinutes: 120,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Descontração e informação com o esquenta completo para os jogos de hoje. Chegada dos ônibus, vestiários e escalações confirmadas.',
    tags: ['Pré-Jogo', 'Escalações', 'Ao Vivo', 'Informação'],
    highlights: ['Entrevista com Treinadores', 'Clima nas Arquibancadas']
  },
  {
    title: 'Transmissão Ao Vivo: Brasileirão Série A',
    durationMinutes: 150,
    category: 'Esportes',
    rating: 'Livre',
    description: 'A emoção do futebol brasileiro com transmissão completa, som ambiente dos estádios, estatísticas ao vivo e replays em múltiplos ângulos.',
    tags: ['Futebol Ao Vivo', 'Brasileirão', 'Tempo Real', 'HD'],
    highlights: ['Narração Exclusiva', 'Gols em Super Câmera Lenta', 'Estatísticas Sofascore']
  },
  {
    title: 'Troca de Passes & Pós-Jogo',
    durationMinutes: 90,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Análise detalhada de tudo que aconteceu na rodada com entrevistas coletivas dos técnicos, notas dos jogadores e discussões quentes.',
    tags: ['Pós-Jogo', 'Coletivas', 'Notas dos Jogadores'],
    highlights: ['Melhor em Campo', 'Golaço da Rodada', 'Classificação Atualizada']
  },
  {
    title: 'Noite dos Craques & Internacional',
    durationMinutes: 120,
    category: 'Esportes',
    rating: 'Livre',
    description: 'Cobertura dos campeonatos europeus: Champions League, Premier League, La Liga e os passos dos brasileiros brilhando no exterior.',
    tags: ['Champions League', 'Premier League', 'Futebol Europeu'],
    highlights: ['Craques Mundiais', 'Análise Internacional']
  }
];

const TEMPLATES_NOTICIAS: ProgramTemplate[] = [
  {
    title: 'Edição da Manhã & Abertura dos Mercados',
    durationMinutes: 180,
    category: 'Notícias',
    rating: 'Livre',
    description: 'Primeiras horas do mercado financeiro, cotações do dólar e da bolsa, notícias urgentes e decisões governamentais em Brasília.',
    tags: ['Economia', 'Mercados', 'Bolsa de Valores', 'Dólar'],
    highlights: ['Cotações em Tempo Real', 'Boletim de Brasília', 'Radar Internacional']
  },
  {
    title: 'Conexão Política & Análise de Bastidores',
    durationMinutes: 180,
    category: 'Notícias',
    rating: 'Livre',
    description: 'Os bastidores do Congresso Nacional, Supremo Tribunal Federal e Palácio do Planalto com os analistas mais respeitados do país.',
    tags: ['Política', 'Brasília', 'Congresso', 'STF'],
    highlights: ['Informação de Bastidor', 'Votações Decisivas', 'Entrevista com Ministros']
  },
  {
    title: 'Painel Central & Economia ao Vivo',
    durationMinutes: 180,
    category: 'Notícias',
    rating: 'Livre',
    description: 'Debate aprofundado sobre os rumos econômicos do Brasil, inflação, taxas de juros, emprego e o cenário geopolítico mundial.',
    tags: ['Economia Global', 'Inflação', 'Selic', 'Emprego'],
    highlights: ['Gráficos Econômicos', 'Opinião de Especialistas']
  },
  {
    title: 'Edição Especial Noturna & Grande Manchete',
    durationMinutes: 180,
    category: 'Notícias',
    rating: 'Livre',
    description: 'O grande telejornal da noite compilando os principais fatos do dia com reportagens especiais, investigações e perspectivas para o amanhã.',
    tags: ['Horário Nobre', 'Grandes Reportagens', 'Investigação'],
    highlights: ['Documento Especial', 'Checagem de Fatos', 'Mesa de Debate']
  }
];

const TEMPLATES_FILMES: ProgramTemplate[] = [
  {
    title: 'Matinê de Ação & Aventura',
    durationMinutes: 120,
    category: 'Filmes & Séries',
    rating: '12',
    description: 'Grandes sucessos do cinema de ação com sequências eletrizantes, perseguições épicas e efeitos visuais impressionantes.',
    tags: ['Cinema', 'Ação', 'Aventura', 'Blockbuster'],
    highlights: ['Áudio 5.1 Surround', 'Resolução 1080p', 'Elenco Estelar']
  },
  {
    title: 'Sessão Comédia & Família',
    durationMinutes: 110,
    category: 'Filmes & Séries',
    rating: '10',
    description: 'Histórias bem-humoradas e leves para garantir risadas e momentos divertidos em família.',
    tags: ['Comédia', 'Família', 'Cinema em Casa'],
    highlights: ['Diversão Garantida', 'Dublado em Português']
  },
  {
    title: 'Cine Suspense & Investigação Policial',
    durationMinutes: 130,
    category: 'Filmes & Séries',
    rating: '14',
    description: 'Um intrigante jogo de gato e rato onde nada é o que parece. Mistérios que prendem a atenção do início ao fim.',
    tags: ['Suspense', 'Mistério', 'Investigação', 'Policial'],
    highlights: ['Final Surpreendente', 'Trilha Sonora Tensa']
  },
  {
    title: 'Superestreia do Horário Nobre',
    durationMinutes: 140,
    category: 'Filmes & Séries',
    rating: '16',
    description: 'O principal filme da semana recém-saído dos cinemas. Uma superprodução aclamada pela crítica e pelo público.',
    tags: ['Superestreia', 'Cinema 4K', 'Sucesso de Bilheteria'],
    highlights: ['Vencedor do Oscar', 'Efeitos Especiais de Ponta']
  },
  {
    title: 'Cine Madrugada - Terror & Ficção Científica',
    durationMinutes: 120,
    category: 'Filmes & Séries',
    rating: '16',
    description: 'Histórias perturbadoras de ficção científica e terror psicológico para quem tem nervos de aço nas altas horas da noite.',
    tags: ['Terror', 'Ficção Científica', 'Suspense Noturno'],
    highlights: ['Susto Garantido', 'Atmosfera Sombria']
  }
];

const TEMPLATES_INFANTIL: ProgramTemplate[] = [
  {
    title: 'Aventuras Animadas da Manhã',
    durationMinutes: 120,
    category: 'Infantis',
    rating: 'Livre',
    description: 'Desenhos animados cheios de cores, músicas e lições educativas para começar o dia com muita diversão e imaginação.',
    tags: ['Desenho Animado', 'Crianças', 'Diversão', 'Educativo'],
    highlights: ['Músicas Infantis', 'Aprender Brincando']
  },
  {
    title: 'Clube dos Desenhos & Heróis',
    durationMinutes: 180,
    category: 'Infantis',
    rating: 'Livre',
    description: 'As aventuras dos maiores super-heróis em animações modernas que estimulam a coragem, trabalho em equipe e a amizade.',
    tags: ['Heróis', 'Aventura', 'Equipe', 'Animação'],
    highlights: ['Episódios Inéditos', 'Batalhas Épicas']
  },
  {
    title: 'Cine Infantil & Sessão Pipoca',
    durationMinutes: 100,
    category: 'Infantis',
    rating: 'Livre',
    description: 'Longas-metragens de animação para reunir a garotada com personagens adoráveis e mundos mágicos.',
    tags: ['Filme de Animação', 'Magia', 'Sessão Pipoca'],
    highlights: ['Personagens Queridos', 'Canções Divertidas']
  }
];

const TEMPLATES_DOCUMENTARIOS: ProgramTemplate[] = [
  {
    title: 'Planeta Selvagem & Vida Animal',
    durationMinutes: 120,
    category: 'Documentários',
    rating: 'Livre',
    description: 'Imagens impressionantes da vida selvagem nos recantos mais remotos do planeta, revelando comportamentos animais fascinantes.',
    tags: ['Natureza', 'Animais', 'Planeta Terra', 'Vida Selvagem'],
    highlights: ['Filmagens em 4K', 'Ecossistemas Exuberantes']
  },
  {
    title: 'Grandes Mistérios da História',
    durationMinutes: 120,
    category: 'Documentários',
    rating: '10',
    description: 'Desvendando civilizações antigas, relíquias perdidas e enigmas da arqueologia com depoimentos de historiadores consagrados.',
    tags: ['História', 'Arqueologia', 'Mistérios', 'Civilizações'],
    highlights: ['Reconstruções 3D', 'Descobertas Recentes']
  },
  {
    title: 'Ciência, Engenharia & O Futuro',
    durationMinutes: 120,
    category: 'Documentários',
    rating: 'Livre',
    description: 'Megaestruturas, exploração espacial e inovações tecnológicas que estão transformando o destino da humanidade.',
    tags: ['Ciência', 'Tecnologia', 'Espaço', 'Engenharia'],
    highlights: ['Exploração Espacial', 'Inovação']
  }
];

function getTemplatesForChannel(channel: Channel): ProgramTemplate[] {
  const cat = (channel.category || '').toLowerCase();
  const name = (channel.name || '').toLowerCase();

  if (cat.includes('esporte') || name.includes('esporte') || name.includes('sport') || name.includes('cazé') || name.includes('premiere')) {
    return TEMPLATES_ESPORTES;
  }
  if (cat.includes('notícia') || name.includes('news') || name.includes('cnn') || name.includes('jovem pan') || name.includes('globonews')) {
    return TEMPLATES_NOTICIAS;
  }
  if (cat.includes('filme') || cat.includes('série') || name.includes('telecine') || name.includes('hbo') || name.includes('cinema') || name.includes('warner')) {
    return TEMPLATES_FILMES;
  }
  if (cat.includes('infantil') || name.includes('cartoon') || name.includes('kids') || name.includes('gloob') || name.includes('disney')) {
    return TEMPLATES_INFANTIL;
  }
  if (cat.includes('documentário') || name.includes('discovery') || name.includes('geographic') || name.includes('history')) {
    return TEMPLATES_DOCUMENTARIOS;
  }
  return TEMPLATES_ABERTOS;
}

function formatHourMinute(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Gera a grade EPG completa de um canal para um dia específico (00:00 às 23:59).
 */
export function generateChannelEpgSchedule(
  channel: Channel,
  targetDate: Date = new Date()
): ChannelEpgSchedule {
  const now = new Date();
  const sampleMap = getSampleXmltvMap();
  
  // Verifica se o canal tem entradas no XMLTV amostral
  let xmltvProgrammes: EpgProgramItem[] | undefined = undefined;
  const channelKeyNorm = channel.name.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [key, list] of sampleMap.entries()) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normKey === channelKeyNorm || normKey.includes(channelKeyNorm) || channelKeyNorm.includes(normKey)) {
      xmltvProgrammes = list;
      break;
    }
  }

  // Define início e fim do dia alvo
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);

  const programs: EpgProgram[] = [];
  const templates = getTemplatesForChannel(channel);

  let currentSlotTime = new Date(dayStart);
  let templateIndex = 0;
  let progCounter = 1;

  while (currentSlotTime.getDate() === dayStart.getDate()) {
    const tpl = templates[templateIndex % templates.length];
    const duration = tpl.durationMinutes;
    const progStart = new Date(currentSlotTime);
    const progEnd = new Date(progStart.getTime() + duration * 60 * 1000);

    // Ajusta título se estiver no ar e o canal tiver epgNow cadastrado
    const isLive = now >= progStart && now < progEnd;
    let title = tpl.title;
    let description = tpl.description;
    let rating = tpl.rating;
    let tags = [...tpl.tags];
    let highlights = [...tpl.highlights];
    let aiEnriched = false;
    let source: 'xmltv' | 'gemini' | 'system' = 'system';

    if (isLive && channel.epgNow) {
      title = channel.epgNow;
    }

    // Se tiver entrada do XMLTV no intervalo
    if (xmltvProgrammes && xmltvProgrammes.length > 0) {
      const match = xmltvProgrammes.find(p => {
        const pStart = p.start;
        return pStart.getHours() === progStart.getHours();
      });
      if (match) {
        title = match.title;
        if (match.desc) description = match.desc;
        if (match.category) tags.push(match.category);
        source = 'xmltv';
      }
    }

    // Verifica se existe enriquecimento prévio no banco SQLite
    try {
      const cachedAi = sqliteGetEpgAiDescription(title, channel.name);
      if (cachedAi) {
        description = cachedAi.description;
        if (cachedAi.tags && cachedAi.tags.length > 0) tags = cachedAi.tags;
        if (cachedAi.highlights && cachedAi.highlights.length > 0) highlights = cachedAi.highlights;
        if (cachedAi.rating) rating = cachedAi.rating;
        aiEnriched = true;
        source = 'gemini';
      }
    } catch {
      // ignore
    }

    // Cálculo de progresso percentual se for ao vivo
    let progressPercent = 0;
    if (isLive) {
      const totalMs = progEnd.getTime() - progStart.getTime();
      const elapsedMs = now.getTime() - progStart.getTime();
      progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
    } else if (now >= progEnd) {
      progressPercent = 100;
    }

    const progId = `epg-${channel.id}-${dayStart.toISOString().slice(0, 10)}-${progCounter}`;

    programs.push({
      id: progId,
      channelId: channel.id,
      channelName: channel.name,
      title,
      description,
      category: tpl.category,
      start: progStart.toISOString(),
      end: progEnd.toISOString(),
      startFormatted: formatHourMinute(progStart),
      endFormatted: formatHourMinute(progEnd),
      durationMinutes: duration,
      rating,
      isLiveNow: isLive,
      progressPercent,
      aiEnriched,
      aiTags: tags,
      aiHighlights: highlights,
      source
    });

    currentSlotTime = progEnd;
    templateIndex++;
    progCounter++;
  }

  // Identifica programa atual e próximo
  const currentProgram = programs.find(p => p.isLiveNow) || programs[0];
  const currentIndex = programs.findIndex(p => p.id === currentProgram?.id);
  const nextProgram = currentIndex >= 0 && currentIndex < programs.length - 1 
    ? programs[currentIndex + 1] 
    : undefined;

  return {
    channel,
    programs,
    currentProgram,
    nextProgram
  };
}

/**
 * Enriquecimento inteligente com Gemini API (ou fallback contextual caso a API key não esteja disponível).
 */
export async function enrichProgramWithGemini(params: {
  programTitle: string;
  channelName?: string;
  category?: string;
  currentDescription?: string;
}): Promise<EpgEnrichResponse> {
  const { programTitle, channelName, category, currentDescription } = params;

  // 1. Verifica cache local no SQLite
  try {
    const cached = sqliteGetEpgAiDescription(programTitle, channelName);
    if (cached) {
      return {
        success: true,
        description: cached.description,
        rating: cached.rating,
        tags: cached.tags,
        highlights: cached.highlights,
        source: 'gemini',
        cached: true
      };
    }
  } catch (err) {
    console.warn('[EPG AI] Falha ao consultar cache SQLite:', err);
  }

  // 2. Tenta invocar a API oficial do Google Gemini
  const ai = getGeminiClient();
  if (ai) {
    try {
      console.log(`[EPG GEMINI] Gerando sinopse e metadados para "${programTitle}" (${channelName || 'TV'})...`);
      const prompt = `Você é o assistente inteligente oficial de Guia Eletrônico de Programação (EPG) de TV no Brasil.
Gere uma sinopse empolgante, rica e precisa em português brasileiro para o seguinte programa de televisão:

- Programa: "${programTitle}"
- Canal: "${channelName || 'Canal de TV Aberta / Fechada'}"
- Categoria / Gênero: "${category || 'Entretenimento'}"
- Descrição preliminar de referência: "${currentDescription || 'Sem descrição'}"

Diretrizes obrigatórias:
1. Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "description": "Sinopse cativante e fluida de 3 a 5 frases explicando o enredo, tema da edição, convidados ou os momentos mais eletrizantes do programa.",
  "rating": "Classificação indicativa etária oficial brasileira: 'Livre', '10', '12', '14', '16' ou '18'",
  "tags": ["PalavraChave1", "PalavraChave2", "PalavraChave3", "PalavraChave4"],
  "highlights": ["Destaque imperdível 1", "Destaque imperdível 2", "Destaque imperdível 3"]
}
2. Não inclua blocos markdown extras de texto fora do JSON.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const responseText = response.text || '';
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      const enrichedData = {
        id: channelName 
          ? `${channelName.toLowerCase().trim()}::${programTitle.toLowerCase().trim()}`
          : programTitle.toLowerCase().trim(),
        programTitle,
        channelName: channelName || '',
        category: category || '',
        description: parsed.description || currentDescription || 'Acompanhe a transmissão completa em alta definição com sinal digital de baixa latência.',
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['Ao Vivo', 'HD', category || 'TV'],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : ['Transmissão Digital', 'Som Imersivo'],
        rating: parsed.rating || 'Livre',
        createdAt: new Date().toISOString()
      };

      // Persiste no SQLite
      try {
        sqliteSaveEpgAiDescription(enrichedData);
      } catch (saveErr) {
        console.warn('[EPG GEMINI] Erro ao salvar sinopse IA no SQLite:', saveErr);
      }

      return {
        success: true,
        description: enrichedData.description,
        rating: enrichedData.rating,
        tags: enrichedData.tags,
        highlights: enrichedData.highlights,
        source: 'gemini',
        cached: false
      };
    } catch (geminiError: any) {
      console.warn('[EPG GEMINI] Erro na requisição Gemini, ativando fallback inteligente:', geminiError.message);
    }
  }

  // 3. Fallback inteligente de alta qualidade caso Gemini não esteja configurado ou ocorra timeout
  const catLower = (category || '').toLowerCase();
  const progLower = programTitle.toLowerCase();

  let fallbackDescription = `Acompanhe "${programTitle}" com transmissão oficial em alta definição, sinal digital estabilizado e som estéreo imersivo para toda a família.`;
  let fallbackRating = 'Livre';
  const fallbackTags = ['TV Ao Vivo', 'HD 1080p', category || 'Entretenimento'];
  const fallbackHighlights = ['Sinal Digital Sem Atrasos', 'Cobertura Especial'];

  if (catLower.includes('esporte') || progLower.includes('futebol') || progLower.includes('jogo') || progLower.includes('rodada')) {
    fallbackDescription = `Cobertura completa e ao vivo de "${programTitle}". Acompanhe os lances decisivos, escalações táticas, análises detalhadas dos comentaristas e entrevistas com os protagonistas em tempo real.`;
    fallbackRating = 'Livre';
    fallbackTags.push('Futebol', 'Gols', 'Ao Vivo');
    fallbackHighlights.push('Melhores Momentos', 'Estatísticas Sofascore');
  } else if (catLower.includes('notícia') || progLower.includes('jornal') || progLower.includes('edição')) {
    fallbackDescription = `As principais manchetes do Brasil e do mundo em "${programTitle}". Reportagens investigativas, prestação de serviços essenciais, apuração rigorosa de fatos políticos e análise econômica de especialistas.`;
    fallbackRating = 'Livre';
    fallbackTags.push('Jornalismo', 'Plantão', 'Notícias');
    fallbackHighlights.push('Checagem em Tempo Real', 'Links ao Vivo');
  } else if (catLower.includes('filme') || catLower.includes('série') || progLower.includes('cinema')) {
    fallbackDescription = `Uma superprodução aclamada em "${programTitle}". Trama envolvente com atuações de destaque, reviravoltas no roteiro e direção impecável para uma experiência cinematográfica completa.`;
    fallbackRating = '12';
    fallbackTags.push('Cinema', 'Suspense', 'Drama');
    fallbackHighlights.push('Áudio 5.1 Surround', 'Produção Premiada');
  } else if (catLower.includes('infantil') || progLower.includes('desenho')) {
    fallbackDescription = `Aventuras divertidas e educativas em "${programTitle}". Animação colorida que estimula a imaginação, amizade e o aprendizado das crianças com canções alegres e personagens carismáticos.`;
    fallbackRating = 'Livre';
    fallbackTags.push('Crianças', 'Animação', 'Família');
    fallbackHighlights.push('Conteúdo Seguro', 'Músicas Divertidas');
  }

  const fallbackDoc = {
    id: channelName 
      ? `${channelName.toLowerCase().trim()}::${programTitle.toLowerCase().trim()}`
      : programTitle.toLowerCase().trim(),
    programTitle,
    channelName: channelName || '',
    category: category || '',
    description: fallbackDescription,
    tags: fallbackTags,
    highlights: fallbackHighlights,
    rating: fallbackRating,
    createdAt: new Date().toISOString()
  };

  try {
    sqliteSaveEpgAiDescription(fallbackDoc);
  } catch {}

  return {
    success: true,
    description: fallbackDoc.description,
    rating: fallbackDoc.rating,
    tags: fallbackDoc.tags,
    highlights: fallbackDoc.highlights,
    source: 'smart_fallback',
    cached: false
  };
}
