import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Tv, Film, PlayCircle, Shield, Crown, Search, Sparkles, User as UserIcon, LogOut, KeyRound, Heart, X, Play, ChevronRight, Calendar, ListPlus } from 'lucide-react';
import { Subscriber, User, NavigationTab, Channel, VodItem } from '../types';

interface HeaderProps {
  currentTab: NavigationTab;
  setCurrentTab: (tab: NavigationTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentSubscriber: Subscriber | null;
  currentUser: User | null;
  onOpenCheckout: () => void;
  onOpenAuth: () => void;
  onOpenImportChannels?: () => void;
  onLogout: () => void;
  totalChannelsCount: number;
  favoritesCount?: number;
  channels?: Channel[];
  vodItems?: VodItem[];
  onPlayChannel?: (channel: Channel) => void;
  onPlayVod?: (vod: VodItem) => void;
  isTvBoxMode?: boolean;
  onToggleTvBoxMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  searchQuery,
  setSearchQuery,
  currentSubscriber,
  currentUser,
  onOpenCheckout,
  onOpenAuth,
  onOpenImportChannels,
  onLogout,
  totalChannelsCount,
  favoritesCount = 0,
  channels = [],
  vodItems = [],
  onPlayChannel,
  onPlayVod,
  isTvBoxMode = false,
  onToggleTvBoxMode
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isVip = currentSubscriber?.status === 'active' || currentUser?.vipStatus === 'active';

  // Listen for custom search events from suggestions
  useEffect(() => {
    const handleSetSearch = (e: any) => {
      if (e.detail) {
        setSearchQuery(e.detail);
        setShowSearchDropdown(true);
      }
    };
    window.addEventListener('maxtv_set_search', handleSetSearch);
    return () => window.removeEventListener('maxtv_set_search', handleSetSearch);
  }, [setSearchQuery]);

  // Click outside to close search flyout
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global search filtering logic (simultaneous across Channels, Movies, and Series)
  const searchResults = useMemo(() => {
    const query = searchQuery
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (!query) {
      return { channels: [], movies: [], series: [], totalCount: 0 };
    }

    const filteredChannels = channels.filter(ch => {
      if (ch.isActive === false) return false;
      const name = ch.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cat = ch.category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const epg = (ch.epgNow || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(query) || cat.includes(query) || epg.includes(query);
    });

    const filteredMovies = vodItems.filter(v => {
      if (v.type !== 'movie') return false;
      const title = v.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const genres = v.genre.map(g => g.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const synopsis = (v.synopsis || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return title.includes(query) || genres.some(g => g.includes(query)) || synopsis.includes(query) || v.year.toString().includes(query);
    });

    const filteredSeries = vodItems.filter(v => {
      if (v.type !== 'series') return false;
      const title = v.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const genres = v.genre.map(g => g.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const synopsis = (v.synopsis || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return title.includes(query) || genres.some(g => g.includes(query)) || synopsis.includes(query) || v.year.toString().includes(query);
    });

    return {
      channels: filteredChannels,
      movies: filteredMovies,
      series: filteredSeries,
      totalCount: filteredChannels.length + filteredMovies.length + filteredSeries.length
    };
  }, [searchQuery, channels, vodItems]);

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/80 backdrop-blur-md border-b border-white/5 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer select-none group"
          onClick={() => setCurrentTab('live')}
        >
          <div className="relative flex items-center justify-center w-9 h-9 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-600/25 group-hover:scale-105 transition-transform font-bold text-white text-base">
            M
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl tracking-tight text-white group-hover:text-indigo-400 transition-colors">
                MAX<span className="text-indigo-400">TV</span>
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                Brasil
              </span>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {totalChannelsCount > 0 ? `${totalChannelsCount} Canais ao Vivo & VOD` : 'TV ao Vivo & VOD'}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/50 p-1.5 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setCurrentTab('live')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'live'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>Ao Vivo</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('epg')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'epg'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>Guia EPG</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('movies')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'movies'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Filmes</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('series')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'series'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            <span>Séries</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('favorites')}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'favorites'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Heart className={`w-4 h-4 ${currentTab === 'favorites' ? 'fill-red-500 text-red-500' : 'text-slate-400'}`} />
            <span>Favoritos</span>
            {favoritesCount > 0 && (
              <span className="ml-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-red-600 text-white shadow-sm">
                {favoritesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('plans')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              currentTab === 'plans'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-indigo-400 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>Planos VIP</span>
          </button>

          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setCurrentTab('admin')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-500'
                  : 'text-slate-400 hover:text-indigo-400 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Painel Admin</span>
            </button>
          )}
        </nav>

        {/* Right side: Search, VIP status, User Profile, Checkout Trigger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Global Search Bar (Desktop) */}
          <div ref={searchContainerRef} className="relative hidden md:block">
            <div className="relative flex items-center bg-slate-900/90 border border-white/10 focus-within:border-indigo-500 rounded-full px-3.5 py-1.5 w-60 lg:w-72 xl:w-80 transition-all shadow-inner">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar canais, filmes, séries..."
                value={searchQuery}
                onFocus={() => {
                  if (searchQuery.trim().length > 0) setShowSearchDropdown(true);
                }}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(e.target.value.trim().length > 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearchDropdown(false);
                  } else if (e.key === 'Enter') {
                    setShowSearchDropdown(false);
                  }
                }}
                className="bg-transparent border-none text-xs sm:text-sm ml-2 focus:ring-0 focus:outline-none w-full text-white placeholder-slate-500"
              />

              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setShowSearchDropdown(false);
                    inputRef.current?.focus();
                  }}
                  className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="hidden xl:inline-block text-[10px] text-slate-500 font-mono px-1.5 py-0.5 rounded border border-white/5 bg-slate-800/40 shrink-0">
                  Global
                </span>
              )}
            </div>

