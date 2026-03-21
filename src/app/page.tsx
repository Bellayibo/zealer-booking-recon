"use client";
import { useState } from "react";

// ─── Statement record (persisted to localStorage) ────────────────────────────

interface StatementRecord {
  id: string;
  listingCode: string;
  address: string;
  ownerName: string;
  bookingPeriod: string;     // label, e.g. "January 2026"
  paymentPeriod: string;     // label, e.g. "March 2026"
  paymentPeriodKey: string;  // sortable, e.g. "2026-03"
  dateIssued: string;
  bookings: {
    checkIn: string; checkOut: string;
    grossAmount: number; bookingCharge: number;
    managementFee: number; payable: number;
  }[];
  status: "draft" | "exported" | "paid";
  exportedAt?: string;
  paidAt?: string;
}

function loadStatementHistory(): StatementRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("statementHistory") ?? "[]"); }
  catch { return []; }
}

function saveStatementHistory(records: StatementRecord[]) {
  localStorage.setItem("statementHistory", JSON.stringify(records));
}

// ─── Bank statement types ────────────────────────────────────────────────────

interface BankTransaction {
  date: string;   // YYYY-MM-DD
  amount: number; // positive = credit
  description: string;
}

function splitCsvLine(line: string): string[] {
  // Handles quoted fields (may contain commas inside quotes)
  const result: string[] = [];
  let inQuote = false, cell = "";
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === "," && !inQuote) { result.push(cell.trim()); cell = ""; }
    else { cell += ch; }
  }
  result.push(cell.trim());
  return result;
}

