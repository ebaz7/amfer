import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import sql from "mssql";
import { 
  SayanLocalConfig, 
  DatabaseConfig, 
  ApiKey, 
  SayanReportQuery, 
  LogEntry 
} from "./src/types.ts";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Path for permanent / local storage
const DB_FILE = path.join(process.cwd(), "gateway_storage.json");

// Helper inside server to ensure default config exists
function loadStorage() {
  const defaultQueries: SayanReportQuery[] = [
    {
      id: "q-sales-invoices",
      name: "لیست فاکتورهای فروش اخیر",
      queryText: "SELECT TOP 100 F.FactorNo, F.FactorDate, C.CustomerName, F.TotalPrice, F.FinalPrice FROM tblFactor F LEFT JOIN tblCustomer C ON F.CustomerID = C.CustomerID WHERE F.FactorType = 1 ORDER BY F.FactorDate DESC",
      description: "برگرداندن آخرین فاکتورهای صادر شده همراه با نام مشتری و مبلغ کل",
      category: "فروش",
      isCustom: false
    },
    {
      id: "q-customers-balances",
      name: "مانده حساب مشتریان بدهکار/بستانکار",
      queryText: "SELECT CustomerID, CustomerCode, CustomerName, Phone, Mobile, CurrentBalance FROM tblCustomer WHERE IsActive = 1 ORDER BY CurrentBalance DESC",
      description: "لیست کامل مشتریان فعال به همراه کد، شماره موبایل و تفصیلی تراز مالی جاری",
      category: "مشتریان",
      isCustom: false
    },
    {
      id: "q-warehouse-stock",
      name: "کالاهای انبار و آخرین موجودی",
      queryText: "SELECT G.GoodsCode, G.GoodsName, G.SalePrice, W.WarehouseName, S.StockCount FROM tblGoods G LEFT JOIN tblStock S ON G.GoodsID = S.GoodsID LEFT JOIN tblWarehouse W ON S.WarehouseID = W.WarehouseID WHERE S.StockCount > 0",
      description: "گزارش موجودی کالاهای فعال کشور در انبارهای مختلف همراه با قیمت ترجیحی فروش",
      category: "انبارداری",
      isCustom: false
    },
    {
      id: "q-accounting-ledger",
      name: "ریز تراکنش‌های اسناد حسابداری",
      queryText: "SELECT TOP 150 D.SanadNo, H.SanadDate, D.DebitAmount, D.CreditAmount, D.Description FROM tblSanadDetail D LEFT JOIN tblSanadHeader H ON D.SanadID = H.SanadID ORDER BY H.SanadDate DESC",
      description: "لیست آخرین اقلام اسناد حسابداری ثبت شده در دفتر کل و معین سایان",
      category: "حسابداری",
      isCustom: false
    }
  ];

  const defaultKeys: ApiKey[] = [
    {
      id: "key-1",
      name: "کانال وب‌سایت اصلی شرکت",
      key: "s_gate_live_73f08a91b2c",
      status: "active",
      createdAt: new Date().toISOString(),
      scope: "all",
      requestCount: 142
    },
    {
      id: "key-2",
      name: "اپلیکیشن موبایل فروشگاهی",
      key: "s_gate_live_94ea12cb40f",
      status: "active",
      createdAt: new Date().toISOString(),
      scope: "readonly",
      requestCount: 38
    }
  ];

  const defaultLocalConfig: SayanLocalConfig = {
    baseUrl: "http://localhost:5000/api/v1",
    token: "Bearer eYJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    useProxy: true
  };

  const defaultDbConfig: DatabaseConfig = {
    host: "127.0.0.1",
    port: 1433,
    database: "SayanAccDB",
    user: "sa",
    pass: "",
    encrypt: false,
    trustServerCertificate: true
  };

  const defaultData = {
    localConfig: defaultLocalConfig,
    dbConfig: defaultDbConfig,
    keys: defaultKeys,
    queries: defaultQueries,
    logs: [] as LogEntry[]
  };

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), "utf8");
    return defaultData;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse gateway_storage.json, using defaults", e);
    return defaultData;
  }
}

