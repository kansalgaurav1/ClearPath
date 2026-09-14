# ClearPath

A photo-based home walkway safety checker for aging-in-place seniors.

You upload a photo of a room, and Claude (Claude Sonnet 5, Anthropic's vision-language
model) looks at it and flags physical fall-risk hazards — narrow or blocked walkways,
loose rugs, cords across paths, unstable stacked items, poor lighting, and stairs without
handrails. It draws a **colored box directly on the photo** for each hazard (color =
severity 1-5), with the hazard's name and a short fix printed right under the box. Below
the photo, a **colored message banner** shows the same result in text — it stays on
screen until the *next* check replaces it, so you don't need to catch it in the moment.
ClearPath also plays an alert tone and speaks the result out loud as an extra layer, but
the on-screen banner is the one guaranteed channel (phone silent switches and browser
autoplay rules can block sound — see "Sound Alerts" below).

If you upload a **reference photo** of the space when it's clear of hazards, future
checks compare against it automatically for more accurate results — see "Reference
Photo" below.

ClearPath is also a **Progressive Web App (PWA)** — it can be installed on a phone's home
screen like a real app, with its own icon, and opens without browser address bars getting
in the way. See "Installing on a Phone" below.

It also has a **Live Monitoring** mode: point your phone's camera at a walkway and it
automatically re-checks for hazards on a timer (including a "Now" continuous mode), no
tapping needed — see "Live Monitoring" below for how it works and its one real limitation
(it only runs while the app stays open and visible on screen).

ClearPath supports **English and Japanese** — pick a language from the switcher in the
header, and both the hazard results and the spoken announcements switch to match. There's
also a **voice command** ("Is my path clear?" / 「道は安全ですか」) that starts a scan
hands-free on supported browsers — see "Language Support" and "Voice Command" below.

**This tool is NOT a medical or diagnostic device.** It is a self-check aid, not a
replacement for a professional occupational therapist home safety assessment. It never
comments on cleanliness, organization style, or hoarding — only physical trip/fall
hazards.

---

## Project structure

```
ClearPath/
├── README.md               <- you are here
├── requirements.txt         <- Python dependencies
├── .env.example              <- copy to .env and add your API key
├── backend/
│   ├── app.py                <- Flask server, the API endpoints the frontend calls
│   ├── config.py              <- loads settings (API key, model name) from .env
│   ├── hazard_checklist.py     <- hazard list + the prompt sent to Claude + language text
│   ├── vlm_service.py           <- the actual call to the Claude API (Anthropic SDK)
│   ├── image_annotator.py        <- draws hazard boxes + labels onto the photo (Pillow)
│   └── image_utils.py             <- fixes sideways/upside-down phone photos (EXIF rotation)
├── frontend/
│   ├── index.html              <- the web page (upload button, photo display)
│   ├── dashboard.html            <- read-only view of shared history (open on another device)
│   ├── style.css                   <- styling
│   ├── i18n.js                      <- English/Japanese translations + language switching
│   ├── script.js                     <- talks to the Flask backend, displays the photo
│   ├── alerts.js                      <- sound alert + spoken hazard announcements
│   ├── reference.js                    <- upload/view/remove the reference "clear room" photo
│   ├── monitoring.js                    <- Live Monitoring: camera auto-capture on a timer
│   ├── voice-command.js                  <- "Is my path clear?" hands-free scan trigger
│   ├── dashboard.js                        <- polls shared history, renders it on dashboard.html
│   ├── pwa.js                                <- registers the service worker + install button logic
│   ├── manifest.json                <- tells the phone how to install this as an app
│   ├── service-worker.js             <- caches the app shell so it loads instantly / offline
│   └── icons/                         <- app icons (192px, 512px, iOS touch icon)
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── apple-touch-icon.png
│       └── generate_icons.py           <- optional: regenerate the icons if you tweak the design
└── test_images/
    └── README.md                <- notes on where to get/create test photos
```

## How it works, end to end

