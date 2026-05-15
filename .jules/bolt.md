## 2024-05-15 - Array Spread in Loops
**Learning:** Using `[...(map.get(key) ?? []), item]` inside a loop is an O(n^2) anti-pattern that creates new arrays for every item added to a group.
**Action:** Use `.push()` with a conditional check to mutate the existing array instead, which is O(1) per insertion.
