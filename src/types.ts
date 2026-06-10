export interface SayanLocalConfig {
  baseUrl: string;
  token: string;
  useProxy: boolean;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  pass: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  status: 'active' | 'revoked';
  createdAt: string;
  scope: 'all' | 'readonly' | 'reports_only';
  requestCount: number;
}

export interface SayanReportQuery {
  id: string;
  name: string;
  queryText: string;
  description: string;
  category: 'فروش' | 'خرید' | 'مشتریان' | 'حسابداری' | 'انبارداری';
  isCustom: boolean;
  lastExecuted?: string;
  success?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  url: string;
  method: string;
  ip: string;
  status: number;
  responseTime: number;
  error?: string;
  apiKeyName?: string;
  source: 'api-proxy' | 'sql-direct' | 'simulation';
}

export interface SystemStatus {
  dbConnected: boolean;
  proxyConnected: boolean;
  uptime: string;
  totalRequests: number;
  successRate: number;
}