1. You open `frontend/index.html` in a browser (served by the Flask backend).
2. (Optional, but recommended) You upload a reference photo of the space when it's clear
   — `reference.js` saves it via `POST /api/reference`, and the backend stores it as
   `backend/reference_photo/reference.jpg` (overwritten each time you replace it).
3. You upload a photo of a room to check.
4. `script.js` sends the photo to the Flask backend (`POST /api/analyze`).
5. `app.py` receives it, reads the saved reference photo if one exists, and calls
   `vlm_service.py`.
6. `vlm_service.py` sends both images (reference first, if present) plus a carefully
   written prompt (from `hazard_checklist.py`) to the Claude API, using the model
   `claude-sonnet-5`. When a reference is included, the prompt asks Claude to compare
   the two and focus on what's new or changed.
7. Claude returns a structured JSON list of hazards it noticed — each with a category,
   description, suggested fix, a short 2-3 word fix, a severity score from 1 (minor) to
   5 (severe), and (when possible) an estimated bounding box showing where in the photo
   the hazard is, given as percentages of the image's width and height.
8. The backend double-checks each severity score and bounding box is sane (clamped to
   valid ranges, malformed values discarded) before doing anything else with them.
9. `image_annotator.py` uses Pillow to draw directly onto the photo: a colored box around
   each hazard (color = severity, green→red), a numbered badge, and two small stacked
   labels under the box — the hazard's name, then its short fix.
10. The annotated photo is sent back to the browser as a base64 image. `script.js`
    displays it — no drawing happens in the browser, the photo already has everything
    baked in — and calls `alerts.js`, which plays an alert tone and speaks each hazard's
    name and fix out loud. No hazard text is written on screen anywhere.

**A note on the boxes:** Claude is estimating hazard locations and severity visually, the
same way a person glancing at a photo would judge them — it's not a precise pixel-level
measurement or a certified safety inspection. Some hazards (like general poor lighting
affecting a whole room) don't get a box at all, since there's no single spot to point to.

## Setup

### 1. Install Python dependencies

Open a terminal / command prompt in this folder and run:

```
pip install -r requirements.txt
```

### 2. Get an Anthropic API key

- Go to https://console.anthropic.com and create an API key (you'll need an account).
- This is a paid API — a student project's worth of testing (a few dozen images) costs
  a very small amount, but you do need billing set up on the account. Ask a parent/guardian
  to help set this up, since it involves a payment method.

### 3. Add your API key

- Copy `.env.example` to a new file named `.env` in the same folder.
- Open `.env` and paste your API key after `ANTHROPIC_API_KEY=`.
- **Never share your `.env` file or commit it to GitHub** — it contains your secret key.

### 4. Run the backend server

From this folder:

```
python backend/app.py
```

You should see something like `Running on http://127.0.0.1:5000`.

### 5. Open the app

Open your browser and go to:

```
http://127.0.0.1:5000
```

Upload a photo and click "Check for Hazards" — the result shows as a colored banner
under the photo (and, if your sound is on, an alert tone + spoken summary too).

## On-Screen Message + Sound Alerts

Every check shows a **colored banner right under the photo** — green for "all clear,"
green-to-red for hazards depending on the worst severity found. This banner **stays on
screen until the next check replaces it** (manual or automatic), so you never need to
catch it in the moment.

On top of that, ClearPath also tries to play an alert tone and speak the same result out
loud:

- If hazards are found, it plays a short alert tone (more beeps and a slightly higher
  pitch for more severe hazards) and then speaks each hazard's name and short fix out
  loud, one after another.
- If nothing is found, it just speaks a brief "All clear."
- A **"🔊 Replay Alert"** button appears after every check, in case you want to hear it
  again — it replays without running a new analysis.

**Sound isn't guaranteed on every phone** — iPhone's physical silent switch, and browser
autoplay rules generally, can block it. That's exactly why the on-screen banner is the
primary, reliable channel and sound is a bonus layer on top, not the only way to get the
result.

