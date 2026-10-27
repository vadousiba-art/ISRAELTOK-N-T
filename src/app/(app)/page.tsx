import { StoriesBar } from "@/components/stories/StoriesBar";
import { InlineComposer } from "@/components/feed/InlineComposer";
import { Feed } from "@/components/feed/Feed";
import { FeaturedStrip, NightlyCard, SiteNotices } from "@/components/yoru/Progression";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <StoriesBar />
      <InlineComposer />
      <SiteNotices />
      <NightlyCard />
      <FeaturedStrip />
      <Feed mode="latest" live />
    </div>
  );
}
