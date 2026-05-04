import logging
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import List
from urllib.parse import quote_plus

import feedparser

from .google_trends import TrendItem

logger = logging.getLogger(__name__)

# Nitter instances tried in order; first healthy one wins per keyword.
_NITTER_INSTANCES = [
    "nitter.privacydev.net",
    "nitter.poast.org",
    "nitter.nl",
]


def _search_url(instance: str, keyword: str) -> str:
    """Build a Nitter RSS search URL for a given keyword."""
    encoded = quote_plus(keyword)
    return f"https://{instance}/search/rss?q={encoded}&f=tweets"


def _parse_entry_time(entry) -> datetime | None:
    """
    Extract a timezone-aware datetime from a feedparser entry.
    Tries published_parsed (struct_time) then the raw published string.
    """
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        try:
            return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        except Exception:
            pass
    if hasattr(entry, "published") and entry.published:
        try:
            return parsedate_to_datetime(entry.published)
        except Exception:
            pass
    return None


def fetch_nitter_trends(keywords: List[str]) -> List[TrendItem]:
    """
    Parse RSS feeds from Nitter instances (Twitter/X mirror) for each keyword.

    Instance fallback: tries each instance in order; moves to the next if the
    feed cannot be fetched or returns no entries.

    Scoring: recency-based — newest entry = 100, oldest (within 24 h) scales
    linearly toward 0.

    Returns an empty list on any failure.
    """
    if not keywords:
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    all_entries: List[dict] = []

    for kw in keywords:
        fetched = False
        for instance in _NITTER_INSTANCES:
            url = _search_url(instance, kw)
            try:
                feed = feedparser.parse(url)
                # feedparser does not raise on HTTP errors — check bozo flag and
                # status code (when available).
                status = getattr(feed, "status", 200)
                if feed.bozo and not feed.entries:
                    logger.debug("nitter: %s returned bozo feed for '%s'", instance, kw)
                    continue
                if status not in (200, 301, 302):
                    logger.debug(
                        "nitter: %s returned HTTP %s for '%s'", instance, status, kw
                    )
                    continue

                entries_found = 0
                for entry in feed.entries:
                    pub_time = _parse_entry_time(entry)
                    if pub_time is None or pub_time < cutoff:
                        continue
                    title = (
                        getattr(entry, "title", None)
                        or getattr(entry, "summary", None)
                        or ""
                    ).strip()
                    if not title:
                        continue
                    all_entries.append(
                        {
                            "title": title,
                            "published_at": pub_time,
                            "keyword": kw,
                            "instance": instance,
                        }
                    )
                    entries_found += 1

                if entries_found > 0:
                    fetched = True
                    break  # success — no need to try other instances

            except Exception as exc:
                logger.warning(
                    "nitter: error fetching from %s for '%s': %s", instance, kw, exc
                )

        if not fetched:
            logger.info("nitter: no results from any instance for keyword '%s'", kw)

    if not all_entries:
        return []

    # Score by recency: newer = higher score.
    # newest_time = 100, entries at exactly 24 h ago = 0.
    now = datetime.now(timezone.utc)
    window_seconds = 86400.0  # 24 h in seconds

    items: List[TrendItem] = []
    for entry in all_entries:
        age_seconds = (now - entry["published_at"]).total_seconds()
        score = max(0.0, round(100.0 * (1.0 - age_seconds / window_seconds), 2))
        items.append(
            TrendItem(
                source="x",
                topic=entry["title"],
                score=score,
                context=f"nitter search for '{entry['keyword']}' via {entry['instance']}",
            )
        )

    return items
