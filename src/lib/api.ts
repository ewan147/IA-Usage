import { invoke } from "@tauri-apps/api/core";
import type { CursorImportResult, MergedUsageResponse } from "./types";

export async function fetchMergedUsage(days: number): Promise<MergedUsageResponse> {
  return invoke<MergedUsageResponse>("get_merged_usage", { days });
}

export async function importCursorCsv(content: string): Promise<CursorImportResult> {
  return invoke<CursorImportResult>("import_cursor_csv", { content });
}

export async function autoImportCursorCsv(): Promise<CursorImportResult | null> {
  return invoke<CursorImportResult | null>("auto_import_cursor_csv");
}

export async function showDashboard(): Promise<void> {
  return invoke("show_dashboard");
}
