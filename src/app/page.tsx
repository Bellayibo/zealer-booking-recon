"use client";
import { useState } from "react";

// ─── Booking.com types ───────────────────────────────────────────────────────

interface BookingResult {
  listingCode: string | null;
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
  checkIn: string;
  checkOut: string;
  propertyName: string;
  netIncome: number;
  commission: number;
  ownerRevenue: number;
  channelCommission: number;
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
  totalNetIncome: number;
  totalCommission: number;
  totalOwnerRevenue: number;
}

// ─── Booking.com tab ─────────────────────────────────────────────────────────

function BookingTab() {
  const [step, setStep] = useState<1 | 2>(1);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [bookingFile, setBookingFile] = useState<File | null>(null);
  const [results, setResults] = useState<BookingResult[]>([]);
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleCalculate = async () => {
    if (!bookingFile) { setError("请上传 Booking.com CSV 文件"); return; }
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("bookingComCsv", bookingFile);
    fd.append("period", period);
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
        <div className="bg-white border rounded-lg p-6 max-w-md">
          <h2 className="font-semibold mb-4">上传账单</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">对账月份</label>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="border rounded px-3 py-2 text-sm" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Booking.com CSV *</label>
            <input type="file" accept=".csv" onChange={(e) => setBookingFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <p className="text-xs text-gray-500 mt-1">从 Booking.com 后台下载：Finance → Statements → Export</p>
          </div>
          <button
            onClick={handleCalculate}
            disabled={loading || !bookingFile}
            className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "计算中..." : "开始计算 →"}
          </button>
        </div>
      )}

      {step === 2 && summary && (
        <div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">预订笔数</div>
              <div className="text-2xl font-bold">{summary.total}</div>
              {summary.unmatched > 0 && <div className="text-xs text-orange-600 mt-1">⚠️ {summary.unmatched} 条无匹配配置</div>}
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">平台总收款</div>
              <div className="text-2xl font-bold">${summary.totalGrossAmount.toFixed(2)}</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">应付房东合计</div>
              <div className="text-2xl font-bold text-green-700">${summary.totalPayable.toFixed(2)}</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">对账月份</div>
              <div className="text-2xl font-bold">{period}</div>
            </div>
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
                  <th className="text-right p-3 font-medium">管理费</th>
                  <th className="text-right p-3 font-medium font-bold">Payable</th>
                  <th className="text-right p-3 font-medium">Bank Receipt</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={`border-t ${r.status === "no_config" ? "bg-orange-50" : "hover:bg-gray-50"}`}>
                    <td className="p-3 font-mono text-sm">
                      {r.listingCode ?? <span className="text-orange-600 text-xs">⚠️ {r.propertyName.substring(0, 20)}...</span>}
                    </td>
                    <td className="p-3 text-gray-600">{r.checkIn} → {r.checkOut}</td>
                    <td className="p-3 text-right">${r.grossAmount.toFixed(2)}</td>
                    <td className="p-3 text-right text-red-600">{r.calculation ? `-$${r.calculation.bookingCharge.toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-right text-gray-500">{r.calculation ? `$${(r.grossAmount - r.calculation.nightFee).toFixed(0)}` : "-"}</td>
                    <td className="p-3 text-right text-orange-600">{r.calculation ? `-$${r.calculation.managementFee.toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-right font-bold text-green-700">{r.calculation ? `$${r.calculation.payable.toFixed(2)}` : "-"}</td>
                    <td className="p-3 text-right text-gray-500">${r.payoutAmount.toFixed(2)}</td>
                    <td className="p-3">
                      {r.status === "ok" && r.listingCode && (
                        <button onClick={() => handlePrintStatement(r.listingCode!)} className="text-blue-600 hover:underline text-xs">月报</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="border px-4 py-2 rounded text-sm hover:bg-gray-50">← 重新上传</button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {exporting ? "导出中..." : "📥 导出 Excel 汇总"}
            </button>
            <span className="text-sm text-gray-500 self-center ml-2">点击表格中「月报」按钮可打印各房源月报</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Guesty tab ───────────────────────────────────────────────────────────────

function GuestyTab() {
  const [step, setStep] = useState<1 | 2>(1);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [guestyFile, setGuestyFile] = useState<File | null>(null);
  const [results, setResults] = useState<GuestyResult[]>([]);
  const [summary, setSummary] = useState<GuestySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleCalculate = async () => {
    if (!guestyFile) { setError("请上传 Guesty CSV 文件"); return; }
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("guestyCsv", guestyFile);
    fd.append("period", period);
    const res = await fetch("/api/guesty/calculate", { method: "POST", body: fd });
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
    const res = await fetch("/api/guesty/export/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, period }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Guesty_Summary_${period}.xlsx`;
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
            <label className="block text-sm font-medium mb-1">对账月份（按退房月份）</label>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="border rounded px-3 py-2 text-sm" />
          </div>
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
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">预订笔数</div>
              <div className="text-2xl font-bold">{summary.total}</div>
              {summary.unmatched > 0 && <div className="text-xs text-orange-600 mt-1">⚠️ {summary.unmatched} 未匹配</div>}
              {summary.rateMismatch > 0 && <div className="text-xs text-red-600 mt-1">❌ {summary.rateMismatch} 费率不符</div>}
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Net Income 合计</div>
              <div className="text-2xl font-bold">${summary.totalNetIncome.toFixed(2)}</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">管理费合计</div>
              <div className="text-2xl font-bold text-orange-600">${summary.totalCommission.toFixed(2)}</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Owner Revenue 合计</div>
              <div className="text-2xl font-bold text-green-700">${summary.totalOwnerRevenue.toFixed(2)}</div>
            </div>
          </div>

          <div className="bg-white border rounded-lg overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium">房源</th>
                  <th className="text-left p-3 font-medium">渠道</th>
                  <th className="text-left p-3 font-medium">入住期间</th>
                  <th className="text-right p-3 font-medium">Net Income</th>
                  <th className="text-right p-3 font-medium">渠道佣金</th>
                  <th className="text-right p-3 font-medium">应收费率</th>
                  <th className="text-right p-3 font-medium">实际费率</th>
                  <th className="text-right p-3 font-medium">管理费</th>
                  <th className="text-right p-3 font-medium font-bold">Owner Rev</th>
                  <th className="p-3 text-center font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={`border-t ${r.status === "no_config" ? "bg-orange-50" : !r.rateMatch ? "bg-red-50" : "hover:bg-gray-50"}`}>
                    <td className="p-3 font-mono text-sm">
                      {r.listingCode ?? <span className="text-orange-600 text-xs">⚠️ 未匹配</span>}
                    </td>
                    <td className="p-3">{channelLabel(r.confirmationCode)}</td>
                    <td className="p-3 text-gray-600">{r.checkIn} → {r.checkOut}</td>
                    <td className="p-3 text-right">${r.netIncome.toFixed(2)}</td>
                    <td className="p-3 text-right text-gray-500">${r.channelCommission.toFixed(2)}</td>
                    <td className="p-3 text-right">{r.expectedRate != null ? `${(r.expectedRate * 100).toFixed(0)}%` : "-"}</td>
                    <td className={`p-3 text-right ${!r.rateMatch && r.status === "ok" ? "text-red-600 font-semibold" : ""}`}>
                      {r.actualRate != null ? `${(r.actualRate * 100).toFixed(1)}%` : "-"}
                    </td>
                    <td className="p-3 text-right text-orange-600">${r.commission.toFixed(2)}</td>
                    <td className="p-3 text-right font-bold text-green-700">${r.ownerRevenue.toFixed(2)}</td>
                    <td className="p-3 text-center">
                      {r.status === "no_config" ? "⚠️" : r.rateMatch ? "✓" : "❌"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="border px-4 py-2 rounded text-sm hover:bg-gray-50">← 重新上传</button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {exporting ? "导出中..." : "📥 导出 Excel 汇总"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [channel, setChannel] = useState<"booking" | "guesty">("booking");

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
      </div>

      {channel === "booking" ? <BookingTab /> : <GuestyTab />}
    </div>
  );
}
