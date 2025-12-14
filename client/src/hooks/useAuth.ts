// hooks/useAuth.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export type AuthUser = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
};

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth", "user"],
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch auth user");
      return res.json();
    },
  });

  const logout = async () => {
    // Call backend logout to destroy passport session
    await fetch("/api/logout", { credentials: "include" });

    // Clear cached auth user so PrivateRoute re-renders to Login
    await queryClient.invalidateQueries({ queryKey: ["auth", "user"] });

    // Navigate to login route
    setLocation("/login");
  };

  return {
    user: data,
    isLoading,
    isAuthenticated: !!data,
    logout,
  };
}
