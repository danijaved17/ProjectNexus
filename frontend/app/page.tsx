"use client";

import { useEffect, useState } from "react";
import { useChat } from "@/hooks/useChat";
import ConversationSidebar from "@/components/ConversationSidebar";
import ChatPanel from "@/components/ChatPanel";
import ScoresPanel from "@/components/ScoresPanel";

export default function Home() {
  const {
    messages,
    streamingText,
    scores,
    followUp,
    terms,
    isLoading,
    conversationId,
    conversations,
    error,
    promptsUsed,
    isMaster,
    globalRemaining,
    sendMessage,
    resetChat,
    loadConversation,
    removeConversation,
  } = useChat();

  // Default closed on mobile, open on desktop — resolved client-side to avoid SSR mismatch
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    setSidebarOpen(window.innerWidth >= 768);
  }, []);

  return (
    <div className="flex h-dvh bg-[#0f0f0f] overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeId={conversationId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id, msgs) => loadConversation(id, msgs)}
        onDelete={removeConversation}
        onNewChat={resetChat}
      />

      <ChatPanel
        messages={messages}
        streamingText={streamingText}
        isLoading={isLoading}
        error={error}
        terms={terms}
        scores={scores}
        followUp={followUp}
        promptsUsed={promptsUsed}
        isMaster={isMaster}
        globalRemaining={globalRemaining}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={() => setSidebarOpen(true)}
        onSend={sendMessage}
      />

      {/* Scores panel: only renders when there's content, hidden on mobile */}
      {scores && (
        <div className="hidden md:block">
          <ScoresPanel
            scores={scores}
            followUp={followUp}
            onFollowUp={sendMessage}
          />
        </div>
      )}
    </div>
  );
}
