from .google_trends import fetch_google_trends
from .reddit import fetch_reddit_trends
from .youtube_trending import fetch_youtube_trends
from .nitter_rss import fetch_nitter_trends
from .newsapi import fetch_news_trends

__all__ = [
    "fetch_google_trends",
    "fetch_reddit_trends",
    "fetch_youtube_trends",
    "fetch_nitter_trends",
    "fetch_news_trends",
]
