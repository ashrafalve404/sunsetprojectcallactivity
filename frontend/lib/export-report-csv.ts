import {
  Report,
  CallActivityEntry,
  MeetingActivityEntry,
  SalesCollectionEntry,
  ClientContactEntry,
  LEAD_CATEGORIES,
  MEETING_METRICS,
} from "@/types";
import { formatEmployeeId } from "@/lib/utils";

export interface FullReportExportData {
  report: Report;
  summary?: Record<string, unknown> | null;
  callEntries?: CallActivityEntry[];
  clientContacts?: ClientContactEntry[];
  meetingEntries?: MeetingActivityEntry[];
  salesEntries?: SalesCollectionEntry[];
}

function escapeCsv(str: unknown): string {
  if (str === null || str === undefined) return '""';
  const s = String(str).replace(/"/g, '""');
  return `"${s}"`;
}

/**
 * Downloads a complete daily activity & financial report as a clean CSV file compatible with Excel/Google Sheets.
 */
export function exportFullReportToCSV(data: FullReportExportData) {
  const {
    report,
    summary,
    callEntries = [],
    clientContacts = [],
    meetingEntries = [],
    salesEntries = [],
  } = data;

  const callsMap: Record<string, CallActivityEntry> = {};
  for (const entry of callEntries) {
    callsMap[entry.lead_category] = entry;
  }

  const meetingsMap: Record<string, MeetingActivityEntry> = {};
  for (const entry of meetingEntries) {
    meetingsMap[entry.metric_type] = entry;
  }

  const lines: string[] = [];

  // ── Document Header ──────────────────────────────────────────────────────────
  lines.push(`"SUNSET GROUP REAL ESTATE - DAILY ACTIVITY & PERFORMANCE REPORT"`);
  lines.push(`"Report ID",${escapeCsv(`REP-${report.id.toString().padStart(5, "0")}`)}`);
  lines.push(`"Reporting Date",${escapeCsv(report.report_date)}`);
  lines.push(`"Staff Officer",${escapeCsv(report.employee_name || `Employee #${report.employee_id}`)}`);
  lines.push(`"Employee ID",${escapeCsv(formatEmployeeId(report.employee_id))}`);
  lines.push(
    `"Submission Status",${escapeCsv(
      report.is_submitted ? "Finalized / Submitted" : "Draft (Unsubmitted)"
    )}`
  );
  lines.push(
    `"Submitted At",${escapeCsv(
      report.submitted_at
        ? new Date(report.submitted_at).toLocaleString()
        : "Pending Submission"
    )}`
  );
  lines.push("");

  // ── Executive KPI Summary ──────────────────────────────────────────────────
  if (summary) {
    lines.push(`"EXECUTIVE PERFORMANCE SUMMARY (KPIS)"`);
    lines.push(`"Total Calls Dialed",${escapeCsv(summary.total_dialed ?? 0)}`);
    lines.push(`"Total Calls Connected",${escapeCsv(summary.total_connected ?? 0)}`);
    lines.push(`"Connection Rate (%)",${escapeCsv(summary.connection_rate_pct ?? 0)}`);
    lines.push(`"Total Call Duration (Minutes)",${escapeCsv(summary.total_call_duration_minutes ?? 0)}`);
    lines.push(`"Total Meeting Duration (Minutes)",${escapeCsv(summary.total_meeting_duration_minutes ?? 0)}`);
    lines.push(`"Total Actual Cash Collection (BDT)",${escapeCsv(summary.total_actual_collection ?? 0)}`);
    lines.push(
      `"Total Commitments (BDT)",${escapeCsv(
        Number(summary.total_sales_commitments ?? 0) +
          Number(summary.total_tb_commitments ?? 0)
      )}`
    );
    lines.push("");
  }

  // ── Section 1: Call Activity & Lead Qualification ───────────────────────────
  lines.push(`"1. DAILY CALL ACTIVITY & LEAD QUALIFICATION"`);
  lines.push(
    [
      "Lead Category",
      "Till Today (Starting)",
      "10:00 - 01:00",
      "02:00 - 05:00",
      "05:00 - 06:00",
      "HP (High Potential)",
      "P (Potential)",
      "FUB (Follow Up)",
      "NI (Not Interested)",
      "Total Dialed",
      "Total Connected",
    ]
      .map(escapeCsv)
      .join(",")
  );

  for (const cat of LEAD_CATEGORIES) {
    const row = callsMap[cat.key];
    const s1 = row?.slot_10_to_1 ?? 0;
    const s2 = row?.slot_2_to_5 ?? 0;
    const s3 = row?.slot_5_to_6 ?? 0;
    const hp = row?.hp_count ?? 0;
    const p = row?.p_count ?? 0;
    const fub = row?.fub_count ?? 0;
    const ni = row?.ni_count ?? 0;
    const dialed = (row?.total_dialed ?? 0) || s1 + s2 + s3;
    const connected = (row?.total_connected ?? 0) || hp + p + fub + ni;

    lines.push(
      [
        cat.label,
        row?.till_today_status ?? 0,
        s1,
        s2,
        s3,
        hp,
        p,
        fub,
        ni,
        dialed,
        connected,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  lines.push("");

  // ── Section 2: Priority Client Directory ───────────────────────────────────
  lines.push(`"2. PRIORITY CLIENT FOLLOW-UP DIRECTORY (HP / FUB / P)"`);
  lines.push(
    [
      "#",
      "Customer / Client Name",
      "Phone Number",
      "Lead Status",
      "Next Follow-Up Date",
      "Discussion Summary & Requirements",
    ]
      .map(escapeCsv)
      .join(",")
  );

  if (clientContacts.length === 0) {
    lines.push(`"No client follow-up contacts recorded for this date."`);
  } else {
    clientContacts.forEach((c, idx) => {
      lines.push(
        [
          idx + 1,
          c.client_name,
          c.phone_number || "",
          c.category,
          c.follow_up_date || "",
          c.discussion_notes || "",
        ]
          .map(escapeCsv)
          .join(",")
      );
    });
  }
  lines.push("");

  // ── Section 3: Meeting Time Daily Breakdown ────────────────────────────────
  lines.push(`"3. MEETING TIME DAILY BREAKDOWN"`);
  lines.push(
    [
      "Activity Metric",
      "Unit",
      "Till Today",
      "10:00 - 01:00",
      "02:00 - 05:00",
      "05:00 - 06:00",
      "Daily Total",
    ]
      .map(escapeCsv)
      .join(",")
  );

  for (const m of MEETING_METRICS) {
    const row = meetingsMap[m.key];
    const s1 = row?.slot_10_to_1 ?? 0;
    const s2 = row?.slot_2_to_5 ?? 0;
    const s3 = row?.slot_5_to_6 ?? 0;
    const tot = s1 + s2 + s3;

    lines.push(
      [m.label, m.unit, row?.till_today ?? 0, s1, s2, s3, tot]
        .map(escapeCsv)
        .join(",")
    );
  }
  lines.push("");

  // ── Section 4: Sales & Collections ─────────────────────────────────────────
  lines.push(`"4. SALES & COLLECTION TRANSACTIONS"`);
  lines.push(
    [
      "#",
      "Customer Name",
      "Reference / Project",
      "Category",
      "Amount (BDT)",
      "Payment Method",
      "Promised Payment Date",
      "Reschedule Count",
    ]
      .map(escapeCsv)
      .join(",")
  );

  if (salesEntries.length === 0) {
    lines.push(`"No sales or collection entries recorded for this date."`);
  } else {
    salesEntries.forEach((s, idx) => {
      lines.push(
        [
          idx + 1,
          s.customer_name || "",
          s.reference || "",
          s.category.replace(/_/g, " ").toUpperCase(),
          s.amount,
          s.payment_method || "",
          s.expected_payment_date || "",
          s.reschedule_count ?? 0,
        ]
          .map(escapeCsv)
          .join(",")
      );
    });
  }

  // Prepend UTF-8 BOM so Excel opens special characters (like ৳ or non-ASCII) without garbled text
  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + lines.join("\r\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  const safeEmp = (
    report.employee_name || `emp_${report.employee_id}`
  ).replace(/[^a-zA-Z0-9_-]/g, "_");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `sunset_report_${report.report_date}_${safeEmp}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