// Save storage back to file
function saveStorage(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

// Global data cache initialized from JSON file
let storage = loadStorage();

// Database connection pool holder
let sqlPool: sql.ConnectionPool | null = null;
let isDbConnected = false;

// Attempt to connect to Sayan Microsoft SQL Server
async function connectToDatabase() {
  if (sqlPool) {
    try {
      await sqlPool.close();
    } catch (e) {}
    sqlPool = null;
  }

  const { host, port, database, user, pass, encrypt, trustServerCertificate } = storage.dbConfig;
  
  if (!pass) {
    // If password is not provided, do not try to run real database connection
    isDbConnected = false;
    return false;
  }

  const configStr: sql.config = {
    server: host,
    port: port || 1433,
    database: database,
    user: user,
    password: pass,
    options: {
      encrypt: encrypt,
      trustServerCertificate: trustServerCertificate,
      connectTimeout: 5000
    }
  };

  try {
    sqlPool = new sql.ConnectionPool(configStr);
    await sqlPool.connect();
    isDbConnected = true;
    console.log("Successfully connected to Sayan MS SQL Server database.");
    return true;
  } catch (err: any) {
    console.error("SQL Connection Failed:", err.message);
    isDbConnected = false;
    return false;
  }
}

// Call on startup
connectToDatabase();

// --- SIMULATION DATABASE FOR SAYAN ---
// When user does not have DB password, we provide extremely rich Persian simulated data
const SIM_CUSTOMERS = [
  { CustomerID: 101, CustomerCode: "C-1001", CustomerName: "دیجی کالا (شرکت نوآوران نوپا)", Phone: "02161930000", Mobile: "09121111111", CurrentBalance: 1250000000 },
  { CustomerID: 102, CustomerCode: "C-1002", CustomerName: "توزیع برتر سپاهان", Phone: "03134567890", Mobile: "09132222222", CurrentBalance: 480000000 },
  { CustomerID: 103, CustomerCode: "C-1003", CustomerName: "فروشگاه بزرگ فدک", Phone: "02537730000", Mobile: "09123333333", CurrentBalance: -85000000 }, // Credit balance
  { CustomerID: 104, CustomerCode: "C-1004", CustomerName: "صنایع بسته بندی الوند", Phone: "02832221111", Mobile: "09128888888", CurrentBalance: 984000000 },
  { CustomerID: 105, CustomerCode: "C-1005", CustomerName: "بازرگانی امین شیراز", Phone: "07132334455", Mobile: "09174444444", CurrentBalance: 0 },
  { CustomerID: 106, CustomerCode: "C-1006", CustomerName: "فولاد کبیر البرز", Phone: "02634120000", Mobile: "09125555555", CurrentBalance: 3410000000 }
];

const SIM_INVOICES = [
  { FactorID: 5001, FactorNo: "F-1405-0101", FactorDate: "1405/03/10", CustomerName: "دیجی کالا (شرکت نوآوران نوپا)", TotalPrice: 125000000, FinalPrice: 112500000, DeliverMethod: "پیک بادپا" },
  { FactorID: 5002, FactorNo: "F-1405-0102", FactorDate: "1405/03/12", CustomerName: "صنایع بسته بندی الوند", TotalPrice: 420000000, FinalPrice: 420000000, DeliverMethod: "تیپاکس" },
  { FactorID: 5003, FactorNo: "F-1405-0103", FactorDate: "1405/03/15", CustomerName: "فروشگاه بزرگ فدک", TotalPrice: 85000000, FinalPrice: 80000000, DeliverMethod: "باربری وطن" },
  { FactorID: 5004, FactorNo: "F-1405-0104", FactorDate: "1405/03/18", CustomerName: "توزیع برتر سپاهان", TotalPrice: 194000000, FinalPrice: 190000000, DeliverMethod: "پیک بادپا" },
  { FactorID: 5005, FactorNo: "F-1405-0105", FactorDate: "1405/03/20", CustomerName: "بازرگانی امین شیراز", TotalPrice: 512000000, FinalPrice: 490000000, DeliverMethod: "ایران فرابر" }
];

const SIM_GOODS = [
  { GoodsID: 301, GoodsCode: "P-301", GoodsName: "آیفون ۱۵ پرو مکس ۲۵۶ گیگابایت", Unit: "عدد", SalePrice: 650000000, StockCount: 24, WarehouseName: "انبار مرکزی تهران" },
  { GoodsID: 302, GoodsCode: "P-302", GoodsName: "لپ‌تاپ ایسوس ROG Zephyrus G16", Unit: "دستگاه", SalePrice: 1200000000, StockCount: 8, WarehouseName: "انبار مرکزی تهران" },
  { GoodsID: 303, GoodsCode: "P-303", GoodsName: "سامسونگ گلکسی S24 اولترا", Unit: "عدد", SalePrice: 580000000, StockCount: 45, WarehouseName: "انبار دیجیتال شرق" },
  { GoodsID: 304, GoodsCode: "P-304", GoodsName: "مایرسافت سرفیس لپ‌تاپ ۵ - Core i7", Unit: "دستگاه", SalePrice: 850000000, StockCount: 5, WarehouseName: "انبار دیجیتال شرق" },
  { GoodsID: 305, GoodsCode: "P-305", GoodsName: "مانیتور شیائومی ۳۴ اینچ کرو گیمینگ", Unit: "عدد", SalePrice: 220000000, StockCount: 17, WarehouseName: "انبار ثانویه جاده مخصوص" }
];

const SIM_SANADS = [
  { SanadNo: "S-1405-12", SanadDate: "1405/03/01", DebitAmount: 500000000, CreditAmount: 0, Description: "دریافت بدهی بابت فاکتور ۱۴۰۲ از صنایع بسته بندی الوند" },
  { SanadNo: "S-1405-13", SanadDate: "1405/03/03", DebitAmount: 0, CreditAmount: 85000000, Description: "پرداختی علی‌الحساب بابت خرید مواد اولیه به شرکت زرین پلاست" },
  { SanadNo: "S-1405-14", SanadDate: "1405/03/07", DebitAmount: 120000000, CreditAmount: 120000000, Description: "ثبت سند پورسانت عاملیت فروش فارس" },
  { SanadNo: "S-1405-15", SanadDate: "1405/03/11", DebitAmount: 43000000, CreditAmount: 0, Description: "هزینه کرایه حمل کالا و ترخیص گمرکی فرودگاه امام" }
];

// Simple Simulated Mini Query Parser
function executeSimulatedQuery(queryText: string): any[] {
  const norm = queryText.toLowerCase();
  
  if (norm.includes("tblcustomer") || norm.includes("customer")) {
    return SIM_CUSTOMERS;
  }
  if (norm.includes("tblfactor") || norm.includes("factor")) {
    return SIM_INVOICES;
  }
  if (norm.includes("tblgoods") || norm.includes("goods") || norm.includes("stock")) {
    return SIM_GOODS;
  }
  if (norm.includes("tblsanad") || norm.includes("sanad")) {
    return SIM_SANADS;
  }
  
  // Default generic fallback list
  return [
    { Status: "شبیه‌سازی ارتباط فعال", Message: "سیستم به دلیل فعال نبودن بانک اطلاعاتی ام‌اس‌اس‌کیو‌ال، این پاسخ تست را برمی‌گرداند", DbEngine: "Microsoft SQL Server Simulator" },
    ...SIM_GOODS.slice(0, 2)
  ];
}


// --- INTERNAL PANEL APIS ---

// Get Status
app.get("/api/gateway/status", (req, res) => {
  const totalRequests = storage.logs.length;
  const successCount = storage.logs.filter((l: LogEntry) => l.status >= 200 && l.status < 400).length;
  const successRate = totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 100;

  res.json({
    dbConnected: isDbConnected,
    proxyConnected: storage.localConfig.useProxy,
    uptime: process.uptime(),
    totalRequests,
    successRate,
    time: new Date().toISOString()
  });
});

// Configure Gateway Connections
app.get("/api/gateway/config", (req, res) => {
  res.json({
    localConfig: storage.localConfig,
    dbConfig: {
      ...storage.dbConfig,
      pass: storage.dbConfig.pass ? "********" : "" // Mask password for UI rendering
    }
  });
});

app.post("/api/gateway/config", async (req, res) => {
  const { localConfig, dbConfig } = req.body;
  if (localConfig) {
    storage.localConfig = { ...storage.localConfig, ...localConfig };
  }
  
  if (dbConfig) {
    // If password is still masked, use the old password
    if (dbConfig.pass === "********") {
      dbConfig.pass = storage.dbConfig.pass;
    }
    storage.dbConfig = { ...storage.dbConfig, ...dbConfig };
  }

  saveStorage(storage);
  
  // Re-attempt database connection asynchronously
  const connected = await connectToDatabase();
  
  res.json({
    success: true,
    dbConnected: connected,
    message: connected 
      ? "اتصال به پایگاه داده سایان با موفقیت برقرار شد" 
      : "تنظیمات ذخیره شد، اما اتصال به SQL Server برقرار نشد (حالت شبیه‌ساز فعال است)"
  });
});

// Keys Management
app.get("/api/gateway/keys", (req, res) => {
  res.json(storage.keys);
});

app.post("/api/gateway/keys", (req, res) => {
  const { name, scope } = req.body;
  if (!name) {
    return res.status(400).json({ error: "نام کلید الزامی است" });
  }

  // Generate a random-looking elegant API key string
  const customRandom = Math.random().toString(36).substring(2, 10);
  const newKey: ApiKey = {
    id: "key-" + Date.now(),
    name: name,
    key: `s_gate_live_${customRandom}${Date.now().toString(36).substring(4)}`,
    status: "active",
    createdAt: new Date().toISOString(),
    scope: scope || "all",
    requestCount: 0
  };

  storage.keys.unshift(newKey);
  saveStorage(storage);
  res.json(newKey);
});

app.delete("/api/gateway/keys/:id", (req, res) => {
  const { id } = req.params;
  storage.keys = storage.keys.filter((k: ApiKey) => k.id !== id);
  saveStorage(storage);
  res.json({ success: true, message: "کلید با موفقیت حذف شد" });
});

app.put("/api/gateway/keys/:id/toggle", (req, res) => {
  const { id } = req.params;
  const keyIndex = storage.keys.findIndex((k: ApiKey) => k.id === id);
  if (keyIndex !== -1) {
    storage.keys[keyIndex].status = storage.keys[keyIndex].status === "active" ? "revoked" : "active";
    saveStorage(storage);
    res.json(storage.keys[keyIndex]);
  } else {
    res.status(404).json({ error: "کلید پیدا نشد" });
  }
});

// Reports / Queries management
app.get("/api/gateway/queries", (req, res) => {
  res.json(storage.queries);
});

app.post("/api/gateway/queries", (req, res) => {
  const { name, queryText, description, category } = req.body;
  if (!name || !queryText) {
    return res.status(400).json({ error: "نام و متن کوئری الزامی است" });
  }

  const newQuery: SayanReportQuery = {
    id: "q-" + Date.now(),
    name,
    queryText,
    description: description || "",
    category: category || "فروش",
    isCustom: true
  };

  storage.queries.push(newQuery);
  saveStorage(storage);
  res.json(newQuery);
});

app.delete("/api/gateway/queries/:id", (req, res) => {
  const { id } = req.params;
  storage.queries = storage.queries.filter((q: SayanReportQuery) => q.id !== id);
  saveStorage(storage);
  res.json({ success: true, message: "گزارش با موفقیت حذف شد" });
});

// Request Logs inside panel
app.get("/api/gateway/logs", (req, res) => {
  // Return the last 150 request logs
  res.json(storage.logs.slice(0, 150));
});

app.post("/api/gateway/logs/clear", (req, res) => {
  storage.logs = [];
  saveStorage(storage);
  res.json({ success: true, message: "تاریخچه خطاها و گزارش تراکنش‌ها با موفقیت پاکسازی شد" });
});

// Main Route to test execute queries inside the GUI Console
app.post("/api/gateway/query/test", async (req, res) => {
  const { queryText } = req.body;
  if (!queryText) {
    return res.status(400).json({ error: "متن کوئری تعریف نشده است" });
  }

  const start = Date.now();
  
  if (isDbConnected && sqlPool) {
    try {
      const result = await sqlPool.request().query(queryText);
      const responseTime = Date.now() - start;

      // Log execution
      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: "/api/gateway/query/test",
        method: "POST",
        ip: req.ip || "127.0.0.1",
        status: 200,
        responseTime,
        source: "sql-direct",
        apiKeyName: "پنل مدیریت (تست مستقیم)"
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);

      return res.json({
        success: true,
        source: "sql-direct",
        responseTime,
        recordCount: result.recordset.length,
        rows: result.recordset
      });
    } catch (err: any) {
      const responseTime = Date.now() - start;
      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: "/api/gateway/query/test",
        method: "POST",
        ip: req.ip || "127.0.0.1",
        status: 500,
        responseTime,
        error: err.message,
        source: "sql-direct",
        apiKeyName: "پنل مدیریت (تست مستقیم)"
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);

      return res.status(500).json({
        success: false,
        error: err.message,
        responseTime,
        hint: "املاء کوئری را بررسی کرده و مطمئن شوید جداول انتخابی در دیتابیس سایان وجود دارند."
      });
    }
  } else {
    // Simul Mode
    const mockRows = executeSimulatedQuery(queryText);
    const responseTime = Math.round(10 + Math.random() * 45); // simulate DB network lag

    const newLog: LogEntry = {
      id: "log-" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      url: "/api/gateway/query/test",
      method: "POST",
      ip: req.ip || "127.0.0.1",
      status: 200,
      responseTime,
      source: "simulation",
      apiKeyName: "پنل مدیریت (شبیه‌ساز)"
    };
    storage.logs.unshift(newLog);
    saveStorage(storage);

    return res.json({
      success: true,
      source: "simulation",
      responseTime,
      recordCount: mockRows.length,
      rows: mockRows,
      simulated: true,
      info: "پایگاه داده سایان متصل نیست. در حال بازگرداندن داده‌های شبیه‌سازی‌شده."
    });
  }
});


