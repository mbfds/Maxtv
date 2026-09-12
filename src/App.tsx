import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { ChannelGrid } from './components/ChannelGrid';
import { VodSection } from './components/VodSection';
import { PlansView } from './components/PlansView';
import { FavoritesView } from './components/FavoritesView';
import { RecentlyAddedSection } from './components/RecentlyAddedSection';
import { GlobalSearchResultsView } from './components/GlobalSearchResultsView';

// Heavy secondary components lazy-loaded to reduce initial bundle and improve TTI
const LivePlayer = lazy(() => import('./components/LivePlayer').then(m => ({ default: m.LivePlayer })));
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then(m => ({ default: m.CheckoutModal })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const AdminAuthGate = lazy(() => import('./components/AdminAuthGate').then(m => ({ default: m.AdminAuthGate })));
const AuthModal = lazy(() => import('./components/AuthModal').then(m => ({ default: m.AuthModal })));

import { Channel, VodItem, Subscriber, SubscriptionPlan, User, NavigationTab, FavoriteItem, WatchProgress } from './types';
import { INITIAL_CHANNELS } from './data/channelsData';
import { INITIAL_VOD } from './data/vodData';
import { SUBSCRIPTION_PLANS } from './data/plansData';
import { api, clearAdminToken, getAdminToken, getCachedChannels, getCachedVodCatalog } from './services/api';
import { adminAuthManager } from './services/adminAuthManager';
import { favoritesStorage, FAVORITES_UPDATED_EVENT } from './services/favoritesStorage';
import { watchProgressStorage, PROGRESS_UPDATED_EVENT } from './services/watchProgressStorage';
import { initDeferredTelemetry } from './services/telemetryService';
import { Tv, Sparkles, Shield, Heart, Radio, ExternalLink, UserCheck, Crown, Lock, LogIn } from 'lucide-react';

export default function App() {
  // Instant boot from localStorage cache, falling back to bundled defaults
  const [channels, setChannels] = useState<Channel[]>(() => {
    const cached = getCachedChannels();
    if (cached && cached.length > 0) return cached;
    return INITIAL_CHANNELS;
  });

  const [vodItems, setVodItems] = useState<VodItem[]>(() => {
    const cached = getCachedVodCatalog();
    if (cached && cached.length > 0) {
      const existingIds = new Set(cached.map((c: any) => c.id));
      const defaults = INITIAL_VOD.filter(v => !existingIds.has(v.id));
      return [...cached, ...defaults];
    }
    return INITIAL_VOD;
  });

  const [currentTab, setCurrentTab] = useState<NavigationTab>('live');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('maxtv_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return null;
  });

  const [authToken, setAuthToken] = useState<string>(() => {
    return localStorage.getItem('maxtv_token') || '';
  });

  // Strict Admin Session Verification state with instant secure sessionStorage caching
  const [isAdminVerified, setIsAdminVerified] = useState<boolean>(() => {
    const instant = adminAuthManager.getInstantSession();
    return Boolean(instant?.isAuthenticated && instant.user?.role === 'admin');
  });

  // Favorites & Watch Progress State
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    return favoritesStorage.getFavorites(currentUser?.email);
  });

  const [watchProgress, setWatchProgress] = useState<WatchProgress[]>(() => {
    return watchProgressStorage.getProgressList(currentUser?.email);
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalConfig, setAuthModalConfig] = useState<{
    title?: string;
    subtitle?: string;
    mode?: 'login' | 'register';
  }>({});

  // Pending media to play immediately after login
  const [pendingMediaAfterAuth, setPendingMediaAfterAuth] = useState<{
    item: Channel | VodItem;
    type: 'channel' | 'vod';
    initialSeekTime?: number;
  } | null>(null);

  // Active Subscriber state
  const [currentSubscriber, setCurrentSubscriber] = useState<Subscriber | null>(() => {
    try {
      const saved = localStorage.getItem('maxtv_subscriber');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return null;
  });

  // TV Box High-Performance Mode (Ultra fast, no blurs, D-Pad focus rings)
  const [isTvBoxMode, setIsTvBoxMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('maxtv_tv_box_mode');
      if (saved !== null) return saved === 'true';
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
      return ua.includes('tv') || ua.includes('box') || ua.includes('aftb') || ua.includes('mibox') || ua.includes('smart-tv') || ua.includes('googletv');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('maxtv_tv_box_mode', isTvBoxMode ? 'true' : 'false');
      if (isTvBoxMode) {
        document.documentElement.classList.add('tv-box-mode');
      } else {
        document.documentElement.classList.remove('tv-box-mode');
      }
    } catch {}
  }, [isTvBoxMode]);

  // Active Player
  const [activeMedia, setActiveMedia] = useState<{
    item: Channel | VodItem;
    type: 'channel' | 'vod';
    initialSeekTime?: number;
  } | null>(null);

  // Checkout Modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<SubscriptionPlan | undefined>(undefined);

  // Global Announcement
  const [announcement, setAnnouncement] = useState<string>('');

  // Time-To-Interactive (TTI) Optimization: Main Grid status
  const [isMainGridMounted, setIsMainGridMounted] = useState<boolean>(false);

  useEffect(() => {
    // Notify that core UI and initial grid are mounted and interactive
    setIsMainGridMounted(true);
  }, []);

  // Postpone heavy analytics, monitoring, and telemetry until after the main grid is interactive
  useEffect(() => {
    if (!isMainGridMounted) return;

    if (typeof window !== 'undefined') {
      const scheduleIdle = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1000));
      const idleHandle = scheduleIdle(() => {
        initDeferredTelemetry();
      });

      return () => {
        if (window.cancelIdleCallback && typeof idleHandle === 'number') {
          window.cancelIdleCallback(idleHandle);
        }
      };
    }
  }, [isMainGridMounted]);

  // Sync user status on mount if logged in
  const syncSession = useCallback(async () => {
    if (!currentUser?.email && !authToken) return;
    try {
      const res = await api.getMe(authToken, currentUser?.email);
      if (res.user) {
        setCurrentUser(res.user);
        localStorage.setItem('maxtv_user', JSON.stringify(res.user));
        if (res.user.vipStatus === 'active') {
          // Keep subscriber in sync
          setCurrentSubscriber(prev => prev ? {
            ...prev,
            status: 'active',
            planName: res.user.planName || prev.planName,
            expiresAt: res.user.expiresAt || prev.expiresAt
          } : {
            id: res.user.subscriberId || 'sub-' + res.user.id,
            name: res.user.name,
            email: res.user.email,
            cpf: res.user.cpf || '',
            planId: res.user.planId || 'plan-anual',
            planName: res.user.planName || 'Plano Anual VIP',
            status: 'active',
            startDate: res.user.startDate || new Date().toISOString(),
            expiresAt: res.user.expiresAt || new Date(Date.now() + 365*86400000).toISOString(),
            amountPaid: 149.90
          });
        }
      }
    } catch {
      // Ignored in production
    }
  }, [authToken, currentUser?.email]);

  // Sync and listen for background cache revalidations (1-hour stale revalidation)
  useEffect(() => {
    const onChannelsRevalidated = (e: any) => {
      if (e.detail?.channels && Array.isArray(e.detail.channels) && e.detail.channels.length > 0) {
        setChannels(e.detail.channels);
      }
    };
    const onVodRevalidated = (e: any) => {
      if (e.detail?.items && Array.isArray(e.detail.items) && e.detail.items.length > 0) {
        setVodItems(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newItems = e.detail.items.filter((item: any) => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    };

    window.addEventListener('maxtv_channels_revalidated', onChannelsRevalidated);
    window.addEventListener('maxtv_vod_revalidated', onVodRevalidated);
    return () => {
      window.removeEventListener('maxtv_channels_revalidated', onChannelsRevalidated);
      window.removeEventListener('maxtv_vod_revalidated', onVodRevalidated);
    };
  }, []);

  // Background check for admin session persistence across reloads
  useEffect(() => {
    if (!isAdminVerified) return;
    const token = getAdminToken();
    if (!token) {
      setIsAdminVerified(false);
      return;
    }
    api.verifyAdminSession(token).then(res => {
      if (!res.valid || res.user?.role !== 'admin') {
        clearAdminToken();
        try {
          sessionStorage.removeItem('maxtv_admin_verified');
          sessionStorage.removeItem('maxtv_admin_token');
          sessionStorage.removeItem('maxtv_admin_user');
        } catch {}
        setIsAdminVerified(false);
      } else {
        try {
          sessionStorage.setItem('maxtv_admin_verified', 'true');
          sessionStorage.setItem('maxtv_admin_user', JSON.stringify(res.user));
        } catch {}
      }
    }).catch(() => {});
  }, [isAdminVerified]);

  // Fetch live channels and VOD from API on mount (using cached instant response + background revalidation)
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await api.getChannels();
        if (res.channels && res.channels.length > 0) {
          setChannels(res.channels);
        }
      } catch {
        // Fallback to initial channels
      }
    };

    const fetchVod = async () => {
      try {
        const vRes = await api.getVodCatalog();
        if (vRes.items && vRes.items.length > 0) {
          setVodItems(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newItems = vRes.items.filter((item: any) => !existingIds.has(item.id));
            return [...prev, ...newItems];
          });
        }
      } catch {
        // Fallback to initial VOD
      }
    };

    const fetchSettings = async () => {
      try {
        const sRes = await api.getSettings();
        if (sRes.settings?.announcementText) {
          setAnnouncement(sRes.settings.announcementText);
        }
      } catch (err) {
        // ignore
      }
    };

    fetchChannels();
    fetchVod();
    fetchSettings();
    syncSession();
  }, [syncSession]);

  const handleLoginSuccess = (user: User, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
    try {
      localStorage.setItem('maxtv_user', JSON.stringify(user));
      localStorage.setItem('maxtv_token', token);
    } catch (e) {}

    if (user.vipStatus === 'active') {
      const subData: Subscriber = {
        id: user.subscriberId || 'sub-' + user.id,
        name: user.name,
        email: user.email,
        cpf: user.cpf || '',
        planId: user.planId || 'plan-anual',
        planName: user.planName || 'Plano Anual VIP',
        status: 'active',
        startDate: user.startDate || new Date().toISOString(),
        expiresAt: user.expiresAt || new Date(Date.now() + 365*86400000).toISOString(),
        amountPaid: 149.90
      };
      setCurrentSubscriber(subData);
      try {
        localStorage.setItem('maxtv_subscriber', JSON.stringify(subData));
      } catch (e) {}
    }

    // If user clicked on a media item before logging in, immediately launch it!
    if (pendingMediaAfterAuth) {
      setActiveMedia(pendingMediaAfterAuth);
      setPendingMediaAfterAuth(null);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    try {
      await api.adminLogout();
    } catch (e) {}
    clearAdminToken();
    setIsAdminVerified(false);
    setCurrentUser(null);
    setAuthToken('');
    localStorage.removeItem('maxtv_user');
    localStorage.removeItem('maxtv_token');
    setFavorites(favoritesStorage.getFavorites());
    setWatchProgress(watchProgressStorage.getProgressList());
    if (currentTab === 'admin') {
      setCurrentTab('live');
    }
  };

  // Listen to unauthorized admin API events & reactive synchronization
  useEffect(() => {
    const handleAdminUnauthorized = () => {
      setIsAdminVerified(false);
    };

    window.addEventListener('maxtv_admin_unauthorized', handleAdminUnauthorized);
    return () => {
      window.removeEventListener('maxtv_admin_unauthorized', handleAdminUnauthorized);
    };
  }, []);

  // Listen to local storage update events (reactive synchronization)
  useEffect(() => {
    const handleFavUpdate = () => {
      setFavorites(favoritesStorage.getFavorites(currentUser?.email));
    };
    const handleProgressUpdate = () => {
      setWatchProgress(watchProgressStorage.getProgressList(currentUser?.email));
    };

    window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavUpdate);
    window.addEventListener(PROGRESS_UPDATED_EVENT, handleProgressUpdate);

    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavUpdate);
      window.removeEventListener(PROGRESS_UPDATED_EVENT, handleProgressUpdate);
    };
  }, [currentUser?.email]);

  // Sync favorites and watch progress from backend API when user is logged in
  useEffect(() => {
    setFavorites(favoritesStorage.getFavorites(currentUser?.email));
    setWatchProgress(watchProgressStorage.getProgressList(currentUser?.email));

    if (currentUser?.email && authToken) {
      favoritesStorage.syncWithServer(currentUser.email, authToken)
        .then(favs => setFavorites(favs))
        .catch(() => {});
      watchProgressStorage.syncWithServer(currentUser.email, authToken)
        .then(progs => setWatchProgress(progs))
        .catch(() => {});
    }
  }, [currentUser?.email, authToken]);

  const handleToggleFavoriteChannel = (channel: Channel) => {
    favoritesStorage.toggleFavorite(channel, 'channel', currentUser?.email, authToken);
  };

  const handleToggleFavoriteVod = (vod: VodItem) => {
    favoritesStorage.toggleFavorite(vod, 'vod', currentUser?.email, authToken);
  };

  const handleRemoveFavorite = (id: string) => {
    favoritesStorage.removeFavorite(id, currentUser?.email, authToken);
  };

  const handleRemoveProgress = (id: string) => {
    watchProgressStorage.removeProgress(id, currentUser?.email, authToken);
  };

  const handleSubscriptionSuccess = (subscriber: Subscriber) => {
    setCurrentSubscriber(subscriber);
    try {
      localStorage.setItem('maxtv_subscriber', JSON.stringify(subscriber));
    } catch (e) {}

    // Update currentUser if logged in
    if (currentUser) {
      const updatedUser: User = {
        ...currentUser,
        vipStatus: 'active',
        planId: subscriber.planId,
        planName: subscriber.planName,
        expiresAt: subscriber.expiresAt,
        subscriberId: subscriber.id
      };
      setCurrentUser(updatedUser);
      try {
        localStorage.setItem('maxtv_user', JSON.stringify(updatedUser));
      } catch (e) {}
    }
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlanForCheckout(plan);
    setIsCheckoutOpen(true);
  };

  // Determine VIP Status
  const isVip = (currentUser?.vipStatus === 'active') || (currentSubscriber?.status === 'active');

  // Trigger media playback with immediate access for free and guest 5-min preview
  const handlePlayMedia = (item: Channel | VodItem, type: 'channel' | 'vod', initialTime?: number) => {
    // Both channels and movies play immediately; non-VIP users receive 5 minutes free preview before restart
    setActiveMedia({ item, type, initialSeekTime: initialTime });
  };

  const handlePlayVodWithSeek = (vod: VodItem, initialTime?: number) => {
    handlePlayMedia(vod, 'vod', initialTime);
  };

  // Featured items for Hero Banner
  const featuredVod = vodItems.find(v => v.id === 'vod-cidade-de-deus') || vodItems[0];
  const featuredChannel = channels.find(c => c.id === 'ch-cazetv' || c.name.toLowerCase().includes('cazé') || c.category === 'Esportes') || channels[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-600 selection:text-white font-sans">
      {/* Top Announcement Bar if enabled */}
      {announcement && (
        <div className="w-full bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-950 py-1.5 px-4 text-center text-xs font-semibold text-indigo-200 flex items-center justify-center gap-2 border-b border-indigo-500/30 shadow-sm">
          <Sparkles className="w-4 h-4 text-indigo-400 fill-indigo-400/30" />
          <span>{announcement}</span>
        </div>
      )}

      {/* Main Header with Authentication & VIP status */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        channels={channels}
        vodItems={vodItems}
        onPlayChannel={(ch) => handlePlayMedia(ch, 'channel')}
        onPlayVod={(vod) => handlePlayVodWithSeek(vod)}
        currentSubscriber={currentSubscriber}
        currentUser={currentUser}
        favoritesCount={favorites.length}
        onOpenCheckout={() => {
          setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
          setIsCheckoutOpen(true);
        }}
        onOpenAuth={() => {
          setAuthModalConfig({
            title: 'Entrar no MAXTV VIP',
            subtitle: 'Acesse canais ao vivo, filmes e séries liberados',
            mode: 'login'
          });
          setIsAuthModalOpen(true);
        }}
        onLogout={handleLogout}
        totalChannelsCount={channels.length}
        isTvBoxMode={isTvBoxMode}
        onToggleTvBoxMode={() => setIsTvBoxMode(prev => !prev)}
      />

      {/* Guest Login Hint Bar if not logged in */}
      {!currentUser && (
        <div className="w-full bg-indigo-950/60 border-b border-indigo-500/20 py-2 px-4">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-indigo-200">
              <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                <strong>Sistema de Autenticação Ativo:</strong> Faça login para liberar todos os filmes, séries e canais sem tela preta.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthModalConfig({
                    title: 'Entrar na Conta MAXTV',
                    subtitle: 'Use sua conta cadastrada ou o Acesso Rápido VIP',
                    mode: 'login'
                  });
                  setIsAuthModalOpen(true);
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-full shadow-sm text-xs cursor-pointer transition-colors"
              >
                Entrar / Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'admin' ? (
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-24 space-y-4 text-slate-400">
              <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Carregando Módulos do Painel Administrativo...</p>
            </div>
          }>
            {isAdminVerified && currentUser?.role === 'admin' ? (
              <AdminPanel 
                onClose={() => setCurrentTab('live')}
                onLockAdmin={async () => {
                  try {
                    await api.adminLogout();
                  } catch {}
                  adminAuthManager.clearSession();
                  setIsAdminVerified(false);
                }}
                onPreviewChannel={(ch) => setActiveMedia({ item: ch, type: 'channel' })}
              />
            ) : (
              <AdminAuthGate
                onAdminSuccess={(adminUser, token) => {
                  setCurrentUser(adminUser);
                  setIsAdminVerified(true);
                  adminAuthManager.setSessionSuccess(adminUser, token);
                }}
                onCancel={() => setCurrentTab('live')}
              />
            )}
          </Suspense>
        ) : (
          <>
            {/* Global Search Results View across Channels, Movies and Series */}
            {searchQuery.trim().length > 0 ? (
              <GlobalSearchResultsView
                searchQuery={searchQuery}
                onClearSearch={() => setSearchQuery('')}
                channels={channels}
                vodItems={vodItems}
                isVip={isVip}
                onPlayChannel={(ch) => handlePlayMedia(ch, 'channel')}
                onPlayVod={handlePlayVodWithSeek}
                onOpenCheckout={() => {
                  setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                  setIsCheckoutOpen(true);
                }}
                favorites={favorites}
                onToggleFavoriteChannel={handleToggleFavoriteChannel}
                onToggleFavoriteVod={handleToggleFavoriteVod}
              />
            ) : (
              <>
                {/* Hero Banner only on Live & Overview */}
                {currentTab === 'live' && (
                  <HeroBanner
                    featuredVod={featuredVod}
                    featuredChannel={featuredChannel}
                    featuredVods={vodItems}
                    featuredChannels={channels}
                    isVip={isVip}
                    onPlayChannel={(ch) => handlePlayMedia(ch, 'channel')}
                    onPlayVod={(vod) => handlePlayMedia(vod, 'vod')}
                    onOpenCheckout={() => {
                      setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                      setIsCheckoutOpen(true);
                    }}
                  />
                )}

                {/* Seção Recém Adicionados no Catálogo */}
                {currentTab === 'live' && (
                  <RecentlyAddedSection
                    items={vodItems}
                    isVip={isVip}
                    onPlayVod={handlePlayVodWithSeek}
                    onOpenCheckout={() => {
                      setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                      setIsCheckoutOpen(true);
                    }}
                    favorites={favorites}
                    onToggleFavorite={handleToggleFavoriteVod}
                    title="Recém Adicionados no Catálogo"
                    subtitle="Os mais novos filmes e séries disponíveis com alta qualidade e som imersivo"
                  />
                )}

                {/* Tab: Ao Vivo */}
                {currentTab === 'live' && (
                  <ChannelGrid
                    channels={channels}
                    searchQuery=""
                    isVip={isVip}
                    onSelectChannel={(ch) => handlePlayMedia(ch, 'channel')}
                    onOpenCheckout={() => {
                      setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                      setIsCheckoutOpen(true);
                    }}
                    favorites={favorites}
                    onToggleFavorite={handleToggleFavoriteChannel}
                    watchProgress={watchProgress}
                    allVodItems={vodItems}
                    onPlayVod={handlePlayVodWithSeek}
                    onRemoveProgress={handleRemoveProgress}
                  />
                )}

                {/* Tab: Filmes */}
                {currentTab === 'movies' && (
                  <>
                    <RecentlyAddedSection
                      items={vodItems.filter(v => v.type === 'movie')}
                      isVip={isVip}
                      onPlayVod={handlePlayVodWithSeek}
                      onOpenCheckout={() => {
                        setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                        setIsCheckoutOpen(true);
                      }}
                      favorites={favorites}
                      onToggleFavorite={handleToggleFavoriteVod}
                      title="Filmes Recém Adicionados"
                      subtitle="Lançamentos do cinema adicionados recentemente ao acervo MAXTV"
                    />
                    <VodSection
                      items={vodItems}
                      filterType="movie"
                      searchQuery=""
                      isVip={isVip}
                      onPlayVod={handlePlayVodWithSeek}
                      onOpenCheckout={() => {
                        setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                        setIsCheckoutOpen(true);
                      }}
                      favorites={favorites}
                      onToggleFavorite={handleToggleFavoriteVod}
                      watchProgress={watchProgress}
                      onRemoveProgress={handleRemoveProgress}
                    />
                  </>
                )}

                {/* Tab: Séries */}
                {currentTab === 'series' && (
                  <>
                    <RecentlyAddedSection
                      items={vodItems.filter(v => v.type === 'series')}
                      isVip={isVip}
                      onPlayVod={handlePlayVodWithSeek}
                      onOpenCheckout={() => {
                        setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                        setIsCheckoutOpen(true);
                      }}
                      favorites={favorites}
                      onToggleFavorite={handleToggleFavoriteVod}
                      title="Séries Recém Adicionadas"
                      subtitle="Novas séries e temporadas completas adicionadas recentemente"
                    />
                    <VodSection
                      items={vodItems}
                      filterType="series"
                      searchQuery=""
                      isVip={isVip}
                      onPlayVod={handlePlayVodWithSeek}
                      onOpenCheckout={() => {
                        setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                        setIsCheckoutOpen(true);
                      }}
                      favorites={favorites}
                      onToggleFavorite={handleToggleFavoriteVod}
                      watchProgress={watchProgress}
                      onRemoveProgress={handleRemoveProgress}
                    />
                  </>
                )}

                {/* Tab: Favoritos */}
                {currentTab === 'favorites' && (
                  <FavoritesView
                    favorites={favorites}
                    channels={channels}
                    vodItems={vodItems}
                    onPlayChannel={(ch) => handlePlayMedia(ch, 'channel')}
                    onPlayVod={handlePlayVodWithSeek}
                    onRemoveFavorite={handleRemoveFavorite}
                    onExplore={() => setCurrentTab('live')}
                  />
                )}

                {/* Tab: Planos VIP */}
                {currentTab === 'plans' && (
                  <PlansView
                    onSelectPlan={handleSelectPlan}
                    isVip={isVip}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/5 bg-slate-900/80 backdrop-blur-md py-6 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white font-bold">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-white font-bold tracking-tight">Streaming Brasil • MAX<span className="text-indigo-400">TV</span></p>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              </div>
              <p className="text-[11px] text-slate-400">Sistema com Autenticação de Usuários, Liberação de Meses pelo Administrador e Catálogo VOD HD</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              type="button"
              onClick={() => setCurrentTab('plans')}
              className="text-xs font-semibold px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-slate-300 cursor-pointer"
            >
              Planos & Preços PIX
            </button>
            {currentUser?.role === 'admin' ? (
              <button 
                type="button"
                onClick={() => setCurrentTab('admin')}
                className="text-xs font-semibold px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 text-white transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Painel Admin</span>
              </button>
            ) : (
              <button 
                type="button"
                onClick={() => setCurrentTab('admin')}
                className="text-xs font-medium px-3 py-1.5 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-500 hover:text-slate-400 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Acesso reservado aos administradores"
              >
                <Lock className="w-3 h-3 text-slate-600" />
                <span>Acesso Admin</span>
              </button>
            )}
            <a 
              href="https://github.com/gabrielsaimo/Saimo-TV" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs font-semibold px-3 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <span>API Saimo-TV</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="text-center md:text-right">
            <p className="text-slate-300 font-medium">Assinatura Segura via Mercado Pago Pix</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Grade sincronizada e monitorada 24/7</p>
          </div>
        </div>
      </footer>

      {/* Floating Video Player Modal */}
      {activeMedia && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Carregando Player de Vídeo...</p>
            </div>
          </div>
        }>
          <LivePlayer
            item={activeMedia.item}
            type={activeMedia.type}
            initialSeekTime={activeMedia.initialSeekTime}
            isVip={isVip}
            currentUser={currentUser}
            authToken={authToken}
            onClose={() => setActiveMedia(null)}
            onOpenCheckout={() => {
              setActiveMedia(null);
              setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
              setIsCheckoutOpen(true);
            }}
            onOpenAuth={() => {
              setAuthModalConfig({
                title: 'Entrar na sua Conta VIP',
                subtitle: 'Entre para liberar a transmissão deste conteúdo',
                mode: 'login'
              });
              setIsAuthModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* Authentication Modal */}
      {isAuthModalOpen && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => {
              setIsAuthModalOpen(false);
              setPendingMediaAfterAuth(null);
            }}
            onSuccess={handleLoginSuccess}
            initialMode={authModalConfig.mode || 'login'}
            customTitle={authModalConfig.title}
            customSubtitle={authModalConfig.subtitle}
          />
        </Suspense>
      )}

      {/* Mercado Pago Pix Checkout Modal */}
      {isCheckoutOpen && (
        <Suspense fallback={null}>
          <CheckoutModal
            isOpen={isCheckoutOpen}
            onClose={() => setIsCheckoutOpen(false)}
            selectedPlanInitial={selectedPlanForCheckout}
            onSubscriptionSuccess={handleSubscriptionSuccess}
          />
        </Suspense>
      )}
    </div>
  );
}
