import { create } from "zustand";
import type { Task } from "@/types/aip";
import { MOCK_TASKS } from "@/lib/mock/tasks";

interface LogState {
  tasks: Task[];
  addTask: (task: Task) => void;
}

export const useLogStore = create<LogState>()((set) => ({
  tasks: MOCK_TASKS,
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
}));
