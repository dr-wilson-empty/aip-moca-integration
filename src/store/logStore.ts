import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signedFetch } from "@/lib/auth/signed-fetch";
import type { Task } from "@/types/aip";

interface LogState {
  tasks: Task[];
  loaded: boolean;
  addTask: (task: Task) => void;
  clearTasks: () => void;
  loadFromServer: (address: string) => Promise<void>;
}

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      tasks: [],
      loaded: false,
      addTask: (task) => set((s) => ({
        tasks: [task, ...s.tasks.filter((t) => t.id !== task.id)],
      })),
      clearTasks: () => set({ tasks: [] }),
      loadFromServer: async (address: string) => {
        try {
          const res = await signedFetch(`/api/tasks/history?address=${address}`);
          if (!res.ok) return;
          const data = await res.json();
          const serverTasks = (data.tasks ?? []) as Task[];
          const local = get().tasks;
          // Merge: server tasks + local tasks not in server
          const serverIds = new Set(serverTasks.map((t) => t.id));
          const merged = [
            ...serverTasks,
            ...local.filter((t) => !serverIds.has(t.id)),
          ].sort((a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          );
          set({ tasks: merged, loaded: true });
        } catch {
          set({ loaded: true });
        }
      },
    }),
    { name: "aip-task-history" }
  )
);
