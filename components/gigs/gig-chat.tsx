"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { queryKeys } from "@/lib/queries/keys";
import { useGigChatMessagesQuery, useSendGigChatMessageMutation } from "@/lib/queries/gigs";
import { formatRelativeTime } from "@/lib/utils/format";

export function GigChat({ threadId }: { threadId: string }) {
  const { user } = useCurrentUser();
  const toast = useUiToast();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();
  const messagesQuery = useGigChatMessagesQuery(threadId);
  const sendMessageMutation = useSendGigChatMessageMutation(threadId);

  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`gigs-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gig_chat_messages",
          filter: `thread_id=eq.${threadId}`
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.gigChatMessages(threadId) });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, supabase, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data?.length]);

  return (
    <section className="flex h-[calc(100vh-11.5rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.82)]">
      <div className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {messagesQuery.isLoading ? (
          <div className="inline-flex items-center text-sm text-[color:var(--muted)]">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            Loading chat...
          </div>
        ) : null}

        {messagesQuery.isError ? (
          <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
            {(messagesQuery.error as Error).message}
          </p>
        ) : null}

        {!messagesQuery.isLoading && !(messagesQuery.data?.length ?? 0) ? (
          <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.74)] p-3 text-sm text-[color:var(--muted)]">
            No messages yet. Keep chat in-app for privacy.
          </p>
        ) : null}

        {(messagesQuery.data ?? []).map((item) => {
          const mine = Boolean(user && item.sender_user_id === user.id);
          return (
            <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-2xl border px-3 py-2 text-sm sm:max-w-[70%] ${
                  mine
                    ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-50"
                    : "border-[var(--border)] bg-[rgba(10,15,28,0.72)] text-[var(--fg)]"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{item.message}</p>
                <p className="mt-1 text-[10px] opacity-75">{formatRelativeTime(item.created_at)}</p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-[var(--border)] bg-[rgba(8,12,22,0.9)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmed = message.trim();
          if (!trimmed) return;

          try {
            await sendMessageMutation.mutateAsync({ message: trimmed });
            setMessage("");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to send message");
          }
        }}
      >
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Type a message..."
            maxLength={1000}
            className="h-11"
          />
          <Button type="submit" className="h-11 px-4" disabled={sendMessageMutation.isPending || !message.trim()}>
            {sendMessageMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </form>
    </section>
  );
}
