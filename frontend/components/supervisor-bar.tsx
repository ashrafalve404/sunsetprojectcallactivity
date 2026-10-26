"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldCheck, Users, Unlock } from "lucide-react";
import { Card, CardContent, Button } from "@/components/ui";
import { User, Report } from "@/types";
import { api, ApiError } from "@/lib/api";
import { formatEmployeeId } from "@/lib/utils";

interface SupervisorBarProps {
  isAdmin: boolean;
  isSubAdmin: boolean;
  selectedEmployeeId?: number;
  onSelectEmployee: (empId: number) => void;
  reportDate: string;
  report: Report | null;
  onReportUnlocked?: (updated: Report) => void;
  currentPage: "calls" | "meetings" | "sales";
}

export function SupervisorBar({
  isAdmin,
  isSubAdmin,
  selectedEmployeeId,
  onSelectEmployee,
  reportDate,
  report,
  onReportUnlocked,
  currentPage,
}: SupervisorBarProps) {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.employees
      .list({ is_active: true })
      .then((data) => {
        if (!mounted) return;
        const staff = data.filter((e) => e.role === "employee");
        const listToUse = staff.length > 0 ? staff : data;
        setEmployees(listToUse);

        // If no employee is currently selected, pick the first staff member automatically
        if (!selectedEmployeeId && listToUse.length > 0) {
          onSelectEmployee(listToUse[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load staff list for supervisor bar", err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedEmployeeId, onSelectEmployee]);

  const handleReopen = async () => {
    if (!report) return;
    try {
      setReopening(true);
      setReopenError(null);
      const updated = await api.reports.reopen(report.id);
      if (onReportUnlocked) {
        onReportUnlocked(updated);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setReopenError(err.message);
      } else {
        setReopenError("Failed to unlock report.");
      }
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="space-y-2 mb-6">
      <Card className="border-emerald-500/30 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Supervisor Identity & Description */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Supervisor Review Mode
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-semibold">
                    {isAdmin ? "Admin Access" : "Sub-Admin Access"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Reviewing daily activities. Data is recorded under the selected employee account.
                </p>
              </div>
            </div>

            {/* Right: Controls & Cross-Navigation */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Employee Selector Dropdown (High-Contrast Clean White Pill) */}
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 shadow-sm border border-slate-200">
                <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0">Staff:</span>
                <select
                  value={selectedEmployeeId ?? ""}
                  onChange={(e) => onSelectEmployee(Number(e.target.value))}
                  disabled={loading || employees.length === 0}
                  className="bg-white text-xs font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id} className="bg-white text-slate-900 font-semibold py-1">
                      {emp.full_name} ({formatEmployeeId(emp.id)}){emp.phone ? ` • ${emp.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cross-Page Navigation for Selected Staff */}
              {selectedEmployeeId && (
                <div className="flex items-center gap-1 bg-slate-800/60 p-1 rounded-lg border border-slate-700">
                  <span className="text-[10px] text-slate-400 px-1 font-semibold uppercase">Jump:</span>
                  {currentPage !== "calls" && (
                    <Link
                      href={`/calls?date=${reportDate}&employee_id=${selectedEmployeeId}`}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      Calls
                    </Link>
                  )}
                  {currentPage !== "meetings" && (
                    <Link
                      href={`/meetings?date=${reportDate}&employee_id=${selectedEmployeeId}`}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      Meetings
                    </Link>
                  )}
                  {currentPage !== "sales" && (
                    <Link
                      href={`/sales?date=${reportDate}&employee_id=${selectedEmployeeId}`}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      Sales & Collection
                    </Link>
                  )}
                  <Link
                    href={`/reports?employee_id=${selectedEmployeeId}&start_date=${reportDate}&end_date=${reportDate}`}
                    className="px-2 py-1 rounded text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-slate-700 transition-colors"
                  >
                    Reports
                  </Link>
                </div>
              )}

              {/* Unlock / Reopen Button for Submitted Report */}
              {report?.status === "submitted" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReopen}
                  loading={reopening}
                  className="bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20 text-xs font-semibold shadow-xs"
                  title="Unlock this submitted report so the employee can edit and re-submit"
                >
                  <Unlock className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  Reopen / Unlock
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {reopenError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
          {reopenError}
        </div>
      )}
    </div>
  );
}
