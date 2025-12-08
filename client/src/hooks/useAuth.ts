// hooks/useAuth.ts
import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
}

export function useAuth() {
  const { data, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth", "user"],
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/auth/user", {
        credentials: "include",
      });

      if (res.status === 401) {
        // Not logged in
        return null;
      }

      if (!res.ok) {
        throw new Error("Failed to fetch auth user");
      }

      return res.json();
    },
  });

  return {
    user: data,
    isLoading,
    isAuthenticated: !!data,
  };
}
