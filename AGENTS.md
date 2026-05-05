# AGENTS.md

## Repo at a glance
- This repo is a **static schema documentation generator** for Workflow ERP.
- Git repo root: `/home/timmypai/apps/wferp/schema`.
- Published artifacts live at root: `index.html`, `df_style.css`, `HTML/`.
- Source-of-truth generation pipeline lives in `_Source/`.

## High-value structure
- `_Source/1_mssql_to_json.py`: pulls module/table/field metadata from MSSQL (`DSCSYS`) and writes JSON.
- `_Source/2_FieldNameConvert2utf8.py`: fixes mojibake fields (iso-8859-1 -> Big5) and enriches Vietnamese names.
- `_Source/3_CreateIndexHtml.py`: builds navigation `index.html`.
- `_Source/4_CreateTableStructureHtml.py`: builds per-module pages in `HTML/`.
- `_Source/5_CreateTableStructureSQL.py`: optional SQL output into `SQL/`.

## Setup and regeneration commands
Run from `_Source/` because scripts use relative file paths.

```bash
python3 -m pip install pymssql pandas
python3 1_mssql_to_json.py
python3 2_FieldNameConvert2utf8.py
python3 3_CreateIndexHtml.py
python3 4_CreateTableStructureHtml.py
# optional
python3 5_CreateTableStructureSQL.py
```

Before step 1, update MSSQL credentials in `_Source/1_mssql_to_json.py`:
- `SERVER_IP`
- `USERNAME`
- `PASSWORD`
- `DATABASE` (default is `DSCSYS`)

## Verification (there is no CI)
- This repo has **no** GitHub Actions, pre-commit, lint, typecheck, or test config.
- Verify changes manually:
  1. Open `index.html` in a browser.
  2. Click several modules and confirm `iframe` pages in `HTML/` load.
  3. For generator changes, ensure regenerated JSON/HTML (and optional `SQL/`) are updated consistently.

## SQL generation verification policy (MANDATORY)
- For every prompt that generates SQL, you **must** execute the generated SQL in the test environment before considering the task done.
- Use the containerized test DB under `test_db/` as the default verification environment.
- You must validate both:
  1. SQL execution correctness (statement runs successfully), and
  2. result correctness (returned rows/aggregates/columns match prompt intent).
- If SQL or returned data is incorrect, you must self-correct (fix generation logic/prompt handling), regenerate SQL, and re-run verification until results are correct.

## Repo-specific gotchas
- Keep encoding UTF-8 when editing Chinese/Vietnamese text files.
- Several generators emit Windows-style path separators (`HTML\\...`) in links; keep output style consistent with existing files.
- `_Source/` contains both scripts and generated JSON; avoid deleting generated JSON unless you are intentionally regenerating.