**Why sound needs a tap first, when it does work:** phones only allow a web page to play
sound or speech if it happens as a direct result of you tapping something, at least once
per visit. Tapping "Check for Hazards" or "Start Monitoring" satisfies this automatically
— after that, automatic Live Monitoring checks are allowed to play sound too, since the
browser considers audio "unlocked" for the rest of that visit.

**Under the hood, `alerts.js` works around a couple of known mobile speech bugs:** iOS
Safari occasionally drops the very first `speak()` call of a session silently (worked
around with a short retry), and Chrome cuts speech off after ~15 seconds on some versions
unless it's periodically "kept alive" (worked around with a background pause/resume
timer while speaking). Even with these, speech isn't 100% guaranteed on every device —
which is exactly why the on-screen banner above is the one channel that always works.

## Reference Photo

Upload a photo of the space when it's clear of hazards (the "🖼️ Reference Photo" section
near the top of the page). It's saved on the backend and automatically included in every
future check from then on — Claude compares the current photo against it and pays extra
attention to anything new or changed, which generally makes detection noticeably more
accurate than judging a single photo in isolation.

- Only one reference photo is stored at a time (for the one space you're monitoring) —
  uploading a new one replaces the old one.
- Tap "🗑 Remove Reference" to go back to single-photo analysis.
- The reference photo is stored as a plain file at `backend/reference_photo/reference.jpg`
  on your computer — worth mentioning in your write-up that it's local to your machine,
  not uploaded anywhere except to Claude as part of each analysis request.

## Live Monitoring

Instead of uploading one photo at a time, tap **"▶ Start Monitoring"** on the main page.
This asks for camera permission, shows a live preview, and then automatically takes a
photo and analyzes it on whatever interval you pick — no tapping needed after that. Each
automatic check updates the on-screen banner (and plays the sound alert, if available)
and adds an entry to the **History** list below the camera preview, showing a thumbnail,
timestamp, and a hazard-count/severity summary. Tap "View" on any entry to bring that
photo and its message back up (this doesn't replay the sound — it's just a quiet review
of an old check).

**"Check every" options:** 1/2/5/10/15/30 minutes, or **"Now (continuous)"** — which runs
another check immediately after each one finishes, back-to-back, instead of waiting on a
timer. This is genuinely useful for actively walking through a space checking in
real time, but it also means many more API calls in a short period — the cost note under
the dropdown calls this out, and it's worth mentioning in your write-up that you chose to
make this adjustable rather than defaulting everyone into continuous calls.

**The one real limitation, by design:** this only runs while the app is the active,
visible tab/screen. If you lock the phone, switch to another app, or the screen times
out, the browser kills camera access — this is an operating system rule for battery and
privacy protection, not something any web app can override. ClearPath detects this and
stops monitoring cleanly (releasing the camera and showing a clear message) rather than
silently failing.

This means Live Monitoring is best for things like: propping the phone up during a demo,
or checking a hallway for a while with the phone actively on and visible. For **true
unattended, always-on monitoring** (phone locked, in a drawer, running for days), a
dedicated always-on device like a Raspberry Pi is the right tool — that's a separate,
simpler Python script (no browser involved) that can be built alongside this app if you
want that version too.

## Dashboard — Viewing Results on a Different Device

Every analysis (from any device — phone, laptop, Live Monitoring, a manual check) is
saved on the backend in a small shared history. **`dashboard.html`** is a separate,
read-only page for viewing that history from somewhere else — the intended setup is a
phone running Live Monitoring in one room, and a laptop with the dashboard open showing
results as they arrive, like a family member checking in remotely.

**How to open it:** it's just another page on the same server — go to
`http://<same-address-you-used-for-the-main-app>/dashboard.html`. If you're using ngrok
for the phone, the same ngrok URL works for the dashboard too (`.../dashboard.html`).
There's also a "🖥️ Open Dashboard" link in the main app's footer.

What it shows:
- The **latest result** as a big photo + colored banner, exactly like the main app.
- A **history list** below it — same thumbnail/timestamp/severity format as Live
  Monitoring's history, just aggregated from every device instead of one phone's session.
- An optional **"🔊 Play sound for new results"** checkbox (off by default, since a
  laptop unexpectedly beeping might not always be welcome) — when on, a genuinely new
  result triggers the same tone + spoken announcement as the main app; results already on
  screen when you first open the dashboard don't trigger it (only truly new ones do).
- **"🗑 Clear History"** wipes the shared history for everyone viewing it (asks for
  confirmation first).

**How it works, technically:** the dashboard doesn't get pushed updates — it politely
asks the server "anything new?" every 4 seconds (`GET /api/history?since_id=<last one I
saw>`), and the server hands back only what's actually new since then. This is simple
polling, not a live push connection, so there's a few seconds of natural delay — completely
fine for this use case, and much simpler to build/debug than websockets for a school
project.

**Worth knowing:** the shared history lives in the server's memory only — it resets if
you restart `python backend/app.py`. That's a deliberate simplicity trade-off, worth
mentioning in your write-up if you want to note it as a natural "next step" (saving to a
file or database) rather than a limitation you missed.

## Language Support

ClearPath currently supports **English and Japanese**. Pick one from the 🌐 dropdown in
the header — it's saved in the browser so it's remembered next time you open the app.

Switching language changes:
- All the app's own text (buttons, labels, explanations) — instantly, no reload needed.
- **What Claude writes** — the hazard descriptions, fixes, and summary come back from
  Claude already written in the selected language (the prompt in `hazard_checklist.py`
  explicitly instructs this). The internal `category` identifier always stays in English
  behind the scenes — that's just how the backend matches hazard types to their labels,
  never shown to you.
- **What's printed on the annotated photo** — hazard names and short fixes are drawn
  directly onto the image using a font that can actually render the selected language.
  (Plain Arial/DejaVu fonts don't include Japanese characters at all — they'd just show
  blank boxes — so `image_annotator.py` switches to a Japanese-capable font, like Meiryo
  or MS Gothic on Windows, whenever Japanese is selected.)
- **The spoken announcement** — uses a matching-language voice if one is installed, and
  sets the correct language code either way so pronunciation is right.

Adding a third language means: adding its translations to `TRANSLATIONS` in
`frontend/i18n.js`, its category labels to `CATEGORY_LABELS` in
`backend/hazard_checklist.py`, and (if it's not Latin-script) a font that supports it in
`image_annotator.py`'s font candidate list.

## Voice Command

Voice command lives inside **Live Monitoring's "Check every" dropdown**, as its own mode
— it's not a separate on/off feature, it's one of the ways monitoring can decide when to
check.

Pick **"🎤 Voice command"** from the dropdown and tap "▶ Start Monitoring": the camera
turns on, but — unlike every other option — **nothing happens automatically.** No timer,
no immediate first check. It just listens. Say **"Is my path clear?"** (or
「道は安全ですか」 in Japanese) and *that's* what triggers a check. Say it again any time
afterward for another one. This is the literal behavior requested: a check happens only
when you say the phrase, never on its own.

**Important honesty note:** this uses the browser's built-in speech recognition, which
**iPhone's Safari does not support at all** — Apple has never implemented this API for
web pages, only for native iOS apps. Rather than show a dropdown option that silently
fails, `monitoring.js` checks for support at startup and only adds "🎤 Voice command" to
the list on browsers where it can actually work — in practice, **Android Chrome and
desktop Chrome/Edge**. On iPhone, the option just isn't there; the other Check every
options work exactly as normal. This is worth mentioning plainly in your write-up rather
than glossing over — it's a genuine platform limitation, not a bug in ClearPath.

Like the camera, microphone listening only works while the app is open and visible —
same phone/browser restriction as the rest of Live Monitoring, for the same reasons.
Stopping monitoring (or the app being backgrounded) stops the microphone too.

## Taking a New Photo vs. Choosing an Existing One

Both the manual "Check for Hazards" upload and the Reference Photo upload show **two
separate buttons**: "📷 Take Photo" and "🖼️ Choose from Gallery."

This exists to fix a real Android quirk: a single upload button (`<input type="file">`
with no special hints) sometimes only offers a gallery/file picker on Android, with no
way to actually take a fresh photo — depending on the Android/Chrome version and whether
the page is served over HTTPS. The fix is `capture="environment"` on the "Take Photo"
input specifically, which tells the browser to launch the phone's native camera app
directly for that button. This uses the OS's camera app (a separate mechanism from the
in-page live video used by Live Monitoring), so — usefully — **it works even without
HTTPS**, unlike Live Monitoring's camera preview or the microphone. "Choose from Gallery"
stays a plain file picker with no `capture` attribute, so it's unaffected and still lets
you pick any existing photo.

## Installing on a Phone

ClearPath is a Progressive Web App (PWA), which means a phone can "install" it from the
browser — it gets a home screen icon and opens full-screen like a real app, without
needing an app store.

**Important limitation to know about:** browsers only allow full installability over a
secure (HTTPS) connection — or on `localhost`, which is why it installs fine on the same
computer running the Flask server, but won't fully install if you just open your
computer's local network address (like `http://192.168.1.23:5000`) from your phone.
This is a browser security rule, not something ClearPath can turn off. **The same rule
applies to Live Monitoring's camera access** — phones block camera permission entirely
on plain `http://` addresses that aren't `localhost`, so you'll need one of the two
options below to actually test the camera feature on a real phone.

You have two practical ways around this for your demo:

### Option A — Quick demo trick: a free HTTPS tunnel (recommended)

Tools like [ngrok](https://ngrok.com) give your local Flask server a temporary public
HTTPS address, which makes it fully installable from any phone, anywhere (not just your
home WiFi) — handy for showing it to a judge.

1. Install ngrok (free account, one-time setup): https://ngrok.com/download
2. With `python backend/app.py` already running, open a **second** terminal and run:
   ```
   ngrok http 5000
   ```
3. ngrok prints a URL like `https://random-word-1234.ngrok-free.app` — open that on your
   phone's browser.
4. On Android/Chrome, you should see an "Install App" button appear in ClearPath's header
   automatically (or Chrome's own install prompt). On iPhone/Safari, tap the Share icon,
   then "Add to Home Screen" (Safari doesn't support the automatic install prompt — this
   is a normal iOS limitation, not a bug).
5. The ngrok URL changes every time you restart it on the free plan — re-share the new
   link if you restart the tunnel.

### Option B — Same-WiFi network (basic install, no HTTPS)

If your phone and computer are on the same WiFi, you can open the app directly at your
computer's local IP address (find it with `ipconfig` on Windows, look for "IPv4 Address")
— e.g. `http://192.168.1.23:5000`. This works for **using** the app on your phone's
browser, but because it's not HTTPS, some phones will only offer a basic "Add to Home
Screen" shortcut rather than the full app-like install experience. Still good enough for
casual testing.

## For the competition video / write-up

- `test_images/README.md` has notes on building a small test set (some photos with
  hazards you planted on purpose, some clean "control" rooms) so you can show real
  evaluation results, not just a live demo.
- The hazard categories and reasoning are based on publicly available fall-prevention
  guidance (e.g., CDC home fall-prevention checklists) — cite this in your write-up.
- Be upfront in your submission about the ethical framing: not diagnostic, privacy of
  uploaded photos, and why the language avoids judgmental terms like "hoarding" or
  "messy."
- It's worth mentioning in your pitch that ClearPath installs like a real app on a
  phone — a family member checking in on a relative could realistically keep it on
  their home screen, which strengthens the "this is actually usable" story.

## Troubleshooting

- **"Module not found" error** → make sure you ran `pip install -r requirements.txt`
  from inside the `ClearPath` folder.
- **"Invalid API key" error** → double check your `.env` file has no extra spaces and
  the key was copied in full.
- **Blank results / error in the browser** → check the terminal running `app.py` for
  the actual error message; it usually explains what went wrong.
