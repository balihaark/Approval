import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

const script = isWin
  ? path.join(__dirname, "start.ps1")
  : path.join(__dirname, "start.sh");

const result = isWin
  ? spawnSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", script],
      { cwd: root, stdio: "inherit", shell: false }
    )
  : spawnSync("bash", [script], { cwd: root, stdio: "inherit", shell: false });

process.exit(result.status ?? 1);
