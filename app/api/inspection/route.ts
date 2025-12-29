import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

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

function safeFolderName(name: string) {
  return (name || "Store")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .slice(0, 80);
}

async function getOrCreateStoreFolderId(
  drive: any,
  parentFolderId: string,
  storeName: string
) {
  const folderName = safeFolderName(storeName);

  // Look for existing folder
  const found = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existingId = found.data.files?.[0]?.id;
  if (existingId) return existingId;

  // Create folder
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const newId = created.data.id;
  if (!newId) throw new Error("Failed to create store folder (missing id)");
  return newId;
}

async function uploadToDrive(file: File, storeName: string) {
  const auth = getAuth(["https://www.googleapis.com/auth/drive"]);
  const drive = google.drive({ version: "v3", auth });

  const parentFolderId = env("DRIVE_INTAKE_FOLDER_ID");
  const storeFolderId = await getOrCreateStoreFolderId(
    drive,
    parentFolderId,
    storeName
  );

  const safeStore = safeFolderName(storeName);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${safeStore} - ${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // IMPORTANT: googleapis expects a stream body (pipeable)
  const stream = Readable.from(buffer);

  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [storeFolderId],
    },
    media: {
      mimeType: file.type || "image/jpeg",
      body: stream as any,
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive upload failed (missing file ID)");

  const link =
    created.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  // NOTE:
  // Do NOT try to change permissions here for Shared Drives.
  // It often throws "cannotModifyInheritedPermission" and breaks the request.
  // Sharing is controlled at the Shared Drive / folder level.

  return { link, filename };
}

async function appendToSheet(row: any[]) {
  const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = env("SPREADSHEET_ID");
  const sheetName = env("SHEET_NAME");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:I`, // your sheet has A..I headers
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

    let photoCell = "";
    if (photo && photo.size > 0) {
      const { link, filename } = await uploadToDrive(photo, storeName);

      // Shows filename in the sheet, but it's clickable (best of both worlds)
      // This also tends to play nicer with sheet triggers than a raw URL string.
      photoCell = `=HYPERLINK("${link}","${filename}")`;
    }

    // A: Store Name
    // B: Store Address
    // C: Item Type
    // D: Level
    // E: Notes
    // F: Photo
    // G/H/I internal columns (leave blank unless you’re using them)
    await appendToSheet([
      storeName,
      storeAddress,
      itemType,
      Number(level),
      notes,
      photoCell,
      "",
      "",
      "",
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
