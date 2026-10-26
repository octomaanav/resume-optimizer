export type StorageMode = "local" | "cloud";
export const cloudStorageAvailable = process.env.NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED === "true";
export function defaultStorageMode(): StorageMode {
  return cloudStorageAvailable && process.env.NEXT_PUBLIC_DEFAULT_STORAGE === "cloud" ? "cloud" : "local";
}
export function withoutApiKeys<T extends { geminiApiKey?: string; groqApiKey?: string }>(settings: T): T {
  return { ...settings, geminiApiKey: "", groqApiKey: "" };
}