// --- EXTERNAL PLUGGABLE REST APIS FOR THIRD-PARTY APPS ---
// Route pattern: `/api/external/v1/reports/:reportId` or generic queries with SQL

app.all("/api/external/v1/*", async (req, res, next) => {
  // 1. Authenticate Request
  // Support both "Authorization: Bearer <API_KEY>" header AND URL query parameter "?apiKey=<API_KEY>"
  let providedKey = "";
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    providedKey = req.headers.authorization.substring(7);
  } else if (req.query.apiKey) {
    providedKey = String(req.query.apiKey);
  }

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "دسترسی نامعتبر. لطفاً هدر Authorization Bearer یا پارامتر آدرس apiKey معروفی ارائه کنید."
    });
  }

  const foundKey = storage.keys.find((k: ApiKey) => k.key === providedKey);
  if (!foundKey) {
    return res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "کلید API ارائه شده معتبر نیست یا منقضی شده است."
    });
  }

  if (foundKey.status !== "active") {
    return res.status(403).json({
      success: false,
      error: "Key Revoked",
      message: "این کلید API توسط مدیریت غیرفعال شده است."
    });
  }

  // Increment key request count
  foundKey.requestCount += 1;
  saveStorage(storage);

  // Attach key to request for endpoint handlers
  (req as any).apiKeyInfo = foundKey;
  next();
});

