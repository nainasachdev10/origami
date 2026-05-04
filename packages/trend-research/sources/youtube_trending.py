import logging
import os
from datetime import datetime, timedelta, timezone
from typing import List

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .google_trends import TrendItem

logger = logging.getLogger(__name__)


def _youtube_client():
    api_key = os.getenv("YOUTUBE_API_KEY", "")
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY is not set")
    return build("youtube", "v3", developerKey=api_key)


def fetch_youtube_trends(keywords: List[str]) -> List[TrendItem]:
    """
    Fetch trending YouTube videos via the Data API v3 (simple API key, no OAuth).

    Two passes:
      1. videos.list with chart=mostPopular (US) — gives overall trending videos.
      2. search.list per keyword ordered by viewCount, published in last 24 h.

    Uses YOUTUBE_API_KEY env var (read-only data access, not the OAuth
    YOUTUBE_CLIENT_ID/SECRET used for uploads).

    Returns an empty list on any failure.
    """
    if not keywords:
        return []

    try:
        youtube = _youtube_client()
    except ValueError as ve:
        logger.warning("youtube_trending: %s — skipping", ve)
        return []

    raw_videos: List[dict] = []

    # --- Pass 1: Most popular in US (no keyword filter) ---
    try:
        response = (
            youtube.videos()
            .list(
                part="snippet,statistics",
                chart="mostPopular",
                regionCode="US",
                maxResults=25,
            )
            .execute()
        )
        for item in response.get("items", []):
            stats = item.get("statistics", {})
            view_count = int(stats.get("viewCount", 0))
            title = item.get("snippet", {}).get("title", "").strip()
            if title:
                raw_videos.append({"title": title, "views": view_count, "pass": "mostPopular"})
    except HttpError as e:
        logger.warning("youtube_trending: mostPopular request failed: %s", e)

    # --- Pass 2: Keyword-specific search, last 24 h ---
    published_after = (
        datetime.now(timezone.utc) - timedelta(hours=24)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    for kw in keywords:
        try:
            response = (
                youtube.search()
                .list(
                    part="snippet",
                    q=kw,
                    type="video",
                    order="viewCount",
                    publishedAfter=published_after,
                    regionCode="US",
                    maxResults=10,
                )
                .execute()
            )
            video_ids = [
                item["id"]["videoId"]
                for item in response.get("items", [])
                if item.get("id", {}).get("videoId")
            ]
            if not video_ids:
                continue

            # Fetch view counts for the search results
            stats_resp = (
                youtube.videos()
                .list(
                    part="snippet,statistics",
                    id=",".join(video_ids),
                )
                .execute()
            )
            for item in stats_resp.get("items", []):
                stats = item.get("statistics", {})
                view_count = int(stats.get("viewCount", 0))
                title = item.get("snippet", {}).get("title", "").strip()
                if title:
                    raw_videos.append(
                        {"title": title, "views": view_count, "pass": f"search:{kw}"}
                    )
        except HttpError as e:
            logger.warning("youtube_trending: search for '%s' failed: %s", kw, e)

    if not raw_videos:
        return []

    # Normalise view counts to 0-100
    max_views = max(v["views"] for v in raw_videos) or 1
    items: List[TrendItem] = []
    for video in raw_videos:
        score = round(100.0 * video["views"] / max_views, 2)
        items.append(
            TrendItem(
                source="youtube_trending",
                topic=video["title"],
                score=score,
                context=video["pass"],
            )
        )

    return items
