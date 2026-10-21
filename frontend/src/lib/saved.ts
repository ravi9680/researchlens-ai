import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/** Saved-paper state backed by the backend (`saved_papers` table) rather than
 *  localStorage, so bookmarks survive a device change and stay per-user. */
export function useSaved() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["saved-papers"], queryFn: api.savedPapers });

  const ids: string[] = (q.data as any[] || []).map((p: any) => p.id);
  const papers: any[] = (q.data as any[] || []);

  const toggle = useMutation({
    mutationFn: (id: string) => api.savePaper(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-papers"] });
    },
  });

  return {
    ids,
    papers,
    isSaved: (id: string) => ids.includes(id),
    toggle: (id: string) => toggle.mutate(id),
    isLoading: q.isLoading,
    error: q.error as any,
  };
}
