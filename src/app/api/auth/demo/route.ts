import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPassword,
  hashPassword,
  createSession,
  setSessionCookie,
} from "@/lib/auth";

// One-tap beta/demo login (the "Beta testers — one tap to sign in" buttons).
// Self-provisioning: on a fresh database the first tap creates the demo
// account with a starter profile; existing accounts are logged in but NEVER
// modified (no password bypass). Whitelist-only — no arbitrary accounts.
// NOTE for public launch: remove this route or the whitelist when real users
// have real passwords (a leaked demo password must not open any account).
const DEMO_PASSWORD = "demo1234";
const DEMO_ACCOUNTS: Record<
  string,
  {
    name: string;
    avatar: string;
    sex: "male" | "female" | null;
    goal: string;
    hours: number;
    level: string;
  }
> = {
  "jeand.duno@gmail.com": {
    name: "Jeand",
    avatar: "🏃‍♂️",
    sex: "male",
    goal: "run-only",
    hours: 6,
    level: "amateur",
  },
  "kathy@jasmiamimethod.com": {
    name: "Kathy",
    avatar: "🏃‍♀️",
    sex: "female",
    goal: "run-only",
    hours: 5,
    level: "amateur",
  },
  "fedra@jasmiamimethod.com": {
    name: "Fedra",
    avatar: "🦩",
    sex: "female",
    goal: "run-only",
    hours: 5,
    level: "beginner",
  },
  "john@jasmiamimethod.com": {
    name: "John",
    avatar: "⚡",
    sex: "male",
    goal: "run-only",
    hours: 12,
    level: "advanced",
  },
  "jas@jasmiamimethod.com": {
    name: "Jas",
    avatar: "🥉",
    sex: null,
    goal: "olympic",
    hours: 8,
    level: "amateur",
  },
  "andres@jasmiamimethod.com": {
    name: "Andres",
    avatar: "🏋️",
    sex: "male",
    goal: "hyrox",
    hours: 7,
    level: "amateur",
  },
  "juliaburtseva@gmail.com": {
    name: "Julia",
    avatar: "🎽",
    sex: "female",
    goal: "run-only",
    hours: 6,
    level: "beginner",
  },
  "arlenramirez0425@gmail.com": {
    name: "Arl",
    avatar: "👟",
    sex: "male",
    goal: "run-only",
    hours: 6,
    level: "beginner",
  },
  "m@jasmiamimethod.com": {
    name: "M",
    avatar: "⚡",
    sex: "male",
    goal: "run-only",
    hours: 5,
    level: "amateur",
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "")
      .toLowerCase()
      .trim();
    const acct = DEMO_ACCOUNTS[email];
    if (!acct) {
      return NextResponse.json(
        { error: "Demo login is limited to beta tester accounts." },
        { status: 403 },
      );
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: acct.name,
          passwordHash: hashPassword(DEMO_PASSWORD),
          role: "athlete",
          avatar: acct.avatar,
          profile: {
            create: {
              ...(acct.sex ? { sex: acct.sex } : {}),
              goal: acct.goal,
              weeklyHours: acct.hours,
              experience: acct.level,
            },
          },
          motivation: { create: {} },
        },
      });
    } else if (!verifyPassword(DEMO_PASSWORD, user.passwordHash)) {
      // The account exists with a real password — never bypass it.
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const token = await createSession(user.id);
    await setSessionCookie(token, req);
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e: any) {
    console.error("demo login error:", e);
    return NextResponse.json({ error: "Demo login failed." }, { status: 500 });
  }
}
