import { google } from "googleapis";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function POST(req: Request) {
  const { pin, confirmed } = await req.json();
  const SHEET_ID = process.env.SPREADSHEET_ID!;
  const LIBRARY_TAB = "Library";
  const LOG_TAB = "Submissions";

  try {
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });

    const base64 = process.env.GOOGLE_SHEETS_CREDENTIALS_B64;
    const localPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
    let credentialsPath: string;

    // Use either base64 (Vercel/secure env) or file path (local dev)
    if (base64) {
      credentialsPath = path.join("/tmp", "service-account.json");
      if (!fs.existsSync(credentialsPath)) {
        const decoded = Buffer.from(base64, "base64").toString("utf-8");
        fs.writeFileSync(credentialsPath, decoded);
      }
    } else if (localPath) {
      credentialsPath = path.join(process.cwd(), localPath);
      if (!fs.existsSync(credentialsPath)) {
        return NextResponse.json(
          { error: `Local credentials file not found at ${credentialsPath}` },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error:
            "Missing both GOOGLE_SHEETS_CREDENTIALS_B64 and GOOGLE_SHEETS_CREDENTIALS_PATH",
        },
        { status: 500 }
      );
    }

    // Read and parse the credentials
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));

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
    const displayName = `${firstName} ${lastName.charAt(0)}.`;

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
  } catch (error) {
    console.error("Pin signin error:", error);

    if (error instanceof Error) {
      if (error.message.includes("credentials")) {
        return NextResponse.json(
          { error: "Authentication error - please check credentials" },
          { status: 500 }
        );
      }
      if (error.message.includes("spreadsheet")) {
        return NextResponse.json(
          {
            error: "Error accessing spreadsheet - please check spreadsheet ID",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Server error - please try again later" },
      { status: 500 }
    );
  }
}
