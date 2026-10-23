"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Banknote,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Lock,
  Receipt,
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
  SALES_CATEGORIES,
  SalesCollectionCategory,
  SalesCollectionEntry,
  Report,
} from "@/types";
import {
  getDhakaToday,
  formatReadableDate,
  formatBDT,
} from "@/lib/utils";

function getPaymentMethodBadge(method?: string | null) {
  if (!method) return <span className="text-slate-400">—</span>;
  const m = method.toLowerCase();
  switch (m) {
    case "cash":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
          💵 Cash
        </span>
      );
    case "cheque":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
          🏦 Cheque
        </span>
      );
    case "bkash":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-pink-50 text-pink-800 border border-pink-200">
          📱 bKash
        </span>
      );
    case "nagad":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-200">
          📱 Nagad
        </span>
      );
    case "rocket":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">
          📱 Rocket
        </span>
      );
    case "bank_transfer":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
          🏛️ Bank Transfer
        </span>
      );
    case "pos":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200">
          💳 POS / Card
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
          {method}
        </span>
      );
  }
}

function SalesVsCollectionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  const today = getDhakaToday();
  const initialDate = searchParams.get("date") || today;
  const targetEmployeeId = searchParams.get("employee_id")
    ? parseInt(searchParams.get("employee_id")!, 10)
    : undefined;
  const [reportDate, setReportDate] = useState<string>(initialDate);

  // Report & entries state
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<SalesCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SalesCollectionEntry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form fields
  const [formCategory, setFormCategory] = useState<SalesCollectionCategory>("new_sales_collection");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCustomerName, setFormCustomerName] = useState<string>("");
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>("cash");
  const [formPaymentSeq, setFormPaymentSeq] = useState<string>("");
  const [formReference, setFormReference] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Load report and transactions
  const loadData = useCallback(async (dateStr: string, empId?: number) => {
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

      const res = await api.sales.get(r.id);
      setEntries(res.entries || []);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load sales and collection entries.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(reportDate, targetEmployeeId);
  }, [reportDate, targetEmployeeId, loadData]);

  // Grouped Calculations
  const calculations = useMemo(() => {
    let actualNewSalesCollection = 0;
    let salesCommitments = 0;
    let tbCollection = 0;
    let tbCommitments = 0;
    let emiCollection = 0;
    let otherCollection = 0;

    for (const e of entries) {
      const amt = Number(e.amount) || 0;
      switch (e.category) {
        case "new_sales_collection":
          actualNewSalesCollection += amt;
          break;
        case "new_sales_commit_payment_1":
        case "new_sales_commit_payment_2":
        case "new_sales_commit_payment_3":
          salesCommitments += amt;
          break;
        case "tb_collection":
          tbCollection += amt;
          break;
        case "tb_commit_payment_1":
        case "tb_commit_payment_2":
        case "tb_commit_payment_3":
          tbCommitments += amt;
          break;
        case "emi_collection":
          emiCollection += amt;
          break;
        case "other_collection":
          otherCollection += amt;
          break;
      }
    }

    const grandTotalActual =
      actualNewSalesCollection + tbCollection + emiCollection + otherCollection;
    const grandTotalCommitments = salesCommitments + tbCommitments;

    return {
      actualNewSalesCollection,
      salesCommitments,
      tbCollection,
      tbCommitments,
      emiCollection,
      otherCollection,
      grandTotalActual,
      grandTotalCommitments,
    };
  }, [entries]);

  const openAddModal = () => {
    setEditingEntry(null);
    setFormCategory("new_sales_collection");
    setFormAmount("");
    setFormCustomerName("");
    setFormPaymentMethod("cash");
    setFormPaymentSeq("");
    setFormReference("");
    setFormNotes("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: SalesCollectionEntry) => {
    setEditingEntry(entry);
    setFormCategory(entry.category);
    setFormAmount(String(entry.amount));
    setFormCustomerName(entry.customer_name || "");
    setFormPaymentMethod(entry.payment_method || "cash");
    setFormPaymentSeq(entry.payment_sequence ? String(entry.payment_sequence) : "");
    setFormReference(entry.reference || "");
    setFormNotes(entry.notes || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report) return;

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Please enter a valid amount greater than 0 BDT.");
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    // Determine is_collection flag from category definition
    const catDef = SALES_CATEGORIES.find((c) => c.key === formCategory);
    const isCollection = catDef?.isCollection ?? false;

    const payload = {
      category: formCategory,
      is_collection: isCollection,
      amount: amt,
      customer_name: formCustomerName.trim() || null,
      payment_method: formPaymentMethod || null,
      payment_sequence: formPaymentSeq ? parseInt(formPaymentSeq, 10) : null,
      reference: formReference.trim() || null,
      notes: formNotes.trim() || null,
    };

    try {
      if (editingEntry) {
        const updated = await api.sales.update(report.id, editingEntry.id, payload);
        setEntries((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        setStatusMessage({
          type: "success",
          text: "Entry updated successfully.",
        });
      } else {
        const created = await api.sales.create(report.id, payload);
        setEntries((prev) => [created, ...prev]);
        setStatusMessage({
          type: "success",
          text: "New sales/collection transaction recorded successfully.",
        });
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save entry. Please try again.");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (entryId: number) => {
    if (!report) return;
    try {
      await api.sales.delete(report.id, entryId);
      setEntries((prev) => prev.filter((item) => item.id !== entryId));
      setDeleteConfirmId(null);
      setStatusMessage({
        type: "success",
        text: "Transaction deleted successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to delete transaction.",
        });
      }
    }
  };

  const isLocked = report?.is_submitted ?? false;

  return (
    <DashboardLayout
      title="Sales & Collection"
      subtitle="Financial accounting separating actual cash receipts from future commitments"
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
                      router.replace(`/sales?date=${e.target.value}${empQuery}`);
                    }}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-green-600 bg-white"
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
                {(!isLocked || isAdmin) && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={openAddModal}
                    disabled={loading}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Record Transaction
                  </Button>
                )}
                {isLocked && !isAdmin && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200 font-medium">
                    <Lock className="w-3.5 h-3.5" />
                    Locked for Edits
                  </div>
                )}
                {isLocked && isAdmin && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-3 py-1.5 rounded border border-amber-300 font-medium">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    Finalized (Admin Override Enabled)
                  </div>
                )}
              </div>
            </div>

            {isLocked && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  This report has been finalized and submitted. Modifying financial records is locked.
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

        {/* ── Financial Split Summary Cards ────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Actual Cash Collected */}
          <Card className="p-4 bg-emerald-50/40 border-emerald-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                Total Actual Collection
              </span>
              <Badge variant="success">Actual Cash</Badge>
            </div>
            <div className="text-2xl font-extrabold text-emerald-800 mt-2">
              {formatBDT(calculations.grandTotalActual)}
            </div>
            <p className="text-[11px] text-emerald-700 mt-1">
              Sales ({formatBDT(calculations.actualNewSalesCollection)}) + TB ({formatBDT(calculations.tbCollection)}) + EMI ({formatBDT(calculations.emiCollection)})
            </p>
          </Card>

          {/* Payment Commitments */}
          <Card className="p-4 bg-amber-50/40 border-amber-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Total Commitments
              </span>
              <Badge variant="warning">Upcoming</Badge>
            </div>
            <div className="text-2xl font-extrabold text-amber-800 mt-2">
              {formatBDT(calculations.grandTotalCommitments)}
            </div>
            <p className="text-[11px] text-amber-700 mt-1">
              Sales ({formatBDT(calculations.salesCommitments)}) + TB ({formatBDT(calculations.tbCommitments)})
            </p>
          </Card>

          {/* Token to Booking (TB) Total */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                TB (Token to Booking)
              </span>
              <Receipt className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-2">
              {formatBDT(calculations.tbCollection)}
            </div>
            <p className="text-[11px] text-slate-600 font-medium mt-1">
              Commitment: {formatBDT(calculations.tbCommitments)}
            </p>
          </Card>

          {/* EMI Collection */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                EMI Installments
              </span>
              <Banknote className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-2">
              {formatBDT(calculations.emiCollection)}
            </div>
            <p className="text-[11px] text-slate-600 font-medium mt-1">
              Strictly counted towards collection
            </p>
          </Card>
        </div>

        {/* ── Transactions Table ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-green-700" />
              Recorded Financial Transactions
            </CardTitle>
            <span className="text-xs text-slate-500">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} recorded
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Amount (BDT)</th>
                  <th className="py-2.5 px-3">Customer Name</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Seq #</th>
                  <th className="py-2.5 px-3">Reference / Notes</th>
                  {(!isLocked || isAdmin) && <th className="py-2.5 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(!isLocked || isAdmin) ? 8 : 7}
                      className="py-10 text-center text-slate-400"
                    >
                      No financial transactions recorded for this day yet.
                      {!isLocked && (
                        <div className="mt-2">
                          <Button size="sm" variant="outline" onClick={openAddModal}>
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Record First Transaction
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => {
                    const catDef = SALES_CATEGORIES.find((c) => c.key === entry.category);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {catDef?.label || entry.category}
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant={entry.is_collection ? "success" : "warning"}>
                            {entry.is_collection ? "Actual Collection" : "Commitment"}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {formatBDT(entry.amount)}
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          {entry.customer_name ? (
                            entry.customer_name.includes(",") ? (
                              <div className="flex flex-wrap gap-1">
                                {entry.customer_name.split(",").map((cName, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-block bg-slate-100 text-slate-800 text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-200"
                                  >
                                    {cName.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="font-medium text-slate-900">{entry.customer_name}</span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {getPaymentMethodBadge(entry.payment_method)}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {entry.payment_sequence ? `#${entry.payment_sequence}` : "—"}
                        </td>
                        <td className="py-3 px-3 text-slate-500 max-w-[200px] truncate">
                          {entry.reference || entry.notes || "—"}
                        </td>
                        {(!isLocked || isAdmin) && (
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditModal(entry)}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(entry.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Add / Edit Transaction Modal ─────────────────────────────────── */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingEntry ? "Edit Financial Transaction" : "Record Financial Transaction"}
          description={`Report date: ${formatReadableDate(reportDate)}`}
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Category *
              </label>
              <select
                value={formCategory}
                onChange={(e) =>
                  setFormCategory(e.target.value as SalesCollectionCategory)
                }
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
              >
                <optgroup label="New Sales">
                  <option value="new_sales_collection">New Sales Collection (Actual)</option>
                  <option value="new_sales_commit_payment_1">CX New Sales Commit Payment 1</option>
                  <option value="new_sales_commit_payment_2">New Sales Commit Payment 2</option>
                  <option value="new_sales_commit_payment_3">New Sales Commit Payment 3</option>
                </optgroup>
                <optgroup label="Token to Booking (TB)">
                  <option value="tb_collection">TB Collection (Actual)</option>
                  <option value="tb_commit_payment_1">TB CX Commit Payment 1</option>
                  <option value="tb_commit_payment_2">TB CX Commit Payment 2</option>
                  <option value="tb_commit_payment_3">TB CX Commit Payment 3</option>
                </optgroup>
                <optgroup label="Other Collections">
                  <option value="emi_collection">EMI Collection (Actual)</option>
                  <option value="other_collection">Other Collection (Actual)</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Amount (BDT) *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold text-xs">
                  ৳
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 50000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded pl-7 pr-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Name(s)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mr. Farhan, Mrs. Sabrina (use comma for multiple)"
                  value={formCustomerName}
                  onChange={(e) => setFormCustomerName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                {formCustomerName.includes(",") && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-600 font-bold self-center mr-1">Joint:</span>
                    {formCustomerName
                      .split(",")
                      .map((n) => n.trim())
                      .filter(Boolean)
                      .map((n, i) => (
                        <span
                          key={i}
                          className="inline-block bg-green-50 text-green-800 border border-green-200 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        >
                          {n}
                        </span>
                      ))}
                  </div>
                )}
              </div>


              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Sequence
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 1, 2, 3"
                  value={formPaymentSeq}
                  onChange={(e) => setFormPaymentSeq(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method *
                </label>
                <select
                  value={formPaymentMethod}
                  onChange={(e) => setFormPaymentMethod(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="cheque">🏦 Cheque</option>
                  <optgroup label="Mobile Banking">
                    <option value="bkash">📱 bKash</option>
                    <option value="nagad">📱 Nagad</option>
                    <option value="rocket">📱 Rocket</option>
                  </optgroup>
                  <optgroup label="Bank & Card">
                    <option value="bank_transfer">🏛️ Online Bank Transfer / BEFTN</option>
                    <option value="pos">💳 POS / Card Payment</option>
                  </optgroup>
                  <option value="other">📝 Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Reference / Slip # / Trx ID
                </label>
                <input
                  type="text"
                  placeholder={
                    formPaymentMethod === "cheque"
                      ? "e.g. Bank name & Cheque #"
                      : formPaymentMethod === "bkash" || formPaymentMethod === "nagad" || formPaymentMethod === "rocket"
                      ? "e.g. Transaction ID / TrxID"
                      : formPaymentMethod === "pos"
                      ? "e.g. POS Card Slip / Approval #"
                      : formPaymentMethod === "bank_transfer"
                      ? "e.g. Bank Name / Transfer Ref"
                      : "MR slip, receipt #, or reference"
                  }
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                placeholder="Additional details..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                disabled={formSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={formSubmitting}>
                {editingEntry ? "Update Transaction" : "Save Transaction"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={deleteConfirmId !== null}
          onClose={() => setDeleteConfirmId(null)}
          title="Confirm Delete Transaction"
          description="Are you sure you want to remove this financial record?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This action will permanently delete this transaction from the daily report.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              >
                Delete Transaction
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

export default function SalesVsCollectionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Sales & Collection...
        </div>
      }
    >
      <SalesVsCollectionContent />
    </Suspense>
  );
}
