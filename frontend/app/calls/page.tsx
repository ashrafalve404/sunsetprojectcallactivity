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
  LayoutGrid,
  Table2,
  Flame,
  Target,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  UserPlus,
  Phone,
  Edit2,
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
  ClientContactEntry,
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

  // Mobile App View vs Spreadsheet Table
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  // Priority Client Follow-Up Directory (HP / FUB / P Leads)
  const [clientContacts, setClientContacts] = useState<ClientContactEntry[]>([]);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClientIndex, setEditingClientIndex] = useState<number | null>(null);
  const [clientFormName, setClientFormName] = useState("");
  const [clientFormPhone, setClientFormPhone] = useState("");
  const [clientFormCategory, setClientFormCategory] = useState<"HP" | "P" | "FUB" | "NI" | "CX" | "Other">("HP");
  const [clientFormFollowUp, setClientFormFollowUp] = useState("");
  const [clientFormNotes, setClientFormNotes] = useState("");
  const [rawReportNotes, setRawReportNotes] = useState("");

  const openAddClientModal = () => {
    setEditingClientIndex(null);
    setClientFormName("");
    setClientFormPhone("");
    setClientFormCategory("HP");
    setClientFormFollowUp("");
    setClientFormNotes("");
    setClientModalOpen(true);
  };

  const openEditClientModal = (idx: number) => {
    const c = clientContacts[idx];
    if (!c) return;
    setEditingClientIndex(idx);
    setClientFormName(c.client_name);
    setClientFormPhone(c.phone_number || "");
    setClientFormCategory(c.category);
    setClientFormFollowUp(c.follow_up_date || "");
    setClientFormNotes(c.discussion_notes || "");
    setClientModalOpen(true);
  };

  const handleSaveClientContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientFormName.trim()) return;

    const newContact: ClientContactEntry = {
      id:
        editingClientIndex !== null && clientContacts[editingClientIndex]?.id
          ? clientContacts[editingClientIndex].id
          : `client_${Date.now()}`,
      client_name: clientFormName.trim(),
      phone_number: clientFormPhone.trim() || undefined,
      category: clientFormCategory,
      follow_up_date: clientFormFollowUp || undefined,
      discussion_notes: clientFormNotes.trim() || undefined,
    };

    if (editingClientIndex !== null) {
      setClientContacts((prev) => {
        const next = [...prev];
        next[editingClientIndex] = newContact;
        return next;
      });
    } else {
      setClientContacts((prev) => [...prev, newContact]);
    }
    setClientModalOpen(false);
  };

  const handleDeleteClientContact = (idx: number) => {
    setClientContacts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDateStep = (days: number) => {
    try {
      const parts = reportDate.split("-").map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      d.setDate(d.getDate() + days);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const nextDate = `${yyyy}-${mm}-${dd}`;
      setReportDate(nextDate);
      const empQuery = targetEmployeeId ? `&employee_id=${targetEmployeeId}` : "";
      router.replace(`/calls?date=${nextDate}${empQuery}`);
    } catch {
      // fallback
    }
  };

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

      // Parse client contacts from report.notes
      let parsedContacts: ClientContactEntry[] = [];
      let legacyNotes = "";
      if (r.notes) {
        try {
          const parsed = JSON.parse(r.notes);
          if (Array.isArray(parsed?.client_contacts)) {
            parsedContacts = parsed.client_contacts;
          }
          legacyNotes = parsed?.general_notes || "";
        } catch {
          legacyNotes = r.notes;
        }
      }
      setClientContacts(parsedContacts);
      setRawReportNotes(legacyNotes);

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

      // Persist client contacts in report notes
      const serializedNotes = JSON.stringify({
        client_contacts: clientContacts,
        general_notes: rawReportNotes || null,
      });
      const updatedRep = await api.reports.update(report.id, { notes: serializedNotes });
      setReport(updatedRep);

      setStatusMessage({
        type: "success",
        text: "Daily call activity and client directory draft saved successfully.",
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

      // Save client directory
      const serializedNotes = JSON.stringify({
        client_contacts: clientContacts,
        general_notes: rawReportNotes || null,
      });
      await api.reports.update(report.id, { notes: serializedNotes });

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
      <div className="space-y-6 pb-24 md:pb-6">
        {/* ── Header Controls Card ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Left: Date selector & Status */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-green-700" />
                  <span className="text-xs font-semibold text-slate-700 uppercase hidden sm:inline">Date:</span>
                  <button
                    type="button"
                    onClick={() => handleDateStep(-1)}
                    className="p-1 rounded hover:bg-slate-100 border border-slate-200 text-slate-600 active:scale-95 transition-transform"
                    title="Previous day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
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
                  <button
                    type="button"
                    onClick={() => handleDateStep(1)}
                    className="p-1 rounded hover:bg-slate-100 border border-slate-200 text-slate-600 active:scale-95 transition-transform"
                    title="Next day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
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

              {/* Right: View Toggle & Save/Submit Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      viewMode === "cards"
                        ? "bg-white text-emerald-800 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Mobile-friendly card view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      viewMode === "table"
                        ? "bg-white text-emerald-800 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Desktop spreadsheet table"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                </div>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                {!isLocked && (
                  <div className="hidden sm:flex items-center gap-2">
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
                  </div>
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

        {/* ── Mobile App Cards View ───────────────────────────────────────── */}
        {viewMode === "cards" && (
          <div className="space-y-4">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
              <button
                type="button"
                onClick={() => setActiveCategoryFilter("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-2xs ${
                  activeCategoryFilter === "all"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                All Categories ({LEAD_CATEGORIES.length})
              </button>
              {LEAD_CATEGORIES.map((cat) => {
                const e = entries[cat.key];
                const rowConnected = (e.hp_count || 0) + (e.p_count || 0) + (e.fub_count || 0);
                const isActive = activeCategoryFilter === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveCategoryFilter(cat.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shadow-2xs ${
                      isActive
                        ? "bg-emerald-700 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{cat.label}</span>
                    {rowConnected > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? "bg-emerald-900/60 text-white"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {rowConnected}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(activeCategoryFilter === "all"
                ? LEAD_CATEGORIES
                : LEAD_CATEGORIES.filter((c) => c.key === activeCategoryFilter)
              ).map((cat) => {
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
                  <div
                    key={cat.key}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                  >
                    {/* Header */}
                    <div className="p-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full bg-emerald-600 ring-4 ring-emerald-50" />
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                          {cat.label}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-bold border border-slate-200">
                          Dialed: {rowDialed}
                        </span>
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md text-[11px] font-bold border border-emerald-200">
                          Conn: {rowConnected}
                          {cumConnected > rowConnected && (
                            <span className="text-[10px] text-emerald-950 font-normal ml-1">
                              (Cum: {cumConnected})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Section 1: Time Slots */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Calls Dialed by Time Block
                          </label>
                          <span className="text-xs font-bold text-slate-700">
                            Total: <strong className="text-green-800">{rowDialed}</strong>
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-green-50/40 p-2.5 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              10am – 1pm
                            </span>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.slot_10_to_1 ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "slot_10_to_1", ev.target.value)
                              }
                              placeholder="0"
                              className="w-full text-center py-2 text-base font-bold bg-white border border-green-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:outline-none text-slate-900 shadow-2xs"
                            />
                          </div>

                          <div className="bg-green-50/40 p-2.5 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              2pm – 5pm
                            </span>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.slot_2_to_5 ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "slot_2_to_5", ev.target.value)
                              }
                              placeholder="0"
                              className="w-full text-center py-2 text-base font-bold bg-white border border-green-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:outline-none text-slate-900 shadow-2xs"
                            />
                          </div>

                          <div className="bg-green-50/40 p-2.5 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              5pm – 6pm
                            </span>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.slot_5_to_6 ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "slot_5_to_6", ev.target.value)
                              }
                              placeholder="0"
                              className="w-full text-center py-2 text-base font-bold bg-white border border-green-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:outline-none text-slate-900 shadow-2xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Lead Qualification & Auto Carry-Forward */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Lead Conversions (Today&apos;s New)
                          </label>
                          <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Auto Cumulative Active
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {/* HP Box */}
                          <div className="bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                                <Flame className="w-3.5 h-3.5 text-emerald-600" /> HP
                              </span>
                              {prevHp > 0 && (
                                <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200">
                                  Cum: {cumHp}
                                </span>
                              )}
                            </div>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.hp_count ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "hp_count", ev.target.value)
                              }
                              placeholder={prevHp > 0 ? "+0" : "0"}
                              className="w-full text-center py-2 text-lg font-bold bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-600 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-emerald-800 text-center font-medium mt-1">
                              {prevHp > 0
                                ? `Base: ${prevHp} + Today: ${todayHp}`
                                : "High Potential"}
                            </div>
                          </div>

                          {/* P Box */}
                          <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-blue-600" /> P
                              </span>
                              {prevP > 0 && (
                                <span className="text-[10px] font-bold text-blue-900 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
                                  Cum: {cumP}
                                </span>
                              )}
                            </div>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.p_count ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "p_count", ev.target.value)
                              }
                              placeholder={prevP > 0 ? "+0" : "0"}
                              className="w-full text-center py-2 text-lg font-bold bg-white border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-blue-800 text-center font-medium mt-1">
                              {prevP > 0
                                ? `Base: ${prevP} + Today: ${todayP}`
                                : "Potential"}
                            </div>
                          </div>

                          {/* Fub Box */}
                          <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-amber-600" /> Fub
                              </span>
                              {prevFub > 0 && (
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                  Cum: {cumFub}
                                </span>
                              )}
                            </div>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.fub_count ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "fub_count", ev.target.value)
                              }
                              placeholder={prevFub > 0 ? "+0" : "0"}
                              className="w-full text-center py-2 text-lg font-bold bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-600 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-amber-800 text-center font-medium mt-1">
                              {prevFub > 0
                                ? `Base: ${prevFub} + Today: ${todayFub}`
                                : "Follow-Up"}
                            </div>
                          </div>

                          {/* NI Box */}
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5 text-slate-500" /> NI
                              </span>
                              {prevNi > 0 && (
                                <span className="text-[10px] font-bold text-slate-800 bg-slate-200 px-1.5 py-0.2 rounded border border-slate-300">
                                  Cum: {cumNi}
                                </span>
                              )}
                            </div>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.ni_count ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "ni_count", ev.target.value)
                              }
                              placeholder={prevNi > 0 ? "+0" : "0"}
                              className="w-full text-center py-2 text-lg font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-slate-600 text-center font-medium mt-1">
                              {prevNi > 0
                                ? `Base: ${prevNi} + Today: ${todayNi}`
                                : "Not Interested"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Till Today Baseline Footer */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Till Today Stock:</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.till_today_status ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "till_today_status", ev.target.value)
                            }
                            placeholder={prev?.prev_till_today ? String(prev.prev_till_today) : "0"}
                            className="w-20 text-center py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:ring-1 focus:ring-green-600"
                          />
                          {prev?.prev_till_today ? (
                            <span className="text-[10px] text-slate-500">
                              (Base: {prev.prev_till_today})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Daily Dialed Spreadsheet Table View ──────────────────────────── */}
        {viewMode === "table" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-green-700" />
                Daily Dialed & Lead Classification Table
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
        )}

        {/* ── Hot & Follow-Up Client Directory (Priority Contacts) ───────────── */}
        <Card className="overflow-hidden border-slate-200">

          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="p-1 rounded bg-amber-100 text-amber-800">
                  <Flame className="w-4 h-4 text-orange-600" />
                </span>
                Hot & Follow-Up Client Directory (কাস্টমারদের নাম ও ফলো-আপ তালিকা)
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Record specific customer names, phone numbers, and next follow-up dates for high priority leads.
              </p>
            </div>
            {!isLocked && (
              <Button
                variant="primary"
                size="sm"
                onClick={openAddClientModal}
                className="flex items-center gap-1.5 text-xs font-bold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                + Add Client Lead
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {clientContacts.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No priority clients logged yet today</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click &quot;+ Add Client Lead&quot; to note down key customer names, contact numbers, and follow-up schedules.
                </p>
                {!isLocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openAddClientModal}
                    className="mt-3 text-xs"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1 text-green-700" />
                    Add First Client Lead
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-2 text-center">Status</th>
                      <th className="py-2.5 px-3">Next Follow-Up</th>
                      <th className="py-2.5 px-3">Discussion / Requirement</th>
                      {!isLocked && <th className="py-2.5 px-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientContacts.map((c, idx) => (
                      <tr key={c.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {c.client_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                          {c.phone_number ? (
                            <a
                              href={`tel:${c.phone_number}`}
                              className="text-green-800 hover:underline flex items-center gap-1 font-semibold"
                            >
                              <Phone className="w-3 h-3 text-green-700" />
                              {c.phone_number}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-block font-extrabold text-[10px] px-2 py-0.5 rounded ${
                              c.category === "HP"
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : c.category === "FUB"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : c.category === "P"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : c.category === "CX"
                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {c.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {c.follow_up_date ? (
                            <span className="flex items-center gap-1 text-[11px]">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {formatReadableDate(c.follow_up_date)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                          {c.discussion_notes || "—"}
                        </td>
                        {!isLocked && (
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditClientModal(idx)}
                                className="p-1 text-slate-400 hover:text-green-700 rounded transition-colors"
                                title="Edit client"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteClientContact(idx)}
                                className="p-1 text-slate-400 hover:text-red-700 rounded transition-colors"
                                title="Remove client"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
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

        {/* ── Fixed Mobile App Sticky Bottom Bar (Mobile Only) ──────────────── */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 shadow-lg flex items-center justify-between gap-3">
          <div className="flex flex-col text-xs leading-tight">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>Dialed: <strong className="text-green-800">{totals.totalDialed}</strong></span>
              <span>•</span>
              <span>Conn: <strong className="text-emerald-700">{totals.totalConnected}</strong></span>
            </div>
            <div className="text-[11px] text-slate-600 font-medium">
              HP: {totals.hp} {totals.cumHp > totals.hp && `(Cum: ${totals.cumHp})`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isLocked && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  loading={saving}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 font-bold"
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setSubmitModalOpen(true)}
                  disabled={loading || saving}
                  className="text-xs px-3 py-1.5 font-bold"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  Submit
                </Button>
              </>
            )}
            {isLocked && (
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Locked
              </span>
            )}
          </div>
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

        {/* ── Add / Edit Client Contact Modal ───────────────────────────────── */}
        <Modal
          isOpen={clientModalOpen}
          onClose={() => setClientModalOpen(false)}
          title={editingClientIndex !== null ? "Edit Client Lead Details" : "Add Priority Client Lead"}
          description="Log important customer details and follow-up schedules discussed today."
        >
          <form onSubmit={handleSaveClientContact} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Customer / Client Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mr. Mizanur Rahman"
                value={clientFormName}
                onChange={(e) => setClientFormName(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 01711-xxxxxx"
                  value={clientFormPhone}
                  onChange={(e) => setClientFormPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Lead Classification *
                </label>
                <select
                  value={clientFormCategory}
                  onChange={(e) => setClientFormCategory(e.target.value as any)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
                >
                  <option value="HP">HP — High Potential (উচ্চ আগ্রহী)</option>
                  <option value="P">P — Potential (সাধারণ আগ্রহী)</option>
                  <option value="FUB">FUB — Follow-Up Booked (পুনরায় কল)</option>
                  <option value="CX">CX — Indoor CX / Site Meeting</option>
                  <option value="NI">NI — Not Interested</option>
                  <option value="Other">Other Lead</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Next Follow-Up Date
              </label>
              <input
                type="date"
                value={clientFormFollowUp}
                onChange={(e) => setClientFormFollowUp(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Discussion Topic / Requirements
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Interested in 3-katha south plot, requested visit next Saturday."
                value={clientFormNotes}
                onChange={(e) => setClientFormNotes(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setClientModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Client Lead
              </Button>
            </div>
          </form>
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
