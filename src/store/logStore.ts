import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Task } from "@/types/aip";

interface LogState {
  tasks: Task[];
  addTask: (task: Task) => void;
  clearTasks: () => void;
}

export const useLogStore = create<LogState>()(
  persist(
    (set) => ({
      tasks: [],
      addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
      clearTasks: () => set({ tasks: [] }),
    }),
    {
      name: "aip-task-history",
    }
  )
);
