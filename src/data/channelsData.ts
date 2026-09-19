import { Channel } from '../types';

export const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'globo-sp',
    name: 'TV Globo SP',
    category: 'Abertos',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/TV_Globo_2021.svg/320px-TV_Globo_2021.svg.png',
    sources: [
      {
        name: 'TV Morena (Rede Globo HD Ao Vivo)',
        url: 'https://media2.cdntvms.com.br/tv_morena_dorados/index.m3u8',
        quality: '720p',
        isWorking: true
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
        name: 'SBT Interior HD (Ao Vivo)',
        url: 'https://cdn.jmvstream.com/w/LVW-10801/LVW10801_Xvg4R0u57n/playlist.m3u8',
        quality: '1080p',
        isWorking: true
      },
      {
        name: 'SBT News HD (Google DAI)',
        url: 'https://dai.google.com/linear/hls/event/1XSOdtQ0SH2G8OEmEfGgjQ/master.m3u8',
        quality: '720p',
        isWorking: true
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
        name: 'Band News HD (Grupo Bandeirantes)',
        url: 'http://45.162.64.114/BAND_NEWS/index.m3u8',
        quality: '1080p',
        isWorking: true
      },
      {
        name: 'Band Sports HD (Grupo Bandeirantes)',
        url: 'http://45.162.64.114/BAND_SPORTS/index.m3u8',
        quality: '1080p',
        isWorking: true
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
        name: 'Record News HD (Ao Vivo)',
        url: 'http://45.162.64.114/RECORD_NEWS/index.m3u8',
        quality: '1080p',
        isWorking: true
      },
      {
        name: 'Record News Pluto TV',
        url: 'https://jmp2.uk/plu-6102e04e9ab1db0007a980a1.m3u8',
        quality: '720p',
        isWorking: true
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
        name: 'TV Cultura HD',
        url: 'http://45.162.64.114/TV_CULTURA/index.m3u8',
        quality: '1080p',
        isWorking: true
      },
      {
        name: 'Cultura Fast Ao Vivo',
        url: 'https://fpa-gateway.tvcultura.com.br:8181/memfs/606caef0-a290-413d-9f1f-8fcdb3a73831.m3u8',
        quality: '720p',
        isWorking: true
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
        name: 'CazéTV Oficial',
        url: 'https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8',
        quality: '1080p 60fps',
        isWorking: true
      }
    ],
    isActive: true,
    isVipOnly: false,
    epgNow: 'Ao Vivo com Casimiro',
    epgNext: 'Debate Bola & Resenha'
  },
  {
    id: 'ge-tv',
    name: 'GE TV',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/sportv.png',
    sources: [
      {
        name: 'GE Fast (Globo Esporte Ao Vivo)',
        url: 'https://dfr80qz435crc.cloudfront.net/EFGH/Amagi/Globo/GE_Fast_BR/GE_Fast.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    isVipOnly: false,
    epgNow: 'Globo Esporte Ao Vivo',
    epgNext: 'Compacto dos Gols'
  },
  {
    id: 'sportv-3',
    name: 'SporTV 3',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/sportv3.png',
    sources: [
      {
        name: 'SporTV 3 HD',
        url: 'http://170.83.49.66:8083/SPORTV3HD/index.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Superliga de Vôlei',
    epgNext: 'Sportv News'
  },
  {
    id: 'espn-4',
    name: 'ESPN 4',
    category: 'Esportes',
    logo: 'https://cdn.reidoscanais.st/imagens/espn4.png',
    sources: [
      {
        name: 'ESPN 4 HD',
        url: 'http://45.162.64.114/ESPN_4/index.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'Premier League',
    epgNext: 'SportsCenter'
  },
  {
    id: 'cnn-brasil',
    name: 'CNN Brasil',
    category: 'Notícias',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/CNN_Brasil_logo.svg/320px-CNN_Brasil_logo.svg.png',
    sources: [
      {
        name: 'CNN Brasil HD',
        url: 'https://amg01391-sbtinfast-amg01391c4-lg-br-4597.playouts.now.amagi.tv/playlist/amg01391-addigital-cnnbrasil-lgbr/playlist.m3u8',
        quality: '1080p',
        isWorking: true
      },
      {
        name: 'CNN Brasil Money',
        url: 'https://amg01391-amg01391c57-amgplt0026.playout.now3.amagi.tv/playlist/amg01391-amg01391c57-amgplt0026/playlist.m3u8',
        quality: '720p',
        isWorking: true
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
        name: 'JP News HD',
        url: 'https://amg01391-sbtinfast-amg01391c3-lg-us-8995.playouts.now.amagi.tv/playlist/amg01391-addigital-jovempan-lgus/playlist.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    epgNow: 'Os Pingos nos Is',
    epgNext: 'Jornal Jovem Pan'
  },
  {
    id: 'amc',
    name: 'AMC HD',
    category: 'Filmes & Séries',
    logo: 'https://cdn.reidoscanais.st/imagens/amc.png',
    sources: [
      {
        name: 'AMC HD',
        url: 'http://45.177.114.114/AMC/index.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'The Walking Dead',
    epgNext: 'Breaking Bad'
  },
  {
    id: 'axn',
    name: 'AXN HD',
    category: 'Filmes & Séries',
    logo: 'https://cdn.reidoscanais.st/imagens/axn.png',
    sources: [
      {
        name: 'AXN HD',
        url: 'http://170.83.16.50/AXN/index.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    isVipOnly: true,
    epgNow: 'NCIS: Investigação Criminal',
    epgNext: 'CSI: Las Vegas'
  },
  {
    id: 'cartoon-network',
    name: 'Cartoon Network',
    category: 'Infantis',
    logo: 'https://cdn.reidoscanais.st/imagens/cartoonnetwork.png',
    sources: [
      {
        name: 'Cartoon Network HD',
        url: 'http://45.162.64.114/CARTOON_NETWORK/index.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    epgNow: 'O Incrível Mundo de Gumball',
    epgNext: 'Hora de Aventura: Fionna & Cake'
  },
  {
    id: 'discovery-kids',
    name: 'Discovery Kids',
    category: 'Infantis',
    logo: 'https://cdn.reidoscanais.st/imagens/discoverykids.png',
    sources: [
      {
        name: 'Discovery Kids HD',
        url: 'http://45.177.114.114/DISCOVERY_KIDS/index.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    epgNow: 'Peppa Pig',
    epgNext: 'Show da Luna'
  },
  {
    id: 'history',
    name: 'History Channel',
    category: 'Documentários',
    logo: 'https://cdn.reidoscanais.st/imagens/history.png',
    sources: [
      {
        name: 'History Channel HD',
        url: 'http://45.177.114.114/HISTORY/index.m3u8',
        quality: '1080p',
        isWorking: true
      },
      {
        name: 'History 2 HD',
        url: 'http://45.177.114.114/HISTORY_2/index.m3u8',
        quality: '1080p',
        isWorking: true
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
        name: 'Animal Planet HD',
        url: 'http://45.162.64.114/ANIMAL_PLANET/index.m3u8',
        quality: '1080p',
        isWorking: true
      },
      {
        name: 'Animal Planet (Servidor 2)',
        url: 'http://45.177.114.114/ANIMAL_PLANET/index.m3u8',
        quality: '1080p',
        isWorking: true
      }
    ],
    isActive: true,
    epgNow: 'Predadores das Savanas',
    epgNext: 'Resgate Selvagem'
  }
];
