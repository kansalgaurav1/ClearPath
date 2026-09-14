"""
config.py
---------
Loads settings from the .env file so the rest of the code never has to
hardcode secrets or the model name directly.

Nothing in this file talks to Claude or Flask directly — it's just settings.
"""

import os
from dotenv import load_dotenv

# Load variables from a ".env" file in the project root, if one exists.
load_dotenv()

# Your secret Anthropic API key. Required — the app will refuse to start
# without it (see the check in app.py).
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Which Claude model to use. Defaults to claude-sonnet-5 if not set in .env.
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5")

# Max size (in megabytes) of an uploaded photo. Keeps the app from choking
# on a huge phone photo.
MAX_UPLOAD_MB = 10
