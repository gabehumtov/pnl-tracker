import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// --- SAFE MODE: reset local data if ?reset=1 is in the URL
useEffect(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      localStorage.removeItem(STORAGE_KEY);
      // force clean state
      setEntries({});
    }
  } catch (_) {}
}, []);

// --- Helpers ---
const STORAGE_KEY = "pnl_tracker_entries";

const fmtCurrency = (n) => {
  if (n == null || n === "") return "";
  const num = Number(n);
  if (Number.isNaN(num)) return n;
  return num.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
};
const fmtShort = (d) => d.slice(5); // MM-DD for chart axis

const loadEntries = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};
const saveEntries = (obj) => localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));

function generateMonthMatrix(year, month) {
  // month: 0-based
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const matrix = [];
  let week = [];
  for (let i = 0; i < first.getDay(); i++) week.push(null);
  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      matrix.push(week);
      week = [];
    }
  }
  while (week.length < 7) {
    week.push(null);
    if (week.length === 7) {
      matrix.push(week);
      week = [];
    }
  }
  return matrix;
}

export default function PnLTrackerApp() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [entries, setEntries] = useState(() => loadEntries());

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [modalPNL, setModalPNL] = useState("");
  const [modalNotes, setModalNotes] = useState("");

  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  const monthMatrix = useMemo(
    () => generateMonthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const openForDate = (dateObj) => {
    if (!dateObj) return;
    const key = dateObj.toISOString().slice(0, 10);
    setModalDate(key);
    const existing = entries[key] || {};
    setModalPNL(existing.pnl != null ? existing.pnl : "");
    setModalNotes(existing.notes || "");
    setModalOpen(true);
  };

  const saveModal = () => {
    const key = modalDate;
    const value = {
      pnl: modalPNL === "" ? null : Number(modalPNL),
      notes: modalNotes,
      updated: new Date().toISOString(),
    };
    const next = { ...entries };
    if (value.pnl == null && (!value.notes || value.notes.trim() === "")) {
      delete next[key];
    } else {
      next[key] = value;
    }
    setEntries(next);
    setModalOpen(false);
  };

  const removeEntry = (key) => {
    const next = { ...entries };
    delete next[key];
    setEntries(next);
  };

  // Stats for current month
  const monthKeyPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
  const monthEntries = Object.entries(entries)
    .filter(([k]) => k.startsWith(monthKeyPrefix))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const stats = useMemo(() => {
    let total = 0,
      wins = 0,
      losses = 0,
      sumWin = 0,
      sumLoss = 0;
    for (const [, v] of monthEntries) {
      const p = v && typeof v.pnl === "number" ? v.pnl : 0;
      total += p;
      if (p > 0) {
        wins++;
        sumWin += p;
      } else if (p < 0) {
        losses++;
        sumLoss += p;
      }
    }
    const avgWin = wins ? Math.round(sumWin / wins) : 0;
    const avgLoss = losses ? Math.round(sumLoss / losses) : 0;
    return { total, wins, losses, avgWin, avgLoss, days: monthEntries.length };
  }, [monthEntries]);

  const weeklyTotals = useMemo(() => {
    return monthMatrix.map((week) => {
      let sum = 0;
      let any = false;
      for (const day of week) {
        if (!day) continue;
        const key = day.toISOString().slice(0, 10);
        const e = entries[key];
        if (e && typeof e.pnl === "number") {
          sum += e.pnl;
          any = true;
        }
      }
      return any ? sum : null;
    });
  }, [monthMatrix, entries]);

  // Chart data: daily and cumulative for the visible month
  const chartDaily = monthEntries.map(([date, v]) => ({
    date,
    pnl: typeof v.pnl === "number" ? v.pnl : 0,
    short: fmtShort(date),
  }));
  let running = 0;
  const chartCumulative = chartDaily.map((d) => {
    running += d.pnl;
    return { date: d.date, pnl: running, short: d.short };
  });

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const radarStats = [
    ["Discipline", 78],
    ["Risk", 52],
    ["Edge", 66],
    ["Resilience", 71],
    ["Focus", 59],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-400 p-8 font-sans">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold">PnL Tracker</div>
              <div className="text-sm text-gray-500">Manual daily P&amp;L + journal</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="px-3 py-2 text-sm bg-gray-100 rounded-md hover:bg-gray-200"
                onClick={() => {
                  if (confirm("Reset all saved PnL data? This cannot be undone.")) {
                    localStorage.removeItem(STORAGE_KEY);
                    setEntries({});
                  }
                }}
              >
                Reset Data
              </button>
              <div className="text-sm text-gray-600">{new Date().toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Dashboard */}
            <div className="col-span-5 bg-gray-50 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500">Net P&amp;L (Month)</div>
                  <div className="text-2xl font-semibold mt-2">{fmtCurrency(stats.total)}</div>
                </div>
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500">Expectancy / day</div>
                  <div className="text-2xl font-semibold mt-2">
                    {(stats.total / Math.max(1, stats.days)).toFixed(2)}
                  </div>
                </div>
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500">Win Days</div>
                  <div className="text-2xl font-semibold mt-2">{stats.wins}</div>
                </div>
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <div className="text-xs text-gray-500">Loss Days</div>
                  <div className="text-2xl font-semibold mt-2">{stats.losses}</div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm mb-4">
                <div className="text-sm font-medium mb-2">Zella-style Radar</div>
                <div className="grid grid-cols-5 gap-2 text-xs text-center">
                  {radarStats.map(([k, v]) => (
                    <div key={k} className="p-2">
                      <div className="text-sm font-semibold">{v}</div>
                      <div className="text-gray-500">{k}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts */}
              <div className="bg-white rounded-lg p-4 shadow-sm mb-4">
                <div className="text-sm font-medium mb-2">Daily P&amp;L</div>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartDaily}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="short" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="pnl" stroke="#8884d8" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-sm font-medium mb-2">Cumulative P&amp;L</div>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartCumulative}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="short" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="pnl" stroke="#10b981" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="col-span-7 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={prevMonth} className="p-2 rounded-md bg-white shadow-sm">
                    ◀
                  </button>
                  <div className="text-lg font-semibold">
                    {new Date(viewYear, viewMonth).toLocaleString(undefined, {
                      month: "long",
                    })}{" "}
                    {viewYear}
                  </div>
                  <button onClick={nextMonth} className="p-2 rounded-md bg-white shadow-sm">
                    ▶
                  </button>
                </div>
                <div className="text-sm text-gray-600">Click a day to add PnL &amp; notes</div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-xs text-gray-500 text-center">
                    {d}
                  </div>
                ))}
              </div>

              <div className="mt-3 bg-white rounded-xl shadow-inner p-4">
                <div className="grid grid-cols-8 gap-4">
                  {/* days */}
                  <div className="col-span-6">
                    <div className="grid grid-rows-[repeat(6,_1fr)] gap-2">
                      {monthMatrix.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-7 gap-2">
                          {week.map((day, di) => {
                            const key = day ? day.toISOString().slice(0, 10) : null;
                            const entry = key ? entries[key] : null;
                            const pnl =
                              entry && typeof entry.pnl === "number" ? entry.pnl : null;
                            const bg =
                              pnl == null
                                ? "bg-gray-50"
                                : pnl >= 0
                                ? "bg-green-50"
                                : "bg-red-50";
                            const border =
                              key === new Date().toISOString().slice(0, 10)
                                ? "ring-2 ring-indigo-300"
                                : "border";
                            return (
                              <div
                                key={di}
                                onClick={() => day && openForDate(day)}
                                className={`p-2 rounded-lg cursor-pointer h-24 ${bg} ${border} flex flex-col justify-between`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="text-xs text-gray-600">
                                    {day ? day.getDate() : ""}
                                  </div>
                                  {entry && (
                                    <div
                                      className="text-[10px] px-2 py-1 rounded text-white font-semibold"
                                      style={{
                                        background: pnl >= 0 ? "#059669" : "#dc2626",
                                      }}
                                    >
                                      {pnl != null ? fmtCurrency(pnl) : ""}
                                    </div>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  {entry && entry.notes ? entry.notes.slice(0, 60) : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* weekly totals */}
                  <div className="col-span-2">
                    <div className="text-sm font-medium mb-2">Weekly Totals</div>
                    <div className="space-y-2">
                      {weeklyTotals.map((t, i) => (
                        <div
                          key={i}
                          className="p-2 bg-gray-50 rounded-md flex justify-between items-center"
                        >
                          <div className="text-xs">Week {i + 1}</div>
                          <div
                            className={`text-sm font-semibold ${
                              t == null
                                ? "text-gray-400"
                                : t >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {t == null ? "-" : fmtCurrency(t)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-3 bg-white rounded-md shadow-sm">
                      <div className="text-xs text-gray-500">Month Total</div>
                      <div className="text-xl font-semibold">{fmtCurrency(stats.total)}</div>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-4 flex items-center gap-3 text-xs text-gray-600">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-50 border rounded-sm" /> Profit
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-50 border rounded-sm" /> Loss
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-50 border rounded-sm" /> No data
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setModalOpen(false)}
            />
            <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold">Journal — {modalDate}</div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-sm text-red-600"
                    onClick={() => {
                      if (confirm("Delete entry for " + modalDate + "?")) {
                        removeEntry(modalDate);
                        setModalOpen(false);
                      }
                    }}
                  >
                    Delete
                  </button>
                  <button
                    className="text-sm px-3 py-1 bg-gray-100 rounded"
                    onClick={() => setModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-3">
                  <label className="text-xs text-gray-600">Total P&amp;L (number)</label>
                  <input
                    type="number"
                    value={modalPNL}
                    onChange={(e) => setModalPNL(e.target.value)}
                    className="mt-1 w-full border rounded px-2 py-2"
                    placeholder="e.g. 1234 or -500"
                  />
                  <div className="text-xs text-gray-500 mt-2">
                    Displayed on calendar and included in weekly totals.
                  </div>
                </div>
                <div className="col-span-9">
                  <label className="text-xs text-gray-600">Notes / Journal</label>
                  <textarea
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    rows={6}
                    className="mt-1 w-full border rounded px-2 py-2"
                    placeholder="Reason: VWAP bounce; Risk 0.5 R; felt confident ✅"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  className="px-4 py-2 bg-gray-100 rounded"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-indigo-600 text-white rounded"
                  onClick={saveModal}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
