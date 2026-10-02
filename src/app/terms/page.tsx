import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Terms of Service — JasMiamiMethod",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <div className="pub-container py-12 sm:py-16 max-w-2xl">
        <p className="kicker">Legal</p>
        <h1 className="display-2xl mt-4">Terms of Service</h1>
        <p className="micro mt-2">Last updated: September 24, 2026</p>

        <div className="prose-editorial mt-8">
          <h2>1. What JasMiamiMethod is</h2>
          <p>
            JasMiamiMethod (&quot;JMM&quot;, &quot;we&quot;) is a training-planning web
            application that generates exercise recommendations from information you
            provide (check-ins, benchmarks, goals) and data you choose to connect from
            third-party devices and services. JMM is a coaching tool —{" "}
            <strong>it is not a medical device, not a diagnostic product, and not a
            substitute for a physician, physiotherapist, or licensed dietitian.</strong>
          </p>

          <h2>2. No medical advice</h2>
          <p>
            The training sessions, fueling plans, supplement information, readiness
            scores and race predictions produced by JMM are educational
            estimates derived from published sports-science research and the data
            you supply. They are not medical advice and have not been evaluated by
            any regulatory authority. Do not use JMM to diagnose or treat any
            injury, illness, or medical condition. Always seek the advice of a
            qualified health professional with any questions regarding a medical
            condition, and before beginning any new training or nutrition program.
          </p>

          <h2>3. Your responsibilities</h2>
          <ul>
            <li>
              You acknowledge you are physically able to take part in the training
              JMM prescribes, or have cleared it with a medical professional.
            </li>
            <li>
              Training carries inherent risk of injury. You train voluntarily and
              accept that risk.
            </li>
            <li>
              You will stop and seek professional assessment for pain that changes
              how you move, chest pain, dizziness, or symptoms of illness.
            </li>
          </ul>

          <h2>4. Data you provide and connect</h2>
          <p>
            JMM stores the profile, check-in, and training data you enter, and —
            only when you explicitly connect a provider (WHOOP, Strava, Oura,
            Google Calendar and others) — retrieves your data from that provider
            under the permissions you grant. Each connection belongs to your
            account alone; you can disconnect at any time from the Connections
            page. We do not sell your data. See our{" "}
            <Link href="/privacy" className="underline text-ocean-700">
              Privacy Policy
            </Link>{" "}
            for storage and retention details.
          </p>

          <h2>5. Third-party content and AI features</h2>
          <p>
            Some answers are produced by an AI assistant grounded in your data and
            cited research. AI output can be incomplete or wrong: verify anything
            important, and treat supplement information as educational, not as a
            recommendation to use any product. JMM cites published research where
            available; it does not claim that following its plans will produce any
            specific result or prevent injury or illness.
          </p>

          <h2>6. Billing (when enabled)</h2>
          <p>
            Paid plans, when offered, renew automatically until cancelled from your
            account settings. Fees are stated at signup. You may cancel at any
            time; access continues to the end of the paid period.
          </p>

          <h2>7. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, JMM is provided &quot;as
            is&quot; without warranties of any kind, and we are not liable for any
            injury, loss, or damage arising from use of the app or reliance on its
            output. Our total liability is limited to the amount you paid us in
            the 12 months before the claim.
          </p>

          <h2>8. Contact</h2>
          <p>
            Questions about these terms: <strong>coach@jasmiamimethod.com</strong>
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