            {/* Instant Autocomplete Flyout Dropdown */}
            {showSearchDropdown && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-2 w-[340px] lg:w-[420px] bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Dropdown Header */}
                <div className="px-4 py-2.5 bg-slate-950/60 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Resultados Globais</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                      {searchResults.totalCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{searchResults.channels.length} canais</span>
                    <span>•</span>
                    <span>{searchResults.movies.length} filmes</span>
                    <span>•</span>
                    <span>{searchResults.series.length} séries</span>
                  </div>
                </div>

                {/* Empty State */}
                {searchResults.totalCount === 0 && (
                  <div className="p-6 text-center">
                    <Search className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-slate-300 font-medium">Nenhum resultado para &ldquo;{searchQuery}&rdquo;</p>
                    <p className="text-[11px] text-slate-500 mt-1">Tente buscar por Globo, CazéTV, Duna ou Senna</p>
                  </div>
                )}

                {/* Results List */}
                {searchResults.totalCount > 0 && (
                  <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-white/5">
                    {/* Canais Section */}
                    {searchResults.channels.length > 0 && (
                      <div className="py-2 first:pt-0">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Tv className="w-3 h-3 text-red-400" />
                          <span>Canais ao Vivo ({searchResults.channels.length})</span>
                        </div>
                        {searchResults.channels.slice(0, 3).map((channel) => (
                          <div
                            key={channel.id}
                            onClick={() => {
                              setShowSearchDropdown(false);
                              if (onPlayChannel) onPlayChannel(channel);
                            }}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center p-1 border border-white/5 shrink-0">
                                <img src={channel.logo} alt={channel.name} className="max-h-6 max-w-full object-contain" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                                  {channel.name}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {channel.epgNow || channel.category}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-950/60 px-2 py-0.5 rounded-full border border-red-500/20 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              <span>Ao Vivo</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Filmes Section */}
                    {searchResults.movies.length > 0 && (
                      <div className="py-2">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Film className="w-3 h-3 text-indigo-400" />
                          <span>Filmes ({searchResults.movies.length})</span>
                        </div>
                        {searchResults.movies.slice(0, 3).map((movie) => (
                          <div
                            key={movie.id}
                            onClick={() => {
                              setShowSearchDropdown(false);
                              if (onPlayVod) onPlayVod(movie);
                            }}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={movie.posterUrl}
                                alt={movie.title}
                                className="w-8 h-10 object-cover rounded-md bg-slate-950 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                                  {movie.title}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {movie.year} • {movie.genre[0] || 'Filme'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-500/20 shrink-0">
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Filme</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Séries Section */}
                    {searchResults.series.length > 0 && (
                      <div className="py-2">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <PlayCircle className="w-3 h-3 text-violet-400" />
                          <span>Séries ({searchResults.series.length})</span>
                        </div>
                        {searchResults.series.slice(0, 3).map((series) => (
                          <div
                            key={series.id}
                            onClick={() => {
                              setShowSearchDropdown(false);
                              if (onPlayVod) onPlayVod(series);
                            }}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={series.posterUrl}
                                alt={series.title}
                                className="w-8 h-10 object-cover rounded-md bg-slate-950 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                                  {series.title}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {series.year} • {series.duration || 'Série'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-300 bg-violet-950/60 px-2 py-0.5 rounded-full border border-violet-500/20 shrink-0">
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Série</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Dropdown Footer: See all on main page */}
                <div className="p-2 bg-slate-950/80 border-t border-white/5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSearchDropdown(false);
                    }}
                    className="w-full py-1.5 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Ver todos os {searchResults.totalCount} resultados na tela</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Search Icon Toggle */}
          <button
            type="button"
            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
            className="md:hidden p-2 rounded-full bg-slate-900 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Abrir busca global"
          >
            {isMobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>

          {/* User Auth / Profile Badge */}
          {currentUser ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-[11px]">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="leading-tight font-bold text-white max-w-[110px] truncate">
                    {currentUser.name}
                  </span>
                  <span className={`text-[10px] ${isVip ? 'text-green-400 font-medium' : 'text-slate-400'}`}>
                    {isVip ? 'VIP Ativo' : 'Conta Grátis'}
                  </span>
                </div>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-black p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-white/10 mb-1">
                    <p className="text-xs font-bold text-white truncate">{currentUser.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{currentUser.email}</p>
                    {isVip && currentUser.expiresAt && (
                      <p className="text-[10px] text-green-400 mt-1 font-semibold">
                        Vencimento: {new Date(currentUser.expiresAt).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>

                  <button
                    id="btn-header-my-profile"
                    type="button"
                    onClick={() => { setShowUserMenu(false); setCurrentTab('profile'); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4 text-indigo-400" />
                    <span>Minha Conta & Assinatura</span>
                  </button>

                  {onOpenImportChannels && (
                    <button
                      id="btn-header-import-m3u"
                      type="button"
                      onClick={() => { setShowUserMenu(false); onOpenImportChannels(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-950/40 rounded-xl transition-colors cursor-pointer"
                    >
                      <ListPlus className="w-4 h-4 text-indigo-400" />
                      <span>Adicionar Lista / Link M3U</span>
                    </button>
                  )}

                  {!isVip && (
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); onOpenCheckout(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-950/40 rounded-xl transition-colors cursor-pointer"
                    >
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>Virar Assinante VIP</span>
                    </button>
                  )}

                  {currentUser.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); setCurrentTab('admin'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-950/40 rounded-xl transition-colors cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-indigo-400" />
                      <span>Painel do Administrador</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { setShowUserMenu(false); onLogout(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    <span>Sair da Conta</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-white/10 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-full shadow-sm transition-all cursor-pointer"
            >
              <UserIcon className="w-4 h-4 text-indigo-400" />
              <span>Entrar</span>
            </button>
          )}

          {/* Subscription / VIP Badge / Checkout */}
          {isVip ? (
            <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-white/10 text-slate-200 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <div className="flex flex-col text-left">
                <span className="leading-tight font-bold text-white">MAXTV VIP</span>
                <span className="text-[10px] text-slate-400">Totalmente Liberado</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenCheckout}
              className="flex items-center gap-1.5 sm:gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Crown className="w-4 h-4" />
              <span>Assinar Pix</span>
            </button>
          )}

          {/* TV Box High-Performance Mode Toggle */}
          {onToggleTvBoxMode && (
            <button
              id="btn-header-tvbox-mode"
              type="button"
              onClick={onToggleTvBoxMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                isTvBoxMode
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title={isTvBoxMode ? 'Modo TV Box Ativo: Fontes ampliadas, alto contraste e suporte a D-Pad' : 'Ativar Modo TV Box (Otimizado para D-Pad e leitura à distância)'}
            >
              <Tv className={`w-3.5 h-3.5 ${isTvBoxMode ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{isTvBoxMode ? 'Modo TV Box' : 'Modo TV'}</span>
              {isTvBoxMode && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
          )}

          {/* Quick Admin Toggle - Only for authenticated administrators */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setCurrentTab(currentTab === 'admin' ? 'live' : 'admin')}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Painel Administrativo"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Expandable Search Bar */}
      {isMobileSearchOpen && (
        <div className="md:hidden px-4 pb-3 pt-1 border-b border-white/5 bg-slate-950/95 animate-in slide-in-from-top-2 duration-150">
          <div className="relative flex items-center bg-slate-900 border border-white/10 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar canais, filmes, séries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-xs ml-2 focus:ring-0 focus:outline-none w-full text-white placeholder-slate-500"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>{searchResults.totalCount} resultados encontrados</span>
              <button
                type="button"
                onClick={() => setIsMobileSearchOpen(false)}
                className="text-indigo-400 font-semibold"
              >
                Concluir
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Tab bar */}
      <div className="md:hidden flex items-center justify-around border-t border-white/5 bg-slate-950/95 backdrop-blur-md px-2 py-2">
        <button
          type="button"
          onClick={() => setCurrentTab('live')}
          className={`flex flex-col items-center text-xs gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            currentTab === 'live' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Ao Vivo</span>
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab('epg')}
          className={`flex flex-col items-center text-xs gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            currentTab === 'epg' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Guia EPG</span>
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab('movies')}
          className={`flex flex-col items-center text-xs gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            currentTab === 'movies' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Filmes</span>
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab('series')}
          className={`flex flex-col items-center text-xs gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            currentTab === 'series' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <PlayCircle className="w-4 h-4" />
          <span>Séries</span>
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab('favorites')}
          className={`relative flex flex-col items-center text-xs gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            currentTab === 'favorites' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <div className="relative">
            <Heart className={`w-4 h-4 ${currentTab === 'favorites' ? 'fill-red-500 text-red-500' : ''}`} />
            {favoritesCount > 0 && (
              <span className="absolute -top-1.5 -right-2 text-[8px] font-bold w-3.5 h-3.5 rounded-full bg-red-600 text-white flex items-center justify-center">
                {favoritesCount}
              </span>
            )}
          </div>
          <span>Favoritos</span>
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab('plans')}
          className={`flex flex-col items-center text-xs gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            currentTab === 'plans' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>VIP Pix</span>
        </button>
        {currentUser?.role === 'admin' && (
          <button
            type="button"
            onClick={() => setCurrentTab('admin')}
            className={`flex flex-col items-center text-xs gap-1 py-1 px-3 rounded-lg transition-colors cursor-pointer ${
              currentTab === 'admin' ? 'text-indigo-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Admin</span>
          </button>
        )}
      </div>
    </header>
  );
};
