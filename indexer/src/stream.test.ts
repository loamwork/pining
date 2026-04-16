import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { streamArray } from "./stream.js";

const tmpFiles: string[] = [];

function writeTmp(content: string): string {
  const p = path.join(os.tmpdir(), `stream-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, content, "utf8");
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
  tmpFiles.length = 0;
});

describe("streamArray", () => {
  it("parses a basic array of objects", async () => {
    const fp = writeTmp('[{"a":1},{"a":2},{"a":3}]');
    const results: Record<string, unknown>[] = [];
    await streamArray(fp, (obj) => results.push(obj));
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ a: 1 });
    expect(results[1]).toEqual({ a: 2 });
    expect(results[2]).toEqual({ a: 3 });
  });

  it("handles escaped quotes inside strings", async () => {
    const fp = writeTmp('[{"name":"say \\"hello\\""}]');
    const results: Record<string, unknown>[] = [];
    await streamArray(fp, (obj) => results.push(obj));
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ name: 'say "hello"' });
  });

  it("handles nested objects and arrays", async () => {
    const fp = writeTmp('[{"outer":{"inner":42},"arr":[1,2,3]}]');
    const results: Record<string, unknown>[] = [];
    await streamArray(fp, (obj) => results.push(obj));
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ outer: { inner: 42 }, arr: [1, 2, 3] });
  });

  it("returns zero elements for an empty array", async () => {
    const fp = writeTmp("[]");
    const results: Record<string, unknown>[] = [];
    await streamArray(fp, (obj) => results.push(obj));
    expect(results).toHaveLength(0);
  });

  it("handles pretty-printed JSON with whitespace and newlines", async () => {
    const pretty = JSON.stringify(
      [{ id: "a", val: 1 }, { id: "b", val: 2 }],
      null,
      2,
    );
    const fp = writeTmp(pretty);
    const results: Record<string, unknown>[] = [];
    await streamArray(fp, (obj) => results.push(obj));
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: "a", val: 1 });
    expect(results[1]).toEqual({ id: "b", val: 2 });
  });
});
