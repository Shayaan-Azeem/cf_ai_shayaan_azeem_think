import { invoke } from "@tauri-apps/api/core";

export interface BookSearchResult {
  title: string;
  author: string;
  coverUrl: string | null;
  workKey: string;
  year: number | null;
}

export async function searchBooks(
  query: string,
  limit = 8,
): Promise<BookSearchResult[]> {
  return invoke("search_books", { query, limit });
}
