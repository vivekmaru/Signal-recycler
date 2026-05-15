## 2025-02-28 - Component Memoization
**Learning:** The TimelineRow component in `apps/web/src/components/Timeline.tsx` isn't memoized. In a session with many events, when a row is selected or the list updates, all rows re-render. Since `TimelineRow` takes primitive props and an unchanging callback (if passed correctly), wrapping it in `React.memo` is a safe, measurable performance win.
**Action:** Add `React.memo` to `TimelineRow`.
