/** Browser dictation only creates a draft; every failure must keep typing available. */
export function coachDictationError(error: string, es: boolean): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
    case "NotAllowedError":
    case "SecurityError":
      return es
        ? "El navegador bloqueó el dictado. Puedes escribir o revisar los permisos del micrófono y reconocimiento de voz en tu navegador antes de intentarlo de nuevo. No se ha enviado nada."
        : "Your browser blocked dictation. You can type, or check your browser’s microphone and speech-recognition permissions before trying again. Nothing was sent.";
    case "audio-capture":
      return es
        ? "No se pudo acceder al micrófono. Comprueba que está conectado y disponible, o escribe tu mensaje. No se ha enviado nada."
        : "The microphone is unavailable. Check that it is connected and available, or type your message. Nothing was sent.";
    case "no-speech":
      return es
        ? "No se detectó voz. Puedes intentar dictar de nuevo o escribir tu mensaje. No se ha enviado nada."
        : "No speech was detected. Try dictation again or type your message. Nothing was sent.";
    case "network":
      return es
        ? "El servicio de dictado no pudo conectarse. Revisa cualquier transcripción o escribe tu mensaje. No se ha enviado nada."
        : "The dictation service could not connect. Review any transcript or type your message. Nothing was sent.";
    default:
      return es
        ? "El dictado no pudo iniciarse o se interrumpió. Revisa cualquier transcripción o escribe tu mensaje. No se ha enviado nada."
        : "Dictation could not start or was interrupted. Review any transcript or type your message. Nothing was sent.";
  }
}
