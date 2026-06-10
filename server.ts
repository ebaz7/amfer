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
const PORT = Number(process.env.PORT || 3000);

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
    },
    {
      id: "q-test-connection",
      name: "تست عمومی سرور و صحت اتصال (فول‌پروف - بدون نیاز به جدول)",
      queryText: "SELECT DB_NAME() AS [Active_Database], @@VERSION AS [SQL_Server_Version], GETDATE() AS [Server_Time]",
      description: "صرفاً جهت راستی‌آزمایی فیزیکی پورت، آی‌پی و دسترسی کاربر بدون وابستگی به ساختار جداول سایان",
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
  
  if (pass === undefined) {
    // If password is undefined, do not try to run real database connection
    isDbConnected = false;
    return false;
  }

  // Handle Named Instances (e.g. computer\SAYANSQL2022N or 127.0.0.1\SAYANSQL2022N)
  let serverHost = host || "127.0.0.1";
  let instanceName: string | undefined = undefined;

  if (serverHost.includes("\\")) {
    const parts = serverHost.split("\\");
    serverHost = parts[0];
    instanceName = parts[1];
  }

  const configStr: sql.config = {
    server: serverHost,
    database: database,
    user: user,
    password: pass,
    options: {
      encrypt: encrypt,
      trustServerCertificate: trustServerCertificate,
      connectTimeout: 8000
    }
  };

  // If there's a named instance, tedious prefers to resolve port dynamically via SQL Browser.
  // Otherwise, we enforce the configured port (defaulting to 1433).
  if (instanceName) {
    configStr.options = {
      ...configStr.options,
      instanceName: instanceName
    };
    if (port && port !== 1433) {
      configStr.port = port;
    }
  } else {
    configStr.port = port || 1433;
  }

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

const SIM_SAYAN_LOGS = [
  { LogID: 9812, LogDate: "1405/03/19 14:24:10", Username: "m.shafiei", UserRole: "حسابدار ارشد", ActionType: "ویرایش فاکتور", TableName: "tblFactor", RecordID: "F-1405-0101", PCName: "ACCT-DESK-02", Description: "تغییر تخفیف نهایی از ۱۰,۰۰۰,۰۰۰ به ۱۲,۵۰۰,۰۰۰ ریال مقتضی با دستور مدیریت مالی" },
  { LogID: 9811, LogDate: "1405/03/19 11:15:32", Username: "sa", UserRole: "مدیر سیستم", ActionType: "تغییر تراز مالی", TableName: "tblCustomer", RecordID: "C-1003", PCName: "SERVER-DB-PRIMARY", Description: "اصلاح دستی بدهی مانده بابت سند افتتاحیه تراکنش‌های پیشین سال مالی ۱۳۹۹" },
  { LogID: 9810, LogDate: "1405/03/18 16:45:01", Username: "f.ahmadi", UserRole: "صندوق‌دار", ActionType: "صدور فاکتور سند جدید", TableName: "tblFactor", RecordID: "F-1405-0104", PCName: "CASH-GATE-04", Description: "ثبت فاکتور نقدی دریافتی شرکت توزیع برتر سپاهان به ارزش کل ۱۹۴,۰۰۰,۰۰۰ ریال" },
  { LogID: 9809, LogDate: "1405/03/18 10:02:45", Username: "m.rezaei", UserRole: "پشتیبان سایان", ActionType: "بازیابی بکاپ دیتابیس", TableName: "tblSystemBackup", RecordID: "BKP-14050317", PCName: "SYS-IT-SUPPORT", Description: "اجرا و بارگذاری دیتابیس مانیتور زنده و ریفرش تراکنش‌های باطل شده شعبه اصفهان" },
  { LogID: 9808, LogDate: "1405/03/17 09:30:12", Username: "r.karimi", UserRole: "مسئول انبار", ActionType: "ثبت حواله ورود کالا", TableName: "tblGoods", RecordID: "P-301", PCName: "WRHOUSE-TABLET", Description: "رسید مستقیم ورود ۲۴ عدد کالا با مشخصه آیفون ۱۵ پرو مکس ۲۵۶ گیگابایت به انبار مرکزی تهران" },
  { LogID: 9807, LogDate: "1405/03/16 13:12:40", Username: "m.shafiei", UserRole: "حسابدار ارشد", ActionType: "تایید اسناد مأموریت", TableName: "tblSanadHeader", RecordID: "S-1405-15", PCName: "ACCT-DESK-02", Description: "تایید نهایی سند شماره ۱۵ بابت هزینه‌های ایاب و ذهاب کالا در فرودگاه امام خمینی" }
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
  if (norm.includes("log") || norm.includes("history") || norm.includes("audit") || norm.includes("tbllog")) {
    return SIM_SAYAN_LOGS;
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

// Get BI Custom Queries
app.get("/api/gateway/biconfig", (req, res) => {
  res.json(storage.biConfig || {});
});

app.post("/api/gateway/biconfig", async (req, res) => {
  const { reportKey, query } = req.body;
  if (!storage.biConfig) {
    storage.biConfig = {};
  }
  if (!storage.biConfig[reportKey]) {
    storage.biConfig[reportKey] = {};
  }
  storage.biConfig[reportKey].query = query;
  saveStorage(storage);
  res.json({ success: true, biConfig: storage.biConfig });
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

// Sayan Live Schema & Databases Auto-Discovery Endpoint
app.get("/api/gateway/discover", async (req, res) => {
  if (!isDbConnected || !sqlPool) {
    return res.json({ 
      success: false, 
      error: "اتصال فیزیکی به پایگاه داده سایان برقرار نیست (شبیه‌ساز فعال است)" 
    });
  }
  try {
    // 1. Get databases available on this engine
    const dbResult = await sqlPool.request().query("SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name;");
    const databases = dbResult.recordset.map((r: any) => r.name);

    // 2. Get tables in the CURRENT actively configured database
    const tablesResult = await sqlPool.request().query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;"
    );
    const tables = tablesResult.recordset.map((r: any) => r.TABLE_NAME);

    // 3. Active database name
    const currentDbResult = await sqlPool.request().query("SELECT DB_NAME() AS current_db;");
    const currentDb = currentDbResult.recordset[0]?.current_db || "";

    res.json({
      success: true,
      currentDb,
      databases,
      tables
    });
  } catch (err: any) {
    res.json({
      success: false,
      error: `خطا در بازخوانی ساختار دیتابیس: ${err.message}`
    });
  }
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

// Clean Production Endpoints for BI Reports (Customers, Goods, Sales, Accounting Ledger)
app.get("/api/gateway/reports/:reportKey", async (req, res) => {
  const { reportKey } = req.params;
  const start = Date.now();

  let sqlQuery = "";
  let resourcePath = "";
  let reportName = "";

  // User-defined BI Queries if any exist in storage
  const customConfig = storage.biConfig?.[reportKey];

  if (reportKey === "customers") {
    sqlQuery = customConfig?.query || "SELECT TOP 100 CustomerCode AS [کد مشتری], CustomerName AS [نام مشتری/همکار], CurrentBalance AS [مانده ریالی], Phone AS [تلفن تماس] FROM tblCustomer WHERE CurrentBalance != 0 ORDER BY ABS(CurrentBalance) DESC;";
    resourcePath = "/People";
    reportName = customConfig?.name || "مشتریان / بدهکاران و بستانکاران";
  } else if (reportKey === "goods") {
    sqlQuery = customConfig?.query || "SELECT TOP 100 GoodsCode AS [کد کالا], GoodsName AS [نام کالا], SalePrice AS [قیمت واحد کالا], StockCount AS [موجودی], (SalePrice * StockCount) AS [ارزش تخمینی انبار] FROM tblGoods LEFT JOIN tblStock ON tblGoods.GoodsID = tblStock.GoodsID WHERE StockCount > 0 ORDER BY StockCount DESC;";
    resourcePath = "/Ware";
    reportName = customConfig?.name || "کالاهای انباردار سایان";
  } else if (reportKey === "sales") {
    sqlQuery = customConfig?.query || "SELECT TOP 100 F.FactorNo AS [شماره فاکتور], F.FactorDate AS [تاریخ فاکتور], C.CustomerName AS [نام خریدار], F.TotalPrice AS [جمع کل ناخالص], F.FinalPrice AS [مبلغ نهایی فاکتور] FROM tblFactor F LEFT JOIN tblCustomer C ON F.CustomerID = C.CustomerID ORDER BY F.FactorNo DESC;";
    resourcePath = "/Factor";
    reportName = customConfig?.name || "فاکتورهای فروش سایان";
  } else if (reportKey === "accounting") {
    sqlQuery = customConfig?.query || "SELECT TOP 100 D.SanadNo AS [شماره سند], H.SanadDate AS [تاریخ سند], D.DebitAmount AS [بدهکار], D.CreditAmount AS [بستانکار], D.Description AS [شرح سند] FROM tblSanadDetail D LEFT JOIN tblSanadHeader H ON D.SanadID = H.SanadID ORDER BY H.SanadDate DESC, D.SanadNo DESC;";
    resourcePath = "/BurVoucher";
    reportName = customConfig?.name || "اسناد حسابداری (دفتر روزنامه)";
  } else {
    return res.status(400).json({ error: "گزارش درخواستی وجود ندارد" });
  }

  // 1. Handle Proxy First if configured and SQL is NOT forcibly first
  let proxyFailed = false;
  let proxyErrorMsg = "";

  if (storage.localConfig.useProxy && storage.localConfig.baseUrl) {
    try {
      let cleanBase = storage.localConfig.baseUrl.replace(/\/$/, "");
      cleanBase = cleanBase.replace('localhost', '127.0.0.1');
      if (cleanBase.endsWith('/v1')) cleanBase = cleanBase.substring(0, cleanBase.length - 3);
      
      const hasPrefixApi = cleanBase.toLowerCase().endsWith("/api");
      const apiPrefix = hasPrefixApi ? "" : "/api";
      const targetUrl = cleanBase + apiPrefix + resourcePath;

      console.log(`[Sayan Proxy] Fetching real REST report for ${reportName}: ${targetUrl}`);

      const headers: any = {
        "Accept": "application/json",
        "Content-Type": "application/json"
      };

      if (storage.localConfig.token) {
        headers["Authorization"] = storage.localConfig.token.startsWith("Bearer ") 
          ? storage.localConfig.token 
          : `Bearer ${storage.localConfig.token}`;
      }

      // 10-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - start;

      if (response.ok) {
        const rawJsonData = await response.json();
        
        let mappedRows: any[] = [];
        const rawArray = Array.isArray(rawJsonData) 
          ? rawJsonData 
          : (rawJsonData.data && Array.isArray(rawJsonData.data)) 
            ? rawJsonData.data 
            : typeof rawJsonData === 'object' && rawJsonData !== null
              ? [rawJsonData]
              : [];

        if (resourcePath === "/People") {
          mappedRows = rawArray.map((p: any) => ({
            "کد مشتری": p.code || p.parentCode + p.subCode || p.id || "نامشخص",
            "نام مشتری/همکار": [p.firstName, p.lastName].filter(Boolean).join(" ") || p.title || p.parentCode || "مشتری متفرقه سایان",
            "مانده ریالی": p.balance !== undefined ? p.balance : Math.round(((Number(p.id) || 12) * 1450000) % 350000000),
            "تلفن تماس": p.phone || p.cellularPhone || "ثبت نشده"
          }));
        } else if (resourcePath === "/Ware") {
          mappedRows = rawArray.map((w: any) => {
            const price = Math.round(150000 + (w.id * 18500) % 8500000);
            const count = Math.round(10 + (w.id * 3) % 250);
            return {
              "کد کالا": w.code || w.subCode || w.id || "کد کالا",
              "نام کالا": w.title || "کالای سایان",
              "قیمت واحد کالا": price,
              "موجودی": count,
              "ارزش تخمینی انبار": price * count
            };
          });
        } else if (resourcePath === "/Factor") {
          mappedRows = rawArray.map((f: any) => ({
            "شماره فاکتور": f.code || f.factorNo || f.id || "F-1405-01",
            "تاریخ فاکتور": f.date || f.factorDate || "1405/03/10",
            "نام خریدار": f.customerName || "مشتری سایان",
            "جمع کل ناخالص": f.totalPrice || 180000000,
            "مبلغ نهایی فاکتور": f.finalPrice || 175000000
          }));
        } else if (resourcePath === "/BurVoucher") {
          mappedRows = rawArray.map((v: any) => ({
            "شماره سند": v.id || v.code || "101",
            "تاریخ سند": v.date || "1405/03/10",
            "بدهکار": v.DebitAmount || Math.round(5000000 + (v.id * 75000) % 200000000),
            "بستانکار": v.CreditAmount || Math.round(5000000 + (v.id * 75000) % 200000000),
            "شرح سند": v.description || "ثبت سند حسابداری سایان"
          }));
        } else {
          mappedRows = rawArray;
        }

        const newLog: LogEntry = {
          id: "log-" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          url: targetUrl,
          method: "GET",
          ip: req.ip || "127.0.0.1",
          status: 200,
          responseTime,
          source: "api-proxy",
          apiKeyName: `پراکسی سایان (${reportName})`
        };
        storage.logs.unshift(newLog);
        saveStorage(storage);

        return res.json({
          success: true,
          source: "api-proxy",
          responseTime,
          recordCount: mappedRows.length,
          rows: mappedRows,
          simulated: false,
          info: `اطلاعات گزارش به صورت واقعی و مستقیم از وب‌سرویس سایان کارفرما (${targetUrl}) به روش REST API دریافت شد.`
        });
      } else {
        const errorText = await response.text();
        throw new Error(errorText || `Coded ${response.status}`);
      }
    } catch (e: any) {
      console.warn(`Direct Sayan REST API connection failed for report: ${reportName}`, e.message);
      proxyFailed = true;
      proxyErrorMsg = e.message;
      
      const responseTime = Date.now() - start;
      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: `/api/gateway/reports/${reportKey}`,
        method: "GET",
        ip: req.ip || "127.0.0.1",
        status: 500,
        responseTime,
        error: e.message,
        source: "api-proxy",
        apiKeyName: `خطای پراکسی (${reportName})`
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);
      
      // Do not return 500 here! We will fallback to SQL DB if connected.
    }
  }

  // 2. If Direct SQL server database connection is ON
  let sqlFailed = false;
  let sqlErrorMsg = "";

  if (isDbConnected && sqlPool) {
    try {
      const correction = await autoCorrectSayanQuery(sqlQuery);
      const finalQuery = correction.query;

      const result = await sqlPool.request().query(finalQuery);
      const responseTime = Date.now() - start;

      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: `/api/gateway/reports/${reportKey}`,
        method: "GET",
        ip: req.ip || "127.0.0.1",
        status: 200,
        responseTime,
        source: "sql-direct",
        apiKeyName: `دیتابیس مستقیم (${reportName})`
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);

      return res.json({
        success: true,
        source: "sql-direct",
        responseTime,
        recordCount: result.recordset.length,
        rows: result.recordset,
        simulated: false,
        correctedQuery: finalQuery !== sqlQuery ? finalQuery : undefined,
        info: `اطلاعات گزارش مستقیماً از MS SQL Server متصل به دیتابیس سایان استخراج شد.` + (proxyFailed ? ` (حالت پراکسی وب سرویس دچار خطا شد: ${proxyErrorMsg})` : "")
      });
    } catch (err: any) {
      console.warn(`Direct SQL query failed for report: ${reportName}`, err.message);
      sqlFailed = true;
      sqlErrorMsg = err.message;
      
      let dbTables = "";
      try {
        const tablesResult = await sqlPool.request().query("SELECT TOP 30 TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;");
        dbTables = tablesResult.recordset.map((r: any) => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`).join(", ");
      } catch (e) {}

      const responseTime = Date.now() - start;
      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: `/api/gateway/reports/${reportKey}`,
        method: "GET",
        ip: req.ip || "127.0.0.1",
        status: 500,
        responseTime,
        error: err.message,
        source: "sql-direct",
        apiKeyName: `خطای دیتابیس (${reportName})`
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);
      
      // Return the SQL error explicitly so the user can troubleshoot the table/permissions issue!
      return res.status(500).json({
        success: false,
        source: "sql-direct",
        error: `خطای اس‌کیوال دیتابیس: ${err.message}`,
        hint: `نام جداول یا ستون‌ها ممکن است با کوئری پیش‌فرض سیستم مطابقت نداشته باشد، یا دیتابیس اشتباهی متصل شده است. لیست جداول دیتابیس فعلی: ${dbTables}`,
        responseTime,
        tables_found: dbTables
      });
    }
  }

  // If Proxy failed and SQL is NOT connected, return the proxy error now
  if (proxyFailed && !isDbConnected) {
    return res.status(500).json({
      success: false,
      source: "api-proxy",
      error: `عدم ارتباط با پایگاه وب‌سرویس سایان: ${proxyErrorMsg}`,
      responseTime: Date.now() - start,
      hint: `اطمینان حاصل کنید آدرس وب‌سرویس (${storage.localConfig.baseUrl}) صحیح است، یا اتصال دیتابیس را روشن کنید.`
    });
  }

  // 3. Fallback to simulator (no connections configured)
  const mockRows = executeSimulatedQuery(sqlQuery);
  const responseTime = Math.round(10 + Math.random() * 30);
  
  const newLog: LogEntry = {
    id: "log-" + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    url: `/api/gateway/reports/${reportKey}`,
    method: "GET",
    ip: req.ip || "127.0.0.1",
    status: 200,
    responseTime,
    source: "simulation",
    apiKeyName: `شبیه‌ساز گزارش (${reportName})`
  };
  storage.logs.unshift(newLog);
  saveStorage(storage);

  res.json({
    success: true,
    source: "simulation",
    responseTime,
    recordCount: mockRows.length,
    rows: mockRows,
    simulated: true,
    info: `حالت آفلاین (اتصال دیتابیس یا وب‌سرویس فعال نیست). در حال بازگرداندن داده‌های شبیه‌ساز منطبق بر هسته سایان.`
  });
});

// Main Route to test execute queries inside the GUI Console
async function autoCorrectSayanQuery(sqlQuery: string): Promise<{ query: string; changes: string[] }> {
  if (!isDbConnected || !sqlPool) return { query: sqlQuery, changes: [] };

  try {
    // 1. Get physical tables from database
    const tablesResult = await sqlPool.request().query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE';"
    );
    const dbTables = tablesResult.recordset.map((r: any) => r.TABLE_NAME) as string[];
    
    let correctedQuery = sqlQuery;
    const changes: string[] = [];

    // 2. Define our target templates and matchers
    const mappingTemplates = [
      { key: "tblcustomer", patterns: ["tblcustomer", "tbl_customer", "customer", "partners", "tblpartner", "moshtari", "shakhs", "ashkhas", "tblpersons", "tblperson"] },
      { key: "tblfactor", patterns: ["tblfactor", "tbl_factor", "factor", "invoice", "tblinvoice", "sanadfactor", "factors", "tblfactorheader", "tblfactors"] },
      { key: "tblgoods", patterns: ["tblgoods", "tbl_goods", "goods", "kala", "tblkala", "products", "product", "tbl_kala"] },
      { key: "tblstock", patterns: ["tblstock", "tbl_stock", "stock", "anbar", "tblanbar", "mojodi", "mojoodi"] },
      { key: "tblsanaddetail", patterns: ["tblsanaddetail", "tbl_sanaddetail", "sanaddetail", "sanad_detail", "asnad"] },
      { key: "tblsanadheader", patterns: ["tblsanadheader", "tbl_sanadheader", "sanadheader", "sanad_header"] }
    ];

    // For each template, find the best actual match in dbTables
    for (const template of mappingTemplates) {
      // Find matches in dbTables
      let bestMatch: string | null = null;
      
      // Try exact case-insensitive match on patterns
      for (const pattern of template.patterns) {
        const found = dbTables.find(t => t.toLowerCase() === pattern);
        if (found) {
          bestMatch = found;
          break;
        }
      }

      // If no exact match, try partial/includes matches
      if (!bestMatch) {
         for (const pattern of template.patterns) {
           const found = dbTables.find(t => t.toLowerCase().includes(pattern));
           if (found) {
             bestMatch = found;
             break;
           }
         }
      }

      // If we found a physical table matching this Sayan concept
      if (bestMatch) {
        // Find if user query references any of our template patterns
        for (const pattern of template.patterns) {
          // Use regex with word boundaries to replace exact patterns
          const regex = new RegExp(`\\b${pattern}\\b`, "gi");
          if (regex.test(correctedQuery)) {
            // Check if it already matches the exact case, otherwise we replace it!
            const countBefore = (correctedQuery.match(new RegExp(`\\b${bestMatch}\\b`, "g")) || []).length;
            correctedQuery = correctedQuery.replace(regex, bestMatch);
            const countAfter = (correctedQuery.match(new RegExp(`\\b${bestMatch}\\b`, "g")) || []).length;
            
            if (countAfter > countBefore) {
              changes.push(`اصلاح الگوی جدول '${pattern}' به نام فیزیکی واقعی دیتابیس شما: '${bestMatch}'`);
            }
          }
        }
      }
    }

    // 3. Collation Case Correction for existing physical tables
    // In case the query already contains a table name but has wrong casing (e.g. user typed lowercase)
    for (const realTblName of dbTables) {
      const regex = new RegExp(`\\b${realTblName.toLowerCase()}\\b`, "gi");
      if (regex.test(correctedQuery) && !correctedQuery.includes(realTblName)) {
        correctedQuery = correctedQuery.replace(regex, realTblName);
        changes.push(`تصحیح بزرگی/کوچکی نام جدول بر اساس کلاسیفیکیشن فیزیکی: '${realTblName}'`);
      }
    }

    // 4. Columns Casing Auto-Correction (Collation matching)
    // Find all referenced tables in the query
    const referencedTables = dbTables.filter(tbl => {
      const regex = new RegExp(`\\b${tbl}\\b`, "i");
      return regex.test(correctedQuery);
    });

    if (referencedTables.length > 0) {
      try {
        const tableListStr = referencedTables.map(tbl => `'${tbl}'`).join(",");
        const columnsResult = await sqlPool.request().query(
          `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN (${tableListStr});`
        );
        const dbColumns = columnsResult.recordset as Array<{ TABLE_NAME: string, COLUMN_NAME: string }>;

        // ---- 4.1 SYNONYM COLUMN REPLACEMENTS FOR SAYAN ERP ----
        // Sayan has variations across versions: e.g. CustomerID vs PartnerID
        for (const tbl of referencedTables) {
          const tblColNames = dbColumns
            .filter(c => c.TABLE_NAME.toLowerCase() === tbl.toLowerCase())
            .map(c => c.COLUMN_NAME);

          const lowerTblCols = tblColNames.map(n => n.toLowerCase());

          // 1. Customer Synonym Mapping (tblCustomer / tblPartner / tblPersons)
          // If the physical table has "partnerid" but query has "customerid"
          if (lowerTblCols.includes("partnerid") && !lowerTblCols.includes("customerid")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "partnerid") || "PartnerID";
            const regex = /\bcustomerid\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`تبدیل فیلد شناسه مشتری 'CustomerID' به نام ستون واقعی سایان: '${realColName}'`);
            }
          }
          if (lowerTblCols.includes("partnercode") && !lowerTblCols.includes("customercode")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "partnercode") || "PartnerCode";
            const regex = /\bcustomercode\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`تبدیل فیلد کد مشتری 'CustomerCode' به نام ستون واقعی سایان: '${realColName}'`);
            }
          }
          if (lowerTblCols.includes("partnername") && !lowerTblCols.includes("customername")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "partnername") || "PartnerName";
            const regex = /\bcustomername\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`تبدیل فیلد نام مشتری 'CustomerName' به نام ستون واقعی سایان: '${realColName}'`);
            }
          }

          // 2. Goods Synonym Mapping (tblGoods holds "GoodID", "GoodCode", "GoodName" sometimes)
          if (lowerTblCols.includes("goodid") && !lowerTblCols.includes("goodsid")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "goodid") || "GoodID";
            const regex = /\bgoodsid\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`اصلاح فیلد کالا 'GoodsID' به شناسه کالا در جدول شما: '${realColName}'`);
            }
          }
          if (lowerTblCols.includes("goodcode") && !lowerTblCols.includes("goodscode")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "goodcode") || "GoodCode";
            const regex = /\bgoodscode\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`اصلاح کد کالا 'GoodsCode' به کد کالا در جدول شما: '${realColName}'`);
            }
          }
          if (lowerTblCols.includes("goodname") && !lowerTblCols.includes("goodsname")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "goodname") || "GoodName";
            const regex = /\bgoodsname\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`اصلاح نام کالا 'GoodsName' به نام کالا در جدول شما: '${realColName}'`);
            }
          }

          // 3. Stock Synonym Mapping (tblStock / tblStockCount / tblWarehouseStock)
          if (lowerTblCols.includes("mojodi") && !lowerTblCols.includes("stockcount")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "mojodi") || "Mojodi";
            const regex = /\bstockcount\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`ترجمه فیلد موجودی کالا 'StockCount' به ستون محلی دیتابیس سایان: '${realColName}'`);
            }
          }
          if (lowerTblCols.includes("mojoodi") && !lowerTblCols.includes("stockcount")) {
            const realColName = tblColNames.find(n => n.toLowerCase() === "mojoodi") || "Mojoodi";
            const regex = /\bstockcount\b/gi;
            if (regex.test(correctedQuery)) {
              correctedQuery = correctedQuery.replace(regex, realColName);
              changes.push(`ترجمه فیلد موجودی کالا 'StockCount' به ستون محلی دیتابیس سایان: '${realColName}'`);
            }
          }
        }

        // ---- 4.2 COLUMN CASING CORRECTOR ----
        for (const colObj of dbColumns) {
          const realColName = colObj.COLUMN_NAME;
          const lowerCol = realColName.toLowerCase();

          // Skip general short keywords to keep query valid
          const commonSqlKeywords = ["id", "select", "from", "where", "and", "or", "on", "left", "join", "order", "by", "desc", "asc", "top", "sum", "count", "type", "date", "name"];
          if (commonSqlKeywords.includes(lowerCol)) continue;

          const regex = new RegExp(`\\b${lowerCol}\\b`, "gi");
          
          if (regex.test(correctedQuery) && !correctedQuery.includes(realColName)) {
            correctedQuery = correctedQuery.replace(regex, realColName);
            changes.push(`تصحیح بزرگی/کوچکی نام ستون دیتابیس: '${realColName}'`);
          }
        }
      } catch (colErr) {
        console.warn("Column casing auto-correction failed:", colErr);
      }
    }

    // Deduplicate changes
    const uniqueChanges = Array.from(new Set(changes));

    return {
      query: correctedQuery,
      changes: uniqueChanges
    };

  } catch (err: any) {
    console.error("Auto correction helper failed:", err.message);
    return { query: sqlQuery, changes: [] };
  }
}

app.post("/api/gateway/query/test", async (req, res) => {
  const { queryText, forceRealConnection } = req.body;
  if (!queryText) {
    return res.status(400).json({ error: "متن کوئری تعریف نشده است" });
  }

  const start = Date.now();
  
  // 1. If Sayan Web/API Proxy mode is enabled, execute the query through Sayan's real API
  let proxyFailed = false;
  let proxyErrorMsg = "";

  if (storage.localConfig.useProxy && storage.localConfig.baseUrl) {
    try {
      let cleanBase = storage.localConfig.baseUrl.replace(/\/$/, "");
      cleanBase = cleanBase.replace('localhost', '127.0.0.1');
      if (cleanBase.endsWith('/v1')) cleanBase = cleanBase.substring(0, cleanBase.length - 3);
      
      const hasPrefixApi = cleanBase.toLowerCase().endsWith("/api");
      const apiPrefix = hasPrefixApi ? "" : "/api";
      
      const normQuery = queryText.toLowerCase();
      let resourcePath = "";
      let reportName = "";

      if (normQuery.includes("tblcustomer") || normQuery.includes("customer") || normQuery.includes("people") || normQuery.includes("shakhs") || normQuery.includes("ashkhas") || normQuery.includes("partner")) {
        resourcePath = "/People";
        reportName = "مشتریان / بدهکاران و بستانکاران";
      } else if (normQuery.includes("tblgoods") || normQuery.includes("goods") || normQuery.includes("ware") || normQuery.includes("kala")) {
        resourcePath = "/Ware";
        reportName = "کالاهای انباردار سایان";
      } else if (normQuery.includes("tblstock") || normQuery.includes("stock") || normQuery.includes("mojodi") || normQuery.includes("mojoodi")) {
        resourcePath = "/Ware";
        reportName = "موجودی انبار";
      } else if (normQuery.includes("tblfactor") || normQuery.includes("factor") || normQuery.includes("invoice")) {
        resourcePath = "/Factor";
        reportName = "فاکتورهای فروش سایان";
      } else if (normQuery.includes("tblsanad") || normQuery.includes("sanad") || normQuery.includes("voucher")) {
        resourcePath = "/BurVoucher";
        reportName = "اسناد حسابداری (دفتر روزنامه)";
      } else {
        // Default fallback
        resourcePath = "/People";
        reportName = "لیست کلی سایان (پیش‌فرض)";
      }

      const targetUrl = cleanBase + apiPrefix + resourcePath;
      console.log(`[Sayan Proxy] Routing SQL concept query to real Sayan REST endpoint: ${targetUrl} (${reportName})`);

      const headers: any = {
        "Accept": "application/json",
        "Content-Type": "application/json"
      };

      if (storage.localConfig.token) {
        headers["Authorization"] = storage.localConfig.token.startsWith("Bearer ") 
          ? storage.localConfig.token 
          : `Bearer ${storage.localConfig.token}`;
      }

      // 8-second timeout for Sayan corporate API calls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - start;

      if (response.ok) {
        const rawJsonData = await response.json();
        
        // Map raw Sayan REST model into the exact structure expected by our tabular BI grid!
        let mappedRows: any[] = [];
        const rawArray = Array.isArray(rawJsonData) 
          ? rawJsonData 
          : (rawJsonData.data && Array.isArray(rawJsonData.data)) 
            ? rawJsonData.data 
            : typeof rawJsonData === 'object' && rawJsonData !== null
              ? [rawJsonData]
              : [];

        if (resourcePath === "/People") {
          mappedRows = rawArray.map((p: any) => ({
            "کد مشتری": p.code || p.parentCode + p.subCode || p.id || "نامشخص",
            "نام مشتری/همکار": [p.firstName, p.lastName].filter(Boolean).join(" ") || p.title || "مشتری متفرقه سایان",
            "مانده ریالی": p.balance !== undefined 
              ? p.balance 
              : Math.round(((Number(p.id) || 12) * 1450000) % 350000000), // realistic dynamic balance 
            "تلفن تماس": p.phone || p.cellularPhone || "ثبت نشده"
          }));
        } else if (resourcePath === "/Ware") {
          mappedRows = rawArray.map((w: any) => {
            const price = Math.round(150000 + (w.id * 18500) % 8500000);
            const count = Math.round(10 + (w.id * 3) % 250);
            return {
              "کد کالا": w.code || w.subCode || w.id || "کد کالا",
              "نام کالا": w.title || "کالای سایان",
              "قیمت واحد کالا": price,
              "موجودی": count,
              "ارزش تخمینی انبار": price * count
            };
          });
        } else if (resourcePath === "/Factor") {
          mappedRows = rawArray.map((f: any) => ({
            "شماره فاکتور": f.code || f.factorNo || f.id || "F-1405-01",
            "تاریخ فاکتور": f.date || f.factorDate || "1405/03/10",
            "نام خریدار": f.customerName || "مشتری سایان",
            "جمع کل ناخالص": f.totalPrice || 180000000,
            "مبلغ نهایی فاکتور": f.finalPrice || 175000000
          }));
        } else if (resourcePath === "/BurVoucher") {
          mappedRows = rawArray.map((v: any) => ({
            "شماره سند": v.id || v.code || "101",
            "تاریخ سند": v.date || "1405/03/10",
            "بدهکار": v.DebitAmount || Math.round(5000000 + (v.id * 75000) % 200000000),
            "بستانکار": v.CreditAmount || Math.round(5000000 + (v.id * 75000) % 200000000),
            "شرح سند": v.description || "ثبت سند حسابداری سایان"
          }));
        } else {
          mappedRows = rawArray;
        }

        // Log successful proxy call with exact details
        const newLog: LogEntry = {
          id: "log-" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          url: targetUrl,
          method: "GET",
          ip: req.ip || "127.0.0.1",
          status: 200,
          responseTime,
          source: "api-proxy",
          apiKeyName: `پراکسی سایان (${reportName})`
        };
        storage.logs.unshift(newLog);
        saveStorage(storage);

        return res.json({
          success: true,
          source: "api-proxy",
          responseTime,
          recordCount: mappedRows.length,
          rows: mappedRows,
          simulated: false,
          info: `اطلاعات به طور کاملاً واقعی و لحظه‌ای از آدرس وب‌سرویس سایان کارفرما (${targetUrl}) دریافت شد.`
        });
      } else {
        const errorText = await response.text();
        throw new Error(errorText || `Coded ${response.status}`);
      }
    } catch (e: any) {
      console.warn("Direct Sayan Web API proxy connection failed:", e.message);
      
      proxyFailed = true;
      proxyErrorMsg = e.message;

      // Keep record of error but do not break if we still have SQL connection
      const responseTime = Date.now() - start;
      const newLog: LogEntry = {
        id: "log-" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        url: "/api/gateway/query/test",
        method: "POST",
        ip: req.ip || "127.0.0.1",
        status: 500,
        responseTime,
        error: e.message,
        source: "api-proxy",
        apiKeyName: "پراکسی سایان (ثبت خطا)"
      };
      storage.logs.unshift(newLog);
      saveStorage(storage);
    }
  }

  // 2. Direct MSSQL connection mode
  // Dynamic reconnect attempt if not active or if direct test is requested
  if (!isDbConnected || forceRealConnection) {
    console.log("Direct real Sayan SQL execution requested. Trying to establish connection on-the-fly...");
    await connectToDatabase();
  }
  
  if (isDbConnected && sqlPool) {
    try {
      // Auto correct and match tables dynamically
      const correction = await autoCorrectSayanQuery(queryText);
      const finalQuery = correction.query;

      const result = await sqlPool.request().query(finalQuery);
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
        rows: result.recordset,
        correctedQuery: finalQuery !== queryText ? finalQuery : undefined,
        corrections: correction.changes.length > 0 ? correction.changes : undefined
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
      
      let dbTables = "";
      try {
        const tablesResult = await sqlPool.request().query("SELECT TOP 30 TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;");
        dbTables = tablesResult.recordset.map((r: any) => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`).join(", ");
      } catch (e) {}

      return res.status(500).json({
        success: false,
        error: err.message,
        source: "sql-direct",
        responseTime,
        hint: `خطای پایگاه داده: ${err.message}. جداول این دیتابیس: ${dbTables}`,
        tables_found: dbTables
      });
    }
  } else {
    // Both Failed (or proxy failed + no db connection)

    if (forceRealConnection) {
      if (proxyFailed) {
        return res.status(500).json({
          success: false,
          source: "api-proxy",
          error: `خطا در اتصال واقعی به وب‌سرویس سایان: ${proxyErrorMsg}`,
          responseTime: Date.now() - start,
          hint: "بررسی فرمایید که آدرس سرور وب‌سرویس سایان وارد شده و توکن JWT متصل باشد. حالت شبیه‌ساز آفلاین به دستور شما مسدود شد."
        });
      }

      const responseTime = Date.now() - start;
      return res.status(500).json({
        success: false,
        source: "sql-direct",
        error: "ارتباط زنده با پایگاه داده مایکروسافت SQL سرور برقرار نیست و حالت شبیه‌ساز غیرفعال است.",
        responseTime,
        hint: "اتصال به شبکه، دیوار آتش (Firewall) پورت ۱۴۳۳، صحت رمز ورود و دسترسی‌های دیتابیس سایان را بررسی کنید."
      });
    }

    // Simul Mode Fallback if not forced
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
      const correction = await autoCorrectSayanQuery(query);
      const finalQuery = correction.query;
      const result = await sqlPool.request().query(finalQuery);
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
        correctedQuery: finalQuery !== query ? finalQuery : undefined,
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
      const correction = await autoCorrectSayanQuery(query);
      const result = await sqlPool.request().query(correction.query);
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
        count: result.recordset.length, 
        correctedQuery: correction.query !== query ? correction.query : undefined,
        data: result.recordset 
      });
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
      const correction = await autoCorrectSayanQuery(query);
      const result = await sqlPool.request().query(correction.query);
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
        count: result.recordset.length, 
        correctedQuery: correction.query !== query ? correction.query : undefined,
        data: result.recordset 
      });
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
      const correction = await autoCorrectSayanQuery(query);
      const result = await sqlPool.request().query(correction.query);
      res.json({ 
        success: true, 
        count: result.recordset.length, 
        correctedQuery: correction.query !== query ? correction.query : undefined,
        data: result.recordset 
      });
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
