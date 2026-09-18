import React, { useState, useEffect } from 'react';
import { 
  Users, DollarSign, Tv, CreditCard, Settings, RefreshCw, 
  Plus, Check, X, Shield, Search, AlertCircle, Play, 
  Trash2, UserCheck, UserX, Clock, ExternalLink, Zap,
  Gift, CalendarPlus, Crown, History, Sparkles, LayoutDashboard,
  Radio, CheckCircle2, ChevronRight, Filter, Flame, ArrowUpRight,
  Activity, Film, WifiOff, FileCode, GitBranch, Layers, Lock,
  Download, Database, HardDrive, Server, Calendar, Pencil, Wand2
} from 'lucide-react';
import { AdminMetrics, Subscriber, PixTransaction, Channel, SystemSettings, VipGrant, ChannelReport, ChannelUpdateHistoryEntry } from '../types';
import { api } from '../services/api';
import { cleanStreamUrl, inspectAndCleanUrl, sanitizeStreamUrl } from '../utils/urlSanitizer';
import { ChannelHealthChecker } from './ChannelHealthChecker';
import { ChannelConfigEditor } from './ChannelConfigEditor';
import { ChannelUpdateHistory } from './ChannelUpdateHistory';
import { M3uUnifierManager } from './M3uUnifierManager';
import { UrlErrorLogsViewer } from './UrlErrorLogsViewer';
import { UnifiedLinksManager } from './UnifiedLinksManager';
import { XmltvValidatorManager } from './XmltvValidatorManager';
import { SalesAndGrantsHistory } from './SalesAndGrantsHistory';
import { AuditLogsViewer } from './AuditLogsViewer';
import { RealtimeMetricsDashboard } from './RealtimeMetricsDashboard';
import { ServerHealthDashboard } from './ServerHealthDashboard';
import { AdminMemoryFooter } from './AdminMemoryFooter';

interface AdminPanelProps {
  onClose: () => void;
  onPreviewChannel: (channel: Channel) => void;
  onLockAdmin?: () => void;
}

