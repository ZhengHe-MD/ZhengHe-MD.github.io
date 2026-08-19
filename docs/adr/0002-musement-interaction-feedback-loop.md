# 2. Musement Interaction Feedback Loop and Skip Tracking

We decided to support explicit `Skip` interactions in Musement alongside `Mark as Read`, using categorized reasons and zero-backend GitHub Issue callbacks to record structured preference signals in `musement/exposures.json`.

## Context & Problem Statement

Musement delivers AI-curated reading encounters across multiple topic pools. Previously, only positive engagement was captured via `Musement Read:` GitHub Issue callbacks that appended fingerprints to `musement/exposures.json`. Without a negative or deferral feedback loop (`Skip`), candidate encounters could linger, and the curation engine lacked differentiated negative signals to refine user topic and source preferences.

## Decision

1. **Structured Skip Taxonomy**: Categorize skips into 5 actionable domain signals:
   - `not_interested_in_topic`: Negative topical affinity (downweights direction/topic tags).
   - `already_seen`: Positive/neutral topic affinity, but eliminates exact item duplicate.
   - `low_quality_or_clickbait`: Negative quality/source affinity (filters superficial extracts).
   - `wrong_timing`: Soft deferral (removes from immediate queue without topic penalty).
   - `other`: Free-form feedback notes.

2. **Unified Git-Centric Ingestion via GitHub Actions**:
   - Issue titles adhere to `Musement Skip: <fingerprint>` (and existing `Musement Read: <fingerprint>`).
   - Issue bodies supply markdown key-value pairs (`Action: skip`, `Category: <category>`, optional `Notes`).
   - The GitHub Action workflow (`.github/workflows/musement-read-callback.yml` / interaction workflow) parses the issue, upserts the record into `musement/exposures.json`, commits the change, comments on the issue, and auto-closes it.

3. **Evolved Unified Schema (`musement/exposures.json`)**:
   - Each entry represents a keyed exposure per `fingerprint`:
     ```json
     {
       "fingerprint": "3ee836a9713801b5a017476b29c61dd16fee2b1d6c04b9866183c07f4d2e6c3c",
       "action": "skip",
       "category": "not_interested_in_topic",
       "reason": "optional custom notes",
       "exposed_at": "2026-08-19T15:00:00.000Z"
     }
     ```
   - Legacy records without explicit `action` fields are treated as `"action": "read"`.

4. **Multi-Surface Affordance (Web + RSS)**:
   - **Web UI (`musement/index.html`)**: Each encounter card features a `⏭️ Skip` button with a lightweight quick-select popover, providing immediate optimistic UI dimming and one-click categorized issue pre-fill.
   - **RSS Feeds (`musement/curated.xml`, `pool-*.xml`)**: Encounter `<description>` blocks append ` | ⏭️ Skip in Musement` links pointing to the customizable GitHub Issue template.
