import os
import tempfile

# Isolate test state from the local stack before any keel_runner module opens keel.db.
os.environ["KEEL_DATA_DIR"] = tempfile.mkdtemp(prefix="keel-test-")
os.environ["KEEL_OFFLINE_JUDGE_DELAY"] = "0"
os.environ["KEEL_JUDGE"] = "offline"
