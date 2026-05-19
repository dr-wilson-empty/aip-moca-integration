import { homedir, platform } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

const APP_DIR = "aip";

function root(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && platform() === "linux") return join(xdg, APP_DIR);
  return join(homedir(), `.${APP_DIR}`);
}

export const paths = {
  root,
  configFile: () => join(root(), "config.json"),
  keystoreFile: () => join(root(), "keystore.json"),
  cacheDir: () => join(root(), "cache"),
  historyDir: () => join(root(), "history"),
};

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

export async function ensureRoot(): Promise<string> {
  const dir = root();
  await ensureDir(dir);
  return dir;
}
