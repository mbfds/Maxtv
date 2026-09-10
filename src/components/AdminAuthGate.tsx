import React, { useState, useEffect } from 'react';
import { Shield, Lock, KeyRound, AlertCircle, ArrowLeft, CheckCircle2, UserCheck, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { User } from '../types';
import { api, getAdminToken, clearAdminToken } from '../services/api';

interface AdminAuthGateProps {
  onAdminSuccess: (user: User, token?: string) => void;
  onCancel: () => void;
  isAuthenticating?: boolean;
  setIsAuthenticating?: (val: boolean) => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  onAdminSuccess,
  onCancel,
  isAuthenticating: externalIsAuthenticating,
  setIsAuthenticating: externalSetIsAuthenticating
}) => {
  const [internalIsAuthenticating, setInternalIsAuthenticating] = useState<boolean>(() => {
    // Check if sessionStorage already has verified admin or a token exists
    try {
      if (typeof sessionStorage !== 'undefined') {
        const isVerified = sessionStorage.getItem('maxtv_admin_verified') === 'true';
        const token = sessionStorage.getItem('maxtv_admin_token') || getAdminToken();
        const userStr = sessionStorage.getItem('maxtv_admin_user');
        if (isVerified && token && userStr) {
          const user = JSON.parse(userStr);
          if (user.role === 'admin') return false; // Handled synchronously on mount
        }
      }
    } catch {}
    const existingToken = getAdminToken();
    return Boolean(existingToken);
  });

  const isAuthenticating = externalIsAuthenticating !== undefined ? externalIsAuthenticating : internalIsAuthenticating;
  const setIsAuthenticating = (val: boolean) => {
    setInternalIsAuthenticating(val);
    if (externalSetIsAuthenticating) {
      externalSetIsAuthenticating(val);
    }
  };

  const [authMode, setAuthMode] = useState<'pin' | 'credentials'>('pin');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('cebolao1302@gmail.com');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Automated Token / Session Verification on Mount with sessionStorage cache
  useEffect(() => {
    let isMounted = true;

    // 1. Instant check from secure sessionStorage
    try {
      if (typeof sessionStorage !== 'undefined') {
        const isVerified = sessionStorage.getItem('maxtv_admin_verified') === 'true';
        const cachedToken = sessionStorage.getItem('maxtv_admin_token') || getAdminToken();
        const cachedUserStr = sessionStorage.getItem('maxtv_admin_user');
        if (isVerified && cachedToken && cachedUserStr) {
          const cachedUser = JSON.parse(cachedUserStr);
          if (cachedUser.role === 'admin') {
            setIsAuthenticating(false);
            onAdminSuccess(cachedUser, cachedToken);
            return;
          }
        }
      }
    } catch {}

    // 2. If token exists, verify with server
    const checkCurrentSession = async () => {
      const token = getAdminToken();
      if (!token) {
        if (isMounted) setIsAuthenticating(false);
        return;
      }

      setIsAuthenticating(true);
      try {
        const res = await api.verifyAdminSession(token);
        if (!isMounted) return;

        if (res.valid && res.user && res.user.role === 'admin') {
          // Cache verified status securely in sessionStorage
          try {
            sessionStorage.setItem('maxtv_admin_verified', 'true');
            sessionStorage.setItem('maxtv_admin_token', token);
            sessionStorage.setItem('maxtv_admin_user', JSON.stringify(res.user));
          } catch {}

          setIsAuthenticating(false);
          onAdminSuccess(res.user, token);
          return;
        }

        // Token was invalid or user is not an admin
        clearAdminToken();
        try {
          sessionStorage.removeItem('maxtv_admin_verified');
          sessionStorage.removeItem('maxtv_admin_token');
          sessionStorage.removeItem('maxtv_admin_user');
        } catch {}
        setSessionNotice('Sessão administrativa expirada ou não autorizada. Digite o PIN Master para revalidar seu acesso.');
      } catch (err: any) {
        if (!isMounted) return;
        clearAdminToken();
        try {
          sessionStorage.removeItem('maxtv_admin_verified');
          sessionStorage.removeItem('maxtv_admin_token');
          sessionStorage.removeItem('maxtv_admin_user');
        } catch {}
        setSessionNotice('Não foi possível validar sua sessão anterior. Por favor, autentique-se novamente.');
      } finally {
        if (isMounted) {
          setIsAuthenticating(false);
        }
      }
    };

    checkCurrentSession();

    return () => {
      isMounted = false;
    };
  }, [onAdminSuccess]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;

    setIsAuthenticating(true);
    setErrorMsg('');
    setSessionNotice(null);
    try {
      const res = await api.adminVerify({ pin: pin.trim() });
      if (res.success && res.user) {
        if (res.user.role !== 'admin') {
          throw new Error('Acesso negado: Usuário autenticado não possui o papel (role) de administrador.');
        }
        // Save to secure sessionStorage and API token
        try {
          sessionStorage.setItem('maxtv_admin_verified', 'true');
          sessionStorage.setItem('maxtv_admin_token', res.token || '');
          sessionStorage.setItem('maxtv_admin_user', JSON.stringify(res.user));
        } catch {}

        setIsAuthenticating(false);
        onAdminSuccess(res.user, res.token);
      } else {
        setErrorMsg(res.message || 'PIN de administrador inválido.');
        setIsAuthenticating(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'PIN incorreto. Tente novamente.');
      setIsAuthenticating(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsAuthenticating(true);
    setErrorMsg('');
    setSessionNotice(null);
    try {
      const res = await api.adminVerify({ email: email.trim(), password: password.trim() });
      if (res.success && res.user) {
        if (res.user.role !== 'admin') {
          throw new Error('Acesso negado: Credenciais válidas, mas o usuário não possui a role de administrador.');
        }
        // Save to secure sessionStorage and API token
        try {
          sessionStorage.setItem('maxtv_admin_verified', 'true');
          sessionStorage.setItem('maxtv_admin_token', res.token || '');
          sessionStorage.setItem('maxtv_admin_user', JSON.stringify(res.user));
        } catch {}

        setIsAuthenticating(false);
        onAdminSuccess(res.user, res.token);
      } else {
        setErrorMsg(res.message || 'Credenciais de administrador inválidas.');
        setIsAuthenticating(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'E-mail ou senha de administrador incorretos.');
      setIsAuthenticating(false);
    }
  };

  // State: Authenticating / checking existing session
  if (isAuthenticating) {
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
              Validando integridade criptográfica do token e permissões de acesso (RBAC) com o servidor...
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
            O Painel de Controle e Gestão é restrito exclusivamente a contas com o papel (<span className="text-indigo-300 font-mono font-semibold">role: 'admin'</span>).
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-[10px] text-indigo-300 font-medium">
            <Shield className="w-3 h-3 text-indigo-400" />
            <span>Validação Criptográfica Ativa</span>
          </div>
        </div>

        {/* Session Expired / Notice */}
        {sessionNotice && !errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{sessionNotice}</span>
          </div>
        )}

        {/* Mode Selector */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => { setAuthMode('pin'); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMode === 'pin'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Acesso Master (PIN)</span>
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('credentials'); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMode === 'credentials'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Login de Admin</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form: PIN Master */}
        {authMode === 'pin' && (
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Digite o PIN Master ou Senha de Administrador
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Ex: 1302 ou admin123"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-lg tracking-widest text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                PINs autorizados: <code className="text-indigo-300 font-mono">1302</code> ou <code className="text-indigo-300 font-mono">admin123</code>
              </p>
            </div>

            <button
              type="submit"
              disabled={isAuthenticating || !pin.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isAuthenticating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Autenticando Acesso...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Validar e Entrar no Painel</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Form: Email & Password */}
        {authMode === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                E-mail do Administrador
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@maxtv.vip"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Senha de Administrador
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating || !password.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 mt-2"
            >
              {isAuthenticating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando Administrador...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Entrar como Administrador</span>
                </>
              )}
            </button>
          </form>
        )}

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
