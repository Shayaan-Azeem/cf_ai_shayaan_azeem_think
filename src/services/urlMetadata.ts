import { invoke } from "@tauri-apps/api/core";

export interface UrlMetadata {
  title: string;
  author: string;
  publication: string;
  url: string;
  domain: string;
  coverUrl: string | null;
  description: string | null;
  publishedAt: string | null;
}

export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  return invoke("fetch_url_metadata", { url });
}