type AdminTab = 
  | 'overview' 
  | 'realtime-metrics'
  | 'server-health'
  | 'audit-logs'
  | 'grant-vip' 
  | 'subscribers' 
  | 'sales-and-grants' 
  | 'grants-history' 
  | 'transactions' 
  | 'channels' 
  | 'm3u-sources-unifier' 
  | 'unify-m3u' 
  | 'repo-sync' 
  | 'epg-validator'
  | 'channels-config' 
  | 'channels-history' 
  | 'channel-health' 
  | 'channel-reports' 
  | 'url-errors' 
  | 'settings';

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, onPreviewChannel, onLockAdmin }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [grantsHistory, setGrantsHistory] = useState<VipGrant[]>([]);
  const [transactions, setTransactions] = useState<PixTransaction[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelReports, setChannelReports] = useState<ChannelReport[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [lastChannelUpdate, setLastChannelUpdate] = useState<ChannelUpdateHistoryEntry | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [isDownloadingDb, setIsDownloadingDb] = useState<boolean>(false);

  const handleDownloadBackup = async () => {
    setIsDownloadingDb(true);
    try {
      const blob = await api.downloadDatabaseBackup();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const nowTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `maxtv-backup-${nowTag}.db`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setActionFeedback('Backup do banco SQLite baixado com sucesso!');
      setTimeout(() => setActionFeedback(''), 4000);
    } catch (err: any) {
      try {
        const directUrl = api.getDatabaseBackupDownloadUrl();
        window.open(directUrl, '_blank');
        setActionFeedback('Iniciando download do backup...');
        setTimeout(() => setActionFeedback(''), 4000);
      } catch (e: any) {
        alert(`Erro ao baixar backup: ${err.message}`);
      }
    } finally {
      setIsDownloadingDb(false);
    }
  };

  // Modals inside admin
  const [isGrantModalOpen, setIsGrantModalOpen] = useState<boolean>(false);
  const [grantFormData, setGrantFormData] = useState({
    subscriberId: '',
    email: '',
    name: '',
    months: 1,
    customDays: 0,
    reason: 'Cortesia do Administrador'
  });

  const [isAddSubModalOpen, setIsAddSubModalOpen] = useState<boolean>(false);
  const [newSubData, setNewSubData] = useState({ name: '', email: '', cpf: '', planName: 'Plano Mensal', days: 30 });

  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState<boolean>(false);
  const [newChannelData, setNewChannelData] = useState({ name: '', category: 'Abertos', logo: '', streamUrl: '', referer: '', isVipOnly: false });

  // Edit Channel Modal State
  const [isEditChannelModalOpen, setIsEditChannelModalOpen] = useState<boolean>(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editChannelData, setEditChannelData] = useState({
    id: '',
    name: '',
    category: 'Abertos',
    logo: '',
    streamUrl: '',
    referer: '',
    isVipOnly: false
  });

  // VOD Sync Modal State
  const [isSyncVodModalOpen, setIsSyncVodModalOpen] = useState<boolean>(false);
  const [vodSyncSource, setVodSyncSource] = useState<'local' | 'custom'>('local');
  const [customVodUrl, setCustomVodUrl] = useState<string>('');
  const [vodSyncLoading, setVodSyncLoading] = useState<boolean>(false);

  // Filters
  const [subscriberSearch, setSubscriberSearch] = useState<string>('');
  const [subscriberFilter, setSubscriberFilter] = useState<string>('all');
  const [channelSearch, setChannelSearch] = useState<string>('');

  // Load initial admin data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [mRes, sRes, gRes, tRes, cRes, setRes, rRes, hRes] = await Promise.all([
        api.getAdminMetrics(),
        api.getSubscribers(),
        api.getGrantsHistory(),
        api.getTransactions(),
        api.getChannels({ forceRefresh: true }),
        api.getSettings(),
        api.getChannelReports(),
        api.getChannelUpdateHistory()
      ]);

      if (mRes.success) setMetrics(mRes.metrics);
      if (sRes.success) setSubscribers(sRes.subscribers);
      if (gRes.success) setGrantsHistory(gRes.grants);
      if (tRes.success) setTransactions(tRes.transactions);
      if (cRes.channels) setChannels(cRes.channels);
      if (setRes.success) setSettings(setRes.settings);
      if (rRes.success && rRes.reports) setChannelReports(rRes.reports);
      if (hRes.success && hRes.lastUpdate) setLastChannelUpdate(hRes.lastUpdate);
    } catch {
      // Data load failure handled by state
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteReport = async (reportId: string) => {
    try {
      const res = await api.deleteChannelReport(reportId);
      if (res.success) {
        setChannelReports(prev => prev.filter(r => r.id !== reportId));
        showFeedback('Relatório removido do log com sucesso!');
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleClearReports = async () => {
    if (!confirm('Deseja limpar todos os relatórios de erros do log administrativo?')) return;
    try {
      const res = await api.clearChannelReports();
      if (res.success) {
        setChannelReports([]);
        showFeedback('Log de relatórios limpo com sucesso!');
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(''), 4500);
  };

  // --- ACTIONS: LIBERAÇÃO DE MÊS & CORTESIAS ---
  const handleOpenGrantModal = (sub?: Subscriber) => {
    if (sub) {
      setGrantFormData({
        subscriberId: sub.id,
        email: sub.email,
        name: sub.name,
        months: 1,
        customDays: 0,
        reason: 'Renovação / Liberação pelo Administrador'
      });
    } else {
      setGrantFormData({
        subscriberId: '',
        email: '',
        name: '',
        months: 1,
        customDays: 0,
        reason: 'Cortesia de Acesso VIP'
      });
    }
    setIsGrantModalOpen(true);
  };

  // 1-Click Quick Add Month
  const handleQuickAddMonth = async (id: string, name: string) => {
    try {
      setIsLoading(true);
      const res = await api.quickAddMonth(id);
      if (res.success) {
        setSubscribers(prev => prev.map(s => s.id === id ? res.subscriber : s));
        if (res.grant) setGrantsHistory(prev => [res.grant, ...prev]);
        showFeedback(res.message);
        const mRes = await api.getAdminMetrics();
        if (mRes.success) setMetrics(mRes.metrics);
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao conceder mês');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Grant Months Modal
  const handleSubmitGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantFormData.subscriberId && !grantFormData.email) {
      alert('Por favor, informe o e-mail do usuário para liberar o acesso.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.grantMonths({
        subscriberId: grantFormData.subscriberId || undefined,
        email: grantFormData.email || undefined,
        name: grantFormData.name || undefined,
        months: grantFormData.months,
        days: grantFormData.customDays || undefined,
        reason: grantFormData.reason
      });

      if (res.success) {
        setIsGrantModalOpen(false);
        showFeedback(res.message);
        await loadData();
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao liberar meses.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSubStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    try {
      const res = await api.updateSubscriber(id, { status: newStatus });
      if (res.success) {
        setSubscribers(prev => prev.map(s => s.id === id ? res.subscriber : s));
        showFeedback(`Status atualizado para: ${newStatus === 'active' ? 'Ativo' : 'Bloqueado'}`);
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteSubscriber = async (id: string) => {
    if (!confirm('Deseja realmente remover este assinante?')) return;
    try {
      await api.deleteSubscriber(id);
      setSubscribers(prev => prev.filter(s => s.id !== id));
      showFeedback('Assinante removido com sucesso.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCreateSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.addSubscriber({
        name: newSubData.name,
        email: newSubData.email,
        cpf: newSubData.cpf,
        planName: newSubData.planName,
        days: Number(newSubData.days),
        status: 'active'
      });
      if (res.success) {
        setSubscribers(prev => [res.subscriber, ...prev]);
        setIsAddSubModalOpen(false);
        setNewSubData({ name: '', email: '', cpf: '', planName: 'Plano Mensal', days: 30 });
        showFeedback('Novo assinante cadastrado e ativado com sucesso!');
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleApproveTransaction = async (id: string) => {
    try {
      const res = await api.approveTransaction(id);
      if (res.success) {
        setTransactions(prev => prev.map(t => t.id === id ? res.transaction : t));
        loadData();
        showFeedback('Transação PIX aprovada manualmente!');
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSyncLocalM3u = async () => {
    try {
      setIsLoading(true);
      const res = await api.syncLocalM3uChannels();
      showFeedback(res.message);
      api.clearChannelsCache();
      const cRes = await api.getChannels({ forceRefresh: true });
      if (cRes.channels) setChannels(cRes.channels);
      const hRes = await api.getChannelUpdateHistory();
      if (hRes.success && hRes.lastUpdate) setLastChannelUpdate(hRes.lastUpdate);
      setHistoryRefreshTrigger(prev => prev + 1);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncVod = () => {
    setIsSyncVodModalOpen(true);
  };

  const handleExecuteSyncVod = async () => {
    try {
      setVodSyncLoading(true);
      const options = vodSyncSource === 'custom'
        ? { m3uUrl: customVodUrl.trim() || undefined }
        : { source: vodSyncSource };

      const res = await api.syncVodM3U(options);
      if (res.success) {
        showFeedback(`Catálogo de filmes e séries atualizado! (${res.count} títulos consolidados)`);
        setIsSyncVodModalOpen(false);
      } else {
        alert(res.error || 'Erro ao sincronizar catálogo VOD');
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao atualizar catálogo');
    } finally {
      setVodSyncLoading(false);
    }
  };

  // Função central de limpeza e higienização de URLs no AdminPanel
  const handleCleanStreamUrl = (
    url: string,
    onCleaned: (cleaned: string) => void,
    fieldLabel: string = 'Stream'
  ) => {
    if (!url || !url.trim()) {
      showFeedback(`O campo ${fieldLabel} está em branco.`);
      return;
    }
    const report = inspectAndCleanUrl(url);
    if (report.wasModified) {
      onCleaned(report.cleanedUrl);
      showFeedback(`✨ URL de ${fieldLabel} limpa com sucesso! Espaços acidentais e caracteres invisíveis foram removidos.`);
    } else if (report.isValid) {
      showFeedback(`✅ URL de ${fieldLabel} já está limpa e pronta para o player.`);
    } else {
      showFeedback(`⚠️ ${report.reason || 'Verifique se a URL inicia com http:// ou https://'}`);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Limpeza profunda de URL removendo espaços em branco acidentais e caracteres de controle
      const streamReport = inspectAndCleanUrl(newChannelData.streamUrl);
      const sanitizedStreamUrl = streamReport.cleanedUrl;
      const sanitizedLogo = cleanStreamUrl(newChannelData.logo);

      if (!sanitizedStreamUrl) {
        alert('A URL do stream é obrigatória.');
        return;
      }

      if (!streamReport.isValid) {
        alert(`URL do stream inválida: ${streamReport.reason || 'Certifique-se de que inicia com http:// ou https://'}`);
        return;
      }

      const payload = {
        ...newChannelData,
        name: newChannelData.name.trim(),
        streamUrl: sanitizedStreamUrl,
        logo: sanitizedLogo,
        referer: newChannelData.referer?.trim() || undefined
      };

      const res = await api.addCustomChannel(payload);
      if (res.success) {
        setChannels(prev => [res.channel, ...prev]);
        setIsAddChannelModalOpen(false);
        setNewChannelData({ name: '', category: 'Abertos', logo: '', streamUrl: '', referer: '', isVipOnly: false });
        if (streamReport.wasModified) {
          showFeedback('Canal adicionado! URL higienizada automaticamente (espaços/caracteres invisíveis removidos).');
        } else {
          showFeedback('Canal adicionado à grade com sucesso!');
        }
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleOpenEditChannel = (ch: Channel) => {
    setEditingChannel(ch);
    const currentUrl = ch.sources?.[0]?.url || (ch as any).streamUrl || '';
    setEditChannelData({
      id: ch.id,
      name: ch.name,
      category: ch.category || 'Abertos',
      logo: ch.logo || '',
      streamUrl: currentUrl,
      referer: ch.sources?.[0]?.referer || '',
      isVipOnly: Boolean(ch.isVipOnly)
    });
    setIsEditChannelModalOpen(true);
  };

  const handleUpdateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    try {
      // Limpeza profunda de URL antes de salvar
      const streamReport = inspectAndCleanUrl(editChannelData.streamUrl);
      const sanitizedStreamUrl = streamReport.cleanedUrl;
      const sanitizedLogo = cleanStreamUrl(editChannelData.logo);

      if (!sanitizedStreamUrl) {
        alert('A URL do stream é obrigatória.');
        return;
      }

      if (!streamReport.isValid) {
        alert(`URL do stream inválida: ${streamReport.reason || 'Certifique-se de que inicia com http:// ou https://'}`);
        return;
      }

      const res = await api.updateChannel(editingChannel.id, {
        name: editChannelData.name.trim(),
        category: editChannelData.category,
        logo: sanitizedLogo,
        streamUrl: sanitizedStreamUrl,
        referer: editChannelData.referer?.trim() || undefined,
        isVipOnly: editChannelData.isVipOnly
      });

      if (res.success) {
        setChannels(prev => prev.map(c => (c.id === editingChannel.id ? res.channel : c)));
        setIsEditChannelModalOpen(false);
        setEditingChannel(null);
        if (streamReport.wasModified) {
          showFeedback('Canal atualizado! URL higienizada e corrigida para garantir reprodução no player.');
        } else {
          showFeedback('Canal atualizado com sucesso!');
        }
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao atualizar canal');
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Deseja realmente remover este canal da grade?')) return;
    try {
      await api.deleteChannel(id);
      setChannels(prev => prev.filter(c => c.id !== id));
      showFeedback('Canal removido da grade.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      const res = await api.updateSettings(settings);
      if (settings.autoUpdateIntervalHours) {
        await api.saveM3uAutoUpdateConfig({ intervalHours: settings.autoUpdateIntervalHours }).catch(() => null);
      }
      if (res.success) {
        showFeedback('Configurações salvas e aplicadas com sucesso!');
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Filtered subscribers
  const filteredSubscribers = subscribers.filter(sub => {
    const matchesSearch = 
      sub.name.toLowerCase().includes(subscriberSearch.toLowerCase()) ||
      sub.email.toLowerCase().includes(subscriberSearch.toLowerCase()) ||
      sub.cpf.includes(subscriberSearch);
    
    if (subscriberFilter === 'all') return matchesSearch;
    return matchesSearch && sub.status === subscriberFilter;
  });

  // Filtered channels
  const filteredChannels = channels.filter(ch => 
    ch.name.toLowerCase().includes(channelSearch.toLowerCase()) ||
    ch.category.toLowerCase().includes(channelSearch.toLowerCase())
  );

  return (
    <div className="w-full bg-slate-950 text-slate-100 rounded-3xl border border-white/10 shadow-2xl overflow-hidden min-h-[850px] flex flex-col">
      {/* Toast Feedback */}
      {actionFeedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/40 text-sm font-semibold animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* TOP HEADER: MASTER CONSOLE BAR */}
      <header className="bg-slate-900 border-b border-white/10 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-black tracking-tight text-white uppercase">
                MAX<span className="text-indigo-400">TV</span> Master Control
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider">
                Console Administrador
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Servidor Conectado • Liberação Imediata de Meses • Listas M3U Locais Ativas
            </p>
          </div>
        </div>

        {/* Quick Actions Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleOpenGrantModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all transform active:scale-95"
          >
            <Gift className="w-4 h-4 text-emerald-100" />
            <span>+ Liberar Mês / Cortesia VIP</span>
          </button>

          <button
            id="btn-header-download-db"
            type="button"
            onClick={handleDownloadBackup}
            disabled={isDownloadingDb}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Baixar cópia manual do banco de dados SQLite (data/maxtv.db) com flush WAL de segurança"
          >
            {isDownloadingDb ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Backup SQLite (.db)</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
            title="Atualizar Dados"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {onLockAdmin && (
            <button
              type="button"
              onClick={onLockAdmin}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer"
              title="Bloquear painel e encerrar sessão de administrador"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Bloquear Painel</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/70 hover:border-rose-500/40 text-slate-300 hover:text-rose-200 border border-white/10 text-xs font-semibold transition-all"
          >
            <X className="w-4 h-4" />
            <span>Sair do Admin</span>
          </button>
        </div>
      </header>

      {/* ADMIN BODY: SIDEBAR + CONTENT AREA */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* DIFFERENT ADMIN SIDEBAR */}
        <aside className="w-full md:w-64 bg-slate-900/90 border-b md:border-b-0 md:border-r border-white/10 p-4 shrink-0 flex flex-col justify-between">
          <div className="space-y-1">
            {/* GRUPO 1: VISÃO GERAL & MONITORAMENTO */}
            <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Visão Geral & Monitoramento
            </p>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>Visão Geral</span>
              </div>
              {metrics && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/30">
                  R$ {metrics.monthlyRevenue.toFixed(0)}
                </span>
              )}
            </button>

            {/* PAINEL EM TEMPO REAL */}
            <button
              id="sidebar-tab-realtime-metrics"
              type="button"
              onClick={() => setActiveTab('realtime-metrics')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'realtime-metrics'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                  : 'text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 hover:bg-emerald-950/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Métricas em Tempo Real</span>
              </div>
              <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 animate-pulse">
                Ao Vivo
              </span>
            </button>

            {/* SAÚDE DO SERVIDOR (RECHARTS, LATÊNCIA & UPTIME) */}
            <button
              id="sidebar-tab-server-health"
              type="button"
              onClick={() => setActiveTab('server-health')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'server-health'
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-600/30 ring-2 ring-cyan-400/50'
                  : 'text-cyan-300 bg-cyan-950/20 border border-cyan-500/20 hover:bg-cyan-950/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-cyan-400" />
                <span>Saúde do Servidor</span>
              </div>
              <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                Ping & Uptime
              </span>
            </button>

            {/* GRUPO 2: COMERCIAL & ASSINANTES */}
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Comercial & Assinantes
              </p>
            </div>

            {/* DESTAQUE PRINCIPAL: LIBERAÇÃO DE MÊS */}
            <button
              type="button"
              onClick={() => setActiveTab('grant-vip')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'grant-vip'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                  : 'text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 hover:bg-emerald-950/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Gift className="w-4 h-4" />
                <span>Liberar Mês / VIP</span>
              </div>
              <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                ADM VIP
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('subscribers')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'subscribers'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Assinantes & Clientes</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-bold">
                {subscribers.length}
              </span>
            </button>

            {/* HISTÓRICO COMPLETO: LIBERAÇÃO E VENDAS PIX */}
            <button
              type="button"
              onClick={() => setActiveTab('sales-and-grants')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'sales-and-grants' || activeTab === 'grants-history' || activeTab === 'transactions'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-emerald-400" />
                <span>Histórico Completo</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                {grantsHistory.length + transactions.length}
              </span>
            </button>

            {/* GRUPO 3: CONTEÚDO, GRADE & LINKS */}
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Conteúdo, Grade & Links
              </p>
            </div>

            {/* CENTRAL ÚNICA DE LINKS IPTV */}
            <button
              type="button"
              onClick={() => setActiveTab('m3u-sources-unifier')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'm3u-sources-unifier' || activeTab === 'unify-m3u' || activeTab === 'repo-sync'
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/30 ring-2 ring-emerald-400/50'
                  : 'text-teal-300 bg-teal-950/20 border border-teal-500/20 hover:bg-teal-950/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-teal-400" />
                <span>Central de Links IPTV</span>
              </div>
              <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                1 ÚNICA CENTRAL
              </span>
            </button>

            {/* VALIDADOR DE XMLTV (EPG) */}
            <button
              type="button"
              onClick={() => setActiveTab('epg-validator')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'epg-validator'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/50'
                  : 'text-indigo-300 bg-indigo-950/20 border border-indigo-500/20 hover:bg-indigo-950/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Validador XMLTV (EPG)</span>
              </div>
              <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                Grade
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channels')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'channels'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Tv className="w-4 h-4" />
                <span>Grade de Canais</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-bold">
                {channels.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channels-config')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'channels-config'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>Configuração JSON</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Editor
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channels-history')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'channels-history'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-cyan-400" />
                <span>Histórico da Grade</span>
              </div>
              {lastChannelUpdate && (
                <span className={`w-2 h-2 rounded-full ${lastChannelUpdate.success ? 'bg-emerald-400' : 'bg-rose-400'}`} title="Status da última atualização" />
              )}
            </button>

            {/* GRUPO 4: AUDITORIA, LOGS & DIAGNÓSTICO */}
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Auditoria & Diagnóstico
              </p>
            </div>

            {/* LOGS DE AUDITORIA */}
            <button
              id="sidebar-tab-audit-logs"
              type="button"
              onClick={() => setActiveTab('audit-logs')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'audit-logs'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span>Logs de Auditoria</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                Ações ADM
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channel-health')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'channel-health'
                  ? 'bg-gradient-to-r from-emerald-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Verificador de Sinais</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 animate-pulse">
                Diagnóstico
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channel-reports')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'channel-reports'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className={`w-4 h-4 ${channelReports.length > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
                <span>Links Inativos / Erros</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                channelReports.length > 0 
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' 
                  : 'bg-white/10 text-slate-400'
              }`}>
                {channelReports.length}
              </span>
            </button>

            <button
              id="sidebar-tab-url-errors"
              type="button"
              onClick={() => setActiveTab('url-errors')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'url-errors'
                  ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow-lg shadow-rose-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-rose-400" />
                <span>Erros URLs & SQLite</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                Diagnóstico
              </span>
            </button>

            {/* GRUPO 5: SISTEMA & AJUSTES */}
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Sistema & Ajustes
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4" />
                <span>Configurações & Chaves</span>
              </div>
            </button>
          </div>

          {/* Quick Admin Footer Info */}
          <div className="pt-4 border-t border-white/10 mt-4">
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Assinantes Ativos</span>
                <span className="font-bold text-emerald-400">{metrics?.activeSubscribers || 0}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Total Canais Grade</span>
                <span className="font-bold text-indigo-300">{channels.length}</span>
              </div>
              <div className="pt-1">
                <div className="text-[10px] text-slate-400 leading-tight">
                  Super Admin Autenticado • Modo Master
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN PANEL VIEW CONTENT */}
        <main className="flex-1 p-6 overflow-y-auto max-h-[800px]">
          
          {/* TAB: MONITORAMENTO EM TEMPO REAL */}
          {activeTab === 'realtime-metrics' && (
            <RealtimeMetricsDashboard 
              onNavigateTab={(tab) => setActiveTab(tab as AdminTab)} 
            />
          )}

          {/* TAB: LOGS DE AUDITORIA */}
          {activeTab === 'audit-logs' && (
            <AuditLogsViewer />
          )}

          {/* TAB 1: VISÃO GERAL & MÉTRICAS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Highlight Banner: Liberação de Mês */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
                <div className="space-y-2 max-w-xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ferramenta Direta de Concessão de Acesso</span>
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Liberar Mês ou Conceder Cortesia VIP para Usuários
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Você como administrador tem controle total para liberar 1 mês, 3 meses, 6 meses ou 1 ano para qualquer cliente, ativar contas bloqueadas ou conceder acesso imediato apenas informando o e-mail.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('grant-vip')}
                    className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/30 transition-all transform active:scale-95 flex items-center gap-2"
                  >
                    <Gift className="w-4 h-4" />
                    <span>Acessar Central de Liberação</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenGrantModal()}
                    className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-white/10 transition-all flex items-center gap-2"
                  >
                    <CalendarPlus className="w-4 h-4 text-emerald-400" />
                    <span>Liberar +1 Mês Agora</span>
                  </button>
                </div>
              </div>

              {/* KPI Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-3xl bg-slate-900 border border-white/10 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Assinantes Totais</span>
                    <Users className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-black text-white mt-2">
                    {metrics?.totalSubscribers || subscribers.length}
                  </div>
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 font-semibold">
                    <span>{metrics?.activeSubscribers || 0} contas ativas</span>
                  </p>
                </div>

                <div className="p-5 rounded-3xl bg-slate-900 border border-white/10 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Faturamento Mensal</span>
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-white mt-2">
                    R$ {(metrics?.monthlyRevenue || 0).toFixed(2).replace('.', ',')}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-medium">
                    Hoje: R$ {(metrics?.todayRevenue || 0).toFixed(2).replace('.', ',')}
                  </p>
                </div>

                <div 
                  onClick={() => setActiveTab('channel-health')}
                  className="p-5 rounded-3xl bg-slate-900 border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer relative overflow-hidden group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Grade & Sinal</span>
                    <div className="flex items-center gap-1 text-emerald-400">
                      <Activity className="w-4 h-4 group-hover:animate-pulse" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white mt-2 flex items-baseline gap-2">
                    <span>{channels.length}</span>
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Verificar
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-medium group-hover:text-emerald-300 transition-colors flex items-center justify-between">
                    <span>Clique p/ testar quais funcionam</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-300 group-hover:translate-x-0.5 transition-all" />
                  </p>
                </div>

                <div className="p-5 rounded-3xl bg-slate-900 border border-white/10 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">PIX Pendentes</span>
                    <CreditCard className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-white mt-2">
                    {transactions.filter(t => t.status === 'pending').length}
                  </div>
                  <p className="text-[11px] text-amber-400 mt-1 font-medium">
                    Aguardando confirmação
                  </p>
                </div>
              </div>

              {/* Proactive Admin Management Banners */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div 
                  onClick={() => setActiveTab('realtime-metrics')}
                  className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-teal-950/40 border border-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Activity className="w-5 h-5 group-hover:animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-white">Métricas de Uso em Tempo Real</h4>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">Ao Vivo</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Audiência atual, canais mais assistidos e performance do servidor</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-300 group-hover:translate-x-1 transition-all shrink-0" />
                </div>

                <div 
                  onClick={() => setActiveTab('audit-logs')}
                  className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900 to-purple-950/40 border border-indigo-500/20 hover:border-indigo-500/50 transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <Shield className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-white">Logs de Auditoria Administrativa</h4>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">Seguro</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Rastreamento de mudanças em links, pagamentos e usuários</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-300 group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              </div>

              {/* Quick Table Preview: Últimos Assinantes */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">Assinantes Recentes</h3>
                    <p className="text-xs text-slate-400">Clique em "+1 Mês" para liberar acesso imediatamente</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('subscribers')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    <span>Ver todos</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-semibold border-b border-white/10">
                      <tr>
                        <th className="p-3">Assinante</th>
                        <th className="p-3">Plano</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Vencimento</th>
                        <th className="p-3 text-right">Liberar Mês</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {subscribers.slice(0, 4).map(sub => (
                        <tr key={sub.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-3">
                            <span className="font-semibold text-white block">{sub.name}</span>
                            <span className="text-slate-400 text-[11px]">{sub.email}</span>
                          </td>
                          <td className="p-3 text-slate-300">{sub.planName}</td>
                          <td className="p-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              sub.status === 'active' 
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' 
                                : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                            }`}>
                              {sub.status === 'active' ? 'Ativo' : sub.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-300">
                            {new Date(sub.expiresAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleQuickAddMonth(sub.id, sub.name)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition-all"
                            >
                              +1 Mês
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CARD DESTAQUE: BACKUP DO BANCO SQLITE & MONITOR DE URLs */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Banco de Dados SQLite 3 Local</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                          data/maxtv.db
                        </span>
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Todos os canais, assinantes, transações PIX e logs são persistidos localmente. Baixe uma cópia para recuperação ou monitore falhas de links M3U.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadBackup}
                      disabled={isDownloadingDb}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Baixar cópia manual de data/maxtv.db"
                    >
                      {isDownloadingDb ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Baixar Backup (.db)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('url-errors')}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Ver Logs de Erros</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CENTRAL DE LIBERAÇÃO DE MÊS & CORTESIAS (NOVO E DIFERENCIADO) */}
          {activeTab === 'grant-vip' && (
            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-slate-900 border border-emerald-500/30 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Central de Concessão de Acesso VIP</h2>
                    <p className="text-xs text-slate-400">
                      Liberar meses de acesso gratuito, cortesias de teste ou renovação antecipada para usuários
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmitGrant} className="space-y-5 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Seletor de Assinante existente ou Novo */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Selecionar Assinante Cadastrado (Opcional):
                      </label>
                      <select
                        value={grantFormData.subscriberId}
                        onChange={e => {
                          const sub = subscribers.find(s => s.id === e.target.value);
                          if (sub) {
                            setGrantFormData(prev => ({
                              ...prev,
                              subscriberId: sub.id,
                              email: sub.email,
                              name: sub.name
                            }));
                          } else {
                            setGrantFormData(prev => ({ ...prev, subscriberId: '' }));
                          }
                        }}
                        className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">-- Selecionar da lista de usuários ou digitar abaixo --</option>
                        {subscribers.map(sub => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name} ({sub.email}) - Vence em: {new Date(sub.expiresAt).toLocaleDateString('pt-BR')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Ou digitar e-mail diretamente */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        E-mail do Usuário para Concessão: <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="ex: cliente@gmail.com"
                        value={grantFormData.email}
                        onChange={e => setGrantFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Nome do Usuário:
                      </label>
                      <input
                        type="text"
                        placeholder="Nome completo ou apelido"
                        value={grantFormData.name}
                        onChange={e => setGrantFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Motivo da Liberação / Registro ADM:
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Cortesia comercial, ativação manual, pós-venda"
                        value={grantFormData.reason}
                        onChange={e => setGrantFormData(prev => ({ ...prev, reason: e.target.value }))}
                        className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Seletor Rápido de Duração do Mês */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      <span>Escolha o Período a Liberar:</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        { label: '1 Mês (30 dias)', months: 1, days: 30, desc: 'Padrão Mensal' },
                        { label: '2 Meses (60 dias)', months: 2, days: 60, desc: 'Bimestral' },
                        { label: '3 Meses (90 dias)', months: 3, days: 90, desc: 'Trimestral' },
                        { label: '6 Meses (180 dias)', months: 6, days: 180, desc: 'Semestral' },
                        { label: '1 Ano (365 dias)', months: 12, days: 365, desc: 'Anual VIP Master' },
                      ].map(opt => (
                        <button
                          key={opt.months}
                          type="button"
                          onClick={() => setGrantFormData(prev => ({ ...prev, months: opt.months, customDays: 0 }))}
                          className={`p-3.5 rounded-2xl border text-left transition-all ${
                            grantFormData.months === opt.months && grantFormData.customDays === 0
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30'
                              : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-white/10'
                          }`}
                        >
                          <div className="text-xs font-extrabold">{opt.label}</div>
                          <div className="text-[10px] opacity-80 mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resumo da Operação */}
                  <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="text-slate-300">
                      <span className="font-semibold text-emerald-300">Resumo da Ação: </span>
                      O usuário receberá <strong>{grantFormData.months} mês(es)</strong> ({grantFormData.months * 30} dias) de acesso VIP irrestrito.
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirmar Liberação de Meses</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Tabela de Ações Rápidas por Usuário */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Liberação Rápida por Usuário</h3>
                    <p className="text-xs text-slate-400">Clique em "+1 Mês" para estender imediatamente o acesso do cliente</p>
                  </div>

                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou e-mail..."
                      value={subscriberSearch}
                      onChange={e => setSubscriberSearch(e.target.value)}
                      className="w-full bg-slate-950 text-xs text-white placeholder-slate-500 rounded-full pl-9 pr-4 py-2 border border-white/10 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-semibold border-b border-white/10">
                      <tr>
                        <th className="p-4">Assinante</th>
                        <th className="p-4">Plano Atual</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Data Vencimento</th>
                        <th className="p-4 text-right">Ação de Liberação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredSubscribers.map(sub => (
                        <tr key={sub.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4">
                            <span className="font-semibold text-white block">{sub.name}</span>
                            <span className="text-slate-400 text-[11px]">{sub.email}</span>
                          </td>
                          <td className="p-4 text-slate-300 font-medium">{sub.planName}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              sub.status === 'active' 
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' 
                                : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                            }`}>
                              {sub.status === 'active' ? 'Ativo' : sub.status}
                            </span>
                          </td>
                          <td className="p-4 text-slate-300">
                            {new Date(sub.expiresAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleQuickAddMonth(sub.id, sub.name)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                                title="Adicionar +1 Mês (30 dias) agora"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                <span>+1 Mês</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenGrantModal(sub)}
                                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold transition-all"
                              >
                                Personalizar...
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ASSINANTES & CLIENTES (COMPLETO) */}
          {activeTab === 'subscribers' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Pesquisar assinantes..."
                      value={subscriberSearch}
                      onChange={e => setSubscriberSearch(e.target.value)}
                      className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 rounded-full pl-9 pr-4 py-2 border border-white/10 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <select
                    value={subscriberFilter}
                    onChange={e => setSubscriberFilter(e.target.value)}
                    className="bg-slate-900 text-xs text-white rounded-full px-4 py-2 border border-white/10 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="active">Apenas Ativos</option>
                    <option value="pending">Pendentes</option>
                    <option value="blocked">Bloqueados</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenGrantModal()}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    <Gift className="w-4 h-4" />
                    <span>Liberar Mês</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddSubModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Cadastrar Assinante</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-white/10">
                    <tr>
                      <th className="p-4">Assinante</th>
                      <th className="p-4">Plano</th>
                      <th className="p-4">CPF</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Vencimento</th>
                      <th className="p-4 text-right">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredSubscribers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          Nenhum assinante encontrado.
                        </td>
                      </tr>
                    ) : (
                      filteredSubscribers.map(sub => (
                        <tr key={sub.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4">
                            <span className="font-semibold text-white block">{sub.name}</span>
                            <span className="text-slate-400 text-[11px]">{sub.email}</span>
                          </td>
                          <td className="p-4 font-semibold text-slate-300">{sub.planName}</td>
                          <td className="p-4 font-mono text-slate-400">{sub.cpf}</td>
                          <td className="p-4">
                            {sub.status === 'active' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                                Ativo
                              </span>
                            )}
                            {sub.status === 'pending' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-950 text-amber-400 border border-amber-500/40">
                                Pendente
                              </span>
                            )}
                            {sub.status === 'blocked' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-rose-950 text-rose-400 border border-rose-500/40">
                                Bloqueado
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-slate-300">
                            {new Date(sub.expiresAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleQuickAddMonth(sub.id, sub.name)}
                                className="px-3 py-1 rounded-full bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition-colors"
                                title="Adicionar +1 Mês imediatamente"
                              >
                                +1 Mês
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenGrantModal(sub)}
                                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                                title="Conceder meses / cortesia personalizada"
                              >
                                <Gift className="w-3.5 h-3.5 text-amber-400" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleSubStatus(sub.id, sub.status)}
                                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                                title={sub.status === 'active' ? 'Bloquear Assinante' : 'Ativar Assinante'}
                              >
                                {sub.status === 'active' ? <UserX className="w-3.5 h-3.5 text-amber-400" /> : <UserCheck className="w-3.5 h-3.5 text-emerald-400" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSubscriber(sub.id)}
                                className="p-1.5 rounded-full bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400 transition-colors"
                                title="Remover Assinante"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: HISTÓRICO COMPLETO (LIBERAÇÕES & VENDAS PIX) */}
          {(activeTab === 'sales-and-grants' || activeTab === 'grants-history' || activeTab === 'transactions') && (
            <SalesAndGrantsHistory
              grantsHistory={grantsHistory}
              transactions={transactions}
              onApproveTransaction={handleApproveTransaction}
              onOpenGrantModal={() => handleOpenGrantModal()}
              onRefreshData={loadData}
            />
          )}

          {/* TAB 4.5: VERIFICADOR DE SAÚDE DOS CANAIS */}
          {activeTab === 'channel-health' && (
            <ChannelHealthChecker
              channels={channels}
              onPreviewChannel={onPreviewChannel}
              onRefreshChannels={loadData}
            />
          )}

          {/* TAB: SAÚDE DO SERVIDOR (LATÊNCIA, FALHAS 24H E UPTIME DE FONTES COM RECHARTS) */}
          {activeTab === 'server-health' && (
            <ServerHealthDashboard />
          )}

          {/* TAB 4.8: RELATÓRIOS DE CANAIS COM PROBLEMA & LINKS INATIVOS */}
          {activeTab === 'channel-reports' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-rose-400" />
                      <span>Relatórios de Problemas & Links Inativos</span>
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      {channelReports.length} {channelReports.length === 1 ? 'relatório' : 'relatórios'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Histórico de links inativos e conexões lentas (&gt; 10s) reportados diretamente pelos usuários no player.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActiveTab('channel-health')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Abrir Verificador de Sinais</span>
                  </button>

                  {channelReports.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearReports}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar Todos os Relatórios</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stat Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400">Total de Relatórios</span>
                    <p className="text-2xl font-bold text-white mt-1">{channelReports.length}</p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-rose-400/50" />
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400">Excedeu Limite de 10s</span>
                    <p className="text-2xl font-bold text-amber-400 mt-1">
                      {channelReports.filter(r => r.status === 'slow_connection' || (r.latencyMs && r.latencyMs >= 10000) || r.reason.toLowerCase().includes('10')).length}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-amber-400/50" />
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400">Canais Offline / Inativos</span>
                    <p className="text-2xl font-bold text-rose-400 mt-1">
                      {channelReports.filter(r => r.status === 'offline' || r.status === 'error').length}
                    </p>
                  </div>
                  <WifiOff className="w-8 h-8 text-rose-400/50" />
                </div>
              </div>

              {/* Reports Table or Empty State */}
              {channelReports.length === 0 ? (
                <div className="p-12 rounded-3xl bg-slate-900 border border-white/10 text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                  <h4 className="text-base font-bold text-white mb-1">Nenhum Link Inativo Reportado</h4>
                  <p className="text-xs text-slate-400 max-w-md">
                    Nenhum usuário reportou falhas recentemente. Todos os canais monitorados estão operando normalmente.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900 shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-white/10">
                      <tr>
                        <th className="p-4">Canal</th>
                        <th className="p-4">Status / Diagnóstico</th>
                        <th className="p-4">Motivo do Usuário</th>
                        <th className="p-4">Latência</th>
                        <th className="p-4">Data / Usuário</th>
                        <th className="p-4 text-right">Ações Rápidas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {channelReports.map(report => {
                        const targetChannel = channels.find(c => c.id === report.channelId);
                        return (
                          <tr key={report.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                {targetChannel?.logo ? (
                                  <img 
                                    src={targetChannel.logo} 
                                    alt={report.channelName} 
                                    className="w-8 h-8 rounded-lg object-contain bg-slate-950 p-1 border border-white/10" 
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                                    <Tv className="w-4 h-4" />
                                  </div>
                                )}
                                <div>
                                  <span className="font-bold text-white block">{report.channelName}</span>
                                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-xs block">
                                    {report.sourceUrl || targetChannel?.sources[0]?.url || 'URL não informada'}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="p-4">
                              {report.status === 'offline' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-rose-950 text-rose-300 border border-rose-500/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  Canal Offline
                                </span>
                              ) : report.status === 'slow_connection' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-500/40">
                                  <Clock className="w-3 h-3 text-amber-400" />
                                  Lento (&gt; 10s)
                                </span>
                              ) : report.status === 'unstable' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-500/40">
                                  <WifiOff className="w-3 h-3 text-amber-400" />
                                  Sinal Instável
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-rose-950 text-rose-300 border border-rose-500/40">
                                  Erro no Stream
                                </span>
                              )}
                            </td>

                            <td className="p-4 text-slate-300 max-w-xs">
                              <span className="line-clamp-2">{report.reason}</span>
                            </td>

                            <td className="p-4 font-mono">
                              {report.latencyMs ? (
                                <span className={`font-semibold ${report.latencyMs >= 3500 ? 'text-amber-400' : 'text-slate-300'}`}>
                                  {report.latencyMs}ms
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>

                            <td className="p-4">
                              <span className="text-slate-300 block">{new Date(report.timestamp).toLocaleString('pt-BR')}</span>
                              <span className="text-[10px] text-slate-500 block">{report.userEmail}</span>
                            </td>

                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {targetChannel && (
                                  <button
                                    type="button"
                                    onClick={() => onPreviewChannel(targetChannel)}
                                    className="p-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer"
                                    title="Testar este canal no player"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteReport(report.id)}
                                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-white/10 transition-all cursor-pointer"
                                  title="Remover este relatório"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: UNIFICAR & ATUALIZAR LINKS M3U (HUB UNIFICADO) */}
          {(activeTab === 'm3u-sources-unifier' || activeTab === 'unify-m3u' || activeTab === 'repo-sync') && (
            <UnifiedLinksManager
              currentUser={{ name: 'Administrador', email: 'cebolao1302@gmail.com' }}
              onRefreshChannels={async () => {
                try {
                  api.clearChannelsCache();
                  const [cRes, hRes] = await Promise.all([
                    api.getChannels({ forceRefresh: true }),
                    api.getChannelUpdateHistory()
                  ]);
                  if (cRes.channels) setChannels(cRes.channels);
                  if (hRes.success && hRes.lastUpdate) setLastChannelUpdate(hRes.lastUpdate);
                  setHistoryRefreshTrigger(prev => prev + 1);
                } catch {
                  // Handled
                }
              }}
              onNavigateToHistory={() => setActiveTab('channels-history')}
              defaultSubTab={activeTab === 'repo-sync' ? 'repo-sync' : activeTab === 'unify-m3u' ? 'unifier' : 'saved-links'}
            />
          )}

          {/* TAB: VALIDADOR XMLTV (EPG) */}
          {activeTab === 'epg-validator' && (
            <XmltvValidatorManager
              currentUser={{ name: 'Administrador', email: 'cebolao1302@gmail.com' }}
              onRefreshChannels={async () => {
                try {
                  api.clearChannelsCache();
                  const cRes = await api.getChannels({ forceRefresh: true });
                  if (cRes.channels) setChannels(cRes.channels);
                } catch {}
              }}
            />
          )}

          {/* TAB 5: GRADE DE CANAIS */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Pesquisar canais na grade..."
                    value={channelSearch}
                    onChange={e => setChannelSearch(e.target.value)}
                    className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 rounded-full pl-9 pr-4 py-2 border border-white/10 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('channels-config')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 text-xs font-semibold shadow-md shadow-indigo-600/10 transition-all cursor-pointer"
                    title="Editar arquivo de configuração JSON com validação"
                  >
                    <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Editar JSON da Grade</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('channels-history')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-colors cursor-pointer"
                    title="Histórico de atualizações da grade"
                  >
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Histórico de Atualizações</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('channel-health')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Verificar Sinais dos Canais</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncLocalM3u}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sincronizar Listas M3U Locais</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncVod}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-950/70 hover:bg-purple-900/70 text-purple-300 border border-purple-500/40 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5 text-purple-400" />
                    <span>Atualizar Filmes/Séries (M3U)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddChannelModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar Canal</span>
                  </button>
                </div>
              </div>

              {/* Status e Última Atualização da Grade */}
              {lastChannelUpdate && (
                <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border ${
                      lastChannelUpdate.success 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Última Atualização da Grade:</span>
                        <span className="text-xs font-semibold text-slate-300">{lastChannelUpdate.actionName}</span>
                        {lastChannelUpdate.success ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                            <Check className="w-2.5 h-2.5" />
                            Sucesso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/30">
                            <AlertCircle className="w-2.5 h-2.5" />
                            Falha
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-400">
                        <span>{lastChannelUpdate.dateFormatted}</span>
                        <span>•</span>
                        <span>{lastChannelUpdate.channelsCount} canais</span>
                        <span>•</span>
                        <span>por {lastChannelUpdate.author}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('channels-config')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors"
                    >
                      Editar JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('channels-history')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-white/10 transition-colors"
                    >
                      Ver Histórico Completo →
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-white/10">
                    <tr>
                      <th className="p-4">Canal</th>
                      <th className="p-4">Categoria</th>
                      <th className="p-4">Origem</th>
                      <th className="p-4">Acesso</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredChannels.slice(0, 100).map(ch => (
                      <tr key={ch.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img 
                              src={ch.logo} 
                              alt={ch.name} 
                              className="w-8 h-8 rounded-lg object-contain bg-slate-950 p-1 border border-white/10"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div>
                              <span className="font-semibold text-white block">{ch.name}</span>
                              <span className="text-[10px] text-slate-400 truncate max-w-xs block font-mono">
                                {ch.sources[0]?.url || 'Sem URL'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-slate-300">{ch.category}</td>
                        <td className="p-4">
                          {ch.isCustom ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                              Custom ADM
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">
                              Catálogo Oficial
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          {ch.isVipOnly ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-500/30">
                              VIP
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                              Aberto
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditChannel(ch)}
                              className="p-1.5 rounded-full bg-slate-800 hover:bg-indigo-900/60 text-slate-400 hover:text-indigo-300 transition-colors"
                              title="Editar Canal e URL do Stream (com Limpeza de URL)"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreviewChannel(ch)}
                              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                              title="Testar Player"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteChannel(ch.id)}
                              className="p-1.5 rounded-full bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Remover Canal"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: CONFIGURAÇÃO JSON DOS CANAIS */}
          {activeTab === 'channels-config' && (
            <ChannelConfigEditor
              currentUserEmail="cebolao1302@gmail.com"
              onOpenHistory={() => setActiveTab('channels-history')}
              onSaveSuccess={async (count, msg) => {
                showFeedback(msg);
                try {
                  api.clearChannelsCache();
                  const [cRes, hRes] = await Promise.all([
                    api.getChannels({ forceRefresh: true }),
                    api.getChannelUpdateHistory()
                  ]);
                  if (cRes.channels) setChannels(cRes.channels);
                  if (hRes.success && hRes.lastUpdate) setLastChannelUpdate(hRes.lastUpdate);
                  setHistoryRefreshTrigger(prev => prev + 1);
                } catch {
                  // Handled
                }
              }}
            />
          )}

          {/* TAB: HISTÓRICO DE ATUALIZAÇÕES DA GRADE */}
          {activeTab === 'channels-history' && (
            <ChannelUpdateHistory
              onOpenConfigEditor={() => setActiveTab('channels-config')}
              onOpenRepoSync={() => setActiveTab('repo-sync')}
              onTriggerSync={() => handleSyncLocalM3u()}
              refreshTrigger={historyRefreshTrigger}
            />
          )}

          {/* TAB 7: CONFIGURAÇÕES & CHAVES */}
          {activeTab === 'settings' && settings && (
            <div className="space-y-6 max-w-3xl">
              <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 space-y-5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  <span>Configurações do Mercado Pago & Chave PIX</span>
                </h3>

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Chave PIX Oficial (E-mail, CPF, CNPJ ou Aleatória):
                    </label>
                    <input
                      type="text"
                      value={settings.pixKey}
                      onChange={e => setSettings({ ...settings, pixKey: e.target.value })}
                      className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Mercado Pago Access Token:
                    </label>
                    <input
                      type="password"
                      placeholder="APP_USR-..."
                      value={settings.mercadoPagoAccessToken}
                      onChange={e => setSettings({ ...settings, mercadoPagoAccessToken: e.target.value })}
                      className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Aviso Global (Banner de Notificação no Topo):
                    </label>
                    <input
                      type="text"
                      value={settings.announcementText}
                      onChange={e => setSettings({ ...settings, announcementText: e.target.value })}
                      className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* AUTO-UPDATE FREQUENCY M3U8 */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-teal-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-teal-400" />
                        <span className="text-xs font-bold text-white">
                          Intervalo de Auto-Atualização de Fontes M3U8
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('unify-m3u')}
                        className="text-[11px] font-semibold text-teal-400 hover:text-teal-300 hover:underline flex items-center gap-1"
                      >
                        <span>Gerenciar Fontes & Logs</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Define a cada quantas horas o servidor fará requisições automáticas para as listas M3U/M3U8 cadastradas manualmente no banco local SQLite, consolidando novos canais e gerando opções de backup na grade.
                    </p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {[
                        { label: '6h', hours: 6 },
                        { label: '12h', hours: 12 },
                        { label: '24h (Padrão Recomendado)', hours: 24 },
                        { label: '48h (2 dias)', hours: 48 },
                        { label: '72h (3 dias)', hours: 72 }
                      ].map(item => (
                        <button
                          key={item.hours}
                          type="button"
                          onClick={() => setSettings({ ...settings, autoUpdateIntervalHours: item.hours })}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                            (settings.autoUpdateIntervalHours || 24) === item.hours
                              ? 'bg-teal-600 text-white border-teal-400 shadow-md shadow-teal-600/30'
                              : 'bg-slate-900 text-slate-400 border-white/10 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all"
                    >
                      Salvar Configurações
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 8: LOGS DE ERROS DE URLs E BANCO SQLITE */}
          {activeTab === 'url-errors' && (
            <UrlErrorLogsViewer onGoToUnifier={() => setActiveTab('unify-m3u')} />
          )}

          {/* DIAGNÓSTICO DE MEMÓRIA (PERFORMANCE.MEMORY) E STATUS GERAL */}
          <AdminMemoryFooter />

        </main>
      </div>

      {/* MODAL: LIBERAR MÊS / CONCEDER ACESSO VIP */}
      {isGrantModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Liberar Mês / Cortesia VIP</h3>
                  <p className="text-xs text-slate-400">Conceda acesso imediato para o usuário</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGrantModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitGrant} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  E-mail do Usuário: <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="cliente@email.com"
                  value={grantFormData.email}
                  onChange={e => setGrantFormData({ ...grantFormData, email: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nome do Usuário:
                </label>
                <input
                  type="text"
                  placeholder="Nome do cliente"
                  value={grantFormData.name}
                  onChange={e => setGrantFormData({ ...grantFormData, name: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Quantidade de Meses a Liberar:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '1 Mês', months: 1 },
                    { label: '3 Meses', months: 3 },
                    { label: '6 Meses', months: 6 },
                    { label: '1 Ano', months: 12 },
                  ].map(item => (
                    <button
                      key={item.months}
                      type="button"
                      onClick={() => setGrantFormData({ ...grantFormData, months: item.months })}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        grantFormData.months === item.months
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30'
                          : 'bg-slate-950 text-slate-300 border-white/10 hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Motivo da Concessão:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cortesia, compensação, bonificação"
                  value={grantFormData.reason}
                  onChange={e => setGrantFormData({ ...grantFormData, reason: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-2xl px-4 py-3 border border-white/10 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsGrantModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30"
                >
                  Liberar Acesso Agora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO ASSINANTE MANUAL */}
      {isAddSubModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Cadastrar Novo Assinante</h3>
              <button
                type="button"
                onClick={() => setIsAddSubModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubscriber} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newSubData.name}
                  onChange={e => setNewSubData({ ...newSubData, name: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={newSubData.email}
                  onChange={e => setNewSubData({ ...newSubData, email: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">CPF</label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={newSubData.cpf}
                  onChange={e => setNewSubData({ ...newSubData, cpf: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Dias de Validade</label>
                <input
                  type="number"
                  min={1}
                  value={newSubData.days}
                  onChange={e => setNewSubData({ ...newSubData, days: Number(e.target.value) })}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSubModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO CANAL */}
      {isAddChannelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Adicionar Novo Canal Personalizado</h3>
              <button
                type="button"
                onClick={() => setIsAddChannelModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddChannel} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Nome do Canal</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Premiere Clubes FHD"
                  value={newChannelData.name}
                  onChange={e => setNewChannelData({ ...newChannelData, name: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Categoria</label>
                  <select
                    value={newChannelData.category}
                    onChange={e => setNewChannelData({ ...newChannelData, category: e.target.value })}
                    className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                  >
                    <option value="Abertos">Abertos</option>
                    <option value="Esportes">Esportes</option>
                    <option value="Notícias">Notícias</option>
                    <option value="Filmes & Séries">Filmes & Séries</option>
                    <option value="Infantis">Infantis</option>
                    <option value="Documentários">Documentários</option>
                    <option value="Variedades & Música">Variedades & Música</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Tipo de Acesso</label>
                  <select
                    value={newChannelData.isVipOnly ? 'vip' : 'free'}
                    onChange={e => setNewChannelData({ ...newChannelData, isVipOnly: e.target.value === 'vip' })}
                    className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                  >
                    <option value="free">Aberto a Todos</option>
                    <option value="vip">Exclusivo VIP</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300">URL do Stream (HLS .m3u8 ou MPEG-TS .ts)</label>
                  <button
                    type="button"
                    onClick={() => handleCleanStreamUrl(newChannelData.streamUrl, val => setNewChannelData({ ...newChannelData, streamUrl: val }), 'Stream')}
                    className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium transition-colors"
                    title="Remover espaços em branco acidentais e caracteres de controle invisíveis"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Limpar URL</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="https://servidor.com/live/canal/playlist.m3u8"
                    value={newChannelData.streamUrl}
                    onChange={e => setNewChannelData({ ...newChannelData, streamUrl: e.target.value })}
                    onBlur={() => {
                      if (newChannelData.streamUrl) {
                        const cleaned = cleanStreamUrl(newChannelData.streamUrl);
                        if (cleaned !== newChannelData.streamUrl) {
                          setNewChannelData({ ...newChannelData, streamUrl: cleaned });
                          showFeedback('✨ URL de stream limpa automaticamente ao sair do campo.');
                        }
                      }
                    }}
                    className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10 font-mono text-[11px] focus:outline-none focus:border-teal-500 pr-9"
                  />
                  {newChannelData.streamUrl && (
                    <button
                      type="button"
                      onClick={() => handleCleanStreamUrl(newChannelData.streamUrl, val => setNewChannelData({ ...newChannelData, streamUrl: val }), 'Stream')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-300 p-1 transition-colors"
                      title="Higienizar URL agora"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Alerta inteligente de espaços acidentais ou caracteres de controle */}
                {newChannelData.streamUrl && inspectAndCleanUrl(newChannelData.streamUrl).wasModified && (
                  <div className="mt-1.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="truncate">Espaços ou caracteres de controle detectados. Serão removidos ao salvar!</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewChannelData({ ...newChannelData, streamUrl: cleanStreamUrl(newChannelData.streamUrl) })}
                      className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-bold flex-shrink-0"
                    >
                      Limpar Agora
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300">Logo URL</label>
                  {newChannelData.logo && (
                    <button
                      type="button"
                      onClick={() => handleCleanStreamUrl(newChannelData.logo, val => setNewChannelData({ ...newChannelData, logo: val }), 'Logo')}
                      className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
                    >
                      <Wand2 className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="https://exemplo.com/logo.png"
                  value={newChannelData.logo}
                  onChange={e => setNewChannelData({ ...newChannelData, logo: e.target.value })}
                  onBlur={() => {
                    if (newChannelData.logo) {
                      const cleaned = cleanStreamUrl(newChannelData.logo);
                      if (cleaned !== newChannelData.logo) {
                        setNewChannelData({ ...newChannelData, logo: cleaned });
                      }
                    }
                  }}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddChannelModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  Salvar Canal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR CANAL COM LIMPEZA DE URL */}
      {isEditChannelModalOpen && editingChannel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Editar Canal da Grade</h3>
                  <p className="text-xs text-slate-400">Atualize dados e higienize links de stream</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditChannelModalOpen(false);
                  setEditingChannel(null);
                }}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateChannel} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Nome do Canal</label>
                <input
                  type="text"
                  required
                  value={editChannelData.name}
                  onChange={e => setEditChannelData({ ...editChannelData, name: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Categoria</label>
                  <select
                    value={editChannelData.category}
                    onChange={e => setEditChannelData({ ...editChannelData, category: e.target.value })}
                    className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                  >
                    <option value="Abertos">Abertos</option>
                    <option value="Esportes">Esportes</option>
                    <option value="Notícias">Notícias</option>
                    <option value="Filmes & Séries">Filmes & Séries</option>
                    <option value="Infantis">Infantis</option>
                    <option value="Documentários">Documentários</option>
                    <option value="Variedades & Música">Variedades & Música</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Tipo de Acesso</label>
                  <select
                    value={editChannelData.isVipOnly ? 'vip' : 'free'}
                    onChange={e => setEditChannelData({ ...editChannelData, isVipOnly: e.target.value === 'vip' })}
                    className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                  >
                    <option value="free">Aberto a Todos</option>
                    <option value="vip">Exclusivo VIP</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300">URL do Stream (HLS .m3u8 ou MPEG-TS .ts)</label>
                  <button
                    type="button"
                    onClick={() => handleCleanStreamUrl(editChannelData.streamUrl, val => setEditChannelData({ ...editChannelData, streamUrl: val }), 'Stream')}
                    className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium transition-colors"
                    title="Remover espaços em branco e caracteres invisíveis de controle"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Limpar URL</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="https://servidor.com/live/canal/playlist.m3u8"
                    value={editChannelData.streamUrl}
                    onChange={e => setEditChannelData({ ...editChannelData, streamUrl: e.target.value })}
                    onBlur={() => {
                      if (editChannelData.streamUrl) {
                        const cleaned = cleanStreamUrl(editChannelData.streamUrl);
                        if (cleaned !== editChannelData.streamUrl) {
                          setEditChannelData({ ...editChannelData, streamUrl: cleaned });
                          showFeedback('✨ URL de stream limpa automaticamente ao sair do campo.');
                        }
                      }
                    }}
                    className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10 font-mono text-[11px] focus:outline-none focus:border-teal-500 pr-9"
                  />
                  {editChannelData.streamUrl && (
                    <button
                      type="button"
                      onClick={() => handleCleanStreamUrl(editChannelData.streamUrl, val => setEditChannelData({ ...editChannelData, streamUrl: val }), 'Stream')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-300 p-1 transition-colors"
                      title="Higienizar URL agora"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Alerta inteligente de espaços acidentais ou caracteres de controle */}
                {editChannelData.streamUrl && inspectAndCleanUrl(editChannelData.streamUrl).wasModified && (
                  <div className="mt-1.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="truncate">Espaços ou caracteres de controle detectados. Serão removidos ao salvar!</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditChannelData({ ...editChannelData, streamUrl: cleanStreamUrl(editChannelData.streamUrl) })}
                      className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-bold flex-shrink-0"
                    >
                      Limpar Agora
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300">Logo URL</label>
                  {editChannelData.logo && (
                    <button
                      type="button"
                      onClick={() => handleCleanStreamUrl(editChannelData.logo, val => setEditChannelData({ ...editChannelData, logo: val }), 'Logo')}
                      className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
                    >
                      <Wand2 className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="https://exemplo.com/logo.png"
                  value={editChannelData.logo}
                  onChange={e => setEditChannelData({ ...editChannelData, logo: e.target.value })}
                  onBlur={() => {
                    if (editChannelData.logo) {
                      const cleaned = cleanStreamUrl(editChannelData.logo);
                      if (cleaned !== editChannelData.logo) {
                        setEditChannelData({ ...editChannelData, logo: cleaned });
                      }
                    }
                  }}
                  className="w-full bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-white/10"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditChannelModalOpen(false);
                    setEditingChannel(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SINCRONIZAÇÃO DE FILMES E SÉRIES */}
      {isSyncVodModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Sincronização de Filmes & Séries</h3>
                  <p className="text-[11px] text-slate-400">Integração multi-projeto GitHub e catálogo unificado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncVodModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-slate-300 block">Selecione a Fonte do Catálogo</label>

              <div className="space-y-2">
                {/* BANCO SQLITE LOCAL (RECOMENDADO) */}
                <label
                  onClick={() => setVodSyncSource('local')}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                    vodSyncSource === 'local'
                      ? 'bg-purple-950/40 border-purple-500/60 ring-1 ring-purple-500/40'
                      : 'bg-slate-950/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="vodSource"
                    checked={vodSyncSource === 'local'}
                    onChange={() => setVodSyncSource('local')}
                    className="mt-1 accent-purple-500"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Listas VOD do Banco Local SQLite (Recomendado)</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">LOCAL SQLITE</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Atualiza e consolida o catálogo VOD de filmes e séries utilizando as fontes de filmes cadastradas na Central de Links IPTV.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSyncVodModalOpen(false);
                        setActiveTab('m3u-sources-unifier');
                      }}
                      className="mt-2 text-[11px] font-bold text-purple-300 hover:text-white underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>→ Gerenciar ou cadastrar novas listas na Central de Links IPTV</span>
                    </button>
                  </div>
                </label>

                {/* CUSTOM URL */}
                <label
                  onClick={() => setVodSyncSource('custom')}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                    vodSyncSource === 'custom'
                      ? 'bg-purple-950/40 border-purple-500/60 ring-1 ring-purple-500/40'
                      : 'bg-slate-950/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="vodSource"
                    checked={vodSyncSource === 'custom'}
                    onChange={() => setVodSyncSource('custom')}
                    className="mt-1 accent-purple-500"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white">Lista M3U / M3U8 Personalizada</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Cole qualquer link direto de playlist M3U ou M3U8 de filmes/séries para sincronizar.
                    </p>
                    {vodSyncSource === 'custom' && (
                      <input
                        type="url"
                        placeholder="https://exemplo.com/lista-filmes.m3u8"
                        value={customVodUrl}
                        onChange={e => setCustomVodUrl(e.target.value)}
                        className="w-full mt-2 bg-slate-950 text-xs text-white rounded-xl px-3 py-2 border border-purple-500/40 focus:outline-none"
                      />
                    )}
                  </div>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsSyncVodModalOpen(false)}
                  disabled={vodSyncLoading}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSyncVod}
                  disabled={vodSyncLoading}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {vodSyncLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sincronizando Catálogo...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Iniciar Sincronização</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