function parseIsoDate(raw: string): string {
  const dmy = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const ymd = raw.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,"0")}-${ymd[3].padStart(2,"0")}`;
  return "";
}

function parseBankCsv(text: string): BankTransaction[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 1) return [];

  const firstCells = splitCsvLine(lines[0]);

  // CommBank format: no header, col0=DD/MM/YYYY date, col1=+/-amount, col2=description, col3=balance
  const isCommBank = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(firstCells[0] ?? "");

  const txns: BankTransaction[] = [];

  if (isCommBank) {
    for (const line of lines) {
      const c = splitCsvLine(line);
      const date = parseIsoDate(c[0] ?? "");
      if (!date) continue;
      const amount = parseFloat((c[1] ?? "").replace(/[,$\s]/g, ""));
      if (isNaN(amount) || amount <= 0) continue;
      txns.push({ date, amount, description: c[2] ?? "" });
    }
  } else {
    // Generic format with header row
    const header = firstCells.map((h) => h.toLowerCase());
    const dateIdx = header.findIndex((h) => h.includes("date"));
    const amtIdx  = header.findIndex((h) => h.includes("amount") || h === "credit");
    const descIdx = header.findIndex((h) => h.includes("desc") || h.includes("detail") || h.includes("narr") || h.includes("memo"));
    if (dateIdx < 0 || amtIdx < 0) return [];
    for (let i = 1; i < lines.length; i++) {
      const c = splitCsvLine(lines[i]);
      const date = parseIsoDate(c[dateIdx] ?? "");
      if (!date) continue;
      const amount = parseFloat((c[amtIdx] ?? "").replace(/[,$\s]/g, ""));
      if (isNaN(amount) || amount <= 0) continue;
      txns.push({ date, amount, description: c[descIdx] ?? "" });
    }
  }

  return txns;
}

function findBankMatch(payoutAmount: number, payoutDate: string, txns: BankTransaction[]): BankTransaction | null {
  const target = new Date(payoutDate).getTime();
  return txns.find((t) => {
    const diff = Math.abs(new Date(t.date).getTime() - target) / 86400000; // days
    return diff <= 10 && Math.abs(t.amount - payoutAmount) < 1.0;
  }) ?? null;
}

// ─── Booking.com types ───────────────────────────────────────────────────────

interface BookingResult {
  listingCode: string | null;
  bookingDate: string;
  checkIn: string;
  checkOut: string;
  propertyName: string;
  grossAmount: number;
  payoutAmount: number;
  payoutDate: string;
  managementFeeRate?: number;
  status: "ok" | "no_config";
  error: string | null;
  calculation: {
    bookingCharge: number;
    percentage: number;
    nightFee: number;
    nightFeeNet: number;
    cleaningFeeNet: number;
    managementFee: number;
    payable: number;
  } | null;
}

interface BookingSummary {
  total: number;
  matched: number;
  unmatched: number;
  totalGrossAmount: number;
  totalPayable: number;
}

// ─── Guesty types ────────────────────────────────────────────────────────────

interface GuestyResult {
  listingCode: string | null;
  confirmationCode: string;
  creationDate: string;
  checkIn: string;
  checkOut: string;
  propertyName: string;
  // Raw CSV
  totalGuestPayout: number;
  totalPayout: number;
  totalFees: number;
  channelCommission: number;
  processingFees: number;
  netIncome: number;
  commission: number;
  ownerRevenue: number;
  cleaningFeeTo: "host" | "owner" | null;
  // Calculated per formula
  platformPct: number;
  nightFee: number;
  platformChargeNight: number;
  platformChargeCleaning: number;
  nightFeeNet: number;
  cleaningFeeNet: number;
  managementFee: number;
  payable: number;
  // Verification
  expectedRate: number | null;
  actualRate: number | null;
  rateMatch: boolean;
  status: "ok" | "no_config";
}

interface GuestySummary {
  total: number;
  matched: number;
  unmatched: number;
  rateMismatch: number;
  totalGross: number;
  totalNetIncome: number;
  totalCommission: number;
  totalOwnerRevenue: number;
}

// ─── Booking.com tab ─────────────────────────────────────────────────────────

interface ParsedListing {
  code: string;
  propertyName: string;
  defaultCleaningFee: number;
  cleaningFeeTo: string;
  matched: boolean;
}

function BookingTab() {
  const [step, setStep] = useState<1 | 2>(1);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [bookingFile, setBookingFile] = useState<File | null>(null);
  const [parsedListings, setParsedListings] = useState<ParsedListing[]>([]);
  const [cleaningFeeOverrides, setCleaningFeeOverrides] = useState<Record<string, number>>({});
  const [parsing, setParsing] = useState(false);
  const [results, setResults] = useState<BookingResult[]>([]);
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  const [mgmtRateOverrides, setMgmtRateOverrides] = useState<Record<number, string>>({});
  const [cleaningFeeRowOverrides, setCleaningFeeRowOverrides] = useState<Record<number, string>>({});
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [receivedOverrides, setReceivedOverrides] = useState<Record<number, boolean | null>>({});
  const [bankParseError, setBankParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Unified recalculator: applies per-row cleaning fee and/or mgmt rate overrides
  const getEffective = (r: BookingResult, i: number): { cleaningFee: number; nightFeeNet: number; managementFee: number; payable: number } | null => {
    if (!r.calculation) return null;
    const cfStr = cleaningFeeRowOverrides[i];
    const cfNum = cfStr !== undefined && cfStr !== "" ? parseFloat(cfStr) : NaN;
    const mgmtStr = mgmtRateOverrides[i];
    const mgmtRateNum = mgmtStr !== undefined && mgmtStr !== "" ? parseFloat(mgmtStr) / 100 : NaN;

    // Fast path: no overrides
    if (isNaN(cfNum) && isNaN(mgmtRateNum)) {
      return {
        cleaningFee: r.grossAmount - r.calculation.nightFee,
        nightFeeNet: r.calculation.nightFeeNet,
        managementFee: r.calculation.managementFee,
        payable: r.calculation.payable,
      };
    }
    const cleaningFee = !isNaN(cfNum) ? cfNum : (r.grossAmount - r.calculation.nightFee);
    const nightFee = r.grossAmount - cleaningFee;
    const nightFeeNet = nightFee * (1 - r.calculation.percentage);
    // cleaningFeeNet = cleaningFee * (1 - percentage), same as calculator.ts formula
    const cleaningFeeNet = r.calculation.cleaningFeeNet > 0 ? cleaningFee * (1 - r.calculation.percentage) : 0;
    const mgmtRate = !isNaN(mgmtRateNum) ? mgmtRateNum : (r.managementFeeRate ?? 0);
    const managementFee = nightFeeNet * mgmtRate;
    return { cleaningFee, nightFeeNet, managementFee, payable: nightFeeNet - managementFee + cleaningFeeNet };
  };

  // Keep old names as aliases so generate button code still works
  const effectiveMgmtFee = (r: BookingResult, i: number) => getEffective(r, i)?.managementFee ?? null;
  const effectivePayable  = (r: BookingResult, i: number) => getEffective(r, i)?.payable ?? null;

  const handleFileChange = async (file: File | null) => {
    setBookingFile(file);
    setParsedListings([]);
    setCleaningFeeOverrides({});
    if (!file) return;
    setParsing(true);
    setError(null);
    const fd = new FormData();
    fd.append("bookingComCsv", file);
    const res = await fetch("/api/parse-listings", { method: "POST", body: fd });
    const data = await res.json();
    if (data.success) {
      setParsedListings(data.listings);
      const defaults: Record<string, number> = {};
      for (const l of data.listings) {
        if (l.matched) defaults[l.code] = l.defaultCleaningFee;
      }
      setCleaningFeeOverrides(defaults);
    } else {
      setError(data.error || "解析失败");
    }
    setParsing(false);
  };

  const handleCalculate = async () => {
    if (!bookingFile) { setError("请上传 Booking.com CSV 文件"); return; }
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("bookingComCsv", bookingFile);
    fd.append("period", period);
    fd.append("cleaningFeeOverrides", JSON.stringify(cleaningFeeOverrides));
    const res = await fetch("/api/calculate", { method: "POST", body: fd });
    const data = await res.json();
    if (data.success) {
      setResults(data.data.results);
      setSummary(data.data.summary);
      setStep(2);
    } else {
      setError(data.error || "计算失败");
    }
    setLoading(false);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    const res = await fetch("/api/export/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, period }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OTA_Summary_${period}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      setError("导出 Excel 失败");
    }
    setExporting(false);
  };

  const handlePrintStatement = (listingCode: string) => {
    window.open(
      `/statement?period=${period}&listing=${listingCode}&data=${encodeURIComponent(JSON.stringify(results))}`,
      "_blank"
    );
  };

  return (
    <div>
      <div className="flex gap-4 mb-8">
        {([1, 2] as const).map((s) => (
          <div key={s} className={`flex items-center gap-2 text-sm ${step >= s ? "text-blue-600 font-semibold" : "text-gray-400"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= s ? "bg-blue-600 text-white" : "bg-gray-200"}`}>{s}</span>
            {s === 1 ? "上传" : "核对 & 导出"}
            {s < 2 && <span className="ml-4 text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

      {step === 1 && (
        <div className="max-w-2xl">
          <div className="bg-white border rounded-lg p-6 mb-4">
            <h2 className="font-semibold mb-4">上传账单</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">对账月份</label>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Booking.com CSV *</label>
              <input type="file" accept=".csv" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} className="text-sm" />
              <p className="text-xs text-gray-500 mt-1">从 Booking.com 后台下载：Finance → Statements → Export</p>
            </div>
            {parsing && <p className="text-sm text-gray-500">解析中...</p>}
          </div>

          {parsedListings.length > 0 && (
            <div className="bg-white border rounded-lg p-6 mb-4">
              <h2 className="font-semibold mb-1">确认清洁费</h2>
              <p className="text-xs text-gray-500 mb-4">系统已读取到以下房源，可按实际金额修改清洁费后再计算。</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500 text-xs">
                    <th className="text-left pb-2 font-medium">代码</th>
                    <th className="text-left pb-2 font-medium">房源名称</th>
                    <th className="text-center pb-2 font-medium">归属</th>
                    <th className="text-right pb-2 font-medium">清洁费 (AUD)</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedListings.map((l) => (
                    <tr key={l.code || l.propertyName} className="border-b last:border-0">
                      <td className="py-2 font-mono text-sm">
                        {l.matched ? l.code : <span className="text-orange-500 text-xs">⚠️ 未匹配</span>}
                      </td>
                      <td className="py-2 text-gray-600 text-xs pr-4">{l.propertyName.substring(0, 40)}</td>
                      <td className="py-2 text-center text-xs text-gray-500">{l.cleaningFeeTo === "owner" ? "业主" : "平台"}</td>
                      <td className="py-2 text-right">
                        {l.matched ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={cleaningFeeOverrides[l.code] ?? l.defaultCleaningFee}
                            onChange={(e) => setCleaningFeeOverrides((prev) => ({ ...prev, [l.code]: Number(e.target.value) }))}
                            className="border rounded px-2 py-1 text-sm text-right w-24"
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={handleCalculate}
            disabled={loading || !bookingFile || parsing}
            className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "计算中..." : "开始计算 →"}
          </button>
        </div>
      )}

      {step === 2 && summary && (
        <div>
          {(() => {
            const totalPlatformFee = results.reduce((s, r) => s + (r.calculation?.bookingCharge ?? 0), 0);
            const totalMgmtFee = results.reduce((s, r, i) => s + (effectiveMgmtFee(r, i) ?? 0), 0);
            const totalEffectivePayable = results.reduce((s, r, i) => s + (effectivePayable(r, i) ?? 0), 0);
            return (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">预订笔数</div>
              <div className="text-2xl font-bold">{summary.total}</div>
              {summary.unmatched > 0 && <div className="text-xs text-orange-600 mt-1">⚠️ {summary.unmatched} 条无匹配配置</div>}
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">客人付款总额 (Gross)</div>
              <div className="text-2xl font-bold">${summary.totalGrossAmount.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">客人实际支付给 Booking.com 的金额</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">平台手续费合计</div>
              <div className="text-2xl font-bold text-red-600">-${totalPlatformFee.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">Booking.com 扣留（佣金 + 手续费 + VAT）</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">管理费合计 (Host 收入)</div>
              <div className="text-2xl font-bold text-orange-600">-${totalMgmtFee.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">Zealer 管理费（从房东净收入扣除）</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">应付房东合计</div>
              <div className="text-2xl font-bold text-green-700">${totalEffectivePayable.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">扣除平台费及管理费后付给房东</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">对账月份</div>
              <div className="text-2xl font-bold">{period}</div>
            </div>
          </div>
            );
          })()}

          {/* Bank statement upload */}
          <div className="bg-white border rounded-lg p-4 mb-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium whitespace-nowrap">🏦 上传银行流水</span>
              <input
                type="file"
                accept=".csv"
                className="text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setBankParseError(null);
                  setReceivedOverrides({});
                  if (!file) { setBankTransactions([]); return; }
                  file.text().then((text) => {
                    const txns = parseBankCsv(text);
                    if (txns.length === 0) setBankParseError("无法解析银行流水，请检查 CSV 格式（需含 Date、Amount 列）");
                    else setBankTransactions(txns);
                  });
                }}
              />
            </div>
            {bankTransactions.length > 0 && (
              <span className="text-xs text-green-600">✓ 已读取 {bankTransactions.length} 条流水记录</span>
            )}
            {bankParseError && <span className="text-xs text-red-600">{bankParseError}</span>}
            {bankTransactions.length > 0 && (
              <span className="text-xs text-gray-400">自动匹配金额误差 ≤$0.50，日期误差 ≤7天；可手动覆盖</span>
            )}
          </div>

          <div className="bg-white border rounded-lg overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium">房源</th>
                  <th className="text-left p-3 font-medium">入住期间</th>
                  <th className="text-right p-3 font-medium">Gross</th>
                  <th className="text-right p-3 font-medium">平台费</th>
                  <th className="text-right p-3 font-medium">清洁费</th>
                  <th className="text-right p-3 font-medium">管理费%</th>
                  <th className="text-right p-3 font-medium">管理费</th>
                  <th className="text-right p-3 font-medium font-bold">Payable</th>
                  <th className="text-right p-3 font-medium">BDC打款</th>
                  <th className="text-center p-3 font-medium">打款日期</th>
                  <th className="text-center p-3 font-medium">到账</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const eff = getEffective(r, i);
                  const mgmt = eff?.managementFee ?? null;
                  const payable = eff?.payable ?? null;
                  const defaultCleaningFee = r.calculation ? (r.grossAmount - r.calculation.nightFee).toFixed(0) : "";
                  const defaultRate = r.managementFeeRate != null ? (r.managementFeeRate * 100).toFixed(0) : "";
                  const autoMatch = bankTransactions.length > 0
                    ? findBankMatch(r.payoutAmount, r.payoutDate, bankTransactions)
                    : null;
                  const override = receivedOverrides[i]; // true | false | null | undefined
                  const received = override !== undefined && override !== null ? override : (autoMatch !== null && bankTransactions.length > 0 ? true : null);
                  const rowBg = r.status === "no_config" ? "bg-orange-50"
                    : received === false ? "bg-red-50"
                    : received === true ? "bg-green-50"
                    : "hover:bg-gray-50";
                  return (
                  <tr key={i} className={`border-t ${rowBg}`}>
                    <td className="p-3 font-mono text-sm">
                      {r.listingCode ?? <span className="text-orange-600 text-xs">⚠️ {r.propertyName.substring(0, 20)}...</span>}
                    </td>
                    <td className="p-3 text-gray-600">{r.checkIn} → {r.checkOut}</td>
                    <td className="p-3 text-right">${r.grossAmount.toFixed(2)}</td>
                    <td className="p-3 text-right text-red-600">{r.calculation ? `-$${r.calculation.bookingCharge.toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-right">
                      {r.calculation ? (
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            min="0"
                            step="5"
                            placeholder={defaultCleaningFee}
                            value={cleaningFeeRowOverrides[i] ?? ""}
                            onChange={(e) => setCleaningFeeRowOverrides((prev) => ({ ...prev, [i]: e.target.value }))}
                            className={`border rounded px-1 py-0.5 text-sm text-right w-20 ${cleaningFeeRowOverrides[i] ? "border-amber-400 bg-amber-50" : "border-gray-200 text-gray-500"}`}
                          />
                        </div>
                      ) : "-"}
                    </td>
                    <td className="p-3 text-right">
                      {r.calculation ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            placeholder={defaultRate}
                            value={mgmtRateOverrides[i] ?? ""}
                            onChange={(e) => setMgmtRateOverrides((prev) => ({ ...prev, [i]: e.target.value }))}
                            className="border rounded px-1 py-0.5 text-sm text-right w-16"
                          />
                          <span className="text-gray-400 text-xs">%</span>
                        </div>
                      ) : "-"}
                    </td>
                    <td className="p-3 text-right text-orange-600">{mgmt != null ? `-$${mgmt.toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-right font-bold text-green-700">{payable != null ? `$${payable.toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-right text-gray-500">${r.payoutAmount.toFixed(2)}</td>
                    <td className="p-3 text-center text-xs text-gray-500">
                      {r.payoutDate || "-"}
                      {autoMatch && <div className="text-green-600 text-xs">{autoMatch.date}</div>}
                    </td>
                    <td className="p-3 text-center">
                      {received === true && override === undefined ? (
                        // Auto-matched, allow manual override
                        <button title="自动匹配 — 点击标记未到账" onClick={() => setReceivedOverrides((p) => ({ ...p, [i]: false }))}
                          className="text-green-600 font-bold text-base">✓</button>
                      ) : received === true && override === true ? (
                        <button title="手动确认 — 点击取消" onClick={() => setReceivedOverrides((p) => ({ ...p, [i]: null }))}
                          className="text-green-700 font-bold text-base">✓</button>
                      ) : received === false ? (
                        <button title="标记未到账 — 点击恢复" onClick={() => setReceivedOverrides((p) => ({ ...p, [i]: null }))}
                          className="text-red-500 font-bold text-base">✗</button>
                      ) : (
                        // No match, no override
                        <div className="flex gap-1 justify-center">
                          <button title="手动标记已到账" onClick={() => setReceivedOverrides((p) => ({ ...p, [i]: true }))}
                            className="text-gray-300 hover:text-green-600 text-base font-bold">✓</button>
                          <button title="标记未到账" onClick={() => setReceivedOverrides((p) => ({ ...p, [i]: false }))}
                            className="text-gray-300 hover:text-red-500 text-base font-bold">✗</button>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {r.status === "ok" && r.listingCode && (
                        <button onClick={() => handlePrintStatement(r.listingCode!)} className="text-blue-600 hover:underline text-xs">月报</button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={() => { setStep(1); setCleaningFeeRowOverrides({}); setMgmtRateOverrides({}); }} className="border px-4 py-2 rounded text-sm hover:bg-gray-50">← 重新上传</button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {exporting ? "导出中..." : "📥 导出 Excel 汇总"}
            </button>
            <button
              onClick={() => {
                const LISTING_META: Record<string, { address: string; ownerName: string }> = {
                  "1-24":   { address: "1/24 Wolseley Street Mosman NSW 2088",             ownerName: "Zerong Chen" },
                  "2-1":    { address: "2/1 Bariston Avenue Cremorne NSW 2090",             ownerName: "Shuna Liu" },
                  "4-12":   { address: "4/12 Clifford Street Mosman NSW 2088",              ownerName: "Hoi Ling Tsoi" },
                  "4-122":  { address: "4/122 Milsons Point Avenue Milsons Point NSW 2061", ownerName: "" },
                  "6-40":   { address: "6/40 Humphreys Road Kirribilli NSW 2061",           ownerName: "" },
                  "118A":   { address: "5/118A Kirribilli Avenue Kirribilli NSW 2061",       ownerName: "CK Ng" },
                  "563A":   { address: "563A Castlereagh Street Sydney NSW 2000",            ownerName: "" },
                  "7-108":  { address: "7/108 Ben Boyd Road Neutral Bay NSW 2089",          ownerName: "" },
                  "10-25":  { address: "10/25 Lavender Street Milsons Point NSW 2061",      ownerName: "" },
                  "620":    { address: "620 George Street Sydney NSW 2000",                 ownerName: "" },
                  "579B":   { address: "579B George Street Sydney NSW 2000",                ownerName: "" },
                  "517":    { address: "517 Kent Street Sydney NSW 2000",                   ownerName: "" },
                  "Ultimo": { address: "5 West End Lane Ultimo NSW 2007",                   ownerName: "" },
                };

                // Group by listingCode + bank receipt month
                // key = "listingCode|YYYY-MM"
                const byListingMonth: Record<string, { checkIn: string; checkOut: string; grossAmount: number; bookingCharge: number; managementFee: number; payable: number; }[]> = {};
                results.forEach((r, i) => {
                  if (!r.listingCode || !r.calculation) return;
                  const autoMatchTxn = bankTransactions.length > 0 ? findBankMatch(r.payoutAmount, r.payoutDate, bankTransactions) : null;
                  const override = receivedOverrides[i];
                  const received = override !== undefined && override !== null ? override : (autoMatchTxn !== null && bankTransactions.length > 0);
                  if (!received) return;

                  // Payment month = bank receipt date month; fallback to BDC payout date month
                  const pmKey = autoMatchTxn?.date.substring(0, 7) ?? r.payoutDate.substring(0, 7) ?? period;
                  const groupKey = `${r.listingCode}|${pmKey}`;
                  if (!byListingMonth[groupKey]) byListingMonth[groupKey] = [];
                  const eff = getEffective(r, i);
                  byListingMonth[groupKey].push({
                    checkIn: r.checkIn, checkOut: r.checkOut,
                    grossAmount: r.grossAmount,
                    bookingCharge: r.calculation.bookingCharge,
                    managementFee: eff?.managementFee ?? r.calculation.managementFee,
                    payable: eff?.payable ?? r.calculation.payable,
                  });
                });

                if (Object.keys(byListingMonth).length === 0) {
                  alert("没有已确认到账的预订，请先在「到账」列确认收款。");
                  return;
                }

                const bookingPeriodLabel = new Date(period + "-01").toLocaleDateString("en-AU", { month: "long", year: "numeric" });

                const newRecords: StatementRecord[] = Object.entries(byListingMonth).map(([groupKey, bookings]) => {
                  const [listingCode, pmKey] = groupKey.split("|");
                  const [pmYear, pmMonth] = pmKey.split("-").map(Number);
                  const paymentPeriodLabel = new Date(pmYear, pmMonth - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
                  // Date Issued = payment month (no specific day)
                  const dateIssued = new Date(pmYear, pmMonth - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
                  return {
                    id: `${Date.now()}-${listingCode}-${pmKey}`,
                    listingCode,
                    address: LISTING_META[listingCode]?.address ?? listingCode,
                    ownerName: LISTING_META[listingCode]?.ownerName ?? "",
                    bookingPeriod: bookingPeriodLabel,
                    paymentPeriod: paymentPeriodLabel,
                    paymentPeriodKey: pmKey,
                    dateIssued,
                    bookings,
                    status: "draft" as const,
                  };
                });

                // Save to localStorage history
                const existing = loadStatementHistory();
                saveStatementHistory([...existing, ...newRecords]);

                // Pass to statement page
                sessionStorage.setItem("ownerStatements", JSON.stringify(newRecords));
                window.open("/owner-statement", "_blank");
              }}
              className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800"
            >
              📄 生成 Owner Statements
            </button>
            <span className="text-xs text-gray-400 self-center">仅生成已确认到账（绿色）的房源 · 自动存档到「Statements」标签</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manual row (added by user in Guesty tab) ────────────────────────────────

interface ManualRow {
  id: number;
  listingCode: string;
  channel: string;
  checkIn: string;
  checkOut: string;
  amount: string;
  platformPct: string;   // e.g. "18.59"
  cleaningFee: string;
  cleaningFeeTo: "owner" | "host";
  hostMgmtRate: string;  // e.g. "20"
}

function calcManual(r: ManualRow) {
  const gross       = parseFloat(r.amount)      || 0;
  const cleaning    = parseFloat(r.cleaningFee) || 0;
  const platPct     = (parseFloat(r.platformPct)  || 0) / 100;
  const mgmtRate    = (parseFloat(r.hostMgmtRate) || 0) / 100;
  const nightFee    = gross - cleaning;
  const platNight   = nightFee  * platPct;
  const platClean   = cleaning  * platPct;
  const nightFeeNet = nightFee  * (1 - platPct);
  const cleanNet    = cleaning  * (1 - platPct);
  const mgmtFee     = nightFeeNet * mgmtRate;
  const payable     = nightFeeNet - mgmtFee + (r.cleaningFeeTo === "owner" ? cleanNet : 0);
  return { nightFee, platNight, platClean, nightFeeNet, cleanNet, mgmtFee, payable };
}

// ─── Guesty tab ───────────────────────────────────────────────────────────────

function GuestyTab() {
  const [step, setStep] = useState<1 | 2>(1);
  const [guestyFile, setGuestyFile] = useState<File | null>(null);
  const [results, setResults] = useState<GuestyResult[]>([]);
  const [summary, setSummary] = useState<GuestySummary | null>(null);
  const [gPlatformOverrides, setGPlatformOverrides] = useState<Record<number, string>>({});
  const [gCleaningOverrides, setGCleaningOverrides] = useState<Record<number, string>>({});
  const [gMgmtOverrides, setGMgmtOverrides] = useState<Record<number, string>>({});
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [gBankTransactions, setGBankTransactions] = useState<BankTransaction[]>([]);
  const [gReceivedOverrides, setGReceivedOverrides] = useState<Record<number, boolean | null>>({});
  const [gBankParseError, setGBankParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const addManualRow = () => setManualRows((prev) => [...prev, {
    id: Date.now(),
    listingCode: "", channel: "", checkIn: "", checkOut: "",
    amount: "", platformPct: "", cleaningFee: "", cleaningFeeTo: "owner", hostMgmtRate: "20",
  }]);

  const updateManualRow = (id: number, patch: Partial<ManualRow>) =>
    setManualRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));

  const deleteManualRow = (id: number) =>
    setManualRows((prev) => prev.filter((r) => r.id !== id));

  // Recalculate using the spreadsheet formula when user overrides cleaning fee or mgmt rate
  const getGuestyEffective = (r: GuestyResult, i: number) => {
    const cfStr   = gCleaningOverrides[i];
    const mgmtStr = gMgmtOverrides[i];
    const platStr = gPlatformOverrides[i];
    const cleaningOverride  = cfStr   !== undefined && cfStr   !== "" ? parseFloat(cfStr)   : NaN;
    const mgmtRateOverride  = mgmtStr !== undefined && mgmtStr !== "" ? parseFloat(mgmtStr) / 100 : NaN;
    const platformPctOverride = platStr !== undefined && platStr !== "" ? parseFloat(platStr) / 100 : NaN;

    const cleaningFee  = !isNaN(cleaningOverride)   ? cleaningOverride   : r.totalFees;
    const mgmtRate     = !isNaN(mgmtRateOverride)   ? mgmtRateOverride   : (r.expectedRate ?? 0);
    const platformPct  = !isNaN(platformPctOverride) ? platformPctOverride : r.platformPct;
    const gross        = r.totalGuestPayout;

    const nightFee              = gross - cleaningFee;
    const platformChargeNight   = nightFee * platformPct;
    const platformChargeCleaning = cleaningFee * platformPct;
    const nightFeeNet           = nightFee * (1 - platformPct);
    const cleaningFeeNet        = cleaningFee * (1 - platformPct);
    const managementFee         = nightFeeNet * mgmtRate;
    const payable               = nightFeeNet - managementFee
      + (r.cleaningFeeTo === "owner" ? cleaningFeeNet : 0);

    return { cleaningFee, nightFee, platformChargeNight, platformChargeCleaning, nightFeeNet, cleaningFeeNet, managementFee, payable };
  };

  const handleCalculate = async () => {
    if (!guestyFile) { setError("请上传 Guesty CSV 文件"); return; }
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("guestyCsv", guestyFile);
    const res = await fetch("/api/guesty/calculate", { method: "POST", body: fd });
    const data = await res.json();
    if (data.success) {
      const fetchedResults: GuestyResult[] = data.data.results;
      setResults(fetchedResults);
      setSummary(data.data.summary);
      // Pre-fill defaults: mgmt rate from expectedRate, cleaning fee from LISTINGS config
      const defaultCleaning: Record<number, string> = {};
      const defaultMgmt: Record<number, string> = {};
      const defaultPlatform: Record<number, string> = {};
      fetchedResults.forEach((r, i) => {
        if (r.expectedRate != null) defaultMgmt[i] = (r.expectedRate * 100).toFixed(0);
        if (r.totalFees > 0) defaultCleaning[i] = String(r.totalFees);
        defaultPlatform[i] = (r.platformPct * 100).toFixed(4);
      });
      setGCleaningOverrides(defaultCleaning);
      setGMgmtOverrides(defaultMgmt);
      setGPlatformOverrides(defaultPlatform);
      setStep(2);
    } else {
      setError(data.error || "计算失败");
    }
    setLoading(false);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    const res = await fetch("/api/guesty/export/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Guesty_Summary_${new Date().toISOString().substring(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      setError("导出 Excel 失败");
    }
    setExporting(false);
  };

  const channelLabel = (code: string) => {
    if (code.startsWith("GY-")) return <span className="text-purple-600 text-xs">Guesty</span>;
    if (code.startsWith("BC-")) return <span className="text-blue-600 text-xs">BDC</span>;
    return <span className="text-gray-400 text-xs">-</span>;
  };

  return (
    <div>
      <div className="flex gap-4 mb-8">
        {([1, 2] as const).map((s) => (
          <div key={s} className={`flex items-center gap-2 text-sm ${step >= s ? "text-purple-600 font-semibold" : "text-gray-400"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= s ? "bg-purple-600 text-white" : "bg-gray-200"}`}>{s}</span>
            {s === 1 ? "上传" : "核对 & 导出"}
            {s < 2 && <span className="ml-4 text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

      {step === 1 && (
        <div className="bg-white border rounded-lg p-6 max-w-md">
          <h2 className="font-semibold mb-4">上传 Guesty 账单</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Guesty CSV *</label>
            <input type="file" accept=".csv" onChange={(e) => setGuestyFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <p className="text-xs text-gray-500 mt-1">从 Guesty 后台导出：Reservations → Export CSV（含财务列）</p>
          </div>
          <button
            onClick={handleCalculate}
            disabled={loading || !guestyFile}
            className="bg-purple-600 text-white px-6 py-2 rounded text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? "计算中..." : "开始对账 →"}
          </button>
        </div>
      )}

      {step === 2 && summary && (
        <div>
          {(() => {
            const totalMgmt    = results.reduce((s, r, i) => s + getGuestyEffective(r, i).managementFee, 0)
              + manualRows.reduce((s, mr) => s + calcManual(mr).mgmtFee, 0);
            const totalPayable = results.reduce((s, r, i) => s + getGuestyEffective(r, i).payable, 0)
              + manualRows.reduce((s, mr) => s + calcManual(mr).payable, 0);
            return (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">预订笔数</div>
              <div className="text-2xl font-bold">{summary.total}</div>
              {summary.unmatched > 0 && <div className="text-xs text-orange-600 mt-1">⚠️ {summary.unmatched} 未匹配</div>}
              {summary.rateMismatch > 0 && <div className="text-xs text-red-600 mt-1">❌ {summary.rateMismatch} 费率不符</div>}
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">客人付款总额 (Gross)</div>
              <div className="text-2xl font-bold">${summary.totalGross.toFixed(2)}</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Host 管理费合计</div>
              <div className="text-2xl font-bold text-orange-600">-${totalMgmt.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">房管费（从 Night Fee Net 扣除）</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">应付房东合计 (Payable)</div>
              <div className="text-2xl font-bold text-green-700">${totalPayable.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">Night Fee Net − Host 管理费 [+ 清洁费 Net]</div>
            </div>
          </div>
            );
          })()}

          {/* Bank statement upload */}
          <div className="bg-white border rounded-lg p-4 mb-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium whitespace-nowrap">🏦 上传银行流水</span>
              <input
                type="file"
                accept=".csv"
                className="text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setGBankParseError(null);
                  setGReceivedOverrides({});
                  if (!file) { setGBankTransactions([]); return; }
                  file.text().then((text) => {
                    const txns = parseBankCsv(text);
                    if (txns.length === 0) setGBankParseError("无法解析银行流水，请检查格式");
                    else setGBankTransactions(txns);
                  });
                }}
              />
            </div>
            {gBankTransactions.length > 0 && <span className="text-xs text-green-600">✓ 已读取 {gBankTransactions.length} 条流水</span>}
            {gBankParseError && <span className="text-xs text-red-600">{gBankParseError}</span>}
            {gBankTransactions.length > 0 && <span className="text-xs text-gray-400">自动匹配金额误差 ≤$1.00，日期误差 ≤10天</span>}
          </div>

          <div className="bg-white border rounded-lg overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium">房源</th>
                  <th className="text-left p-3 font-medium">渠道</th>
                  <th className="text-left p-3 font-medium">创建日期</th>
                  <th className="text-left p-3 font-medium">入住期间</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-right p-3 font-medium">平台费%</th>
                  <th className="text-right p-3 font-medium">Night Fee</th>
                  <th className="text-right p-3 font-medium text-red-500">房费 Platform</th>
                  <th className="text-right p-3 font-medium">清洁费</th>
                  <th className="text-right p-3 font-medium text-red-500">清洁 Platform</th>
                  <th className="text-right p-3 font-medium">Night Fee Net</th>
                  <th className="text-right p-3 font-medium">Host 管理费%</th>
                  <th className="text-right p-3 font-medium text-orange-500">Host 管理费</th>
                  <th className="text-right p-3 font-medium font-bold">Payable</th>
                  <th className="text-right p-3 font-medium text-blue-600">银行应收</th>
                  <th className="p-3 text-left font-medium">到账日期</th>
                  <th className="p-3 text-center font-medium">到账</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const eff = getGuestyEffective(r, i);
                  const defaultMgmtRate = r.expectedRate != null ? (r.expectedRate * 100).toFixed(0) : "";
                  // Bank receipt = what platform actually sends: TGP - (channelCommission + processingFees) * 1.1
                  const bankReceipt = r.totalGuestPayout - (r.channelCommission + r.processingFees) * 1.1;
                  const autoMatch = gBankTransactions.length > 0 ? findBankMatch(bankReceipt, r.checkOut, gBankTransactions) : null;
                  const override = gReceivedOverrides[i];
                  const received = override !== undefined && override !== null ? override : (autoMatch !== null && gBankTransactions.length > 0 ? true : null);
                  const rowBg = r.status === "no_config" ? "bg-orange-50"
                    : received === false ? "bg-red-50"
                    : received === true ? "bg-green-50"
                    : !r.rateMatch ? "bg-yellow-50"
                    : "hover:bg-gray-50";
                  return (
                  <tr key={i} className={`border-t ${rowBg}`}>
                    <td className="p-1 font-mono text-xs">
                      {r.listingCode ?? <span className="text-orange-600 text-xs">⚠️ 未匹配</span>}
                    </td>
                    <td className="p-1 text-xs">{channelLabel(r.confirmationCode)}</td>
                    <td className="p-1 text-xs text-gray-500 whitespace-nowrap">{r.creationDate}</td>
                    <td className="p-1 text-xs text-gray-600 whitespace-nowrap">{r.checkIn} → {r.checkOut}</td>
                    <td className="p-1 text-right text-xs">
                      ${r.totalGuestPayout.toFixed(2)}
                      {Math.abs(r.totalPayout - r.totalGuestPayout) > 0.01 && (
                        <span title={`TOTAL PAYOUT=$${r.totalPayout.toFixed(2)}，与 TOTAL GUEST PAYOUT 不一致，请人工核实`} className="ml-1 text-amber-500 cursor-help">⚠️</span>
                      )}
                    </td>
                    <td className="p-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={gPlatformOverrides[i] ?? ""}
                          onChange={(e) => setGPlatformOverrides((prev) => ({ ...prev, [i]: e.target.value }))}
                          className="w-14 border rounded px-1 py-0.5 text-xs text-right"
                        />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                    </td>
                    <td className="p-1 text-right text-xs">${eff.nightFee.toFixed(2)}</td>
                    <td className="p-1 text-right text-xs text-red-500">-${eff.platformChargeNight.toFixed(2)}</td>
                    <td className="p-1 text-right">
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={gCleaningOverrides[i] ?? ""}
                        onChange={(e) => setGCleaningOverrides((prev) => ({ ...prev, [i]: e.target.value }))}
                        className={`w-16 border rounded px-1 py-0.5 text-xs text-right ${gCleaningOverrides[i] ? "border-amber-400 bg-amber-50" : ""}`}
                      />
                    </td>
                    <td className="p-1 text-right text-xs text-red-500">-${eff.platformChargeCleaning.toFixed(2)}</td>
                    <td className="p-1 text-right text-xs text-gray-600">${eff.nightFeeNet.toFixed(2)}</td>
                    <td className="p-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={gMgmtOverrides[i] ?? ""}
                          onChange={(e) => setGMgmtOverrides((prev) => ({ ...prev, [i]: e.target.value }))}
                          placeholder={defaultMgmtRate}
                          className="w-14 border rounded px-1 py-0.5 text-xs text-right"
                        />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                    </td>
                    <td className="p-1 text-right text-xs text-orange-600">-${eff.managementFee.toFixed(2)}</td>
                    <td className="p-1 text-right text-xs font-bold text-green-700">${eff.payable.toFixed(2)}</td>
                    <td className="p-1 text-right text-xs font-semibold text-blue-700">${bankReceipt.toFixed(2)}</td>
                    <td className="p-1 text-xs text-gray-600 whitespace-nowrap">
                      {autoMatch ? new Date(autoMatch.date).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
                    </td>
                    <td className="p-1 text-center">
                      {(() => {
                        if (received === true && override === undefined) return (
                          <button title="自动匹配 — 点击标记未到账" onClick={() => setGReceivedOverrides(p => ({...p, [i]: false}))} className="text-green-600 font-bold text-base">✓</button>
                        );
                        if (received === true && override === true) return (
                          <button title="手动确认 — 点击取消" onClick={() => setGReceivedOverrides(p => ({...p, [i]: null}))} className="text-green-700 font-bold text-base">✓</button>
                        );
                        if (received === false) return (
                          <button title="标记未到账 — 点击恢复" onClick={() => setGReceivedOverrides(p => ({...p, [i]: null}))} className="text-red-500 font-bold text-base">✗</button>
                        );
                        return (
                          <div className="flex gap-1 justify-center">
                            <button title="手动标记已到账" onClick={() => setGReceivedOverrides(p => ({...p, [i]: true}))} className="text-gray-300 hover:text-green-600 text-base font-bold">✓</button>
                            <button title="标记未到账" onClick={() => setGReceivedOverrides(p => ({...p, [i]: false}))} className="text-gray-300 hover:text-red-500 text-base font-bold">✗</button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                  );
                })}
                {/* ── Manual rows ── */}
                {manualRows.map((mr) => {
                  const c = calcManual(mr);
                  return (
                    <tr key={mr.id} className="border-t bg-blue-50">
                      <td className="p-1">
                        <input value={mr.listingCode} onChange={(e) => updateManualRow(mr.id, { listingCode: e.target.value })}
                          placeholder="代码" className="w-16 border rounded px-1 py-1 text-xs" />
                      </td>
                      <td className="p-1">
                        <input value={mr.channel} onChange={(e) => updateManualRow(mr.id, { channel: e.target.value })}
                          placeholder="渠道" className="w-16 border rounded px-1 py-1 text-xs" />
                      </td>
                      <td className="p-1 text-xs text-gray-400">—</td>
                      <td className="p-1">
                        <div className="flex items-center gap-1 text-xs">
                          <input type="date" value={mr.checkIn} onChange={(e) => updateManualRow(mr.id, { checkIn: e.target.value })}
                            className="border rounded px-1 py-1 text-xs w-28" />
                          <span>→</span>
                          <input type="date" value={mr.checkOut} onChange={(e) => updateManualRow(mr.id, { checkOut: e.target.value })}
                            className="border rounded px-1 py-1 text-xs w-28" />
                        </div>
                      </td>
                      <td className="p-1 text-right">
                        <input type="number" min="0" step="1" value={mr.amount} onChange={(e) => updateManualRow(mr.id, { amount: e.target.value })}
                          placeholder="0" className="w-20 border rounded px-1 py-1 text-xs text-right" />
                      </td>
                      <td className="p-1 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <input type="number" min="0" max="100" step="0.01" value={mr.platformPct} onChange={(e) => updateManualRow(mr.id, { platformPct: e.target.value })}
                            className="w-14 border rounded px-1 py-1 text-xs text-right" />
                          <span className="text-gray-400 text-xs">%</span>
                        </div>
                      </td>
                      <td className="p-1 text-right text-xs text-gray-600">${c.nightFee.toFixed(2)}</td>
                      <td className="p-1 text-right text-xs text-red-500">-${c.platNight.toFixed(2)}</td>
                      <td className="p-1 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <input type="number" min="0" step="1" value={mr.cleaningFee} onChange={(e) => updateManualRow(mr.id, { cleaningFee: e.target.value })}
                            placeholder="0" className="w-16 border rounded px-1 py-1 text-xs text-right" />
                          <select value={mr.cleaningFeeTo} onChange={(e) => updateManualRow(mr.id, { cleaningFeeTo: e.target.value as "owner" | "host" })}
                            className="border rounded px-1 py-1 text-xs ml-1">
                            <option value="owner">业主</option>
                            <option value="host">平台</option>
                          </select>
                        </div>
                      </td>
                      <td className="p-1 text-right text-xs text-red-500">-${c.platClean.toFixed(2)}</td>
                      <td className="p-1 text-right text-xs text-gray-600">${c.nightFeeNet.toFixed(2)}</td>
                      <td className="p-1 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <input type="number" min="0" max="100" step="0.5" value={mr.hostMgmtRate} onChange={(e) => updateManualRow(mr.id, { hostMgmtRate: e.target.value })}
                            className="w-14 border rounded px-1 py-1 text-xs text-right" />
                          <span className="text-gray-400 text-xs">%</span>
                        </div>
                      </td>
                      <td className="p-1 text-right text-xs text-orange-600">-${c.mgmtFee.toFixed(2)}</td>
                      <td className="p-1 text-right text-xs font-bold text-green-700">${c.payable.toFixed(2)}</td>
                      <td className="p-1 text-xs text-gray-400">—</td>
                      <td className="p-1 text-center"></td>
                      <td className="p-1 text-xs text-gray-400">—</td>
                      <td className="p-1 text-center">
                        <button onClick={() => deleteManualRow(mr.id)} className="text-gray-300 hover:text-red-500 text-base">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setStep(1)} className="border px-4 py-2 rounded text-sm hover:bg-gray-50">← 重新上传</button>
            <button onClick={addManualRow} className="border border-blue-300 text-blue-600 px-4 py-2 rounded text-sm hover:bg-blue-50">
              + 手动添加一行
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {exporting ? "导出中..." : "📥 导出 Excel 汇总"}
            </button>
            <button
              onClick={() => {
                const LISTING_META: Record<string, { address: string; ownerName: string }> = {
                  "1-24":   { address: "1/24 Wolseley Street Mosman NSW 2088",             ownerName: "Zerong Chen" },
                  "2-1":    { address: "2/1 Bariston Avenue Cremorne NSW 2090",             ownerName: "Shuna Liu" },
                  "4-12":   { address: "4/12 Clifford Street Mosman NSW 2088",              ownerName: "Hoi Ling Tsoi" },
                  "4-122":  { address: "4/122 Milsons Point Avenue Milsons Point NSW 2061", ownerName: "" },
                  "6-40":   { address: "6/40 Humphreys Road Kirribilli NSW 2061",           ownerName: "" },
                  "118A":   { address: "5/118A Kirribilli Avenue Kirribilli NSW 2061",       ownerName: "CK Ng" },
                  "563A":   { address: "563A Castlereagh Street Sydney NSW 2000",            ownerName: "" },
                  "7-108":  { address: "7/108 Ben Boyd Road Neutral Bay NSW 2089",          ownerName: "" },
                  "10-25":  { address: "10/25 Lavender Street Milsons Point NSW 2061",      ownerName: "" },
                  "620":    { address: "620 George Street Sydney NSW 2000",                 ownerName: "" },
                  "579B":   { address: "579B George Street Sydney NSW 2000",                ownerName: "" },
                  "517":    { address: "517 Kent Street Sydney NSW 2000",                   ownerName: "" },
                  "Ultimo": { address: "5 West End Lane Ultimo NSW 2007",                   ownerName: "" },
                };

                // Collect confirmed-received rows from CSV results
                const byGroup: Record<string, { checkIn: string; checkOut: string; grossAmount: number; bookingCharge: number; managementFee: number; payable: number }[]> = {};

                results.forEach((r, i) => {
                  if (!r.listingCode) return;
                  const bankReceiptAmt = r.totalGuestPayout - (r.channelCommission + r.processingFees) * 1.1;
                  const autoMatchTxn = gBankTransactions.length > 0 ? findBankMatch(bankReceiptAmt, r.checkOut, gBankTransactions) : null;
                  const override = gReceivedOverrides[i];
                  const recv = override !== undefined && override !== null ? override : (autoMatchTxn !== null && gBankTransactions.length > 0);
                  if (!recv) return;
                  // Group by checkout month (booking month), not bank receipt month
                  const pmKey = r.checkOut.substring(0, 7);
                  const groupKey = `${r.listingCode}|${pmKey}`;
                  if (!byGroup[groupKey]) byGroup[groupKey] = [];
                  const eff = getGuestyEffective(r, i);
                  byGroup[groupKey].push({
                    checkIn: r.checkIn, checkOut: r.checkOut,
                    grossAmount: r.totalGuestPayout,
                    bookingCharge: r.channelCommission,
                    managementFee: eff.managementFee,
                    payable: eff.payable,
                  });
                });

                // Also include confirmed manual rows
                manualRows.forEach((mr) => {
                  if (!mr.listingCode) return;
                  const c = calcManual(mr);
                  const pmKey = mr.checkOut.substring(0, 7) || new Date().toISOString().substring(0, 7);
                  const groupKey = `${mr.listingCode}|${pmKey}`;
                  if (!byGroup[groupKey]) byGroup[groupKey] = [];
                  byGroup[groupKey].push({
                    checkIn: mr.checkIn, checkOut: mr.checkOut,
                    grossAmount: parseFloat(mr.amount) || 0,
                    bookingCharge: c.platNight + c.platClean,
                    managementFee: c.mgmtFee,
                    payable: c.payable,
                  });
                });

                if (Object.keys(byGroup).length === 0) {
                  alert("没有已确认到账的预订，请先在「到账」列确认收款。");
                  return;
                }

                const newRecords: StatementRecord[] = Object.entries(byGroup).map(([groupKey, bookings]) => {
                  const [listingCode, pmKey] = groupKey.split("|");
                  const [pmYear, pmMonth] = pmKey.split("-").map(Number);
                  const paymentPeriodLabel = new Date(pmYear, pmMonth - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
                  const dateIssued = new Date(pmYear, pmMonth - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
                  return {
                    id: `${Date.now()}-${listingCode}-${pmKey}`,
                    listingCode,
                    address: LISTING_META[listingCode]?.address ?? listingCode,
                    ownerName: LISTING_META[listingCode]?.ownerName ?? "",
                    bookingPeriod: paymentPeriodLabel,
                    paymentPeriod: paymentPeriodLabel,
                    paymentPeriodKey: pmKey,
                    dateIssued,
                    bookings,
                    status: "draft" as const,
                  };
                });

                const existing = loadStatementHistory();
                saveStatementHistory([...existing, ...newRecords]);
                sessionStorage.setItem("ownerStatements", JSON.stringify(newRecords));
                window.open("/owner-statement", "_blank");
              }}
              className="bg-purple-700 text-white px-4 py-2 rounded text-sm hover:bg-purple-800"
            >
              📄 生成 Owner Statements
            </button>
            <span className="text-xs text-gray-400 self-center">仅生成已确认到账（绿色）的房源</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Statements history tab ───────────────────────────────────────────────────

function StatementsTab() {
  const [records, setRecords] = useState<StatementRecord[]>(() => loadStatementHistory());
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "exported" | "paid">("all");
  const [filterMonth, setFilterMonth] = useState("");

  const updateRecord = (id: string, patch: Partial<StatementRecord>) => {
    const updated = records.map((r) => r.id === id ? { ...r, ...patch } : r);
    setRecords(updated);
    saveStatementHistory(updated);
  };

  const deleteRecord = (id: string) => {
    if (!confirm("确定删除这条 Statement 记录？")) return;
    const updated = records.filter((r) => r.id !== id);
    setRecords(updated);
    saveStatementHistory(updated);
  };

  const markExported = (id: string) => updateRecord(id, {
    status: "exported",
    exportedAt: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
  });

  const markPaid = (id: string) => updateRecord(id, {
    status: "paid",
    paidAt: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
  });

  const filtered = records
    .filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterMonth && r.paymentPeriodKey !== filterMonth) return false;
      return true;
    })
    .slice()
    .reverse(); // newest first

  const statusBadge = (r: StatementRecord) => {
    if (r.status === "paid") return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold">✓ 已付款{r.paidAt ? ` ${r.paidAt}` : ""}</span>;
    if (r.status === "exported") return <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">已导出{r.exportedAt ? ` ${r.exportedAt}` : ""}</span>;
    return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">草稿</span>;
  };

  return (
    <div>
      <div className="flex gap-3 mb-5 items-center flex-wrap">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "all" | "draft" | "exported" | "paid")} className="border rounded px-2 py-1.5 text-sm">
          <option value="all">全部状态</option>
          <option value="draft">草稿</option>
          <option value="exported">已导出</option>
          <option value="paid">已付款</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">付款月份</label>
          <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
          {filterMonth && <button onClick={() => setFilterMonth("")} className="text-xs text-gray-400 hover:text-gray-600">清除</button>}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} 条记录</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">📄</div>
          <div>暂无 Statement 记录。</div>
          <div className="text-xs mt-1">在 Booking.com 标签页确认到账后点击「生成 Owner Statements」，自动存档到这里。</div>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left p-3 font-medium">房源</th>
                <th className="text-left p-3 font-medium">Owner</th>
                <th className="text-left p-3 font-medium">预订月份</th>
                <th className="text-left p-3 font-medium">付款月份</th>
                <th className="text-left p-3 font-medium">签发日期</th>
                <th className="text-right p-3 font-medium">Payable</th>
                <th className="text-left p-3 font-medium">状态</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const payable = r.bookings.reduce((s, b) => s + b.payable, 0);
                return (
                  <tr key={r.id} className={`border-t ${r.status === "paid" ? "bg-green-50" : r.status === "exported" ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <td className="p-3 font-mono font-medium">{r.listingCode}</td>
                    <td className="p-3 text-gray-600">{r.ownerName || <span className="text-gray-300">—</span>}</td>
                    <td className="p-3 text-gray-500">{r.bookingPeriod}</td>
                    <td className="p-3 font-medium">{r.paymentPeriod}</td>
                    <td className="p-3 text-gray-400 text-xs">{r.dateIssued}</td>
                    <td className="p-3 text-right font-bold text-green-700">${payable.toFixed(2)}</td>
                    <td className="p-3">{statusBadge(r)}</td>
                    <td className="p-3">
                      <div className="flex gap-2 justify-end items-center">
                        <button
                          onClick={() => {
                            sessionStorage.setItem("ownerStatements", JSON.stringify([r]));
                            window.open("/owner-statement", "_blank");
                          }}
                          className="text-blue-600 hover:underline text-xs"
                        >查看</button>
                        {r.status === "draft" && (
                          <button onClick={() => markExported(r.id)} className="text-blue-600 hover:underline text-xs">标记已导出</button>
                        )}
                        {r.status === "exported" && (
                          <button onClick={() => markPaid(r.id)} className="text-green-600 hover:text-green-800 text-xs font-semibold">✓ 标记已付款</button>
                        )}
                        {r.status === "paid" && (
                          <button onClick={() => updateRecord(r.id, { status: "exported", paidAt: undefined })} className="text-gray-300 hover:text-gray-500 text-xs">撤销</button>
                        )}
                        <button onClick={() => deleteRecord(r.id)} className="text-gray-200 hover:text-red-500 text-xs ml-1">✕</button>
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
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [channel, setChannel] = useState<"booking" | "guesty" | "statements">("booking");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Zealer Booking Reconciliation</h1>
        <span className="text-sm text-gray-500">OTA Payout Reconciliation</span>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 mb-8 border-b">
        <button
          onClick={() => setChannel("booking")}
          className={`px-5 py-2 text-sm font-medium rounded-t -mb-px border border-b-0 ${
            channel === "booking" ? "bg-white border-gray-200 text-blue-600" : "bg-gray-50 border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Booking.com
        </button>
        <button
          onClick={() => setChannel("guesty")}
          className={`px-5 py-2 text-sm font-medium rounded-t -mb-px border border-b-0 ${
            channel === "guesty" ? "bg-white border-gray-200 text-purple-600" : "bg-gray-50 border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Guesty
        </button>
        <button
          onClick={() => setChannel("statements")}
          className={`px-5 py-2 text-sm font-medium rounded-t -mb-px border border-b-0 ${
            channel === "statements" ? "bg-white border-gray-200 text-emerald-600" : "bg-gray-50 border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Statements
        </button>
      </div>

      {channel === "booking" ? <BookingTab /> : channel === "guesty" ? <GuestyTab /> : <StatementsTab />}
    </div>
  );
}
