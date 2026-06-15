import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "../context/AuthContext";

// Shared read-only catalog data (categories, tags, cuisines, ingredients).
// Cached generously since taxonomy changes rarely.
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories().then((r) => r.items),
    staleTime: 5 * 60_000,
  });
}
export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: () => api.tags().then((r) => r.items),
    staleTime: 5 * 60_000,
  });
}
export function useCuisines() {
  return useQuery({
    queryKey: ["cuisines"],
    queryFn: () => api.cuisines().then((r) => r.items),
    staleTime: 5 * 60_000,
  });
}
export function useIngredients(basicOnly?: boolean) {
  return useQuery({
    queryKey: ["ingredients", basicOnly ?? false],
    queryFn: () => api.ingredients(basicOnly).then((r) => r.items),
    staleTime: 5 * 60_000,
  });
}

// Notification unread count for the nav badge.
export function useUnreadCount() {
  const { isRegistered } = useAuth();
  return useQuery({
    queryKey: ["notifications", "unreadCount"],
    queryFn: () => api.notifications(true).then((r) => r.unreadCount),
    enabled: isRegistered,
    refetchInterval: 60_000,
  });
}
