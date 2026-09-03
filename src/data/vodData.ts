import { VodItem } from '../types';

export const INITIAL_VOD: VodItem[] = [
  {
    id: 'vod-1',
    title: 'Ainda Estou Aqui',
    type: 'movie',
    year: 2024,
    duration: '2h 15m',
    rating: '14+',
    genre: ['Drama', 'Biografia', 'História'],
    bannerUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
    synopsis: 'Rio de Janeiro, início dos anos 70. O Brasil enfrenta o aperto da ditadura militar. A família Paiva vive à beira da praia, até que um ato de violência muda suas vidas para sempre.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    featured: true,
    isVipOnly: false
  },
  {
    id: 'vod-2',
    title: 'Cidade de Deus: A Luta Não Para',
    type: 'series',
    year: 2024,
    duration: '6 episódios',
    rating: '18+',
    genre: ['Ação', 'Crime', 'Drama'],
    bannerUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&w=600&q=80',
    synopsis: 'Vinte anos após os eventos do clássico filme, Buscapé continua sua trajetória como fotojornalista retratando os conflitos entre policiais, traficantes e milícias na comunidade.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    featured: true,
    isVipOnly: true,
    seasons: [
      {
        seasonNumber: 1,
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episódio 1: Retorno às Raízes',
            duration: '52m',
            streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
          },
          {
            episodeNumber: 2,
            title: 'Episódio 2: Linhas Cruzadas',
            duration: '48m',
            streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
          }
        ]
      }
    ]
  },
  {
    id: 'vod-3',
    title: 'Duna: Parte 2',
    type: 'movie',
    year: 2024,
    duration: '2h 46m',
    rating: '14+',
    genre: ['Ficção Científica', 'Aventura'],
    bannerUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=600&q=80',
    synopsis: 'Paul Atreides se une a Chani e aos Fremen enquanto busca vingança contra os conspiradores que destruíram sua família, enfrentando uma escolha entre o amor de sua vida e o destino do universo.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    featured: true,
    isVipOnly: true
  },
  {
    id: 'vod-4',
    title: 'O Auto da Compadecida 2',
    type: 'movie',
    year: 2024,
    duration: '1h 55m',
    rating: '12+',
    genre: ['Comédia', 'Aventura', 'Nacional'],
    bannerUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&w=600&q=80',
    synopsis: 'Vinte anos após sua primeira aventura, Chicó e João Grilo se reencontram na lendária cidade de Taperoá para viver novas trapaças no sertão da Paraíba.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    featured: false,
    isVipOnly: false
  },
  {
    id: 'vod-5',
    title: 'Gladiador II',
    type: 'movie',
    year: 2024,
    duration: '2h 28m',
    rating: '16+',
    genre: ['Ação', 'Drama', 'Histórico'],
    bannerUrl: 'https://images.unsplash.com/photo-1533928298208-27ff66555d8d?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80',
    synopsis: 'Anos após testemunhar a morte de Maximus pelas mãos de seu tio, Lucius é forçado a entrar no Coliseu depois de sua casa ser conquistada por imperadores tirânicos.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    featured: false,
    isVipOnly: true
  },
  {
    id: 'vod-6',
    title: 'The Last of Us',
    type: 'series',
    year: 2023,
    duration: '9 episódios',
    rating: '16+',
    genre: ['Ficção Científica', 'Drama', 'Suspense'],
    bannerUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1514306191717-452ec28c7814?auto=format&fit=crop&w=600&q=80',
    synopsis: 'Joel, um sobrevivente experiente, é contratado para contrabandear Ellie, uma jovem de 14 anos, para fora de uma zona de quarentena opressiva em um mundo pós-apocalíptico.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4',
    featured: false,
    isVipOnly: true,
    seasons: [
      {
        seasonNumber: 1,
        episodes: [
          {
            episodeNumber: 1,
            title: 'Quando Estiver Perdido na Escuridão',
            duration: '1h 21m',
            streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4'
          }
        ]
      }
    ]
  },
  {
    id: 'vod-7',
    title: 'Senna: A Lenda das Pistas',
    type: 'series',
    year: 2024,
    duration: '6 episódios',
    rating: '12+',
    genre: ['Biografia', 'Esporte', 'Drama'],
    bannerUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80',
    synopsis: 'A trajetória de vitórias, superação, decepções e alegrias de Ayrton Senna, desvendando sua personalidade e suas relações pessoais até o trágico acidente em Ímola.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    featured: false,
    isVipOnly: false
  },
  {
    id: 'vod-8',
    title: 'Deadpool & Wolverine',
    type: 'movie',
    year: 2024,
    duration: '2h 08m',
    rating: '18+',
    genre: ['Ação', 'Comédia', 'Ficção Científica'],
    bannerUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1920&q=80',
    posterUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
    synopsis: 'A autoridade de variação temporal (TVA) convoca Wade Wilson para uma missão que pode salvar o multiverso, obrigando-o a tirar um relutante Wolverine de sua aposentadoria.',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    featured: false,
    isVipOnly: true
  }
];
