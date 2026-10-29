"use client";
import { useRef,useState } from "react";
import { useAuth } from "@/components/auth";
import { PUBLIC_CONTACT_EMAIL } from "@/lib/public-contact";

type FormState = { name: string; email: string; topic: "demo" | "coaching" | "partnership" | "question"; message: string; consent: boolean; website: string };
const initial: FormState = { name: "", email: "", topic: "demo", message: "", consent: false, website: "" };
export function PublicInquiryForm() {
  const { language } = useAuth();
  const es = language === "es";
  const [form, setForm] = useState<FormState>(initial);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const lock=useRef(false),requestId=useRef("");
  const [unconfirmed,setUnconfirmed]=useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(previous => ({ ...previous, [key]: value }));
  // Never put the inquiry text, identity or possible health details into a URL.
  const emailDraft = "mailto:" + PUBLIC_CONTACT_EMAIL;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();if(lock.current||unconfirmed)return;lock.current=true;
    if(!requestId.current)requestId.current=crypto.randomUUID();
    setError(""); setSuccess(""); setSending(true);
    let receiptRead=false;
    try {
      const res = await fetch("/api/public-inquiry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...form,requestId:requestId.current}),signal:AbortSignal.timeout(20000),
      });
      const result: { ok?: boolean; state?:string;code?:string;channel?: "telegram" | "smtp"; message?: string; error?: string } = await res.json();
      receiptRead=true;
      if(result.state==="unknown"||result.state==="pending"||result.code==="receipt_unavailable")setUnconfirmed(true);
      if (!res.ok || result.ok !== true) {
        const translated=result.code==="delivery_unconfirmed"||result.code==="receipt_unavailable"?"El resultado es incierto. No repitas el envío; puede haber sido aceptado.":result.code==="delivery_unavailable"?"El envío en línea no está disponible. Usa la opción de correo.":res.status===409?"Esta solicitud contiene otros datos. Recarga antes de iniciar una consulta nueva.":res.status===429?"Has alcanzado el límite de intentos. Usa la opción de correo.":res.status===413?"El mensaje es demasiado largo. Reduce su tamaño.":res.status===403?"Abre este formulario en el sitio web de JMM.":res.status===400?"Comprueba los campos y el consentimiento de respuesta.":"No se pudo confirmar el envío. Usa la opción de correo si lo necesitas.";
        throw new Error(es?translated:result.error||"Delivery could not be confirmed.");
      }
      if(result.state!=="accepted"||!["telegram","smtp"].includes(result.channel||"")){setUnconfirmed(true);throw Error(es?"No se pudo verificar el comprobante de envío. No repitas el envío.":"The delivery receipt could not be verified. Do not repeat the submission.");}
      setSuccess(result.channel === "telegram"
        ? (es ? "El canal de Telegram del administrador aceptó la consulta. No confirma que se haya leído." : "The administrator Telegram channel accepted the inquiry. This does not confirm it was read.")
        : (es ? "El proveedor de correo aceptó la solicitud. Esto no confirma su llegada a la bandeja." : "Our mail provider accepted the inquiry. This does not confirm inbox delivery."));
      setForm(initial);
      requestId.current="";
    } catch (failure) {
      setError(!receiptRead?(es?"El resultado es incierto. No repitas el envío; puede haber sido aceptado.":"The delivery outcome is uncertain. Do not repeat the submission; it may have been accepted."):failure instanceof Error?failure.message:(es?"No se confirmó el envío.":"Delivery not confirmed."));
      if(!receiptRead)setUnconfirmed(true);
    } finally { lock.current=false;setSending(false); }
  }
  return <form className="card p-6 space-y-4" onSubmit={submit}>
    <h2 className="font-display font-bold text-xl">{es ? "Envíanos un mensaje" : "Send an inquiry"}</h2>
    <p className="text-sm text-ink-600">{es ? "Para demostraciones, información del coaching y colaboraciones. No compartas historiales médicos, contraseñas ni datos clínicos." : "For demonstrations, coaching questions and partnerships. Do not send health records, passwords or clinical details."}</p>
    <div className="grid sm:grid-cols-2 gap-4">
      <label className="block text-sm font-semibold" htmlFor="public-name">{es ? "Nombre" : "Name"}
        <input id="public-name" className="input mt-2 w-full" required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={e => set("name", e.target.value)} />
      </label>
      <label className="block text-sm font-semibold" htmlFor="public-email">{es ? "Correo para responder" : "Reply email"}
        <input id="public-email" type="email" className="input mt-2 w-full" required maxLength={254} autoComplete="email" value={form.email} onChange={e => set("email", e.target.value)} />
      </label>
    </div>
    <label className="block text-sm font-semibold" htmlFor="public-topic">{es ? "Motivo" : "Topic"}
      <select id="public-topic" className="input mt-2 w-full" value={form.topic} onChange={e => set("topic", e.target.value as FormState["topic"])}>
        <option value="demo">{es ? "Demostración de JMM" : "JMM demonstration"}</option>
        <option value="coaching">{es ? "Coaching personal" : "Personal coaching"}</option>
        <option value="partnership">{es ? "Colaboración" : "Partnership"}</option>
        <option value="question">{es ? "Pregunta general" : "General question"}</option>
      </select>
    </label>
    <label className="block text-sm font-semibold" htmlFor="public-message">{es ? "Tu mensaje" : "Your message"}
      <textarea id="public-message" className="input mt-2 w-full" rows={6} required minLength={20} maxLength={1500} value={form.message} onChange={e => set("message", e.target.value)} />
    </label>
    <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
      <label htmlFor="public-website">Website</label>
      <input id="public-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set("website", e.target.value)} />
    </div>
    <label className="flex items-start gap-3 text-sm text-ink-700">
      <input type="checkbox" className="mt-1" required checked={form.consent} onChange={e => set("consent", e.target.checked)} />
      <span>{es ? "Acepto enviar estos datos al canal de Telegram del administrador o al buzón de JMM para responder. He leído la " : "I consent to sending these details to the JMM administrator Telegram channel or business mailbox so the team can respond. I have read the "}
        <a href={es?"/es/privacy":"/privacy"} className="underline font-semibold text-ocean-700">{es ? "política de privacidad" : "privacy policy"}</a>.</span>
    </label>
    <p className="text-xs text-ink-600">{es?"Guardamos un comprobante mínimo del consentimiento y del estado del envío para evitar duplicados. No te suscribes a publicidad.":"We keep a minimal consent and delivery-status record to prevent duplicate sends. This does not subscribe you to marketing."}</p>
    <button disabled={sending||unconfirmed} type="submit" className="btn-primary">{sending ? (es ? "Enviando…" : "Submitting…") : (es ? "Enviar solicitud" : "Send inquiry")}</button>
    {unconfirmed&&<p role="status">{es?"El resultado del envío es incierto. No se reenviará automáticamente; no lo envíes repetidamente. Puedes contactar por correo si lo necesitas.":"The delivery outcome is uncertain. It will not be resent automatically; do not repeatedly submit. You can contact us by email if needed."}</p>}
    {success && <p role="status" className="text-sm text-emerald-800">{success}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="border-t border-ink-200 pt-4 space-y-2">
      <p className="text-sm text-ink-600">{es ? "Alternativa sin formulario: abre un borrador en tu aplicación de correo. Debes enviarlo manualmente." : "No-form alternative: open a draft in your email app and send it yourself."}</p>
      <a className="underline font-semibold text-ocean-700 break-all" href={emailDraft}>{es ? "Abrir borrador de correo" : "Open email draft"} → {PUBLIC_CONTACT_EMAIL}</a>
    </div>
  </form>;
}
