import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { ChannelGrid } from './components/ChannelGrid';
import { VodSection } from './components/VodSection';
import { PlansView } from './components/PlansView';
import { LivePlayer } from './components/LivePlayer';
import { CheckoutModal } from './components/CheckoutModal';
import { AdminPanel } from './components/AdminPanel';

import { Channel, VodItem, Subscriber, SubscriptionPlan } from './types';
import { INITIAL_CHANNELS } from './data/channelsData';
import { INITIAL_VOD } from './data/vodData';
import { SUBSCRIPTION_PLANS } from './data/plansData';
import { api } from './services/api';
import { Tv, Sparkles, Shield, Heart, Radio, ExternalLink } from 'lucide-react';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [vodItems, setVodItems] = useState<VodItem[]>(INITIAL_VOD);
  const [currentTab, setCurrentTab] = useState<'live' | 'movies' | 'series' | 'plans' | 'admin'>('live');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
  }, []);

  const handleSubscriptionSuccess = (subscriber: Subscriber) => {
    setCurrentSubscriber(subscriber);
    try {
      localStorage.setItem('maxtv_subscriber', JSON.stringify(subscriber));
    } catch (e) {
      // ignore
    }
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlanForCheckout(plan);
    setIsCheckoutOpen(true);
  };

  const isVip = currentSubscriber?.status === 'active';

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

      {/* Main Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        currentSubscriber={currentSubscriber}
        onOpenCheckout={() => {
          setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
          setIsCheckoutOpen(true);
        }}
        totalChannelsCount={channels.length}
      />

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
                onPlayChannel={(ch) => setActiveMedia({ item: ch, type: 'channel' })}
                onPlayVod={(vod) => setActiveMedia({ item: vod, type: 'vod' })}
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
                onSelectChannel={(ch) => setActiveMedia({ item: ch, type: 'channel' })}
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
                onPlayVod={(vod) => setActiveMedia({ item: vod, type: 'vod' })}
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
                onPlayVod={(vod) => setActiveMedia({ item: vod, type: 'vod' })}
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
              <p className="text-[11px] text-slate-400">Catálogo oficial integrado com a API Saimo-TV • Pix Mercado Pago</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              type="button"
              onClick={() => setCurrentTab('plans')}
              className="text-xs font-semibold px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-slate-300"
            >
              Planos & Preços PIX
            </button>
            <button 
              type="button"
              onClick={() => setCurrentTab('admin')}
              className="text-xs font-semibold px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 text-white transition-all flex items-center gap-1.5"
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
          onClose={() => setActiveMedia(null)}
          onOpenCheckout={() => {
            setActiveMedia(null);
            setSelectedPlanForCheckout(SUBSCRIPTION_PLANS[0]);
            setIsCheckoutOpen(true);
          }}
        />
      )}

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
