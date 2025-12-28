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

async function uploadToDrive(file: File, storeName: string) {
  const auth = getAuth(["https://www.googleapis.com/auth/drive"]);
  const drive = google.drive({ version: "v3", auth });

  const folderId = env("DRIVE_INTAKE_FOLDER_ID");

  const safeStore = (storeName || "Store").replace(/[^\w\s-]/g, "").trim();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${safeStore} - ${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: file.type || "image/jpeg", body: buffer as any },
    fields: "id, webViewLink",
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive upload failed (missing file ID)");

  // Make shareable
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  const link =
    created.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  return link;
}

async function appendToSheet(row: any[]) {
  const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = env("SPREADSHEET_ID");
  const sheetName = env("SHEET_NAME");

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

    // Your sheet columns A-F:
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
