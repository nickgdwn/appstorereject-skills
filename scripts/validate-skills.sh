#!/usr/bin/env bash
set -euo pipefail

# Validate all skills have valid SKILL.md with matching directory names
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$REPO_ROOT/skills"
errors=0

for skill_dir in "$SKILLS_DIR"/*/; do
  skill_name=$(basename "$skill_dir")
  skill_file="$skill_dir/SKILL.md"

  if [ ! -f "$skill_file" ]; then
    echo "ERROR: $skill_name/ missing SKILL.md"
    errors=$((errors + 1))
    continue
  fi

  # Extract frontmatter block (between first pair of --- lines)
  frontmatter=$(sed -n '/^---$/,/^---$/p' "$skill_file" | sed '1d;$d')

  # Extract name from frontmatter
  frontmatter_name=$(echo "$frontmatter" | grep '^name:' | head -1 | sed 's/name:[[:space:]]*//' | tr -d ' ')

  if [ -z "$frontmatter_name" ]; then
    echo "ERROR: $skill_name/SKILL.md missing 'name' in frontmatter"
    errors=$((errors + 1))
    continue
  fi

  if [ "$frontmatter_name" != "$skill_name" ]; then
    echo "ERROR: $skill_name/SKILL.md frontmatter name '$frontmatter_name' doesn't match directory name"
    errors=$((errors + 1))
  fi

  # Check description exists in frontmatter
  if ! echo "$frontmatter" | grep -q '^description:'; then
    echo "ERROR: $skill_name/SKILL.md missing 'description' in frontmatter"
    errors=$((errors + 1))
  fi

  echo "OK: $skill_name"
done

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "FAILED: $errors error(s) found"
  exit 1
fi

echo ""
echo "All skills valid."
