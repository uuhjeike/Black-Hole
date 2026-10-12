BLACK HOLE — repaired profile package

Files:
- index.html
- style.css
- script.js

What was changed:
- Profile portrait is now the same GitHub-hosted video, displayed in a 1:1 square frame with the centre kept in focus.
- The profile video is muted, inline, looping, and pauses when the tab is hidden or reduced motion is requested.
- Post.txt is loaded as plain text from GitHub raw with a cache-busting query; GitHub Contents API and local Post.txt are fallback sources.
- Post blocks can be separated with a line containing $, (- Post -), or ---POST---. Plain text without separators also renders as a post.
- GitHub blob media links are converted to raw URLs for media playback.

Keep Post.txt in the same public repository and branch, and keep its filename capitalization exactly Post.txt. The browser must be online to load GitHub-hosted posts/video. Autoplay may be restricted by some browser settings; the profile video is muted to maximize autoplay compatibility.

- Each post now has its own compact, auto-sized card/bar instead of one large shared panel.
- Long text is clamped to six visible lines with a See more / See less control.
- Post cards use a compact responsive layout for text, images, videos, audio, and links.
