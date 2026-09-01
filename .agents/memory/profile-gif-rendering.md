---
name: Profile GIF rendering
description: Safe timeout and fallback behavior for animated profile cards.
---

The profile GIF renderer must not start a fallback while a native canvas/GIF render is still running. Native rendering is not safely cancellable, so a Promise.race timeout can leave overlapping encoders and make Discord interactions appear permanently pending.

**Why:** The previous timeout rejected the caller but left the original render alive; starting the fallback concurrently could overload or stall the native canvas path.

**How to apply:** Limit GIF dimensions and frame count, reuse the resolved banner, and only run the fallback after the animated attempt has settled. Show progress after deferring the interaction.