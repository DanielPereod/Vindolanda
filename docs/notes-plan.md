# Notes application plan

1. Add authenticated PostgreSQL resources for Markdown notes, saved bases and canvas documents; task links use foreign keys and atomic task saves.
2. Add an application switcher and a notes workspace with block editing, source mode, wiki navigation/backlinks, editable metadata, filtered/sorted bases and draggable connected canvas cards.
3. Verify validation and Markdown helpers with failing tests first, then run `make verify` and isolated browser workflows. Inspect changes against a pre-edit snapshot because this directory has no Git metadata.

The existing React/query/API composition supports this design without replacing task behavior. Notes use explicit saves and warn before discarding edits. Bases are saved views over note properties, not separate copies of notes. Canvas stores coordinates and connections; the editor stores Markdown as its source of truth.
