# 1. Interactive Courses as a First-Class Collection

We decided to establish `courses/` as a first-class content collection on the personal site, rendered as self-contained interactive reader pages exported directly from Course Studio (`interactive-course`).

## Context & Problem Statement

Course Studio produces structured, multi-session interactive courses with live sandboxes and co-design notes. Initially, courses were considered for export as TIL notes or standard markdown articles. However, converting rich multi-session courses into flat markdown destroys interactive widgets, while publishing them under `/til/` misrepresents long-form interactive curricula as short micro-notes.

## Decision

1. **Dedicated Collection**: Store courses in `courses/<slug>/index.html` at route `/courses/<slug>/`.
2. **First-Class Discovery**: Add Courses to the top navigation (`<site-nav>`), the homepage tile grid (`🎓 课程`), latest activity feed, category taxonomy (`思考`/`实践`), and Atom feed (`/feed.xml`).
3. **Reader Architecture**: The exported course HTML retains its standalone two-pane reader and companion drawer while integrating `<site-nav>` and adapting to the site's dark/light theme tokens.
4. **Automated Aggregation**: `scripts/build.mjs` scans `courses/` to dynamically populate `/courses/index.html` with course cards showing session counts, summaries, and publication dates.
