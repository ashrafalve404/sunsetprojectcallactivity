"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Notice } from "@/types";
import { useAuth } from "@/lib/auth-context";

export function useNoticesBadge() {
  const { user, isSubAdmin, isAdmin } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [lastReadId, setLastReadId] = useState<number>(0);
  const [readIds, setReadIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const storageKey = user ? `sunset_notices_last_read_${user.id}` : "sunset_notices_last_read";
  const readListKey = user ? `sunset_notices_read_ids_${user.id}` : "sunset_notices_read_ids";

  const loadLocalState = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const storedLast = localStorage.getItem(storageKey);
      if (storedLast) setLastReadId(parseInt(storedLast, 10) || 0);

      const storedList = localStorage.getItem(readListKey);
      if (storedList) setReadIds(JSON.parse(storedList));
    } catch {
      // ignore
    }
  }, [storageKey, readListKey]);

  useEffect(() => {
    loadLocalState();
  }, [loadLocalState]);

  const fetchNotices = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await api.notices.list();
      setNotices(data || []);
    } catch {
      // ignore network errors silently
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotices();
    // Refresh notices badge periodically (every 45s)
    const interval = setInterval(fetchNotices, 45000);
    const handleSync = () => loadLocalState();
    window.addEventListener("sunset_notices_read", handleSync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("sunset_notices_read", handleSync);
    };
  }, [fetchNotices, loadLocalState]);

  const markAllAsRead = useCallback(() => {
    if (typeof window === "undefined" || notices.length === 0) return;
    const published = notices.filter((n) => n.status === "published");
    const maxId = Math.max(...published.map((n) => n.id), 0);
    const allIds = published.map((n) => n.id);
    setLastReadId(maxId);
    setReadIds(allIds);
    try {
      localStorage.setItem(storageKey, maxId.toString());
      localStorage.setItem(readListKey, JSON.stringify(allIds));
      window.dispatchEvent(new Event("sunset_notices_read"));
    } catch {
      // ignore
    }
  }, [notices, storageKey, readListKey]);

  const markOneAsRead = useCallback(
    (id: number) => {
      if (typeof window === "undefined") return;
      setReadIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        try {
          localStorage.setItem(readListKey, JSON.stringify(next));
          window.dispatchEvent(new Event("sunset_notices_read"));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [readListKey]
  );

  const publishedNotices = notices.filter((n) => n.status === "published");
  const unreadNotices = publishedNotices.filter(
    (n) => n.id > lastReadId && !readIds.includes(n.id)
  );

  const pendingReviewNotices =
    isSubAdmin || isAdmin
      ? notices.filter((n) => n.status === "pending_approval")
      : [];

  return {
    notices,
    publishedNotices,
    unreadNotices,
    unreadCount: unreadNotices.length,
    pendingReviewCount: pendingReviewNotices.length,
    pendingReviewNotices,
    markAllAsRead,
    markOneAsRead,
    refresh: fetchNotices,
    loading,
  };
}
