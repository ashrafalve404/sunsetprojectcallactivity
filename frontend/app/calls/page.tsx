"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  PhoneCall,
  Save,
  Send,
  Lock,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Modal,
  Alert,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import {
  LEAD_CATEGORIES,
  LeadCategory,
  CallActivityEntry,
  Report,
} from "@/types";
import { getDhakaToday, formatReadableDate } from "@/lib/utils";

function DailyCallActivityContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const today = getDhakaToday();
  const initialDate = searchParams.get("date") || today;
  const [reportDate, setReportDate] = useState<string>(initialDate);

  // Report state
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<Record<LeadCategory, CallActivityEntry>>(() => {
    const init: Record<string, CallActivityEntry> = {};
    for (const cat of LEAD_CATEGORIES) {
      init[cat.key] = {
        lead_category: cat.key,
        till_today_status: null,
        slot_10_to_1: null,
        slot_2_to_5: null,
        slot_5_to_6: null,
        hp_count: null,
        p_count: null,
        fub_count: null,
        ni_count: null,
      };
    }
    return init as Record<LeadCategory, CallActivityEntry>;
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Load or initialize report for the selected date
  const loadReport = useCallback(async (dateStr: string) => {
    setLoading(true);
    setStatusMessage(null);
    try {
      let r: Report;
      try {
        r = await api.reports.getByDate(dateStr);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          // Create draft report for date
          r = await api.reports.create(dateStr);
        } else {
          throw err;
        }
      }
      setReport(r);

      // Load call activity entries
      const callData = await api.calls.get(r.id);
      if (callData && callData.entries && callData.entries.length > 0) {
        const loaded: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          const found = callData.entries.find((e) => e.lead_category === cat.key);
          loaded[cat.key] = found || {
            lead_category: cat.key,
            till_today_status: null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
            hp_count: null,
            p_count: null,
            fub_count: null,
            ni_count: null,
          };
        }
        setEntries(loaded as Record<LeadCategory, CallActivityEntry>);
      } else {
        // Reset empty entries
        const reset: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          reset[cat.key] = {
            lead_category: cat.key,
            till_today_status: null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
            hp_count: null,
            p_count: null,
            fub_count: null,
            ni_count: null,
          };
        }
        setEntries(reset as Record<LeadCategory, CallActivityEntry>);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load report. Please verify connection to backend.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(reportDate);
  }, [reportDate, loadReport]);

  const handleCellChange = (
    category: LeadCategory,
    field: keyof CallActivityEntry,
    valStr: string
  ) => {
    if (report?.is_submitted) return;

    const trimmed = valStr.trim();
    const num = trimmed === "" ? null : Math.max(0, parseInt(trimmed, 10));
    setEntries((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: isNaN(num as number) ? null : num,
      },
    }));
  };

  // Calculated totals across all categories
  const totals = useMemo(() => {
    let tillToday = 0;
    let slot1 = 0;
    let slot2 = 0;
    let slot3 = 0;
    let hp = 0;
    let p = 0;
    let fub = 0;
    let ni = 0;

    for (const cat of LEAD_CATEGORIES) {
      const e = entries[cat.key];
      if (e) {
        if (e.till_today_status) tillToday += e.till_today_status;
        if (e.slot_10_to_1) slot1 += e.slot_10_to_1;
        if (e.slot_2_to_5) slot2 += e.slot_2_to_5;
        if (e.slot_5_to_6) slot3 += e.slot_5_to_6;
        if (e.hp_count) hp += e.hp_count;
        if (e.p_count) p += e.p_count;
        if (e.fub_count) fub += e.fub_count;
        if (e.ni_count) ni += e.ni_count;
      }
    }

    const totalDialed = slot1 + slot2 + slot3;
    const totalConnected = hp + p + fub;
    const connectionRate =
      totalDialed > 0 ? Math.round((totalConnected / totalDialed) * 100) : 0;

    return {
      tillToday,
      slot1,
      slot2,
      slot3,
      totalDialed,
      totalConnected,
      connectionRate,
      hp,
      p,
      fub,
      ni,
    };
  }, [entries]);

  // Save Draft
  const handleSaveDraft = async () => {
    if (!report) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload: CallActivityEntry[] = LEAD_CATEGORIES.map(
        (cat) => entries[cat.key]
      );
      await api.calls.upsert(report.id, payload);
      setStatusMessage({
        type: "success",
        text: "Daily call activity draft saved successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to save draft. Your entered data is preserved locally.",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // Submit Final Report
  const handleSubmitReport = async () => {
    if (!report) return;
    setSubmitting(true);
    setStatusMessage(null);
    try {
      // First save entries
      const payload: CallActivityEntry[] = LEAD_CATEGORIES.map(
        (cat) => entries[cat.key]
      );
      await api.calls.upsert(report.id, payload);

      // Then submit report
      const updated = await api.reports.submit(report.id);
      setReport(updated);
      setSubmitModalOpen(false);
      setStatusMessage({
        type: "success",
        text: "Report submitted successfully! The report is now locked.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to submit report. Please review your entries and try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = report?.is_submitted ?? false;

  return (
    <DashboardLayout
      title="Daily Call Activity"
      subtitle="Structured dial activity tracking and lead qualification by time slot"
    >
      <div className="space-y-6">
        {/* ── Header Controls Card ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Left: Date selector & Status */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-700" />
                  <span className="text-xs font-semibold text-slate-700 uppercase">Date:</span>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => {
                      setReportDate(e.target.value);
                      router.replace(`/calls?date=${e.target.value}`);
                    }}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-green-600 bg-white"
                  />
                </div>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                <div className="text-xs text-slate-600">
                  <span className="text-slate-400">Employee: </span>
                  <span className="font-semibold text-slate-900">{user?.full_name}</span>
                </div>

                <Badge variant={isLocked ? "success" : "warning"}>
                  {isLocked ? "Finalized / Submitted" : "Draft (Editable)"}
                </Badge>
              </div>

              {/* Right: Save / Submit Actions */}
              <div className="flex items-center gap-2">
                {!isLocked && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveDraft}
                      loading={saving}
                      disabled={loading}
                    >
                      <Save className="w-4 h-4 mr-1.5" />
                      Save Draft
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setSubmitModalOpen(true)}
                      disabled={loading || saving}
                    >
                      <Send className="w-4 h-4 mr-1.5" />
                      Submit Report
                    </Button>
                  </>
                )}
                {isLocked && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200 font-medium">
                    <Lock className="w-3.5 h-3.5" />
                    Locked for Edits
                  </div>
                )}
              </div>
            </div>

            {/* Locked notification banner */}
            {isLocked && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  This daily report has been finalized and submitted to management. In accordance with
                  company policy, submitted records cannot be modified.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Status Feedback Alert ────────────────────────────────────────── */}
        {statusMessage && (
          <Alert
            type={statusMessage.type}
            onDismiss={() => setStatusMessage(null)}
          >
            {statusMessage.text}
          </Alert>
        )}

        {/* ── Daily Dialed Spreadsheet Table ───────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-green-700" />
              Daily Dialed & Lead Classification
            </CardTitle>
            <span className="text-xs text-slate-500">
              {formatReadableDate(reportDate)}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-3 min-w-[160px] sticky left-0 bg-slate-100/90 z-10">
                    Lead Category
                  </th>
                  <th className="py-2.5 px-2.5 text-center w-24">Till Today</th>
                  <th className="py-2.5 px-2.5 text-center w-24 bg-green-50/50">10am-1pm</th>
                  <th className="py-2.5 px-2.5 text-center w-24 bg-green-50/50">2pm-5pm</th>
                  <th className="py-2.5 px-2.5 text-center w-24 bg-green-50/50">5pm-6pm</th>
                  <th className="py-2.5 px-2.5 text-center w-24 bg-slate-50 font-bold">Total Dialed</th>
                  <th className="py-2.5 px-2 text-center w-16">HP</th>
                  <th className="py-2.5 px-2 text-center w-16">P</th>
                  <th className="py-2.5 px-2 text-center w-16">Fub</th>
                  <th className="py-2.5 px-2 text-center w-16">NI</th>
                  <th className="py-2.5 px-2.5 text-center w-24 bg-emerald-50/50 font-bold">Connected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {LEAD_CATEGORIES.map((cat) => {
                  const e = entries[cat.key];
                  const rowDialed =
                    (e.slot_10_to_1 || 0) +
                    (e.slot_2_to_5 || 0) +
                    (e.slot_5_to_6 || 0);
                  const rowConnected =
                    (e.hp_count || 0) + (e.p_count || 0) + (e.fub_count || 0);

                  return (
                    <tr
                      key={cat.key}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Category Label */}
                      <td className="py-2 px-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-100">
                        {cat.label}
                      </td>

                      {/* Till Today Status */}
                      <td className="p-1 text-center">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.till_today_status ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "till_today_status", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 10 AM to 1 PM */}
                      <td className="p-1 text-center bg-green-50/20">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.slot_10_to_1 ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "slot_10_to_1", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 2 PM to 5 PM */}
                      <td className="p-1 text-center bg-green-50/20">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.slot_2_to_5 ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "slot_2_to_5", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 5 PM to 6 PM */}
                      <td className="p-1 text-center bg-green-50/20">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.slot_5_to_6 ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "slot_5_to_6", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* Row Total Dialed */}
                      <td className="py-2 px-2.5 text-center font-bold text-slate-900 bg-slate-50/80">
                        {rowDialed > 0 ? rowDialed : "—"}
                      </td>

                      {/* HP */}
                      <td className="p-1 text-center">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.hp_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "hp_count", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* P */}
                      <td className="p-1 text-center">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.p_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "p_count", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* Fub */}
                      <td className="p-1 text-center">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.fub_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "fub_count", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* NI */}
                      <td className="p-1 text-center">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.ni_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "ni_count", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* Row Total Connected */}
                      <td className="py-2 px-2.5 text-center font-bold text-emerald-700 bg-emerald-50/30">
                        {rowConnected > 0 ? rowConnected : "—"}
                      </td>
                    </tr>
                  );
                })}

                {/* ── Summary Totals Row ─────────────────────────────────── */}
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td className="py-3 px-3 uppercase tracking-wider text-[11px] sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                    Grand Total
                  </td>
                  <td className="py-3 px-2 text-center text-slate-700">{totals.tillToday || 0}</td>
                  <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot1 || 0}</td>
                  <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot2 || 0}</td>
                  <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot3 || 0}</td>
                  <td className="py-3 px-2.5 text-center text-base font-extrabold text-green-900 bg-slate-200/80">
                    {totals.totalDialed || 0}
                  </td>
                  <td className="py-3 px-2 text-center text-slate-700">{totals.hp || 0}</td>
                  <td className="py-3 px-2 text-center text-slate-700">{totals.p || 0}</td>
                  <td className="py-3 px-2 text-center text-slate-700">{totals.fub || 0}</td>
                  <td className="py-3 px-2 text-center text-slate-700">{totals.ni || 0}</td>
                  <td className="py-3 px-2.5 text-center text-base font-extrabold text-emerald-800 bg-emerald-100/50">
                    {totals.totalConnected || 0}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Bottom Summary Breakdown Cards ───────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Total Dialed Today
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {totals.totalDialed}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">Sum of all 3 slots</p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Total Connected
            </span>
            <div className="text-2xl font-bold text-emerald-700 mt-1">
              {totals.totalConnected}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">HP + Potential + Follow-up</p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Connection Rate
            </span>
            <div className="text-2xl font-bold text-green-700 mt-1">
              {totals.connectionRate}%
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">Target: 40%+</p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              High Potential Leads
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {totals.hp}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">Immediate closing priority</p>
          </Card>
        </div>

        {/* ── Submit Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
          title="Submit Daily Call Activity Report"
          description={`Finalizing report for ${formatReadableDate(reportDate)}`}
        >
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded text-xs text-green-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-green-700 mt-0.5" />
              <div>
                <p className="font-semibold">Important Confirmation</p>
                <p className="mt-0.5">
                  Submitting will lock this report. You will no longer be able to edit call slots, meeting times, or collections for this date.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Dialed:</span>
                <span className="font-bold text-slate-900">{totals.totalDialed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Connected:</span>
                <span className="font-bold text-emerald-700">{totals.totalConnected}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Connection Rate:</span>
                <span className="font-bold text-slate-900">{totals.connectionRate}%</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSubmitModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitReport}
                loading={submitting}
              >
                Confirm & Submit Report
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

export default function DailyCallActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Daily Call Activity...
        </div>
      }
    >
      <DailyCallActivityContent />
    </Suspense>
  );
}
