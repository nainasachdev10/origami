import json
import logging
from typing import List

from sources.google_trends import TrendItem

logger = logging.getLogger(__name__)

_CACHE_TTL_HOURS = 6


class TrendCache:
    """
    Supabase-backed cache for trend data.

    Uses the service-role key so that RLS (which blocks the anon key) is
    bypassed for reads and upserts against the trend_cache table.

    Table schema expected:
        trend_cache (
            id          uuid primary key default gen_random_uuid(),
            source      text not null,
            niche_keywords text[] not null,
            payload     jsonb not null,
            fetched_at  timestamptz default now()
        )

    The cache key is (source, sorted_keywords) — keywords are sorted before
    comparison so that ["AI", "LLM"] and ["LLM", "AI"] hit the same row.
    """

    def __init__(self, supabase_client):
        self._client = supabase_client

    def _sorted_keywords(self, keywords: List[str]) -> List[str]:
        return sorted(kw.strip().lower() for kw in keywords)

    async def get(self, source: str, keywords: List[str]) -> List[TrendItem] | None:
        """
        Return cached TrendItem list if a fresh (<= 6 h old) entry exists for
        (source, keywords).  Returns None if the cache is empty or stale.
        """
        sorted_kws = self._sorted_keywords(keywords)
        try:
            response = (
                self._client.table("trend_cache")
                .select("payload, fetched_at")
                .eq("source", source)
                # Filter: fetched within the last TTL hours.
                # Supabase supports `gte` on timestamptz columns.
                .gte(
                    "fetched_at",
                    f"now() - interval '{_CACHE_TTL_HOURS} hours'",
                )
                .execute()
            )

            rows = response.data or []
            # Filter by matching sorted keyword arrays.
            for row in rows:
                cached_kws = sorted(
                    kw.strip().lower() for kw in (row.get("niche_keywords") or [])
                )
                if cached_kws == sorted_kws:
                    payload = row.get("payload")
                    if payload is None:
                        continue
                    # payload is stored as a JSON array of TrendItem dicts.
                    raw_items = payload if isinstance(payload, list) else json.loads(payload)
                    return [
                        TrendItem(
                            source=item["source"],
                            topic=item["topic"],
                            score=float(item["score"]),
                            context=item.get("context", ""),
                        )
                        for item in raw_items
                    ]

            return None

        except Exception as exc:
            logger.error("trend_cache.get: error reading cache for source=%s: %s", source, exc)
            return None

    async def set(
        self, source: str, keywords: List[str], items: List[TrendItem]
    ) -> None:
        """
        Upsert a cache entry for (source, sorted_keywords).

        Keywords are stored in sorted form for consistent lookups. The payload
        is the JSON-serialisable list of TrendItem dicts.
        """
        sorted_kws = self._sorted_keywords(keywords)
        payload = [
            {
                "source": item.source,
                "topic": item.topic,
                "score": item.score,
                "context": item.context,
            }
            for item in items
        ]
        try:
            (
                self._client.table("trend_cache")
                .upsert(
                    {
                        "source": source,
                        "niche_keywords": sorted_kws,
                        "payload": payload,
                        "fetched_at": "now()",
                    },
                    on_conflict="source,niche_keywords",
                )
                .execute()
            )
        except Exception as exc:
            # Cache write failure is non-fatal — the fresh data is still returned
            # to the caller; it just won't be cached for subsequent requests.
            logger.error(
                "trend_cache.set: error writing cache for source=%s: %s", source, exc
            )
