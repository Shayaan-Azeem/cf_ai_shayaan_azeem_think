const STORAGE_KEY = "think-chat-threads";

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatThread[];
  } catch {
    return [];
  }
}

function saveThreads(threads: ChatThread[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

export function createThread(title?: string): ChatThread {
  const thread: ChatThread = {
    id: crypto.randomUUID(),
    title: title || "New chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const threads = loadThreads();
  threads.unshift(thread);
  saveThreads(threads);
  return thread;
}

export function updateThreadTitle(id: string, title: string) {
  const threads = loadThreads();
  const thread = threads.find((t) => t.id === id);
  if (thread) {
    thread.title = title;
    thread.updatedAt = Date.now();
    saveThreads(threads);
  }
}

export function touchThread(id: string) {
  const threads = loadThreads();
  const thread = threads.find((t) => t.id === id);
  if (thread) {
    thread.updatedAt = Date.now();
    threads.sort((a, b) => b.updatedAt - a.updatedAt);
    saveThreads(threads);
  }
}

export function deleteThread(id: string) {
  const threads = loadThreads().filter((t) => t.id !== id);
  saveThreads(threads);
}
