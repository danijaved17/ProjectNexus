"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ScoresPanel from "./ScoresPanel";
import { ChatMessage, ScoresPayload } from "@/hooks/useChat";

const SESSION_LIMIT = 5;

// ---------------------------------------------------------------------------
// Prompt counter dots
// ---------------------------------------------------------------------------
function PromptCounter({ used, isMaster }: { used: number; isMaster: boolean }) {
  if (isMaster) {
    return <span className="text-[#7c6bf0] text-xs font-medium">∞ Master</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#555]">
      {Array.from({ length: SESSION_LIMIT }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < used ? "bg-[#7c6bf0]" : "bg-[#333]"}`}
        />
      ))}
      <span className="ml-1">{used} / {SESSION_LIMIT} prompts used</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared send icon
// ---------------------------------------------------------------------------
function SendIcon({ isLoading }: { isLoading: boolean }) {
  if (isLoading) return <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />;
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Centered landing input — miniaturized, expands on focus/type
// ---------------------------------------------------------------------------
interface LandingInputProps {
  input: string;
  isLoading: boolean;
  promptsUsed: number;
  isMaster: boolean;
  globalRemaining: number | null;
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}

function LandingInput({ input, isLoading, promptsUsed, isMaster, globalRemaining, onChange, onKeyDown, onSend }: LandingInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const limitReached = !isMaster && (promptsUsed >= SESSION_LIMIT || (globalRemaining !== null && globalRemaining <= 0));
  const active = focused || input.length > 0;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [input]);

  return (
    <div className={`w-full max-w-xl mx-auto transition-all duration-300 ${active ? "scale-100" : "scale-95"}`}>
      <div
        className={`flex items-end gap-3 bg-[#1a1a1a] border rounded-2xl px-4 py-3 transition-all duration-200 ${
          active ? "border-[#7c6bf0]/50 shadow-lg shadow-[#7c6bf0]/10" : "border-[#252525]"
        }`}
      >
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={limitReached ? "Demo limit reached." : "Ask anything..."}
          disabled={isLoading || limitReached}
          rows={1}
          style={{ lineHeight: "1.5", maxHeight: "128px", resize: "none" }}
          className="flex-1 bg-transparent text-[#f0f0f0] placeholder-[#3a3a3a] text-sm outline-none disabled:opacity-50 overflow-y-auto"
        />
        <button
          onClick={onSend}
          disabled={isLoading || !input.trim() || limitReached}
          className={`shrink-0 w-8 h-8 rounded-xl bg-[#7c6bf0] text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#6a59e0] transition-all duration-200 ${
            active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
          }`}
        >
          <SendIcon isLoading={isLoading} />
        </button>
      </div>
      <div className={`flex items-center justify-between mt-2 px-1 transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}>
        <PromptCounter used={promptsUsed} isMaster={isMaster} />
        <span className="text-[#333] text-xs">
          {limitReached ? "Open a new tab for a fresh session." : "Enter to send · Shift+Enter for newline"}
        </span>
      </div>
      {!isMaster && globalRemaining !== null && (
        <p className={`text-center text-xs mt-3 ${globalRemaining <= 5 ? "text-amber-500/70" : "text-[#444]"}`}>
          {globalRemaining > 0 ? `${globalRemaining} demo prompts remaining globally` : "Demo capacity reached — check back later"}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom input bar (used when conversation is active)
// ---------------------------------------------------------------------------
interface InputBarProps {
  input: string;
  isLoading: boolean;
  promptsUsed: number;
  isMaster: boolean;
  globalRemaining: number | null;
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}

function InputBar({ input, isLoading, promptsUsed, isMaster, globalRemaining, onChange, onKeyDown, onSend }: InputBarProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const limitReached = !isMaster && (promptsUsed >= SESSION_LIMIT || (globalRemaining !== null && globalRemaining <= 0));

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [input]);

  return (
    <div className="px-4 md:px-6 py-4 border-t border-[#2a2a2a]">
      <div className="flex items-end gap-3 bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl px-4 py-3 focus-within:border-[#7c6bf0]/50 transition-colors">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={limitReached ? "Demo limit reached." : "Ask anything..."}
          disabled={isLoading || limitReached}
          rows={1}
          style={{ lineHeight: "1.5", maxHeight: "128px", resize: "none" }}
          className="flex-1 bg-transparent text-[#f0f0f0] placeholder-[#444] text-sm outline-none disabled:opacity-50 overflow-y-auto"
        />
        <button
          onClick={onSend}
          disabled={isLoading || !input.trim() || limitReached}
          className="shrink-0 w-8 h-8 rounded-xl bg-[#7c6bf0] text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#6a59e0] transition-colors"
        >
          <SendIcon isLoading={isLoading} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <PromptCounter used={promptsUsed} isMaster={isMaster} />
        <span className="text-[#333] text-xs">
          {limitReached ? "Open a new tab to start a fresh session." : "Enter to send · Shift+Enter for newline"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------
interface LandingViewProps extends LandingInputProps {
  onSendDirect: (p: string) => void;
}

function LandingView({ onSendDirect, ...inputProps }: LandingViewProps) {
  const suggestions = [
    "Explain quantum entanglement simply",
    "What's the best way to learn system design?",
    "Write a short poem about AI",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
      <div className="w-full max-w-xl text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-[#f0f0f0] mb-3 tracking-tight">
          Nexus
        </h1>
        <p className="text-base text-[#7c6bf0] font-medium mb-4">
          Three models compete. One wins.
        </p>
        <p className="text-[#555] text-sm leading-relaxed mb-8 max-w-sm mx-auto">
          Your prompt hits GPT-4o mini, Claude Haiku, and Gemini Flash simultaneously.
          An AI judge scores each and surfaces the best — with full transparency.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {["GPT-4o mini", "Claude Haiku", "Gemini Flash"].map((m) => (
            <span key={m} className="border border-[#222] text-[#444] rounded-full px-3 py-1 text-xs">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Centered expanding input */}
      <LandingInput {...inputProps} />

      {/* Suggestions */}
      <div className="flex flex-col gap-2 items-center mt-6">
        {suggestions.map((p) => (
          <button
            key={p}
            onClick={() => onSendDirect(p)}
            className="text-xs text-[#555] border border-[#1e1e1e] rounded-xl px-4 py-2 hover:border-[#3a3a3a] hover:text-[#888] transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPanel
// ---------------------------------------------------------------------------
interface Props {
  messages: ChatMessage[];
  streamingText: string;
  isLoading: boolean;
  error: string | null;
  terms: string[];
  scores: ScoresPayload | null;
  followUp: string | null;
  promptsUsed: number;
  isMaster: boolean;
  globalRemaining: number | null;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onSend: (prompt: string) => void;
}

export default function ChatPanel({
  messages,
  streamingText,
  isLoading,
  error,
  terms,
  scores,
  followUp,
  promptsUsed,
  isMaster,
  globalRemaining,
  sidebarOpen,
  onOpenSidebar,
  onSend,
}: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const isLanding = messages.length === 0 && !isLoading;

  // Track whether the user has manually scrolled away from the bottom
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledRef.current = distFromBottom > 80;
  }

  // When a new send starts, snap back to bottom
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (isLoading && !prevLoadingRef.current) {
      userScrolledRef.current = false;
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  // Auto-scroll only when user hasn't scrolled away
  useEffect(() => {
    if (!userScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    onSend(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTermClick(term: string) {
    setInput(`Explain "${term}" in simple terms`);
  }

  const globalLocked = !isMaster && globalRemaining !== null && globalRemaining <= 0;

  const inputProps = {
    input,
    isLoading,
    promptsUsed,
    isMaster,
    globalRemaining,
    onChange: setInput,
    onKeyDown: handleKeyDown,
    onSend: handleSend,
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Top bar */}
      <div className={`flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] ${sidebarOpen ? "md:hidden" : ""}`}>
        <div className="flex items-center">
          <button
            onClick={onOpenSidebar}
            className="text-[#555] hover:text-[#f0f0f0] transition-colors mr-3"
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-[#888] text-sm font-medium">Nexus</span>
        </div>
        {!isMaster && globalRemaining !== null && (
          <span className={`text-xs tabular-nums ${globalRemaining <= 5 ? "text-amber-500/80" : "text-[#444]"}`}>
            {globalRemaining} prompts left
          </span>
        )}
      </div>

      {/* Global lockout screen */}
      {globalLocked ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-10 h-10 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-[#555]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-[#f0f0f0] text-base font-semibold mb-2">Demo Capacity Reached</h2>
          <p className="text-[#555] text-sm max-w-xs leading-relaxed">
            The demo has hit its prompt limit. The developer will reset it soon — check back later.
          </p>
        </div>
      ) : isLanding ? (
        <LandingView {...inputProps} onSendDirect={onSend} />
      ) : (
        <>
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                terms={msg.role === "assistant" ? terms : []}
                onTermClick={handleTermClick}
              />
            ))}

            {isLoading && (
              <MessageBubble role="assistant" content={streamingText} isStreaming />
            )}

            {error && (
              <div className="flex justify-start mb-4">
                <div className="bg-red-900/30 border border-red-800 text-red-400 rounded-2xl px-4 py-3 text-sm max-w-[85%] md:max-w-[70%]">
                  {error}
                </div>
              </div>
            )}

            {scores && (
              <div className="md:hidden mt-4">
                <ScoresPanel scores={scores} followUp={followUp} onFollowUp={onSend} inline />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <InputBar {...inputProps} />
        </>
      )}
    </div>
  );
}
