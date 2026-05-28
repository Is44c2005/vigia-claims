import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "../lib/api";

interface Msg { role: "user" | "assistant"; content: string; }

const QUICK = [
  ["Top 10 Riesgosos",   "¿Cuáles son los 10 siniestros con mayor riesgo?"],
  ["Proveedores",        "¿Qué proveedores concentran el 80% de las alertas rojas?"],
  ["Patrones",           "¿Qué patrones se repiten entre los siniestros sospechosos?"],
  ["Resumen Ejecutivo",  "Genera un resumen ejecutivo de los casos críticos"],
] as const;

const SESSION_KEY = "vigia_session_id";

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) { id = uuidv4(); sessionStorage.setItem(SESSION_KEY, id); }
  return id;
}

function renderText(content: string) {
  const stripped = content
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^[-•]\s+/gm, "  · ");
  return stripped;
}

export default function ChatIA() {
  const [msgs,    setMsgs]    = useState<Msg[]>([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const sessionId = useRef(getSessionId());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    setMsgs((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.chat(sessionId.current, text);
      setMsgs((prev) => [...prev, { role: "assistant", content: res.response }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function resetChat() {
    await api.resetChat(sessionId.current).catch(() => null);
    setMsgs([]);
    setError(null);
  }

  return (
    <div className="flex flex-col h-full min-h-[560px]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-text font-semibold">Chat con VigIA</h2>
          <p className="text-accent text-xs">Powered by GPT-4o · Preguntas en lenguaje natural</p>
        </div>
        <button onClick={resetChat}
          className="text-xs border border-surface2 text-accent hover:text-text px-3 py-1.5 rounded transition-colors">
          Reiniciar
        </button>
      </div>

      {/* Preguntas rápidas */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK.map(([label, q]) => (
          <button key={label} onClick={() => sendMessage(q)}
            className="text-xs bg-surface hover:bg-surface2 border border-surface2 text-accent px-3 py-1.5 rounded-full transition-colors">
            {label}
          </button>
        ))}
      </div>

      {/* Historial de mensajes */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {msgs.length === 0 && (
          <p className="text-[#555] text-sm text-center pt-8">
            Usa las preguntas rápidas o escribe lo que necesitas analizar.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "bg-surface border border-surface2 rounded-2xl rounded-br-sm px-4 py-3 max-w-[70%] text-text text-sm"
                  : "bg-[#162035] border-l-2 border-rojo rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] text-text text-sm whitespace-pre-wrap"
              }
            >
              {m.role === "assistant" && (
                <p className="text-rojo text-[10px] font-bold uppercase tracking-wider mb-1.5">VigIA</p>
              )}
              {m.role === "user" && (
                <p className="text-accent text-[10px] font-bold uppercase tracking-wider mb-1.5">Analista</p>
              )}
              {renderText(m.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#162035] border-l-2 border-rojo rounded-2xl rounded-bl-sm px-4 py-3 text-accent text-sm animate-pulse">
              VigIA está analizando…
            </div>
          </div>
        )}
        {error && (
          <p className="text-rojo text-sm text-center">
            Error: {error}. ¿Está configurada la OPENAI_API_KEY?
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="Ej: ¿Por qué SIN-0064 fue marcado como Rojo?"
          disabled={loading}
          className="flex-1 bg-surface2 text-text text-sm rounded-xl px-4 py-2.5 border border-surface2 focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="bg-rojo hover:bg-red-700 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
