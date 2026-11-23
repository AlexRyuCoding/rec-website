import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sealForRecipient } from "./secret-export";

const pair = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

const open = (sealed: string, privateKey: string) =>
  privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(sealed, "base64")
  ).toString("utf8");

describe("sealForRecipient", () => {
  it("can be opened with the recipient's private key", () => {
    const { publicKey, privateKey } = pair();
    const sealed = sealForRecipient(
      "a made-up secret / with = signs+",
      publicKey
    );
    expect(open(sealed, privateKey)).toBe("a made-up secret / with = signs+");
  });

  it("does not contain the value, and differs every time", () => {
    const { publicKey } = pair();
    const first = sealForRecipient("made-up-secret-value", publicKey);
    const second = sealForRecipient("made-up-secret-value", publicKey);
    expect(first).not.toContain("made-up-secret-value");
    expect(Buffer.from(first, "base64").toString("latin1")).not.toContain(
      "made-up-secret-value"
    );
    expect(first).not.toBe(second);
  });

  it("cannot be opened with another private key", () => {
    const { publicKey } = pair();
    const stranger = pair();
    const sealed = sealForRecipient("made-up-secret-value", publicKey);
    expect(() => open(sealed, stranger.privateKey)).toThrow();
  });
});
