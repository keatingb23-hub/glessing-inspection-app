"use client";

import { useMemo, useState } from "react";

const ITEM_TYPES = [
  "Display Case Gasket",
  "Under Counter Gasket",
  "Upright Gasket",
  "Walk In Gasket",
  "Hold Open",
  "Bumper",
  "Electrical Cover",
  "Torque Rod",
  "Torque Master",
  "Door Hinge",
  "Door Sweep",
  "Replacement Door",
];

export default function Page() {
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [itemType, setItemType] = useState("");
  const [level, setLevel] = useState<"" | "1" | "2" | "3">("");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  const canSubmit = useMemo(() => storeName.trim() && itemType && level, [storeName, itemType, level]);

  async function submit() {
    setStatus("saving");
    setMsg("");

    try {
      const fd = new FormData();
      fd.append("storeName", storeName);
      fd.append("storeAddress", storeAddress);
      fd.append("itemType", itemType);
      fd.append("level", level);
      fd.append("notes", notes);
      if (photoFile) fd.append("photo", photoFile);

      const res = await fetch("/api/inspection", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Submit failed");

      setStatus("ok");
      setMsg("Saved ✔");

      // keep store fields, clear the line item fields
      setItemType("");
      setLevel("");
      setNotes("");
      setPhotoFile(null);
    } catch (e: any) {
      setStatus("err");
      setMsg(e?.message || "Error");
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", background: "white", borderRadius: 16, padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.08)" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Inspection Entry</h1>
        <p style={{ marginTop: 6, color: "#475569" }}>
          Mobile form → writes to your Inspection Sheet → your quote automation runs as usual.
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div>
            <label style={{ fontWeight: 700 }}>Store Name *</label>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g., Metro #83"
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 700 }}>Store Address</label>
            <input
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
              placeholder="123 Main St"
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 700 }}>Item Type *</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid #cbd5e1" }}
            >
              <option value="">Select…</option>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontWeight: 700 }}>Level *</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["1", "2", "3"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLevel(v)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    background: level === v ? "#0f172a" : "white",
                    color: level === v ? "white" : "#0f172a",
                    fontWeight: 800,
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 700 }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional…"
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 700 }}>Photo</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              style={{ width: "100%", marginTop: 6 }}
            />
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
              Taps the camera on mobile. Uploads to Drive and links back into the sheet.
            </div>
          </div>

          <button
            type="button"
            disabled={!canSubmit || status === "saving"}
            onClick={submit}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 14,
              border: "none",
              background: "#0f172a",
              color: "white",
              fontWeight: 900,
              opacity: !canSubmit || status === "saving" ? 0.6 : 1,
            }}
          >
            {status === "saving" ? "Saving…" : "Save Item"}
          </button>

          {msg ? (
            <div style={{
              padding: 12,
              borderRadius: 12,
              background: status === "ok" ? "#dcfce7" : status === "err" ? "#fee2e2" : "#f1f5f9",
              color: status === "ok" ? "#166534" : status === "err" ? "#991b1b" : "#0f172a",
              fontWeight: 700
            }}>
              {msg}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
