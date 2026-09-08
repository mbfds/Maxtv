import React, { useState } from 'react';
import { Tv, Film, PlayCircle, Shield, Crown, Search, Sparkles, User as UserIcon, LogOut, KeyRound, Heart } from 'lucide-react';
import { Subscriber, User, NavigationTab } from '../types';

interface HeaderProps {
  currentTab: NavigationTab;
  setCurrentTab: (tab: NavigationTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentSubscriber: Subscriber | null;
  currentUser: User | null;
  onOpenCheckout: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  totalChannelsCount: number;
  favoritesCount?: number;
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
  onLogout,
  totalChannelsCount,
  favoritesCount = 0
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const isVip = currentSubscriber?.status === 'active' || currentUser?.vipStatus === 'active';

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
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Search bar */}
          <div className="relative hidden lg:flex items-center bg-slate-900 border border-white/10 rounded-full px-4 py-2 w-52 xl:w-64">
            <Search className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="text"
              placeholder="Buscar canais, filmes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-sm ml-2 focus:ring-0 focus:outline-none w-full text-slate-300 placeholder-slate-500"
            />
          </div>

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
