import { create } from "zustand";
import type { Task } from "@/types/aip";

interface LogState {
  tasks: Task[];
  addTask: (task: Task) => void;
}

export const useLogStore = create<LogState>()((set) => ({
  tasks: [],
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
}));
