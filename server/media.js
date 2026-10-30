import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
export function validateClip(bytes) {
  const local = fileURLToPath(
    new URL(
      process.platform === "win32"
        ? ".venv/Scripts/python.exe"
        : ".venv/bin/python",
      root,
    ),
  );
  const python =
    process.env.EXAMOS_MEDIA_PYTHON || (existsSync(local) ? local : "python3");
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [fileURLToPath(new URL("./validate_clip.py", import.meta.url))],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let output = "",
      settled = false;
    const fail = (message) => {
      if (!settled) {
        settled = true;
        reject(Object.assign(Error(message), { status: 400 }));
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      fail("Clip validation timed out");
    }, 10000);
    child.stdout.on("data", (part) => {
      output += part.toString();
      if (output.length > 4096) {
        child.kill();
        fail("Invalid media response");
      }
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      fail(
        "Video validation unavailable; configure EXAMOS_MEDIA_PYTHON and install av",
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.error)
          throw Error(result.error || "Invalid clip");
        settled = true;
        resolve(result);
      } catch (e) {
        fail(e.message);
      }
    });
    child.stdin.end(bytes);
  });
}
