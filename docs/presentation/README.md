# Loop Engineering — presentation

A self-contained HTML presenter deck on loop engineering, built for an Azure HPC
department briefing. 25 slides, about 20 minutes.

**Live:** https://ridermw.github.io/copilot-factory-workflows/presentation/

| File | What it is |
|---|---|
| `index.html` | The deck. One file, no build step, no dependencies, no network calls. |
| `SCRIPT.md` | Read-through companion — every cue and the spoken script. Generated from the deck, so it cannot drift out of sync. |

## Presenting

| Key | Action |
|---|---|
| `←` `→` `Space` | Navigate. `Home` / `End` jump to the ends. |
| `S` | Presenter console in a second window — live preview, next-slide peek, cue, script, timer |
| `N` | Speaker notes panel |
| `F` | Full screen |
| `B` | Blank the screen |
| `T` | Toggle light / dark theme |
| `P` | Print |

Slides are deep-linkable: `#7` opens slide 7. The presenter console stays in sync with
the audience window over `file://` and over http(s).

## The argument

The deck opens on Bun's Rust rewrite — 535,496 lines of Zig across 1,448 files,
rewritten in 11 days by one engineer using about 50 dynamic workflows, now shipping
inside Claude Code. The question it spends twenty minutes on is not how you generate a
million lines of code. It is how anyone reviewed a million-line pull request and felt
safe merging it.

The answer, in the author's own words: a language-independent test suite, adversarial
code review, and fixing the process that generates the code instead of hand-fixing the
code. Everything after that is those three disciplines in more detail, plus an honest
accounting of what it costs you when you skip them.

## Verification

The deck argues that verification should be mechanical rather than assumed, so it was
verified the same way:

- **734 text/background contrast pairs measured** in both themes against composited
  backgrounds, including SVG diagram text. Zero failures at WCAG 2.1 AA.
- **Zero slide overflow** at 1440&times;810, 768&times;1024 and 390&times;844, in both themes.
- **25 print pages**, light palette forced.
- Every slide carries a real heading element; controls are keyboard-reachable.

Two measured fixes were applied. `--cp-text-muted` (#919191) lands at 3.53:1 on the
dark background and 4.31:1 on the soft surface, both under the 4.5:1 floor for
normal-size text; `p.lede`, `ul.bullets li` and `table.tbl th` now use
`--cp-text-soft` (#b0b0b0) at 5.05:1. The same token failed again inside the SVG
diagrams and was corrected there too.

Diagrams are **inline SVG** built from the same tone tokens as the rest of the deck:
surface fill, 1.5px tone border, tone tab. A tinted fill behind muted text is the
recurring contrast defect this design system already paid for, so it is avoided.
Marker ids are unique per diagram — several SVGs share one document, and duplicated
ids silently drop every arrowhead after the first.

## Call to action

The closing slides use only **vanilla GitHub Copilot CLI** — nothing installed beyond
the CLI, no skills, no plugins, no MCP servers past the built-in one. Every command is
taken from the official docs:

- [Running GitHub Copilot CLI programmatically](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically)
- [Automating tasks with Copilot CLI and GitHub Actions](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/automate-with-actions)
- [Scheduling prompts in GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/schedule-prompts)

## Credits

The deck format, design system, and presenter chrome are adapted from the
**Prepare the Room** deck in [ridermw/my-skills](https://github.com/ridermw/my-skills).

Sources are listed on the final slide. Every factual claim in the deck traces to one of
them; the one framing that is the author's own — that dynamic workflows are a superset
of loops — is labelled as such on slide 21.
