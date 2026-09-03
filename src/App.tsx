import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { ChannelGrid } from './components/ChannelGrid';
import { VodSection } from './components/VodSection';
import { PlansView } from './components/PlansView';
import { LivePlayer } from './components/LivePlayer';
import { CheckoutModal } from './components/CheckoutModal';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';

import { Channel, VodItem, Subscriber, SubscriptionPlan, User } from './types';
import { INITIAL_CHANNELS } from './data/channelsData';
import { INITIAL_VOD } from './data/vodData';
import { SUBSCRIPTION_PLANS } from './data/plansData';
import { api } from './services/api';
import { Tv, Sparkles, Shield, Heart, Radio, ExternalLink, UserCheck, Crown, Lock, LogIn } from 'lucide-react';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [vodItems, setVodItems] = useState<VodItem[]>(INITIAL_VOD);
  const [currentTab, setCurrentTab] = useState<'live' | 'movies' | 'series' | 'plans' | 'admin'>('live');
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

  // Active Player
  const [activeMedia, setActiveMedia] = useState<{
    item: Channel | VodItem;
    type: 'channel' | 'vod';
  } | null>(null);

  // Checkout Modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<SubscriptionPlan | undefined>(undefined);

  // Global Announcement
  const [announcement, setAnnouncement] = useState<string>('');

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
    } catch (err) {
      console.warn('Session sync check error:', err);
    }
  }, [authToken, currentUser?.email]);

  // Fetch live channels and VOD from API on mount
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await api.getChannels();
        if (res.channels && res.channels.length > 0) {
          setChannels(res.channels);
        }
      } catch (err) {
        console.warn('Failed to load channels from backend:', err);
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
      } catch (err) {
        console.warn('Failed to load VOD from backend:', err);
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
    setCurrentUser(null);
    setAuthToken('');
    localStorage.removeItem('maxtv_user');
    localStorage.removeItem('maxtv_token');
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

  // Trigger media playback with immediate access for free content
  const handlePlayMedia = (item: Channel | VodItem, type: 'channel' | 'vod') => {
    // Free channels and free movies play immediately!
    if (!item.isVipOnly || currentUser) {
      setActiveMedia({ item, type });
      return;
    }

    // Item is VIP only and user is not logged in yet
    setPendingMediaAfterAuth({ item, type });
    setAuthModalConfig({
      title: `Conteúdo VIP: ${'title' in item ? item.title : item.name}`,
      subtitle: 'Faça login na sua conta VIP ou acesse para começar a reprodução.',
      mode: 'login'
    });
    setIsAuthModalOpen(true);
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
        currentSubscriber={currentSubscriber}
        currentUser={currentUser}
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
          <AdminPanel 
            onClose={() => setCurrentTab('live')}
            onPreviewChannel={(ch) => setActiveMedia({ item: ch, type: 'channel' })}
          />
        ) : (
          <>
            {/* Hero Banner only on Live & Overview */}
            {currentTab === 'live' && !searchQuery && (
              <HeroBanner
                featuredVod={featuredVod}
                featuredChannel={featuredChannel}
                isVip={isVip}
                onPlayChannel={(ch) => handlePlayMedia(ch, 'channel')}
                onPlayVod={(vod) => handlePlayMedia(vod, 'vod')}
                onOpenCheckout={() => {
                  setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                  setIsCheckoutOpen(true);
                }}
              />
            )}

            {/* Tab: Ao Vivo */}
            {currentTab === 'live' && (
              <ChannelGrid
                channels={channels}
                searchQuery={searchQuery}
                isVip={isVip}
                onSelectChannel={(ch) => handlePlayMedia(ch, 'channel')}
                onOpenCheckout={() => {
                  setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                  setIsCheckoutOpen(true);
                }}
              />
            )}

            {/* Tab: Filmes */}
            {currentTab === 'movies' && (
              <VodSection
                items={vodItems}
                filterType="movie"
                searchQuery={searchQuery}
                isVip={isVip}
                onPlayVod={(vod) => handlePlayMedia(vod, 'vod')}
                onOpenCheckout={() => {
                  setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                  setIsCheckoutOpen(true);
                }}
              />
            )}

            {/* Tab: Séries */}
            {currentTab === 'series' && (
              <VodSection
                items={vodItems}
                filterType="series"
                searchQuery={searchQuery}
                isVip={isVip}
                onPlayVod={(vod) => handlePlayMedia(vod, 'vod')}
                onOpenCheckout={() => {
                  setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
                  setIsCheckoutOpen(true);
                }}
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
            <button 
              type="button"
              onClick={() => setCurrentTab('admin')}
              className="text-xs font-semibold px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 text-white transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Painel Admin</span>
            </button>
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
        <LivePlayer
          item={activeMedia.item}
          type={activeMedia.type}
          isVip={isVip}
          currentUser={currentUser}
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
      )}

      {/* Authentication Modal */}
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

      {/* Mercado Pago Pix Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        selectedPlanInitial={selectedPlanForCheckout}
        onSubscriptionSuccess={handleSubscriptionSuccess}
      />
    </div>
  );
}
