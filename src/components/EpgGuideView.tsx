import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, 
  Clock, 
  Sparkles, 
  Play, 
  Tv, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Crown, 
  Tag, 
  RefreshCw, 
  Layers, 
  Radio, 
  X, 
  Flame,
  CheckCircle,
  Share2,
  ListFilter,
  Bell,
  BellRing,
  Check,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { Channel, ChannelCategory, ChannelEpgSchedule, EpgProgram, User, EpgReminder } from '../types';
import { api } from '../services/api';
import { epgReminderService, EPG_REMINDER_TRIGGERED_EVENT } from '../services/epgReminderService';

const CATEGORIES: ChannelCategory[] = [
  'Todos',
  'Abertos',
  'Esportes',
  'Notícias',
  'Filmes & Séries',
  'Infantis',
  'Documentários',
  'Variedades & Música'
];

interface EpgGuideViewProps {
  channels: Channel[];
  isVip: boolean;
  currentUser?: User | null;
  onOpenAuth?: () => void;
  onSelectChannel: (channel: Channel) => void;
  onOpenCheckout: () => void;
}

export const EpgGuideView: React.FC<EpgGuideViewProps> = ({
  channels,
  isVip,
  currentUser,
  onOpenAuth,
  onSelectChannel,
  onOpenCheckout
}) => {
  const [schedules, setSchedules] = useState<ChannelEpgSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ChannelCategory>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateOffset, setSelectedDateOffset] = useState<number>(0); // 0 = Hoje, 1 = Amanhã, -1 = Ontem
  const [onlyLiveNow, setOnlyLiveNow] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<'timeline' | 'cards'>('timeline');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Relógio do Horário Atual
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Modal de Detalhes do Programa com Gemini AI
  const [selectedProgram, setSelectedProgram] = useState<{
    program: EpgProgram;
    channel: Channel;
  } | null>(null);
  const [isEnrichingAi, setIsEnrichingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Lembretes Locais & Notificações no Navegador
  const [reminders, setReminders] = useState<EpgReminder[]>([]);
  const [showRemindersModal, setShowRemindersModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{
    id: string;
    text: string;
    type?: 'info' | 'success' | 'alert';
    actionLabel?: string;
    action?: () => void;
  } | null>(null);

  // Carrega lembretes persistidos para o usuário atual
  useEffect(() => {
    setReminders(epgReminderService.getReminders(currentUser?.email));
  }, [currentUser?.email]);

  // Listener para quando um programa iniciar e disparar notificação
  useEffect(() => {
    const handleReminderTriggered = (e: any) => {
      const rem: EpgReminder = e.detail;
      setReminders(epgReminderService.getReminders(currentUser?.email));
      const targetChannel = channels.find(c => c.id === rem.channelId);
      setToastMessage({
        id: `toast_${Date.now()}`,
        text: `Começou agora: "${rem.programTitle}" no canal ${rem.channelName}!`,
        type: 'alert',
        actionLabel: 'Assistir Agora',
        action: targetChannel ? () => onSelectChannel(targetChannel) : undefined
      });
    };

    window.addEventListener(EPG_REMINDER_TRIGGERED_EVENT, handleReminderTriggered);
    return () => window.removeEventListener(EPG_REMINDER_TRIGGERED_EVENT, handleReminderTriggered);
  }, [channels, currentUser?.email, onSelectChannel]);

  // Auto-dismiss do toast após 7 segundos (exceto se for alerta)
  useEffect(() => {
    if (!toastMessage || toastMessage.type === 'alert') return;
    const timer = setTimeout(() => setToastMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Handler para agendar ou remover lembrete de programa futuro
  const handleToggleReminder = async (program: EpgProgram, channel: Channel) => {
    if (!currentUser) {
      setToastMessage({
        id: `toast_${Date.now()}`,
        text: 'Faça login na sua conta para agendar lembretes no navegador.',
        type: 'info',
        actionLabel: 'Fazer Login',
        action: () => onOpenAuth?.()
      });
      if (onOpenAuth) onOpenAuth();
      return;
    }

    const permission = await epgReminderService.requestNotificationPermission();
    const result = epgReminderService.toggleReminder(program, channel, currentUser.email);
    setReminders(epgReminderService.getReminders(currentUser.email));

    if (result.scheduled) {
      setToastMessage({
        id: `toast_${Date.now()}`,
        text: permission === 'granted'
          ? `Lembrete agendado para "${program.title}" às ${program.startFormatted}! Você será avisado no navegador.`
          : `Lembrete salvo para "${program.title}" às ${program.startFormatted}. Habilite notificações no navegador para alertas sonoros.`,
        type: 'success'
      });
    } else {
      setToastMessage({
        id: `toast_${Date.now()}`,
        text: `Lembrete de "${program.title}" cancelado.`,
        type: 'info'
      });
    }
  };

  const isProgramReminderScheduled = (programId: string) => {
    return reminders.some(r => r.programId === programId);
  };

  // Formatação de data selecionada
  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + selectedDateOffset);
    return d;
  }, [selectedDateOffset]);

  const dateParam = useMemo(() => {
    return selectedDate.toISOString().slice(0, 10);
  }, [selectedDate]);

  // Carrega a programação EPG do backend
  const loadEpgData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEpgSchedule({
        date: dateParam,
        category: selectedCategory !== 'Todos' ? selectedCategory : undefined
      });
      if (res.success && Array.isArray(res.schedules)) {
        setSchedules(res.schedules);
      } else {
        setSchedules([]);
      }
    } catch (err: any) {
      console.error('[EPG GUIDE] Erro ao carregar grade:', err);
      setError(err.message || 'Falha ao carregar a programação EPG.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEpgData();
  }, [dateParam, selectedCategory]);

  // Filtragem local por busca e 'somente ao vivo'
  const filteredSchedules = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return schedules.filter(item => {
      const chNameMatch = item.channel.name.toLowerCase().includes(query);
      const progMatch = item.programs.some(p => p.title.toLowerCase().includes(query));
      const hasMatch = !query || chNameMatch || progMatch;

      if (!hasMatch) return false;
      if (onlyLiveNow) {
        return item.programs.some(p => p.isLiveNow);
      }
      return true;
    });
  }, [schedules, searchQuery, onlyLiveNow]);

  // Solicitar Enriquecimento com Gemini AI
  const handleEnrichWithGemini = async (program: EpgProgram, channel: Channel) => {
    setIsEnrichingAi(true);
    setAiError(null);
    try {
      const res = await api.enrichEpgProgramWithGemini({
        programTitle: program.title,
        channelName: channel.name,
        category: program.category || channel.category,
        currentDescription: program.description
      });

      if (res.success && res.description) {
        // Atualiza estado do modal
        setSelectedProgram(prev => {
          if (!prev) return null;
          return {
            ...prev,
            program: {
              ...prev.program,
              description: res.description,
              rating: res.rating || prev.program.rating,
              aiTags: res.tags || prev.program.aiTags,
              aiHighlights: res.highlights || prev.program.aiHighlights,
              aiEnriched: true,
              source: 'gemini'
            }
          };
        });

        // Atualiza na grade local
        setSchedules(prev => 
          prev.map(sched => {
            if (sched.channel.id !== channel.id) return sched;
            return {
              ...sched,
              programs: sched.programs.map(p => {
                if (p.id === program.id || p.title === program.title) {
                  return {
                    ...p,
                    description: res.description,
                    rating: res.rating || p.rating,
                    aiTags: res.tags || p.aiTags,
                    aiHighlights: res.highlights || p.aiHighlights,
                    aiEnriched: true,
                    source: 'gemini'
                  };
                }
                return p;
              })
            };
          })
        );
      }
    } catch (err: any) {
      setAiError(err.message || 'Falha ao gerar sinopse com IA.');
    } finally {
      setIsEnrichingAi(false);
    }
  };

  // Cores da classificação indicativa etária
  const getRatingBadge = (rating?: string) => {
    const r = (rating || 'L').toUpperCase();
    if (r.includes('18')) return 'bg-red-700 text-white border-red-500';
    if (r.includes('16')) return 'bg-red-600 text-white border-red-400';
    if (r.includes('14')) return 'bg-amber-600 text-white border-amber-400';
    if (r.includes('12')) return 'bg-amber-500 text-slate-950 border-amber-300 font-bold';
    if (r.includes('10')) return 'bg-blue-600 text-white border-blue-400';
    return 'bg-emerald-600 text-white border-emerald-400';
  };

  // Horários de referência para a régua superior (a cada 2 horas)
  const timeHeaders = [
    '00:00', '02:00', '04:00', '06:00', '08:00', '10:00', 
    '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top Banner de Apresentação do EPG com Gemini */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/20 p-6 sm:p-8 mb-8 shadow-2xl">
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Guia Inteligente com Google Gemini</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Calendar className="w-7 h-7 text-indigo-400" />
              <span>Grade Horária de TV (EPG)</span>
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Consulte a programação completa dos canais abertos e fechados, veja o que está no ar agora com barra de progresso em tempo real e gere sinopses inteligentes com inteligência artificial.
            </p>
          </div>

          {/* Relógio em Tempo Real & Botão de Atualizar */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-white/10 text-slate-200 shadow-inner">
              <Clock className="w-4 h-4 text-indigo-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider leading-none">Horário de Brasília</span>
                <span className="text-sm font-extrabold text-white">
                  {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={loadEpgData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-950/50 cursor-pointer"
              title="Recarregar grade de programação"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Controles de Filtro: Dias, Categorias, Busca e Alternância de Visualização */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Seletor de Dia (Ontem / Hoje / Amanhã) */}
          <div className="flex items-center bg-slate-900/80 border border-white/10 rounded-2xl p-1 gap-1 w-fit shadow-sm">
            <button
              type="button"
              onClick={() => setSelectedDateOffset(-1)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedDateOffset === -1
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Ontem
            </button>
            <button
              type="button"
              onClick={() => setSelectedDateOffset(0)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedDateOffset === 0
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Hoje ({new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})
            </button>
            <button
              type="button"
              onClick={() => setSelectedDateOffset(1)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedDateOffset === 1
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Amanhã
            </button>
          </div>

          {/* Busca e Alternância de Modo */}
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar programa, filme ou canal..."
                className="w-full bg-slate-900/80 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/80 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Toggle 'Só No Ar' */}
            <button
              type="button"
              onClick={() => setOnlyLiveNow(prev => !prev)}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                onlyLiveNow
                  ? 'bg-rose-600/20 text-rose-300 border-rose-500/40 shadow-sm'
                  : 'bg-slate-900/80 text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${onlyLiveNow ? 'text-rose-400 animate-pulse' : ''}`} />
              <span className="hidden sm:inline">No Ar Agora</span>
            </button>

            {/* Alternância de Visualização */}
            <div className="flex items-center bg-slate-900/80 border border-white/10 rounded-2xl p-1 shrink-0">
              <button
                type="button"
                onClick={() => setActiveViewMode('timeline')}
                className={`p-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeViewMode === 'timeline'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Grade Horária Linha do Tempo"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode('cards')}
                className={`p-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeViewMode === 'cards'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Visualização em Lista por Canal"
              >
                <ListFilter className="w-4 h-4" />
              </button>
            </div>

            {/* Botão de Lembretes Agendados */}
            <button
              id="btn-epg-view-reminders"
              type="button"
              onClick={() => {
                if (!currentUser && onOpenAuth) {
                  onOpenAuth();
                } else {
                  setShowRemindersModal(true);
                }
              }}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                reminders.length > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-slate-900/80 text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
              }`}
              title="Ver lembretes de programas agendados"
            >
              {reminders.length > 0 ? (
                <BellRing className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              ) : (
                <Bell className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Lembretes</span>
              {reminders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                  {reminders.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Categorias */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-white/5'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Mensagem de Erro se houver */}
      {error && (
        <div className="p-4 mb-6 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadEpgData}
            className="text-xs font-bold underline hover:text-white cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Estado de Carregamento */}
      {loading ? (
        <div className="w-full py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
          <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm font-medium animate-pulse">Carregando programação de canais e sinopses EPG...</p>
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-slate-900/40 border border-white/5 p-8">
          <Tv className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">Nenhuma programação encontrada</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {searchQuery 
              ? `Nenhum programa ou canal corresponde ao termo "${searchQuery}".`
              : 'Nenhum canal ativo disponível nesta categoria ou data selecionada.'}
          </p>
        </div>
      ) : activeViewMode === 'timeline' ? (
        /* MODO 1: LINHA DO TEMPO HORIZONTAL TIPO TV GUIDE */
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-white/10 shadow-2xl">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
            <div className="min-w-[1100px]">
              {/* Régua de Horários no Topo */}
              <div className="sticky top-0 z-20 flex border-b border-white/10 bg-slate-950/95 backdrop-blur-md">
                <div className="w-56 shrink-0 px-4 py-3 border-r border-white/10 text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Canal</span>
                  <span className="text-[10px] text-indigo-400 font-normal">{filteredSchedules.length} canais</span>
                </div>
                <div className="flex-1 grid grid-cols-12 divide-x divide-white/5 text-center text-xs font-bold text-slate-300">
                  {timeHeaders.map(hour => (
                    <div key={hour} className="py-3 px-2 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{hour}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linhas de Canais e Programas */}
              <div className="divide-y divide-white/5">
                {filteredSchedules.map(item => {
                  const isLocked = item.channel.isVipOnly && !isVip;

                  return (
                    <div key={item.channel.id} className="flex hover:bg-white/[0.02] transition-colors group">
                      {/* Coluna do Canal (Fixa à Esquerda) */}
                      <div className="w-56 shrink-0 p-3.5 border-r border-white/10 flex items-center justify-between bg-slate-950/40">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-white/10 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                            {item.channel.logo ? (
                              <img
                                src={item.channel.logo}
                                alt={item.channel.name}
                                className="w-full h-full object-contain p-1"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Tv className="w-5 h-5 text-slate-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-extrabold text-white truncate group-hover:text-indigo-300 transition-colors">
                              {item.channel.name}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-medium block truncate">
                              {item.channel.category}
                            </span>
                          </div>
                        </div>

                        {/* Botão Assistir Canal */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isLocked) onOpenCheckout();
                            else onSelectChannel(item.channel);
                          }}
                          className="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all cursor-pointer shrink-0 ml-2"
                          title={isLocked ? 'Canal VIP - Assine para liberar' : `Assistir ${item.channel.name}`}
                        >
                          {isLocked ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        </button>
                      </div>

                      {/* Faixa de Programas do Canal */}
                      <div className="flex-1 flex gap-2 p-2 overflow-x-auto scrollbar-none items-stretch">
                        {item.programs.map(prog => {
                          const isLive = prog.isLiveNow;

                          return (
                            <div
                              key={prog.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedProgram({ program: prog, channel: item.channel })}
                              className={`relative flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer select-none shrink-0 w-64 text-left ${
                                isLive
                                  ? 'bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 border-indigo-500/60 shadow-lg shadow-indigo-950/40 hover:border-indigo-400 ring-1 ring-indigo-500/30'
                                  : 'bg-slate-900/60 border-white/5 hover:border-white/20 hover:bg-slate-800/60'
                              }`}
                            >
                              {/* Top Bar do Card de Programa: Horário + Indicador No Ar */}
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  <span>{prog.startFormatted} - {prog.endFormatted}</span>
                                </div>

                                <div className="flex items-center gap-1">
                                  {prog.aiEnriched && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-purple-500/20 border border-purple-500/40 text-[9px] font-bold text-purple-300" title="Sinopse enriquecida com Gemini AI">
                                      <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                                      IA
                                    </span>
                                  )}
                                  {isLive ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-[10px] font-extrabold text-white uppercase tracking-wider animate-pulse shadow-sm">
                                      No Ar
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleReminder(prog, item.channel);
                                      }}
                                      className={`p-1 rounded-lg transition-all cursor-pointer ${
                                        isProgramReminderScheduled(prog.id)
                                          ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                          : 'text-slate-400 hover:text-amber-300 hover:bg-white/10'
                                      }`}
                                      title={
                                        isProgramReminderScheduled(prog.id)
                                          ? 'Lembrete agendado no navegador (Clique para remover)'
                                          : 'Agendar lembrete no navegador para o início deste programa'
                                      }
                                    >
                                      {isProgramReminderScheduled(prog.id) ? (
                                        <BellRing className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                      ) : (
                                        <Bell className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Título do Programa */}
                              <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-indigo-200 transition-colors mb-1">
                                {prog.title}
                              </h5>

                              {/* Sinopse curta */}
                              <p className="text-[11px] text-slate-400 line-clamp-2 leading-tight mb-2">
                                {prog.description || 'Clique para ver a sinopse e detalhes completos deste programa.'}
                              </p>

                              {/* Barra de Progresso se for Ao Vivo */}
                              {isLive && (
                                <div className="w-full space-y-1 my-1">
                                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-indigo-500 h-full rounded-full transition-all duration-1000"
                                      style={{ width: `${prog.progressPercent}%` }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                                    <span>{prog.progressPercent}% decorrido</span>
                                    <span>{prog.durationMinutes} min</span>
                                  </div>
                                </div>
                              )}

                              {/* Rodapé: Categoria & Classificação Indicativa */}
                              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-400">
                                <span className="truncate max-w-[120px]">{prog.category || item.channel.category}</span>
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${getRatingBadge(prog.rating)}`}>
                                  {prog.rating || 'L'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MODO 2: LISTA DE CANAIS COM PROGRAMAÇÃO DETALHADA EM CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSchedules.map(item => {
            const isLocked = item.channel.isVipOnly && !isVip;
            const currentProg = item.currentProgram || item.programs[0];
            const nextProg = item.nextProgram;

            return (
              <div
                key={item.channel.id}
                className="flex flex-col justify-between p-5 rounded-3xl bg-slate-900 border border-white/10 hover:border-indigo-500/40 transition-all shadow-xl hover:shadow-indigo-950/20 group"
              >
                <div>
                  {/* Top Canal Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-white/10 p-1 flex items-center justify-center shrink-0">
                        {item.channel.logo ? (
                          <img
                            src={item.channel.logo}
                            alt={item.channel.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Tv className="w-6 h-6 text-slate-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-white group-hover:text-indigo-300 transition-colors">
                          {item.channel.name}
                        </h4>
                        <span className="text-xs text-slate-400 font-medium">
                          {item.channel.category}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isLocked) onOpenCheckout();
                        else onSelectChannel(item.channel);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/40 cursor-pointer"
                    >
                      {isLocked ? <Crown className="w-3.5 h-3.5 text-amber-300" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      <span>{isLocked ? 'VIP' : 'Assistir'}</span>
                    </button>
                  </div>

                  {/* Bloco "No Ar Agora" */}
                  {currentProg && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedProgram({ program: currentProg, channel: item.channel })}
                      className="p-3.5 rounded-2xl bg-slate-950/70 border border-indigo-500/30 mb-3 hover:border-indigo-400 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                          No Ar Agora
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          {currentProg.startFormatted} - {currentProg.endFormatted}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-white mb-1">
                        {currentProg.title}
                      </h5>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                        {currentProg.description}
                      </p>
                      {/* Barra de progresso */}
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{ width: `${currentProg.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Bloco "A Seguir" */}
                  {nextProg && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedProgram({ program: nextProg, channel: item.channel })}
                      className="p-3 rounded-2xl bg-slate-950/40 border border-white/5 hover:border-white/20 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          A Seguir
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-slate-500">
                            {nextProg.startFormatted}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleReminder(nextProg, item.channel);
                            }}
                            className={`p-1 rounded-lg transition-all cursor-pointer ${
                              isProgramReminderScheduled(nextProg.id)
                                ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                : 'text-slate-400 hover:text-amber-300 hover:bg-white/10'
                            }`}
                            title={
                              isProgramReminderScheduled(nextProg.id)
                                ? 'Lembrete agendado no navegador (Clique para remover)'
                                : 'Agendar lembrete no navegador para quando começar'
                            }
                          >
                            {isProgramReminderScheduled(nextProg.id) ? (
                              <BellRing className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            ) : (
                              <Bell className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <h6 className="text-xs font-semibold text-slate-200 truncate">
                        {nextProg.title}
                      </h6>
                    </div>
                  )}
                </div>

                {/* Ação para ver todos os horários do canal */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentProg) {
                      setSelectedProgram({ program: currentProg, channel: item.channel });
                    }
                  }}
                  className="mt-4 w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-white/5"
                >
                  <Info className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Ver Grade Completa do Dia</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE DETALHES DO PROGRAMA COM INTEGRAÇÃO DA API DO GOOGLE GEMINI */}
      {/* ========================================================================= */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Botão Fechar */}
            <button
              type="button"
              onClick={() => setSelectedProgram(null)}
              className="absolute right-5 top-5 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Cabeçalho do Canal & Status */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-white/10 p-2 flex items-center justify-center shrink-0">
                {selectedProgram.channel.logo ? (
                  <img
                    src={selectedProgram.channel.logo}
                    alt={selectedProgram.channel.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Tv className="w-8 h-8 text-slate-500" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    {selectedProgram.channel.name}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-400">
                    {selectedProgram.channel.category}
                  </span>
                  {selectedProgram.program.isLiveNow && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-600 text-[10px] font-extrabold text-white uppercase tracking-wider animate-pulse">
                      No Ar Agora
                    </span>
                  )}
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                  {selectedProgram.program.title}
                </h3>
              </div>
            </div>

            {/* Metadados: Horário, Duração, Classificação */}
            <div className="flex flex-wrap items-center gap-3 py-3 border-y border-white/10 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-white/5 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>{selectedProgram.program.startFormatted} até {selectedProgram.program.endFormatted} ({selectedProgram.program.durationMinutes} minutos)</span>
              </div>

              <div className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${getRatingBadge(selectedProgram.program.rating)}`}>
                Classificação: {selectedProgram.program.rating || 'Livre'}
              </div>

              {selectedProgram.program.category && (
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-white/5 text-slate-300">
                  Gênero: <span className="font-semibold text-white">{selectedProgram.program.category}</span>
                </div>
              )}
            </div>

            {/* Caixa de Sinopse Oficial / IA do Gemini */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-indigo-500/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span>Sinopse Oficial & Detalhes do Programa</span>
                </div>

                {selectedProgram.program.aiEnriched && (
                  <span className="text-[10px] font-semibold text-purple-300 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-purple-400" />
                    Enriquecido com Gemini
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">
                {selectedProgram.program.description || 'Nenhuma sinopse detalhada fornecida pelo canal.'}
              </p>

              {/* Destaques do Programa com IA */}
              {selectedProgram.program.aiHighlights && selectedProgram.program.aiHighlights.length > 0 && (
                <div className="pt-3 border-t border-white/5 space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Destaques da Edição:
                  </span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                    {selectedProgram.program.aiHighlights.map((hl, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{hl}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tags Thematicas com IA */}
              {selectedProgram.program.aiTags && selectedProgram.program.aiTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {selectedProgram.program.aiTags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-lg bg-indigo-950/60 border border-indigo-500/20 text-[10px] font-semibold text-indigo-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Botão de Geração / Aprofundamento com Gemini IA */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleEnrichWithGemini(selectedProgram.program, selectedProgram.channel)}
                  disabled={isEnrichingAi}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-purple-950/50 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isEnrichingAi ? 'animate-spin' : ''}`} />
                  <span>
                    {isEnrichingAi 
                      ? 'Consultando Gemini IA...' 
                      : selectedProgram.program.aiEnriched 
                        ? 'Atualizar Sinopse com Gemini' 
                        : 'Gerar Sinopse Completa com Gemini IA'}
                  </span>
                </button>

                {aiError && (
                  <span className="text-xs text-rose-400">{aiError}</span>
                )}
              </div>
            </div>

            {/* Ações Principais */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const ch = selectedProgram.channel;
                  setSelectedProgram(null);
                  if (ch.isVipOnly && !isVip) {
                    onOpenCheckout();
                  } else {
                    onSelectChannel(ch);
                  }
                }}
                className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-950/50 cursor-pointer"
              >
                {selectedProgram.channel.isVipOnly && !isVip ? (
                  <>
                    <Crown className="w-4 h-4 text-amber-300" />
                    <span>Assinar VIP para Liberar Canal</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Assistir {selectedProgram.channel.name} Agora</span>
                  </>
                )}
              </button>

              {/* Botão Agendar Lembrete no Navegador para programas futuros */}
              {!selectedProgram.program.isLiveNow && (
                <button
                  id="btn-epg-schedule-reminder"
                  type="button"
                  onClick={() => handleToggleReminder(selectedProgram.program, selectedProgram.channel)}
                  className={`w-full sm:w-auto py-3.5 px-5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                    isProgramReminderScheduled(selectedProgram.program.id)
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700 text-white border-white/10'
                  }`}
                  title="Receber notificação nativa no navegador quando o programa iniciar"
                >
                  {isProgramReminderScheduled(selectedProgram.program.id) ? (
                    <>
                      <BellRing className="w-4 h-4 text-amber-400" />
                      <span>Lembrete Agendado (Cancelar)</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4 text-indigo-400" />
                      <span>Agendar Lembrete no Navegador</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedProgram(null)}
                className="w-full sm:w-auto py-3.5 px-6 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Lembretes Agendados do Usuário */}
      {showRemindersModal && (
        <div
          id="modal-epg-user-reminders"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowRemindersModal(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Meus Lembretes no Navegador</h3>
                  <p className="text-xs text-slate-400">Você será notificado assim que cada programa entrar no ar</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRemindersModal(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reminders.length === 0 ? (
              <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-white/5 p-6">
                <Bell className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-white mb-1">Nenhum lembrete agendado</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Navegue pela grade de horários e clique no sino de qualquer programa futuro para ser avisado no navegador!
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                {reminders.map(rem => {
                  const targetChannel = channels.find(c => c.id === rem.channelId);

                  return (
                    <div
                      key={rem.id}
                      className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 hover:border-indigo-500/30 transition-all flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-white/10 p-1 flex items-center justify-center shrink-0">
                          {rem.channelLogo ? (
                            <img
                              src={rem.channelLogo}
                              alt={rem.channelName}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Tv className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-white truncate">{rem.programTitle}</h5>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="text-indigo-400 font-semibold">{rem.channelName}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {rem.formattedTime}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {targetChannel && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowRemindersModal(false);
                              onSelectChannel(targetChannel);
                            }}
                            className="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all cursor-pointer"
                            title={`Assistir canal ${rem.channelName}`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            epgReminderService.removeReminder(rem.programId, currentUser?.email);
                            setReminders(epgReminderService.getReminders(currentUser?.email));
                          }}
                          className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 transition-all cursor-pointer"
                          title="Excluir lembrete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Toast Notification for Reminders */}
      {toastMessage && (
        <div
          id="epg-reminder-toast-alert"
          className="fixed top-20 right-4 sm:right-8 z-50 max-w-md bg-slate-900/95 border border-indigo-500/50 shadow-2xl rounded-2xl p-4 flex items-start gap-3 backdrop-blur-xl animate-fadeIn"
        >
          <div
            className={`p-2 rounded-xl shrink-0 ${
              toastMessage.type === 'alert'
                ? 'bg-rose-500/20 text-rose-300'
                : toastMessage.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-indigo-500/20 text-indigo-300'
            }`}
          >
            <BellRing className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-medium leading-relaxed">{toastMessage.text}</p>
            {toastMessage.action && (
              <button
                type="button"
                onClick={() => {
                  toastMessage.action?.();
                  setToastMessage(null);
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{toastMessage.actionLabel || 'Assistir'}</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
