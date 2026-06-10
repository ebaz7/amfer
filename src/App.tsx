import React, { useState, useEffect } from "react";
import { 
  Database, 
  Key, 
  Terminal, 
  Settings, 
  HelpCircle, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Clock, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Shield, 
  Play, 
  Search, 
  AlertCircle, 
  Server, 
  UserCheck, 
  Code,
  Lock,
  Smartphone,
  Car,
  TrendingUp,
  Cpu
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  SystemStatus, 
  DatabaseConfig, 
  SayanLocalConfig, 
  ApiKey, 
  SayanReportQuery, 
  LogEntry 
} from "./types.ts";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab ] = useState<"dashboard" | "keys" | "playground" | "config" | "installer">("dashboard");

  // State
  const [status, setStatus] = useState<SystemStatus>({
    dbConnected: false,
    proxyConnected: false,
    uptime: "0",
    totalRequests: 0,
    successRate: 100
  });

  const [dbConfig, setDbConfig] = useState<DatabaseConfig>({
    host: "localhost",
    port: 1433,
    database: "SayanAccDB",
    user: "sa",
    pass: "",
    encrypt: false,
    trustServerCertificate: true
  });

  const [localConfig, setLocalConfig] = useState<SayanLocalConfig>({
    baseUrl: "http://localhost:5000/api/v1",
    token: "Bearer ...",
    useProxy: true
  });

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [queries, setQueries] = useState<SayanReportQuery[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // UI actions state
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState<"all" | "readonly" | "reports_only">("all");
  const [queryConsole, setQueryConsole] = useState("SELECT * FROM tblCustomer WHERE CurrentBalance > 100000000;");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [forceReal, setForceReal] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Discovery State for MSSQL
  const [discoveryData, setDiscoveryData] = useState<{
    success: boolean;
    currentDb: string;
    databases: string[];
    tables: string[];
    error?: string;
  } | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  // Helper to fetch JSON safely verifying content type to prevent non-JSON/HTML crashes
  const fetchJson = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await res.json();
      }
      return null;
    } catch (e) {
      console.warn(`Safe fetch failed for ${url}:`, e);
      return null;
    }
  };

  const fetchDiscovery = async () => {
    setDiscoveryLoading(true);
    try {
      const data = await fetchJson("/api/gateway/discover");
      if (data) {
        setDiscoveryData(data);
      }
    } catch (e) {
      console.error("Error fetching discovery metadata", e);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  // New Custom Query Form
  const [newQueryName, setNewQueryName] = useState("");
  const [newQueryText, setNewQueryText] = useState("");
  const [newQueryDesc, setNewQueryDesc] = useState("");
  const [newQueryCat, setNewQueryCat] = useState<'فروش' | 'خرید' | 'مشتریان' | 'حسابداری' | 'انبارداری'>("فروش");

  // Fetch all initial data
  const loadAllData = async () => {
    setRefreshing(true);
    try {
      // Fetch Status
      const statusData = await fetchJson("/api/gateway/status");
      let currentDbConnected = false;
      if (statusData) {
        currentDbConnected = statusData.dbConnected;
        // convert uptime to readable
        const hours = Math.floor(statusData.uptime / 3600);
        const mins = Math.floor((statusData.uptime % 3600) / 60);
        const secs = Math.floor(statusData.uptime % 60);
        setStatus({
          dbConnected: statusData.dbConnected,
          proxyConnected: statusData.proxyConnected,
          uptime: `${hours}h ${mins}m ${secs}s`,
          totalRequests: statusData.totalRequests,
          successRate: statusData.successRate
        });
      }

      if (currentDbConnected) {
        await fetchDiscovery();
      } else {
        setDiscoveryData(null);
      }

      // Fetch Config
      const configData = await fetchJson("/api/gateway/config");
      if (configData) {
        setDbConfig(configData.dbConfig);
        setLocalConfig(configData.localConfig);
      }

      // Fetch Keys
      const keysData = await fetchJson("/api/gateway/keys");
      if (keysData) {
        setApiKeys(keysData);
      }

      // Fetch Queries
      const queriesData = await fetchJson("/api/gateway/queries");
      if (queriesData) {
        setQueries(queriesData);
      }

      // Fetch Logs
      const logsData = await fetchJson("/api/gateway/logs");
      if (logsData) {
        setLogs(logsData);
      }

    } catch (e) {
      console.error("Error communicating with gateway APIs", e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
    // Auto refresh status every 15 seconds
    const interval = setInterval(loadAllData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveConfigs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/gateway/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbConfig, localConfig })
      });
      
      const resData = await res.json();
      if (resData.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 4000);
        loadAllData();
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      setSaveStatus("error");
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/gateway/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName, scope: newKeyScope })
      });
      if (res.ok) {
        setNewKeyName("");
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!confirm("آیا از حذف این کلید دسترسی مطمئن هستید؟ تراکنش‌های با این کلید متوقف خواهند شد.")) return;
    try {
      const res = await fetch(`/api/gateway/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleApiKey = async (id: string) => {
    try {
      const res = await fetch(`/api/gateway/keys/${id}/toggle`, { method: "PUT" });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddNewQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQueryName || !newQueryText) return;

    try {
      const res = await fetch("/api/gateway/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newQueryName,
          queryText: newQueryText,
          description: newQueryDesc,
          category: newQueryCat
        })
      });
      if (res.ok) {
        setNewQueryName("");
        setNewQueryText("");
        setNewQueryDesc("");
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteQuery = async (id: string) => {
    if (!confirm("آیا از حذف این گزارش مطمئن هستید؟")) return;
    try {
      const res = await fetch(`/api/gateway/queries/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const clearGatewayLogs = async () => {
    if (!confirm("آیا مایل به پاک کردن کامل لاگ تراکنش‌ها هستید؟")) return;
    try {
      const res = await fetch("/api/gateway/logs/clear", { method: "POST" });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunTestQuery = async () => {
    if (!queryConsole.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const res = await fetch("/api/gateway/query/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryText: queryConsole, forceRealConnection: forceReal })
      });
      const data = await res.json();
      setQueryResult(data);
    } catch (e) {
      setQueryResult({ success: false, error: "امکان ارتباط با وب‌سرور مدیریت واسط برقرار نشد." });
    } finally {
      setQueryLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'key' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2500);
    } else {
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7] font-sans antialiased selection:bg-blue-600 selection:text-white pb-12" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }} dir="rtl">
      {/* Top Elegant Background Blur Glow */}
      <div className="absolute top-0 right-0 left-0 h-96 bg-gradient-to-b from-blue-600/5 via-transparent to-transparent pointer-events-none -z-10" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        
        {/* App Branding & Header */}
        <header className="flex flex-col md:flex-row items-center justify-between border-b border-[#27272a] pb-5 mb-6 gap-4 bg-[#18181b] p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-md">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#27272a] text-[#a1a1aa] border border-[#27272a] rounded text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  سرویس میانی پل ارتباطی
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">درگاه API سایان</span>
              </div>
              <h1 id="app-title" className="text-xl font-semibold tracking-tight text-white mt-1">
                درگاه واسط و کنترل پنل سایان (Sayan Bridge)
              </h1>
              <p className="text-[11px] text-[#a1a1aa] mt-0.5">
                اتصال و دریافت گزارش‌های دوره حسابداری SQL Server و وب‌سرویس داخلی به اپلیکیشن‌های دیگر
              </p>
            </div>
          </div>

          {/* Quick Connection Badges and Refresh */}
          <div className="flex items-center gap-2.5">
            <button 
              onClick={loadAllData} 
              disabled={refreshing}
              className="p-2 bg-[#27272a] hover:bg-[#18181b] hover:text-white disabled:opacity-50 text-[#a1a1aa] rounded border border-[#27272a] transition duration-150 relative cursor-pointer"
              title="بروزرسانی وضعیت"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* DB Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-mono ${
              status.dbConnected 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}>
              <Database className="w-3.5 h-3.5" />
              <span>SQL: {status.dbConnected ? 'متصل' : 'شبیه‌ساز فعال'}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dbConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            </div>

            {/* Proxy URL state */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#18181b] border border-[#27272a] text-blue-400 text-xs font-mono">
              <Activity className="w-3.5 h-3.5" />
              <span>پراکسی: فعال</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            </div>
          </div>
        </header>

        {/* Tab Navigation Menu */}
        <nav className="flex flex-wrap gap-1.5 border-b border-[#27272a] pb-3 mb-6">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition duration-150 cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-[#27272a] text-white border border-[#27272a] shadow-sm"
                : "text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#e4e4e7]"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span>پیش‌خوان و مانیتورینگ</span>
          </button>
          
          <button
            onClick={() => setActiveTab("playground")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition duration-150 cursor-pointer ${
              activeTab === "playground"
                ? "bg-[#27272a] text-white border border-[#27272a] shadow-sm"
                : "text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#e4e4e7]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-blue-500" />
            <span>کنسول کوئری SQL</span>
          </button>

          <button
            onClick={() => setActiveTab("keys")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition duration-150 cursor-pointer ${
              activeTab === "keys"
                ? "bg-[#27272a] text-white border border-[#27272a] shadow-sm"
                : "text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#e4e4e7]"
            }`}
          >
            <Key className="w-3.5 h-3.5 text-blue-500" />
            <span>کلیدهای API و مستندات اتصال</span>
          </button>

          <button
            onClick={() => setActiveTab("config")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition duration-150 cursor-pointer ${
              activeTab === "config"
                ? "bg-[#27272a] text-white border border-[#27272a] shadow-sm"
                : "text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#e4e4e7]"
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-blue-500" />
            <span>تنظیمات سرور و اتصال</span>
          </button>

          <button
            onClick={() => setActiveTab("installer")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition duration-150 cursor-pointer mr-auto ${
              activeTab === "installer"
                ? "bg-[#27272a] text-emerald-400 border border-emerald-500/20 shadow-sm"
                : "text-emerald-400 hover:bg-emerald-950/15"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>آموزش نصب روی سرور (CMD Setup)</span>
          </button>
        </nav>

        {/* Outer Tab Container with Animations */}
        <div className="relative">
          <AnimatePresence mode="wait">
            
            {/* ======= TAB 1: DASHBOARD OVERVIEW ======= */}
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 text-xs"
              >
                {/* Stats Cards Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  
                  <div className="bg-[#18181b] p-4 rounded-xl border border-[#27272a] flex items-center justify-between">
                    <div>
                      <span className="text-[#a1a1aa] block text-[11px] font-medium">پایگاه داده اصلی سایان</span>
                      <span className="text-sm font-semibold text-white mt-1 block">
                        {status.dbConnected ? 'متصل (MS SQL)' : 'شبیه‌ساز هوشمند'}
                      </span>
                    </div>
                    <div className={`p-2 rounded ${status.dbConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      <Database className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-[#18181b] p-4 rounded-xl border border-[#27272a] flex items-center justify-between">
                    <div>
                      <span className="text-[#a1a1aa] block text-[11px] font-medium">نرخ موفقیت کدهای پاسخ</span>
                      <span className="text-sm font-mono font-semibold text-white mt-1 block">
                        %{status.successRate}
                      </span>
                    </div>
                    <div className="p-2 bg-blue-500/10 text-blue-500 rounded">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-[#18181b] p-4 rounded-xl border border-[#27272a] flex items-center justify-between">
                    <div>
                      <span className="text-[#a1a1aa] block text-[11px] font-medium">کل پردازش تراکنش‌ها</span>
                      <span className="text-sm font-mono font-semibold text-white mt-1 block">
                        {status.totalRequests}
                      </span>
                    </div>
                    <div className="p-2 bg-blue-500/10 text-blue-500 rounded">
                      <Activity className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-[#18181b] p-4 rounded-xl border border-[#27272a] flex items-center justify-between">
                    <div>
                      <span className="text-[#a1a1aa] block text-[11px] font-medium">مدت زمان آنلاین بودن سرویس</span>
                      <span className="text-sm font-mono font-semibold text-white mt-1 block">
                        {status.uptime}
                      </span>
                    </div>
                    <div className="p-2 bg-rose-500/10 text-rose-500 rounded">
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>

                </div>

                {/* DB simulated Alert with explanation */}
                {!status.dbConnected && (
                  <div className="bg-[#18181b] border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px]">
                      <h4 className="font-semibold text-amber-400 text-xs">در حال استفاده از کدهای شبیه‌ساز بانک اطلاعاتی سایان</h4>
                      <p className="text-[#a1a1aa] mt-0.5 leading-relaxed">
                        همانطور که فرمودید در حال حاضر رمز عبور دیتابیس سایان را ندارید. این پنل به گونه‌ای طراحی شده که 
                        در نبود اتصال فیزیکی به دیتابیس، کدهای شبیه‌ساز داده‌های استاندارد سایان (مشتریان، فاکتورها، انبارداری) 
                        را با پاسخ‌های دقیقاً ست شده بازمی‌گردانند. شما به راحتی می‌توانید از برنامه‌های دیگر خود وب‌هوک تستی بزنید. هر زمان کلمه عبور را 
                        دریافت کردید، از زبانه <strong className="text-amber-200">«تنظیمات سرور»</strong> آن را وارد نمایید تا به دیتابیس مایکروسافت SQL Server به صورت خودکار متصل شود.
                      </p>
                    </div>
                  </div>
                )}

                {/* Middle Grid - Active Key Status & Pre-built queries */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  
                  {/* Left Column: API Overview */}
                  <div className="lg:col-span-1 bg-[#18181b] rounded-xl border border-[#27272a] p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
                      <h3 className="font-semibold text-[#e4e4e7] flex items-center gap-2 text-xs">
                        <Shield className="w-4 h-4 text-blue-500" />
                        امنیت و مجوزهای واسط
                      </h3>
                    </div>

                    <div className="space-y-4 mt-3">
                      <div>
                        <span className="text-[11px] text-[#a1a1aa]">تعداد کلیدهای فعال صادر شده:</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-lg font-mono font-bold text-white">{apiKeys.filter(k => k.status === 'active').length}</span>
                          <span className="text-[11px] text-[#71717a]">عدد فعال</span>
                        </div>
                      </div>

                      <div className="p-3 bg-[#09090b] rounded-lg border border-[#27272a] text-[11px] text-[#a1a1aa] leading-relaxed space-y-2">
                        <div className="font-bold text-[#e4e4e7] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ویژگی‌های سیستم امنیتی:
                        </div>
                        <ul className="list-disc leading-relaxed list-inside space-y-1 text-[#71717a]">
                          <li>مجوز دسترسی توکن Bearer</li>
                          <li>موتور محافظ ضد SQL Injection جهت کوئری‌ها</li>
                          <li>جداسازی منطقی محدوده‌های دسترسی کلیدها (Scope)</li>
                          <li>لاگ‌گیری خودکار از آی‌پی‌ها و زمان پاسخ</li>
                        </ul>
                      </div>

                      <button 
                        onClick={() => setActiveTab("keys")}
                        className="w-full py-2 bg-[#27272a] hover:bg-[#18181b] text-white text-[11px] font-semibold rounded border border-[#27272a] text-center block transition-colors cursor-pointer"
                      >
                        مدیریت کلیدهای API و کدهای آماده
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Prebuilt Reports List */}
                  <div className="lg:col-span-2 bg-[#18181b] rounded-xl border border-[#27272a] p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
                      <h3 className="font-semibold text-[#e4e4e7] flex items-center gap-2 text-xs">
                        <Terminal className="w-4 h-4 text-blue-500" />
                        گزارش‌های اصلی و کوئری‌های پیش‌فرض
                      </h3>
                      <span className="text-[11px] text-[#71717a]">{queries.length} گزارش استاندارد</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                      {queries.map((q) => (
                        <div key={q.id} className="p-3 bg-[#09090b] hover:bg-[#1c1c1f] border border-[#27272a] rounded-lg transition-colors group flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-medium px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                                {q.category}
                              </span>
                              <span className="text-[10px] font-mono text-[#71717a] uppercase">
                                {q.isCustom ? 'کوئری سفارشی' : 'سایان پیش‌فرض'}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold text-[#e4e4e7] mt-2 group-hover:text-blue-400 transition-colors">
                              {q.name}
                            </h4>
                            <p className="text-[11px] text-[#a1a1aa] mt-1 line-clamp-2 leading-relaxed">
                              {q.description}
                            </p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-[#27272a] flex items-center justify-between">
                            <span className="text-[10px] font-mono text-[#71717a]">
                              ID: {q.id}
                            </span>
                            <button
                              onClick={() => {
                                setQueryConsole(q.queryText);
                                setActiveTab("playground");
                              }}
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              باز کردن در کنسول
                              <Play className="w-3 h-3 text-blue-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Logging / Audit Trail Section */}
                <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold animate-pulse">لاگ زنده (LIVE)</div>
                      <h3 className="font-semibold text-white text-xs">لاگ تراکنش‌ها و درخواست‌های متصل شده</h3>
                    </div>
                    <button 
                      onClick={clearGatewayLogs}
                      className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      پاکسازی لاگ‌ها
                    </button>
                  </div>

                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-[#71717a] bg-[#09090b] rounded-lg border border-[#27272a]">
                      <Activity className="w-6 h-6 text-[#27272a] mx-auto mb-2" />
                      <span className="text-xs font-semibold block text-[#a1a1aa]">هیچ تراکنشی هنوز ثبت نشده است.</span>
                      <p className="text-[11px] text-[#71717a] mt-0.5">تراکنش‌های تستی یا از برنامه‌های دیگر در اینجا نمایش داده خواهند شد.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-[#27272a] bg-[#09090b]">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#1c1c1f] text-[#71717a] border-b border-[#27272a]">
                          <tr>
                            <th className="p-2.5 font-medium">زمان ثبت</th>
                            <th className="p-2.5 font-medium">کلاینت / کلید دسترسی</th>
                            <th className="p-2.5 font-medium">آدرس درگاه واسط</th>
                            <th className="p-2.5 font-medium">نوع اتصال</th>
                            <th className="p-2.5 font-medium">زمان پاسخ</th>
                            <th className="p-2.5 font-medium">آی‌پی درخواست</th>
                            <th className="p-2.5 font-medium">وضعیت</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#27272a]">
                          {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-[#27272a]/30 transition-colors text-[11px]">
                              <td className="p-2.5 text-[#a1a1aa] font-mono">
                                {new Date(log.timestamp).toLocaleTimeString("fa-IR")}
                              </td>
                              <td className="p-2.5 font-semibold text-[#e4e4e7]">
                                {log.apiKeyName || "پنل مدیریت مستقیم"}
                              </td>
                              <td className="p-2.5 text-[#a1a1aa] font-mono text-left" dir="ltr">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 ${
                                  log.method === 'GET' ? 'bg-emerald-600/20 text-emerald-500' : 'bg-blue-600/20 text-blue-500'
                                }`}>{log.method}</span>
                                {log.url}
                              </td>
                              <td className="p-2.5 text-[#e4e4e7]">
                                {log.source === "sql-direct" && (
                                  <span className="text-emerald-400 font-semibold">MS SQL مستقیم</span>
                                )}
                                {log.source === "api-proxy" && (
                                  <span className="text-blue-400 font-semibold">پراکسی وب‌سایان</span>
                                )}
                                {log.source === "simulation" && (
                                  <span className="text-amber-400 font-semibold">شبیه‌ساز (فال‌بک)</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono text-[#a1a1aa]">
                                {log.responseTime}ms
                              </td>
                              <td className="p-2.5 font-mono text-[#71717a]">
                                {log.ip}
                              </td>
                              <td className="p-2.5">
                                {log.status >= 200 && log.status < 300 ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                                    {log.status} OK
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[10px]" title={log.error}>
                                    {log.status} Error
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </motion.div>
            )}


            {/* ======= TAB 2: QUERY CONSOLE  ======= */}
            {activeTab === "playground" && (
              <motion.div
                key="playground"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  
                  {/* Left panel: Catalog of Sayan Tables or SQL Discovery */}
                  <div className="lg:col-span-1 bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-4">
                    <div className="border-b border-[#27272a] pb-2 flex items-center justify-between">
                      <h3 className="font-semibold text-white flex items-center gap-2 text-xs">
                        <Database className="w-4 h-4 text-blue-500" />
                        ساختار و جداول دیتابیس سایان
                      </h3>
                      {status.dbConnected && (
                        <button 
                          onClick={fetchDiscovery}
                          disabled={discoveryLoading}
                          title="بروزرسانی جداول و پایگاه‌داده‌ها"
                          className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa] transition-colors cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${discoveryLoading ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>

                    {status.dbConnected && discoveryData?.success ? (
                      <div className="space-y-4 text-xs">
                        {/* List of other Databases */}
                        <div className="space-y-1.5">
                          <span className="font-semibold text-[#a1a1aa] text-[11px] block">
                            پایگاه‌داده‌های یافت‌شده روی سرور:
                          </span>
                          <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto pr-1">
                            {discoveryData.databases?.map((dbName: string, idx: number) => {
                              const isActive = dbName.toLowerCase() === dbConfig.database.toLowerCase();
                              return (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    // Set name in form
                                    setDbConfig(prev => ({ ...prev, database: dbName }));
                                    // Provide help on console
                                    setQueryConsole(`-- تغییر به دیتابیس ${dbName} در موتور SQL\nSELECT TOP 10 * FROM [${dbName}].INFORMATION_SCHEMA.TABLES;`);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                                    isActive
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                      : "bg-[#09090b] border-[#27272a] text-[#71717a] hover:text-[#e4e4e7] hover:border-[#3f3f46]"
                                  }`}
                                  title="روی این دیتابیس کلیک کرده و سپس در تب تنظیمات آن را ذخیره کنید."
                                >
                                  {dbName}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[9.5px] text-[#71717a] leading-relaxed">
                            💡 راهنما: برای جابجایی دیتابیس غول‌پیکر (مثلاً <span className="text-amber-200">{`LepanBaft`}</span> یا پسوندهای اختصاصی)، آن را کلیک کرده و از زبانه <strong className="text-[#a1a1aa]">تنظیمات سرور</strong> ذخیره کنید.
                          </p>
                        </div>

                        {/* List of physical tables in the current DB */}
                        <div className="space-y-1.5 pt-2 border-t border-[#27272a]/70">
                          <span className="font-semibold text-[#a1a1aa] text-[11px] flex justify-between">
                            <span>جداول فیزیکی کشف شده:</span>
                            <span className="text-blue-400 font-mono">({discoveryData.tables?.length || 0})</span>
                          </span>
                          <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1 font-mono text-[10.5px]">
                            {discoveryData.tables?.length === 0 ? (
                              <div className="text-[#71717a] text-center py-2">
                                جدولی یافت نشد. به نظر می‌رسد جدول ارگانیک وجود ندارد یا دسترسی یوزر محدود است.
                              </div>
                            ) : (
                              discoveryData.tables?.map((tblName: string, idx: number) => {
                                // check common Sayan names
                                const nameLower = tblName.toLowerCase();
                                const isCustomer = nameLower.includes("customer") || nameLower.includes("cust") || nameLower.includes("moshtari") || nameLower.includes("person");
                                const isFactor = nameLower.includes("factor") || nameLower.includes("invoice") || nameLower.includes("sanad");
                                const isGoods = nameLower.includes("goods") || nameLower.includes("kala") || nameLower.includes("stock") || nameLower.includes("anbar");
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => setQueryConsole(`SELECT TOP 100 * FROM [${tblName}];`)}
                                    className="flex items-center justify-between p-1.5 bg-[#09090b] hover:bg-[#1c1c1f] hover:border-[#3f3f46] border border-[#27272a] rounded cursor-pointer transition-colors"
                                    title="کلیک برای پیش‌نویس دستور دریافت کل جدول"
                                  >
                                    <span className="text-[#e4e4e7] truncate text-[10px]" dir="ltr">{tblName}</span>
                                    {isCustomer && (
                                      <span className="text-[9px] px-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">مشتریان</span>
                                    )}
                                    {isFactor && (
                                      <span className="text-[9px] px-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">فاکتورها</span>
                                    )}
                                    {isGoods && (
                                      <span className="text-[9px] px-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded">کالا/انبار</span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="space-y-3 text-xs">
                        <div className="text-[11px] text-[#a1a1aa] bg-[#27272a]/20 p-2.5 rounded border border-[#27272a] leading-relaxed">
                          <p className="text-amber-300 font-semibold mb-1">⚠️ پایگاه داده تستی (آفلاین):</p>
                          <span className="text-[10px] leading-relaxed block text-justify">
                            در حالت شبیه‌ساز ماکت جداول پیش‌فرض استاندارد سایان (مشتریان، فاکتورها، انبارداری) آماده تست وب‌سایت شماست. محض اتصال حقیقی دیتابیس MSSQL، جداول بیزنس شما در این بخش قرائت می‌شوند.
                          </span>
                        </div>

                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          <div className="space-y-1">
                            <span className="font-semibold text-[#e4e4e7] font-mono text-[11px]">tblCustomer (جدول مشتریان)</span>
                            <div className="p-2 bg-[#09090b] border border-[#27272a] rounded text-[10.5px] text-[#a1a1aa] leading-relaxed font-mono">
                              CustomerID [شناسه مشتری]<br />
                              CustomerCode [کد مشتری]<br />
                              CustomerName [نام مشتری]<br />
                              CurrentBalance [مانده حساب]
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="font-semibold text-[#e4e4e7] font-mono text-[11px]">tblFactor (جدول فاکتورها)</span>
                            <div className="p-2 bg-[#09090b] border border-[#27272a] rounded text-[10.5px] text-[#a1a1aa] leading-relaxed font-mono">
                              FactorID, FactorNo, FactorDate, CustomerID, TotalPrice
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="font-semibold text-[#e4e4e7] font-mono text-[11px]">tblGoods (جدول کالاها)</span>
                            <div className="p-2 bg-[#09090b] border border-[#27272a] rounded text-[10.5px] text-[#a1a1aa] leading-relaxed font-mono">
                              GoodsID, GoodsCode, GoodsName, SalePrice
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right panel: Editor and Terminal */}
                  <div className="lg:col-span-3 bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-white flex items-center gap-2 text-xs">
                        <Terminal className="w-4 h-4 text-blue-500" />
                        اجرای مستقیم کوئری SQL در بانک سایان
                      </h3>
                      
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => setQueryConsole("SELECT TOP 50 * FROM tblCustomer ORDER BY CurrentBalance DESC;")}
                          className="px-2 py-1 bg-[#27272a] hover:bg-[#18181b] text-[#e4e4e7] rounded text-[10px] font-mono border border-[#27272a] cursor-pointer transition-colors"
                        >
                          تست مشتریان
                        </button>
                        <button 
                          onClick={() => setQueryConsole("SELECT TOP 50 * FROM tblFactor ORDER BY FactorDate DESC;")}
                          className="px-2 py-1 bg-[#27272a] hover:bg-[#18181b] text-[#e4e4e7] rounded text-[10px] font-mono border border-[#27272a] cursor-pointer transition-colors"
                        >
                          تست فاکتورها
                        </button>
                        <button 
                          onClick={() => setQueryConsole("SELECT TOP 50 * FROM tblGoods WHERE SalePrice > 100000;")}
                          className="px-2 py-1 bg-[#27272a] hover:bg-[#18181b] text-[#e4e4e7] rounded text-[10px] font-mono border border-[#27272a] cursor-pointer transition-colors"
                        >
                          تست کالاها
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="relative">
                        <textarea
                          value={queryConsole}
                          onChange={(e) => setQueryConsole(e.target.value)}
                          className="w-full h-40 bg-[#09090b] text-emerald-400 p-4 rounded-lg font-mono text-xs border border-[#27272a] focus:border-blue-500 leading-relaxed outline-none"
                          placeholder="کد SQL خود را در این بخش مینویسید..."
                          dir="ltr"
                        />
                        <div className="absolute bottom-3 left-4 text-[10px] text-[#71717a] font-mono">
                          Microsoft SQL Server Console
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#09090b] p-3 rounded-lg border border-[#27272a] gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-slate-400">
                            {status.dbConnected ? (
                              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                                <Check className="w-3.5 h-3.5" />
                                آماده اجرا روی پایگاه داده زنده سایان
                              </span>
                            ) : forceReal ? (
                              <span className="text-rose-400 flex items-center gap-1 font-semibold">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                تلاش برای تست حقیقی فیزیکی دیتابیس (بدون شبیه‌ساز)
                              </span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1 font-semibold">
                                <AlertCircle className="w-3.5 h-3.5" />
                                حالت شبیه‌ساز (آفلاین): کوئری روی حافظه مجازی اجرا می‌شود
                              </span>
                            )}
                          </div>
                          
                          <label className="flex items-center gap-2 cursor-pointer select-none text-[10.5px] text-[#a1a1aa] hover:text-[#e4e4e7] transition-colors pt-1">
                            <input
                              type="checkbox"
                              checked={forceReal}
                              onChange={(e) => setForceReal(e.target.checked)}
                              className="w-3.5 h-3.5 rounded bg-[#1c1c1f] border-[#27272a] text-blue-600 focus:ring-0 checked:bg-blue-600 cursor-pointer"
                            />
                            <span className="font-semibold text-blue-400">⚡ الزامی کردن اجرای مستقیم روی پایگاه داده زنده سایان</span>
                          </label>
                        </div>
                        <button
                          onClick={handleRunTestQuery}
                          disabled={queryLoading}
                          className="px-4 py-2 hover:opacity-90 disabled:opacity-50 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded transition-colors flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                        >
                          {queryLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-white text-white" />
                          )}
                          <span>اجرای کوئری</span>
                        </button>
                      </div>
                    </div>

                    {/* Result Panel */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#e4e4e7]">خروجی و نتایج فاکس:</span>
                        {queryResult && (
                          <div className="text-[10px] font-mono text-[#71717a]">
                            زمان اجرا: {queryResult.responseTime} میلی‌ثانیه | تعداد ردیف: {queryResult.recordCount} 
                            {queryResult.simulated && ' | (داده شبیه‌سازی شده)'}
                          </div>
                        )}
                      </div>

                      <div className="bg-[#09090b] rounded-lg p-3 font-mono text-xs border border-[#27272a] min-h-[150px] max-h-[350px] overflow-auto">
                        {!queryResult && !queryLoading && (
                          <div className="text-[#71717a] text-center py-10">
                            پس از زدن کلید اجرای کوئری، خروجی دیتاگرید یا پیغام خطا در این قسمت ظاهر خواهد شد.
                          </div>
                        )}

                        {queryLoading && (
                          <div className="text-[#a1a1aa] text-center py-10 flex flex-col items-center gap-2">
                            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                            <span>در حال اجرای دستور در پایگاه داده حسابداری...</span>
                          </div>
                        )}

                        {queryResult && queryResult.success === false && (
                          <div className="text-rose-400 space-y-2">
                            <span className="font-semibold flex items-center gap-1">
                              <XCircle className="w-4 h-4 text-rose-500" />
                              خطا در اجرای کوئری:
                            </span>
                            <pre className="p-3 bg-rose-950/20 rounded border border-rose-950/30 text-xs text-rose-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">{queryResult.error}</pre>
                            <p className="text-[10px] text-[#71717a]">{queryResult.hint}</p>
                          </div>
                        )}

                        {queryResult && queryResult.success && (
                          <div className="space-y-3">
                            {queryResult.corrections && (
                              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10.5px] rounded-lg space-y-1" dir="rtl">
                                <span className="font-semibold block text-blue-400">⚡ هماهنگ‌سازی و اصلاح هوشمند ساختار دیتابیس سایان:</span>
                                <ul className="list-disc list-inside space-y-1 text-blue-300/90 text-[10px]">
                                  {queryResult.corrections.map((corr: string, idx: number) => (
                                    <li key={idx} className="mr-2">{corr}</li>
                                  ))}
                                </ul>
                                {queryResult.correctedQuery && (
                                  <div className="mt-2 pt-2 border-t border-blue-500/20 font-mono text-[10px] text-[#a1a1aa] break-all">
                                    دستور نهایی اجرا شده روی دیتابیس: <span className="bg-[#09090b] px-2 py-0.5 rounded border border-[#27272a] text-[#e4e4e7]">{queryResult.correctedQuery}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {queryResult.simulated && (
                              <div className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] rounded inline-block">
                                نمایش داده شده از موتور شبیه‌ساز سایان (درحالت آفلاین بانک)
                              </div>
                            )}

                            {queryResult.rows && queryResult.rows.length === 0 ? (
                              <div className="text-[#71717a] text-center py-6">
                                پاسخ کوئری خالی بود. رکوردی مطابق جستجو یافت نشد.
                              </div>
                            ) : (
                              <div className="overflow-auto max-h-[280px]">
                                <table className="w-full text-right text-[11px] border-collapse">
                                  <thead className="bg-[#1c1c1f] text-[#71717a] border-b border-[#27272a]">
                                    <tr>
                                      {Object.keys(queryResult.rows[0] || {}).map((key, i) => (
                                        <th key={i} className="p-2 font-mono text-[#a1a1aa] font-medium">{key}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#27272a]">
                                    {queryResult.rows.map((row: any, i: number) => (
                                      <tr key={i} className="hover:bg-[#27272a]/30 transition-colors">
                                        {Object.values(row).map((val: any, j) => (
                                          <td key={j} className="p-2 text-[#e4e4e7]">
                                            {typeof val === 'number' ? val.toLocaleString("fa-IR") : String(val)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </motion.div>
            )}


            {/* ======= TAB 3: API KEYS MANAGEMENT  ======= */}
            {activeTab === "keys" && (
              <motion.div
                key="keys"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  
                  {/* Left Column: Create new token */}
                  <div className="lg:col-span-1 bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-3 h-fit">
                    <h3 className="font-semibold text-white text-xs flex items-center gap-2">
                      <Plus className="w-4.5 h-4.5 text-blue-500" />
                      صدور کلید اتصال جدید (API Key)
                    </h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      برای متصل کردن هر نرم‌افزار جدید (مثلا وب‌سایت وردپرسی، اپلیکیشن اندروید یا بات تلگرام)، یک کلید دسترسی جداگانه صادر کنید تا تراکنش‌ها را ایزوله و تفکیک نمایید.
                    </p>

                    <form onSubmit={handleCreateApiKey} className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <label className="text-[11px] text-[#a1a1aa] font-medium">نام کلاینت / متصل شونده:</label>
                        <input
                          type="text"
                          required
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          placeholder="مانند: وب‌سایت فروشگاه دیجی کالا"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-[#a1a1aa] font-medium">سطح امنیتی دسترسی (Scope):</label>
                        <select
                          value={newKeyScope}
                          onChange={(e: any) => setNewKeyScope(e.target.value)}
                          className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] outline-none focus:border-blue-500 transition-colors"
                        >
                          <option value="all">دسترسی کامل (اجرای SQL سفارشی و گزارشات)</option>
                          <option value="readonly">فقط خواندنی عمومی (مشتریان، فاکتورها، کالاها)</option>
                          <option value="reports_only">محدود شده به گزارشات از پیش تعیین شده</option>
                        </select>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded shadow transition-colors cursor-pointer"
                      >
                        صدور و ایجاد توکن
                      </button>
                    </form>
                  </div>

                  {/* Right Column: Manage Keys and Docs */}
                  <div className="lg:col-span-2 bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-4">
                    <div className="space-y-3">
                      <h3 className="font-semibold text-white text-xs">کلیدهای دسترسی پیشین صادر شده</h3>
                      
                      {apiKeys.length === 0 ? (
                        <div className="text-center py-6 text-[#71717a] bg-[#09090b] rounded-lg border border-[#27272a] text-xs">
                          کلید دسترسی فعال وجود ندارد. از باکس سمت راست یک کلید صادر کنید.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {apiKeys.map((k) => (
                            <div key={k.id} className="p-3 bg-[#09090b] border border-[#27272a] rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#1c1c1f]/50 transition-colors">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-white text-xs">{k.name}</span>
                                  {k.status === 'active' ? (
                                    <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold">فعال</span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded text-[9px] font-bold">لغو امتیاز شده</span>
                                  )}
                                  <span className="px-1.5 py-0.2 bg-[#27272a] text-[#a1a1aa] rounded text-[9px] font-mono">Scope: {k.scope}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <code className="text-xs font-mono text-blue-400 select-all bg-[#18181b] px-1.5 py-0.5 rounded border border-[#27272a]">{k.key}</code>
                                  <button
                                    onClick={() => copyToClipboard(k.key, 'key')}
                                    className="text-[#71717a] hover:text-[#e4e4e7] transition-colors cursor-pointer"
                                    title="کپی کردن توکن کلید"
                                  >
                                    {copiedKey === k.key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                                <div className="text-[10px] text-[#71717a]">
                                  صادر شده در {new Date(k.createdAt).toLocaleDateString("fa-IR")} | دفعات فراخوانی: <strong className="text-[#a1a1aa] font-mono">{k.requestCount} بار</strong>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-center">
                                <button
                                  onClick={() => handleToggleApiKey(k.id)}
                                  className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors border cursor-pointer ${
                                    k.status === 'active'
                                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/15 hover:bg-amber-500/20'
                                      : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/15 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  {k.status === 'active' ? 'غیرفعال‌سازی موقت' : 'فعال‌سازی مجدد'}
                                </button>
                                <button
                                  onClick={() => handleDeleteApiKey(k.id)}
                                  className="p-1.5 bg-[#27272a] hover:bg-rose-950/20 text-[#71717a] hover:text-rose-400 border border-[#27272a] hover:border-rose-900/40 rounded transition-colors cursor-pointer"
                                  title="حذف دائمی"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Developer Integration Documentation */}
                    <div className="pt-4 border-t border-[#27272a] space-y-3">
                      <h3 className="font-semibold text-white text-xs flex items-center gap-2">
                        <Code className="w-4 h-4 text-blue-400" />
                        نحوه اتصال و ارسال درخواست‌ها از سایر برنامه‌ها (مستندات API)
                      </h3>

                      <div className="space-y-3">
                        <span className="text-[11px] text-[#a1a1aa]">برای خواندن گزارشات تستی فاکتورها، ریکوئست را با هدر Authorization به این آدرس بفرستید:</span>
                        
                        <div className="bg-[#09090b] p-3 rounded-lg font-mono text-xs border border-[#27272a] space-y-2 text-left" dir="ltr">
                          <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
                            <span className="text-[#71717a] font-bold uppercase text-[9px]">CURL Request</span>
                            <button
                              onClick={() => copyToClipboard(`curl -X GET "http://localhost:3000/api/external/v1/invoices" \\
  -H "Authorization: Bearer ${apiKeys[0]?.key || 's_gate_live_YOUR_KEY'}"`, 'code')}
                              className="text-[#a1a1aa] hover:text-[#e4e4e7] flex items-center gap-1 text-[9px] bg-[#18181b] px-2 py-0.5 rounded border border-[#27272a] cursor-pointer"
                            >
                              {copiedCode?.includes("curl") ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>کپی دستور</span>
                            </button>
                          </div>
                          <code className="text-emerald-400 block whitespace-pre-wrap leading-relaxed text-[11px]">
                            {`curl -X GET "http://localhost:3000/api/external/v1/invoices" \\\n  -H "Authorization: Bearer ${apiKeys[0]?.key || 's_gate_live_YOUR_KEY'}"`}
                          </code>
                        </div>

                        <div className="bg-[#09090b] p-3 rounded-lg font-mono text-xs border border-[#27272a] space-y-2 text-left" dir="ltr">
                          <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
                            <span className="text-[#71717a] font-bold uppercase text-[9px]">Node.js Fetch</span>
                            <button
                              onClick={() => copyToClipboard(`fetch("http://localhost:3000/api/external/v1/query", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKeys[0]?.key || 's_gate_live_YOUR_KEY'}"
  },
  body: JSON.stringify({
    query: "SELECT TOP 10 GoodsName, SalePrice FROM tblGoods"
  })
})
.then(res => res.json())
.then(data => console.log(data));`, 'code')}
                              className="text-[#a1a1aa] hover:text-[#e4e4e7] flex items-center gap-1 text-[9px] bg-[#18181b] px-2 py-0.5 rounded border border-[#27272a] cursor-pointer"
                            >
                              {copiedCode?.includes("fetch") ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>کپی کد</span>
                            </button>
                          </div>
                          <code className="text-[#a1a1aa] block whitespace-pre-wrap leading-relaxed text-[10.5px]">
                            {`fetch("http://localhost:3000/api/external/v1/query", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKeys[0]?.key || 's_gate_live_YOUR_KEY'}"
  },
  body: JSON.stringify({
    query: "SELECT TOP 10 GoodsName, SalePrice FROM tblGoods"
  })
})
.then(res => res.json())
.then(data => console.log(data));`}
                          </code>
                        </div>

                      </div>
                    </div>

                  </div>
                </div>

              </motion.div>
            )}


            {/* ======= TAB 4: SYSTEM CONFIGS  ======= */}
            {activeTab === "config" && (
              <motion.div
                key="config"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="max-w-3xl mx-auto"
              >
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-4">
                  <div className="border-b border-[#27272a] pb-2">
                    <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                      <Settings className="w-4.5 h-4.5 text-blue-500" />
                      تنظیمات کانکشن‌های فیزیکی پلتفرم واسط
                    </h2>
                    <p className="text-[11px] text-[#a1a1aa] mt-0.5">
                      آی‌پی سرور دیتابیس سایان را با پورت به همراه اطلاعات وب‌سرویس لوکال وارد کنید.
                    </p>
                  </div>

                  <form onSubmit={handleSaveConfigs} className="space-y-4 text-xs">
                    
                    {/* Database Config Container */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-white text-xs flex items-center gap-2 text-blue-400">
                        <Database className="w-4 h-4" />
                        اتصال به سرور پایگاه داده Microsoft SQL Server عمومی/داخلی
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] text-[#a1a1aa]">آدرس سرور یا آی‌پی (Host):</label>
                          <input
                            type="text"
                            required
                            value={dbConfig.host}
                            onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] font-mono outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-[#a1a1aa]">پورت پیش‌فرض SQL (معمولا 1433):</label>
                          <input
                            type="number"
                            required
                            value={dbConfig.port}
                            onChange={(e) => setDbConfig({ ...dbConfig, port: Number(e.target.value) })}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] font-mono outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-[#a1a1aa]">نام دیتابیس حسابداری سایان (Database):</label>
                          <input
                            type="text"
                            required
                            value={dbConfig.database}
                            onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] font-mono outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-[#a1a1aa]">نام کاربری اس‌کیوال (Username):</label>
                          <input
                            type="text"
                            required
                            value={dbConfig.user}
                            onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] font-mono outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                            placeholder="sa"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[11px] text-[#a1a1aa]">رمز عبور اتصال دیتابیس (Password):</label>
                          <input
                            type="password"
                            value={dbConfig.pass}
                            onChange={(e) => setDbConfig({ ...dbConfig, pass: e.target.value })}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] font-mono outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                            placeholder="********"
                          />
                          <p className="text-[10px] text-[#71717a]">
                            در صورتی که رمز ندارید پس فیلد را خالی بگذارید تا شبیه‌ساز داده‌ای فعال بماند.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-1 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer text-[#a1a1aa]">
                          <input
                            type="checkbox"
                            checked={dbConfig.encrypt}
                            onChange={(e) => setDbConfig({ ...dbConfig, encrypt: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600 bg-[#09090b] border-[#27272a]"
                          />
                          <span>رمزنگاری اتصال (SSL/Encrypt)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-[#a1a1aa]">
                          <input
                            type="checkbox"
                            checked={dbConfig.trustServerCertificate}
                            onChange={(e) => setDbConfig({ ...dbConfig, trustServerCertificate: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600 bg-[#09090b] border-[#27272a]"
                          />
                          <span>اعتماد به گواهینامه خودساخته سرور (Trust Certificate)</span>
                        </label>
                      </div>
                    </div>

                    {/* Sayan Proxy API Config */}
                    <div className="space-y-3 pt-3 border-t border-[#27272a]">
                      <h3 className="font-semibold text-white text-xs flex items-center gap-2 text-blue-400">
                        <Server className="w-4 h-4" />
                        اتصال به وب‌سرویس مستقیم سایان (Local API Proxy)
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[11px] text-[#a1a1aa]">آدرس وب‌سرویس سایان روی سرور (Local API Base URL):</label>
                          <input
                            type="text"
                            required
                            value={localConfig.baseUrl}
                            onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] font-mono outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[11px] text-[#a1a1aa]">توکن لاگین یا بیرر (Default Bearer Authorization Token):</label>
                          <textarea
                            value={localConfig.token}
                            onChange={(e) => setLocalConfig({ ...localConfig, token: e.target.value })}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-[#e4e4e7] font-mono outline-none focus:border-blue-500 text-left h-20"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer text-[#a1a1aa] pt-1">
                        <input
                          type="checkbox"
                          checked={localConfig.useProxy}
                          onChange={(e) => setLocalConfig({ ...localConfig, useProxy: e.target.checked })}
                          className="w-4 h-4 rounded text-blue-600 bg-[#09090b] border-[#27272a]"
                        />
                        <span>در صورت خطا در پورت بانک اطلاعاتی، پروکسی وب‌سایان فعال بماند</span>
                      </label>
                    </div>

                    {/* Save Action Feedback */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#27272a] gap-2 flex-wrap sm:flex-nowrap">
                      <div>
                        {saveStatus === "saving" && (
                          <span className="text-xs text-blue-400 flex items-center gap-1">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-450" />
                            در حال بررسی اطلاعات و تست مجدد اتصالات...
                          </span>
                        )}
                        {saveStatus === "success" && (
                          <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            تغییرات با موفقیت ثبت شد و اتصالات وب‌سرویس جدید بررسی شدند.
                          </span>
                        )}
                        {saveStatus === "error" && (
                          <span className="text-xs text-rose-450 font-semibold" dir="rtl">
                            تنظیمات ذخیره شد اما اتصال پایگاه داده خطای پینگ داد (داده شبیه‌ساز مجدداً خودکار فعال شد).
                          </span>
                        )}
                      </div>

                      <button
                        type="submit"
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded shadow transition-colors cursor-pointer shrink-0"
                      >
                        ذخیره و آزمایش نهایی اتصالات
                      </button>
                    </div>

                  </form>
                </div>
              </motion.div>
            )}


            {/* ======= TAB 5: EASY INSTALLER ====== */}
            {activeTab === "installer" && (
              <motion.div
                key="installer"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="max-w-4xl mx-auto space-y-4 text-xs"
              >
                
                {/* Intro banner */}
                <div className="bg-[#18181b] border border-[#27272a] p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2.5">
                    <Code className="w-6 h-6 text-blue-500" />
                    <div>
                      <h2 className="font-semibold text-white text-xs">آموزش گام‌به‌گام نصب سرویس میانی روی سرور حسابداری (Node.js)</h2>
                      <p className="text-[11px] text-[#a1a1aa] mt-0.5">در کمترین زمان این پکیج را مستقیما در داخل سیستم عامل ویندوز سرور یا لینوکس شرکت راه می‌اندازید.</p>
                    </div>
                  </div>
                </div>

                {/* Steps Accordion style */}
                <div className="space-y-3">
                  
                  {/* Step 1 */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider block">گام اول</span>
                    <h3 className="text-xs font-semibold text-white">۱. نصب محیط Node.js روی سرور حسابداری سایان</h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      ابتدا به پورتال رسمی <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Node.js</a> مراجعه کرده و آخرین نسخه پایدار (LTS) را دانلود کنید و فایل نصبی را به صورت ساده (Next) روی ویندوز سرور نصب کنید. پس از نصب، ترمینال CMD را باز کنید تا نصب موفق را با دستور زیر فراخوانی نمایید:
                    </p>
                    <div className="bg-[#09090b] p-2.5 rounded font-mono text-[11px] text-left text-emerald-400 border border-[#27272a] select-all" dir="ltr">
                      node -v
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider block">گام دوم</span>
                    <h3 className="text-xs font-semibold text-white">۲. ایجاد دایرکتوری و آماده‌سازی فایل‌های هسته</h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      یک فولدر خالی تحت عنوان <code className="text-blue-300 bg-[#09090b] px-1 py-0.5 rounded text-[10.5px]">sayan-api-gateway</code> بسازید. فایل‌های <code className="text-white">package.json</code> و کدهای سرور <code className="text-white">server.ts / server.js</code> پروژه فعلی را کپی کرده و در این فولدر جدید قرار دهید.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider block">گام سوم</span>
                    <h3 className="text-xs font-semibold text-white">۳. نصب پکیج‌های پیش‌نیاز رابط دیتابیس ام‌اس‌اس‌کیوال (CMD)</h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      ترمینال CMD یا PowerShell را باز کرده، با وارد کردن دستور cd به دایرکتوری ایجاد شده بروید و پکیج‌های مورد نیاز اتصال را نصب کنید:
                    </p>
                    
                    <div className="space-y-1.5 text-left font-mono text-[11px]" dir="ltr">
                      <div className="p-2.5 bg-[#09090b] text-emerald-400 rounded border border-[#27272a] select-all">
                        cd C:\sayan-api-gateway
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-emerald-400 rounded border border-[#27272a] select-all">
                        npm install express mssql cors dotenv
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider block">گام چهارم</span>
                    <h3 className="text-xs font-semibold text-white">۴. اجرای دروازه واسط و شروع سرویس‌دهی</h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      برای اجرای وب‌سرور میانی بر روی پورت پیش‌فرض (3000)، دستور زیر را در خط فرمان سرور تایپ کنید:
                    </p>
                    <div className="bg-[#09090b] p-2.5 rounded font-mono text-[11px] text-left text-emerald-400 border border-[#27272a] select-all" dir="ltr">
                      node server.js
                    </div>

                    <div className="pt-2">
                      <p className="text-[11px] text-amber-400 font-semibold mb-1">
                        🔒 تغییر پورت خروجی به پورت دلخواه (مثلاً 5000):
                      </p>
                      <p className="text-[10px] text-[#a1a1aa] mb-1.5 leading-relaxed">
                        اگر پورت 3000 توسطبرنامه‌ای دیگر اشغال است، می‌توانید با ست کردن متغیر محیطی <code className="text-white">PORT</code> قبل از اجرا، پورت دلخواه را تنظیم کنید:
                      </p>
                      <div className="space-y-1 text-left font-mono text-[10px]" dir="ltr">
                        <div className="bg-[#09090b] p-1.5 rounded text-blue-300 border border-[#27272a] select-all">
                          # در محیط Windows (CMD):
                          set PORT=5000&& node server.js
                        </div>
                        <div className="bg-[#09090b] p-1.5 rounded text-blue-300 border border-[#27272a] select-all">
                          # در محیط Windows (PowerShell):
                          $env:PORT=5000; node server.js
                        </div>
                        <div className="bg-[#09090b] p-1.5 rounded text-blue-300 border border-[#27272a] select-all">
                          # در محیط Linux:
                          PORT=5000 node server.js
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[11px] rounded flex items-center gap-2 mt-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>پیام موفقیت: <code className="font-bold text-white bg-[#09090b] px-1.5 py-0.5 rounded font-mono">[Sayan Gateway] Server running at http://localhost:[PORT]</code> در ترمینال سرور درج می‌شود.</span>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider block">گام پنجم (توصیه حرفه‌ای)</span>
                    <h3 className="text-xs font-semibold text-white">۵. آنلاین نگه داشتن شبانه‌روزی با PM2</h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      پس از بستن ترمینال CMD، وب‌سرور متوقف خواهد شد. برای اینکه سرویس واسط و پورت همیشه حتی پس از ریبوت سرور فعال بماند، از پکیج مدیریت پروسس‌های بی‌صدا <code className="text-blue-300">pm2</code> استفاده کنید:
                    </p>
                    
                    <div className="space-y-1.5 text-left font-mono text-[11px]" dir="ltr">
                      <div className="p-2.5 bg-[#09090b] text-emerald-400 rounded border border-[#27272a] select-all">
                        npm install -g pm2
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-emerald-400 rounded border border-[#27272a] select-all">
                        # اجرا با پورت پیش‌فرض 3000
                        pm2 start server.js --name "sayan-api"
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-amber-400 rounded border border-[#27272a] select-all">
                        # اجرا با پورت سفارشی (مثلاً 5000) به صورت همیشگی
                        pm2 start server.js --name "sayan-api" --env PORT=5000
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-blue-400 rounded border border-[#27272a] select-all">
                        pm2 save
                      </div>
                    </div>
                  </div>

                  {/* Step 6 */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">گام ششم</span>
                    <h3 className="text-xs font-semibold text-white">۶. دستورات اعمال آپدیت و تغییرات روی سرور حسابداری</h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      زمانی که کد جدید یا تغییراتی در فایل‌های کانفیگ/کدهای سرور (<code className="text-white">server.js</code> یا تنظیمات دیگر) اعمال می‌کنید، برای به‌روزرسانی سرویس زنده بدون نیاز به ریبوت و خاموشی کل سیستم، دستورات زیر را وارد کنید:
                    </p>
                    
                    <div className="space-y-1.5 text-left font-mono text-[11px]" dir="ltr">
                      <div className="p-2.5 bg-[#09090b] text-amber-400 rounded border border-[#27272a] select-all">
                        # ۱. رفتن به مسیر نصب
                        cd C:\sayan-api-gateway
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-emerald-400 rounded border border-[#27272a] select-all">
                        # ۲. کپی کردن فایل‌های جدید روی سرور (سپس بارگذاری مجدد پردازش در PM2)
                        pm2 reload sayan-api
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-slate-300 rounded border border-[#27272a] select-all">
                        # مشاهده وضعیت زنده و لاشه‌های آپدیت شده سرور
                        pm2 status
                      </div>
                    </div>
                  </div>

                  {/* Step 7 */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-2">
                    <span className="text-[10px] font-mono text-rose-400 font-bold uppercase tracking-wider block">گام هفتم</span>
                    <h3 className="text-xs font-semibold text-white">۷. دستور حذف نصب کامل سرویس (Uninstall)</h3>
                    <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                      در صورتی که می‌خواهید سرویس میانی سایان را به طور کامل از روی سرور متوقف، باطل و از پس‌زمینه ویندوز/لینوکس یا رجیستری پروسه‌ها حذف نصب (Uninstall) کنید، دستورات زیر را به ترتیب اجرا نمایید:
                    </p>
                    
                    <div className="space-y-1.5 text-left font-mono text-[11px]" dir="ltr">
                      <div className="p-2.5 bg-[#09090b] text-rose-400 rounded border border-[#27272a] select-all">
                        # ۱. متوقف کردن پردازش زنده
                        pm2 stop sayan-api
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-rose-500 rounded border border-[#27272a] select-all">
                        # ۲. حذف پروسه از لیست مدیریت خودکار سیستم
                        pm2 delete sayan-api
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-slate-400 rounded border border-[#27272a] select-all">
                        # ۳. ذخیره‌سازی وضعیت خالی لیست پردازش‌ها
                        pm2 save
                      </div>
                      <div className="p-2.5 bg-[#09090b] text-emerald-400 rounded border border-[#27272a] select-all">
                        # ۴. سپس می‌توانید کل پوشه C:\sayan-api-gateway را به سادگی حذف کنید.
                      </div>
                    </div>
                  </div>

                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </div>


        {/* Visual Brand Footer */}
        <footer className="mt-16 pt-6 border-t border-[#27272a] text-center text-xs text-[#71717a]">
          <div className="flex items-center justify-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-blue-500" />
            <span>سامانه یکپارچه‌ساز سایان (Sayan SQL Intermediary Hub)</span>
          </div>
          <p className="mt-1 font-mono text-[10px] text-[#71717a]">Built securely using modern Node & MS SQL drivers for fast remote synchronizations.</p>
        </footer>

      </div>
    </div>
  );
}
