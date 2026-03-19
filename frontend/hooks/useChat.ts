"use client";

import { useState, useRef, useEffect } from "react";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ModelScore {
  model: string;
  score: number;
  latency_ms: number;
  is_winner: boolean;
  content: string;
}

export interface ScoresPayload {
  responses: ModelScore[];
  judge_reason: string;
}

// ---------------------------------------------------------------------------
// Session helpers — stored in sessionStorage (tab-scoped)
// ---------------------------------------------------------------------------

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem("nexus_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("nexus_session_id", id);
  }
  return id;
}

function getMasterKey(): string {
  return sessionStorage.getItem("nexus_master_key") ?? "";
}

function getPromptsUsed(): number {
  return parseInt(sessionStorage.getItem("nexus_prompts_used") ?? "0", 10);
}

function setPromptsUsed(n: number) {
  sessionStorage.setItem("nexus_prompts_used", String(n));
}

// ---------------------------------------------------------------------------

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [terms, setTerms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptsUsed, setPromptsUsedState] = useState(0);
  const [isMaster, setIsMaster] = useState(false);
  const [globalRemaining, setGlobalRemaining] = useState<number | null>(null);

  // Ref so the streaming text is always current inside the async closure
  const streamingRef = useRef("");

  // On mount: read session state + handle ?master=KEY URL param
  useEffect(() => {
    // Fetch global remaining quota
    fetch(`${BACKEND}/demo/status`)
      .then((r) => r.json())
      .then((d) => setGlobalRemaining(d.remaining ?? null))
      .catch(() => {});

    // Initialise prompt counter from storage
    setPromptsUsedState(getPromptsUsed());

    // Check for master key in URL: ?master=KEY
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get("master");
    if (urlKey) {
      sessionStorage.setItem("nexus_master_key", urlKey);
      // Strip from URL without triggering a navigation
      params.delete("master");
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
      history.replaceState(null, "", newUrl);
    }

    setIsMaster(!!getMasterKey());
  }, []);

  async function sendMessage(prompt: string) {
    setError(null);
    setIsLoading(true);
    setStreamingText("");
    setScores(null);
    setFollowUp(null);
    setTerms([]);
    streamingRef.current = "";

    // Optimistically add the user message immediately
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Session-Id": getOrCreateSessionId(),
      };
      const masterKey = getMasterKey();
      if (masterKey) headers["X-Master-Key"] = masterKey;

      const res = await fetch(`${BACKEND}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          conversation_id: conversationId ?? undefined,
        }),
      });

      // Handle non-200 before trying to read the stream
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = body.detail ?? "";
        } catch {
          // ignore parse errors
        }

        if (res.status === 429) {
          if (detail === "session_limit") {
            setError("You've used all 5 demo prompts for this session. Open a new browser tab to start a fresh session.");
          } else if (detail === "global_limit") {
            setGlobalRemaining(0);
            setError("Demo capacity reached. The developer will reset this soon — check back later!");
          } else {
            setError("Rate limit reached.");
          }
        } else {
          setError(`Request failed (${res.status})`);
        }
        setIsLoading(false);
        return;
      }

      // Sync prompts-used from response header (only set for non-master)
      const serverCount = res.headers.get("X-Prompts-Used");
      if (serverCount !== null) {
        const n = parseInt(serverCount, 10);
        setPromptsUsed(n);
        setPromptsUsedState(n);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Manual SSE parsing — split on newlines, track current event type
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice("event:".length).trim();
          } else if (line.startsWith("data:")) {
            const raw = line.slice("data:".length).trim();
            if (!raw || raw === "{}") {
              // done event has empty data
              if (currentEvent === "done") {
                // Finalize: move accumulated streaming text into messages
                const finalContent = streamingRef.current;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: finalContent,
                  },
                ]);
                setStreamingText("");
                setIsLoading(false);
              }
              currentEvent = "";
              continue;
            }

            try {
              const payload = JSON.parse(raw);

              if (currentEvent === "token") {
                streamingRef.current += payload.text;
                setStreamingText(streamingRef.current);
              } else if (currentEvent === "scores") {
                setScores(payload);
              } else if (currentEvent === "follow_up") {
                setFollowUp(payload.question);
              } else if (currentEvent === "terms") {
                setTerms(payload.terms ?? []);
              } else if (currentEvent === "error") {
                setError(payload.message);
                setIsLoading(false);
              }
            } catch {
              // Malformed JSON in data line — skip
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setStreamingText("");
    setScores(null);
    setFollowUp(null);
    setTerms([]);
    setConversationId(null);
    setError(null);
    setIsLoading(false);
    streamingRef.current = "";
  }

  function loadConversation(id: string, loadedMessages: ChatMessage[]) {
    setConversationId(id);
    setMessages(loadedMessages);
    setStreamingText("");
    setScores(null);
    setFollowUp(null);
    setError(null);
  }

  return {
    messages,
    streamingText,
    scores,
    followUp,
    terms,
    isLoading,
    conversationId,
    error,
    promptsUsed,
    isMaster,
    globalRemaining,
    sendMessage,
    resetChat,
    loadConversation,
    setConversationId,
  };
}
