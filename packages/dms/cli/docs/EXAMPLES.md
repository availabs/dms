# DMS CLI Examples

Common workflows and recipes for the DMS CLI. All examples assume a `.dmsrc` file is configured:

```json
{
  "host": "http://localhost:4444",
  "app": "avail-dms",
  "type": "pattern-admin"
}
```

## Inspect Site Structure

### See the full site hierarchy

```bash
dms site tree
```

Output:
```
Site: My DMS Site (id: 1)
  Pattern: Pages (page) base_url=/
    Page: Home (/) [published] id=10
      Section: Hero (lexical) id=20
      Section: Features (Card) id=21
    Page: About (/about) [published] id=11
    Page: Docs (/docs) [draft] id=12
      Page: Getting Started (/docs/getting-started) [published] id=13
        Section: Intro (Message) id=23
  Pattern: Datasets (datasets) base_url=/data
    Source: My Dataset (test-ds) id=30
  Pattern: Auth (auth) base_url=/auth
```

### List only published pages

```bash
dms page list --published
```

### View pattern configuration

```bash
dms pattern dump Pages
```

## Export and Backup

### Dump all pages to individual files

```bash
for slug in $(dms page list --compact | jq -r '.items[].url_slug'); do
  dms page dump "$slug" --sections --output "backup/${slug}.json"
done
```

### Export a single page with all sections

```bash
dms page dump home --sections --output home-backup.json
```

### Export all dataset rows

```bash
dms dataset dump 30 --limit 10000 --output dataset-export.json
```

### Dump a section's content

```bash
dms section dump 20 --output hero-section.json
```

## Create Content

### Create a new page

```bash
dms page create --title "Getting Started" --slug getting-started
```

### Create a page under a parent

```bash
# First get the parent's ID
dms page show docs
# { "id": 12, ... }

dms page create --title "API Reference" --slug api-reference --parent 12
```

### Create a section and attach to a page

```bash
dms section create home --element-type lexical --title "Welcome"
```

### Create a section with initial data

```bash
dms section create home --element-type Card --data '{"title": "Feature Card", "element-data": {"heading": "Fast"}}'
```

## Update Content

### Update a page title

```bash
dms page update home --title "Welcome Home"
```

### Update page data with a JSON file

```bash
# Edit the exported file
vim home-backup.json

# Push it back
dms page update home --data ./home-backup.json
```

### Update a section from stdin (pipe from another tool)

```bash
# Transform section data with jq, then push back
dms section dump 20 | jq '.data' | dms section update 20 --data -
```

### Bulk-update a field across pages

```bash
for id in $(dms page list --compact | jq -r '.items[].id'); do
  dms page update "$id" --set config.showSidebar=true
done
```

### Set nested fields with dot notation

```bash
dms page update home --set theme.layout.sidebar=true
dms raw update 42 --set data.config.columns=3
```

## Publish Workflow

### Full create-edit-publish cycle

```bash
# 1. Create a draft page
dms page create --title "New Feature" --slug new-feature

# 2. Add sections
dms section create new-feature --element-type lexical --title "Overview"
dms section create new-feature --element-type Card --title "Details"

# 3. Verify the page
dms page dump new-feature --sections

# 4. Publish
dms page publish new-feature
```

### Unpublish for editing

```bash
dms page unpublish new-feature
# ... make edits ...
dms page publish new-feature
```

## Delete Content

### Delete a section and clean up the page reference

```bash
dms section delete 20 --page home
```

Without `--page`, the section is deleted but the page still has a dangling reference. Use `--page` to remove it from the page's `draft_sections` array.

### Delete a page

```bash
dms page delete getting-started
```

## Datasets

### List all dataset sources

```bash
dms dataset list
```

### View source details and views

```bash
dms dataset show "My Dataset"
dms dataset views "My Dataset"
```

### Dump all rows from a dataset

```bash
dms dataset dump 30 --limit 500
```

### Filter dataset rows

```bash
# Single filter
dms dataset query 30 --filter status=active

# Multiple filters (AND)
dms dataset query 30 --filter status=active --filter category=docs

# With ordering
dms dataset query 30 --filter status=active --order name:asc

# With pagination
dms dataset query 30 --filter category=docs --limit 10 --offset 20
```

## Raw Access

### Get any item by ID

```bash
dms raw get 42
dms raw get 42 --attrs id,data,created_at
```

### List items by any type string

```bash
dms raw list "avail-dms+pattern-admin|pattern"
dms raw list "avail-dms+docs-page" --limit 100
```

### Create a raw item

```bash
dms raw create avail-dms docs-page --data '{"title": "Raw Page", "url_slug": "raw-page"}'
```

### Delete with explicit type

```bash
dms raw delete avail-dms docs-page 42
```

## Piping and Automation

### Pipe JSON output to jq

```bash
# Get all page titles
dms page list | jq '.items[].title'

# Get section element types for a page
dms section list home | jq '.[].["element-type"]'

# Count published pages
dms page list --published | jq '.items | length'
```

### Use in shell scripts

```bash
#!/bin/bash
# migrate-sections.sh — change all "Message" sections to "lexical"

PAGE_SLUG=$1
SECTIONS=$(dms section list "$PAGE_SLUG" --compact)

echo "$SECTIONS" | jq -r '.[] | select(.["element-type"] == "Message") | .id' | while read -r id; do
  echo "Updating section $id..."
  dms section update "$id" --set element-type=lexical
done
```

### Export for AI editing

```bash
# Dump a page for AI review
dms page dump home --sections > /tmp/page.json

# After AI edits the content:
dms section update 20 --data /tmp/updated-section.json
```

### Round-trip edit

```bash
# Export → edit → import
dms section dump 20 --output /tmp/section.json
# ... edit /tmp/section.json ...
dms section update 20 --data /tmp/section.json
```

## Multiple Patterns

When a site has multiple page patterns (e.g., "Docs" and "Blog"), specify which one:

```bash
# Use pattern name
dms page list --pattern Blog
dms page create --pattern Blog --title "New Post" --slug new-post

# Use pattern ID
dms page list --pattern 5
```

Without `--pattern`, the CLI uses the first `page`-type pattern found.

Same for datasets when multiple dataset patterns exist:

```bash
dms dataset list --pattern "Internal Data"
```

## Output Formats

### JSON (default)

```bash
dms page show home
# { "id": 10, "title": "Home", "url_slug": "home", ... }
```

### Summary

```bash
dms page list --format summary
```

### Tree

```bash
dms page list --format tree
dms site tree
```

### File output

```bash
dms page dump home --sections --output backup.json
```
