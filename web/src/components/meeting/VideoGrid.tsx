"use client";

import { VideoTile } from "./VideoTile";
import { cn } from "@/lib/utils/cn";
import type { Participant } from "@/lib/types";

export interface VideoGridProps {
  participants: Participant[];
  streams: Map<string, MediaStream>;
  localStream: MediaStream | null;
  selfId: string | null;
  activeSpeakerId: string | null;
}

/**
 * §6.7 layouts: 1 -> single centered tile · 2 -> side by side · 3-4 -> 2x2 ·
 * 5-6 -> 3x2. Six is the ceiling because §5.1 caps the mesh there, so no
 * layout beyond 3x2 can occur.
 *
 * §7.4 collapses to 2-col below `lg` and 1-col below `sm`.
 */
function gridClassFor(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-5xl";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 4) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

export function VideoGrid({
  participants,
  streams,
  localStream,
  selfId,
  activeSpeakerId,
}: VideoGridProps) {
  return (
    <div className="grid min-h-0 flex-1 place-content-center overflow-auto p-4">
      <div
        className={cn(
          "grid w-full gap-3",
          gridClassFor(participants.length),
        )}
      >
        {participants.map((participant) => {
          const isSelf = participant.id === selfId;
          return (
            <VideoTile
              key={participant.id}
              participant={participant}
              // Self renders the local camera directly — round-tripping our own
              // media through a peer connection would add needless latency.
              stream={isSelf ? localStream : (streams.get(participant.id) ?? null)}
              isSelf={isSelf}
              isActiveSpeaker={participant.id === activeSpeakerId}
            />
          );
        })}
      </div>
    </div>
  );
}
