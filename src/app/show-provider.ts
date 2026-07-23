import { maskSecret } from "../domain/providers";
import { readProviderRecord } from "../storage/providers-repo";
import { CommandResult } from "./types";

/**
 * Returns a single provider record, with text-mode callers able to use a masked preview.
 */
export function showProvider(args: { providersPath: string; providerName: string; includeSecret: boolean }): CommandResult {
  const provider = readProviderRecord(args.providersPath, args.providerName);
  return {
    data: {
      providerName: args.providerName,
      provider: args.includeSecret
        ? provider
        : {
            ...provider,
            apiKey: maskSecret(provider.apiKey),
          },
    },
  };
}
