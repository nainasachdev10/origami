import logging
import os
from datetime import datetime, timedelta, timezone
from typing import List

import httpx

from .google_trends import TrendItem

logger = logging.getLogger(__name__)

_NEWSAPI_ENDPOINT = "https://newsapi.org/v2/everything"

# Source-level popularity heuristics: higher number = higher base score.
# Unlisted sources receive a score proportional to article position in the
# result list.
_SOURCE_POPULARITY: dict[str, float] = {
    "bbc-news": 100,
    "the-verge": 90,
    "wired": 88,
    "techcrunch": 87,
    "ars-technica": 85,
    "reuters": 83,
    "bloomberg": 82,
    "the-guardian": 80,
    "new-scientist": 78,
    "engadget": 75,
}


def fetch_news_trends(keywords: List[str]) -> List[TrendItem]:
    """
    Fetch articles from NewsAPI.org matching the niche keywords.

    This source is entirely optional: if NEWSAPI_KEY is not set the function
    returns [] immediately without logging a warning (operators can omit the
    key to disable this source).

    Returns an empty list on any failure.
    """
    api_key = os.getenv("NEWSAPI_KEY", "").strip()
    if not api_key:
        # Optional source — silently skip.
        return []

    if not keywords:
        return []

    from_time = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    query = " OR ".join(f'"{kw}"' for kw in keywords)

    try:
        with httpx.Client(timeout=15) as client:
            response = client.get(
                _NEWSAPI_ENDPOINT,
                params={
                    "q": query,
                    "from": from_time,
                    "sortBy": "publishedAt",
                    "language": "en",
                    "pageSize": 50,
                    "apiKey": api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

        articles = data.get("articles", [])
        if not articles:
            return []

        items: List[TrendItem] = []
        total = len(articles)

        for rank, article in enumerate(articles):
            title = (article.get("title") or "").strip()
            if not title or title == "[Removed]":
                continue

            source_id = (article.get("source") or {}).get("id") or ""
            source_name = (article.get("source") or {}).get("name") or "unknown"

            if source_id and source_id in _SOURCE_POPULARITY:
                # Known high-quality source: use its popularity score, slightly
                # discounted by position in the results.
                position_discount = (rank / total) * 15  # max 15-point penalty
                score = round(_SOURCE_POPULARITY[source_id] - position_discount, 2)
            else:
                # Unknown source: rank-based score, descending from 60.
                score = round(60.0 * (total - rank) / total, 2)

            items.append(
                TrendItem(
                    source="newsapi",
                    topic=title,
                    score=score,
                    context=f"NewsAPI article from {source_name}",
                )
            )

        return items

    except httpx.HTTPStatusError as e:
        logger.error("newsapi: HTTP error %s: %s", e.response.status_code, e)
        return []
    except Exception as exc:
        logger.error("newsapi: unexpected error: %s", exc)
        return []
