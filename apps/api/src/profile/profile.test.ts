import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { makeUser, cookieFor, TEST_PASSWORD } from "../test/helpers.js";

const app = createApp();

// Minimal valid 1x1 PNG
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

describe("Profile, Personalization, Password & Security Question APIs", () => {
  it("returns profile with read-only identity and default preferences", async () => {
    const user = await makeUser("LEGAL");
    const cookie = await cookieFor(user);

    const res = await request(app).get("/profile").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.name).toBe(user.name);
    expect(res.body.role).toBe("LEGAL");
    expect(typeof res.body.position).toBe("string");
    expect(res.body.theme).toBe("default");
    expect(res.body.fontSize).toBe("md");
    expect(res.body.hasAvatar).toBe(false);
    expect(res.body.hasSecurityQuestion).toBe(false);
  });

  it("updates and persists theme (all 6 themes) and font size preferences", async () => {
    const user = await makeUser("MANAGEMENT");
    const cookie = await cookieFor(user);

    for (const theme of [
      "default",
      "white",
      "dark",
      "charcoal-gold",
      "sage-terracotta",
      "midnight-lime",
      "espresso-sky",
    ]) {
      const patch = await request(app)
        .patch("/profile/preferences")
        .set("Cookie", cookie)
        .send({ theme, fontSize: "lg" });
      expect(patch.status).toBe(200);
      expect(patch.body.theme).toBe(theme);
      expect(patch.body.fontSize).toBe("lg");
    }

    const bad = await request(app)
      .patch("/profile/preferences")
      .set("Cookie", cookie)
      .send({ theme: "neon-purple" });
    expect(bad.status).toBe(400);
  });

  it("uploads, serves, and removes a profile avatar image", async () => {
    const user = await makeUser("TENANT");
    const cookie = await cookieFor(user);

    const badUpload = await request(app)
      .post("/profile/avatar")
      .set("Cookie", cookie)
      .attach("avatar", Buffer.from("not-an-image"), "fake.png");
    expect(badUpload.status).toBe(400);

    const up = await request(app)
      .post("/profile/avatar")
      .set("Cookie", cookie)
      .attach("avatar", TINY_PNG, "avatar.png");
    expect(up.status).toBe(201);
    expect(up.body.hasAvatar).toBe(true);

    const getImg = await request(app).get("/profile/avatar").set("Cookie", cookie);
    expect(getImg.status).toBe(200);
    expect(getImg.headers["content-type"]).toContain("image/png");

    const del = await request(app).delete("/profile/avatar").set("Cookie", cookie);
    expect(del.status).toBe(200);
    expect(del.body.hasAvatar).toBe(false);

    const afterDel = await request(app).get("/profile/avatar").set("Cookie", cookie);
    expect(afterDel.status).toBe(404);
  });

  it("enforces strict password rules on Change Password and updates credentials", async () => {
    const user = await makeUser("LEGAL");
    const cookie = await cookieFor(user);

    // Wrong current password
    const wrongCur = await request(app).post("/profile/password").set("Cookie", cookie).send({
      currentPassword: "wrong-password",
      newPassword: "ValidPass1!",
      confirmPassword: "ValidPass1!",
    });
    expect(wrongCur.status).toBe(401);

    // Too short (<8)
    const tooShort = await request(app).post("/profile/password").set("Cookie", cookie).send({
      currentPassword: TEST_PASSWORD,
      newPassword: "Ab1!xy",
      confirmPassword: "Ab1!xy",
    });
    expect(tooShort.status).toBe(400);

    // Missing uppercase
    const noUpper = await request(app).post("/profile/password").set("Cookie", cookie).send({
      currentPassword: TEST_PASSWORD,
      newPassword: "lowercase1!",
      confirmPassword: "lowercase1!",
    });
    expect(noUpper.status).toBe(400);

    // Missing special char
    const noSpecial = await request(app).post("/profile/password").set("Cookie", cookie).send({
      currentPassword: TEST_PASSWORD,
      newPassword: "Alphanumeric123",
      confirmPassword: "Alphanumeric123",
    });
    expect(noSpecial.status).toBe(400);

    // Valid password change
    const ok = await request(app).post("/profile/password").set("Cookie", cookie).send({
      currentPassword: TEST_PASSWORD,
      newPassword: "EagleStrong#2026",
      confirmPassword: "EagleStrong#2026",
    });
    expect(ok.status).toBe(200);

    // Can log in with the new password
    const loginRes = await request(app).post("/auth/login").send({
      email: user.email,
      password: "EagleStrong#2026",
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.mfaToken).toBeDefined();
  }, 20_000);

  it("sets up security question (requiring current password) and recovers password locally", async () => {
    const user = await makeUser("LEGAL");
    const cookie = await cookieFor(user);

    // Fails without valid current password
    const badPw = await request(app)
      .put("/profile/security-question")
      .set("Cookie", cookie)
      .send({
        currentPassword: "wrong",
        question: "What was the name of your first elementary school?",
        answer: "St. Jude Academy",
      });
    expect(badPw.status).toBe(401);

    // Succeeds with valid current password
    const setup = await request(app)
      .put("/profile/security-question")
      .set("Cookie", cookie)
      .send({
        currentPassword: TEST_PASSWORD,
        question: "What was the name of your first elementary school?",
        answer: "St. Jude Academy",
      });
    expect(setup.status).toBe(200);
    expect(setup.body.hasSecurityQuestion).toBe(true);

    // Public recovery step 1: fetch question
    const qRes = await request(app)
      .post("/auth/recovery/question")
      .send({ email: user.email });
    expect(qRes.status).toBe(200);
    expect(qRes.body.question).toBe("What was the name of your first elementary school?");

    // Step 1: wrong answer rejected (counts toward the 3-strike cooldown)
    const badAns = await request(app).post("/auth/recovery/verify-answer").send({
      email: user.email,
      answer: "Wrong School",
    });
    expect(badAns.status).toBe(401);
    expect(badAns.body.resetToken).toBeUndefined();
    expect(badAns.body.attemptsRemaining).toBe(2);

    // Step 1: case-insensitive correct answer returns a reset token (password unchanged yet)
    const verified = await request(app).post("/auth/recovery/verify-answer").send({
      email: user.email,
      answer: "  st. jude academy ",
    });
    expect(verified.status).toBe(200);
    expect(verified.body.resetToken).toMatch(/^[a-f0-9]{64}$/);

    // Step 2: password policy is still enforced
    const weak = await request(app).post("/auth/recovery/complete").send({
      resetToken: verified.body.resetToken,
      newPassword: "weak",
      confirmPassword: "weak",
    });
    expect(weak.status).toBe(400);

    // Step 2: set the new password
    const resetOk = await request(app).post("/auth/recovery/complete").send({
      resetToken: verified.body.resetToken,
      newPassword: "Recovered#2026A",
      confirmPassword: "Recovered#2026A",
    });
    expect(resetOk.status).toBe(200);

    // The reset token is single-use
    const replay = await request(app).post("/auth/recovery/complete").send({
      resetToken: verified.body.resetToken,
      newPassword: "Another#2026B",
      confirmPassword: "Another#2026B",
    });
    expect(replay.status).toBe(401);

    const loginAfter = await request(app).post("/auth/login").send({
      email: user.email,
      password: "Recovered#2026A",
    });
    expect(loginAfter.status).toBe(200);
  }, 30_000);

  it("locks recovery for 30s after 3 wrong security answers", async () => {
    const user = await makeUser("TENANT");
    const cookie = await cookieFor(user);
    await request(app).put("/profile/security-question").set("Cookie", cookie).send({
      currentPassword: TEST_PASSWORD,
      question: "What was the name of the street you grew up on?",
      answer: "Mabini",
    });

    for (let i = 0; i < 2; i++) {
      const r = await request(app)
        .post("/auth/recovery/verify-answer")
        .send({ email: user.email, answer: "wrong" });
      expect(r.status).toBe(401);
    }
    const third = await request(app)
      .post("/auth/recovery/verify-answer")
      .send({ email: user.email, answer: "wrong" });
    expect(third.status).toBe(423);
    expect(third.body.remainingSeconds).toBeLessThanOrEqual(30);

    // Even the correct answer is blocked during the cooldown
    const blocked = await request(app)
      .post("/auth/recovery/verify-answer")
      .send({ email: user.email, answer: "Mabini" });
    expect(blocked.status).toBe(423);
  }, 30_000);

  it("verifies a backup code first, consumes it only when the new password is saved", async () => {
    const user = await makeUser("LEGAL");
    const cookie = await cookieFor(user);

    const badGen = await request(app)
      .post("/profile/backup-codes")
      .set("Cookie", cookie)
      .send({ currentPassword: "wrong" });
    expect(badGen.status).toBe(401);

    const gen = await request(app)
      .post("/profile/backup-codes")
      .set("Cookie", cookie)
      .send({ currentPassword: TEST_PASSWORD });
    expect(gen.status).toBe(201);
    expect(gen.body.codes).toHaveLength(6);
    expect(gen.body.backupCodesRemaining).toBe(6);
    const [firstCode, secondCode] = gen.body.codes as string[];

    // Wrong code: no token
    const wrong = await request(app)
      .post("/auth/recovery/verify-backup-code")
      .send({ email: user.email, backupCode: "ZZZZ-ZZZZ" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.resetToken).toBeUndefined();

    // Verifying alone (abandoned flow) does NOT consume the code
    const abandoned = await request(app)
      .post("/auth/recovery/verify-backup-code")
      .send({ email: user.email, backupCode: secondCode });
    expect(abandoned.status).toBe(200);
    const profileMid = await request(app).get("/profile").set("Cookie", cookie);
    expect(profileMid.body.backupCodesRemaining).toBe(6);

    // Verify then complete with the first code
    const verified = await request(app)
      .post("/auth/recovery/verify-backup-code")
      .send({ email: user.email, backupCode: firstCode });
    expect(verified.status).toBe(200);
    expect(verified.body.resetToken).toMatch(/^[a-f0-9]{64}$/);

    const done = await request(app).post("/auth/recovery/complete").send({
      resetToken: verified.body.resetToken,
      newPassword: "BackupRecovered#2026",
      confirmPassword: "BackupRecovered#2026",
    });
    expect(done.status).toBe(200);
    expect(done.body.backupCodesRemaining).toBe(5);

    // The used code can never be verified again
    const reuse = await request(app)
      .post("/auth/recovery/verify-backup-code")
      .send({ email: user.email, backupCode: firstCode });
    expect(reuse.status).toBe(401);

    const loginAfter = await request(app).post("/auth/login").send({
      email: user.email,
      password: "BackupRecovered#2026",
    });
    expect(loginAfter.status).toBe(200);
  }, 60_000);

  it("no longer exposes a public admin-reset endpoint", async () => {
    const res = await request(app).post("/auth/recovery/admin-reset").send({});
    expect(res.status).toBe(404);
  });
});
