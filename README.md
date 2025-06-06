# All COD Executions
A website that displays all the Call Of Duty executions from MW, CW, VG, MWII, MWIII and BO6.

## Contributors
A big thank you to @hacimolla50 and @horrorbored for helping out with the data.

## Features

- Light/dark mode toggle
- Display data about specific executions (duration, ttk...)
- List and Grid views

## Navigating the Website
1. Open `index.html` in your browser.
2. Click on a game card to view that game's finishing moves.
3. Use the **List View** and **Grid View** buttons to switch layouts.
4. Click an execution to open a popup with details and preview videos.
5. Use the back arrow or **Back to Game Select** button to return to the main page.

## Contributing
The execution data lives in `data.json`. Each game (like `MWII`) contains an array of move objects with fields:
- `name` – the move name
- `icon` – path to a preview image
- `standing`, `prone`, `downed` – video URLs
- `anim_time` – animation length in seconds
- `ttk` – time to kill in seconds
- `price` – price in COD Points
- `bundle` – (optional) name of the bundle it belongs to

Feel free to add missing executions or fix existing entries. Changes will be loaded automatically by `game.html` the next time you refresh the page.
