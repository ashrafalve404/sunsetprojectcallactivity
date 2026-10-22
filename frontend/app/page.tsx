"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import {
  PhoneCall,
  PhoneForwarded,
  Clock,
  Users,
  MapPin,
  TrendingUp,
  Banknote,
  Target,
  ArrowRight,
  Filter,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatCard,
  Badge,
  Button,
  Skeleton,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { DashboardSummary, User, Report } from "@/types";
import {
  formatBDT,
  formatMinutes,
  getDhakaToday,
  formatReadableDate,
} from "@/lib/utils";

function DashboardContent() {
  const { isAdmin } = useAuth();

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "all">("all");

  useEffect(() => {
    const today = getDhakaToday();
    setStartDate(today);
    setEndDate(today);
  }, []);

  // State
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch admin employee list
  useEffect(() => {
    if (isAdmin) {
      api.employees
        .list({ is_active: true })
        .then((data) => setEmployees(data))
        .catch(() => {});
    }
  }, [isAdmin]);

  const loadDashboardData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const empIdParam =
        selectedEmployeeId !== "all" ? Number(selectedEmployeeId) : undefined;

      const [summaryData, reportsData] = await Promise.all([
        api.dashboard.getSummary({
          start_date: startDate,
          end_date: endDate,
          employee_id: empIdParam,
        }),
        api.reports.list({
          start_date: startDate,
          end_date: endDate,
          employee_id: empIdParam,
          limit: 10,
        }),
      ]);

      setSummary(summaryData);
      setRecentReports(Array.isArray(reportsData) ? reportsData : []);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard data. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedEmployeeId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleResetFilters = () => {
    const today = getDhakaToday();
    setStartDate(today);
    setEndDate(today);
    setSelectedEmployeeId("all");
  };

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Overview of daily call activities, customer meetings, and collections"
    >
      <div className="space-y-6">
        {/* ── Filters Section ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                <Filter className="w-4 h-4 text-green-700" />
                <span>Reporting Filter</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Date range pickers */}
                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor="start_date" className="text-xs text-slate-700 font-semibold">
                    From:
                  </label>
                  <input
                    id="start_date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor="end_date" className="text-xs text-slate-700 font-semibold">
                    To:
                  </label>
                  <input
                    id="end_date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                </div>

                {/* Employee Selector (Admin only) */}
                {isAdmin && (
                  <div className="flex items-center gap-2 text-sm">
                    <label htmlFor="employee_select" className="text-xs text-slate-700 font-semibold">
                      Employee:
                    </label>
                    <select
                      id="employee_select"
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

                {/* Clear action */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Error Banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="p-4 rounded-md bg-rose-50 border border-rose-200 flex items-start gap-3 text-sm text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to load dashboard data</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── KPI Summary Cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-7 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </Card>
            ))
          ) : (
            <>
              <StatCard
                title="Calls Dialed"
                value={summary?.total_calls_dialed ?? 0}
                subtitle={`${summary?.total_reports ?? 0} reports in period`}
                icon={<PhoneCall className="w-4 h-4" />}
              />
              <StatCard
                title="Connected Calls"
                value={summary?.total_calls_connected ?? 0}
                subtitle={
                  summary?.connection_rate_pct !== null && summary?.connection_rate_pct !== undefined
                    ? `${summary.connection_rate_pct}% connection rate`
                    : "No dialed calls"
                }
                icon={<PhoneForwarded className="w-4 h-4" />}
                badge={
                  summary?.connection_rate_pct !== null &&
                  summary?.connection_rate_pct !== undefined && (
                    <Badge variant={summary.connection_rate_pct >= 40 ? "success" : "warning"}>
                      {summary.connection_rate_pct}%
                    </Badge>
                  )
                }
              />
              <StatCard
                title="Call Duration"
                value={formatMinutes(summary?.total_call_duration_minutes)}
                subtitle="Total phone engagement"
                icon={<Clock className="w-4 h-4" />}
              />
              <StatCard
                title="Meeting Time"
                value={formatMinutes(summary?.total_meeting_time_minutes)}
                subtitle={`${summary?.total_indoor_cx ?? 0} indoor customers`}
                icon={<Users className="w-4 h-4" />}
              />
              <StatCard
                title="Outdoor Visits"
                value={summary?.total_outdoor_visits ?? 0}
                subtitle="Client on-site visits"
                icon={<MapPin className="w-4 h-4" />}
              />
              <StatCard
                title="Actual Collection"
                value={formatBDT(summary?.actual_collection_bdt)}
                subtitle="Cash & bank collected"
                icon={<Banknote className="w-4 h-4 text-emerald-600" />}
                badge={<Badge variant="success">Actual</Badge>}
              />
              <StatCard
                title="Payment Commitments"
                value={formatBDT(summary?.commitments_bdt)}
                subtitle="Expected future cashflows"
                icon={<TrendingUp className="w-4 h-4 text-green-700" />}
                badge={<Badge variant="warning">Commitment</Badge>}
              />
              <StatCard
                title="Reports Submitted"
                value={`${summary?.submitted_reports ?? 0} / ${summary?.total_reports ?? 0}`}
                subtitle={
                  summary?.total_reports
                    ? `${Math.round(((summary.submitted_reports ?? 0) / summary.total_reports) * 100)}% finalized`
                    : "0% finalized"
                }
                icon={<Target className="w-4 h-4" />}
              />
            </>
          )}
        </div>

        {/* ── Financial Split & Activity Section ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales vs Collection Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
              <Badge variant="neutral">Period Totals</Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">New Sales Collection</p>
                      <p className="text-[11px] text-slate-500">Immediate down-payment receipts</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatBDT(summary?.actual_collection_bdt)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">TB (Token to Booking) Collection</p>
                      <p className="text-[11px] text-slate-500">Booking confirmation payments</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatBDT(summary?.tb_collection_bdt)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">EMI Collection</p>
                      <p className="text-[11px] text-slate-500">Recurring customer installments</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatBDT(summary?.emi_collection_bdt)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between bg-slate-50 px-2 rounded">
                    <div>
                      <p className="text-xs font-bold text-slate-900">Total Money Collected</p>
                      <p className="text-[10px] text-slate-500">Sum of all actual receipts</p>
                    </div>
                    <span className="text-base font-extrabold text-emerald-700">
                      {formatBDT(
                        (summary?.actual_collection_bdt ?? 0) +
                          (summary?.tb_collection_bdt ?? 0) +
                          (summary?.emi_collection_bdt ?? 0)
                      )}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Payment Commitments</p>
                      <p className="text-[11px] text-slate-500">Promise to pay within next days</p>
                    </div>
                    <span className="text-sm font-bold text-green-800">
                      {formatBDT(summary?.commitments_bdt)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">TB Commitments</p>
                      <p className="text-[11px] text-slate-500">Token-to-Booking upcoming commitments</p>
                    </div>
                    <span className="text-sm font-bold text-green-800">
                      {formatBDT(summary?.tb_commitments_bdt)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Call Activity by Time Slot */}
          <Card>
            <CardHeader>
              <CardTitle>Call Activity by Time Slot</CardTitle>
              <Badge variant="neutral">Operating Hours</Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: "10_to_1", label: "10:00 AM – 01:00 PM", count: summary?.by_slot?.["10_to_1"]?.dialed ?? 0 },
                    { key: "2_to_5", label: "02:00 PM – 05:00 PM", count: summary?.by_slot?.["2_to_5"]?.dialed ?? 0 },
                    { key: "5_to_6", label: "05:00 PM – 06:00 PM", count: summary?.by_slot?.["5_to_6"]?.dialed ?? 0 },
                  ].map((slot) => {
                    const total = summary?.total_calls_dialed || 1;
                    const pct = Math.round((slot.count / total) * 100);
                    return (
                      <div key={slot.key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{slot.label}</span>
                          <span className="font-bold text-slate-900">
                            {slot.count} calls ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-700 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Active Calling Hours: 7 Hours</span>
                    <Link
                      href="/calls"
                      className="text-green-700 hover:text-green-800 font-semibold inline-flex items-center gap-1"
                    >
                      Enter Call Activity <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Recent Daily Reports Table ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Daily Reports</CardTitle>
            <Link
              href="/reports"
              className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center gap-1"
            >
              View All Reports <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-4 font-semibold">Report Date</th>
                  {isAdmin && <th className="py-2.5 px-4 font-semibold">Employee</th>}
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
                      {isAdmin && <td className="py-3 px-4"><Skeleton className="h-4 w-28" /></td>}
                      <td className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="py-3 px-4 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : !Array.isArray(recentReports) || recentReports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 4 : 3}
                      className="py-8 text-center text-slate-400"
                    >
                      No daily reports found for this selected period.
                    </td>
                  </tr>
                ) : (
                  recentReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {formatReadableDate(report.report_date)}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-slate-600">
                          {report.employee_name || `Employee #${report.employee_id}`}
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <Badge variant={report.is_submitted ? "success" : "warning"}>
                          {report.is_submitted ? "Submitted" : "Draft"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/calls?date=${report.report_date}&employee_id=${report.employee_id}`}
                          className="text-green-700 hover:text-green-800 font-semibold"
                        >
                          Open & Edit →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
