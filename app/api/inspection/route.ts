import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

/* ---------- ENV ---------- */
function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/* ---------- AUTH ---------- */
function getAuth(scopes: string[]) {
  return new google.auth.JWT({
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: env("GOOGLE_SERVICE_ACCOUNT_KEY").replace(/\\n/g, "\n"),
    scopes,
  });
}

/* ---------- DRIVE UPLOAD ---------- */
async function uploadToDrive(file: File, storeName: string) {
  const auth = getAuth(["https://www.googleapis.com/auth/drive"]);
  const drive = google.drive({ version: "v3", auth });

  const parentFolderId = env("DRIVE_INTAKE_FOLDER_ID").trim();

  const safeStore = storeName.replace(/[^\w\s-]/g, "").trim() || "Store";
  const timestamp = Date.now();
  const ext = file.name.split(".").pop() || "jpg";
  const fileName = `${safeStore} - ${timestamp}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
    },
    media: {
      mimeType: file.type || "image/jpeg",
      body: buffer,
    },
    fields: "id",
  });

  if (!res.data.id) throw new Error("Drive upload failed");

  // IMPORTANT:
  // Do NOT modify permissions on Shared Drives
  // Use inherited permissions only

  return {
    fileId: res.data.id,
    fileName,
    link: `https://drive.google.com/file/d/${res.data.id}/view`,
  };
}

/* ---------- SHEETS APPEND ---------- */
async function appendToSheet(row: any[]) {
  const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = env("SPREADSHEET_ID").trim();
  const sheetName = env("SHEET_NAME").trim(); // CRITICAL FIX

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row],
    },
  });
}

/* ---------- API ---------- */
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const storeName = String(form.get("storeName") || "").trim();
    const storeAddress = String(form.get("storeAddress") || "").trim();
    const itemType = String(form.get("itemType") || "").trim();
    const level = Number(form.get("level") || 0);
    const notes = String(form.get("notes") || "").trim();
    const photo = form.get("photo") as File | null;

    if (!storeName || !itemType || !level) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    let photoCell = "";

    if (photo && photo.size > 0) {
      const uploaded = await uploadToDrive(photo, storeName);

      // This is IMPORTANT for your quote trigger:
      // Sheet sees a clickable filename, not just a raw URL
      photoCell = `=HYPERLINK("${uploaded.link}","${uploaded.fileName}")`;
    }

    // Columns A–I match your Inspection Sheet exactly
    await appendToSheet([
      storeName,        // A Store Name
      storeAddress,     // B Store Address
      itemType,         // C Item Type
      level,            // D Level
      notes,            // E Notes
      photoCell,        // F Photo (trigger column)
      "",               // G Internal Brand
      "",               // H Internal Measurement
      "",               // I Internal Notes
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      {
        error: "Failed to submit inspection",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