// Dynamic Query Execution Endpoint
app.post("/api/external/v1/query", async (req, res) => {
  const apiKeyInfo = (req as any).apiKeyInfo as ApiKey;
  
  if (apiKeyInfo.scope === "reports_only") {
    return res.status(403).json({
      success: false,
      error: "Scope Violation",
      message: "این کلید API فقط دسترسی به گزارش‌های از پیش تعریف شده دارد، کوئری اختیاری مجاز نیست."
    });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "پارامتر query در بدنه درخواست وجود ندارد" });
  }

  // Heavy validation on DDL commands to prevent drop tables or bad things if SQL direct is active
  const bannedKeywords = ["drop", "delete", "truncate", "update", "insert", "alter", "create"];
  const lowerQuery = query.toLowerCase();
  for (const word of bannedKeywords) {
    if (lowerQuery.includes(word)) {
      return res.status(400).json({
        success: false,
        error: "Security Violation",
        message: `عملیات غیراخلاقی یا تغییر دیتابیس مجاز نیست. کلید واژه غیرمجاز: ${word}`
      });
    }
  }

  const start = Date.now();
  if (isDbConnected && sqlPool) {
    try {
      const result = await sqlPool.request().query(query);
      const responseTime = Date.now() - start;

      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: req.path,
        method: req.method,
        ip: req.ip || "127.0.0.1",
        status: 200,
        responseTime,
        source: "sql-direct",
        apiKeyName: apiKeyInfo.name
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);

      res.json({
        success: true,
        source: "sql-direct",
        responseTime,
        recordCount: result.recordset.length,
        data: result.recordset
      });
    } catch (err: any) {
      const responseTime = Date.now() - start;
      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: req.path,
        method: req.method,
        ip: req.ip || "127.0.0.1",
        status: 500,
        responseTime,
        error: err.message,
        source: "sql-direct",
        apiKeyName: apiKeyInfo.name
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);

      res.status(500).json({
        success: false,
        error: err.message,
        responseTime
      });
    }
  } else {
    // Simulator
    const results = executeSimulatedQuery(query);
    const responseTime = Math.round(15 + Math.random() * 30);

    const newLog: LogEntry = {
      id: "log-" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      url: req.path,
      method: req.method,
      ip: req.ip || "127.0.0.1",
      status: 200,
      responseTime,
      source: "simulation",
      apiKeyName: apiKeyInfo.name
    };
    storage.logs.unshift(newLog);
    saveStorage(storage);

    res.json({
      success: true,
      source: "simulation",
      responseTime,
      recordCount: results.length,
      data: results,
      simulated: true,
      info: "پایگاه داده سایان متصل نیست. در حال بازگرداندن داده‌های شبیه‌سازی‌شده."
    });
  }
});

