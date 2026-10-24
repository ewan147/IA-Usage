import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WidgetApp } from "./WidgetApp";
import "./widget.css";

async function forceTransparentBg() {
  try {
    // Alpha 0 is required on Windows WebView2 for real transparency.
    await getCurrentWindow().setBackgroundColor([0, 0, 0, 0]);
  } catch {
    // Older API / capability missing — Rust side still sets WebView2 color.
  }
}

void forceTransparentBg();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WidgetApp />
  </React.StrictMode>,
);
