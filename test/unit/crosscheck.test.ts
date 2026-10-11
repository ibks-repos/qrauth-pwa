// Random secrets and challenges against the reference client (Lab6/client/ocra.py) of the course repository.
// Skipped where the reference client is not present (the public mirror of this directory).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bytesToHex, compute, SUITE } from "../../src/ocra";

const CLIENT = fileURLToPath(new URL("../../../client", import.meta.url));
const available = existsSync(`${CLIENT}/ocra.py`);

describe.skipIf(!available)("cross-check with client/ocra.py", () => {
  it("agrees on 200 random cases", async () => {
    const cases = Array.from({ length: 200 }, () => ({
      key: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      q: bytesToHex(crypto.getRandomValues(new Uint8Array(20))),
    }));
    const script = [
      "import json, sys, ocra",
      "cases = json.load(sys.stdin)",
      `print(json.dumps([ocra.compute("${SUITE}", bytes.fromhex(c["key"]), c["q"]) for c in cases]))`,
    ].join("\n");
    const expected: string[] = JSON.parse(
      execFileSync("python3", ["-c", script], { cwd: CLIENT, input: JSON.stringify(cases) }).toString(),
    );
    const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
    const actual = await Promise.all(cases.map((c) => compute(SUITE, hex(c.key), c.q)));
    expect(actual).toEqual(expected);
  });
});
