import { test } from "node:test";
import assert from "node:assert";

test("admin: ADMIN_EMAILS parsing handles spaces, case and empties", async () => {
  // Import after setting env to avoid module-cache interference
  process.env.ADMIN_EMAILS = " JasmelAcosta@gmail.com, coach@jasmiamimethod.com ,,";
  const { adminEmails, isAdminEmail } = await import("./admin");
  assert.deepStrictEqual(adminEmails(), [
    "jasmelacosta@gmail.com",
    "coach@jasmiamimethod.com",
  ]);
  assert.strictEqual(isAdminEmail("JASMELACOSTA@GMAIL.COM"), true);
  assert.strictEqual(isAdminEmail("random@gmail.com"), false);

  delete process.env.ADMIN_EMAILS;
  assert.deepStrictEqual(adminEmails(), []);
  assert.strictEqual(isAdminEmail("jasmelacosta@gmail.com"), false);
});
