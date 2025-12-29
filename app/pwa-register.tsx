"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        // Register once
        const reg = await navigator.serviceWorker.register("/sw.js");
        // Optional: update check
        reg.update?.();
      } catch (e) {
        // Don’t block app if SW fails
        console.error("Service worker registration failed:", e);
      }
    };

    register();
  }, []);

  return null;
}
