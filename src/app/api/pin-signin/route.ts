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

    const localPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
    const encodedCredentials = process.env.GOOGLE_SHEETS_CREDENTIALS_B64;
    let credentialsPath: string;

    if (localPath && process.env.NODE_ENV === "development") {
      // Use local credentials file in development
      credentialsPath = localPath;
      if (!fs.existsSync(credentialsPath)) {
        return NextResponse.json(
          { error: "Local credentials file not found" },
          { status: 500 }
        );
      }
    } else if (encodedCredentials) {
      // Use base64 encoded credentials in production
      const decodedCredentials = Buffer.from(
        encodedCredentials,
        "base64"
      ).toString("utf-8");

      credentialsPath = path.join("/tmp", "service-account.json");

      if (!fs.existsSync(credentialsPath)) {
        fs.writeFileSync(credentialsPath, decodedCredentials);
      }
    } else {
      return NextResponse.json(
        { error: "Authentication service unavailable - no credentials found" },
        { status: 500 }
      );
    }

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
        { error: "Data service unavailable" },
        { status: 500 }
      );
    }

    const matchedRow = rows.find((row) => row[patientIdIndex] === pin);

    if (!matchedRow) {
      return NextResponse.json(
        { error: "Not a valid PIN. Please enter a valid PIN to sign in" },
        { status: 404 }
      );
    }

    const firstNameIndex: number = headers.findIndex((h) =>
      h.toLowerCase().includes("first")
    );
    const lastNameIndex: number = headers.findIndex((h) =>
      h.toLowerCase().includes("last")
    );

    const firstName: string = matchedRow[firstNameIndex] || "";
    const lastName: string = matchedRow[lastNameIndex] || "";
    const displayName: string = `${firstName} ${lastName.charAt(0)}.`;

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

    // Check for specific error types
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
