import useSWR from "swr";
import type { SWRConfiguration } from "swr";
import { apiFetch } from "@/lib/apiClient";
import type { LocalMemoryStore } from "@/data/progress";

const defaultFetcher = async (url: string) => {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
};

export function useApi<T>(
  path: string | null,
  options?: SWRConfiguration<T>
) {
  return useSWR<T>(path, defaultFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    ...options,
  });
}

export function useMemories() {
  return useApi<{ memories: LocalMemoryStore }>("/api/v1/memories", {
    revalidateOnMount: true,
  });
}
