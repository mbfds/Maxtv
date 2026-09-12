/**
 * Environment Variables Validation Utility
 * Verifica a existência de variáveis obrigatórias como GEMINI_API_KEY e APP_URL
 * durante a inicialização da aplicação para prevenir falhas de deploy e execução.
 */

export interface EnvValidationReport {
  isValid: boolean;
  checkedAt: string;
  variables: {
    name: string;
    isSet: boolean;
    isRequired: boolean;
    maskedValue?: string;
    description: string;
  }[];
  missingRequired: string[];
  warnings: string[];
}

/**
 * Obtém o valor de uma variável a partir de import.meta.env ou process.env
 */
function getVariable(key: string): string | undefined {
  // 1. Tenta import.meta.env (Vite)
  try {
    const meta = (import.meta as any)?.env;
    if (meta) {
      if (typeof meta[key] === 'string' && meta[key].trim() !== '') return meta[key].trim();
      if (typeof meta[`VITE_${key}`] === 'string' && meta[`VITE_${key}`].trim() !== '') return meta[`VITE_${key}`].trim();
    }
  } catch {}

  // 2. Tenta process.env (Node / SSR / Container)
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (typeof process.env[key] === 'string' && process.env[key]!.trim() !== '') return process.env[key]!.trim();
      if (typeof process.env[`VITE_${key}`] === 'string' && process.env[`VITE_${key}`]!.trim() !== '') return process.env[`VITE_${key}`]!.trim();
    }
  } catch {}

  return undefined;
}

/**
 * Executa a validação das variáveis essenciais de inicialização.
 * Chamada no início do ciclo de vida da aplicação (main.tsx).
 */
export function validateEnv(options: { strict?: boolean } = {}): EnvValidationReport {
  const isProd = getVariable('NODE_ENV') === 'production' || 
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');

  const requiredDefs = [
    {
      name: 'APP_URL',
      required: isProd,
      description: 'URL base pública da aplicação (necessária para rotas absolutas, streams e webhooks)'
    },
    {
      name: 'GEMINI_API_KEY',
      required: false, // Pode ser server-side ou injetada no backend pelo AI Studio
      description: 'Chave da API do Google Gemini para recomendações inteligentes e IA'
    }
  ];

  const optionalDefs = [
    {
      name: 'MERCADOPAGO_ACCESS_TOKEN',
      required: false,
      description: 'Token de integração do Mercado Pago para pagamentos Pix'
    },
    {
      name: 'PORT',
      required: false,
      description: 'Porta do servidor reverso (padrão container 3000)'
    }
  ];

  const missingRequired: string[] = [];
  const warnings: string[] = [];
  const variableStatuses = [];

  for (const def of [...requiredDefs, ...optionalDefs]) {
    let val = getVariable(def.name);

    // Fallback inteligente para APP_URL no navegador se não definida explicitamente
    if (def.name === 'APP_URL' && !val && typeof window !== 'undefined' && window.location?.origin) {
      val = window.location.origin;
    }

    const isSet = Boolean(val && val.length > 0);

    if (def.required && !isSet) {
      missingRequired.push(def.name);
      warnings.push(`[CONFIG ALERTA] Variável obrigatória "${def.name}" ausente. (${def.description})`);
    } else if (!isSet && def.name === 'GEMINI_API_KEY') {
      // Aviso informativo sobre Gemini API Key
      warnings.push(`[INFO] GEMINI_API_KEY não detectada no cliente. Consultas de IA utilizarão proxy no backend /api ou fallback local.`);
    }

    variableStatuses.push({
      name: def.name,
      isSet,
      isRequired: def.required,
      maskedValue: isSet ? (val!.length > 8 ? `${val!.substring(0, 4)}...${val!.substring(val!.length - 4)}` : '***') : undefined,
      description: def.description
    });
  }

  const report: EnvValidationReport = {
    isValid: missingRequired.length === 0,
    checkedAt: new Date().toISOString(),
    variables: variableStatuses,
    missingRequired,
    warnings
  };

  if (!report.isValid) {
    const errorMsg = `[ENV VALIDATION] Atenção: Configurações obrigatórias ausentes: ${missingRequired.join(', ')}`;
    console.warn(errorMsg);
    if (options.strict) {
      throw new Error(errorMsg);
    }
  } else {
    console.info(`[ENV VALIDATION] Variáveis de ambiente validadas com sucesso (${isProd ? 'Produção' : 'Desenvolvimento'}).`);
  }

  return report;
}

export default validateEnv;
