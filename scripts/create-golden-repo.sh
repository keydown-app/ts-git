#!/bin/bash
#
# Create Golden Repository Fixture for Core Interoperability Tests
#
# This script creates a comprehensive git repository with various test scenarios
# and packages it as a tar.gz fixture for use in CI tests.
#
# Usage: ./scripts/create-golden-repo.sh
# Output: packages/ts-git/src/tests/fixtures/golden-repo.tar.gz
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$PROJECT_ROOT/packages/ts-git/src/tests/fixtures"
TEMP_DIR=$(mktemp -d)
REPO_DIR="$TEMP_DIR/golden-repo"

echo "Creating golden repository fixture..."
echo "Temp directory: $TEMP_DIR"
echo "Output: $FIXTURES_DIR/golden-repo.tar.gz"

# Create and enter repository
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

# Initialize repo
git init
git config user.name "Test Author"
git config user.email "test@example.com"

# Function to create a commit with message
create_commit() {
    local msg="$1"
    shift
    git add -A
    git commit -m "$msg" "$@"
}

# Commit 1: Initial structure
echo "Initial file" > README.md
mkdir -p src/utils/helpers
echo "Main application" > src/main.js
echo "Utility functions" > src/utils/helpers.js
echo "Nested helper" > src/utils/helpers/nested.js
create_commit "Initial commit"

# Commit 2: Add binary file (small PNG placeholder)
printf '\x89PNG\r\n\x1a\n' > logo.png
dd if=/dev/zero bs=1024 count=2 >> logo.png 2>/dev/null
create_commit "Add logo"

# Commit 3: Add empty file
touch empty.txt
create_commit "Add empty file"

# Commit 4: Add unicode filename
echo "Unicode content" > "ファイル.txt"
create_commit "Add unicode filename"

# Commit 5: Add large file (100KB of text)
# This ensures packfile index uses fanout table
python3 -c "
import sys
for i in range(100):
    for j in range(100):
        sys.stdout.write(f'Line {i*100+j}: This is test content for the large file to ensure packfile index uses fanout table format.\\n')
" > large-file.txt
create_commit "Add large file (100KB)"

# Commit 6: Create feature-a branch
git checkout -b feature-a

echo "Feature A implementation" > feature-a.js
create_commit "Feature A: initial implementation"

# Commit 7: More feature A work
echo "Feature A refinements" >> feature-a.js
create_commit "Feature A: refinements"

# Commit 8: Merge feature-a back to master
git checkout master
git merge feature-a --no-ff -m "Merge feature-a into master"

# Commit 9: Create feature-b branch
git checkout -b feature-b

echo "Feature B implementation" > feature-b.js
create_commit "Feature B: initial work"

# Commit 10: More feature B
echo "Feature B additions" >> feature-b.js
create_commit "Feature B: additions"

# Go back to master for remaining commits
git checkout master

# Commit 11-16: Create delta chain
# Modify the same file multiple times to create delta references
for i in {1..6}; do
    echo "Delta chain modification $i" >> delta-target.txt
    create_commit "Delta chain commit $i"
done

# Commit 17: Delete a file
rm empty.txt
create_commit "Remove empty file"

# Commit 18: Rename a file
git mv README.md README-new.md
create_commit "Rename README"

# Commit 19: Modify existing file
echo "Updated content" >> src/main.js
create_commit "Update main.js"

# Commit 20: Final commit with multiple changes
echo "Final additions" > final.txt
echo "More updates" >> src/utils/helpers.js
create_commit "Final commit"

# Create packed refs (pack all refs including feature branches)
git pack-refs --all

# Aggressive garbage collection to create packfile with deltas
git gc --aggressive --prune=now

# Generate statistics
echo ""
echo "=== Repository Statistics ==="
echo "Total commits: $(git rev-list --all --count)"
echo "Total objects: $(git count-objects -v | grep 'count:' | awk '{print $2}')"
echo "Packfile size: $(ls -lh .git/objects/pack/*.pack 2>/dev/null | awk '{print $5}')"
echo "Branches:"
git branch -a

# Package the repository
cd "$TEMP_DIR"
tar -czf "$FIXTURES_DIR/golden-repo.tar.gz" golden-repo

# Clean up
cd "$PROJECT_ROOT"
rm -rf "$TEMP_DIR"

echo ""
echo "✓ Golden repository fixture created successfully!"
echo "Location: $FIXTURES_DIR/golden-repo.tar.gz"
echo ""
echo "To verify the fixture:"
echo "  tar -tzf $FIXTURES_DIR/golden-repo.tar.gz | head -20"
