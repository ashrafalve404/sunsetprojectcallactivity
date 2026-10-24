"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  UserCheck,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
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
  Skeleton,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { User, UserRole } from "@/types";
import { formatReadableDate } from "@/lib/utils";

export default function EmployeesPage() {
  const { user: currentUser } = useAuth();

  const [employees, setEmployees] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Debounce search input for backend query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("employee");
  const [isActive, setIsActive] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const activeParam =
        statusFilter === "all" ? undefined : statusFilter === "active";
      const roleParam = roleFilter === "all" ? undefined : roleFilter;

      const data = await api.employees.list({
        search: debouncedSearch.trim() || undefined,
        role: roleParam,
        is_active: activeParam,
      });
      setEmployees(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load employee accounts.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Instant client-side filter fallback so typing has 0ms perceived latency
  const displayedEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter(
      (emp) =>
        emp.full_name?.toLowerCase().includes(q) ||
        emp.username?.toLowerCase().includes(q) ||
        emp.email?.toLowerCase().includes(q)
    );
  }, [employees, search]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setFullName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setRole("employee");
    setIsActive(true);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (emp: User) => {
    setEditingEmployee(emp);
    setFullName(emp.full_name);
    setEmail(emp.email);
    setUsername(emp.username);
    setPassword("");
    setRole(emp.role);
    setIsActive(emp.is_active);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    try {
      if (editingEmployee) {
        const payload: {
          full_name: string;
          email: string;
          role: UserRole;
          is_active: boolean;
          password?: string;
        } = {
          full_name: fullName.trim(),
          email: email.trim(),
          role,
          is_active: isActive,
        };
        if (password.trim()) {
          payload.password = password.trim();
        }

        const updated = await api.employees.update(editingEmployee.id, payload);
        setEmployees((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        setStatusMessage({
          type: "success",
          text: `Employee account "${updated.full_name}" updated successfully.`,
        });
      } else {
        if (!password.trim()) {
          setFormError("Password is required when creating a new employee.");
          setFormSubmitting(false);
          return;
        }
        const created = await api.employees.create({
          full_name: fullName.trim(),
          email: email.trim(),
          username: username.trim(),
          password: password.trim(),
          role,
        });
        setEmployees((prev) => [created, ...prev]);
        setStatusMessage({
          type: "success",
          text: `New employee "${created.full_name}" added successfully.`,
        });
      }
      setIsCreateOpen(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save employee. Please try again.");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (empId: number) => {
    try {
      await api.employees.delete(empId);
      setEmployees((prev) => prev.filter((item) => item.id !== empId));
      setDeleteConfirmId(null);
      setStatusMessage({
        type: "success",
        text: "Employee account deleted successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to delete employee account.",
        });
      }
    }
  };

  return (
    <DashboardLayout
      title="Employee Management"
      subtitle="Manage corporate staff accounts, roles, access permissions, and activity"
      adminOnly
    >
      <div className="space-y-6">
        {/* ── Action and Search Bar ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Search */}
                <div className="relative min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by name, username or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-500 border border-slate-300 rounded focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Role filter */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span className="font-semibold text-slate-700">Role:</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Roles</option>
                    <option value="employee">Employee</option>
                    <option value="sub_admin">Sub Admin</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span className="font-semibold text-slate-700">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                  </select>
                </div>
              </div>

              <Button variant="primary" size="sm" onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Employee
              </Button>
            </div>
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

        {/* ── Employee List Table ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-green-700" />
              Staff Accounts Directory
            </CardTitle>
            <span className="text-xs text-slate-500">
              {displayedEmployees.length} {displayedEmployees.length === 1 ? "account" : "accounts"}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-4">Full Name</th>
                  <th className="py-2.5 px-3">Username</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3 text-center">Role</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Member Since</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && employees.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-36" /></td>
                      <td className="py-3 px-3 text-center"><Skeleton className="h-4 w-16 mx-auto" /></td>
                      <td className="py-3 px-3 text-center"><Skeleton className="h-4 w-14 mx-auto" /></td>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    </tr>
                  ))
                ) : displayedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No employees match your search criteria.
                    </td>
                  </tr>
                ) : (
                  displayedEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {emp.full_name}
                        {currentUser?.id === emp.id && (
                          <span className="ml-1.5 text-[10px] text-green-800 bg-green-50 px-1.5 py-0.5 rounded font-normal">
                            (You)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                        @{emp.username}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{emp.email}</td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={emp.role === "admin" ? "warning" : emp.role === "sub_admin" ? "info" : "neutral"}>
                          {emp.role === "admin" ? "Admin" : emp.role === "sub_admin" ? "Sub Admin" : "Employee"}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            emp.is_active ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {emp.is_active ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              Inactive
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {formatReadableDate(emp.created_at.slice(0, 10))}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {currentUser?.id !== emp.id && (
                            <button
                              onClick={() => setDeleteConfirmId(emp.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Delete Employee"
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

        {/* ── Create / Edit Employee Modal ─────────────────────────────────── */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title={editingEmployee ? `Edit ${editingEmployee.full_name}` : "Create New Employee"}
          description="Enter employee details and access permissions"
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Shakil Ahmed"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingEmployee}
                  placeholder="e.g. shakil"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="shakil@sunsetgroup.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {editingEmployee ? "Reset Password (Optional)" : "Password *"}
              </label>
              <input
                type="password"
                placeholder={editingEmployee ? "Leave blank to keep unchanged" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                >
                  <option value="employee">Employee</option>
                  <option value="sub_admin">Sub Admin</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {editingEmployee && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Account Status
                  </label>
                  <select
                    value={isActive ? "active" : "inactive"}
                    onChange={(e) => setIsActive(e.target.value === "active")}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={formSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={formSubmitting}>
                {editingEmployee ? "Update Employee" : "Create Account"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={deleteConfirmId !== null}
          onClose={() => setDeleteConfirmId(null)}
          title="Confirm Delete Employee"
          description="Are you sure you want to remove this staff account?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Deleting an employee account will remove their access to the Sunset Group dashboard.
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
                Delete Account
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
