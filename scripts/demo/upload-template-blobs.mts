// Uploads the sample files in supabase/demo/files/ to the `project-files`
// bucket, at the storage_path of each template file row, so a download from
// the Northwind template (and from every sandbox cloned from it) returns a
// real file. Safe to run again: existing objects are overwritten.
//
// Run it after supabase/demo/template.sql is applied:
//   pnpm demo:blobs
//
// Credentials come from SUPABASE_URL and SUPABASE_SECRET_KEY in the
// environment (the hosted project). When either is missing it falls back to
// the local Supabase stack. Neither value is ever printed.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "project-files";
const TEMPLATE_WORKSPACE_ID = "30000000-0000-0000-0000-000000000001";
const FILES_DIR = resolve(
  fileURLToPath(new URL("../../supabase/demo/files/", import.meta.url)),
);

// A file row's name comes from the database, so it is reduced to its last
// segment and checked to still sit inside FILES_DIR before anything is read:
// a name like "../../.env.local" must not upload a file from elsewhere.
function sampleFilePath(name: string): string {
  const path = resolve(FILES_DIR, basename(name));
  if (!path.startsWith(FILES_DIR + sep)) {
    throw new Error(`"${name}" is not a file in supabase/demo/files/.`);
  }
  return path;
}

type Credentials = { url: string; secretKey: string };

// `supabase status -o env` prints KEY="value" lines. The output is parsed in
// memory and never written anywhere.
function localCredentials(): Credentials | null {
  let output: string;
  try {
    output = execFileSync("pnpm", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }

  const values = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) {
      values.set(match[1], match[2]);
    }
  }

  const url = values.get("API_URL");
  const secretKey = values.get("SECRET_KEY") ?? values.get("SERVICE_ROLE_KEY");
  return url && secretKey ? { url, secretKey } : null;
}

function credentials(): Credentials {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (url && secretKey) {
    return { url, secretKey };
  }

  const local = localCredentials();
  if (local) {
    return local;
  }

  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SECRET_KEY, or start the local stack with `pnpm supabase start`.",
  );
}

async function main(): Promise<void> {
  const { url, secretKey } = credentials();
  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from("project_files")
    .select("name, storage_path, mime_type")
    .eq("workspace_id", TEMPLATE_WORKSPACE_ID)
    .order("storage_path");
  if (error) {
    throw new Error(`Could not read the template file rows: ${error.message}`);
  }
  if (rows.length === 0) {
    throw new Error(
      "The template has no file rows. Apply supabase/demo/template.sql first.",
    );
  }

  for (const row of rows) {
    const blob = await readFile(sampleFilePath(row.name));
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(row.storage_path, blob, {
        contentType: row.mime_type,
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Upload of ${row.name} failed: ${uploadError.message}`);
    }
    console.log(`uploaded ${row.name}`);
  }
  console.log(`${rows.length} template blobs are in the ${BUCKET} bucket.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Upload failed.");
  process.exitCode = 1;
}
