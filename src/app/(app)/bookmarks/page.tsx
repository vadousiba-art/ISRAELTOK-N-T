import { Feed } from "@/components/feed/Feed";
import { PageTitle } from "@/components/ui/bits";
import { EMPTY_LINES } from "@/lib/jokes";

export default function BookmarksPage() {
  return (
    <div>
      <PageTitle emoji="🔖" sub="Evidence you're saving for later. Only you can see this.">
        Bookmarks
      </PageTitle>
      <Feed mode="bookmarks" emptyText={EMPTY_LINES.bookmarks} />
    </div>
  );
}
