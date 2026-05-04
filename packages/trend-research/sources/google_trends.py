import logging
from dataclasses import dataclass
from typing import List

from pytrends.request import TrendReq

logger = logging.getLogger(__name__)


@dataclass
class TrendItem:
    source: str
    topic: str
    score: float
    context: str


def fetch_google_trends(keywords: List[str]) -> List[TrendItem]:
    """
    Fetch trending queries related to niche keywords via pytrends.

    Returns an empty list on any failure — callers must never receive an exception
    from this function (graceful degradation rule).
    """
    if not keywords:
        return []

    try:
        pytrends = TrendReq(hl="en-US", tz=360)

        items: List[TrendItem] = []

        # --- Related queries per keyword ---
        # pytrends accepts at most 5 keywords per build_payload call.
        chunk_size = 5
        for i in range(0, len(keywords), chunk_size):
            chunk = keywords[i : i + chunk_size]
            try:
                pytrends.build_payload(chunk, cat=0, timeframe="now 1-d", geo="US")
                related = pytrends.related_queries()

                for kw in chunk:
                    kw_data = related.get(kw, {})
                    for query_type in ("top", "rising"):
                        df = kw_data.get(query_type)
                        if df is None or df.empty:
                            continue
                        for _, row in df.iterrows():
                            query_text = str(row.get("query", "")).strip()
                            raw_value = row.get("value", 0)
                            if not query_text:
                                continue
                            # pytrends already returns values 0-100 for "top"
                            # and percent-increase for "rising" — cap at 100.
                            score = min(float(raw_value), 100.0)
                            items.append(
                                TrendItem(
                                    source="google_trends",
                                    topic=query_text,
                                    score=score,
                                    context=f"related_{query_type} for '{kw}'",
                                )
                            )
            except Exception as chunk_err:
                logger.warning(
                    "google_trends: failed to fetch related queries for chunk %s: %s",
                    chunk,
                    chunk_err,
                )

        # --- Trending searches (US) ---
        try:
            trending_df = pytrends.trending_searches(pn="united_states")
            # trending_searches returns a DataFrame with one column of trend names.
            # No score signal available — assign descending scores by rank.
            total = len(trending_df)
            for rank, row in enumerate(trending_df.itertuples(index=False)):
                topic = str(row[0]).strip()
                if not topic:
                    continue
                score = round(100.0 * (total - rank) / total, 2)
                items.append(
                    TrendItem(
                        source="google_trends",
                        topic=topic,
                        score=score,
                        context="trending_searches_US",
                    )
                )
        except Exception as ts_err:
            logger.warning("google_trends: failed to fetch trending_searches: %s", ts_err)

        return items

    except Exception as exc:
        logger.error("google_trends: unexpected error: %s", exc)
        return []
