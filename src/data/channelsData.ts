import { Channel } from '../types';

export const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'globo-sp',
    name: 'TV Globo SP',
    category: 'Abertos',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/TV_Globo_2021.svg/320px-TV_Globo_2021.svg.png',
    sources: [
      {
        name: 'Servidor 1 (Ao Vivo)',
        url: 'https://dfr80qz435crc.cloudfront.net/EFGH/Amagi/Globo/GE_Fast_BR/GE_Fast.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Backup Nacional)',
        url: 'https://jmp2.uk/plu-6102e04e9ab1db0007a980a1.m3u8',
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
        name: 'Servidor 1 (SBT Ao Vivo)',
        url: 'https://cdn.jmvstream.com/w/LVW-10801/LVW10801_Xvg4R0u57n/playlist.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Backup)',
        url: 'http://45.162.64.114/TV_CULTURA/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (SBT / Band Ao Vivo)',
        url: 'https://cdn.jmvstream.com/w/LVW-10801/LVW10801_Xvg4R0u57n/playlist.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Notícias Ao Vivo)',
        url: 'https://jmp2.uk/plu-6102e04e9ab1db0007a980a1.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (Record News Ao Vivo)',
        url: 'https://jmp2.uk/plu-6102e04e9ab1db0007a980a1.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Cultura Ao Vivo)',
        url: 'http://45.162.64.114/TV_CULTURA/index.m3u8',
        quality: '720p'
      }
    ],
    isActive: true,
    epgNow: 'Jornal da Record',
    epgNext: 'Câmera Record'
  },
  {
    id: 'tv-cultura',
    name: 'TV Cultura',
    category: 'Abertos',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/TV_Cultura_logo_2021.svg/320px-TV_Cultura_logo_2021.svg.png',
    sources: [
      {
        name: 'Servidor 1 (Cultura HD)',
        url: 'http://45.162.64.114/TV_CULTURA/index.m3u8',
        quality: '1080p'
      }
    ],
    isActive: true,
    epgNow: 'Jornal da Cultura',
    epgNext: 'Roda Viva'
  },
  {
    id: 'cazetv',
    name: 'CazéTV',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/cazetv.png',
    sources: [
      {
        name: 'Servidor 1 (GE Esportes Ao Vivo)',
        url: 'https://dfr80qz435crc.cloudfront.net/EFGH/Amagi/Globo/GE_Fast_BR/GE_Fast.m3u8',
        quality: '1080p 60fps'
      },
      {
        name: 'Servidor 2 (ESPN 4 Esportes)',
        url: 'http://181.78.197.59:8000/play/a07n/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (SporTV 3 HD)',
        url: 'http://170.83.49.66:8083/SPORTV3HD/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (GE Ao Vivo)',
        url: 'https://dfr80qz435crc.cloudfront.net/EFGH/Amagi/Globo/GE_Fast_BR/GE_Fast.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (ESPN 4 HD)',
        url: 'http://181.78.197.59:8000/play/a07n/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (SporTV 3)',
        url: 'http://170.83.49.66:8083/SPORTV3HD/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (GE Esportes)',
        url: 'https://dfr80qz435crc.cloudfront.net/EFGH/Amagi/Globo/GE_Fast_BR/GE_Fast.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (SporTV 3)',
        url: 'http://170.83.49.66:8083/SPORTV3HD/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (ESPN 4 Esportes)',
        url: 'http://181.78.197.59:8000/play/a07n/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (GE Esportes)',
        url: 'https://dfr80qz435crc.cloudfront.net/EFGH/Amagi/Globo/GE_Fast_BR/GE_Fast.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (CNN Brasil HD)',
        url: 'https://amg01391-sbtinfast-amg01391c4-lg-br-4597.playouts.now.amagi.tv/playlist/amg01391-addigital-cnnbrasil-lgbr/playlist.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (CNN Money)',
        url: 'https://amg01391-amg01391c57-amgplt0026.playout.now3.amagi.tv/playlist/amg01391-amg01391c57-amgplt0026/playlist.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (JP News HD)',
        url: 'https://amg01391-sbtinfast-amg01391c3-lg-us-8995.playouts.now.amagi.tv/playlist/amg01391-addigital-jovempan-lgus/playlist.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Record News)',
        url: 'https://jmp2.uk/plu-6102e04e9ab1db0007a980a1.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (CNN Brasil News)',
        url: 'https://amg01391-sbtinfast-amg01391c4-lg-br-4597.playouts.now.amagi.tv/playlist/amg01391-addigital-cnnbrasil-lgbr/playlist.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (JP News)',
        url: 'https://amg01391-sbtinfast-amg01391c3-lg-us-8995.playouts.now.amagi.tv/playlist/amg01391-addigital-jovempan-lgus/playlist.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (AMC Filmes HD)',
        url: 'http://170.83.49.66:8083/AMCHD/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (AXN Séries)',
        url: 'http://170.83.16.50/AXN/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (AXN Séries HD)',
        url: 'http://170.83.16.50/AXN/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (AMC Filmes)',
        url: 'http://170.83.49.66:8083/AMCHD/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (Box Kids HD)',
        url: 'http://170.83.49.66:8083/BOXKIDSHD/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Adult Swim Animado)',
        url: 'http://168.197.104.22/ADULT_SWIM/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (Arte 1 Música & Cultura)',
        url: 'http://45.162.64.114/ARTE1/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (A&E HD)',
        url: 'http://170.83.16.50/AeE/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (A&E Documentários HD)',
        url: 'http://170.83.16.50/AeE/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Amazon Sat)',
        url: 'https://amazonsat.brasilstream.com.br/hls/amazonsat/index.m3u8',
        quality: '720p'
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
        name: 'Servidor 1 (Amazon Sat Natureza)',
        url: 'https://amazonsat.brasilstream.com.br/hls/amazonsat/index.m3u8',
        quality: '1080p'
      },
      {
        name: 'Servidor 2 (Cultura HD)',
        url: 'http://45.162.64.114/TV_CULTURA/index.m3u8',
        quality: '720p'
      }
    ],
    isActive: true,
    epgNow: 'Predadores das Savanas',
    epgNext: 'Resgate Selvagem'
  }
];
