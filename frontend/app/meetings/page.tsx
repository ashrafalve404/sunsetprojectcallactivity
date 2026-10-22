"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Users,
  Save,
  Send,
  Lock,
  Calendar,
  Clock,
  MapPin,
  UserCheck,
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
  MEETING_METRICS,
  MeetingMetricType,
  MeetingActivityEntry,
  Report,
} from "@/types";
import { getDhakaToday, formatReadableDate, formatMinutes } from "@/lib/utils";

function MeetingTimeDailyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const today = getDhakaToday();
  const initialDate = searchParams.get("date") || today;
  const targetEmployeeId = searchParams.get("employee_id")
    ? parseInt(searchParams.get("employee_id")!, 10)
    : undefined;
  const [reportDate, setReportDate] = useState<string>(initialDate);

  // State
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<Record<MeetingMetricType, MeetingActivityEntry>>(() => {
    const init: Record<string, MeetingActivityEntry> = {};
    for (const m of MEETING_METRICS) {
      init[m.key] = {
        metric_type: m.key,
        till_today: null,
        slot_10_to_1: null,
        slot_2_to_5: null,
        slot_5_to_6: null,
      };
    }
    return init as Record<MeetingMetricType, MeetingActivityEntry>;
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Load report & meeting entries
  const loadMeetingData = useCallback(async (dateStr: string, empId?: number) => {
    setLoading(true);
    setStatusMessage(null);
    try {
      let r: Report;
      try {
        r = await api.reports.getByDate(dateStr, empId);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          r = await api.reports.create(dateStr, empId);
        } else {
          throw err;
        }
      }
      setReport(r);

      const meetingData = await api.meetings.get(r.id);
      if (meetingData && meetingData.entries && meetingData.entries.length > 0) {
        const loaded: Record<string, MeetingActivityEntry> = {};
        for (const m of MEETING_METRICS) {
          const found = meetingData.entries.find((e) => e.metric_type === m.key);
          loaded[m.key] = found || {
            metric_type: m.key,
            till_today: null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
          };
        }
        setEntries(loaded as Record<MeetingMetricType, MeetingActivityEntry>);
      } else {
        const reset: Record<string, MeetingActivityEntry> = {};
        for (const m of MEETING_METRICS) {
          reset[m.key] = {
            metric_type: m.key,
            till_today: null,
            slot_10_to_1: null,
            slot_2_to_5: null,
            slot_5_to_6: null,
          };
        }
        setEntries(reset as Record<MeetingMetricType, MeetingActivityEntry>);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load meeting activities for this date.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetingData(reportDate, targetEmployeeId);
  }, [reportDate, targetEmployeeId, loadMeetingData]);

  const handleCellChange = (
    metricKey: MeetingMetricType,
    field: keyof MeetingActivityEntry,
    valStr: string
  ) => {
    if (report?.is_submitted) return;

    const trimmed = valStr.trim();
    const num = trimmed === "" ? null : Math.max(0, parseInt(trimmed, 10));
    setEntries((prev) => ({
      ...prev,
      [metricKey]: {
        ...prev[metricKey],
        [field]: isNaN(num as number) ? null : num,
      },
    }));
  };

  // Calculations: Separate count totals from minutes totals
  const totals = useMemo(() => {
    const getRowSum = (key: MeetingMetricType) => {
      const e = entries[key];
      if (!e) return 0;
      return (e.slot_10_to_1 || 0) + (e.slot_2_to_5 || 0) + (e.slot_5_to_6 || 0);
    };

    const outdoorVisits = getRowSum("outdoor_visit_count");
    const outdoorMinutes = getRowSum("outdoor_time_minutes");
    const indoorCxCount = getRowSum("indoor_cx_count");
    const indoorMinutes = getRowSum("indoor_cx_time_minutes");
    const mgMinutes = getRowSum("mg_time_minutes");
    const teamMeetingMinutes = getRowSum("team_meeting_time_minutes");

    const totalMeetingMinutes =
      outdoorMinutes + indoorMinutes + mgMinutes + teamMeetingMinutes;

    return {
      outdoorVisits,
      outdoorMinutes,
      indoorCxCount,
      indoorMinutes,
      mgMinutes,
      teamMeetingMinutes,
      totalMeetingMinutes,
      formattedTotalTime: formatMinutes(totalMeetingMinutes),
    };
  }, [entries]);

  const handleSaveDraft = async () => {
    if (!report) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload: MeetingActivityEntry[] = MEETING_METRICS.map(
        (m) => entries[m.key]
      );
      await api.meetings.upsert(report.id, payload);
      setStatusMessage({
        type: "success",
        text: "Meeting activity draft saved successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to save meeting draft. Your entries are retained.",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!report) return;
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const payload: MeetingActivityEntry[] = MEETING_METRICS.map(
        (m) => entries[m.key]
      );
      await api.meetings.upsert(report.id, payload);

      const updated = await api.reports.submit(report.id);
      setReport(updated);
      setSubmitModalOpen(false);
      setStatusMessage({
        type: "success",
        text: "Report finalized and submitted! Meeting activities are now locked.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to submit report. Please review your entries.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = report?.is_submitted ?? false;

  return (
    <DashboardLayout
      title="Meeting Time Daily"
      subtitle="Customer meetings, outdoor site visits, and team coordination tracking"
    >
      <div className="space-y-6">
        {/* ── Header Controls Card ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                      router.replace(`/meetings?date=${e.target.value}${empQuery}`);
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

            {isLocked && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  This daily report has been finalized and submitted. Editing is disabled.
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

        {/* ── Meeting Activity Table ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-green-700" />
              Meeting Time Daily Breakdown
            </CardTitle>
            <span className="text-xs text-slate-500">
              {formatReadableDate(reportDate)}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-4 min-w-[220px]">Activity Metric</th>
                  <th className="py-2.5 px-3 text-center w-28">Unit</th>
                  <th className="py-2.5 px-3 text-center w-28">Till Today</th>
                  <th className="py-2.5 px-3 text-center w-28 bg-green-50/50">10am – 1pm</th>
                  <th className="py-2.5 px-3 text-center w-28 bg-green-50/50">2pm – 5pm</th>
                  <th className="py-2.5 px-3 text-center w-28 bg-green-50/50">5pm – 6pm</th>
                  <th className="py-2.5 px-3 text-center w-28 bg-slate-50 font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MEETING_METRICS.map((metric) => {
                  const e = entries[metric.key];
                  const rowSum =
                    (e.slot_10_to_1 || 0) +
                    (e.slot_2_to_5 || 0) +
                    (e.slot_5_to_6 || 0);

                  return (
                    <tr
                      key={metric.key}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        {metric.label}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            metric.unit === "minutes"
                              ? "bg-green-50 text-green-800 border border-green-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {metric.unit === "minutes" ? "Minutes" : "Count"}
                        </span>
                      </td>

                      {/* Till Today */}
                      <td className="p-1.5 text-center">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.till_today ?? ""}
                          onChange={(ev) =>
                            handleCellChange(metric.key, "till_today", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 10 AM to 1 PM */}
                      <td className="p-1.5 text-center bg-green-50/20">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.slot_10_to_1 ?? ""}
                          onChange={(ev) =>
                            handleCellChange(metric.key, "slot_10_to_1", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 2 PM to 5 PM */}
                      <td className="p-1.5 text-center bg-green-50/20">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.slot_2_to_5 ?? ""}
                          onChange={(ev) =>
                            handleCellChange(metric.key, "slot_2_to_5", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 5 PM to 6 PM */}
                      <td className="p-1.5 text-center bg-green-50/20">
                        <input
                          type="number"
                          min="0"
                          disabled={isLocked || loading}
                          value={e.slot_5_to_6 ?? ""}
                          onChange={(ev) =>
                            handleCellChange(metric.key, "slot_5_to_6", ev.target.value)
                          }
                          placeholder="—"
                          className="w-full text-center py-1 border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* Row Total */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-900 bg-slate-50">
                        {rowSum > 0
                          ? metric.unit === "minutes"
                            ? `${rowSum} min`
                            : rowSum
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Key Metric Summary Cards ────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-1.5 text-slate-700 mb-1">
              <MapPin className="w-3.5 h-3.5 text-green-700" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Outdoor Visits
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {totals.outdoorVisits}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Duration: {formatMinutes(totals.outdoorMinutes)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-1.5 text-slate-700 mb-1">
              <UserCheck className="w-3.5 h-3.5 text-green-700" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Indoor Customers (CX)
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {totals.indoorCxCount}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Duration: {formatMinutes(totals.indoorMinutes)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-1.5 text-slate-700 mb-1">
              <Users className="w-3.5 h-3.5 text-green-700" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Internal Meetings
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {formatMinutes(totals.mgMinutes + totals.teamMeetingMinutes)}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              MG ({totals.mgMinutes}m) + Team ({totals.teamMeetingMinutes}m)
            </p>
          </Card>

          <Card className="p-4 bg-green-50/40 border-green-200">
            <div className="flex items-center gap-1.5 text-green-800 mb-1">
              <Clock className="w-3.5 h-3.5 text-green-700" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Total Meeting Time
              </span>
            </div>
            <div className="text-2xl font-extrabold text-green-900">
              {totals.formattedTotalTime}
            </div>
            <p className="text-xs text-green-800 font-medium mt-0.5">
              {totals.totalMeetingMinutes} total minutes today
            </p>
          </Card>
        </div>

        {/* ── Submit Modal ─────────────────────────────────────────────────── */}
        <Modal
          isOpen={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
          title="Submit Daily Meeting Activity Report"
          description={`Finalizing meeting report for ${formatReadableDate(reportDate)}`}
        >
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded text-xs text-green-900">
              Submitting will lock this report permanently. Make sure your outdoor visits and customer hours are exact.
            </div>

            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Outdoor Visits:</span>
                <span className="font-bold text-slate-900">{totals.outdoorVisits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Indoor Customers:</span>
                <span className="font-bold text-slate-900">{totals.indoorCxCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Meeting Time:</span>
                <span className="font-bold text-green-800">{totals.formattedTotalTime}</span>
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

export default function MeetingTimeDailyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Meeting Activity...
        </div>
      }
    >
      <MeetingTimeDailyContent />
    </Suspense>
  );
}
