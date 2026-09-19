# -*- coding: utf-8 -*-
"""Check latest Pages workflow runs and deployment status."""
import subprocess, requests
REPO = "qwdwqfwq/topconf-paper-figure-gallery"
out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True)
TOKEN = next((l.split("=", 1)[1] for l in out.stdout.splitlines()
              if l.startswith("password=")), None)
S = requests.Session(); S.trust_env = False
H = {"Authorization": "Bearer " + TOKEN, "User-Agent": "gallery-setup"}
r = S.get(f"https://api.github.com/repos/{REPO}/actions/runs?per_page=5", headers=H, timeout=30)
for run in r.json().get("workflow_runs", []):
    print(run["name"], "|", run["head_sha"][:8], "|", run["status"], "|",
          run.get("conclusion"), "|", run["html_url"])
r2 = S.get(f"https://api.github.com/repos/{REPO}/pages", headers=H, timeout=30)
if r2.status_code == 200:
    print("pages status:", r2.json().get("status"), "url:", r2.json().get("html_url"))
