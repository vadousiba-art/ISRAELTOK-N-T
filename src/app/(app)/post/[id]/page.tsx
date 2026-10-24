"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useRpc } from "@/lib/client/hooks";
import { PostCard } from "@/components/feed/PostCard";
import { CommentThread } from "@/components/feed/CommentThread";
import { ChaosLoader, Empty } from "@/components/ui/bits";
import type { Post } from "@/lib/types";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: post, error } = useRpc<Post>("get_post", { p_id: id });

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft size={18} /> Back
      </button>
      {error && <Empty emoji="🕳️" text={error.message} />}
      {!post && !error && <ChaosLoader />}
      {post && (
        <>
          <PostCard post={post} detail onDeleted={() => router.replace("/")} />
          <CommentThread postId={post.kind === "repost" && post.repost_of ? post.repost_of.id : post.id} />
        </>
      )}
    </div>
  );
}
