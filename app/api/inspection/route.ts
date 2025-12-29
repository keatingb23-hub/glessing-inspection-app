import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "node:stream";

export const runtime = "nodejs";

/* ---------- ENV HELPERS ---------- */
function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function cleanSheetName(raw: string) {
  // Removes hidden newlines/carriage returns that break ranges
  return raw.replace(/[\r\n]+/g, "").trim();
}

function makeA1Range(sheetNameRaw: string, a1: string) {
  const sheetName = cleanSheetName(sheetNameRaw);
  // Escape single quotes for A1 notation: ' becomes ''
  const escaped = sheetName.replace(/'/g, "''");
  // Wrap in single quotes to safely handle spaces/special chars
  return `'${escaped}'!${a1}`;
}

/* ---------- AUTH ---------- */
function getAuth(scopes: string[]) {
  return new google.auth.JWT({
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL").trim(),
    key: env("GOOGLE_SERVICE_ACCOUNT_KEY").replace(/\\n/g, "\n"),
    scopes,
  });
}

/* ---------- DRIVE UPLOAD (Shared Drive safe) ---------- */
async function uploadToDrive(file: File, storeName: string) {
  const auth = getAuth(["https://www.googleapis.com/auth/drive"]);
  const drive = google.drive({ version: "v3", auth });

  const parentFolderId = env("DRIVE_INTAKE_FOLDER_ID").trim();

  const safeStore = (storeName || "Store").replace(/[^\w\s-]/g, "").trim();
  const ts = Date.now();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const fileName = `${safeStore} - ${ts}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
    },
    media: {
      mimeType: file.type || "image/jpeg",
      body: Readable.from(buffer), // avoids body.pipe issues in some runtimes
    },
    fields: "id",
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive upload failed (missing file ID)");

  // Do NOT modify permissions on Shared Drive items (causes inherited permission errors)
  const link = `https://drive.google.com/file/d/${fileId}/view`;

  return { fileId, fileName, link };
}

/* ---------- SHEETS APPEND ---------- */
async function appendToSheet(row: any[]) {
  const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = env("SPREADSHEET_ID").trim();
  const sheetNameRaw = env("SHEET_NAME"); // we'll sanitize/quote inside makeA1Range

  const range = makeA1Range(sheetNameRaw, "A:I");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

/* ---------- API ---------- */
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const storeName = String(form.get("storeName") || "").trim();
    const storeAddress = String(form.get("storeAddress") || "").trim();
    const itemType = String(form.get("itemType") || "").trim();
    const levelRaw = String(form.get("level") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const photo = form.get("photo") as File | null;

    const level = Number(levelRaw);

    if (!storeName || !itemType || !Number.isFinite(level) || level <= 0) {
      return NextResponse.json(
        { error: "Store Name, Item Type, and Level are required." },
        { status: 400 }
      );
    }

    let photoCell = "";

    if (photo && photo.size > 0) {
      const uploaded = await uploadToDrive(photo, storeName);
      // Keep your trigger behavior: Photo column gets a clickable name
      photoCell = `=HYPERLINK("${uploaded.link}","${uploaded.fileName}")`;
    }

    // A–I matches your sheet columns
    await appendToSheet([
      storeName,     // A
      storeAddress,  // B
      itemType,      // C
      level,         // D
      notes,         // E
      photoCell,     // F
      "",            // G (Internal Brand)
      "",            // H (Internal Measurement)
      "",            // I (Internal Notes)
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to submit inspection.", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
