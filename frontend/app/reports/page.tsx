"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Download,
  Filter,
  RotateCcw,
  ArrowRight,
  AlertCircle,
  Trash2,
  Printer,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Skeleton,
  Modal,
  Alert,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { Report, User } from "@/types";
import {
  getDhakaToday,
  formatReadableDate,
  formatBDT,
  formatMinutes,
} from "@/lib/utils";

interface DetailedReportRow extends Report {
  summary?: {
    total_calls_dialed?: number;
    total_calls_connected?: number;
    total_call_duration_minutes?: number;
    total_meeting_time_minutes?: number;
    total_outdoor_visits?: number;
    actual_collection_bdt?: number;
    commitments_bdt?: number;
  };
}

function ReportsContent() {
  const { isAdmin } = useAuth();

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "draft">("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "all">("all");

  useEffect(() => {
    const today = getDhakaToday();
    setStartDate(today);
    setEndDate(today);
  }, []);

  // State
  const [reports, setReports] = useState<DetailedReportRow[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch employees for admin filter
  useEffect(() => {
    if (isAdmin) {
      api.employees
        .list()
        .then((data) => setEmployees(data))
        .catch(() => {});
    }
  }, [isAdmin]);

  const loadReports = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const isSub =
        statusFilter === "all" ? undefined : statusFilter === "submitted";
      const empId =
        selectedEmployeeId !== "all" ? Number(selectedEmployeeId) : undefined;

      const rawReports = await api.reports.list({
        start_date: startDate,
        end_date: endDate,
        is_submitted: isSub,
        employee_id: empId,
        limit: 100,
      });

      // Enhance with summary for each report
      const safeRaw = Array.isArray(rawReports) ? rawReports : [];
      const detailed = await Promise.all(
        safeRaw.map(async (r) => {
          try {
            const sum = await api.reports.getSummary(r.id);
            return { ...r, summary: sum as DetailedReportRow["summary"] };
          } catch {
            return r;
          }
        })
      );

      setReports(detailed);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to fetch reports. Please verify your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, selectedEmployeeId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Aggregated totals across all filtered reports
  const aggregates = useMemo(() => {
    let totalDialed = 0;
    let totalConnected = 0;
    let totalCallDuration = 0;
    let totalMeetingTime = 0;
    let totalOutdoor = 0;
    let totalCollection = 0;
    let totalCommitment = 0;

    for (const r of reports) {
      if (r.summary) {
        totalDialed += r.summary.total_calls_dialed || 0;
        totalConnected += r.summary.total_calls_connected || 0;
        totalCallDuration += r.summary.total_call_duration_minutes || 0;
        totalMeetingTime += r.summary.total_meeting_time_minutes || 0;
        totalOutdoor += r.summary.total_outdoor_visits || 0;
        totalCollection += r.summary.actual_collection_bdt || 0;
        totalCommitment += r.summary.commitments_bdt || 0;
      }
    }

    const connectionRate =
      totalDialed > 0 ? Math.round((totalConnected / totalDialed) * 100) : 0;

    return {
      totalDialed,
      totalConnected,
      connectionRate,
      totalCallDuration,
      totalMeetingTime,
      totalOutdoor,
      totalCollection,
      totalCommitment,
    };
  }, [reports]);

  // Export to CSV
  const handleExportCSV = () => {
    if (reports.length === 0) return;

    const headers = [
      "Report Date",
      "Employee ID",
      "Status",
      "Total Dialed",
      "Total Connected",
      "Call Duration (min)",
      "Meeting Time (min)",
      "Outdoor Visits",
      "Actual Collection (BDT)",
      "Commitments (BDT)",
      "Submitted At",
    ];

    const rows = reports.map((r) => [
      r.report_date,
      r.employee_id,
      r.is_submitted ? "Submitted" : "Draft",
      r.summary?.total_calls_dialed ?? 0,
      r.summary?.total_calls_connected ?? 0,
      r.summary?.total_call_duration_minutes ?? 0,
      r.summary?.total_meeting_time_minutes ?? 0,
      r.summary?.total_outdoor_visits ?? 0,
      r.summary?.actual_collection_bdt ?? 0,
      r.summary?.commitments_bdt ?? 0,
      r.submitted_at || "N/A",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `sunset_reports_${startDate}_to_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetFilters = () => {
    const today = getDhakaToday();
    setStartDate(today);
    setEndDate(today);
    setStatusFilter("all");
    setSelectedEmployeeId("all");
  };

  const handleDeleteReport = async (reportId: number) => {
    setDeleting(true);
    setError(null);
    try {
      await api.reports.delete(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setDeleteReportId(null);
      setSuccessMessage("Daily activity report deleted successfully.");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to delete report.");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout
      title="Reports & Analytics"
      subtitle="Historical daily call activity reports, financial metrics, and export"
    >
      <div className="space-y-6">
        {/* ── Filters Card ─────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                <Filter className="w-4 h-4 text-green-700" />
                <span>Filter Reports</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Date range */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-slate-700 font-semibold">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-slate-700 font-semibold">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-slate-700 font-semibold">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as "all" | "submitted" | "draft")
                    }
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="submitted">Submitted Only</option>
                    <option value="draft">Drafts Only</option>
                  </select>
                </div>

                {/* Employee Filter (Admin only) */}
                {isAdmin && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-slate-700 font-semibold">Employee:</span>
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) =>
                        setSelectedEmployeeId(
                          e.target.value === "all" ? "all" : Number(e.target.value)
                        )
                      }
                      className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                    >
                      <option value="all">All Employees</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name} (@{emp.username})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Reset
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={reports.length === 0 || loading}
                  className="text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Alerts ──────────────────────────────────────────────────────── */}
        {successMessage && (
          <Alert type="success" onDismiss={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        {error && (
          <div className="p-4 rounded-md bg-rose-50 border border-rose-200 flex items-start gap-3 text-sm text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Aggregated Summary for Filtered Range ────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Filtered Reports
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {reports.length}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {startDate === endDate ? startDate : `${startDate} to ${endDate}`}
            </p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Calls Dialed
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {aggregates.totalDialed}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Connected: {aggregates.totalConnected} ({aggregates.connectionRate}%)
            </p>
          </Card>

          <Card className="p-4 bg-emerald-50/40 border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
              Actual Collection Total
            </span>
            <div className="text-2xl font-extrabold text-emerald-800 mt-1">
              {formatBDT(aggregates.totalCollection)}
            </div>
            <p className="text-xs text-emerald-700 mt-0.5">Sum of received cash</p>
          </Card>

          <Card className="p-4 bg-amber-50/40 border-amber-200">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
              Total Commitments
            </span>
            <div className="text-2xl font-extrabold text-amber-800 mt-1">
              {formatBDT(aggregates.totalCommitment)}
            </div>
            <p className="text-xs text-amber-700 mt-0.5">Expected future payments</p>
          </Card>
        </div>

        {/* ── Reports List Table ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-green-700" />
              Daily Reports Log
            </CardTitle>
            <span className="text-xs text-slate-500">
              Showing {reports.length} matching daily reports
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-4">Date</th>
                  {isAdmin && <th className="py-2.5 px-3">Employee</th>}
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Dialed</th>
                  <th className="py-2.5 px-3 text-right">Connected</th>
                  <th className="py-2.5 px-3 text-right">Call Time</th>
                  <th className="py-2.5 px-3 text-right">Meeting Time</th>
                  <th className="py-2.5 px-3 text-right">Outdoor</th>
                  <th className="py-2.5 px-3 text-right font-bold text-emerald-800">
                    Collection (BDT)
                  </th>
                  <th className="py-2.5 px-3 text-right font-bold text-amber-800">
                    Commitment (BDT)
                  </th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
                      {isAdmin && <td className="py-3 px-3"><Skeleton className="h-4 w-24" /></td>}
                      <td className="py-3 px-3 text-center"><Skeleton className="h-4 w-16 mx-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-8 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    </tr>
                  ))
                ) : reports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 11 : 10}
                      className="py-12 text-center text-slate-400"
                    >
                      No reports match the selected filters.
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {formatReadableDate(report.report_date)}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-3 text-slate-600">
                          {report.employee_name || `Employee #${report.employee_id}`}
                        </td>
                      )}
                      <td className="py-3 px-3 text-center">
                        <Badge variant={report.is_submitted ? "success" : "warning"}>
                          {report.is_submitted ? "Submitted" : "Draft"}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-slate-900">
                        {report.summary?.total_calls_dialed ?? 0}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-emerald-700">
                        {report.summary?.total_calls_connected ?? 0}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {formatMinutes(report.summary?.total_call_duration_minutes)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {formatMinutes(report.summary?.total_meeting_time_minutes)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {report.summary?.total_outdoor_visits ?? 0}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">
                        {formatBDT(report.summary?.actual_collection_bdt)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-amber-700">
                        {formatBDT(report.summary?.commitments_bdt)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/calls?date=${report.report_date}`}
                            className="text-green-700 hover:text-green-800 font-semibold inline-flex items-center gap-1 text-xs"
                            title="View Dial Matrix"
                          >
                            View <ArrowRight className="w-3 h-3" />
                          </Link>
                          <Link
                            href={`/reports/${report.id}/print`}
                            target="_blank"
                            className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors inline-flex items-center"
                            title="Print / Save PDF Report"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Link>
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteReportId(report.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Admin: Delete Report"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Admin: Delete Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={deleteReportId !== null}
          onClose={() => setDeleteReportId(null)}
          title="Admin: Delete Daily Report"
          description="Are you sure you want to permanently delete this daily activity report?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This will permanently purge this daily report, including its hourly dial activity,
              meeting records, and linked logs. This action is restricted to administrators and cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteReportId(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={() => deleteReportId && handleDeleteReport(deleteReportId)}
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

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Reports...
        </div>
      }
    >
      <ReportsContent />
    </Suspense>
  );
}
