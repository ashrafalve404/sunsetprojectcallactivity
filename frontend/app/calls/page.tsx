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
  ArrowRightLeft,
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

  // Today's New Leads and Status Movements per category
  const [leadChanges, setLeadChanges] = useState<
    Record<
      LeadCategory,
      {
        new_leads: number;
        delta_hp: number;
        delta_p: number;
        delta_fub: number;
        delta_ni: number;
      }
    >
  >(() => {
    const init: Record<
      string,
      {
        new_leads: number;
        delta_hp: number;
        delta_p: number;
        delta_fub: number;
        delta_ni: number;
      }
    > = {};
    for (const cat of LEAD_CATEGORIES) {
      init[cat.key] = {
        new_leads: 0,
        delta_hp: 0,
        delta_p: 0,
        delta_fub: 0,
        delta_ni: 0,
      };
    }
    return init as Record<
      LeadCategory,
      {
        new_leads: number;
        delta_hp: number;
        delta_p: number;
        delta_fub: number;
        delta_ni: number;
      }
    >;
  });

  // Transfer Lead Status / Category Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFromCat, setTransferFromCat] = useState<LeadCategory>("facebook");
  const [transferFromStatus, setTransferFromStatus] = useState<"hp" | "p" | "fub" | "ni">("fub");
  const [transferToCat, setTransferToCat] = useState<LeadCategory>("high_potential");
  const [transferToStatus, setTransferToStatus] = useState<"hp" | "p" | "fub" | "ni">("hp");
  const [transferCount, setTransferCount] = useState<number>(1);

  const [entries, setEntries] = useState<Record<LeadCategory, CallActivityEntry>>(() => {
    const init: Record<string, CallActivityEntry> = {};
    for (const cat of LEAD_CATEGORIES) {
      init[cat.key] = {
        lead_category: cat.key,
        till_today_status: null,
        slot_10_to_1: null,
        slot_2_to_5: null,
        slot_5_to_6: null,
        total_connected: null,
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

  // Mobile App View vs Spreadsheet Table: Default to "table" on PC, "cards" on mobile
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [hasUserSwitchedView, setHasUserSwitchedView] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  // Automatically adjust view mode on mount based on screen width (Table on PC >= 768px, Cards on Mobile < 768px)
  // Stops auto-adjusting once user manually toggles
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      if (!hasUserSwitchedView) {
        const isMobile = window.innerWidth < 768;
        setViewMode(isMobile ? "cards" : "table");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [hasUserSwitchedView]);

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
      const cf = callData?.carry_forward || null;
      setCarryForward(cf);

      const nextChanges: Record<string, { new_leads: number; delta_hp: number; delta_p: number; delta_fub: number; delta_ni: number }> = {};

      if (callData && callData.entries && callData.entries.length > 0) {
        const loaded: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          const found = callData.entries.find(
            (e) => e.lead_category === cat.key || e.lead_category === cat.label
          );

          const prev =
            cf?.categories?.[cat.key] ||
            cf?.categories?.[cat.label] ||
            cf?.categories?.[cat.key.toLowerCase()] ||
            cf?.categories?.[cat.label.toLowerCase()];

          const prevHp = prev?.prev_hp || 0;
          const prevP = prev?.prev_p || 0;
          const prevFub = prev?.prev_fub || 0;
          const prevNi = prev?.prev_ni || 0;
          const prevStock = prev?.prev_till_today || (prevHp + prevP + prevFub + prevNi);

          // Restore changes from notes if present
          let parsedChanges: { new_leads: number; delta_hp: number; delta_p: number; delta_fub: number; delta_ni: number } | null = null;
          if (found?.notes) {
            try {
              const parsed = JSON.parse(found.notes);
              if (parsed && typeof parsed === "object" && parsed.changes) {
                parsedChanges = parsed.changes;
              }
            } catch {
              // ignore legacy note
            }
          }

          if (parsedChanges) {
            nextChanges[cat.key] = parsedChanges;
          } else if (found && (found.hp_count !== null || found.p_count !== null || found.fub_count !== null || found.ni_count !== null)) {
            nextChanges[cat.key] = {
              new_leads: Math.max(0, (found.till_today_status ?? 0) - prevStock),
              delta_hp: (found.hp_count ?? 0) - prevHp,
              delta_p: (found.p_count ?? 0) - prevP,
              delta_fub: (found.fub_count ?? 0) - prevFub,
              delta_ni: (found.ni_count ?? 0) - prevNi,
            };
          } else {
            nextChanges[cat.key] = { new_leads: 0, delta_hp: 0, delta_p: 0, delta_fub: 0, delta_ni: 0 };
          }

          const tillTodayVal = found?.till_today_status ?? (prevStock > 0 ? prevStock : null);

          loaded[cat.key] = found
            ? { ...found, till_today_status: tillTodayVal }
            : {
                lead_category: cat.key,
                till_today_status: tillTodayVal,
                slot_10_to_1: null,
                slot_2_to_5: null,
                slot_5_to_6: null,
                total_connected: null,
                hp_count: prevHp > 0 ? prevHp : null,
                p_count: prevP > 0 ? prevP : null,
                fub_count: prevFub > 0 ? prevFub : null,
                ni_count: prevNi > 0 ? prevNi : null,
              };
        }
        setEntries(loaded as Record<LeadCategory, CallActivityEntry>);
        setLeadChanges(nextChanges as Record<LeadCategory, { new_leads: number; delta_hp: number; delta_p: number; delta_fub: number; delta_ni: number }>);
      } else {
        // Reset empty entries with carry-forward baseline if available
        const reset: Record<string, CallActivityEntry> = {};
        for (const cat of LEAD_CATEGORIES) {
          const prev =
            cf?.categories?.[cat.key] ||
            cf?.categories?.[cat.label] ||
            cf?.categories?.[cat.key.toLowerCase()] ||
            cf?.categories?.[cat.label.toLowerCase()];

          const prevHp = prev?.prev_hp || 0;
          const prevP = prev?.prev_p || 0;
          const prevFub = prev?.prev_fub || 0;
          const prevNi = prev?.prev_ni || 0;
          const prevStock = prev?.prev_till_today || (prevHp + prevP + prevFub + prevNi);

          nextChanges[cat.key] = { new_leads: 0, delta_hp: 0, delta_p: 0, delta_fub: 0, delta_ni: 0 };
          reset[cat.key] = {
            lead_category: cat.key,
            till_today_status: prevStock > 0 ? prevStock : null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
            total_connected: null,
            hp_count: prevHp > 0 ? prevHp : null,
            p_count: prevP > 0 ? prevP : null,
            fub_count: prevFub > 0 ? prevFub : null,
            ni_count: prevNi > 0 ? prevNi : null,
          };
        }
        setEntries(reset as Record<LeadCategory, CallActivityEntry>);
        setLeadChanges(nextChanges as Record<LeadCategory, { new_leads: number; delta_hp: number; delta_p: number; delta_fub: number; delta_ni: number }>);
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

  const handleLeadChange = (
    category: LeadCategory,
    field: "new_leads" | "delta_hp" | "delta_p" | "delta_fub" | "delta_ni",
    valStr: string
  ) => {
    if (report?.is_submitted) return;
    const trimmed = valStr.trim();
    const num = trimmed === "" ? 0 : parseInt(trimmed, 10);
    const validNum = isNaN(num) ? 0 : (field === "new_leads" ? Math.max(0, num) : num);

    setLeadChanges((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: validNum,
      },
    }));
  };

  const handleApplyTransfer = () => {
    if (transferCount <= 0) return;
    if (transferFromCat === transferToCat && transferFromStatus === transferToStatus) {
      setStatusMessage({
        type: "error",
        text: "Source and destination status must be different to transfer.",
      });
      return;
    }

    setLeadChanges((prev) => {
      const next = { ...prev };
      const srcCat = transferFromCat;
      const dstCat = transferToCat;
      const srcField = `delta_${transferFromStatus}` as "delta_hp" | "delta_p" | "delta_fub" | "delta_ni";
      const dstField = `delta_${transferToStatus}` as "delta_hp" | "delta_p" | "delta_fub" | "delta_ni";

      next[srcCat] = {
        ...next[srcCat],
        [srcField]: (next[srcCat][srcField] || 0) - transferCount,
      };

      next[dstCat] = {
        ...next[dstCat],
        [dstField]: (next[dstCat][dstField] || 0) + transferCount,
      };

      return next;
    });

    const srcName = LEAD_CATEGORIES.find((c) => c.key === transferFromCat)?.label;
    const dstName = LEAD_CATEGORIES.find((c) => c.key === transferToCat)?.label;
    setStatusMessage({
      type: "success",
      text: `Transferred ${transferCount} lead(s) from ${srcName} (${transferFromStatus.toUpperCase()}) ➔ ${dstName} (${transferToStatus.toUpperCase()}).`,
    });
    setTransferModalOpen(false);
  };

  // Calculated totals across all categories (Call Activity & Pipeline)
  const totals = useMemo(() => {
    let slot1 = 0;
    let slot2 = 0;
    let slot3 = 0;
    let totalConnected = 0;

    let prevTotalHp = 0;
    let prevTotalP = 0;
    let prevTotalFub = 0;
    let prevTotalNi = 0;
    let prevTotalStock = 0;

    let totalNewLeads = 0;
    let totalDeltaHp = 0;
    let totalDeltaP = 0;
    let totalDeltaFub = 0;
    let totalDeltaNi = 0;

    let updatedTotalHp = 0;
    let updatedTotalP = 0;
    let updatedTotalFub = 0;
    let updatedTotalNi = 0;
    let updatedTotalStock = 0;

    for (const cat of LEAD_CATEGORIES) {
      const e = entries[cat.key];
      if (e) {
        if (e.slot_10_to_1) slot1 += e.slot_10_to_1;
        if (e.slot_2_to_5) slot2 += e.slot_2_to_5;
        if (e.slot_5_to_6) slot3 += e.slot_5_to_6;
        if (e.total_connected) totalConnected += e.total_connected;
      }

      const prev =
        carryForward?.categories?.[cat.key] ||
        carryForward?.categories?.[cat.label] ||
        carryForward?.categories?.[cat.key.toLowerCase()] ||
        carryForward?.categories?.[cat.label.toLowerCase()];

      const p_hp = prev?.prev_hp || 0;
      const p_p = prev?.prev_p || 0;
      const p_fub = prev?.prev_fub || 0;
      const p_ni = prev?.prev_ni || 0;
      const p_stock = prev?.prev_till_today || (p_hp + p_p + p_fub + p_ni);

      prevTotalHp += p_hp;
      prevTotalP += p_p;
      prevTotalFub += p_fub;
      prevTotalNi += p_ni;
      prevTotalStock += p_stock;

      const ch = leadChanges[cat.key] || {
        new_leads: 0,
        delta_hp: 0,
        delta_p: 0,
        delta_fub: 0,
        delta_ni: 0,
      };

      totalNewLeads += ch.new_leads;
      totalDeltaHp += ch.delta_hp;
      totalDeltaP += ch.delta_p;
      totalDeltaFub += ch.delta_fub;
      totalDeltaNi += ch.delta_ni;

      const u_hp = Math.max(0, p_hp + ch.delta_hp);
      const u_p = Math.max(0, p_p + ch.delta_p);
      const u_fub = Math.max(0, p_fub + ch.delta_fub);
      const u_ni = Math.max(0, p_ni + ch.delta_ni);
      const u_stock = Math.max(0, p_stock + ch.new_leads);

      updatedTotalHp += u_hp;
      updatedTotalP += u_p;
      updatedTotalFub += u_fub;
      updatedTotalNi += u_ni;
      updatedTotalStock += u_stock;
    }

    const totalDialed = slot1 + slot2 + slot3;
    const connectionRate =
      totalDialed > 0 ? Math.round((totalConnected / totalDialed) * 100) : 0;

    return {
      slot1,
      slot2,
      slot3,
      totalDialed,
      totalConnected,
      connectionRate,
      prevTotalHp,
      prevTotalP,
      prevTotalFub,
      prevTotalNi,
      prevTotalStock,
      totalNewLeads,
      totalDeltaHp,
      totalDeltaP,
      totalDeltaFub,
      totalDeltaNi,
      updatedTotalHp,
      updatedTotalP,
      updatedTotalFub,
      updatedTotalNi,
      updatedTotalStock,
    };
  }, [entries, carryForward, leadChanges]);

  // Build API upsert payload from current state & calculated updated totals
  const buildPayload = (): CallActivityEntry[] => {
    return LEAD_CATEGORIES.map((cat) => {
      const e = entries[cat.key];
      const prev =
        carryForward?.categories?.[cat.key] ||
        carryForward?.categories?.[cat.label] ||
        carryForward?.categories?.[cat.key.toLowerCase()] ||
        carryForward?.categories?.[cat.label.toLowerCase()];

      const p_hp = prev?.prev_hp || 0;
      const p_p = prev?.prev_p || 0;
      const p_fub = prev?.prev_fub || 0;
      const p_ni = prev?.prev_ni || 0;
      const p_stock = prev?.prev_till_today || (p_hp + p_p + p_fub + p_ni);

      const ch = leadChanges[cat.key] || {
        new_leads: 0,
        delta_hp: 0,
        delta_p: 0,
        delta_fub: 0,
        delta_ni: 0,
      };

      const updatedHp = Math.max(0, p_hp + ch.delta_hp);
      const updatedP = Math.max(0, p_p + ch.delta_p);
      const updatedFub = Math.max(0, p_fub + ch.delta_fub);
      const updatedNi = Math.max(0, p_ni + ch.delta_ni);
      const updatedStock = Math.max(0, p_stock + ch.new_leads);
      const rowDialed = (e.slot_10_to_1 || 0) + (e.slot_2_to_5 || 0) + (e.slot_5_to_6 || 0);

      return {
        lead_category: cat.key,
        slot_10_to_1: e.slot_10_to_1 ?? null,
        slot_2_to_5: e.slot_2_to_5 ?? null,
        slot_5_to_6: e.slot_5_to_6 ?? null,
        total_dialed: rowDialed > 0 ? rowDialed : null,
        total_connected: e.total_connected ?? null,
        hp_count: updatedHp,
        p_count: updatedP,
        fub_count: updatedFub,
        ni_count: updatedNi,
        till_today_status: updatedStock,
        notes: JSON.stringify({
          changes: ch,
          raw_notes: e.notes || "",
        }),
      };
    });
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!report) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload = buildPayload();
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
      const payload = buildPayload();
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
                    onClick={() => {
                      setHasUserSwitchedView(true);
                      setViewMode("cards");
                    }}
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
                    onClick={() => {
                      setHasUserSwitchedView(true);
                      setViewMode("table");
                    }}
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

        {/* ── 3-Stage Carry-Forward Pipeline Overview Bar ───────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Stage 1: Previous Total (Automatic) */}
            <div className="flex-1 bg-slate-50/90 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  1. Previous Total
                </span>
                <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {carryForward?.previous_report_date
                    ? `From ${formatReadableDate(carryForward.previous_report_date)}`
                    : "Day 1 Baseline"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-slate-700">
                <span className="bg-red-50 text-red-800 px-2 py-0.5 rounded border border-red-200 text-[11px]">
                  HP: <strong>{totals.prevTotalHp}</strong>
                </span>
                <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                  P: <strong>{totals.prevTotalP}</strong>
                </span>
                <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                  FUB: <strong>{totals.prevTotalFub}</strong>
                </span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                  NI: <strong>{totals.prevTotalNi}</strong>
                </span>
                <span className="text-slate-400 font-normal text-[11px] ml-1">
                  Total Stock: <strong className="text-slate-700">{totals.prevTotalStock}</strong>
                </span>
              </div>
            </div>

            <div className="hidden lg:flex text-slate-400 items-center justify-center font-bold">
              ➔
            </div>

            {/* Stage 2: Today's Changes (Manual) */}
            <div className="flex-1 bg-emerald-50/50 rounded-lg p-3 border border-emerald-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                  2. Today&apos;s New & Changes
                </span>
                <span className="text-[10px] font-semibold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Manual Entry
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-emerald-950">
                <span className="bg-white text-emerald-900 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                  New: <strong>+{totals.totalNewLeads}</strong>
                </span>
                <span className="bg-white text-red-800 px-2 py-0.5 rounded border border-red-200 text-[11px]">
                  Δ HP: <strong>{totals.totalDeltaHp >= 0 ? `+${totals.totalDeltaHp}` : totals.totalDeltaHp}</strong>
                </span>
                <span className="bg-white text-blue-800 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                  Δ P: <strong>{totals.totalDeltaP >= 0 ? `+${totals.totalDeltaP}` : totals.totalDeltaP}</strong>
                </span>
                <span className="bg-white text-amber-800 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                  Δ FUB: <strong>{totals.totalDeltaFub >= 0 ? `+${totals.totalDeltaFub}` : totals.totalDeltaFub}</strong>
                </span>
                <span className="bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                  Δ NI: <strong>{totals.totalDeltaNi >= 0 ? `+${totals.totalDeltaNi}` : totals.totalDeltaNi}</strong>
                </span>
              </div>
            </div>

            <div className="hidden lg:flex text-slate-400 items-center justify-center font-bold">
              ➔
            </div>

            {/* Stage 3: Live Updated Total (Automatic) */}
            <div className="flex-1 bg-green-50/70 rounded-lg p-3 border border-green-300">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-green-900 uppercase tracking-wider">
                  3. Updated Total
                </span>
                <span className="text-[10px] font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded border border-green-300">
                  No Double-Counting
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold text-green-950">
                <span className="bg-white text-red-900 px-2 py-0.5 rounded border border-red-300 text-[11px] shadow-2xs">
                  HP: {totals.updatedTotalHp}
                </span>
                <span className="bg-white text-blue-900 px-2 py-0.5 rounded border border-blue-300 text-[11px] shadow-2xs">
                  P: {totals.updatedTotalP}
                </span>
                <span className="bg-white text-amber-900 px-2 py-0.5 rounded border border-amber-300 text-[11px] shadow-2xs">
                  FUB: {totals.updatedTotalFub}
                </span>
                <span className="bg-white text-slate-800 px-2 py-0.5 rounded border border-slate-300 text-[11px] shadow-2xs">
                  NI: {totals.updatedTotalNi}
                </span>
                <span className="text-green-800 font-semibold text-[11px] ml-1">
                  Updated Stock: <strong className="text-green-900">{totals.updatedTotalStock}</strong>
                </span>
              </div>
            </div>

            {/* Transfer Lead Status Button */}
            {!isLocked && (
              <div className="flex items-center lg:self-center shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTransferModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-bold border-emerald-300 text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Transfer Lead Status
                </Button>
              </div>
            )}
          </div>
        </div>

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
                const rowConnected = e.total_connected || 0;
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
                const prevStock = prev?.prev_till_today || (prevHp + prevP + prevFub + prevNi);

                const ch = leadChanges[cat.key] || {
                  new_leads: 0,
                  delta_hp: 0,
                  delta_p: 0,
                  delta_fub: 0,
                  delta_ni: 0,
                };

                const updatedHp = Math.max(0, prevHp + ch.delta_hp);
                const updatedP = Math.max(0, prevP + ch.delta_p);
                const updatedFub = Math.max(0, prevFub + ch.delta_fub);
                const updatedNi = Math.max(0, prevNi + ch.delta_ni);
                const updatedStock = Math.max(0, prevStock + ch.new_leads);

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
                          Conn: {e.total_connected || 0}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Section 1: Calls Dialed & Connected (Separate Activity) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Calls Dialed by Time Block
                          </label>
                          <span className="text-xs font-bold text-slate-700">
                            Total: <strong className="text-green-800">{rowDialed}</strong>
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="bg-green-50/40 p-2 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              10am–1pm
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
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-green-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:outline-none text-slate-900 shadow-2xs"
                            />
                          </div>

                          <div className="bg-green-50/40 p-2 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              2pm–5pm
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
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-green-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:outline-none text-slate-900 shadow-2xs"
                            />
                          </div>

                          <div className="bg-green-50/40 p-2 rounded-xl border border-green-200/70 text-center">
                            <span className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                              5pm–6pm
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
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-green-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:outline-none text-slate-900 shadow-2xs"
                            />
                          </div>

                          {/* Independent Connected Input */}
                          <div className="bg-emerald-50/50 p-2 rounded-xl border border-emerald-300 text-center">
                            <span className="text-[10px] font-bold uppercase text-emerald-800 block mb-1">
                              Connected
                            </span>
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={e.total_connected ?? ""}
                              onChange={(ev) =>
                                handleCellChange(cat.key, "total_connected", ev.target.value)
                              }
                              placeholder="0"
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-emerald-400 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:outline-none text-emerald-950 shadow-2xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Lead Stock & Status Progression (3-Stage Workflow) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Lead Stock & Status Progression
                          </label>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                setTransferFromCat(cat.key);
                                setTransferModalOpen(true);
                              }}
                              className="text-[10px] text-emerald-800 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 flex items-center gap-1"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              Transfer Status
                            </button>
                          )}
                        </div>

                        {/* Today's New Leads Input */}
                        <div className="mb-2.5 p-2 bg-emerald-50/40 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                          <div className="text-xs">
                            <span className="font-bold text-emerald-950 block">Today&apos;s New Leads</span>
                            <span className="text-[10px] text-slate-500">Increases total pipeline stock</span>
                          </div>
                          <div className="w-24">
                            <input
                              type="number"
                              min="0"
                              disabled={isLocked || loading}
                              value={ch.new_leads === 0 ? "" : ch.new_leads}
                              onChange={(ev) =>
                                handleLeadChange(cat.key, "new_leads", ev.target.value)
                              }
                              placeholder="+0"
                              className="w-full text-center py-1 text-sm font-bold bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-600 text-emerald-900 shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* 4 Status Delta Boxes */}
                        <div className="grid grid-cols-2 gap-2.5">
                          {/* HP Box */}
                          <div className="bg-red-50/40 p-2.5 rounded-xl border border-red-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-red-950 flex items-center gap-1">
                                <Flame className="w-3.5 h-3.5 text-red-600" /> HP
                              </span>
                              <span className="text-[10px] font-bold text-red-900 bg-red-100 px-1.5 py-0.2 rounded border border-red-200">
                                Total: {updatedHp}
                              </span>
                            </div>
                            <input
                              type="number"
                              disabled={isLocked || loading}
                              value={ch.delta_hp === 0 ? "" : ch.delta_hp}
                              onChange={(ev) =>
                                handleLeadChange(cat.key, "delta_hp", ev.target.value)
                              }
                              placeholder="+0"
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-red-300 rounded-lg focus:ring-2 focus:ring-red-600 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-slate-500 text-center font-medium mt-1">
                              Base: {prevHp} {ch.delta_hp !== 0 ? `(${ch.delta_hp > 0 ? `+${ch.delta_hp}` : ch.delta_hp})` : ""}
                            </div>
                          </div>

                          {/* P Box */}
                          <div className="bg-blue-50/40 p-2.5 rounded-xl border border-blue-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-blue-600" /> P
                              </span>
                              <span className="text-[10px] font-bold text-blue-900 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
                                Total: {updatedP}
                              </span>
                            </div>
                            <input
                              type="number"
                              disabled={isLocked || loading}
                              value={ch.delta_p === 0 ? "" : ch.delta_p}
                              onChange={(ev) =>
                                handleLeadChange(cat.key, "delta_p", ev.target.value)
                              }
                              placeholder="+0"
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-slate-500 text-center font-medium mt-1">
                              Base: {prevP} {ch.delta_p !== 0 ? `(${ch.delta_p > 0 ? `+${ch.delta_p}` : ch.delta_p})` : ""}
                            </div>
                          </div>

                          {/* Fub Box */}
                          <div className="bg-amber-50/40 p-2.5 rounded-xl border border-amber-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-amber-600" /> FUB
                              </span>
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                Total: {updatedFub}
                              </span>
                            </div>
                            <input
                              type="number"
                              disabled={isLocked || loading}
                              value={ch.delta_fub === 0 ? "" : ch.delta_fub}
                              onChange={(ev) =>
                                handleLeadChange(cat.key, "delta_fub", ev.target.value)
                              }
                              placeholder="+0"
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-600 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-slate-500 text-center font-medium mt-1">
                              Base: {prevFub} {ch.delta_fub !== 0 ? `(${ch.delta_fub > 0 ? `+${ch.delta_fub}` : ch.delta_fub})` : ""}
                            </div>
                          </div>

                          {/* NI Box */}
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5 text-slate-500" /> NI
                              </span>
                              <span className="text-[10px] font-bold text-slate-800 bg-slate-200 px-1.5 py-0.2 rounded border border-slate-300">
                                Total: {updatedNi}
                              </span>
                            </div>
                            <input
                              type="number"
                              disabled={isLocked || loading}
                              value={ch.delta_ni === 0 ? "" : ch.delta_ni}
                              onChange={(ev) =>
                                handleLeadChange(cat.key, "delta_ni", ev.target.value)
                              }
                              placeholder="+0"
                              className="w-full text-center py-1.5 text-base font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 text-slate-900 shadow-2xs"
                            />
                            <div className="text-[10px] text-slate-500 text-center font-medium mt-1">
                              Base: {prevNi} {ch.delta_ni !== 0 ? `(${ch.delta_ni > 0 ? `+${ch.delta_ni}` : ch.delta_ni})` : ""}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Till Today Cumulative Stock Footer */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Cumulative Pipeline Stock:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px]">
                            Base: {prevStock} {ch.new_leads > 0 ? `+ New: ${ch.new_leads}` : ""}
                          </span>
                          <span className="font-extrabold text-sm text-green-900 bg-green-100/70 px-2 py-0.5 rounded border border-green-300">
                            {updatedStock}
                          </span>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-green-700" />
                  Daily Dialed & Lead Classification Pipeline
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{formatReadableDate(reportDate)}</span>
                  {carryForward?.previous_report_date && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Baseline from {carryForward.previous_report_date}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                    <th className="py-2.5 px-3 min-w-[150px] sticky left-0 bg-slate-100/95 z-10">
                      Lead Category
                    </th>
                    <th className="py-2.5 px-2 text-center w-20 bg-green-50/40">
                      <Tooltip content="10:00 AM – 1:00 PM" subcontent="Morning call block dials.">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900">10am-1pm</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20 bg-green-50/40">
                      <Tooltip content="2:00 PM – 5:00 PM" subcontent="Afternoon call block dials.">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900">2pm-5pm</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20 bg-green-50/40">
                      <Tooltip content="5:00 PM – 6:00 PM" subcontent="Late afternoon wrap-up call block dials.">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900">5pm-6pm</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20 bg-slate-50 font-bold">
                      <Tooltip content="Total Dialed" subcontent="Sum of calls dialed across all 3 time blocks today.">
                        <span className="border-b border-dotted border-slate-500 font-bold text-slate-900">Dialed</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-22 bg-emerald-50/60 font-bold">
                      <Tooltip content="Connected Calls" subcontent="Productive calls connected with clients today (independent call metric).">
                        <span className="font-bold text-emerald-900 border-b border-dotted border-emerald-700 hover:text-emerald-950">Connected</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20 bg-slate-50">
                      <Tooltip content="Previous Total Stock" subcontent="Cumulative leads loaded from previous day's report baseline.">
                        <span className="border-b border-dotted border-slate-400 hover:text-slate-900">Prev Stock</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-22 bg-emerald-50/30">
                      <Tooltip content="Today's New Leads" subcontent="Fresh new leads acquired today in this category (adds to cumulative stock).">
                        <span className="font-bold text-emerald-800 border-b border-dotted border-emerald-600 hover:text-emerald-950">+ New Leads</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="HP — High Potential" subcontent="Enter today's status change. Live total is auto-calculated from previous baseline.">
                        <span className="font-bold text-red-800 border-b border-dotted border-red-600 hover:text-red-950">Δ HP</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="P — Potential" subcontent="Enter today's status change. Live total is auto-calculated from previous baseline.">
                        <span className="font-bold text-blue-800 border-b border-dotted border-blue-600 hover:text-blue-950">Δ P</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="FUB — Follow-Up Booked" subcontent="Enter today's status change. Live total is auto-calculated from previous baseline.">
                        <span className="font-bold text-amber-800 border-b border-dotted border-amber-600 hover:text-amber-950">Δ FUB</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-20">
                      <Tooltip content="NI — Not Interested" subcontent="Enter today's status change. Live total is auto-calculated from previous baseline.">
                        <span className="font-bold text-slate-600 border-b border-dotted border-slate-400 hover:text-slate-900">Δ NI</span>
                      </Tooltip>
                    </th>
                    <th className="py-2.5 px-2 text-center w-22 bg-green-50/50 font-bold">
                      <Tooltip content="Updated Cumulative Stock" subcontent="Live total cumulative stock: Prev Stock + Today's New Leads." align="right">
                        <span className="font-bold text-green-900 border-b border-dotted border-green-700 hover:text-green-950">Updated Stock</span>
                      </Tooltip>
                    </th>
                    {!isLocked && (
                      <th className="py-2.5 px-2 text-center w-16">
                        <span>Action</span>
                      </th>
                    )}
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
                    const prevStock = prev?.prev_till_today || (prevHp + prevP + prevFub + prevNi);

                    const ch = leadChanges[cat.key] || {
                      new_leads: 0,
                      delta_hp: 0,
                      delta_p: 0,
                      delta_fub: 0,
                      delta_ni: 0,
                    };

                    const updatedHp = Math.max(0, prevHp + ch.delta_hp);
                    const updatedP = Math.max(0, prevP + ch.delta_p);
                    const updatedFub = Math.max(0, prevFub + ch.delta_fub);
                    const updatedNi = Math.max(0, prevNi + ch.delta_ni);
                    const updatedStock = Math.max(0, prevStock + ch.new_leads);

                    return (
                      <tr
                        key={cat.key}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        {/* Category Label */}
                        <td className="py-2.5 px-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-100 align-middle">
                          <div className="font-medium text-slate-900">{cat.label}</div>
                          {prev && (prevHp > 0 || prevP > 0 || prevFub > 0 || prevNi > 0) && (
                            <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                              Base: {prevHp} HP, {prevP} P, {prevFub} FUB, {prevNi} NI
                            </div>
                          )}
                        </td>

                        {/* 10 AM to 1 PM */}
                        <td className="p-1 text-center bg-green-50/20 align-middle">
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
                        <td className="p-1 text-center bg-green-50/20 align-middle">
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
                        <td className="p-1 text-center bg-green-50/20 align-middle">
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
                        <td className="py-2 px-2 text-center font-bold text-slate-900 bg-slate-50/80 align-middle">
                          {rowDialed > 0 ? rowDialed : "—"}
                        </td>

                        {/* Connected Calls Input (Independent) */}
                        <td className="p-1 text-center bg-emerald-50/30 align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={e.total_connected ?? ""}
                            onChange={(ev) =>
                              handleCellChange(cat.key, "total_connected", ev.target.value)
                            }
                            placeholder="0"
                            className="w-full text-center py-1 border border-emerald-300 rounded text-xs font-bold text-emerald-950 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* Prev Stock (Baseline) */}
                        <td className="py-2 px-2 text-center font-semibold text-slate-600 bg-slate-50/60 align-middle">
                          {prevStock}
                        </td>

                        {/* Today's New Leads Input */}
                        <td className="p-1 text-center bg-emerald-50/20 align-middle">
                          <input
                            type="number"
                            min="0"
                            disabled={isLocked || loading}
                            value={ch.new_leads === 0 ? "" : ch.new_leads}
                            onChange={(ev) =>
                              handleLeadChange(cat.key, "new_leads", ev.target.value)
                            }
                            placeholder="+0"
                            className="w-full text-center py-1 border border-emerald-300 rounded text-xs font-bold text-emerald-900 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>

                        {/* Delta HP */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            disabled={isLocked || loading}
                            value={ch.delta_hp === 0 ? "" : ch.delta_hp}
                            onChange={(ev) =>
                              handleLeadChange(cat.key, "delta_hp", ev.target.value)
                            }
                            placeholder="+0"
                            className="w-full text-center py-1 border border-red-200 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-red-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                          <div className="mt-0.5">
                            <span
                              className="inline-block text-[10px] font-bold text-red-900 bg-red-50 px-1 py-0.2 rounded border border-red-200 cursor-help"
                              title={`Base: ${prevHp} + Delta: ${ch.delta_hp} = Live Total: ${updatedHp}`}
                            >
                              Tot: {updatedHp}
                            </span>
                          </div>
                        </td>

                        {/* Delta P */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            disabled={isLocked || loading}
                            value={ch.delta_p === 0 ? "" : ch.delta_p}
                            onChange={(ev) =>
                              handleLeadChange(cat.key, "delta_p", ev.target.value)
                            }
                            placeholder="+0"
                            className="w-full text-center py-1 border border-blue-200 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                          <div className="mt-0.5">
                            <span
                              className="inline-block text-[10px] font-bold text-blue-900 bg-blue-50 px-1 py-0.2 rounded border border-blue-200 cursor-help"
                              title={`Base: ${prevP} + Delta: ${ch.delta_p} = Live Total: ${updatedP}`}
                            >
                              Tot: {updatedP}
                            </span>
                          </div>
                        </td>

                        {/* Delta FUB */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            disabled={isLocked || loading}
                            value={ch.delta_fub === 0 ? "" : ch.delta_fub}
                            onChange={(ev) =>
                              handleLeadChange(cat.key, "delta_fub", ev.target.value)
                            }
                            placeholder="+0"
                            className="w-full text-center py-1 border border-amber-200 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-amber-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                          <div className="mt-0.5">
                            <span
                              className="inline-block text-[10px] font-bold text-amber-900 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 cursor-help"
                              title={`Base: ${prevFub} + Delta: ${ch.delta_fub} = Live Total: ${updatedFub}`}
                            >
                              Tot: {updatedFub}
                            </span>
                          </div>
                        </td>

                        {/* Delta NI */}
                        <td className="p-1 text-center align-middle">
                          <input
                            type="number"
                            disabled={isLocked || loading}
                            value={ch.delta_ni === 0 ? "" : ch.delta_ni}
                            onChange={(ev) =>
                              handleLeadChange(cat.key, "delta_ni", ev.target.value)
                            }
                            placeholder="+0"
                            className="w-full text-center py-1 border border-slate-200 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          />
                          <div className="mt-0.5">
                            <span
                              className="inline-block text-[10px] font-bold text-slate-700 bg-slate-100 px-1 py-0.2 rounded border border-slate-200 cursor-help"
                              title={`Base: ${prevNi} + Delta: ${ch.delta_ni} = Live Total: ${updatedNi}`}
                            >
                              Tot: {updatedNi}
                            </span>
                          </div>
                        </td>

                        {/* Updated Stock */}
                        <td className="py-2 px-2 text-center font-bold text-green-950 bg-green-50/40 align-middle">
                          <span className="text-xs bg-white px-2 py-0.5 rounded border border-green-300">
                            {updatedStock}
                          </span>
                        </td>

                        {/* Transfer Action Button */}
                        {!isLocked && (
                          <td className="py-2 px-1 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => {
                                setTransferFromCat(cat.key);
                                setTransferModalOpen(true);
                              }}
                              className="p-1 rounded hover:bg-emerald-100 text-emerald-800 border border-emerald-200 active:scale-95 transition-all"
                              title={`Transfer lead status for ${cat.label}`}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {/* ── Summary Totals Row ─────────────────────────────────── */}
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td className="py-3 px-3 uppercase tracking-wider text-[11px] sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                      Grand Total
                    </td>
                    <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot1 || 0}</td>
                    <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot2 || 0}</td>
                    <td className="py-3 px-2 text-center text-green-800 bg-green-100/50">{totals.slot3 || 0}</td>
                    <td className="py-3 px-2 text-center text-sm font-extrabold text-slate-900 bg-slate-200/80">
                      {totals.totalDialed || 0}
                    </td>
                    <td className="py-3 px-2 text-center text-sm font-extrabold text-emerald-900 bg-emerald-100/60">
                      {totals.totalConnected || 0}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-700 bg-slate-100">{totals.prevTotalStock || 0}</td>
                    <td className="py-3 px-2 text-center text-emerald-900 bg-emerald-100/40 font-extrabold">
                      +{totals.totalNewLeads || 0}
                    </td>
                    {/* HP Total */}
                    <td className="py-2.5 px-2 text-center text-red-900 bg-red-50/50">
                      <div className="font-extrabold">{totals.updatedTotalHp || 0}</div>
                      {totals.totalDeltaHp !== 0 && (
                        <div className="text-[10px] text-red-700 font-medium">
                          {totals.totalDeltaHp > 0 ? `+${totals.totalDeltaHp}` : totals.totalDeltaHp}
                        </div>
                      )}
                    </td>
                    {/* P Total */}
                    <td className="py-2.5 px-2 text-center text-blue-900 bg-blue-50/50">
                      <div className="font-extrabold">{totals.updatedTotalP || 0}</div>
                      {totals.totalDeltaP !== 0 && (
                        <div className="text-[10px] text-blue-700 font-medium">
                          {totals.totalDeltaP > 0 ? `+${totals.totalDeltaP}` : totals.totalDeltaP}
                        </div>
                      )}
                    </td>
                    {/* FUB Total */}
                    <td className="py-2.5 px-2 text-center text-amber-900 bg-amber-50/50">
                      <div className="font-extrabold">{totals.updatedTotalFub || 0}</div>
                      {totals.totalDeltaFub !== 0 && (
                        <div className="text-[10px] text-amber-700 font-medium">
                          {totals.totalDeltaFub > 0 ? `+${totals.totalDeltaFub}` : totals.totalDeltaFub}
                        </div>
                      )}
                    </td>
                    {/* NI Total */}
                    <td className="py-2.5 px-2 text-center text-slate-800 bg-slate-100">
                      <div className="font-extrabold">{totals.updatedTotalNi || 0}</div>
                      {totals.totalDeltaNi !== 0 && (
                        <div className="text-[10px] text-slate-600 font-medium">
                          {totals.totalDeltaNi > 0 ? `+${totals.totalDeltaNi}` : totals.totalDeltaNi}
                        </div>
                      )}
                    </td>
                    {/* Updated Stock Total */}
                    <td className="py-2.5 px-2 text-center text-sm font-extrabold text-green-950 bg-green-100/70">
                      {totals.updatedTotalStock || 0}
                    </td>
                    {!isLocked && <td className="py-2.5 px-1 bg-slate-100" />}
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
                Hot & Follow-Up Client Directory
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
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Productive calls connected
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
                {totals.updatedTotalHp}
              </div>
              {totals.totalDeltaHp !== 0 && (
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-300">
                  {totals.totalDeltaHp > 0 ? `+${totals.totalDeltaHp}` : totals.totalDeltaHp} today
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Live updated HP pipeline total
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
              HP: {totals.updatedTotalHp} {totals.totalDeltaHp !== 0 && `(${totals.totalDeltaHp > 0 ? `+${totals.totalDeltaHp}` : totals.totalDeltaHp})`}
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

        {/* ── Transfer Lead Status / Category Modal ──────────────────────── */}
        <Modal
          isOpen={transferModalOpen}
          onClose={() => setTransferModalOpen(false)}
          title="Transfer Lead Status or Category"
          description="Move existing leads between statuses (e.g. FUB ➔ HP) or across lead sources without changing total stock."
        >
          <div className="space-y-4 text-xs">
            {/* From Source */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="font-bold text-slate-700 uppercase tracking-wider block">
                Source Lead
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    From Category
                  </label>
                  <select
                    value={transferFromCat}
                    onChange={(e) => setTransferFromCat(e.target.value as LeadCategory)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  >
                    {LEAD_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    From Status
                  </label>
                  <select
                    value={transferFromStatus}
                    onChange={(e) => setTransferFromStatus(e.target.value as "hp" | "p" | "fub" | "ni")}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  >
                    <option value="hp">HP (High Potential)</option>
                    <option value="p">P (Potential)</option>
                    <option value="fub">FUB (Follow-Up Booked)</option>
                    <option value="ni">NI (Not Interested)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* To Destination */}
            <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200 space-y-2">
              <span className="font-bold text-emerald-900 uppercase tracking-wider block">
                Destination Lead
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    To Category
                  </label>
                  <select
                    value={transferToCat}
                    onChange={(e) => setTransferToCat(e.target.value as LeadCategory)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  >
                    {LEAD_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    To Status
                  </label>
                  <select
                    value={transferToStatus}
                    onChange={(e) => setTransferToStatus(e.target.value as "hp" | "p" | "fub" | "ni")}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  >
                    <option value="hp">HP (High Potential)</option>
                    <option value="p">P (Potential)</option>
                    <option value="fub">FUB (Follow-Up Booked)</option>
                    <option value="ni">NI (Not Interested)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Count */}
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Number of Leads to Transfer
              </label>
              <input
                type="number"
                min="1"
                value={transferCount}
                onChange={(e) => setTransferCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                This will automatically subtract {transferCount} from source and add {transferCount} to destination.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTransferModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleApplyTransfer}
              >
                Apply Transfer
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
                  <option value="HP">HP — High Potential</option>
                  <option value="P">P — Potential</option>
                  <option value="FUB">FUB — Follow-Up Booked</option>
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
