"use client";
import { useSearchParams } from "next/navigation";

interface BookingResult {
  listingCode: string | null;
  checkIn: string;
  checkOut: string;
  grossAmount: number;
  status: string;
  calculation: {
    bookingCharge: number;
    managementFee: number;
    payable: number;
  } | null;
}

export function StatementContent() {
  const sp = useSearchParams();
  const period = sp.get("period") ?? "";
  const listingCode = sp.get("listing") ?? "";
  const raw = sp.get("data");

  if (!raw) return <div className="p-8">无数据</div>;

  let allResults: BookingResult[];
  try {
    allResults = JSON.parse(decodeURIComponent(raw));
  } catch {
    return <div className="p-8">数据解析失败</div>;
  }
  const bookings = allResults.filter((r) => r.listingCode === listingCode && r.status === "ok");

  if (bookings.length === 0) return <div className="p-8">找不到房源 {listingCode} 的预订数据</div>;

  const totalGross = bookings.reduce((s, b) => s + b.grossAmount, 0);
  const totalPlatformFees = bookings.reduce((s, b) => s + (b.calculation?.bookingCharge ?? 0), 0);
  const totalManagementFees = bookings.reduce((s, b) => s + (b.calculation?.managementFee ?? 0), 0);
  const totalPayable = bookings.reduce((s, b) => s + (b.calculation?.payable ?? 0), 0);

  const [year] = period.split("-");
  const monthName = new Date(`${period}-01`).toLocaleString("en-AU", { month: "long" });
  const periodLabel = `${monthName} ${year}`;

  return (
    <div className="p-8 max-w-2xl mx-auto font-sans" style={{ fontFamily: "Arial, sans-serif" }}>
      <style>{`@media print { button { display: none; } }`}</style>

      <div className="mb-6 print:hidden">
        <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm mr-2">
          🖨️ 打印 / 保存为 PDF
        </button>
        <button onClick={() => window.close()} className="border px-4 py-2 rounded text-sm">关闭</button>
      </div>

      <h1 className="text-2xl font-bold text-center mb-6">MONTHLY OWNER STATEMENT</h1>

      <table className="w-full mb-6 border-collapse border">
        <tbody>
          <tr>
            <td className="border p-2 font-medium bg-gray-50 w-1/3">Property</td>
            <td className="border p-2">{listingCode}</td>
          </tr>
          <tr>
            <td className="border p-2 font-medium bg-gray-50">Month</td>
            <td className="border p-2">{periodLabel}</td>
          </tr>
          <tr>
            <td className="border p-2 font-medium bg-gray-50">Date Issued</td>
            <td className="border p-2">{new Date().toLocaleDateString("en-AU")}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="font-bold mb-2">Summary</h2>
      <table className="w-full mb-6 border-collapse border">
        <thead>
          <tr className="bg-gray-50">
            <th className="border p-2 text-left">Item</th>
            <th className="border p-2 text-right">Amount (AUD)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="border p-2">Gross Revenue</td><td className="border p-2 text-right">${totalGross.toFixed(2)}</td></tr>
          <tr><td className="border p-2">Platform Fees</td><td className="border p-2 text-right">-${totalPlatformFees.toFixed(2)}</td></tr>
          <tr><td className="border p-2">Management Fees</td><td className="border p-2 text-right">-${totalManagementFees.toFixed(2)}</td></tr>
          <tr className="font-bold bg-gray-50">
            <td className="border p-2">Net to Owner</td>
            <td className="border p-2 text-right">${totalPayable.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="font-bold mb-2">Bookings</h2>
      <table className="w-full mb-6 border-collapse border">
        <thead>
          <tr className="bg-gray-50">
            <th className="border p-2 text-left">Check-in</th>
            <th className="border p-2 text-left">Check-out</th>
            <th className="border p-2 text-right">Nights</th>
            <th className="border p-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b, i) => {
            const nights = Math.round(
              (new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000
            );
            return (
              <tr key={i}>
                <td className="border p-2">{new Date(b.checkIn).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                <td className="border p-2">{new Date(b.checkOut).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                <td className="border p-2 text-right">{nights}</td>
                <td className="border p-2 text-right">${b.grossAmount.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="font-bold mb-2">Payout</h2>
      <table className="w-full border-collapse border">
        <tbody>
          <tr><td className="border p-2 font-medium">Net Payable</td><td className="border p-2 text-right">${totalPayable.toFixed(2)}</td></tr>
          <tr><td className="border p-2 font-medium">Adjustments</td><td className="border p-2 text-right">NA</td></tr>
          <tr className="font-bold bg-gray-50">
            <td className="border p-2">Payout This Month</td>
            <td className="border p-2 text-right">${totalPayable.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
