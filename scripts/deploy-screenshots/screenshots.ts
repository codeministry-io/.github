// Screenshots of a freshly deployed app, posted to Slack (cm-k8s-cluster spec 017).
//
// Run by .github/workflows/deploy-screenshots.yml after an image build on main. For every page it remembers the
// fingerprint of the start page (the sorted names of the script and stylesheet bundles it includes, which every
// build renames), polls until the fingerprint changes or the wait limit is reached, then records each page at 1440
// and at 390 with touch emulation and uploads all images as ONE Slack message with repo, commit and build link.
//
// The bot token is read from SLACK_BOT_TOKEN and only ever placed in an Authorization header; nothing here prints it.
// Without a token (or with --dry-run) the images are recorded and kept, and nothing is posted.
//
// Env: PAGES (one URL per line), CONSENT_BUTTON, WAIT_MINUTES, POLL_SECONDS, CHANNEL, SLACK_BOT_TOKEN, REPO, SHA,
//      BUILD_URL, OUT_DIR.

import { chromium, type Browser } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const UMAMI = /^https:\/\/umami\.codeministry\.io\//;
const VIEWPORTS = [
  { width: 1440, height: 900, mobile: false, scale: 1 },
  { width: 390, height: 844, mobile: true, scale: 2 },
] as const;
// One completeUploadExternal call becomes one message; keep it small enough to stay one readable message.
const MAX_FILES = 10;
// A long landing page at full height is a thumbnail nobody can read in Slack (checkmeinebu mobile: 13788 px).
// Five screen heights show the top of the page and the first sections below it.
const MAX_SCREENS = 5;

const env = (name: string, fallback = ""): string => (process.env[name] ?? fallback).trim();
const dryRun = process.argv.includes("--dry-run");

const pages = env("PAGES").split(/\s+/).filter(Boolean);
const consentButton = env("CONSENT_BUTTON");
const waitMinutes = Number(env("WAIT_MINUTES", "15"));
const pollSeconds = Number(env("POLL_SECONDS", "20"));
const channel = env("CHANNEL");
const token = env("SLACK_BOT_TOKEN");
const repo = env("REPO", "unknown/repo");
const sha = env("SHA", "0000000");
const sha7 = sha.slice(0, 7);
const buildUrl = env("BUILD_URL");
const outDir = env("OUT_DIR", "screenshots");

interface PageState {
  url: string;
  host: string;
  before: string[] | null;
  after: string[] | null;
  liveAfterSeconds: number | null;
  error?: string;
}

interface Shot {
  host: string;
  width: number;
  file: string;
  name: string;
}

function log(msg: string): void {
  console.log(msg);
}

