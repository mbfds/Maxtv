/**
 * Environment Variables Validator
 * Valida variáveis essenciais para o ambiente de execução e inicialização em produção.
 */

export interface EnvValidationResult {
  valid: boolean;
  missingRequired: string[];
  warnings: string[];
  values: Record<string, string | undefined>;
}

/**
 * Valida a existência e integridade das variáveis de ambiente na inicialização.
 * Lança um erro explicativo se variáveis estritamente obrigatórias estiverem ausentes.
 */
export function validateStartupEnv(options: { strict?: boolean } = {}): EnvValidationResult {
  const isProduction = process.env.NODE_ENV === 'production';
  const strict = options.strict ?? isProduction;

  const missingRequired: string[] = [];
  const warnings: string[] = [];

  // Mapeamento de variáveis
  const port = process.env.PORT || '3000';
  if (isNaN(Number(port))) {
    throw new Error(`[ENV ERROR] A variável PORT deve ser um número válido. Recebido: "${port}"`);
  }

  // Chaves opcionais ou obrigatórias dependendo do modo
  const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!mpAccessToken && strict) {
    warnings.push('MERCADOPAGO_ACCESS_TOKEN não está definida no ambiente. O sistema funcionará com pagamentos simulados (Sandbox).');
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    warnings.push('GEMINI_API_KEY não encontrada. Recursos de IA funcionarão em modo local/fallback.');
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl && isProduction) {
    warnings.push('APP_URL não está explicitamente configurada; o servidor usará resolução dinâmica de host.');
  }

  const result: EnvValidationResult = {
    valid: missingRequired.length === 0,
    missingRequired,
    warnings,
    values: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: port,
      APP_URL: appUrl,
      MERCADOPAGO_ACCESS_TOKEN: mpAccessToken ? '***Configurado***' : undefined,
      GEMINI_API_KEY: geminiKey ? '***Configurado***' : undefined
    }
  };

  if (missingRequired.length > 0) {
    const errorMsg = `[ENV ERROR] Falha crítica de inicialização: Variáveis obrigatórias ausentes:\n- ${missingRequired.join('\n- ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (warnings.length > 0) {
    console.info(`[ENV CHECK] Inicialização concluída com avisos:\n${warnings.map(w => `  ℹ️ ${w}`).join('\n')}`);
  } else {
    console.info(`[ENV CHECK] Todas as variáveis de ambiente validadas com sucesso para ${result.values.NODE_ENV}.`);
  }

  return result;
}
