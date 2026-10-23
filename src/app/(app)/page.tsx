import { StoriesBar } from "@/components/stories/StoriesBar";
import { InlineComposer } from "@/components/feed/InlineComposer";
import { Feed } from "@/components/feed/Feed";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <StoriesBar />
      <InlineComposer />
      <Feed mode="latest" live />
    </div>
  );
}
