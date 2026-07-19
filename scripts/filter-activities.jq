# Filters running_page's activities.json into running/data.json.
# Keep: runs only, distance >= 3 km, pace <= 8 min/km; one record per date (longest).
[ .[]
  | select(.type == "Run")
  | select(.distance >= 3000)
  | (.moving_time | capture("^(?<h>\\d+):(?<m>\\d+):(?<s>\\d+)$")? ) as $t
  | select($t != null)
  | (($t.h | tonumber) * 3600 + ($t.m | tonumber) * 60 + ($t.s | tonumber)) as $secs
  | select($secs > 0)
  | select(($secs / (.distance / 1000)) <= 480)
  | { date: (.start_date_local[0:10]),
      distance: ((.distance / 1000) * 1000 | round / 1000),
      duration: { hours: ($secs / 3600 | floor),
                  mins: ($secs % 3600 / 60 | floor),
                  secs: ($secs % 60) } }
]
| group_by(.date)
| map(max_by(.distance))
| sort_by(.date)
