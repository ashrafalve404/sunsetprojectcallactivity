"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Calendar,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  TrendingUp,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { FinancialTrendResponse } from "@/types";
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

  // Zoom & Filter state for Collections vs. Commitments
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [timeWindow, setTimeWindow] = useState<"all" | "14d" | "7d">("all");

  // PNG download states & DOM refs
  const [downloadingCollections, setDownloadingCollections] = useState(false);
  const [downloadingPace, setDownloadingPace] = useState(false);
  const collectionsSvgRef = useRef<SVGSVGElement | null>(null);
  const paceGaugeSvgRef = useRef<SVGSVGElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Drag-to-scroll interaction when zoomed
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

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
  const rawTrendPoints = useMemo(() => data?.trend || [], [data]);

  // Windowed points based on 7D / 14D / All preset
  const trendPoints = useMemo(() => {
    if (!rawTrendPoints.length) return [];
    if (timeWindow === "7d") return rawTrendPoints.slice(-7);
    if (timeWindow === "14d") return rawTrendPoints.slice(-14);
    return rawTrendPoints;
  }, [rawTrendPoints, timeWindow]);

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
    let max = 0;
    for (const pt of trendPoints) {
      if (pt.cumulative_collection_bdt > max) max = pt.cumulative_collection_bdt;
    }
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

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(2.5, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setTimeWindow("all");
    setHoveredIndex(null);
  };

  // Mouse pan handlers for horizontal drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1 || !scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  // Dynamic Chart Width based on zoom level
  const baseWidth = 600;
  const chartWidth = Math.round(baseWidth * zoomLevel);
  const chartHeight = 195;

  // ── PNG Download: Collections vs Commitments ─────────────────────────────
  const handleDownloadCollectionsPng = async () => {
    if (!collectionsSvgRef.current || !data) return;
    setDownloadingCollections(true);
    try {
      const svg = collectionsSvgRef.current;
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svg);

      if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = blobURL;
      });

      const canvas = document.createElement("canvas");
      const width = 1200;
      const height = 720;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 1. Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // 2. Header Banner
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, 120);

      ctx.fillStyle = "#10b981";
      ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
      ctx.fillText("SUNSET GROUP • FINANCIAL ANALYTICS", 40, 36);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
      ctx.fillText("Collections vs. Commitments", 40, 72);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui, -apple-system, sans-serif";
      const scopeLabel = employeeId && employeeId !== "all" ? `Employee ID: ${employeeId}` : "All Staff";
      ctx.fillText(`Period: ${startDate} to ${endDate}  •  Scope: ${scopeLabel}`, 40, 98);

      // Legend in Header
      ctx.fillStyle = "#059669";
      ctx.fillRect(width - 360, 58, 14, 14);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "13px system-ui, -apple-system, sans-serif";
      ctx.fillText("Cash Received", width - 338, 70);

      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(width - 220, 58, 14, 14);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("Commitment", width - 198, 70);

      ctx.fillStyle = "#2563eb";
      ctx.fillRect(width - 95, 64, 18, 3);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("Cum.", width - 70, 70);

      // 3. Draw Chart SVG
      const chartMarginX = 40;
      const chartMarginY = 140;
      const chartDrawWidth = width - 80;
      const chartDrawHeight = 420;
      ctx.drawImage(img, chartMarginX, chartMarginY, chartDrawWidth, chartDrawHeight);
      URL.revokeObjectURL(blobURL);

      // 4. Bottom Summary Banner
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 580, width, 140);
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 580);
      ctx.lineTo(width, 580);
      ctx.stroke();

      // Card 1: Cash Collected
      ctx.fillStyle = "#475569";
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      ctx.fillText("TOTAL CASH COLLECTED", 60, 618);
      ctx.fillStyle = "#047857";
      ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
      ctx.fillText(formatBDT(data.total_actual_collection_bdt), 60, 655);

      // Card 2: Promises Recorded
      ctx.fillStyle = "#475569";
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      ctx.fillText("TOTAL PROMISES RECORDED", 460, 618);
      ctx.fillStyle = "#b45309";
      ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
      ctx.fillText(formatBDT(data.total_commitments_bdt), 460, 655);

      // Card 3: Conversion Rate
      ctx.fillStyle = "#475569";
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      ctx.fillText("COLLECTION CONVERSION", 860, 618);
      ctx.fillStyle = "#1d4ed8";
      ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
      const convRate =
        data.total_commitments_bdt > 0
          ? `${Math.round((data.total_actual_collection_bdt / data.total_commitments_bdt) * 100)}%`
          : "100% Cash";
      ctx.fillText(convRate, 860, 655);

      // Watermark
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      const dateStr = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      ctx.fillText(`Sunset ERP • Exported ${dateStr}`, width - 210, 700);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dlUrl;
        a.download = `collections-vs-commitments_${startDate}_to_${endDate}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
      }, "image/png");
    } catch (e) {
      console.error("Failed to export Collections chart as PNG", e);
    } finally {
      setDownloadingCollections(false);
    }
  };

  // ── PNG Download: Monthly Target Pace ──────────────────────────────────
  const handleDownloadPacePng = async () => {
    if (!paceGaugeSvgRef.current || !data) return;
    setDownloadingPace(true);
    try {
      const svg = paceGaugeSvgRef.current;
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svg);
      if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = blobURL;
      });

      const canvas = document.createElement("canvas");
      const width = 800;
      const height = 820;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Header banner
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, 110);

      ctx.fillStyle = "#10b981";
      ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
      ctx.fillText("SUNSET GROUP • TARGET TRACKING", 40, 36);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
      ctx.fillText("Monthly Target Pace & Forecast", 40, 70);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui, -apple-system, sans-serif";
      ctx.fillText(`Period: ${startDate} to ${endDate}`, 40, 95);

      // Big KPI Callout
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatBDT(data.month_to_date_collected_bdt), width / 2, 165);

      ctx.fillStyle = "#64748b";
      ctx.font = "14px system-ui, -apple-system, sans-serif";
      ctx.fillText(`MTD Collections • Monthly Target: ${formatBDT(data.monthly_target_bdt)}`, width / 2, 192);

      // Draw Gauge Arc SVG centered
      const gaugeWidth = 320;
      const gaugeHeight = 170;
      ctx.drawImage(img, (width - gaugeWidth) / 2, 215, gaugeWidth, gaugeHeight);
      URL.revokeObjectURL(blobURL);

      // Gauge % inside
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 38px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${data.monthly_pace_pct}%`, width / 2, 290);
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      ctx.fillText("ACHIEVED", width / 2, 310);

      // Month progress card
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(40, 410, width - 80, 75);
      ctx.strokeStyle = "#e2e8f0";
      ctx.strokeRect(40, 410, width - 80, 75);

      ctx.textAlign = "left";
      ctx.fillStyle = "#334155";
      ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
      ctx.fillText(`Day ${data.days_elapsed} of ${data.days_in_month}`, 60, 435);
      ctx.textAlign = "right";
      ctx.fillText(`${data.days_remaining} days remaining`, width - 60, 435);

      // Progress bar
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(60, 448, width - 120, 10);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(60, 448, ((width - 120) * Math.min(100, data.expected_pace_pct)) / 100, 10);

      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = "12px system-ui, -apple-system, sans-serif";
      ctx.fillText(`Month Elapsed: ${data.expected_pace_pct}%`, 60, 473);
      ctx.textAlign = "right";
      ctx.fillText(`Expected: ${data.expected_pace_pct}%`, width - 60, 473);

      // Metric Tiles (Current Rate, Required Rate)
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(40, 505, 345, 85);
      ctx.strokeRect(40, 505, 345, 85);
      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      ctx.fillText("CURRENT DAILY RUN RATE", 60, 532);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${formatBDT(data.daily_current_run_rate_bdt)} /day`, 60, 565);

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(415, 505, 345, 85);
      ctx.strokeRect(415, 505, 345, 85);
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      ctx.fillText("REQUIRED DAILY RUN RATE", 435, 532);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${formatBDT(data.daily_run_rate_needed_bdt)} /day`, 435, 565);

      // Forecast Bar
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(40, 610, width - 80, 65);
      ctx.strokeRect(40, 610, width - 80, 65);
      ctx.fillStyle = "#1e40af";
      ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
      ctx.fillText("Projected Month-End Finish:", 60, 648);
      ctx.textAlign = "right";
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        `${formatBDT(data.projected_month_end_bdt)} (${data.projected_achievement_pct}%)`,
        width - 60,
        648
      );

      // Watermark
      ctx.textAlign = "left";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      const dateStr = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      ctx.fillText(`Sunset ERP • Exported ${dateStr}`, 40, 790);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dlUrl;
        a.download = `monthly-target-pace_${startDate}_to_${endDate}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
      }, "image/png");
    } catch (e) {
      console.error("Failed to export Pace chart as PNG", e);
    } finally {
      setDownloadingPace(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
      {/* ── 1. Monthly Target Pace Tile (4 cols) ───────────────────────── */}
      <Card className="lg:col-span-4 border border-slate-300 shadow-2xs flex flex-col justify-between bg-white rounded-xl overflow-hidden">
        <div>
          {/* Header with Title + Pace Badge + PNG Download */}
          <div className="bg-slate-900 text-white px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-white">
              Monthly Target Pace
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                {data ? `${data.monthly_pace_pct}% Goal` : "Pace"}
              </span>
              <button
                onClick={handleDownloadPacePng}
                disabled={downloadingPace || loading || !data}
                title="Download Monthly Pace chart as high-resolution PNG image"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-[11px] font-semibold transition-colors disabled:opacity-40"
              >
                <Download className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">PNG</span>
              </button>
            </div>
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
                  <svg
                    ref={paceGaugeSvgRef}
                    viewBox="0 0 180 95"
                    className="w-40 sm:w-44 overflow-visible"
                  >
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

                    {/* Expected Pace Target Marker on Arc */}
                    {expectedGaugePercent > 0 && expectedGaugePercent < 100 && (() => {
                      const angle = (expectedGaugePercent * Math.PI) / 100;
                      const x1 = 90 - 58 * Math.cos(angle);
                      const y1 = 88 - 58 * Math.sin(angle);
                      const x2 = 90 - 78 * Math.cos(angle);
                      const y2 = 88 - 78 * Math.sin(angle);
                      return (
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="#0f172a"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      );
                    })()}
                  </svg>

                  {/* Centered % in Gauge */}
                  <div className="absolute top-8 flex flex-col items-center text-center z-10 pointer-events-none">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                      {data.monthly_pace_pct}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
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

                {/* Metric Tiles */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
                      Current Rate
                    </span>
                    <div className="font-extrabold text-slate-900 truncate text-xs sm:text-[13px]">
                      {formatBDT(data.daily_current_run_rate_bdt)}
                      <span className="text-[10px] text-slate-500 font-normal"> /day</span>
                    </div>
                  </div>

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
          {/* Header with Title + Controls (Presets, Zoom, Reset, PNG) */}
          <div className="bg-slate-900 text-white px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <h3 className="text-xs sm:text-sm font-bold text-white">
              Collections vs. Commitments
            </h3>

            {/* Interactive Actions Group: Presets, Zoom Controls, PNG Download */}
            <div className="flex items-center gap-2 flex-wrap select-none">
              {/* Range Presets: All, 14D, 7D */}
              <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700 text-[10px]">
                {(["all", "14d", "7d"] as const).map((tw) => (
                  <button
                    key={tw}
                    onClick={() => {
                      setTimeWindow(tw);
                      setHoveredIndex(null);
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      timeWindow === tw
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {tw === "all" ? "All" : tw.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Stepped Zoom Controls: [-] [150%] [+] [Reset] */}
              <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700 text-[10px]">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1}
                  title="Zoom out"
                  className="p-1 rounded text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 font-mono text-[10px] font-bold text-slate-200 select-none min-w-[34px] text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 2.5}
                  title="Zoom in (spread days wider)"
                  className="p-1 rounded text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {(zoomLevel > 1 || timeWindow !== "all") && (
                  <button
                    onClick={handleResetZoom}
                    title="Reset zoom scale and range"
                    className="p-1 ml-0.5 text-slate-400 hover:text-amber-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Download PNG Button */}
              <button
                onClick={handleDownloadCollectionsPng}
                disabled={downloadingCollections || loading || !data}
                title="Download Collections chart as high-resolution PNG image"
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-[11px] font-semibold transition-colors disabled:opacity-40"
              >
                <Download className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">PNG</span>
              </button>
            </div>
          </div>

          <CardContent className="p-3 sm:p-4">
            {/* Chart Subheader: Legend and Zoom hint */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
              <div className="flex items-center gap-3 text-[10px] sm:text-[11px] select-none">
                <span className="inline-flex items-center gap-1 text-slate-600 font-semibold">
                  <span className="w-2.5 h-2.5 bg-emerald-600 rounded-none shrink-0" />
                  Cash
                </span>
                <span className="inline-flex items-center gap-1 text-slate-600 font-semibold">
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-none shrink-0" />
                  Commitment
                </span>
                <span className="inline-flex items-center gap-1 text-slate-600 font-semibold">
                  <span className="w-3 h-0.5 bg-blue-600 shrink-0" />
                  Cumulative
                </span>
              </div>

              {zoomLevel > 1 && (
                <span className="text-[10px] text-slate-400 font-medium">
                  ↔ Drag or swipe horizontally to pan
                </span>
              )}
            </div>

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
                {/* Responsive SVG Chart with smooth horizontal touch-scroll and mouse-drag pan */}
                <div
                  ref={scrollContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseLeave={handleMouseLeaveOrUp}
                  onMouseUp={handleMouseLeaveOrUp}
                  onMouseMove={handleMouseMove}
                  style={{
                    cursor: zoomLevel > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                  }}
                  className="relative w-full overflow-x-auto pb-1 scrollbar-thin select-none"
                >
                  <div
                    style={{
                      minWidth: `${Math.max(460, chartWidth)}px`,
                      width: zoomLevel > 1 ? `${chartWidth}px` : "100%",
                    }}
                  >
                    <svg
                      ref={collectionsSvgRef}
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="w-full h-48 sm:h-52 overflow-visible bg-white"
                    >
                      {/* Gridlines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = 165 - ratio * 135;
                        const labelVal = maxDailyValue * ratio;
                        return (
                          <g key={ratio}>
                            <line
                              x1="45"
                              y1={y}
                              x2={chartWidth - 10}
                              y2={y}
                              stroke="#e2e8f0"
                              strokeWidth="1"
                            />
                            <text
                              x="40"
                              y={y + 3.5}
                              textAnchor="end"
                              fill="#64748b"
                              fontSize="9"
                              fontFamily="ui-monospace, monospace"
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
                              const x =
                                55 + (idx / (trendPoints.length - 1)) * (chartWidth - 75);
                              const y =
                                165 -
                                (pt.cumulative_collection_bdt / maxCumulativeValue) * 135;
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
                        const availableWidth = (chartWidth - 70) / Math.max(1, count);
                        const barWidth = Math.min(22, Math.max(3.5, availableWidth * 0.36));
                        const centerX =
                          55 +
                          (count <= 1
                            ? (chartWidth - 70) / 2
                            : (idx / (count - 1)) * (chartWidth - 75));

                        const actualH = (pt.actual_collection_bdt / maxDailyValue) * 135;
                        const commitH = (pt.commitments_bdt / maxDailyValue) * 135;

                        const isHovered = hoveredIndex === idx;

                        const showLabel =
                          zoomLevel >= 1.5 ||
                          count <= 14 ||
                          idx % Math.ceil(count / 10) === 0 ||
                          idx === count - 1;

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
                                cy={
                                  165 -
                                  (pt.cumulative_collection_bdt / maxCumulativeValue) * 135
                                }
                                r={isHovered ? 4.5 : 2.5}
                                fill="#2563eb"
                                stroke="#ffffff"
                                strokeWidth="1.5"
                              />
                            )}

                            {/* X-Axis Tick Label */}
                            {showLabel && (
                              <text
                                x={centerX}
                                y="184"
                                textAnchor="middle"
                                fill={isHovered ? "#0f172a" : "#64748b"}
                                fontSize="9"
                                fontFamily="ui-monospace, monospace"
                                fontWeight={isHovered ? "bold" : "normal"}
                                className={`text-[9px] font-mono select-none ${
                                  isHovered
                                    ? "fill-slate-900 font-bold"
                                    : "fill-slate-500 font-medium"
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
                            ((data?.total_actual_collection_bdt ?? 0) /
                              (data?.total_commitments_bdt ?? 1)) *
                              100
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
