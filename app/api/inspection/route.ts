import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getAuth(scopes: string[]) {
  const email = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = env("GOOGLE_SERVICE_ACCOUNT_KEY").replace(/\\n/g, "\n");
  return new google.auth.JWT({ email, key, scopes });
}

function cleanName(input: string) {
  return (input || "Store")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function uploadToDrive(file: File, storeName: string) {
  const auth = getAuth(["https://www.googleapis.com/auth/drive"]);
  const drive = google.drive({ version: "v3", auth });

  const folderId = env("DRIVE_INTAKE_FOLDER_ID");

  const safeStore = cleanName(storeName);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${safeStore} - ${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const created = await drive.files.create({
    supportsAllDrives: true, // IMPORTANT for Shared Drives
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: file.type || "image/jpeg",
      body: buffer as any,
    },
    fields: "id, webViewLink",
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive upload failed (missing file ID)");

  // NOTE:
  // Do NOT change permissions here. Shared Drives often inherit permissions
  // and Drive will throw "cannotModifyInheritedPermission".
  // Keep your Shared Drive / folder sharing settings as the source of truth.

  const link =
    created.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  return { link, filename };
}

async function appendToSheet(row: any[]) {
  const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = env("SPREADSHEET_ID");
  const sheetName = env("SHEET_NAME");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`, // your sheet has A-I headers in your screenshot
    valueInputOption: "USER_ENTERED", // allows formulas like HYPERLINK()
    requestBody: { values: [row] },
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const storeName = String(form.get("storeName") || "").trim();
    const storeAddress = String(form.get("storeAddress") || "").trim();
    const itemType = String(form.get("itemType") || "").trim();
    const level = String(form.get("level") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const photo = form.get("photo") as File | null;

    if (!storeName || !itemType || !level) {
      return NextResponse.json(
        { error: "Store Name, Item Type, and Level are required." },
        { status: 400 }
      );
    }

    // PHOTO CELL VALUE (Column F)
    // If photo uploaded: put clickable filename instead of raw URL
    let photoCell = "";
    if (photo && photo.size > 0) {
      const { link, filename } = await uploadToDrive(photo, storeName);

      // Escape quotes for Sheets formula safety
      const safeFilename = filename.replace(/"/g, '""');
      const safeLink = link.replace(/"/g, "%22");

      photoCell = `=HYPERLINK("${safeLink}","${safeFilename}")`;
    }

    // Your sheet columns (from screenshot):
    // A Store Name | B Store Address | C Item Type | D Level | E Notes | F Photo
    // G (Internal) Brand | H (Internal) Measurement | I (Internal) Notes
    await appendToSheet([
      storeName, // A
      storeAddress, // B
      itemType, // C
      Number(level), // D
      notes, // E
      photoCell, // F
      "", // G
      "", // H
      "", // I
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      {
        error: "Failed to submit inspection.",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
