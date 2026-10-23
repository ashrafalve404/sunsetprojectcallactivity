"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Trophy,
  Medal,
  Award,
  PhoneCall,
  PhoneForwarded,
  MapPin,
  Banknote,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowUpDown,
  ExternalLink,
  Target,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Skeleton, Button } from "@/components/ui";
import { PerformanceLeaderboardResponse, EmployeeLeaderboardItem } from "@/types";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

interface KPILeaderboardProps {
  startDate: string;
  endDate: string;
  employeeId?: number | "all";
  title?: string;
  subtitle?: string;
}

export function KPILeaderboard({
  startDate,
  endDate,
  employeeId,
  title = "Daily KPI Performance & Team Leaderboard",
  subtitle = "Real-time target achievement rates, champion highlights, and employee rankings",
}: KPILeaderboardProps) {
  const [data, setData] = useState<PerformanceLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "dialed" | "connected" | "visits" | "collections">("score");

  useEffect(() => {
    let active = true;
    if (!startDate || !endDate) return;

    setLoading(true);
    setError(null);

    const empParam = employeeId && employeeId !== "all" ? Number(employeeId) : undefined;
    api.dashboard
      .getLeaderboard({
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
          console.error("Leaderboard fetch error:", err);
          setError("Failed to load KPI performance leaderboard.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [startDate, endDate, employeeId]);

  // Filtered & sorted employees
  const sortedRankings = useMemo(() => {
    if (!data?.rankings) return [];
    let list = [...data.rankings];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.employee_name.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "dialed") return b.dialed_calls - a.dialed_calls;
      if (sortBy === "connected") return b.connected_calls - a.connected_calls;
      if (sortBy === "visits") return b.outdoor_visits - a.outdoor_visits;
      if (sortBy === "collections") return b.actual_collections - a.actual_collections;
      return b.overall_score_pct - a.overall_score_pct;
    });

    return list;
  }, [data, searchQuery, sortBy]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 font-extrabold text-sm shadow-xs border border-amber-300">
          🥇
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-800 font-extrabold text-sm shadow-xs border border-slate-300">
          🥈
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-900 font-extrabold text-sm shadow-xs border border-amber-600/30">
          🥉
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200">
        #{rank}
      </span>
    );
  };

  const getStatusBadge = (status: EmployeeLeaderboardItem["status"], score: number) => {
    switch (status) {
      case "achieved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Target Achieved ({score}%)
          </span>
        );
      case "on_track":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
            <TrendingUp className="w-3 h-3 text-teal-600" /> On Track ({score}%)
          </span>
        );
      case "needs_attention":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> Needs Attention ({score}%)
          </span>
        );
      case "behind_pace":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <Flame className="w-3 h-3 text-rose-500" /> Behind Pace ({score}%)
          </span>
        );
    }
  };

  const renderProgressBar = (pct: number) => {
    const cappedPct = Math.min(100, Math.max(0, pct));
    let color = "bg-rose-500";
    if (pct >= 100) color = "bg-emerald-600";
    else if (pct >= 75) color = "bg-teal-500";
    else if (pct >= 50) color = "bg-amber-500";

    return (
      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${cappedPct}%` }} />
      </div>
    );
  };

  const isPersonalView = data && data.rankings.length === 1 && (!data.champions || data.champions.length === 0);
  const personal = isPersonalView ? data.rankings[0] : null;

  if (!loading && isPersonalView && personal) {
    return (
      <Card className="border border-slate-200/80 shadow-xs overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                <Target className="w-5 h-5 text-emerald-400" />
                My Daily KPI Targets & Progress
              </CardTitle>
              <p className="text-xs text-slate-300 mt-0.5">
                Your assigned daily targets and real-time achievement progress today
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              {getStatusBadge(personal.status, personal.overall_score_pct)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Dialed */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-blue-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Dialed Calls</span>
                <div className="p-1.5 rounded-md bg-blue-100 text-blue-700">
                  <PhoneCall className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">
                  {personal.dialed_calls}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {personal.dialed_target}</span>
                </span>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {personal.dialed_pct}%
                </span>
              </div>
              {renderProgressBar(personal.dialed_pct)}
              <p className="text-[11px] text-slate-500 pt-1 font-medium">
                {personal.dialed_calls >= personal.dialed_target
                  ? "Target reached! 🎉"
                  : `${personal.dialed_target - personal.dialed_calls} calls remaining`}
              </p>
            </div>

            {/* Connected */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-emerald-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Connected Calls</span>
                <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-700">
                  <PhoneForwarded className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">
                  {personal.connected_calls}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {personal.connected_target}</span>
                </span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {personal.connected_pct}%
                </span>
              </div>
              {renderProgressBar(personal.connected_pct)}
              <p className="text-[11px] text-slate-500 pt-1 font-medium">
                {personal.connected_calls >= personal.connected_target
                  ? "Target reached! 🎉"
                  : `${personal.connected_target - personal.connected_calls} connected calls remaining`}
              </p>
            </div>

            {/* Outdoor Visits */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-purple-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Outdoor Client Visits</span>
                <div className="p-1.5 rounded-md bg-purple-100 text-purple-700">
                  <MapPin className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">
                  {personal.outdoor_visits}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {personal.outdoor_target}</span>
                </span>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  {personal.outdoor_pct}%
                </span>
              </div>
              {renderProgressBar(personal.outdoor_pct)}
              <p className="text-[11px] text-slate-500 pt-1 font-medium">
                {personal.outdoor_visits >= personal.outdoor_target
                  ? "Target reached! 🎉"
                  : `${personal.outdoor_target - personal.outdoor_visits} client visits remaining`}
              </p>
            </div>

            {/* Collections */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-amber-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Collections (BDT)</span>
                <div className="p-1.5 rounded-md bg-amber-100 text-amber-700">
                  <Banknote className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-extrabold text-slate-900 truncate">
                  {formatBDT(personal.actual_collections)}
                </span>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 ml-1">
                  {personal.collection_pct}%
                </span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Target: {formatBDT(personal.collection_target)}
              </div>
              {renderProgressBar(personal.collection_pct)}
              <p className="text-[11px] text-slate-500 pt-1 font-medium truncate">
                {personal.actual_collections >= personal.collection_target
                  ? "Target reached! 🎉"
                  : `${formatBDT(personal.collection_target - personal.actual_collections)} remaining`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200/80 shadow-xs overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
              <Trophy className="w-5 h-5 text-amber-400" />
              {title}
            </CardTitle>
            <p className="text-xs text-slate-300 mt-0.5">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {data && (
              <div className="bg-white/10 backdrop-blur-xs px-3 py-1 rounded-md border border-white/20 text-xs">
                <span className="text-slate-300">Team Target Score: </span>
                <span className="font-extrabold text-amber-300">{data.team_overall_score_pct}%</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* ── Champions Row ─────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-5 w-28 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : data?.champions && data.champions.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Category Champions (Highest Performer)
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.champions.map((champ, idx) => {
                const icons = [
                  <PhoneCall key="call" className="w-4 h-4 text-blue-600" />,
                  <PhoneForwarded key="conn" className="w-4 h-4 text-emerald-600" />,
                  <MapPin key="visit" className="w-4 h-4 text-purple-600" />,
                  <Banknote key="cash" className="w-4 h-4 text-amber-600" />,
                ];
                const bgGradients = [
                  "from-blue-50 to-indigo-50/40 border-blue-200/80",
                  "from-emerald-50 to-teal-50/40 border-emerald-200/80",
                  "from-purple-50 to-pink-50/40 border-purple-200/80",
                  "from-amber-50 to-yellow-50/40 border-amber-200/80",
                ];

                return (
                  <div
                    key={champ.title}
                    className={`p-3 rounded-lg border bg-gradient-to-br ${bgGradients[idx % 4]} flex flex-col justify-between shadow-xs`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {champ.title}
                      </span>
                      <div className="p-1 rounded bg-white shadow-2xs">
                        {icons[idx % 4]}
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs font-bold text-slate-900 truncate" title={champ.employee_name}>
                        {champ.employee_name}
                      </p>
                      <p className="text-[11px] font-extrabold text-slate-700 mt-0.5 truncate">
                        {champ.value}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {champ.metric}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Table Filter & Controls ────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee in rankings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0">
            <span className="text-[11px] text-slate-500 font-semibold shrink-0">Sort by:</span>
            {[
              { key: "score", label: "Overall Score" },
              { key: "dialed", label: "Dialed" },
              { key: "connected", label: "Connected" },
              { key: "visits", label: "Visits" },
              { key: "collections", label: "Collections" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key as any)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors shrink-0 ${
                  sortBy === s.key
                    ? "bg-emerald-800 text-white font-semibold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detailed Target vs Actual Leaderboard Table ─────────────── */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[11px] font-bold">
                <th className="py-3 px-3 text-center w-12">Rank</th>
                <th className="py-3 px-3">Employee</th>
                <th className="py-3 px-3 min-w-[140px]">Dialed Target</th>
                <th className="py-3 px-3 min-w-[140px]">Connected Target</th>
                <th className="py-3 px-3 min-w-[120px]">Outdoor Visits</th>
                <th className="py-3 px-3 min-w-[150px]">Collections Target</th>
                <th className="py-3 px-3 text-center min-w-[130px]">Overall KPI Status</th>
                <th className="py-3 px-3 text-right">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3 px-3 text-center"><Skeleton className="h-5 w-5 mx-auto rounded-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3 text-center"><Skeleton className="h-5 w-24 mx-auto" /></td>
                    <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-rose-500">
                    {error}
                  </td>
                </tr>
              ) : sortedRankings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No employee performance data found for this period.
                  </td>
                </tr>
              ) : (
                sortedRankings.map((emp) => (
                  <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Rank */}
                    <td className="py-3 px-3 text-center">
                      {getRankBadge(emp.rank)}
                    </td>

                    {/* Employee info */}
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      <div>
                        <span className="text-xs font-bold text-slate-900">{emp.employee_name}</span>
                        <div className="text-[10px] text-slate-500 font-mono">@{emp.username}</div>
                      </div>
                    </td>

                    {/* Dialed Target vs Actual */}
                    <td className="py-3 px-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {emp.dialed_calls} <span className="text-slate-400 font-normal">/ {emp.dialed_target}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.dialed_pct}%
                        </span>
                      </div>
                      {renderProgressBar(emp.dialed_pct)}
                    </td>

                    {/* Connected Target vs Actual */}
                    <td className="py-3 px-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {emp.connected_calls} <span className="text-slate-400 font-normal">/ {emp.connected_target}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.connected_pct}%
                        </span>
                      </div>
                      {renderProgressBar(emp.connected_pct)}
                    </td>

                    {/* Outdoor Visits Target vs Actual */}
                    <td className="py-3 px-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {emp.outdoor_visits} <span className="text-slate-400 font-normal">/ {emp.outdoor_target}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.outdoor_pct}%
                        </span>
                      </div>
                      {renderProgressBar(emp.outdoor_pct)}
                    </td>

                    {/* Collections Target vs Actual */}
                    <td className="py-3 px-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {formatBDT(emp.actual_collections)}
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.collection_pct}%
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        Target: {formatBDT(emp.collection_target)}
                      </div>
                      {renderProgressBar(emp.collection_pct)}
                    </td>

                    {/* Overall KPI Status */}
                    <td className="py-3 px-3 text-center">
                      {getStatusBadge(emp.status, emp.overall_score_pct)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/reports?employee_id=${emp.employee_id}&start_date=${startDate}&end_date=${endDate}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                        title="View employee reports"
                      >
                        Reports <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
