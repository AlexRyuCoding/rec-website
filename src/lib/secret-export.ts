// Sealing a value for one recipient, for the move to Google Cloud.
//
// The value is encrypted with the recipient's PUBLIC key (RSA-OAEP,
// SHA-256). Only the holder of the matching private key can read the
// result, so the sealed text may be shown, copied and pasted: to anyone
// else it is noise. OAEP mixes in fresh randomness, so sealing the same
// value twice gives two different texts.
import { constants, publicEncrypt } from "node:crypto";

export function sealForRecipient(value: string, publicKeyPem: string): string {
  return publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(value, "utf8")
  ).toString("base64");
}
