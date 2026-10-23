/**
 * TypeScript definitions for Sunset Group Daily Call Activity Dashboard
 * Aligned with FastAPI backend schemas.
 */

export type UserRole = "admin" | "employee";

export interface User {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
}

export interface Report {
  id: number;
  employee_id: number;
  report_date: string; // YYYY-MM-DD
  is_submitted: boolean;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  notes?: string | null;
}


export type TimeSlot = "10_to_1" | "2_to_5" | "5_to_6";

export type LeadCategory =
  | "high_potential"
  | "potential"
  | "facebook"
  | "fair_leads"
  | "follow_up"
  | "other_not_reached"
  | "new_cold_leads";

export const LEAD_CATEGORIES: { key: LeadCategory; label: string }[] = [
  { key: "high_potential", label: "High Potential" },
  { key: "potential", label: "Potential" },
  { key: "facebook", label: "Facebook" },
  { key: "fair_leads", label: "Fair Leads" },
  { key: "follow_up", label: "Follow Up" },
  { key: "other_not_reached", label: "Other & Not Reached" },
  { key: "new_cold_leads", label: "New Cold Leads" },
];

export interface CallActivityEntry {
  id?: number;
  lead_category: LeadCategory;
  till_today_status: number | null;
  slot_10_to_1: number | null;
  slot_2_to_5: number | null;
  slot_5_to_6: number | null;
  hp_count: number | null;
  p_count: number | null;
  fub_count: number | null;
  ni_count: number | null;
  notes?: string | null;
}

export interface ClientContactEntry {
  id?: string;
  client_name: string;
  phone_number?: string;
  category: "HP" | "P" | "FUB" | "NI" | "CX" | "Other";
  follow_up_date?: string;
  discussion_notes?: string;
}

export interface CallSlotTotals {


  total_dialed_10_to_1: number;
  total_dialed_2_to_5: number;
  total_dialed_5_to_6: number;
  total_dialed: number;
  total_connected: number;
  total_duration_minutes: number;
  total_hp: number;
  total_p: number;
  total_fub: number;
  total_ni: number;
}

export interface CategoryCarryForward {
  lead_category: string;
  prev_till_today: number;
  prev_hp: number;
  prev_p: number;
  prev_fub: number;
  prev_ni: number;
}

export interface CarryForwardInfo {
  employee_id: number;
  employee_name: string | null;
  previous_report_date: string | null;
  categories: Record<string, CategoryCarryForward>;
}

export interface CallActivityResponse {
  report_id: number;
  report_date: string;
  is_submitted: boolean;
  entries: CallActivityEntry[];
  totals: CallSlotTotals;
  carry_forward?: CarryForwardInfo | null;
}

export type MeetingMetricType =
  | "outdoor_visit_count"
  | "outdoor_time_minutes"
  | "indoor_cx_count"
  | "indoor_cx_time_minutes"
  | "mg_time_minutes"
  | "team_meeting_time_minutes";

export const MEETING_METRICS: {
  key: MeetingMetricType;
  label: string;
  unit: "count" | "minutes";
}[] = [
  { key: "outdoor_visit_count", label: "Number of Outdoor Visit", unit: "count" },
  { key: "outdoor_time_minutes", label: "Outdoor Time", unit: "minutes" },
  { key: "indoor_cx_count", label: "No. of Indoor CX", unit: "count" },
  { key: "indoor_cx_time_minutes", label: "Indoor Time with CX", unit: "minutes" },
  { key: "mg_time_minutes", label: "MG Time", unit: "minutes" },
  { key: "team_meeting_time_minutes", label: "Team Meeting Time", unit: "minutes" },
];

export interface MeetingActivityEntry {
  id?: number;
  metric_type: MeetingMetricType;
  till_today: number | null;
  slot_10_to_1: number | null;
  slot_2_to_5: number | null;
  slot_5_to_6: number | null;
  notes?: string | null;
}

export interface MeetingTotals {
  total_outdoor_visits: number;
  total_indoor_cx: number;
  total_meeting_minutes: number;
  formatted_duration: string;
}

export interface MeetingActivityResponse {
  report_id: number;
  report_date: string;
  is_submitted: boolean;
  entries: MeetingActivityEntry[];
  totals: MeetingTotals;
}

export type SalesCollectionCategory =
  | "new_sales_collection"
  | "new_sales_commit_payment_1"
  | "new_sales_commit_payment_2"
  | "new_sales_commit_payment_3"
  | "tb_collection"
  | "tb_commit_payment_1"
  | "tb_commit_payment_2"
  | "tb_commit_payment_3"
  | "emi_collection"
  | "other_collection";

