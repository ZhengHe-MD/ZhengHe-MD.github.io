# ZhengHe Personal Site Context

Personal digital garden and publication system for essays, interactive courses, projects, running logs, and talks.

## Language

**Collection**:
A top-level content stream or gallery in the site (Writing, Courses, Projects, Running, Talks).
_Avoid_: Section, category, folder

**Course**:
A multi-session interactive learning course co-designed in Course Studio and published as a self-contained reader page.
_Avoid_: Tutorial, workshop, blog post, class

**Session**:
A discrete interactive lesson or topic within a course.
_Avoid_: Chapter, part, page

**Co-Design Notes**:
The recorded learner-mentor dialogue, questions, and architectural rationales attached to a course.
_Avoid_: Chat history, prompt logs, comments

**Writing**:
Long-form essays and deep-dive technical/philosophical articles.
_Avoid_: Blog posts, articles, essays

**Project**:
Curated showcase cards of open-source software, tools, and creations.
_Avoid_: Portfolio, works, apps

**Activity**:
A filtered GPS running record synchronized from fitness platforms.
_Avoid_: Workout, track, run log

**Musement**:
AI-curated on-demand reading encounters and knowledge exploration feeds.
_Avoid_: RSS aggregator, feed reader, newsletter

**Encounter**:
A single curated reading or media material presented within a Musement pool or curated feed.
_Avoid_: Article, post, recommendation item

**Exposure**:
A recorded user interaction state (`read` or `skip`) keyed by item fingerprint and persisted in `musement/exposures.json`.
_Avoid_: Impression, view log, history

**Skip**:
An explicit user signal marking an Encounter as discarded or deferred, categorized by reason (`not_interested_in_topic`, `already_seen`, `low_quality_or_clickbait`, `wrong_timing`, `other`) to guide future curation preference learning.
_Avoid_: Delete, hide, reject, pass
