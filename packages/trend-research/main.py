import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supabase client (service-role key — required; anon key is blocked by RLS on
# trend_cache).
# ---------------------------------------------------------------------------

_supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
_supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_supabase: Client | None = None
if _supabase_url and _supabase_service_key:
    try:
        _supabase = create_client(_supabase_url, _supabase_service_key)
    except Exception as _e:
        logger.warning("Could not initialise Supabase client: %s", _e)
else:
    logger.warning(
        "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — "
        "caching disabled"
    )

# ---------------------------------------------------------------------------
# Import source fetchers and cache (deferred to avoid import-time side effects
# when env vars are not yet loaded in some deployment scenarios).
# ---------------------------------------------------------------------------

from sources.google_trends import TrendItem
from sources import (
    fetch_google_trends,
    fetch_reddit_trends,
    fetch_youtube_trends,
    fetch_nitter_trends,
    fetch_news_trends,
)
from cache import TrendCache

_cache = TrendCache(_supabase) if _supabase else None

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Trend Research Service", version="1.0.0")


class ResearchRequest(BaseModel):
    niche_keywords: List[str]


class ResearchResponse(BaseModel):
    trends: List[dict]   # list of TrendItem dicts
    sources: List[str]   # which sources returned data
    cached: bool
    fetched_at: str      # ISO timestamp


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SOURCE_NAMES = [
    "google_trends",
    "reddit",
    "youtube_trending",
    "x",        # nitter source label
    "newsapi",
]


def _deduplicate(items: List[TrendItem]) -> List[TrendItem]:
    """
    Merge items that share the same topic (case-insensitive).

    When two items have the same topic, keep the one with the higher score
    but concatenate both source names into the surviving item's source field
    (stored as a comma-separated string so callers can split on it).
    """
    seen: dict[str, TrendItem] = {}
    for item in items:
        key = item.topic.strip().lower()
        if key not in seen:
            seen[key] = item
        else:
            existing = seen[key]
            if item.score > existing.score:
                # Keep higher-scoring item but record both sources.
                merged_sources = set(existing.source.split(",")) | {item.source}
                seen[key] = TrendItem(
                    source=",".join(sorted(merged_sources)),
                    topic=existing.topic,      # preserve original casing
                    score=item.score,
                    context=existing.context,
                )
            else:
                # Keep existing but add the new source name.
                merged_sources = set(existing.source.split(",")) | {item.source}
                seen[key] = TrendItem(
                    source=",".join(sorted(merged_sources)),
                    topic=existing.topic,
                    score=existing.score,
                    context=existing.context,
                )
    return list(seen.values())


def _trend_item_to_dict(item: TrendItem) -> dict:
    return {
        "source": item.source,
        "topic": item.topic,
        "score": item.score,
        "context": item.context,
    }


async def _run_source_async(fn, keywords: List[str]) -> List[TrendItem]:
    """
    Run a synchronous source fetcher in a thread pool so that the asyncio
    event loop is not blocked.  Returns [] on any exception.
    """
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, fn, keywords)
    except Exception as exc:
        logger.error("Source %s raised unexpectedly: %s", fn.__name__, exc)
        return []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/research", response_model=ResearchResponse)
async def research(request: ResearchRequest) -> ResearchResponse:
    """
    Fetch trending topics related to niche_keywords from all configured sources.

    Logic:
      1. Check Supabase cache per source (TTL = 6 h).
      2. For any source that has no fresh cache, fetch live data.
      3. Merge all results, deduplicate by topic (case-insensitive, keep higher score).
      4. Sort by score descending.
      5. Cache fresh results per source.
      6. Return merged list.
    """
    keywords = [kw.strip() for kw in request.niche_keywords if kw.strip()]
    if not keywords:
        raise HTTPException(status_code=422, detail="niche_keywords must not be empty")

    now_iso = datetime.now(timezone.utc).isoformat()
    all_items: List[TrendItem] = []
    sources_with_data: list[str] = []
    any_cached = False

    source_fns = {
        "google_trends": fetch_google_trends,
        "reddit": fetch_reddit_trends,
        "youtube_trending": fetch_youtube_trends,
        "x": fetch_nitter_trends,
        "newsapi": fetch_news_trends,
    }

    # -- Step 1 & 2: Check cache, then fetch live for misses --
    cache_hits: dict[str, List[TrendItem]] = {}
    cache_misses: list[str] = []

    if _cache is not None:
        for source_name in source_fns:
            cached = await _cache.get(source_name, keywords)
            if cached is not None:
                cache_hits[source_name] = cached
                any_cached = True
            else:
                cache_misses.append(source_name)
    else:
        cache_misses = list(source_fns.keys())

    # -- Fetch cache misses in parallel --
    if cache_misses:
        tasks = {
            name: _run_source_async(source_fns[name], keywords)
            for name in cache_misses
        }
        live_results: dict[str, List[TrendItem]] = {}
        gathered = await asyncio.gather(*tasks.values(), return_exceptions=True)
        for name, result in zip(tasks.keys(), gathered):
            if isinstance(result, Exception):
                logger.error("Source %s raised: %s", name, result)
                live_results[name] = []
            else:
                live_results[name] = result  # type: ignore[assignment]

        # Cache fresh results
        if _cache is not None:
            for name, items in live_results.items():
                if items:
                    await _cache.set(name, keywords, items)
    else:
        live_results = {}

    # -- Merge all results --
    for source_name in source_fns:
        items = cache_hits.get(source_name) or live_results.get(source_name, [])
        if items:
            sources_with_data.append(source_name)
            all_items.extend(items)

    # -- Deduplicate and sort --
    merged = _deduplicate(all_items)
    merged.sort(key=lambda x: x.score, reverse=True)

    return ResearchResponse(
        trends=[_trend_item_to_dict(item) for item in merged],
        sources=sources_with_data,
        cached=any_cached,
        fetched_at=now_iso,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
