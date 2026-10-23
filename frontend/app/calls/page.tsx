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
  Trash2,
  Printer,
  Sparkles,
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
  Tooltip,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import {
  LEAD_CATEGORIES,
  LeadCategory,
  CallActivityEntry,
  Report,
  CarryForwardInfo,
  CategoryCarryForward,
} from "@/types";
import { getDhakaToday, formatReadableDate } from "@/lib/utils";

function DailyCallActivityContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  const today = getDhakaToday();
  const initialDate = searchParams.get("date") || today;
  const paramEmpId = searchParams.get("employee_id");
  const targetEmployeeId = paramEmpId ? Number(paramEmpId) : undefined;
  const [reportDate, setReportDate] = useState<string>(initialDate);

  // Report state
  const [report, setReport] = useState<Report | null>(null);
  const [carryForward, setCarryForward] = useState<CarryForwardInfo | null>(null);
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

  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [deletingReport, setDeletingReport] = useState(false);

  // Load or initialize report for the selected date
  const loadReport = useCallback(async (dateStr: string, empId?: number) => {
    setLoading(true);
    setStatusMessage(null);
    try {
      let r: Report;
      try {
        r = await api.reports.getByDate(dateStr, empId);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          // Create draft report for date
          r = await api.reports.create(dateStr, empId);
        } else {
          throw err;
        }
      }
      setReport(r);

      // Load call activity entries & carry-forward info
      const callData = await api.calls.get(r.id);
      setCarryForward(callData?.carry_forward || null);

      if (callData && callData.entries && callData.entries.length > 0) {
        const loaded: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          const found = callData.entries.find(
            (e) => e.lead_category === cat.key || e.lead_category === cat.label
          );
          const prevBaseline =
            callData.carry_forward?.categories?.[cat.key]?.prev_till_today ||
            callData.carry_forward?.categories?.[cat.label]?.prev_till_today ||
            0;
          const tillTodayVal =
            found?.till_today_status ?? (prevBaseline > 0 ? prevBaseline : null);

          loaded[cat.key] = found
            ? { ...found, till_today_status: tillTodayVal }
            : {
                lead_category: cat.key,
                till_today_status: tillTodayVal,
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
        // Reset empty entries with carry-forward baseline if available
        const reset: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          const prevBaseline =
            callData?.carry_forward?.categories?.[cat.key]?.prev_till_today ||
            callData?.carry_forward?.categories?.[cat.label]?.prev_till_today ||
            0;
          reset[cat.key] = {
            lead_category: cat.key,
            till_today_status: prevBaseline > 0 ? prevBaseline : null,
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
    loadReport(reportDate, targetEmployeeId);
  }, [reportDate, targetEmployeeId, loadReport]);

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

  // Calculated totals across all categories (Today & Cumulative)
  const totals = useMemo(() => {
    let tillToday = 0;
    let slot1 = 0;
    let slot2 = 0;
    let slot3 = 0;
    let hp = 0;
    let p = 0;
    let fub = 0;
    let ni = 0;

    let prevTotalHp = 0;
    let prevTotalP = 0;
    let prevTotalFub = 0;
    let prevTotalNi = 0;

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

      if (carryForward?.categories) {
        const prev =
          carryForward.categories[cat.key] ||
          carryForward.categories[cat.label] ||
          carryForward.categories[cat.key.toLowerCase()] ||
          carryForward.categories[cat.label.toLowerCase()];
        if (prev) {
          prevTotalHp += prev.prev_hp || 0;
          prevTotalP += prev.prev_p || 0;
          prevTotalFub += prev.prev_fub || 0;
          prevTotalNi += prev.prev_ni || 0;
        }
      }
    }

    const totalDialed = slot1 + slot2 + slot3;
    const totalConnected = hp + p + fub;
    const connectionRate =
      totalDialed > 0 ? Math.round((totalConnected / totalDialed) * 100) : 0;

    const prevTotalConnected = prevTotalHp + prevTotalP + prevTotalFub;
    const cumHp = prevTotalHp + hp;
    const cumP = prevTotalP + p;
    const cumFub = prevTotalFub + fub;
    const cumNi = prevTotalNi + ni;
    const cumConnected = prevTotalConnected + totalConnected;

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
      prevTotalHp,
      prevTotalP,
      prevTotalFub,
      prevTotalNi,
      prevTotalConnected,
      cumHp,
      cumP,
      cumFub,
      cumNi,
      cumConnected,
    };
  }, [entries, carryForward]);

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

  const handleAdminDeleteReport = async () => {
    if (!report) return;
    setDeletingReport(true);
    try {
      await api.reports.delete(report.id);
      setAdminDeleteModalOpen(false);
      setStatusMessage({
        type: "success",
        text: "Daily report deleted by admin.",
      });
      setTimeout(() => {
        router.replace(`/calls?date=${today}`);
        window.location.reload();
      }, 500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({ type: "error", text: "Failed to delete report." });
      }
    } finally {
      setDeletingReport(false);
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
                      const empQuery = targetEmployeeId ? `&employee_id=${targetEmployeeId}` : "";
                      router.replace(`/calls?date=${e.target.value}${empQuery}`);
                    }}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-green-600 bg-white"
                  />
                </div>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                <div className="text-xs text-slate-600">
                  <span className="text-slate-400">Employee: </span>
                  <span className="font-semibold text-slate-900">{report?.employee_name || user?.full_name}</span>
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
                {report && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/reports/${report.id}/print`, "_blank")}
                    title="Print / Save PDF Report"
                  >
                    <Printer className="w-4 h-4 mr-1.5" />
                    Print Report
                  </Button>
                )}
                {isAdmin && report && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setAdminDeleteModalOpen(true)}
                    title="Admin: Permanently delete this daily report"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete Report
                  </Button>
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

        {/* ── Smart Auto Carry-Forward Active Banner ───────────────────────── */}
        {carryForward?.previous_report_date && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-emerald-50/90 border border-emerald-200/80 rounded-lg text-xs text-emerald-950 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold flex items-center gap-2 text-emerald-950">
                  <span>Smart Auto Carry-Forward Active</span>
                  <span className="text-[10px] font-semibold bg-emerald-100/90 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                    Baseline: {formatReadableDate(carryForward.previous_report_date)}
                  </span>
                </div>
                <div className="text-slate-600 text-[11px] mt-0.5">
                  Previous cumulative totals for {carryForward.employee_name || report?.employee_name || "this employee"} have been loaded. Enter <strong>today&apos;s new changes</strong> in HP, P, Fub, and NI below — updated cumulative totals are computed live without double-counting.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-emerald-800 bg-white/90 border border-emerald-200 px-2.5 py-1 rounded shadow-2xs">
                Employee Isolated: #{carryForward.employee_id}
              </span>
            </div>
          </div>
        )}

        {/* ── Daily Dialed Spreadsheet Table ───────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-green-700" />
              Daily Dialed & Lead Classification
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{formatReadableDate(reportDate)}</span>
              {carryForward?.previous_report_date && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Carried Forward from {carryForward.previous_report_date}
                </span>
              )}
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-3 min-w-[160px] sticky left-0 bg-slate-100/90 z-10">
                    Lead Category
                  </th>
                  <th className="py-2.5 px-2 text-center w-24">
                    <Tooltip content="Till Today Status" subcontent="Cumulative leads status worked or reached up to today (auto-loaded from previous baseline).">
                      <span className="border-b border-dotted border-slate-400 hover:text-slate-900">Till Today</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-24 bg-green-50/50">
                    <Tooltip content="10:00 AM – 1:00 PM" subcontent="Morning call block dials.">
                      <span className="border-b border-dotted border-slate-400 hover:text-slate-900">10am-1pm</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-24 bg-green-50/50">
                    <Tooltip content="2:00 PM – 5:00 PM" subcontent="Afternoon call block dials.">
                      <span className="border-b border-dotted border-slate-400 hover:text-slate-900">2pm-5pm</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-24 bg-green-50/50">
                    <Tooltip content="5:00 PM – 6:00 PM" subcontent="Late afternoon wrap-up call block dials.">
                      <span className="border-b border-dotted border-slate-400 hover:text-slate-900">5pm-6pm</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-24 bg-slate-50 font-bold">
                    <Tooltip content="Total Dialed" subcontent="Sum of calls dialed across all 3 time blocks today.">
                      <span className="border-b border-dotted border-slate-500 font-bold text-slate-900">Total Dialed</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-20">
                    <Tooltip content="HP — High Potential" subcontent="Highly interested client ready for booking. Enter today's change; cumulative total updates live.">
                      <span className="font-bold text-emerald-800 border-b border-dotted border-emerald-600 hover:text-emerald-950">HP</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-20">
                    <Tooltip content="P — Potential" subcontent="General interested client. Enter today's change; cumulative total updates live.">
                      <span className="font-bold text-slate-800 border-b border-dotted border-slate-500 hover:text-slate-950">P</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-20">
                    <Tooltip content="Fub — Follow-Up Booked" subcontent="Scheduled call back. Enter today's change; cumulative total updates live.">
                      <span className="font-bold text-slate-800 border-b border-dotted border-slate-500 hover:text-slate-950">Fub</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-20">
                    <Tooltip content="NI — Not Interested" subcontent="Client declined or wrong number. Enter today's change; cumulative total updates live.">
                      <span className="font-bold text-slate-600 border-b border-dotted border-slate-400 hover:text-slate-900">NI</span>
                    </Tooltip>
                  </th>
                  <th className="py-2.5 px-2 text-center w-24 bg-emerald-50/50 font-bold">
                    <Tooltip content="Connected (HP + P + Fub)" subcontent="Today's productive conversations and updated cumulative connected count." align="right">
                      <span className="font-bold text-emerald-900 border-b border-dotted border-emerald-700 hover:text-emerald-950">Connected</span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {LEAD_CATEGORIES.map((cat) => {
                  const e = entries[cat.key];
                  const rowDialed =
                    (e.slot_10_to_1 || 0) +
                    (e.slot_2_to_5 || 0) +
                    (e.slot_5_to_6 || 0);

                  const prev =
                    carryForward?.categories?.[cat.key] ||
                    carryForward?.categories?.[cat.label] ||
                    carryForward?.categories?.[cat.key.toLowerCase()] ||
                    carryForward?.categories?.[cat.label.toLowerCase()];

                  const prevHp = prev?.prev_hp || 0;
                  const prevP = prev?.prev_p || 0;
                  const prevFub = prev?.prev_fub || 0;
                  const prevNi = prev?.prev_ni || 0;

                  const todayHp = e.hp_count || 0;
                  const todayP = e.p_count || 0;
                  const todayFub = e.fub_count || 0;
                  const todayNi = e.ni_count || 0;

                  const cumHp = prevHp + todayHp;
                  const cumP = prevP + todayP;
                  const cumFub = prevFub + todayFub;
                  const cumNi = prevNi + todayNi;

                  const rowConnected = todayHp + todayP + todayFub;
                  const cumConnected = cumHp + cumP + cumFub;

                  return (
                    <tr
                      key={cat.key}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Category Label */}
                      <td className="py-2.5 px-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-100 align-top">
                        <div className="font-medium text-slate-900">{cat.label}</div>
                        {prev && (prevHp > 0 || prevP > 0 || prevFub > 0) && (
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            Baseline: {prevHp} HP, {prevP} P, {prevFub} Fub
                          </div>
                        )}
                      </td>

                      {/* Till Today Status */}
                      <td className="p-1 text-center align-top">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.till_today_status ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "till_today_status", ev.target.value)
                          }
                          placeholder={prev?.prev_till_today ? String(prev.prev_till_today) : "—"}
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 10 AM to 1 PM */}
                      <td className="p-1 text-center bg-green-50/20 align-top">
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
                      <td className="p-1 text-center bg-green-50/20 align-top">
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
                      <td className="p-1 text-center bg-green-50/20 align-top">
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
                      <td className="py-2.5 px-2.5 text-center font-bold text-slate-900 bg-slate-50/80 align-top">
                        {rowDialed > 0 ? rowDialed : "—"}
                      </td>

                      {/* HP */}
                      <td className="p-1 text-center align-top">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.hp_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "hp_count", ev.target.value)
                          }
                          placeholder={prevHp > 0 ? "+0" : "—"}
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        {prevHp > 0 && (
                          <div className="mt-1 flex items-center justify-center">
                            <span
                              className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200/80 cursor-help"
                              title={`Carried Forward: ${prevHp} + Today: ${todayHp} = Cumulative: ${cumHp}`}
                            >
                              Cum: {cumHp}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* P */}
                      <td className="p-1 text-center align-top">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.p_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "p_count", ev.target.value)
                          }
                          placeholder={prevP > 0 ? "+0" : "—"}
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        {prevP > 0 && (
                          <div className="mt-1 flex items-center justify-center">
                            <span
                              className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200/80 cursor-help"
                              title={`Carried Forward: ${prevP} + Today: ${todayP} = Cumulative: ${cumP}`}
                            >
                              Cum: {cumP}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Fub */}
                      <td className="p-1 text-center align-top">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.fub_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "fub_count", ev.target.value)
                          }
                          placeholder={prevFub > 0 ? "+0" : "—"}
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        {prevFub > 0 && (
                          <div className="mt-1 flex items-center justify-center">
                            <span
                              className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200/80 cursor-help"
                              title={`Carried Forward: ${prevFub} + Today: ${todayFub} = Cumulative: ${cumFub}`}
                            >
                              Cum: {cumFub}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* NI */}
                      <td className="p-1 text-center align-top">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.ni_count ?? ""}
                          onChange={(ev) =>
                            handleCellChange(cat.key, "ni_count", ev.target.value)
                          }
                          placeholder={prevNi > 0 ? "+0" : "—"}
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        {prevNi > 0 && (
                          <div className="mt-1 flex items-center justify-center">
                            <span
                              className="inline-flex items-center text-[10px] font-semibold text-slate-700 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 cursor-help"
                              title={`Carried Forward: ${prevNi} + Today: ${todayNi} = Cumulative: ${cumNi}`}
                            >
                              Cum: {cumNi}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Row Total Connected */}
                      <td className="py-2.5 px-2.5 text-center font-bold text-emerald-700 bg-emerald-50/30 align-top">
                        <div className="text-xs">{rowConnected > 0 ? rowConnected : "—"}</div>
                        {cumConnected > rowConnected && (
                          <div className="mt-1">
                            <span
                              className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded cursor-help"
                              title={`Carried Forward: ${cumConnected - rowConnected} + Today: ${rowConnected} = Cumulative: ${cumConnected}`}
                            >
                              Cum: {cumConnected}
                            </span>
                          </div>
                        )}
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
                  {/* HP Total */}
                  <td className="py-2.5 px-2 text-center text-slate-700">
                    <div className="font-bold">{totals.hp || 0}</div>
                    {totals.cumHp > totals.hp && (
                      <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 rounded px-1 mt-0.5" title={`Carried Forward: ${totals.cumHp - totals.hp} + Today: ${totals.hp}`}>
                        Cum: {totals.cumHp}
                      </div>
                    )}
                  </td>
                  {/* P Total */}
                  <td className="py-2.5 px-2 text-center text-slate-700">
                    <div className="font-bold">{totals.p || 0}</div>
                    {totals.cumP > totals.p && (
                      <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 rounded px-1 mt-0.5" title={`Carried Forward: ${totals.cumP - totals.p} + Today: ${totals.p}`}>
                        Cum: {totals.cumP}
                      </div>
                    )}
                  </td>
                  {/* Fub Total */}
                  <td className="py-2.5 px-2 text-center text-slate-700">
                    <div className="font-bold">{totals.fub || 0}</div>
                    {totals.cumFub > totals.fub && (
                      <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 rounded px-1 mt-0.5" title={`Carried Forward: ${totals.cumFub - totals.fub} + Today: ${totals.fub}`}>
                        Cum: {totals.cumFub}
                      </div>
                    )}
                  </td>
                  {/* NI Total */}
                  <td className="py-2.5 px-2 text-center text-slate-700">
                    <div className="font-bold">{totals.ni || 0}</div>
                    {totals.cumNi > totals.ni && (
                      <div className="text-[10px] font-semibold text-slate-700 bg-slate-200/60 rounded px-1 mt-0.5" title={`Carried Forward: ${totals.cumNi - totals.ni} + Today: ${totals.ni}`}>
                        Cum: {totals.cumNi}
                      </div>
                    )}
                  </td>
                  {/* Connected Total */}
                  <td className="py-2.5 px-2.5 text-center text-base font-extrabold text-emerald-800 bg-emerald-100/50">
                    <div>{totals.totalConnected || 0}</div>
                    {totals.cumConnected > totals.totalConnected && (
                      <div className="text-[11px] font-bold text-emerald-950 bg-emerald-200/70 rounded px-1.5 py-0.5 mt-0.5 tracking-normal inline-block" title={`Carried Forward Connected: ${totals.cumConnected - totals.totalConnected} + Today: ${totals.totalConnected}`}>
                        Cum: {totals.cumConnected}
                      </div>
                    )}
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
            <div className="flex items-baseline gap-2 mt-1">
              <div className="text-2xl font-bold text-emerald-700">
                {totals.totalConnected}
              </div>
              {totals.cumConnected > totals.totalConnected && (
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-300">
                  Cum: {totals.cumConnected}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              {totals.cumConnected > totals.totalConnected ? `+${totals.totalConnected} today (Cum: ${totals.cumConnected})` : "HP + Potential + Follow-up"}
            </p>
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
            <div className="flex items-baseline gap-2 mt-1">
              <div className="text-2xl font-bold text-slate-900">
                {totals.hp}
              </div>
              {totals.cumHp > totals.hp && (
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-300">
                  Cum: {totals.cumHp}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              {totals.cumHp > totals.hp ? `+${totals.hp} today (Pipeline: ${totals.cumHp})` : "Immediate closing priority"}
            </p>
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

        {/* ── Admin: Delete Daily Report Modal ─────────────────────────────── */}
        <Modal
          isOpen={adminDeleteModalOpen}
          onClose={() => setAdminDeleteModalOpen(false)}
          title="Admin: Delete Daily Report"
          description={`Are you sure you want to permanently delete the report for ${formatReadableDate(reportDate)}?`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This will permanently delete this daily activity report, all hourly call data,
              and associated logs. This action is restricted to administrators and cannot be recovered.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdminDeleteModalOpen(false)}
                disabled={deletingReport}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deletingReport}
                onClick={handleAdminDeleteReport}
              >
                Delete Report
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
