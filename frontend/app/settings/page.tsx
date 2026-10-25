"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import {
  Target,
  Sliders,
  Plus,
  Edit2,
  Trash2,
  Users,
  Trophy,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { KPILeaderboard } from "@/components/dashboard/kpi-leaderboard";
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
import { api, ApiError } from "@/lib/api";
import { DailyTarget, User } from "@/types";
import { formatBDT, getDhakaToday, formatReadableDate, formatEmployeeId } from "@/lib/utils";

function SettingsContent() {
  const [activeTargetTab, setActiveTargetTab] = useState<"performance" | "config">("performance");
  // Targets state
  const [targets, setTargets] = useState<DailyTarget[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Target Modal State
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<DailyTarget | null>(null);

  // Target Form fields
  const [targetEmployeeId, setTargetEmployeeId] = useState<number | "global">("global");
  const [targetDate, setTargetDate] = useState<string>("");
  const [dialedTarget, setDialedTarget] = useState<string>("50");
  const [connectedTarget, setConnectedTarget] = useState<string>("20");
  const [callDurationTarget, setCallDurationTarget] = useState<string>("120");
  const [outdoorTarget, setOutdoorTarget] = useState<string>("3");
  const [meetingTarget, setMeetingTarget] = useState<string>("180");
  const [salesTarget, setSalesTarget] = useState<string>("500000");
  const [collectionTarget, setCollectionTarget] = useState<string>("300000");

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [targetsData, employeesData] = await Promise.all([
        api.settings.getTargets(),
        api.employees.list({ is_active: true }),
      ]);
      setTargets(Array.isArray(targetsData) ? targetsData : []);
      setEmployees(Array.isArray(employeesData) ? employeesData : []);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load system settings and targets.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateTarget = () => {
    const today = getDhakaToday();
    setEditingTarget(null);
    setTargetEmployeeId("global");
    setTargetDate(today);
    setDialedTarget("50");
    setConnectedTarget("20");
    setCallDurationTarget("120");
    setOutdoorTarget("3");
    setMeetingTarget("180");
    setSalesTarget("500000");
    setCollectionTarget("300000");
    setFormError(null);
    setIsTargetModalOpen(true);
  };

  const openEditTarget = (t: DailyTarget) => {
    const today = getDhakaToday();
    setEditingTarget(t);
    setTargetEmployeeId(t.employee_id ? t.employee_id : "global");
    setTargetDate(t.target_date || t.effective_from || today);
    setDialedTarget(t.dialed_calls_target ? String(t.dialed_calls_target) : "");
    setConnectedTarget(t.connected_calls_target ? String(t.connected_calls_target) : "");
    setCallDurationTarget(t.call_duration_minutes_target ? String(t.call_duration_minutes_target) : "");
    
    const outdoorVal = t.outdoor_visits_target ?? t.outdoor_visit_target;
    setOutdoorTarget(outdoorVal ? String(outdoorVal) : "");
    
    let meetingVal = t.meeting_minutes_target;
    if (meetingVal == null && t.meeting_hours_target != null) {
      meetingVal = Math.round(Number(t.meeting_hours_target) * 60);
    }
    setMeetingTarget(meetingVal ? String(meetingVal) : "");

    const salesVal = t.sales_amount_target ?? t.sales_target;
    setSalesTarget(salesVal ? String(salesVal) : "");

    const collVal = t.collection_amount_target ?? t.tb_target;
    setCollectionTarget(collVal ? String(collVal) : "");
    setFormError(null);
    setIsTargetModalOpen(true);
  };

  const handleTargetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    const effDate = targetDate || getDhakaToday();
    const payload: Partial<DailyTarget> = {
      employee_id: targetEmployeeId === "global" ? null : Number(targetEmployeeId),
      effective_from: effDate,
      target_date: effDate,
      dialed_calls_target: dialedTarget ? parseInt(dialedTarget, 10) : null,
      connected_calls_target: connectedTarget ? parseInt(connectedTarget, 10) : null,
      call_duration_minutes_target: callDurationTarget ? parseInt(callDurationTarget, 10) : null,
      outdoor_visit_target: outdoorTarget ? parseInt(outdoorTarget, 10) : null,
      outdoor_visits_target: outdoorTarget ? parseInt(outdoorTarget, 10) : null,
      meeting_hours_target: meetingTarget ? parseFloat((parseInt(meetingTarget, 10) / 60).toFixed(2)) : null,
      meeting_minutes_target: meetingTarget ? parseInt(meetingTarget, 10) : null,
      sales_target: salesTarget ? parseFloat(salesTarget) : null,
      sales_amount_target: salesTarget ? parseFloat(salesTarget) : null,
      tb_target: collectionTarget ? parseFloat(collectionTarget) : null,
      collection_amount_target: collectionTarget ? parseFloat(collectionTarget) : null,
    };

    try {
      if (editingTarget) {
        const updated = await api.settings.updateTarget(editingTarget.id, payload);
        setTargets((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        setStatusMessage({
          type: "success",
          text: "Daily target successfully updated.",
        });
      } else {
        const created = await api.settings.createTarget(payload);
        setTargets((prev) => [created, ...prev]);
        setStatusMessage({
          type: "success",
          text: "New performance target established successfully.",
        });
      }
      setIsTargetModalOpen(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save target. Please try again.");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteTarget = async (id: number) => {
    setDeletingTarget(true);
    try {
      await api.settings.deleteTarget(id);
      setTargets((prev) => prev.filter((t) => t.id !== id));
      setDeleteTargetId(null);
      setStatusMessage({
        type: "success",
        text: "Target removed successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({ type: "error", text: "Failed to delete target." });
      }
    } finally {
      setDeletingTarget(false);
    }
  };

  return (
    <DashboardLayout
      title="Settings & Targets"
      subtitle="Configure daily employee KPI targets, business parameters, and system labels"
      adminOnly
    >
      <div className="space-y-6">
        {/* ── Status Feedback Alert ────────────────────────────────────────── */}
        {statusMessage && (
          <Alert
            type={statusMessage.type}
            onDismiss={() => setStatusMessage(null)}
          >
            {statusMessage.text}
          </Alert>
        )}

        {/* ── Daily Performance Targets Section ───────────────────────────── */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-700" />
                Daily KPI Performance Targets
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Track live employee target achievements against benchmarks, or customize quota thresholds.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTargetTab("performance")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTargetTab === "performance"
                      ? "bg-white text-emerald-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  Live Achievements & Leaderboard
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTargetTab("config")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTargetTab === "config"
                      ? "bg-white text-emerald-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  Configure Thresholds ({targets.length})
                </button>
              </div>

              {activeTargetTab === "config" && (
                <Button variant="primary" size="sm" onClick={openCreateTarget}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Set Target
                </Button>
              )}
            </div>
          </div>

          {activeTargetTab === "performance" ? (
            <KPILeaderboard
              startDate={getDhakaToday()}
              endDate={getDhakaToday()}
              title="Today's Target Achievement & Performance Ranking"
              subtitle="Live real-time comparison of employee activities against assigned targets"
            />
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-700" />
                    Target Threshold Configurations
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Target values used to calculate achievement percentages and leaderboard scores
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={openCreateTarget}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Set Target
                </Button>
              </CardHeader>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                      <th className="py-2.5 px-4">Scope</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Dialed Calls</th>
                  <th className="py-2.5 px-3 text-right">Connected</th>
                  <th className="py-2.5 px-3 text-right">Outdoor Visits</th>
                  <th className="py-2.5 px-3 text-right">Meeting Time</th>
                  <th className="py-2.5 px-3 text-right">Sales Target (BDT)</th>
                  <th className="py-2.5 px-3 text-right">Collection Target (BDT)</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      Loading targets...
                    </td>
                  </tr>
                ) : !Array.isArray(targets) || targets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      No custom targets configured yet. Global defaults are active.
                    </td>
                  </tr>
                ) : (
                  targets.map((t) => {
                    const emp = employees.find((e) => e.id === t.employee_id);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {emp ? (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <Users className="w-3.5 h-3.5 text-green-700" />
                              <span>{emp.full_name}</span>
                              <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1 py-0.2 rounded">
                                {formatEmployeeId(emp.id)}
                              </span>
                            </span>
                          ) : (
                            <Badge variant="neutral">Global Default</Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {t.target_date || t.effective_from
                            ? formatReadableDate(t.target_date || t.effective_from || "")
                            : "All Dates"}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-slate-900">
                          {t.dialed_calls_target ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-emerald-700">
                          {t.connected_calls_target ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-700">
                          {t.outdoor_visits_target ?? t.outdoor_visit_target ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-700">
                          {t.meeting_minutes_target
                            ? `${t.meeting_minutes_target}m`
                            : t.meeting_hours_target
                            ? `${Math.round(Number(t.meeting_hours_target) * 60)}m`
                            : "—"}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-900">
                          {(t.sales_amount_target ?? t.sales_target) != null
                            ? formatBDT(t.sales_amount_target ?? t.sales_target!)
                            : "—"}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-emerald-800">
                          {(t.collection_amount_target ?? t.tb_target) != null
                            ? formatBDT(t.collection_amount_target ?? t.tb_target!)
                            : "—"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditTarget(t)}
                              className="p-1 text-slate-400 hover:text-green-700 rounded transition-colors"
                              title="Edit Target"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTargetId(t.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Delete Target"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>

        {/* ── Business Hours & System Parameters Section ──────────────────── */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-green-700" />
                Operational System Configuration
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Time slots, business timezone, and lead status definitions
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="font-semibold text-slate-900">Reporting Time Slots</p>
                <div className="space-y-1 text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Morning Slot</span>
                    <span className="font-mono font-medium">10:00 AM – 01:00 PM</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Afternoon Slot</span>
                    <span className="font-mono font-medium">02:00 PM – 05:00 PM</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Evening Slot</span>
                    <span className="font-mono font-medium">05:00 PM – 06:00 PM</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="font-semibold text-slate-900">Business Timezone & Currency</p>
                <div className="space-y-1 text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Operating Timezone</span>
                    <span className="font-mono font-medium">Asia/Dhaka (UTC+6)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Standard Currency</span>
                    <span className="font-mono font-medium">BDT (৳)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Report Lock Status</span>
                    <span className="font-medium text-emerald-700">Enforced on Submit</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Target Edit Modal ────────────────────────────────────────────── */}
        <Modal
          isOpen={isTargetModalOpen}
          onClose={() => setIsTargetModalOpen(false)}
          title={editingTarget ? "Edit Daily Target" : "Establish Performance Target"}
          description="Specify daily quotas for phone calls, customer visits, and collections"
        >
          <form onSubmit={handleTargetSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Scope
                </label>
                <select
                  value={targetEmployeeId}
                  onChange={(e) =>
                    setTargetEmployeeId(
                      e.target.value === "global" ? "global" : Number(e.target.value)
                    )
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                >
                  <option value="global">Global Company Default</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({formatEmployeeId(emp.id)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Dialed Calls Target
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 50"
                  value={dialedTarget}
                  onChange={(e) => setDialedTarget(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Connected Target
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 20"
                  value={connectedTarget}
                  onChange={(e) => setConnectedTarget(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Outdoor Visits Target
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 3"
                  value={outdoorTarget}
                  onChange={(e) => setOutdoorTarget(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Meeting Minutes Target
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 180"
                  value={meetingTarget}
                  onChange={(e) => setMeetingTarget(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Sales Target (BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 500000"
                  value={salesTarget}
                  onChange={(e) => setSalesTarget(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Collection Target (BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 300000"
                  value={collectionTarget}
                  onChange={(e) => setCollectionTarget(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTargetModalOpen(false)}
                disabled={formSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={formSubmitting}>
                Save Target
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Delete Target Confirmation Modal ─────────────────────────────── */}
        <Modal
          isOpen={deleteTargetId !== null}
          onClose={() => setDeleteTargetId(null)}
          title="Confirm Delete Target"
          description="Are you sure you want to remove this KPI target?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This target configuration will be permanently removed. The employee or system will revert to default global targets.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTargetId(null)}
                disabled={deletingTarget}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deletingTarget}
                onClick={() => deleteTargetId && handleDeleteTarget(deleteTargetId)}
              >
                Delete Target
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Settings & Targets...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