// REST Endpoints mapping standard report paths
app.get("/api/external/v1/customers", async (req, res) => {
  const apiKeyInfo = (req as any).apiKeyInfo as ApiKey;
  const start = Date.now();
  
  if (isDbConnected && sqlPool) {
    try {
      const query = "SELECT CustomerID, CustomerCode, CustomerName, Phone, Mobile, CurrentBalance FROM tblCustomer WHERE IsActive = 1";
      const result = await sqlPool.request().query(query);
      const responseTime = Date.now() - start;

      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: req.path,
        method: req.method,
        ip: req.ip || "127.0.0.1",
        status: 200,
        responseTime,
        source: "sql-direct",
        apiKeyName: apiKeyInfo.name
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);

      res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    // Return mock customers
    res.json({ success: true, count: SIM_CUSTOMERS.length, data: SIM_CUSTOMERS, simulated: true });
  }
});

app.get("/api/external/v1/invoices", async (req, res) => {
  const apiKeyInfo = (req as any).apiKeyInfo as ApiKey;
  const start = Date.now();

  if (isDbConnected && sqlPool) {
    try {
      const query = "SELECT F.FactorNo, F.FactorDate, C.CustomerName, F.TotalPrice, F.FinalPrice FROM tblFactor F LEFT JOIN tblCustomer C ON F.CustomerID = C.CustomerID WHERE F.FactorType = 1 ORDER BY F.FactorDate DESC";
      const result = await sqlPool.request().query(query);
      const responseTime = Date.now() - start;

      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: req.path,
        method: req.method,
        ip: req.ip || "127.0.0.1",
        status: 200,
        responseTime,
        source: "sql-direct",
        apiKeyName: apiKeyInfo.name
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);

      res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.json({ success: true, count: SIM_INVOICES.length, data: SIM_INVOICES, simulated: true });
  }
});

app.get("/api/external/v1/goods", async (req, res) => {
  const apiKeyInfo = (req as any).apiKeyInfo as ApiKey;
  
  if (isDbConnected && sqlPool) {
    try {
      const query = "SELECT G.GoodsCode, G.GoodsName, G.SalePrice, S.StockCount FROM tblGoods G LEFT JOIN tblStock S ON G.GoodsID = S.GoodsID";
      const result = await sqlPool.request().query(query);
      res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.json({ success: true, count: SIM_GOODS.length, data: SIM_GOODS, simulated: true });
  }
});


// --- INTEGRATE VITE FOR REACT DEVELOPMENT / PRODUCTION EXTRAS ---

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start Server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Sayan Gateway] Server running at http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Error bootstrapping server:", err);
});