export const SALES_CATEGORIES: {
  key: SalesCollectionCategory;
  label: string;
  isCollection: boolean;
  group: "sales" | "tb" | "emi" | "other";
}[] = [
  { key: "new_sales_collection", label: "New Sales Collection", isCollection: true, group: "sales" },
  { key: "new_sales_commit_payment_1", label: "CX New Sales Commit Payment 1", isCollection: false, group: "sales" },
  { key: "new_sales_commit_payment_2", label: "New Sales Commit Payment 2", isCollection: false, group: "sales" },
  { key: "new_sales_commit_payment_3", label: "New Sales Commit Payment 3", isCollection: false, group: "sales" },
  { key: "tb_collection", label: "TB Collection", isCollection: true, group: "tb" },
  { key: "tb_commit_payment_1", label: "TB CX Commit Payment 1", isCollection: false, group: "tb" },
  { key: "tb_commit_payment_2", label: "TB CX Commit Payment 2", isCollection: false, group: "tb" },
  { key: "tb_commit_payment_3", label: "TB CX Commit Payment 3", isCollection: false, group: "tb" },
  { key: "emi_collection", label: "EMI Collection", isCollection: true, group: "emi" },
  { key: "other_collection", label: "Other Collection", isCollection: true, group: "other" },
];

export const PAYMENT_METHODS = [

  { key: "cash", label: "Cash" },
  { key: "cheque", label: "Cheque" },
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "rocket", label: "Rocket" },
  { key: "bank_transfer", label: "Bank Transfer (Online / BEFTN)" },
  { key: "pos", label: "POS / Card Payment" },
  { key: "other", label: "Other" },
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]["key"];

export interface SalesCollectionEntry {
  id: number;
  report_id: number;
  category: SalesCollectionCategory;
  is_collection: boolean;
  amount: number;
  customer_name?: string | null;
  payment_method?: string | null;
  payment_sequence?: number | null;
  reference?: string | null;
  notes?: string | null;
  created_at?: string;
}


export interface FinancialTotals {
  actual_collection_total: number;
  sales_commitment_total: number;
  tb_collection_total: number;
  tb_commitment_total: number;
  emi_collection_total: number;
  grand_total_collections: number;
  grand_total_commitments: number;
}

export interface SalesCollectionResponse {
  report_id: number;
  report_date: string;
  is_submitted: boolean;
  entries: SalesCollectionEntry[];
  totals: FinancialTotals;
}

export interface DashboardSummary {
  period_start: string;
  period_end: string;
  total_reports: number;
  submitted_reports: number;
  total_calls_dialed: number;
  total_calls_connected: number;
  connection_rate_pct: number | null;
  total_call_duration_minutes: number;
  total_meeting_time_minutes: number;
  total_outdoor_visits: number;
  total_indoor_cx: number;
  actual_collection_bdt: number;
  commitments_bdt: number;
  tb_collection_bdt: number;
  tb_commitments_bdt: number;
  emi_collection_bdt: number;
  by_category: Record<string, { dialed: number; connected: number; duration_min: number }>;
  by_slot: Record<string, { dialed: number }>;
}

export interface DailyTarget {
  id: number;
  employee_id: number | null;
  target_date: string | null;
  dialed_calls_target: number | null;
  connected_calls_target: number | null;
  call_duration_minutes_target: number | null;
  outdoor_visits_target: number | null;
  meeting_minutes_target: number | null;
  sales_amount_target: number | null;
  collection_amount_target: number | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSetting {
  id: number;
  namespace: string;
  key: string;
  value: string;
  description?: string | null;
}

export interface ReminderItem {
  id: string;
  type: "follow_up_today" | "follow_up_overdue" | "report_submission" | "commitment_due" | "slot_nudge" | string;
  severity: "urgent" | "warning" | "info";
  title: string;
  message: string;
  client_name?: string | null;
  phone_number?: string | null;
  category?: string | null;
  date?: string | null;
  link?: string | null;
  action_label?: string | null;
}

export interface ReminderSummary {
  total_count: number;
  follow_ups_today_count: number;
  overdue_count: number;
  unsubmitted_report: boolean;
  slot_nudge?: string | null;
}

export interface RemindersResponse {
  summary: ReminderSummary;
  reminders: ReminderItem[];
}
