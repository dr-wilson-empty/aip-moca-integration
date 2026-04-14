import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signedFetch } from "@/lib/auth/signed-fetch";
import type { Task } from "@/types/aip";

interface LogState {
  tasks: Task[];
  loaded: boolean;
  /** Which wallet the current tasks belong to */
  loadedAddress: string | null;
  addTask: (task: Task) => void;
  clearTasks: () => void;
  loadFromServer: (address: string) => Promise<void>;
}

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      tasks: [],
      loaded: false,
      loadedAddress: null,
      addTask: (task) => set((s) => ({
        tasks: [task, ...s.tasks.filter((t) => t.id !== task.id)],
      })),
      clearTasks: () => set({ tasks: [], loaded: false, loadedAddress: null }),
      loadFromServer: async (address: string) => {
        // Wallet changed — clear stale data from previous wallet
        if (get().loadedAddress && get().loadedAddress !== address) {
          set({ tasks: [], loaded: false, loadedAddress: null });
        }
        try {
          const res = await signedFetch(`/api/tasks/history?address=${address}`);
          if (!res.ok) return;
          const data = await res.json();
          const serverTasks = (data.tasks ?? []) as Task[];
          // Only merge local tasks that belong to the same fetch cycle
          const local = get().loadedAddress === address ? get().tasks : [];
          const serverIds = new Set(serverTasks.map((t) => t.id));
          const merged = [
            ...serverTasks,
            ...local.filter((t) => !serverIds.has(t.id)),
          ].sort((a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          );
          set({ tasks: merged, loaded: true, loadedAddress: address });
        } catch {
          set({ loaded: true, loadedAddress: address });
        }
      },
    }),
    { name: "aip-task-history" }
  )
);
