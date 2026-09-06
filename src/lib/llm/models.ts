import type { AppConfig } from "@/lib/config/app-config";
import { makeChatProvider } from "@/lib/config/clients";

/** Model ids the configured provider reports, or [] when unconfigured / unanswered. */
export async function listModels(cfg: AppConfig, fetchImpl?: typeof fetch): Promise<string[]> {
  const provider = makeChatProvider(cfg, fetchImpl);
  if (!provider) return [];
  return provider.listModels();
}
