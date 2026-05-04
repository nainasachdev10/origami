import logging
import os
import time
from typing import List

import praw

from .google_trends import TrendItem

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Keyword → subreddit mapping heuristic.
# We keep a static lookup for common niches and fall back to using the keyword
# itself as a subreddit name.
# ---------------------------------------------------------------------------

_KEYWORD_TO_SUBREDDITS: dict[str, List[str]] = {
    "ai": ["artificial", "MachineLearning", "singularity", "ChatGPT", "LocalLLaMA"],
    "llm": ["LocalLLaMA", "MachineLearning", "artificial"],
    "tech": ["technology", "tech", "gadgets"],
    "crypto": ["CryptoCurrency", "Bitcoin", "ethereum", "defi"],
    "finance": ["personalfinance", "investing", "stocks", "wallstreetbets"],
    "gaming": ["gaming", "Games", "pcgaming"],
    "health": ["Health", "fitness", "nutrition"],
    "news": ["worldnews", "news", "politics"],
    "science": ["science", "Physics", "biology"],
    "programming": ["programming", "learnprogramming", "webdev", "Python"],
    "python": ["Python", "learnpython", "django"],
    "javascript": ["javascript", "webdev", "node"],
    "startup": ["startups", "Entrepreneur", "SideProject"],
    "marketing": ["marketing", "SEO", "socialmedia"],
}


def _subreddits_for_keywords(keywords: List[str]) -> List[str]:
    """Derive a deduplicated list of subreddit names from the provided keywords."""
    seen: set[str] = set()
    result: List[str] = []

    for kw in keywords:
        lower = kw.lower()
        candidates = _KEYWORD_TO_SUBREDDITS.get(lower, [kw])
        for sub in candidates:
            if sub not in seen:
                seen.add(sub)
                result.append(sub)

    return result


def fetch_reddit_trends(keywords: List[str]) -> List[TrendItem]:
    """
    Fetch hot posts from niche subreddits via PRAW (read-only, no user auth).

    Environment variables required:
        REDDIT_CLIENT_ID
        REDDIT_CLIENT_SECRET

    Returns an empty list on any failure.
    """
    if not keywords:
        return []

    client_id = os.getenv("REDDIT_CLIENT_ID", "")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        logger.warning("reddit: REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set — skipping")
        return []

    try:
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent="trend-research-bot/1.0 (by /u/automatedbot)",
            ratelimit_seconds=5,
        )

        subreddits = _subreddits_for_keywords(keywords)
        cutoff = time.time() - 86400  # 24 hours ago

        raw_posts: List[dict] = []

        for sub_name in subreddits:
            try:
                subreddit = reddit.subreddit(sub_name)
                for post in subreddit.hot(limit=25):
                    if post.created_utc < cutoff:
                        continue
                    raw_posts.append(
                        {
                            "title": post.title,
                            "upvotes": post.score,
                            "subreddit": sub_name,
                        }
                    )
            except Exception as sub_err:
                logger.warning("reddit: failed to fetch r/%s: %s", sub_name, sub_err)

        if not raw_posts:
            return []

        # Normalise upvote scores to 0-100 relative to the batch maximum.
        max_upvotes = max(p["upvotes"] for p in raw_posts) or 1
        items: List[TrendItem] = []
        for post in raw_posts:
            score = round(100.0 * post["upvotes"] / max_upvotes, 2)
            items.append(
                TrendItem(
                    source="reddit",
                    topic=post["title"],
                    score=score,
                    context=f"r/{post['subreddit']} hot post",
                )
            )

        return items

    except Exception as exc:
        logger.error("reddit: unexpected error: %s", exc)
        return []
