// ---------------------------------------------------------------------------
// Streaming JSON array parser — handles multi-GB files that exceed V8's
// ~512 MB string limit by reading in chunks via fs.createReadStream.
// ---------------------------------------------------------------------------

import fs from "node:fs";

/**
 * Stream-parse a top-level JSON array of objects, invoking `onObj` for each
 * element.  Never loads the whole file into memory — safe for arbitrarily
 * large files.
 *
 * Assumes the file contains a single JSON array whose elements are objects.
 */
export function streamArray(
  filePath: string,
  onObj: (obj: Record<string, unknown>) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = fs.createReadStream(filePath, {
      encoding: "utf8",
      highWaterMark: 1 << 20, // 1 MiB chunks
    });

    let buf = "";
    let pos = 0;

    // Parser state that persists across chunks:
    let started = false; // have we seen the opening '['?
    let depth = 0; // brace nesting depth (0 = between elements)
    let inString = false; // inside a JSON string literal?
    let escape = false; // previous char was a backslash?
    let eltStart = -1; // index in buf where current element's '{' is

    s.on("data", (chunk: string | Buffer) => {
      buf += chunk as string;

      while (pos < buf.length) {
        const c = buf[pos];

        // --- Wait for the opening '[' of the top-level array ---------------
        if (!started) {
          if (c === "[") started = true;
          pos++;
          continue;
        }

        // --- Inside a string literal: only watch for end-quote / escape ----
        if (inString) {
          if (escape) {
            escape = false;
          } else if (c === "\\") {
            escape = true;
          } else if (c === '"') {
            inString = false;
          }
          pos++;
          continue;
        }

        // --- Outside a string: track structure ------------------------------
        if (c === '"') {
          inString = true;
          pos++;
          continue;
        }

        if (c === "{") {
          if (depth === 0) eltStart = pos;
          depth++;
          pos++;
          continue;
        }

        if (c === "}") {
          depth--;
          pos++;
          if (depth === 0 && eltStart >= 0) {
            // We have a complete top-level element — parse and emit it.
            try {
              onObj(JSON.parse(buf.slice(eltStart, pos)));
            } catch {
              // Malformed element — skip silently.
            }
            // Trim the buffer: everything before pos has been consumed.
            buf = buf.slice(pos);
            pos = 0;
            eltStart = -1;
          }
          continue;
        }

        pos++;
      }
    });

    s.on("end", resolve);
    s.on("error", reject);
  });
}
