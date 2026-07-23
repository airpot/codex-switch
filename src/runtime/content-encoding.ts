import * as zlib from "node:zlib";

/** Result of decoding an HTTP entity body. */
export type DecodedContent = {
  body: Buffer;
  decoded: boolean;
};

type ZstdRuntime = {
  zstdDecompressSync?: (body: Uint8Array) => Buffer;
};

/**
 * Decodes an HTTP entity body according to its Content-Encoding value.
 * Stacked encodings are reversed as required by RFC 9110.
 */
export function decodeContentEncodedBody(body: Buffer, contentEncoding?: string): DecodedContent {
  const codings = parseContentEncodings(contentEncoding);
  if (codings.length === 0) {
    return { body, decoded: false };
  }

  let decoded = body;
  for (const coding of codings.reverse()) {
    decoded = decodeSingleEncoding(decoded, coding);
  }
  return { body: decoded, decoded: true };
}

/**
 * Returns the normalized non-identity encodings carried by a header value.
 */
export function parseContentEncodings(contentEncoding?: string): string[] {
  if (!contentEncoding) {
    return [];
  }
  return contentEncoding
    .split(",")
    .map((coding) => coding.trim().toLowerCase())
    .filter((coding) => coding.length > 0 && coding !== "identity");
}

function decodeSingleEncoding(body: Buffer, coding: string): Buffer {
  switch (coding) {
    case "gzip":
    case "x-gzip":
      return zlib.gunzipSync(body);
    case "deflate":
      try {
        return zlib.inflateSync(body);
      } catch {
        return zlib.inflateRawSync(body);
      }
    case "br":
      return zlib.brotliDecompressSync(body);
    case "zstd":
    case "zst": {
      const decode = (zlib as unknown as ZstdRuntime).zstdDecompressSync;
      if (!decode) {
        throw new Error(`Unsupported content encoding on this Node.js version: ${coding}`);
      }
      return decode(body);
    }
    default:
      throw new Error(`Unsupported content encoding: ${coding}`);
  }
}
