"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Target,
  Banknote,
  Calendar,
  Zap,
  Clock,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Flame,
  HelpCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Skeleton } from "@/components/ui";
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
    if (!trendPoints.length) return 1;
    let max = 0;
    for (const pt of trendPoints) {
      if (pt.actual_collection_bdt > max) max = pt.actual_collection_bdt;
      if (pt.commitments_bdt > max) max = pt.commitments_bdt;
    }
    return max > 0 ? max : 100000;
  }, [trendPoints]);

  const maxCumulativeValue = useMemo(() => {
    if (!trendPoints.length) return 1;
    const last = trendPoints[trendPoints.length - 1];
    const max = Math.max(last?.cumulative_collection_bdt || 0, last?.cumulative_commitments_bdt || 0);
    return max > 0 ? max : 100000;
  }, [trendPoints]);

  // SVG Gauge calculations
  const gaugePercent = useMemo(() => {
    if (!data || !data.monthly_target_bdt) return 0;
    return Math.min(100, Math.max(0, data.monthly_pace_pct));
  }, [data]);

  const expectedGaugePercent = useMemo(() => {
    if (!data) return 0;
    return Math.min(100, Math.max(0, data.expected_pace_pct));
  }, [data]);

  // Radius = 70, semi-circle length = PI * 70 = 219.9
  const arcRadius = 70;
  const arcCircumference = Math.PI * arcRadius;
  const filledDashoffset = arcCircumference * (1 - gaugePercent / 100);

  const getPaceBadge = (status?: string, pacePct?: number) => {
    if (status === "ahead_of_pace") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Ahead of Pace ({pacePct}%)
        </span>
      );
    }
    if (status === "on_pace") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
          <TrendingUp className="w-3.5 h-3.5 text-teal-600" /> On Track ({pacePct}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
        <Flame className="w-3.5 h-3.5 text-rose-500" /> Behind Pace ({pacePct}%)
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* ── 1. Monthly Target Pace & Forecast Gauge Card (4 cols) ────── */}
      <Card className="lg:col-span-4 border border-slate-200/90 shadow-xs flex flex-col justify-between overflow-hidden">
        <div>
          <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Monthly Target Pace & Forecast
                </CardTitle>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Real-time trajectory vs. company monthly quota
                </p>
              </div>
              <Badge variant="neutral" className="text-[10px] text-emerald-300 border-emerald-700/60 bg-emerald-950/50">
                Run-Rate
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 space-y-4">
            {loading ? (
              <div className="py-8 space-y-4">
                <Skeleton className="h-32 w-32 rounded-full mx-auto" />
                <Skeleton className="h-4 w-40 mx-auto" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : error ? (
              <div className="py-8 text-center text-xs text-rose-500">{error}</div>
            ) : !data ? null : (
              <>
                {/* Semi-Circle Speedometer Gauge */}
                <div className="relative flex flex-col items-center justify-center pt-2">
                  <svg viewBox="0 0 180 105" className="w-48 overflow-visible">
                    {/* Background Arc */}
                    <path
                      d="M 20 95 A 70 70 0 0 1 160 95"
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="14"
                      strokeLinecap="round"
                    />

                    {/* Expected Pace Marker Indicator (Dotted Reference Tick) */}
                    {expectedGaugePercent > 0 && expectedGaugePercent < 100 && (
                      <circle
                        cx={90 - 70 * Math.cos((expectedGaugePercent * Math.PI) / 100)}
                        cy={95 - 70 * Math.sin((expectedGaugePercent * Math.PI) / 100)}
                        r="3.5"
                        fill="#0f172a"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      >
                        <title>{`Expected pace today: ${expectedGaugePercent}%`}</title>
                      </circle>
                    )}

                    {/* Active Progress Arc */}
                    <path
                      d="M 20 95 A 70 70 0 0 1 160 95"
                      fill="none"
                      stroke={
                        data.pace_status === "ahead_of_pace"
                          ? "#059669"
                          : data.pace_status === "on_pace"
                          ? "#0d9488"
                          : "#f43f5e"
                      }
                      strokeWidth="14"
                      strokeLinecap="round"
                      strokeDasharray={arcCircumference}
                      strokeDashoffset={filledDashoffset}
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>

                  {/* Center Gauge Reading */}
                  <div className="absolute top-14 flex flex-col items-center text-center">
                    <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                      {data.monthly_pace_pct}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      Quota Achieved
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-center">
                    {getPaceBadge(data.pace_status, data.monthly_pace_pct)}
                  </div>
                </div>

                {/* Month Timeline Progress Bar */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-600 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Day {data.days_elapsed} of {data.days_in_month}
                    </span>
                    <span className="text-slate-500 font-medium text-[11px]">
                      {data.days_remaining} days left
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-700 rounded-full"
                      style={{ width: `${Math.min(100, data.expected_pace_pct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Month Elapsed: {data.expected_pace_pct}%</span>
                    <span>Target: 100%</span>
                  </div>
                </div>

                {/* Key Executive Run-Rate Figures */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Current Daily Run-Rate */}
                  <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
                    <span className="text-[10px] font-bold text-emerald-900 flex items-center gap-1 mb-0.5">
                      <Zap className="w-3 h-3 text-emerald-600 shrink-0" />
                      Current Run-Rate
                    </span>
                    <div className="font-extrabold text-slate-900 truncate">
                      {formatBDT(data.daily_current_run_rate_bdt)}
                      <span className="text-[10px] text-slate-500 font-normal"> / day</span>
                    </div>
                  </div>

                  {/* Required Run-Rate */}
                  <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
                    <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1 mb-0.5">
                      <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                      Required Run-Rate
                    </span>
                    <div className="font-extrabold text-slate-900 truncate">
                      {formatBDT(data.daily_run_rate_needed_bdt)}
                      <span className="text-[10px] text-slate-500 font-normal"> / day</span>
                    </div>
                  </div>
                </div>

                {/* Target & Forecast Strip */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Month-to-Date Collected:</span>
                    <span className="font-bold text-emerald-700">
                      {formatBDT(data.month_to_date_collected_bdt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Monthly Target Quota:</span>
                    <span className="font-bold text-slate-900">
                      {formatBDT(data.monthly_target_bdt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-slate-700">
                    <span className="font-semibold flex items-center gap-1">
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                      Projected Month-End:
                    </span>
                    <span className="font-extrabold text-slate-900">
                      {formatBDT(data.projected_month_end_bdt)}{" "}
                      <span className="text-[10px] text-slate-500 font-medium">
                        ({data.projected_achievement_pct}%)
                      </span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </div>
      </Card>

      {/* ── 2. Financial Trend & Commitment Realization (8 cols) ───────── */}
      <Card className="lg:col-span-8 border border-slate-200/90 shadow-xs flex flex-col justify-between overflow-hidden">
        <div>
          <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Banknote className="w-4 h-4 text-emerald-400" />
                  Financial Trend & Commitment Realization
                </CardTitle>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Day-by-day actual cash deposits vs. customer promised commitments
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-[11px] self-start sm:self-center flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-slate-200">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500 shrink-0" />
                  Actual Cash
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-200">
                  <span className="w-3 h-3 rounded-sm bg-amber-400 shrink-0" />
                  Commitments
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-200">
                  <span className="w-3 h-0.5 bg-cyan-400 shrink-0" />
                  Cumulative
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {loading ? (
              <div className="py-12 space-y-4">
                <Skeleton className="h-44 w-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ) : error ? (
              <div className="py-12 text-center text-xs text-rose-500">{error}</div>
            ) : trendPoints.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No financial activity data recorded for this date range.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Interactive SVG Bar & Line Chart */}
                <div className="relative w-full overflow-x-auto pb-2">
                  <div className="min-w-[500px]">
                    <svg viewBox="0 0 600 200" className="w-full h-52 overflow-visible">
                      <defs>
                        {/* Gradient for Cumulative Area Fill */}
                        <linearGradient id="cumAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = 170 - ratio * 140;
                        const labelVal = maxDailyValue * ratio;
                        return (
                          <g key={ratio}>
                            <line
                              x1="40"
                              y1={y}
                              x2="590"
                              y2={y}
                              stroke="#f1f5f9"
                              strokeWidth="1"
                              strokeDasharray={ratio > 0 ? "3 3" : undefined}
                            />
                            <text
                              x="35"
                              y={y + 3}
                              textAnchor="end"
                              className="text-[9px] fill-slate-400 font-mono select-none"
                            >
                              {formatBDT(labelVal)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Cumulative Area Fill & Curve */}
                      {trendPoints.length > 1 && (
                        <>
                          <path
                            d={(() => {
                              const points = trendPoints.map((pt, idx) => {
                                const x = 50 + (idx / (trendPoints.length - 1)) * 530;
                                const y = 170 - (pt.cumulative_collection_bdt / maxCumulativeValue) * 140;
                                return `${x},${y}`;
                              });
                              return `M 50,170 L ${points.join(" L ")} L 580,170 Z`;
                            })()}
                            fill="url(#cumAreaGrad)"
                          />
                          <path
                            d={(() => {
                              const points = trendPoints.map((pt, idx) => {
                                const x = 50 + (idx / (trendPoints.length - 1)) * 530;
                                const y = 170 - (pt.cumulative_collection_bdt / maxCumulativeValue) * 140;
                                return `${x},${y}`;
                              });
                              return `M ${points.join(" L ")}`;
                            })()}
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )}

                      {/* Dual Daily Bars (Actual Collection & Commitments) */}
                      {trendPoints.map((pt, idx) => {
                        const count = trendPoints.length;
                        const availableWidth = 530 / count;
                        const barWidth = Math.min(14, Math.max(4, availableWidth * 0.35));
                        const centerX = 50 + (count === 1 ? 265 : (idx / (count - 1)) * 530);

                        const actualH = (pt.actual_collection_bdt / maxDailyValue) * 140;
                        const commitH = (pt.commitments_bdt / maxDailyValue) * 140;

                        const isHovered = hoveredIndex === idx;

                        return (
                          <g
                            key={pt.date}
                            className="cursor-pointer transition-opacity"
                            onMouseEnter={() => setHoveredIndex(idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          >
                            {/* Hover backdrop hit column */}
                            <rect
                              x={centerX - availableWidth / 2}
                              y={20}
                              width={availableWidth}
                              height={160}
                              fill={isHovered ? "#f8fafc" : "transparent"}
                              className="transition-colors"
                            />

                            {/* Actual Collection Bar (Emerald) */}
                            <rect
                              x={centerX - barWidth - 1}
                              y={170 - actualH}
                              width={barWidth}
                              height={Math.max(1, actualH)}
                              fill={isHovered ? "#047857" : "#10b981"}
                              rx="2"
                              className="transition-all duration-200"
                            />

                            {/* Commitment Bar (Amber) */}
                            <rect
                              x={centerX + 1}
                              y={170 - commitH}
                              width={barWidth}
                              height={Math.max(1, commitH)}
                              fill={isHovered ? "#d97706" : "#f59e0b"}
                              rx="2"
                              className="transition-all duration-200"
                            />

                            {/* Cumulative point dot */}
                            {trendPoints.length > 1 && (
                              <circle
                                cx={centerX}
                                cy={170 - (pt.cumulative_collection_bdt / maxCumulativeValue) * 140}
                                r={isHovered ? 4.5 : 2.5}
                                fill="#06b6d4"
                                stroke="#ffffff"
                                strokeWidth="1.5"
                                className="transition-all"
                              />
                            )}

                            {/* X-Axis Date Label (sample if dense) */}
                            {(count <= 14 || idx % Math.ceil(count / 10) === 0 || idx === count - 1) && (
                              <text
                                x={centerX}
                                y="188"
                                textAnchor="middle"
                                className={`text-[9px] font-mono select-none ${
                                  isHovered ? "fill-slate-900 font-bold" : "fill-slate-400 font-medium"
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

                {/* Active Tooltip Card on Hover */}
                {hoveredIndex !== null && trendPoints[hoveredIndex] ? (
                  <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {trendPoints[hoveredIndex].label}
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono">
                        {trendPoints[hoveredIndex].date}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Actual Cash:</span>
                        <span className="font-extrabold text-emerald-400">
                          {formatBDT(trendPoints[hoveredIndex].actual_collection_bdt)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Commitment:</span>
                        <span className="font-extrabold text-amber-400">
                          {formatBDT(trendPoints[hoveredIndex].commitments_bdt)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Cumulative Cash:</span>
                        <span className="font-extrabold text-cyan-300">
                          {formatBDT(trendPoints[hoveredIndex].cumulative_collection_bdt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 text-center italic">
                    Hover over or tap any day on the chart to inspect daily cash deposits & promises
                  </p>
                )}

                {/* Bottom Period Totals Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                  <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
                    <span className="text-[10px] text-emerald-800 font-semibold uppercase tracking-wider block">
                      Period Cash Collected
                    </span>
                    <span className="text-sm font-extrabold text-emerald-700">
                      {formatBDT(data?.total_actual_collection_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
                    <span className="text-[10px] text-amber-800 font-semibold uppercase tracking-wider block">
                      Period Promises Recorded
                    </span>
                    <span className="text-sm font-extrabold text-amber-700">
                      {formatBDT(data?.total_commitments_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-cyan-50/60 border border-cyan-100">
                    <span className="text-[10px] text-cyan-800 font-semibold uppercase tracking-wider block">
                      Realization Conversion
                    </span>
                    <span className="text-sm font-extrabold text-cyan-700">
                      {(data?.total_commitments_bdt ?? 0) > 0
                        ? `${Math.round(
                            ((data?.total_actual_collection_bdt ?? 0) / (data?.total_commitments_bdt ?? 1)) * 100
                          )}% of promises`
                        : "100% Direct Cash"}
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
