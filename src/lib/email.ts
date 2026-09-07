// Email service — SMTP (works locally & on Vercel with SMTP env vars)
// Falls back to a console/DB-only mode if SMTP not configured, so the app
// never breaks in dev.

import nodemailer from "nodemailer";
import { prisma } from "./db";

interface EmailOpts {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    });
  }
  return transporter;
}

export async function sendEmail(
  opts: EmailOpts,
): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) {
    return { ok: false, error: "SMTP is not configured; no email was sent." };
  }
  try {
    await t.sendMail({
      from:
        process.env.SMTP_FROM ||
        process.env.SMTP_USER ||
        "app@jasmiamimethod.com",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (opts.userId) {
      await prisma.sentEmail.create({
        data: {
          userId: opts.userId,
          subject: opts.subject,
          to: opts.to,
          status: "sent",
        },
      });
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[EMAIL] send failed:", e.message);
    if (opts.userId) {
      await prisma.sentEmail.create({
        data: {
          userId: opts.userId,
          subject: opts.subject,
          to: opts.to,
          status: "failed",
          error: String(e.message || e),
        },
      });
    }
    return { ok: false, error: String(e.message || e) };
  }
}

export function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: `Welcome to JasMiamiMethod, ${name}! 🏊🚴🏃`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:auto;background:#f0f9ff;border-radius:16px;padding:32px;border:1px solid #bae8ff">
        <h1 style="color:#175793;margin:0 0 8px">JasMiamiMethod</h1>
        <p style="color:#175793;font-weight:600;margin:0 0 24px">The Science-Backed Triathlon Method</p>
        <p>Welcome aboard, <strong>${name}</strong>!</p>
        <p>Your training journey starts now. Here's what to do next:</p>
        <ol style="line-height:1.8">
          <li><strong>Complete your profile</strong> — age, weight, experience, goal race. We'll estimate your VO2max and build your training zones.</li>
          <li><strong>Take the 30-minute LTHR test</strong> (or enter your VO2max/HR data) so every workout is anchored to YOUR physiology, not a generic formula.</li>
          <li><strong>Generate your first training plan</strong> — periodized Base → Build → Peak → Taper, built on the post-2000 sports science research.</li>
          <li><strong>Connect your devices</strong> — Garmin, Strava, Whoop, Apple Health, Oura — or upload your data files.</li>
        </ol>
        <p style="background:#d8f1ff;padding:16px;border-radius:8px;margin:24px 0">
          💡 <em>"The body achieves what the mind believes." — today is the first brick in the wall.</em>
        </p>
        <p>Train smart. Recover harder. <br/><strong>— The JasMiamiMethod Coach</strong></p>
      </div>`,
  };
}

export function dailyMotivationEmail(
  name: string,
  quote: string,
  message: string,
  todaysSession: string,
): { subject: string; html: string } {
  return {
    subject: `🌅 ${name} — Today's Training & Motivation`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:auto;background:#f0f9ff;border-radius:16px;padding:32px;border:1px solid #bae8ff">
        <h1 style="color:#175793;margin:0 0 8px">Good morning, ${name} ☀️</h1>
        <blockquote style="border-left:4px solid #2aa3f5;margin:24px 0;padding:8px 16px;color:#175793;font-size:18px;font-style:italic">
          "${quote}"
        </blockquote>
        <p style="color:#334155">${message}</p>
        <div style="background:#d8f1ff;padding:16px;border-radius:8px;margin:24px 0">
          <p style="margin:0;font-weight:700;color:#175793">Today's session:</p>
          <p style="margin:8px 0 0">${todaysSession}</p>
        </div>
        <p style="color:#64748b;font-size:13px">Hydrate. Sleep 8h. You are building an engine.</p>
        <p style="color:#175793"><strong>— JasMiamiMethod Coach</strong></p>
      </div>`,
  };
}
