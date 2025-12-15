import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { setUnauthorizedHandler } from "@/lib/apiFetch";

export function AppBootstrap() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Clear auth cache
      queryClient.setQueryData(["auth", "user"], null);

      // Redirect to login
      setLocation("/login");
    });
  }, [queryClient, setLocation]);

  return null;
}
