# Guide for Claude: Superfocus on a Kindle

You are helping someone show their Superfocus schedule on a Kindle. They may not be a developer. `README.md` has the steps in their words; this file is what you need to guide them.

## How to guide

- One step at a time. Say what to do, wait for the result, check it, then move on.
- Before the first step, ask three things: which computer and operating system will stay on at home, which Kindle model, and the Kindle's firmware version (Settings, Device Options, Device Info).
- If you can run commands on their computer, run them yourself and show the result. If you are in a chat without tools, give one command at a time and ask them to paste what it prints.
- Say plainly when something is unverified on their model. Never present a guess as a fact.

## Hard rules

1. **Never write, summarise or improvise jailbreak steps.** The Kindle modding maintainers warn against AI-written jailbreak instructions, and the methods change. Send the person to the official pages below and have them follow those word for word. If they are stuck on a step, read that page with them and quote it; do not fill gaps from memory.
2. **Never ask for the API key in the chat.** They paste it into `.env` themselves. Never print `.env`, never put the key in a command, a URL or any file other than `.env`.
3. **The key stays read-only.** This project only reads. Do not suggest turning on "Can edit".
4. **The API host is `https://api.superfocus.me/v1`.** Do not use any other Superfocus host.
5. **Nothing goes on the Kindle except `superfocus.sh`.** Do not install other packages or run other scripts on it unless the official guide says so.
6. **Do not change the system partition, and do not add anything that starts on boot.** A reboot must always bring back the stock Kindle.

## The pieces

- `server.js` (Node 22+, no dependencies). Every 60 seconds it opens its own page in headless Chrome at 1072 x 1448 and keeps the screenshot. Routes: `/` the page, `/data.js` the day as data, `/screen.png` the picture.
- `index.html`. Plain old-style JavaScript, positions everything by the minute. Six hours are visible, starting one hour before now.
- `kindle/superfocus.sh`. A scriptlet: a shell script that the jailbreak's `sh_integration` shows as an item in the Kindle library and runs as root when tapped. The first six lines hold its headers. `# DontUseFBInk` must stay, or the launcher clears the screen and prints the script's output over the picture.

Settings in `.env`: `SUPERFOCUS_API_KEY` (required), `PORT` (default 8787), `CHROME_PATH` (only when Chrome is not found), `SUPERFOCUS_API_URL` (leave unset).

## API facts

- Auth header: `Authorization: Bearer sfk_...`. Keys are made in the app under Toolkit, Integrations, API. An active subscription is required.
- `GET /me`: `timezone`, `now` (`YYYY-MM-DD HH:mm`, local), `today`, `topThing` (`title`, `completed`, or null).
- `GET /blocks?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`: `title`, `type` (`task`, `event`, `protected`), `startTime` like `Nov 6, 2026, 3:00 PM`, `endTime` like `3:00 PM`, `isCompleted`. All-day entries have no `startTime`; the server skips them.
- `GET /tasks?includeCompleted=true`: groups of `{ goal, tasks }`; each task has `title`, `plannedFor`, `completed`, `completedAt`.
- Responses are wrapped as `{ "data": ... }`. Errors are `{ "error": { "code", "message" } }`. 401 means a bad key. 429 means slow down; the limit is 120 requests a minute and this server makes 3.
- There are no webhooks. Polling is the only way.
- Full spec: `https://api.superfocus.me/v1/openapi.json`.

## Step by step

### 1. Computer check
- `node -v` must print 22 or higher.
- Run `npm run sample`, then fetch `http://localhost:8787/screen.png`. A 1072 x 1448 PNG means Chrome was found and rendering works.
- "Chrome or Chromium was not found": find the browser's full path and set `CHROME_PATH` in `.env`. On Linux some systems need Chromium installed from the package manager.
- The first picture takes a few seconds; `/screen.png` answers 503 until it is ready.

### 2. Their own data
- They create the key and paste it into `.env`. Then `npm start`.
- Check `http://localhost:8787/screen.png`. "No data" with "Superfocus answered 401" means the key is wrong. 403 points at the subscription.

### 3. Keep the server running
- Simplest: leave the terminal open.
- Better: make it start at login, the way their system does it (a LaunchAgent on macOS, Task Scheduler on Windows, a systemd user service on Linux). Offer it, write it for them, and show how to stop it.
- Give the computer a fixed address on the home network (a DHCP reservation in the router), or the Kindle loses it when the address changes.
- The firewall must allow incoming connections on the port. Test from a phone on the same Wi-Fi: open `http://<computer address>:8787/screen.png`.

