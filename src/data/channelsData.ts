import { Channel } from '../types';

export const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'globo-sp',
    name: 'TV Globo SP',
    category: 'Abertos',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/TV_Globo_2021.svg/320px-TV_Globo_2021.svg.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/GLOBO_SP_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      },
      {
        url: 'https://f2472e35a09a.us-east-1.playback.live-video.net/api/video/v1/us-east-1.747125345706.channel.329749502123.m3u8',
        quality: '720p'
      }
    ],
    isActive: true,
    epgNow: 'Jornal Nacional',
    epgNext: 'Novela das Nove: Vale Tudo'
  },
  {
    id: 'sbt',
    name: 'SBT HD',
    category: 'Abertos',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Sistema_Brasileiro_de_Televis%C3%A3o_logo_2014.svg/320px-Sistema_Brasileiro_de_Televis%C3%A3o_logo_2014.svg.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/SBT_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'Programa Silvio Santos',
    epgNext: 'The Noite com Danilo Gentili'
  },
  {
    id: 'band',
    name: 'Band HD',
    category: 'Abertos',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Logo_da_Rede_Bandeirantes.svg/320px-Logo_da_Rede_Bandeirantes.svg.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/BAND_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'Jornal da Band',
    epgNext: 'MasterChef Brasil'
  },
  {
    id: 'record',
    name: 'Record TV',
    category: 'Abertos',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/RecordTV_2023.png/320px-RecordTV_2023.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/RECORD_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'Jornal da Record',
    epgNext: 'Câmera Record'
  },
  {
    id: 'cazetv',
    name: 'CazéTV',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/cazetv.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/CAZETV_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p 60fps'
      }
    ],
    isActive: true,
    isVipOnly: false,
    epgNow: 'Campeonato Brasileiro Série A: Ao Vivo',
    epgNext: 'Debate Bola & Resenha'
  },
  {
    id: 'sportv',
    name: 'SporTV HD',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/sportv.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/SPORTV_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Troca de Passes',
    epgNext: 'Tá na Área'
  },
  {
    id: 'sportv-2',
    name: 'SporTV 2',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/sportv2.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/SPORTV2_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Vôlei Superliga Feminina',
    epgNext: 'Basquete NBB'
  },
  {
    id: 'premiere-clubes',
    name: 'Premiere Clubes',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/premiere.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/PREMIERE_CLUBES_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Pré-Jogo Brasileirão',
    epgNext: 'Flamengo x Palmeiras Ao Vivo'
  },
  {
    id: 'premiere-2',
    name: 'Premiere 2 HD',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/premiere2.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/PREMIERE2_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Copa do Brasil: Rodada Decisiva',
    epgNext: 'Pós-Jogo e Entrevistas'
  },
  {
    id: 'cnn-brasil',
    name: 'CNN Brasil',
    category: 'Notícias',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/CNN_Brasil_logo.svg/320px-CNN_Brasil_logo.svg.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/CNN_BRASIL_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'CNN Arena 360',
    epgNext: 'CNN Prime Time'
  },
  {
    id: 'jovem-pan-news',
    name: 'Jovem Pan News',
    category: 'Notícias',
    logo: 'https://cdn.reidoscanais.st/imagens/jovempannews.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/JP_NEWS_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'Os Pingos nos Is',
    epgNext: 'Jornal Jovem Pan'
  },
  {
    id: 'globonews',
    name: 'GloboNews HD',
    category: 'Notícias',
    logo: 'https://cdn.reidoscanais.st/imagens/globonews.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/GLOBONEWS_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Edição das 18h',
    epgNext: 'Em Pauta com Eliane Cantanhêde'
  },
  {
    id: 'megapix',
    name: 'Megapix HD',
    category: 'Filmes & Séries',
    logo: 'https://cdn.reidoscanais.st/imagens/megapix.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/MEGAPIX_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Velozes e Furiosos 9',
    epgNext: 'John Wick: Capítulo 4'
  },
  {
    id: 'sony-channel',
    name: 'Sony Channel',
    category: 'Filmes & Séries',
    logo: 'https://cdn.reidoscanais.st/imagens/sonychannel.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/SONY_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Grey\'s Anatomy: 20ª Temporada',
    epgNext: 'The Good Doctor'
  },
  {
    id: 'cartoon-network',
    name: 'Cartoon Network',
    category: 'Infantis',
    logo: 'https://cdn.reidoscanais.st/imagens/cartoonnetwork.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/CARTOON_NETWORK_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'O Incrível Mundo de Gumball',
    epgNext: 'Hora de Aventura: Fionna & Cake'
  },
  {
    id: 'multishow',
    name: 'Multishow HD',
    category: 'Variedades & Música',
    logo: 'https://cdn.reidoscanais.st/imagens/multishow.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/MULTISHOW_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Vai Que Cola',
    epgNext: 'Festival de Música Ao Vivo'
  },
  {
    id: 'history',
    name: 'History Channel',
    category: 'Documentários',
    logo: 'https://cdn.reidoscanais.st/imagens/history.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/HISTORY_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Trato Feito: Las Vegas',
    epgNext: 'Alienígenas do Passado'
  },
  {
    id: 'animal-planet',
    name: 'Animal Planet',
    category: 'Documentários',
    logo: 'https://cdn.reidoscanais.st/imagens/animalplanet.png',
    sources: [
      {
        url: 'https://cdn-sp2.satlabscloud.com.br/ANIMAL_PLANET_HD/index.m3u8?token=ulDZjn1kAAan1kzoXmUL1B84gijOI6v7',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'Predadores das Savanas',
    epgNext: 'Resgate Selvagem'
  }
];
