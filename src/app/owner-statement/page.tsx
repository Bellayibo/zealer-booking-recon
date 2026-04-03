"use client";
import React, { useState } from "react";
import Image from "next/image";

interface StatementBooking {
  checkIn: string;
  checkOut: string;
  grossAmount: number;
  bookingCharge: number;
  managementFee: number;
  payable: number;
}

interface StatementData {
  id?: string;
  listingCode: string;
  address: string;
  ownerName: string;
  bookingPeriod?: string;
  paymentPeriod?: string;
  period?: string;           // legacy fallback
  dateIssued: string;
  bookings: StatementBooking[];
  status?: "draft" | "exported" | "paid";
}

function nights(checkIn: string, checkOut: string) {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function EditableAmount({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value.toFixed(2));
  const [focused, setFocused] = useState(false);
  // Sync from parent when not focused
  const displayVal = focused ? text : value.toFixed(2);
  return (
    <input
      value={displayVal}
      onFocus={() => { setText(value.toFixed(2)); setFocused(true); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { setFocused(false); const n = parseFloat(text); if (!isNaN(n)) onChange(n); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="no-print-border"
      style={{ width: "100%", textAlign: "right", border: "none", padding: "0", fontSize: "10pt", fontFamily: "Montserrat, sans-serif", color: "#17375E", outline: "none", background: "transparent" }}
    />
  );
}

function EditableText({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  return (
    <input
      className="no-print-border owner-name-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? ""}
      style={{ border: value ? "none" : "1px dashed #aaa", background: "transparent", color: "#17375E", fontSize: "10pt", fontFamily: "Montserrat, sans-serif", width: "100%", outline: "none", padding: 0, ...style }}
    />
  );
}

function StatementCard({ s, onFieldChange }: { s: StatementData; onFieldChange?: (patch: Partial<StatementData>) => void }) {
  const calcGross = s.bookings.reduce((a, b) => a + b.grossAmount, 0);
  const calcPlatform = s.bookings.reduce((a, b) => a + b.bookingCharge, 0);
  const calcMgmt = s.bookings.reduce((a, b) => a + b.managementFee, 0);
  const calcPayable = s.bookings.reduce((a, b) => a + b.payable, 0);

  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [bookingOverrides, setBookingOverrides] = useState<Record<string, string>>({});
  const [expenseRows, setExpenseRows] = useState<{ date: string; item: string; category: string; amount: string }[]>([]);
  const ov = (key: string, fallback: number) => overrides[key] ?? fallback;
  const setOv = (key: string, v: number) => setOverrides((p) => ({ ...p, [key]: v }));

  const bov = (idx: number, field: string, fallback: string) => bookingOverrides[`${idx}_${field}`] ?? fallback;
  const setBov = (idx: number, field: string, v: string) => setBookingOverrides((p) => ({ ...p, [`${idx}_${field}`]: v }));

  const gross = ov("gross", calcGross);
  const otherFees = ov("otherFees", 0);
  const totalIncome = gross + otherFees;
  const platform = ov("platform", calcPlatform);
  const paymentFees = ov("paymentFees", 0);
  const cleaningFees = ov("cleaningFees", 0);
  const mgmt = ov("mgmt", calcMgmt);
  const expensesTotal = expenseRows.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0) + ov("expenses", 0);
  const netToOwner = ov("netToOwner", calcPayable) - expensesTotal;
  const adjustments = ov("adjustments", 0);
  const payoutThisMonth = netToOwner + adjustments;

  const $ = (n: number) => `$${n.toFixed(2)}`;

  const patchField = (patch: Partial<StatementData>) => { if (onFieldChange) onFieldChange(patch); };

  const period = s.paymentPeriod ?? s.period ?? "";
  const [editMonth, setEditMonth] = useState(period);
  const [editDateIssued, setEditDateIssued] = useState(s.dateIssued);

  const inputStyle: React.CSSProperties = { border: "none", background: "transparent", color: "#17375E", fontSize: "10pt", fontFamily: "Montserrat, sans-serif", width: "100%", outline: "none", padding: 0 };

  return (
    <div className="statement-card" style={{ fontFamily: "Montserrat, sans-serif", color: "#17375E", background: "#fff", width: "210mm", margin: "0 auto", padding: "14mm", boxSizing: "border-box" }}>

      {/* Header: logo + title */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10mm" }}>
        <div style={{ fontFamily: "Alice, Georgia, serif", fontSize: "22pt", fontWeight: 700, color: "#17375E" }}>
          MONTHLY OWNER STATEMENT
        </div>
        <Image src="/logo.jpg" alt="Zealer Holiday" width={160} height={48} style={{ objectFit: "contain" }} />
      </div>

      {/* Header info table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8mm", fontSize: "10pt" }}>
        <tbody>
          {([
            ["Property", s.address, (v: string) => patchField({ address: v }), "输入物业地址..."],
            ["Owner", s.ownerName, (v: string) => patchField({ ownerName: v }), "输入业主姓名..."],
            ["Month", editMonth, (v: string) => setEditMonth(v), ""],
            ["Date Issued", editDateIssued, (v: string) => setEditDateIssued(v), ""],
          ] as [string, string, (v: string) => void, string][]).map(([label, value, onChange, ph], i) => (
            <tr key={label} style={{ background: i % 2 === 1 ? "#F1F1F1" : "#fff" }}>
              <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", fontWeight: 700, width: "35%" }}>{label}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>
                <EditableText value={value} onChange={onChange} placeholder={ph} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div style={{ fontWeight: 700, fontSize: "11pt", marginBottom: "4px" }}>Summary</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8mm", fontSize: "10pt" }}>
        <thead>
          <tr style={{ background: "#17375E", color: "#fff" }}>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "left" }}>Item</th>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>Amount (AUD)</th>
          </tr>
        </thead>
        <tbody>
          {([
            ["Gross Revenue", gross, false, "gross"],
            ["Other Fees", otherFees, true, "otherFees"],
            ["Total Income", totalIncome, false, null],
            ["Platform Fees", platform, true, "platform"],
            ["Payment Fees", paymentFees, false, "paymentFees"],
            ["Cleaning Fees", cleaningFees, true, "cleaningFees"],
            ["Management Fees", mgmt, false, "mgmt"],
            ["Expenses", expensesTotal, true, "expenses"],
            ["Net to Owner", netToOwner, false, "netToOwner"],
          ] as [string, number, boolean, string | null][]).map(([label, amt, shade, key]) => (
            <tr key={label} style={{ background: shade ? "#F1F1F1" : "#fff" }}>
              <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>{label}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>
                {key ? (
                  <EditableAmount value={amt} onChange={(v) => setOv(key, v)} />
                ) : (
                  $(amt)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bookings */}
      <div style={{ fontWeight: 700, fontSize: "11pt", marginBottom: "4px" }}>Bookings</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8mm", fontSize: "10pt" }}>
        <thead>
          <tr style={{ background: "#17375E", color: "#fff" }}>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "left" }}>Check In</th>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "left" }}>Check Out</th>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>Nights</th>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {s.bookings.map((b, i) => {
            const ci = bov(i, "checkIn", fmtDate(b.checkIn));
            const co = bov(i, "checkOut", fmtDate(b.checkOut));
            const n = bov(i, "nights", String(nights(b.checkIn, b.checkOut)));
            const total = bov(i, "total", $(b.grossAmount));
            return (
              <tr key={i} style={{ background: i % 2 === 1 ? "#F1F1F1" : "#fff" }}>
                <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>
                  <input className="no-print-border" value={ci} onChange={(e) => setBov(i, "checkIn", e.target.value)} style={inputStyle} />
                </td>
                <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>
                  <input className="no-print-border" value={co} onChange={(e) => setBov(i, "checkOut", e.target.value)} style={inputStyle} />
                </td>
                <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>
                  <input className="no-print-border" value={n} onChange={(e) => setBov(i, "nights", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
                </td>
                <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>
                  <input className="no-print-border" value={total} onChange={(e) => setBov(i, "total", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Expenses */}
      <div style={{ fontWeight: 700, fontSize: "11pt", marginBottom: "4px", pageBreakInside: "avoid", breakInside: "avoid" }}>Expenses</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8mm", fontSize: "10pt", pageBreakInside: "avoid", breakInside: "avoid" }}>
        <thead>
          <tr style={{ background: "#17375E", color: "#fff" }}>
            {["Date", "Item", "Category", "Amount"].map((h) => (
              <th key={h} style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {expenseRows.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: "4px 8px", border: "1px solid #BEBEBE", color: "#aaa", fontSize: "9pt" }}>—</td></tr>
          ) : expenseRows.map((er, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? "#F1F1F1" : "#fff" }}>
              {(["date", "item", "category", "amount"] as const).map((f) => (
                <td key={f} style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>
                  <input className="no-print-border" value={er[f]} onChange={(e) => { const updated = [...expenseRows]; updated[i] = { ...updated[i], [f]: e.target.value }; setExpenseRows(updated); }} style={{ ...inputStyle, textAlign: f === "amount" ? "right" : "left" }} />
                </td>
              ))}
            </tr>
          ))}
          <tr className="no-print">
            <td colSpan={4} style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>
              <button onClick={() => setExpenseRows([...expenseRows, { date: "", item: "", category: "", amount: "" }])} style={{ background: "none", border: "1px dashed #ccc", borderRadius: "3px", color: "#999", cursor: "pointer", fontSize: "9pt", padding: "2px 8px" }}>+ 添加支出</button>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Payout */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt", pageBreakInside: "avoid", breakInside: "avoid" }}>
        <thead>
          <tr style={{ background: "#17375E", color: "#fff" }}>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "left" }}>Description</th>
            <th style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: "#fff" }}>
            <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>Net Payable</td>
            <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>{$(netToOwner)}</td>
          </tr>
          <tr style={{ background: "#F1F1F1" }}>
            <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE" }}>Adjustments</td>
            <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right" }}>
              <EditableAmount value={adjustments} onChange={(v) => setOv("adjustments", v)} />
            </td>
          </tr>
          <tr style={{ background: "#fff" }}>
            <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", fontWeight: 700 }}>Payout This Month</td>
            <td style={{ padding: "4px 8px", border: "1px solid #BEBEBE", textAlign: "right", fontWeight: 700 }}>{$(payoutThisMonth)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function loadHistory(): StatementData[] {
  try { return JSON.parse(localStorage.getItem("statementHistory") ?? "[]"); } catch { return []; }
}

function saveHistory(records: StatementData[]) {
  localStorage.setItem("statementHistory", JSON.stringify(records));
}

export default function OwnerStatementPage() {
  const [statements, setStatements] = useState<StatementData[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = sessionStorage.getItem("ownerStatements");
    return raw ? JSON.parse(raw) : [];
  });
  const [selectedIdx, setSelectedIdx] = useState(0);

  const markStatus = (status: "exported" | "paid") => {
    const s = statements[selectedIdx];
    if (!s?.id) return;
    const now = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    const patch = status === "exported" ? { status, exportedAt: now } : { status, paidAt: now };
    // Update sessionStorage view
    const updated = statements.map((st, i) => i === selectedIdx ? { ...st, ...patch } : st);
    setStatements(updated);
    // Update localStorage history
    const history = loadHistory();
    saveHistory(history.map((r) => r.id === s.id ? { ...r, ...patch } : r));
  };

  if (statements.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>
        <p>No statement data. Please click &quot;Generate Owner Statements&quot; from the main page.</p>
      </div>
    );
  }

  const current = statements[selectedIdx];
  const currentStatus = current?.status;

  const handleFieldChange = (patch: Partial<StatementData>) => {
    const updated = statements.map((st, i) => i === selectedIdx ? { ...st, ...patch } : st);
    setStatements(updated);
    sessionStorage.setItem("ownerStatements", JSON.stringify(updated));
    if (current.id) {
      const history = loadHistory();
      saveHistory(history.map((r) => r.id === current.id ? { ...r, ...patch } : r));
    }
  };

  return (
    <>
      <div style={{ display: "flex", minHeight: "100vh", background: "#eef1f5" }}>

        {/* ── Left sidebar ── */}
        <aside className="no-print" style={{ width: "220px", flexShrink: 0, background: "#17375E", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>

          {/* Logo area */}
          <div style={{ padding: "20px 16px", borderBottom: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: "10px" }}>
            <Image src="/logozealerred.jpg" alt="Zealer" width={44} height={44} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "Alice, Georgia, serif", fontSize: "15px", fontWeight: 700, color: "#fff", letterSpacing: "0.5px" }}>zealer.</div>
              <div style={{ fontSize: "10px", color: "#7ab3d4", letterSpacing: "1px", textTransform: "uppercase" }}>holiday</div>
            </div>
          </div>

          {/* Section label */}
          <div style={{ padding: "16px 20px 8px", fontSize: "10px", color: "#7ab3d4", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            Owner Statements
          </div>

          {/* Property list */}
          <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {statements.map((s, i) => {
              const isSelected = i === selectedIdx;
              const statusColor = s.status === "paid" ? "#22c55e" : s.status === "exported" ? "#60a5fa" : "rgba(255,255,255,0.25)";
              return (
                <button
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  style={{
                    background: isSelected ? "rgba(255,255,255,0.15)" : "transparent",
                    color: isSelected ? "#fff" : "#aad4ff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: isSelected ? 700 : 400,
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    borderLeft: isSelected ? "3px solid #fff" : "3px solid transparent",
                  }}
                >
                  <span style={{ fontSize: "13px", fontWeight: 700, color: isSelected ? "#fff" : "#cce4f7" }}>
                    {s.listingCode}
                  </span>
                  <span style={{ fontSize: "11px", color: isSelected ? "#c8dff0" : "#7ab3d4" }}>
                    {s.paymentPeriod ?? s.period}
                  </span>
                  {s.status && (
                    <span style={{ fontSize: "10px", color: statusColor, marginTop: "2px" }}>
                      {s.status === "paid" ? "✓ Paid" : s.status === "exported" ? "Exported" : "Draft"}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Action buttons */}
          <div style={{ padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", gap: "8px" }}>
            {current?.id && currentStatus === "draft" && (
              <button
                onClick={() => { window.print(); setTimeout(() => markStatus("exported"), 500); }}
                style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 12px", fontWeight: 700, cursor: "pointer", fontSize: "12px", textAlign: "center" }}
              >
                Export PDF
              </button>
            )}
            {current?.id && currentStatus === "exported" && (
              <>
                <button onClick={() => window.print()} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "6px", padding: "8px 12px", fontWeight: 600, cursor: "pointer", fontSize: "12px" }}>
                  Export PDF / Print
                </button>
                <button onClick={() => markStatus("paid")} style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 12px", fontWeight: 700, cursor: "pointer", fontSize: "12px" }}>
                  ✓ 标记已付款
                </button>
              </>
            )}
            {((!current?.id) || currentStatus === "paid") && (
              <button onClick={() => window.print()} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "6px", padding: "8px 12px", fontWeight: 600, cursor: "pointer", fontSize: "12px" }}>
                Export PDF / Print
              </button>
            )}
            <button onClick={() => window.close()} style={{ background: "transparent", color: "#7ab3d4", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "6px", padding: "8px 12px", cursor: "pointer", fontSize: "12px" }}>
              Close
            </button>
          </div>
        </aside>

        {/* ── Right content ── */}
        <main style={{ flex: 1, padding: "40px 32px", overflowY: "auto" }}>
          <StatementCard s={current} onFieldChange={handleFieldChange} />
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Alice&display=swap');
        .owner-name-input:focus { border: 1px dashed #17375E !important; }
        @media print {
          @page {
            size: A4;
            margin: 14mm 12mm;
          }
          /* Remove browser-generated header/footer (date, URL, page number) */
          html {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          .owner-name-input { border: none !important; }
          .no-print-border { border: none !important; background: transparent !important; }
          span[title="点击编辑"] { border-bottom: none !important; }
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Hide the left sidebar so only statement card prints */
          aside { display: none !important; }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
          }
          .statement-card {
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
            padding: 14mm 14mm 0 14mm !important;
            min-height: unset !important;
            background: #fff !important;
          }
        }
      `}</style>
    </>
  );
}
