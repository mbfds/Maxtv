import React, { useState, useEffect, useCallback } from 'react';
import { 
  User as UserIcon, 
  Crown, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Receipt, 
  CreditCard, 
  Calendar, 
  ShieldCheck, 
  QrCode, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  LogOut, 
  ArrowUpRight, 
  Tv, 
  Lock,
  ChevronRight,
  Zap
} from 'lucide-react';
import { User, Subscriber, PixTransaction, SubscriptionPlan, NavigationTab } from '../types';
import { api } from '../services/api';

interface UserProfileViewProps {
  currentUser: User;
  authToken?: string;
  currentSubscriber: Subscriber | null;
  onUpdateSubscriber?: (sub: Subscriber) => void;
  onOpenCheckout: (plan?: SubscriptionPlan) => void;
  onLogout: () => void;
  onNavigateToTab: (tab: NavigationTab) => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  currentUser,
  authToken,
  currentSubscriber: initialSubscriber,
  onUpdateSubscriber,
  onOpenCheckout,
  onLogout,
  onNavigateToTab,
}) => {
  // Sub-views disponíveis dentro do perfil
  const [activeSubView, setActiveSubView] = useState<'mercadopago' | 'account'>('mercadopago');

  // Estado dos dados de Assinante e Transações Mercado Pago
  const [subscriber, setSubscriber] = useState<Subscriber | null>(initialSubscriber);
  const [transactions, setTransactions] = useState<PixTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal de visualização de QR Code Pix pendente
  const [selectedPendingTx, setSelectedPendingTx] = useState<PixTransaction | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);

  // Carrega histórico e dados do assinante via API Mercado Pago
  const fetchSubscriptionData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await api.getUserSubscription(authToken, currentUser.email);
      if (res.success) {
        if (res.subscriber) {
          setSubscriber(res.subscriber);
          if (onUpdateSubscriber) {
            onUpdateSubscriber(res.subscriber);
          }
          try {
            localStorage.setItem('maxtv_subscriber', JSON.stringify(res.subscriber));
          } catch {}
        }
        if (Array.isArray(res.transactions)) {
          setTransactions(res.transactions);
        }
      }
    } catch (err: any) {
      console.warn('Erro ao obter dados de assinatura Mercado Pago:', err);
      // Fallback para assinante existente no estado
      if (initialSubscriber) {
        setSubscriber(initialSubscriber);
      }
      setError('Não foi possível carregar os dados atualizados do Mercado Pago no momento.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authToken, currentUser.email, initialSubscriber, onUpdateSubscriber]);

  useEffect(() => {
    fetchSubscriptionData();
  }, [fetchSubscriptionData]);

  // Simulação de pagamento para testes
  const handleSimulatePayment = async (txId: string) => {
    setSimulatingId(txId);
    try {
      const res = await api.simulatePixPayment(txId);
      if (res.success) {
        if (res.subscriber) {
          setSubscriber(res.subscriber);
          if (onUpdateSubscriber) onUpdateSubscriber(res.subscriber);
          try {
            localStorage.setItem('maxtv_subscriber', JSON.stringify(res.subscriber));
          } catch {}
        }
        // Atualiza a transação localmente
        setTransactions(prev =>
          prev.map(t => (t.id === txId ? { ...t, status: 'approved', approvedAt: new Date().toISOString() } : t))
        );
        setSelectedPendingTx(null);
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao simular aprovação do Pix.');
    } finally {
      setSimulatingId(null);
    }
  };

  const copyPixText = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Cálculo de dias restantes da assinatura
  const daysRemaining = (() => {
    const expDate = subscriber?.expiresAt || currentUser.expiresAt;
    if (!expDate) return null;
    const diff = new Date(expDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();

  const isVipActive = subscriber?.status === 'active' || currentUser.vipStatus === 'active';

  return (
    <div id="user-profile-view" className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-fadeIn">
      {/* Cabeçalho do Perfil */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 border-2 border-white/20 flex items-center justify-center text-white text-2xl sm:text-3xl font-black shadow-lg shadow-indigo-500/20">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {currentUser.name}
                </h1>
                {isVipActive ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-sm">
                    <Crown className="w-3.5 h-3.5 text-amber-300" />
                    Assinante VIP Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-white/10 text-slate-300 text-xs font-semibold">
                    Conta Grátis (Degustação)
                  </span>
                )}
                {currentUser.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1">{currentUser.email}</p>
              {subscriber?.cpf && (
                <p className="text-xs text-slate-500 font-mono mt-0.5">CPF: {subscriber.cpf}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {!isVipActive ? (
              <button
                id="btn-profile-subscribe-vip"
                type="button"
                onClick={() => onOpenCheckout()}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <Crown className="w-4 h-4 text-slate-950" />
                <span>Assinar VIP R$ 10,00</span>
              </button>
            ) : (
              <button
                id="btn-profile-renew"
                type="button"
                onClick={() => onOpenCheckout()}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>Renovar / Mudar Plano</span>
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-red-950/40 text-slate-300 hover:text-red-300 border border-white/10 hover:border-red-500/30 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              title="Encerrar sessão na conta"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Barra de Navegação entre Sub-views do Perfil */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-white/10">
          <button
            id="subview-tab-mercadopago"
            type="button"
            onClick={() => setActiveSubView('mercadopago')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
              activeSubView === 'mercadopago'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Assinaturas & Mercado Pago</span>
            {transactions.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-mono">
                {transactions.length}
              </span>
            )}
          </button>

          <button
            id="subview-tab-account"
            type="button"
            onClick={() => setActiveSubView('account')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
              activeSubView === 'account'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Dados da Conta</span>
          </button>

          <button
            type="button"
            onClick={() => fetchSubscriptionData(true)}
            disabled={refreshing}
            className="ml-auto p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title="Sincronizar com Mercado Pago"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: ASSINATURAS & HISTÓRICO DE TRANSAÇÕES MERCADO PAGO          */}
      {/* ========================================================================= */}
      {activeSubView === 'mercadopago' && (
        <div id="subview-mercadopago-container" className="space-y-6 animate-fadeIn">
          {/* Card Principal: Status Atual da Assinatura via Objeto Subscriber */}
          <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">Status Atual da Assinatura</h2>
                  <p className="text-xs text-slate-400">Dados integrados via gateway Mercado Pago Pix</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {subscriber ? (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      subscriber.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                        : subscriber.status === 'pending'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                        : subscriber.status === 'expired'
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-slate-700/50 text-slate-300 border-slate-600'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        subscriber.status === 'active'
                          ? 'bg-emerald-400'
                          : subscriber.status === 'pending'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                      }`}
                    />
                    {subscriber.status === 'active'
                      ? 'Ativa'
                      : subscriber.status === 'pending'
                      ? 'Aguardando Pagamento'
                      : subscriber.status === 'expired'
                      ? 'Expirada'
                      : 'Bloqueada'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-white/10">
                    Sem Assinatura Ativa
                  </span>
                )}
              </div>
            </div>

            {/* Grid de Informações do Objeto Subscriber */}
            {subscriber ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Nome do Plano */}
                <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">Plano Atual</span>
                  <p className="text-sm sm:text-base font-bold text-white truncate">
                    {subscriber.planName || 'MAXTV VIP'}
                  </p>
                  <span className="text-[11px] text-indigo-400 font-mono">
                    ID: {subscriber.planId || 'plan_monthly'}
                  </span>
                </div>

                {/* 2. Valor Pago */}
                <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">Valor do Plano</span>
                  <p className="text-sm sm:text-base font-bold text-emerald-400">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      subscriber.amountPaid || 10
                    )}
                  </p>
                  <span className="text-[11px] text-slate-500">1 dispositivo simultâneo</span>
                </div>

                {/* 3. Início da Assinatura */}
                <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">Início da Assinatura</span>
                  <p className="text-sm sm:text-base font-bold text-slate-200">
                    {subscriber.startDate
                      ? new Date(subscriber.startDate).toLocaleDateString('pt-BR')
                      : 'Data não informada'}
                  </p>
                  <span className="text-[11px] text-slate-500">Liberação instantânea Pix</span>
                </div>

                {/* 4. Vencimento e Dias Restantes */}
                <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">Data de Vencimento</span>
                  <p className="text-sm sm:text-base font-bold text-white">
                    {subscriber.expiresAt
                      ? new Date(subscriber.expiresAt).toLocaleDateString('pt-BR')
                      : 'Indeterminado'}
                  </p>
                  {daysRemaining !== null && (
                    <span
                      className={`text-[11px] font-semibold block mt-0.5 ${
                        daysRemaining > 5
                          ? 'text-emerald-400'
                          : daysRemaining > 0
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {daysRemaining > 0
                        ? `Restam ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}`
                        : 'Assinatura vencida'}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-950/50 rounded-2xl border border-dashed border-white/10 p-6">
                <Crown className="w-12 h-12 text-amber-400/60 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Você ainda não possui uma assinatura ativa</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mb-5 leading-relaxed">
                  Desbloqueie agora mais de 1.000 canais ao vivo, filmes e séries em alta definição via Pix com aprovação imediata do Mercado Pago.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenCheckout()}
                  className="px-6 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-xl active:scale-95 transition-all cursor-pointer"
                >
                  Ver Planos e Assinar por R$ 10,00
                </button>
              </div>
            )}

            {/* Metadados Técnicos de Assinante (ID e Último Pagamento Mercado Pago) */}
            {subscriber && (
              <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span>ID Assinante: <strong className="text-slate-300">{subscriber.id}</strong></span>
                  {subscriber.lastPaymentId && (
                    <span>Último Pagamento MP: <strong className="text-indigo-300">{subscriber.lastPaymentId}</strong></span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCheckout()}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Gerenciar Renovação</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Seção de Histórico de Transações Mercado Pago */}
          <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Histórico de Transações Mercado Pago</h3>
                  <p className="text-xs text-slate-400">Registros de cobranças, pedidos e comprovantes Pix emitidos</p>
                </div>
              </div>

              <span className="text-xs text-slate-400 font-medium">
                {transactions.length} transaç{transactions.length === 1 ? 'ão' : 'ões'}
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs">Consultando transações do Mercado Pago...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-white/5 p-6">
                <Receipt className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-white mb-1">Nenhuma transação registrada até o momento</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Quando você gerar um Pix para assinar ou renovar um plano, o comprovante e status aparecerão aqui em tempo real.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenCheckout()}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                >
                  Gerar Primeiro Pix
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Identificador</th>
                      <th className="py-3 px-4">Plano</th>
                      <th className="py-3 px-4">Valor</th>
                      <th className="py-3 px-4">Data / Horário</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors group">
                        {/* ID da Transação e OrderId */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-white text-xs">{tx.id}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{tx.orderId}</div>
                        </td>

                        {/* Plano */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200">{tx.planName}</div>
                          <div className="text-[10px] text-indigo-400 font-mono">
                            {tx.mpPaymentId ? `MP ID: ${tx.mpPaymentId}` : 'Pix Instantâneo'}
                          </div>
                        </td>

                        {/* Valor */}
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                        </td>

                        {/* Data */}
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          <div>{new Date(tx.createdAt).toLocaleDateString('pt-BR')}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(tx.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              tx.status === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : tx.status === 'pending'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                : tx.status === 'rejected'
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : 'bg-slate-700 text-slate-300 border-slate-600'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                tx.status === 'approved'
                                  ? 'bg-emerald-400'
                                  : tx.status === 'pending'
                                  ? 'bg-amber-400'
                                  : 'bg-red-400'
                              }`}
                            />
                            {tx.status === 'approved'
                              ? 'Aprovado'
                              : tx.status === 'pending'
                              ? 'Pendente'
                              : tx.status === 'rejected'
                              ? 'Rejeitado'
                              : 'Cancelado'}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right">
                          {tx.status === 'pending' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedPendingTx(tx)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow-sm transition-all cursor-pointer flex items-center gap-1"
                                title="Visualizar QR Code Pix para pagamento"
                              >
                                <QrCode className="w-3 h-3" />
                                <span>Pagar Pix</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSimulatePayment(tx.id)}
                                disabled={simulatingId === tx.id}
                                className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-semibold text-[10px] transition-all cursor-pointer"
                                title="Simular aprovação imediata do Pix para testes"
                              >
                                {simulatingId === tx.id ? 'Aprovando...' : 'Simular'}
                              </button>
                            </div>
                          ) : tx.status === 'approved' ? (
                            <span className="text-[11px] text-emerald-400 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Liberado</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: DADOS PESSOAIS & SEGURANÇA DA CONTA                          */}
      {/* ========================================================================= */}
      {activeSubView === 'account' && (
        <div id="subview-account-container" className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 sm:p-8 shadow-xl backdrop-blur-md space-y-6 animate-fadeIn">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Dados da Conta</h2>
              <p className="text-xs text-slate-400">Informações do seu perfil na plataforma MAXTV</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Nome Completo</span>
              <p className="text-sm font-bold text-white">{currentUser.name}</p>
            </div>

            <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
              <span className="text-xs text-slate-400 block mb-1">E-mail Cadastrado</span>
              <p className="text-sm font-bold text-white">{currentUser.email}</p>
            </div>

            <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
              <span className="text-xs text-slate-400 block mb-1">CPF (Mercado Pago)</span>
              <p className="text-sm font-bold text-white font-mono">
                {currentUser.cpf || subscriber?.cpf || 'Não informado'}
              </p>
            </div>

            <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Tipo de Acesso</span>
              <p className="text-sm font-bold text-indigo-400 uppercase">
                {currentUser.role === 'admin' ? 'Administrador do Sistema' : 'Assinante / Cliente'}
              </p>
            </div>

            <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Data de Cadastro</span>
              <p className="text-sm font-bold text-slate-200">
                {currentUser.createdAt
                  ? new Date(currentUser.createdAt).toLocaleDateString('pt-BR')
                  : 'Recentemente'}
              </p>
            </div>

            <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Limite de Dispositivos</span>
              <p className="text-sm font-bold text-emerald-400">
                1 Tela Simultânea Exclusiva (Anti-Travamento)
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigateToTab('live')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer"
            >
              <Tv className="w-4 h-4" />
              <span>Voltar aos Canais Ao Vivo</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VISUALIZAÇÃO DE QR CODE PIX PENDENTE DO MERCADO PAGO               */}
      {/* ========================================================================= */}
      {selectedPendingTx && (
        <div
          id="modal-pending-pix-qr"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedPendingTx(null)}
        >
          <div
            className="w-full max-w-md bg-slate-950 border border-white/15 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-left">
                <QrCode className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Pagamento Pix Mercado Pago</h3>
                  <p className="text-[11px] text-slate-400">{selectedPendingTx.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPendingTx(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-white p-4 rounded-2xl w-56 h-56 mx-auto flex items-center justify-center shadow-lg">
              {selectedPendingTx.qrCodeBase64 ? (
                <img
                  src={selectedPendingTx.qrCodeBase64}
                  alt="QR Code Pix"
                  className="w-full h-full object-contain"
                />
              ) : (
                <QrCode className="w-32 h-32 text-slate-800" />
              )}
            </div>

            <div>
              <p className="text-xs text-slate-400">Valor do Pedido:</p>
              <p className="text-xl font-black text-emerald-400">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  selectedPendingTx.amount
                )}
              </p>
              <p className="text-[11px] text-amber-300 mt-1">
                Expira em 30 minutos. A liberação do sinal ocorre em menos de 5 segundos após a transferência.
              </p>
            </div>

            {selectedPendingTx.qrCodeText && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => copyPixText(selectedPendingTx.qrCodeText)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Código Pix Copiado!' : 'Copiar Código Pix Copia e Cola'}</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleSimulatePayment(selectedPendingTx.id)}
                disabled={simulatingId === selectedPendingTx.id}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
              >
                {simulatingId === selectedPendingTx.id ? 'Aprovando...' : 'Simular Aprovação (Ambiente de Teste)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
