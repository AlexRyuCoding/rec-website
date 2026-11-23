#!/usr/bin/env node
// Makes the token the app shows PostgREST (DB_REST_JWT) from PostgREST's
// signing secret (PGRST_JWT_SECRET).
//
//   <the secret, on stdin>  |  node scripts/mint-db-jwt.js  >  <the token>
//
// The secret comes in on stdin and the token goes out on stdout, so
// neither is ever on a command line or on the screen when this is used
// in a pipe (deploy/RUNBOOK.md pipes it straight from one Secret Manager
// secret into another). Nothing else is printed to stdout, and no line
// ending is added.
//
// The token says one thing — role: service_role — and has no expiry: it
// is as long-lived as the secret. To retire it, change the secret and
// mint again. HS256, with Node's own crypto and nothing else.
"use strict";

const { createHmac } = require("crypto");

const MIN_SECRET_LENGTH = 32; // PostgREST refuses to start with less.

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function mint(secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ role: "service_role" }));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  // A line ending after the secret (echo, a text editor) is not part of it.
  const secret = input.replace(/[\r\n]+$/, "");
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `mint-db-jwt: the secret on stdin must be at least ${MIN_SECRET_LENGTH} characters`
    );
    process.exit(1);
  }
  process.stdout.write(mint(secret));
});
