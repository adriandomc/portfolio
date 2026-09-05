// Self-check for the two bits of admin logic that are easy to break silently:
// git blob hashing (drives conflict detection) and frontmatter merging
// (drives what survives a save). Run: node scripts/check-admin.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";

function gitBlobSha(content) {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

// Our hash must agree with git itself, or every publish reports a false conflict.
for (const sample of ["", "hello\n", "---\ntitle: x\n---\n\nbody\n", "áéí 😀"]) {
  const buf = Buffer.from(sample, "utf-8");
  const expected = execFileSync("git", ["hash-object", "--stdin"], {
    input: buf,
  })
    .toString()
    .trim();
  assert.equal(gitBlobSha(buf), expected, `blob sha mismatch for ${JSON.stringify(sample)}`);
}

// Binary content (an uploaded image) must hash the same way.
const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0a]);
assert.equal(
  gitBlobSha(binary),
  execFileSync("git", ["hash-object", "--stdin"], { input: binary }).toString().trim(),
);

// Saving through the admin must not drop frontmatter keys the editor has no
// field for. Mirrors serializePost's merge.
function merge(base, fm) {
  const data = { ...base, ...fm };
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

const existing = matter(
  "---\ntitle: Old\nsummary: keep me\nrole: Designer\nyear: '2024'\n---\n\nbody\n",
).data;
const saved = merge(existing, {
  title: "New",
  description: "d",
  href: undefined,
});
assert.equal(saved.title, "New", "form value must win");
assert.equal(saved.summary, "keep me", "unmanaged key dropped");
assert.equal(saved.role, "Designer", "unmanaged key dropped");
assert.equal(saved.year, "2024", "unmanaged key dropped");
assert.ok(!("href" in saved), "undefined key must not be serialised");

console.log("admin checks passed");
