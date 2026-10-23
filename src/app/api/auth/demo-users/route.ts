import { appMode } from "@/lib/config";
import { demoDb } from "@/lib/server/demo/pglite";
import { AppError, handle } from "@/lib/server/errors";

// Demo mode only: the account picker on the login screen.
export async function GET() {
  return handle(async () => {
    if (appMode() !== "demo") throw new AppError("NOT_FOUND", "Not available.", 404);
    const db = await demoDb();
    const r = await db.query(
      `select id, username, display_name, avatar_url, role, badge
       from public.profiles where not is_bot and not banned
       order by case role when 'owner' then 0 when 'admin' then 1 else 2 end, avatar_url is null, created_at
       limit 60`,
    );
    return r.rows;
  });
}
