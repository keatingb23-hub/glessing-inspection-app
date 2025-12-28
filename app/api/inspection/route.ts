import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

export const runtime = "nodejs";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v.trim(); // important: avoids hidden newline issues
}

function getAuth(scopes: string[]) {
  const email = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = env("GOOGLE_SERVICE_ACCOUNT_KEY").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes,
  });
}

async function getDriveClient() {
  const auth = getAuth(["https://www.googleapis.com/auth/drive"]);
  return google.drive({ version: "v3", auth });
}

async function getSheetsClient() {
  const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  return google.sheets({ version: "v4", auth });
}

// Finds (or creates) a store subfolder under your DRIVE_INTAKE_FOLDER_ID
async function getOrCreateStoreFolderId(drive: any, parentFolderId: string, storeName: string) {
  const safeStore = (storeName || "Store")
    .replace(/[^\w\s-]/g, "")
    .trim();

  // IMPORTANT for Shared Drives
  const listRes = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${safeStore}' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const existing = listRes.data.files?.[0];
  if (existing?.id) return existing.id;

  const createRes = await drive.files.create({
    requestBody: {
      name: safeStore,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!createRes.data.id) throw new Error("Failed to create store folder");
  return createRes.data.id;
}

async function uploadToDrive(file: File, storeName: string) {
  const drive = await getDriveClient();

  const parentFolderId = env("DRIVE_INTAKE_FOLDER_ID");
  const storeFolderId = await getOrCreateStoreFolderId(drive, parentFolderId, storeName);

  const safeStore = (storeName || "Store").replace(/[^\w\s-]/g, "").trim();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${safeStore} - ${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Drive expects a STREAM (this fixes: t.body.pipe is not a function)
  const mediaBody = Readable.from(buffer);

  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [storeFolderId],
    },
    media: {
      mimeType: file.type || "image/jpeg",
      body: mediaBody,
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive upload failed (missing file ID)");

  // IMPORTANT:
  // We DO NOT set "anyone with link" permissions here.
  // Shared Drives often block per-file permission changes (your error).
  // Instead, make the parent folder shareable once in Drive settings.

  const link =
    created.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  return link;
}

async function appendToSheet(row: any[]) {
  const sheets = await getSheetsClient();

  const spreadsheetId = env("SPREADSHEET_ID");
  const sheetName = env("SHEET_NAME"); // must match the TAB name exactly

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:F`,
    valueInputOption: "USER_ENTERED",
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

    let photoUrl = "";
    if (photo && photo.size > 0) {
      photoUrl = await uploadToDrive(photo, storeName);
    }

    // A Store Name | B Store Address | C Item Type | D Level | E Notes | F Photo
    await appendToSheet([
      storeName,
      storeAddress,
      itemType,
      Number(level),
      notes,
      photoUrl,
    ]);

    return NextResponse.json({ ok: true, photoUrl });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to submit inspection.", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
