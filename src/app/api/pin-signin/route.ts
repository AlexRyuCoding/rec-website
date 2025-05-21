import { google } from "googleapis";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function POST(req: Request) {
  const { pin, confirmed } = await req.json();
  const SHEET_ID = process.env.SPREADSHEET_ID!;
  const LIBRARY_TAB = "Library";
  const LOG_TAB = "Submissions";

  try {
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });

    // Load service account credentials
    const credentialsPath = path.join(
      process.cwd(),
      process.env.GOOGLE_SHEETS_CREDENTIALS_PATH!
    );

    const credentials = JSON.parse(await fs.readFile(credentialsPath, "utf-8"));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Get Library tab data
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${LIBRARY_TAB}!A1:Z30000`,
    });

    const [headers, ...rows] = readRes.data.values || [];

    const patientIdIndex = headers.findIndex(
      (h) => h.toLowerCase().replace(/\s/g, "") === "patientid"
    );

    if (patientIdIndex === -1) {
      return NextResponse.json(
        { error: "PatientID column not found." },
        { status: 500 }
      );
    }

    const matchedRow = rows.find((row) => row[patientIdIndex] === pin);

    if (!matchedRow) {
      return NextResponse.json({ error: "PIN not found" }, { status: 404 });
    }

    const firstNameIndex = headers.findIndex((h) =>
      h.toLowerCase().includes("first")
    );
    const lastNameIndex = headers.findIndex((h) =>
      h.toLowerCase().includes("last")
    );

    const firstName = matchedRow[firstNameIndex] || "";
    const lastName = matchedRow[lastNameIndex] || "";
    const displayName = `${firstName} ${lastName.charAt(0)}.`; // e.g. "John S."

    // Only log if confirmed
    if (confirmed) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${LOG_TAB}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[timestamp, pin, displayName]],
        },
      });
    }

    return NextResponse.json({ name: displayName });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
