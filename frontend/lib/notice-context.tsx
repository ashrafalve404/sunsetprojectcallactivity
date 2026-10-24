"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { api } from "@/lib/api";
import { Notice } from "@/types";
import { useAuth } from "@/lib/auth-context";

export interface NoticeContextType {
  notices: Notice[];
  publishedNotices: Notice[];
  unreadNotices: Notice[];
  unreadCount: number;
  pendingReviewCount: number;
  pendingReviewNotices: Notice[];
  markAllAsRead: () => void;
  markOneAsRead: (id: number) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const defaultContext: NoticeContextType = {
  notices: [],
  publishedNotices: [],
  unreadNotices: [],
  unreadCount: 0,
  pendingReviewCount: 0,
  pendingReviewNotices: [],
  markAllAsRead: () => {},
  markOneAsRead: () => {},
  refresh: async () => {},
  loading: false,
};

const NoticeContext = createContext<NoticeContextType>(defaultContext);

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const { user, isSubAdmin, isAdmin } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [lastReadId, setLastReadId] = useState<number>(0);
  const [readIds, setReadIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const storageKey = user
    ? `sunset_notices_last_read_${user.id}`
    : "sunset_notices_last_read";
  const readListKey = user
    ? `sunset_notices_read_ids_${user.id}`
    : "sunset_notices_read_ids";

  // Load read status from localStorage on mount or when user changes
  useEffect(() => {
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
    // Poll every 45s for newly published notices
    const interval = setInterval(fetchNotices, 45000);
    return () => clearInterval(interval);
  }, [fetchNotices]);

  const markAllAsRead = useCallback(() => {
    if (typeof window === "undefined") return;
    setNotices((currentNotices) => {
      const published = currentNotices.filter((n) => n.status === "published");
      const maxId = Math.max(...published.map((n) => n.id), 0);
      const allIds = published.map((n) => n.id);
      setLastReadId(maxId);
      setReadIds(allIds);
      try {
        localStorage.setItem(storageKey, maxId.toString());
        localStorage.setItem(readListKey, JSON.stringify(allIds));
      } catch {
        // ignore
      }
      return currentNotices;
    });
  }, [storageKey, readListKey]);

  const markOneAsRead = useCallback(
    (id: number) => {
      if (typeof window === "undefined") return;
      setReadIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        try {
          localStorage.setItem(readListKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [readListKey]
  );

  const publishedNotices = useMemo(
    () => notices.filter((n) => n.status === "published"),
    [notices]
  );

  const unreadNotices = useMemo(
    () =>
      publishedNotices.filter(
        (n) => n.id > lastReadId && !readIds.includes(n.id)
      ),
    [publishedNotices, lastReadId, readIds]
  );

  const pendingReviewNotices = useMemo(
    () =>
      isSubAdmin || isAdmin
        ? notices.filter((n) => n.status === "pending_approval")
        : [],
    [notices, isSubAdmin, isAdmin]
  );

  const value: NoticeContextType = useMemo(
    () => ({
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
    }),
    [
      notices,
      publishedNotices,
      unreadNotices,
      pendingReviewNotices,
      markAllAsRead,
      markOneAsRead,
      fetchNotices,
      loading,
    ]
  );

  return (
    <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>
  );
}

export function useNoticesBadge(): NoticeContextType {
  return useContext(NoticeContext);
}
