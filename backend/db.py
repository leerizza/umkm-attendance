import asyncio
from supabase import create_client, Client
from config import settings

supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_key,  # service role: bypasses RLS in backend
)


async def db_run(query):
    """Run a supabase-py query builder's blocking .execute() in a worker thread.

    supabase-py's sync client does network I/O; calling .execute() directly in
    an `async def` blocks the event loop (every other request waits). Use this
    in async code: `res = await db_run(supabase.table("x").select("*"))`.
    Plain `def` routes don't need it — FastAPI already runs them in a threadpool.
    """
    return await asyncio.to_thread(query.execute)
