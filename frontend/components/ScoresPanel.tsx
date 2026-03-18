import { ScoresPayload } from "@/hooks/useChat";

interface Props {
  scores: ScoresPayload | null;
  followUp: string | null;
  onFollowUp: (question: string) => void;
  inline?: boolean;
}

export default function ScoresPanel({ scores, followUp, onFollowUp, inline = false }: Props) {
  if (!scores) return null;

  const sorted = [...scores.responses].sort((a, b) => {
    if (a.is_winner) return -1;
    if (b.is_winner) return 1;
    return b.score - a.score;
  });

  const maxScore = Math.max(...sorted.map((r) => r.score));

  return (
    <div className={inline ? "w-full border-t border-[#1e1e1e] bg-[#0f0f0f]" : "w-72 border-l border-[#1e1e1e] bg-[#0f0f0f] flex flex-col overflow-y-auto"}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <p className="text-[#888] text-[10px] font-semibold uppercase tracking-widest mb-0.5">
          Round Results
        </p>
        <h2 className="text-[#f0f0f0] text-sm font-semibold">Model Scores</h2>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-2.5">
        {sorted.map((r, idx) => (
          <div
            key={r.model}
            className={`rounded-2xl p-4 transition-all ${
              r.is_winner
                ? "bg-[#1a1830] border border-[#7c6bf0]/30"
                : "bg-[#141414] border border-[#1e1e1e]"
            }`}
          >
            {/* Model name + badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    r.is_winner ? "bg-[#7c6bf0]" : idx === 1 ? "bg-[#444]" : "bg-[#2a2a2a]"
                  }`}
                />
                <span className={`text-xs font-medium ${r.is_winner ? "text-[#f0f0f0]" : "text-[#666]"}`}>
                  {r.model}
                </span>
              </div>
              {r.is_winner ? (
                <span className="text-[10px] bg-[#7c6bf0] text-white px-2 py-0.5 rounded-full font-semibold tracking-wide">
                  Winner
                </span>
              ) : (
                <span className="text-[10px] text-[#444]">#{idx + 1}</span>
              )}
            </div>

            {/* Score */}
            <div className="flex items-end justify-between mb-2.5">
              <span className={`text-2xl font-bold tabular-nums ${r.is_winner ? "text-[#7c6bf0]" : "text-[#444]"}`}>
                {r.score}
              </span>
              <span className="text-[#444] text-xs pb-0.5">{r.latency_ms}ms</span>
            </div>

            {/* Score bar */}
            <div className="h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  r.is_winner ? "bg-[#7c6bf0]" : "bg-[#333]"
                }`}
                style={{ width: `${(r.score / maxScore) * 100}%` }}
              />
            </div>
          </div>
        ))}

        {/* Judge reason */}
        <div className="rounded-2xl bg-[#141414] border border-[#1e1e1e] px-4 py-4 mt-1">
          <p className="text-[#444] text-[10px] font-semibold uppercase tracking-widest mb-2">
            Judge's Reasoning
          </p>
          <p className="text-[#777] text-xs leading-relaxed">{scores.judge_reason}</p>
        </div>

        {/* Follow-up */}
        {followUp && (
          <div className="rounded-2xl bg-[#141414] border border-[#1e1e1e] px-4 py-4">
            <p className="text-[#444] text-[10px] font-semibold uppercase tracking-widest mb-2.5">
              Continue exploring
            </p>
            <button
              onClick={() => onFollowUp(followUp)}
              className="w-full text-left text-xs text-[#7c6bf0] bg-[#1a1830] border border-[#7c6bf0]/20 rounded-xl px-3 py-2.5 hover:bg-[#1e1e42] hover:border-[#7c6bf0]/40 transition-colors leading-relaxed"
            >
              {followUp}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
