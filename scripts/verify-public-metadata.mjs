import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

// Exercise the actual fetch CLI against a local server, in an isolated copy.
export async function verifyPublicMetadata(root) {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "appery-public-metadata-"),
  );
  const policies = JSON.parse(
    fs.readFileSync(path.join(root, "data/public-metadata.json"), "utf8"),
  );
  const original = JSON.parse(
    fs.readFileSync(path.join(root, "data/repos.json"), "utf8"),
  );
  const snapshotFiles = ["repos.json", "repos.js"];
  const digest = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  let status = 200;
  const fixture = original.repos.map((repo, index) => ({
    name: repo.name,
    html_url: repo.url,
    description: Object.hasOwn(policies, repo.name)
      ? "PRIVATE_UPSTREAM_TEXT"
      : repo.description,
    language: repo.language,
    pushed_at: repo.pushedAt,
    stargazers_count: repo.stars + (index === 0 ? 1 : 0),
    fork: repo.fork,
  }));
  const server = http.createServer((_request, response) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify(status === 200 ? fixture : { message: "fixture failure" }),
    );
  });
  try {
    fs.mkdirSync(path.join(temp, "scripts"));
    fs.mkdirSync(path.join(temp, "data"));
    for (const file of ["fetch-repos.mjs", "curate.mjs", "public-metadata.mjs"])
      fs.copyFileSync(
        path.join(root, "scripts", file),
        path.join(temp, "scripts", file),
      );
    for (const file of [
      "repos.json",
      "site-config.json",
      "repo-overrides.json",
      "public-metadata.json",
    ])
      fs.copyFileSync(
        path.join(root, "data", file),
        path.join(temp, "data", file),
      );
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const run = () =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [path.join(temp, "scripts/fetch-repos.mjs")],
          {
            cwd: temp,
            env: {
              ...process.env,
              GITHUB_TOKEN: "",
              FETCH_REPOS_API_BASE: `http://127.0.0.1:${address.port}`,
            },
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let text = "";
        child.stdout.on("data", (chunk) => {
          text += chunk;
        });
        child.stderr.on("data", (chunk) => {
          text += chunk;
        });
        child.once("error", reject);
        child.once("close", (code) => resolve({ code, text }));
      });
    const success = await run();
    if (success.code !== 0)
      throw new Error(`Public metadata fixture failed: ${success.text}`);
    const result = JSON.parse(
      fs.readFileSync(path.join(temp, "data/repos.json"), "utf8"),
    );
    const publicDescriptions = result.repos.every(
      (repo) =>
        !Object.hasOwn(policies, repo.name) ||
        repo.description === policies[repo.name].description,
    );
    const bothFormats = snapshotFiles.every(
      (file) =>
        !fs
          .readFileSync(path.join(temp, "data", file), "utf8")
          .includes("PRIVATE_UPSTREAM_TEXT"),
    );
    const unconfiguredUnchanged = result.repos
      .filter((repo) => !Object.hasOwn(policies, repo.name))
      .every(
        (repo) =>
          repo.description ===
          original.repos.find((r) => r.name === repo.name).description,
      );
    if (
      !publicDescriptions ||
      !bothFormats ||
      !unconfiguredUnchanged ||
      result.repos.length !== original.repos.length
    )
      throw new Error("Public metadata was not applied to both snapshots");
    const before = snapshotFiles.map((file) =>
      digest(path.join(temp, "data", file)),
    );
    status = 500;
    const failure = await run();
    const failurePreservesFiles =
      failure.code !== 0 &&
      snapshotFiles.every(
        (file, index) =>
          digest(path.join(temp, "data", file)) === before[index],
      );
    status = 200;
    fs.writeFileSync(
      path.join(temp, "data/public-metadata.json"),
      JSON.stringify({ "invalid-policy": { description: 42 } }),
    );
    const invalid = await run();
    const invalidConfigPreservesFiles =
      invalid.code !== 0 &&
      snapshotFiles.every(
        (file, index) =>
          digest(path.join(temp, "data", file)) === before[index],
      );
    if (!failurePreservesFiles || !invalidConfigPreservesFiles)
      throw new Error("A failed refresh changed an existing snapshot");
    return {
      publicDescriptions,
      bothFormats,
      unconfiguredUnchanged,
      failurePreservesFiles,
      invalidConfigPreservesFiles,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
