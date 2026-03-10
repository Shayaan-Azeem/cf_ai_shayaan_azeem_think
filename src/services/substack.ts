import { invoke } from "@tauri-apps/api/core";
import type { UrlMetadata } from "./urlMetadata";

export type SubstackArticleResult = UrlMetadata;

export async function fetchSubstackUrl(
  url: string,
): Promise<SubstackArticleResult> {
  return invoke("fetch_substack_url", { url });
}
