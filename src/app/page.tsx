"use client";
import { useState } from "react";

interface BookingResult {
  listingCode: string | null;
  checkIn: string;
  checkOut: string;
  propertyName: string;
  grossAmount: number;
  payoutAmount: number;
  payoutDate: string;
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

interface Summary {
  total: number;
  matched: number;
  unmatched: number;
  totalGrossAmount: number;
  totalPayable: number;
}

export default function ReconPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [bookingFile, setBookingFile] = useState<File | null>(null);
  const [results, setResults] = useState<BookingResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">OTA 渠道对账</h1>
        <span className="text-sm text-gray-500">Booking.com Payout Reconciliation</span>
      </div>

      {/* Step indicator */}
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

      {/* Step 1: Upload */}
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

      {/* Step 2: Preview + Export */}
      {step === 2 && summary && (
        <div>
          {/* Summary cards */}
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

          {/* Detail table */}
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

          {/* Actions */}
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
