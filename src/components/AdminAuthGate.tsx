import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Mail, AlertCircle, ArrowLeft, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { User } from '../types';
import { api } from '../services/api';
import { adminAuthManager } from '../services/adminAuthManager';

interface AdminAuthGateProps {
  onAdminSuccess: (user: User, token?: string) => void;
  onCancel: () => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  onAdminSuccess,
  onCancel
}) => {
  // Check instant synchronous cache - if already verified or no token exists, don't show loading spinner
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(() => {
    const instant = adminAuthManager.getInstantSession();
    if (instant?.isAuthenticated) return false;
    // Only verify if we actually have a stored admin token to test
    const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('maxtv_admin_token') : null;
    return Boolean(token);
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [email, setEmail] = useState('cebolao1302@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const onAdminSuccessRef = useRef(onAdminSuccess);
  useEffect(() => {
    onAdminSuccessRef.current = onAdminSuccess;
  });

  const hasExecutedRef = useRef(false);

  // Single-promise asynchronous session verification on mount
  useEffect(() => {
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    // 1. Instant check
    const instant = adminAuthManager.getInstantSession();
    if (instant?.isAuthenticated && instant.user) {
      setIsVerifyingSession(false);
      onAdminSuccessRef.current(instant.user, instant.token);
      return;
    }

    // 2. Asynchronous verification through single promise
    let isMounted = true;
    adminAuthManager.verifySession()
      .then((res) => {
        if (!isMounted) return;
        setIsVerifyingSession(false);

        if (res.isAuthenticated && res.user) {
          onAdminSuccessRef.current(res.user, res.token);
        } else if (res.isExpired) {
          setSessionNotice(res.error || 'Sessão administrativa anterior expirada. Digite seu e-mail e senha para continuar.');
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsVerifyingSession(false);
        setSessionNotice('Insira seu e-mail e senha de administrador para acessar o painel.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSessionNotice(null);
    try {
      const res = await api.adminVerify({ email: email.trim(), password: password.trim() });
      if (res.success && res.user) {
        if (res.user.role !== 'admin') {
          throw new Error('Acesso negado: Credenciais válidas, porém este usuário não possui privilégios de administrador.');
        }

        adminAuthManager.setSessionSuccess(res.user, res.token);
        setIsSubmitting(false);
        onAdminSuccessRef.current(res.user, res.token);
      } else {
        setErrorMsg(res.message || 'E-mail ou senha de administrador incorretos.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao autenticar administrador.');
      setIsSubmitting(false);
    }
  };

  // State: One-time verifying existing session on initial load
  if (isVerifyingSession) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-3xl p-8 shadow-2xl shadow-indigo-950/50 text-center space-y-5 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
          
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 mx-auto shadow-inner">
            <Shield className="w-8 h-8 animate-pulse" />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center text-white border-2 border-slate-900">
              <RefreshCw className="w-3 h-3 animate-spin" />
            </span>
          </div>

          <div>
            <h2 className="text-lg font-black text-white tracking-tight mb-1">
              Verificando Sessão Administrativa
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Validando integridade do token de administrador com o servidor...
            </p>
          </div>

          <div className="pt-2">
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/50 relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

        {/* Top Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 mb-2 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Área Administrativa Protegida
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            Acesso restrito exclusivamente ao administrador do sistema. Entre com suas credenciais de acesso.
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-[10px] text-indigo-300 font-medium">
            <Shield className="w-3 h-3 text-indigo-400" />
            <span>Autenticação Segura com E-mail & Senha</span>
          </div>
        </div>

        {/* Session Notice */}
        {sessionNotice && !errorMsg && (
          <div className="p-3 mb-5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{sessionNotice}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 mb-5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form: Email & Password */}
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              E-mail do Administrador
            </label>
            <div className="relative">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu-email@exemplo.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Senha de Acesso
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 transition-colors"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password.trim()}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 mt-3"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Entrar no Painel Administrativo</span>
              </>
            )}
          </button>
        </form>

        {/* Footer cancel button */}
        <div className="pt-5 mt-5 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para a Programação Ao Vivo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
