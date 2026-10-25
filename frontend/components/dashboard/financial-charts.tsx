"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Target,
  Banknote,
  Calendar,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { FinancialTrendResponse, DailyTrendPoint } from "@/types";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

interface FinancialChartsProps {
  startDate: string;
  endDate: string;
  employeeId?: number | "all";
}

export function FinancialCharts({ startDate, endDate, employeeId }: FinancialChartsProps) {
  const [data, setData] = useState<FinancialTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!startDate || !endDate) return;

    setLoading(true);
    setError(null);

    const empParam = employeeId && employeeId !== "all" ? Number(employeeId) : undefined;
    api.dashboard
      .getFinancialTrend({
        start_date: startDate,
        end_date: endDate,
        employee_id: empParam,
      })
      .then((res) => {
        if (active) {
          setData(res);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Failed to load financial trend data:", err);
          setError("Failed to load trend analytics.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [startDate, endDate, employeeId]);

  // Chart calculation metrics
  const trendPoints = useMemo(() => data?.trend || [], [data]);

  const maxDailyValue = useMemo(() => {
    if (!trendPoints.length) return 100000;
    let max = 0;
    for (const pt of trendPoints) {
      if (pt.actual_collection_bdt > max) max = pt.actual_collection_bdt;
      if (pt.commitments_bdt > max) max = pt.commitments_bdt;
    }
    return max > 0 ? max : 100000;
  }, [trendPoints]);

  const maxCumulativeValue = useMemo(() => {
    if (!trendPoints.length) return 100000;
    const last = trendPoints[trendPoints.length - 1];
    const max = Math.max(last?.cumulative_collection_bdt || 0, last?.cumulative_commitments_bdt || 0);
    return max > 0 ? max : 100000;
  }, [trendPoints]);

  // Gauge calculations
  const gaugePercent = useMemo(() => {
    if (!data || !data.monthly_target_bdt) return 0;
    return Math.min(100, Math.max(0, data.monthly_pace_pct));
  }, [data]);

  const expectedGaugePercent = useMemo(() => {
    if (!data) return 0;
    return Math.min(100, Math.max(0, data.expected_pace_pct));
  }, [data]);

  const arcRadius = 68;
  const arcCircumference = Math.PI * arcRadius;
  const filledDashoffset = arcCircumference * (1 - gaugePercent / 100);

  const getPaceBadge = (status?: string, pacePct?: number) => {
    if (status === "ahead_of_pace") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /> Ahead ({pacePct}%)
        </span>
      );
    }
    if (status === "on_pace") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
          <TrendingUp className="w-3 h-3 text-teal-600 shrink-0" /> On Target ({pacePct}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
        <Flame className="w-3 h-3 text-rose-500 shrink-0" /> Behind ({pacePct}%)
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
      {/* ── 1. Monthly Target Pace Tile (4 cols) ───────────────────────── */}
      <Card className="lg:col-span-4 border border-slate-300 shadow-2xs flex flex-col justify-between bg-white rounded-xl overflow-hidden">
        <div>
          {/* Solid Header with less text */}
          <div className="bg-slate-900 text-white px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-white">
              <Target className="w-4 h-4 text-emerald-400 shrink-0" />
              Monthly Target Pace
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
              {data ? `${data.monthly_pace_pct}% Goal` : "Pace"}
            </span>
          </div>

          <CardContent className="p-3 sm:p-4 space-y-3.5">
            {loading ? (
              <div className="py-6 space-y-3">
                <Skeleton className="h-24 w-24 rounded-full mx-auto" />
                <Skeleton className="h-4 w-36 mx-auto" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : error ? (
              <div className="py-6 text-center text-xs text-rose-500 font-medium">{error}</div>
            ) : !data ? null : (
              <>
                {/* Big Number KPI Callout */}
                <div className="text-center pt-0.5">
                  <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {formatBDT(data.month_to_date_collected_bdt)}
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                    MTD Collections &bull; Target:{" "}
                    <span className="font-bold text-slate-700">
                      {formatBDT(data.monthly_target_bdt)}
                    </span>
                  </div>
                </div>

                {/* Speedometer Gauge */}
                <div className="relative flex flex-col items-center justify-center -my-1">
                  <svg viewBox="0 0 180 95" className="w-40 sm:w-44 overflow-visible">
                    {/* Background Arc */}
                    <path
                      d="M 22 88 A 68 68 0 0 1 158 88"
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="15"
                      strokeLinecap="round"
                    />

                    {/* Progress Arc */}
                    <path
                      d="M 22 88 A 68 68 0 0 1 158 88"
                      fill="none"
                      stroke={
                        data.pace_status === "ahead_of_pace"
                          ? "#059669"
                          : data.pace_status === "on_pace"
                          ? "#0d9488"
                          : "#e11d48"
                      }
                      strokeWidth="15"
                      strokeLinecap="round"
                      strokeDasharray={arcCircumference}
                      strokeDashoffset={filledDashoffset}
                      className="transition-all duration-700 ease-out"
                    />

                    {/* Target Needle */}
                    {expectedGaugePercent > 0 && expectedGaugePercent < 100 && (
                      <line
                        x1="90"
                        y1="88"
                        x2={90 - 74 * Math.cos((expectedGaugePercent * Math.PI) / 100)}
                        y2={88 - 74 * Math.sin((expectedGaugePercent * Math.PI) / 100)}
                        stroke="#0f172a"
                        strokeWidth="2.5"
                        strokeDasharray="2 2"
                      />
                    )}
                  </svg>

                  {/* Centered % in Gauge */}
                  <div className="absolute top-10 flex flex-col items-center text-center">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {data.monthly_pace_pct}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                      Achieved
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-center">
                    {getPaceBadge(data.pace_status, data.monthly_pace_pct)}
                  </div>
                </div>

                {/* Month Progress Indicator */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-2.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-700 flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      Day {data.days_elapsed} of {data.days_in_month}
                    </span>
                    <span className="text-slate-600 font-bold text-[11px]">
                      {data.days_remaining} days left
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-800 rounded-full"
                      style={{ width: `${Math.min(100, data.expected_pace_pct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                    <span>Month Elapsed: {data.expected_pace_pct}%</span>
                    <span>Expected: {data.expected_pace_pct}%</span>
                  </div>
                </div>

                {/* Solid Power BI Metric Tiles */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Current Run Rate */}
                  <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
                      Current Rate
                    </span>
                    <div className="font-extrabold text-slate-900 truncate text-xs sm:text-[13px]">
                      {formatBDT(data.daily_current_run_rate_bdt)}
                      <span className="text-[10px] text-slate-500 font-normal"> /day</span>
                    </div>
                  </div>

                  {/* Required Run Rate */}
                  <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
                      Required Rate
                    </span>
                    <div className="font-extrabold text-slate-900 truncate text-xs sm:text-[13px]">
                      {formatBDT(data.daily_run_rate_needed_bdt)}
                      <span className="text-[10px] text-slate-500 font-normal"> /day</span>
                    </div>
                  </div>
                </div>

                {/* Projected Finish Tile */}
                <div className="p-2 sm:p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs flex items-center justify-between">
                  <span className="font-semibold text-slate-700 flex items-center gap-1 text-[11px]">
                    <ArrowUpRight className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    Forecast:
                  </span>
                  <span className="font-extrabold text-slate-900 text-xs truncate">
                    {formatBDT(data.projected_month_end_bdt)}{" "}
                    <span className="text-[10px] text-slate-600 font-medium">
                      ({data.projected_achievement_pct}%)
                    </span>
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </div>
      </Card>

      {/* ── 2. Collections vs. Commitments Chart (8 cols) ───────────────── */}
      <Card className="lg:col-span-8 border border-slate-300 shadow-2xs flex flex-col justify-between bg-white rounded-xl overflow-hidden">
        <div>
          {/* Solid Header with less text */}
          <div className="bg-slate-900 text-white px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-white">
              <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
              Collections vs. Commitments
            </h3>

            {/* Compact Legend */}
            <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] flex-wrap select-none">
              <span className="inline-flex items-center gap-1 text-slate-200 font-medium">
                <span className="w-2.5 h-2.5 bg-emerald-600 rounded-none shrink-0" />
                Cash
              </span>
              <span className="inline-flex items-center gap-1 text-slate-200 font-medium">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-none shrink-0" />
                Commitment
              </span>
              <span className="inline-flex items-center gap-1 text-slate-200 font-medium">
                <span className="w-3 h-0.5 bg-blue-600 shrink-0" />
                Cumulative
              </span>
            </div>
          </div>

          <CardContent className="p-3 sm:p-4">
            {loading ? (
              <div className="py-10 space-y-3">
                <Skeleton className="h-40 w-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ) : error ? (
              <div className="py-10 text-center text-xs text-rose-500 font-medium">{error}</div>
            ) : trendPoints.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No financial activity data recorded for this date range.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Responsive SVG Chart with smooth horizontal touch-scroll on mobile */}
                <div className="relative w-full overflow-x-auto pb-1 scrollbar-thin">
                  <div className="min-w-[440px] sm:min-w-[500px]">
                    <svg viewBox="0 0 600 195" className="w-full h-48 sm:h-52 overflow-visible bg-white">
                      {/* Gridlines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = 165 - ratio * 135;
                        const labelVal = maxDailyValue * ratio;
                        return (
                          <g key={ratio}>
                            <line
                              x1="45"
                              y1={y}
                              x2="590"
                              y2={y}
                              stroke="#e2e8f0"
                              strokeWidth="1"
                            />
                            <text
                              x="40"
                              y={y + 3.5}
                              textAnchor="end"
                              className="text-[9px] fill-slate-500 font-mono select-none font-semibold"
                            >
                              {formatBDT(labelVal)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Cumulative Line */}
                      {trendPoints.length > 1 && (
                        <path
                          d={(() => {
                            const points = trendPoints.map((pt, idx) => {
                              const x = 55 + (idx / (trendPoints.length - 1)) * 525;
                              const y = 165 - (pt.cumulative_collection_bdt / maxCumulativeValue) * 135;
                              return `${x},${y}`;
                            });
                            return `M ${points.join(" L ")}`;
                          })()}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="square"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* Columns */}
                      {trendPoints.map((pt, idx) => {
                        const count = trendPoints.length;
                        const availableWidth = 525 / count;
                        const barWidth = Math.min(12, Math.max(3.5, availableWidth * 0.36));
                        const centerX = 55 + (count === 1 ? 262 : (idx / (count - 1)) * 525);

                        const actualH = (pt.actual_collection_bdt / maxDailyValue) * 135;
                        const commitH = (pt.commitments_bdt / maxDailyValue) * 135;

                        const isHovered = hoveredIndex === idx;

                        return (
                          <g
                            key={pt.date}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredIndex(idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            onClick={() => setHoveredIndex(isHovered ? null : idx)}
                          >
                            {/* Tap/Hover guide column */}
                            {isHovered && (
                              <rect
                                x={centerX - availableWidth / 2}
                                y={20}
                                width={availableWidth}
                                height={145}
                                fill="#f1f5f9"
                                opacity="0.6"
                              />
                            )}

                            {/* Actual Column (Emerald) */}
                            <rect
                              x={centerX - barWidth - 1}
                              y={165 - actualH}
                              width={barWidth}
                              height={Math.max(1, actualH)}
                              fill={isHovered ? "#047857" : "#059669"}
                              className="transition-colors duration-150"
                            />

                            {/* Commitment Column (Amber) */}
                            <rect
                              x={centerX + 1}
                              y={165 - commitH}
                              width={barWidth}
                              height={Math.max(1, commitH)}
                              fill={isHovered ? "#b45309" : "#f59e0b"}
                              className="transition-colors duration-150"
                            />

                            {/* Data point dot on Line */}
                            {trendPoints.length > 1 && (
                              <circle
                                cx={centerX}
                                cy={165 - (pt.cumulative_collection_bdt / maxCumulativeValue) * 135}
                                r={isHovered ? 4.5 : 2.5}
                                fill="#2563eb"
                                stroke="#ffffff"
                                strokeWidth="1.5"
                              />
                            )}

                            {/* X-Axis Tick Label */}
                            {(count <= 14 || idx % Math.ceil(count / 10) === 0 || idx === count - 1) && (
                              <text
                                x={centerX}
                                y="184"
                                textAnchor="middle"
                                className={`text-[9px] font-mono select-none ${
                                  isHovered ? "fill-slate-900 font-bold" : "fill-slate-500 font-medium"
                                }`}
                              >
                                {pt.label}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Interactive Tooltip Card on Tap/Hover */}
                {hoveredIndex !== null && trendPoints[hoveredIndex] ? (
                  <div className="p-2.5 bg-slate-900 text-white rounded-lg shadow-md border border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded text-[11px] border border-slate-700">
                        {trendPoints[hoveredIndex].label}
                      </span>
                      <span className="text-slate-400 text-[10px] font-mono">
                        {trendPoints[hoveredIndex].date}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-emerald-500 shrink-0" />
                        <span className="text-slate-300">Cash:</span>
                        <span className="font-bold text-emerald-400">
                          {formatBDT(trendPoints[hoveredIndex].actual_collection_bdt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-amber-400 shrink-0" />
                        <span className="text-slate-300">Commit:</span>
                        <span className="font-bold text-amber-300">
                          {formatBDT(trendPoints[hoveredIndex].commitments_bdt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-500 shrink-0" />
                        <span className="text-slate-300">Cum.:</span>
                        <span className="font-bold text-blue-300">
                          {formatBDT(trendPoints[hoveredIndex].cumulative_collection_bdt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 text-center font-medium">
                    Tap any date column to view exact receipts, commitments & cumulative progress
                  </p>
                )}

                {/* Mobile-Optimized 3-Column Strip */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 pt-1 border-t border-slate-200">
                  <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-wider block truncate">
                      Cash Collected
                    </span>
                    <span className="text-xs sm:text-base font-black text-emerald-700 block truncate">
                      {formatBDT(data?.total_actual_collection_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-wider block truncate">
                      Promises Recorded
                    </span>
                    <span className="text-xs sm:text-base font-black text-amber-600 block truncate">
                      {formatBDT(data?.total_commitments_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-wider block truncate">
                      Conversion
                    </span>
                    <span className="text-xs sm:text-base font-black text-blue-700 block truncate">
                      {(data?.total_commitments_bdt ?? 0) > 0
                        ? `${Math.round(
                            ((data?.total_actual_collection_bdt ?? 0) / (data?.total_commitments_bdt ?? 1)) * 100
                          )}%`
                        : "100% Cash"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