### 4. Jailbreak
- Official wizard: https://kindlemodding.org/jailbreak-wizard.html (needs the serial number and firmware).
- The wizard picks the method for their model and firmware. Use what it says, not what this file says.
- Example: for a Paperwhite 3 (7th generation, 2015; last firmware 5.16.2.1.1) the wizard's data recommends WinterBreak2: https://kindlemodding.org/jailbreaking/WinterBreak2/
- After it, the official "what's next" page: https://kindlemodding.org/jailbreaking/whats-next/
- Things the community reports for a Paperwhite 3, to mention before they start:
  - WinterBreak2 needs Wi-Fi during the jailbreak and needs no Amazon registration.
  - Do not install the legacy "Universal Hotfix", KUAL or MRPI on top. The jailbreak already sets up scriptlets, FBInk and the update block.
  - The exploit runs once. If it fails, the fix is in the maintainers' issue tracker (https://github.com/KindleModding/Winterbreak2/issues); read it there with them.
  - The guide says to fill the storage first, while maintainers tell people with failed runs to free space. If they hit this, follow the maintainers' latest answer, not your own judgment.
- Signs it worked: a `.sh` file copied to `documents` shows up in the library and runs when tapped, and the file `libkh/bin/fbink` exists on the Kindle's USB drive.

### 5. Script on the Kindle
- Find the computer's LAN address and set `SERVER=` in `kindle/superfocus.sh`. Keep Unix line endings (LF). A file saved with Windows line endings (CRLF) will not run; on Windows use an editor that can save LF.
- Copy it to the Kindle's `documents` folder over USB, eject, tap **Superfocus** in the library.
- macOS may leave `._superfocus.sh` beside it; delete that file if it shows up as a second library item.

### 6. Confirm
- The picture appears within about a minute and the top-right time matches now.
- Touch the screen: the stock Kindle returns.
- Connect over USB and read `superfocus/log.txt`: one line per cycle with the battery level.

## What the Kindle script does

1. Refuses to start until `SERVER` is set and FBInk exists at `/mnt/us/libkh/bin/fbink`.
2. Tapped while running, it stops the running copy and restores the Kindle.
3. Detaches with `setsid`, because the launcher kills its child when the library item closes.
4. Holds off the screensaver (`lipc-set-prop com.lab126.powerd preventScreenSaver 1`, repeated every cycle), hides system dialogs (`com.lab126.pillow disableEnablePillow disable`) and freezes the home app with `kill -STOP` so it cannot draw over the picture. Frozen process ids are kept in `superfocus/frozen` and resumed on exit.
5. Loop: Wi-Fi on, download `screen.png` (45 seconds of retries), paint only if the picture changed, full flash every fourth paint to clear ghosting, Wi-Fi off, wait `EVERY` seconds (900).
6. Any input event (touch, power button) after the first paint ends the loop and restores everything.

Knobs at the top of the file: `SERVER`, `EVERY` (seconds between refreshes), `AWAKE` (seconds Wi-Fi stays on after a refresh).

## Verified and not verified

Verified:
- The server and page, on macOS with Chrome.
- The Kindle script's logic, daily on a Paperwhite 10th generation (PW4), firmware 5.18.1.1.1.
- From source code and community reports: on a Paperwhite 3 at 5.16.2.1.1, WinterBreak2 installs scriptlets and FBInk at the path above, and FBInk supports that model and these flags.

Not verified on a Paperwhite 3, so check each on the device and adapt:
- **This script as a whole.** Nobody has run it there.
- **Process names.** `mesquite` and `KPPMainApp` are frozen if they exist; a missing one is skipped silently. If the stock interface draws over the picture, look at `superfocus/log.txt` (the "frozen:" line) and find what is running. Other dashboard projects on this model use `stop framework` and `stop lab126_gui` instead; that is a bigger change, so explain it and ask before trying.
- **The `statusbar` job.** Only touched when `/etc/upstart/statusbar.conf` exists.
- **`curl` and `setsid` on the stock system.** If the log shows "no answer" while a phone on the same Wi-Fi can open the picture, test whether `curl` exists; `wget -q -O` is the usual fallback.
- **Touch to stop.** It reads `/dev/input/event*`. If touching does not stop it, the power button or a restart will.
- **Battery.** The 10% per 3 hours figure is from the tested model.

When you adapt the script for their model, change as little as possible, tell them what you changed and why, and keep the restore path (resume frozen processes, re-enable dialogs, Wi-Fi on, screensaver allowed) intact.

## Getting back to a normal Kindle

- Touch the screen, or tap **Superfocus** again.
- If that fails: restart the Kindle by holding the power button. Nothing the script does survives a restart.
- To remove it: delete `documents/superfocus.sh` and the `superfocus` folder over USB.

## Things people ask for

- **12 hour clock, another language, different layout:** edit `index.html`. Preview at `http://localhost:8787/?now=14:30`.
- **Refresh more often:** lower `EVERY` in the script. More refreshes use more battery.
- **Battery instead of a charger:** that needs suspend between refreshes, which turns the light off and is not built here. Say so before attempting it.
- **A different Kindle size:** change `WIDTH` and `HEIGHT` in `server.js` and the fixed sizes in `index.html`. The picture must match the screen exactly; FBInk does not rotate or scale here.
