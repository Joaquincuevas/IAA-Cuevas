"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, RefreshCw } from "lucide-react";
import { taulaChat } from "@/lib/api";
import { getUser } from "@/lib/auth";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "¿Qué cursos cubren el perfil PE2: Diseño de soluciones?",
  "Detecta brechas en comunicación oral para Industrial",
  "Cursos sin pre-requisitos directos pero con muchas salidas",
  "Compara cobertura entre Civil e Informática",
];

function formatContent(text: string) {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {line}
      {i < text.split("\n").length - 1 && <br />}
    </span>
  ));
}

export default function TaulaPage() {
  const user = getUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await taulaChat(msg, history);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "No se pudo contactar a Taula."}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setMessages([]);
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const initial = user?.name?.charAt(0) ?? "J";

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-9 py-5 border-b border-[#E5E7EB]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Taula</h1>
            <span className="text-[11px] font-medium px-2.5 py-0.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-md text-[#6B7280]">
              IA · Llama
            </span>
          </div>
          <p className="text-[14px] text-[#6B7280] mt-1">
            Asistente de análisis curricular · Facultad de Ingeniería UAndes
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 text-[13px] text-[#6B7280] hover:text-[#111827] transition-colors"
        >
          <RefreshCw size={15} /> Nueva conversación
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-9 py-6 space-y-5">
        {/* Welcome message */}
        <div className="flex items-start gap-3 max-w-xl">
          <div className="w-7 h-7 rounded-full bg-[#1B2A4A] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={12} className="text-white" />
          </div>
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-3">
            <p className="text-[14.5px] text-[#111827] leading-relaxed">
              Hola {user?.name ?? "estudiante"}. Soy Taula, tu asistente curricular. Puedo ayudarte a explorar conexiones
              entre cursos, evaluar cobertura del perfil de egreso, detectar redundancias y responder
              preguntas sobre los 672 objetivos de aprendizaje de Ingeniería UAndes. ¿Por dónde partimos?
            </p>
            <p className="text-[10px] text-[#9CA3AF] mt-2">✦ Taula · ahora</p>
          </div>
        </div>

        {/* Chat messages */}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            {m.role === "assistant" ? (
              <div className="w-7 h-7 rounded-full bg-[#1B2A4A] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles size={12} className="text-white" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#111827] flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-white">{initial}</span>
              </div>
            )}
            <div
              className={`max-w-xl rounded-xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-[#111827] text-white"
                  : "bg-[#F9FAFB] border border-[#E5E7EB] text-[#111827]"
              }`}
            >
              <p className="text-[14.5px] leading-relaxed">{formatContent(m.content)}</p>
              {m.role === "assistant" && (
                <p className="text-[10px] text-[#9CA3AF] mt-2">✦ Taula · ahora</p>
              )}
            </div>
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div className="flex items-start gap-3 max-w-xl">
            <div className="w-7 h-7 rounded-full bg-[#1B2A4A] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles size={12} className="text-white" />
            </div>
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-3">
              <div className="flex gap-1 items-center h-5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions (shown only when no messages yet) */}
      {messages.length === 0 && (
        <div className="px-9 pb-5 flex flex-wrap gap-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-[13px] px-4 py-2 border border-[#E5E7EB] rounded-full text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-9 pb-7 pt-3 border-t border-[#E5E7EB]">
        <div className="flex items-center gap-2.5 border border-[#E5E7EB] rounded-2xl px-5 py-3 focus-within:border-[#1B2A4A] transition-colors">
          <input
            type="text"
            placeholder="Pregunta a Taula sobre la malla curricular…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            className="flex-1 text-[15px] outline-none bg-transparent placeholder-[#9CA3AF]"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-[#111827] flex items-center justify-center disabled:opacity-40 hover:bg-[#1f2937] transition-colors flex-shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