async function fingerprint(url: string): Promise<string[]> {
  const res = await fetch(url, { redirect: "follow", headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const names = new Set<string>();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+\.(?:m?js|css))(?:\?[^"']*)?["']/gi)) {
    names.add(m[1].split("/").pop() ?? m[1]);
  }
  return [...names].sort();
}

const same = (a: string[] | null, b: string[] | null) => !!a && !!b && a.join(" ") === b.join(" ");

async function waitForDeploy(states: PageState[]): Promise<void> {
  const start = Date.now();
  const deadline = start + waitMinutes * 60_000;
  for (const s of states) {
    try {
      s.before = await fingerprint(s.url);
      log(`fingerprint before ${s.host}: ${s.before.join(" ") || "(no bundles)"}`);
    } catch (e) {
      s.error = `nicht erreichbar (${(e as Error).message})`;
      log(`fingerprint before ${s.host}: ${s.error}`);
    }
  }
  let open = states.filter((s) => !s.error);
  while (open.length && Date.now() < deadline) {
    await Bun.sleep(Math.min(pollSeconds * 1000, Math.max(0, deadline - Date.now())));
    for (const s of open) {
      try {
        const now = await fingerprint(s.url);
        if (!same(now, s.before)) {
          s.after = now;
          s.liveAfterSeconds = Math.round((Date.now() - start) / 1000);
          log(`fingerprint after ${s.host}: ${now.join(" ")} (changed after ${s.liveAfterSeconds} s)`);
        }
      } catch (e) {
        log(`poll ${s.host}: ${(e as Error).message}, retrying`);
      }
    }
    open = open.filter((s) => s.liveAfterSeconds === null);
  }
  for (const s of open) log(`fingerprint after ${s.host}: unchanged after ${waitMinutes} min`);
}

async function record(browser: Browser, states: PageState[]): Promise<Shot[]> {
  await mkdir(outDir, { recursive: true });
  const shots: Shot[] = [];
  for (const s of states) {
    if (s.error) continue;
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        deviceScaleFactor: vp.scale,
        locale: "de-DE",
        // Sites that fade sections in on scroll show them right away under reduced motion.
        reducedMotion: "reduce",
      });
      // A deploy is not a visit: the analytics tracker never loads.
      await context.route(UMAMI, (route) => route.abort());
      const page = await context.newPage();
      try {
        await page.goto(s.url, { waitUntil: "networkidle", timeout: 45_000 }).catch(async () => {
          // Pages with a long-lived connection never go idle; the load event is enough then.
          await page.waitForLoadState("load", { timeout: 15_000 });
        });
        if (consentButton) {
          const exact = new RegExp(`^\\s*${consentButton.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
          const btn = page.getByRole("button", { name: exact }).first();
          try {
            await btn.waitFor({ state: "visible", timeout: 8000 });
            await (vp.mobile ? btn.tap() : btn.click());
            await btn.waitFor({ state: "hidden", timeout: 5000 });
          } catch {
            log(`${s.host} ${vp.width}: no consent dialog within 8 s, recording anyway`);
          }
        }
        // Walk down once so scroll-triggered sections and lazy images load, then back to the top.
        const maxHeight = vp.height * MAX_SCREENS;
        await page.evaluate(async ({ step, limit }) => {
          for (let y = 0; y < Math.min(document.documentElement.scrollHeight, limit); y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 200));
          }
          window.scrollTo(0, 0);
        }, { step: Math.round(vp.height * 0.8), limit: maxHeight });
        await page.waitForTimeout(1000);
        const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const name = `${s.host}-${vp.width}-${sha7}.png`;
        const file = join(outDir, name);
        await page.screenshot({
          path: file,
          fullPage: true,
          clip: { x: 0, y: 0, width: vp.width, height: Math.min(fullHeight, maxHeight) },
        });
        shots.push({ host: s.host, width: vp.width, file, name });
        log(`recorded ${name}`);
      } catch (e) {
        s.error = `Aufnahme ${vp.width} fehlgeschlagen (${(e as Error).message.split("\n")[0]})`;
        log(`${s.host}: ${s.error}`);
      } finally {
        await context.close();
      }
    }
  }
  return shots;
}

async function slack<T>(method: string, body: Record<string, unknown>, form = false): Promise<T & { ok: boolean; error?: string }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8",
    },
    body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
  });
  const json = (await res.json()) as T & { ok: boolean; error?: string };
  log(`slack ${method}: ${json.ok ? "ok" : `error ${json.error}`}`);
  if (!json.ok) throw new Error(`Slack ${method}: ${json.error}`);
  return json;
}

// The scopes the token carries, from Slack's own response header; the probe checks them against the manifest.
async function scopes(): Promise<void> {
  const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { ok: boolean; error?: string };
  log(`slack auth.test: ${json.ok ? "ok" : `error ${json.error}`}`);
  log(`slack scopes: ${res.headers.get("x-oauth-scopes") ?? "(none)"}`);
  if (!json.ok) throw new Error(`Slack auth.test: ${json.error}`);
}

async function upload(shots: Shot[], comment: string): Promise<void> {
  await scopes();
  const files: { id: string; title: string }[] = [];
  for (const shot of shots) {
    const bytes = await Bun.file(shot.file).bytes();
    const { upload_url, file_id } = await slack<{ upload_url: string; file_id: string }>(
      "files.getUploadURLExternal",
      { filename: shot.name, length: String(bytes.length) },
      true,
    );
    const put = await fetch(upload_url, { method: "POST", body: bytes });
    log(`upload ${shot.name}: HTTP ${put.status} (${file_id})`);
    if (!put.ok) throw new Error(`upload ${shot.name}: HTTP ${put.status}`);
    files.push({ id: file_id, title: `${shot.host} · ${shot.width === 1440 ? "Desktop 1440" : "Mobil 390"} · ${sha7}` });
  }
  await slack("files.completeUploadExternal", { files, channel_id: channel, initial_comment: comment });
}

function message(states: PageState[]): string {
  const head = `:camera: ${repo} · \`${sha7}\`${buildUrl ? ` · <${buildUrl}|Build>` : ""}`;
  const lines = states.map((s) => {
    if (s.error) return `:x: ${s.host}: ${s.error}`;
    if (s.liveAfterSeconds !== null) return `${s.host}: live nach ${s.liveAfterSeconds} s`;
    return `:warning: ${s.host}: Deploy nicht erkannt (Fingerabdruck nach ${waitMinutes} min unveraendert)`;
  });
  return [head, ...lines].join("\n");
}

async function main(): Promise<number> {
  if (!pages.length) throw new Error("PAGES is empty");
  const states: PageState[] = pages.map((url) => ({
    url,
    host: new URL(url).host,
    before: null,
    after: null,
    liveAfterSeconds: null,
  }));
  if (pages.length * VIEWPORTS.length > MAX_FILES) {
    throw new Error(`${pages.length} pages make ${pages.length * VIEWPORTS.length} images, more than ${MAX_FILES} in one message`);
  }

  await waitForDeploy(states);
  const browser = await chromium.launch();
  let shots: Shot[];
  try {
    shots = await record(browser, states);
  } finally {
    await browser.close();
  }

  const text = message(states);
  log(`message:\n${text}`);
  const posted = !dryRun && !!token;
  if (posted) {
    if (!channel) throw new Error("CHANNEL is empty");
    if (!shots.length) throw new Error("no image recorded, nothing to post");
    await upload(shots, text);
  } else {
    log(dryRun ? "dry run: nothing posted" : "no SLACK_BOT_TOKEN: nothing posted");
  }

  // One machine-readable line for scripts/checks/deploy-screenshots.sh in cm-k8s-cluster.
  log(
    `RESULT ${JSON.stringify({
      repo,
      sha: sha7,
      posted,
      files: shots.map((s) => s.name),
      pages: states.map(({ host, before, after, liveAfterSeconds, error }) => ({ host, before, after, liveAfterSeconds, error })),
    })}`,
  );

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    await Bun.write(summary, `### Deploy-Screenshots ${repo} \`${sha7}\`\n\n${text.split("\n").map((l) => `- ${l}`).join("\n")}\n`);
  }
  for (const s of states) {
    if (!s.error && s.liveAfterSeconds === null) {
      console.log(`::warning::${s.host}: Deploy nicht erkannt (Fingerabdruck nach ${waitMinutes} min unveraendert)`);
    }
  }
  return states.some((s) => s.error) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`::error::${(e as Error).message}`);
    process.exit(1);
  },
);
