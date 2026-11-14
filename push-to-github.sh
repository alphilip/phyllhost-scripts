#!/bin/bash
# ============================================================================
# One-step helper to push this template repository to your GitHub account.
# Usage:
#   bash push-to-github.sh https://github.com/<your-username>/phyllhost-scripts.git
# ============================================================================
set -e

REPO_URL="${1:-}"
if [ -z "$REPO_URL" ]; then
  read -r -p "Enter your GitHub repository URL (e.g. https://github.com/username/phyllhost-scripts.git): " REPO_URL
fi

if [ -z "$REPO_URL" ]; then
  echo "Repository URL is required."
  exit 1
fi

# Extract owner/repo slug and update default GITHUB_REPO inside install.sh and README.md
SLUG=$(echo "$REPO_URL" | sed -E 's#.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#')
if [ -n "$SLUG" ] && [[ "$SLUG" == */* ]]; then
  sed -i "s|phyllhost/phyllhost-scripts|${SLUG}|g" install.sh README.md 2>/dev/null || true
  sed -i "s|<your-username>/phyllhost-scripts|${SLUG}|g" README.md 2>/dev/null || true
fi

git init
git branch -M main
git add .
git commit -m "Initial commit: PhyllHost terminal templates & interactive installer" || true
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
git push -u origin main

echo ""
echo "✅ Pushed to $REPO_URL!"
echo "Your terminal users can now run:"
echo "  bash <(curl -fsSL https://raw.githubusercontent.com/${SLUG}/main/install.sh)"
