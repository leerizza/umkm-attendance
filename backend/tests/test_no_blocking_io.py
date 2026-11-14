"""Guard: no blocking supabase-py call directly inside an `async def`.

The sync supabase client does network I/O. Inside `async def` it freezes the
event loop for every other request. Either:
  - make the route a plain `def` (FastAPI runs it in a threadpool), or
  - use `await db_run(query)` / `await asyncio.to_thread(...)`.
"""
import ast
import pathlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent
_STORAGE_IO = {"remove", "upload", "download", "create_signed_url", "create_signed_urls", "list", "move", "copy"}
SOURCES =[p for p in BACKEND.rglob("*.py") if "tests" not in p.parts and "venv" not in str(p)]


def _blocking_calls(path: pathlib.Path):
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    found = []

    def visit(node, async_fn):
        for ch in ast.iter_child_nodes(node):
            if isinstance(ch, (ast.FunctionDef, ast.Lambda)):
                visit(ch, None)  # sync scope: runs in a thread / executor
                continue
            if isinstance(ch, ast.AsyncFunctionDef):
                visit(ch, ch.name)
                continue
            if async_fn and isinstance(ch, ast.Call) and isinstance(ch.func, ast.Attribute):
                text = ast.get_source_segment(src, ch.func) or ""
                storage_io = text.startswith("supabase.storage") and ch.func.attr in _STORAGE_IO
                if ch.func.attr == "execute" or storage_io:
                    found.append(f"{path.relative_to(BACKEND)}:{ch.lineno} in {async_fn}()")
            visit(ch, async_fn)

    visit(tree, None)
    return found


def test_no_sync_supabase_calls_in_async_functions():
    offenders = [hit for p in SOURCES for hit in _blocking_calls(p)]
    assert not offenders, "Blocking supabase call inside async def:\n" + "\n".join(offenders)
